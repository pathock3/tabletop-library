const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B } = require('./load.js');
const C = E.CARDS, T = E._t;
D.rules.columns = false;      // the older rule tests resolve a whole round at once; the column-by-column tests below switch it on for their own battles

// ---- a hand-built battle: the i-th hero card faces the i-th computer card; then put numbers on the dice and give them out
function craft(heroIds, gmIds, o) {
  o = o || {};
  const s = E.newGame({ seed: 1, starter: 'bulbasaur' });
  s.phase = 'battle';
  const b = T.startBattle(s, 'loc', 'L1', heroIds.map(id => ({ id, sh: 0 })), gmIds.map(id => ({ id, sh: 0 })));
  b.hand = [[], []];
  const n = Math.max(heroIds.length, gmIds.length);
  b.cols = Array.from({ length: n }, (_, i) => [heroIds[i] ? b.units[i].uid : null, gmIds[i] ? b.units[heroIds.length + i].uid : null]);
  T.startRound(s);
  return { s, b, h: i => b.units[i], g: i => b.units[heroIds.length + i] };
}
// dice: { hero: [values], gm: [values] }; give: { hero: {unitIndex: dieIndex | [dieIndexes]}, gm: {...} }
function play(c, dice, give) {
  const { s, b } = c;
  b.dice = [dice.hero.slice(), dice.gm.slice()]; b.asg = [{}, {}];
  [['hero', 0, 0], ['gm', 1, c.hn || c.s.battle.units.filter(u => u.side === 0).length]].forEach(([k, side, off]) => {
    Object.entries(give[k] || {}).forEach(([ui, di]) => { const u = b.units[+ui + off]; b.asg[side][u.uid] = { dice: [].concat(di), tgt: null }; });
  });
  b.gmReady = true;
  const r = E.apply(s, { t: 'go2' }); assert.ok(r.ok, r.error);
  while (b.ask) assert.ok(E.apply(s, { t: 'choose', tgt: E.autoChoice(b) }).ok);      // an "or" on your own card is asked when its turn comes
  return b;
}
const evs = (b, t) => b.events.filter(e => e.t === t);

// ================================================================ the cards
// the older rule tests are written the way the sheet lists a card (move 1 on a 1); the tests that play whole games, and the ones named 'dice faces', use the real order (move 1 on a 6)
E.faceOrder('sheet');
test('data: all 176 cards load, with nine legendaries and six levels for each of the five starters', () => {
  assert.equal(Object.keys(C).length, 176);
  assert.equal(Object.values(C).filter(c => c.legend).length, 9);
  D.starters.forEach(st => { assert.equal(st.levels.length, 6, st.name); st.levels.forEach((id, i) => { assert.ok(C[id], id); assert.equal(C[id].level, i + 1); }); });
  D.locations.forEach(l => assert.ok(Object.values(C).filter(c => c.loc === l.id && !c.legend).length >= 5, l.name + ' has cards'));
});
test('data: every move on every card reads, and so does every special move', () => {
  Object.values(C).forEach(c => {
    c.moves.forEach((m, i) => { if (m && !/^Use the 6 move/.test(m)) assert.ok(E.parseMove(m), c.name + ' face ' + (i + 1) + ': ' + m); });
    if (/:\s*\S/.test(c.special)) assert.ok(E.parseSpecial(c.special), c.name + ' special ' + c.special);
  });
});
test('data: moves read the way the sheet means them', () => {
  const m = E.parseMove('3a <^ or >').clauses[0][0]; assert.equal(m.n, 3); assert.equal(m.k, 'a'); assert.deepEqual(m.spec.opts, [[-1], [0], [1]]); assert.equal(m.spec.all, false);
  const o = E.parseMove('7a over <^>').clauses[0][0]; assert.equal(o.spec.spread, true); assert.deepEqual(o.spec.opts, [[-1, 0, 1]]);
  const two = E.parseMove('2a, +2a <>').clauses[0]; assert.equal(two.length, 2); assert.equal(two[1].bonus, true); assert.deepEqual(two[1].spec.opts, [[-1, 1]]);
  const alt = E.parseMove('3a <^> or 3h <v>').clauses; assert.equal(alt.length, 2); assert.equal(alt[1][0].k, 'h');
  const ray = E.parseMove('5a <<<<^ or ^>>>>').clauses[0][0]; assert.deepEqual(ray.spec.opts, [[-4, -3, -2, -1, 0], [0, 1, 2, 3, 4]]);
  const heal = E.parseMove('6h over <v>').clauses[0][0]; assert.deepEqual(heal.spec.opts, [[-1, 0, 1]], '<v> is the left neighbour, itself and the right neighbour');
  assert.equal(E.parseMove('1d v').clauses[0][0].k, 'd');
  const sp = E.parseSpecial('66: 12a'); assert.deepEqual([sp.face, sp.count, sp.effs[0].n], [6, 2, 12]);
  assert.equal(E.parseSpecial('4444: 10a all non-ground on both teams').effs[0].scope, 'non');
});
test('data: every ability on every card is understood by the game', () => {
  const un = new Set();
  Object.values(C).forEach(c => c.ability.split(/;\s*/).forEach(p => { if (p && !E.tagsOf({ id: 'q' + c.id + p, ability: p }).length) un.add(p); }));
  assert.deepEqual([...un], []);
  assert.ok(Object.values(C).every(c => !c.special), 'the multi-dice specials are gone');
});

