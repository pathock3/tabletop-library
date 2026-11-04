const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots } = require('./load');
const card = (type, owner = 0, id) => ({ id: id || owner + '-' + type + '-t', type, owner });

// a battle on the east castle (a neutral castle): red (0) attacks with `att`, blue (1) defends with `def`
function fight(facs, att, def, extra = []) {
  const s = E.createGame({ seed: 7, first: 0, factions: facs, map: 'classic' }); s.step = 'play'; s.cur = 0; s.hands = [[], []]; s.flagQueue = [];
  s.units = [{ id: 1, owner: 0, at: '2,0', cards: att.map(t => card(t, 0)), acted: false }, { id: 2, owner: 1, at: '2,0', cards: def.map(t => card(t, 1)), acted: false }].concat(extra);
  assert.ok(E.apply(s, { type: 'endMove' }).ok); return s;
}
const ok = (s, a) => { const r = E.apply(s, a); assert.ok(r.ok, JSON.stringify(a) + ' ' + r.error); return r; };
const id = (s, p, type) => s.battle.side[p].hand.concat(s.battle.side[p].aside).find(c => c.type === type).id;
const ans = (s, choice) => ok(s, { type: 'answer', choice });
const start = (s, p, ab, extra) => ok(s, Object.assign({ type: 'ability', ability: ab }, extra || {}));
const ready = s => { while (s.battle && s.battle.stage === 'start') ok(s, { type: 'ready' }); };
// a turn on the board for red (0): `hands` and `units`
function turn(facs, hand, units, map = 'small') {
  const s = E.createGame({ seed: 5, first: 0, factions: facs, map }); s.step = 'play'; s.cur = 0; s.flagQueue = []; s.hands = [hand.map(t => card(t, 0)), []];
  s.units = units.map((u, i) => ({ id: 10 + i, owner: u.owner || 0, at: u.at, cards: u.cards.map(t => card(t, u.owner || 0)), acted: false }));
  return s;
}
const pw = (s, ab) => E.viewFor(s, s.cur).powers.find(x => x.ability === ab);
const usePw = (s, ab, extra) => { const x = pw(s, ab); assert.ok(x, ab + ' should be available'); return ok(s, Object.assign({ type: 'power', ability: x.ability, card: x.card }, extra || {})); };

test('every ability of every offered faction is programmed (the data and the engine agree)', () => {
  for (const f of E.offered.filter(x => !x.basic)) for (const role of E.ROLES) { const ab = f.play[role]; assert.ok(ab, f.id + ' ' + role + ' has an ability the game plays'); assert.ok(D.abilities[ab], ab + ' is described'); }
});

