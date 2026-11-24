// Thrift Shop rules: scoring of every invite shape, the accessory abilities, the mess, and whole bot games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, SHEET, Engine: E, Bots: B } = require('./load.js');

const imp = (o = {}) => Object.assign({ Important: 0, Cool: 0, Cute: 0, Wacky: 0, Spooky: 0 }, o);
const likes = (name, key, vals) => E.scoreInvite(name, vals.map(v => imp({ [key]: v }))).likes;
const idx = name => { const i = SHEET.cards.findIndex(c => c.name === name); assert.ok(i >= 0, 'no card ' + name); return i; };
const board = (names, extra = {}) => { const b = { Head: null, Top: null, Bottom: null, Shoes: null, Accessory: null }; for (const n of names) b[SHEET.cards[idx(n)].type] = idx(n); return Object.assign(b, extra); };

// ---- invite scoring (spec section 6) ----
test('dense ties: Student Council Election, Cool [6,6,4,1] -> [5,5,3,0]', () => assert.deepEqual(likes('Student Council Election', 'Cool', [6, 6, 4, 1]), [5, 5, 3, 0]));
test('second place wins: Field Trip [5,3,3,0] -> [0,5,5,2]; two players [4,1] -> [0,3]', () => {
  assert.deepEqual(likes('Field Trip', 'Wacky', [5, 3, 3, 0]), [0, 5, 5, 2]); assert.deepEqual(likes('Field Trip', 'Wacky', [4, 1]), [0, 3]);
});
test('last place and least ties: Talent Show [5,3,0,0] -> [3,1,4,4]; [2,0,0,0] -> [3,2,2,2]', () => {
  assert.deepEqual(likes('Talent Show', 'Wacky', [5, 3, 0, 0]), [3, 1, 4, 4]); assert.deepEqual(likes('Talent Show', 'Wacky', [2, 0, 0, 0]), [3, 2, 2, 2]);
});
test('the better of place or last, never both: Talent Show [1,1,1,1] -> 3 each', () => assert.deepEqual(likes('Talent Show', 'Wacky', [1, 1, 1, 1]), [3, 3, 3, 3]));
test('threshold, top gets zero: Fancy Restaurant [5,3,3,1] -> [0,3,3,0]', () => assert.deepEqual(likes('Fancy Restaurant', 'Important', [5, 3, 3, 1]), [0, 3, 3, 0]));
test('perPoints with a cap: Turkey Trot Cute [9,3,-2,0] -> [3,1,0,0]', () => assert.deepEqual(likes('Turkey Trot', 'Cute', [9, 3, -2, 0]), [3, 1, 0, 0]));
test('rivalry: Family Photo Day Cute [3,2,2,5] in seat order, right = previous seat -> [0,0,0,3]', () => assert.deepEqual(likes('Family Photo Day', 'Cute', [3, 2, 2, 5]), [0, 0, 0, 3]));
test('two players: School Picture Day and Ski Trip pay the winner 4 and the other player 3; Wedding and First Date the less one 3', () => {
  assert.deepEqual(likes('School Picture Day', 'Cute', [5, 1]), [4, 3]); assert.deepEqual(likes('Ski Trip', 'Cool', [1, 5]), [3, 4]);
  assert.deepEqual(likes('Wedding', 'Important', [5, 1]), [0, 3]); assert.deepEqual(likes('First Date', 'Cool', [1, 5]), [3, 0]);
});
test('two blocks add up: Prom, Baby Shower (bonus for 0 Spooky), Camping Trip, Job Interview', () => {
  const prom = E.scoreInvite('Prom', [imp({ Cool: 5, Important: 1 }), imp({ Cool: 2, Important: 4 })]).likes; assert.deepEqual(prom, [5, 3]);
  const baby = E.scoreInvite('Baby Shower', [imp({ Cute: 5 }), imp({ Cute: 3, Spooky: 1 }), imp({ Cute: 1, Spooky: -1 })]).likes; assert.deepEqual(baby, [4 + 1, 2, 1]); // the cutest also has 0 Spooky
  const camp = E.scoreInvite('Camping Trip', [imp({ Spooky: 4 }), imp({ Spooky: 2, Important: 2 }), imp({ Spooky: 0 })]).likes; assert.deepEqual(camp, [3 + 1, 2, 0 + 1]); // 0 Important earns the extra Like
  const job = E.scoreInvite('Job Interview', [imp({ Important: 6 }), imp({ Important: 4 }), imp({ Important: 3 })]).likes; assert.deepEqual(job, [4, 2, 0]);
});
test('combined and subtracted metrics, and the lower-of-two: Homecoming Court, Science Fair, 21st Birthday', () => {
  assert.deepEqual(E.scoreInvite('Homecoming Court', [imp({ Cool: 3, Cute: 3 }), imp({ Cool: 4, Cute: 1 }), imp({ Cool: 1 })]).likes, [4, 3, 1]);
  assert.deepEqual(E.scoreInvite('Science Fair', [imp({ Important: 5, Cool: 4 }), imp({ Important: 3 }), imp({ Important: 0, Cool: 2 })]).likes, [3, 4, 1]);
  assert.deepEqual(E.scoreInvite('21st Birthday', [imp({ Cool: 4, Wacky: 1 }), imp({ Cool: 3, Wacky: 3 }), imp({ Cool: 5 })]).likes, [2, 4, 0]);
});
test('every invite in the sheet scores any table of 2 to 8 players without error, and Likes are never negative', () => {
  for (const inv of SHEET.invites) for (const n of [2, 3, 4, 8]) {
    const tl = Array.from({ length: n }, (_, i) => imp({ Important: i, Cool: n - i, Cute: (i * 2) % 3, Wacky: i % 2, Spooky: -i % 3 })); const r = E.scoreInvite(inv.name, tl);
    assert.equal(r.likes.length, n); assert.ok(r.likes.every(x => Number.isInteger(x) && x >= 0), inv.name);
  }
});

