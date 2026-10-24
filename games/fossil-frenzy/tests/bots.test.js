const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA, Engine, Bots, Campaign } = require('./load');
const { game, position, lateGame } = require('./helpers');

const LEVELS = GAME_DATA.campaign.levels;
const EXPERT = GAME_DATA.ai.profiles.expert;
const RANDOM = GAME_DATA.ai.profiles.random;
const playBotGame = (n, seed, specs) => {
  const s = Engine.createGame({ players: n, seed });
  const bots = Bots.attach(s, specs, seed);
  const done = Bots.playGame(s, bots);
  return { s, bots, done };
};
const withMemory = skill => ({ ...EXPERT, memory: skill });                         // memory is a 0-10 skill
const withRetention = r => withMemory((r - GAME_DATA.ai.tuning.retentionAtZero) / (1 - GAME_DATA.ai.tuning.retentionAtZero) * 10);   // ...or by the chance a memory survives a turn

test('bots finish complete games for 2-4 players, whatever they are (tutorial, perfect, every level)', () => {
  const kinds = [RANDOM, EXPERT, ...LEVELS.map(l => l.ai)];
  for (let n = 2; n <= 4; n++) for (let k = 0; k < kinds.length; k++) {
    const specs = Array.from({ length: n }, (_, i) => kinds[(k + i * 2) % kinds.length]);
    const { s, done } = playBotGame(n, 100 * n + k, specs);
    assert.ok(done, `cap hit: n=${n} k=${k}`);
    assert.equal(s.matchedCount, 31);
    assert.ok(s.result.winners.length >= 1);
  }
});

test('every campaign level plays every other level to the end — no stalls', () => {
  for (const a of LEVELS) for (const b of LEVELS) for (const seed of [1, 2]) {
    const { s, done } = playBotGame(2, seed, [Campaign.botSpec(a), Campaign.botSpec(b)]);
    assert.ok(done, `${a.name} vs ${b.name} seed ${seed} stalled`);
    assert.equal(s.matchedCount, 31);
  }
});

test('even a bot with the worst memory (skill 0) finishes its games', () => {
  const { s, done } = playBotGame(2, 5, [withMemory(0), withMemory(0)]);
  assert.ok(done);
  assert.equal(s.matchedCount, 31);
});

test('bot games are deterministic for a given seed', () => {
  const specs = [withMemory(3), withMemory(7), EXPERT];
  const a = playBotGame(3, 77, specs).s, b = playBotGame(3, 77, specs).s;
  assert.equal(a.turnNo, b.turnNo);
  assert.deepEqual(a.result.standings, b.result.standings);
});

// ---------------------------------------------------------------- what a bot learns
const eventBot = (profile = EXPERT, seed = 5) => Bots.create({ seat: 0, profile, rng: Engine.mulberry32(seed) });
const reveal = (tid, actor = 1, value = 5) => ({ type: 'reveal', actor, tid, cell: tid, value, gem: false, step: 'other' });

test('a bot learns every public flip (anybody\'s) and its own peeks — never another player\'s private peek', () => {
  const b = eventBot();
  b.onEvent(reveal(2, 1, 5));
  b.onEvent({ type: 'peek', actor: 0, tid: 4, cell: 4, value: 7, gem: false });
  b.onEvent({ type: 'peek', actor: 1, tid: 3, cell: 3, value: 9, gem: false });
  assert.deepEqual([...b.facts.keys()].sort(), [2, 4]);
  assert.equal(b.facts.get(2).pub, true, 'a public flip is public knowledge');
  assert.equal(b.facts.get(4).pub, false, 'its own peek is only its own');
  b.onEvent(reveal(4, 1, 7));
  assert.equal(b.facts.get(4).pub, true, 'once flipped in public, everybody knows it');
});

test('a bot forgets fossils once they are matched, and keeps count of which sets are gone', () => {
  const b = eventBot();
  b.onEvent(reveal(2)); b.onEvent(reveal(3));
  b.onEvent({ type: 'match', actor: 1, tids: [2, 3], value: 5, gem: false });
  assert.equal(b.facts.size, 0);
  assert.equal(b.gone.n5, 2);
});

// ---------------------------------------------------------------- memory: it fades with every turn that passes
const recallRate = (memory, ageTurns, N = 3000) => {
  // the bot knows a valuable pair (tiles 0 and 1, learnt `ageTurns` turns ago); how often does it peek exactly tile 0?
  const p = position({ known: [{ tid: 0, value: 9, pub: true }, { tid: 1, value: 9, pub: true }], profile: { ...withRetention(memory), selfAwareness: 0 } });   // (overconfident: it always tries, so we can see how often the memory holds)
  for (let i = 0; i < ageTurns; i++) p.bot.onEvent({ type: 'turn', actor: 1 });
  let right = 0, aimed = 0;
  for (let i = 0; i < N; i++) {
    const a = p.decide();
    if (a.type === 'peek') { aimed++; if (a.tid === 0) right++; }
  }
  return { right: right / N, aimed: aimed / N };
};