test('Fellowship: Foresight peeks, Last Stand +4 alone, Friendly Competition, Gandalf flips to the White, Frodo returns to hand once, Rallying Cry draws', () => {
  let s = fight(['fellowship', 'basic'], ['leader', 'warrior'], ['spy', 'ranger']); assert.deepEqual(E.viewFor(s, 0).battle.abil.map(a => a.ability), ['foresight']);
  start(s, 0, 'foresight', { card: id(s, 0, 'leader') }); ans(s, 0); assert.equal(s.prompt.kind, 'look'); assert.equal(E.viewFor(s, 0).prompt.cards.length, 1); ans(s, 'ok'); assert.equal(E.viewFor(s, 0).battle.known.length, 1, 'the peeked card stays marked'); assert.equal(E.viewFor(s, 1).battle.known.length, 0);
  // Last Stand: Aragorn is the only card left: +4 for one round (11 + 4 = 15 beats the Leader's 14)
  s = fight(['fellowship', 'basic'], ['general'], ['leader']); ready(s); ok(s, { type: 'play', card: id(s, 1, 'leader') }); ok(s, { type: 'play', card: id(s, 0, 'general') }); assert.equal(s.battle.dies[1], true, 'Aragorn alone: 15 against 14'); assert.equal(s.battle.dies[0], false);
  // Friendly Competition: Gimli after a Ranger +2, Legolas after a Warrior +3
  s = fight(['fellowship', 'basic'], ['ranger', 'warrior', 'sorcerer'], ['leader', 'general', 'spy']); ready(s);
  ok(s, { type: 'play', card: id(s, 1, 'spy') }); ok(s, { type: 'play', card: id(s, 0, 'ranger') }); ok(s, { type: 'continue' });
  ok(s, { type: 'play', card: id(s, 0, 'warrior') }); assert.equal(s.battle.mod['0-warrior-t'], 2, 'Gimli played after a Ranger: +2'); ok(s, { type: 'play', card: id(s, 1, 'general') }); assert.equal(s.battle.dies[0], true);
  // Gandalf the Grey is defeated: he flips to the White (P13) and stays
  s = fight(['basic', 'fellowship'], ['leader'], ['sorcerer', 'spy']); ready(s); ok(s, { type: 'play', card: id(s, 1, 'sorcerer') }); ok(s, { type: 'play', card: id(s, 0, 'leader') });
  assert.equal(s.battle.dies[1], false); assert.ok(s.battle.fx[1].includes('gandalf')); const g = s.battle.side[1].aside[0]; assert.equal(E.nameOf(g, s.fac), 'Gandalf the White'); assert.equal(E.powerOf(g, s.fac), 7 + 6, 'the Grey 7 plus the White +6');
  // Frodo: defeated once, he returns to your hand (the one rescue of the game); the second time he is lost
  s = fight(['basic', 'fellowship'], ['ranger', 'warrior'], ['assassin', 'spy']); ready(s); ok(s, { type: 'play', card: '1-assassin-t' }); ok(s, { type: 'play', card: '0-ranger-t' });
  assert.equal(s.battle.dies[1], false); assert.ok(s.battle.fx[1].includes('frodo')); assert.equal(s.hands[1].some(c => c.id === '1-assassin-t'), true, 'Frodo is back in the hand, out of the battle'); assert.equal(s.fallen[1].length, 0);
  s = fight(['basic', 'fellowship'], ['ranger', 'warrior'], ['assassin', 'spy']); s.frodo[1] = true; ready(s); ok(s, { type: 'play', card: '1-assassin-t' }); ok(s, { type: 'play', card: '0-ranger-t' }); assert.equal(s.battle.dies[1], true, 'the rescue is used up');
  // Rallying Cry: fewer castles than the opponent: draw
  s = turn(['fellowship', 'basic'], ['spy'], []); s.castles.n.owner = 1; s.castles.nw.owner = 1; const hand0 = s.hands[0].length; usePw(s, 'rally'); assert.equal(s.hands[0].length, hand0 + 1, 'drew a card'); assert.equal(pw(s, 'rally'), undefined, 'once per turn');
  const eq = turn(['fellowship', 'basic'], ['spy'], []); assert.equal(pw(eq, 'rally'), undefined, 'not with castles to spare');
});

test('Mordor: Sauron, Gollum, Witch-king, Cave Troll, Orc Horde, Gríma, The One Ring', () => {
  let s = turn(['mordor', 'basic'], ['leader', 'spy'], []); s.fallen[0] = [card('ranger', 0, 'f1'), card('warrior', 0, 'f2'), card('assassin', 0, 'f3')]; const dk0 = s.decks[0].length;
  usePw(s, 'darklord'); assert.equal(s.prompt.kind, 'pick'); ans(s, ['f1', 'f2']); assert.equal(s.fallen[0].length, 1); assert.equal(s.decks[0].length, dk0 + 2, 'shuffled back into the deck');
  usePw(s, 'precious'); assert.equal(s.hands[0].some(c => c.id === 'f3'), true, 'Gollum brings an Assassin from the Fallen pile to the hand'); assert.equal(s.fallen[0].length, 0);
  s = turn(['mordor', 'basic'], [], [{ at: '0,-2', cards: ['general'] }, { owner: 1, at: '0,2', cards: ['spy', 'ranger'] }]); usePw(s, 'eye'); ans(s, 11); assert.equal(s.prompt.kind, 'look'); assert.equal(E.viewFor(s, 0).prompt.cards.length, 2, 'you see the unit');
  s = fight(['mordor', 'basic'], ['warrior', 'spy'], ['leader', 'ranger']); ready(s); ok(s, { type: 'play', card: id(s, 1, 'leader') }); ok(s, { type: 'play', card: id(s, 0, 'warrior') }); assert.equal(s.battle.dies[0], false, 'the Cave Troll survives the first time'); assert.ok(s.battle.fx[0].includes('troll'));
  s = fight(['mordor', 'basic'], ['ranger', 'spy'], ['spy', 'ranger']); s.decks[0] = [card('warrior', 0, 'dd')]; ready(s); ok(s, { type: 'play', card: id(s, 1, 'spy') }); ok(s, { type: 'play', card: id(s, 0, 'ranger') }); assert.equal(s.hands[0].some(c => c.id === 'dd'), true, 'Orc Horde draws a card when played');
  s = fight(['mordor', 'basic'], ['sorcerer', 'spy'], ['leader', 'ranger']); start(s, 0, 'whisper', { card: id(s, 0, 'sorcerer') }); ans(s, 0); assert.equal(s.battle.side[1].aside.length, 1, 'a card of theirs is moved to the survivor pile'); assert.equal(s.battle.side[1].hand.length, 1);
  s = fight(['mordor', 'basic'], ['assassin', 'spy'], ['leader', 'ranger']); s.decks[0] = [card('ranger', 0, 'x'), card('leader', 0, 'L'), card('warrior', 0, 'y')]; ready(s); ok(s, { type: 'play', card: id(s, 1, 'leader') }); ok(s, { type: 'play', card: id(s, 0, 'assassin') });
  assert.equal(s.prompt.ab, 'rq'); ans(s, 'yes'); assert.equal(s.decks[0][s.decks[0].length - 1].id, 'L', 'a Leader from the deck is put on top'); assert.equal(s.battle.stage, 'result');
});

