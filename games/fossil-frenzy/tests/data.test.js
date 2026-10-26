const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GAME_DATA, Engine, Bots, Campaign } = require('./load');
const { rolls } = require('./helpers');

// A different board, fossil set and point values — nothing in the engine, bots or campaign may assume the stock numbers.
const small = () => ({
  ...JSON.parse(JSON.stringify(GAME_DATA)),
  shapes: { ...GAME_DATA.shapes, small: { radius: 2, remove: [[2, -2, 0], [2, 0, -2], [0, 2, -2], [-2, 2, 0], [-2, 0, 2], [0, -2, 2]] } },
  board: { shape: 'small' },
  tokens: [{ value: 1, count: 4 }, { value: 4, count: 6 }, { value: 20, count: 3, gem: true }],
});

test('data block: a smaller board with other fossils and a 20-point gem plays to the end', () => {
  for (const seed of [1, 2, 3]) {
    const s = Engine.createGame({ players: 3, seed, data: small() });
    assert.equal(s.tokens.length, 13);
    assert.equal(s.cells.length, 13);
    const bots = Bots.attach(s, [1, 1, 1].map(m => ({ memory: m })), seed);
    assert.ok(Bots.playGame(s, bots));
    assert.equal(s.matchedCount, 13);
  }
});

test('data block: the gem value is whatever the data says', () => {
  const s = Engine.createGame({ players: 2, data: small(), rng: rolls([6, 5, 1]) });
  const gems = s.tokens.filter(t => t.gem);
  assert.equal(gems.length, 3);
  assert.ok(gems.every(t => t.value === 20));
  const me = s.players[s.current];
  me.sets = [{ value: 20, gem: true, size: 3, ids: [] }];
  Engine.bank(s, 0);
  assert.equal(me.points, 20);
});

test('data block: player limits, die, fossil sets and tie-breaks live in GAME_DATA', () => {
  assert.deepEqual(GAME_DATA.players, { min: 2, max: 4 });
  assert.equal(GAME_DATA.die.sides, 6);
  assert.deepEqual(GAME_DATA.matching, { pairSize: 2, gemSetSize: 3 });
  assert.deepEqual(GAME_DATA.rules.tiebreaks, ['score', 'sets', 'finalPair']);
  assert.equal(GAME_DATA.rules.scoring.setPoints, 'tile-number');
});

test('data block: the campaign levels come from the data (a different list is honoured)', () => {
  const saved = GAME_DATA.campaign.levels;
  GAME_DATA.campaign.levels = [{ id: 'a', name: 'A', memory: 0.5, bankAt: 1, endgameTiles: 0 }, { id: 'b', name: 'B', memory: 0.9, bankAt: 1, endgameTiles: 0 }];
  try {
    assert.equal(Campaign.levels().length, 2);
    assert.equal(Campaign.isUnlocked(1, []), false);
    assert.equal(Campaign.isUnlocked(1, ['a']), true);
    assert.equal(Campaign.recordResult([], 0, true).newlyUnlocked, 'B');
  } finally { GAME_DATA.campaign.levels = saved; }
});

test('data block: the rule numbers are not hard-coded in the engine, bots or campaign source', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['engine', 'bots', 'campaign']) {
    const code = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'))[1];
    for (const re of [/\b31\b/, /\b37\b/, /\b16\b/, /\bsides\s*[:=]\s*6\b/, /Beginner|Master/]) assert.ok(!re.test(code), `${id} mentions ${re}`);
  }
});