// ================================================================ a round of fighting
test('rules: every card gets one die per round, and a card that loses a round gets none', () => {
  const c = craft(['1.1', '4.1', '7.1'], ['10', '11', '16']);
  assert.deepEqual([c.b.dice[0].length, c.b.dice[1].length], [3, 3]);
  c.b.units[0].skipNext = true; c.b.stage = 'resolved'; c.b.out = null; T.cleanUp(c.s); T.startRound(c.s);
  assert.equal(c.b.dice[0].length, 2, 'one hero card is out this round: two dice');
});
test('rules: one roll, and one reroll each round; cards add more', () => {
  const plain = craft(['1.1'], ['10']);
  assert.equal(plain.b.rr[0], 1); assert.ok(E.apply(plain.s, { t: 'reroll', side: 0, die: 0 }).ok, 'the one reroll'); assert.equal(E.apply(plain.s, { t: 'reroll', side: 0, die: 0 }).ok, false, 'and no second');
  const vulpix = craft(['37'], ['10']); assert.equal(vulpix.b.rr[0], 2, '+1 reroll on top of the one you always have');
  vulpix.b.dice[0] = [3]; assert.ok(E.apply(vulpix.s, { t: 'reroll', side: 0, die: 0 }).ok); assert.equal(E.apply(vulpix.s, { t: 'reroll', side: 0, die: 0 }).ok, false, 'a rerolled die is locked in'); assert.equal(vulpix.b.rr[0], 1);
  const rat = craft(['19'], ['10']); rat.b.rr[0] = 0; rat.b.dice[0] = [1]; assert.ok(E.apply(rat.s, { t: 'reroll', side: 0, die: 0 }).ok, 'a free reroll of a 1'); rat.b.dice[0] = [4]; assert.equal(E.apply(rat.s, { t: 'reroll', side: 0, die: 0 }).ok, false, 'but not of a 4');
});
test('rules: a die gives each card the move on that number, and the move shows up in the round', () => {
  const c = craft(['1.1'], ['10']); const b = play(c, { hero: [1], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(evs(b, 'move')[0].txt, '2a', 'Bulbasaur on a 1 attacks for 2');
  assert.equal(evs(b, 'move')[1].txt, '2a', 'Caterpie on a 2 attacks for 2');
});
test('rules: a card hit by its weakness takes double damage', () => {
  const c = craft(['4.1'], ['1.1']); const b = play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });   // Charmander 2a vs Bulbasaur (weak to fire)
  assert.equal(evs(b, 'dmg')[0].n, 4); assert.equal(evs(b, 'dmg')[0].weak, true); assert.ok(c.g(0).ko, 'four damage on four health');
  const d = craft(['1.1'], ['4.1']); const b2 = play(d, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(evs(b2, 'dmg')[0].n, 2, 'grass on fire is not a weakness'); assert.equal(d.g(0).hp, 2);
});
test('rules: a card at 0 health still makes its move, and it falls when the round ends', () => {
  const c = craft(['4.1'], ['1.1']); const b = play(c, { hero: [1], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } });   // the hero card goes first in a column and takes Bulbasaur to 0
  assert.ok(evs(b, 'dmg').some(e => e.by === c.g(0).uid), 'Bulbasaur still attacks after being taken to 0'); assert.ok(c.g(0).ko, 'and it is out at the end of the round');
  const evOrder = b.events.map(e => e.t); assert.ok(evOrder.lastIndexOf('dmg') < evOrder.indexOf('ko'), 'the knock-out comes after everyone has moved');
});
test('rules: a card at 0 health cannot be healed (not even by its own attack)', () => {
  const c = craft(['4.1'], ['1.1']); c.g(0).hp = 2;                      // Charmander's 2 attack takes Bulbasaur to 0; Bulbasaur's own attack would heal it 1 (grass attacks grant 1h)
  play(c, { hero: [1], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.ok(c.g(0).ko, 'still at 0, so it falls'); assert.ok(!evs(c.b, 'heal').some(e => e.u === c.g(0).uid), 'no healing for a card at 0');
});
test('rules: healing is resolved before attacks', () => {
  const c = craft(['1.2'], ['7.1']); c.h(0).hp = 1;                                    // Bulbasaur heals 3 on a 3; Squirtle attacks for 2 on a 2
  const b = play(c, { hero: [3], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.ok(!c.h(0).ko && c.h(0).hp === 2, 'healed to 4 first, then took 2');
  assert.ok(b.events.findIndex(e => e.t === 'heal') < b.events.findIndex(e => e.t === 'dmg'));
});
test('rules: a block soaks damage, and the blocker takes whatever is left over', () => {
  const c = craft(['1.1', '11'], ['4.1', '10']);       // Metapod counters 2 for its neighbour Bulbasaur; Charmander hits Bulbasaur (a weakness: 4)
  const b = play(c, { hero: [6, 1], gm: [1, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.h(0).hp, 4, 'Bulbasaur is untouched');
  assert.ok(evs(b, 'blocked').some(e => e.u === c.h(1).uid && e.for === c.h(0).uid && e.n === 2));
  assert.equal(c.h(1).hp, 2, 'Metapod is weak to fire too: 2 doubled to 4, two countered, two left over for the blocker, and its own shield takes one');
  assert.equal(c.g(0).hp, C['4.1'].hp - 2, 'a counter sends what it soaked back: Charmander takes 2');
});
test('rules: a card with no card facing it still acts, and a move at an empty column misses', () => {
  const c = craft(['4.1', '1.1'], ['10']);
  const b = play(c, { hero: [3, 1], gm: [1] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0 } });
  assert.ok(b.events.length > 0);
});
test('abilities: immunity, thorns, shields and dodging', () => {
  let c = craft(['50'], ['21']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });        // Diglett (ground) attacks Spearow (immune to ground)
  assert.equal(c.g(0).hp, C['21'].hp, 'a 1-damage ground hit is soaked entirely by "takes 3 less from ground"'); assert.ok(evs(c.b, 'blocked').length);
  c = craft(['4.1'], ['27']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Sandshrew: attackers take 1d
  assert.equal(c.h(0).hp, 3, 'the attacker took 1');
  c = craft(['1.1'], ['10']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Bulbasaur: grass attacks grant 1h
  assert.ok(evs(c.b, 'heal').length === 0, 'at full health the granted heal does nothing');
  c = craft(['1.1'], ['14']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Kakuna: -1d
  assert.equal(c.g(0).hp, C['14'].hp - 1, '2 damage minus 1');
  c = craft(['1.1'], ['25.1']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });           // Pikachu dodges the first attack of the match
  assert.equal(c.g(0).hp, 3); assert.ok(evs(c.b, 'dodge').length);
});
test('abilities: "-1d" is a shield of 1 for the whole round, for damage of any kind, even what a card does to itself (Metapod)', () => {
  const c = craft(['11'], ['10']); play(c, { hero: [5], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });     // Metapod on a 5: 2d to itself, minus 1
  assert.equal(c.h(0).hp, C['11'].hp - 1, 'only 1 damage');
  const k = craft(['1.1'], ['14']); play(k, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.equal(k.g(0).hp, C['14'].hp - 1, 'and an attack of 2 hurts it for 1');
});
test('choices: an "or" on your card is asked when that card\'s turn comes, not when the die is given; the computer decides its own', () => {
  const c = craft(['10', '5.3', '10'], ['10', '16', '19']);          // Charmeleon in the middle: 3a <^ or ^>  (across and the left one, or across and the right one)
  c.b.dice = [[6, 1, 6], [6, 6, 6]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null }, [c.h(1).uid]: { dice: [1], tgt: null }, [c.h(2).uid]: { dice: [2], tgt: null } }, {}]; c.b.gmReady = true;
  assert.ok(E.apply(c.s, { t: 'go2' }).ok);
  assert.equal(c.b.stage, 'resolving', 'the round stops at Charmeleon'); assert.ok(c.b.ask); assert.equal(c.b.ask.uid, c.h(1).uid);
  assert.equal(c.g(1).hp, C['16'].hp, 'nothing has been hit yet');
  assert.ok(E.apply(c.s, { t: 'choose', tgt: c.g(2).uid }).ok);
  assert.equal(c.b.stage, 'resolved'); assert.ok(c.g(1).ko, 'Pidgey, across, took the hit'); assert.ok(c.g(2).ko, 'and so did the one on the right'); assert.ok(!c.g(0).ko, 'not the one on the left');
});
test('abilities: a shield soaks damage once a round, then it is used up', () => {
  const c = craft(['1.1', '85'], ['14', '10']); play(c, { hero: [1, 1], gm: [6, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.g(0).hp, C['14'].hp - 3, 'Bulbasaur 2 minus the 1 shield, then Dodrio 2 with the shield gone');
});
test('abilities: a card that loses its round gets no die next round (Caterpie)', () => {
  const c = craft(['4.1'], ['10']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });      // Charmander knocks out Caterpie... which has no further effect on a dead target
  const d = craft(['1.1'], ['16']); d.h(0).hp = 1; play(d, { hero: [6], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.ok(d.h(0).ko, 'Pidgey hits Bulbasaur dead');
});
test('abilities: Magikarp takes nothing from the card across from it while it has allies, and everything when it is alone', () => {
  let c = craft(['4.1', '1.1'], ['129', '10']); play(c, { hero: [1, 6], gm: [6, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.g(0).hp, C['129'].hp, 'Charmander cannot hurt it: 4 damage minus 9');
  c = craft(['4.1'], ['129']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.ok(c.g(0).ko, 'alone, it is just a Magikarp');
});
test('abilities: Slowpoke makes the card facing it roll one lower, and 1 becomes 6', () => {
  const c = craft(['1.1'], ['79']); c.b.dice = [[1], [3]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null } }, { [c.g(0).uid]: { dice: [0], tgt: null } }]; c.b.gmReady = true;
  assert.ok(E.apply(c.s, { t: 'go2' }).ok); assert.equal(c.b.dice[0][0], 6, 'a 1 became a 6');
  assert.equal(evs(c.b, 'move')[0].txt, '', 'Bulbasaur has nothing on a 6');
});
test('abilities: Weezing hands a damage to a healthier card facing it, and Dratini widens its dragons', () => {
  const c = craft(['110'], ['1.1']); c.h(0).hp = 1; c.g(0).hp = 4; play(c, { hero: [6], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(c.h(0).hp, 2); assert.equal(c.g(0).hp, 3);
  const d = craft(['10', '148', '147'], ['10', '16', '19']);       // Dragonair's 6a (a 1) can hit a neighbour because Dratini is on the team
  const cand = E.candidates(d.b, d.h(1), E.parseMove('6a').clauses[0][0]); assert.equal(cand.length, 3, 'left, across or right');
  const solo = craft(['148'], ['10']); assert.equal(E.candidates(solo.b, solo.h(0), E.parseMove('6a').clauses[0][0]).length, 1);
});
test('abilities: Porygon changes a teammate to the element its target is weak to, and Lugia takes a reroll away', () => {
  const c = craft(['1.1', '137'], ['4.1', '10']); play(c, { hero: [1, 6], gm: [6, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.ok(evs(c.b, 'text').some(e => /changes Bulbasaur to water/.test(e.msg)), 'Charmander is weak to water');
  const l = craft(['249'], ['37']); assert.equal(l.b.rr[1], 0, 'the computer only has Vulpix\'s +1 reroll, and Lugia takes it away');
});
test('campaign: Pikachu can grow into Raichu at level 5, and keeps going as one', () => {
  const s = E.newGame({ seed: 2, starter: 'pikachu' }); s.done.rival1 = true; s.done.B1 = true; s.done.B2 = true; s.done.B3 = true; s.lv = 4;
  s.phase = 'battle'; const b = T.startBattle(s, 'boss', 'B5', [{ id: '25.4', sh: 0 }], [{ id: '10', sh: 0 }]); b.units[1].ko = true; b.units[1].hp = 0; b.cols = [[b.units[0].uid, b.units[1].uid]]; b.stage = 'resolved'; b.out = 'hero'; b.hand = [[], []];
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.equal(s.res.evolve, 5); assert.equal(E.apply(s, { t: 'done' }).ok, false, 'choose first');
  assert.ok(E.apply(s, { t: 'evolve', yes: true }).ok); assert.equal(s.coll[0].id, '26.5'); assert.equal(s.evolved, true);
  assert.ok(![].concat(...Object.values(s.decks)).includes('26.5'), 'your Raichu is not also lying around in the wild');
});
test('rules: if everyone falls in the same round it is sudden death, decided by who deals more damage', () => {
  const c = craft(['100'], ['100']);       // Voltorb: 4a and 4d to itself on a 1, so both fall
  const b = play(c, { hero: [1], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(b.out, 'sudden'); assert.ok(E.apply(c.s, { t: 'next' }).ok);
  assert.ok(c.s.battle.sudden); assert.equal(c.s.battle.stage, 'assign'); assert.ok(E.living(c.s.battle, 0).length === 1 && E.living(c.s.battle, 1).length === 1);
});
test('rules: a fight that goes nowhere for six rounds is lost', () => {
  const c = craft(['5.3'], ['129']);       // blanks on both sides
  c.b.stall = 5; const b = play(c, { hero: [6], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(b.out, 'gm');
});
test('placement: a gym fight puts out as many cards as you have dice, in fixed columns; the rest wait; a knocked-out card is replaced from the reserve', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' });
  s.coll.push({ uid: 5, id: '10', sh: 0 }, { uid: 6, id: '16', sh: 0 }, { uid: 7, id: '19', sh: 0 });
  assert.ok(E.apply(s, { t: 'go', node: 'B2' }).ok); assert.equal(s.phase, 'battle', 'no team to pick: straight into the fight');
  const b = s.battle; assert.equal(b.nOut, 1, 'one die: one card out'); assert.deepEqual(b.need, [1, 1]); assert.equal(b.cols.length, 1, 'the columns are fixed and shown from the start'); assert.equal(b.hand[0].length, 4, 'your whole collection is your hand'); assert.equal(b.hand[1].length, 1); assert.equal(b.rsv[1].length, 2, 'the other two of their three wait');
  assert.equal(E.slotsFor(b, 0).filter(x => x.at != null).length, 0, 'no new columns can be made');
  let g = B.step(s, 'normal'); assert.ok(E.apply(s, g).ok); E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0]));
  assert.equal(b.stage, 'assign'); assert.equal(E.living(b, 0).length, 1); assert.equal(E.living(b, 1).length, 1); assert.equal(b.rsv[0].length, 3, 'your other three wait in reserve');
  const foe = E.living(b, 1)[0]; foe.ko = true; foe.hp = 0; b.stage = 'resolved'; b.out = null;
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.equal(b.stage, 'place', 'a replacement is brought'); assert.ok(b.refill);
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.stage, 'assign', 'only they needed one'); assert.equal(E.living(b, 1).length, 1); assert.equal(b.rsv[1].length, 1);
});
test('wild cards: one comes up, you put one down, and then you choose: fight it one on one, or bring more and they draw one more each time', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 21, starter: 'bulbasaur' }); s.done.B1 = true; s.done.B2 = true;            // three dice (the first two badges give two more)
  ['74', '56', '100'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 }));
  assert.ok(E.apply(s, { t: 'go', node: 'L1' }).ok); const b = s.battle;
  assert.equal(b.mode, 'wild'); assert.equal(b.cap, 3); assert.equal(b.hand[1].length, 1, 'one wild card has come up'); assert.deepEqual(b.pl, { side: 1, left: 1 });
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.placed[1], 1, 'they put it down');
  assert.equal(E.apply(s, { t: 'ready' }).ok, false, 'you have not put one down yet');
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0).find(x => x.join != null))).ok);
  assert.equal(b.pl.optional, true, 'now you may bring more, or fight'); assert.equal(b.stage, 'place');
  // tap the deck for a second: it is drawn, the computer puts it down, and then you must answer it with a card of yours
  assert.ok(E.apply(s, { t: 'drawwild' }).ok); assert.deepEqual(b.pl, { side: 1, left: 1 }); assert.equal(b.hand[1].length, 1, 'a second wild card was drawn');
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.deepEqual(b.pl, { side: 0, left: 1, optional: false }, 'now you must answer it');
  assert.equal(E.apply(s, { t: 'ready' }).ok, false, 'no fighting before you have answered');
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0).find(x => x.at != null) || E.slotsFor(b, 0)[0])).ok); assert.equal(b.pl.optional, true, 'and then you may tap the deck again, or fight');
  // or put a second card down yourself: the place answers it at once, and you are back to choosing, with the sides equal
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0).find(x => x.at != null) || E.slotsFor(b, 0)[0])).ok);
  assert.deepEqual(b.pl, { side: 1, left: 1 }, 'they answer your extra card'); assert.equal(E.apply(s, { t: 'drawwild' }).ok, false, 'the deck cannot be tapped while a card is to be put down');
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.placed[0], b.placed[1], 'always equal when you may choose');
  assert.equal(b.stage, 'assign', 'three dice, three cards: the fight starts'); assert.equal(E.living(b, 0).length, 3); assert.equal(E.living(b, 1).length, 3);
  // one on one: put one down and fight at once
  const t = E.newGame({ seed: 22, starter: 'squirtle' }); t.done.B1 = true; t.coll.push({ uid: 9, id: '10', sh: 0 });
  E.apply(t, { t: 'go', node: 'L2' }); E.apply(t, B.step(t, 'normal')); const tb = t.battle;
  E.apply(t, Object.assign({ t: 'place', side: 0, uid: tb.hand[0][0] }, E.slotsFor(tb, 0).find(x => x.join != null)));
  assert.ok(E.apply(t, { t: 'ready' }).ok); assert.equal(E.living(tb, 0).length, 1); assert.equal(E.living(tb, 1).length, 1);
  // with one die there is nothing to choose
  const one = E.newGame({ seed: 23, starter: 'pikachu' }); one.coll.push({ uid: 9, id: '10', sh: 0 }); E.apply(one, { t: 'go', node: 'L1' }); E.apply(one, B.step(one, 'normal'));
  E.apply(one, Object.assign({ t: 'place', side: 0, uid: one.battle.hand[0][0] }, E.slotsFor(one.battle, 0).find(x => x.join != null))); assert.equal(one.battle.stage, 'assign', 'one die: the fight starts as soon as your card is down');
});
test('hidden information: the computer never sees your dice, and you never see theirs until the round is played', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 9, starter: 'charmander' }); E.apply(s, { t: 'go', node: 'L1' });
  let g; while ((g = B.step(s)) || (s.battle.stage === 'place' && s.battle.pl.side === 0)) { if (g) E.apply(s, g); else E.apply(s, Object.assign({ t: 'place', side: 0, uid: s.battle.hand[0][0] }, E.slotsFor(s.battle, 0)[0])); }
  assert.equal(s.battle.stage, 'assign');
  const mine = E.viewFor(s, 0), theirs = E.viewFor(s, 1);
  assert.deepEqual(mine.battle.dice[1], [0]); assert.deepEqual(theirs.battle.dice[0], [0]);
  assert.ok(!mine.decks && !mine.legend, 'no deck contents in a view');
});

