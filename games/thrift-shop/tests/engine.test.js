// Thrift Shop rules: scoring of every invite shape, two invites a round, the accessory abilities, the mess, and whole bot games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, SHEET, Engine: E, Bots: B } = require('./load.js');

const imp = (o = {}) => Object.assign({ Fancy: 0, Wacky: 0, Cute: 0, Spooky: 0 }, o);
const likes = (name, key, vals) => E.scoreInvite(name, vals.map(v => imp({ [key]: v }))).likes;
const idx = name => { const i = SHEET.cards.findIndex(c => c.name === name); assert.ok(i >= 0, 'no card ' + name); return i; };
// A board from card names: each card goes in its main slot, a second card of the type in the bonus slot (Head2 ...).
const mkBoard = names => { const b = Object.fromEntries(E.ALLSLOTS.map(k => [k, null])); for (const n of names) { const i = idx(n), ty = SHEET.cards[i].type; b[b[ty] == null ? ty : E.BONUS[ty]] = i; } return b; };
// Totals for card names; `picks` maps an accessory's name to the traits its owner chose.
const calc = (names, picks = {}, extra = {}) => { const b = mkBoard(names), pk = {}; for (const [n, tr] of Object.entries(picks)) pk[E.ACCSLOTS.find(k => b[k] === idx(n))] = tr; return E.impressionTotals(b, Object.assign({ picks: pk, names: ['Prom', 'Prom'] }, extra)); };
const totals = (names, picks, extra) => calc(names, picks, extra).totals;
// Temporary cards with exact numbers (removed again), for the rule examples that name numbers.
const withFake = (list, fn) => { const start = SHEET.cards.length; try { list.forEach(([type, v], i) => SHEET.cards.push({ name: 'Fake ' + i, type, v, power: '', abilityText: '', ability: null })); return fn(...list.map((_, i) => start + i)); } finally { SHEET.cards.length = start; } };

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

