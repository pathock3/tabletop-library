const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA, Engine } = require('./load');
const { G, B, gems, booms, rigged, assertPartition, drawN } = require('./helpers');

// ---------- the deck ----------
test('deck: 38 gem cards and 6 boom cards, 44 different cards, all in the draw pile at the start', () => {
  assert.equal(G, 38);
  assert.equal(B, 6);
  const s = Engine.createGame({ players: 2, seed: 7 });
  assert.equal(s.draw.length, 44);
  assert.equal(new Set(s.draw).size, 44);
  assert.equal(s.draw.filter(c => Engine.isBoom(s, c)).length, 6);
  assert.equal(s.draw.filter(c => !Engine.isBoom(s, c)).length, 38);
  assert.deepEqual([s.boomPile, s.table], [[], []]);
  assert.ok(s.safe.every(p => p.length === 0));
  assertPartition(s, assert);
});

test('deck: the draw pile is shuffled (different seeds, different order) and the deck size follows the data block', () => {
  const a = Engine.createGame({ players: 2, seed: 1 }), b = Engine.createGame({ players: 2, seed: 2 });
  assert.notDeepEqual(a.draw, b.draw);
  assert.notDeepEqual(a.draw, Array.from({ length: 44 }, (_, i) => i), 'not left in card order');
  const small = JSON.parse(JSON.stringify(GAME_DATA));
  small.deck.gems = 10; small.deck.booms = 3;
  const s = Engine.createGame({ players: 2, seed: 1, data: small });
  assert.equal(s.draw.length, 13);
  assert.equal(s.draw.filter(c => Engine.isBoom(s, c)).length, 3);
});

test('players: 2 to 6 seats; anything else is refused', () => {
  for (const n of [2, 3, 4, 5, 6]) { const s = Engine.createGame({ players: n, seed: 1 }); assert.equal(s.safe.length, n); assert.equal(s.current, 0); }
  assert.throws(() => Engine.createGame({ players: 1, seed: 1 }), /Illegal/);
  assert.throws(() => Engine.createGame({ players: 7, seed: 1 }), /Illegal/);
});

test('setup: a random turn order is a permutation of the seats, and the same RNG gives the same order', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const o = Engine.randomOrder(n, Engine.mulberry32(n));
    assert.deepEqual(o.slice().sort(), Array.from({ length: n }, (_, i) => i));
    assert.deepEqual(o, Engine.randomOrder(n, Engine.mulberry32(n)));
  }
  const seen = new Set();
  for (let i = 1; i < 40; i++) seen.add(Engine.randomOrder(4, Engine.mulberry32(i)).join());
  assert.ok(seen.size > 5, 'the order really varies');
});

// ---------- drawing ----------
test('draw: a gem joins the table and stays at risk; the turn goes on', () => {
  const s = rigged(['g', 'g', 'b']);
  const r = Engine.draw(s);
  assert.equal(r.type, 'gem');
  assert.equal(s.table.length, 1);
  assert.equal(s.draw.length, 43);
  assert.equal(s.phase, 'turn');
  assert.equal(s.current, 0);
  assert.deepEqual(Engine.scores(s), [0, 0], 'drawn gems are not saved yet');
  Engine.draw(s);
  assert.equal(s.table.length, 2);
  assertPartition(s, assert);
});

test('draw: you may draw as many cards as you like in a turn', () => {
  const s = rigged(Array(30).fill('g'));
  drawN(s, 30);
  assert.equal(s.table.length, 30);
  assert.equal(s.phase, 'turn');
});

test('boom: ends the turn at once, this turn’s gems are lost, and they go to the boom pile with the boom', () => {
  const s = rigged(['g', 'g', 'g', 'b']);
  drawN(s, 3);
  const r = Engine.draw(s);
  assert.equal(r.type, 'boom');
  assert.equal(r.lost.length, 3);
  assert.equal(s.phase, 'boomed', 'the boom stays until the turn is passed');
  assert.equal(s.current, 0, 'still this player until the pass');
  assert.deepEqual(s.table, []);
  assert.equal(s.boomPile.length, 4);
  assert.equal(s.boomPile[s.boomPile.length - 1], r.card, 'the boom is on top, face up');
  assert.equal(Engine.boomsOut(s), 1);
  assert.deepEqual(Engine.scores(s), [0, 0]);
  assert.deepEqual(s.lastBoom, { card: r.card, lost: r.lost });
  assertPartition(s, assert);
});

