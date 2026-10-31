const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA, Campaign } = require('./load');

const NAMES = ['Beginner', 'Novice', 'Normal', 'Challenging', 'Master'];
const id = i => GAME_DATA.campaign.levels[i].id;

test('campaign: five difficulty levels, in order — Beginner, Novice, Normal, Challenging, Master', () => {
  assert.deepEqual(GAME_DATA.campaign.levels.map(l => l.name), NAMES);
  assert.equal(new Set(GAME_DATA.campaign.levels.map(l => l.id)).size, 5);
});

test('campaign: three steps of skill: easy, then the same normal opponent for the three middle levels, then Master; nobody is perfect', () => {
  const ai = GAME_DATA.campaign.levels.map(l => l.ai);
  assert.deepEqual(ai[1], ai[2]); assert.deepEqual(ai[2], ai[3]);
  for (const i of [1, 4]) {
    assert.ok(ai[i].memory > ai[i === 1 ? 0 : 3].memory, `${NAMES[i]} should remember more than the step before`);
    for (const { id } of GAME_DATA.skills) assert.ok(ai[i][id] >= ai[i === 1 ? 0 : 3][id], `${NAMES[i]}: ${id}`);
  }
  assert.ok(ai.every(a => a.memory < 10), 'the opponents forget now and then');
});

test('campaign: only the easiest level is open at the start', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(i => Campaign.isUnlocked(i, [])), [true, false, false, false, false]);
});

test('campaign: beating a level unlocks the next, and only the next', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(i => Campaign.isUnlocked(i, [id(0)])), [true, true, false, false, false]);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => Campaign.isUnlocked(i, [id(0), id(1), id(2)])), [true, true, true, true, false]);
  assert.equal(Campaign.isUnlocked(2, [id(0)]), false, 'beating level 1 alone does not open level 3');
});

test('campaign: "defeat" means winning outright — a loss or a shared win does not count', () => {
  assert.equal(Campaign.humanWon({ winners: [0] }), true);
  assert.equal(Campaign.humanWon({ winners: [1] }), false);
  assert.equal(Campaign.humanWon({ winners: [0, 1] }), false);
});

test('campaign: recording a win adds the level and names what it unlocked', () => {
  const r = Campaign.recordResult([], 0, true);
  assert.deepEqual(r.beaten, [id(0)]);
  assert.equal(r.newlyUnlocked, 'Novice');
  assert.equal(r.won, true);
  assert.equal(r.completed, false);
});

test('campaign: a loss records nothing and unlocks nothing', () => {
  const r = Campaign.recordResult([id(0)], 1, false);
  assert.deepEqual(r.beaten, [id(0)]);
  assert.equal(r.newlyUnlocked, null);
});

test('campaign: replaying a level you already beat announces nothing new', () => {
  const r = Campaign.recordResult([id(0), id(1)], 0, true);
  assert.deepEqual(r.beaten, [id(0), id(1)]);
  assert.equal(r.newlyUnlocked, null);
});

test('campaign: beating Master completes the campaign (there is nothing further to unlock)', () => {
  const r = Campaign.recordResult([id(0), id(1), id(2), id(3)], 4, true);
  assert.equal(r.newlyUnlocked, null);
  assert.equal(r.completed, true);
  assert.equal(Campaign.recordResult([id(0), id(1), id(2), id(3), id(4)], 4, true).completed, false, 'only announced once');
});

test('campaign: an opponent\'s settings come from the level data', () => {
  assert.equal(Campaign.botSpec(GAME_DATA.campaign.levels[2]), GAME_DATA.campaign.levels[2].ai);
  assert.equal(Campaign.botSpec(GAME_DATA.campaign.levels[2]).memory, 8.5);
});
