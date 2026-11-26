// Thrift Shop sheet import: CSV text -> validated cards and invites. Used by tools/sync-sheet.js and by the tests.
// Everything fails loudly: errors are collected with the sheet row ("Cards 2026 row 14: ...") and thrown together.
const IMPRESSIONS = ['Fancy', 'Wacky', 'Cute', 'Spooky'];
const TYPES = ['Head', 'Top', 'Bottom', 'Accessory'];
const PER_TYPE = 30;                                   // the deck: 30 cards of each type
const CARD_HEADER = ['Card', 'Type', ...IMPRESSIONS, 'Power', 'Ability'];   // found by name; 'Total' and 'Notes' (empty) are ignored
const INVITE_HEADER = ['Invite', 'Category', 'Rewards', 'Penalizes', 'Payout shape', 'Payout (Likes)', 'Story', 'Notes'];
const IMP = IMPRESSIONS.join('|');

// A small CSV reader: quoted fields, doubled quotes, CRLF.
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

// Pinwheel's cell in the sheet reads #ERROR! (its text starts with "+", which Sheets takes for a formula). Until that cell is fixed
// (put an apostrophe before the +) the importer uses this wording; any other "#" cell is an error.
const ABILITY_OVERRIDES = { Pinwheel: '+1 to each trait whose total, after clothing, is above 0.' };