// ---- accessories (the owner picks traits in the build phase; order: clothing, other bonuses, Mixtape/Tote, Leash, Trophy) ----
const accBoard = (cards, accessories) => { const b = Object.fromEntries(E.ALLSLOTS.map(k => [k, null])); for (const c of cards) { const ty = SHEET.cards[c].type; b[b[ty] == null ? ty : E.BONUS[ty]] = c; } accessories.forEach((a, i) => { b[E.ACCSLOTS[i]] = idx(a); }); return b; };
test('Statement Necklace (Spooky): Spooky +3, +1, +2 on Head, Top and Bottom -> +4; with only Head and Top filled -> +0', () => withFake([['Head', [0, 0, 0, 3]], ['Top', [0, 0, 0, 1]], ['Bottom', [0, 0, 0, 2]]], (h, tp, bt) => {
  const run = cl => E.impressionTotals(accBoard(cl, ['Statement Necklace']), { picks: { Accessory: ['Spooky'] }, names: ['Prom', 'Prom'] }).totals.Spooky;
  assert.equal(run([h, tp, bt]), 6 + 4); assert.equal(run([h, tp]), 4);
}));
test('Statement Earrings need all three filled and every clothing card positive in the chosen trait', () => {
  const b = (cl, a) => E.impressionTotals(accBoard(cl.map(idx), [a]), { picks: { Accessory: ['Fancy'] }, names: ['Prom', 'Prom'] }).totals.Fancy;
  assert.equal(b(['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt'], 'Statement Earrings'), 12 + 4); assert.equal(b(['Tiara', 'Itchy Reindeer Sweater', 'Ball Gown Skirt'], 'Statement Earrings'), 6); assert.equal(b(['Tiara', 'Ball Gown Skirt'], 'Statement Earrings'), 8);
});
test('Minimalist Tote (Wacky): +2 per empty Head/Top/Bottom slot; only a Top worn -> +4 Wacky', () => {
  assert.equal(calc(['Tie-Dye Tee', 'Minimalist Tote'], { 'Minimalist Tote': ['Wacky'] }).totals.Wacky, 3 + 4); assert.equal(calc(['Tiara', 'Tie-Dye Tee', 'Tutu', 'Minimalist Tote'], { 'Minimalist Tote': ['Wacky'] }).totals.Wacky, 6);
});
test('Duct Tape (Fancy): negative Fancy on clothing counts as 0 (Fancy +4 and -5 -> 4); other traits keep their negatives', () => {
  assert.equal(calc(['Tiara', 'Barrel']).totals.Fancy, -1); const t = totals(['Tiara', 'Barrel', 'Duct Tape'], { 'Duct Tape': ['Fancy'] }); assert.equal(t.Fancy, 4);
  assert.equal(totals(['Skull Face Paint', 'Duct Tape'], { 'Duct Tape': ['Fancy'] }).Cute, -3);
});
test('Reversible Tote swaps Fancy and Wacky, or Cute and Spooky (the owner picks the pair): Fancy -5, Wacky +5 -> Fancy +5, Wacky -5', () => {
  const t = totals(['Barrel', 'Reversible Tote'], { 'Reversible Tote': ['Fancy', 'Wacky'] }); assert.equal(t.Fancy, 5); assert.equal(t.Wacky, -5);
  const u = totals(['Skull Face Paint', 'Reversible Tote'], { 'Reversible Tote': ['Cute', 'Spooky'] }); assert.equal(u.Cute, 5); assert.equal(u.Spooky, -3);
  assert.ok(E.validPick(SHEET.cards[idx('Reversible Tote')].ability, ['Cute', 'Spooky'])); assert.ok(!E.validPick(SHEET.cards[idx('Reversible Tote')].ability, ['Fancy', 'Cute']));
});
test('Safety Pins: you may wear two Tops, and both count', () => {
  const t = totals(['Black Hoodie', 'Band Tee', 'Safety Pins']); assert.equal(t.Spooky, 2 + 3); assert.equal(t.Cute, 1 - 1);
  const s = E.newGame({ seed: 3, settings: { bots: 1 } }); s.phase = 'build'; const p = s.players[0]; p.hand = ['Black Hoodie', 'Band Tee', 'Safety Pins', 'Tiara', 'Tutu', 'Witch Hat'].map(idx);
  assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Black Hoodie') }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Band Tee') }).ok); assert.equal(p.board.Top, idx('Band Tee')); assert.equal(p.board.Top2, null);   // no pins: the second Top replaces the first
  assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Safety Pins') }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Black Hoodie') }).ok); assert.equal(p.board.Top2, idx('Black Hoodie'));
  assert.ok(E.apply(s, { type: 'unplace', seat: 0, slot: 'Accessory' }).ok); assert.equal(p.board.Top2, null); assert.equal(p.board.Top, idx('Band Tee'));   // pins off: the extra Top goes back to the hand
});
test('bonus slots raise the cap by one each: Hatbox lets a 4-card outfit carry 5; Second Handbag adds an accessory slot', () => {
  const s = E.newGame({ seed: 3, settings: { bots: 1 } }); s.phase = 'build'; const p = s.players[0]; p.hand = ['Hatbox', 'Tiara', 'Pearl Hair Bow', 'Tie-Dye Tee', 'Tutu', 'Second Handbag', 'Mood Ring'].map(idx);
  for (const n of ['Tiara', 'Tie-Dye Tee', 'Tutu', 'Mood Ring']) assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx(n) }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Pearl Hair Bow'), slot: 'Head2' }).ok, true); assert.equal(p.board.Head2, null); assert.equal(p.board.Head, idx('Pearl Hair Bow'));   // closed bonus slot: replaces
  assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Hatbox') }).ok); assert.equal(p.board.Accessory, idx('Hatbox'));   // replaced the Mood Ring
  assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara') }).ok); assert.equal(p.board.Head2, idx('Tiara')); assert.equal(E.capOf(s, p), 5);
  assert.deepEqual(E.ACCSLOTS, ['Accessory', 'Accessory2']);
});
test('Lucky Penny: in any tie the owner ranks ahead (tied for 1st -> owner 1st, the other 2nd); two Penny owners stay tied', () => {
  const v = [5, 5, 3].map(x => imp({ Fancy: x }));
  assert.deepEqual(E.scoreInvite('Prom', v, [false, true, false]).likes, [2, 5, 0]); assert.deepEqual(E.scoreInvite('Prom', v, [true, false, false]).likes, [5, 2, 0]);   // Prom pays 1st 5, 2nd 2 (dense ranks): the Penny owner is 1st, the other 2nd
  assert.deepEqual(E.scoreInvite('Prom', v, [true, true, false]).likes, [5, 5, 2]); assert.deepEqual(E.scoreInvite('Prom', v).likes, [5, 5, 2]);
  const s = E.newGame({ seed: 4, settings: { bots: 1 } }); s.phase = 'build'; const [a, b] = s.players;
  for (const [p, hand] of [[a, ['Tiara', 'Lucky Penny']], [b, ['Tiara']]]) { p.hand = hand.map(idx); for (const c of p.hand) E.apply(s, { type: 'place', seat: s.players.indexOf(p), card: c }); }
  assert.ok(E.hasPenny(a.board)); assert.ok(!E.hasPenny(b.board));
});
test('Invisible Dog Leash (Spooky): a Spooky total of 6 becomes 0 (after Mixtape and Reversible Tote)', () => {
  assert.equal(calc(['Witch Hat', 'Band Tee']).totals.Spooky, 6); assert.equal(totals(['Witch Hat', 'Band Tee', 'Invisible Dog Leash'], { 'Invisible Dog Leash': ['Spooky'] }).Spooky, 0);
  const b = accBoard([idx('Witch Hat'), idx('Band Tee')], ['Second Handbag', 'Invisible Dog Leash']); b.Accessory = idx('Second Handbag');
  const c = E.impressionTotals(Object.assign(accBoard([idx('Witch Hat'), idx('Band Tee')], ['Reversible Tote', 'Second Handbag']), {}), { picks: { Accessory: ['Cute', 'Spooky'] }, names: ['Prom', 'Prom'] }).totals; assert.equal(c.Cute, 6); assert.equal(c.Spooky, -2);
});
test('Mixtape adds the first trait\'s total to the second (the first is unchanged); Pinwheel +1 to every trait above 0 after clothing', () => {
  const t = totals(['Tiara', 'Mixtape'], { Mixtape: ['Fancy', 'Spooky'] }); assert.equal(t.Fancy, 4); assert.equal(t.Spooky, 4);
  const p = totals(['Tiara', 'Skull Face Paint', 'Pinwheel']); assert.deepEqual([p.Fancy, p.Wacky, p.Cute, p.Spooky], [4 + 1, 0, -1, 5 + 1]);
});
test('Rhinestone Brooch adds the best clothing card\'s amount again (only if above 0); Mismatched Socks +1 per negative number on clothing; Lint Roller +3 if none is negative', () => {
  assert.equal(totals(['Tiara', 'Puffy Princess Gown', 'Rhinestone Brooch'], { 'Rhinestone Brooch': ['Fancy'] }).Fancy, 8 + 4); assert.equal(totals(['Skull Face Paint', 'Rhinestone Brooch'], { 'Rhinestone Brooch': ['Cute'] }).Cute, -3);
  assert.equal(totals(['Skull Face Paint', 'Ripped Black Jeans', 'Mismatched Socks'], { 'Mismatched Socks': ['Wacky'] }).Wacky, 2);
  assert.equal(totals(['Tiara', 'Ball Gown Skirt', 'Lint Roller'], { 'Lint Roller': ['Cute'] }).Cute, 4 + 3); assert.equal(totals(['Tiara', 'Skull Face Paint', 'Lint Roller'], { 'Lint Roller': ['Cute'] }).Cute, -1);
});
test('the simple choosers: Mood Ring +2, Tiny Umbrella +1 to two traits, mirrors per positive clothing card, Pocket Square/Anklet +1 or +3, Scarf and Belt +3', () => {
  assert.equal(totals(['Mood Ring'], { 'Mood Ring': ['Cute'] }).Cute, 2); const u = totals(['Tiny Umbrella'], { 'Tiny Umbrella': ['Fancy', 'Wacky'] }); assert.deepEqual([u.Fancy, u.Wacky, u.Cute], [1, 1, 0]);
  assert.equal(totals(['Tiara', 'Puffy Princess Gown', 'Pocket Mirror'], { 'Pocket Mirror': ['Fancy'] }).Fancy, 8 + 2);
  assert.equal(totals(['Tie-Dye Tee', 'Pocket Square'], { 'Pocket Square': ['Wacky'] }).Wacky, 3 + 3); assert.equal(totals(['Tiara', 'Pocket Square'], { 'Pocket Square': ['Wacky'] }).Wacky, 1);
  assert.equal(totals(['Tutu', 'Anklet'], { Anklet: ['Wacky'] }).Wacky, 3 + 3); assert.equal(totals(['Tiara', 'Puffy Princess Gown', 'Coordinated Scarf'], { 'Coordinated Scarf': ['Fancy'] }).Fancy, 8 + 3);
  assert.equal(totals(['Puffy Princess Gown', 'Ball Gown Skirt', 'Matching Belt'], { 'Matching Belt': ['Fancy'] }).Fancy, 8 + 3); assert.equal(totals(['Puffy Princess Gown', 'Lost and Found Box'], { 'Lost and Found Box': ['Wacky'] }).Wacky, -3);
});
test('Golden Trophy doubles the highest trait; ties go to the first trait of invite A, then B, then the fixed order; step 5, after everything else', () => {
  const b = mkBoard(['Skeleton Onesie', 'Golden Trophy']);   // Wacky 3 and Spooky 3 tie
  const w = E.impressionTotals(b, { names: ['Prom', 'Prom'] }).totals, g = E.impressionTotals(b, { names: ['Goth Concert', 'Beach Day'] }).totals;
  assert.deepEqual([w.Wacky, w.Spooky], [6, 3]); assert.deepEqual([g.Wacky, g.Spooky], [3, 6]);
  assert.equal(totals(['Tiara', 'Ball Gown Skirt', 'Golden Trophy']).Fancy, 16); assert.equal(totals(['Tiara', 'Barrel', 'Golden Trophy']).Wacky, 10);
});
test('the owner\'s effects are listed in order for the reveal', () => { const r = calc(['Tiara', 'Tutu', 'Mood Ring'], { 'Mood Ring': ['Cute'] }); assert.ok(r.effects[0].startsWith('Mood Ring: +2 Cute')); assert.equal(r.effect, r.effects.join(' · ')); });
test('defaults and picks: an accessory that needs traits always has a valid pick; setTraits changes it', () => {
  const s = E.newGame({ seed: 3, settings: { bots: 1 } }); s.phase = 'build'; const p = s.players[0]; p.hand = ['Mixtape', 'Reversible Tote', 'Mood Ring'].map(idx);
  for (const n of ['Mixtape', 'Reversible Tote', 'Mood Ring']) { assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx(n) }).ok); const k = E.ACCSLOTS.find(x => p.board[x] === idx(n)); assert.ok(E.validPick(SHEET.cards[idx(n)].ability, p.picks[k]), n); }
  assert.ok(E.apply(s, { type: 'setTraits', seat: 0, slot: 'Accessory', traits: ['Cute'] }).ok); assert.deepEqual(p.picks.Accessory, ['Cute']); assert.equal(E.apply(s, { type: 'setTraits', seat: 0, slot: 'Accessory', traits: ['Cute', 'Wacky'] }).error, 'traits');
});
test('Changing Room Key: after everyone is done and before scoring each key holder may swap one worn card for a same-type card in hand; all decide at once', () => {
  const s = E.newGame({ seed: 8, settings: { bots: 2 } }); s.phase = 'build'; const [a, b, c] = s.players;
  a.hand = ['Tiara', 'Pearl Hair Bow', 'Changing Room Key'].map(idx); b.hand = ['Tutu'].map(idx); c.hand = ['Black Hoodie'].map(idx);
  for (const [i, cards] of [[0, ['Tiara', 'Changing Room Key']], [1, ['Tutu']], [2, ['Black Hoodie']]]) for (const n of cards) E.apply(s, { type: 'place', seat: i, card: idx(n) });
  for (let i = 0; i < 3; i++) E.apply(s, { type: 'done', seat: i }); assert.equal(s.phase, 'swap'); assert.deepEqual(s.swapSeats, [0]);
  assert.equal(E.apply(s, { type: 'swap', seat: 0, slot: 'Head', card: idx('Tutu') }).error, 'swap'); assert.equal(E.apply(s, { type: 'swap', seat: 1, slot: 'Head', card: idx('Pearl Hair Bow') }).error, 'phase');
  assert.ok(E.apply(s, { type: 'swap', seat: 0, slot: 'Head', card: idx('Pearl Hair Bow') }).ok); assert.equal(s.phase, 'swap'); assert.equal(E.apply(s, { type: 'swap', seat: 0, slot: 'Head', card: idx('Tiara') }).error, 'swap');   // one swap each
  assert.ok(E.apply(s, { type: 'keepSwap', seat: 0 }).ok); assert.equal(s.phase, 'reveal'); assert.equal(s.results.players[0].board.Head, idx('Pearl Hair Bow')); assert.equal(s.results.swaps.length, 1);
  assert.ok(a.hand.includes(idx('Tiara')));
});
test('Mystery Grab Bag / Scratch-Off Ticket flip random face-down cards until clothing, then every flipped card goes back face down', () => {
  const s = E.newGame({ seed: 12, settings: { bots: 1 } }); s.phase = 'build'; const a = s.players[0], b = s.players[1]; const n0 = s.cells.filter(Boolean).length;
  a.hand = ['Tiara', 'Mystery Grab Bag'].map(idx); b.hand = ['Tutu', 'Scratch-Off Ticket'].map(idx); for (const c of a.hand) E.apply(s, { type: 'place', seat: 0, card: c }); for (const c of b.hand) E.apply(s, { type: 'place', seat: 1, card: c });
  E.apply(s, { type: 'setTraits', seat: 1, slot: 'Accessory', traits: ['Cute'] }); E.apply(s, { type: 'done', seat: 0 }); E.apply(s, { type: 'done', seat: 1 }); assert.equal(s.phase, 'reveal');
  const fl = s.results.flips; assert.equal(fl.length, 2); for (const f of fl) { assert.ok(f.cards.length >= 1); if (f.hit != null) { assert.notEqual(SHEET.cards[f.hit].type, 'Accessory'); assert.equal(f.cards[f.cards.length - 1], f.hit); } }
  assert.equal(s.cells.filter(Boolean).length, n0); assert.ok(s.cells.every(c => !c || Object.keys(c).join() === 'c'));
  const hit = fl[0].hit, base = calc(['Tiara']).totals, got = s.results.players[0].totals; SHEET.cards[hit].v.forEach((v, i) => assert.equal(got[E.IMPS[i]], base[E.IMPS[i]] + v));
});