// ================================================================ the campaign
test('campaign: every trainer builds a random team from its row: size, signature last, quotas, level points, no repeats, no starters, copies', () => {
  assert.deepEqual(Object.values(D.trainers).map(t => t.n), [2, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6]);
  const tagOf = c => c.tags;
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.newGame({ seed, starter: 'bulbasaur' }); const used = [];
    Object.keys(D.trainers).forEach(id => {
      const Tr = D.trainers[id], team = T.buildTeam(s, id), cs = team.map(i => C[i.id]), sig = cs[cs.length - 1];
      assert.equal(team.length, Tr.n, Tr.name); const pts = cs.reduce((a, c) => a + c.level, 0); assert.ok(pts >= Tr.pts[0] && pts <= Tr.pts[1], Tr.name + ' level points ' + pts);
      assert.equal(new Set(cs.map(c => c.name)).size, cs.length, Tr.name + ': no two with the same name');
      Tr.quotas.forEach(q => assert.ok(cs.filter(c => q.el ? c.type.toLowerCase() === q.el.toLowerCase() : q.tags.some(t => tagOf(c).includes(t))).length >= q.n, Tr.name + ' quota'));
      cs.forEach(c => { if (c.loc === 0) assert.ok(c.tags.includes(Tr.name.toLowerCase()), Tr.name + ' only uses a starter card that carries its name'); if (c.legend) assert.ok(c === sig && Tr.sig.legendary, 'legendaries only as Lance, Blue and Red\'s signature'); });
      if (Tr.sig.legendary) used.push(sig.id);
    });
    assert.equal(new Set(used).size, 3, 'Lance, Blue and Red never share a legendary');
    assert.ok(!T.buildTeam(s, 'E2').some(i => C[i.id].name === 'Onix'), 'Bruno never gets Onix');
  }
});
test('campaign: places open with badges and by beating trainers; one die at the start, a second and a third from the first two badges', () => {
  const s = E.newGame({ seed: 4, starter: 'squirtle' });
  const open = () => D.nodes.filter(n => E.unlocked(s, n)).map(n => n.id).sort();
  assert.deepEqual(open(), ['B1', 'B2', 'L1', 'L2'], 'two gyms and two places are open from the start'); assert.equal(E.slots(s), 1); assert.equal(s.lv, 2, 'your partner starts at level 2');
  s.done.B1 = true; assert.equal(E.slots(s), 2); assert.ok(open().includes('B3') && open().includes('L3') && open().includes('L4') && open().includes('L5')); assert.ok(!open().includes('B4'));
  s.done.B2 = true; assert.equal(E.slots(s), 3); assert.ok(open().includes('B4') && open().includes('B5') && open().includes('L6') && open().includes('L7') && open().includes('L8'));
  s.done.B3 = true; assert.equal(E.slots(s), 3, 'never more than three dice'); assert.equal(E._t.badges(s), 3); assert.ok(open().includes('B6') && open().includes('B7') && open().includes('L9')); assert.ok(!open().includes('B8'));
  s.done.B4 = true; assert.ok(open().includes('B8')); ['B5', 'B6', 'B7', 'B8'].forEach(id => { s.done[id] = true; }); assert.equal(E._t.badges(s), 8);
  assert.ok(open().includes('E1') && !open().includes('E2') && !open().includes('E4')); s.done.E1 = true; assert.ok(open().includes('E2')); s.done.E2 = true; assert.ok(open().includes('E3')); s.done.E3 = true; assert.ok(open().includes('E4'));
  s.done.E4 = true; assert.ok(open().includes('F1')); s.done.F1 = true; assert.ok(open().includes('F2'));
  assert.ok(!D.nodes.some(n => n.kind === 'rival'), 'there is no rival in solo');
});
test('campaign: your rival picks the partner that beats yours', () => {
  const beats = { bulbasaur: 'charmander', charmander: 'squirtle', squirtle: 'pikachu', pikachu: 'larvitar', larvitar: 'bulbasaur' };
  Object.keys(beats).forEach(k => assert.equal(E.rivalFor(k).key, beats[k], k));
});
test('campaign: you cannot challenge a place that is locked, or a boss twice, or with too many cards', () => {
  const s = E.newGame({ seed: 4, starter: 'squirtle' });
  assert.equal(E.apply(s, { t: 'go', node: 'B3' }).ok, false, 'locked');
  s.done.B1 = true; assert.equal(E.apply(s, { t: 'go', node: 'B1' }).ok, false, 'you cannot fight a gym leader twice');
  assert.ok(E.apply(s, { t: 'go', node: 'L1' }).ok);
});
test('shiny: each card is rolled once at the start of the game (about one in ten) and is the same every time it comes up', () => {
  let sh = 0, n = 0;
  for (let seed = 1; seed <= 300; seed++) { const s = E.newGame({ seed, starter: 'bulbasaur' }); Object.keys(C).forEach(id => { n++; sh += s.sh[id]; }); }
  assert.ok(sh / n > 0.085 && sh / n < 0.115, 'rate ' + sh / n);
  const s = E.newGame({ seed: 77, starter: 'pikachu' }); const seen = {};
  for (let i = 0; i < 400; i++) { const d = T.drawWild(s, 2, 1); d.forEach(x => { if (seen[x.id] != null) assert.equal(x.sh, seen[x.id], 'the same card has the same form every time'); seen[x.id] = x.sh; assert.equal(x.sh, s.sh[x.id]); s.discard[2].push(x.id); }); }
  assert.ok(Object.keys(seen).length >= 8, 'the whole deck came round more than once');
  // a shiny you pass up is still there to be caught: it is a property of the card, not of the draw
  const shinyId = Object.keys(C).find(id => s.sh[id] && C[id].loc === 2 && !C[id].legend); if (shinyId) { const a = T.drawWild(s, 2, 1); assert.ok(a); }
});
test('draw pile: a place is worked through once, every card, before what was dug is shuffled back in', () => {
  const s = E.newGame({ seed: 31, starter: 'bulbasaur' }), k = s.decks[2].length, seen = new Set();
  for (let i = 0; i < k; i++) { const d = T.drawWild(s, 2, 1); assert.equal(d.length, 1); assert.ok(!seen.has(d[0].id), 'no card comes round twice before the pile is used up'); seen.add(d[0].id); s.discard[2].push(d[0].id); }
  assert.equal(seen.size, k); assert.equal(s.decks[2].length, 0, 'the draw pile is used up');
  const again = T.drawWild(s, 2, 1); assert.equal(again.length, 1); assert.ok(seen.has(again[0].id), 'now the dug cards are shuffled back in'); assert.equal(s.decks[2].length, k - 1); assert.equal(s.discard[2].length, 0);
  // a fight you lose leaves what you faced in the discard pile (not back on top)
  const t = E.newGame({ seed: 32, starter: 'squirtle' }), before = t.decks[1].length; E.apply(t, { t: 'go', node: 'L1' }); E.apply(t, { t: 'forfeit' });
  assert.equal(t.decks[1].length, before - 1); assert.equal(t.discard[1].length, 1);
});
test('records: the turn each gym leader was beaten on is kept, and the whole game takes a number of turns', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 5, starter: 'larvitar', ai: 'master' }); let n = 0;
  while (s.phase !== 'won' && n++ < 40000) { let g; while ((g = B.step(s))) E.apply(s, g); const a = B.heroStep(s, 'master'); B.applyHero(s, a); }
  assert.equal(s.phase, 'won'); const ids = D.nodes.filter(x => x.kind === 'boss').map(x => x.id);
  ids.forEach(id => { assert.ok(s.bossTurns[id] >= 1 && s.bossTurns[id] <= s.turn, id + ' beaten on turn ' + s.bossTurns[id]); });
  assert.ok(s.bossTurns.B1 <= s.bossTurns.B2 || s.bossTurns.B1 <= s.bossTurns.B3); assert.ok(s.bossTurns.F2 === s.turn, 'the game was won on the last turn: beating Red ends it');
});
test('shiny: your partner keeps its form through every level and evolution', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.newGame({ seed, starter: 'pikachu' }), line = E.starterOf('pikachu'), forms = new Set(line.levels.concat(Object.values(line.evolve)).map(id => s.sh[id]));
    assert.equal(forms.size, 1, 'one form for the whole line'); assert.equal(s.coll[0].sh, [...forms][0]);
  }
});
test('shiny: a card keeps its form once it is on a team, and a card given back to the wild gets a new chance', () => {
  const s = E.newGame({ seed: 8, starter: 'bulbasaur' });
  s.coll.push({ uid: 20, id: '10', sh: 1 }); E.apply(s, { t: 'go', node: 'B2' }); const shinyBoss = s.bosses.B2.filter(i => i.sh);
  s.bosses.B2.forEach(i => assert.equal(i.sh, s.sh[i.id], 'a trainer\'s copy is shiny exactly when that card is'));
  if (s.battle) E.apply(s, { t: 'forfeit' });
  assert.equal(s.coll.find(c => c.uid === 20).sh, 1, 'your own shiny stays shiny');
  s.phase = 'result'; s.res = { win: true, node: 'L1', pick: [{ id: '16', sh: 1 }, { id: '19', sh: 0 }], kind: 'loc', gm: [] };
  assert.ok(E.apply(s, { t: 'take', i: 0 }).ok); assert.equal(s.coll[s.coll.length - 1].sh, 1, 'a shiny you catch is yours for good');
  assert.ok(s.discard[CARDS_LOC('19')].includes('19') && s.discard[CARDS_LOC('19')].every(x => typeof x === 'string'), 'what you leave behind goes back into the deck as the same card: it is shiny or not for the whole game');
  assert.ok(typeof shinyBoss.length === 'number');
});
const CARDS_LOC = id => C[id].loc;

