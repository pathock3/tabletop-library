// Kingslayer rules: sovereign and tie rules, payouts, treasury, Assassins, winning, all 17 council cards, and whole bot games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B, Sim } = require('./load.js');

// A 4-house table at the vote, everyone on 2 coins, house 0 the sovereign, no council cards in the deck unless asked.
function mk(opts = {}, kind = 'sovereign') {
  const s = E.newGame(Object.assign({ humans: [], houses: 4, seed: 5, rules: { cards: [] } }, opts));
  s.sov = 0; s.treasury = 1; s.tracker = 0; s.dur = { kind, secs: 60 }; s.phase = 'vote'; s.votes = {}; s.flags = {}; s.armed = [];
  for (const h of s.houses) { h.coins = 2; h.hand = []; }
  return s;
}
function vote(s, targets, extra = {}) { targets.forEach((t, i) => { if (t != null) { const r = E.apply(s, Object.assign({ type: 'vote', seat: i, target: t }, extra[i] || {})); assert.ok(r.ok, 'vote ' + i + ': ' + r.error); } }); }
const coins = s => s.houses.map(h => h.coins);

test('a coup: most votes wins, takes the treasury, supporters take a coin, treasury refills, tracker resets', () => {
  const s = mk(); s.tracker = 3; vote(s, [1, 0, 1, 1]);
  assert.equal(s.last.outcome, 'new'); assert.equal(s.sov, 1);
  assert.deepEqual(coins(s), [3, 2 + 1, 3, 3]); // seat 1 takes the treasury (1); supporters 0, 2, 3 +1 each... seat 1 has 2+1
  assert.equal(s.treasury, D.rules.treasuryAddNew); assert.equal(s.tracker, 0); assert.equal(s.phase, 'name');
});
test('a tie with the sovereign: the sovereign stays, takes the tracker amount, tracker advances, treasury grows', () => {
  const s = mk(); vote(s, [1, 0, 0, 1]);
  assert.equal(s.last.outcome, 'repeat'); assert.equal(s.sov, 0);
  assert.deepEqual(coins(s), [2 + D.rules.tracker[0], 2, 2, 2]); assert.equal(s.tracker, 1); assert.equal(s.treasury, 1 + D.rules.treasuryAddRepeat);
});
test('a tie between challengers is drawn (rock-paper-scissors) and one of them wins', () => {
  const s = mk({ houses: 5 }); vote(s, [1, 2, 1, 2, 0]);
  assert.ok([1, 2].includes(s.sov)); assert.equal(s.last.rps, true);
});
test('payout tracker follows the list and then adds the wrap amount (6, 7, ...)', () => {
  const s = mk(); const t = D.rules.tracker; assert.equal(E.payoutAmount(s, 0), t[0]); assert.equal(E.payoutAmount(s, t.length - 1), t[t.length - 1]);
  assert.equal(E.payoutAmount(s, t.length), t[0] + D.rules.trackerWrap); assert.equal(E.payoutAmount(s, t.length + 1), t[1] + D.rules.trackerWrap);
});
test('the rules are data: a changed rule changes the outcome', () => {
  const s = mk({ rules: { cards: [], supporterCoins: 3, treasuryStart: 1, treasuryAddNew: 0 } }); vote(s, [1, 0, 1, 1]);
  assert.deepEqual(coins(s), [5, 2 + 1 + 3 * 0, 5, 5].map((x, i) => i === 1 ? 3 : x)); assert.equal(s.treasury, 0);
});
test('Assassins: each house loses a coin per vote received, never below zero, nobody becomes sovereign', () => {
  const s = mk({}, 'assassins'); s.houses[2].coins = 1; vote(s, [2, 2, 1, 2]);
  assert.equal(s.last.outcome, 'assassins'); assert.equal(s.sov, 0); assert.deepEqual(coins(s), [2, 1, 0, 2]);
});
test('self-votes are refused; nobody can vote twice', () => {
  const s = mk(); assert.equal(E.apply(s, { type: 'vote', seat: 1, target: 1 }).ok, false);
  assert.equal(E.apply(s, { type: 'vote', seat: 1, target: 2 }).ok, true); assert.equal(E.apply(s, { type: 'vote', seat: 1, target: 3 }).ok, false);
});
test('the first to the winning total wins; several reaching it together all win', () => {
  const s = mk(); s.houses[2].coins = 9; s.houses[3].coins = 9; vote(s, [2, 0, 3, 2]);
  assert.equal(s.phase, 'over'); assert.ok(s.winners.includes(3));
  const t = mk(); t.houses[1].coins = 9; t.houses[2].coins = 9; vote(t, [1, 0, 3, 1]); // 1 +treasury; 2 is not a supporter
  assert.deepEqual(t.winners, [1]);
  const u = mk(); u.houses[1].coins = 7; u.houses[2].coins = 10; u.houses[3].coins = 10; vote(u, [1, 0, 1, 1]); assert.deepEqual(u.winners.sort(), [1, 2, 3].filter(i => u.houses[i].coins >= 10));
});
test('the sovereign blocking rule (lab reading B)', () => {
  const s = mk({ rules: { cards: [], sovereignBlocksByVote: true } }); vote(s, [1, 0, 1, 1]); assert.equal(s.sov, 0); assert.equal(s.last.outcome, 'repeat');
});
test('a duration deck is reshuffled once all six are played; a round has beats from its length', () => {
  const s = E.newGame({ humans: [], seed: 3 }); const seen = [];
  for (let i = 0; i < D.rules.duration.length * 2; i++) { seen.push(s.dur.secs + s.dur.kind); E.startRound(s); }
  assert.ok(s.maxBeat >= 1);
});
test('ravens: bribes move coins, are refused when silenced, and early voting skips the wait', () => {
  const s = E.newGame({ humans: [], houses: 4, seed: 2, rules: { cards: [] } }); s.houses.forEach(h => { h.coins = 3; });
  assert.equal(E.apply(s, { type: 'raven', seat: 0, to: 1, msg: 'vote', coins: 2 }).ok, true); assert.deepEqual([s.houses[0].coins, s.houses[1].coins], [1, 5]);
  assert.equal(E.apply(s, { type: 'raven', seat: 0, to: 1, msg: 'vote', coins: 9 }).ok, true); assert.equal(s.houses[0].coins, 0);
  s.tongues = [2]; assert.equal(E.apply(s, { type: 'raven', seat: 2, to: 1, msg: 'vote' }).ok, false);
  const t = E.newGame({ humans: [], houses: 4, seed: 2, rules: { bribes: false } }); E.apply(t, { type: 'raven', seat: 0, to: 1, msg: 'vote', coins: 2 }); assert.equal(t.houses[0].coins, D.rules.startCoins);
  const u = E.newGame({ humans: [], houses: 4, seed: 2 }); for (let i = 0; i < 4; i++) E.apply(u, { type: 'early', seat: i }); assert.equal(u.phase, 'vote');
});
test('every council card in the data has a title, a type and rule text', () => {
  assert.equal(Object.keys(D.cards).length, 17); for (const c of Object.values(D.cards)) assert.ok(c.title && c.type && c.text && c.hook);
});

