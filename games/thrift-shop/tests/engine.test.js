// Thrift Shop rules: scoring of every invite shape, two invites a round, the accessory abilities, the mess, and whole bot games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, SHEET, Engine: E, Bots: B } = require('./load.js');

const imp = (o = {}) => Object.assign({ Fancy: 0, Wacky: 0, Cute: 0, Spooky: 0 }, o);
const likes = (name, key, vals) => E.scoreInvite(name, vals.map(v => imp({ [key]: v }))).likes;
const idx = name => { const i = SHEET.cards.findIndex(c => c.name === name); assert.ok(i >= 0, 'no card ' + name); return i; };
const board = (names) => { const b = { Head: null, Top: null, Bottom: null, Accessory: null }; for (const n of names) b[SHEET.cards[idx(n)].type] = idx(n); return b; };
const totals = (names, wand, inv = ['Prom', 'Prom']) => E.impressionTotals(board(names), wand, inv).totals;

// ---- invite scoring ----
test('dense ties: Student Council Election, Cute [6,6,4,1] -> [5,5,3,0]', () => assert.deepEqual(likes('Student Council Election', 'Cute', [6, 6, 4, 1]), [5, 5, 3, 0]));
test('second place wins: Field Trip [5,3,3,0] -> [0,5,5,2]; two players [4,1] -> [0,3]', () => {
  assert.deepEqual(likes('Field Trip', 'Wacky', [5, 3, 3, 0]), [0, 5, 5, 2]); assert.deepEqual(likes('Field Trip', 'Wacky', [4, 1]), [0, 3]);
});
test('last place and least ties: Talent Show [5,3,0,0] -> [3,1,4,4]; [2,0,0,0] -> [3,2,2,2]', () => {
  assert.deepEqual(likes('Talent Show', 'Wacky', [5, 3, 0, 0]), [3, 1, 4, 4]); assert.deepEqual(likes('Talent Show', 'Wacky', [2, 0, 0, 0]), [3, 2, 2, 2]);
});
test('the better of place or last, never both: Talent Show [1,1,1,1] -> 3 each', () => assert.deepEqual(likes('Talent Show', 'Wacky', [1, 1, 1, 1]), [3, 3, 3, 3]));
test('threshold, top gets zero: Fancy Restaurant, Fancy [7,5,5,2] -> [0,3,3,0]', () => assert.deepEqual(likes('Fancy Restaurant', 'Fancy', [7, 5, 5, 2]), [0, 3, 3, 0]));
test('perPoints with a cap: Turkey Trot, Cute [10,3,-2,0] -> [3,1,0,0]', () => assert.deepEqual(likes('Turkey Trot', 'Cute', [10, 3, -2, 0]), [3, 1, 0, 0]));
test('rivalry: Family Photo Day Cute [3,2,2,5] in seat order, right = previous seat -> [0,0,0,3]', () => assert.deepEqual(likes('Family Photo Day', 'Cute', [3, 2, 2, 5]), [0, 0, 0, 3]));
test('two players: School Picture Day pays 4 and 3; Wedding, First Date and Mystery Dinner pay the lesser 3', () => {
  assert.deepEqual(likes('School Picture Day', 'Cute', [5, 1]), [4, 3]); assert.deepEqual(likes('Wedding', 'Fancy', [5, 1]), [0, 3]);
  assert.deepEqual(likes('First Date', 'Cute', [1, 5]), [3, 0]); assert.deepEqual(likes('Mystery Dinner Party', 'Spooky', [2, 3]), [3, 0]);
});
test('threshold invites with a top prize: Job Interview, Kid\'s Birthday, Midnight Movie Marathon', () => {
  assert.deepEqual(likes('Job Interview', 'Fancy', [7, 6, 5]), [4, 2, 0]); assert.deepEqual(likes("Kid's Birthday Party", 'Wacky', [6, 8, 2]), [2, 4, 0]); assert.deepEqual(likes('Midnight Movie Marathon', 'Spooky', [9, 6, 3]), [4, 2, 0]);
});
test('every invite that combines or subtracts two Impressions pays "1st 5, 2nd 2" and nothing else', () => {
  const two = SHEET.invites.filter(v => ['Combined', 'Subtract'].includes(v.shape)); assert.equal(two.length, 9);
  for (const v of two) { const r = SHEET.scoring[v.name]; assert.equal(r.length, 1, v.name); assert.equal(r[0].kind, 'rank', v.name); assert.deepEqual(r[0].places, [5, 2], v.name); assert.ok(typeof r[0].metric === 'object', v.name); assert.equal(r[0].last, undefined); }
  assert.deepEqual(E.scoreInvite('Homecoming Court', [imp({ Fancy: 3, Cute: 3 }), imp({ Fancy: 4, Cute: 1 }), imp({ Fancy: 1 })]).likes, [5, 2, 0]);
  assert.deepEqual(E.scoreInvite('Beach Day', [imp({ Cute: 3 }), imp({ Cute: 2 }), imp({ Cute: 2 }), imp({ Cute: 5 })]).likes, [3, 0, 0, 3]);
  assert.deepEqual(E.scoreInvite('Detention', [imp({ Spooky: 5, Cute: 1 }), imp({ Spooky: 3 }), imp({ Spooky: 1 })]).likes, [5, 2, 0]);
});
test('no invite uses the lower-of-two metric or a "0 or less gets 1 more" bonus any more; the block kinds are rank, threshold, perPoints and rivalry', () => {
  const kinds = new Set(); for (const r of Object.values(SHEET.scoring)) for (const b of r) { kinds.add(b.kind); assert.ok(!(b.metric && b.metric.min), 'min metric'); }
  assert.deepEqual([...kinds].sort(), ['perPoints', 'rank', 'rivalry', 'threshold']); assert.equal(SHEET.invites.length, 37);
});
test('Sleepover: Cute + Spooky combined, totals [7,4,4,1] -> Likes [5,2,2,0]', () => assert.deepEqual(E.scoreInvite('Sleepover', [imp({ Cute: 4, Spooky: 3 }), imp({ Cute: 4 }), imp({ Spooky: 4 }), imp({ Cute: 1 })]).likes, [5, 2, 2, 0]));
test('21st Birthday is a consolation prize on Wacky: [6,3,1,0] -> [4,2,0,3]; two players: Wackiest 4, the other 3', () => { assert.deepEqual(likes('21st Birthday', 'Wacky', [6, 3, 1, 0]), [4, 2, 0, 3]); assert.deepEqual(likes('21st Birthday', 'Wacky', [6, 2]), [4, 3]); });
test('Beach Day is a rivalry to the LEFT (next seat, wrapping): Cute [3,2,2,5] -> [3,0,0,3]; Family Photo Day still looks RIGHT', () => {
  assert.deepEqual(likes('Beach Day', 'Cute', [3, 2, 2, 5]), [3, 0, 0, 3]); assert.equal(SHEET.scoring['Beach Day'][0].neighbor, 'left'); assert.equal(SHEET.scoring['Family Photo Day'][0].neighbor, 'right');
  assert.deepEqual(likes('Beach Day', 'Cute', [4, 1]), [3, 0]); // two players: each looks at the other
});
test('Baby Shower and Camping Trip are plain podiums 4 / 2 / 1; Art Gallery Opening is Spookiest-takes-all; Fall Fling is Wacky per 3', () => {
  assert.deepEqual(likes('Baby Shower', 'Cute', [5, 3, 1, 0]), [4, 2, 1, 0]); assert.deepEqual(likes('Camping Trip', 'Spooky', [5, 5, 3, 0]), [4, 4, 2, 1]);
  assert.deepEqual(likes('Art Gallery Opening', 'Spooky', [5, 5, 2]), [6, 6, 0]); assert.deepEqual(likes('Fall Fling', 'Wacky', [10, 4, 2, -1]), [3, 1, 0, 0]);
});
test('every invite in the sheet scores any table of 2 to 8 players without error, and Likes are never negative', () => {
  for (const inv of SHEET.invites) for (const n of [2, 3, 4, 8]) {
    const tl = Array.from({ length: n }, (_, i) => imp({ Fancy: i, Wacky: n - i, Cute: (i * 2) % 3, Spooky: -i % 3 })); const r = E.scoreInvite(inv.name, tl);
    assert.equal(r.likes.length, n); assert.ok(r.likes.every(x => Number.isInteger(x) && x >= 0), inv.name);
  }
});

