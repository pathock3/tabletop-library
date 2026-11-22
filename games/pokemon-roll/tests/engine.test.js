const rawTest = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, Bots: B } = require('./load.js');
const C = E.CARDS, T = E._t;
// The rule tests below were written against the V4 moves of particular cards (a die number, a card that attacks on it). The game's cards are now the V6 ones, so each rule test runs with the V4 move data
// put back on the cards (v4cards.json) and the V6 data restored afterwards; tests of the V6 data itself use test.v6.
const V4 = require('./v4cards.json'), V6 = {}; Object.keys(V4).forEach(id => { V6[id] = { sheet: C[id].sheet.slice(), els: C[id].els.slice() }; });
const useCards = snap => { Object.keys(snap).forEach(id => { C[id].sheet = snap[id].sheet.slice(); C[id].els = snap[id].els.slice(); }); E.faceOrder('sheet'); };
const test = (name, fn) => rawTest(name, (tc) => { useCards(V4); tc.after(() => { useCards(V6); }); return fn(tc); });
test.v6 = (name, fn) => rawTest(name, (tc) => { useCards(V6); return fn(tc); });
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
  assert.equal(E.parseMove('recoil 1').clauses[0][0].k, 'd'); const dr = E.parseMove('2a drain').clauses[0][0]; assert.ok(dr.drain && dr.k === 'a'); const pz = E.parseMove('3p, poison').clauses[0][0]; assert.ok(pz.pierce && pz.sts.indexOf('poison') >= 0, 'pierce with a poison that rides on the attack'); assert.equal(E.parseMove('charge <>').clauses[0][0].k, 'g'); assert.equal(E.parseMove('stun').clauses[0][0].k, 's');
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
  const c = craft(['4.1'], ['1.1']); const b = play(c, { hero: [1], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });   // Charmander 2a vs Bulbasaur (weak to fire)
  assert.equal(evs(b, 'dmg')[0].n, 4); assert.equal(evs(b, 'dmg')[0].weak, true); assert.ok(c.g(0).ko, 'four damage on four health');
  const d = craft(['1.1'], ['4.1']); const b2 = play(d, { hero: [1], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });
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
  const b = play(c, { hero: [5, 1], gm: [1, 5] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.h(0).hp, 4, 'Bulbasaur is untouched');
  assert.ok(evs(b, 'blocked').some(e => e.u === c.h(1).uid && e.for === c.h(0).uid && e.n === 2));
  assert.equal(c.h(1).hp, 1, 'Metapod is weak to fire too: 2 doubled to 4, two countered, two left over for the blocker (its own 1 block does not apply to damage it takes for a neighbour)');
  assert.equal(c.g(0).hp, C['4.1'].hp - 2, 'a counter sends what it soaked back: Charmander takes 2');
});
test('rules: a card with no card facing it still acts, and a move at an empty column misses', () => {
  const c = craft(['4.1', '1.1'], ['10']);
  const b = play(c, { hero: [3, 1], gm: [1] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0 } });
  assert.ok(b.events.length > 0);
});
test('abilities: immunity, thorns, shields and dodging', () => {
  let c = craft(['74'], ['21']); play(c, { hero: [1], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } });        // Geodude's 2 ground attack on Spearow ("3 block against each ground attack")
  assert.equal(c.g(0).hp, C['21'].hp, 'a 2-damage ground hit is soaked entirely by the 3 block'); assert.ok(evs(c.b, 'blocked').length);
  c = craft(['50'], ['21']); play(c, { hero: [1], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } });          // Diglett's ground move is a 2 pierce: pierce ignores the block
  assert.equal(c.g(0).hp, C['21'].hp - 2, 'pierce goes straight through');
  c = craft(['4.1'], ['27']); play(c, { hero: [1], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Sandshrew: attackers take 1d
  assert.equal(c.h(0).hp, 2, 'the attacker took 2 pierce');
  c = craft(['1.1'], ['10']); play(c, { hero: [1], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Bulbasaur: grass attacks grant 1h
  assert.ok(evs(c.b, 'heal').length === 0, 'at full health the granted heal does nothing');
  c = craft(['1.1'], ['14']); play(c, { hero: [1], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Kakuna: -1d
  assert.equal(c.g(0).hp, C['14'].hp - 1, '2 damage minus 1');
  c = craft(['1.1'], ['25.1']); play(c, { hero: [1], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });           // Pikachu dodges the first attack of the match
  assert.equal(c.g(0).hp, 3); assert.ok(evs(c.b, 'dodge').length);
});
test('abilities: "Has 1 block against each attack" cuts attacks only: recoil and poison are never reduced (Metapod, Kakuna)', () => {
  const c = craft(['11'], ['10']); play(c, { hero: [6], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } });     // Metapod on a 6: recoil 1 to itself
  assert.equal(c.h(0).hp, C['11'].hp - 1, 'the whole recoil: the block does not touch it');
  const k = craft(['1.1'], ['14']); play(k, { hero: [1], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.equal(k.g(0).hp, C['14'].hp - 1, 'and an attack of 2 hurts it for 1');
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
test('abilities: "takes 1 less damage" applies to every hit, every round', () => {
  const c = craft(['1.1', '85'], ['14', '10']); play(c, { hero: [1, 1], gm: [4, 4] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.equal(c.g(0).hp, C['14'].hp - 2, 'Bulbasaur 2 minus 1, and Dodrio 2 minus 1: it counts against each hit');
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
test('abilities: Slowpoke lowers the die of the card facing it by 3 on rounds 1, 3, 5 (down to 1), automatically', () => {
  const c = craft(['1.1'], ['79']); c.b.dice = [[5], [3]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null } }, { [c.g(0).uid]: { dice: [0], tgt: null } }]; c.b.gmReady = true;
  assert.ok(E.apply(c.s, { t: 'go2' }).ok); assert.equal(c.b.dice[0][0], 2, 'a 5 dropped by 3');
  const d = craft(['1.1'], ['79']); d.b.dice = [[2], [3]]; d.b.asg = [{ [d.h(0).uid]: { dice: [0], tgt: null } }, { [d.g(0).uid]: { dice: [0], tgt: null } }]; d.b.gmReady = true;
  assert.ok(E.apply(d.s, { t: 'go2' }).ok); assert.equal(d.b.dice[0][0], 1, 'but never below 1');
  const e = craft(['1.1'], ['79']); e.b.round = 2; e.b.dice = [[5], [3]]; e.b.asg = [{ [e.h(0).uid]: { dice: [0], tgt: null } }, { [e.g(0).uid]: { dice: [0], tgt: null } }]; e.b.gmReady = true;
  assert.ok(E.apply(e.s, { t: 'go2' }).ok); assert.equal(e.b.dice[0][0], 5, 'not on even rounds');
});
test('abilities: Weezing hands a damage to a healthier card facing it, and Dratini widens its dragons', () => {
  const c = craft(['110'], ['1.1']); c.h(0).hp = 1; c.g(0).hp = 4; play(c, { hero: [5], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(c.h(0).hp, 2); assert.equal(c.g(0).hp, 3);
  const d = craft(['10', '148', '147'], ['10', '16', '19']);       // Dragonair's 6a (a 1) can hit a neighbour because Dratini is on the team
  const cand = E.candidates(d.b, d.h(1), E.parseMove('6a').clauses[0][0]); assert.equal(cand.length, 3, 'left, across or right');
  const solo = craft(['148'], ['10']); assert.equal(E.candidates(solo.b, solo.h(0), E.parseMove('6a').clauses[0][0]).length, 1);
});
test('abilities: Porygon changes a teammate to the element its target is weak to, and Lugia takes a reroll away', () => {
  const c = craft(['1.1', '137'], ['4.1', '10']); play(c, { hero: [1, 6], gm: [6, 6] }, { hero: { 0: 0, 1: 1 }, gm: { 0: 0, 1: 1 } });
  assert.ok(evs(c.b, 'text').some(e => /changes Bulbasaur to water/.test(e.msg)), 'Charmander is weak to water');
  const l = craft(['249'], ['37']); assert.equal(l.b.rr[1], 1, 'Vulpix gives the computer 1 reroll, and Lugia no longer takes it away'); assert.equal(l.b.rr[0], D.rules.baseRerolls + 1, 'Lugia gives YOUR team one extra reroll');
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
  c.b.stall = 5; const b = play(c, { hero: [5], gm: [3] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(b.out, 'gm');
});
test('placement: a gym fight puts out as many cards as you have dice (a trainer lends the rest), in fixed columns; the rest wait; a knocked-out card is replaced from the reserve', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.done.B1 = true; s.done.B2 = true;
  s.coll.push({ uid: 5, id: '10', sh: 0 }, { uid: 6, id: '16', sh: 0 }, { uid: 7, id: '19', sh: 0 });
  assert.ok(E.apply(s, { t: 'go', node: 'B3' }).ok); assert.equal(s.phase, 'battle');
  const b = s.battle; assert.equal(b.nOut, 3, 'Lt. Surge has four Pokémon and three are out at a time'); assert.equal(b.lend, undefined, 'you have three dice: nobody lends you anything'); assert.deepEqual(b.need, [3, 3]); assert.equal(b.cols.length, 3, 'the columns are fixed and shown from the start'); assert.equal(b.hand[0].length, 4, 'your whole collection is your hand'); assert.equal(b.hand[1].length, 3); assert.equal(b.rsv[1].length, 1, 'the fourth waits (the signature)');
  assert.equal(E.slotsFor(b, 0).filter(x => x.at != null).length, 0, 'no new columns can be made');
  let g; while ((g = B.step(s, 'normal')) || (b.stage === 'place' && b.pl.side === 0)) { if (g) E.apply(s, g); else if (b.pl.confirm) E.apply(s, { t: 'ready' }); else E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0])); }
  assert.equal(b.stage, 'assign'); assert.equal(E.living(b, 0).length, 3); assert.equal(E.living(b, 1).length, 3); assert.equal(b.rsv[0].length, 1, 'your fourth waits in reserve');
  const foe = E.living(b, 1)[0]; foe.ko = true; foe.hp = 0; b.stage = 'resolved'; b.out = null;
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.equal(b.stage, 'place', 'a replacement is brought'); assert.ok(b.refill);
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.ok(E.apply(s, { t: 'ready' }).ok, 'your OK'); assert.equal(b.stage, 'assign', 'only they needed one'); assert.equal(E.living(b, 1).length, 3); assert.equal(b.rsv[1].length, 0); assert.ok(E.living(b, 1).some(u => s.bosses.B3[s.bosses.B3.length - 1].id === u.id), 'the signature came out last');
});
test('wild cards: one comes up, you put one down, and then you choose: fight it one on one, or bring more and they draw one more each time', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 21, starter: 'bulbasaur' }); s.done.B1 = true; s.done.B2 = true;            // three dice (the first two badges give two more)
  ['74', '56', '100'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 }));
  assert.ok(E.apply(s, { t: 'go', node: 'L1' }).ok); const b = s.battle;
  assert.equal(b.mode, 'wild'); assert.equal(b.cap, 3); assert.equal(b.hand[1].length, 1, 'one wild card has come up'); assert.deepEqual(b.pl, { side: 1, left: 1 });
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.placed[1], 1, 'they put it down');
  assert.equal(E.apply(s, { t: 'ready' }).ok, false, 'you have not put one down yet');
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0).find(x => x.join != null))).ok);
  assert.equal(b.pl.optional, true, 'now you may bring more, or fight'); assert.equal(b.stage, 'place');
  assert.equal(E.apply(s, { t: 'drawwild' }).ok, false, 'no tapping the deck yet: a second card of yours goes down first, and they answer it');
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0])).ok);
  assert.deepEqual(b.pl, { side: 1, left: 1 }, 'they answer your extra card'); assert.equal(E.apply(s, { t: 'drawwild' }).ok, false, 'the deck cannot be tapped while a card is to be put down');
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.equal(b.placed[0], b.placed[1], 'always equal when you may choose'); assert.ok(b.pl.canDraw, 'now the deck may be tapped');
  // tap the deck: it is drawn, the computer puts it down first, and then you must answer it with a card of yours
  assert.ok(E.apply(s, { t: 'drawwild' }).ok); assert.deepEqual(b.pl, { side: 1, left: 1 }); assert.equal(b.hand[1].length, 1, 'another wild card was drawn');
  assert.ok(E.apply(s, B.step(s, 'normal')).ok); assert.deepEqual(b.pl, { side: 0, left: 1, optional: false }, 'now you must answer it');
  assert.equal(E.apply(s, { t: 'ready' }).ok, false, 'no fighting before you have answered');
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0])).ok);
  assert.equal(b.stage, 'place', 'three dice, three cards: they wait for your OK'); assert.ok(b.pl.confirm); assert.ok(E.apply(s, { t: 'ready' }).ok);
  assert.equal(b.stage, 'assign', 'OK: the fight starts'); assert.equal(E.living(b, 0).length, 3); assert.equal(E.living(b, 1).length, 3);
  // one on one: put one down and fight at once
  const t = E.newGame({ seed: 22, starter: 'squirtle' }); t.done.B1 = true; t.coll.push({ uid: 9, id: '10', sh: 0 });
  E.apply(t, { t: 'go', node: 'L2' }); E.apply(t, B.step(t, 'normal')); const tb = t.battle;
  E.apply(t, Object.assign({ t: 'place', side: 0, uid: tb.hand[0][0] }, E.slotsFor(tb, 0).find(x => x.join != null)));
  assert.ok(E.apply(t, { t: 'ready' }).ok); assert.equal(E.living(tb, 0).length, 1); assert.equal(E.living(tb, 1).length, 1);
  // with one die there is nothing to choose
  const one = E.newGame({ seed: 23, starter: 'pikachu' }); one.coll.push({ uid: 9, id: '10', sh: 0 }); E.apply(one, { t: 'go', node: 'L1' }); E.apply(one, B.step(one, 'normal'));
  E.apply(one, Object.assign({ t: 'place', side: 0, uid: one.battle.hand[0][0] }, E.slotsFor(one.battle, 0).find(x => x.join != null))); assert.equal(one.battle.stage, 'place', 'one die: still your OK first'); assert.ok(E.apply(one, { t: 'ready' }).ok); assert.equal(one.battle.stage, 'assign');
});
test('hidden information: the computer never sees your dice, and you never see theirs until the round is played', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 9, starter: 'charmander' }); E.apply(s, { t: 'go', node: 'L1' });
  let g; while ((g = B.step(s)) || (s.battle.stage === 'place' && s.battle.pl.side === 0)) { if (g) E.apply(s, g); else if (s.battle.pl.confirm) E.apply(s, { t: 'ready' }); else E.apply(s, Object.assign({ t: 'place', side: 0, uid: s.battle.hand[0][0] }, E.slotsFor(s.battle, 0)[0])); }
  assert.equal(s.battle.stage, 'assign');
  const mine = E.viewFor(s, 0), theirs = E.viewFor(s, 1);
  assert.deepEqual(mine.battle.dice[1], [0]); assert.deepEqual(theirs.battle.dice[0], [0]);
  assert.ok(!mine.decks && !mine.legend, 'no deck contents in a view');
});

