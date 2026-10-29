// Two people at one iPad (Duel): the rules of the table between them. No browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Duel, Run, Board, AI, Dig, Engine, DDB } = require('./load.js');
const cards = Engine.cards();

// Play a Duel with the plain policy for both seats, as two people would: each digs at the same time, each Preps by themselves.
function prep(d, id) {
  const run = d.runs[id];
  if (run.prep.step === 'pack') assert.ok(Duel.openPack(d, id));
  AI.prep(run);          // keep cards and choose the Starter Kit
  assert.equal(run.prep.step, 'kit'); assert.ok(Duel.ready(d, id));
}
function digAll(d) {
  for (let g = 0; g < 6000 && !Duel.bothOver(d); g++) {
    let moved = false;
    for (const id of Duel.IDS) { const run = d.runs[id]; if (run.dig.over) continue; if (AI.act(run)) { Run.checkOver(run); if (!run.dig.over) Run.refresh(run); Duel.finalCheck(d); moved = true; } }
    if (!moved) { for (const id of Duel.IDS) { const run = d.runs[id]; if (!run.dig.over && run.dig.board && run.dig.board.allOut && Dig.hold(run.dig)) { Run.checkOver(run); moved = true; } } if (!moved && !Duel.finalCheck(d)) throw new Error('stuck'); }
  }
  assert.ok(Duel.bothOver(d));
}

test('a Duel: two players share one Leaderboard, one Booster Deck and one Trash; the round begins when both are Ready', () => {
  const d = Duel.start(cards, { seed: 4, rounds: 2 });
  assert.equal(d.runs.p1.board, d.runs.p2.board); assert.equal(d.runs.p1.deck, d.runs.p2.deck); assert.equal(d.runs.p1.trash, d.runs.p2.trash);
  assert.deepEqual(d.board.players.map(p => p.id), ['p1', 'p2']); assert.ok(d.board.players.every(p => !p.ai), 'two people, no computer');
  const deckBefore = d.deck.length;
  assert.ok(Duel.openPack(d, 'p1')); assert.ok(Duel.openPack(d, 'p2'));
  assert.equal(d.deck.length, deckBefore - 6, 'both drew from the same deck: one player\'s cards cannot be the other\'s');
  const a = new Set(d.runs.p1.prep.offer.map(c => c.uid)); assert.ok(d.runs.p2.prep.offer.every(c => !a.has(c.uid)));
  AI.prep(d.runs.p1); assert.ok(Duel.ready(d, 'p1')); assert.equal(d.stage, 'prep', 'one Ready is not enough');
  assert.ok(!d.runs.p1.dig, 'nobody digs until both are Ready');
  AI.prep(d.runs.p2); assert.ok(Duel.ready(d, 'p2')); assert.equal(d.stage, 'dig'); assert.ok(d.runs.p1.dig && d.runs.p2.dig);
});

test('after the Digs: nobody continues until both Digs are over; the Escape Bonus is one roll for both; then Prep on your own', () => {
  const d = Duel.start(cards, { seed: 6, rounds: 3, dice: [7] });
  for (const id of Duel.IDS) { Duel.openPack(d, id); AI.prep(d.runs[id]); Duel.ready(d, id); }
  const s1 = d.runs.p1.dig; s1.over = null;
  Dig.dig(d.runs.p1.dig); Dig.bank(d.runs.p1.dig); Run.checkOver(d.runs.p1);          // p1 banks at once
  assert.ok(!Duel.bothOver(d)); assert.ok(!Duel.proceed(d, 'p1'), 'p1 has to wait for p2');
  Dig.dig(d.runs.p2.dig); Dig.bank(d.runs.p2.dig); Run.checkOver(d.runs.p2);
  assert.ok(Duel.bothOver(d)); assert.ok(Duel.proceed(d, 'p1')); assert.equal(d.stage, 'dig', 'p1 has continued: p2 has not yet');
  assert.ok(Duel.proceed(d, 'p2')); assert.equal(d.stage, 'roll'); assert.equal(d.escape, 7, 'one roll');
  assert.equal(d.runs.p1.prep.escape, 7); assert.equal(d.runs.p2.prep.escape, 7); assert.equal(d.dice.length, 0, 'the die was rolled once, not once each');
  Duel.afterRoll(d); assert.equal(d.stage, 'prep');
  assert.equal(d.runs.p1.round, 2); assert.equal(d.runs.p2.round, 2);
});

test('a BOOM skips the Escape Bonus; if both go BOOM nobody rolls', () => {
  const d = Duel.start(cards, { seed: 8, rounds: 3, dice: [5] });
  for (const id of Duel.IDS) { Duel.openPack(d, id); AI.prep(d.runs[id]); Duel.ready(d, id); }
  for (const id of Duel.IDS) { const st = d.runs[id].dig; st.heart = 1; st.mine = [{ ...cards.find(c => c.id === 'MO-01'), uid: 99000 + (id === 'p1' ? 1 : 2) }]; st.known = 0; st.dice = [1]; Dig.dig(st); Dig.roll(st); Dig.autoFace(st); Run.checkOver(d.runs[id]); assert.equal(st.over.kind, 'boom'); }
  Duel.proceed(d, 'p1'); Duel.proceed(d, 'p2');
  assert.equal(d.escape, null, 'nobody banked: no roll'); assert.equal(d.stage, 'prep'); assert.equal(d.dice.length, 1);
});

test('a whole Duel plays out for two players with the plain policy: every round, then a winner on the Leaderboard', () => {
  const d = Duel.start(cards, { seed: 3, rounds: 3 });
  for (let r = 1; r <= 3; r++) {
    for (const id of Duel.IDS) prep(d, id);
    assert.equal(d.stage, 'dig'); digAll(d);
    for (const id of Duel.IDS) assert.ok(Duel.proceed(d, id));
    Duel.afterRoll(d);
  }
  assert.ok(d.result && d.result.duel); assert.equal(d.result.winner, Board.holder(d.board)); assert.ok(['p1', 'p2', null].includes(d.result.winner));
  assert.equal(d.result.rounds.length, 3);
});