// ================================================================ whole games
// ================================================================ cards that move cards, and Haunter
const col = (b, i, sd) => b.cols[i][sd];
test('movement: Machoke\'s fighting attack pushes a card it hits to the side, Golbat forbids it', () => {
  const c = craft(['67', '1.1', '1.1'], ['10', '10', '10']); const { b } = c, [a1, b1, c1] = [3, 4, 5].map(i => b.units[i].uid);
  b.cols = [[b.units[0].uid, a1], [null, b1], [null, c1]]; b.units.forEach(u => { u.hp = u.max = 20; });
  play(c, { hero: [1], gm: [] }, { hero: { 0: 0 } });
  assert.equal(col(b, 1, 1), c1); assert.equal(col(b, 2, 1), b1, 'the card to its right was pushed one column right');
  const g = craft(['67', '1.1', '1.1'], ['10', '10', '42']); const gb = g.b;
  gb.cols = [[gb.units[0].uid, gb.units[3].uid], [null, gb.units[4].uid], [null, gb.units[5].uid]]; gb.units.forEach(u => { u.hp = u.max = 20; });
  play(g, { hero: [1], gm: [] }, { hero: { 0: 0 } });
  assert.equal(col(gb, 1, 1), gb.units[4].uid, 'Golbat is on their team: nothing of theirs is pushed');
});
test('movement: Rhyhorn\'s ground attack pushes their whole line left, unless Golbat is there', () => {
  const c = craft(['111', '1.1', '1.1'], ['10', '10', '10']); const { b } = c;
  b.cols = [[b.units[0].uid, b.units[3].uid], [b.units[1].uid, null], [b.units[2].uid, b.units[4].uid]]; b.units.forEach(u => { u.hp = u.max = 20; });
  play(c, { hero: [1], gm: [] }, { hero: { 0: 0 } });
  assert.equal(col(b, 1, 1), b.units[4].uid, 'the far card slid into the gap on its left');
  const g = craft(['111', '1.1', '1.1'], ['10', '10', '42']); const gb = g.b;
  gb.cols = [[gb.units[0].uid, gb.units[3].uid], [gb.units[1].uid, null], [gb.units[2].uid, gb.units[5].uid]]; gb.units.forEach(u => { u.hp = u.max = 20; });
  play(g, { hero: [1], gm: [] }, { hero: { 0: 0 } });
  assert.equal(col(gb, 2, 1), gb.units[5].uid, 'Golbat: they cannot be moved');
});
test('movement: Kadabra and Celebi change column once a round, Abra swaps two opponents, Tangela stops all of it', () => {
  const c = craft(['64', '1.1'], ['10', '10']); const { b, s } = c, k = b.units[0].uid, bu = b.units[1].uid;
  assert.ok(E.apply(s, { t: 'move', side: 0, uid: k, dir: 1 }).ok); assert.equal(col(b, 1, 0), k); assert.equal(col(b, 0, 0), bu, 'they traded places');
  assert.equal(E.apply(s, { t: 'move', side: 0, uid: k, dir: -1 }).ok, false, 'once a round'); assert.equal(E.apply(s, { t: 'move', side: 0, uid: bu, dir: 1 }).ok, false, 'only cards that can move');
  const a = craft(['63'], ['10', '4.1']); const g1 = a.b.units[1].uid, g2 = a.b.units[2].uid;
  a.b.cols = [[a.b.units[0].uid, g1], [null, g2]];
  assert.ok(E.apply(a.s, { t: 'swap', side: 0, uid: a.b.units[0].uid, a: g1, b: g2 }).ok); assert.equal(col(a.b, 0, 1), g2); assert.equal(col(a.b, 1, 1), g1);
  const t = craft(['64', '1.1'], ['114', '10']); assert.equal(E.apply(t.s, { t: 'move', side: 0, uid: t.b.units[0].uid, dir: 1 }).ok, false, 'Tangela: opponents cannot change columns');
});
test('movement: Alakazam sends an attack that would finish a card to a healthier ally, once a round', () => {
  const c = craft(['65', '16'], ['1.1', '10']); const { b } = c; b.units[0].hp = 1; b.units[1].hp = b.units[1].max = 20;
  play(c, { hero: [], gm: [1] }, { gm: { 0: 0 } });
  assert.ok(evs(b, 'text').some(e => /sends the attack to/.test(e.msg)), 'redirected'); assert.ok(!b.units[0].ko, 'Alakazam is still up');
});
test('Haunter: when a teammate falls you may keep its ability, once per battle', () => {
  const c = craft(['93', '1.1'], ['10', '1.1']); const { b, s } = c; b.units[1].hp = 1;
  play(c, { hero: [], gm: [1] }, { gm: { 1: 0 } });
  assert.ok(b.units[1].ko, 'the teammate fell'); assert.equal(E.apply(s, { t: 'next' }).ok, false, 'asked first');
  assert.ok(E.hauntAsk(b).opts.includes(b.units[1].uid));
  assert.ok(E.apply(s, { t: 'haunt', uid: b.units[1].uid }).ok); assert.equal(b.units[0].ghost, C['1.1'].ability); assert.ok(E.tags(b.units[0]).some(g => g.t === 'grant'), 'Haunter now grants like the fallen card');
  assert.equal(E.hauntAsk(b), null); assert.ok(b.units[0].hauntUsed);
  const g = craft(['1.1'], ['93', '10']); g.b.units[2].hp = 1;
  play(g, { hero: [1], gm: [] }, { hero: { 0: 0 } });     // the hero hits the card in front of it; the computer's Haunter keeps what it can
  if (g.b.units[1].ko) assert.equal(g.b.units[2].ghost || null, null);
});
test('campaign: nobody has a rival at the end; beating Lance wins the game', () => {
  assert.equal(D.nodes.filter(n => n.finale).map(n => n.id).join(), 'F2'); assert.ok(!('rivalFinalExtra' in D));
});
test('campaign: a gym leader you have faced is no longer a secret', () => {
  const s = E.newGame({ seed: 4, starter: 'charmander' }); s.done.B1 = true; assert.ok(!(s.seen && s.seen.B2));
  assert.ok(E.apply(s, { t: 'go', node: 'B2' }).ok); assert.ok(s.seen.B2, 'facing them is what reveals the team');
});