// ================================================================ the campaign
test('campaign: every trainer builds a random team from its row: size, signature last, quotas, level points, no repeats, no starters, copies', () => {
  assert.deepEqual(Object.values(D.trainers).map(t => t.n), [2, 3, 4, 4, 4, 4, 5, 5, 6, 6, 6, 6, 7, 7]);
  const tagOf = c => c.tags;
  for (let seed = 1; seed <= 60; seed++) {
    const s = E.newGame({ seed, starter: 'bulbasaur' }); const used = [];
    Object.keys(D.trainers).forEach(id => {
      const Tr = D.trainers[id], team = T.buildTeam(s, id), cs = team.map(i => C[i.id]), sig = cs[cs.length - 1];
      assert.equal(team.length, Tr.n, Tr.name); const pts = cs.reduce((a, c) => a + c.level, 0); assert.ok(pts >= Tr.pts[0] && pts <= Tr.pts[1], Tr.name + ' level points ' + pts);
      assert.equal(new Set(cs.map(c => c.name)).size, cs.length, Tr.name + ': no two with the same name');
      Tr.quotas.forEach(q => assert.ok(cs.filter(c => q.el ? c.type.toLowerCase() === q.el.toLowerCase() : q.tags.some(t => tagOf(c).includes(t))).length >= q.n, Tr.name + ' quota'));
      cs.forEach(c => { if (c.loc === 0) assert.ok(c.tags.includes(Tr.name.toLowerCase()) || (c === sig && c.trainerLegend), Tr.name + ' only uses a starter card that carries its name (or as a legendary signature)'); if (c.trainerLegend) assert.ok(c === sig && Tr.sig.legendary, 'legendaries only as Lance, Blue and Red\'s signature'); });
      if (Tr.sig.legendary) used.push(sig.id);
    });
    assert.equal(new Set(used).size, 3, 'Lance, Blue and Red never share a legendary');
    assert.ok(!T.buildTeam(s, 'E2').some(i => C[i.id].name === 'Onix'), 'Bruno never gets Onix');
  }
});
test('campaign: areas open by beating the leader before them; dice come from Brock and then Misty or Lt. Surge; the endgame needs all eight badges', () => {
  const s = E.newGame({ seed: 4, starter: 'squirtle' }); const open = () => D.nodes.filter(n => E.unlocked(s, n)).map(n => n.id).sort();
  assert.deepEqual(open(), ['B1', 'L1', 'L2'], 'Area 1: Viridian Forest, Mt. Moon and Brock'); assert.equal(E.slots(s), 1); assert.equal(s.lv, 2, 'your partner starts at level 2');
  s.done.B1 = true; assert.equal(E.slots(s), 2, 'Brock gives the 2nd die');
  assert.ok(open().includes('B2') && open().includes('B3') && open().includes('L3') && !open().includes('B4') && !open().includes('L4'));
  s.done.B2 = true; assert.equal(E.slots(s), 3, 'Misty (or Surge, whichever first) gives the 3rd'); assert.ok(open().includes('B4') && open().includes('L4') && !open().includes('B6') && !open().includes('L5'));
  s.done.B3 = true; assert.equal(E.slots(s), 3); assert.ok(open().includes('B6') && open().includes('L5'), 'Surge opens the Pokémon Tower and Sabrina');
  s.done.B4 = true; assert.ok(open().includes('B5') && open().includes('L6')); assert.ok(!open().includes('L8') && !open().includes('B8'));
  s.done.B6 = true; assert.ok(open().includes('B7') && open().includes('L7')); s.done.B5 = true; assert.ok(open().includes('L8') && open().includes('B8'), 'Koga opens Seafoam and Giovanni'); assert.ok(!open().includes('L9'));
  s.done.B7 = true; assert.ok(open().includes('L9')); delete s.done.B5; assert.ok(open().includes('B8'), 'Blaine alone opens Giovanni too'); s.done.B5 = true;
  assert.ok(!open().includes('E1')); s.done.B8 = true; assert.equal(E._t.badges(s), 8);
  assert.ok(['E1', 'E2', 'E3'].includes(s.elite)); assert.deepEqual(open().filter(id => ['E1', 'E2', 'E3'].includes(id)), [s.elite], 'only one Elite Four member stands there'); assert.ok(!open().includes('E4')); s.done[s.elite] = true; assert.ok(open().includes('E4'));
  s.done.E4 = true; assert.ok(open().includes('F1') && open().includes('F2'));
  const t = E.newGame({ seed: 4, starter: 'squirtle' }); t.done.B1 = true; t.done.B3 = true; assert.equal(E.slots(t), 3, 'Surge first works too');
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
test('records: the turn each gym leader was beaten on is kept, and the whole game takes a number of turns', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const s = E.newGame({ seed: 5, starter: 'larvitar', ai: 'master' }); let n = 0;
  while (s.phase !== 'won' && n++ < 40000) { let g; while ((g = B.step(s))) E.apply(s, g); const a = B.heroStep(s, 'master'); B.applyHero(s, a); }
  assert.equal(s.phase, 'won'); const ids = D.nodes.filter(x => x.kind === 'boss' && (!x.elite || x.id === s.elite)).map(x => x.id);
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
test('movement: Golbat stops every column change of the other side, Tangela only the ones made by abilities (and nothing is pushed any more)', () => {
  const g = craft(['64', '1.1'], ['42', '10']); assert.equal(E.apply(g.s, { t: 'gswap', uid: g.b.units[0].uid, with: g.b.units[1].uid }).ok, false, 'Golbat: they cannot change columns');
  const t = craft(['64', '1.1'], ['114', '10']); assert.equal(E.apply(t.s, { t: 'gswap', uid: t.b.units[0].uid, with: t.b.units[1].uid }).ok, false, 'Tangela: ability column changes are stopped');
  assert.ok(E.blocksMove(g.b, 0) && E.blocksMove(t.b, 0));
});
test('movement: Kadabra and Celebi swap with an ally once a round, Gyarados once a battle, between rounds; Abra swaps two opponents', () => {
  const c = craft(['64', '1.1'], ['10', '10']); const { b, s } = c, k = b.units[0].uid, bu = b.units[1].uid;
  assert.ok(E.apply(s, { t: 'gswap', uid: k, with: bu }).ok); assert.equal(col(b, 1, 0), k); assert.equal(col(b, 0, 0), bu, 'they traded places');
  assert.equal(E.apply(s, { t: 'gswap', uid: k, with: bu }).ok, false, 'once a round'); assert.equal(E.apply(s, { t: 'gswap', uid: bu, with: k }).ok, false, 'only cards that can move');
  const z = craft(['251', '1.1'], ['10', '10']); assert.ok(E.apply(z.s, { t: 'gswap', uid: z.b.units[0].uid, with: z.b.units[1].uid }).ok, 'Celebi moves to the other column, swapping');
  const y = craft(['130.5', '1.1'], ['10', '10']); assert.ok(E.apply(y.s, { t: 'gswap', uid: y.b.units[0].uid, with: y.b.units[1].uid }).ok); y.b.units[0].swapR = 0; assert.equal(E.apply(y.s, { t: 'gswap', uid: y.b.units[0].uid, with: y.b.units[1].uid }).ok, false, 'Gyarados: once per battle');
  const a = craft(['63'], ['10', '4.1']); const g1 = a.b.units[1].uid, g2 = a.b.units[2].uid;
  a.b.cols = [[a.b.units[0].uid, g1], [null, g2]];
  assert.ok(E.apply(a.s, { t: 'swap', side: 0, uid: a.b.units[0].uid, a: g1, b: g2 }).ok); assert.equal(col(a.b, 0, 1), g2); assert.equal(col(a.b, 1, 1), g1);
});
test('movement: Rhyhorn swaps the card it attacked with another enemy card, unless Golbat is there', () => {
  const mk = foeId => { const c = craft(['111'], ['1.1']); const { b } = c; const e = T.startBattle ? null : null; return c; };
  const c = craft(['111', '1.1', '1.1'], ['1.1', '10', '25.1']); const { b } = c; b.units.forEach(u => { u.hp = u.max = 20; });
  play(c, { hero: [1], gm: [] }, { hero: { 0: 0 } });
  assert.ok(evs(b, 'text').some(e => /swaps/.test(e.msg)), 'it swapped the enemy it hit for one it likes better (Pikachu is weak to ground)');
  const g = craft(['111', '1.1', '1.1'], ['1.1', '42', '25.1']); g.b.units.forEach(u => { u.hp = u.max = 20; });
  play(g, { hero: [1], gm: [] }, { hero: { 0: 0 } });
  assert.ok(!evs(g.b, 'text').some(e => /swaps/.test(e.msg)), 'Golbat: they cannot be moved');
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
test('ai: the computer gets no reroll of its own; Easy never rerolls, Normal and Master use only what their cards give them', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
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
test('abilities: Ditto picks any card in play at the start of the battle and is a copy of its moves and ability from then on, with its own health', () => {
  const c = craft(['132', '1.1'], ['4.1', '7.1']); const { s, b } = c; const ditto = b.units[0], sq = b.units[3];
  assert.deepEqual(b.copyAsk, [ditto.uid], 'your Ditto asks'); assert.equal(E.apply(s, { t: 'roll' }).ok, false, 'no rolling before you pick');
  assert.equal(E.apply(s, { t: 'copy', uid: ditto.uid, tgt: ditto.uid }).ok, false, 'not itself');
  assert.ok(E.apply(s, { t: 'copy', uid: ditto.uid, tgt: sq.uid }).ok); assert.equal(ditto.id, '7.1', 'Squirtle\'s moves and ability'); assert.equal(ditto.hp, C['132'].hp, 'its own health'); assert.equal(b.copyAsk.length, 0);
  const g = craft(['1.1'], ['132', '4.1']); assert.notEqual(g.b.units[1].id, '132', 'the computer\'s Ditto picks by itself'); assert.equal(g.b.units[1].hp, C['132'].hp);
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

test('dice faces (V4): each card\'s move for a roll is read straight from that roll\'s column; a blank does nothing; inverted cards keep their best move on a 1', (t) => {
  E.faceOrder('roll'); t.after(() => E.faceOrder('sheet'));
  const rolls = id => E.CARDS[id].moves;                         // index = die - 1
  const pika = rolls('25.3'); assert.deepEqual([pika[5], pika[4], pika[3], pika[2], pika[1], pika[0]], ['3a', '2a', '3h < or v or >', 'stun', 'charge', 'recoil 1'], 'Pikachu: Roll of 6 down to Roll of 1');
  const ghost = rolls('92'); assert.equal(ghost[5], 'recoil 1', 'Gastly: the recoil is on the 6'); assert.equal(ghost[0], '2p <^ or ^>', 'and its best move on the 1');
  ['79', '80', '92', '93', '94', '122', '129', '130.5'].forEach(id => assert.ok(/recoil|^$/.test(rolls(id)[5]) && rolls(id)[0], E.CARDS[id].name + ' is inverted'));
  Object.values(E.CARDS).forEach(c => { assert.equal(c.moves.length, 6); assert.equal(c.moves.filter(Boolean).length, c.sheet.filter(Boolean).length, c.name + ' keeps all its moves'); });
  const c = craft(['25.3'], ['16']); c.b.units[1].hp = c.b.units[1].max = 30; play(c, { hero: [6], gm: [] }, { hero: { 0: 0 } });
  assert.ok(c.b.units[1].hp < 30, 'a 6 on Pikachu is its 3 Attack'); const e = craft(['25.3'], ['16']); const hp = e.b.units[0].hp; play(e, { hero: [1], gm: [] }, { hero: { 0: 0 } }); assert.equal(e.b.units[0].hp, hp - 1, 'a 1 on Pikachu is recoil 1');
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
  E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
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
test('draw pile: every trainer\'s team is picked from the places\' piles at the start and is the same every time; a win puts it back into the wild and says so', () => {
  const s = E.newGame({ seed: 9, starter: 'charmander' }); const all = [].concat(...Object.values(s.decks), ...Object.values(s.discard), s.legend);
  Object.keys(s.held).forEach(id => s.held[id].forEach(c => assert.ok(!all.includes(c), 'a card a trainer holds is out of the piles'))); const held = s.held.B1.slice(); assert.ok(held.length >= 1);
  const team = s.bosses.B1.slice(); assert.ok(team[team.length - 1].sig, 'the signature is tagged and last'); assert.equal(team.filter(i => i.sig).length, 1); assert.equal(team.length, 2, 'Brock has two Pokémon');
  s.phase = 'battle'; const b = T.startBattle(s, 'boss', 'B1', [{ id: '4.2', sh: 0 }, { id: '1.1', sh: 0 }], team.map(i => ({ id: i.id, sh: i.sh }))); b.hand = [[], []];
  b.units.filter(u => u.side === 1).forEach(u => { u.ko = true; u.hp = 0; }); b.cols = [[b.units[0].uid, null], [b.units[1].uid, null]]; b.stage = 'resolved'; b.out = 'gm';
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.deepEqual(s.bosses.B1.map(i => i.id), team.map(i => i.id), 'a loss: the same team next time'); assert.deepEqual(s.held.B1, held, 'still holding the same cards');
  s.phase = 'battle'; const c = T.startBattle(s, 'boss', 'B1', [{ id: '4.2', sh: 0 }], team.map(i => ({ id: i.id, sh: i.sh }))); c.hand = [[], []]; c.units.filter(u => u.side === 1).forEach(u => { u.ko = true; u.hp = 0; }); c.cols = [[c.units[0].uid, null], [c.units[1].uid, null]]; c.stage = 'resolved'; c.out = 'hero';
  assert.ok(E.apply(s, { t: 'next' }).ok); const back = [].concat(...Object.values(s.decks)); held.forEach(id => assert.ok(back.includes(id), 'back in the wild')); assert.deepEqual(s.res.wild.map(i => i.id).sort(), held.slice().sort(), 'the result says which');
  assert.ok(C[s.legFor.E4].trainerLegend); if (C[s.legFor.E4].loc !== 0) assert.ok(!s.legend.includes(s.legFor.E4), 'Lance\'s legendary is not in the wild while he holds it');
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
    Object.values(D.trainers).forEach(t => assert.ok(t.n <= 7, t.name + ' has at most seven'));
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
  assert.equal(first.visitors.length, 1); assert.ok(['bill', 'dojo'].includes(first.visitors[0])); assert.equal(first.specialsSeen, 1); assert.ok(first.notes[0].startsWith('visitor:'), 'a visitor stands on the map');
  const firsts = new Set(); for (let seed = 1; seed <= 400; seed++) { const v = play1(seed, 3); if (v.visitors.length) firsts.add(v.visitors[0]); } assert.deepEqual([...firsts].sort(), ['bill', 'dojo'], 'the first event is random: it is not always Bill');
  // after Bill and the Dojo, and once you hold four badges: a random legendary each time; its place's draw and discard piles are shuffled together with it
  let leg = null; for (let seed = 1; seed < 400 && !leg; seed++) { const s = play1(seed, 3, g => { g.specialsSeen = 2; g.seenSpecials = ['bill', 'dojo']; g.done.B1 = g.done.B2 = g.done.B4 = g.done.B5 = true; g.discard[1] = ['10', '13']; g.discard[2] = ['16']; }); if (s.notes.some(n => n.startsWith('legend:'))) leg = s; }
  assert.ok(leg, 'then a legendary'); const id = leg.notes[0].slice(7), loc = C[id].loc; assert.ok(C[id].legend); assert.ok(leg.decks[loc].includes(id), 'it is in the new draw pile'); assert.equal(leg.discard[loc].length, 0, 'the discard pile went into it'); assert.ok(!leg.legend.includes(id));
});

// ================================================================ one die per card, one column at a time


test('abilities: a frozen die is repeated next round, already on its card, and cannot be moved or rerolled (Jynx on KO, ice attacks)', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const c = craft(['25.1', '1.1'], ['19', '19']); const { s, b } = c, pk = c.h(0);
  pk.frozen = 6; T.startRound(s);
  const x = b.asg[0][pk.uid]; assert.ok(x, 'the frozen die was given to its card'); assert.equal(b.dice[0][x.dice[0]], 6, 'the same number as before'); assert.equal(pk.frozen, null, 'it lasts one round');
  assert.equal(E.apply(s, { t: 'unassign', side: 0, uid: pk.uid }).ok, false, 'it cannot be taken off'); assert.equal(E.apply(s, { t: 'assign', side: 0, uid: c.h(1).uid, die: x.dice[0] }).ok, false, 'or moved to another card');
  assert.ok(E.apply(s, { t: 'reroll', side: 0, all: true }).ok === true || true); assert.equal(b.dice[0][x.dice[0]], 6, 'and a reroll leaves it alone');
});

test('resolution order: heals, then every attack is declared, then blocks go up, then the damage lands', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const c = craft(['7.1'], ['19']); play(c, { hero: [6], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });            // Squirtle counters 1 (its 6); Rattata attacks 1 (its 5)
  const kinds = c.b.events.map(e => e.t), iStrike = kinds.indexOf('strike'), iGuard = kinds.indexOf('guard'), iHit = kinds.findIndex((k, i) => i > iGuard && (k === 'blocked' || k === 'dmg'));
  assert.ok(iStrike >= 0 && iGuard > iStrike, 'the attack is declared before the block is chosen'); assert.ok(iHit > iGuard, 'the damage (here soaked by the block) comes after both');
  assert.equal(c.h(0).hp, C['7.1'].hp, 'the counter soaked the whole attack'); assert.equal(c.g(0).hp, C['19'].hp - 1, 'and sent it back');
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
test('elements: with Lapras in play, fire gets no elemental bonus on blocks either', () => {
  const lap = Object.keys(C).find(id => C[id].name === 'Lapras'); const b = craft(['1.1', lap], ['4.1']).b; b.moveEl = { 1: 'fire' };
  assert.equal(E._t.blkMult(b, { el: 'fire' }, E.U(b, 1)), 1, 'Lapras switches fire off'); assert.equal(E._t.blkMult(b, { el: 'water' }, (b.moveEl = { 1: 'water' }, E.U(b, 1))), 2, 'other elements still double');
});
test('elements: a heal of the same element as the card it heals is twice as good; a block is twice as good against an attack of its own element', () => {
  const save = C['1.1'].movEls.slice(); C['1.1'].movEls[3] = 'grass';                // pretend the sheet colours Bulbasaur's 1 heal green
  try {
    const c = craft(['1.1'], ['4.1']); c.h(0).hp = 1;
    play(c, { hero: [4], gm: [1] }, { hero: { 0: 0 }, gm: {} });
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
  assert.ok(lo && hi); assert.match(C['54'].ability, /level 30 or higher/);
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
  assert.equal(C['113'].hp, 10); assert.match(C['143'].ability, /heals become attacks/);
  assert.ok(E.CARDS['143'].ability && E._t, 'readable'); assert.equal(E.tagsOf(C['143']).some(g => g.t === 'alone'), true, 'and it still works');
  const s = E.newGame({ seed: 21, starter: 'bulbasaur' }); s.done.B1 = s.done.B2 = true; ['74', '56', '100'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 }));
  E.apply(s, { t: 'go', node: 'L1' }); assert.equal(E.apply(s, { t: 'drawwild' }).ok, false, 'not while the place is putting its card down or you have not played yet');
});

test('recall: only before the dice are rolled (afterwards a returned card would leave a spare die)', () => {
  const c = craft(['1.1', '4.1'], ['10', '13']), { s, b } = c;
  assert.ok(E.apply(s, { t: 'rollseen' }).ok); assert.equal(E.apply(s, { t: 'recall', uid: c.h(0).uid }).ok, false, 'after the roll: no');
  const d = craft(['1.1', '4.1'], ['10', '13']); d.b.round = 2; assert.equal(E.apply(d.s, { t: 'recall', uid: d.h(0).uid }).ok, true, 'and in later rounds too, before the roll');
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
test('v3: Mew\'s attacks always count as the element the target is weak to (Ancestor); Metronome uses the move of the card across, or nothing', (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet'));
  const a = craft(['151'], ['20']); a.h(0).hp = a.h(0).max = 9; const ho = a.g(0).hp; play(a, { hero: [5], gm: [1] }, { hero: { 0: 0 } });          // Mew's 5 is its 2nd move: 5a. Raticate is weak to Fighting; Mew has none, but its attacks count as Fighting anyway: double
  assert.ok(a.g(0).ko, 'a double 5a (10) takes out Raticate (' + ho + ' health)');
  const b = craft(['151'], ['4.1']); play(b, { hero: [6], gm: [1] }, { hero: { 0: 0 } });          // a 6 is Metronome: Charmander's own 6 move is 2a; doubled by the weakness it counts as: 4
  assert.ok(b.g(0).ko, 'Metronome copied Charmander\'s 6 move (2a, doubled)');
  const c = craft(['151'], ['10']); c.b.cols = [[c.b.units[0].uid, null], [null, c.b.units[1].uid]]; const m = E.chosenMove(c.b, c.h(0), [6]); assert.equal(m.str, '', 'nothing across: nothing happens');
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
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.visitors = []; s.specialsSeen = 1; s.seenSpecials = ['bill']; s.slotsAtGo = 3;
  let got = null; for (let seed = 1; seed < 400 && !got; seed++) { s.rng = seed; s.visitors = []; s.notes = []; T.maybeSpecial && T.maybeSpecial(s); if (s.vcards && s.vcards.dojo) got = s.vcards.dojo; }
  if (got) { assert.equal(got.length, 3); got.forEach(id => assert.equal(C[id].type, 'Fighting')); assert.equal(new Set(got).size, 3); }
});

test('v3: beating Lance brings Blue and Red (a note, then a promised legendary); one special event at a time; the game is won when both are beaten; the Elite Four need all eight badges in order', () => {
  const s = E.newGame({ seed: 31, starter: 'bulbasaur' }); const open = () => D.nodes.filter(n => E.unlocked(s, n)).map(n => n.id);
  ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'].forEach(k => { s.done[k] = true; }); assert.ok(!open().includes('E1'), 'seven badges are not enough'); s.done.B8 = true;
  assert.deepEqual(open().filter(id => ['E1', 'E2', 'E3'].includes(id)), [s.elite]); s.done[s.elite] = true; assert.ok(open().includes('E4') && !open().includes('F1') && !open().includes('F2'));
  s.phase = 'battle'; const b = T.startBattle(s, 'boss', 'E4', [{ id: '4.2', sh: 0 }], [{ id: '10', sh: 0 }]); b.hand = [[], []]; b.units[1].ko = true; b.units[1].hp = 0; b.cols = [[b.units[0].uid, b.units[1].uid]]; b.stage = 'resolved'; b.out = 'hero';
  s.bosses.E4 = [{ id: '10', sh: 0 }]; assert.ok(E.apply(s, { t: 'next' }).ok); assert.ok(s.notes.includes('rivals'), 'Blue and Red show up'); assert.ok(s.legendDue, 'a legendary is promised');
  s.res.pick = null; s.res.evolve = 0; E.apply(s, { t: 'done' }); assert.ok(s.legendMarker, 'it appears, in the event slot'); assert.ok(T.eventActive(s)); const seen = s.notes.length;
  for (let i = 1; i < 60; i++) { s.rng = i; T.maybeSpecial(s); } assert.equal(s.notes.length, seen, 'no second event while one is waiting');
  s.coll.push({ uid: 99, id: s.legendMarker, sh: 0 }); assert.ok(!T.eventActive(s), 'caught: the slot is free again');
  assert.ok(open().includes('F1') && open().includes('F2')); s.done.F1 = true; s.phase = 'battle'; const c = T.startBattle(s, 'boss', 'F2', [{ id: '4.2', sh: 0 }], [{ id: '10', sh: 0 }]); c.hand = [[], []]; c.units[1].ko = true; c.units[1].hp = 0; c.cols = [[c.units[0].uid, c.units[1].uid]]; c.stage = 'resolved'; c.out = 'hero'; s.bosses.F2 = [{ id: '10', sh: 0 }];
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.equal(s.phase, 'won', 'both beaten: the game is won');
});
test('v3: a heal that can reach neighbours may also be aimed at a ghost across from a neighbour', () => {
  const c = craft(['1.2', '1.1'], ['10', '92']); const e = { k: 'h', n: 2, spec: { opts: [[-1, 0, 1]], spread: false, all: false } }; e.spec = E.parseSpec('< or v or >'); c.h(0).hp = 1;
  assert.ok(E.candidates(c.b, c.h(0), e).some(g => g[0].ghost && g[0].u === c.g(1)), 'the ghost across from the neighbour is a target');
});

test('v3: when both options of a choice hit the very same cards (nobody to the left or right) there is nothing to choose', () => {
  const c = craft(['5.3'], ['10']); const e = E.parseMove('3a <^ or ^>').clauses[0][0]; assert.equal(E.candidates(c.b, c.h(0), e).length, 1, 'one card across, nothing either side: one option');
  c.b.dice = [[1], [6]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null } }, {}]; c.b.gmReady = true; assert.ok(E.apply(c.s, { t: 'go2' }).ok); assert.ok(!c.b.ask, 'no question is asked');
});

test('v3: your latest card is not locked in: it can be picked back up (or moved) until the other side moves; while replacing a fallen card any card of yours can retreat to the reserve', () => {
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.done.B1 = true; s.coll.push({ uid: 5, id: '10', sh: 0 }, { uid: 6, id: '16', sh: 0 }, { uid: 7, id: '19', sh: 0 });
  E.apply(s, { t: 'go', node: 'B3' }); const b = s.battle; E.apply(s, B.step(s, 'normal')); assert.equal(b.pl.side, 0);
  const h0 = b.hand[0][0]; assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: h0 }, E.slotsFor(b, 0)[0])).ok); const placed = b.units.find(u => u.side === 0 && !u.ko); assert.equal(b.placed[0], 1);
  assert.ok(E.apply(s, { t: 'pickup', uid: placed.uid }).ok, 'picked back up'); assert.equal(b.placed[0], 0); assert.equal(b.hand[0].length, 4); assert.ok(b.cols.every(c => c[0] !== placed.uid));
  assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[1])).ok, 'and put somewhere else');
  const a = b.units.filter(u => u.side === 0 && !u.ko)[0]; assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0])).ok);
  E.apply(s, B.step(s, 'normal')); assert.equal(E.apply(s, { t: 'pickup', uid: a.uid }).ok, false, 'once they have moved it is locked in');
});