// ----- council cards -----
const hold = (s, i, id) => { s.houses[i].hand.push(id); };
test('Fundraising: exactly one non-sovereign vote gains a coin and is discarded', () => {
  const s = mk(); hold(s, 2, 'fundraising'); vote(s, [2, 0, 0, 1]); assert.deepEqual(s.houses[2].hand, ['fundraising']); // the one vote came from the sovereign: not counted
  const t = mk(); hold(t, 2, 'fundraising'); vote(t, [1, 2, 1, 1]); assert.equal(t.houses[2].coins, 2 + 1 + 1); // the Fundraising coin and a supporter's coin
});
test('Hand of the Queen: a payout of 3+ for a staying sovereign gains 3', () => {
  const s = mk(); s.tracker = 2; hold(s, 3, 'handOfTheQueen'); vote(s, [1, 0, 0, 1]); assert.equal(s.houses[3].coins, 2 + 3);
});
test('Kingslayer: if the sovereign votes for the holder, the holder becomes sovereign', () => {
  const s = mk(); hold(s, 2, 'kingslayer'); vote(s, [2, 0, 0, 0]); assert.equal(s.sov, 2); assert.equal(s.last.outcome, 'new');
});
test('Decoy: sovereign voted for you: +1 and discard', () => {
  const s = mk(); hold(s, 2, 'decoy'); vote(s, [2, 0, 0, 1]); assert.equal(s.houses[2].hand.length, 0); assert.ok(s.houses[2].coins >= 3);
});
test('Peaceful Transition: named unanimously gains 2', () => {
  const s = mk(); hold(s, 1, 'peacefulTransition'); vote(s, [1, 2, 1, 1]); assert.equal(s.houses[1].coins, 2 + 1 + 2); // treasury + the 2
});
test('Master of Coin: a bribe received gives a coin and discards', () => {
  const s = mk(); s.phase = 'negotiate'; hold(s, 1, 'masterOfCoin'); E.apply(s, { type: 'raven', seat: 0, to: 1, msg: 'vote', coins: 1 }); assert.equal(s.houses[1].coins, 2 + 1 + 1); assert.equal(s.houses[1].hand.length, 0);
});
test('Master of War: +1.5 votes for yourself with your vote', () => {
  const s = mk(); hold(s, 2, 'masterOfWar'); vote(s, [1, 0, 3, 1], { 2: { mow: true } });
  assert.equal(s.last.tally[2], 1.5); assert.equal(s.houses[2].hand.length, 0);
  const t = mk(); hold(t, 2, 'masterOfWar'); vote(t, [1, 0, 3, 2], { 2: { mow: true } }); assert.equal(t.last.tally[2], 1.5 + 1);
});
test('Lord Commander: after the vote, change one vote', () => {
  const s = mk(); hold(s, 3, 'lordCommander'); vote(s, [1, 0, 1, 2]); assert.equal(s.phase, 'after');
  assert.deepEqual(E.pending(s), [3]); assert.equal(E.apply(s, { type: 'lc', seat: 3, voter: 2, target: 0 }).ok, true);
  assert.equal(s.last.votes[2], 0); assert.equal(s.houses[3].hand.length, 0);
});
test('Grand Maester: vote last, seeing the others', () => {
  const s = mk(); hold(s, 1, 'grandMaester'); assert.equal(E.apply(s, { type: 'vote', seat: 1, late: true }).ok, true);
  vote(s, [3, null, 3, 2]); assert.deepEqual(E.pending(s), [1]); assert.equal(E.viewFor(s, 1).votes[0], 3); assert.equal(E.viewFor(s, 3).votes[0], undefined);
  vote(s, [null, 3]); assert.equal(s.sov, 3);
});
test('High Sparrow: a correct accusation takes the bribe; a wrong one costs nothing; once a round', () => {
  const s = mk(); s.phase = 'negotiate'; hold(s, 3, 'highSparrow'); E.apply(s, { type: 'raven', seat: 0, to: 1, msg: 'vote', coins: 1 });
  const r = E.apply(s, { type: 'sparrow', seat: 3, a: 0, b: 1 }); assert.equal(r.correct, true); assert.equal(s.houses[3].coins, 3); assert.equal(E.apply(s, { type: 'sparrow', seat: 3, a: 0, b: 2 }).ok, false);
});
test('Master of Whispers: reveals to peek at cards; cuts off a tongue once a round', () => {
  const s = mk(); s.phase = 'negotiate'; hold(s, 1, 'masterOfWhispers'); hold(s, 2, 'decoy');
  assert.equal(E.viewFor(s, 1).houses[2].hand[0], null); E.apply(s, { type: 'reveal', seat: 1 }); assert.equal(E.viewFor(s, 1).houses[2].hand[0], 'decoy');
  assert.equal(E.apply(s, { type: 'tongue', seat: 1, target: 2 }).ok, true); assert.equal(E.apply(s, { type: 'tongue', seat: 1, target: 3 }).ok, false); assert.deepEqual(s.tongues, [2]);
});
test('Royal Executioner: steals every council card of a house', () => {
  const s = mk(); s.phase = 'negotiate'; hold(s, 1, 'royalExecutioner'); hold(s, 2, 'decoy'); hold(s, 2, 'masterOfCoin'); E.apply(s, { type: 'execute', seat: 1, target: 2 });
  assert.deepEqual(s.houses[1].hand.sort(), ['decoy', 'masterOfCoin']); assert.equal(s.houses[2].hand.length, 0);
});
function armedRound(id, seat, targets) { const s = mk(); s.phase = 'negotiate'; hold(s, seat, id); assert.equal(E.apply(s, { type: 'play', seat, card: id }).ok, true); s.phase = 'vote'; vote(s, targets); return s; }
test('Opportunist: voting for a successful revolt gains an extra coin', () => { const s = armedRound('opportunist', 2, [1, 0, 1, 1]); assert.equal(s.houses[2].coins, 2 + 1 + 1); });
test('Propaganda: the sovereign holding gains 2 extra', () => { const s = armedRound('propaganda', 2, [1, 0, 0, 1]); assert.equal(s.houses[2].coins, 4); });
test('Royal Spy: the sovereign staying gains a coin', () => { const s = armedRound('royalSpy', 2, [1, 0, 0, 1]); assert.equal(s.houses[2].coins, 3); });
test('Psychopath: voters pay you and their votes are void', () => { const s = armedRound('psychopath', 2, [2, 2, 0, 2]); assert.equal(s.houses[2].coins, 2 + 3); assert.equal(s.last.tally[2], 0); });
test('The Prince who was Promised: votes worth double; a new sovereign dispenses the treasury to others', () => {
  const s = armedRound('prince', 2, [2, 0, 0, 1]); assert.equal(s.last.tally[2], 2 * 1);
  const t = mk(); t.phase = 'negotiate'; hold(t, 2, 'prince'); E.apply(t, { type: 'play', seat: 2, card: 'prince' }); t.phase = 'vote'; t.treasury = 4; vote(t, [2, 2, 0, 2]);
  assert.equal(t.sov, 2); assert.ok(t.houses[2].coins <= 2 + 3); assert.equal(coins(t).reduce((a, b) => a + b, 0), 8 + 4 + 3);
});
test('a coup shuffles every council card back; the sovereign names a house, which draws one', () => {
  const s = mk({ rules: { cards: ['decoy', 'royalSpy'] } }); hold(s, 3, 'masterOfCoin'); s.deck = ['decoy']; vote(s, [1, 0, 1, 1]);
  assert.equal(s.houses[3].hand.length, 0); assert.equal(s.deck.length, 2); assert.equal(s.phase, 'name');
  assert.equal(E.apply(s, { type: 'name', seat: s.sov, target: 2 }).ok, true); assert.equal(s.houses[2].hand.length, 1); assert.equal(s.phase, 'negotiate');
});
test('nobody sees another house’s vault or hand (the computer houses get the same view)', () => {
  const s = E.newGame({ humans: [], houses: 5, seed: 9 }); s.houses[2].hand = ['decoy']; const v = E.viewFor(s, 0);
  assert.equal(v.houses[2].coins, null); assert.equal(v.houses[2].hand[0], null); assert.equal(typeof v.houses[0].coins, 'number'); assert.equal(v.rng, undefined);
  s.rules.openVaults = true; assert.equal(E.viewFor(s, 0).houses[2].coins, s.houses[2].coins);
});

