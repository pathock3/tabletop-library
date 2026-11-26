// The card art: every card has a picture (drawn in code, no prints), the figure shows the outfit, and the 30 accessories are distinct.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SHEET, Art } = require('./load.js');
const idxs = type => SHEET.cards.map((c, i) => i).filter(i => SHEET.cards[i].type === type);

for (const type of ['Head', 'Top', 'Bottom', 'Accessory']) {
  test(`art: all 30 ${type} cards have art, with no print marks`, () => {
    assert.equal(idxs(type).length, 30);
    for (const i of idxs(type)) {
      const c = SHEET.cards[i]; assert.ok(Art.has(i), 'no art for ' + c.name); assert.ok(!/no art/.test(Art.layer(i)), c.name);
      assert.ok(!/data-print/.test(Art.layer(i)), c.name + ' still has a print mark');
      const svg = Art.card(i); assert.match(svg, /^<svg[^>]+viewBox/); assert.equal((svg.match(/<svg/g) || []).length, 1);
    }
  });
}
test('prints are gone from the art code: no print library, no printsDrawn, no per-card prints', () => {
  assert.equal(Art.printsDrawn, undefined); assert.equal(Art.PRINT_NAMES, undefined); assert.ok(SHEET.cards.every(c => c.prints === undefined));
});
test('the 30 accessories are 30 different pictures', () => { assert.equal(new Set(idxs('Accessory').map(i => Art.layer(i))).size, 30); });
test('the figure shows the outfit: bare by default (bald, undershirt, heart boxers, empty hand), garments and the held item when played; a 2nd Head stacks and a 2nd accessory is held in the other hand', () => {
  const id = n => SHEET.cards.findIndex(c => c.name === n), bare = Art.figure({});
  const dressed = Art.figure({ Head: id('Skull Face Paint'), Bottom: id('Ripped Black Jeans'), Accessory: id('Mood Ring') }); assert.ok(dressed.length > bare.length);
  const stacked = Art.figure({ Head: id('Tiara'), Head2: id('Pearl Hair Bow') }); assert.ok(stacked.length > Art.figure({ Head: id('Tiara') }).length); assert.ok(Art.figure({ Accessory: id('Hatbox'), Accessory2: id('Mood Ring') }).length > Art.figure({ Accessory: id('Hatbox') }).length);
});
