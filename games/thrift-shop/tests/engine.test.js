// Thrift Shop rules: setup, buying, selling, the outfit picker and scoring, the special cards, and whole bot games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B, Sim } = require('./load.js');

const total = s => Object.values(s.stacks).reduce((a, st) => a + st.length, 0) + s.houses.reduce((a, h) => a + h.hand.length, 0) + Object.values(s.drawn).reduce((a, d) => a + d.cards.length, 0);
const mk = (o = {}) => E.newGame(Object.assign({ humans: [], players: 3, seed: 4 }, o));

test('setup: coins, one card of each type per player, copies in the stacks, penalty cards in', () => {
  const s = mk(); assert.equal(s.houses.length, 3);
  for (const h of s.houses) { assert.equal(h.coins, D.rules.startCoins); assert.deepEqual(h.hand.map(c => E.def(c).type).sort(), ['accessory', 'bottom', 'shoes', 'top']); }
  assert.equal(total(s), D.cards.length * D.rules.copies + D.penaltyCards.length);
  const t = mk({ rules: { copies: 1, penaltyCards: false, startCoins: 9, startCards: 2 } }); assert.equal(total(t), D.cards.length); assert.equal(t.houses[0].coins, 9); assert.equal(t.houses[0].hand.length, 8);
});
test('the data matches the sheet: 61 cards (60 plus the Santa Hat), each with four season numbers and a resale value', () => {
  assert.equal(D.cards.length, 61); for (const r of D.cards.concat(D.penaltyCards)) { assert.equal(r.slice(1, 5).length, 4); assert.equal(typeof r[5], 'number'); assert.ok(['top', 'bottom', 'shoes', 'accessory'].includes(r[6])); }
  assert.equal(E.def('Down Coat').v[0], 5); assert.equal(E.def('Pitchfork').resale, 3); assert.equal(E.def('Stinky Gym Shirt').resale, -4);
});
test('buying: pay per card, draw that many, keep one, the others go to the bottom of that stack', () => {
  const s = mk(); const before = s.stacks.shoes.slice(), c0 = s.houses[0].coins, n0 = total(s);
  const r = E.apply(s, { type: 'draw', seat: 0, stack: 'shoes', n: 3 }); assert.ok(r.ok); assert.deepEqual(r.cards, before.slice(0, 3)); assert.equal(s.houses[0].coins, c0 - 3 * D.rules.pricePerCard);
  assert.equal(E.apply(s, { type: 'sell', seat: 0, card: s.houses[0].hand[0] }).ok, false); // mid-purchase
  const k = E.apply(s, { type: 'keep', seat: 0, i: 1 }); assert.equal(k.kept, before[1]); assert.equal(s.houses[0].hand.at(-1), before[1]);
  assert.deepEqual(s.stacks.shoes.slice(-2), [before[0], before[2]]); assert.equal(total(s), n0);
});
test('buying is refused beyond your coins, the most per purchase, or the stack', () => {
  const s = mk({ rules: { maxBuy: 3 } }); assert.equal(E.apply(s, { type: 'draw', seat: 0, stack: 'top', n: 4 }).ok, false); s.houses[0].coins = 2; assert.equal(E.apply(s, { type: 'draw', seat: 0, stack: 'top', n: 3 }).ok, false);
  assert.equal(E.apply(s, { type: 'draw', seat: 0, stack: 'top', n: 0 }).ok, false);
  const t = mk({ rules: { pricePerCard: 2 } }); t.houses[0].coins = 5; assert.equal(E.apply(t, { type: 'draw', seat: 0, stack: 'top', n: 3 }).ok, false); assert.equal(E.apply(t, { type: 'draw', seat: 0, stack: 'top', n: 2 }).ok, true); assert.equal(t.houses[0].coins, 1);
});
test('selling: the card goes to the bottom of its stack and you take its resale value; a gym card costs coins', () => {
  const s = mk(); const h = s.houses[0]; const card = h.hand.find(c => E.def(c).type === 'top'), n = s.stacks.top.length;
  const r = E.apply(s, { type: 'sell', seat: 0, card }); assert.equal(r.got, E.def(card).resale); assert.equal(s.stacks.top.at(-1), card); assert.equal(s.stacks.top.length, n + 1);
  h.hand.push('Stinky Gym Shirt'); h.coins = 3; assert.equal(E.apply(s, { type: 'sell', seat: 0, card: 'Stinky Gym Shirt' }).ok, false); h.coins = 4; assert.equal(E.apply(s, { type: 'sell', seat: 0, card: 'Stinky Gym Shirt' }).ok, true); assert.equal(h.coins, 0);
});
test('the best look takes one card of each type by its number for the season', () => {
  const hand = ['Down Coat', 'T-shirt', 'Ski Pants', 'Swim Trunks', 'Birkenstocks', 'Gold Shoes', 'Fake Rolex', 'Sunglasses'];
  const w = E.bestLook(hand, 0, D.rules), su = E.bestLook(hand, 2, D.rules);
  assert.deepEqual([w.top, w.bottom, w.shoes, w.accessory], ['Down Coat', 'Ski Pants', 'Gold Shoes', 'Fake Rolex']);
  assert.deepEqual([su.top, su.bottom, su.shoes, su.accessory], ['T-shirt', 'Swim Trunks', 'Gold Shoes', 'Sunglasses']);
  assert.equal(E.bestLook(['Booty Shorts'], 0, D.rules).bottom, null); // a negative card is not worn
  assert.equal(E.scoreLook(hand, w, 0).pts, 5 + 4 + 1 + 3);
});
test('gym cards in your hand cost points; wearing one spares you; Ripped Jeans are thrown away once worn', () => {
  const hand = ['Stinky Gym Shirt', 'Repulsive Gym Socks']; assert.equal(E.scoreLook(hand, { top: null, bottom: null, shoes: null, accessory: null }, 0).penalty, -(2 + 4));
  assert.equal(E.bestLook(hand, 0, D.rules).accessory, 'Repulsive Gym Socks'); // wearing spares the bigger penalty
  const s = mk(); s.houses[0].hand = ['Ripped Jeans']; s.houses.forEach((h, i) => { if (i) h.hand = []; });
  for (let i = 0; i < 3; i++) E.apply(s, { type: 'done', seat: i }); assert.equal(s.phase, 'reveal'); assert.equal(s.looks[0].picks.bottom, 'Ripped Jeans');
  const bottoms = s.stacks.bottom.length; for (let i = 0; i < 3; i++) E.apply(s, { type: 'next', seat: i });
  assert.equal(s.houses[0].hand.length, 0); assert.equal(s.stacks.bottom.length, bottoms + 1); assert.equal(s.scores[0][0], 2);
});
test('a season ends when everyone is done; you may change your look before the next season starts', () => {
  const s = mk(); s.houses[0].hand = ['Jeans', 'Khaki Pants']; assert.equal(E.apply(s, { type: 'done', seat: 0 }).ok, true); assert.equal(s.phase, 'shop'); assert.equal(E.apply(s, { type: 'sell', seat: 0, card: 'Jeans' }).ok, false);
  E.apply(s, { type: 'done', seat: 1 }); E.apply(s, { type: 'done', seat: 2 }); assert.equal(s.looks[0].picks.bottom, 'Jeans');
  assert.equal(E.apply(s, { type: 'setlook', seat: 0, picks: { top: null, bottom: 'Khaki Pants', shoes: null, accessory: null } }).ok, true); assert.equal(s.looks[0].pts, 0);
  assert.equal(E.apply(s, { type: 'setlook', seat: 0, picks: { top: 'Jeans', bottom: null, shoes: null, accessory: null } }).ok, false);
});
test('four seasons, then the most points wins; ties share; coins count only if the rules say so', () => {
  const s = mk({ rules: { seasonCount: 2, coinPoints: 1 } }); B.playOut(s); assert.equal(s.phase, 'over'); assert.equal(s.scores[0].length, 2);
  const tot = s.houses.map((h, i) => E.total(s, i)); assert.ok(s.winners.every(i => tot[i] === Math.max(...tot)));
  const t = mk({ rules: { coinPoints: 0 } }); B.playOut(t); assert.equal(t.scores[0].length, 4); assert.equal(E.total(t, 0), t.scores[0].reduce((a, b) => a + b, 0));
});
test('you see your own hand and everyone’s coins; others’ hands are hidden until the reveal', () => {
  const s = mk(); const v = E.viewFor(s, 0); assert.ok(Array.isArray(v.houses[0].hand)); assert.equal(v.houses[1].hand, null); assert.equal(typeof v.houses[1].coins, 'number'); assert.equal(typeof v.stacks.top, 'number'); assert.equal(v.rng, undefined);
});
test('whole bot games finish at 2 to 6 players on every level, with every card always accounted for', () => {
  for (const n of [2, 4, 6]) for (const level of ['easy', 'normal', 'hard']) { const s = mk({ players: n, level, seed: 9 + n }); const t0 = total(s); B.playOut(s); assert.equal(s.phase, 'over', n + level); assert.equal(total(s), t0); assert.ok(s.houses.every(h => h.coins >= 0)); }
});
test('harder shoppers score more, and Simulate shows the effect of a rule change', () => {
  const o = { games: 30, players: 4, seed: 2 }, e = Sim.runSync({}, Object.assign({ level: 'easy' }, o)), h = Sim.runSync({}, Object.assign({ level: 'hard' }, o));
  assert.ok(h.mean > e.mean); const lab = Sim.runSync({ seasonCount: 2 }, Object.assign({ level: 'normal' }, o)), base = Sim.runSync({}, Object.assign({ level: 'normal' }, o)); assert.ok(lab.mean < base.mean);
});
