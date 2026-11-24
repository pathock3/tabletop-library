const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B } = require('./load.js');

// helpers: put dice on the table by hand so a rule can be checked exactly
const fresh = (kind, o) => E.newGame(kind, Object.assign({ seed: 7, vs: 'cpu' }, o));

test('darts: declare 1–10, roll a d10; the roll must reach the number to hit, and a hit scores that number', () => {
  const s = fresh('darts'); assert.equal(E.apply(s, { t: 'declare', n: 11 }).ok, false); assert.equal(E.apply(s, { t: 'throw' }).ok, false, 'declare first');
  for (let i = 0; i < 40; i++) { const t = fresh('darts', { seed: i }); E.apply(t, { t: 'declare', n: 6 }); const who = t.turn; E.apply(t, { t: 'throw' }); const l = t.last; assert.equal(l.hit, l.roll >= 6); assert.equal(l.pts, l.hit ? 6 : 0); assert.equal(t.score[who], l.pts); }
});
test('darts: the lower score goes second in a round; on a tie the player with the advantage goes second', () => {
  const s = fresh('darts'); const adv = s.adv; assert.deepEqual(s.order, [E.other(adv), adv], 'a tied 0–0 start: the advantage goes second');
  s.score = [5, 2]; s.round = 2; E.apply(s, { t: 'declare', n: 1 }); // order is recomputed at the start of a round
  const t = fresh('darts', { rounds: 3 }); t.score = [3, 7]; t.round = 1; t.idx = 1; t.turn = t.order[1]; t.phase = 'declare'; E.apply(t, { t: 'declare', n: 1 }); E.apply(t, { t: 'throw' });
  assert.deepEqual(t.order, t.score[0] < t.score[1] ? [1, 0] : t.score[0] > t.score[1] ? [0, 1] : [E.other(t.adv), t.adv]);
});
test('darts: three rounds, the higher total wins; a tie plays extra rounds; a match is best of three games with the loser holding the advantage', () => {
  const s = fresh('darts', { match: 3 }); let guard = 0;
  while (s.phase !== 'gameover' && s.phase !== 'matchover' && guard++ < 200) { E.apply(s, { t: 'declare', n: 5 }); E.apply(s, { t: 'throw' }); }
  assert.ok(s.round >= 3 && s.score[0] !== s.score[1], 'ended after at least three rounds, never on a tie'); assert.equal(s.winner, s.score[0] > s.score[1] ? 0 : 1);
  if (s.phase === 'gameover') { const loser = E.other(s.winner); E.apply(s, { t: 'nextgame' }); assert.equal(s.adv, loser, 'the loser has the advantage next game'); assert.deepEqual(s.score, [0, 0]); }
  const g = fresh('darts', { goal: 21, match: 1 }); guard = 0; while (g.phase !== 'matchover' && guard++ < 400) { E.apply(g, { t: 'declare', n: 6 }); E.apply(g, { t: 'throw' }); } assert.ok(Math.max(...g.score) >= 21 && g.score[0] !== g.score[1], 'race to 21');
});

test('target practice: nine targets, 2/3 and 11/12 share a card; a total that hits a standing target may be taken', () => {
  assert.equal(D.games.tp.cards.length, 9); assert.equal(E.tpIndex(2), 0); assert.equal(E.tpIndex(3), 0); assert.equal(E.tpIndex(11), 8); assert.equal(E.tpIndex(12), 8); assert.equal(E.tpIndex(7), 4);
  const s = fresh('tp'); E.apply(s, { t: 'roll' }); const me = s.turn; s.dice = [3, 4]; assert.equal(E.apply(s, { t: 'take' }).ok, true); assert.equal(s.flipped[E.other(me)][4], true, 'the 7 is flipped'); assert.notEqual(s.turn, me, 'the turn passes');
  const t = fresh('tp'); E.apply(t, { t: 'roll' }); t.dice = [1, 1]; assert.equal(E.apply(t, { t: 'take' }).ok, true, '2 hits the 2/3 card'); const u = fresh('tp'); E.apply(u, { t: 'roll' }); u.flipped[E.other(u.turn)][4] = true; u.dice = [3, 4]; assert.equal(E.apply(u, { t: 'take' }).ok, false, 'a flipped target cannot be hit again');
});
test('target practice: keep at most one die, one re-roll a turn (two when either side has one target left), and the total is checked after the last re-roll', () => {
  const s = fresh('tp'); E.apply(s, { t: 'roll' }); assert.equal(s.left, 1); assert.equal(E.apply(s, { t: 'reroll', keep: [0, 1] }).ok, false, 'keep one die at most');
  const p = s.turn; assert.equal(E.apply(s, { t: 'reroll', keep: [0] }).ok, true); assert.notEqual(s.turn, p, 'after the one re-roll the turn is over'); assert.ok(s.last && s.last.rerolled === 1);
  const f = fresh('tp'); f.flipped[0] = f.flipped[0].map((x, i) => i < 8); E.apply(f, { t: 'roll' }); const q = f.turn === 0 ? 1 : 0; assert.equal(f.left, 2, 'one target left: two re-rolls');
  const w = fresh('tp'); w.flipped[1] = w.flipped[1].map((x, i) => i < 8); w.turn = 0; E.apply(w, { t: 'roll' }); w.dice = [5, 6]; E.apply(w, { t: 'take' }); assert.equal(w.phase, 'gameover'); assert.equal(w.winner, 0, 'the last target wins');
});