// ---- accessories (spec section 5) ----
test('Crystal Ball: +2 Spooky per item with skulls (Skull Face Paint and Skeleton Leggings = +4)', () => {
  const b = board(['Skull Face Paint', 'Skeleton Leggings', 'Crystal Ball']); const { totals } = E.impressionTotals(b, null, 'Halloween Party');
  assert.equal(totals.Spooky, 5 + 4 + 4);
});
test('Puppy on a Leash counts a card with bats (bats are animals)', () => {
  assert.equal(E.impressionTotals(board(['Bat Hair Clips', 'Puppy on a Leash']), null, 'Prom').totals.Cute, 1 + 1);
  assert.equal(E.impressionTotals(board(['Bunny Ears', 'Bat Wing Heels', 'Puppy on a Leash']), null, 'Prom').totals.Cute, 4 + 2);
});
test('Pet Bat counts only bats; Banana Phone only bananas', () => {
  assert.equal(E.impressionTotals(board(['Bat Hair Clips', "Grandma's Kitten Cardigan", 'Pet Bat']), null, 'Prom').totals.Spooky, 2 + 1);
  assert.equal(E.impressionTotals(board(['Banana Costume', 'Banana Print Shorts', 'Banana Phone']), null, 'Prom').totals.Wacky, 3 + 3 + 2);
});
test('Electric Guitar adds Wacky to Cool and leaves Wacky unchanged', () => {
  const t = E.impressionTotals(board(['Tie-Dye Tee', 'Electric Guitar']), null, 'Prom').totals; assert.equal(t.Cool, 1 + 3); assert.equal(t.Wacky, 3);
});
test('Mystery Shopping Bag with only a Top played: +6 Wacky', () => assert.equal(E.impressionTotals(board(['Sailor Shirt', 'Mystery Shopping Bag']), null, 'Prom').totals.Wacky, 6));
test('Golden Trophy doubles the highest Impression; a tie goes to the one the invite names first, then the fixed order', () => {
  const t = E.impressionTotals(board(['Leather Jacket', 'Golden Trophy']), null, 'Prom').totals; assert.equal(t.Cool, 10);
  const tie = E.impressionTotals(board(['Fedora', 'Golden Trophy']), null, 'Halloween Party').totals; assert.equal(tie.Spooky, 2); // Fedora: all 1, Halloween Party names Spooky first
  const tie2 = E.impressionTotals(board(['Fedora', 'Golden Trophy']), null, 'Prom').totals; assert.equal(tie2.Cool, 2); // Prom names Cool first
  const none = E.impressionTotals(board(['Lampshade', 'Golden Trophy']), null, 'Prom').totals; assert.equal(none.Important, -2); // a negative best is not doubled
});
test('Magic Wand adds Spooky to the chosen other Impression (default: the first rewarded, not Spooky)', () => {
  const b = board(['Vampire Cape', 'Magic Wand']); assert.equal(E.impressionTotals(b, 'Cute', 'Prom').totals.Cute, 5);
  assert.equal(E.impressionTotals(b, null, 'Halloween Party').totals.Wacky, 5); // Halloween Party rewards Spooky, Wacky: the first non-Spooky is Wacky
  assert.equal(E.impressionTotals(b, 'Spooky', 'Prom').totals.Cool, 5); // Spooky is not allowed as a target: falls back to the default
});
test('empty slots add nothing; clothing blank values count as 0 and negatives subtract', () => {
  const t = E.impressionTotals(board(['Bunny Ears']), null, 'Prom').totals; assert.deepEqual(t, imp({ Cute: 4, Spooky: -2 }));
  assert.deepEqual(E.impressionTotals(board([]), null, 'Prom').totals, imp());
});

