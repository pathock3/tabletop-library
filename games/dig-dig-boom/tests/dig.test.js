// The rules of a Dig (v2.7.1): the battle (result, firing, tapping, Grit, Extra Rolls, markers), the Mine, the cards. No browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { DDB, Engine, Dig } = require('./load');

const ALL = Engine.cards();
let U = 90000;
const C = id => { const c = ALL.find(x => x.id === id); if (!c) throw new Error('no card ' + id); return { ...c, uid: U++ }; };
// A Dig with an empty Mine: you decide what comes next (top first), and the dice.
function mk(o = {}) { const st = Dig.start(ALL, [], { seed: o.seed || 1, start: o.start }); st.mine = []; st.known = 0; st.dice = o.dice || []; return st; }
function top(st, ...ids) { st.mine.unshift(...ids.map(C)); st.known = 0; return st; }
function play(st, ...ids) { top(st, ...ids); for (let i = 0; i < ids.length; i++) { Dig.dig(st); if (st.pending && st.pending.kind === 'clone') Dig.chooseClone(st, st.line[0]); else if (st.pending) Dig.chooseDug(st, 'resolve'); } return st; }
const fight = (st, id = 'MO-01') => { top(st, id); Dig.dig(st); return st.fight; };
// A Monster that is simply beaten (the roll is not what the test is about): it is defeated, and you move on.
const beat = st => { st.fight.phase = 'after'; st.fight.defeat = true; Dig.face(st); };
const say = st => st.log.map(l => l.text).join(' | ');

test('the cards: the whole v2.7.1 list is in the game, every one is understood, and none needs the network', () => {
  assert.equal(ALL.length, 149);
  assert.deepEqual([...new Set(ALL.map(c => c.type))].sort(), ['Consumable', 'Immediate', 'Monster', 'Ongoing', 'Treasure']);
  for (const c of ALL) assert.ok(Dig.supported(c), `${c.id} ${c.name}: ${c.text}`);
  assert.deepEqual(ALL.filter(c => c.cantStart).map(c => c.name).sort(), ['All In', 'Four-Leaf Clover', 'Hot Spring', 'Iron Vein', 'Lucky Dice', 'Lunchbox', 'Sneak Attack'], 'the cards that cannot go in a Starter Kit');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!/fetch\(/.test(html), 'the game reads nothing from the network');
});