test("where's the lie: no accusation scores the claim; a lie nobody caught may be revealed for 1 more", () => {
  const s = fresh('lie'); const me = s.turn; E.apply(s, { t: 'roll' }); s.secret = 3; E.apply(s, { t: 'claim', n: 8 }); assert.equal(s.secret, 3);
  E.apply(s, { t: 'accuse', yes: false }); assert.equal(s.phase, 'brag'); E.apply(s, { t: 'brag', yes: true }); assert.equal(s.score[me], 9, '8 + 1 bonus'); assert.equal(s.last.secret, 3);
  const t = fresh('lie'); const m2 = t.turn; E.apply(t, { t: 'roll' }); t.secret = 6; E.apply(t, { t: 'claim', n: 6 }); E.apply(t, { t: 'accuse', yes: false }); assert.equal(t.phase, 'result'); assert.equal(t.score[m2], 6, 'the truth, unaccused');
});
test("where's the lie: caught — they score the size of the lie and you score nothing; accused wrongly — you score and go again", () => {
  const s = fresh('lie'); const me = s.turn, foe = E.other(me); E.apply(s, { t: 'roll' }); s.secret = 2; E.apply(s, { t: 'claim', n: 7 }); E.apply(s, { t: 'accuse', yes: true });
  assert.equal(s.score[me], 0); assert.equal(s.score[foe], 5); E.apply(s, { t: 'continue' }); assert.equal(s.turn, foe, 'their turn next');
  const t = fresh('lie'); const m2 = t.turn; E.apply(t, { t: 'roll' }); t.secret = 9; E.apply(t, { t: 'claim', n: 9 }); E.apply(t, { t: 'accuse', yes: true }); assert.equal(t.score[m2], 9); E.apply(t, { t: 'continue' }); assert.equal(t.turn, m2, 'another turn');
  const u = fresh('lie'); E.apply(u, { t: 'roll' }); u.secret = 9; E.apply(u, { t: 'claim', n: 4 }); E.apply(u, { t: 'accuse', yes: true }); assert.equal(u.score[E.other(u.turn)], 5, 'a lie that undersells is still 5 big');
});
test("where's the lie: first to 50 wins, and nobody sees the die they should not", () => {
  const s = fresh('lie'); s.score = [49, 0]; s.turn = 0; s.phase = 'roll'; E.apply(s, { t: 'roll' }); s.secret = 4; E.apply(s, { t: 'claim', n: 4 }); E.apply(s, { t: 'accuse', yes: false }); E.apply(s, { t: 'continue' }); assert.equal(s.phase, 'gameover'); assert.equal(s.winner, 0);
  const t = fresh('lie'); E.apply(t, { t: 'roll' }); assert.equal(E.viewFor(t, E.other(t.turn)).secret, null, 'the other player cannot see the die'); assert.equal(E.viewFor(t, t.turn).secret, t.secret);
});