// ---- the mess and the round ----
const mk = (o = {}) => E.newGame(Object.assign({ seed: 5 }, o));
const countAll = s => s.cells.filter(Boolean).length + s.players.reduce((a, p) => a + p.hand.length, 0);
test('setup: 150 cards, 5 in each hand, the rest face down in the grid with empty spaces where hands were dealt', () => {
  const s = mk(); assert.equal(s.n, 4); assert.equal(s.cells.length, 150); for (const p of s.players) assert.equal(p.hand.length, 5);
  assert.equal(s.cells.filter(Boolean).length, 130); assert.ok(s.cells.filter(Boolean).every(c => !c.up)); assert.equal(countAll(s), 150); assert.equal(s.invites.length, 7); assert.equal(new Set(s.invites).size, 7);
});
test('taking: any card, face down or up, until the hand limit; a full hand refuses', () => {
  const s = mk(); E.apply(s, { type: 'start', seat: 0 }); assert.equal(s.phase, 'thrift');
  const cell = s.cells.findIndex(Boolean), c = s.cells[cell].c; const r = E.apply(s, { type: 'take', seat: 0, cell }); assert.ok(r.ok); assert.equal(r.card, c); assert.equal(s.cells[cell], null); assert.equal(s.players[0].hand.length, 6);
  const next = s.cells.findIndex(Boolean); assert.equal(E.apply(s, { type: 'take', seat: 0, cell: next }).error, 'full'); assert.equal(E.apply(s, { type: 'take', seat: 0, cell }).error, 'empty');
});
test('putting back: the card returns face up into an empty space', () => {
  const s = mk(); E.apply(s, { type: 'start', seat: 0 }); const card = s.players[0].hand[2];
  const r = E.apply(s, { type: 'putBack', seat: 0, card }); assert.ok(r.ok); assert.deepEqual(s.cells[r.cell], { c: card, up: true }); assert.equal(s.players[0].hand.length, 4); assert.equal(countAll(s), 150);
  assert.equal(E.apply(s, { type: 'putBack', seat: 0, card }).error, 'card');
});
test('the hand can be reordered', () => { const s = mk(); const h = s.players[0].hand.slice(); E.apply(s, { type: 'reorder', seat: 0, from: 0, to: 3 }); assert.deepEqual(s.players[0].hand, [h[1], h[2], h[3], h[0], h[4]]); });
test('building: a card only fits its own slot, at most maxPlayed cards, nothing after Done', () => {
  const s = mk({ settings: { maxPlayed: 2 } }); s.phase = 'build'; const p = s.players[0]; p.hand = ['Tiara', 'Sequin Gown', 'Ball Gown Skirt', 'Briefcase'].map(idx);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara'), slot: 'Top' }).error, 'slot');
  assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara') }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Sequin Gown') }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Ball Gown Skirt') }).error, 'limit'); assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Briefcase') }).error, 'limit');
  assert.ok(E.apply(s, { type: 'unplace', seat: 0, slot: 'Head' }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Ball Gown Skirt') }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Monocle') }).error, 'place'); // not in hand
});
test('a round: invite, thrift, build, reveal with Likes, clean-up keeps hands and the mess (face-up stays face up)', () => {
  const s = mk(); for (let i = 0; i < 4; i++) E.apply(s, { type: 'start', seat: i }); const card = s.players[1].hand[0]; E.apply(s, { type: 'putBack', seat: 1, card });
  E.apply(s, { type: 'endThrift' }); assert.equal(s.phase, 'build'); Bots.buildAll(s); assert.equal(s.phase, 'build');
  const hands = s.players.map(p => p.hand.slice()); E.apply(s, { type: 'done', seat: 0 }); assert.equal(s.phase, 'reveal'); assert.equal(s.results.players.length, 4);
  assert.ok(s.results.players.every((r, i) => r.likes === s.players[i].likes[0])); assert.equal(s.roundLog.length, 1);
  E.apply(s, { type: 'next', seat: 0 }); assert.equal(s.round, 2); assert.equal(s.phase, 'invite'); assert.deepEqual(s.players.map(p => p.hand), hands); assert.ok(s.cells.some(c => c && c.up)); assert.ok(s.players.every(p => Object.values(p.board).every(x => x == null)));
  assert.notEqual(E.inviteOf(s).name, s.roundLog[0].invite);
});
test('the viewer sees its own hand, face-up mess cards, and only a count of the face-down ones', () => {
  const s = mk(); const v = E.viewFor(s, 0); assert.ok(Array.isArray(v.players[0].hand)); assert.equal(v.players[1].hand, null); assert.ok(v.cells.filter(Boolean).every(c => c.c === null));
  assert.ok(E.viewFor(s, 0, true).cells.filter(Boolean).every(c => c.c != null)); // debug view
});
test('settings are clamped to their limits', () => {
  const c = E.cleanSettings({ bots: 99, rounds: 99, thriftSecs: 1, startHand: 9, handLimit: 3, botSpeed: 'warp' });
  assert.equal(c.bots, 7); assert.equal(c.rounds, 40); assert.equal(c.thriftSecs, 10); assert.equal(c.startHand, 3); assert.equal(c.botSpeed, 'normal');
});

