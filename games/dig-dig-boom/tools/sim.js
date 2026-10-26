// Headless matches for measuring the AI: two brains play the same Match, seats swapped on every other seed.
//   node games/dig-dig-boom/tools/sim.js            (a quick baseline: the shipped AI against itself)
// A brain is { act(run), prep(run) } — the same shape as the AI in index.html. `me` and `ai` are the two seats of a Match.
const G = require('../tests/load.js');
const { Dig, Run, Match, Engine, DDB } = G;
const cards = Engine.cards();          // (v2.7.1: the cards are built into the game)

// One match. brains = { me, ai }. Returns { winner: 'me'|'ai'|null, rounds: [{ me, ai }] } (the history of each seat).
function playMatch(brains, seed, rounds, onRound) {
  const m = Match.start(cards, { seed, rounds }); m.brain = brains.ai;
  const me = Match.human(m), ai = Match.bot(m);
  for (let r = 1; r <= rounds; r++) {
    if (me.prep.step === 'escape') Match.rollEscape(m);
    Match.openPack(m); brains.me.prep(me); Match.beginRound(m);
    let guard = 0;
    while (!me.dig.over && guard++ < 1500) {
      const st = me.dig, before = st.digs;
      if (!brains.me.act(me)) { if (Match.finalCheck(m)) continue; if (me.dig.board && me.dig.board.allOut && Dig.hold(me.dig)) { Run.checkOver(me); continue; } if (!Match.aiStep(m)) throw new Error('stuck'); continue; }
      Run.checkOver(me); Match.finalCheck(m);
      if (st.digs > before && !me.dig.over) Match.aiStep(m);
    }
    if (!me.dig.over) return { stalled: true, m };           // e.g. Echo and Rewind Tape loop for ever in the final round, where nobody can bank
    try { Match.finishRound(m); } catch (e) { return { stalled: true, m }; }
    if (onRound) onRound(m, r);
  }
  return { winner: m.result.winner, rounds: me.history.map((h, i) => ({ me: h, ai: ai.history[i] })), m };
}

// n matches of A against B; every seed is played twice with the seats swapped. Returns win rates for A.
function tournament(A, B, { n = 200, rounds = 4, seed0 = 1, quiet = false } = {}) {
  let a = 0, b = 0, tie = 0, stalls = 0; const stat = { A: mk(), B: mk() };
  function mk() { return { digs: 0, boom: 0, surv: 0, gems: 0, finalSurv: 0, finals: 0 }; }
  const add = (s, h, last) => { s.digs++; if (h.kind === 'boom') s.boom++; s.surv += h.survived; s.gems += h.geodes + h.monsters; if (last) { s.finals++; s.finalSurv += h.survived; } };
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i, swap = i % 2 === 1;
    const r = playMatch(swap ? { me: B, ai: A } : { me: A, ai: B }, seed, rounds);
    if (r.stalled) { stalls++; continue; }
    const aSeat = swap ? 'ai' : 'me', bSeat = swap ? 'me' : 'ai';
    if (r.winner === aSeat) a++; else if (r.winner === bSeat) b++; else tie++;
    r.rounds.forEach((x, k) => { add(stat.A, x[aSeat], k === rounds - 1); add(stat.B, x[bSeat], k === rounds - 1); });
  }
  const f = s => ({ boomRate: +(s.boom / s.digs).toFixed(3), survived: +(s.surv / s.digs).toFixed(2), gems: +(s.gems / s.digs).toFixed(1), finalRoundSurvived: +(s.finalSurv / Math.max(1, s.finals)).toFixed(2) });
  const res = { n, A: a, B: b, tie, stalls, aRate: +((a + tie / 2) / Math.max(1, n - stalls)).toFixed(3), statsA: f(stat.A), statsB: f(stat.B) };
  if (!quiet) console.log(JSON.stringify(res));
  return res;
}

module.exports = { G, cards, playMatch, tournament };

if (require.main === module) {
  const t = Date.now();
  tournament(G.Basic, G.Basic, { n: 400 });
  console.log(((Date.now() - t) / 1000).toFixed(1) + ' s');
}