test('Benders: Counter Summon, Mind Capture, Memory Break, Telekinetic Blast, Stun, Glimpse, Telepathic Command', () => {
  let s = turn(['benders', 'basic'], [], [{ at: '0,0', cards: ['leader', 'spy'] }, { owner: 1, at: '2,-2', cards: ['ranger', 'warrior'] }]); usePw(s, 'counter'); ans(s, 11); ans(s, '1-ranger-t'); assert.equal(s.fallen[1].length, 1); assert.equal(s.units.find(u => u.id === 11).cards.length, 1);
  s = turn(['benders', 'basic'], [], [{ at: '0,0', cards: ['ranger'] }, { owner: 1, at: '1,0', cards: ['warrior'] }]); usePw(s, 'blast'); ans(s, 11); assert.equal(s.units.find(u => u.id === 11).at, '2,0', 'pushed one space directly away');
  s = turn(['benders', 'basic'], [], [{ at: '0,0', cards: ['sorcerer'] }, { owner: 1, at: '1,0', cards: ['warrior', 'spy'] }]); usePw(s, 'stun'); ans(s, 11); ans(s, 0); assert.equal(s.units.find(u => u.id === 11).cards[0].stun, true);
  s = turn(['benders', 'basic'], ['spy'], []); s.decks[0] = [card('ranger', 0, 'a'), card('leader', 0, 'b'), card('warrior', 0, 'c')]; usePw(s, 'glimpse'); ans(s, 0); ans(s, 'c'); assert.equal(s.decks[0][s.decks[0].length - 1].id, 'c', 'the chosen one is on top'); assert.equal(s.fallen[0].some(c => c.id === 'b'), true, 'the other goes to the Fallen pile');
  s = turn(['benders', 'basic'], [], [{ at: '0,0', cards: ['assassin', 'leader'] }, { owner: 1, at: '1,0', cards: ['ranger'] }]); usePw(s, 'telepathy'); ans(s, '0-leader-t'); ans(s, 11); ans(s, 0); assert.equal(s.fallen[1].length, 1, 'the Leader safely defeats the Ranger');
  s = fight(['benders', 'basic'], ['general', 'spy'], ['ranger', 'warrior']); ready(s); ok(s, { type: 'play', card: id(s, 1, 'ranger') }); ok(s, { type: 'play', card: id(s, 0, 'general') }); assert.equal(s.battle.dies[1], true); assert.equal(s.hands[0].some(c => c.type === 'ranger'), true, 'Mind Capture: the defeated card joins your hand'); assert.equal(s.fallen[1].length, 0);
  s = fight(['benders', 'basic'], ['warrior', 'spy'], ['ranger', 'leader']); s.decks[1] = [card('assassin', 1, 'top')]; ready(s); ok(s, { type: 'play', card: id(s, 1, 'ranger') }); ok(s, { type: 'play', card: id(s, 0, 'warrior') }); assert.equal(s.prompt.ab, 'rq'); assert.equal(E.viewFor(s, 0).prompt.cards[0].id, 'top'); ans(s, 'fallen'); assert.equal(s.fallen[1].some(c => c.id === 'top'), true);
});