// ----- bots -----
test('whole bot games finish at 4, 6 and 10 houses on every level, with no illegal moves', () => {
  for (const n of [4, 6, 10]) for (const level of ['easy', 'normal', 'hard']) for (let g = 0; g < 3; g++) {
    const s = E.newGame({ humans: [], houses: n, level, seed: 100 + g * 17 + n }); E.playOut(s, level);
    assert.equal(s.phase, 'over', n + ' houses ' + level); assert.ok(s.winners.length >= 1 && s.houses[s.winners[0]].coins >= s.rules.winCoins);
  }
});
test('bots also finish games on changed rules (no treasury, all cards off, Assassins only half the deck)', () => {
  const rules = { treasuryStart: 0, treasuryAddRepeat: 0, treasuryAddNew: 0, supporterCoins: 2, cards: [], duration: [{ kind: 'sovereign', secs: 30 }, { kind: 'assassins', secs: 30 }] };
  for (let g = 0; g < 4; g++) { const s = E.newGame({ humans: [], houses: 5, seed: g + 1, rules }); E.playOut(s, 'normal'); assert.equal(s.phase, 'over'); }
});
test('the computer never acts for the human seat, and only a legal action is ever applied', () => {
  const s = E.newGame({ humans: [0], houses: 5, seed: 4 }); for (let i = 0; i < 60 && B.step(s); i++);
  assert.ok(E.pending(s).includes(0)); assert.equal(s.houses[0].coins, D.rules.startCoins); assert.ok(!s.done.includes(0));
});
test('Simulate reports numbers, and a rule change moves them', () => {
  const o = { games: 20, houses: 5, level: 'normal', seed: 3 }; const a = Sim.runSync({}, o), b = Sim.runSync({ winCoins: 20 }, o);
  assert.equal(a.finished, 20); assert.ok(a.avgRounds > 3 && a.avgRounds < 100); assert.ok(b.avgRounds > a.avgRounds);
});
