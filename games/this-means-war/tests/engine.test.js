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

test('factions: only a faction whose seven roles all have an ability or a changed power is offered; the rest wait', () => {
  assert.deepEqual(E.offered.map(f => f.id), ['basic', 'fellowship', 'mordor', 'benders', 'got', 'survivor', 'pokemon']);
  for (const f of E.offered) for (const r of E.ROLES) assert.ok(f.basic || f.abilities[r] || f.power[r], f.id + ' needs something for ' + r);
  assert.deepEqual(E.missingRoles(E.FAC.order), ['general', 'warrior', 'spy'], 'Order of the Phoenix: three still to do');
  assert.equal(D.factions.length - E.offered.length + D.notStarted.length, 9, 'nine factions are not finished');
  for (const f of E.offered) for (const r of E.ROLES) assert.ok(f.names[r].trim(), f.id + ' names ' + r);
  for (const s of D.sets) s.sides.forEach(id => assert.ok(E.FAC[id], id));
});

test('factions: a "+1 P" / "-1 P" changes the power, so a tie can become a win', () => {
  const fac = ['mordor', 'basic'];
  const sauron = { id: 'a', type: 'leader', owner: 0 }, leader = { id: 'b', type: 'leader', owner: 1 };
  assert.equal(E.powerOf(sauron, fac), 15);
  assert.equal(E.duel(sauron, leader, fac), 'a', 'Sauron (+1) beats an ordinary Leader');
  assert.equal(E.duel(leader, { ...sauron, owner: 1 }, ['basic', 'basic']), 'both', 'with no faction they tie');
  assert.equal(E.nameOf(sauron, fac), 'Sauron');
});

test('factions: computer vs computer finishes with different factions', () => {
  const ids = E.offered.map(f => f.id);
  for (let seed = 1; seed <= 10; seed++) {
    const s = E.createGame({ seed, first: seed % 2, factions: [ids[seed % ids.length], ids[(seed * 3 + 1) % ids.length]] });
    let n = 0;
    while (s.step !== 'over' && n++ < 20000) { const p = E.actor(s), r = E.apply(s, Bots.nextAction(E.viewFor(s, p))); assert.ok(r.ok, r.error); }
    assert.equal(s.step, 'over');
  }
});

// ---------- Survivor abilities: used on purpose, never by playing the card ----------
function setup(facs, att, def, extraUnits = []) {
  const s = E.createGame({ seed: 7, first: 0, factions: facs }); s.step = 'play'; s.cur = 0; s.hands = [[], []];
  s.units = [{ id: 1, owner: 0, at: '2,0', cards: att.map(t => card(t, 0)), acted: false }, { id: 2, owner: 1, at: '2,0', cards: def.map(t => card(t, 1)), acted: false }].concat(extraUnits);
  assert.ok(E.apply(s, { type: 'endMove' }).ok); return s;
}
const cid = (s, p, type) => s.battle.side[p].hand.concat(s.battle.side[p].aside).find(c => c.type === type).id;

test('abilities: a battle with no usable ability goes straight to the first card; the data names which abilities the game plays', () => {
  const s = setup(['basic', 'basic'], ['warrior', 'spy'], ['ranger', 'leader']); assert.equal(s.battle.stage, 'first'); assert.equal(E.actor(s), 1);
  assert.deepEqual(Object.keys(E.FAC.survivor.play).sort(), ['general', 'leader', 'ranger', 'sorcerer', 'spy']);
  for (const a of Object.values(E.FAC.survivor.play)) assert.ok(D.abilities[a]);
});

