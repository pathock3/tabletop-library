// A run: rounds of Dig + Prep, the Leaderboard and the Crown, for one player (the Run engine and the pledge rules of the Dig engine).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { Dig, Board, Run, Engine, DDB } = require('./load.js');
const cards = Engine.cards();
const by = id => cards.find(c => c.id === id);
const RN = DDB.run;
// The Booster Deck is every Booster card the game can play, by its count.
const deckCards = cards.filter(c => c.deck === 'Booster' && Dig.supported(c) && !RN.boosterBan.some(re => new RegExp(re).test(c.text)));          // (and not the ones that boost gems)
const deckSize = deckCards.reduce((a, c) => a + c.count, 0);
// A Burnout card made up for the tests (the fixture is never edited).
const burn = { id: 'XX-B', name: 'Test Burnout', type: 'Ongoing', number: 2, deck: 'Booster', count: 1, text: '+1 {extraroll}, then move this card up 2 (max 10)', uid: 8801 };
// The app has no pledging (DDB.rules.pledges is false); the engine still knows it, so these tests switch it on for their own duration.
const withPledges = fn => { DDB.rules.pledges = true; try { return fn(); } finally { DDB.rules.pledges = false; } };

// Open the first Bronze Pack, keep the offered cards in order (or the ones named), ready to choose a Starter Kit.
// A quick way to a one-card round 1: open the pack, keep the first card, choose it as the Starter Kit.
const kitOne = r => { Run.openPack(r); Run.toggleKeep(r, r.prep.offer[0].uid); Run.confirmKeep(r); Run.toggleKit(r, r.owned[0].uid); };
function firstRound(opts = {}) {
  const run = Run.start(cards, { seed: 11, ...opts });
  Run.openPack(run);
  const want = opts.keepIds;
  if (want) { run.prep.offer = want.map((id, i) => ({ ...by(id), uid: 7000 + i })); }
  for (const c of run.prep.offer.slice(0, Run.keepCount(run))) Run.toggleKeep(run, c.uid);
  Run.confirmKeep(run);
  return run;
}
// Replace the Dig's Mine and play it out: `plan` is a list of 'dig' / 'bank'; Monsters are rolled with `die`.
function play(run, mine, plan, die = 1) {
  const st = run.dig; st.mine = mine.map((id, i) => ({ ...by(id), uid: 9000 + i })); st.dice = Array(50).fill(die);
  for (const a of plan) {
    if (a === 'bank') { assert.ok(Dig.bank(st), 'bank allowed'); continue; }
    assert.ok(Dig.dig(st), 'dig allowed');
    if (st.fight) { Dig.roll(st); Dig.autoFace(st); }
  }
  return st;
}