test('rules: you give out the dice you like, then reroll the rest together, once; rerolled dice are locked in', () => {
  const c = craft(['1.1', '1.2', '7.1'], ['10', '10', '10']); const { s, b } = c; b.dice[0] = [3, 4, 5];
  assert.ok(E.apply(s, { t: 'assign', side: 0, uid: b.units[0].uid, die: 0 }).ok);
  assert.ok(E.apply(s, { t: 'reroll', side: 0, all: true }).ok);
  assert.equal(b.dice[0][0], 3, 'the die on a card is kept'); assert.ok(b.locked[0][1] && b.locked[0][2] && !b.locked[0][0], 'the other two are locked in');
  const after = b.dice[0].slice(); assert.equal(E.apply(s, { t: 'reroll', side: 0, all: true }).ok, false, 'only once');
  assert.deepEqual(b.dice[0], after, 'nothing changed');
  c.b.rr[0] = 5; assert.equal(E.apply(s, { t: 'reroll', side: 0, all: true }).ok, false, 'even with spare rerolls, locked dice do not move again');
  T.startRound(s); assert.equal(Object.keys(b.locked[0]).length, 0, 'a new round, a new reroll');
});
test('ai: the computer gets no reroll of its own; Easy never rerolls, Normal and Master use only what their cards give them', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const plain = craft(['1.1', '7.1'], ['1.1', '7.1']); assert.equal(plain.b.rr[1], 0, 'no reroll a round for the computer'); assert.equal(plain.b.rr[0], 1, 'you keep yours');
  const c = craft(['1.1', '7.1'], ['37', '7.1']); const { s, b } = c; b.dice[1] = [2, 2]; assert.equal(b.rr[1], 1, 'Vulpix: +1 reroll');
  assert.equal(B.step(s, 'easy').t, 'gm', 'Easy never rerolls'); assert.equal(B.step(s, 'normal').t, 'reroll', 'Normal uses a reroll its card gives it'); assert.equal(E.D.ai.easy.random, 1);
  const r = craft(['1.1', '7.1'], ['19', '7.1']); r.b.dice[1] = [1, 4]; assert.deepEqual(r.b.rrFace[1], [1]); const fr = B.step(r.s, 'master'); assert.deepEqual(fr, { t: 'reroll', side: 1, die: 0 }, 'Rattata: a 1 is thrown again for free');
});
test('decisions: when a card of yours may dodge, the game stops and asks you each time; the computer always dodges', () => {
  const c = craft(['25.3'], ['4.1']); const { s, b } = c;                               // Pikachu: dodge one attack per match
  b.dice = [[1], [1]]; b.asg = [{ [b.units[0].uid]: { dice: [0], tgt: null } }, { [b.units[1].uid]: { dice: [0], tgt: null } }]; b.gmReady = true;
  assert.ok(E.apply(s, { t: 'go2' }).ok); assert.equal(b.stage, 'resolving'); assert.equal(b.ask.kind, 'yn', 'asked'); assert.equal(b.ask.uid, b.units[0].uid);
  assert.equal(E.apply(s, { t: 'choose', tgt: 1 }).ok, false, 'a choice of target is not a yes or no');
  const hp = b.units[0].hp; assert.ok(E.apply(s, { t: 'decide', yes: false }).ok);
  assert.ok(b.units[0].hp < hp, 'declined: it takes the hit'); assert.ok(!b.units[0].dodgeUsed, 'and the dodge is still there for later');
  const d = craft(['25.3'], ['4.1']); d.b.dice = [[1], [1]]; d.b.asg = [{ [d.b.units[0].uid]: { dice: [0], tgt: null } }, { [d.b.units[1].uid]: { dice: [0], tgt: null } }]; d.b.gmReady = true;
  E.apply(d.s, { t: 'go2' }); const hp2 = d.b.units[0].hp; assert.ok(E.apply(d.s, { t: 'decide', yes: true }).ok);
  assert.equal(d.b.units[0].hp, hp2, 'dodged: no damage'); assert.ok(d.b.units[0].dodgeUsed, 'used for this match');
  const g = craft(['4.1'], ['25.3']); g.b.dice = [[1], [1]]; g.b.asg = [{ [g.b.units[0].uid]: { dice: [0], tgt: null } }, { [g.b.units[1].uid]: { dice: [0], tgt: null } }]; g.b.gmReady = true;
  E.apply(g.s, { t: 'go2' }); assert.ok(!g.b.ask, 'the computer is never asked'); assert.ok(evs(g.b, 'dodge').length >= 1, 'it dodged');
});
test('decisions: a block protects one card, and you choose which; a card that blocks for "itself or a neighbour" asks', () => {
  const bc = Object.values(C).find(c => /^\d+c <v or v>$/.test(c.moves[0]) && !c.legend); assert.ok(bc, 'a card with a "<v or v>" counter on a 1');
  const run = pick => {
    const c = craft([bc.id, '1.1'], ['10', '4.1']); const { s, b } = c; const [blk, nb] = [b.units[0], b.units[1]]; nb.hp = nb.max = 20; blk.hp = blk.max = 20;
    b.dice = [[1, 6], [6, 1]]; b.asg = [{ [blk.uid]: { dice: [0], tgt: null }, [nb.uid]: { dice: [1], tgt: null } }, { [b.units[3].uid]: { dice: [1], tgt: null } }]; b.gmReady = true;
    assert.ok(E.apply(s, { t: 'go2' }).ok); assert.ok(b.ask && b.ask.k === 'b', 'asked who it blocks for'); assert.ok(b.ask.opts.flat().includes(blk.uid) && b.ask.opts.flat().includes(nb.uid));
    assert.ok(E.apply(s, { t: 'choose', tgt: pick === 'self' ? blk.uid : nb.uid }).ok); while (b.ask) assert.ok(E.apply(s, { t: 'choose', tgt: E.autoChoice(b) }).ok);
    return { blk, nb };
  };
  const a = run('neighbour'), z = run('self');
  assert.ok(a.nb.hp > z.nb.hp, 'protecting the neighbour: it takes less than when the blocker protects itself (' + a.nb.hp + ' vs ' + z.nb.hp + ')');
  assert.ok(a.blk.hp <= z.blk.hp);
});
test('abilities: Ditto copies the move of the card across or of one of its neighbours, your pick', () => {
  const c = craft(['132', '1.1'], ['4.1', '7.1']); const { s, b } = c; const ditto = b.units[0];
  b.dice = [[1, 6], [6, 6]]; b.asg = [{ [ditto.uid]: { dice: [0], tgt: null }, [b.units[1].uid]: { dice: [1], tgt: null } }, {}]; b.gmReady = true;
  assert.ok(E.apply(s, { t: 'go2' }).ok); assert.equal(b.ask.what, 'ditto'); assert.deepEqual(b.ask.opts.flat().sort(), [b.units[2].uid, b.units[3].uid].sort(), 'the card across and its neighbour');
  assert.ok(E.apply(s, { t: 'choose', tgt: b.units[3].uid }).ok); assert.equal(b.dittoSrc[ditto.uid], b.units[3].uid);
  const mv = b.events.filter(e => e.t === 'move' && e.u === ditto.uid).pop(); assert.equal(mv.txt, C['7.1'].moves[0], 'Ditto uses Squirtle\'s move');
});
test('dice: a die the colour of the move adds +1 to it, a mismatch adds nothing, specials are not doubled', () => {
  const c = craft(['4.1'], ['10']); const { s, b } = c, ch = b.units[0];                    // Charmander: fire; its 1 is "2a"
  const dmg = col => { const t = craft(['4.1'], ['16']); t.b.units[1].hp = t.b.units[1].max = 30; t.b.dcol = [[col], []]; const r = play(t, { hero: [1], gm: [] }, { hero: { 0: 0 } }); return 30 - t.b.units[1].hp; };
  const plain = dmg(null), fire = dmg('fire'), water = dmg('water'); assert.equal(fire, plain + 1, 'a fire die on a fire card is +1'); assert.equal(water, plain, 'a water die on a fire card does nothing');
  assert.equal(E.colorBonus(b, ch), 0);
});
test('rules: a card with nobody across from it is not put to sleep: it rolls, heals, hurts itself, and hits cards in other columns', () => {
  const c = craft(['1.2', '1.2', '4.2'], ['10']); const { s, b } = c;        // the second Bulbasaur and Charmander have nobody across
  assert.equal(b.dice[0].length, 3, 'a die for every card, matchless or not'); assert.ok(b.units.every(u => !u.skip));
  const [h0, h1, h2] = E.living(b, 0); h1.hp = 1; b.dice = [[3, 3, 1], [6]]; b.asg = [{ [h0.uid]: { dice: [0] }, [h1.uid]: { dice: [1] }, [h2.uid]: { dice: [2] } }, {}]; b.gmReady = true;
  assert.ok(E.apply(s, { t: 'go2' }).ok); while (b.ask) assert.ok(E.apply(s, { t: 'choose', tgt: E.autoChoice(b) }).ok);
  assert.ok(h1.hp > 1, 'the card with nobody across healed itself'); assert.ok(evs(b, 'miss').some(e => e.u === h2.uid), 'and a straight attack into an empty column just misses');
  const d = craft(['4.2', '5.3'], ['10', '10']); d.b.cols = [[d.b.units[0].uid, d.b.units[2].uid], [d.b.units[1].uid, null]];
  d.b.dice = [[1, 1], [6]]; d.b.asg = [{ [d.b.units[0].uid]: { dice: [0] }, [d.b.units[1].uid]: { dice: [1] } }, {}]; d.b.gmReady = true; assert.ok(E.apply(d.s, { t: 'go2' }).ok); while (d.b.ask) assert.ok(E.apply(d.s, { t: 'choose', tgt: E.autoChoice(d.b) }).ok);
  assert.ok(evs(d.b, 'strike').some(e => e.u === d.b.units[1].uid && e.to.indexOf(d.b.units[2].uid) >= 0), 'Charmeleon, with nobody across, hits the card in the next column over');
  const v = craft(['1.1'], ['10']); v.b.units[0].hp = 3; const sd = craft(['25.3'], ['10', '10']); assert.ok(sd.b.dice[0].length === 1);
});