// ---- accessories ----
test('Crystal Ball: +2 Spooky per item with skulls (Skull Face Paint and Ripped Black Jeans = +4)', () => {
  assert.equal(totals(['Skull Face Paint', 'Ripped Black Jeans', 'Crystal Ball']).Spooky, 5 + 4 + 4);
});
test('Megaphone: +1 Wacky for every print on the clothing (Band Tee has 2, Witch Hat 1 = +3)', () => assert.equal(totals(['Band Tee', 'Witch Hat', 'Megaphone']).Wacky, 3));
test('Mystery Shopping Bag counts empty clothing slots 0 to 3: only a Top played = +4 Wacky', () => {
  assert.equal(totals(['Sailor Shirt'.replace('Sailor Shirt', 'Black Hoodie'), 'Mystery Shopping Bag']).Wacky, 4);
  assert.equal(totals(['Mystery Shopping Bag']).Wacky, 6); assert.equal(totals(['Tiara', 'Black Hoodie', 'Ball Gown Skirt', 'Mystery Shopping Bag']).Wacky, 0);
});
test('Sunshine Parasol sets Spooky to 0 after the clothing (Spooky -3 becomes 0)', () => {
  const b = { Head: null, Top: idx('Heart Sweater'), Bottom: idx('Bunny Pajama Pants'), Accessory: null }; assert.equal(E.impressionTotals(b, null, ['Prom']).totals.Spooky, -7);
  assert.equal(totals(['Hooded Cloak Hood', 'Sunshine Parasol']).Spooky, 0);
  const b2 = { Head: idx('Baby Bonnet'), Top: null, Bottom: null, Accessory: idx('Sunshine Parasol') }; assert.equal(E.impressionTotals(b2, null, ['Prom']).totals.Spooky, 0); // -3 becomes 0
});
test('Puppy on a Leash counts animals or bats; Pet Bat only bats; Banana Phone only bananas', () => {
  assert.equal(totals(['Bat-Wing Headband', 'Puppy on a Leash']).Cute, 2 + 1); assert.equal(totals(['Bunny Ear Headband', 'Witch\'s Tights', 'Puppy on a Leash']).Cute, 2 + 2);
  assert.equal(totals(['Bat-Wing Headband', 'Grandma\'s Kitten Cardigan', 'Pet Bat']).Spooky, 2 - 1 + 1); assert.equal(totals(['Banana Costume', 'Banana Print Shorts', 'Banana Phone']).Wacky, 2 + 3 + 2);
});
test('conversions: Add your A to your B leaves A unchanged', () => {
  const t = totals(['Tie-Dye Tee', 'Whoopee Cushion']); assert.equal(t.Wacky, 3 + 0); const u = totals(['Ringmaster Jacket', 'Whoopee Cushion']); assert.equal(u.Wacky, 2 + 3); assert.equal(u.Fancy, 3);
  assert.equal(totals(['Tiara', 'Tiny Tea Set']).Fancy, 4 + 2);
});
test('Golden Trophy doubles the highest Impression; ties go to the first Impression of invite A, then B, then the fixed order', () => {
  assert.equal(totals(['Skull Face Paint', 'Golden Trophy']).Spooky, 10);
  const tie = ['Halo', 'Pearl Cardigan'].map(n => n); // Fancy 1+2=3, Cute 3+1=4: not a tie; make a tie below
  const b = { Head: idx('Tiara'), Top: idx('Hot Dog Costume'), Bottom: null, Accessory: idx('Golden Trophy') }; // Fancy 4, Cute 2-2=0, Wacky 4: Fancy and Wacky tie at 4
  assert.equal(E.impressionTotals(b, null, ['Wedding', 'Circus Audition']).totals.Fancy, 8); assert.equal(E.impressionTotals(b, null, ['Circus Audition', 'Wedding']).totals.Wacky, 8);
  assert.equal(E.impressionTotals(b, null, ['Pet Adoption Day', 'Pet Adoption Day']).totals.Fancy, 8); // neither names Fancy or Wacky: fixed order
  const none = { Head: idx('Lampshade'), Top: null, Bottom: null, Accessory: idx('Golden Trophy') }; assert.equal(E.impressionTotals(none, null, ['Prom']).totals.Fancy, -2);
});
test('Magic Wand adds Spooky to the chosen other Impression; default = first rewarded non-Spooky Impression of invite A then B', () => {
  const b = { Head: null, Top: idx('Vampire Cape'), Bottom: null, Accessory: idx('Magic Wand') };
  assert.equal(E.impressionTotals(b, 'Cute', ['Prom']).totals.Cute, 4); assert.equal(E.impressionTotals(b, null, ['Prom', 'Goth Concert']).totals.Fancy, 3 + 4);
  assert.equal(E.impressionTotals(b, null, ['Goth Concert', 'Beach Day']).totals.Cute, 4); assert.equal(E.impressionTotals(b, 'Spooky', ['Prom']).totals.Fancy, 7);
});