// ---- the round, the mess, the hand ----
const mk = (o = {}) => E.newGame(Object.assign({ seed: 5 }, o));
// take n cards from the front of the mess into a seat's hand (everyone starts with 0)
const deal = (s, seat, n) => { for (let k = 0; k < n; k++) E.apply(s, { type: 'take', seat, cell: s.cells.findIndex(Boolean) }); };
// give a seat exact cards from the mess
const give = (s, seat, names) => { s.players[seat].hand = names.map(idx); for (const c of s.players[seat].hand) { const k = s.cells.findIndex(x => x && x.c === c); if (k >= 0) s.cells[k] = null; } };
const countAll = s => s.cells.filter(Boolean).length + s.players.reduce((a, p) => a + p.hand.length, 0);
test('setup: 120 face-down cards, every hand empty, 10 invites for 5 rounds; the new defaults', () => {
  const s = mk(); assert.equal(s.n, 4); assert.equal(s.cells.length, 120); for (const p of s.players) assert.equal(p.hand.length, 0);
  assert.equal(s.cells.filter(Boolean).length, 120); assert.ok(s.cells.filter(Boolean).every(c => c.up === undefined)); assert.equal(countAll(s), 120);
  assert.equal(s.cfg.rounds, 5); assert.equal(s.invites.length, 10); assert.equal(new Set(s.invites).size, 10); assert.equal(E.invitesOf(s).length, 2); assert.notEqual(E.invitesOf(s)[0].name, E.invitesOf(s)[1].name);
  assert.equal(E.cleanSettings({ rounds: 99 }).rounds, 18);
  assert.deepEqual([D.settings.rounds, D.settings.startHand, D.settings.handLimit, D.settings.thriftSecs, D.settings.maxPlayed, D.settings.typeBacks], [5, 0, 7, 90, 4, true]);
});
test('the board has four slots (plus bonus slots); hand limit 7; at most 4 cards are played', () => {
  assert.deepEqual(E.SLOTS, ['Head', 'Top', 'Bottom', 'Accessory']); assert.deepEqual(E.ALLSLOTS, ['Head', 'Head2', 'Top', 'Top2', 'Bottom', 'Bottom2', 'Accessory', 'Accessory2']);
  const s = mk({ settings: { maxPlayed: 2 } }); s.phase = 'build'; const p = s.players[0]; p.hand = ['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt', 'Mood Ring'].map(idx);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara'), slot: 'Top' }).error, 'slot'); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Tiara') }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Puffy Princess Gown') }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Ball Gown Skirt') }).error, 'limit'); assert.ok(E.apply(s, { type: 'unplace', seat: 0, slot: 'Head' }).ok); assert.ok(E.apply(s, { type: 'place', seat: 0, card: idx('Ball Gown Skirt') }).ok);
  assert.equal(E.apply(s, { type: 'place', seat: 0, card: idx('Pearl Hair Bow') }).error, 'place');
});
test('taking needs room in the hand: a full hand (7) refuses until cards are put back', () => {
  const s = mk(); E.apply(s, { type: 'start', seat: 0 }); deal(s, 0, 7); assert.equal(s.players[0].hand.length, 7); const cell = s.cells.findIndex(Boolean); assert.equal(E.apply(s, { type: 'take', seat: 0, cell }).error, 'full');
  E.apply(s, { type: 'putBack', seat: 0, cards: [s.players[0].hand[0]] }); const c2 = s.cells.findIndex(Boolean), c = s.cells[c2].c; const r = E.apply(s, { type: 'take', seat: 0, cell: c2 }); assert.ok(r.ok); assert.equal(r.card, c); assert.equal(s.players[0].hand.length, 7);
});
test('putting back: several cards at once, each face down in a random empty space; the mess never has a face-up card', () => {
  const s = mk(); E.apply(s, { type: 'start', seat: 0 }); deal(s, 0, 5); const h = s.players[0].hand.slice(), n0 = s.cells.filter(Boolean).length;
  const r = E.apply(s, { type: 'putBack', seat: 0, cards: [h[1], h[3], h[4]] }); assert.ok(r.ok); assert.equal(r.cells.length, 3); assert.equal(new Set(r.cells).size, 3);
  assert.deepEqual(s.players[0].hand, [h[0], h[2]]); assert.equal(s.cells.filter(Boolean).length, n0 + 3); assert.equal(countAll(s), 120);
  for (const i of r.cells) assert.deepEqual(s.cells[i], { c: s.cells[i].c }); assert.ok(s.cells.every(c => !c || Object.keys(c).join() === 'c'));
  assert.equal(E.apply(s, { type: 'putBack', seat: 0, cards: [h[1]] }).error, 'card'); assert.equal(E.apply(s, { type: 'putBack', seat: 0, cards: [] }).error, 'none');
});
test('the hand can be reordered', () => { const s = mk(); E.apply(s, { type: 'start', seat: 0 }); deal(s, 0, 5); const h = s.players[0].hand.slice(); E.apply(s, { type: 'reorder', seat: 0, from: 0, to: 3 }); assert.deepEqual(s.players[0].hand, [h[1], h[2], h[3], h[0], h[4]]); });
test('round Likes are the SUM of both invites; each invite is ranked on its own', () => {
  const s = mk(); const [A, B] = E.inviteNames(s); s.phase = 'build'; s.players.forEach(p => { p.done = false; });
  const hands = [['Tiara'], ['Skull Face Paint'], ['Tutu'], ['Black Hoodie']]; s.players.forEach((p, i) => { p.hand = hands[i].map(idx); p.board = Object.fromEntries(E.ALLSLOTS.map(k => [k, null])); E.apply(s, { type: 'place', seat: i, card: p.hand[0] }); });
  for (let i = 0; i < 4; i++) E.apply(s, { type: 'done', seat: i }); assert.equal(s.phase, 'reveal');
  const tl = s.results.players.map(r => r.totals), a = E.scoreInvite(A, tl).likes, b = E.scoreInvite(B, tl).likes;
  s.results.players.forEach((r, i) => { assert.equal(r.likes, a[i] + b[i]); assert.equal(r.byInvite.length, 2); assert.equal(r.byInvite[0].likes + r.byInvite[1].likes, r.likes); }); assert.equal(s.players[0].likes[0], a[0] + b[0]);
});
test('a round: clean-up keeps hands and the mess; the next round brings two new invites', () => {
  const s = mk(); for (let i = 0; i < 4; i++) E.apply(s, { type: 'start', seat: i }); for (let i = 0; i < 4; i++) deal(s, i, 6); const card = s.players[1].hand[0]; E.apply(s, { type: 'putBack', seat: 1, cards: [card] });
  E.apply(s, { type: 'endThrift' }); assert.equal(s.phase, 'build'); B.buildAll(s); const hands = s.players.map(p => p.hand.slice()); const first = E.inviteNames(s); E.apply(s, { type: 'done', seat: 0 }); assert.equal(s.phase, 'reveal');
  assert.equal(s.roundLog.length, 1); E.apply(s, { type: 'next', seat: 0 }); assert.equal(s.round, 2); assert.equal(s.phase, 'invite'); assert.deepEqual(s.players.map(p => p.hand), hands);
  assert.ok(s.players.every(p => Object.values(p.board).every(x => x == null))); assert.ok(E.inviteNames(s).every(n => !first.includes(n))); assert.ok(s.cells.filter(Boolean).length < 120); assert.ok(s.players.every(p => p.hand.length > 0));
});
test('the viewer sees its own hand and only face-down backs in the mess; debug shows the names', () => {
  const s = mk(); const v = E.viewFor(s, 0); assert.ok(Array.isArray(v.players[0].hand)); assert.equal(v.players[1].hand, null); assert.ok(v.cells.filter(Boolean).every(c => c.c === null)); assert.equal(v.invites.length, 2);
  assert.ok(E.viewFor(s, 0, true).cells.filter(Boolean).every(c => c.c != null));
  // colour-coded backs: the type shows on the back (never the card) while the setting is on
  assert.ok(v.cells.filter(Boolean).every(c => ['Head', 'Top', 'Bottom', 'Accessory'].includes(c.t))); const off = mk({ settings: { typeBacks: false } }); assert.ok(E.viewFor(off, 0).cells.filter(Boolean).every(c => c.t === null && c.c === null));
});
test('settings are clamped to their limits', () => {
  const c = E.cleanSettings({ bots: 99, rounds: 99, thriftSecs: 1, startHand: 9, handLimit: 3, botSpeed: 'warp', maxPlayed: 9 });
  assert.equal(c.bots, 7); assert.equal(c.rounds, 18); assert.equal(c.thriftSecs, 10); assert.equal(c.startHand, 3); assert.equal(c.handLimit, 3); assert.equal(E.cleanSettings({ handLimit: 99 }).handLimit, 7); assert.equal(E.cleanSettings({ startHand: 0 }).startHand, 0); assert.equal(E.cleanSettings({ typeBacks: false }).typeBacks, false); assert.equal(E.cleanSettings({}).typeBacks, true); assert.equal(c.botSpeed, 'normal'); assert.equal(c.maxPlayed, 4);
});