test('boom: only THIS turn’s gems are lost — gems saved earlier are safe', () => {
  const s = rigged(['g', 'g', 'g', 'g', 'b']);
  Engine.draw(s); Engine.draw(s); Engine.save(s);          // seat 0 saves 2
  Engine.draw(s); Engine.draw(s);                           // seat 1: 2 at risk (nothing to do with seat 0)
  assert.equal(s.current, 1);
  const r = Engine.draw(s);                                 // a boom for seat 1
  assert.equal(r.type, 'boom');
  assert.equal(s.safe[0].length, 2, 'seat 0 keeps what it saved');
  assert.equal(s.boomPile.length, 3);
  Engine.endTurn(s);
  assert.equal(s.current, 0);
  assert.deepEqual(Engine.scores(s), [2, 0]);
});

test('boom with nothing drawn yet costs nothing and still ends the turn', () => {
  const s = rigged(['b', 'g']);
  const r = Engine.draw(s);
  assert.deepEqual(r.lost, []);
  assert.equal(s.phase, 'boomed');
  Engine.endTurn(s);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'turn');
});

test('boom pile: keeps growing across turns so everyone can count the booms; one boom card = one boom', () => {
  const s = rigged(['g', 'b', 'g', 'g', 'b', 'b']);
  Engine.draw(s); Engine.draw(s); Engine.endTurn(s);       // seat 0: gem, boom
  Engine.draw(s); Engine.draw(s); Engine.draw(s); Engine.endTurn(s);   // seat 1: gem, gem, boom
  assert.equal(Engine.boomsOut(s), 2);
  assert.equal(s.boomPile.length, 5, '2 booms and the 3 gems lost with them');
  assert.equal(Engine.counts(s).boomsInDraw, 4);
});

test('passing: after a boom the next seat is up; seats wrap around', () => {
  const s = rigged(['b', 'b', 'b'], 3);
  for (let i = 1; i <= 3; i++) { Engine.draw(s); Engine.endTurn(s); assert.equal(s.current, i % 3); }
});

test('illegal moves are refused: drawing with a boom showing, saving nothing, passing a normal turn, anything after the end', () => {
  const s = rigged(['b', 'g', 'g']);
  assert.throws(() => Engine.save(s), /nothing to save/);
  assert.throws(() => Engine.endTurn(s), /nothing to pass/);
  Engine.draw(s);
  assert.throws(() => Engine.draw(s), /Illegal/);
  assert.throws(() => Engine.save(s), /Illegal/);
  assert.equal(Engine.canDraw(s), false);
  assert.equal(Engine.canSave(s), false);
  assert.equal(Engine.canPass(s), true);
  Engine.endTurn(s);
  assert.equal(Engine.canDraw(s), true);
  assert.equal(Engine.canSave(s), false);
  assert.equal(Engine.canPass(s), false);
});

// ---------- saving ----------
test('save: the turn’s gems become permanent, the turn ends, the next seat is up', () => {
  const s = rigged(['g', 'g', 'g', 'b']);
  drawN(s, 3);
  const r = Engine.save(s);
  assert.equal(r.type, 'save');
  assert.equal(r.gems.length, 3);
  assert.deepEqual(Engine.scores(s), [3, 0]);
  assert.deepEqual(s.table, []);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'turn');
  assert.equal(s.turnNo, 1);
  assertPartition(s, assert);
});

test('save: saved gems are never lost, whatever happens afterwards, and the 6th-boom refresh never shuffles them', () => {
  const s = rigged(['g', 'g']);
  drawN(s, 2); Engine.save(s);
  const mine = s.safe[0].slice();
  for (let turn = 0; turn < 30 && !s.over; turn++) {
    while (s.phase === 'turn') { if (s.draw.some(c => Engine.isBoom(s, c)) && s.draw.length > 0) Engine.draw(s); else break; }
    if (s.phase === 'boomed') Engine.endTurn(s);
    else if (s.table.length) Engine.save(s);
  }
  assert.ok(mine.every(c => s.safe[0].includes(c)), 'everything seat 0 saved is still its own');
  assertPartition(s, assert);
});