test('battleship: two different numbers from 1 to 20, hidden from the other wizard', () => {
  const s = fresh('ship'); assert.equal(E.apply(s, { t: 'setup', seat: 0, nums: [5, 5] }).ok, false); assert.equal(E.apply(s, { t: 'setup', seat: 0, nums: [0, 4] }).ok, false); assert.equal(E.apply(s, { t: 'setup', seat: 0, nums: [4, 21] }).ok, false);
  assert.equal(E.apply(s, { t: 'setup', seat: 0, nums: [14, 3] }).ok, true); assert.deepEqual(s.targets[0], [3, 14]); assert.equal(E.apply(s, { t: 'setup', seat: 1, nums: [8, 19] }).ok, true); assert.equal(s.phase, 'choose');
  assert.equal(E.viewFor(s, 0).targets[1], null, 'the other wizard\'s numbers are hidden'); assert.deepEqual(E.viewFor(s, 0).targets[0], [3, 14]);
});
test('battleship: radar reports whether a target is within the width of the chosen die; an attack destroys an exact target; both destroyed wins', () => {
  const s = fresh('ship', { match: 1 }); E.apply(s, { t: 'setup', seat: 0, nums: [3, 14] }); E.apply(s, { t: 'setup', seat: 1, nums: [8, 19] }); s.turn = 0;
  E.apply(s, { t: 'radar' }); assert.equal(s.dice.length, 2); s.dice = [10, 1]; E.apply(s, { t: 'radarpick', pick: 0, wide: false }); assert.equal(s.log[0].yes, false, '10 ±1 misses 8 and 19'); assert.equal(s.turn, 1, 'radar uses the turn');
  s.turn = 0; E.apply(s, { t: 'radar' }); s.dice = [10, 1]; E.apply(s, { t: 'radarpick', pick: 0, wide: true }); assert.equal(s.log[1].yes, true, '10 ±3 reaches 8'); s.turn = 0;
  E.apply(s, { t: 'attack', n: 9 }); assert.equal(s.log[2].hit, false); s.turn = 0; E.apply(s, { t: 'attack', n: 8 }); assert.equal(s.log[3].hit, true); assert.equal(s.dead[1][0], true);
  s.turn = 0; E.apply(s, { t: 'radar' }); s.dice = [8, 8]; E.apply(s, { t: 'radarpick', pick: 0, wide: true }); assert.equal(s.log[4].yes, false, 'a destroyed target no longer shows on radar'); s.turn = 0; E.apply(s, { t: 'attack', n: 19 }); assert.equal(s.phase, 'matchover'); assert.equal(s.winner, 0);
});
test('battleship: a match is best of three; the loser of a game goes first in the next', () => {
  const s = fresh('ship', { match: 3 }); const first = s.first; E.apply(s, { t: 'setup', seat: 0, nums: [1, 2] }); E.apply(s, { t: 'setup', seat: 1, nums: [3, 4] }); s.turn = 0; E.apply(s, { t: 'attack', n: 3 }); s.turn = 0; E.apply(s, { t: 'attack', n: 4 });
  assert.equal(s.phase, 'gameover'); assert.equal(s.winner, 0); E.apply(s, { t: 'nextgame' }); assert.equal(s.first, 1, 'the loser starts'); assert.equal(s.phase, 'setup'); assert.equal(s.targets[0], null);
});

test('the computer: whole games between two computers of every level finish with no illegal move, for all four games', () => {
  for (const kind of ['darts', 'tp', 'lie', 'ship']) for (let i = 0; i < 24; i++) {
    const s = E.newGame(kind, { seed: i * 7919 + 3, vs: 'cpu', goal: [0, 21, 25][i % 3], rounds: [3, 4][i % 2], match: kind === 'lie' || kind === 'tp' ? 1 : [3, 1][i % 2] }); let n = 0;
    while (n++ < 9000) {
      if (s.phase === 'matchover') break; if (s.phase === 'gameover') { if ((kind === 'lie' || kind === 'tp') || s.wins.some(w => w >= E.needWins(s))) break; assert.ok(E.apply(s, { t: 'nextgame' }).ok); continue; }
      const p = E.pending(s); assert.ok(p || s.phase === 'result', kind + ' is not stuck in ' + s.phase); if (!p) { E.apply(s, { t: 'continue' }); continue; }
      const a = B.step(s, ['easy', 'normal', 'hard'][(i + p.seat) % 3], p.seat); assert.ok(a, kind + ' the computer has a move in ' + s.phase); const r = E.apply(s, a); assert.ok(r.ok, kind + ' ' + JSON.stringify(a) + ' ' + r.error);
    }
    assert.ok(n < 9000, kind + ' finished');
  }
});
test('the computer never reads the other wizard\'s numbers or an unrevealed die (it plays from its own view)', () => {
  const s = fresh('ship'); E.apply(s, { t: 'setup', seat: 0, nums: [6, 12] }); const v = E.viewFor(s, 1); assert.equal(v.targets[0], null); const a = B.step(s, 'hard'); assert.equal(a.t, 'setup', 'the computer hides its own numbers when the human has hidden theirs');
  const l = fresh('lie'); l.turn = 0; l.phase = 'roll'; E.apply(l, { t: 'roll' }); E.apply(l, { t: 'claim', n: 9 }); assert.equal(E.viewFor(l, 1).secret, null);
});