test('Outwit (Yul): used at the start of the battle by the attacker; the defender plays face down; a right guess defeats the card, a wrong guess leaves it down until both have played', () => {
  let s = setup(['survivor', 'basic'], ['ranger', 'spy'], ['warrior', 'leader']);
  assert.equal(s.battle.stage, 'start'); assert.equal(E.actor(s), 0); const v = E.viewFor(s, 0); assert.deepEqual(v.battle.abil.map(a => a.ability), ['outwit']);
  assert.equal(E.apply(s, { type: 'play', card: cid(s, 0, 'spy') }).ok, false, 'playing a card is not using an ability, and not allowed yet');
  assert.ok(E.apply(s, { type: 'ability', ability: 'outwit', card: cid(s, 0, 'ranger') }).ok); assert.equal(s.battle.stage, 'start', 'still the start: Ready ends it'); assert.ok(E.apply(s, { type: 'ready' }).ok);
  assert.equal(s.battle.stage, 'first'); assert.equal(E.actor(s), 1);
  const w = cid(s, 1, 'warrior'); assert.ok(E.apply(s, { type: 'play', card: w }).ok); assert.equal(s.battle.stage, 'guess'); assert.equal(E.actor(s), 0);
  assert.equal(E.viewFor(s, 0).battle.played.theirs, null, 'the attacker cannot see it'); assert.equal(E.viewFor(s, 0).battle.played.theirsHidden, true);
  assert.ok(E.apply(s, { type: 'guess', role: 'warrior' }).ok); assert.equal(s.battle.stage, 'first', 'right: defeated, and they play another'); assert.equal(s.discard[1].length, 1); assert.equal(s.battle.played[1], null);
  s = setup(['survivor', 'basic'], ['ranger', 'spy'], ['warrior', 'leader']); E.apply(s, { type: 'ability', ability: 'outwit', card: cid(s, 0, 'ranger') }); E.apply(s, { type: 'ready' }); E.apply(s, { type: 'play', card: cid(s, 1, 'warrior') });
  assert.ok(E.apply(s, { type: 'guess', role: 'spy' }).ok); assert.equal(s.battle.stage, 'second'); assert.equal(E.viewFor(s, 0).battle.played.theirs, null, 'still face down for the attacker'); E.apply(s, { type: 'play', card: cid(s, 0, 'ranger') });
  assert.equal(s.battle.stage, 'result'); assert.ok(E.viewFor(s, 0).battle.played.theirs, 'both show at the result');
  const d = setup(['survivor', 'basic'], ['spy'], ['ranger']); assert.deepEqual(E.viewFor(d, 1).battle.abil, [], 'the defender cannot Outwit');
});

test('Idol Play (Parvati): the Idol makes the card played with it safe, once per battle; No Idol is a bluff that can be used again', () => {
  const s = setup(['basic', 'survivor'], ['leader', 'general', 'ranger'], ['sorcerer', 'warrior', 'ranger', 'assassin']); assert.equal(s.battle.stage, 'first'); assert.equal(E.actor(s), 1);
  assert.equal(E.viewFor(s, 1).battle.idol.ok, true, 'Parvati is in the army and you play first'); assert.equal(E.viewFor(s, 0).battle.idol.ok, false);
  assert.equal(E.apply(s, { type: 'play', card: cid(s, 1, 'warrior'), idol: 'maybe' }).ok, false);
  assert.ok(E.apply(s, { type: 'play', card: cid(s, 1, 'warrior'), idol: 'idol' }).ok); assert.equal(E.viewFor(s, 0).battle.idol.theirs, 'down', 'the other side only sees an idol card face down');
  E.apply(s, { type: 'play', card: cid(s, 0, 'leader') }); assert.equal(s.battle.stage, 'result');
  assert.equal(s.battle.dies[1], false, 'the Warrior would have fallen to the Leader, but the Idol saved it'); assert.equal(s.battle.saved[1], true); assert.equal(s.battle.dies[0], false);
  assert.equal(E.viewFor(s, 0).battle.idol.theirs, 'idol', 'revealed at the result'); E.apply(s, { type: 'continue' }); assert.equal(E.actor(s), 0, 'the other player plays first now');
  E.apply(s, { type: 'play', card: cid(s, 0, 'general') }); E.apply(s, { type: 'play', card: cid(s, 1, 'ranger') }); assert.equal(s.battle.dies[1], true, 'no idol when you play second'); E.apply(s, { type: 'continue' });
  assert.equal(E.actor(s), 1); assert.equal(E.apply(s, { type: 'play', card: cid(s, 1, 'assassin'), idol: 'idol' }).ok, false, 'the Idol is used up');
  assert.ok(E.apply(s, { type: 'play', card: cid(s, 1, 'assassin'), idol: 'noidol' }).ok, 'No Idol may be played again'); E.apply(s, { type: 'play', card: cid(s, 0, 'ranger') }); assert.equal(s.battle.saved[1], false); assert.equal(s.battle.dies[1], true, 'No Idol does not protect the card');
});