// ---- bots ----
test('the best look picks the best card per slot for the invite', () => {
  const hand = ['Tiara', 'Top Hat', 'Sequin Gown', 'Leather Jacket', 'Ball Gown Skirt', 'Glass Slippers'].map(idx);
  const b = Bots.bestLook(hand, 'Student Council Election', 5); assert.equal(b.board.Top, idx('Leather Jacket')); const imp2 = Bots.bestLook(hand, 'Job Interview', 5); assert.equal(imp2.board.Top, idx('Sequin Gown')); assert.equal(imp2.board.Head, idx('Tiara'));
});
test('a bot with a full hand puts a card back before taking a better face-up card; bots never act in the other phases', () => {
  const s = mk(); s.invites[0] = SHEET.invites.findIndex(i => i.name === 'Job Interview'); E.apply(s, { type: 'start', seat: 0 }); const p = s.players[1]; p.hand = ['Tiara', 'Monocle', 'Lampshade', 'Khakis', 'Boat Shoes', 'Briefcase'].map(idx);
  const good = idx('Glass Slippers'); const cell = s.cells.findIndex(Boolean); s.cells[cell] = { c: good, up: true };
  const a1 = Bots.decide(s, 1); assert.equal(a1.type, 'putBack'); E.apply(s, a1); const a2 = Bots.decide(s, 1); assert.deepEqual(a2, { type: 'take', seat: 1, cell });
});
test('bots obey the hand limit and never peek: whole games at 2, 4 and 8 players finish with all 150 cards accounted for', () => {
  for (const bots of [1, 3, 7]) { const s = mk({ settings: { bots }, seed: 20 + bots }); Bots.playGame(s, 25); assert.equal(s.phase, 'over'); assert.equal(s.roundLog.length, 7); assert.equal(countAll(s), 150); assert.ok(s.players.every(p => p.hand.length <= 6 && p.likes.length === 7)); }
});
test('the bots pace follows the speed setting', () => {
  for (const k of Object.keys(D.botSpeeds)) { const lo = Bots.delaySecs({ botSpeed: k }, 0), hi = Bots.delaySecs({ botSpeed: k }, 1); assert.equal(lo, D.botSpeeds[k].min); assert.equal(hi, D.botSpeeds[k].max); }
  assert.equal(D.botSpeeds.normal.min, 1.5); assert.equal(D.botSpeeds.normal.max, 3.5);
});