// ---------- refresh ----------
test('refresh: when the 6th boom is drawn it stays on the table; passing the turn shuffles in everything nobody saved', () => {
  const s = Engine.createGame({ players: 3, seed: 5 });
  s.safe[0] = gems.slice(0, 2);                       // seat 0 saved 2 gems earlier
  s.draw = gems.slice(2).concat(booms);               // 36 gems under 6 booms (the booms come off first)
  assertPartition(s, assert);
  let last;
  for (let i = 0; i < 6; i++) {
    last = Engine.draw(s);
    assert.equal(last.type, 'boom');
    assert.equal(last.final, i === 5, 'only the 6th boom is the final one');
    assert.equal(s.phase, 'boomed');
    if (i < 5) { Engine.endTurn(s); assert.equal(s.refreshes, 0, 'no refresh before the 6th'); }
  }
  assert.equal(Engine.boomsOut(s), 6, 'the 6th boom is visible on the boom pile until the pass');
  assert.equal(s.refreshes, 0, 'the refresh happens as the turn passes');
  const savedBefore = s.safe.map(p => p.slice());
  const r = Engine.endTurn(s);
  assert.equal(r.refreshed, 'final');
  assert.equal(s.refreshes, 1);
  assert.deepEqual(s.boomPile, [], 'no booms out any more');
  assert.equal(s.draw.length, 41, 'the 42 cards nobody saved are the new draw pile, less the one boom that leaves the game');
  assert.equal(s.draw.filter(c => Engine.isBoom(s, c)).length, 5);
  assert.equal(s.gone.length, 1); assert.ok(Engine.isBoom(s, s.gone[0])); assert.equal(Engine.boomTotal(s), 5);
  assert.deepEqual(s.safe, savedBefore, 'saved gems are untouched');
  assertPartition(s, assert);
  assert.equal(s.phase, 'turn');
  assert.equal(s.current, 0, 'six turns later it is seat 0 again');
});

test('refresh: lost gems come back too \u2014 the new draw pile is every unsaved card, including the gems lost in earlier booms', () => {
  const s = Engine.createGame({ players: 2, seed: 5 });
  s.draw = gems.slice(8).concat(booms.slice(2));                            // 30 gems, 4 booms
  s.boomPile = gems.slice(0, 8).concat(booms.slice(0, 2));                  // 8 lost gems, 2 booms
  assertPartition(s, assert);
  for (let i = 0; i < 4; i++) { Engine.draw(s); if (i < 3) Engine.endTurn(s); }
  const r = Engine.endTurn(s);
  assert.equal(r.refreshed, 'final');
  assert.equal(s.draw.length, 43, 'every unsaved card, less the boom taken out');
  assertPartition(s, assert);
});

test('refresh: it is a real shuffle, not just a reuse of the old order', () => {
  const a = rigged(['b', 'b', 'b', 'b', 'b', 'b']);
  for (let i = 0; i < 6; i++) { Engine.draw(a); Engine.endTurn(a); }
  assert.equal(a.refreshes, 1);
  assert.equal(a.draw.length, 43);
  assert.notDeepEqual(a.draw.slice().sort((x, y) => x - y), a.draw, 'shuffled');
});

test('auto-refresh: when only booms are left in the draw pile it refreshes at once; the gems at risk stay on the table', () => {
  const s = Engine.createGame({ players: 3, seed: 3 });
  s.safe[1] = gems.slice(0, 10);
  s.boomPile = gems.slice(10, 15).concat([booms[0]]);       // 5 lost gems and 1 boom
  s.table = gems.slice(16, 20);                             // 4 gems at risk
  s.draw = booms.slice(1).concat([gems[15]]);               // a single gem on top of the other 5 booms
  s.safe[0] = gems.slice(20, 38);
  assertPartition(s, assert);
  const r = Engine.draw(s);
  assert.equal(r.type, 'gem');
  assert.equal(r.refreshed, 'auto');
  assert.deepEqual(s.table, gems.slice(16, 20).concat([15]), 'the gems at risk are not shuffled back in');
  assert.equal(s.draw.length, 5 + 1 + 5 - 1, 'the 5 booms from the pile plus the boom pile (5 gems and a boom) are the new draw pile, less the boom that leaves the game');
  assert.deepEqual(s.boomPile, []);
  assert.ok(s.draw.some(c => !Engine.isBoom(s, c)), 'there are gems to dig for again');
  assertPartition(s, assert);
});