// ---- the five campaign levels: each has its own board and its own fossils ----
const cubeKey = c => [c.q, -c.q - c.r, c.r].join(',');
const LEVELS = [
  { id: 'beginner', shape: 'donut', cells: 18, tokens: '2x4 3x4 5x4 6x4 9x2', gem: null },
  { id: 'novice', shape: 'triangle', cells: 21, tokens: '2x4 3x4 5x4 6x4 9x2', gem: 10 },
  { id: 'normal', shape: 'sun', cells: 25, tokens: '2x6 3x4 5x4 6x4 9x2 10x2', gem: 11 },
  { id: 'challenging', shape: 'flower', cells: 31, tokens: '2x6 3x6 5x4 6x4 7x4 9x2 10x2', gem: 12 },
  { id: 'master', shape: 'giant', cells: 37, tokens: '2x8 3x8 5x4 6x4 7x4 9x2 10x2 11x2', gem: 15 },
];
test('campaign levels: each level\'s board shape, fossils and gem value are the ones in the design', () => {
  assert.deepEqual(Campaign.levels().map(l => l.id), LEVELS.map(l => l.id));
  for (const L of LEVELS) {
    const lv = Campaign.levels().find(l => l.id === L.id), d = Campaign.gameData(lv);
    assert.equal(lv.shape, L.shape, L.id);
    const s = Engine.createGame({ players: 2, seed: 4, data: d });
    assert.equal(s.cells.length, L.cells, L.id + ' spaces'); assert.equal(s.tokens.length, L.cells, L.id + ' fossils: one on every space');
    const have = d.tokens.filter(t => !t.gem).map(t => `${t.value}x${t.count}`).join(' ');
    assert.equal(have, L.tokens, L.id + ' numbers');
    const gems = d.tokens.filter(t => t.gem);
    if (L.gem === null) assert.equal(gems.length, 0, L.id + ' has no gems');
    else { assert.equal(gems.length, 1); assert.equal(gems[0].count, 3, L.id + ': three gems'); assert.equal(gems[0].value, L.gem, L.id + ' gem value'); }
  }
});

test('board shapes (cube coordinates, x + y + z = 0): donut, triangle, sun, flower, giant hexagon', () => {
  const cells = shape => Engine.buildBoard({ shapes: GAME_DATA.shapes, board: { shape } });
  const keys = shape => new Set(cells(shape).map(cubeKey));
  const ring = r => c => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) <= r;
  const all = r => { const out = []; for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) { const y = -x - z; if (ring(r)([x, y, z])) out.push([x, y, z]); } return out; };
  const donut = keys('donut'); assert.equal(donut.size, 18); assert.ok(!donut.has('0,0,0'), 'no centre'); for (const c of all(2)) if (c.join() !== '0,0,0') assert.ok(donut.has(c.join()), 'donut ' + c);
  const tri = cells('triangle'); assert.equal(tri.length, 21);
  const rows = {}; for (const c of tri) rows[c.r] = (rows[c.r] || 0) + 1; assert.deepEqual(Object.values(rows).sort(), [1, 2, 3, 4, 5, 6].map(String).sort().map(Number).sort((a, b) => a - b), 'rows of 1 to 6'); assert.equal(Object.keys(rows).length, 6);
  const sun = keys('sun'); assert.equal(sun.size, 25); for (const c of all(2)) assert.ok(sun.has(c.join()), 'sun core ' + c);
  for (const c of [[3, -3, 0], [3, 0, -3], [0, 3, -3], [-3, 3, 0], [-3, 0, 3], [0, -3, 3]]) assert.ok(sun.has(c.join()), 'sun ray ' + c);
  const flower = keys('flower'); assert.equal(flower.size, 31); for (const c of all(3)) { const corner = [Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])].sort().join() === '0,3,3'; assert.equal(flower.has(c.join()), !corner, 'flower ' + c); }
  const giant = keys('giant'); assert.equal(giant.size, 37); for (const c of all(3)) assert.ok(giant.has(c.join()));
  for (const sh of ['donut', 'triangle', 'sun', 'flower', 'giant']) { const cs = cells(sh); assert.ok(cs.every((c, i) => c.id === i), sh + ': ids in order'); assert.ok(cs.every(c => Number.isInteger(c.q) && Number.isInteger(c.r))); }
});