test('Game of Thrones: Daenerys, Outsmart, Brienne, Jon Snow, Melisandre, Varys, Arya', () => {
  let s = turn(['got', 'basic'], ['leader'], []); usePw(s, 'dragons'); const d = s.hands[0].find(c => E.CT[c.type].ally); assert.ok(d, 'a dragon card is in hand'); assert.ok(E.powerOf(d, s.fac) >= 11); assert.equal(s.hands[0].filter(c => E.CT[c.type].ally).length, 1);
  s = turn(['got', 'basic'], ['sorcerer'], []); s.fallen[0] = [card('warrior', 0, 'w')]; usePw(s, 'resurrect'); ans(s, 'w'); assert.equal(s.decks[0][s.decks[0].length - 1].id, 'w', 'from the Fallen pile to the top of the deck');
  s = fight(['got', 'basic'], ['general', 'spy'], ['warrior', 'ranger']); start(s, 0, 'outsmart', { card: id(s, 0, 'general') }); ready(s); ok(s, { type: 'play', card: id(s, 1, 'ranger') }); assert.equal(s.battle.stage, 'guess'); ok(s, { type: 'guess', role: 'ranger' }); assert.equal(s.fallen[1].length, 1, 'a right guess defeats the card');
  s = fight(['got', 'basic'], ['spy', 'leader'], ['warrior', 'ranger']); assert.deepEqual(E.viewFor(s, 0).battle.abil, [], 'Outsmart is only for castles, and only the GoT side has it'); 
  s = fight(['basic', 'got'], ['leader', 'spy'], ['warrior', 'spy']); start(s, 1, 'network', { card: id(s, 1, 'spy') }); ans(s, 'leader'); assert.equal(s.prompt.ab, 'network', 'they hold a Leader: keep asking'); ans(s, 'general'); assert.equal(s.prompt, null, 'the answer was no: done'); assert.equal(s.battle.used[1].network, true);
  s = fight(['basic', 'got'], ['leader', 'spy'], ['ranger', 'warrior']); const jon = id(s, 1, 'ranger'); start(s, 1, 'guardian', { card: jon }); ans(s, 0); assert.equal(s.prompt.kind, 'look'); ans(s, 'ok'); assert.equal(s.prompt.kind, 'hex'); const esc = s.prompt.hexes[0]; ans(s, esc);
  assert.equal(s.units.some(u => u.owner === 1 && u.at === esc && u.cards[0].id === jon), true, 'Jon escapes to a nearby space'); assert.equal(s.battle.side[1].hand.some(c => c.id === jon), false);
  s = fight(['basic', 'got'], ['leader', 'spy'], ['general', 'warrior']); ready(s); ok(s, { type: 'play', card: '1-general-t' }); ok(s, { type: 'play', card: '0-leader-t' }); assert.equal(s.prompt.ab, 'rq'); assert.equal(s.prompt.step, 'protector'); ans(s, 'yes'); assert.equal(s.battle.dies[1], false, 'Brienne takes the blow'); assert.ok(s.battle.fx[1].includes('protector')); assert.equal(s.fallen[1].some(c => c.id === '1-warrior-t'), true, 'and is the one that falls'); assert.equal(s.battle.stage, 'result');
  // Arya: they play a Leader and I may swap my card for Arya (Assassin 2+... the Leader's weakness)
  s = fight(['basic', 'got'], ['leader', 'spy'], ['assassin', 'general']); ready(s); ok(s, { type: 'play', card: '1-general-t' }); ok(s, { type: 'play', card: '0-leader-t' });
  assert.equal(s.battle.stage, 'swap'); assert.equal(s.battle.swapKind, 'arya'); assert.equal(E.actor(s), 1); ok(s, { type: 'swap', card: '1-assassin-t' }); assert.equal(s.battle.dies[0], true, 'Arya (an Assassin) defeats the Leader'); assert.equal(s.battle.dies[1], false);
});