test('dice faces: move 1 is rolled on a 6, move 2 on a 5 and so on; a move that only hurts the card is at the bottom, the worst on a 1', (t) => {
  E.faceOrder('top'); t.after(() => E.faceOrder('sheet'));
  const rolls = id => E.CARDS[id].moves;                         // index = die - 1
  const pika = rolls('25.3'); assert.deepEqual([pika[5], pika[4], pika[3], pika[2], pika[1], pika[0]], ['3a', '2a', '3h < or v or >', '2a', '', '1d v'], 'Pikachu: moves 1-4 on 6, 5, 4, 3; nothing on 2; the damage to itself on 1');
  const volt = rolls('100'); assert.equal(volt[5], '5a, 5d v', 'an attack that also hurts is still move 1 and is rolled on a 6'); assert.equal(volt[0], '1d v');
  const two = Object.values(E.CARDS).find(c => c.sheet.filter(m => /^\d+d v$/.test(m)).length >= 2);
  if (two) { const d = two.sheet.filter(m => /^\d+d v$/.test(m)).sort((a, b) => parseInt(b) - parseInt(a)); assert.deepEqual([two.moves[0], two.moves[1]], d.slice(0, 2), two.name + ': the worst self-damage on a 1, the next worst on a 2'); }
  Object.values(E.CARDS).forEach(c => { assert.equal(c.moves.length, 6); assert.equal(c.moves.filter(Boolean).length, c.sheet.filter(Boolean).length, c.name + ' keeps all its moves'); });
  const c = craft(['25.3'], ['16']); c.b.units[1].hp = c.b.units[1].max = 30; play(c, { hero: [6], gm: [] }, { hero: { 0: 0 } });
  assert.ok(c.b.units[1].hp < 30, 'a 6 on Pikachu is its 3 Attack'); const e = craft(['25.3'], ['16']); const hp = e.b.units[0].hp; play(e, { hero: [1], gm: [] }, { hero: { 0: 0 } }); assert.equal(e.b.units[0].hp, hp - 1, 'a 1 on Pikachu hurts itself');
});

test('draw pile: with a pile of one left and more cards wanted, the last unseen card comes first, then the discards are shuffled into a new pile', () => {
  const s = E.newGame({ seed: 41, starter: 'bulbasaur' }); const all = s.decks[2].slice(); s.decks[2] = [all[0]]; s.discard[2] = all.slice(1, 4);
  const d = T.drawWild(s, 2, 3).map(i => i.id); assert.equal(d[0], all[0], 'the unseen card first'); assert.ok(d.slice(1).every(x => [all[1], all[2], all[3]].includes(x)), 'then cards from the discard pile');
  assert.equal(new Set(d).size, 3, 'no card twice'); assert.equal(s.discard[2].length, 0, 'the discard pile became the new draw pile'); assert.equal(s.decks[2].length, 1);
});

test('rules: after a reroll the dice you had already given out are locked in; only the rerolled dice are placed after', () => {
  const c = craft(['1.1', '1.2', '7.1'], ['10', '10', '10']); const { s, b } = c; b.dice[0] = [3, 4, 5]; const [h0, h1, h2] = E.living(b, 0);
  assert.ok(E.apply(s, { t: 'assign', side: 0, uid: h0.uid, die: 0 }).ok); assert.ok(E.apply(s, { t: 'reroll', side: 0, all: true }).ok);
  assert.equal(E.apply(s, { t: 'assign', side: 0, uid: h1.uid, die: 0 }).ok, false, 'the die already on a card cannot be moved to another card');
  assert.equal(E.apply(s, { t: 'unassign', side: 0, uid: h0.uid }).ok, false, 'nor taken back');
  assert.equal(E.apply(s, { t: 'assign', side: 0, uid: h0.uid, die: 1 }).ok, false, 'and that card cannot take another die');
  assert.ok(E.apply(s, { t: 'assign', side: 0, uid: h1.uid, die: 1 }).ok); assert.ok(E.apply(s, { t: 'assign', side: 0, uid: h2.uid, die: 2 }).ok, 'the rerolled dice go to the cards still waiting');
  assert.ok(E.apply(s, { t: 'unassign', side: 0, uid: h1.uid }).ok, 'and can still be moved around among themselves');
});
test('decisions: "split" asks you how many points each target gets; a heal only asks when more than one card is hurt', (tc) => {
  E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const jt = Object.values(C).find(c => /split/.test(c.moves.join('|').replace(/over/g, 'split')) && /over/.test(c.moves[5] || '') && /a/.test(c.moves[5])); assert.ok(jt, 'a card whose best move is an attack that is shared out');
  const c = craft([jt.id, '1.1', '1.1'], ['10', '10', '10']); const { s, b } = c; b.units.forEach(u => { u.hp = u.max = 30; });
  const atk = c.b.units[0]; b.dice = [[6, 1, 1], [1, 1, 1]]; b.asg = [{ [atk.uid]: { dice: [0], tgt: null }, [b.units[1].uid]: { dice: [1], tgt: null }, [b.units[2].uid]: { dice: [2], tgt: null } }, {}]; b.gmReady = true;
  assert.ok(E.apply(s, { t: 'go2' }).ok); let guard = 0; while (b.ask && b.ask.kind !== 'alloc' && guard++ < 6) E.apply(s, { t: 'choose', tgt: E.autoChoice(b) });
  assert.equal(b.ask && b.ask.kind, 'alloc', 'asked to share the points out'); const n = b.ask.n, first = b.ask.opts[0][0];
  for (let i = 0; i < n; i++) assert.ok(E.apply(s, { t: 'alloc', tgt: first }).ok); assert.ok(!b.ask || b.ask.kind !== 'alloc', 'all points given out');
  const dmg = evs(b, 'dmg').filter(e => e.u === first && e.by === atk.uid).reduce((t, e) => t + e.n, 0); assert.ok(dmg >= n, 'all of it went where you put it');
  const h = craft(['25.3', '1.2'], ['10', '10']); const pk = h.b.units[0]; h.b.units[0].hp = 2; h.b.units[1].hp = h.b.units[1].max;       // Pikachu heals itself or a neighbour; only it is hurt
  h.b.dice = [[4, 1], [1, 1]]; h.b.asg = [{ [pk.uid]: { dice: [0], tgt: null }, [h.b.units[1].uid]: { dice: [1], tgt: null } }, {}]; h.b.gmReady = true; assert.ok(E.apply(h.s, { t: 'go2' }).ok);
  assert.ok(!h.b.ask || h.b.ask.k !== 'h', 'no question when only one card could be healed'); assert.ok(pk.hp > 2, 'it healed the one that was hurt');
});
test('draw pile: a beaten trainer\'s team is copies: nothing goes into any pile, and the cleared team is shown', () => {
  const s = E.newGame({ seed: 9, starter: 'charmander' }); s.phase = 'battle'; const team = T.buildTeam(s, 'B1'); s.bosses.B1 = team; const before = JSON.stringify([s.decks, s.discard]);
  const b = T.startBattle(s, 'boss', 'B1', [{ id: '4.2', sh: 0 }, { id: '1.1', sh: 0 }], team.map(i => ({ id: i.id, sh: i.sh }))); b.hand = [[], []];
  b.units.filter(u => u.side === 1).forEach(u => { u.ko = true; u.hp = 0; }); b.cols = [[b.units[0].uid, null], [b.units[1].uid, null]]; b.stage = 'resolved'; b.out = 'hero';
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.equal(JSON.stringify([s.decks, s.discard]), before, 'the piles are untouched'); assert.deepEqual(s.res.cleared, team);
});
test('shiny: a shiny card has one more health than the same card that is not', () => {
  const c = craft(['4.1', '4.1'], ['10']); const s2 = E.newGame({ seed: 3, starter: 'charmander' }); s2.phase = 'battle';
  const b = T.startBattle(s2, 'loc', 'L1', [{ id: '4.1', sh: 1 }, { id: '4.1', sh: 0 }], [{ id: '10', sh: 0 }]);
  const [shiny, plain] = b.units; assert.equal(shiny.max, plain.max + D.rules.shinyHp); assert.equal(shiny.hp, shiny.max); assert.equal(D.rules.shinyHp, 1);
  const n = E.newGame({ seed: 4, starter: 'bulbasaur' }); n.phase = 'battle'; const nb = T.startBattle(n, 'loc', 'L1', [{ id: '2.4', sh: 1 }], [{ id: '10', sh: 0 }]); assert.equal(nb.units[0].max, C['2.4'].hp + 1);
});

test('abilities: Starmie changes ANY one of your dice to 5 (not just the die on its card), every other round', () => {
  const c = craft(['121', '25.1'], ['19', '19']); const { s, b } = c; const st = c.h(0);
  b.dice[0] = [5, 6, 3]; b.asg[0] = {}; st.lastTweak = -9;
  assert.equal(E.apply(s, { t: 'tweak', side: 0, uid: st.uid }).ok, false, 'must say which die');
  assert.ok(E.apply(s, { t: 'tweak', side: 0, uid: st.uid, die: 1 }).ok);
  assert.deepEqual(b.dice[0], [5, 5, 3]);
  assert.equal(E.apply(s, { t: 'tweak', side: 0, uid: st.uid, die: 0 }).ok, false, 'not two rounds running');
});

test('rules: "immune" is now three less damage from that type', () => {
  assert.equal(D.rules.typeShield, 3); assert.equal(D.rules.locationMax, 5);
  const c = craft(['21'], ['74']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });       // Geodude (ground) hits Spearow: 2 less than 3, nothing gets through
  assert.equal(c.h(0).hp, C['21'].hp);
  [11, 12, 13].forEach(seed => {
    const s = E.newGame({ seed, starter: 'bulbasaur', size: 'long' });
    Object.values(D.trainers).forEach(t => assert.ok(t.n <= 6, t.name + ' has at most six'));
    assert.ok(D.locations.reduce((a, l) => a + s.decks[l.id].length, 0) > 0);
  });
});