test('Anyone But Me (Sandra): after the other player plays, the exposed Sandra may be swapped for a card in hand', () => {
  const s = setup(['basic', 'survivor'], ['leader', 'warrior'], ['spy', 'ranger']);
  E.apply(s, { type: 'play', card: cid(s, 1, 'spy') }); E.apply(s, { type: 'play', card: cid(s, 0, 'warrior') });
  assert.equal(s.battle.stage, 'swap'); assert.equal(E.actor(s), 1); assert.equal(E.viewFor(s, 1).battle.swapOK, true);
  assert.ok(E.apply(s, { type: 'swap', card: cid(s, 1, 'ranger') }).ok); assert.equal(s.battle.stage, 'result'); assert.equal(s.battle.played[1].type, 'ranger'); assert.ok(s.battle.side[1].hand.some(c => c.type === 'spy'), 'Sandra goes back to the hand');
  const k = setup(['basic', 'survivor'], ['leader', 'warrior'], ['spy', 'ranger']); E.apply(k, { type: 'play', card: cid(k, 1, 'spy') }); E.apply(k, { type: 'play', card: cid(k, 0, 'warrior') }); assert.ok(E.apply(k, { type: 'swap', card: null }).ok); assert.equal(k.battle.played[1].type, 'spy');
});

test('Blindsided (Rob) brings the card from another unit; Flip Allegiances (Cirie) steals when attacked, a duplicate is discarded', () => {
  const s = setup(['survivor', 'basic'], ['warrior'], ['ranger'], [{ id: 5, owner: 0, at: '0,-2', cards: [card('leader', 0), card('spy', 0)], acted: false }]);
  const ab = E.viewFor(s, 0).battle.abil; assert.deepEqual(ab.map(a => a.ability), ['blindsided']); assert.deepEqual(ab[0].units, [5]);
  assert.ok(E.apply(s, { type: 'ability', ability: 'blindsided', unit: 5 }).ok); assert.ok(s.battle.side[0].hand.some(c => c.type === 'leader')); assert.deepEqual(s.units.find(u => u.id === 5).cards.map(c => c.type), ['spy']);
  assert.ok(E.viewFor(s, 0).battle.abil.length === 0, 'used once per battle'); E.apply(s, { type: 'ready' }); assert.equal(s.battle.stage, 'first');
  const c = setup(['basic', 'survivor'], ['warrior', 'ranger'], ['general', 'spy']); assert.equal(c.battle.stage, 'start'); assert.equal(E.actor(c), 1);
  assert.ok(E.apply(c, { type: 'ability', ability: 'allegiances', card: cid(c, 1, 'general') }).ok); assert.equal(c.battle.side[1].hand.length + c.battle.side[1].aside.length + c.discard[0].length, 3, 'one card moved over (or a duplicate was discarded)'); assert.equal(c.battle.side[0].hand.length, 1);
});

test('battles are recorded when they end, so the screen can say who won', () => {
  const s = setup(['basic', 'basic'], ['leader'], ['spy']); assert.equal(s.outcomes.length, 0);
  E.apply(s, { type: 'play', card: cid(s, 1, 'spy') }); E.apply(s, { type: 'play', card: cid(s, 0, 'leader') }); E.apply(s, { type: 'continue' });
  assert.equal(s.outcomes.length, 1); assert.equal(s.outcomes[0].winner, 0); assert.equal(s.outcomes[0].att, 0);
});