test('a run starts with the Booster Deck (every Booster card the game can play, by its count) and a Bronze Pack to open before round 1', () => {
  const run = Run.start(cards, { seed: 1 });
  assert.equal(run.deck.length, deckSize); assert.equal(run.round, 1); assert.equal(run.rounds, RN.rounds); assert.deepEqual(run.crown, { tracker: RN.crownStart, holder: false });
  assert.equal(run.prep.step, 'pack'); assert.deepEqual(Run.packInfo(run), { name: 'Bronze', draw: 3, keep: 1 });
  assert.ok(run.deck.every(c => c.deck === 'Booster' && Dig.supported(c)), 'only Booster cards the game can play');
  assert.ok(run.deck.some(c => /\{grit\}/.test(c.text)), 'the Grit cards are in the deck');
});
test('the Booster Deck is shuffled: with a seed it replays, with no seed (real play, the secure random source) no two decks are alike', () => {
  const ids = run => run.deck.map(c => c.id).join();
  assert.equal(ids(Run.start(cards, { seed: 9 })), ids(Run.start(cards, { seed: 9 })), 'a seed replays');
  assert.notEqual(ids(Run.start(cards, { seed: 9 })), ids(Run.start(cards, { seed: 10 })));
  assert.notEqual(ids(Run.start(cards, {})), ids(Run.start(cards, {})), 'no seed: shuffled differently every time');
  assert.equal(Run.start(cards, {}).seed, null);
  assert.equal(Run.makeDeck(cards, Dig.makeRng(3)).length, deckSize);
});
test('round 1: open the Bronze Pack, keep one card, choose your Starter Kit from the cards you own; every place you leave empty is filled with a gem', () => {
  const run = Run.start(cards, { seed: 1 });
  Run.openPack(run); const card = run.prep.offer.find(c => !/When kept/.test(c.text)); Run.toggleKeep(run, card.uid); Run.confirmKeep(run);      // (not a Mystery Box, which would keep one more)
  assert.equal(run.prep.step, 'kit'); assert.equal(run.prep.kitMax, 1); assert.deepEqual(run.owned.map(c => c.uid), [card.uid]);
  assert.ok(!Run.toggleKit(run, 12345), 'only cards that exist'); assert.ok(!Run.toggleKit(run, run.deck[0].uid), 'only cards you own: not the rest of the Booster Deck');
  assert.ok(Run.toggleKit(run, card.uid)); assert.ok(Run.toggleKit(run, card.uid), 'tap again to put it back'); assert.ok(Run.toggleKit(run, card.uid));
  assert.ok(Run.beginDig(run, { seed: 4 }));
  assert.deepEqual(run.dig.kit.map(c => c.id), [card.id]); assert.equal(run.dig.mine[0].id, card.id); assert.equal(run.dig.geodeGems, 0, 'the place is filled with your card, so no gem');
  const g = Run.start(cards, { seed: 2 }); Run.openPack(g); Run.toggleKeep(g, g.prep.offer.find(c => !/When kept/.test(c.text)).uid); Run.confirmKeep(g);
  assert.ok(Run.beginDig(g, { seed: 4 }));                                          // nothing chosen: you do not want the card in play (say, an Immediate that heals you at full Health)
  assert.equal(g.dig.kit.length, 0); assert.equal(g.dig.geodeGems, 0, 'the gem is a card on the Mine, not yet in the Bank'); assert.equal(g.dig.mine[0].type, 'Treasure', 'the empty place is a gem, face up on top of the Mine'); assert.equal(g.dig.known, RN.startGems, 'it is face up, so known'); assert.ok(g.dig.mine[0].kitGem);
  Dig.dig(g.dig); assert.equal(g.dig.geodeGems, RN.startGems, 'dig one and it is yours'); assert.equal(g.dig.mine.length, g.dig.mine.length);
  const two = firstRound({ keepIds: ['ON-06'] }); two.prep.kitMax = 2; Run.toggleKit(two, two.owned[0].uid); Run.beginDig(two, { seed: 4 });
  assert.equal(two.dig.mine[0].id, 'ON-06', 'your card first'); assert.equal(two.dig.mine[1].type, 'Treasure', 'then the gem for the empty place, face up'); assert.equal(two.dig.known, 1 + RN.startGems);
});
test('Booster Pack (after a Dig): draw the pack\'s number of cards, keep exactly the keep number, the rest are trashed; then choose a Starter Kit', () => {
  const run = firstRound({ keepIds: ['ON-06', 'ON-04', 'ON-33'] });
  assert.deepEqual(run.owned.map(c => c.id), ['ON-06']); assert.equal(run.trash.length, 2); assert.equal(run.prep.step, 'kit'); assert.equal(run.prep.kitMax, 1);
  const r2 = Run.start(cards, { seed: 1 });
  assert.ok(Run.openPack(r2)); assert.equal(r2.prep.offer.length, 3); assert.equal(r2.deck.length, deckSize - 3);
  assert.ok(!Run.confirmKeep(r2), 'you must keep your cards first');
  const c = r2.prep.offer.find(x => !/When kept/.test(x.text)), [a, b] = r2.prep.offer.filter(x => x !== c);      // (the card kept is not a Mystery Box, which would add one more)
  assert.ok(Run.toggleKeep(r2, a.uid)); assert.ok(!Run.toggleKeep(r2, b.uid), 'only one keep'); assert.ok(Run.toggleKeep(r2, a.uid)); assert.ok(Run.toggleKeep(r2, c.uid));
  assert.ok(Run.confirmKeep(r2));
  assert.deepEqual(r2.owned.map(x => x.uid), [c.uid]); assert.equal(r2.trash.length, 2);
});

test("Starter Kit: last round's kit is already in your kit; cards can be dragged onto a place to put them there, replace what is there, or swap", () => {
  const run = firstRound({ keepIds: ['ON-06'] }); const first = run.owned[0]; Run.toggleKit(run, first.uid); Run.beginDig(run, { seed: 4 });
  play(run, ['TR-01', 'MO-01'], ['dig', 'dig', 'bank'], 1); Run.finishDig(run); run.prep.step = 'pack'; Run.setEscape ? Run.openPack(run) : 0;
  run.prep.step = 'keep'; run.prep.offer = [by('ON-10'), by('ON-33')].map((c, i) => ({ ...c, uid: 9900 + i })); run.prep.picked = []; run.prep.pack = { name: 'Silver', draw: 2, keep: 2 };
  Run.toggleKeep(run, 9900); Run.toggleKeep(run, 9901); assert.ok(Run.confirmKeep(run));
  const pr = run.prep; pr.kitMax = 2;
  assert.deepEqual(pr.kitPick, [first.uid], "last round's kit is already in"); assert.deepEqual(pr.gained, [9900, 9901], 'and what you just won is marked');
  assert.ok(Run.moveKit(run, 9900, 1)); assert.deepEqual(pr.kitPick, [first.uid, 9900], 'a card from your hand fills an empty place');
  assert.ok(Run.moveKit(run, 9901, 0)); assert.deepEqual(pr.kitPick, [9901, 9900], 'dropped on a full place it replaces what was there (that card goes back to your hand)');
  assert.ok(Run.moveKit(run, 9901, 1)); assert.deepEqual(pr.kitPick, [9900, 9901], 'a kit card dropped on another kit card swaps places');
  assert.ok(!Run.moveKit(run, 9901, 2) && !Run.moveKit(run, 424242, 0), 'only real places and cards you own');
  Run.beginDig(run, { seed: 5 }); assert.deepEqual(run.dig.mine.slice(0, 2).map(c => c.id), ['ON-10', 'ON-33'], 'the kit goes on top in the order you set');
});

