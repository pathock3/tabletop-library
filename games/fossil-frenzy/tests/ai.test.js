// The perfect opponent and the abilities that make the easier ones easier (see docs/AI.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA, Engine, Bots } = require('./load');
const { game, position, lateGame } = require('./helpers');

const EXPERT = GAME_DATA.ai.profiles.expert;
const LEVELS = GAME_DATA.campaign.levels.map(l => l.ai);
const BLIND = { ...EXPERT, valueSense: 0, leadSense: 0, endSense: 0, setsSense: 0 };
const util = (w, kind, value) => { const p = w.plans.find(x => x.kind === kind && (value === undefined || x.value === value)); return p ? p.u : -Infinity; };
const best = w => w.plans[0];
const pairOf = v => [{ tid: 20, value: v, pub: true }, { tid: 21, value: v, pub: true }];

// ---------------------------------------------------------------- the perfect player's judgement
test('perfect AI: early in the game banking is the default move — it banks a good set — but a low set may not be worth the turn', () => {
  for (const v of [5, 7, 9]) assert.equal(best(position({ held: [[v], []] }).weigh()).kind, 'bank', `holding a ${v}`);
  assert.equal(best(position({ held: [[2], []] }).weigh()).kind, 'explore', 'a 2 is not worth a turn');
});

test('perfect AI: as the game nears its end it banks — and banks the most valuable set first', () => {
  const w = position({ matched: lateGame([[7], [6], [9]]), held: [[7, 3], []], points: [10, 10] }).weigh();
  assert.equal(best(w).kind, 'bank');
  assert.equal(best(w).value, 7);
});

test('perfect AI: a set\'s worth to it follows its number — a public pair of 9s is taken at once, a pair of 2s is left while there is better to do', () => {
  const low = position({ known: pairOf(2) }).weigh(), high = position({ known: pairOf(9) }).weigh();
  assert.equal(best(high).kind, 'match');
  assert.equal(best(high).value, 9);
  assert.equal(best(low).kind, 'explore', 'just because it can make a match of two 2s does not mean it will');
  assert.equal(best(position({ known: pairOf(5) }).weigh()).kind, 'match', 'but a set worth having is the default');
  assert.ok(util(high, 'match') - util(high, 'explore') > util(low, 'match') - util(low, 'explore') + 3, 'the higher the set, the more it wants it');
});

test('perfect AI: it knows which sets are still on the board (and so how long the game has left)', () => {
  const w = position({ matched: lateGame([[7], [6], [9]]) }).weigh();
  assert.deepEqual(w.sets.slice().sort((a, b) => a - b), [6, 7, 9]);
  const early = position().weigh();
  assert.equal(early.sets.length, 15);
  assert.ok(w.E < early.E / 3, 'far fewer turns left late in the game');
});

test('perfect AI: it never plans on the value of a fossil it has not seen (it plays from the public view and its own peeks)', () => {
  const p = position({ known: [{ tid: 0, value: 9, pub: true }] });
  const before = JSON.stringify(p.weigh());
  p.s.tokens[5].value = 10; p.s.tokens[6].value = 2;                        // change hidden fossils behind its back
  assert.equal(JSON.stringify(p.weigh()), before);
});

// ---------------------------------------------------------------- the human-like imperfections
const aged = (profile, turns) => {
  const p = position({ known: pairOf(7), profile });
  for (let i = 0; i < turns; i++) p.bot.onEvent({ type: 'turn', actor: 1 });
  return p;
};

test('overconfidence: a bot with a fading memory that is realistic about it explores rather than trust an old memory; an overconfident one goes for the match', () => {
  const faded = { ...EXPERT, memory: 6 };                                    // (memory 6 = a memory that survives a turn 80% of the time)
  const calm = aged({ ...faded, selfAwareness: 10 }, 8).weigh(), rash = aged({ ...faded, selfAwareness: 0 }, 8).weigh();
  assert.equal(best(calm).kind, 'explore', 'a pair it saw 8 turns ago is mostly a guess: it looks for something surer');
  assert.equal(best(rash).kind, 'match', 'the overconfident bot is sure it remembers');
  assert.equal(best(aged({ ...faded, selfAwareness: 10 }, 0).weigh()).kind, 'match', 'a fresh memory is trusted by everyone');
});

test('overconfidence: going for a match it cannot reliably make, it often taps the wrong spot', () => {
  const p = aged({ ...EXPERT, memory: 6, selfAwareness: 0 }, 8);
  let right = 0, N = 1500;
  for (let i = 0; i < N; i++) { const a = p.decide(); if (a.type === 'peek' && a.tid === 20) right++; }
  assert.ok(right / N < 0.3, `right ${right / N}`);
});

test('gems: a bot with no feel for them always goes for the third gem; the perfect AI only does when it knows where it is', () => {
  const two = [{ tid: 28, value: 12, gem: true, pub: true }, { tid: 29, value: 12, gem: true, pub: true }];
  assert.equal(best(position({ known: two, profile: { ...EXPERT, gemSense: 0 } }).weigh()).kind, 'gamble');
  assert.notEqual(best(position({ known: two }).weigh()).kind, 'gamble', 'the perfect AI would be giving two gems away');
  const three = two.concat([{ tid: 30, value: 12, gem: true, pub: true }]);
  assert.equal(best(position({ known: three }).weigh()).kind, 'match', 'it takes the gem set when it knows all three');
  // in the middle of a turn: it has peeked a gem and flipped a gem — does it go on?
  const turn = profile => {
    const s = game({ players: 2, rolls: [6, 5] });
    const bot = Bots.create({ seat: 0, profile, rng: Engine.mulberry32(2) });
    s.observers.push(bot);
    Engine.peek(s, 28); Engine.flipOther(s, 29);
    return bot.decide(Engine.publicView(s, 0)).type;
  };
  assert.equal(turn({ ...EXPERT, gemSense: 0 }), 'flipOwn', 'two gems found: go for the third');
  assert.equal(turn(EXPERT), 'endTurn', 'the perfect AI keeps the two positions to itself');
});