test('Pokémon: Hyper Beam, Rest, Mega Evolve, Psychic, Fly, Transform, Charizard', () => {
  let s = fight(['basic', 'pokemon'], ['leader', 'spy'], ['general', 'ranger']); ready(s); assert.deepEqual(E.viewFor(s, 1).battle.flags.map(f => f.ability), ['hyper']);
  ok(s, { type: 'play', card: id(s, 1, 'general'), power: 'hyper' }); ok(s, { type: 'play', card: id(s, 0, 'leader') }); assert.equal(s.battle.dies[0], true, 'Dragonite 12 + 4 beats the Leader 14');
  const s2 = fight(['basic', 'pokemon'], ['general', 'spy'], ['warrior', 'ranger']); ready(s2); ok(s2, { type: 'play', card: id(s2, 1, 'warrior'), power: 'rest' }); ok(s2, { type: 'play', card: id(s2, 0, 'general') }); assert.equal(s2.battle.dies[1], false, 'Rest: it survives'); assert.ok(s2.battle.fx[1].includes('rest'));
  const s3 = fight(['basic', 'pokemon'], ['warrior', 'spy'], ['assassin', 'ranger']); ready(s3); ok(s3, { type: 'play', card: id(s3, 1, 'assassin'), power: 'mega' }); ok(s3, { type: 'play', card: id(s3, 0, 'warrior') }); assert.equal(s3.battle.result, 'both', 'Gengar 2 + 8 = 10: a tie with the Warrior');
});

test('Pokémon part two: Psychic goes first, Pidgeot flies, Ditto transforms, Charizard stays out', () => {
  let s = fight(['basic', 'pokemon'], ['leader', 'spy'], ['sorcerer', 'ranger']); ready(s); assert.equal(s.battle.first, 1); assert.equal(E.viewFor(s, 0).battle.psychic, false);
  s = fight(['pokemon', 'basic'], ['sorcerer', 'spy'], ['leader', 'ranger']); ready(s); assert.equal(s.battle.first, 1); assert.equal(E.viewFor(s, 0).battle.psychic, true, 'the other side leads and Mewtwo is in hand'); ok(s, { type: 'ability', ability: 'psychic', by: 0 }); assert.equal(s.battle.first, 0, 'Mewtwo goes first'); assert.equal(E.actor(s), 0); assert.equal(E.viewFor(s, 0).battle.psychic, false, 'once per battle');
  s = turn(['pokemon', 'basic'], [], [{ at: '0,-2', cards: ['ranger', 'spy'] }]); const u = s.units[0]; const fly = E.flyTo(s, u); assert.ok(fly.length > 5 && !fly.includes('0,0') && !fly.some(k => E.hexCastle[k]), 'any empty space with no castle'); ok(s, { type: 'move', unit: u.id, to: fly[0] }); assert.equal(u.at, fly[0]); assert.equal(u.acted, true);
  s = turn(['pokemon', 'got'], ['spy'], []); s.hands[0][0].id = 'ditto'; usePw(s, 'transform'); ans(s, 'ranger'); assert.equal(s.hands[0][0].copy, 'guardian', 'Ditto gains the ability of the enemy ranger'); assert.equal(E.abOf(s, s.hands[0][0]), 'guardian');
  s = fight(['pokemon', 'basic'], ['leader', 'spy'], ['ranger', 'warrior']); ready(s); ok(s, { type: 'play', card: '1-ranger-t' }); ok(s, { type: 'play', card: '0-leader-t' }); assert.equal(s.prompt.step, 'fury'); ans(s, 'yes'); ok(s, { type: 'continue' });
  assert.equal(s.battle.played[0].type, 'leader', 'Charizard stays out'); assert.equal(s.battle.first, 1, 'the opponent plays first'); assert.equal(E.actor(s), 1);
});

