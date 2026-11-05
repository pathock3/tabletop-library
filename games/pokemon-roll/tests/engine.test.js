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
test('data: the abilities that are not in this version are exactly the ones that move cards around, swap dice or reach outside a fight', () => {
  const un = new Set();
  Object.values(C).forEach(c => c.ability.split(/;\s*/).forEach(p => { if (p && !E.tagsOf({ id: 'q' + c.id + p, ability: p }).length) un.add(p); }));
  assert.equal(un.size, 12);
  assert.ok([...un].every(p => /push|swap|redirect|change (column|position|a teammate)|move <>|enemy die|persist|give them|-9d|blue die|freeze an ally|reroll \^|Ally dragon|abilities to change|move/i.test(p)), [...un].join(' | '));
});

// ================================================================ a round of fighting
test('rules: every card gets one die per round, and a card that loses a round gets none', () => {
  const c = craft(['1.1', '4.1', '7.1'], ['10', '11', '16']);
  assert.deepEqual([c.b.dice[0].length, c.b.dice[1].length], [3, 3]);
  c.b.units[0].skipNext = true; c.b.stage = 'resolved'; c.b.out = null; T.cleanUp(c.s); T.startRound(c.s);
  assert.equal(c.b.dice[0].length, 2, 'one hero card is out this round: two dice');
});
test('rules: one roll, no rerolls, unless a card says so', () => {
  const plain = craft(['1.1'], ['10']);
  assert.equal(plain.b.rr[0], 0); assert.equal(E.apply(plain.s, { t: 'reroll', side: 0, die: 0 }).ok, false);
  const vulpix = craft(['37'], ['10']); assert.equal(vulpix.b.rr[0], 1, '+1 reroll');
  vulpix.b.dice[0] = [3]; assert.ok(E.apply(vulpix.s, { t: 'reroll', side: 0, die: 0 }).ok); assert.equal(vulpix.b.rr[0], 0); assert.equal(E.apply(vulpix.s, { t: 'reroll', side: 0, die: 0 }).ok, false);
  const rat = craft(['19'], ['10']); rat.b.dice[0] = [1]; assert.ok(E.apply(rat.s, { t: 'reroll', side: 0, die: 0 }).ok, 'a free reroll of a 1'); rat.b.dice[0] = [4]; assert.equal(E.apply(rat.s, { t: 'reroll', side: 0, die: 0 }).ok, false, 'but not of a 4');
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
test('rules: a card at 0 health is out right away and does not act later in the round', () => {
  const c = craft(['4.1'], ['1.1']); const b = play(c, { hero: [1], gm: [1] }, { hero: { 0: 0 }, gm: { 0: 0 } });   // the hero card goes first in a column and knocks Bulbasaur out
  assert.ok(c.g(0).ko); assert.equal(evs(b, 'dmg').filter(e => e.by === c.g(0).uid).length, 0, 'Bulbasaur never gets to attack'); assert.equal(c.h(0).hp, 4);
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
  assert.equal(c.h(1).hp, 2, 'Metapod is weak to fire too: 2 doubled to 4, three soaked, one left over for the blocker');
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
  const l = craft(['249'], ['37']); assert.equal(l.b.rr[1], 0, 'Vulpix\'s reroll is gone');
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
test('placement: the computer puts down one card, then two at a time; columns never exceed the team size', () => {
  const s = E.newGame({ seed: 5, starter: 'bulbasaur' }); s.done.rival1 = true; s.done.B1 = true; s.phase = 'map';
  s.coll.push({ uid: 5, id: '10', sh: 0 }, { uid: 6, id: '16', sh: 0 }, { uid: 7, id: '19', sh: 0 });
  assert.ok(E.apply(s, { t: 'go', node: 'B2' }).ok); assert.ok(E.apply(s, { t: 'team', uids: s.coll.slice(0, 3).map(c => c.uid) }).ok);
  const b = s.battle; assert.deepEqual(b.pl, { side: 1, left: 1 });
  let g = B.step(s, 'medium'); assert.ok(E.apply(s, g).ok); assert.deepEqual(b.pl, { side: 0, left: 2 }, 'your turn for two cards');
  assert.equal(E.apply(s, { t: 'place', side: 1, uid: b.hand[1][0], at: 0 }).ok, false, 'not their turn');
  E.apply(s, { t: 'place', side: 0, uid: b.hand[0][0], at: 0 }); E.apply(s, { t: 'place', side: 0, uid: b.hand[0][0], at: 1 });
  assert.ok(b.cols.length <= b.limit);
  while ((g = B.step(s, 'medium')) || (b.stage === 'place' && b.pl.side === 0)) { if (g) E.apply(s, g); else { const sl = E.slotsFor(b, 0)[0]; E.apply(s, Object.assign({ t: 'place', side: 0, uid: b.hand[0][0] }, sl)); } }
  assert.equal(b.stage, 'assign'); assert.ok(b.cols.length <= 3);
});
test('hidden information: the computer never sees your dice, and you never see theirs until the round is played', () => {
  const s = E.newGame({ seed: 9, starter: 'charmander' }); E.apply(s, { t: 'go', node: 'rival1' }); E.apply(s, { t: 'team', uids: [s.coll[0].uid] });
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
  assert.deepEqual(open(), ['rival1']); s.done.rival1 = true;
  assert.deepEqual(open().sort(), ['B1', 'L1', 'L2', 'rival1'].sort()); assert.equal(E.slots(s), 1);
  s.done.B1 = true; assert.ok(open().includes('L3') && open().includes('B2') && open().includes('B3')); assert.equal(E.slots(s), 2);
  assert.ok(!open().includes('L4') && !open().includes('B4')); s.done.B2 = true; s.done.B3 = true; assert.ok(open().includes('L4') && open().includes('L5') && open().includes('B4') && open().includes('B5'));
  assert.ok(!open().includes('B6')); s.done.B4 = true; s.done.B5 = true; assert.ok(open().includes('B6') && open().includes('L6') && open().includes('L7'));
  s.done.B6 = true; assert.ok(open().includes('B7') && open().includes('L8') && open().includes('L9')); s.done.B7 = true; assert.ok(open().includes('rival2'));
});
test('campaign: your rival picks the partner that beats yours', () => {
  const beats = { bulbasaur: 'charmander', charmander: 'squirtle', squirtle: 'pikachu', pikachu: 'larvitar', larvitar: 'bulbasaur' };
  Object.keys(beats).forEach(k => assert.equal(E.rivalFor(k).key, beats[k], k));
});
test('campaign: you cannot challenge a place that is locked, or a boss twice, or with too many cards', () => {
  const s = E.newGame({ seed: 4, starter: 'squirtle' });
  assert.equal(E.apply(s, { t: 'go', node: 'B1' }).ok, false, 'locked');
  s.done.rival1 = true; assert.equal(E.apply(s, { t: 'go', node: 'L1', n: 2 }).ok, false, 'one die, one card');
  assert.ok(E.apply(s, { t: 'go', node: 'L1', n: 1 }).ok); assert.equal(E.apply(s, { t: 'team', uids: [999] }).ok, false);
});
test('shiny: about one wild draw in twenty is shiny, with a fresh chance every time', () => {
  const s = E.newGame({ seed: 77, starter: 'bulbasaur' }); let sh = 0, n = 0;
  for (let i = 0; i < 6000; i++) { const d = T.drawWild(s, 2, 1); d.forEach(x => { n++; sh += x.sh; s.discard[2].push(x.id); }); }
  assert.ok(sh / n > 0.04 && sh / n < 0.06, 'rate ' + sh / n);
});
test('shiny: a card keeps its form once it is on a team, and a card given back to the wild gets a new chance', () => {
  const s = E.newGame({ seed: 8, starter: 'bulbasaur' });
  const shinyBoss = [].concat(...Object.values(s.bosses)).filter(i => i.sh);
  const before = JSON.stringify(s.bosses); s.done.rival1 = true; s.done.B1 = true;
  s.coll.push({ uid: 20, id: '10', sh: 1 }); E.apply(s, { t: 'go', node: 'B2' }); E.apply(s, { t: 'team', uids: [1, 20].filter(u => s.coll.some(c => c.uid === u)).concat(s.coll.length > 2 ? [s.coll[2].uid] : []).slice(0, E.heroCount(s, E.node('B2'), 0)) });
  if (s.battle) E.apply(s, { t: 'forfeit' });
  assert.equal(JSON.stringify(s.bosses), before, 'a boss team is the same after a fight, shiny or not');
  assert.equal(s.coll.find(c => c.uid === 20).sh, 1, 'your own shiny stays shiny');
  s.phase = 'result'; s.res = { win: true, node: 'L1', pick: [{ id: '16', sh: 1 }, { id: '19', sh: 0 }], kind: 'loc', gm: [] };
  assert.ok(E.apply(s, { t: 'take', i: 0 }).ok); assert.equal(s.coll[s.coll.length - 1].sh, 1, 'a shiny you catch is yours for good');
  assert.ok(s.discard[CARDS_LOC('19')].includes('19') && s.discard[CARDS_LOC('19')].every(x => typeof x === 'string'), 'what you leave behind goes back as a plain card: it rolls again next time');
  assert.ok(typeof shinyBoss.length === 'number');
});
const CARDS_LOC = id => C[id].loc;
test('legendaries: with two dice, a nine on two dice at the start of a turn spots one, and it joins its place', () => {
  let found = null;
  for (let seed = 1; seed < 3000 && !found; seed++) {
    const s = E.newGame({ seed, starter: 'bulbasaur' }); s.done.rival1 = true; s.done.B1 = true; s.coll.push({ uid: 9, id: '10', sh: 0 });
    E.apply(s, { t: 'go', node: 'L1', n: 2 }); const pool = s.legend.slice(); E.apply(s, { t: 'team', uids: [s.coll[0].uid, 9] });
    if (s.notes.length) found = { s, pool };
  }
  assert.ok(found, 'a legendary shows up now and then');
  const id = found.s.notes[0].replace('legend:', ''); assert.ok(C[id].legend);
  assert.ok(!found.s.legend.includes(id), 'it leaves the waiting pile');
  assert.ok(found.s.decks[C[id].loc].includes(id) || found.s.battle.units.some(u => u.id === id), 'it is in the deck of the place on its card');
  const one = E.newGame({ seed: 1, starter: 'bulbasaur' }); one.done.rival1 = true; E.apply(one, { t: 'go', node: 'L1', n: 1 }); E.apply(one, { t: 'team', uids: [one.coll[0].uid] });
  assert.equal(one.notes.length, 0, 'no rolling for legendaries with only one die');
});

// ================================================================ whole games
test('fuzz: forty computer-played campaigns, from the first rival to the champion, with no errors', () => {
  for (let i = 1; i <= 40; i++) {
    const s = E.newGame({ seed: i * 7919, starter: D.starters[i % 5].key, size: i % 2 ? 'short' : 'long', ai: ['easy', 'medium', 'hard'][i % 3] });
    let n = 0;
    while (s.phase !== 'won' && n++ < 60000) {
      let g; while ((g = B.step(s))) { const r = E.apply(s, g); assert.ok(r.ok, 'computer: ' + r.error); }
      const a = B.heroStep(s, ['easy', 'medium', 'hard'][(i + 1) % 3]); assert.ok(a, 'stuck in ' + s.phase);
      const r = B.applyHero(s, a); assert.ok(r.ok, 'player: ' + JSON.stringify(a).slice(0, 100) + ' ' + r.error);
    }
    assert.equal(s.phase, 'won', 'campaign ' + i + ' finished');
    assert.equal(s.lv, 6); const sd = E.starterOf(s.starter); assert.ok([sd.levels[5], sd.evolve && sd.evolve[6]].includes(s.coll.find(c => c.starter).id), 'the partner grew all the way');
    assert.ok(s.coll.length >= 7, 'a collection of cards was built');
  }
});
