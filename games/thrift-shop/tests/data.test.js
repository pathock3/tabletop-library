// The sheet import: the checked-in snapshots, the copy embedded in index.html, the parsed scoring rules, and the loud failures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const lib = require('../tools/sheet-lib.js');
const { SHEET, GAME_DATA: D } = require('./load.js');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const cardRows = () => lib.parseCsv(read('data/source/cards-2026.csv')), inviteRows = () => lib.parseCsv(read('data/source/invites-2026.csv'));
const scoring = () => JSON.parse(read('data/scoring.json'));

test('the source CSVs build: 120 cards (30 each of Head, Top, Bottom, Accessory), 37 invites, each with a scoring rule', () => {
  const s = lib.build(cardRows(), inviteRows(), scoring()); assert.equal(s.cards.length, 120); assert.equal(s.invites.length, 37);
  assert.deepEqual(lib.TYPES, ['Head', 'Top', 'Bottom', 'Accessory']); for (const t of lib.TYPES) assert.equal(s.cards.filter(c => c.type === t).length, 30, t);
  assert.ok(s.cards.filter(c => c.type === 'Accessory').every(c => c.ability && c.prints.length === 0 && c.v.every(x => x === 0)));
  assert.deepEqual(D.impressions.map(i => i.id), ['Fancy', 'Wacky', 'Cute', 'Spooky']); assert.deepEqual(lib.IMPRESSIONS, D.impressions.map(i => i.id));
});
test('every clothing card has exactly two nonzero Impressions, values -5 to 5; every print is in the library', () => {
  for (const c of SHEET.cards.filter(c => c.type !== 'Accessory')) { assert.equal(c.v.filter(x => x !== 0).length, 2, c.name); assert.ok(c.v.every(x => x >= -5 && x <= 5), c.name); for (const p of c.prints) assert.ok(lib.PRINTS.includes(p), c.name + ' ' + p); }
  assert.equal(lib.PRINTS.length, 16);
});
test('the JSON snapshots and the copy embedded in index.html match the CSVs (run tools/sync-sheet.js after editing the sheet)', () => {
  const s = lib.build(cardRows(), inviteRows(), scoring());
  assert.deepEqual(JSON.parse(read('data/cards.json')), s.cards); assert.deepEqual(JSON.parse(read('data/invites.json')), s.invites);
  assert.deepEqual(SHEET, JSON.parse(JSON.stringify({ cards: s.cards, invites: s.invites, scoring: scoring() })));
});
test('columns are found by header name: moving a column does not change the data', () => {
  const rows = cardRows(), swap = rows.map(r => { const c = r.slice(); [c[2], c[5]] = [c[5], c[2]]; return c; });
  assert.deepEqual(lib.build(swap, inviteRows(), scoring()).cards, lib.build(rows, inviteRows(), scoring()).cards);
  const bad = cardRows(); bad[0][2] = 'Fanciness'; assert.throws(() => lib.build(bad, inviteRows(), scoring()), /no column named "Fancy"/);
});
test('the four lowered invites match the sheet: Job Interview 6+, Kid\'s Birthday 6+, Fancy Restaurant 5+, Fall Fling and Turkey Trot per 3', () => {
  const sc = SHEET.scoring; assert.equal(sc['Job Interview'][0].atLeast, 6); assert.equal(sc["Kid's Birthday Party"][0].atLeast, 6); assert.equal(sc['Fancy Restaurant'][0].atLeast, 5); assert.equal(sc['Fall Fling'][0].per, 3); assert.equal(sc['Turkey Trot'][0].per, 3);
});
test('every number in an invite\'s payout text is paid by its rule, and every number its rule pays is in the text (the cross-check)', () => {
  const sc = scoring(); sc['Prom'][0].places = [5, 3]; assert.throws(() => lib.build(cardRows(), inviteRows(), sc), /"Prom" pays 3, which its sheet text does not mention/);
  const sc2 = scoring(); sc2['Prom'][0].places = [5]; assert.throws(() => lib.build(cardRows(), inviteRows(), sc2), /"Prom" sheet text says 2, which its rule does not pay/);
});
test('abilities parse into structured effects, including the new print-count and becomes-0 wordings', () => {
  assert.deepEqual(lib.parseAbility('+2 Spooky per item with skulls'), { kind: 'perPrint', n: 2, imp: 'Spooky', prints: ['skulls'] });
  assert.deepEqual(lib.parseAbility('+1 Cute per animal pictured in your outfit').prints, ['animals', 'bats']);
  assert.deepEqual(lib.parseAbility('+1 Wacky per banana pictured in your outfit').prints, ['bananas']); assert.deepEqual(lib.parseAbility('+1 Spooky per bat pictured in your outfit').prints, ['bats']);
  assert.deepEqual(lib.parseAbility('+2 Wacky per empty clothing slot'), { kind: 'perEmptySlot', n: 2, imp: 'Wacky' });
  assert.deepEqual(lib.parseAbility('+1 Wacky per print in your outfit'), { kind: 'perAnyPrint', n: 1, imp: 'Wacky' }); assert.deepEqual(lib.parseAbility('Your Spooky becomes 0'), { kind: 'becomesZero', imp: 'Spooky' });
  assert.deepEqual(lib.parseAbility('Add your Spooky to your Cute (creepy-cute counts)'), { kind: 'add', from: 'Spooky', to: 'Cute' });
  assert.equal(lib.parseAbility('Your highest Impression counts double').kind, 'doubleHighest'); assert.equal(lib.parseAbility('Add your Spooky to any one other Impression').kind, 'wand'); assert.equal(lib.parseAbility('Doubles your luck'), null);
});
const fails = (cards, invites, sc, re) => assert.throws(() => lib.build(cards, invites, sc), e => re.test(e.message));
const withCard = (i, col, v) => { const r = cardRows(); r[i][col] = v; return r; };
test('the import fails loudly, naming the row: Shoes (a retired type), bad value, three Impressions, unknown print, unparseable ability', () => {
  fails(withCard(5, 1, 'Shoes'), inviteRows(), scoring(), /Cards 2026 row 6.*type "Shoes"/);
  fails(withCard(7, 2, '2.5'), inviteRows(), scoring(), /Cards 2026 row 8.*Fancy "2.5"/); fails(withCard(7, 2, '7'), inviteRows(), scoring(), /outside -5 to 5/);
  fails(withCard(3, 4, '1'), inviteRows(), scoring(), /Cards 2026 row 4.*exactly two nonzero Impressions, this one has 3/);
  fails(withCard(3, 7, 'unicorns'), inviteRows(), scoring(), /print "unicorns" is not in the print library/);
  fails(withCard(110, 9, 'Gives you a nice day'), inviteRows(), scoring(), /Cards 2026 row 111.*matches no known pattern/); fails(withCard(3, 0, 'Tiara'), inviteRows(), scoring(), /duplicate card name "Tiara"/);
});
test('the import fails loudly: an invite with no scoring rule, a rule for an invite not in the sheet, a wrong card count per type', () => {
  const sc = scoring(); delete sc['Prom']; fails(cardRows(), inviteRows(), sc, /invite "Prom" has no scoring rule/);
  const sc2 = scoring(); sc2['Midnight Ball'] = sc2['Prom']; fails(cardRows(), inviteRows(), sc2, /rule "Midnight Ball" names an invite that is not in the sheet/);
  fails(cardRows().slice(0, 100), inviteRows(), scoring(), /Cards 2026: \d+ \w+ cards, expected 30/);
});
test('the import lists every problem at once, and an ability that looks for a print no card has is an error', () => {
  const r = cardRows(); r[1][1] = 'Hat'; r[2][4] = 'x'; assert.throws(() => lib.build(r, inviteRows(), scoring()), e => e.errors.length >= 2);
});
test('index.html makes no network calls (the game works offline)', () => { const html = read('index.html').replace(/<script id="sheet">[\s\S]*?<\/script>/, ''); assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|<script[^>]+src=/.test(html)); });
