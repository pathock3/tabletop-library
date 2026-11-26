// Thrift Shop sheet import: CSV text -> validated cards and invites. Used by tools/sync-sheet.js and by the tests.
// Everything fails loudly: errors are collected with the sheet row ("Cards 2026 row 14: ...") and thrown together.
const IMPRESSIONS = ['Fancy', 'Wacky', 'Cute', 'Spooky'];
const TYPES = ['Head', 'Top', 'Bottom', 'Accessory'];
const PER_TYPE = 30;                                   // the deck: 30 cards of each type
const PRINTS = ['pinstripes', 'crowns', 'leopard', 'pearls', 'polka dots', 'checkerboard', 'bananas', 'rainbows', 'hearts', 'flowers', 'bows', 'animals', 'skulls', 'bats', 'spiderwebs', 'moons'];
const CARD_HEADER = ['Card', 'Type', ...IMPRESSIONS, 'Prints in the art', 'Power', 'Ability'];   // found by name; 'Total' and anything after is ignored
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

// Accessory abilities: the patterns of the spec (section 5). Returns a structured effect or null if the text matches none.
function parseAbility(text) {
  const t = String(text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  let m;
  if ((m = t.match(new RegExp(`^\\+(\\d+) (${IMP}) per item with (.+)$`)))) return { kind: 'perPrint', n: +m[1], imp: m[2], prints: [m[3].trim()] };
  if ((m = t.match(new RegExp(`^\\+(\\d+) (${IMP}) per animal pictured in your outfit$`)))) return { kind: 'perPrint', n: +m[1], imp: m[2], prints: ['animals', 'bats'] };
  if ((m = t.match(new RegExp(`^\\+(\\d+) (${IMP}) per banana pictured in your outfit$`)))) return { kind: 'perPrint', n: +m[1], imp: m[2], prints: ['bananas'] };
  if ((m = t.match(new RegExp(`^\\+(\\d+) (${IMP}) per bat pictured in your outfit$`)))) return { kind: 'perPrint', n: +m[1], imp: m[2], prints: ['bats'] };
  if ((m = t.match(new RegExp(`^\\+(\\d+) (${IMP}) per empty clothing slot$`)))) return { kind: 'perEmptySlot', n: +m[1], imp: m[2] };
  if ((m = t.match(new RegExp(`^\\+(\\d+) (${IMP}) per print in your outfit$`)))) return { kind: 'perAnyPrint', n: +m[1], imp: m[2] };
  if ((m = t.match(new RegExp(`^Your (${IMP}) becomes 0$`)))) return { kind: 'becomesZero', imp: m[1] };
  if ((m = t.match(new RegExp(`^Add your (${IMP}) to your (${IMP})$`)))) return { kind: 'add', from: m[1], to: m[2] };
  if (/^Your highest Impression counts double$/.test(t)) return { kind: 'doubleHighest' };
  if (/^Add your Spooky to any one other Impression$/.test(t)) return { kind: 'wand' };
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
    const prints = String(cell(r, 'Prints in the art') || '').split(',').map(x => x.trim()).filter(Boolean);
    for (const p of prints) if (!PRINTS.includes(p)) errors.push(`${where} (${name}): print "${p}" is not in the print library (${PRINTS.join(', ')})`);
    if (new Set(prints).size !== prints.length) errors.push(`${where} (${name}): a print is listed twice`);
    const power = String(cell(r, 'Power') || '').trim(), abilityText = String(cell(r, 'Ability') || '').trim();
    let ability = null;
    if (type === 'Accessory') {
      if (v.some(x => x !== 0)) errors.push(`${where} (${name}): an accessory has no Impression values`);
      if (!abilityText) errors.push(`${where} (${name}): an accessory needs an ability`);
      else { ability = parseAbility(abilityText); if (!ability) errors.push(`${where} (${name}): ability "${abilityText}" matches no known pattern`); }
    } else {
      if (v.filter(x => x !== 0).length !== 2) errors.push(`${where} (${name}): a clothing card has exactly two nonzero Impressions, this one has ${v.filter(x => x !== 0).length}`);
      if (abilityText) errors.push(`${where} (${name}): only accessories have an ability`);
    }
    cards.push({ name, type, v, prints, power, abilityText, ability });
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
      if (!['rank', 'threshold', 'perPoints', 'rivalry', 'ifAtMost'].includes(b.kind)) errors.push(`scoring.json: "${k}" has an unknown block kind "${b.kind}"`);
      for (const x of metricImps(b.metric)) if (!IMPRESSIONS.includes(x)) errors.push(`scoring.json: "${k}" uses "${x}", which is not an Impression`);
    }
  }
  const prints = new Set(cards.flatMap(c => c.prints));
  for (const c of cards) if (c.ability && c.ability.prints) for (const p of c.ability.prints) if (!prints.has(p)) errors.push(`Cards 2026 (${c.name}): ability looks for the print "${p}", which no card has`);
}

// Every number in a rule must be printed in the invite's text, and every number in its payout line (not an ordinal like 2nd) must be in the rule.
function ruleNumbers(blocks) {
  const n = new Set();
  for (const b of blocks) {
    for (const k of ['last', 'leastTie3', 'award', 'atLeast', 'per', 'cap', 'atMost']) if (typeof b[k] === 'number') n.add(b[k]);
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

module.exports = { IMPRESSIONS, TYPES, PRINTS, PER_TYPE, parseCsv, parseAbility, parseCards, parseInvites, validateScoring, build, embedBlock, embedInto };