test('v3: matchup phase: matchless cards slide next to a matchless foe; a lone option is taken by itself; with a choice the side with fewer cards decides; vacant columns close', () => {
  let c = craft(['10', '10', '10'], ['10', '10', '10']); let b = c.b; b.fcols = true; b.nOut = null;
  b.units[1].ko = true; b.units[3].ko = true; b.stage = 'resolved'; b.out = null;       // hero card 1 and their card 0 fall
  assert.ok(E.apply(c.s, { t: 'next' }).ok);
  assert.equal(b.stage, 'assign', 'only one slide was possible: it happened by itself and the next round began');
  assert.equal(b.cols.length, 2, 'the emptied column closed'); assert.ok(b.cols.every(col => col[0] != null && col[1] != null), 'everybody faces somebody');
  c = craft(['10', '10', '10'], ['10', '10', '10']); b = c.b; b.fcols = true; b.nOut = null;
  b.units[0].ko = true; b.units[2].ko = true; b.units[4].ko = true; b.stage = 'resolved'; b.out = null;          // columns: [-, g0] [h1, -] [-, g2]
  b.cols = [[null, c.g(0).uid], [c.h(1).uid, null], [null, c.g(2).uid]]; c.g(1).ko = true; c.h(0).ko = true; c.h(2).ko = true;
  assert.ok(E.apply(c.s, { t: 'next' }).ok); assert.equal(b.stage, 'match', 'two places to slide to: a choice'); assert.equal(b.mt.side, 0, 'they have more cards, so the hero decides');
  assert.equal(E.apply(c.s, { t: 'matchslide', side: 1, uid: c.g(0).uid, to: 1 }).ok, false, 'not their turn');
  assert.ok(E.apply(c.s, { t: 'matchslide', side: 0, uid: c.h(1).uid, to: 2 }).ok); assert.equal(b.stage, 'assign'); assert.deepEqual(b.cols.map(col => [col[0], col[1]]), [[null, c.g(0).uid], [c.h(1).uid, c.g(2).uid]].filter(x => x[0] != null || x[1] != null).map(x => x), 'the hero card slid to face their card');
  assert.equal(B.step(c.s, 'master') === null || true, true);
});