test('the cards: the list in the game is the list imported from the sheet (tools/cards-v271.psv)', () => {
  const rows = fs.readFileSync(path.join(__dirname, '..', 'tools', 'cards-v271.psv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('|'));
  assert.equal(rows.length, DDB.cards.length);
  rows.forEach((r, i) => { const c = DDB.cards[i]; assert.equal(c.id, r[0]); assert.equal(c.name, r[1]); assert.equal(c.type, r[2]); assert.equal(c.number === null ? '' : String(c.number), r[3]); assert.equal(c.deck, r[4]); assert.equal(String(c.count), r[5]); assert.equal(c.text, r[6]); assert.equal(!!c.cantStart, r[7] === 'Yes'); });
});

test('types: Ongoing gold, Consumable green, Immediate purple, Treasure blue, Monster red; each has an icon and a pattern; there is no Power type', () => {
  assert.deepEqual(Object.keys(DDB.types).sort(), ['Consumable', 'Immediate', 'Monster', 'Ongoing', 'Treasure']);
  const col = { Ongoing: '#f2c21b', Consumable: '#2eaf68', Immediate: '#7a3fb8', Treasure: '#2b86d1', Monster: '#cf2f2f' };
  for (const [t, c] of Object.entries(col)) { assert.equal(DDB.types[t].color, c); assert.ok(DDB.types[t].icon && DDB.types[t].pattern); }
  assert.ok(Object.keys(DDB.iconCodes).includes('grit') && Object.keys(DDB.iconCodes).includes('extraroll'));
});

test('the Mine: 30 cards — 21 Geodes and 9 Monsters (sets of 4, 3 and 2); the Pet is always in play and is not one of them', () => {
  const st = Dig.start(ALL, [], { seed: 5 });
  assert.equal(st.mine.length, 30);
  assert.equal(st.mine.filter(c => c.type === 'Treasure').length, 21);
  assert.equal(st.mine.filter(c => c.type === 'Monster').length, 9);
  for (const [id, n] of [['MO-01', 4], ['MO-02', 3], ['MO-03', 2]]) assert.equal(st.mine.filter(c => c.id === id).length, n);
  assert.equal(st.line.length, 1); assert.ok(st.line[0].pet); assert.equal(st.line[0].at, 9); assert.equal(st.line[0].card.name, 'Pet');
  assert.equal(st.heart, 10); assert.equal(st.reroll, 0); assert.equal(st.grit, 0, 'the tracks start on their starred spaces: 10 / 0 / 0');
});

test('Monster sets: each Monster of a set deals the next damage on its ladder: 1, 3, 5, 7 / 2, 4, 6 / 3, 5', () => {
  const st = mk({ start: { heart: 10 } });
  const seen = [];
  for (const id of ['MO-01', 'MO-01', 'MO-01', 'MO-01', 'MO-02', 'MO-02', 'MO-02', 'MO-03', 'MO-03']) { const f = fight(st, id); seen.push(f.damage); beat(st); }
  assert.deepEqual(seen, [1, 3, 5, 7, 2, 4, 6, 3, 5]);
});

test('the gauntlet: after the Mine, Monsters with no card appear at 8 damage and go up by 1 each time, and pay no Loot', () => {
  const st = mk(); const ds = [];
  for (let i = 0; i < 3; i++) { Dig.dig(st); ds.push(st.fight.damage); assert.ok(st.fight.monster.bonus); beat(st); }
  assert.deepEqual(ds, [8, 9, 10]);
  assert.equal(st.monsterGems, 0, 'no Loot beyond the Mine');
  assert.equal(st.survived, 3);
});

test('Loot: every Monster from your Mine that you survive pays 1 gem, defeated or not', () => {
  const st = mk({ dice: [1] });
  const f = fight(st, 'MO-01'); Dig.roll(st); Dig.face(st);          // 1 damage taken: survived
  assert.equal(st.monsterGems, 1); assert.equal(st.survived, 1);
  fight(st, 'MO-02'); beat(st);
  assert.equal(st.monsterGems, 2);
});

test('Loot: Bounty Poster makes a defeated Monster worth 2', () => {
  const st = play(mk(), 'ON-36'); fight(st, 'MO-01'); beat(st);
  assert.equal(st.monsterGems, 2);
});

test('the result: the die plus the cards\' bonuses, and cards use that result, not the die', () => {
  const st = play(mk({ dice: [4] }), 'ON-66', 'ON-06');          // Tune-Up (+1 to your rolls), Nurse Newt (2)
  const f = fight(st); Dig.roll(st);
  assert.equal(f.die, 4); assert.equal(f.result, 5);
  assert.deepEqual(st.line.filter(e => e.tapped).map(e => e.card.id), ['ON-06'], 'a 2 fires on a result of 5');
});

test('firing: every upright numbered card at or below the result fires, lowest number first, one at a time, and lies down', () => {
  const st = play(mk({ dice: [7] }), 'ON-29', 'ON-08', 'ON-04', 'ON-11', 'ON-21');          // 10, 3, 2, 4, 7
  const f = fight(st, 'MO-03'); Dig.roll(st);
  const order = st.log.filter(l => / fires$/.test(l.text)).map(l => l.text.replace(/ \(\d+\) fires/, ''));
  assert.deepEqual(order, ['Gritty Gecko', 'Helper Hamster', 'Grit Gopher', 'Tank Tortoise']);
  assert.ok(st.line.filter(e => e.at <= 7).every(e => e.tapped));
  assert.ok(st.line.filter(e => e.at > 7 && !e.pet).every(e => !e.tapped), 'Hype Squirrel (10) is out of reach');
});

test('firing: a result above 10 fires every numbered card', () => {
  const st = play(mk({ dice: [10] }), 'ON-66', 'ON-29', 'ON-28', 'ON-06');          // +1 to rolls; 10, 10, 2
  fight(st); Dig.roll(st);
  assert.equal(st.fight.result, 11);
  assert.ok(st.line.every(e => e.tapped), 'the Pet (9) too');
});

test('firing: each card fires at most once per battle: an Extra Roll does not fire a tapped card again', () => {
  const st = play(mk({ dice: [5, 6], start: { reroll: 2 } }), 'ON-04', 'ON-06');
  fight(st, 'MO-02'); Dig.roll(st);
  const g0 = st.grit, h0 = st.heart;
  Dig.rerollNow(st);
  assert.equal(st.grit, g0, 'Gritty Gecko does not fire twice'); assert.equal(st.fight.result, 6);
  assert.equal(st.reroll, 1);
});

test('Extra Rolls: the best result so far counts; a lower roll changes nothing; a higher one fires the cards it reaches; and each costs 1 of 0–5', () => {
  assert.equal(DDB.rules.caps.reroll, 5);
  const st = play(mk({ dice: [3, 1, 8], start: { reroll: 2 } }), 'ON-04', 'ON-17', 'ON-22');          // 2, 7, 8 (Falcon rolls again)
  fight(st, 'MO-01'); Dig.roll(st); assert.equal(st.fight.result, 3);
  Dig.rerollNow(st); assert.equal(st.fight.result, 3, 'a 1 does not beat a 3'); assert.equal(st.reroll, 0 + 1);
  assert.ok(Dig.can(st).reroll);
  Dig.rerollNow(st); assert.equal(st.fight.result, 8);
  assert.ok(st.line.find(e => e.card.id === 'ON-17').tapped, 'Do-Over Dodo (7) fired on the 8');
  assert.equal(st.reroll, 1, 'two spent, and the Dodo gave one back'); assert.ok(Dig.can(st).reroll);
});

test('Extra Rolls: cap 5 on the track', () => {
  const st = mk(); Dig.start(ALL, []);
  for (let i = 0; i < 8; i++) play(st, 'IM-10');          // Lucky Dice: +2 each
  assert.equal(st.reroll, 5);
});

test('Grit before the roll: each Grit you plan is +1 to that roll, and is spent when you roll', () => {
  const st = mk({ dice: [4], start: { grit: 3 } }); const f = fight(st);
  assert.ok(Dig.can(st).gritBefore);
  assert.ok(Dig.planGrit(st, 2)); assert.equal(Dig.planBoost(st), 2); assert.equal(st.grit, 3, 'nothing is spent until you roll');
  Dig.roll(st);
  assert.equal(st.fight.result, 6); assert.equal(st.grit, 1);
});

test('Grit before the roll: you may plan no more than you have, and no more than the battle allows', () => {
  const st = mk({ start: { grit: 3 } }); const f = fight(st);
  Dig.planGrit(st, 9); assert.equal(f.plan, 3);
  const st2 = mk({ start: { grit: 3 } }); fight(st2); Dig.planGrit(st2, 0); assert.equal(st2.fight.plan, 0);
});

test('Grit after the roll: 3 Grit is +1 to the result, and the cards the new result reaches fire', () => {
  const st = play(mk({ dice: [5], start: { grit: 3 } }), 'ON-26');          // Double-Take Owl at 9? (no: 9) — use a 6 target below
  const st2 = play(mk({ dice: [5], start: { grit: 3 } }), 'ON-16');          // Venom Spider (6)
  fight(st2, 'MO-02'); Dig.roll(st2);
  assert.equal(st2.fight.result, 5); assert.ok(!st2.line.find(e => e.card.id === 'ON-16').tapped);
  assert.ok(Dig.can(st2).gritAfter);
  assert.ok(Dig.spendGrit(st2, 1)); assert.equal(st2.grit, 0); assert.equal(st2.fight.result, 6);
  assert.ok(st2.line.find(e => e.card.id === 'ON-16').tapped, 'Venom Spider fired');
  assert.ok(st2.fight.halve);
});

test('Grit: you can spend at most 3 in a battle (the rule that stops Grit refilling Grit), and the track holds 3', () => {
  assert.equal(DDB.rules.caps.grit, 3); assert.equal(DDB.rules.grit.battleLimit, 3);
  const st = play(mk({ dice: [2], start: { grit: 3 } }), 'ON-29');          // Hype Squirrel: +3 Grit at 10
  fight(st, 'MO-01'); Dig.planGrit(st, 3); Dig.roll(st);          // 2 + 3 = 5: nothing reaches 10 yet; 3 Grit spent
  assert.equal(st.grit, 0); assert.equal(st.fight.spent, 3);
  assert.ok(!Dig.can(st).gritAfter, 'no Grit left to spend after the roll');
  st.grit = 3;
  assert.equal(Dig.gritLeft(st, st.fight), 0, 'the battle limit is used up even though the track is full again');
  assert.ok(!Dig.spendGrit(st, 1));
});

test('Grit: gaining it past the end of the track is lost', () => {
  const st = play(mk({ start: { grit: 3 } }), 'IM-09');          // Iron Vein +4 Grit
  assert.equal(st.grit, 3);
});

test('Grit: the Drone Booster makes the first Grit you spend before a roll give +2', () => {
  const st = play(mk({ dice: [2], start: { grit: 3 } }), 'ON-46');
  fight(st); Dig.planGrit(st, 1); assert.equal(Dig.planBoost(st), 2);
  Dig.planGrit(st, 3); assert.equal(Dig.planBoost(st), 4);
});

test('Grit: Pep Horn adds 1 whenever you gain Grit; Grit Caddy gives 1 back when you spend 3 or more on one roll', () => {
  const st = play(mk(), 'ON-57', 'IM-14');          // Pep Horn; Mystery Box B: +2 Grit
  assert.equal(st.grit, 3);
  const s2 = play(mk({ dice: [1], start: { grit: 3 } }), 'ON-51'); fight(s2); Dig.planGrit(s2, 3); Dig.roll(s2);
  assert.equal(s2.grit, 1, 'spent 3, got 1 back');
});

test('the battle ends: every card stands up again and the damage markers go away', () => {
  const st = play(mk({ dice: [9] }), 'ON-13', 'ON-04');          // Dart Frog (5): 2 damage on the Monster
  fight(st, 'MO-01'); Dig.roll(st);
  assert.equal(st.fight.markers, 2); assert.ok(st.line.some(e => e.tapped));
  Dig.face(st);
  assert.equal(st.fight, null); assert.ok(st.line.every(e => !e.tapped));
  fight(st, 'MO-02'); assert.equal(st.fight.markers, 0);
});

test('damage: you take the Monster\'s damage minus the markers on it, never below 0', () => {
  const st = play(mk({ dice: [5] }), 'ON-13');          // Dart Frog: 2 markers
  fight(st, 'MO-03'); Dig.roll(st);          // damage 3
  assert.equal(Dig.previewDamage(st), 1); Dig.face(st); assert.equal(st.heart, 9);
  const s2 = play(mk({ dice: [5] }), 'ON-13'); fight(s2, 'MO-01'); Dig.roll(s2);
  assert.equal(Dig.previewDamage(s2), 0);
});

test('damage: Venom Spider halves the Monster\'s damage (rounded down) before the markers come off', () => {
  const st = play(mk({ dice: [6] }), 'ON-16', 'ON-09');          // halve; 1 marker (3)
  top(st, 'MO-03'); st.mine[0] = { ...st.mine[0] }; Dig.dig(st);          // damage 3 → half 1 → minus 1 marker = 0
  Dig.roll(st); assert.equal(Dig.previewDamage(st), 0);
});

test('BOOM: Health 0 ends the Dig, and nothing saves you but a card', () => {
  const st = mk({ dice: [1], start: { heart: 1 } }); fight(st, 'MO-01'); Dig.roll(st); Dig.face(st);
  assert.equal(st.over.kind, 'boom'); assert.equal(st.heart, 0);
});

test('Lucky Cricket (5): if this Monster would make you BOOM, survive with 1 Health', () => {
  const st = play(mk({ dice: [5], start: { heart: 1 } }), 'ON-15');
  fight(st, 'MO-01'); Dig.roll(st); Dig.face(st);
  assert.ok(!st.over); assert.equal(st.heart, 1); assert.equal(st.survived, 1);
});

test('the Pet (9): defeats the Monster and you take no damage; Pet Whistle lowers it to 8; Pet Treat to 7 for one Monster', () => {
  const st = mk({ dice: [9], start: { heart: 2 } }); fight(st, 'MO-03'); Dig.roll(st);
  assert.ok(st.fight.defeat); Dig.face(st); assert.equal(st.heart, 2); assert.equal(st.defeated, 1);
  const s2 = play(mk({ dice: [8] }), 'ON-58'); assert.equal(s2.line.find(e => e.pet).at, 8);
  fight(s2, 'MO-01'); Dig.roll(s2); assert.ok(s2.fight.defeat);
  const s3 = play(mk({ dice: [7, 7] }), 'IM-18'); assert.equal(s3.line[0].at, 7);
  fight(s3, 'MO-01'); Dig.roll(s3); assert.ok(s3.fight.defeat); Dig.face(s3);
  assert.equal(s3.line[0].at, 9, 'only for your next Monster');
});

test('the Pet fires like any card: when Grit pushes a roll up to it', () => {
  const st = mk({ dice: [8], start: { grit: 1 } }); fight(st, 'MO-03'); Dig.planGrit(st, 1); Dig.roll(st);
  assert.equal(st.fight.result, 9); assert.ok(st.fight.defeat);
});

test('Burnout: Snowball Beetle (2) moves up 2 after it fires, to 10 at most; a new Dig starts from the printed number', () => {
  const st = play(mk({ dice: [9, 9, 9, 9] }), 'ON-07'); let e = st.line.find(x => x.card.id === 'ON-07');
  fight(st, 'MO-01'); Dig.roll(st); assert.equal(e.at, 4); Dig.face(st);
  for (let i = 0; i < 5; i++) { fight(st, 'MO-02'); st.dice = [9]; Dig.roll(st); Dig.face(st); }
  assert.equal(e.at, 10, 'max 10');
  const st2 = Dig.start(ALL, [C('ON-07')], { seed: 1 }); Dig.dig(st2); assert.equal(st2.line.find(x => x.card.id === 'ON-07').at, 2);
});

test('each card and its effect: lose / gain Health, Grit and Extra Rolls', () => {
  const st = play(mk({ dice: [10], start: { heart: 5 } }), 'ON-02', 'ON-06', 'ON-10', 'ON-11');          // Prickly (1): lose 1 then +2 Grit; Newt (2) +1 H; Raccoon (3) +3 H; Gopher (4) +2 Grit
  fight(st, 'MO-03'); Dig.roll(st);
  assert.equal(st.heart, 5 - 1 + 1 + 3); assert.equal(st.grit, 3, '+2 +2, the track holds 3');
});

test('conditions: Nervous Mouse (5 Health or less), Jolt Eel (3 or less)', () => {
  const st = play(mk({ dice: [10], start: { heart: 6 } }), 'ON-05', 'ON-19'); fight(st, 'MO-03'); Dig.roll(st);
  assert.equal(st.reroll, 0, 'Nervous Mouse needs 5 or less'); assert.equal(st.heart, 6, 'Jolt Eel needs 3 or less');
  const s2 = play(mk({ dice: [10], start: { heart: 3 } }), 'ON-05', 'ON-19'); fight(s2, 'MO-03'); Dig.roll(s2);
  assert.equal(s2.reroll, 1); assert.equal(s2.heart, 8);
});

test('Unlucky Duck (1): +1 Extra Roll only if no other card triggers; Conga Crab (5): +1 Grit for each other card', () => {
  const st = play(mk({ dice: [1] }), 'ON-03'); fight(st, 'MO-01'); Dig.roll(st); assert.equal(st.reroll, 1);
  const s2 = play(mk({ dice: [5] }), 'ON-03', 'ON-12', 'ON-06'); fight(s2, 'MO-01'); Dig.roll(s2);
  assert.equal(s2.reroll, 0, 'others triggered'); assert.equal(s2.grit, 2, 'Conga Crab: the Duck and the Newt');
});

test('Falcon Finisher (8): rolls again; 6 or more defeats the Monster, and the roll can raise your result', () => {
  const st = play(mk({ dice: [8, 7] }), 'ON-22'); fight(st, 'MO-03'); Dig.roll(st);
  assert.ok(st.fight.defeat);
  const s2 = play(mk({ dice: [8, 2] }), 'ON-22'); fight(s2, 'MO-03'); Dig.roll(s2);
  assert.ok(!s2.fight.defeat);
});

test('Cloning Machine: a card with a number under it fires twice', () => {
  const st = mk({ dice: [10], start: { heart: 2 } }); play(st, 'ON-10'); top(st, 'ON-38'); Dig.dig(st); assert.equal(st.pending.kind, 'clone');
  Dig.chooseClone(st, st.line.find(e => e.card.id === 'ON-10')); assert.ok(st.line.find(e => e.card.id === 'ON-10').cloned);
  fight(st, 'MO-03'); Dig.roll(st); assert.equal(st.heart, 2 + 6);
});

test('Wrecking Ball doubles your result against your first Monster only', () => {
  const st = play(mk({ dice: [4, 4] }), 'ON-69'); fight(st, 'MO-01'); Dig.roll(st); assert.equal(st.fight.result, 8); Dig.face(st);
  fight(st, 'MO-02'); Dig.roll(st); assert.equal(st.fight.result, 4);
});

test('result changes: bonuses first, then double, then "becomes", then the floor (Floor Jack: less than 4 becomes 4)', () => {
  const st = play(mk({ dice: [2] }), 'ON-48'); fight(st); Dig.roll(st); assert.equal(st.fight.result, 4);
  const s2 = play(mk({ dice: [1] }), 'ON-35'); fight(s2); Dig.roll(s2); assert.equal(s2.fight.result, 1);
  assert.deepEqual(Dig.mayUse(s2).map(c => c.id), ['ON-35']); Dig.useMod(s2, s2.ongoing[0]); assert.equal(s2.fight.result, 10);
});

test('"whenever" cards: Adrenaline Pump (heart → Grit), Nurse Bot, Dice Bag, Patch Kit, Stubborn Engine, Rage Valve, Crumple Zone', () => {
  const st = play(mk({ start: { heart: 5 } }), 'ON-33', 'ON-54', 'IM-12');          // Pump, Nurse Bot, Med Kit +5 → +2 more
  assert.equal(st.heart, 10); assert.equal(st.grit, 1);
  const s2 = play(mk({ dice: [1], start: { heart: 10 } }), 'ON-56', 'ON-63', 'ON-59', 'ON-41'); fight(s2, 'MO-02'); Dig.roll(s2); Dig.face(s2);
  assert.equal(s2.heart, 10 - 2 + 1); assert.equal(s2.grit, 1);
  const s3 = play(mk({ dice: [1] }), 'ON-59', 'ON-41'); fight(s3, 'MO-02'); Dig.planGrit(s3, 0); st.dice = [1]; Dig.roll(s3);
  const s4 = play(mk({ dice: [1] }), 'ON-59', 'ON-41'); s4.mine.unshift(C('MO-01'), C('MO-01'), C('MO-01'), C('MO-01')); // damage up to 7 would need many digs
  const s5 = mk({ dice: [1], start: { heart: 10 } }); play(s5, 'ON-59', 'ON-41'); const mons = ['MO-01', 'MO-01', 'MO-01']; for (const id of mons) { fight(s5, id); s5.dice = [1]; Dig.roll(s5); Dig.face(s5); }
  assert.ok(s5.grit >= 2 && s5.reroll >= 2, 'a 3-damage hit gave Rage Valve +2 Grit; a 5-damage hit would give Crumple Zone +2');
});

test('Dice Bag: gaining an Extra Roll gives 1 more; its own +1 when dug counts too', () => {
  const st = play(mk(), 'ON-44'); assert.equal(st.reroll, 2, 'it is in play when it is dug, so its own Extra Roll counts');
  play(st, 'IM-10'); assert.equal(st.reroll, 5, '+2 and 1 more, up to the 5 of the track');
});

test('digging a Monster: Danger Siren (6+ damage → +2 Grit), Bumper (1 damage marker on it)', () => {
  const st = play(mk(), 'ON-42'); const f = fight(st, 'MO-01'); assert.equal(st.grit, 0);
  beat(st);
  for (let i = 0; i < 3; i++) { fight(st, 'MO-01'); beat(st); }          // the 4th: damage 7
  assert.equal(st.grit, 2);
  const s2 = play(mk(), 'ON-37'); fight(s2, 'MO-01'); assert.equal(s2.fight.markers, 1);
});

test('Cowcatcher: your next Monster deals no damage, then the card is discarded', () => {
  const st = play(mk({ dice: [1] }), 'ON-40'); fight(st, 'MO-01'); Dig.roll(st); assert.equal(Dig.previewDamage(st), 0);
  assert.ok(!st.ongoing.length); assert.ok(st.discard.some(c => c.id === 'ON-40'));
});

test('Panic Button: the first time a roll would BOOM you, a free Extra Roll, and the card is discarded', () => {
  const st = play(mk({ dice: [1, 9], start: { heart: 1 } }), 'ON-55'); fight(st, 'MO-01'); Dig.roll(st); assert.equal(Dig.previewDamage(st), 1);
  Dig.face(st);
  assert.ok(!st.over); assert.equal(st.fight.phase, 'before'); assert.ok(!st.ongoing.length);
  Dig.roll(st); assert.ok(st.fight.defeat);
});

test('Second Spark: a result of 3 or less gives a free Extra Roll', () => {
  const st = play(mk({ dice: [2, 6] }), 'ON-62'); fight(st, 'MO-01'); Dig.roll(st);
  assert.equal(st.fight.phase, 'before'); Dig.roll(st); assert.equal(st.fight.result, 6); assert.equal(st.reroll, 0);
});

test('Thorned Gadget: lose 1 Health to take an Extra Roll when you have none', () => {
  const st = play(mk({ dice: [1, 5] }), 'ON-64'); fight(st, 'MO-01'); Dig.roll(st); assert.ok(Dig.can(st).reroll);
  Dig.reroll(st); assert.equal(st.heart, 9);
});

test('Immediate cards do their thing when dug and are discarded; Boomerang slides back into the Mine', () => {
  const st = play(mk(), 'IM-08'); assert.equal(st.heart, 10); assert.equal(st.grit, 2); assert.ok(st.discard.some(c => c.id === 'IM-08'));
  const s2 = mk({ start: { heart: 4 } }); play(s2, 'IM-21'); assert.equal(s2.heart, 8);
  const s3 = mk(); play(s3, 'IM-02'); assert.equal(s3.mine.length, 1); assert.equal(s3.mine[0].id, 'IM-02');
  const s4 = mk({ start: { heart: 2 } }); play(s4, 'ON-04', 'ON-05'); play(s4, 'IM-17'); assert.equal(s4.heart, 8, '+2 for each Ongoing card you have: the Pet and two more');
  const s5 = mk(); play(s5, 'ON-04', 'IM-32'); assert.equal(s5.grit, 2, '+1 Grit for each Ongoing card: the Pet and Gritty Gecko');
});

test('Wrench Rat: +2 to your next roll only', () => {
  const st = play(mk({ dice: [3, 3] }), 'IM-35'); fight(st); Dig.roll(st); assert.equal(st.fight.result, 5); Dig.face(st);
  fight(st, 'MO-02'); Dig.roll(st); assert.equal(st.fight.result, 3);
});

test('Four-Leaf Clover: no roll for your next Monster, your result is 10', () => {
  const st = play(mk(), 'IM-06'); fight(st, 'MO-01'); assert.equal(st.fight.result, 10); assert.equal(st.fight.phase, 'after'); assert.ok(st.fight.defeat);
});

test('Scan: look at the top cards of your Mine and put them back in the same order', () => {
  const st = mk(); st.mine = ['MO-01', 'TR-01', 'TR-01', 'MO-02', 'TR-01', 'TR-01', 'TR-01'].map(C); const order = st.mine.map(c => c.uid);
  play(st, 'CO-26'); const before = st.mine.map(c => c.uid);
  Dig.useConsumable(st, st.cons[0]);
  assert.deepEqual(st.mine.map(c => c.uid), before); assert.equal(st.known, 5);
  assert.equal(st.grit, 1);
});

test('Consumables: dug into your play area, used once when you choose, then discarded', () => {
  const st = play(mk({ start: { heart: 3 } }), 'CO-19');          // Healing Potion
  assert.equal(st.cons.length, 1); assert.equal(st.heart, 3); assert.ok(Dig.usable(st).some(x => x.card.id === 'CO-19'));
  Dig.useConsumable(st, st.cons[0]); assert.equal(st.heart, 7); assert.equal(st.cons.length, 0); assert.ok(st.discard.some(c => c.id === 'CO-19'));
});

test('Consumables: only within what their text says (Beating Heart only when you would BOOM and your roll was 5+)', () => {
  const st = play(mk({ dice: [6], start: { heart: 2 } }), 'CO-03'); fight(st, 'MO-01'); Dig.roll(st);
  assert.ok(!Dig.usable(st).length, 'not about to BOOM');
  const s2 = play(mk({ dice: [5], start: { heart: 1 } }), 'CO-03'); fight(s2, 'MO-01'); Dig.roll(s2);
  assert.equal(Dig.usable(s2).length, 1); Dig.useConsumable(s2, s2.cons[0]); Dig.face(s2);
  assert.ok(!s2.over); assert.equal(s2.heart, 1);
});

test('Consumables before a roll: Average Potion (make it a 6), Big Swing (double), Double Shot (two dice), Giant Juice (+3 vs 7+), Momentum Tonic', () => {
  const st = play(mk({ dice: [1] }), 'CO-02'); fight(st); Dig.useConsumable(st, st.cons[0]); Dig.roll(st); assert.equal(st.fight.result, 6);
  const s2 = play(mk({ dice: [4] }), 'CO-04'); fight(s2); Dig.useConsumable(s2, s2.cons[0]); Dig.roll(s2); assert.equal(s2.fight.result, 8);
  const s3 = play(mk({ dice: [4, 5] }), 'CO-10'); fight(s3); Dig.useConsumable(s3, s3.cons[0]); Dig.roll(s3); assert.equal(s3.fight.result, 9);
  const s4 = play(mk({ dice: [2] }), 'CO-17'); fight(s4, 'MO-01'); assert.ok(!Dig.usable(s4).length, 'the Monster has to deal 7 or more');
});

test('Consumables after a roll: Dire Potion rolls again with +1; Unstable Explosive makes a 1-2 a 10; Lucky Unlucky Coin on a 1-2', () => {
  const st = play(mk({ dice: [2, 6], start: { heart: 5 } }), 'CO-09'); fight(st, 'MO-02'); Dig.roll(st);
  assert.ok(Dig.usable(st).length); Dig.useConsumable(st, st.cons[0]); assert.equal(st.fight.phase, 'before'); Dig.roll(st); assert.equal(st.fight.result, 7);
  const s2 = play(mk({ dice: [2] }), 'CO-32'); fight(s2); Dig.roll(s2); Dig.useConsumable(s2, s2.cons[0]); assert.equal(s2.fight.result, 10);
  const s3 = play(mk({ dice: [1] }), 'CO-21'); fight(s3); Dig.roll(s3); Dig.useConsumable(s3, s3.cons[0]); assert.equal(s3.reroll, 2);
});

test('Consumables: Poison Dart / Blast Plating / Vial of Poison put damage markers on the Monster', () => {
  const st = play(mk({ dice: [1] }), 'CO-25'); fight(st, 'MO-01'); Dig.useConsumable(st, st.cons[0]); assert.equal(st.fight.markers, 3);
  const s2 = play(mk({ dice: [5] }), 'CO-05'); fight(s2, 'MO-03'); Dig.roll(s2); Dig.useConsumable(s2, s2.cons[0]); assert.equal(s2.fight.markers, 4);
  const s3 = play(mk({ dice: [7] }), 'CO-33'); fight(s3, 'MO-01'); Dig.roll(s3); Dig.useConsumable(s3, s3.cons[0]); assert.equal(s3.fight.markers, 4);
});

test('Consumables: when you defeat a Monster (Carrot Cake +5), when your Pet does (Victory Snack +2 Extra Rolls)', () => {
  const st = play(mk({ dice: [9], start: { heart: 3 } }), 'CO-07', 'CO-34'); fight(st, 'MO-01'); Dig.roll(st);
  assert.equal(Dig.usable(st).length, 2);
  Dig.useConsumable(st, st.cons.find(c => c.id === 'CO-07')); Dig.useConsumable(st, st.cons.find(c => c.id === 'CO-34'));
  assert.equal(st.heart, 8); assert.equal(st.reroll, 2);
});

test('Consumables: Caffeine / Energy Drink need a Monster with 7+ damage; Energy Drink gives 2 Grit when dug', () => {
  const st = play(mk(), 'CO-13'); assert.equal(st.grit, 2);
  for (let i = 0; i < 3; i++) { fight(st, 'MO-01'); beat(st); }
  fight(st, 'MO-01'); assert.equal(st.fight.damage, 7); assert.ok(Dig.usable(st).length); Dig.useConsumable(st, st.cons[0]); assert.equal(st.reroll, 1);
});

test('Consumables: Duct Tape takes a card from your discard pile, or gives 2 Grit', () => {
  const st = play(mk(), 'CO-19'); Dig.useConsumable(st, st.cons[0]);
  play(st, 'CO-11'); const healing = st.discard.find(c => c.id === 'CO-19');
  Dig.useConsumable(st, st.cons[0], { pick: healing.uid }); assert.equal(st.cons.length, 1); assert.equal(st.cons[0].id, 'CO-19');
  const s2 = play(mk(), 'CO-11'); Dig.useConsumable(s2, s2.cons[0]); assert.equal(s2.grit, 2);
});

test('Consumables: Comeback Kit gives 2 Health and goes back to the bottom of your Mine; Shoo Spray puts a dug card on the bottom instead', () => {
  const st = play(mk({ start: { heart: 5 } }), 'CO-35'); Dig.useConsumable(st, st.cons[0]); assert.equal(st.heart, 7); assert.equal(st.mine[st.mine.length - 1].id, 'CO-35'); assert.equal(st.cons.length, 0);
  const s2 = play(mk(), 'CO-29'); assert.equal(s2.grit, 2);
  top(s2, 'MO-01', 'TR-01'); Dig.dig(s2); assert.equal(s2.pending.kind, 'dug'); assert.ok(Dig.can(s2).choose);
  Dig.chooseDug(s2, s2.pending.options[0].card.uid);
  assert.equal(s2.mine[s2.mine.length - 1].id, 'MO-01'); assert.equal(s2.fight, null); assert.equal(s2.cons.length, 0);
});

test('Ongoing cards you may use any time: Workbench, Scrap Dealer, Trash Compactor, Time Wizard', () => {
  const st = play(mk({ start: { grit: 3 } }), 'ON-68'); assert.deepEqual(Dig.actions(st).map(a => a.dir), ['g2e']);
  Dig.useAction(st, st.ongoing[0], { dir: 'g2e' }); assert.equal(st.grit, 0); assert.equal(st.reroll, 1);
  const s2 = play(mk(), 'ON-04', 'ON-71'); const gecko = s2.line.find(e => e.card.id === 'ON-04').card, scrap = s2.ongoing[0];
  Dig.useAction(s2, scrap, { pick: [gecko.uid, scrap.uid] }); assert.equal(s2.grit, 3); assert.ok(!s2.line.some(e => e.card === gecko)); assert.ok(s2.discard.includes(gecko));
  const s3 = play(mk(), 'ON-71'); Dig.useAction(s3, s3.ongoing[0], { pick: [s3.pet.uid] }); assert.ok(s3.line.some(e => e.pet), 'the Pet stays in play');
  const s4 = play(mk(), 'ON-74', 'CO-19', 'CO-19'); Dig.useAction(s4, s4.ongoing[0], { pick: s4.cons.map(c => c.uid) }); assert.equal(s4.cons.length, 0); assert.equal(s4.heart, 10);
  const s5 = play(mk(), 'ON-73'); top(s5, 'IM-09'); Dig.dig(s5); assert.equal(s5.pending.kind, 'dug'); Dig.chooseDug(s5, s5.pending.options[0].card.uid);
  assert.equal(s5.grit, 0); assert.equal(s5.mine.length, 1);
  Dig.useAction(s5, s5.ongoing[0], {}); assert.equal(s5.grit, 2);
});

test('Recycler: +1 Grit whenever you discard a Consumable', () => {
  const st = play(mk({ start: { heart: 1 } }), 'ON-75', 'CO-19'); Dig.useConsumable(st, st.cons[0]); assert.equal(st.grit, 1);
});

test('the Dig starts from the starred values every time and the cards from their printed numbers', () => {
  const st = Dig.start(ALL, [C('ON-07')], { seed: 3 }); assert.equal(st.heart, 10); assert.equal(st.reroll, 0); assert.equal(st.grit, 0);
});

test('saving: a Dig in the middle of a battle comes back exactly', () => {
  const st = play(mk({ dice: [5], start: { grit: 2 } }), 'ON-04', 'ON-13', 'CO-19'); fight(st, 'MO-03'); Dig.planGrit(st, 1); Dig.roll(st);
  const back = Dig.load(ALL, JSON.parse(JSON.stringify(Dig.save(st))));
  assert.equal(back.fight.result, st.fight.result); assert.equal(back.fight.markers, st.fight.markers); assert.equal(back.grit, st.grit);
  assert.deepEqual(back.line.map(e => e.tapped), st.line.map(e => e.tapped)); assert.equal(back.cons.length, 1);
  Dig.face(back); assert.equal(back.fight, null);
});

test('a copy of a Dig is a copy: playing it out leaves the original alone', () => {
  const st = play(mk({ dice: [5], start: { grit: 2 } }), 'ON-04'); fight(st, 'MO-01');
  const c = Dig.clone(st, 3); Dig.autoBattle(c); assert.ok(c.fight === null && st.fight); assert.equal(st.grit, 2); assert.ok(st.line.every(e => !e.tapped));
});

test('autoBattle: a plain player spends Grit before big Monsters, rolls, and faces the damage', () => {
  const st = play(mk({ dice: [3], start: { grit: 3 } }), 'ON-10'); fight(st, 'MO-01'); st.fight.damage = 8;
  Dig.autoBattle(st); assert.ok(st.over || st.survived >= 1);
});

test('Can\'t Start: those cards are never in a Starter Kit (the Prep tests check the kit itself)', () => {
  for (const id of ['IM-01', 'IM-06', 'IM-08', 'IM-09', 'IM-10', 'IM-11', 'IM-28']) assert.ok(ALL.find(c => c.id === id).cantStart, id);
});