test('Starter Kit: 1, 2, 2, 3, 3 cards; the Mine is the 30 starting cards plus every card you own that is not in the kit', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(r => Run.kitSize({}, r)), [1, 2, 2, 3, 3, 3]);
  const run = firstRound({ keepIds: ['ON-28'] });
  assert.ok(!Run.toggleKit(run, 12345), 'only cards you own'); assert.ok(Run.toggleKit(run, run.owned[0].uid));
  Run.beginDig(run, { seed: 3 });
  assert.equal(run.phase, 'dig'); assert.equal(run.dig.line.length, 1, 'the Pet'); assert.equal(run.dig.mine.length, 31, 'the kit card is on top of the Mine'); assert.equal(run.dig.mine[0].id, 'ON-28');
  const r2 = firstRound({ keepIds: ['ON-28'] }); Run.beginDig(r2, { seed: 3 });   // no kit chosen: the card is shuffled into the Mine with the Starting cards
  assert.equal(r2.dig.mine.length, 32, '31 cards and the gem for the empty place'); assert.equal(r2.dig.line.length, 1); assert.ok(r2.dig.mine.some(c => c.id === 'ON-28')); assert.equal(r2.dig.known, 1, 'only the gem on top is known');
});

test('after a Dig the Mine is rebuilt from scratch: Drill reset, Power cards back at their numbers, everything shuffled in', () => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.toggleKit(run, run.owned[0].uid); Run.beginDig(run, { seed: 4 });
  play(run, ['TR-01', 'MO-01'], ['dig', 'dig', 'bank'], 1);
  Run.finishDig(run); run.prep.step = 'kit';
  Run.beginDig(run, { seed: 5 });
  assert.equal(run.dig.heart, DDB.rules.start.heart); assert.equal(run.dig.grit, 0); assert.equal(run.dig.reroll, 0);
  assert.equal(run.dig.mine.length + run.dig.kit.length, 31 + 2, '31 cards, plus a gem for each empty Kit place (none chosen: two places)');
});

test('a Burnout card climbs the Power line during a Dig and starts the next round back at its printed number', () => {
  const run = firstRound({ keepIds: ['ON-06'] }); run.owned.push({ ...burn }); Run.toggleKit(run, burn.uid); Run.beginDig(run, { seed: 4 });
  const st = run.dig; assert.equal(st.mine[0].id, burn.id, 'the kit card is on top');
  Dig.dig(st); assert.equal(st.line.find(e => e.card.id === burn.id).at, 2);
  st.mine = ['MO-01', 'MO-01'].map((id, i) => ({ ...by(id), uid: 9000 + i })); st.dice = [3, 1];
  Dig.dig(st); Dig.roll(st); Dig.autoFace(st); assert.equal(st.line.find(e => e.card.id === burn.id).at, 4, 'it triggered at 3 and burned up 2');
  assert.ok(Dig.bank(st)); Run.finishDig(run); run.prep.step = 'kit'; run.prep.kitMax = 1; run.prep.kitPick = []; Run.toggleKit(run, burn.uid); Run.beginDig(run, { seed: 5 });
  assert.equal(run.dig.mine[0].id, burn.id, 'the kit card is on top of the Mine, face up'); assert.equal(run.dig.mine.filter(c => c.id === 'ON-06').length, 1, 'the card you own but left out is shuffled in');
  while (!run.dig.line.some(e => e.card.id === burn.id)) Dig.dig(run.dig);
  assert.equal(run.dig.line.find(e => e.card.id === burn.id).at, 2, 'a new Dig: every card at its printed number');
});