test('memory: what was seen within the last couple of turns is recalled exactly; older facts fade, recalled with probability retention^(age - fresh turns)', () => {
  assert.equal(recallRate(0.5, 0).right, 1, 'seen this very turn: exact');
  assert.equal(recallRate(1, 12).right, 1, 'perfect memory never slips');
  const fresh = GAME_DATA.ai.tuning.freshTurns;
  assert.equal(recallRate(0.5, fresh).right, 1, 'seen this round: exact, even for a poor memory');
  for (const [m, age] of [[0.9, 3 + fresh], [0.8, 5 + fresh], [0.95, 8 + fresh]]) {
    const r = recallRate(m, age).right, want = Math.pow(m, age - fresh);
    assert.ok(Math.abs(r - want) < 0.04, `memory ${m}, age ${age}: recalled ${r.toFixed(3)}, expected ${want.toFixed(3)}`);
  }
});

test('memory: an older memory is worse than a newer one, and a better memory is better than a worse one', () => {
  assert.ok(recallRate(0.9, 2).right > recallRate(0.9, 8).right + 0.2);
  assert.ok(recallRate(0.97, 6).right > recallRate(0.8, 6).right + 0.3);
});

test('memory: when it slips it taps a random OTHER spot on the board — never the one it meant, never a gone fossil', () => {
  const p = position({ matched: [[3, false], [3, false]], known: [{ tid: 0, value: 9, pub: true }, { tid: 1, value: 9, pub: true }], profile: { ...withRetention(0.7), selfAwareness: 0 } });
  for (let i = 0; i < 6; i++) p.bot.onEvent({ type: 'turn', actor: 1 });
  const hits = new Map();
  for (let i = 0; i < 3000; i++) { const a = p.decide(); if (a.type === 'peek' && a.tid !== 0) hits.set(a.tid, (hits.get(a.tid) || 0) + 1); }
  assert.ok(hits.size > 15, 'it taps many different spots, not one');
  const unmatched = new Set(p.s.tokens.filter(t => !t.matched).map(t => t.id));
  for (const tid of hits.keys()) assert.ok(unmatched.has(tid), 'a slip never taps a fossil that is already gone');
});

// ---------------------------------------------------------------- it plays by the public view only
test('bots decide only from the public view (face-down fossil values are absent from it)', () => {
  const s = Engine.createGame({ players: 2, seed: 3 });
  const bot = Bots.create({ seat: s.current, profile: EXPERT, rng: Engine.mulberry32(1) });
  const v = Engine.publicView(s, s.current);
  assert.ok(v.tokens.every(t => !('value' in t)));
  assert.equal(bot.decide(v).type, 'peek');
});

test('a bot that knows where a pair is peeks one, flips the other and matches', () => {
  const s = game({ players: 2, rolls: [6, 5] });
  const bot = Bots.create({ seat: 0, profile: EXPERT, rng: Engine.mulberry32(2) });
  s.observers.push(bot);
  s.tokens[0].value = 9; s.tokens[1].value = 9;                       // a pair worth having, both seen flipped by the other player
  bot.onEvent(reveal(0, 1, 9)); bot.onEvent(reveal(1, 1, 9));
  for (let i = 0; i < 4 && s.current === 0; i++) Bots.step(s, bot);
  assert.equal(s.players[0].sets.length, 1);
  assert.equal(s.players[0].sets[0].value, 9);
});

test('a bot reveals a space on every turn unless it banked', () => {
  for (let g = 0; g < 30; g++) {
    const s = Engine.createGame({ players: 3, seed: 4000 + g });
    const bots = Bots.attach(s, [withMemory(2), LEVELS[1].ai, EXPERT], g);
    let reveals = 0, banked = false, turns = 0;
    const check = () => { if (turns) assert.ok(banked || reveals >= 1, 'a bot turn neither banked nor revealed a space'); };
    s.observers.push({ onEvent: e => {
      if (e.type === 'turn') { check(); reveals = 0; banked = false; turns++; }
      else if (e.type === 'reveal') reveals++;
      else if (e.type === 'bank') banked = true;
    } });
    while (!s.over) Bots.step(s, bots[s.current]);
    check();
  }
});

