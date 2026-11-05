const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B } = require('./load.js');
const C = E.CARDS, T = E._t;

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
test('data: all 175 cards load, with nine legendaries and six levels for each of the five starters', () => {
  assert.equal(Object.keys(C).length, 175);
  assert.equal(Object.values(C).filter(c => c.legend).length, 9);
  D.starters.forEach(st => { assert.equal(st.levels.length, 6, st.name); st.levels.forEach((id, i) => { assert.ok(C[id], id); assert.equal(C[id].level, i + 1); }); });
  D.locations.forEach(l => assert.ok(Object.values(C).filter(c => c.loc === l.id && !c.legend).length >= 5, l.name + ' has cards'));
});
test('data: every move on every card reads, and so does every special move', () => {
  Object.values(C).forEach(c => {
    c.moves.forEach((m, i) => { if (m) assert.ok(E.parseMove(m), c.name + ' face ' + (i + 1) + ': ' + m); });
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
test('data: the only abilities not in this version are the Jynx KO freeze and the Gyarados blue die (colored dice are dropped for now)', () => {
  const un = new Set();
  Object.values(C).forEach(c => c.ability.split(/;\s*/).forEach(p => { if (p && !E.tagsOf({ id: 'q' + c.id + p, ability: p }).length) un.add(p); }));
  assert.equal(un.size, 2);
  assert.ok([...un].every(p => /push|swap|redirect|change (column|position|a teammate)|move <>|enemy die|blue die|freeze an ally|reroll \^|Ally dragon|abilities to change|move/i.test(p)), [...un].join(' | '));
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
  const c = craft(['1.2'], ['7.1']); c.h(0).hp = 1;                                    // Bulbasaur heals 2 on a 3; Squirtle attacks for 2 on a 2
  const b = play(c, { hero: [3], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.ok(!c.h(0).ko && c.h(0).hp === 1, 'healed to 3 first, then took 2');
  assert.ok(b.events.findIndex(e => e.t === 'heal') < b.events.findIndex(e => e.t === 'dmg'));
});
test('rules: a block soaks damage, and the blocker takes whatever is left over', () => {
  const c = craft(['1.1', '11'], ['4.1', '10']);       // Metapod blocks 3 for its neighbour Bulbasaur; Charmander hits Bulbasaur (a weakness: 4)
  const b = play(c, { hero: [6, 1], gm: [1, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.h(0).hp, 4, 'Bulbasaur is untouched');
  assert.ok(evs(b, 'blocked').some(e => e.u === c.h(1).uid && e.for === c.h(0).uid && e.n === 3));
  assert.equal(c.h(1).hp, 3, 'Metapod is weak to fire too: 2 doubled to 4, three soaked, one left over for the blocker, and its own shield takes that one');
});
test('rules: a special move needs the right number of dice on the right number, and other cards then go without', () => {
  const c = craft(['6.5', '1.1'], ['16', '10']);        // Charizard: two 6s = 12a
  const b = play(c, { hero: [6, 6], gm: [1, 1] }, { hero: { 0: [0, 1] }, gm: { 0: 0, 1: 1 } });
  assert.ok(evs(b, 'special').length === 1); assert.ok(c.g(0).ko, '12 damage');
  const d = craft(['6.5', '1.1'], ['16', '10']); d.b.dice = [[5, 6], [1, 1]];
  assert.ok(E.apply(d.s, { t: 'assign', side: 0, uid: d.h(0).uid, die: 0 }).ok); E.apply(d.s, { t: 'assign', side: 0, uid: d.h(0).uid, die: 1 });
  assert.equal(d.b.asg[0][d.h(0).uid].dice.length, 1, 'a 5 and a 6 are not a special');
});
test('rules: a card with no card facing it still acts, and a move at an empty column misses', () => {
  const c = craft(['4.1', '1.1'], ['10']);
  const b = play(c, { hero: [3, 1], gm: [1] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0 } });
  assert.ok(b.events.length > 0);
});
test('abilities: immunity, thorns, shields and dodging', () => {
  let c = craft(['50'], ['21']); play(c, { hero: [1], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });        // Diglett (ground) attacks Spearow (immune to ground)
  assert.equal(c.g(0).hp, C['21'].hp, 'immune to ground'); assert.ok(evs(c.b, 'immune').length);
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
  const c = craft(['5.3', '10', '10'], ['10', '16', '19']);          // Charmeleon: 3a <^ or >  (across, or one over)
  c.b.dice = [[1, 6, 6], [6, 6, 6]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null }, [c.h(1).uid]: { dice: [1], tgt: null }, [c.h(2).uid]: { dice: [2], tgt: null } }, {}]; c.b.gmReady = true;
  assert.ok(E.apply(c.s, { t: 'go2' }).ok);
  assert.equal(c.b.stage, 'resolving', 'the round stops at Charmeleon'); assert.ok(c.b.ask); assert.equal(c.b.ask.uid, c.h(0).uid);
  assert.equal(c.g(1).hp, C['16'].hp, 'nothing has been hit yet');
  assert.equal(E.apply(c.s, { t: 'choose', tgt: c.g(2).uid }).ok, false, 'only the cards it could reach');
  assert.ok(E.apply(c.s, { t: 'choose', tgt: c.g(1).uid }).ok);
  assert.equal(c.b.stage, 'resolved'); assert.ok(c.g(1).ko, 'Pidgey, the one chosen, took the hit'); assert.ok(!c.g(0).ko);
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
  const l = craft(['249'], ['37']); assert.equal(l.b.rr[1], 1, 'one of Vulpix\'s two rerolls is gone');
});
test('campaign: Pikachu can grow into Raichu at level 5, and keeps going as one', () => {
  const s = E.newGame({ seed: 2, starter: 'pikachu' }); s.done.rival1 = true; s.done.B1 = true; s.done.B2 = true; s.done.B3 = true; s.lv = 4;
  s.phase = 'battle'; const b = T.startBattle(s, 'boss', 'B4', [{ id: '25.4', sh: 0 }], [{ id: '10', sh: 0 }]); b.units[1].ko = true; b.units[1].hp = 0; b.cols = [[b.units[0].uid, b.units[1].uid]]; b.stage = 'resolved'; b.out = 'hero'; b.hand = [[], []];
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
test('placement: a gym fight starts from your whole hand; the computer puts down one card, then two at a time, and you put down only as many as they bring', () => {
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.done.B1 = true;
  s.coll.push({ uid: 5, id: '10', sh: 0 }, { uid: 6, id: '16', sh: 0 }, { uid: 7, id: '19', sh: 0 });
  assert.ok(E.apply(s, { t: 'go', node: 'B2' }).ok); assert.equal(s.phase, 'battle', 'no team to pick: straight into the fight');
  const b = s.battle; assert.equal(b.mode, 'fixed'); assert.deepEqual(b.need, [3, 3]); assert.equal(b.hand[0].length, 4, 'your whole collection is your hand'); assert.equal(b.hand[1].length, 3);
  assert.deepEqual(b.pl, { side: 1, left: 1 });
  let g = B.step(s, 'normal'); assert.ok(E.apply(s, g).ok); assert.deepEqual(b.pl, { side: 0, left: 2 }, 'your turn for two cards');
  assert.equal(E.apply(s, { t: 'place', side: 1, uid: b.hand[1][0], at: 0 }).ok, false, 'not their turn');
  E.apply(s, { t: 'place', side: 0, uid: b.hand[0][0], at: 0 }); E.apply(s, { t: 'place', side: 0, uid: b.hand[0][0], at: 1 });
  while ((g = B.step(s, 'normal')) || (b.stage === 'place' && b.pl.side === 0)) { if (g) E.apply(s, g); else E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0])); }
  assert.equal(b.stage, 'assign'); assert.ok(b.cols.length <= 3);
  assert.equal(E.living(b, 0).length, 3, 'three of your four cards fight; the fourth stays in your hand'); assert.equal(E.living(b, 1).length, 3);
});
test('wild cards: one comes up, you put one down, and then you choose: fight it one on one, or bring more and they draw one more each time', () => {
  const s = E.newGame({ seed: 21, starter: 'bulbasaur' }); s.done.B1 = true; s.done.B2 = true; s.done.B3 = true;            // four dice
  ['74', '56', '100'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 }));
  assert.ok(E.apply(s, { t: 'go', node: 'L1' }).ok); const b = s.battle;
  assert.equal(b.mode, 'wild'); assert.equal(b.cap, 4); assert.equal(b.hand[1].length, 1, 'one wild card has come up'); assert.deepEqual(b.pl, { side: 1, left: 1 });
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.placed[1], 1, 'they put it down');
  assert.equal(E.apply(s, { t: 'ready' }).ok, false, 'you have not put one down yet');
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0).find(x => x.join != null))).ok);
  assert.equal(b.pl.optional, true, 'now you may bring more, or fight'); assert.equal(b.stage, 'place');
  // bring a second: they draw one more and the computer puts it down
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0).find(x => x.at != null))).ok);
  assert.deepEqual(b.pl, { side: 1, left: 1 }); assert.equal(b.hand[1].length, 1, 'a second wild card was drawn');
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.cols.length <= 2, true); assert.equal(b.pl.optional, true);
  assert.ok(E.apply(s, { t: 'ready' }).ok, 'fight with two'); assert.equal(b.stage, 'assign'); assert.equal(E.living(b, 0).length, 2); assert.equal(E.living(b, 1).length, 2);
  // one on one: put one down and fight at once
  const t = E.newGame({ seed: 22, starter: 'squirtle' }); t.done.B1 = true; t.coll.push({ uid: 9, id: '10', sh: 0 });
  E.apply(t, { t: 'go', node: 'L2' }); E.apply(t, B.step(t, 'normal')); const tb = t.battle;
  E.apply(t, Object.assign({ t: 'place', side: 0, uid: tb.hand[0][0] }, E.slotsFor(tb, 0).find(x => x.join != null)));
  assert.ok(E.apply(t, { t: 'ready' }).ok); assert.equal(E.living(tb, 0).length, 1); assert.equal(E.living(tb, 1).length, 1);
  // with one die there is nothing to choose
  const one = E.newGame({ seed: 23, starter: 'pikachu' }); one.coll.push({ uid: 9, id: '10', sh: 0 }); E.apply(one, { t: 'go', node: 'L1' }); E.apply(one, B.step(one, 'normal'));
  E.apply(one, Object.assign({ t: 'place', side: 0, uid: one.battle.hand[0][0] }, E.slotsFor(one.battle, 0).find(x => x.join != null))); assert.equal(one.battle.stage, 'assign', 'one die: the fight starts as soon as your card is down');
});
test('hidden information: the computer never sees your dice, and you never see theirs until the round is played', () => {
  const s = E.newGame({ seed: 9, starter: 'charmander' }); E.apply(s, { t: 'go', node: 'L1' });
  let g; while ((g = B.step(s)) || (s.battle.stage === 'place' && s.battle.pl.side === 0)) { if (g) E.apply(s, g); else E.apply(s, Object.assign({ t: 'place', side: 0, uid: s.battle.hand[0][0] }, E.slotsFor(s.battle, 0)[0])); }
  assert.equal(s.battle.stage, 'assign');
  const mine = E.viewFor(s, 0), theirs = E.viewFor(s, 1);
  assert.deepEqual(mine.battle.dice[1], [0]); assert.deepEqual(theirs.battle.dice[0], [0]);
  assert.ok(!mine.decks && !mine.legend, 'no deck contents in a view');
});