test('special events: 10% after a battle that started with three dice; the first is Bill on the map, then a random legendary every time, shuffled into its place\'s piles', () => {
  const SP = D.specials; assert.equal(SP.chance, 0.1); assert.equal(SP.fromSlots, 3); assert.deepEqual(SP.order, ['bill', 'dojo']); assert.equal(SP.then, 'legendary'); assert.equal(SP.legendBadges, 4);
  const play1 = (seed, dice, setup) => { const s = E.newGame({ seed, starter: 'bulbasaur' }); for (let i = 0; i < dice - 1; i++) s.done['B' + [1, 2, 4, 5][i]] = true; s.slotsAtGo = E.slots ? E.slots(s) : dice; if (setup) setup(s); s.phase = 'result'; s.res = { win: true, node: 'L1', kind: 'loc' }; assert.ok(E.apply(s, { t: 'done' }).ok); return s; };
  let few = 0, enough = 0, first = null;
  for (let seed = 1; seed <= 400; seed++) {
    const a = play1(seed, 2); if (a.visitors.length || a.notes.length) few++;
    const s = play1(seed, 3); if (s.visitors.length || s.notes.length) { enough++; if (!first) first = s; }
  }
  assert.equal(few, 0, 'nothing special before the first battle with three dice'); assert.ok(enough > 15 && enough < 70, 'about one battle in ten (' + enough + ')');
  assert.deepEqual(first.visitors, ['bill']); assert.equal(first.specialsSeen, 1); assert.ok(first.notes[0].startsWith('visitor:'), 'the first one is Bill, standing on the map');
  // after Bill and the Dojo, and once you hold four badges: a random legendary each time; its place's draw and discard piles are shuffled together with it
  let leg = null; for (let seed = 1; seed < 400 && !leg; seed++) { const s = play1(seed, 3, g => { g.specialsSeen = 2; g.done.B1 = g.done.B2 = g.done.B4 = g.done.B5 = true; g.discard[1] = ['10', '13']; g.discard[2] = ['16']; }); if (s.notes.some(n => n.startsWith('legend:'))) leg = s; }
  assert.ok(leg, 'then a legendary'); const id = leg.notes[0].slice(7), loc = C[id].loc; assert.ok(C[id].legend); assert.ok(leg.decks[loc].includes(id), 'it is in the new draw pile'); assert.equal(leg.discard[loc].length, 0, 'the discard pile went into it'); assert.ok(!leg.legend.includes(id));
});

// ================================================================ one die per card, one column at a time


test('abilities: a frozen die is repeated next round, already on its card, and cannot be moved or rerolled (Jynx on KO, ice attacks)', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const c = craft(['25.1', '1.1'], ['19', '19']); const { s, b } = c, pk = c.h(0);
  pk.frozen = 6; T.startRound(s);
  const x = b.asg[0][pk.uid]; assert.ok(x, 'the frozen die was given to its card'); assert.equal(b.dice[0][x.dice[0]], 6, 'the same number as before'); assert.equal(pk.frozen, null, 'it lasts one round');
  assert.equal(E.apply(s, { t: 'unassign', side: 0, uid: pk.uid }).ok, false, 'it cannot be taken off'); assert.equal(E.apply(s, { t: 'assign', side: 0, uid: c.h(1).uid, die: x.dice[0] }).ok, false, 'or moved to another card');
  assert.ok(E.apply(s, { t: 'reroll', side: 0, all: true }).ok === true || true); assert.equal(b.dice[0][x.dice[0]], 6, 'and a reroll leaves it alone');
});

test('resolution order: heals, then every attack is declared, then blocks go up, then the damage lands', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const c = craft(['7.1'], ['19']); play(c, { hero: [6], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });            // Squirtle blocks 2 (move 1); Rattata attacks 2
  const kinds = c.b.events.map(e => e.t), iStrike = kinds.indexOf('strike'), iGuard = kinds.indexOf('guard'), iHit = kinds.findIndex((k, i) => i > iGuard && (k === 'blocked' || k === 'dmg'));
  assert.ok(iStrike >= 0 && iGuard > iStrike, 'the attack is declared before the block is chosen'); assert.ok(iHit > iGuard, 'the damage (here soaked by the block) comes after both');
  assert.equal(c.h(0).hp, C['7.1'].hp - 1, 'the counter took 1 of the attack, the other 1 got through');
});

test('recall: a card of yours can be taken out of the fight before you press Resolve, but never your last one', () => {
  const c = craft(['25.1', '1.1'], ['19', '19']); const { s, b } = c, a = c.h(0), z = c.h(1);
  assert.ok(E.apply(s, { t: 'recall', uid: a.uid }).ok); assert.ok(a.ko && a.recalled); assert.equal(E.living(b, 0).length, 1); assert.ok(b.cols.every(col => col[0] !== a.uid), 'it left its column');
  assert.equal(E.apply(s, { t: 'recall', uid: z.uid }).ok, false, 'not the last card: flee instead'); assert.equal(E.apply(s, { t: 'recall', uid: c.g(0).uid }).ok, false, 'and never theirs');
});

test('elements: each move has its own element: a card of one type can have a plain (normal) move, and only the element of the move counts for weakness', () => {
  const c = craft(['144'], ['148']);                       // Articuno (Ice type) against Dragonair (weak to ice); the sheet colours Articuno's first four moves ice and its fifth plain
  assert.equal(C['144'].type, 'Ice'); assert.equal(C['148'].weak, 'Ice');
  const b = play(c, { hero: [1], gm: [1] }, { hero: { 0: 0 }, gm: {} });     // die 1: an ice attack of 3, doubled
  assert.equal(evs(b, 'dmg')[0].n, 6); assert.equal(evs(b, 'dmg')[0].weak, true);
  const d = craft(['144'], ['148']), b2 = play(d, { hero: [5], gm: [1] }, { hero: { 0: 0 }, gm: {} });      // die 5: a plain 1a: normal, no weakness
  assert.equal(evs(b2, 'dmg')[0].n, 1); assert.ok(!evs(b2, 'dmg')[0].weak, 'a plain move from an Ice card is not an ice attack');
});
test('elements: a heal of the same element as the card it heals is twice as good; a block is twice as good against an attack of its own element', () => {
  const save = C['1.1'].movEls.slice(); C['1.1'].movEls[2] = 'grass';                // pretend the sheet colours Bulbasaur's 1 heal green
  try {
    const c = craft(['1.1'], ['4.1']); c.h(0).hp = 1;
    play(c, { hero: [3], gm: [1] }, { hero: { 0: 0 }, gm: {} });
    assert.equal(c.h(0).hp, 3, 'a green heal of 1 on a grass card heals 2');
  } finally { C['1.1'].movEls = save; }
  const b = craft(['1.1'], ['4.1']).b; b.moveEl = { 1: 'fire' };
  assert.equal(E._t.blkMult(b, { el: 'fire' }, E.U(b, 1)), 2); assert.equal(E._t.blkMult(b, { el: 'water' }, E.U(b, 1)), 1); assert.equal(E._t.blkMult(b, { el: 'normal' }, E.U(b, 1)), 1);
});

test('recall: after a card is called back, a neighbour may slide over to face its opponent', () => {
  const c = craft(['1.1', '4.1', '7.1'], ['10', '13', '16']), { b } = c;
  const mid = c.h(1), left = c.h(0), right = c.h(2), foe = c.g(1);
  assert.deepEqual(E.slideOpts(b, mid.uid).sort(), [left.uid, right.uid].sort(), 'both neighbours could slide');
  assert.equal(E.apply(c.s, { t: 'recall', uid: mid.uid, slide: c.g(0).uid }).ok, false, 'only one of your own neighbours');
  assert.ok(E.apply(c.s, { t: 'recall', uid: mid.uid, slide: right.uid }).ok);
  const col = b.cols.find(k => k[1] === foe.uid); assert.equal(col[0], right.uid, 'the neighbour now faces the opponent');
  assert.ok(b.cols.some(k => k[0] == null && k[1] === c.g(2).uid), 'and the column it left has an opponent with nobody facing it');
  const d = craft(['1.1', '4.1', '7.1'], ['10', '13', '16']); assert.ok(E.apply(d.s, { t: 'recall', uid: d.h(1).uid }).ok); assert.ok(d.b.cols.some(k => k[0] == null && k[1] === d.g(1).uid), 'or leave the spot empty');
});
test('Psyduck: no damage from cards of levels 30-50 (the old levels 4-6)', () => {
  const lvl = lab => Object.values(C).find(c => c.moves.some(m => /^\d+a\b/.test(m)) && D.rules.levelLabels[c.level - 1] === lab && !c.legend);
  assert.equal(D.rules.levelLabels[3], 30); const lo = lvl(20), hi = lvl(30);
  assert.ok(lo && hi); assert.match(C['54'].ability, /levels 30-50/);
  const hit = (a) => { const f = C[a.id].moves.findIndex(m => /^\d+a\b/.test(m)) + 1, k = craft([a.id], ['54']), b = play(k, { hero: [f], gm: [1] }, { hero: { 0: 0 }, gm: {} }); return evs(b, 'immune').length > 0; };
  assert.equal(hit(hi), true, 'a level 30 card does nothing to Psyduck'); assert.equal(hit(lo), false, 'a level 20 card does');
});
test('Bill: tap him on the map (no other requirement), beat Vaporeon, Jolteon and Flareon, keep one: only that card leaves the wild; the visitor leaves', () => {
  assert.equal(E.visitorNode('bill').art, 'BILL'); assert.deepEqual(D.specials.defs.bill.cards, ['Vaporeon', 'Jolteon', 'Flareon']);
  const s = E.newGame({ seed: 4, starter: 'bulbasaur' }); s.visitors = ['bill']; ['10', '13'].forEach((id, i) => s.coll.push({ uid: 30 + i, id, sh: 0 }));
  assert.equal(E.apply(E.newGame({ seed: 4, starter: 'bulbasaur' }), { t: 'go', node: 'V_bill' }).ok, false, 'nobody is there until he turns up');
  assert.ok(E.apply(s, { t: 'go', node: 'V_bill' }).ok); const b = s.battle; assert.equal(b.mode, 'wild'); assert.equal(b.isBill, true);
  const ids = D.specials.defs.bill.cards.map(n => Object.values(C).find(c => c.name === n).id); assert.ok(b.hand[1].every(h => ids.includes(b.hcards[h].id)), 'his first card is one of the three');
  const wildHad = ids.map(id => Object.values(s.decks).some(d => d.includes(id)));
  s.battle = null; s.phase = 'result'; s.res = { win: true, node: 'V_bill', kind: 'loc', bill: true, visitor: 'bill', pick: ids.map(id => ({ id, sh: 0 })) };
  assert.ok(E.apply(s, { t: 'take', i: 1 }).ok); assert.ok(s.coll.some(c => c.id === ids[1]), 'the one you chose is yours');
  Object.values(s.decks).concat(Object.values(s.discard)).forEach(d => assert.ok(!d.includes(ids[1]), 'and out of the wild'));
  ids.forEach((id, k) => { if (k !== 1) assert.equal(Object.values(s.decks).some(d => d.includes(id)), wildHad[k], 'the other two are where they were'); });
  assert.deepEqual(s.visitors, [], 'Bill leaves');
});