// ---------------------------------------------------------------- banking habits (an opponent with almost no endgame sense banks by rule of thumb)
const nearEnd = (endSense, setValues) => {                  // 4 fossils left (two pairs); the bot holds sets
  const s = game({ players: 2, rolls: [6, 5] });
  const keep = new Set([0, 1, 6, 7]);
  s.tokens.forEach(t => { if (!keep.has(t.id)) { t.matched = true; s.tokenAt[t.cell] = -1; } });
  s.matchedCount = 27;
  s.players[0].sets = setValues.map(v => ({ value: v, gem: false, size: 2 }));
  const bot = Bots.create({ seat: 0, profile: { ...EXPERT, valueSense: 0, leadSense: 0, setsSense: 0, endSense }, rng: Engine.mulberry32(3) });
  return bot.decide(Engine.publicView(s, 0));
};

test('banking habit: with no endgame sense at all a bot banks as soon as it holds two sets — one set, the most valuable', () => {
  const s = game({ players: 2, rolls: [6, 5, 2] });
  const bot = Bots.create({ seat: 0, profile: { ...EXPERT, endSense: 0 }, rng: Engine.mulberry32(2) });
  s.players[0].sets = [{ value: 2, gem: false, size: 2 }, { value: 9, gem: false, size: 2 }];
  assert.equal(Bots.step(s, bot).type, 'bank');
  assert.equal(s.players[0].points, 9);
  assert.deepEqual(s.players[0].sets.map(x => x.value), [2]);
});

test('banking habit: a little endgame sense banks at three sets, or when few fossils remain', () => {
  assert.equal(nearEnd(2, [5]).type, 'bank', 'with 4 fossils left, the habit banks');
  assert.equal(nearEnd(2, [5, 3, 2]).type, 'bank', 'three sets in hand: bank');
});

// ---------------------------------------------------------------- strength follows ability
test('better memory wins more: perfect memory beats a forgetful player head-to-head', () => {
  let strong = 0;
  const N = 200;
  for (let g = 0; g < N; g++) {
    const { s } = playBotGame(2, 5000 + g, g % 2 ? [withMemory(10), withMemory(3)] : [withMemory(3), withMemory(10)]);
    const strongSeat = g % 2 ? 0 : 1;
    if (s.result.winners.length === 1 && s.result.winners[0] === strongSeat) strong++;
  }
  assert.ok(strong / N > 0.6, `perfect memory won only ${strong}/${N}`);
});

test('gem sets get matched in bot games (all three gems), by every kind of bot', () => {
  for (const kind of [EXPERT, LEVELS[0].ai, LEVELS[2].ai]) {
    let gemSets = 0;
    for (let g = 0; g < 30; g++) {
      const s = Engine.createGame({ players: 3, seed: 900 + g });
      const bots = Bots.attach(s, [kind, kind, kind], g);
      s.observers.push({ onEvent: e => { if (e.type === 'match' && e.gem) gemSets++; } });
      Bots.playGame(s, bots);
    }
    assert.equal(gemSets, 30);
  }
});

test('the tutorial bot plays at random: it loses to every campaign level', () => {
  for (const l of LEVELS) {
    let wins = 0;
    const N = 60;
    for (let g = 0; g < N; g++) {
      const specs = g % 2 ? [RANDOM, l.ai] : [l.ai, RANDOM];
      const { s } = playBotGame(2, 700 + g, specs);
      if (s.result.winners.length === 1 && s.result.winners[0] === (g % 2 ? 1 : 0)) wins++;
    }
    assert.ok(wins / N > 0.7, `${l.name} beat the random bot only ${wins}/${N}`);
  }
});

void lateGame;

test('the easy opponents go for a pair they have both just seen: it flipped one, the other player flipped the matching one, and it takes the pair (even Beginner and Novice)', () => {
  for (const id of ['beginner', 'novice']) {
    const lv = Campaign.levels().find(l => l.id === id);
    let n = 0, took = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const st = Engine.createGame({ players: 2, seed, data: Campaign.gameData(lv) });
      const bot = Bots.attach(st, [null, lv.ai], seed)[1];
      while (st.current !== 1) Engine.endTurn(st);
      const by = {}; st.tokens.filter(t => !t.gem).forEach(t => (by[t.value] = by[t.value] || []).push(t));
      const v = Object.keys(by).map(Number).sort((a, b) => b - a).find(k => by[k].length >= 2); if (v === undefined) continue;
      const [A, B] = by[v], rest = st.tokens.filter(t => t.id !== A.id && t.id !== B.id && !t.gem);
      Engine.peek(st, rest[0].id); Engine.flipOther(st, A.id); Engine.endTurn(st);        // its own turn: it flips A
      Engine.peek(st, rest[1].id); Engine.flipOther(st, B.id); Engine.endTurn(st);        // the other player flips the match
      for (let g = 0; g < 50 && !st.over; g++) { const a = bot.decide(Engine.publicView(st, 1)); if (!a || a.type === 'endTurn') break; Engine.apply(st, a); }
      n++; if (st.turn.matched && st.turn.matched.includes(A.id)) took++;
    }
    assert.ok(took / n >= 0.95, `${id}: took the pair ${took} of ${n}`);
  }
});