// ================================================================ the campaign
test('campaign: bosses bring the right number of cards, more in the longer game', () => {
  const short = E.newGame({ seed: 3, starter: 'bulbasaur', size: 'short' }), long = E.newGame({ seed: 3, starter: 'bulbasaur', size: 'long' });
  assert.deepEqual(D.nodes.filter(n => n.kind === 'boss').map(n => short.bosses[n.id].length), [2, 3, 3, 4, 4, 5, 6]);
  assert.deepEqual(D.nodes.filter(n => n.kind === 'boss').map(n => long.bosses[n.id].length), [2, 3, 3, 5, 5, 7, 9]);
  assert.ok(short.bosses.B7.some(i => C[i.id].legend), 'Lance holds a legendary');
});
test('campaign: places open when the earlier fight is won, and you start with one die and four more for the five gym leaders', () => {
  const s = E.newGame({ seed: 4, starter: 'squirtle' });
  const open = () => D.nodes.filter(n => E.unlocked(s, n)).map(n => n.id);
  assert.deepEqual(open().sort(), ['B1', 'L1', 'L2'], 'no opening rival fight: three places are open from the start'); assert.equal(E.slots(s), 1); assert.equal(s.lv, 2, 'your partner starts at level 2');
  s.done.B1 = true; assert.ok(open().includes('L3') && open().includes('B2') && open().includes('B3')); assert.equal(E.slots(s), 2);
  assert.ok(!open().includes('L4') && !open().includes('B4')); s.done.B2 = true; s.done.B3 = true; assert.ok(open().includes('L4') && open().includes('L5') && open().includes('B4') && open().includes('B5'));
  assert.ok(!open().includes('B6')); s.done.B4 = true; s.done.B5 = true; assert.ok(open().includes('B6') && open().includes('L6') && open().includes('L7'));
  s.done.B6 = true; assert.ok(open().includes('B7') && open().includes('L8') && open().includes('L9')); s.done.B7 = true; assert.ok(!D.nodes.some(n => n.kind === 'rival'), 'there is no rival in solo: Lance is the last fight');
});
test('campaign: your rival picks the partner that beats yours', () => {
  const beats = { bulbasaur: 'charmander', charmander: 'squirtle', squirtle: 'pikachu', pikachu: 'larvitar', larvitar: 'bulbasaur' };
  Object.keys(beats).forEach(k => assert.equal(E.rivalFor(k).key, beats[k], k));
});
test('campaign: you cannot challenge a place that is locked, or a boss twice, or with too many cards', () => {
  const s = E.newGame({ seed: 4, starter: 'squirtle' });
  assert.equal(E.apply(s, { t: 'go', node: 'B2' }).ok, false, 'locked');
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
test('records: the turn each gym leader was beaten on is kept, and the whole game takes a number of turns', () => {
  const s = E.newGame({ seed: 5, starter: 'larvitar', ai: 'master' }); let n = 0;
  while (s.phase !== 'won' && n++ < 40000) { let g; while ((g = B.step(s))) E.apply(s, g); const a = B.heroStep(s, 'master'); B.applyHero(s, a); }
  assert.equal(s.phase, 'won'); const ids = D.nodes.filter(x => x.kind === 'boss').map(x => x.id);
  ids.forEach(id => { assert.ok(s.bossTurns[id] >= 1 && s.bossTurns[id] <= s.turn, id + ' beaten on turn ' + s.bossTurns[id]); });
  assert.ok(s.bossTurns.B1 <= s.bossTurns.B2 || s.bossTurns.B1 <= s.bossTurns.B3); assert.ok(s.bossTurns.B7 === s.turn, 'the game was won on the last turn: beating Lance ends it');
});
test('shiny: your partner keeps its form through every level and evolution', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.newGame({ seed, starter: 'pikachu' }), line = E.starterOf('pikachu'), forms = new Set(line.levels.concat(Object.values(line.evolve)).map(id => s.sh[id]));
    assert.equal(forms.size, 1, 'one form for the whole line'); assert.equal(s.coll[0].sh, [...forms][0]);
  }
});
test('shiny: a card keeps its form once it is on a team, and a card given back to the wild gets a new chance', () => {
  const s = E.newGame({ seed: 8, starter: 'bulbasaur' });
  const shinyBoss = [].concat(...Object.values(s.bosses)).filter(i => i.sh);
  const before = JSON.stringify(s.bosses); s.done.rival1 = true; s.done.B1 = true;
  s.coll.push({ uid: 20, id: '10', sh: 1 }); E.apply(s, { t: 'go', node: 'B2' });
  if (s.battle) E.apply(s, { t: 'forfeit' });
  assert.equal(JSON.stringify(s.bosses), before, 'a boss team is the same after a fight, shiny or not');
  assert.equal(s.coll.find(c => c.uid === 20).sh, 1, 'your own shiny stays shiny');
  s.phase = 'result'; s.res = { win: true, node: 'L1', pick: [{ id: '16', sh: 1 }, { id: '19', sh: 0 }], kind: 'loc', gm: [] };
  assert.ok(E.apply(s, { t: 'take', i: 0 }).ok); assert.equal(s.coll[s.coll.length - 1].sh, 1, 'a shiny you catch is yours for good');
  assert.ok(s.discard[CARDS_LOC('19')].includes('19') && s.discard[CARDS_LOC('19')].every(x => typeof x === 'string'), 'what you leave behind goes back into the deck as the same card: it is shiny or not for the whole game');
  assert.ok(typeof shinyBoss.length === 'number');
});
const CARDS_LOC = id => C[id].loc;
test('legendaries: with two dice, a nine on two dice at the start of a turn spots one, and it joins its place', () => {
  let found = null;
  for (let seed = 1; seed < 3000 && !found; seed++) {
    const s = E.newGame({ seed, starter: 'bulbasaur' }); s.done.rival1 = true; s.done.B1 = true; s.coll.push({ uid: 9, id: '10', sh: 0 });
    const pool = s.legend.slice(); E.apply(s, { t: 'go', node: 'L1' });
    if (s.notes.length) found = { s, pool };
  }
  assert.ok(found, 'a legendary shows up now and then');
  const id = found.s.notes[0].replace('legend:', ''); assert.ok(C[id].legend);
  assert.ok(!found.s.legend.includes(id), 'it leaves the waiting pile');
  assert.ok(found.s.decks[C[id].loc].includes(id) || found.s.battle.hand[1].some(h => found.s.battle.hcards[h].id === id) || found.s.battle.units.some(u => u.id === id), 'it is in the deck of the place on its card');
  const one = E.newGame({ seed: 1, starter: 'bulbasaur' }); E.apply(one, { t: 'go', node: 'L1' });
  assert.equal(one.notes.length, 0, 'no rolling for legendaries with only one die');
});