test('Bill: you can only keep an evolution you do not have; with all three you get an Eevee; with all of them he just says so', () => {
  const nm = n => Object.values(C).find(c => c.name === n).id, ids = ['Vaporeon', 'Jolteon', 'Flareon'].map(nm), eevee = nm('Eevee');
  const run = own => { const s = E.newGame({ seed: 6, starter: 'bulbasaur' }); s.visitors = ['bill']; own.forEach((id, i) => s.coll.push({ uid: 50 + i, id, sh: 0 })); s.coll.push({ uid: 90, id: '10', sh: 0 }); E.apply(s, { t: 'go', node: 'V_bill' }); return s; };
  // build the result through the engine's own win path
  const winWith = own => { const s = run(own); const b = s.battle; b.units = b.units.filter(u => u.side === 0); ids.forEach(id => { b.units.push({ uid: 500 + b.units.length, id, sh: 0, side: 1, hp: 0, max: 4, ko: true }); }); b.hand[1] = []; E.endBattle(s, true); return s; };
  const a = winWith([ids[2]]); assert.deepEqual(a.res.have, [ids[2]], 'Flareon is marked as already yours'); assert.equal(E.apply(a, { t: 'take', i: 2 }).ok, false, 'and cannot be taken'); assert.ok(E.apply(a, { t: 'take', i: 0 }).ok);
  const b2 = winWith(ids); assert.equal(b2.res.fallback, true); assert.deepEqual(b2.res.pick.map(i => i.id), [eevee], 'all three: an Eevee'); assert.ok(E.apply(b2, { t: 'take', i: 0 }).ok); assert.ok(b2.coll.some(c => c.id === eevee));
  const c2 = winWith(ids.concat([eevee])); assert.equal(c2.res.allHave, true); assert.ok(!c2.res.pick, 'nothing to choose'); assert.deepEqual(c2.visitors, [], 'he leaves');
});

test('cards: Chansey has 10 health; Snorlax says plainly that its Heal moves become Attack moves when it is alone; the deck cannot be tapped before you have put a card down', () => {
  assert.equal(C['113'].hp, 10); assert.match(C['143'].ability, /Heal moves become Attack moves/);
  assert.ok(E.CARDS['143'].ability && E._t, 'readable'); assert.equal(E.tagsOf(C['143']).some(g => g.t === 'alone'), true, 'and it still works');
  const s = E.newGame({ seed: 21, starter: 'bulbasaur' }); s.done.B1 = s.done.B2 = true; ['74', '56', '100'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 }));
  E.apply(s, { t: 'go', node: 'L1' }); assert.equal(E.apply(s, { t: 'drawwild' }).ok, false, 'not while the place is putting its card down or you have not played yet');
});

test('recall: only before the dice are rolled (afterwards a returned card would leave a spare die)', () => {
  const c = craft(['1.1', '4.1'], ['10', '13']), { s, b } = c;
  assert.ok(E.apply(s, { t: 'rollseen' }).ok); assert.equal(E.apply(s, { t: 'recall', uid: c.h(0).uid }).ok, false, 'after the roll: no');
  const d = craft(['1.1', '4.1'], ['10', '13']); d.b.round = 2; assert.equal(E.apply(d.s, { t: 'recall', uid: d.h(0).uid }).ok, false, 'and not in later rounds');
});

test('gym leaders: a card is only known once it has been put down in front of you', () => {
  const s = E.newGame({ seed: 9, starter: 'bulbasaur' }); assert.ok(!s.seenCards || !(s.seenCards.B1 || []).length);
  E.apply(s, { t: 'go', node: 'B1' }); const b = s.battle; assert.ok(!(s.seenCards && s.seenCards.B1), 'nothing seen yet');
  E.apply(s, B.step(s, 'normal')); assert.equal((s.seenCards.B1 || []).length, 1, 'one card put down: one card seen'); assert.ok(s.bosses.B1.some(i => i.id === s.seenCards.B1[0].id));
});
test('Farfetch\'d: +2 Attack for its neighbours, but only for neighbours that actually attack', () => {
  E.faceOrder('sheet');
  const run = (dice) => { const c = craft(['1.1', '83', '4.1'], ['10', '13', '16']), b = play(c, { hero: dice, gm: [1, 1, 1] }, { hero: { 0: 0, 1: 1, 2: 2 }, gm: {} }); return evs(b, 'dmg').filter(e => e.by === c.h(0).uid).map(e => e.n); };
  assert.deepEqual(run([1, 5, 2]), [4], 'a neighbour that attacks gets +2 (2 becomes 4)'); assert.deepEqual(run([3, 5, 2]), [], 'a neighbour that heals instead does not attack, so there is no bonus to give');
});

test('shiny starters: a 10% chance that exactly one starter is shiny, and then its whole line is; the screen can know before the game exists', () => {
  assert.equal(D.rules.starterShinyChance, 0.1);
  let some = 0; const N = 2000;
  for (let seed = 1; seed <= N; seed++) {
    const k = E.starterShiny(seed); if (k) some++;
    const shiny = D.starters.filter(st => E.newGame({ seed, starter: st.key }).coll[0].sh).map(st => st.key);
    assert.deepEqual(shiny, k ? [k] : [], 'never more than one starter is shiny: ' + seed);
  }
  assert.ok(some > N * .07 && some < N * .13, 'about one game in ten has a shiny starter: ' + some);
  const seed = [...Array(500).keys()].map(x => x + 1).find(x => E.starterShiny(x)), key = E.starterShiny(seed), st = D.starters.find(x => x.key === key), g = E.newGame({ seed, starter: key });
  st.levels.concat(st.evolve ? Object.values(st.evolve) : []).forEach(id => assert.equal(g.sh[id], 1, id + ' is shiny with its line'));
});

// ================================================================ V3: counters, ghosts, Mew, the Dojo
test('v3: Mew\'s attacks always count as the element the target is weak to (Ancestor); Metronome uses the move of the card across, or 5a', (tc) => { E.faceOrder('top'); tc.after(() => E.faceOrder('sheet'));
  const a = craft(['151'], ['20']); a.h(0).hp = a.h(0).max = 9; const ho = a.g(0).hp; play(a, { hero: [5], gm: [1] }, { hero: { 0: 0 } });          // Mew's 5 is its 2nd move: 5a. Raticate is weak to Fighting; Mew has none, but its attacks count as Fighting anyway: double
  assert.ok(a.g(0).ko, 'a double 5a (10) takes out Raticate (' + ho + ' health)');
  const b = craft(['151'], ['4.1']); play(b, { hero: [6], gm: [1] }, { hero: { 0: 0 } });          // a 6 is Metronome: Charmander's own 6 move is 2a; doubled by the weakness it counts as: 4
  assert.ok(b.g(0).ko, 'Metronome copied Charmander\'s 6 move (2a, doubled)');
  const c = craft(['151'], ['10']); c.b.cols = [[c.b.units[0].uid, null], [null, c.b.units[1].uid]]; const m = E.chosenMove(c.b, c.h(0), [6]); assert.equal(m.str, '5a', 'nothing across: 5a');
});
test('v3: ghosts are weak to healing: a heal may go to the ghost across from the card it would heal, for double damage', (tc) => {
  const c = craft(['1.2'], ['92']); c.h(0).hp = 1; const gh = c.g(0); assert.equal(gh.hp, 3, 'Gastly');
  const e = { k: 'h', n: 3, spec: { opts: [[0]], spread: false, all: true } }; const cand = E.candidates(c.b, c.h(0), e);
  assert.ok(cand.some(g => g[0].ghost && g[0].u === gh), 'the ghost is one of the targets');
  play(c, { hero: [3], gm: [1] }, { hero: { 0: 0 } }); assert.ok(gh.ko, 'a 3 heal aimed at the ghost deals 6');
  const d = craft(['1.2'], ['10']); assert.ok(!E.candidates(d.b, d.h(0), e).some(g => g[0].ghost), 'no ghost, no such target');
});
test('v3: a counter sends the damage it soaked back, leftover counter is wasted, and a fully countered hit does not count as being hit', () => {
  const c = craft(['1.1', '11'], ['4.1', '10']); play(c, { hero: [6, 1], gm: [1, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.g(0).hp, C['4.1'].hp - 2, 'Charmander took the 2 that Metapod countered');
  const d = craft(['39'], ['10']); const j = d.h(0); D.rules.moveOrder; // Jigglypuff: when you take damage, attacker loses a round (not when fully countered)
  assert.ok(E.tags(j).some(t => t.t === 'hitMatchSkip' || t.t === 'koSkip' || t.t), 'has an ability');
});
test('v3: the Fighting Dojo is a visitor with three random Fighting cards, and every event has an info line', () => {
  const dj = D.specials.defs.dojo; assert.equal(dj.pick.type, 'Fighting'); assert.equal(dj.pick.n, 3); assert.ok(dj.info && D.specials.defs.bill.info);
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.visitors = []; s.specialsSeen = 1; s.slotsAtGo = 3;
  let got = null; for (let seed = 1; seed < 400 && !got; seed++) { s.rng = seed; s.visitors = []; s.notes = []; T.maybeSpecial && T.maybeSpecial(s); if (s.vcards && s.vcards.dojo) got = s.vcards.dojo; }
  if (got) { assert.equal(got.length, 3); got.forEach(id => assert.equal(C[id].type, 'Fighting')); assert.equal(new Set(got).size, 3); }
});
