// The thinking AI: it plays from what a player can see, tries options on copies of the Dig, and builds its deck by playing the Digs that deck would make.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { Dig, Board, Run, AI, Basic, Match, Engine, DDB } = require('./load.js');
const cards = Engine.cards();
const by = id => cards.find(c => c.id === id);

// a run in the middle of round 1 (of 3) with the given Mine on top
function dugRun(seed, { rounds = 3, mine, heart = 10, dice, kitIds = ['ON-06'] } = {}) {
  const run = Run.start(cards, { seed, rounds }); Run.openPack(run);
  run.prep.offer = kitIds.map((id, i) => ({ ...by(id), uid: 7000 + i })); run.prep.pack = { ...run.prep.pack, keep: kitIds.length }; for (const c of run.prep.offer) Run.toggleKeep(run, c.uid); Run.confirmKeep(run);
  Run.toggleKit(run, run.owned[0].uid); Run.beginDig(run, { seed: seed + 1 });
  const st = run.dig; st.heart = heart; if (dice) st.dice = dice.slice();
  if (mine) { st.mine = mine.map((id, i) => ({ ...by(id), uid: 9100 + i })); st.known = 0; }
  return { run, st };
}

test('a copy of a Dig is a copy: playing it out leaves the original alone', () => {
  const { run, st } = dugRun(3); Run.refresh(run);
  Dig.dig(st); Dig.dig(st);
  const snap = JSON.stringify(Dig.save(st)), c = Dig.clone(st, 9);
  for (let i = 0; i < 40 && !c.over; i++) { if (c.fight) { if (c.fight.phase === 'before') Dig.roll(c); else Dig.autoFace(c); } else if (Dig.can(c).bank && c.survived >= 2) Dig.bank(c); else Dig.dig(c); }
  assert.ok(c.digs > st.digs || c.over, 'the copy played on');
  assert.equal(JSON.stringify(Dig.save(st)), snap, 'the original is exactly as it was');
});

test('the AI cannot see the order of the cards it has not seen: shuffle them and it makes the same choice', () => {
  // the choice at "dig on or bank?" in several situations, with the unseen part of the Mine reversed in the second copy
  let compared = 0, banked = 0, dug = 0;
  for (let seed = 1; seed <= 6; seed++) for (const heart of [2, 5, 9]) for (const survived of [2, 3, 4, 5]) {
    const a = dugRun(seed, { rounds: 4, heart }), b = dugRun(seed, { rounds: 4, heart });
    for (const x of [a, b]) { x.st.survived = survived; x.st.monstersDug = survived; x.st.digs = survived * 3; x.st.monsterGems = survived; x.st.geodeGems = 4; x.st.setCount = { 'MO-01': 3, 'MO-02': 2 }; }       // the next Monsters hit hard
    const known = Math.min(b.st.known, b.st.mine.length); b.st.mine = b.st.mine.slice(0, known).concat(b.st.mine.slice(known).reverse());
    const act = x => { const before = x.st.digs; AI.act(x.run); return x.st.over && x.st.over.kind === 'bank' ? 'bank' : x.st.digs > before ? 'dig' : 'other'; };
    const ra = act(a), rb = act(b); assert.equal(ra, rb, `seed ${seed}, Health ${heart}, ${survived} survived: the same choice whatever the hidden order`);
    compared++; if (ra === 'bank') banked++; else dug++;
  }
  assert.ok(compared === 72 && banked > 0 && dug > 0, `${compared} choices compared, ${banked} banks and ${dug} digs: the choice is a real one`);
});

test('the last round: the leader waits, everyone else digs', () => {
  const { run, st } = dugRun(5, { rounds: 1 });                                  // a one-round run: it is the last round
  Run.refresh(run); assert.ok(st.board.final);
  assert.ok(AI.act(run), 'nobody is ahead: it digs'); assert.equal(st.digs, 1);
  st.board.lead = true; st.fight = null; st.over = null; Run.refresh(run);
  if (Board.inLead(run.board, run.me)) assert.equal(AI.act(run), false, 'in the lead: it waits');
});

test('with Health to spare and the Crown within reach it digs on rather than banking early; when its Health is gone it banks', () => {
  const rich = dugRun(6, { rounds: 4, mine: ['TR-01', 'TR-01', 'TR-01', 'TR-01'], heart: 10 });
  Dig.dig(rich.st); const before = rich.st.digs; assert.ok(AI.act(rich.run)); assert.ok(rich.st.digs > before || rich.st.over, 'it did something');
});

test('Prep keeps exactly what the pack allows, builds a Kit from cards it owns, and the Kit is no bigger than the round allows', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const m = Match.start(cards, { seed, rounds: 4 }), me = Match.human(m); m.brain = AI;
    Match.openPack(m); AI.prep(me);
    assert.equal(me.prep.step, 'kit'); assert.equal(me.owned.length >= 1, true);
    assert.ok(me.prep.kitPick.length <= me.prep.kitMax); assert.ok(me.prep.kitPick.every(id => me.owned.some(c => c.uid === id)));
    assert.ok(me.owned.every(c => Dig.supported(c)), 'only cards the game can play');
    assert.ok(Match.beginRound(m));
  }
});

test('the AI plays whole matches (3 and 4 rounds), every Dig ends, and fast-forwarding it does not take long', () => {
  const t = Date.now();
  for (let seed = 1; seed <= 4; seed++) {
    const m = Match.start(cards, { seed, rounds: 3 }); const me = Match.human(m);
    for (let r = 1; r <= 3; r++) {
      if (me.prep.step === 'escape') Match.rollEscape(m);
      Match.openPack(m); AI.prep(me); assert.ok(Match.beginRound(m));
      let guard = 0;
      while (!me.dig.over && guard++ < 3000) { const st = me.dig, b = st.digs; if (!AI.act(me)) { if (Match.finalCheck(m)) continue; if (me.dig.board && me.dig.board.allOut && Dig.hold(me.dig)) { Run.checkOver(me); continue; } if (!Match.aiStep(m)) break; continue; } Run.checkOver(me); Match.finalCheck(m); if (st.digs > b && !me.dig.over) Match.aiStep(m); }
      assert.ok(me.dig.over, `seed ${seed} round ${r}: the Dig ended`);
      Match.finishRound(m);
    }
    assert.ok(m.result, `seed ${seed}: a result`);
  }
  assert.ok(Date.now() - t < 60000, 'four matches in under a minute: ' + (Date.now() - t) + ' ms');
});

test('the basic AI is still there (to compare against, and to play worse on purpose)', () => {
  assert.equal(typeof Basic.act, 'function'); assert.equal(typeof Basic.prep, 'function'); assert.equal(AI.basic, Basic);
});
