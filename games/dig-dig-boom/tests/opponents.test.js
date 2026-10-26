// You against Easy, Medium and Hard at one table: one Leaderboard, four players, each opponent with its own seat, level and speed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { Run, AI, Basic, Match, Board, Engine, DDB } = require('./load.js');
const cards = Engine.cards();
const bots = DDB.ai.opponents;

function playRound(m) {
  const me = Match.human(m); let guard = 0;
  while (!me.dig.over && guard++ < 4000) {
    const st = me.dig, before = st.digs;
    if (!AI.act(me)) { if (Match.finalCheck(m)) continue; if (me.dig.board && me.dig.board.allOut && Dig.hold(me.dig)) { Run.checkOver(me); continue; } if (!Match.botIds(m).some(id => Match.aiStep(m, id))) throw new Error('stuck'); continue; }
    Run.checkOver(me); Match.finalCheck(m);
    if (st.digs > before && !me.dig.over) for (const id of Match.botIds(m)) Match.aiStep(m, id);
  }
  assert.ok(me.dig.over);
}
function prepHuman(m) {
  const me = Match.human(m);
  if (me.prep.step === 'escape') Match.rollEscape(m);
  assert.ok(Match.openPack(m)); AI.prep(me); assert.ok(Match.beginRound(m));
}

test('the opponents are data: Easy, Medium and Hard, each with a level that exists, a colour of its own, and a speed (the harder, the faster — speed is the Leaderboard tiebreaker)', () => {
  assert.deepEqual(bots.map(b => b.name), ['Easy AI', 'Medium AI', 'Hard AI']);
  for (const b of bots) assert.ok(DDB.ai.levels[b.level] !== undefined, b.level);
  assert.equal(new Set([DDB.table.playerColors[0], ...bots.map(b => b.color)]).size, 4, 'four different colours');
  assert.ok(bots[0].speed > bots[1].speed && bots[1].speed > bots[2].speed, 'Easy is slowest, Hard fastest');
});

test('a Match against all three: four players on one Leaderboard, a seat and a brain for each, and a whole run plays out', () => {
  const m = Match.start(cards, { seed: 11, rounds: 3, bots });
  assert.deepEqual(m.board.players.map(p => p.id), ['me', 'easy', 'medium', 'hard']);
  assert.deepEqual(m.board.players.map(p => p.name), ['You', 'Easy AI', 'Medium AI', 'Hard AI']);
  assert.equal(Match.brainOf(m, 'easy'), Basic, 'Easy plays by rules of thumb');
  assert.notEqual(Match.brainOf(m, 'hard'), Basic); assert.notEqual(Match.brainOf(m, 'hard'), Match.brainOf(m, 'medium'), 'each level has its own brain');
  for (let r = 1; r <= 3; r++) {
    prepHuman(m);
    for (const id of Match.botIds(m)) assert.equal(m.runs[id].phase, 'dig', id + ' began the round with you');
    playRound(m); assert.ok(Match.finishRound(m));
    for (const id of Match.botIds(m)) assert.ok(m.runs[id].dig.over, id + ' has finished its Dig when you go on');
  }
  assert.ok(m.result, 'the run has a result'); assert.equal(m.result.rounds.length, 3);
  assert.deepEqual(Object.keys(m.result.rounds[0].bots).sort(), ['easy', 'hard', 'medium']);
  assert.ok(['me', 'easy', 'medium', 'hard', null].includes(m.result.winner));
  const ids = new Set(); for (const r of Object.values(m.runs)) for (const c of r.owned) { assert.ok(!ids.has(c.uid), 'no card is owned twice'); ids.add(c.uid); }
});

test('a Match with three opponents can be saved and loaded half way', () => {
  const m = Match.start(cards, { seed: 5, rounds: 3, bots });
  prepHuman(m); playRound(m); Match.finishRound(m);
  const back = Match.load(cards, JSON.parse(JSON.stringify(Match.save(m))));
  assert.deepEqual(Match.botIds(back), ['easy', 'medium', 'hard']);
  assert.deepEqual(back.board.players.map(p => p.level || null), [null, 'easy', 'medium', 'hard']);
  assert.equal(Match.brainOf(back, 'hard'), Match.brainOf(m, 'hard'));
  prepHuman(back); playRound(back); assert.ok(Match.finishRound(back));
});

test('who reaches a number first takes the better spot: the faster opponent beats a slower one on the same number', () => {
  const b = Board.create([{ id: 'me', name: 'You' }, { id: 'easy', name: 'Easy' }, { id: 'hard', name: 'Hard' }]);
  Board.track(b, 'hard', 4); Board.track(b, 'easy', 4);                       // Hard gets there first
  Board.lockIn(b, 'easy', 4); Board.lockIn(b, 'hard', 4);
  assert.equal(Board.marker(b, 'hard', 'best').rank < Board.marker(b, 'easy', 'best').rank, true);
  assert.equal(Board.holder(b), 'hard');
});
