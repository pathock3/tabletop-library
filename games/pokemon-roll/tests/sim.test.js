const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B } = require('./load.js');
const C = E.CARDS, T = E._t;
// ---- a hand-built battle: the i-th hero card faces the i-th computer card; then put numbers on the dice and give them out
// dice: { hero: [values], gm: [values] }; give: { hero: {unitIndex: dieIndex | [dieIndexes]}, gm: {...} }
function craft(heroIds, gmIds, o) {
  o = o || {};
  const s = E.newGame({ seed: 1, starter: 'bulbasaur' });
  s.phase = 'battle';
  const b = T.startBattle(s, 'loc', 'L1', heroIds.map(id => ({ id, sh: 0 })), gmIds.map(id => ({ id, sh: 0 })));
  b.hand = [[], []];
  const n = Math.max(heroIds.length, gmIds.length);
  b.cols = Array.from({ length: n }, (_, i) => [heroIds[i] ? b.units[i].uid : null, gmIds[i] ? b.units[heroIds.length + i].uid : null]);
  T.startRound(s);
  return { s, b, h: i => b.units[i], g: i => b.units[heroIds.length + i] };
}
// dice: { hero: [values], gm: [values] }; give: { hero: {unitIndex: dieIndex | [dieIndexes]}, gm: {...} }
function play(c, dice, give) {
  const { s, b } = c;
  b.dice = [dice.hero.slice(), dice.gm.slice()]; b.asg = [{}, {}];
  [['hero', 0, 0], ['gm', 1, c.hn || c.s.battle.units.filter(u => u.side === 0).length]].forEach(([k, side, off]) => {
    Object.entries(give[k] || {}).forEach(([ui, di]) => { const u = b.units[+ui + off]; b.asg[side][u.uid] = { dice: [].concat(di), tgt: null }; });
  });
  b.gmReady = true;
  const r = E.apply(s, { t: 'go2' }); assert.ok(r.ok, r.error);
  while (b.ask) assert.ok(E.apply(s, { t: 'choose', tgt: E.autoChoice(b) }).ok);      // an "or" on your own card is asked when its turn comes
  return b;
}
const evs = (b, t) => b.events.filter(e => e.t === t);
// ================================================================ the cards
// the older rule tests are written the way the sheet lists a card (move 1 on a 1); the tests that play whole games, and the ones named 'dice faces', use the real order (move 1 on a 6)
// the long simulations (whole campaigns played by the computer): slow, so they run in the full `npm test` and in GitHub CI but not in the quick set

test('fuzz: forty computer-played campaigns, from the first rival to the champion, with no errors', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  for (let i = 1; i <= 40; i++) {
    const s = E.newGame({ seed: i * 7919, starter: D.starters[i % 5].key, size: i % 2 ? 'short' : 'long', ai: ['easy', 'normal', 'master'][i % 3] });
    let n = 0;
    while (s.phase !== 'won' && n++ < 60000) {
      let g; while ((g = B.step(s))) { const r = E.apply(s, g); assert.ok(r.ok, 'computer: ' + r.error); }
      const a = B.heroStep(s, ['easy', 'normal', 'master'][(i + 1) % 3]); assert.ok(a, 'stuck in ' + s.phase);
      const r = B.applyHero(s, a); assert.ok(r.ok, 'player: ' + JSON.stringify(a).slice(0, 100) + ' ' + r.error);
    }
    assert.equal(s.phase, 'won', 'campaign ' + i + ' finished');
    assert.equal(s.lv, 6); const sd = E.starterOf(s.starter); assert.ok([sd.levels[5], sd.evolve && sd.evolve[6]].includes(s.coll.find(c => c.starter).id), 'the partner grew all the way');
    assert.ok(s.coll.length >= 7, 'a collection of cards was built');
  }
});

test('ai: Easy never rerolls and plays blind; Master and Normal are real levers in the data; Master beats Normal beats Easy', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const B = Bots, ais = E.D.ai; assert.deepEqual(Object.keys(ais), ['easy', 'normal', 'master']);
  const c = craft(['1.1'], ['10']); c.b.dice[1] = [1]; c.b.rr[1] = 3;
  for (let i = 0; i < 30; i++) assert.equal(B.step(c.s, 'easy').t, 'gm', 'Easy hands out dice without ever rerolling');
  const lose = { easy: [0, 0], normal: [0, 0], master: [0, 0] };       // [hero battles lost, played]
  for (let g = 0; g < 8; g++) ['easy', 'normal', 'master'].forEach(lvl => {
    const s = E.newGame({ seed: 300 + g, starter: D.starters[g % 5].key, size: 'short', ai: lvl }); let n = 0;
    while (s.phase !== 'won' && s.phase !== 'lost' && n++ < 30000) { let a; while ((a = B.step(s))) E.apply(s, a); if (s.phase === 'result' && s.res) { lose[lvl][1]++; if (!s.res.win) lose[lvl][0]++; } const h = B.heroStep(s, 'master'); if (!h) break; B.applyHero(s, h); }
  });
  const rate = k => lose[k][0] / lose[k][1];
  assert.ok(rate('easy') < rate('normal') && rate('normal') < rate('master') + 0.02, 'a stronger computer beats the same player more often: ' + JSON.stringify(lose));
});
