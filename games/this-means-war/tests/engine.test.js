const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots } = require('./load');
const card = (type, owner = 0) => ({ id: owner + '-' + type + '-t', type, owner });

test('duel: higher power wins, weakness beats the stronger card, equal cards both fall', () => {
  assert.equal(E.duel(card('warrior'), card('ranger')), 'a');
  assert.equal(E.duel(card('ranger'), card('warrior')), 'b');
  assert.equal(E.duel(card('leader'), card('assassin')), 'b');
  assert.equal(E.duel(card('assassin'), card('leader')), 'a');
  assert.equal(E.duel(card('general'), card('spy')), 'b');
  assert.equal(E.duel(card('warrior'), card('sorcerer')), 'b');
  assert.equal(E.duel(card('ranger'), card('ranger')), 'both');
  assert.equal(E.duel(card('leader'), card('spy')), 'a');
});

test('decks have 17 cards each and the opening draw is 1 and 2', () => {
  const s = E.createGame({ seed: 1, first: 0 });
  assert.equal(s.hands[0].length, D.rules.firstDraw[0]);
  assert.equal(s.hands[1].length, D.rules.firstDraw[1]);
  assert.equal(s.decks[0].length + s.hands[0].length, 17);
});

test('flags are hidden in a starting castle, then the first player may place cards', () => {
  const s = E.createGame({ seed: 2, first: 0 });
  assert.equal(E.apply(s, { type: 'flag', castle: 'mid' }).ok, false);
  assert.equal(E.apply(s, { type: 'flag', castle: 'nw' }).ok, true);
  assert.equal(E.actor(s), 1);
  assert.equal(E.apply(s, { type: 'flag', castle: 'sw' }).ok, true);
  assert.equal(s.step, 'play');
  assert.equal(E.apply(s, { type: 'endMove' }).ok, false, 'must place the hand first');
  assert.equal(E.apply(s, { type: 'deploy', card: s.hands[0][0].id, castle: 'sw' }).ok, false, 'not your castle');
  assert.equal(E.apply(s, { type: 'deploy', card: s.hands[0][0].id, castle: 'ne' }).ok, true);
});

test('movement: speed 2, not through enemy units, one action per unit', () => {
  const s = E.createGame({ seed: 3, first: 0 });
  s.step = 'play'; s.units.push({ id: 90, owner: 0, at: '2,-2', cards: [card('ranger')], acted: false });
  const r = E.reachable(s, s.units[0]);
  assert.ok(r.includes('2,0') && r.includes('0,-1') && !r.includes('2,-2'));
  assert.ok(!r.some(k => E.dist('2,-2', k) > 2));
  s.units.push({ id: 91, owner: 1, at: '2,-1', cards: [card('spy', 1)], acted: false });
  const r2 = E.reachable(s, s.units[0]);
  assert.ok(r2.includes('2,-1') && !r2.includes('2,0'), 'stops at the enemy');
  s.hands[0] = [];
  assert.equal(E.apply(s, { type: 'move', unit: 90, to: '1,-1' }).ok, true);
  assert.equal(E.apply(s, { type: 'move', unit: 90, to: '0,0' }).ok, false);
});

test('an undefended enemy castle is captured; the flag castle ends the game', () => {
  const s = E.createGame({ seed: 4, first: 0 });
  s.castles.sw.flagOf = 1; s.castles.nw.flagOf = 0; s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 90, owner: 0, at: '0,0', cards: [card('ranger')], acted: false });
  E.apply(s, { type: 'endMove' });
  assert.equal(s.castles.mid.owner, 0);
  assert.equal(s.cur, 1, 'turn passed on');
  s.cur = 0; s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 91, owner: 0, at: '-2,2', cards: [card('spy')], acted: false });
  E.apply(s, { type: 'endMove' });
  assert.equal(s.step, 'over'); assert.equal(s.winner, 0);
});