test('campaign levels: opponents play a whole game on every level (no gems on level 1)', () => {
  for (const lv of Campaign.levels()) for (const seed of [1, 2]) {
    const s = Engine.createGame({ players: 2, seed, data: Campaign.gameData(lv) });
    const bots = Bots.attach(s, [null, Campaign.botSpec(lv)].map(x => x || lv.ai), seed);
    assert.ok(Bots.playGame(s, bots), lv.id); assert.equal(s.matchedCount, s.tokens.length, lv.id);
  }
});

test('Torn Treasure: the theme tiers cover every number in every level, in order; the reminders and the two films are in the data block', () => {
  const tiers = GAME_DATA.theme.tiers;
  assert.deepEqual(tiers.map(t => t.id), ['plain', 'aged', 'gold'], 'plain 2-3, aged 5-7, gold 9 and up');
  assert.ok(tiers.every((t, i) => i === 0 || t.upTo > tiers[i - 1].upTo), 'thresholds go up');
  const tierOf = v => tiers.find(t => v <= t.upTo).id;
  assert.deepEqual([2, 3, 5, 6, 7, 9, 10, 11, 12, 15].map(tierOf), ['plain', 'plain', 'aged', 'aged', 'aged', 'gold', 'gold', 'gold', 'gold', 'gold']);
  for (const lv of Campaign.levels()) for (const t of lv.tokens) assert.ok(tiers.some(x => t.value <= x.upTo), lv.id + ' ' + t.value);
  for (const id of ['match', 'gem']) { const c = GAME_DATA.coach[id]; assert.ok(c && c.title && c.body.length > 20, id + ' reminder'); }
  assert.deepEqual(GAME_DATA.coach.match.levels, ['beginner'], 'the first-match note is for the easiest level');
  assert.doesNotMatch(JSON.stringify(GAME_DATA.coach), /fossil|bank/i, 'in the theme\'s words');
  for (const k of ['hold', 'lift', 'slide', 'morph', 'pause', 'fly', 'settle']) assert.ok(GAME_DATA.anim.match[k] > 0, 'match ' + k);
  for (const k of ['open', 'hold', 'rain', 'count', 'end']) assert.ok(GAME_DATA.anim.dig[k] > 0, 'dig ' + k);
  assert.ok(Object.values(GAME_DATA.anim.dig).reduce((a, b) => a + b, 0) < 1500, 'a dig film is under about a second');
  assert.ok(GAME_DATA.coach.gem.ask && GAME_DATA.coach.gem.short.split(' ').length < 30, 'the gem note is a button and a picture, with one short line');
  assert.ok(Object.values(GAME_DATA.anim.match).reduce((a, b) => a + b, 0) < 2500, 'a match film is quick');
});

test('Pass & Play board sizes: five sizes, each one of the campaign boards; a default for every player count, bigger for more people', () => {
  const ids = Campaign.levels().map(l => l.id), size = id => Campaign.levels().find(l => l.id === GAME_DATA.passBoards.find(b => b.id === id).level).tokens.reduce((n, t) => n + t.count, 0);
  assert.deepEqual(GAME_DATA.passBoards.map(b => b.id), ['tiny', 'small', 'medium', 'large', 'huge']);
  for (const b of GAME_DATA.passBoards) assert.ok(ids.includes(b.level), b.id + ' is a campaign level\'s board');
  assert.deepEqual(GAME_DATA.passBoards.map(b => size(b.id)), [18, 21, 25, 31, 37]);
  for (let n = GAME_DATA.players.min; n <= GAME_DATA.players.max; n++) assert.ok(GAME_DATA.passBoards.some(b => b.id === GAME_DATA.passBoardByPlayers[n]), n + ' players has a default size');
  const by = n => size(GAME_DATA.passBoardByPlayers[n]);
  assert.ok(by(2) < by(3) && by(3) < by(4), 'more people, a bigger board');
});
