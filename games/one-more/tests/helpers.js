const { GAME_DATA, Engine } = require('./load');

const G = GAME_DATA.deck.gems, B = GAME_DATA.deck.booms;
const gems = Array.from({ length: G }, (_, i) => i);
const booms = Array.from({ length: B }, (_, i) => G + i);

// A game with a known draw pile. 'seq' is what will be drawn, in order: 'g' = the next unused gem, 'b' = the next unused boom.
// Everything else sits underneath in a fixed order.
function rigged(seq, players = 2, data) {
  const s = Engine.createGame({ players, seed: 1, data });
  const gi = gems.slice(), bi = booms.slice(), top = [];
  for (const c of seq) top.push(c === 'g' ? gi.shift() : bi.shift());
  s.draw = gi.concat(bi, top.reverse());           // last element = top of the pile
  return s;
}
// Every card is in exactly one place.
function assertPartition(s, assert) {
  const all = s.draw.concat(s.boomPile, s.table, s.gone || [], ...s.safe).sort((a, b) => a - b);
  assert.equal(all.length, G + B, 'card count');
  all.forEach((c, i) => assert.equal(c, i, 'card ' + i + ' is in exactly one place'));
}
const drawN = (s, n) => { const out = []; for (let i = 0; i < n; i++) out.push(Engine.draw(s)); return out; };

module.exports = { G, B, gems, booms, rigged, assertPartition, drawN };