test('auto-refresh: not when it would bring no gem back (every unsaved gem is already on the table)', () => {
  const s = Engine.createGame({ players: 2, seed: 3 });
  s.safe[1] = gems.slice(0, 10);
  s.boomPile = [];
  s.draw = booms.slice();
  s.table = gems.slice(10, 38);
  s.safe[0] = [];
  assertPartition(s, assert);
  assert.equal(Engine.autoRefresh(s), null);
  assert.equal(s.refreshes, 0);
  assert.equal(Engine.canDraw(s), true, 'you can still draw (it would be a boom)');
  assert.equal(Engine.canSave(s), true);
});

test('auto-refresh at the start of a turn: saving leaves a draw pile of only booms, so the next player gets a refreshed pile', () => {
  const s = Engine.createGame({ players: 3, seed: 3 });
  s.safe[1] = gems.slice(0, 6); s.safe[2] = gems.slice(6, 12);
  s.safe[0] = gems.slice(12, 18);
  s.table = gems.slice(18, 19);
  s.boomPile = gems.slice(19, 38);                         // 19 lost gems
  s.draw = booms.slice();                                  // only booms left (it could not refresh earlier: nothing had changed)
  assertPartition(s, assert);
  const r = Engine.save(s);
  assert.equal(r.refreshed, 'auto');
  assert.equal(s.current, 1);
  assert.ok(s.draw.some(c => !Engine.isBoom(s, c)));
  assert.deepEqual(s.boomPile, []);
  assert.equal(s.draw.length, 19 + 6 - 1, 'the lost gems and the booms, less the boom that leaves the game');
  assertPartition(s, assert);
});

// ---------- winning: two players ----------
const fill = (s, seat, n, from) => { s.safe[seat] = gems.slice(from, from + n); };
const sync = s => {               // put every card not placed in a safe pile or on the table into the draw pile
  const placed = new Set(s.safe.flat().concat(s.table));
  s.boomPile = []; s.draw = [...gems, ...booms].filter(c => !placed.has(c));
};

test('2 players: the first to SAVE 20 gems wins at once (19 is not enough)', () => {
  const s = rigged(['g', 'g']);
  fill(s, 0, 18, 10); s.table = [gems[0]]; sync(s);
  assertPartition(s, assert);
  Engine.save(s);                                    // 19
  assert.equal(s.over, false);
  assert.equal(s.current, 1);
  s.current = 0; s.phase = 'turn'; s.table = [gems[1]]; sync(s);
  const r = Engine.save(s);                          // 20
  assert.equal(r.over, true);
  assert.equal(s.over, true);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.result.winners, [0]);
  assert.equal(s.result.tie, false);
  assert.equal(s.result.reason, 'target');
  assert.deepEqual(s.result.scores, [20, 0]);
  assert.throws(() => Engine.draw(s), /over/);
  assert.throws(() => Engine.save(s), /over/);
});

test('2 players: gems at risk do not count — only saved gems win', () => {
  const s = rigged(['g', 'g']);
  fill(s, 0, 19, 10); s.table = []; sync(s);
  s.table = [gems[0], gems[1]]; sync(s);
  assert.equal(s.over, false);
  assert.equal(Engine.canSave(s), true);
});

test('2 players: 19–19 is a tie (every gem is saved, neither reached 20)', () => {
  const s = rigged(['g']);
  fill(s, 1, 19, 0); fill(s, 0, 18, 19); s.table = [gems[37]]; sync(s);
  assertPartition(s, assert);
  const r = Engine.save(s);
  assert.equal(r.over, true);
  assert.deepEqual(s.result.scores, [19, 19]);
  assert.equal(s.result.tie, true);
  assert.deepEqual(s.result.winners, [0, 1]);
  assert.equal(s.result.reason, 'all-saved');
});