// Accessory abilities. Returns { kind, step, pick, ... } or null if the text matches none.
//   step: 1 clothing totals, 2 other bonuses/penalties, 3 Mixtape/Reversible Tote, 4 Invisible Dog Leash, 5 Golden Trophy; 0 = a rule (no totals)
//   pick: how many traits the owner chooses in the build phase (1, 2, or 'pair' = Fancy/Wacky or Cute/Spooky)
function parseAbility(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim().replace(/\.$/, ''), m, pick = 0;
  if ((m = t.match(/^Choose two traits: (.*)$/))) { pick = 2; t = m[1]; }
  else if ((m = t.match(/^Choose a trait\.? ?:? ?(.*)$/))) { pick = 1; t = m[1]; }
  const num = s => parseInt(s, 10);
  if (pick === 2 && (m = t.match(/^\+(\d+) to each$/))) return { kind: 'flatEach', step: 2, pick, n: num(m[1]) };
  if (pick === 1) {
    if ((m = t.match(/^([+-]\d+)$/))) return { kind: 'flat', step: 2, pick, n: num(m[1]) };
    if ((m = t.match(/^\+(\d+) for each clothing card you wear with a positive amount of it$/))) return { kind: 'perPositive', step: 2, pick, n: num(m[1]) };
    if ((m = t.match(/^\+(\d+), or \+(\d+) if your (Head|Top|Bottom) has a positive amount of it$/))) return { kind: 'orIf', step: 2, pick, base: num(m[1]), bonus: num(m[2]), slot: m[3] };
    if ((m = t.match(/^\+(\d+) if your (Head|Top|Bottom) and (Head|Top|Bottom) both have a positive amount of it$/))) return { kind: 'ifAll', step: 2, pick, n: num(m[1]), slots: [m[2], m[3]] };
    if ((m = t.match(/^\+(\d+) if all three clothing cards have a positive amount of it$/))) return { kind: 'ifAllThree', step: 2, pick, n: num(m[1]) };
    if ((m = t.match(/^\+(\d+) if none of your clothing has a negative amount of it$/))) return { kind: 'ifNoneNegative', step: 2, pick, n: num(m[1]) };
    if ((m = t.match(/^\+(\d+) for each empty clothing slot$/))) return { kind: 'perEmpty', step: 2, pick, n: num(m[1]) };
    if ((m = t.match(/^\+(\d+) for each negative number in your outfit$/))) return { kind: 'perNegative', step: 2, pick, n: num(m[1]) };
    if (/^the amount of it on your single best clothing card counts double$/.test(t)) return { kind: 'brooch', step: 1, pick };
    if (/^your negative amounts of it count as 0$/.test(t)) return { kind: 'ductTape', step: 1, pick };
    if (/^it becomes 0$/.test(t)) return { kind: 'zero', step: 4, pick };
    if ((m = t.match(/^At the reveal, flip random face-down cards from the mess until you hit clothing\. If it has a positive amount of your trait, \+(\d+)\. Return it face down$/))) return { kind: 'scratch', step: 2, pick, n: num(m[1]) };
  }
  if ((m = t.match(/^\+(\d+) to each trait whose total, after clothing, is above 0$/))) return { kind: 'pinwheel', step: 2, pick: 0, n: num(m[1]) };
  if (/^Swap a trait with its opposite \(Fancy and Wacky, or Cute and Spooky\)$/.test(t)) return { kind: 'swap', step: 3, pick: 'pair' };
  if (/^Add any one trait to any other trait$/.test(t)) return { kind: 'mixtape', step: 3, pick: 2 };
  if ((m = t.match(/^You may wear two (Head|Top|Bottom)(?: cards|s)\. Both count$/))) return { kind: 'extraSlot', step: 0, pick: 0, slot: m[1] };
  if (/^You may also wear one more accessory$/.test(t)) return { kind: 'extraSlot', step: 0, pick: 0, slot: 'Accessory' };
  if (/^After everyone reveals, you may swap one card you're wearing for one in your hand$/.test(t)) return { kind: 'key', step: 0, pick: 0 };
  if (/^You win all ties$/.test(t)) return { kind: 'penny', step: 0, pick: 0 };
  if (/^At the reveal, flip random face-down cards from the mess until you hit clothing\. Add its traits to your outfit \(even if that slot is filled\), then return it face down$/.test(t)) return { kind: 'grabBag', step: 1, pick: 0 };
  if (/^Your highest trait counts double$/.test(t)) return { kind: 'doubleHighest', step: 5, pick: 0 };
  return null;
}

const intOrBlank = s => { const t = String(s == null ? '' : s).trim(); if (t === '') return 0; return /^-?\d+$/.test(t) ? parseInt(t, 10) : NaN; };
// Columns are found by their header name, so a moved or added column cannot shift the data.
function headerIndex(rows, want, tab, errors) {
  const h = (rows[0] || []).map(x => String(x).trim()), idx = {};
  for (const w of want) { const i = h.indexOf(w); if (i < 0) errors.push(`${tab} header: no column named "${w}" (found: ${h.filter(Boolean).join(', ')})`); idx[w] = i; }
  return idx;
}

function parseCards(rows, errors) {
  const ix = headerIndex(rows, CARD_HEADER, 'Cards 2026', errors), cell = (r, k) => (ix[k] >= 0 ? r[ix[k]] : '');
  const cards = [], seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2, where = `Cards 2026 row ${row}`, name = String(cell(r, 'Card') || '').trim();
    if (!name) { errors.push(`${where}: no card name`); return; }
    if (seen.has(name)) errors.push(`${where}: duplicate card name "${name}"`); seen.add(name);
    const type = String(cell(r, 'Type') || '').trim();
    if (!TYPES.includes(type)) errors.push(`${where} (${name}): type "${type}" is not one of ${TYPES.join(', ')}`);
    const v = IMPRESSIONS.map(imp => { const n = intOrBlank(cell(r, imp)); if (Number.isNaN(n)) errors.push(`${where} (${name}): ${imp} "${cell(r, imp)}" is not an integer`); else if (n < -5 || n > 5) errors.push(`${where} (${name}): ${imp} ${n} is outside -5 to 5`); return Number.isNaN(n) ? 0 : n; });
    const power = String(cell(r, 'Power') || '').trim(); let abilityText = String(cell(r, 'Ability') || '').trim();
    if (/^#/.test(abilityText)) { if (ABILITY_OVERRIDES[name]) abilityText = ABILITY_OVERRIDES[name]; else errors.push(`${where} (${name}): the Ability cell holds a spreadsheet error (${abilityText}); in the sheet put an apostrophe before a leading + or -`); }
    let ability = null;
    if (type === 'Accessory') {
      if (v.some(x => x !== 0)) errors.push(`${where} (${name}): an accessory has no trait values`);
      if (!abilityText) errors.push(`${where} (${name}): an accessory needs an ability`);
      else { ability = parseAbility(abilityText); if (!ability) errors.push(`${where} (${name}): ability "${abilityText}" matches no known pattern`); }
    } else {
      if (v.filter(x => x !== 0).length !== 2) errors.push(`${where} (${name}): a clothing card has exactly two nonzero traits, this one has ${v.filter(x => x !== 0).length}`);
      if (abilityText) errors.push(`${where} (${name}): only accessories have an ability`);
    }
    cards.push({ name, type, v, power, abilityText, ability });
  });
  for (const t of TYPES) { const n = cards.filter(c => c.type === t).length; if (n !== PER_TYPE) errors.push(`Cards 2026: ${n} ${t} cards, expected ${PER_TYPE}`); }
  return cards;
}