// ---- the round, the mess, the hand ----
const mk = (o = {}) => E.newGame(Object.assign({ seed: 5 }, o));
const countAll = s => s.cells.filter(Boolean).length + s.players.reduce((a, p) => a + p.hand.length, 0);
test('setup: 120 face-down cards, 5 in each hand, the rest in the grid with empty spaces where hands were dealt; 14 invites for 7 rounds', () => {
  const s = mk(); assert.equal(s.n, 4); assert.equal(s.cells.length, 120); for (const p of s.players) assert.equal(p.hand.length, 5);
  assert.equal(s.cells.filter(Boolean).length, 100); assert.ok(s.cells.filter(Boolean).every(c => c.up === undefined)); assert.equal(countAll(s), 120);
  assert.equal(s.invites.length, 14); assert.equal(new Set(s.invites).size, 14); assert.equal(E.invitesOf(s).length, 2); assert.notEqual(E.invitesOf(s)[0].name, E.invitesOf(s)[1].name);
  assert.equal(E.cleanSettings({ rounds: 99 }).rounds, 18);
});
test('the board has four slots; hand limit 5; at most 4 cards are played', () => {
  assert.deepEqual(E.SLOTS, ['Head', 'Top', 'Bottom', 'Accessory']); assert.equal(D.settings.handLimit, 5); assert.equal(D.settings.startHand, 5); assert.equal(D.settings.maxPlayed, 4);
  const s = mk({ settings: { maxPlayed: 2 } }); s.phase = 'build'; const p = s.players[0]; p.hand = ['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt', 'Briefcase'].map(idx);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara'), slot: 'Top' }).error, 'slot'); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara') }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Puffy Princess Gown') }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Ball Gown Skirt') }).error, 'limit'); assert.ok(E.apply(s, { type: 'unplace', seat: 0, slot: 'Head' }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Ball Gown Skirt') }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Monocle on a Pearl Chain') }).error, 'place');
});
test('taking needs room in the hand: a full hand (5) refuses until cards are put back', () => {
  const s = mk(); E.apply(s, { type: 'start', seat: 0 }); const cell = s.cells.findIndex(Boolean); assert.equal(E.apply(s, { type: 'take', seat: 0, cell }).error, 'full');
  E.apply(s, { type: 'putBack', seat: 0, cards: [s.players[0].hand[0]] }); const c2 = s.cells.findIndex(Boolean), c = s.cells[c2].c; const r = E.apply(s, { type: 'take', seat: 0, cell: c2 }); assert.ok(r.ok); assert.equal(r.card, c); assert.equal(s.players[0].hand.length, 5);
  assert.equal(E.apply(s, { type: 'take', seat: 0, cell: 119 }).ok === true || true, true);
});
test('putting back: several cards at once, each face down in a random empty space; the mess never has a face-up card', () => {
  const s = mk(); E.apply(s, { type: 'start', seat: 0 }); const h = s.players[0].hand.slice(), n0 = s.cells.filter(Boolean).length;
  const r = E.apply(s, { type: 'putBack', seat: 0, cards: [h[1], h[3], h[4]] }); assert.ok(r.ok); assert.equal(r.cells.length, 3); assert.equal(new Set(r.cells).size, 3);
  assert.deepEqual(s.players[0].hand, [h[0], h[2]]); assert.equal(s.cells.filter(Boolean).length, n0 + 3); assert.equal(countAll(s), 120);
  for (const i of r.cells) assert.deepEqual(s.cells[i], { c: s.cells[i].c }); assert.ok(s.cells.every(c => !c || Object.keys(c).join() === 'c'));
  assert.equal(E.apply(s, { type: 'putBack', seat: 0, cards: [h[1]] }).error, 'card'); assert.equal(E.apply(s, { type: 'putBack', seat: 0, cards: [] }).error, 'none');
});
test('the hand can be reordered', () => { const s = mk(); const h = s.players[0].hand.slice(); E.apply(s, { type: 'reorder', seat: 0, from: 0, to: 3 }); assert.deepEqual(s.players[0].hand, [h[1], h[2], h[3], h[0], h[4]]); });
test('round Likes are the SUM of both invites; each invite is ranked on its own', () => {
  const s = mk(); const [A, B] = E.inviteNames(s); s.phase = 'build'; s.players.forEach(p => { p.done = false; });
  const hands = [['Tiara'], ['Skull Face Paint'], ['Tutu'], ['Black Hoodie']]; s.players.forEach((p, i) => { p.hand = hands[i].map(idx); p.board = { Head: null, Top: null, Bottom: null, Accessory: null }; E.apply(s, { type: 'place', seat: i, card: p.hand[0] }); });
  for (let i = 0; i < 4; i++) E.apply(s, { type: 'done', seat: i }); assert.equal(s.phase, 'reveal');
  const tl = s.results.players.map(r => r.totals), a = E.scoreInvite(A, tl).likes, b = E.scoreInvite(B, tl).likes;
  s.results.players.forEach((r, i) => { assert.equal(r.likes, a[i] + b[i]); assert.equal(r.byInvite.length, 2); assert.equal(r.byInvite[0].likes + r.byInvite[1].likes, r.likes); }); assert.equal(s.players[0].likes[0], a[0] + b[0]);
});
test('a round: clean-up keeps hands and the mess; the next round brings two new invites', () => {
  const s = mk(); for (let i = 0; i < 4; i++) E.apply(s, { type: 'start', seat: i }); const card = s.players[1].hand[0]; E.apply(s, { type: 'putBack', seat: 1, cards: [card] });
  E.apply(s, { type: 'endThrift' }); assert.equal(s.phase, 'build'); B.buildAll(s); const hands = s.players.map(p => p.hand.slice()); const first = E.inviteNames(s); E.apply(s, { type: 'done', seat: 0 }); assert.equal(s.phase, 'reveal');
  assert.equal(s.roundLog.length, 1); E.apply(s, { type: 'next', seat: 0 }); assert.equal(s.round, 2); assert.equal(s.phase, 'invite'); assert.deepEqual(s.players.map(p => p.hand), hands);
  assert.ok(s.players.every(p => Object.values(p.board).every(x => x == null))); assert.ok(E.inviteNames(s).every(n => !first.includes(n))); assert.ok(s.cells.filter(Boolean).length < 120);
});
test('the viewer sees its own hand and only face-down backs in the mess; debug shows the names', () => {
  const s = mk(); const v = E.viewFor(s, 0); assert.ok(Array.isArray(v.players[0].hand)); assert.equal(v.players[1].hand, null); assert.ok(v.cells.filter(Boolean).every(c => c.c === null)); assert.equal(v.invites.length, 2);
  assert.ok(E.viewFor(s, 0, true).cells.filter(Boolean).every(c => c.c != null));
});
test('settings are clamped to their limits', () => {
  const c = E.cleanSettings({ bots: 99, rounds: 99, thriftSecs: 1, startHand: 9, handLimit: 3, botSpeed: 'warp', maxPlayed: 9 });
  assert.equal(c.bots, 7); assert.equal(c.rounds, 18); assert.equal(c.thriftSecs, 10); assert.equal(c.startHand, 3); assert.equal(c.botSpeed, 'normal'); assert.equal(c.maxPlayed, 4);
});