test('Escape Bonus: after banking, one roll of the die adds gems; gems = Geodes + Monsters survived + Escape Bonus', () => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.toggleKit(run, run.owned[0].uid); Run.beginDig(run, { seed: 6 });
  play(run, ['TR-01', 'TR-01', 'TR-01', 'MO-01', 'TR-01'], ['dig', 'dig', 'dig', 'dig', 'dig', 'bank'], 6);
  Run.finishDig(run);
  assert.equal(run.prep.step, 'escape'); assert.equal(run.prep.banked, true);
  run.dice = [7]; assert.ok(Run.rollEscape(run));
  assert.deepEqual([run.prep.geodes, run.prep.monsters, run.prep.escape, run.prep.gems], [4, 1, 7, 12]);
  assert.deepEqual(Run.packInfo(run), { name: 'Silver', draw: 4, keep: 2 }, '12 gems');
  assert.ok(!Run.rollEscape(run), 'only once');
});

test('BOOM: no Escape Bonus, 0 gems, and a Bronze Pack', () => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.beginDig(run, { seed: 7 });
  run.dig.heart = 1; play(run, ['TR-01', 'MO-01'], ['dig', 'dig'], 1);
  assert.equal(run.dig.over.kind, 'boom');
  Run.finishDig(run);
  assert.equal(run.prep.step, 'pack'); assert.equal(run.prep.boom, true); assert.equal(run.prep.gems, 0); assert.deepEqual(Run.packInfo(run), { name: 'Bronze', draw: 3, keep: 1 });
  assert.equal(run.round, 2); assert.equal(run.prep.kitMax, 2);
});

test('the reward ladder (the owner\'s): gems -> draw:keep, in steps of 6, Gold+ at 30 is the top', () => {
  const at = g => { const p = Run.ladderFor(g); return `${p.draw}:${p.keep}`; };
  assert.deepEqual([0, 5, 6, 11, 12, 17, 18, 23, 24, 29, 30, 31, 99].map(at),
    ['3:1', '3:1', '4:1', '4:1', '4:2', '4:2', '5:2', '5:2', '5:3', '5:3', '6:3', '6:3', '6:3']);
  assert.deepEqual(DDB.run.ladder.map(p => p.name), ['Bronze', 'Bronze+', 'Silver', 'Silver+', 'Gold', 'Gold+']);
});

test('Leaderboard and Crown: the tracker starts at 2; banking above it (3 is enough) takes the Crown and moves the tracker; BOOM locks in nothing', () => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.beginDig(run, { seed: 8 });
  run.dig.heart = 10;
  play(run, ['MO-01', 'MO-02', 'TR-01'], ['dig', 'dig', 'bank'], 10);          // two Monsters, each beaten by the Pet: survived 2, not more than 2
  Run.finishDig(run);
  assert.deepEqual([run.best, run.crown.tracker, run.crown.holder], [2, 2, false], 'matching the Crown is not the lead');
  run.prep.step = 'kit'; Run.beginDig(run, { seed: 9 });
  play(run, ['MO-01', 'MO-02', 'MO-01'], ['dig', 'dig', 'dig', 'bank'], 10);
  Run.finishDig(run);
  assert.deepEqual([run.best, run.crown.tracker, run.crown.holder], [3, 3, true], 'reaching 3 is enough to claim it');
  run.prep.step = 'kit'; Run.beginDig(run, { seed: 10 });
  run.dig.heart = 1; play(run, ['MO-01', 'MO-01', 'MO-01'], ['dig'], 1);                      // die 1: the Pet does not trigger, 1 damage at 1 Health: BOOM
  assert.equal(run.dig.over.kind, 'boom'); Run.finishDig(run);
  assert.deepEqual([run.best, run.crown.tracker, run.crown.holder], [3, 3, true], 'BOOM leaves your best and the Crown alone');
  assert.deepEqual(run.history.map(h => [h.round, h.kind, h.survived, h.stoleCrown]), [[1, 'bank', 2, false], [2, 'bank', 3, true], [3, 'boom', 0, false]]);
});

