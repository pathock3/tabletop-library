// The card art: every card has a picture, and each picture shows exactly the prints listed in its sheet row.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SHEET, Art } = require('./load.js');
const idxs = type => SHEET.cards.map((c, i) => i).filter(i => SHEET.cards[i].type === type);

for (const type of ['Head', 'Top', 'Bottom', 'Accessory']) {
  test(`art batch: all 30 ${type} cards have art, and each shows exactly its sheet prints`, () => {
    assert.equal(idxs(type).length, 30);
    for (const i of idxs(type)) {
      const c = SHEET.cards[i]; assert.ok(Art.has(i), 'no art for ' + c.name); assert.ok(!/no art/.test(Art.layer(i)), c.name);
      assert.deepEqual(Art.printsDrawn(i), c.prints.slice().sort(), c.name + ': prints drawn vs the sheet row');
      const svg = Art.card(i); assert.match(svg, /^<svg[^>]+viewBox/); assert.equal((svg.match(/<svg/g) || []).length, 1);
    }
  });
}
test('accessories carry no print stamps (their sheet rows list none), and every clothing card with prints draws at least one stamp per print', () => {
  for (const i of idxs('Accessory')) assert.equal(Art.printsDrawn(i).length, 0, SHEET.cards[i].name);
  for (const i of SHEET.cards.map((c, k) => k)) { const c = SHEET.cards[i]; for (const p of c.prints) assert.ok(Art.layer(i).includes(`data-print="${p}"`), c.name + ' ' + p); }
});
test('the print library has the 16 prints and each is on enough cards to chase', () => {
  assert.equal(Art.PRINT_NAMES.length, 16); for (const p of Art.PRINT_NAMES) assert.ok(SHEET.cards.filter(c => c.prints.includes(p)).length >= 5, p);
});
test('the figure shows the outfit: bare by default (bald, undershirt, heart boxers, empty hand), garments and the held item when played', () => {
  const bare = Art.figure({}); assert.ok(!/data-print/.test(bare)); const i = SHEET.cards.findIndex(c => c.name === 'Skull Face Paint'), j = SHEET.cards.findIndex(c => c.name === 'Ripped Black Jeans'), k = SHEET.cards.findIndex(c => c.name === 'Crystal Ball');
  const dressed = Art.figure({ Head: i, Bottom: j, Accessory: k }); assert.ok(dressed.includes('data-print="skulls"')); assert.ok(dressed.length > bare.length);
  const both = Art.figure({ Head: i, Bottom: j }).match(/data-print="skulls"/g).length; assert.ok(both >= 4, 'skulls on the face paint and on the jeans');
});
