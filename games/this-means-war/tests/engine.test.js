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

test('merging puts a duplicate type at the bottom of its owner\'s draw pile', () => {
  const s = E.createGame({ seed: 6, first: 0 });
  s.step = 'play'; s.hands[0] = [];
  s.units.push({ id: 90, owner: 0, at: '0,-2', cards: [card('ranger'), card('spy')], acted: false });
  s.units.push({ id: 91, owner: 0, at: '0,-2', cards: [{ id: 'x', type: 'ranger', owner: 0 }, card('warrior')], acted: false });
  E.apply(s, { type: 'endMove' });
  const u = s.units.find(x => x.owner === 0); assert.equal(u.cards.length, 3);
  assert.equal(s.fallen[0].length, 0, 'not lost'); assert.equal(s.decks[0][0].id, 'x', 'the duplicate is at the bottom of the deck (draws come off the other end)'); assert.equal(s.decks[0][0].type, 'ranger');
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
  for (let seed = 1; seed <= 36; seed++) {
    const s = E.createGame({ seed, first: seed % 2, map: ['classic', 'small', 'large'][seed % 3] });
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
  assert.ok(E.apply(s, { type: 'guess', role: 'warrior' }).ok); assert.equal(s.battle.stage, 'first', 'right: defeated, and they play another'); assert.equal(s.fallen[1].length, 1); assert.equal(s.battle.played[1], null);
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
  assert.ok(E.apply(c, { type: 'ability', ability: 'allegiances', card: cid(c, 1, 'general') }).ok); assert.equal(c.battle.side[1].hand.length + c.battle.side[1].aside.length + c.fallen[0].length, 3, 'one card moved over (or a duplicate was discarded)'); assert.equal(c.battle.side[0].hand.length, 1);
});

test('battles are recorded when they end, so the screen can say who won', () => {
  const s = setup(['basic', 'basic'], ['leader'], ['spy']); assert.equal(s.outcomes.length, 0);
  E.apply(s, { type: 'play', card: cid(s, 1, 'spy') }); E.apply(s, { type: 'play', card: cid(s, 0, 'leader') }); E.apply(s, { type: 'continue' });
  assert.equal(s.outcomes.length, 1); assert.equal(s.outcomes[0].winner, 0); assert.equal(s.outcomes[0].att, 0);
});

// ---------- maps, tunnels, supply, retreat, permanent losses ----------
const play = (opts = {}) => { const s = E.createGame(Object.assign({ seed: 11, first: 0, map: 'small' }, opts)); s.step = 'play'; s.cur = 0; s.flagQueue = []; s.hands = [[], []]; return s; };
const own = (s, ids, p) => ids.forEach(id => { s.castles[id].owner = p; });

test('maps are data: every map has castles with an owner or none, tunnels are worked out (2 or fewer apart), the large map has three starting castles a side', () => {
  const ids = D.maps.map(m => m.id); assert.ok(ids.includes('small') && ids.includes('large'));
  for (const m of D.maps) {
    assert.ok(m.castles.every(c => c.id && c.hex.length === 2 && ['red', 'blue', null].includes(c.startingOwner)), m.id); assert.ok(m.castles.every(c => m.hexes.some(h => h[0] === c.hex[0] && h[1] === c.hex[1])), m.id + ': castles are on the board');
    const mp = E.MAPS[m.id]; for (const [a, b] of mp.tunnels) assert.ok(E.dist(mp.castleHex[a], mp.castleHex[b]) <= 2); 
    for (const a of m.castles) for (const b of m.castles) if (a.id < b.id) { const d = E.dist(mp.castleHex[a.id], mp.castleHex[b.id]); assert.equal(mp.tunnels.some(t => t.includes(a.id) && t.includes(b.id)), d <= 2, m.id + ' ' + a.id + '-' + b.id + ' ' + d); }
  }
  const L = E.MAPS.large; assert.equal(L.starts[0].length, 3); assert.equal(L.starts[1].length, 3); assert.equal(L.castles.length, 10);
  const reach = (mp, from) => { const seen = { [from]: 1 }, st = [from]; while (st.length) { const c = st.pop(); mp.near[c].forEach(n => { if (!seen[n]) { seen[n] = 1; st.push(n); } }); } return Object.keys(seen).length; };
  assert.equal(reach(L, L.starts[0][0]), 10, 'the tunnels join the whole large board'); assert.equal(reach(E.MAPS.small, 'c'), 7);
  assert.equal(E.createGame({ map: 'large', seed: 1 }).map, 'large'); assert.equal(E.createGame({ seed: 1 }).map, 'classic', 'the first board is still available to the tests');
});

test('tunnels: a unit on a held castle travels to any castle of its allied chain with its one action; a lost castle cuts the route', () => {
  const s = play(); s.castles.nw.owner = null; s.castles.ne.owner = null; own(s, ['n', 'c', 'se'], 0); s.units = [{ id: 1, owner: 0, at: '0,-2', cards: [card('ranger')], acted: false }];
  assert.deepEqual(E.tunnelTo(s, s.units[0]).sort(), ['0,0', '2,0'].sort(), 'n joins c, and through c reaches se (several links away)');
  assert.ok(E.apply(s, { type: 'move', unit: 1, to: '2,0' }).ok); assert.equal(s.units[0].at, '2,0'); assert.equal(s.units[0].acted, true, 'it used its one action');
  assert.equal(E.apply(s, { type: 'move', unit: 1, to: '0,0' }).ok, false);
  const t = play(); t.castles.nw.owner = null; t.castles.ne.owner = null; own(t, ['n', 'se'], 0); t.castles.c.owner = 1; t.units = [{ id: 1, owner: 0, at: '0,-2', cards: [card('ranger')], acted: false }]; assert.deepEqual(E.tunnelTo(t, t.units[0]), [], 'the middle castle is lost: se is no longer reachable');
  const u = play(); u.units = [{ id: 1, owner: 0, at: '1,-1', cards: [card('ranger')], acted: false }]; assert.deepEqual(E.tunnelTo(u, u.units[0]), [], 'a unit in the open has no tunnel');
});

test('supply: you can only deploy at your starting castles and the castles chained to them', () => {
  const s = play(); s.hands[0] = [card('ranger'), card('spy')]; own(s, ['s'], 0);
  assert.deepEqual(E.supplied(s, 0).sort(), ['n', 'ne', 'nw'], 'a captured castle with no chain to a starting castle is cut off');
  assert.equal(E.apply(s, { type: 'deploy', card: s.hands[0][0].id, castle: 's' }).ok, false);
  own(s, ['c'], 0); assert.ok(E.supplied(s, 0).includes('s'), 'the chain is restored through the middle'); assert.ok(E.apply(s, { type: 'deploy', card: s.hands[0][0].id, castle: 's' }).ok);
  assert.ok(E.viewFor(s, 0).supply.includes('s'));
});

test('cards stay in hand when you do not deploy them; there is no reshuffle; a hand over 7 loses cards to the Fallen pile', () => {
  const s = play(); s.hands[0] = [card('ranger'), card('spy')]; s.hands[1] = []; s.decks[0] = [];
  assert.ok(E.apply(s, { type: 'endMove' }).ok); assert.equal(s.cur, 1, 'the turn passed with cards still in hand'); assert.equal(s.hands[0].length, 2, 'the cards are still in hand'); assert.equal(s.decks[0].length, 0, 'an empty deck draws nothing and nothing is reshuffled');
  const h = play(); h.hands[0] = Array.from({ length: 8 }, (_, i) => ({ id: '0-x-' + i, type: ['leader', 'general', 'warrior', 'ranger', 'sorcerer', 'spy', 'assassin', 'spy'][i], owner: 0 })); h.decks[0] = [card('ranger'), card('warrior')];
  E.apply(h, { type: 'endMove' }); assert.equal(h.hands[0].length, 10); assert.equal(h.step, 'discard'); assert.equal(E.actor(h), 0);
  assert.equal(E.apply(h, { type: 'discard', cards: ['0-x-0'] }).ok, false, 'exactly three must go'); assert.ok(E.apply(h, { type: 'discard', cards: ['0-x-0', '0-x-1', '0-x-2'] }).ok);
  assert.equal(h.hands[0].length, 7); assert.equal(h.fallen[0].length, 3); assert.equal(h.step, 'play'); assert.equal(h.cur, 1);
});

test('permanent loss: a defeated card goes to the Fallen pile and never returns; running out of cards loses the game', () => {
  const s = setup(['basic', 'basic'], ['leader'], ['spy']); E.apply(s, { type: 'play', card: cid(s, 1, 'spy') }); E.apply(s, { type: 'play', card: cid(s, 0, 'leader') });
  assert.equal(s.fallen[1].length, 1); assert.equal(s.fallen[1][0].type, 'spy'); assert.ok(!s.decks[1].some(c => c.type === 'spy' && c.id === s.fallen[1][0].id)); assert.equal(E.viewFor(s, 0).fallen[1].length, 1, 'the Fallen pile is face up for both players');
  const r = play(); r.hands = [[card('ranger')], []]; r.decks = [[], []]; r.units = [{ id: 1, owner: 0, at: '0,-2', cards: [card('ranger')], acted: false }]; E.apply(r, { type: 'endMove' });
  assert.equal(r.step, 'over'); assert.equal(r.winner, 0, 'blue has no units, no hand and no draw pile');
});

test('retreat: with exactly one card left you may take it to a neighbouring space; you lose the battle; the other side stays and may capture', () => {
  const s = setup(['basic', 'basic'], ['leader', 'general'], ['ranger']);          // red attacks the east castle; blue defends with one card
  const spots = E.retreatSpots(s, 1); assert.ok(spots.length > 0); assert.ok(!spots.includes('0,0'), 'never onto a castle you do not hold'); assert.ok(E.viewFor(s, 1).battle.retreat.length > 0);
  assert.equal(E.retreatSpots(s, 0).length, 0, 'the attacker has two cards and it is not their turn'); assert.equal(E.apply(s, { type: 'retreat', to: '0,0' }).ok, false);
  const to = spots[0]; assert.ok(E.apply(s, { type: 'retreat', to }).ok);
  const u = s.units.find(x => x.owner === 1); assert.equal(u.at, to); assert.equal(u.cards.length, 1); assert.equal(s.fallen[1].length, 0, 'a retreating card is not lost');
  assert.ok(!s.battle || s.step !== 'battle', 'the battle is over'); assert.equal(s.outcomes[0].winner, 0); assert.equal(s.castles.e.owner, 0, 'the attacker captures the castle'); assert.match(s.notice, /Blue retreated 1 card to/);
  assert.ok(!JSON.stringify(E.viewFor(s, 0).units.filter(x => x.owner === 1)).includes('ranger'), 'the card is not revealed');
});

test('retreat from a castle gives the attacker the castle, and the game if it held the flag; two cards or a surrounded unit cannot retreat', () => {
  const s = E.createGame({ seed: 3, first: 1, map: 'classic' }); s.step = 'play'; s.cur = 1; s.flagQueue = []; s.hands = [[], []]; s.castles.nw.flagOf = 0;
  s.units = [{ id: 1, owner: 1, at: '0,-2', cards: [card('leader', 1), card('spy', 1)], acted: false }, { id: 2, owner: 0, at: '0,-2', cards: [card('ranger', 0)], acted: false }];
  E.apply(s, { type: 'endMove' }); assert.equal(s.battle.stage, 'first'); assert.equal(E.actor(s), 0); const to = E.retreatSpots(s, 0)[0]; assert.ok(to);
  assert.ok(E.apply(s, { type: 'retreat', to }).ok); assert.equal(s.step, 'over'); assert.equal(s.winner, 1, 'the attacker took the castle that held the flag');
  const t = setup(['basic', 'basic'], ['leader'], ['ranger', 'spy']); assert.equal(E.retreatSpots(t, 1).length, 0, 'two cards: no retreat');
  const q = setup(['basic', 'basic'], ['leader', 'spy'], ['ranger'], ['1,0', '3,0', '2,-1', '3,-1', '1,1', '2,1'].map((at, i) => ({ id: 80 + i, owner: 0, at, cards: [card('spy', 0)], acted: false })));
  assert.equal(E.retreatSpots(q, 1).length, 0, 'surrounded by enemy units'); assert.equal(E.apply(q, { type: 'retreat', to: '1,0' }).ok, false);
});

test('a retreating card that lands on an allied unit merges, a duplicate going to the bottom of the deck', () => {
  const s = setup(['basic', 'basic'], ['leader', 'general'], ['ranger'], [{ id: 60, owner: 1, at: '2,-1', cards: [card('ranger', 1), card('spy', 1)], acted: false }]);
  assert.ok(E.apply(s, { type: 'retreat', to: '2,-1' }).ok); assert.equal(s.units.filter(u => u.owner === 1).length, 1); assert.equal(s.units.find(u => u.owner === 1).cards.length, 2); assert.equal(s.decks[1][0].type, 'ranger');
});