test('2 players: the second seat can win the race too', () => {
  const s = rigged(['g']);
  s.current = 1;
  fill(s, 1, 19, 0); s.table = [gems[30]]; sync(s);
  Engine.save(s);
  assert.deepEqual(s.result.winners, [1]);
});

// ---------- winning: three to six players ----------
for (const n of [3, 4, 5, 6]) {
  test(`${n} players: 20 gems does not end the game; it ends when all 38 gems are saved, most gems wins`, () => {
    const s = rigged(['g'], n);
    s.safe[0] = gems.slice(0, 20); s.table = [gems[20]]; sync(s);   // seat 0 has 20 and saves a 21st
    Engine.save(s);
    assert.equal(s.over, false, 'no race with ' + n + ' players, 21 gems or not');
    assert.equal(s.current, 1);
    s.safe[1] = gems.slice(21, 37); s.table = [gems[37]]; sync(s);   // seat 1 has 16 saved and the last gem on the table
    assertPartition(s, assert);
    assert.equal(s.over, false, 'a gem on the table is not saved yet');
    const r = Engine.save(s);
    assert.equal(r.over, true);
    assert.equal(Engine.savedTotal(s), 38);
    assert.deepEqual(s.result.winners, [0]);
    assert.equal(s.result.reason, 'all-saved');
    assert.deepEqual(s.result.scores.slice(0, 2), [21, 17]);
    assert.equal(s.result.scores.reduce((a, b) => a + b, 0), 38);
  });
}

test('3+ players: the game ends the moment the last gem is saved, not before', () => {
  const s = rigged(['g'], 3);
  s.safe[0] = gems.slice(0, 20); s.safe[1] = gems.slice(20, 37); s.current = 2; s.table = [gems[37]]; sync(s);
  assertPartition(s, assert);
  assert.equal(s.over, false);
  Engine.save(s);
  assert.equal(s.over, true);
  assert.deepEqual(s.result.scores, [20, 17, 1]);
  assert.deepEqual(s.result.winners, [0]);
});

test('ties: equal gems at the end of a 3–6 player game is a shared win', () => {
  const s = rigged(['g'], 4);
  s.safe[0] = gems.slice(0, 12); s.safe[1] = gems.slice(12, 24); s.safe[2] = gems.slice(24, 31); s.current = 3; s.safe[3] = gems.slice(31, 37); s.table = [gems[37]]; sync(s);
  Engine.save(s);                                              // 12, 12, 7, 7
  assert.deepEqual(s.result.scores, [12, 12, 7, 7]);
  assert.deepEqual(s.result.winners, [0, 1]);
  assert.equal(s.result.tie, true);
  assert.deepEqual(s.result.ranking.map(r => r.place), [1, 1, 3, 3], 'tied seats share a place');
});

test('result ranking is best first and complete', () => {
  const s = rigged(['g'], 3);
  s.safe[0] = gems.slice(0, 5); s.safe[1] = gems.slice(5, 25); s.safe[2] = gems.slice(25, 37); s.current = 0; s.table = [gems[37]]; sync(s);
  Engine.save(s);
  assert.deepEqual(s.result.ranking.map(r => r.idx), [1, 2, 0]);
  assert.deepEqual(s.result.ranking.map(r => r.score), [20, 12, 6]);
});

// ---------- rematch order ----------
test('rematch (3–6 players): the fewest gems goes first, then the second fewest, and so on; equal scores keep their order', () => {
  assert.deepEqual(Engine.rematchOrder({ scores: [12, 20, 6] }), [2, 0, 1]);
  assert.deepEqual(Engine.rematchOrder({ scores: [10, 10, 10, 8] }), [3, 0, 1, 2]);
  assert.deepEqual(Engine.rematchOrder({ scores: [5, 9, 9, 5, 10] }), [0, 3, 1, 2, 4]);
  assert.deepEqual(Engine.rematchOrder({ scores: [3, 3, 3, 3, 3, 3] }), [0, 1, 2, 3, 4, 5]);
  const r = Engine.rematchOrder({ scores: [4, 7, 5, 9, 6, 7] });
  assert.deepEqual(r.map(i => [4, 7, 5, 9, 6, 7][i]), [4, 5, 6, 7, 7, 9]);
});
test('rematch (2 players): the loser goes first; after a tie, the one who went second', () => {
  assert.deepEqual(Engine.rematchOrder({ scores: [20, 7] }), [1, 0]);
  assert.deepEqual(Engine.rematchOrder({ scores: [3, 20] }), [0, 1]);
  assert.deepEqual(Engine.rematchOrder({ scores: [19, 19] }), [1, 0]);
});