test('Survivor part two: Cause Chaos (every roll) and Spy Shack', () => {
  const rolls = {};
  for (let seed = 1; seed < 300 && Object.keys(rolls).length < 6; seed++) { const s = turn(['survivor', 'basic'], ['assassin'], [{ owner: 1, at: '0,2', cards: ['spy', 'ranger', 'warrior', 'general'] }, { owner: 1, at: '2,0', cards: ['leader'] }]); s.rng = seed; usePw(s, 'chaos'); const r = s.prompt.data.roll; if (!rolls[r]) rolls[r] = seed; }
  assert.equal(Object.keys(rolls).length, 6, 'all six rolls came up');
  const run = r => { const s = turn(['survivor', 'basic'], ['assassin'], [{ owner: 1, at: '0,2', cards: ['spy', 'ranger', 'warrior', 'general'] }, { owner: 1, at: '2,0', cards: ['leader'] }]); s.rng = rolls[r]; usePw(s, 'chaos'); assert.equal(s.prompt.data.roll, r); ans(s, 'ok'); return s; };
  let s = run(6); ans(s, 10); ans(s, '1-ranger-t'); assert.equal(s.units.find(u => u.id === 10).cards.length, 3); assert.equal(s.decks[1][0].id, '1-ranger-t', 'buried at the bottom of their deck');
  s = run(5); ans(s, 10); const dest = s.prompt.hexes[0]; ans(s, dest); assert.equal(s.units.find(u => u.id === 10).cards.length, 2); assert.equal(s.units.find(u => u.at === dest && u.owner === 1).cards.length, 2, 'half the unit moved to the space I chose');
  s = run(4); assert.equal(s.hands[0].length, 2, 'draws a card (the assassin and one more)');
  s = run(3); ans(s, 10); ans(s, 11); assert.equal(s.units.find(u => u.id === 10).at, '2,0'); assert.equal(s.units.find(u => u.id === 11).at, '0,2', 'two enemy units swapped places');
  s = run(2); assert.equal(s.prompt, null, 'Sabotage has no effect on the cards sheet');
  s = run(1); assert.equal(s.hands[0].length, 0); assert.equal(s.hands[1].length, 1, 'Russell goes to the opponent');
  s = turn(['survivor', 'basic'], [], [{ at: '0,2', cards: ['warrior', 'spy', 'leader'] }, { owner: 1, at: '1,2', cards: ['ranger'] }]); usePw(s, 'shack'); ans(s, 'yes'); const sh = s.units.find(u => u.id === 10); assert.equal(sh.shack, true); assert.equal(sh.cards.length, 1); assert.equal(s.fallen[0].length, 2, 'the other cards are lost');
  assert.equal(E.apply(s, { type: 'move', unit: 10, to: '0,1' }).ok, false, 'a Spy Shack never moves'); assert.deepEqual(E.reachable(s, sh), []);
  usePw(s, 'shacklook'); ans(s, 11); assert.equal(s.prompt.kind, 'look'); assert.equal(E.viewFor(s, 0).prompt.cards.length, 1);
});

test('Undo takes back a power; cancelling a question restores the board', () => {
  const s = turn(['benders', 'basic'], [], [{ at: '0,0', cards: ['leader', 'spy'] }, { owner: 1, at: '2,-2', cards: ['ranger', 'warrior'] }]); const before = JSON.stringify(s.units);
  usePw(s, 'counter'); assert.ok(s.prompt.cancel); ok(s, { type: 'cancel' }); assert.equal(s.prompt, null); assert.equal(JSON.stringify(s.units), before); assert.ok(pw(s, 'counter'), 'it can be used again');
  usePw(s, 'counter'); ans(s, 11); ans(s, '1-ranger-t'); assert.equal(s.fallen[1].length, 1); ok(s, { type: 'undo' }); assert.equal(s.fallen[1].length, 0, 'the whole power is taken back'); assert.equal(JSON.stringify(s.units), before);
});

test('computer players use every kind of ability without breaking the game', () => {
  const ids = E.offered.filter(f => !f.basic).map(f => f.id);
  for (let seed = 1; seed <= 24; seed++) {
    const s = E.createGame({ seed, first: seed % 2, factions: [ids[seed % ids.length], ids[(seed + 2) % ids.length]], map: ['small', 'large', 'classic'][seed % 3] }); let n = 0;
    while (s.step !== 'over' && n++ < 40000) { const p = E.actor(s), r = E.apply(s, Bots.nextAction(E.viewFor(s, p), () => Math.random())); assert.ok(r.ok, 'seed ' + seed + ' ' + s.step + ': ' + r.error); }
    assert.equal(s.step, 'over', 'seed ' + seed);
  }
});
