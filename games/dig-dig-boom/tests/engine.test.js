const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { DDB, Engine: E } = require('./load');

test('cards: Engine.cards() is the card list of the game, with the number only on Ongoing cards, Count at least 1, and the Can\'t Start flag', () => {
  const cards = E.cards();
  assert.equal(cards.length, DDB.cards.length);
  const bat = cards.find(c => c.id === 'ON-18');
  assert.deepEqual([bat.name, bat.type, bat.number, bat.deck, bat.count, bat.text], ['Energy Bat', 'Ongoing', 7, 'Booster', 1, '+1 {extraroll}. When dug, +2 {grit}']);
  assert.equal(cards.find(c => c.id === 'TR-01').number, null);
  assert.equal(cards.find(c => c.id === 'TR-01').count, 21);
  assert.equal(cards.find(c => c.id === 'IM-29').count, 2);
  assert.ok(cards.filter(c => c.type !== 'Ongoing' && c.type !== 'Consumable').every(c => c.number === null), 'only Ongoing and Single-Use cards carry a number');
  assert.deepEqual(cards.filter(c => c.type === 'Consumable' && c.number !== null).map(c => [c.id, c.number]), [['CO-03', 5], ['CO-15', 7], ['CO-27', 6], ['CO-30', 9]], 'a Single-Use card that needs a roll has it in the corner');
  assert.ok(cards.every(c => c.count >= 1), 'a card with a Count of 0 is not imported');
  assert.equal(cards.find(c => c.id === 'IM-09').cantStart, true); assert.equal(cards.find(c => c.id === 'IM-12').cantStart, false);
});

test('cards: every type is a known type with a colour, an icon and a pattern (type never relies on colour alone)', () => {
  const cards = E.cards();
  for (const c of cards) assert.ok(DDB.types[c.type], c.id + ' has an unknown type ' + c.type);
  const colours = Object.values(DDB.types).map(t => t.color), icons = Object.values(DDB.types).map(t => t.icon), pats = Object.values(DDB.types).map(t => t.pattern);
  for (const list of [colours, icons, pats]) assert.equal(new Set(list).size, list.length, 'all different');
  assert.deepEqual(Object.keys(DDB.types).sort(), ['Consumable', 'Immediate', 'Monster', 'Ongoing', 'Treasure']);
});

test('tokens: {heart} {grit} {extraroll} {damage} {gem} become icons; unknown codes stay as text', () => {
  const t = E.tokens('+1 {extraroll}. When dug, +2 {grit} {nope} {heart}', DDB.iconCodes);
  assert.deepEqual(t.filter(x => x.t === 'icon').map(x => x.v), ['extraroll', 'grit', 'heart']);
  const flat = t.map(x => x.t === 'icon' ? '<' + x.v + '>' : x.v).join('');
  assert.ok(flat.includes('{nope}'), 'unknown codes are left as they were written');
  assert.deepEqual(['damage', 'extraroll', 'gem', 'grit', 'heart'].filter(k => k in DDB.iconCodes), ['damage', 'extraroll', 'gem', 'grit', 'heart']);
});

test('fitting: the largest size that still fits, in quarter steps', () => {
  assert.equal(E.largestFitting(s => s <= 17.6, 10, 44), 17.5);
  assert.equal(E.largestFitting(s => true, 10, 44), 44);
  assert.equal(E.largestFitting(s => false, 10, 44), 10);
});

test('data: the card list is part of the game: no sheet address, no fetching, no saved copy', () => {
  assert.equal(DDB.sheet, undefined);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!/fetch\s*\(/.test(html) && !/XMLHttpRequest/.test(html), 'the game never asks the network for anything');
  assert.ok(!/docs\.google\.com/.test(html));
});

test('card geometry: poker size with a 0.125 in bleed and a 0.125 in safe zone', () => {
  assert.deepEqual(DDB.card, { trimW: 250, trimH: 350, bleed: 12.5, safe: 12.5, textMax: 32, textKeep: 27 });
});

test('stats: a Monster\'s damage ladder and Loot, and a Treasure\'s gem worth, are read from the card text', () => {
  assert.deepEqual(E.damageSteps('{damage} 1 → 3 → 5 → 7. Loot: 1 {gem}'), [1, 3, 5, 7]);
  assert.deepEqual(E.damageSteps('{damage} 2 → 4 → 6. Loot: 1 {gem}'), [2, 4, 6]);
  assert.deepEqual(E.damageSteps('{damage} 3 → 5'), [3, 5]);
  assert.equal(E.damageSteps('Put 1 damage on the Monster'), null);
  assert.equal(E.lootOf('{damage} 1 → 3. Loot: 1 {gem}'), 1); assert.equal(E.lootOf('{damage} 8'), 0);
  assert.equal(E.gemWorth('1 {gem}'), 1); assert.equal(E.gemWorth('2 {gem}'), 2); assert.equal(E.gemWorth('+1 {heart}'), null);
});
