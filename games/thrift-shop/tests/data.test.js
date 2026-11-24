// The sheet import: the checked-in snapshots, the copy embedded in index.html, and the loud failures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const lib = require('../tools/sheet-lib.js');
const { SHEET } = require('./load.js');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const cardRows = () => lib.parseCsv(read('data/source/cards-2026.csv')), inviteRows = () => lib.parseCsv(read('data/source/invites-2026.csv'));
const scoring = () => JSON.parse(read('data/scoring.json'));

test('the source CSVs build: 150 cards (30 of each type) and 40 invites with a scoring rule each', () => {
  const s = lib.build(cardRows(), inviteRows(), scoring()); assert.equal(s.cards.length, 150); assert.equal(s.invites.length, 40);
  for (const t of lib.TYPES) assert.equal(s.cards.filter(c => c.type === t).length, 30, t);
  assert.ok(s.cards.filter(c => c.type === 'Accessory').every(c => c.ability));
});
test('the JSON snapshots and the copy embedded in index.html match the CSVs (run tools/sync-sheet.js after editing the sheet)', () => {
  const s = lib.build(cardRows(), inviteRows(), scoring());
  assert.deepEqual(JSON.parse(read('data/cards.json')), s.cards); assert.deepEqual(JSON.parse(read('data/invites.json')), s.invites);
  assert.deepEqual(SHEET, JSON.parse(JSON.stringify({ cards: s.cards, invites: s.invites, scoring: scoring() })));
});
test('card values: blank is 0, negatives are kept, the Total column agrees', () => {
  const rows = cardRows(), hdr = rows[0], s = lib.build(rows, inviteRows(), scoring());
  rows.slice(1).forEach((r, i) => { if (r[1] === 'Accessory') return; const sum = s.cards[i].v.reduce((a, b) => a + b, 0); assert.equal(sum, parseInt(r[7], 10), r[0]); });
  assert.deepEqual(s.cards.find(c => c.name === 'Bunny Ears').v, [0, 0, 4, 0, -2]); assert.equal(hdr[2], 'Important');
});
test('abilities parse into structured effects, including the animal, banana and bat wordings and a trailing parenthetical', () => {
  assert.deepEqual(lib.parseAbility('+2 Spooky per item with skulls'), { kind: 'perPrint', n: 2, imp: 'Spooky', prints: ['skulls'] });
  assert.deepEqual(lib.parseAbility('+1 Cute per animal pictured in your outfit').prints, ['animals', 'bats']);
  assert.deepEqual(lib.parseAbility('+1 Wacky per banana pictured in your outfit').prints, ['bananas']);
  assert.deepEqual(lib.parseAbility('+1 Spooky per bat pictured in your outfit').prints, ['bats']);
  assert.deepEqual(lib.parseAbility('+2 Wacky per empty clothing slot'), { kind: 'perEmptySlot', n: 2, imp: 'Wacky' });
  assert.deepEqual(lib.parseAbility('Add your Spooky to your Cute (creepy-cute counts)'), { kind: 'add', from: 'Spooky', to: 'Cute' });
  assert.equal(lib.parseAbility('Your highest Impression counts double').kind, 'doubleHighest'); assert.equal(lib.parseAbility('Add your Spooky to any one other Impression').kind, 'wand');
  assert.equal(lib.parseAbility('Doubles your luck'), null);
});
const fails = (cards, invites, sc, re) => assert.throws(() => lib.build(cards, invites, sc), e => re.test(e.message));
const withCard = (i, col, v) => { const r = cardRows(); r[i][col] = v; return r; };
test('the import fails loudly, naming the row: bad card type, non-integer Impression, unparseable ability, duplicate name', () => {
  fails(withCard(5, 1, 'Hat'), inviteRows(), scoring(), /Cards 2026 row 6.*type "Hat"/);
  fails(withCard(7, 3, '2.5'), inviteRows(), scoring(), /Cards 2026 row 8.*Cool "2.5"/);
  fails(withCard(140, 10, 'Gives you a nice day'), inviteRows(), scoring(), /Cards 2026 row 141.*matches no known pattern/);
  fails(withCard(3, 0, 'Tiara'), inviteRows(), scoring(), /duplicate card name "Tiara"/);
});
test('the import fails loudly: an invite with no scoring rule, and a scoring rule for an invite not in the sheet', () => {
  const sc = scoring(); delete sc['Prom']; fails(cardRows(), inviteRows(), sc, /invite "Prom" has no scoring rule/);
  const sc2 = scoring(); sc2['Midnight Ball'] = sc2['Prom']; fails(cardRows(), inviteRows(), sc2, /rule "Midnight Ball" names an invite that is not in the sheet/);
});
test('the import lists every problem at once, and an ability that looks for a print no card has is an error', () => {
  const r = cardRows(); r[1][1] = 'Hat'; r[2][4] = 'x'; assert.throws(() => lib.build(r, inviteRows(), scoring()), e => e.errors.length >= 2);
  const r2 = cardRows(); r2[149][10] = '+2 Spooky per item with unicorns'; fails(r2, inviteRows(), scoring(), /print "unicorns"/);
});
test('index.html makes no network calls (the game works offline)', () => { const html = read('index.html').replace(/<script id="sheet">[\s\S]*?<\/script>/, ''); assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|<script[^>]+src=/.test(html)); });