function splitList(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function parseInvites(rows, errors) {
  const ix = headerIndex(rows, INVITE_HEADER, 'Invites 2026', errors), cell = (r, k) => (ix[k] >= 0 ? r[ix[k]] : '');
  const out = [], seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2, where = `Invites 2026 row ${row}`, name = String(cell(r, 'Invite') || '').trim();
    if (!name) { errors.push(`${where}: no invite name`); return; }
    if (seen.has(name)) errors.push(`${where}: duplicate invite "${name}"`); seen.add(name);
    const rewards = splitList(cell(r, 'Rewards')), penalizes = splitList(cell(r, 'Penalizes'));
    for (const x of rewards.concat(penalizes)) if (!IMPRESSIONS.includes(x)) errors.push(`${where} (${name}): "${x}" is not an Impression`);
    out.push({ name, category: String(cell(r, 'Category') || '').trim(), rewards, penalizes, shape: String(cell(r, 'Payout shape') || '').trim(), payout: String(cell(r, 'Payout (Likes)') || '').trim(), story: String(cell(r, 'Story') || '').trim(), notes: String(cell(r, 'Notes') || '').trim() });
  });
  return out;
}

// The metric of a scoring block: "Cool", {sum:[..]}, {diff:[..]}, {min:[..]}.
function metricImps(m) { return typeof m === 'string' ? [m] : Object.values(m)[0]; }
function validateScoring(invites, scoring, cards, errors) {
  const names = new Set(invites.map(i => i.name));
  for (const i of invites) if (!scoring[i.name]) errors.push(`Invites 2026: invite "${i.name}" has no scoring rule in scoring.json`);
  for (const k of Object.keys(scoring)) {
    if (!names.has(k)) errors.push(`scoring.json: rule "${k}" names an invite that is not in the sheet`);
    for (const b of scoring[k] || []) {
      if (!['rank', 'threshold', 'perPoints', 'rivalry'].includes(b.kind)) errors.push(`scoring.json: "${k}" has an unknown block kind "${b.kind}"`);
      for (const x of metricImps(b.metric)) if (!IMPRESSIONS.includes(x)) errors.push(`scoring.json: "${k}" uses "${x}", which is not an Impression`);
    }
  }
}

// Every number in a rule must be printed in the invite's text, and every number in its payout line (not an ordinal like 2nd) must be in the rule.
function ruleNumbers(blocks) {
  const n = new Set();
  for (const b of blocks) {
    for (const k of ['last', 'leastTie3', 'award', 'atLeast', 'per', 'cap']) if (typeof b[k] === 'number') n.add(b[k]);
    for (const src of [b, b.twoPlayer || {}]) { if (src.places) src.places.forEach(x => n.add(x)); if (typeof src.last === 'number') n.add(src.last); }
    if (b.kind === 'perPoints') n.add(1);
  }
  return n;
}
function crossCheck(invites, scoring, errors) {
  for (const inv of invites) {
    const blocks = scoring[inv.name]; if (!blocks) continue;
    const R = ruleNumbers(blocks), all = new Set((`${inv.payout} ${inv.notes}`.match(/\d+/g) || []).map(Number)), payout = new Set((inv.payout.replace(/\d+(st|nd|rd|th)\b/g, ' ').match(/\d+/g) || []).map(Number));
    for (const x of R) if (!all.has(x)) errors.push(`scoring.json: "${inv.name}" pays ${x}, which its sheet text does not mention ("${inv.payout}")`);
    for (const x of payout) if (x !== 0 && !R.has(x)) errors.push(`scoring.json: "${inv.name}" sheet text says ${x}, which its rule does not pay ("${inv.payout}")`);
  }
}

// Rows (arrays of cells) -> { cards, invites }, or throws one Error listing every problem.
function build(cardRows, inviteRows, scoring) {
  const errors = [];
  const cards = parseCards(cardRows, errors), invites = parseInvites(inviteRows, errors);
  validateScoring(invites, scoring, cards, errors); crossCheck(invites, scoring, errors);
  if (errors.length) { const e = new Error('Thrift Shop sheet import failed:\n - ' + errors.join('\n - ')); e.errors = errors; throw e; }
  return { cards, invites };
}

// The block that goes into index.html as <script id="sheet">.
function embedBlock(sheet, scoring) {
  return `<script id="sheet">\n// Generated by games/thrift-shop/tools/sync-sheet.js from the Thrift Shop cards sheet (tabs Cards 2026 and Invites 2026) and data/scoring.json. Do not edit by hand.\nconst SHEET = ${JSON.stringify({ cards: sheet.cards, invites: sheet.invites, scoring })};\n</script>`;
}
function embedInto(html, sheet, scoring) {
  if (!/<script id="sheet">[\s\S]*?<\/script>/.test(html)) throw new Error('index.html has no <script id="sheet"> block to fill');
  return html.replace(/<script id="sheet">[\s\S]*?<\/script>/, () => embedBlock(sheet, scoring));
}

module.exports = { IMPRESSIONS, TYPES, ABILITY_OVERRIDES, PER_TYPE, parseCsv, parseAbility, parseCards, parseInvites, validateScoring, build, embedBlock, embedInto };