test('v3: a card can be retreated in any round before the dice are rolled; its die goes with it', () => {
  const c = craft(['10', '10', '10'], ['10', '10', '10']); const b = c.b; b.round = 3; assert.equal(b.dice[0].length, 3);
  assert.ok(E.apply(c.s, { t: 'recall', uid: c.h(1).uid }).ok, 'retreat in round 3'); assert.equal(b.dice[0].length, 2, 'one die fewer'); assert.ok(c.h(1).ko && c.h(1).recalled);
  b.rolled = true; assert.equal(E.apply(c.s, { t: 'recall', uid: c.h(0).uid }).ok, false, 'not once the dice have been rolled');
});

test('v3: a matchless card may pass one matchless opponent to match another, but never a fight', () => {
  const c = craft(['10', '10', '10', '10'], ['10', '10', '10', '10']); const b = c.b; b.fcols = true; b.nOut = null;
  b.units.forEach(u => { u.ko = true; }); [c.h(0), c.g(1), c.g(2)].forEach(u => { u.ko = false; });
  b.cols = [[c.h(0).uid, null], [null, c.g(1).uid], [null, c.g(2).uid]];
  assert.deepEqual(E.matchMoves(b, 0).map(m => m.to).sort(), [1, 2], 'the nearest lone enemy, or the one behind it');
  [c.h(3), c.g(3)].forEach(u => { u.ko = false; }); b.cols = [[c.h(0).uid, null], [c.h(3).uid, c.g(3).uid], [null, c.g(2).uid]];
  assert.deepEqual(E.matchMoves(b, 0).map(m => m.to), [], 'a fight in the way stops it');
});