test('Pledge: only once you have survived as many Monsters as the Crown tracker, and only your current number or 1 more; you cannot bank below it; BOOM removes it', () => withPledges(() => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.beginDig(run, { seed: 12 });
  const st = run.dig; st.mine = ['MO-01', 'MO-02', 'MO-01', 'MO-02', 'MO-01'].map((id, i) => ({ ...by(id), uid: 9000 + i })); st.dice = Array(50).fill(10);
  assert.ok(!Dig.canPledge(st, 1) && !Dig.canPledge(st, 0), 'before the Crown you dig or bank freely');
  for (let i = 0; i < 3; i++) { Dig.dig(st); Dig.roll(st); Dig.autoFace(st); }
  assert.equal(st.survived, 3);
  assert.ok(!Dig.canPledge(st, 5) && !Dig.canPledge(st, 2), 'only 3 or 4'); assert.ok(Dig.canPledge(st, 3) && Dig.canPledge(st, 4));
  assert.ok(Dig.pledge(st, 4)); assert.equal(st.pledge, 4);
  assert.ok(!Dig.can(st).bank, 'cannot bank before reaching the pledge');
  Dig.dig(st); Dig.roll(st); Dig.autoFace(st);
  assert.ok(Dig.can(st).bank, 'reached it'); assert.ok(Dig.canPledge(st, 5) && Dig.canPledge(st, 4) === false);
  const st2 = Dig.start(cards, [], { seed: 5, board: { crown: 3 } }); st2.survived = 3; Dig.pledge(st2, 4); st2.heart = 1; st2.mine = [{ ...by('MO-01'), uid: 1 }]; st2.dice = [1]; Dig.dig(st2); Dig.roll(st2); Dig.autoFace(st2);
  assert.equal(st2.over.kind, 'boom'); assert.equal(st2.pledge, null);
}));

test('the app has no pledging: even with the Crown reached, nothing can be pledged and banking is never blocked by one', () => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.beginDig(run, { seed: 12 });
  const st = run.dig; st.survived = 3; Run.refresh(run);
  assert.equal(DDB.rules.pledges, false); assert.ok(!Dig.canPledge(st, 3) && !Dig.canPledge(st, 4)); assert.ok(!Run.pledge(run, 4)); assert.ok(Dig.can(st).bank);
});

test('the final round is a race: nobody banks; alone at the table you are in the lead once you pass the Crown tracker, and then the run ends with the Crown yours', () => {
  const run = Run.start(cards, { seed: 14, rounds: 2 });
  kitOne(run); Run.beginDig(run, { seed: 1 });
  play(run, ['TR-01'], ['dig', 'bank'], 1); Run.finishDig(run);                              // round 1: survived 0, banked
  assert.equal(run.round, 2); assert.equal(run.phase, 'prep');
  run.dice = [4]; Run.rollEscape(run); Run.openPack(run); for (const c of run.prep.offer.slice(0, Run.keepCount(run))) Run.toggleKeep(run, c.uid); Run.confirmKeep(run); Run.beginDig(run, { seed: 2 });
  const st = run.dig; assert.ok(st.board.final);
  st.mine = ['TR-01', 'MO-01', 'MO-02', 'MO-01', 'MO-02', 'TR-01'].map((id, i) => ({ ...by(id), uid: 9100 + i })); st.dice = Array(30).fill(10);
  const step = () => { Dig.dig(st); if (st.fight) { Dig.roll(st); Dig.autoFace(st); } Run.finalCheck([run]); };
  step(); assert.ok(!Dig.can(st).bank, 'no banking in the final round, not even after a Geode');
  for (let i = 0; i < 2; i++) step();
  assert.equal(st.survived, 2); assert.ok(!st.over, '2 only ties the Crown tracker: keep digging'); assert.ok(!st.board.lead && !Dig.can(st).bank);
  step();
  assert.ok(st.over && st.over.kind === 'bank' && st.over.held, 'past the tracker and nobody left to race: the Dig ends by itself');
  Run.finishDig(run);
  assert.equal(run.phase, 'done'); assert.deepEqual(run.result, { crown: true, best: 3, tracker: 3 });
});

test('the final round against another player: the leader may wait, everyone else must keep digging; the round ends when only the leader is left', () => {
  const board = Board.create([{ id: 'me' }, { id: 'ai' }]);
  const mk = id => Run.start(cards, { seed: 3, rounds: 1, me: id, shared: { board, deck: Run.makeDeck(cards, Dig.makeRng(3)), trash: [] } });
  const a = mk('me'), b = mk('ai');
  for (const r of [a, b]) { kitOne(r); Run.beginDig(r, { seed: 9 }); r.dig.mine = ['MO-01', 'MO-02', 'MO-01', 'MO-02', 'MO-01', 'MO-02'].map((id, i) => ({ ...by(id), uid: 9200 + i })); r.dig.dice = Array(40).fill(10); }
  const surv = (r, n) => { for (let i = 0; i < n; i++) { Dig.dig(r.dig); Dig.roll(r.dig); Dig.autoFace(r.dig); Run.refresh(r); } };
  surv(a, 4); Run.refresh(b);
  assert.ok(a.dig.board.lead && !b.dig.board.lead, 'a is in the lead at 4 (past the tracker, ahead of b)'); assert.ok(!Dig.can(a.dig).bank && !Dig.can(b.dig).bank, 'nobody banks');
  assert.ok(!Run.finalCheck([a, b]), 'b is still digging: a simply waits'); assert.ok(!a.dig.over);
  surv(b, 4); Run.refresh(a);
  assert.ok(a.dig.board.lead && !b.dig.board.lead, 'b tying a at 4 does not pass a (a was there first)');
  assert.equal(Board.finalLeader(board).pid, 'me', 'a reached 4 first: ties go to the better spot');
  surv(b, 1); Run.refresh(a);
  assert.ok(b.dig.board.lead && !a.dig.board.lead, 'b passed a: now a is not in the lead and has to dig again');
  b.dig.heart = 1; b.dig.dice = [1]; Dig.dig(b.dig); Dig.roll(b.dig); Dig.autoFace(b.dig); Run.checkOver(b);
  assert.equal(b.dig.over.kind, 'boom'); Run.refresh(a);
  assert.ok(a.dig.board.lead, 'b went BOOM: its live marker is gone, a leads again');
  assert.ok(!Run.finalCheck([a, b]) && a.dig.board.allOut && !a.dig.over, 'only a (a person) is left and in the lead: a has won, but the Dig goes on until a chooses to stop');
  assert.ok(Dig.can(a.dig).dig, 'a may keep digging'); assert.ok(Dig.hold(a.dig)); Run.checkOver(a);
  assert.equal(a.dig.over.kind, 'bank', 'a stands'); assert.equal(Board.holder(board), 'me');
});