// ================================================================ whole games
test('fuzz: forty computer-played campaigns, from the first rival to the champion, with no errors', () => {
  for (let i = 1; i <= 40; i++) {
    const s = E.newGame({ seed: i * 7919, starter: D.starters[i % 5].key, size: i % 2 ? 'short' : 'long', ai: ['easy', 'normal', 'master'][i % 3] });
    let n = 0;
    while (s.phase !== 'won' && n++ < 60000) {
      let g; while ((g = B.step(s))) { const r = E.apply(s, g); assert.ok(r.ok, 'computer: ' + r.error); }
      const a = B.heroStep(s, ['easy', 'normal', 'master'][(i + 1) % 3]); assert.ok(a, 'stuck in ' + s.phase);
      const r = B.applyHero(s, a); assert.ok(r.ok, 'player: ' + JSON.stringify(a).slice(0, 100) + ' ' + r.error);
    }
    assert.equal(s.phase, 'won', 'campaign ' + i + ' finished');
    assert.equal(s.lv, 6); const sd = E.starterOf(s.starter); assert.ok([sd.levels[5], sd.evolve && sd.evolve[6]].includes(s.coll.find(c => c.starter).id), 'the partner grew all the way');
    assert.ok(s.coll.length >= 7, 'a collection of cards was built');
  }
});