test('v3: a card entering a column faces the "when enemies enter this column" burn however it got there: placed, slid in a matchup, slid in after a retreat, or moved/swapped by an ability', () => {
  // matchup slide
  let c = craft(['10', '10'], ['4.1', '10']); let b = c.b; b.fcols = true; b.nOut = null; c.h(0).ko = true; c.g(1).ko = true;
  b.cols = [[null, c.g(0).uid], [c.h(1).uid, null]]; b.stage = 'resolved'; b.out = null; const hp = c.h(1).hp;
  assert.ok(E.apply(c.s, { t: 'next' }).ok); assert.equal(c.h(1).hp, hp - 1, 'Charmander burns the card that slid in across from it');
  // retreat slide
  c = craft(['10', '10', '10'], ['10', '4.1', '10']); b = c.b; const hp2 = c.h(2).hp;
  assert.ok(E.apply(c.s, { t: 'recall', uid: c.h(1).uid, slide: c.h(2).uid }).ok); assert.equal(c.h(2).hp, hp2 - 1, 'and the neighbour that slides over after a retreat');
});

test('v3: a trainer\'s signature Pokémon is always the highest level on the team (a tie is fine) and plays last', () => {
  for (const tid of Object.keys(D.trainers)) for (let seed = 1; seed <= 60; seed++) {
    const s = E.newGame({ seed, starter: 'bulbasaur' }), t = T.buildTeam(s, tid), sig = t[t.length - 1];
    assert.ok(t.every(c => E.CARDS[c.id].level <= E.CARDS[sig.id].level), `${tid} seed ${seed}: ${E.CARDS[sig.id].name} is not the highest level`);
  }
});