test('the final round BOOM leaves the Crown on the table', () => {
  const run = Run.start(cards, { seed: 15, rounds: 1 });
  kitOne(run); Run.beginDig(run, { seed: 1 });
  run.dig.heart = 1; play(run, ['MO-01'], ['dig'], 1); Run.finishDig(run);
  assert.equal(run.phase, 'done'); assert.equal(run.result.crown, false);
});

test('Mystery Box: when kept from a Booster Pack, also keep the top card of the Booster Deck', () => {
  const run = firstRound({ keepIds: ['IM-14', 'ON-06', 'ON-04'] });
  assert.equal(run.prep.step, 'reveal', 'you see the extra card before the Starter Kit'); assert.ok(!Run.toggleKit(run, run.owned[0].uid), 'and cannot skip ahead'); assert.ok(Run.continueReveal(run)); assert.equal(run.prep.step, 'kit');
  assert.equal(run.owned.length, 2); assert.equal(run.prep.extra.length, 1); assert.equal(run.deck.length, deckSize - 3 - 1, '3 drawn for the pack (the test swaps them for chosen ones) and 1 more taken from the top');
});

test('Surprise Package: when kept, also keep the next Immediate card of the Booster Deck (cards above it stay in the deck)', () => {
  const run = Run.start(cards, { seed: 11 }); Run.openPack(run);
  run.prep.offer = ['IM-31', 'ON-06', 'ON-04'].map((id, i) => ({ ...by(id), uid: 7000 + i })); Run.toggleKeep(run, 7000);
  const before = run.deck.slice(), firstImm = before.find(c => c.type === 'Immediate'); Run.confirmKeep(run);
  assert.equal(run.prep.step, 'reveal', 'you see the extra card'); assert.ok(run.prep.extra.length >= 1); assert.equal(run.prep.extra[0].uid, firstImm.uid);          // (a Mystery Box as the extra card brings one more) assert.equal(run.prep.extra[0].type, 'Immediate');
  assert.ok(!run.deck.some(c => c.uid === firstImm.uid), 'it left the deck'); assert.equal(run.deck.length, before.length - run.prep.extra.length);
  const skipped = before.slice(0, before.indexOf(firstImm)); if (run.prep.extra.length === 1) assert.deepEqual(run.deck.slice(0, skipped.length).map(c => c.uid), skipped.map(c => c.uid), 'the cards above it are still on top');
});