// ---------- determinism and saving ----------
const play = (s, rng, steps) => {
  for (let i = 0; i < steps && !s.over; i++) {
    if (s.phase === 'boomed') { Engine.endTurn(s); continue; }
    if (Engine.canSave(s) && (rng() < 0.35 || !Engine.canDraw(s))) Engine.save(s); else Engine.draw(s);
  }
};
test('determinism: the same seed and the same choices give the same game', () => {
  const a = Engine.createGame({ players: 3, seed: 99 }), b = Engine.createGame({ players: 3, seed: 99 });
  play(a, Engine.mulberry32(5), 400); play(b, Engine.mulberry32(5), 400);
  assert.deepEqual(a.safe, b.safe);
  assert.deepEqual(a.draw, b.draw);
  assert.equal(a.turnNo, b.turnNo);
});

test('save/restore: a game at any moment (mid-turn, with a boom showing) restores and then plays exactly the same', () => {
  for (const stopAt of [3, 11, 40, 90]) {
    const a = Engine.createGame({ players: 4, seed: 12 }), pick = Engine.mulberry32(77);
    play(a, pick, stopAt);
    if (a.over) continue;
    const snap = JSON.parse(JSON.stringify(Engine.serialize(a)));
    const b = Engine.restore(snap);
    assert.deepEqual(Engine.serialize(b), snap, 'round trip');
    const p1 = Engine.mulberry32(5), p2 = Engine.mulberry32(5);
    play(a, p1, 500); play(b, p2, 500);                        // the refresh shuffles use the restored RNG position
    assert.deepEqual(a.safe, b.safe);
    assert.deepEqual(a.draw, b.draw);
    assert.equal(a.over, b.over);
  }
});

test('save/restore: a boom showing is saved and restored as a boom showing', () => {
  const s = rigged(['g', 'g', 'b']);
  drawN(s, 3);
  const r = Engine.restore(JSON.parse(JSON.stringify(Engine.serialize(s))));
  assert.equal(r.phase, 'boomed');
  assert.deepEqual(r.lastBoom, s.lastBoom);
  Engine.endTurn(r);
  assert.equal(r.current, 1);
});

test('save/restore: damaged saves, other rules and finished games are refused', () => {
  const s = Engine.createGame({ players: 2, seed: 1 });
  const snap = JSON.parse(JSON.stringify(Engine.serialize(s)));
  assert.throws(() => Engine.restore(null), /unknown save/);
  assert.throws(() => Engine.restore({ ...snap, schema: 99 }), /unknown save/);
  assert.throws(() => Engine.restore({ ...snap, fingerprint: 'zzz' }), /rules changed/);
  assert.throws(() => Engine.restore({ ...snap, draw: snap.draw.slice(1) }), /does not match/);
  assert.throws(() => Engine.restore({ ...snap, draw: snap.draw.map((c, i) => (i === 0 ? snap.draw[1] : c)) }), /does not match/);
  assert.throws(() => Engine.restore({ ...snap, current: 5 }), /does not match/);
  const other = JSON.parse(JSON.stringify(GAME_DATA)); other.rules.race.target = 15;
  assert.throws(() => Engine.restore(snap, { data: other }), /rules changed/);
  s.over = true;
  assert.throws(() => Engine.serialize(s), /finished/);
});

