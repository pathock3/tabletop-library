// OMG Babies! rules: setup, the morning options, the dice, Joy sets, Diaper and Rest, goals and skills, the night, the end, and whole bot games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B } = require('./load.js');
const R = D.rules;
const mk = (o = {}) => E.newGame(Object.assign({ seed: 3 }, o));
const me = s => s.players[0];
const dice = (...faces) => faces.map(f => ({ f }));

test('setup: everyone gains 1 Poop and a Baby; the first player starts with 1 Energy, the next with 2 and so on', () => {
  const s = mk({ settings: { bots: 3 } }); assert.equal(s.n, 4); assert.deepEqual(s.players.map(p => p.energy), [1, 2, 3, 4]); assert.ok(s.players.every(p => p.poop === 1 && p.babies.length === 1 && p.joy === 0));
  assert.equal(s.babyDeck.length, 40 - 4); assert.equal(s.goalRow.length, 5); assert.equal(D.babyNames.length, 40); assert.equal(D.goals.length, 30);
  assert.deepEqual(mk({ settings: { bots: 7 } }).players.map(p => p.energy), [1, 2, 3, 4, 5, 5, 5, 5]); // capped at the Setup's 5
});
test('morning: New Baby costs 1 Energy and draws a baby; Daycare flips babies face down (not in your Home); Deep Clean costs 1 and loses all Poop, Joy and Energy', () => {
  const s = mk(); const p = me(s); p.energy = 5; p.poop = 4; p.joy = 3; p.peak = 3; assert.ok(E.apply(s, { type: 'newBaby', seat: 0 }).ok); assert.equal(p.babies.length, 2); assert.equal(p.energy, 4);
  assert.ok(E.apply(s, { type: 'daycare', seat: 0, babies: [0] }).ok); assert.equal(E.home(p).length, 1); assert.equal(p.energy, 3); E.apply(s, { type: 'daycare', seat: 0, babies: [0] }); assert.equal(E.home(p).length, 2);
  assert.ok(E.apply(s, { type: 'deepClean', seat: 0 }).ok); assert.deepEqual([p.poop, p.joy, p.energy], [0, 0, 0]); assert.equal(p.peak, 3, 'the peak Joy stays');
  p.energy = 0; assert.equal(E.apply(s, { type: 'newBaby', seat: 0 }).error, 'energy'); assert.equal(E.apply(s, { type: 'newBaby', seat: 1 }).error, 'turn');
});
test('the afternoon rolls 5 dice plus 1 for each baby at home, at most 10; Daycare babies add none; skills add fixed dice', () => {
  const s = mk(); const p = me(s); assert.equal(E.diceCount(p), 6); p.babies = Array.from({ length: 9 }, (_, i) => ({ id: i, up: true })); assert.equal(E.diceCount(p), 10); p.babies.forEach((b, i) => { if (i > 1) b.up = false; }); assert.equal(E.diceCount(p), 7);
  p.skills = ['L', 'M']; E.apply(s, { type: 'toAfternoon', seat: 0 }); assert.equal(p.dice.length, 7 + 2); assert.equal(p.dice.filter(d => d.fixed).length, 2); assert.ok(p.dice.every(d => d.f >= 1 && d.f <= 6));
});
test('rerolling any dice costs 1 Energy each time; skill dice cannot be rerolled', () => {
  const s = mk(); const p = me(s); p.energy = 2; p.skills = ['L']; E.apply(s, { type: 'toAfternoon', seat: 0 }); const fixed = p.dice.findIndex(d => d.fixed);
  assert.equal(E.apply(s, { type: 'reroll', seat: 0, dice: [fixed] }).error, 'none'); const r = E.apply(s, { type: 'reroll', seat: 0, dice: [0, 1] }); assert.ok(r.ok); assert.equal(p.energy, 1); E.apply(s, { type: 'reroll', seat: 0, dice: [2] }); assert.equal(p.energy, 0); assert.equal(E.apply(s, { type: 'reroll', seat: 0, dice: [0] }).error, 'energy');
});
test('Joy from sets of Learn, Move or Social: 2 of a kind 1, 3 -> 2, 4 -> 4, 5 -> 6 ... 10 -> 15, and you need a baby at home', () => {
  const t = D.joyTable; assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => t[n]), [1, 2, 4, 6, 8, 10, 12, 14, 15]);
  const p = { babies: [{ id: 0, up: true }], poop: 0, energy: 0 }; assert.equal(E.bestUse(p, dice(1, 1, 1, 2, 2, 3)).joy, 2 + 1);
  assert.equal(E.bestUse({ babies: [{ id: 0, up: false }], poop: 0, energy: 0 }, dice(1, 1, 1, 1)).joy, 0);
});
test('Play dice are wild and go where they pay most; Diaper removes up to 2 Poop each; Rest gives 2 Energy each', () => {
  const p = { babies: [{ id: 0, up: true }], poop: 3, energy: 0 };
  const clean = { babies: [{ id: 0, up: true }], poop: 0, energy: 10 }; assert.equal(E.bestUse(clean, dice(1, 6)).joy, 1); assert.equal(E.bestUse(clean, dice(1, 1, 6, 6)).joy, 4); // 4 Learn
  const u = E.bestUse(p, dice(4, 4, 4)); assert.equal(u.poop, 3); const r = E.bestUse({ babies: [], poop: 0, energy: 0 }, dice(5, 5)); assert.equal(r.energy, 4);
  assert.equal(E.bestUse({ babies: [], poop: 0, energy: 9 }, dice(5, 5)).energy, 1, 'Energy stops at the top of the tracker');
});
test('finishing the afternoon applies the dice, then the Night: -1 Joy per 2 Poop, +1 Poop and -1 Energy per baby at home', () => {
  const s = mk(); const p = me(s); p.energy = 3; p.poop = 5; p.joy = 4; p.peak = 4; E.apply(s, { type: 'toAfternoon', seat: 0 }); p.dice = dice(1, 1, 1, 4, 5);
  E.apply(s, { type: 'finish', seat: 0 }); // +2 Joy (3 Learn), poop 5-2=3, energy +2 -> 5; night: -1 Joy (3 poop), +1 poop, -1 energy
  assert.equal(s.phase, 'night'); assert.deepEqual([p.joy, p.poop, p.energy], [4 + 2 - 1, 3 + 1, 5 - 1]); assert.equal(p.peak, 6); assert.equal(s.summary.night.joy, -1);
});
test('Memory goals: pay the dice (Play dice fill in) and gain the Joy; the slot refills; Skills add a permanent die', () => {
  const s = mk(); const p = me(s); s.goalRow[0] = D.goals.findIndex(g => g.name === 'Play Date'); s.goalRow[1] = D.goals.findIndex(g => g.name === 'First Word'); E.apply(s, { type: 'toAfternoon', seat: 0 });
  p.dice = dice(2, 6, 1, 1, 1, 4); assert.ok(E.apply(s, { type: 'buy', seat: 0, slot: 0 }).ok); assert.equal(p.joy, 1); assert.equal(p.dice.length, 4); assert.ok(s.goalRow[0] != null && s.goalRow[0] !== D.goals.findIndex(g => g.name === 'Play Date'));
  p.dice = dice(1, 1, 1, 5); assert.ok(E.apply(s, { type: 'buy', seat: 0, slot: 1 }).ok); assert.deepEqual(p.skills, ['L']); assert.equal(p.goals.length, 2);
  p.dice = dice(1, 1, 3); s.goalRow[2] = D.goals.findIndex(g => g.name === 'Beach Day'); assert.equal(E.apply(s, { type: 'buy', seat: 0, slot: 2 }).error, 'cost');
});
test('goal costs parse from the sheet ("2M 1L" = two Move and one Learn); every goal is affordable in principle', () => {
  assert.deepEqual(E.parseCost('2M 1L'), { M: 2, L: 1 }); assert.deepEqual(E.goalCost(D.goals.find(g => g.name === 'First Steps')), { M: 3 });
  for (const g of D.goals) { const c = E.goalCost(g); assert.ok(Object.keys(c).length && Object.values(c).reduce((a, b) => a + b, 0) <= 5, g.name); }
});
test('turns pass clockwise; after the last round the highest PEAK Joy wins, ties share', () => {
  const s = mk({ settings: { bots: 1, rounds: 3 } }); s.players[1].peak = 9; s.players[0].peak = 9;
  for (let t = 0; t < 6; t++) { assert.equal(s.turn, t % 2); E.apply(s, { type: 'toAfternoon', seat: s.turn }); E.apply(s, { type: 'finish', seat: s.turn }); E.apply(s, { type: 'next', seat: s.turn }); }
  assert.equal(s.phase, 'over'); assert.ok(s.winners.every(i => s.players[i].peak === Math.max(...s.players.map(p => p.peak)))); assert.ok(s.winners.includes(0) || s.winners.includes(1));
  const t = mk({ settings: { bots: 1, rounds: 3 } }); t.players[1].peak = 99; for (let k = 0; k < 6; k++) { E.apply(t, { type: 'toAfternoon', seat: t.turn }); E.apply(t, { type: 'finish', seat: t.turn }); E.apply(t, { type: 'next', seat: t.turn }); } assert.deepEqual(t.winners, [1]);
});
test('Joy never goes below 0 and the peak only goes up', () => { const s = mk(); const p = me(s); p.poop = 10; p.energy = 1; E.apply(s, { type: 'toAfternoon', seat: 0 }); p.dice = []; E.apply(s, { type: 'finish', seat: 0 }); assert.ok(p.joy >= 0 && p.peak >= p.joy); });
test('whole bot games finish at 2, 4 and 8 players on every level, and a game of any length is fair to read', () => {
  for (const bots of [1, 3, 7]) for (const level of ['easy', 'normal', 'hard']) { const s = mk({ settings: { bots, level }, seed: 10 + bots }); B.playGame(s); assert.equal(s.phase, 'over'); assert.ok(s.winners.length >= 1); assert.ok(s.players.every(p => p.peak >= 0 && p.energy >= 0 && p.energy <= R.energyMax && p.poop >= 0)); }
});
test('settings are clamped', () => { const c = E.cleanSettings({ bots: 99, rounds: 1, level: 'x' }); assert.equal(c.bots, 7); assert.equal(c.rounds, 3); assert.equal(c.level, 'normal'); });