test('random runs of 5 rounds always finish, never lose or duplicate a Booster card, and the Dig screen always has a legal move', () => {
  const total = deckSize;
  for (let seed = 1; seed <= 60; seed++) {
    const rr = Dig.makeRng(seed * 13), run = Run.start(cards, { seed, rounds: 5 }); let guard = 0;
    while (run.phase !== 'done' && guard++ < 40000) {
      if (run.phase === 'prep') {
        const pr = run.prep;
        if (pr.step === 'escape') Run.rollEscape(run);
        else if (pr.step === 'pack') Run.openPack(run);
        else if (pr.step === 'keep') { for (const c of pr.offer.slice(0, Run.keepCount(run))) Run.toggleKeep(run, c.uid); Run.confirmKeep(run); }
        else if (pr.step === 'reveal') Run.continueReveal(run);
        else if (pr.step === 'kit') { for (const c of run.owned.slice(0, pr.kitMax)) Run.toggleKit(run, c.uid); Run.beginDig(run); }
      } else {
        const st = run.dig, c = Dig.can(st);
        if (st.over) Run.finishDig(run);
        else if (c.choose) { if (st.pending.kind === 'clone') Dig.chooseClone(st, st.line[0]); else Dig.chooseDug(st, 'resolve'); }
        else if (st.fight && st.fight.phase === 'before') Dig.roll(st);
        else if (st.fight) { if (c.reroll && rr() < .5) Dig.reroll(st); else Dig.autoFace(st); }
        else if (c.bank && st.survived >= 2 && rr() < .3) Dig.bank(st);
        else if (c.dig) Dig.dig(st); else assert.fail(`seed ${seed}: stuck ${JSON.stringify(c)}`);
        if (!st.over) Run.finalCheck([run]);                  // the final round ends by itself once you are in the lead and nobody is left to race
      }
    }
    if (run.phase !== 'done' && run.dig.log.slice(-6).some(l => /Echo/.test(l.text)) && run.dig.log.slice(-6).some(l => /Rewind Tape/.test(l.text))) continue;          // Echo and Rewind Tape feed each other for ever when nobody can bank (the last round): a known loop of the cards, in QUESTIONS.md
    assert.equal(run.phase, 'done', `seed ${seed}`);
    const ids = [...run.deck, ...run.owned, ...run.trash].map(c => c.uid);
    assert.equal(new Set(ids).size, ids.length, 'no duplicates'); assert.equal(ids.length, total, `seed ${seed}: every Booster card is in the deck, owned or trashed`);
  }
});

test('saving and resuming: a Dig and a run survive a reload — same cards, same next dice and shuffles, nothing duplicated or lost', () => {
  const roundtrip = o => JSON.parse(JSON.stringify(o));
  const step = st => { const c = Dig.can(st); if (c.choose) { if (st.pending.kind === 'clone') Dig.chooseClone(st, st.line[0]); else Dig.chooseDug(st, 'resolve'); } else if (st.fight && st.fight.phase === 'before') { Dig.roll(st); } else if (st.fight) { if (c.reroll && st.fight.die < 5) Dig.reroll(st); else Dig.autoFace(st); } else if (c.dig) Dig.dig(st); else return false; return true; };
  for (let seed = 1; seed <= 40; seed++) {
    const all = cards.concat([burn]);                          // a Burnout card is in the kit too: where it has climbed to is saved with the Dig
    const kit = [burn, by('ON-06'), by('ON-33'), by('IM-13'), by('ON-12')].slice(0, 1 + seed % 5);
    const a = Dig.start(all, kit, { seed, board: { crown: 3 }, start: { reroll: 2 } });
    for (let i = 0; i < 6 + (seed % 15) && !a.over; i++) step(a);
    const b = Dig.load(all, roundtrip(Dig.save(a)));
    for (let i = 0; i < 80 && !a.over; i++) { assert.ok(step(a)); assert.ok(step(b)); }
    assert.equal(b.heart, a.heart); assert.equal(b.survived, a.survived); assert.deepEqual(b.log.map(l => l.text), a.log.map(l => l.text), `seed ${seed}: the resumed Dig plays out the same`);
    assert.deepEqual(b.line.map(e => [e.card.id, e.at]), a.line.map(e => [e.card.id, e.at]));
    assert.deepEqual(b.mine.map(c => c.id), a.mine.map(c => c.id));
  }
  const run = firstRound({ keepIds: ['ON-28'] }); Run.toggleKit(run, run.owned[0].uid);
  const r2 = Run.load(cards, roundtrip(Run.save(run)));
  assert.deepEqual(r2.owned.map(c => c.id), run.owned.map(c => c.id)); assert.equal(r2.deck.length, run.deck.length); assert.deepEqual(r2.prep.kitPick, run.prep.kitPick);
  assert.ok(Run.beginDig(r2, { seed: 3 })); assert.equal(r2.dig.line.length, 1); assert.equal(r2.dig.mine[0].id, r2.kit[0].id);
  const r3 = Run.load(cards, roundtrip(Run.save(r2))); assert.equal(r3.dig.mine[0].uid, r2.dig.mine[0].uid);
  play(r3, ['TR-01', 'MO-01'], ['dig', 'dig', 'bank'], 10); Run.finishDig(r3);
  const r4 = Run.load(cards, roundtrip(Run.save(r3))); assert.equal(r4.prep.step, 'escape'); r4.dice = [5]; assert.ok(Run.rollEscape(r4)); assert.equal(r4.prep.escape, 5);
  assert.equal(new Set([...r4.deck, ...r4.owned, ...r4.trash].map(c => c.uid)).size, r4.deck.length + r4.owned.length + r4.trash.length);
});