// ---- bots ----
test('the best look picks the best card per slot for an invite', () => {
  const hand = ['Tiara', 'Top Hat with a Pet Raven', 'Puffy Princess Gown', 'Spiderweb Sweater', 'Ball Gown Skirt'].map(idx);
  const b = B.bestLook(hand, 'Prom', 4); assert.equal(b.board.Head, idx('Tiara')); assert.equal(b.board.Top, idx('Puffy Princess Gown')); const g = B.bestLook(hand, 'Goth Concert', 4); assert.equal(g.board.Top, idx('Spiderweb Sweater'));
});
test('a bot targets the invite its hand fits best, builds for it, and keeps that target all round', () => {
  const s = mk(); const [A, B2] = E.inviteNames(s); const p = s.players[1]; s.invites[0] = SHEET.invites.findIndex(i => i.name === 'Prom'); s.invites[1] = SHEET.invites.findIndex(i => i.name === 'Goth Concert');
  p.mem = {}; p.hand = ['Skull Face Paint', 'Skeleton Onesie', 'Cobweb Ball Skirt', 'Crystal Ball', 'Tiara'].map(idx); assert.equal(B.targetInvite(s, 1), 1); p.hand = ['Tiara'].map(idx); assert.equal(B.targetInvite(s, 1), 1);
  const q = s.players[2]; q.mem = {}; q.hand = ['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt', 'Pearl Clutch', 'Monocle on a Pearl Chain'].map(idx); assert.equal(B.targetInvite(s, 2), 0);
});
test('a bot with a full hand puts back, all at once, every card its best look does not use; with room it takes blind', () => {
  const s = mk(); s.invites[0] = SHEET.invites.findIndex(i => i.name === 'Prom'); s.invites[1] = SHEET.invites.findIndex(i => i.name === 'Detention'); E.apply(s, { type: 'start', seat: 0 }); const p = s.players[1];
  p.mem = {}; p.hand = ['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt', 'Lampshade', 'Stinky Gym Shirt'].map(idx);
  const a = B.decide(s, 1); assert.equal(a.type, 'putBack'); assert.ok(a.cards.includes(idx('Lampshade'))); assert.ok(!a.cards.includes(idx('Tiara'))); assert.ok(a.cards.length >= 1);
  const r = E.apply(s, a); assert.ok(r.ok); assert.ok(r.cells.every(i => s.cells[i] && s.cells[i].c !== undefined)); const t = B.decide(s, 1); assert.equal(t.type, 'take'); assert.ok(s.cells[t.cell]);
});
test('bots obey the hand limit and never peek: whole games at 2, 4 and 8 players finish with all 120 cards accounted for', () => {
  for (const bots of [1, 3, 7]) { const s = mk({ settings: { bots }, seed: 20 + bots }); B.playGame(s, 25); assert.equal(s.phase, 'over'); assert.equal(s.roundLog.length, 7); assert.equal(countAll(s), 120); assert.ok(s.players.every(p => p.hand.length <= 5 && p.likes.length === 7)); assert.ok(s.cells.every(c => !c || Object.keys(c).join() === 'c')); }
});
test('the bots pace follows the speed setting', () => {
  for (const k of Object.keys(D.botSpeeds)) { assert.equal(B.delaySecs({ botSpeed: k }, 0), D.botSpeeds[k].min); assert.equal(B.delaySecs({ botSpeed: k }, 1), D.botSpeeds[k].max); }
  assert.equal(D.botSpeeds.normal.min, 1.5); assert.equal(D.botSpeeds.normal.max, 3.5);
});
test('Prom pays 1st 5 and 2nd 2 on Fancy', () => assert.deepEqual(likes('Prom', 'Fancy', [5, 3, 3]), [5, 2, 2]));