// ---------- information discipline ----------
test('publicView: shows counts and scores, but never the order or identity of the draw pile', () => {
  const a = Engine.createGame({ players: 3, seed: 4 });
  play(a, Engine.mulberry32(3), 30);
  const b = JSON.parse(JSON.stringify(a)); b.rng = a.rng;
  b.draw = Engine.shuffle(b.draw.slice(), Engine.mulberry32(1234));       // the hidden order differs
  assert.notDeepEqual(a.draw, b.draw);
  for (let i = 0; i < 3; i++) assert.deepEqual(Engine.publicView(a, i), Engine.publicView(b, i));
  const v = Engine.publicView(a, 1);
  assert.equal(v.drawCount, a.draw.length);
  assert.equal(v.boomsOut + v.boomsInDraw, 6);
  assert.equal(v.gemsInDraw + v.boomsInDraw, v.drawCount);
  assert.equal(v.table, a.table.length);
  assert.deepEqual(v.scores, Engine.scores(a));
  assert.ok(!JSON.stringify(v).includes('draw":['), 'no card list');
  for (const val of Object.values(v)) assert.ok(!Array.isArray(val) || val.every(x => typeof x === 'number'), 'only the score list is an array');
  assert.deepEqual(Object.keys(v).sort(), ['boomTotal', 'boomsInDraw', 'boomsOut', 'current', 'drawCount', 'gemTotal', 'gemsInDraw', 'me', 'n', 'over', 'phase', 'race', 'scores', 'table', 'target', 'turnNo']);
});

test('publicView: the gems/booms left in the draw pile follow from public facts alone', () => {
  const s = Engine.createGame({ players: 2, seed: 6 });
  play(s, Engine.mulberry32(8), 25);
  const v = Engine.publicView(s, 0);
  const seenGems = Engine.savedTotal(s) + s.table.length + s.boomPile.filter(c => !Engine.isBoom(s, c)).length;
  assert.equal(v.gemsInDraw, G - seenGems);
  assert.equal(v.boomsInDraw, B - v.boomsOut);
});

test('two-player race flag: the view says whether there is a target', () => {
  assert.equal(Engine.publicView(Engine.createGame({ players: 2, seed: 1 }), 0).target, 20);
  assert.equal(Engine.publicView(Engine.createGame({ players: 3, seed: 1 }), 0).target, null);
  assert.equal(Engine.publicView(Engine.createGame({ players: 3, seed: 1 }), 0).race, false);
});

// ---------- the whole thing hangs together ----------
test('random play: every card is always in exactly one place, booms out never exceed 6, and games that end add up to 38', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const n = 2 + (seed % 5), s = Engine.createGame({ players: n, seed }), pick = Engine.mulberry32(seed * 3);
    for (let i = 0; i < 3000 && !s.over; i++) {
      if (s.phase === 'boomed') Engine.endTurn(s);
      else if (Engine.canSave(s) && (pick() < 0.3 || !Engine.canDraw(s))) Engine.save(s);
      else Engine.draw(s);
      assertPartition(s, assert);
      assert.ok(Engine.boomsOut(s) <= 6);
      assert.ok(s.draw.length > 0 || s.over || s.phase === 'boomed' || s.table.length > 0, 'a player is never stuck with no move');
    }
    if (s.over) {
      assert.equal(s.result.scores.reduce((a, b) => a + b, 0) <= 38, true);
      if (s.result.reason === 'all-saved') assert.equal(Engine.savedTotal(s), 38);
    }
  }
});

test('each time through the deck a boom card is taken out of the game for good, so the deck gets safer', () => {
  const s = Engine.createGame({ players: 2, seed: 9 });
  assert.equal(Engine.boomTotal(s), B);
  for (let round = 1; round <= B; round++) {
    s.draw = []; s.boomPile = gems.concat(booms).filter(c => !s.gone.includes(c)); s.table = []; s.safe = [[], []];        // everything used up
    s.phase = 'boomed'; s.lastBoom = { card: s.boomPile[s.boomPile.length - 1], lost: [] };
    const r = Engine.endTurn(s);
    assert.equal(r.refreshed, 'final');
    assert.equal(s.gone.length, Math.min(round, B - 1)); assert.equal(Engine.boomTotal(s), Math.max(1, B - round));
    assertPartition(s, assert);
  }
  assert.equal(s.draw.filter(c => Engine.isBoom(s, c)).length, 1, 'the last boom never leaves: the game needs one');
  assert.equal(Engine.boomTotal(s), 1);
});