test('the Board changes the moment a Dig ends: a bank locks in and may take the Crown at once, a BOOM removes the Pledge marker (no waiting for Prep)', () => withPledges(() => {
  const run = firstRound({ keepIds: ['ON-06'] }); Run.beginDig(run, { seed: 20 });
  const st = run.dig; st.mine = Array.from({ length: 6 }, (_, i) => ({ ...by(i % 2 ? 'MO-02' : 'MO-01'), uid: 9400 + i })); st.dice = Array(30).fill(10);
  for (let i = 0; i < 4; i++) { Dig.dig(st); Dig.roll(st); Dig.autoFace(st); }
  assert.ok(Run.pledge(run, 5)); assert.equal(Board.marker(run.board, 'me', 'pledge').n, 5);
  assert.ok(!Run.pledge(run, 4), 'a pledge cannot be lowered');
  assert.ok(!Run.bank(run), 'cannot bank below the pledge');
  Dig.dig(st); Dig.roll(st); Dig.autoFace(st);
  assert.ok(Run.bank(run)); assert.equal(run.crown.holder, true, 'the Crown moved at the moment of banking'); assert.equal(run.crown.tracker, 5); assert.equal(run.best, 5);
  assert.equal(Board.marker(run.board, 'me', 'pledge'), null);
  const r2 = firstRound({ keepIds: ['ON-06'] }); Run.beginDig(r2, { seed: 21 });
  const s2 = r2.dig; s2.mine = Array.from({ length: 6 }, (_, i) => ({ ...by('MO-01'), uid: 9500 + i })); s2.dice = Array(30).fill(10);
  for (let i = 0; i < 3; i++) { Dig.dig(s2); Dig.roll(s2); Dig.autoFace(s2); }
  Run.pledge(r2, 4); assert.ok(Board.marker(r2.board, 'me', 'pledge'));
  s2.heart = 1; s2.dice = [1]; Dig.dig(s2); Dig.roll(s2); Dig.autoFace(s2);
  assert.equal(s2.over.kind, 'boom'); Run.checkOver(r2);
  assert.equal(Board.marker(r2.board, 'me', 'pledge'), null, 'BOOM removed the Pledge marker right away');
  Run.finishDig(r2); assert.equal(r2.history[0].kind, 'boom');
}));

test('the Dig\'s copy of the Leaderboard is refreshed from the live Board before it is asked (another player can change what it takes to lead)', () => {
  const run = Run.start(cards, { seed: 30, rounds: 3 }); kitOne(run); Run.beginDig(run, { seed: 1 });
  run.board.players.push({ id: 'ai', name: 'AI', color: '#000' });
  const first = run.dig; Dig.bank(first); Run.checkOver(run); Run.finishDig(run);
  run.dice = [3]; Run.rollEscape(run); Run.openPack(run); for (const c of run.prep.offer.slice(0, Run.keepCount(run))) Run.toggleKeep(run, c.uid); Run.confirmKeep(run); Run.beginDig(run, { seed: 2 });
  const st = run.dig; st.mine = Array.from({ length: 9 }, (_, i) => ({ ...by(i % 2 ? 'MO-02' : 'MO-01'), uid: 9600 + i })); st.dice = Array(40).fill(10);
  assert.equal(st.board.leadN, RN.crownStart + 1);
  Board.lockIn(run.board, 'ai', 7);                       // the AI banks 7 while I am digging
  Run.refresh(run); assert.equal(st.board.leadN, 8); assert.equal(st.board.crown, 7);
  for (let i = 0; i < 7; i++) { Dig.dig(st); Dig.roll(st); Dig.autoFace(st); }
  Run.refresh(run); assert.ok(!Board.wouldLead(run.board, 'me', st.survived), '7 only ties the AI, and the AI has the better spot: banking now would not take the lead');
  Dig.dig(st); Dig.roll(st); Dig.autoFace(st); Run.refresh(run); assert.ok(Board.wouldLead(run.board, 'me', st.survived), '8 leads');
});

test('Mystery Boxes chain: a Mystery Box that arrives as another one\'s extra card keeps one more card of the Booster Deck in its turn', () => {
  const run = Run.start(cards, { seed: 3 }); Run.openPack(run);
  const box = id => ({ ...cards.find(c => c.id === id), uid: 98000 + Number(id.slice(3)) });
  const a = box('IM-14'), c = box('IM-15'); run.prep.offer[0] = a; run.deck.unshift(c);          // the top card of the Booster Deck is Mystery Box C
  const after = run.deck[1]; Run.toggleKeep(run, a.uid); assert.ok(Run.confirmKeep(run));
  assert.deepEqual(run.prep.extra.map(x => x.id), ['IM-15', after.id], 'A brings C, and C brings the card under it');
  assert.ok(run.owned.some(x => x.id === 'IM-15') && run.owned.some(x => x.id === after.id));
});