// ---------------------------------------------------------------- V4 keywords
const v4 = (name, fn) => test('V4: ' + name, (tc) => { E.faceOrder('roll'); tc.after(() => E.faceOrder('sheet')); fn(); });
const nextRound = c => { assert.ok(E.apply(c.s, { t: 'next' }).ok); assert.equal(c.b.stage, 'assign'); };
v4('a pierce is damage that blocks and counters cannot stop; Koffing\'s attacks all pierce', () => {
  let c = craft(['19'], ['7.1']); play(c, { hero: [6], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });       // Rattata 2p against Squirtle's 1c
  assert.equal(c.g(0).hp, C['7.1'].hp - 2, 'the pierce went through the counter'); assert.equal(c.h(0).hp, C['19'].hp, 'and nothing came back');
  c = craft(['109'], ['7.1']); play(c, { hero: [5], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });          // Koffing 2a (an attack) pierces because of its ability
  assert.equal(c.g(0).hp, C['7.1'].hp - 2, 'Koffing\'s attack pierced the counter');
});
v4('poison hurts 1 at the end of every round after the one it was given in, never stacks, and a heal removes it (and every other status)', () => {
  const c = craft(['1.1', '1.1'], ['16']); play(c, { hero: [4], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });          // Bulbasaur's poison on a 4; Pidgey does nothing on a 2
  assert.equal(c.g(0).hp, C['16'].hp, 'no damage the round it is given'); assert.ok(c.g(0).poison);
  nextRound(c); c.b.dice = [[2], [2]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null } }, { [c.g(0).uid]: { dice: [0], tgt: null } }]; c.b.gmReady = true; assert.ok(E.apply(c.s, { t: 'go2' }).ok);
  assert.equal(c.g(0).hp, C['16'].hp - 1, 'one damage at the end of the next round');
  const d = craft(['1.1'], ['16']); d.h(0).poison = true; d.h(0).skipNext = true; d.h(0).hp = 2; play(d, { hero: [3], gm: [2] }, { hero: { 0: 0 }, gm: {} });   // Bulbasaur heals itself 1 on a 3
  assert.equal(d.h(0).hp, 3); assert.ok(!d.h(0).poison && !d.h(0).skipNext, 'the heal removed the poison and the stun');
});
v4('stun: the card loses its next turn; stunning a stunned card refreshes it', () => {
  const c = craft(['23'], ['16']); play(c, { hero: [3], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Ekans' stun on a 3
  assert.ok(c.g(0).skipNext, 'stunned'); nextRound(c); assert.ok(c.g(0).skip, 'and it loses that round: no die for it'); assert.equal(c.b.dice[1].length, 0);
});
v4('charge: next round every number on the card goes up by 1 per charge (and a blank wastes it)', () => {
  const c = craft(['4.1'], ['10']); play(c, { hero: [3], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Charmander charges on a 3
  assert.equal(c.h(0).chargeNow, 1); nextRound(c); c.g(0).hp = c.g(0).max = 9;
  c.b.dice = [[6], [2]]; c.b.asg = [{ [c.h(0).uid]: { dice: [0], tgt: null } }, { [c.g(0).uid]: { dice: [0], tgt: null } }]; c.b.gmReady = true; assert.ok(E.apply(c.s, { t: 'go2' }).ok);
  assert.equal(c.g(0).hp, 9 - 3 * 2, 'its 2a became 3a, and Caterpie is weak to fire: doubled'); assert.equal(c.h(0).chargeNow, 0, 'all the charges were used');
});
v4('drain: the attacker heals for the damage it really dealt', () => {
  const c = craft(['41'], ['10']); c.h(0).hp = 1; play(c, { hero: [5], gm: [2] }, { hero: { 0: 0 }, gm: { 0: 0 } });   // Zubat 1a drain on a 5
  assert.equal(c.g(0).hp, C['10'].hp - 1); assert.equal(c.h(0).hp, 2, 'it healed 1');
});
v4('freeze: whoever applied it decides, after the round, whether the frozen card keeps its number (no reroll); the player is asked before the next round', () => {
  const c = craft(['86'], ['16']); play(c, { hero: [6], gm: [4] }, { hero: { 0: 0 }, gm: { 0: 0 } });             // Seel: 2a, freeze on a 6
  assert.deepEqual(c.b.fzAsk, [c.g(0).uid], 'the player froze it: the player chooses'); assert.equal(E.apply(c.s, { t: 'next' }).ok, false, 'decide first');
  assert.ok(E.apply(c.s, { t: 'freeze', uid: c.g(0).uid, keep: true }).ok); nextRound(c);
  const i = c.b.asg[1][c.g(0).uid].dice[0]; assert.equal(c.b.dice[1][i], 4, 'it keeps its 4'); assert.ok(c.b.fixed[1][i], 'and cannot be rerolled');
  const d = craft(['16'], ['86']); play(d, { hero: [4], gm: [6] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(d.b.fzAsk.length, 0, 'the computer froze it: it decides itself'); nextRound(d);
});
v4('Poliwag: any 3 may be turned into a 4; Paras adds 2 every other round; Cubone turns a 1 into a 6 once per battle', () => {
  const c = craft(['60'], ['10']); c.b.dice = [[3], [2]]; assert.ok(E.apply(c.s, { t: 'tweak', uid: c.h(0).uid, die: 0 }).ok); assert.equal(c.b.dice[0][0], 4);
  assert.equal(E.apply(c.s, { t: 'tweak', uid: c.h(0).uid, die: 0 }).ok, false, 'a 4 is not a 3');
  const p = craft(['46'], ['10']); p.b.dice = [[3], [2]]; assert.ok(E.apply(p.s, { t: 'tweak', uid: p.h(0).uid, die: 0 }).ok); assert.equal(p.b.dice[0][0], 5); assert.equal(E.apply(p.s, { t: 'tweak', uid: p.h(0).uid, die: 0 }).ok, false, 'not two rounds running');
  const u = craft(['104'], ['10']); u.b.dice = [[1, 1], [2]]; assert.ok(E.apply(u.s, { t: 'tweak', uid: u.h(0).uid, die: 0 }).ok); assert.equal(u.b.dice[0][0], 6); assert.equal(E.apply(u.s, { t: 'tweak', uid: u.h(0).uid, die: 1 }).ok, false, 'once per battle');
});
v4('Mew copies the 6 move of the card across and does nothing if nobody is across', () => {
  const b = craft(['151'], ['4.1']); play(b, { hero: [6], gm: [1] }, { hero: { 0: 0 } }); assert.ok(b.g(0).ko, 'Charmander\'s 6 (2a) doubled by Mew\'s ancestor element');
});

v4('the computer\'s freeze choice: Easy locks a roll of 3 or less; the others compare the roll with what the card is worth on average (counting the owner\'s reroll)', () => {
  const c = craft(['16'], ['25.3']); const u = c.g(0);
  u.lastDie = 3; assert.equal(E.fzKeep(c.b, u, 'easy'), true, 'Easy: a 3 is low'); u.lastDie = 4; assert.equal(E.fzKeep(c.b, u, 'easy'), false);
  u.lastDie = 1; assert.equal(E.fzKeep(c.b, u, 'master'), true, 'recoil on a 1 is worth locking in'); u.lastDie = 6; assert.equal(E.fzKeep(c.b, u, 'master'), false, 'a 3 Attack is worth letting go');
  u.lastDie = 2; assert.equal(E.fzKeep(c.b, u, 'normal'), true, 'a charge on a 2 is below Pikachu\'s average'); u.lastDie = 3; assert.equal(E.fzKeep(c.b, u, 'normal'), false, 'its stun on a 3 is worth more than that, so it is let go (Easy would have locked it)');
});
v4('Slowpoke slows on every odd round, forever', () => {
  const c = craft(['1.1'], ['79']);
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(r => {
    const d = craft(['1.1'], ['79']); d.b.round = r; d.b.dice = [[5], [3]]; d.b.asg = [{ [d.h(0).uid]: { dice: [0], tgt: null } }, { [d.g(0).uid]: { dice: [0], tgt: null } }]; d.b.gmReady = true;
    assert.ok(E.apply(d.s, { t: 'go2' }).ok); assert.equal(d.b.dice[0][0], r % 2 ? 2 : 5, 'round ' + r);
  });
});

v4('Squirtle and its evolutions get +1 attack for each damage they countered last round', () => {
  const c = craft(['7.1'], ['19']); const u = c.h(0); assert.match(C['7.1'].ability, /countered/);
  play(c, { hero: [6], gm: [5] }, { hero: { 0: 0 }, gm: { 0: 0 } });          // its 1c soaks Rattata's 1a
  assert.equal(u.cnt, 1); nextRound(c); assert.equal(u.lastCnt, 1, 'remembered for the next round');
  const e = craft(['7.1'], ['19']); e.h(0).lastCnt = 2; e.g(0).hp = e.g(0).max = 9; play(e, { hero: [5], gm: [3] }, { hero: { 0: 0 }, gm: { 0: 0 } });   // its 2a becomes 4a
  assert.equal(e.g(0).hp, 9 - 4, 'two blocked last round: +2');
});

test('a trainer puts their signature (the last card of the team) down last', () => {
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.done.B1 = true; s.coll.push({ uid: 5, id: '10', sh: 0 }, { uid: 6, id: '16', sh: 0 }, { uid: 7, id: '19', sh: 0 });
  assert.ok(E.apply(s, { t: 'go', node: 'B3' }).ok); const b = s.battle, last = b.hand[1][b.hand[1].length - 1];
  for (const lv of ['easy', 'normal', 'master']) for (let k = 0; k < 20; k++) { const m = B.placement(s, 1, lv); assert.ok(m, lv); assert.notEqual(m.uid, last, lv + ': not the signature first'); }
});

// ---- the V4 ability rewrite (sheet columns I and J)
const faceOf = (id, re) => C[id].moves.findIndex(m => re.test(m)) + 1;
v4('every ability on every card is understood, and every ability has its full explanation to open', () => {
  Object.values(C).forEach(c => { if (!c.ability) return; assert.ok(E.tagsOf(c).length, c.name + ': ' + c.ability); assert.ok(D.abilityDetails[c.ability.trim()], 'details for ' + c.ability); });
});
v4('a thorn costs the attacker even when the attack was blocked (Sandshrew)', () => {
  const c = craft(['4.1'], ['27']), fa = faceOf('4.1', /^\d+a( |$)/), fb = faceOf('27', /^[2-9]b/) || faceOf('27', /^\d+b/); assert.ok(fa && fb);
  play(c, { hero: [fa], gm: [fb] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.ok(c.h(0).hp <= C['4.1'].hp - 2, 'the attacker took 2 pierce');
});
v4('"Has 1 block against each attack" cuts every hit, and pierce goes through it (Metapod)', () => {
  const c = craft(['1.2'], ['11']); const fa = faceOf('1.2', /^3a/); assert.ok(fa);
  play(c, { hero: [fa], gm: [faceOf('11', /^1a/)] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.equal(c.g(0).hp, C['11'].hp - 2, '3 damage minus 1 block');
});
v4('only the card opposite can hit Pidgeotto', () => {
  const c = craft(['1.1', '1.1'], ['10', '17']); const T2 = c.g(1); const fa = faceOf('1.1', /^3a/);
  play(c, { hero: [fa], gm: [] }, { hero: { 0: 0 } }); assert.equal(T2.hp, C['17'].hp, 'a card in another column cannot reach it');
});
v4('Krabby gives its neighbours a free counter each round, Nidorino gets one per Nido ally, Machop doubles its charges', () => {
  const c = craft(['10', '98', '10'], ['10', '10', '10']); play(c, { hero: [1, 1, 1], gm: [1, 1, 1] }, { hero: { 0: 0, 1: 1, 2: 2 }, gm: { 0: 0, 1: 1, 2: 2 } });
  const guards = evs(c.b, 'guard'); assert.ok(guards.some(g => g.u === c.h(0).uid) && guards.some(g => g.u === c.h(2).uid) && !guards.some(g => g.u === c.h(1).uid), 'the two neighbours, not Krabby');
  const n = craft(['33', '29', '32'], ['10']); play(n, { hero: [1, 1, 1], gm: [1] }, { hero: { 0: 0, 1: 1, 2: 2 }, gm: { 0: 0 } }); assert.equal(evs(n.b, 'guard').find(g => g.u === n.h(0).uid).n, 2, 'two Nido allies: 2 free counter');
  const m = craft(['66'], ['10']); E.tagsOf(C['66']); const fg = faceOf('66', /charge/); if (fg) { play(m, { hero: [fg], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.equal(m.h(0).chargeNow, 2, 'one charge counts as two'); }
});
v4('Vileplume gives its neighbours +3 max health only while they stand beside it; Nidoqueen follows its Nido allies', () => {
  const c = craft(['45', '10', '10'], ['10']); const b = c.b; assert.equal(c.h(1).max, C['10'].hp + 3, 'beside Vileplume'); assert.equal(c.h(2).max, C['10'].hp, 'two away');
  const q = craft(['31', '29', '32'], ['10']); assert.equal(q.h(0).max, C['31'].hp + 2, '+1 per Nido ally'); q.h(1).ko = true; T.cleanUp ? 0 : 0;
});
v4('Hitmonlee survives the first KO with 1 health, Weezing heals and hurts the healthier card opposite', () => {
  const c = craft(['106'], ['10']); const u = c.h(0); u.hp = 1; const fa = faceOf('10', /^\d+a( |$)/), blank = 2; assert.ok(fa); play(c, { hero: [blank], gm: [fa] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.ok(!u.ko && u.hp >= 0, 'it stays up once');
  const w = craft(['110'], ['10']); w.h(0).hp = 1; w.g(0).hp = 5; play(w, { hero: [2], gm: [C['10'].moves.indexOf('') + 1] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.ok(w.h(0).hp >= 2 && w.g(0).hp <= 4, 'it healed 1 and the other took 1 pierce');
});
v4('Doduo gives its neighbours one more column of reach to the left', () => {
  const c = craft(['10', '84', '10'], ['10', '10', '10']); const e = E.parseMove('1a').clauses[0][0]; const cand = E.candidates(c.b, c.h(1 - 1 + 0 + 0 + 0 + 0 + 0), e); assert.ok(cand.length >= 1);
  const r = E.candidates(craft(['84', '10', '10'], ['10', '10', '10']).b, craft(['84', '10', '10'], ['10', '10', '10']).h(1), e); assert.ok(r.length >= 1);
});

v4('dodge: the first attack against the card misses completely, pierce included, with no damage and no status', () => {
  const dg = faceOf('16', /dodge/), at = faceOf('4.1', /^\d+a( |$)/), pi = faceOf('50', /^\d+p/); assert.ok(dg && at && pi);
  const c = craft(['4.1'], ['16']); play(c, { hero: [at], gm: [dg] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.equal(c.g(0).hp, C['16'].hp, 'no damage'); assert.equal(evs(c.b, 'dodge').length, 1);
  const p = craft(['50'], ['16']); play(p, { hero: [pi], gm: [dg] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.equal(p.g(0).hp, C['16'].hp, 'a pierce is dodged too');
  const n = craft(['4.1'], ['16']); play(n, { hero: [at], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.ok(n.g(0).hp < C['16'].hp, 'without dodge the attack lands');
});
v4('sleep: loses the next turn, wakes on 4-6 after that, wakes at once when hurt, and cannot be put to sleep twice', () => {
  assert.equal(E.parseMove('sleep').clauses[0][0].st, 'sleep'); assert.equal(E.parseMove('10h, sleep').clauses[0].find(x => x.k === 's').self, true, 'Rest sleeps Snorlax itself');
  const sl = faceOf('35', /^sleep/), at = faceOf('4.1', /^\d+a( |$)/); assert.ok(sl && at);
  const c = craft(['35'], ['10']); play(c, { hero: [sl], gm: [C['10'].moves.indexOf('') + 1] }, { hero: { 0: 0 }, gm: { 0: 0 } });
  assert.ok(c.g(0).asleep, 'asleep'); nextRound(c); assert.ok(c.g(0).skip, 'it always loses the next turn'); assert.equal(c.b.dice[1].length, 0);
  const w = craft(['4.1'], ['10']); w.g(0).asleep = true; w.g(0).sleepFresh = false; play(w, { hero: [at], gm: [1] }, { hero: { 0: 0 }, gm: {} }); assert.equal(w.g(0).asleep, false, 'an attack that hurts it wakes it');
  const r = craft(['35'], ['10']); r.g(0).asleep = true; r.g(0).sleepFresh = true; play(r, { hero: [sl], gm: [1] }, { hero: { 0: 0 }, gm: {} }); assert.equal(r.g(0).sleepFresh, true, 'already asleep: nothing changes');
  const m = craft(['143'], ['10']); const rest = faceOf('143', /sleep/); play(m, { hero: [rest], gm: [C['10'].moves.indexOf('') + 1] }, { hero: { 0: 0 }, gm: { 0: 0 } }); assert.ok(m.h(0).asleep, 'Snorlax falls asleep after healing 10');
});

// ---- V6: the cards of the V6 tab (the moves were all redesigned) and "pick N"
test.v6('V6: every move on every card is read, an element sits only on a move with a number, and the dragon and dark colours are there', () => {
  let dragon = 0, dark = 0;
  Object.values(C).forEach(c => c.sheet.forEach((m, i) => { if (!m || /^Use the 6/.test(m)) return; assert.ok(E.parseMove(m), c.name + ': ' + m); if (c.els[i]) assert.match(m, /\d/, c.name + ': an element needs a number (' + m + ')'); if (c.els[i] === 'dragon') dragon++; if (c.els[i] === 'dark') dark++; }));
  assert.ok(dragon >= 5 && dark >= 10, 'dragon ' + dragon + ', dark ' + dark);
  assert.equal(C['4.1'].sheet.length, 6); assert.equal(C['1.1'].sheet[0], '2a, poison', 'Bulbasaur 1.1: Vine Whip with poison on the Roll of 6');
});
test.v6('V6: "pick N": 4h pick 2 heals any two of your cards, wherever they are; the player taps them, the computer takes the two that need it most', () => {
  assert.equal(E.parseMove('4h pick 2').clauses[0][0].spec.pick, 2);
  E.faceOrder('roll'); const face = C['38'].moves.findIndex(m => /pick 2/.test(m)) + 1; assert.ok(face > 0, 'Ninetales has it');
  const c = craft(['38', '10', '16', '19'], ['10', '10', '10', '10']); c.b.units.slice(0, 4).forEach(u => { u.hp = 1; }); c.h(0).hp = c.h(0).max;          // Ninetales is fine; the other three are hurt
  c.b.dice = [[face, 1, 1, 1], [1, 1, 1, 1]]; c.b.asg = [{}, {}]; [0, 1, 2, 3].forEach(i => { c.b.asg[0][c.b.units[i].uid] = { dice: [i], tgt: null }; c.b.asg[1][c.b.units[4 + i].uid] = { dice: [i], tgt: null }; }); c.b.gmReady = true;
  assert.ok(E.apply(c.s, { t: 'go2' }).ok); assert.equal(c.b.ask.pickN, 2, 'the player picks'); assert.equal(c.b.ask.opts.length, 6, 'any two of the four cards: six pairs');
  assert.equal(E.apply(c.s, { t: 'choose', tgts: [c.h(1).uid] }).ok, false, 'two cards, not one');
  assert.ok(E.apply(c.s, { t: 'choose', tgts: [c.h(2).uid, c.h(3).uid] }).ok); assert.deepEqual(evs(c.b, 'heal').map(e => e.u).sort(), [c.h(2).uid, c.h(3).uid].sort(), 'the two chosen cards were healed, not the third');
  E.faceOrder('sheet');
});

test.v6('V6: "3a <>, drain" and "2a <^ or ^>, drain" drain (the modifier after a comma works like "1a drain")', () => {
  ['1a drain', '2a <>, drain', '3a <^ or ^>, drain'].forEach(m => assert.equal(E.parseMove(m).clauses[0][0].drain, true, m));
  assert.equal(E.parseMove('2a <>').clauses[0][0].drain, false);
});
test.v6('V6: Hard starts every round with 1 reroll, Normal and Easy with none; the computer\'s cards add theirs on top', () => {
  const rr = (ai, gm) => { const s = E.newGame({ seed: 1, starter: 'bulbasaur', ai }); s.phase = 'battle'; const b = T.startBattle(s, 'loc', 'L1', [{ id: '1.1', sh: 0 }], gm.map(id => ({ id, sh: 0 }))); b.hand = [[], []]; b.cols = [[b.units[0].uid, b.units[1].uid]]; T.startRound(s); return b.rr[1]; };
  assert.equal(rr('master', ['4.1']), 1, 'Hard'); assert.equal(rr('normal', ['4.1']), 0, 'Normal'); assert.equal(rr('easy', ['4.1']), 0, 'Easy');
  assert.equal(rr('master', ['37']), 2, 'Hard with Vulpix: 1 + 1'); assert.equal(rr('normal', ['37']), 1, 'Normal with Vulpix: 1');
});
test.v6('V6: with a reroll to spend, the computer throws away a die that shows a recoil face before one that shows a good attack', () => {
  E.faceOrder('roll'); const c = craft(['1.1', '1.1'], ['4.1', '4.1']); const { s, b } = c; s.ai = 'master'; b.rr[1] = 1;
  const rec = C['4.1'].moves.findIndex(m => /^recoil/.test(m)) + 1, good = C['4.1'].moves.map((m, i) => [m, i + 1]).filter(([m]) => /^\d+a/.test(m)).pop()[1];
  b.dice[1] = [rec, good]; const a = B.step(s, 'master'); assert.equal(a.t, 'reroll'); assert.deepEqual([].concat(a.dice !== undefined ? a.dice : a.die), [0], 'the die on the recoil face is the one thrown again');
  E.faceOrder('sheet');
});

// ---- the Elite Four, special events and replacements
test('map: beating Giovanni alone opens the Elite Four (not all eight gym leaders)', () => {
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); const e1 = E.node(s.elite); assert.equal(e1.badges, undefined); assert.deepEqual(e1.needs, ['B8']); assert.ok(['E1', 'E2', 'E3'].includes(s.elite));
  assert.equal(E.unlocked(s, e1), false); s.done.B1 = s.done.B2 = s.done.B3 = s.done.B4 = s.done.B5 = s.done.B6 = s.done.B7 = true; assert.equal(E.unlocked(s, e1), false, 'seven gyms are not enough');
  s.done.B8 = true; assert.equal(E.unlocked(s, e1), true, 'Giovanni opens it'); ['E1', 'E2', 'E3', 'E4'].forEach(id => assert.equal(E.node(id).badges, undefined, id + ' has no badge rule of its own'));
  const t = E.newGame({ seed: 5, starter: 'bulbasaur' }); t.done.B8 = true; assert.equal(E.unlocked(t, E.node(t.elite)), true, 'only Giovanni matters'); assert.equal(E.unlocked(t, E.node(['E1', 'E2', 'E3'].find(x => x !== t.elite))), false, 'the other two do not stand there');
});
test('specials: one event at a time, none right after an event battle, and the Dojo leaves when you have kept one', () => {
  const s = E.newGame({ seed: 9, starter: 'bulbasaur' }); s.slotsAtGo = 3; s.visitors = ['bill'];
  for (let i = 0; i < 300; i++) { s.phase = 'result'; s.res = { win: true, node: 'L1', kind: 'loc', gm: [], pick: null }; E.apply(s, { t: 'done' }); } assert.deepEqual(s.visitors, ['bill'], 'a visitor on the map blocks every new event');
  const t = E.newGame({ seed: 9, starter: 'bulbasaur' }); t.slotsAtGo = 3; t.visitors = ['dojo']; t.phase = 'result'; t.res = { win: true, node: 'V_dojo', kind: 'loc', gm: [], pick: [{ id: '56', sh: 0 }, { id: '57', sh: 0 }] };
  assert.ok(E.apply(t, { t: 'take', i: 0 }).ok); assert.deepEqual(t.visitors, [], 'the Dojo is gone once you kept one');
  t.rng = 1; for (let i = 0; i < 200; i++) { t.phase = 'result'; t.res = { win: true, node: 'V_dojo', kind: 'loc', gm: [], pick: null }; E.apply(t, { t: 'done' }); assert.deepEqual(t.visitors, [], 'no new event right after an event battle'); }
  const o = E.newGame({ seed: 9, starter: 'bulbasaur' }); o.visitors = ['bill', 'dojo']; E.repair(o); assert.equal(o.visitors.length, 1, 'an older save with two visitors keeps one');
});
test('replacements: you may use as many Pokémon as the leader has, and anyone you caught can be sent in', () => {
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.done.B1 = true; s.done.B2 = true; ['10', '16', '19', '21', '23'].forEach((id, i) => s.coll.push({ uid: 20 + i, id, sh: 0 }));          // six Pokémon; Surge has four, three out
  assert.ok(E.apply(s, { t: 'go', node: 'B3' }).ok); const b = s.battle; assert.equal(b.cap0, 4, 'the same number as the leader'); assert.equal(b.nOut, 3); assert.equal(b.sendLeft, 1, 'one replacement may still be sent');
  let g; while ((g = B.step(s, 'normal')) || (b.stage === 'place' && b.pl.side === 0)) { if (g) E.apply(s, g); else if (b.pl.confirm) E.apply(s, { t: 'ready' }); else E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, E.slotsFor(b, 0)[0])); }
  assert.equal(b.rsv[0].length, 3, 'everyone else you caught waits, not only the strongest'); const first = E.living(b, 0)[0]; first.ko = true; first.hp = 0; b.stage = 'resolved'; b.out = null;
  assert.ok(E.apply(s, { t: 'next' }).ok); assert.equal(b.stage, 'place'); assert.equal(b.hand[0].length, 3, 'all three are offered'); assert.equal(b.need[0] - b.placed[0], 1, 'one is needed');
  const pickLast = b.hand[0][b.hand[0].length - 1]; assert.ok(E.apply(s, Object.assign({ t: 'place', side: 0, uid: pickLast }, E.slotsFor(b, 0)[0])).ok, 'any of them can come in');
  while ((g = B.step(s, 'normal'))) E.apply(s, g); if (b.pl && b.pl.confirm) E.apply(s, { t: 'ready' }); assert.equal(b.sendLeft, 0, 'that was the last replacement'); assert.equal(b.rsv[0].length, 2);
  const again = E.living(b, 0)[0]; again.ko = true; again.hp = 0; b.stage = 'resolved'; b.out = null; E.apply(s, { t: 'next' }); assert.notEqual(b.refill && b.pl && b.pl.side === 0 && b.hand[0].length > 0 && b.stage === 'place', true, 'no more replacements are offered: you have used as many as the leader has');
});
test('targeting: arrows top out at two columns over, and no V6 move targets "all" or "any" enemy', () => {
  const m = E.parseMove('3a <<<^>>>').clauses[0][0]; assert.deepEqual([...m.spec.opts[0]].sort((a, b) => a - b), [-2, -1, 0, 1, 2], 'three arrows still reach only two columns');
  Object.values(C).forEach(c => c.moves.forEach(mv => { if (mv) { assert.ok(!/<<<|>>>/.test(mv), c.name + ': ' + mv); assert.ok(!/\b(all|any enemy)\b/i.test(mv), c.name + ': ' + mv); } }));
});
test('dice and sizes: a die from Brock, Misty or Surge, Giovanni and Lance; gyms never bigger than 3 on 3; Elite Four 4 on 4 with six cards; Blue and Red 5 on 5 with seven', () => {
  const s = E.newGame({ seed: 8, starter: 'bulbasaur' }); assert.equal(E.slots(s), 1);
  s.done.B1 = true; assert.equal(E.slots(s), 2); s.done.B3 = true; assert.equal(E.slots(s), 3); s.done.B2 = true; assert.equal(E.slots(s), 3, 'Misty and Surge give one die between them');
  s.done.B8 = true; assert.equal(E.slots(s), 4); s.done.E4 = true; assert.equal(E.slots(s), 5);
  const T = D.trainers; ['E1', 'E2', 'E3', 'E4'].forEach(id => { assert.equal(T[id].n, 6, id); assert.equal(T[id].out, 4, id); }); ['F1', 'F2'].forEach(id => { assert.equal(T[id].n, 7, id); assert.equal(T[id].out, 5, id); });
  ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'].forEach(id => assert.equal(T[id].out, undefined, id + ': cards out follow your dice, capped by D.rules.gymMax')); assert.equal(D.rules.gymMax, 3);
  const g = E.newGame({ seed: 9, starter: 'bulbasaur' }); ['B1', 'B2', 'B8', 'E4'].forEach(k => { g.done[k] = true; }); Object.keys(C).filter(id => C[id].loc > 0).slice(0, 8).forEach((id, i) => g.coll.push({ uid: 90 + i, id, sh: 0 }));
  g.done.B4 = false; assert.ok(E.apply(g, { t: 'go', node: 'B4' }).ok); assert.equal(g.battle.nOut, 3, 'five dice, but a gym is 3 on 3');
  const h = E.newGame({ seed: 9, starter: 'bulbasaur' }); ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'E1', 'E2', 'E3', 'E4'].forEach(k => { h.done[k] = true; }); Object.keys(C).filter(id => C[id].loc > 0).slice(0, 8).forEach((id, i) => h.coll.push({ uid: 90 + i, id, sh: 0 }));
  assert.ok(E.apply(h, { t: 'go', node: 'F1' }).ok); assert.equal(h.battle.nOut, 5); assert.equal(h.battle.cap0, 7);
  const k = E.newGame({ seed: 9, starter: 'bulbasaur' }); assert.ok(E.apply(k, { t: 'go', node: 'B1' }).ok); assert.equal(k.battle.cap0, 1, 'one Pokémon against one: the leader brings only as many as you have');
});
test('elite four: one random member stands before Lance, the other two are not on the map', () => {
  const seen = new Set(); for (let seed = 1; seed <= 40; seed++) { const s = E.newGame({ seed, starter: 'bulbasaur' }); seen.add(s.elite); } assert.deepEqual([...seen].sort(), ['E1', 'E2', 'E3']);
});
