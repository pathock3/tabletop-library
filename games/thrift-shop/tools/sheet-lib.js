// Thrift Shop sheet import: CSV text -> validated cards and invites. Used by tools/sync-sheet.js and by the tests.
// Everything fails loudly: errors are collected with the sheet row ("Cards 2026 row 14: ...") and thrown together.
const IMPRESSIONS = ['Important', 'Cool', 'Cute', 'Wacky', 'Spooky'];
const TYPES = ['Head', 'Top', 'Bottom', 'Shoes', 'Accessory'];
const CARD_HEADER = ['Card', 'Type', ...IMPRESSIONS, 'Total', 'Prints in the art', 'Power', 'Ability'];
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
  if ((m = t.match(new RegExp(`^Add your (${IMP}) to your (${IMP})$`)))) return { kind: 'add', from: m[1], to: m[2] };
  if (/^Your highest Impression counts double$/.test(t)) return { kind: 'doubleHighest' };
  if (/^Add your Spooky to any one other Impression$/.test(t)) return { kind: 'wand' };
  return null;
}

const intOrBlank = s => { const t = String(s == null ? '' : s).trim(); if (t === '') return 0; return /^-?\d+$/.test(t) ? parseInt(t, 10) : NaN; };
function checkHeader(rows, want, tab, errors) {
  const h = (rows[0] || []).map(x => x.trim());
  want.forEach((w, i) => { if (h[i] !== w) errors.push(`${tab} header: column ${String.fromCharCode(65 + i)} should be "${w}" but is "${h[i] || ''}"`); });
}

function parseCards(rows, errors) {
  checkHeader(rows, CARD_HEADER, 'Cards 2026', errors);
  const cards = [], seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2, where = `Cards 2026 row ${row}`, name = (r[0] || '').trim();
    if (!name) { errors.push(`${where}: no card name`); return; }
    if (seen.has(name)) errors.push(`${where}: duplicate card name "${name}"`); seen.add(name);
    const type = (r[1] || '').trim();
    if (!TYPES.includes(type)) errors.push(`${where} (${name}): type "${type}" is not one of ${TYPES.join(', ')}`);
    const v = IMPRESSIONS.map((imp, k) => { const n = intOrBlank(r[2 + k]); if (Number.isNaN(n)) errors.push(`${where} (${name}): ${imp} "${r[2 + k]}" is not an integer`); return Number.isNaN(n) ? 0 : n; });
    const prints = (r[8] || '').split(',').map(x => x.trim()).filter(Boolean);
    const power = (r[9] || '').trim(), abilityText = (r[10] || '').trim();
    let ability = null;
    if (type === 'Accessory') {
      if (!abilityText) errors.push(`${where} (${name}): an accessory needs an ability`);
      else { ability = parseAbility(abilityText); if (!ability) errors.push(`${where} (${name}): ability "${abilityText}" matches no known pattern`); }
    } else if (abilityText) errors.push(`${where} (${name}): only accessories have an ability`);
    cards.push({ name, type, v, prints, power, abilityText, ability });
  });
  return cards;
}

function splitList(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
function parseInvites(rows, errors) {
  checkHeader(rows, INVITE_HEADER, 'Invites 2026', errors);
  const out = [], seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const row = i + 2, where = `Invites 2026 row ${row}`, name = (r[0] || '').trim();
    if (!name) { errors.push(`${where}: no invite name`); return; }
    if (seen.has(name)) errors.push(`${where}: duplicate invite "${name}"`); seen.add(name);
    const rewards = splitList(r[2]), penalizes = splitList(r[3]);
    for (const x of rewards.concat(penalizes)) if (!IMPRESSIONS.includes(x)) errors.push(`${where} (${name}): "${x}" is not an Impression`);
    out.push({ name, category: (r[1] || '').trim(), rewards, penalizes, shape: (r[4] || '').trim(), payout: (r[5] || '').trim(), story: (r[6] || '').trim(), notes: (r[7] || '').trim() });
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

// Rows (arrays of cells) -> { cards, invites }, or throws one Error listing every problem.
function build(cardRows, inviteRows, scoring) {
  const errors = [];
  const cards = parseCards(cardRows, errors), invites = parseInvites(inviteRows, errors);
  validateScoring(invites, scoring, cards, errors);
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

module.exports = { IMPRESSIONS, TYPES, parseCsv, parseAbility, parseCards, parseInvites, validateScoring, build, embedBlock, embedInto };
