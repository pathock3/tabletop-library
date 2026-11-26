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
  assert.ok(s.cards.filter(c => c.type === 'Accessory').every(c => c.ability && c.v.every(x => x === 0) && c.prints === undefined));
  assert.ok(s.cards.every(c => c.prints === undefined)); assert.deepEqual([...new Set(s.cards.filter(c => c.type === 'Accessory').map(c => c.power))].sort(), ['Basic', 'Rare', 'Rule-bender', 'Shaper']);
  assert.deepEqual(D.impressions.map(i => i.id), ['Fancy', 'Wacky', 'Cute', 'Spooky']); assert.deepEqual(lib.IMPRESSIONS, D.impressions.map(i => i.id));
});
test('every clothing card has exactly two nonzero traits, values -5 to 5; prints are gone from the data', () => {
  for (const c of SHEET.cards.filter(c => c.type !== 'Accessory')) { assert.equal(c.v.filter(x => x !== 0).length, 2, c.name); assert.ok(c.v.every(x => x >= -5 && x <= 5), c.name); assert.equal(c.prints, undefined); }
  assert.equal(lib.PRINTS, undefined);
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
test('all 30 accessory abilities parse: kind, step in the order of operations, and how many traits the owner picks', () => {
  const acc = SHEET.cards.filter(c => c.type === 'Accessory'); assert.equal(acc.length, 30);
  const kind = n => acc.find(c => c.name === n).ability;
  assert.deepEqual(kind('Mood Ring'), { kind: 'flat', step: 2, pick: 1, n: 2 }); assert.deepEqual(kind('Lost and Found Box'), { kind: 'flat', step: 2, pick: 1, n: -3 }); assert.deepEqual(kind('Tiny Umbrella'), { kind: 'flatEach', step: 2, pick: 2, n: 1 });
  assert.deepEqual(kind('Pocket Square'), { kind: 'orIf', step: 2, pick: 1, base: 1, bonus: 3, slot: 'Top' }); assert.equal(kind('Anklet').slot, 'Bottom'); assert.deepEqual(kind('Matching Belt').slots, ['Top', 'Bottom']);
  assert.deepEqual(kind('Statement Earrings'), { kind: 'ifAllThree', step: 2, pick: 1, n: 4 }); assert.equal(kind('Minimalist Tote').kind, 'perEmpty'); assert.equal(kind('Mismatched Socks').kind, 'perNegative');
  assert.deepEqual([kind('Duct Tape').step, kind('Rhinestone Brooch').step, kind('Mystery Grab Bag').step, kind('Reversible Tote').step, kind('Mixtape').step, kind('Invisible Dog Leash').step, kind('Golden Trophy').step], [1, 1, 1, 3, 3, 4, 5]);
  assert.equal(kind('Reversible Tote').pick, 'pair'); assert.equal(kind('Mixtape').pick, 2); assert.equal(kind('Scratch-Off Ticket').pick, 1);
  assert.deepEqual(['Hatbox', 'Safety Pins', 'Spare Pants Backpack', 'Second Handbag'].map(n => kind(n).slot), ['Head', 'Top', 'Bottom', 'Accessory']);
  assert.deepEqual(['Changing Room Key', 'Lucky Penny'].map(n => kind(n).kind), ['key', 'penny']); assert.equal(lib.parseAbility('Doubles your luck'), null); assert.equal(lib.parseAbility('Choose a trait: it explodes.'), null);
});
test('Pinwheel\'s sheet cell reads #ERROR! (its text starts with "+"): the importer uses the agreed wording, and any other error cell fails', () => {
  assert.equal(cardRows().find(r => r[0] === 'Pinwheel')[9], '#ERROR!'); const pin = SHEET.cards.find(c => c.name === 'Pinwheel'); assert.deepEqual(pin.ability, { kind: 'pinwheel', step: 2, pick: 0, n: 1 }); assert.match(pin.abilityText, /above 0/);
  const r = cardRows(); r.find(x => x[0] === 'Mood Ring')[9] = '#ERROR!'; assert.throws(() => lib.build(r, inviteRows(), scoring()), e => /Mood Ring\): the Ability cell holds a spreadsheet error/.test(e.message));
});
const fails = (cards, invites, sc, re) => assert.throws(() => lib.build(cards, invites, sc), e => re.test(e.message));
const withCard = (i, col, v) => { const r = cardRows(); r[i][col] = v; return r; };
test('the import fails loudly, naming the row: Shoes (a retired type), bad value, three traits, a spreadsheet error, unparseable ability', () => {
  fails(withCard(5, 1, 'Shoes'), inviteRows(), scoring(), /Cards 2026 row 6.*type "Shoes"/);
  fails(withCard(7, 2, '2.5'), inviteRows(), scoring(), /Cards 2026 row 8.*Fancy "2.5"/); fails(withCard(7, 2, '7'), inviteRows(), scoring(), /outside -5 to 5/);
  fails(withCard(3, 4, '1'), inviteRows(), scoring(), /Cards 2026 row 4.*exactly two nonzero traits, this one has 3/);
  fails(withCard(96, 9, '#ERROR!'), inviteRows(), scoring(), /Cards 2026 row 97.*spreadsheet error/);
  fails(withCard(110, 9, 'Gives you a nice day'), inviteRows(), scoring(), /Cards 2026 row 111.*matches no known pattern/); fails(withCard(3, 0, 'Tiara'), inviteRows(), scoring(), /duplicate card name "Tiara"/);
});
test('the import fails loudly: an invite with no scoring rule, a rule for an invite not in the sheet, a wrong card count per type', () => {
  const sc = scoring(); delete sc['Prom']; fails(cardRows(), inviteRows(), sc, /invite "Prom" has no scoring rule/);
  const sc2 = scoring(); sc2['Midnight Ball'] = sc2['Prom']; fails(cardRows(), inviteRows(), sc2, /rule "Midnight Ball" names an invite that is not in the sheet/);
  fails(cardRows().slice(0, 100), inviteRows(), scoring(), /Cards 2026: \d+ \w+ cards, expected 30/);
});
test('the import lists every problem at once', () => {
  const r = cardRows(); r[1][1] = 'Hat'; r[2][4] = 'x'; assert.throws(() => lib.build(r, inviteRows(), scoring()), e => e.errors.length >= 2);
});
test('index.html makes no network calls (the game works offline)', () => { const html = read('index.html').replace(/<script id="sheet">[\s\S]*?<\/script>/, ''); assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|<script[^>]+src=/.test(html)); });