// ---- bots ----
test('the best look picks the best card per slot for an invite', () => {
  const hand = ['Tiara', 'Top Hat with a Pet Raven', 'Puffy Princess Gown', 'Spiderweb Sweater', 'Ball Gown Skirt'].map(idx);
  const b = B.bestLook(hand, 'Prom', 4); assert.equal(b.board.Head, idx('Tiara')); assert.equal(b.board.Top, idx('Puffy Princess Gown')); const g = B.bestLook(hand, 'Goth Concert', 4); assert.equal(g.board.Top, idx('Spiderweb Sweater'));
});
test('a bot targets the invite its hand fits best, builds for it, and keeps that target all round', () => {
  const s = mk(); const [A, B2] = E.inviteNames(s); const p = s.players[1]; s.invites[0] = SHEET.invites.findIndex(i => i.name === 'Prom'); s.invites[1] = SHEET.invites.findIndex(i => i.name === 'Goth Concert');
  p.mem = {}; p.hand = ['Skull Face Paint', 'Skeleton Onesie', 'Cobweb Ball Skirt', 'Witch Hat', 'Tiara'].map(idx); assert.equal(B.targetInvite(s, 1), 1); p.hand = ['Tiara'].map(idx); assert.equal(B.targetInvite(s, 1), 1);
  const q = s.players[2]; q.mem = {}; q.hand = ['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt', 'Pearl Cardigan', 'Mood Ring'].map(idx); assert.equal(B.targetInvite(s, 2), 0);
});
test('a bot with a full hand puts back, all at once, every card its best look does not use; with room it takes blind', () => {
  const s = mk({ settings: { handLimit: 5 } }); s.invites[0] = SHEET.invites.findIndex(i => i.name === 'Prom'); s.invites[1] = SHEET.invites.findIndex(i => i.name === 'Detention'); E.apply(s, { type: 'start', seat: 0 }); const p = s.players[1];
  p.mem = {}; give(s, 1, ['Tiara', 'Puffy Princess Gown', 'Ball Gown Skirt', 'Lampshade', 'Stinky Gym Shirt']);
  const a = B.decide(s, 1); assert.equal(a.type, 'putBack'); assert.ok(a.cards.includes(idx('Lampshade'))); assert.ok(!a.cards.includes(idx('Tiara'))); assert.ok(a.cards.length >= 1);
  const r = E.apply(s, a); assert.ok(r.ok); assert.ok(r.cells.every(i => s.cells[i] && s.cells[i].c !== undefined)); const t = B.decide(s, 1); assert.equal(t.type, 'take'); assert.ok(s.cells[t.cell]);
  // with colour backs on a bot takes a type it has none of; with them off it takes blind
  const need = SHEET.cards[s.cells[t.cell].c].type; assert.ok(!s.players[1].hand.some(c => SHEET.cards[c].type === need) || ['Head', 'Top', 'Bottom', 'Accessory'].every(ty => s.players[1].hand.some(c => SHEET.cards[c].type === ty)));
});
test('bots obey the hand limit and never peek: whole games at 2, 4 and 8 players finish with all 120 cards accounted for', () => {
  for (const bots of [1, 3, 7]) { const s = mk({ settings: { bots }, seed: 20 + bots }); B.playGame(s, 25); assert.equal(s.phase, 'over'); assert.equal(s.roundLog.length, 5); assert.equal(countAll(s), 120); assert.ok(s.players.every(p => p.hand.length <= 7 && p.likes.length === 5)); assert.ok(s.cells.every(c => !c || Object.keys(c).join() === 'c')); }
});
test('a bot builds its best look with trait picks that help its target, and takes the Changing Room Key swap that helps most', () => {
  const s = mk({ settings: { bots: 1 } }); s.invites[0] = SHEET.invites.findIndex(i => i.name === 'Prom'); s.invites[1] = SHEET.invites.findIndex(i => i.name === 'Detention'); s.phase = 'build';
  const p = s.players[1]; p.mem = {}; give(s, 1, ['Mood Ring', 'Tiara', 'Tutu']); B.build(s, 1);
  assert.equal(p.done, true); assert.equal(p.board.Head, idx('Tiara')); assert.equal(p.board.Accessory, idx('Mood Ring')); assert.deepEqual(p.picks.Accessory, ['Fancy']);   // Prom rewards Fancy
  const q = mk({ settings: { bots: 1 } }); q.invites[0] = SHEET.invites.findIndex(i => i.name === 'Prom'); q.invites[1] = SHEET.invites.findIndex(i => i.name === 'Detention'); const r = q.players[1]; r.mem = { target: 0 };
  give(q, 1, ['Pearl Hair Bow', 'Tiara', 'Changing Room Key']); q.phase = 'build'; E.apply(q, { type: 'place', seat: 1, card: idx('Pearl Hair Bow') }); E.apply(q, { type: 'place', seat: 1, card: idx('Changing Room Key') });
  q.swapSeats = [1]; q.swapped = []; q.phase = 'swap'; B.swap(q, 1); assert.equal(r.board.Head, idx('Tiara')); assert.equal(q.results.swaps.length, 1);   // Tiara (Fancy 4) beats the bow (Fancy 2)
});
test('whole bot games with every accessory in play finish, and a bot never wears more than the cap', () => {
  for (let seed = 30; seed < 36; seed++) { const s = mk({ seed, settings: { bots: 3 } }); B.playGame(s, 30); assert.equal(s.phase, 'over'); for (const rl of s.roundLog) for (const pl of rl.players) assert.ok(Object.values(pl.board).filter(Boolean).length <= 6); }
});
test('the bots pace follows the speed setting', () => {
  for (const k of Object.keys(D.botSpeeds)) { assert.equal(B.delaySecs({ botSpeed: k }, 0), D.botSpeeds[k].min); assert.equal(B.delaySecs({ botSpeed: k }, 1), D.botSpeeds[k].max); }
  assert.equal(D.botSpeeds.normal.min, 1.5); assert.equal(D.botSpeeds.normal.max, 3.5);
});
test('Prom pays 1st 5 and 2nd 2 on Fancy', () => assert.deepEqual(likes('Prom', 'Fancy', [5, 3, 3]), [5, 2, 2]));