// ---------------------------------------------------------------- what the easier opponents lack
test('easier AI: with no feel for set values every set looks the same — it takes a pair of 2s as eagerly as a pair of 9s', () => {
  const low = position({ known: pairOf(2), profile: BLIND }).weigh(), high = position({ known: pairOf(9), profile: BLIND }).weigh();
  assert.equal(util(low, 'match'), util(high, 'match'));
  assert.equal(best(low).kind, 'match', 'and it takes the 2s');
});

test('easier AI: with no sense of the game ending it thinks there is plenty of time, where the perfect AI sees the end coming', () => {
  const pos = { matched: lateGame([[7], [6], [9]]), held: [[7, 3], []], points: [10, 10] };
  const wise = position(pos).weigh(), blind = position({ ...pos, profile: BLIND }).weigh();
  assert.ok(blind.E > wise.E * 2, `blind E=${blind.E} wise E=${wise.E}`);
  assert.equal(best(wise).kind, 'bank', 'seeing the end coming, it banks');
});

test('easier AI: not tracking the sets means it guesses what is left from the number of fossils on the board', () => {
  const blind = position({ matched: lateGame([[7], [6], [9]]), profile: BLIND }).weigh();
  assert.notDeepEqual(blind.sets.slice().sort((a, b) => a - b), [6, 7, 9]);
});

test('levels: the five opponents\' abilities never go down from one level to the next', () => {
  for (const { id } of GAME_DATA.skills) {
    for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i][id] >= LEVELS[i - 1][id], `${id} drops at level ${i + 1}`);
  }
  assert.ok(LEVELS.every(l => l.memory < 10), 'no opponent in the campaign is perfect');
});

// ---------------------------------------------------------------- strength follows ability (fixed seeds: deterministic)
function share(a, b, N = 300, seed0 = 8000) {
  let w = 0;
  for (let i = 0; i < N; i++) {
    const flip = i % 2, specs = flip ? [b, a] : [a, b];
    const s = Engine.createGame({ players: 2, seed: seed0 + i });
    Bots.playGame(s, Bots.attach(s, specs, seed0 + i));
    w += s.result.winners.length > 1 ? 0.5 : s.result.winners[0] === (flip ? 1 : 0) ? 1 : 0;
  }
  return w / N;
}

test('strength: the perfect AI beats the same AI with worse memory, and beats one with no sense of the end of the game', () => {
  assert.ok(share(EXPERT, { ...EXPERT, memory: 0.9 }) > 0.8);
  assert.ok(share(EXPERT, { ...EXPERT, endSense: 0, bankAt: 3 }) > 0.5, 'knowing when the game is ending is worth something');
});

test('strength: the campaign has three steps: Beginner (easy), the three middle levels (one normal opponent), Master; each step beats the one before', () => {
  assert.deepEqual(GAME_DATA.campaign.levels[1].ai, GAME_DATA.campaign.levels[2].ai); assert.deepEqual(GAME_DATA.campaign.levels[2].ai, GAME_DATA.campaign.levels[3].ai);
  assert.ok(share(LEVELS[1], LEVELS[0]) > 0.55, 'normal should beat easy');
  assert.ok(share(LEVELS[4], LEVELS[3]) > 0.55, 'Master should beat normal');
  assert.ok(share(LEVELS[4], LEVELS[0]) > 0.9);
});

test('skills: every skill has a name and a description, every profile scores every skill 0-10, and the perfect AI scores 10 on all of them', () => {
  const ids = GAME_DATA.skills.map(k => k.id);
  assert.deepEqual(ids.slice().sort(), ['endSense', 'gemSense', 'leadSense', 'memory', 'selfAwareness', 'setsSense', 'valueSense']);
  for (const k of GAME_DATA.skills) { assert.ok(k.name && k.name.length > 2, k.id); assert.ok(k.blurb && k.blurb.length > 20, k.id); }
  for (const [name, prof] of [['expert', EXPERT], ...GAME_DATA.campaign.levels.map(l => [l.name, l.ai])]) {
    assert.deepEqual(Object.keys(prof).sort(), ids.slice().sort(), `${name} scores exactly the registered skills`);
    for (const id of ids) assert.ok(prof[id] >= 0 && prof[id] <= 10, `${name}.${id} = ${prof[id]}`);
  }
  for (const id of ids) assert.equal(EXPERT[id], 10, id);
});

test('skills: when memory slips, half the time it is a near miss — the fossil next to the right one', () => {
  const p = position({ known: [{ tid: 15, value: 9, pub: true }, { tid: 16, value: 9, pub: true }], profile: { ...EXPERT, memory: 3, selfAwareness: 0 } });
  for (let i = 0; i < 12; i++) p.bot.onEvent({ type: 'turn', actor: 1 });
  const cell = tid => p.s.tokens[tid].cell, cells = p.s.cells, d = (a, b) => { const A = cells[cell(a)], B = cells[cell(b)], dq = A.q - B.q, dr = A.r - B.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); };
  let slips = 0, near = 0;
  for (let i = 0; i < 4000; i++) { const a = p.decide(); if (a.type === 'peek' && a.tid !== 15 && a.tid !== 16) { slips++; if (d(a.tid, 15) === 1 || d(a.tid, 16) === 1) near++; } }
  assert.ok(slips > 1500);
  assert.ok(near / slips > 0.45, `near misses ${near}/${slips}`);   // far more than the ~20% a uniformly random tap would give
});