test('a battle: defender first, survivors become the new hand, loser is out', () => {
  const s = E.createGame({ seed: 5, first: 0 });
  s.castles.sw.flagOf = 1; s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 90, owner: 0, at: '0,0', cards: [card('warrior'), card('ranger')], acted: false });
  s.units.push({ id: 91, owner: 1, at: '0,0', cards: [card('spy', 1)], acted: false });
  E.apply(s, { type: 'endMove' });
  assert.equal(s.step, 'battle'); assert.equal(E.actor(s), 1);
  assert.equal(E.apply(s, { type: 'play', card: '0-warrior-t' }).ok, false, 'not your card');
  assert.equal(E.apply(s, { type: 'play', card: '1-spy-t' }).ok, true);
  assert.equal(E.actor(s), 0);
  assert.equal(E.apply(s, { type: 'play', card: '0-ranger-t' }).ok, true);
  assert.equal(s.battle.result, 'a');
  E.apply(s, { type: 'continue' });
  assert.equal(s.battle, null);
  assert.equal(s.castles.mid.owner, 0, 'the winning attacker took the neutral castle');
  const u = s.units.find(x => x.at === '0,0'); assert.equal(u.owner, 0); assert.equal(u.cards.length, 2);
});

test('battle rounds alternate who plays first: the defender, then the attacker', () => {
  const s = E.createGame({ seed: 8, first: 0 });
  s.castles.sw.flagOf = 1; s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 90, owner: 0, at: '0,0', cards: [card('warrior'), card('ranger')], acted: false });
  s.units.push({ id: 91, owner: 1, at: '0,0', cards: [card('spy', 1), card('assassin', 1)], acted: false });
  E.apply(s, { type: 'endMove' });
  assert.equal(E.actor(s), 1, 'round 1: the defender plays first');
  E.apply(s, { type: 'play', card: '1-spy-t' }); E.apply(s, { type: 'play', card: '0-ranger-t' }); E.apply(s, { type: 'continue' });
  assert.equal(E.actor(s), 0, 'round 2: the attacker plays first');
});

test('turning over an original castle is announced (flag or no flag)', () => {
  const s = E.createGame({ seed: 10, first: 0 });
  s.castles.sw.flagOf = 1; s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 90, owner: 0, at: '0,0', cards: [card('ranger')], acted: false });
  E.apply(s, { type: 'endMove' });
  assert.equal(s.reveals.length, 0, 'a neutral castle is not turned over');
  s.cur = 0; s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 91, owner: 0, at: '0,2', cards: [card('spy')], acted: false });
  E.apply(s, { type: 'endMove' });
  assert.deepEqual(s.reveals.map(r => [r.castle, r.flag]), [['se', false]]);
  assert.equal(s.step, 'play');
});

test('merging discards duplicate types', () => {
  const s = E.createGame({ seed: 6, first: 0 });
  s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 90, owner: 0, at: '0,-2', cards: [card('ranger'), card('spy')], acted: false });
  s.units.push({ id: 91, owner: 0, at: '0,-2', cards: [{ id: 'x', type: 'ranger', owner: 0 }, card('warrior')], acted: false });
  E.apply(s, { type: 'endMove' });
  const u = s.units.find(x => x.owner === 0); assert.equal(u.cards.length, 3);
  assert.equal(s.discard[0].length >= 1, true);
});

test('view hides the opponent cards and the opponent flag', () => {
  const s = E.createGame({ seed: 7, first: 0 }); E.apply(s, { type: 'flag', castle: 'nw' });
  s.units.push({ id: 90, owner: 1, at: '0,2', cards: [card('leader', 1)], acted: false });
  const v = E.viewFor(s, 1);
  assert.equal(v.castles.nw.flag, false);
  assert.ok(v.units[0].cards, 'own unit visible');
  const w = E.viewFor(s, 0);
  assert.equal(w.units[0].cards, null);
  assert.equal(typeof v.oppHand, 'number');
  assert.ok(!JSON.stringify(w).includes('1-leader'));
});

test('computer vs computer always finishes, with only legal moves', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const s = E.createGame({ seed, first: seed % 2 });
    let n = 0;
    while (s.step !== 'over' && n++ < 20000) {
      const p = E.actor(s), r = E.apply(s, Bots.nextAction(E.viewFor(s, p), () => Math.random()));
      assert.ok(r.ok, 'seed ' + seed + ' step ' + s.step + ': ' + r.error);
    }
    assert.equal(s.step, 'over', 'seed ' + seed + ' ended');
  }
});

test('save and restore round-trips', () => {
  const s = E.createGame({ seed: 9 });
  assert.deepEqual(E.restore(E.serialize(s)), s);
});