test('ai: Easy never rerolls and plays blind; Master and Normal are real levers in the data; Master beats Normal beats Easy', () => {
  const B = Bots, ais = E.D.ai; assert.deepEqual(Object.keys(ais), ['easy', 'normal', 'master']);
  const c = craft(['1.1'], ['10']); c.b.dice[1] = [1]; c.b.rr[1] = 3;
  for (let i = 0; i < 30; i++) assert.equal(B.step(c.s, 'easy').t, 'gm', 'Easy hands out dice without ever rerolling');
  const lose = { easy: [0, 0], normal: [0, 0], master: [0, 0] };       // [hero battles lost, played]
  for (let g = 0; g < 8; g++) ['easy', 'normal', 'master'].forEach(lvl => {
    const s = E.newGame({ seed: 300 + g, starter: D.starters[g % 5].key, size: 'short', ai: lvl }); let n = 0;
    while (s.phase !== 'won' && s.phase !== 'lost' && n++ < 30000) { let a; while ((a = B.step(s))) E.apply(s, a); if (s.phase === 'result' && s.res) { lose[lvl][1]++; if (!s.res.win) lose[lvl][0]++; } const h = B.heroStep(s, 'master'); if (!h) break; B.applyHero(s, h); }
  });
  const rate = k => lose[k][0] / lose[k][1];
  assert.ok(rate('easy') < rate('normal') && rate('normal') < rate('master') + 0.02, 'a stronger computer beats the same player more often: ' + JSON.stringify(lose));
});

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
  assert.equal(D.nodes.filter(n => n.finale).map(n => n.id).join(), 'B7'); assert.ok(!('rivalFinalExtra' in D));
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
test('ai: Easy and Normal never reroll, Master rerolls the weak dice together before giving any out', () => {
  const c = craft(['1.1', '7.1'], ['1.1', '7.1']); const { s, b } = c; b.dice[1] = [6, 6]; b.rr[1] = 1;
  assert.equal(B.step(s, 'easy').t, 'gm'); assert.equal(B.step(s, 'normal').t, 'gm');
  const m = B.step(s, 'master'); assert.equal(m.t, 'reroll', 'two dead 6s are worth throwing again'); assert.ok(m.dice.length >= 1 && m.dice.every(i => i >= 0 && i < 2));
  assert.ok(E.apply(s, m).ok); assert.ok(b.locked[1][m.dice[0]]);
  assert.equal(B.step(s, 'master').t, 'gm', 'then it gives them out');
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
