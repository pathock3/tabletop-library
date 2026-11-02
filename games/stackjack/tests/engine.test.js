const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, AI } = require('./load');

// The starting deck stops at 7, so the tests that need bigger numbers use these test-only cards (they are never dealt).
for (const [id, v] of [['ten', 10]]) E.DEF[id] = { id, name: String(v), val: { kind: 'fixed', v }, cat: 'Number card', trig: 'none', text: '' };

// ---------- helpers: build a table by hand ----------
function game(n = 3, seed = 1) {
  const s = E.newGame({ seed, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'ai', level: 'medium' })) });
  s.stack = []; s.pending = null; s.log = []; s.cause = {}; s.mod = {}; s.first = 0; s.active = 0; s.consec = 0;
  return s;
}
const card = (s, id, o) => { const c = { u: s.nextU++, id, o }; s.cards[c.u] = c; return c; };
function line(s, p, ids, hidden = 0) { s.pl[p].line = ids.map((id, i) => ({ c: card(s, id, p), down: i === 0 && hidden === 1 && false || (hidden && i === 0), unk: false })); }
function deck(s, p, ids) { s.pl[p].deck = ids.map(id => card(s, id, p)); s.pl[p].known = { top: [], bottom: null, all: null, hidden: {}, tell: [] }; }
const at = (s, p, i) => s.pl[p].line[i];
const ids = (s, p) => s.pl[p].line.map(e => e.c.id);
function fire(s, p, i) { s.stack.push({ t: 'abil', u: at(s, p, i).c.u, h: p, step: 0, d: {} }); E.run(s); }
const ok = (s, id) => { const r = E.answer(s, id); assert.ok(r.ok, 'answer ' + id + ' ' + (s.pending ? s.pending.prompt : '')); };
const pend = s => s.pending && s.pending.kind;
const opts = s => s.pending.opts.map(o => String(o.id));
const total = (s, p) => E.bestTotal(s, p);
/* put a chip on a total with a chosen arrival, so that the tracking sweep does not move it */
const chip = (s, p, total, at) => { s.pl[p].chip = total; s.pl[p].arrivedAt = at; };
/* one step of an all-computer game: answer the question that is waiting, or let one of the players still in the round act */
function advance(s) {
  if (s.pending) { const pd = s.pending; return E.answer(s, pd.kind === 'results' ? 'continue' : AI.answer(s, pd.who)); }
  const open = E.openPlayers(s); assert.ok(open && open.length, 'stuck'); const p = open[s.tick % open.length]; return E.act(s, p, AI.answer(s, p));
}
const uOf = (s, p, id) => s.pl[p].line.find(e => e.c.id === id).c.u;

test('the data: 9 number cards (one each of 1 to 9), 46 wildcards, no suits and no Ace', () => {
  assert.deepEqual(D.numbers.map(c => c.id), ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']); assert.ok(D.numbers.every((c, k) => !('copies' in c) && c.val.kind === 'fixed' && c.val.v === k + 1 && c.trig === 'none'));
  const g = game(2); assert.equal(g.pl[0].deck.length + g.pl[0].line.length, 9, 'setup gives each player 9 cards'); assert.deepEqual(Object.values(g.cards).filter(c => c.o === 0 && D.numbers.some(d => d.id === c.id)).map(c => c.id).sort(), ['eight', 'five', 'four', 'nine', 'one', 'seven', 'six', 'three', 'two']);
  const all = D.numbers.concat(D.wild); assert.ok(!all.some(c => 'suit' in c || c.id === 'ace' || (c.name || '') === 'Ace'), 'no card has a suit, and there is no Ace');
  assert.ok(!/[♠♥♣♦]|\bAces?\b|\bsuits?\b/i.test(JSON.stringify(D)), 'no suit or Ace anywhere in the game data');
  const html = require('fs').readFileSync(require('./load').FILE, 'utf8'); assert.ok(!/[♠♥♣♦]/.test(html), 'no suit symbols in the game file'); assert.ok(!/\bAces?\b/.test(html.replace(/there is no Ace/g, '')), 'no Ace in the game file');
  assert.equal(D.wild.length, 46); assert.deepEqual(D.wild.find(c => c.id === 'hi-lo').val, { kind: 'flex', opts: [1, 10] }); assert.equal(D.wild.find(c => c.id === 'hit-man').val.v, 8);
  assert.deepEqual(D.wild.filter(c => c.mean).map(c => c.id).sort(), ['cooler', 'hit-man', 'last-call']);
  for (const c of D.wild) { assert.ok(c.ai >= 1 && c.ai <= 5, c.id); assert.ok(c.name && c.cat && c.trig, c.id); }
});

test('values resolve in order: base, Fixer, Split, Shave Job, floor; Ringer chains; Headcount', () => {
  const s = game(); line(s, 0, ['eight', 'split']);
  E.mod(s, at(s, 0, 0).c.u).fd = 1; assert.equal(E.lineValuesFor(s, 0, null)[0], 9);
  E.mod(s, at(s, 0, 0).c.u).half = 1; assert.equal(E.lineValuesFor(s, 0, null)[0], 4, 'Fixer first (9), then halve rounding down');
  line(s, 0, ['shave-job', 'nine', 'ten']); assert.deepEqual(E.lineValuesFor(s, 0, null), [5, 8, 9], 'each card to its right counts 1 less');
  line(s, 0, ['shave-job', 'shave-job', 'two']); assert.equal(E.lineValuesFor(s, 0, null)[2], 1, 'several Shave Jobs stack, never below 1');
  line(s, 0, ['four', 'ringer', 'ringer']); const w = []; E.bestChoice(s, 0); assert.equal(E.bestTotal(s, 0), 12, 'Ringers copy the card to their left');
  line(s, 0, ['headcount', 'two', 'three']); assert.equal(E.lineValuesFor(s, 0, null)[0], 3);
  line(s, 0, ['ten', 'ten', 'feather']); E.mod(s, at(s, 0, 2).c.u).fd = -5; assert.equal(E.lineValuesFor(s, 0, null)[2], 0, 'never below 0');
});

test('minimum and best totals with Aces and every flex type; bust detection', () => {
  const s = game(); line(s, 0, ['hi-lo', 'ten']); assert.deepEqual(E.range(s, 0), { min: 11, max: 20 }); assert.equal(total(s, 0), 20, 'Hi-Lo counts as 1 or 10');
  line(s, 0, ['hi-lo', 'hi-lo', 'ten', 'seven']); assert.equal(E.minTotal(s, 0), 19); assert.equal(total(s, 0), 19, '1+1+10+7; a 10 for a Hi-Lo is over 21');
  line(s, 0, ['two-faced', 'sleeve-card', 'hi-lo', 'dealers-choice', 'feather']); assert.equal(E.minTotal(s, 0), 2 + 1 + 1 + 2 + 0, 'minimum total: every flex card at its lowest option');
  line(s, 0, ['mechanic', 'ten', 'ten']); assert.equal(E.minTotal(s, 0), 21); assert.equal(total(s, 0), 21);
  line(s, 0, ['ten', 'ten', 'two']); assert.equal(total(s, 0), null, 'over 21 even at the lowest');
  s.pl[0].load = 2; line(s, 0, ['ten', 'nine']); assert.equal(total(s, 0), 21, 'Load adds 1 each');
});

test('bust window: Palm, Stacker, Holdout, Fall Guy, Getaway Car, Bribe; declining; chained', () => {
  let s = game(); line(s, 0, ['palm', 'nine', 'six']); deck(s, 0, ['five']); s.pl[0].lastDrawn = null;
  s.stack.push({ t: 'draw', p: 0, how: 'hit', step: 0 }); E.run(s);
  assert.equal(pend(s), 'window'); assert.ok(opts(s).includes('palm') && opts(s).includes('decline'));
  ok(s, 'palm'); assert.equal(s.pl[0].status, 'active'); assert.equal(s.pl[0].deck[s.pl[0].deck.length - 1].id, 'five', 'Palm puts the card on the bottom of the deck');
  s = game(); line(s, 0, ['ten', 'nine', 'stacker']); deck(s, 0, ['five']); s.stack.push({ t: 'draw', p: 1, how: 'hit', step: 0 }); s.pl[1].deck = [card(s, 'two', 1)];
  s.pl[0].load = 3; s.cause[0] = { k: 'load' }; s.stack = [{ t: 'bustcheck' }]; E.run(s);
  assert.ok(pend(s) === 'window' && !opts(s).includes('fall-guy') && !opts(s).includes('palm'), 'Fall Guy and Palm need a card to have caused it');
  ok(s, 'stacker'); assert.equal(pend(s), 'card'); ok(s, 'c' + at(s, 0, 0).c.u); assert.equal(s.pl[0].deck[0].id, 'ten'); assert.equal(s.pl[0].status, 'active');
  s = game(); line(s, 0, ['ten', 'nine', 'holdout', 'two']); s.stack = [{ t: 'bustcheck' }]; E.run(s);
  assert.equal(pend(s), 'window'); ok(s, 'holdout'); ok(s, 'c' + at(s, 0, 0).c.u); assert.deepEqual(ids(s, 0), ['nine', 'two']); assert.equal(s.discard.length, 2, 'the card and Holdout are discarded');
  s = game(); line(s, 0, ['ten', 'nine', 'getaway-car', 'five']); s.stack = [{ t: 'bustcheck' }]; E.run(s); ok(s, 'getaway-car');
  assert.equal(s.pl[0].getaway, 17); assert.equal(total(s, 0), 17); assert.equal(s.removed.length, 1); E.giveLoad(s, 0, 2, 1); assert.equal(total(s, 0), 19, '17 plus later Load');
  s = game(); line(s, 0, ['ten', 'nine', 'getaway-car', 'five']); line(s, 1, ['two']); s.stack = [{ t: 'bustcheck' }]; E.run(s); ok(s, 'decline'); assert.equal(s.pl[0].status, 'busted'); assert.ok(!s.pl[0].line.some(e => e.down), 'a bust flips the hidden card');
  s = game(); line(s, 0, ['ten', 'nine', 'bribe']); s.pl[0].load = 3; s.cause[0] = { k: 'load' }; s.stack = [{ t: 'bustcheck' }]; E.run(s);
  assert.ok(opts(s).includes('bribe')); ok(s, 'bribe'); ok(s, 'p1'); assert.equal(s.pl[0].load, 2); assert.equal(s.pl[1].load, 1);
  s = game(); line(s, 0, ['ten', 'nine', 'fall-guy']); line(s, 1, ['two']); const bad = card(s, 'five', 0); s.pl[0].line.push({ c: bad, down: false, unk: false }); s.cause[0] = { k: 'card', u: bad.u, how: 'draw' }; s.stack = [{ t: 'bustcheck' }]; E.run(s);
  ok(s, 'fall-guy'); ok(s, 'p1'); assert.equal(ids(s, 1).pop(), 'five'); assert.equal(s.pl[0].status, 'active');
});

test('no turns: anyone hits at once and sees the card; Pass locks in your score; the round ends when everyone has passed', () => {
  const s = game(3); line(s, 0, ['two', 'three']); line(s, 1, ['two', 'four']); line(s, 2, ['two', 'five']); for (const p of [0, 1, 2]) deck(s, p, ['six', 'seven', 'eight']);
  s.stack = [{ t: 'turn', step: 0 }]; E.run(s);
  assert.ok(E.isOpen(s) && !s.pending, 'nobody is asked anything: everyone may act'); assert.deepEqual(E.openPlayers(s), [0, 1, 2]);
  assert.ok(E.act(s, 2, 'hit').ok); assert.equal(ids(s, 2).pop(), 'six', 'the card is there the moment you hit'); assert.ok(E.act(s, 2, 'hit').ok, 'the same player can hit again and again, without waiting for anyone');
  assert.ok(E.act(s, 0, 'pass').ok); assert.equal(s.pl[0].locked, true); assert.equal(E.act(s, 0, 'hit').ok, false, 'a pass locks in the score');
  assert.ok(E.act(s, 1, 'hit').ok); assert.ok(E.isOpen(s)); assert.ok(E.act(s, 1, 'pass').ok); assert.ok(E.isOpen(s), 'player 2 has not passed yet'); assert.ok(E.act(s, 2, 'pass').ok);
  assert.equal(pend(s), 'results', 'everyone has passed: the round is scored');
  const g = game(3); line(g, 0, ['two']); line(g, 1, ['two']); line(g, 2, ['two']); g.pl[1].getaway = 17; g.stack = [{ t: 'turn', step: 0 }]; E.run(g);
  assert.deepEqual(E.openPlayers(g), [0, 2], 'a player under Getaway Car is locked in at once'); E.act(g, 0, 'pass'); E.act(g, 2, 'pass'); assert.equal(pend(g), 'results');
  const h = game(3); line(h, 0, ['two', 'three']); line(h, 1, ['two', 'four']); line(h, 2, ['two', 'five']); deck(h, 0, ['six', 'one']); deck(h, 1, ['seven', 'two']); deck(h, 2, ['hit-man', 'nine']);
  h.stack = [{ t: 'turn', step: 0 }]; E.run(h); E.act(h, 0, 'pass'); E.act(h, 1, 'pass'); E.act(h, 2, 'hit');
  assert.equal(ids(h, 0).pop(), 'six', 'Hit Man: a player who passed must hit'); assert.equal(ids(h, 1).pop(), 'seven'); assert.equal(h.pl[0].locked, true, 'and stays locked in');
  const q = game(2); line(q, 0, ['two']); line(q, 1, ['two']); q.pl[0].deck = []; q.stack = [{ t: 'turn', step: 0 }]; E.run(q); assert.ok(!E.turnOptions(q, 0).some(o => o.id === 'hit'), 'an empty deck cannot hit');
  const w = game(2); line(w, 0, ['two', 'shiner']); line(w, 1, ['two']); deck(w, 0, ['six', 'seven']); w.stack = [{ t: 'turn', step: 0 }]; E.run(w); E.act(w, 0, 'use' + w.pl[0].line[1].c.u);
  assert.equal(pend(w), 'choice'); assert.equal(E.act(w, 1, 'pass').ok, false, 'while a question is waiting for its answer nobody else can act');
});

test('scoring: every row of the examples table, plus Tightrope, Side Bet, Run and Sandbag', () => {
  const score = (totals, mk) => {
    const n = totals.length, s = game(n); s.mod = {};
    totals.forEach((t, p) => { s.pl[p].load = 0; line(s, p, t === 'bust' ? ['ten', 'ten', 'five'] : ['ten']); if (t !== 'bust') s.pl[p].load = t - 10; if (mk) mk(s, p, t); });
    s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); return s;
  };
  const pts = s => s.result.rows.map(r => r.pts);
  let s;
  for (const n of [2, 3, 4, 5, 6]) {                    // every row of the points table: players in strict order, then everyone tied, then all busted
    const tbl = D.rules.POINTS_BY_PLACE[n]; assert.equal(tbl.length, n);
    assert.deepEqual(pts(score(Array.from({ length: n }, (_, k) => 21 - k))), tbl, n + ' players, no ties');
    assert.deepEqual(pts(score(Array.from({ length: n }, () => 18))), tbl, n + ' players all on the same total: every place is different, so the table applies in full');
    assert.deepEqual(pts(score(Array.from({ length: n }, () => 'bust'))), Array(n).fill(tbl[n - 1]), n + ' players all bust: the last-place entry');
    assert.deepEqual(pts(score(Array.from({ length: n }, (_, k) => k === 0 ? 14 : 'bust'))), [tbl[0]].concat(Array(n - 1).fill(tbl[n - 1])));
  }
  assert.deepEqual(D.rules.POINTS_BY_PLACE, { 2: [6, 2], 3: [6, 4, 2], 4: [6, 4, 3, 1], 5: [6, 5, 3, 2, 1], 6: [6, 5, 4, 3, 2, 1] });
  assert.deepEqual(pts(score([20, 20, 18, 'bust', 'bust'])), [6, 5, 3, 1, 1], 'tied totals do not share a place; every bust scores the last entry');
  assert.deepEqual(pts(score([20, 20, 19, 17])), [6, 4, 3, 1], '4 players: the tie is broken, so the places are 1st, 2nd, 3rd, 4th');
  assert.deepEqual(pts(score([21, 20, 20, 15, 10, 'bust'])), [6, 5, 4, 3, 2, 1]);
  s = game(3); line(s, 0, ['ten', 'ten', 'one'].slice(0, 2).concat([])); s.pl[0].load = 1; line(s, 1, ['ten', 'ten']); s.pl[1].line.push({ c: card(s, 'tightrope', 1), down: false, unk: false }); line(s, 2, ['ten', 'nine']);
  s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.deepEqual(s.result.rows.map(r => [r.total, r.place, r.pts]), [[21, 2, 4], [21, 1, 6], [19, 3, 2]], 'Tightrope ranks above the other 21');
  s = game(3); line(s, 0, ['ten', 'ten', 'five', 'side-bet']); line(s, 1, ['ten', 'ten', 'five']); line(s, 2, ['ten', 'nine']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s);
  assert.deepEqual(s.result.rows.map(r => r.pts), [3, 2, 6], 'Side Bet: the last-place entry + 1 when another player also busted');
  s = game(3); line(s, 0, ['ten', 'ten', 'five', 'side-bet']); line(s, 1, ['nine', 'nine']); line(s, 2, ['ten', 'nine']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s);
  assert.equal(s.result.rows[0].pts, 2, 'Side Bet needs another bust');
  s = game(3); line(s, 0, ['ten', 'ten']); s.pl[0].line.push({ c: card(s, 'tightrope', 0), down: false, unk: false }); line(s, 1, ['ten', 'ten']); s.pl[1].line.push({ c: card(s, 'tightrope', 1), down: false, unk: false }); line(s, 2, ['ten', 'ten']); s.pl[2].load = 1; s.stack = [{ t: 'reveal', step: 0 }]; E.run(s);
  assert.deepEqual(s.result.rows.map(r => [r.total, r.place, r.pts]), [[21, 1, 6], [21, 2, 4], [21, 3, 2]], 'two Tightropes at 21: the earlier arrival ranks higher; both rank above the plain 21');
  s = game(3); line(s, 0, ['four', 'five', 'six', 'run']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(s.pl[0].prio, 'Run: three consecutive values');
  s = game(3); line(s, 0, ['five', 'seven', 'eight', 'run']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(!s.pl[0].prio, 'Run: 5, 7, 8 and 3 have no three consecutive values');
  s = game(3); line(s, 0, ['two', 'sandbag']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(s.pl[0].prio, 'Sandbag: finished last without busting');
  s = game(3); s.tiebreak = true; line(s, 0, ['two', 'sandbag']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(!s.pl[0].prio, 'no draft in a tiebreak round');
});

test('the draft: priority first, then fewest points; ties are random but repeatable; cards join the owner; the rest leave the game', () => {
  const s = game(4, 5); s.pl.forEach((p, i) => { p.pts = [5, 2, 2, 7][i]; p.prio = false; }); s.pl[3].prio = true;
  s.stack = []; s.pending = null;
  const before = s.wild.length;
  s.phase = 'results'; E.answer; s.pending = { who: null, kind: 'results', opts: [{ id: 'continue' }], prompt: '' }; ok(s, 'continue');
  assert.equal(s.phase, 'draft'); assert.equal(s.market.length, 8, '2 cards per player'); assert.equal(s.wild.length, before - 8);
  assert.deepEqual(s.draft.order.slice(0, 4).map(Number)[0], 3, 'a player with priority picks first');
  assert.equal(s.draft.order[3], 0, 'the leader picks last'); assert.deepEqual(s.draft.order.slice(0, 4), s.draft.order.slice(4), 'the same order twice');
  assert.ok(s.draft.tie, 'two players tied on points: broken at random');
  const owners = []; while (s.phase === 'draft') { const pd = s.pending, who = pd.who; const o = pd.opts[0]; owners.push(who); const u = o.u; ok(s, o.id); assert.equal(s.cards[u].o, who); }
  assert.equal(owners.length, 8); assert.equal(s.removed.length, 0, 'all 8 were picked'); assert.equal(s.round, 2);
  E.auditCards(s);
});

test('cleanup: cards moved by Plant, Fall Guy and Hand Mucker go home; Getaway Car stays removed; Load resets', () => {
  const s = game(3, 9); s.stack = []; s.pending = null;
  const g = card(s, 'getaway-car', 0); s.removed.push(g);
  const planted = s.pl[0].line.splice(1, 1)[0]; s.pl[1].line.push(planted);
  s.pl[2].load = 3; s.phase = 'results'; s.pending = { who: null, kind: 'results', opts: [{ id: 'continue' }], prompt: '' };
  s.pl[0].pts = 9; ok(s, 'continue'); while (s.phase === 'draft') ok(s, s.pending.opts[0].id);
  assert.ok(s.pl[0].deck.concat(s.pl[0].line.map(e => e.c)).includes(planted.c), 'the planted card returned to its owner');
  assert.equal(s.removed.includes(g), true); assert.equal(s.pl[2].load, 0);
  E.auditCards(s);
});

test('the same seed and the same choices give the same game', () => {
  const run = seed => { const s = E.newGame({ seed, seats: [0, 1, 2].map(i => ({ name: 'P' + i, kind: 'ai', level: ['easy', 'medium', 'hard'][i] })) }); let n = 0; while (s.phase !== 'over' && n++ < 30000) advance(s); return s.log.map(l => l.t).join('|') + s.pl.map(p => p.pts); };
  assert.equal(run(42), run(42)); assert.notEqual(run(42), run(43));
});

// ---------- one test per upgrade card ----------
test('Control cards: Two-Faced, Sleeve Card, Feather, Hi-Lo, Dealer\'s Choice, Mechanic, Ringer', () => {
  const s = game(); const t = (ids, want) => { line(s, 0, ids); assert.equal(total(s, 0), want, ids.join()); };
  t(['two-faced', 'nine', 'ten'], 21); t(['sleeve-card', 'ten', 'ten'], 21); t(['feather', 'ten', 'ten'], 20); t(['hi-lo', 'ten'], 20); t(['dealers-choice', 'ten', 'nine'], 21); t(['mechanic', 'nine', 'nine'], 21); t(['ten', 'ringer'], 20); t(['ringer', 'ten'], 11);
});
test('Fixer and Split: once per round, on another card in your line', () => {
  const s = game(); line(s, 0, ['fixer', 'eight', 'nine']); fire(s, 0, 0); assert.equal(pend(s), 'card'); ok(s, 'c' + at(s, 0, 1).c.u); ok(s, 'up'); assert.equal(E.lineValuesFor(s, 0, null)[1], 9); assert.ok(E.mod(s, at(s, 0, 0).c.u).side, 'turned sideways');
  line(s, 1, ['split', 'ten', 'nine']); fire(s, 1, 0); ok(s, 'c' + at(s, 1, 1).c.u); assert.equal(E.lineValuesFor(s, 1, null)[1], 5);
});
test('Shiner, Marked Card, Cold Deck, Bottom Deal, Card Counter, Crimp: private looks at your deck', () => {
  let s = game(); line(s, 0, ['shiner', 'two']); deck(s, 0, ['nine', 'three']); fire(s, 0, 0); assert.deepEqual(s.pending.show, [s.pl[0].deck[0].u]); ok(s, 'bottom'); assert.equal(s.pl[0].deck[1].id, 'nine', 'the top card went to the bottom');
  s = game(); line(s, 0, ['marked-card', 'two']); deck(s, 0, ['nine', 'three', 'four']); fire(s, 0, 0); ok(s, 'b'); assert.deepEqual(s.pl[0].deck.map(c => c.id), ['three', 'nine', 'four']);
  s = game(); line(s, 0, ['cold-deck', 'two']); deck(s, 0, ['nine', 'three', 'four', 'five']); fire(s, 0, 0); ok(s, 'c' + s.pl[0].deck[2].u); assert.deepEqual(s.pl[0].deck.map(c => c.id), ['four', 'five', 'nine', 'three']);
  s = game(); line(s, 0, ['bottom-deal', 'two', 'ten']); deck(s, 0, ['nine', 'three', 'four']); s.stack.push({ t: 'draw', p: 0, how: 'hit', step: 0 }); E.run(s); assert.equal(pend(s), 'choice'); ok(s, 'bottom'); assert.equal(ids(s, 0).pop(), 'four');
  s = game(); line(s, 0, ['card-counter', 'two']); deck(s, 0, ['nine', 'three', 'five', 'one']); fire(s, 0, 0); assert.equal(pend(s), 'choice'); assert.equal(s.pending.who, 0); assert.equal(s.pending.show.length, 4, 'you see the whole deck');
  const v0 = E.viewFor(s, 0); assert.equal(v0.pending.who, 0, 'the prompt belongs to the holder alone'); assert.equal(v0.pending.showIds.length, 4);
  const five = s.pl[0].deck[2]; ok(s, 'c' + five.u); assert.equal(ids(s, 0).length, 2); assert.deepEqual(s.pl[0].deck.map(c => c.id), ['five', 'nine', 'three', 'one'], 'chosen card on top, the rest in their old order');
  assert.deepEqual(s.pl[0].known.top, [five.u], 'the new top card is known to its holder'); assert.equal(s.pl[0].known.all.length, 4);
  s = game(); line(s, 0, ['card-counter']); deck(s, 0, ['nine', 'three']); fire(s, 0, 0); ok(s, 'c' + s.pl[0].deck[0].u); assert.deepEqual(s.pl[0].deck.map(c => c.id), ['nine', 'three'], 'choosing the top card changes nothing');
  s = game(); line(s, 0, ['crimp', 'two']); deck(s, 0, ['nine', 'three']); fire(s, 0, 0); ok(s, 'ok'); assert.equal(s.pl[0].deck[1].id, 'nine', 'a 6 or higher goes to the bottom');
  s = game(); line(s, 0, ['crimp', 'two']); deck(s, 0, ['five', 'three']); fire(s, 0, 0); ok(s, 'ok'); assert.equal(s.pl[0].deck[0].id, 'five');
});
test('Stacker, Palm, Holdout, Second Deal, Getaway Car, Fall Guy, Side Bet: protection', () => {
  let s = game(); line(s, 0, ['stacker', 'two']); fire(s, 0, 0); ok(s, 'c' + at(s, 0, 1).c.u); assert.equal(s.pl[0].deck[0].id, 'two'); assert.equal(ids(s, 0).length, 1);
  s = game(); line(s, 0, ['palm', 'two', 'six']); s.pl[0].lastDrawn = at(s, 0, 2).c.u; fire(s, 0, 0); assert.equal(s.pl[0].deck.pop().id, 'six'); assert.equal(ids(s, 0).includes('six'), false);
  s = game(); line(s, 0, ['second-deal', 'two']); deck(s, 0, ['nine', 'three']); s.stack.push({ t: 'draw', p: 0, how: 'hit', step: 0 }); E.run(s); assert.equal(pend(s), 'choice'); ok(s, 'use'); assert.equal(ids(s, 0).pop(), 'three'); assert.equal(s.discard[0].id, 'nine'); assert.ok(E.mod(s, at(s, 0, 0).c.u).side);
});
test('Attack cards: Shill, Heat, Squeeze, Pit Boss, Cooler, Hit Man, Plant, Last Call', () => {
  let s = game(3); line(s, 0, ['shill']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); ok(s, 'p1'); assert.equal(s.pl[1].load, 1);
  s = game(3); line(s, 0, ['heat', 'two']); line(s, 1, ['two']); line(s, 2, ['three']); s.pl[1].locked = true; fire(s, 0, 0); assert.equal(s.pl[1].load, 1, 'only a player who passed (one target: no question)'); assert.equal(s.pl[2].load, 0);
  s = game(3); line(s, 0, ['squeeze']); line(s, 1, ['two', 'two', 'two', 'two']); line(s, 2, ['three', 'three', 'three']); fire(s, 0, 0); assert.equal(s.pl[1].load, 2, '4 or more cards'); assert.equal(s.pl[2].load, 0, '3 cards is not enough');
  s = game(3); line(s, 0, ['pit-boss']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); assert.deepEqual([s.pl[1].load, s.pl[2].load], [1, 1]);
  s = game(3); line(s, 0, ['cooler']); line(s, 1, ['two']); line(s, 2, ['three']); deck(s, 1, ['six']); fire(s, 0, 0); ok(s, 'p1'); assert.equal(ids(s, 1).pop(), 'six'); assert.equal(s.pl[1].last, 'hit');
  s = game(3); line(s, 0, ['hit-man']); line(s, 1, ['two']); line(s, 2, ['three']); deck(s, 1, ['six']); deck(s, 2, ['seven']); s.pl[1].locked = true; s.pl[2].locked = true; fire(s, 0, 0); assert.equal(ids(s, 1).pop(), 'six'); assert.equal(ids(s, 2).pop(), 'seven');
  s = game(3); line(s, 0, ['two', 'plant']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 1); ok(s, 'p2'); assert.equal(ids(s, 2).pop(), 'plant'); assert.equal(ids(s, 0).length, 1);
  s = game(2); line(s, 0, ['two', 'last-call']); line(s, 1, ['three']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.equal(s.pl[1].load, 1, 'Last Call at reveal');
});
test('Defense cards: Bribe, Muscle, Alibi, Comp', () => {
  let s = game(2); line(s, 0, ['bribe', 'two']); line(s, 1, ['three']); s.pl[0].load = 2; fire(s, 0, 0); assert.deepEqual([s.pl[0].load, s.pl[1].load], [1, 1]);
  s = game(3); line(s, 0, ['two']); line(s, 1, ['muscle', 'three']); E.giveLoad(s, 1, 1, 0); assert.equal(s.pl[1].load, 0, 'Muscle blocks Load'); line(s, 2, ['bribe', 'two']); s.pl[2].load = 1; s.pl[0].load = 0; fire(s, 2, 0); assert.equal(s.pl[1].load, 0, 'Bribe cannot target Muscle (one other target left)');
  s = game(2); line(s, 0, ['shill']); line(s, 1, ['alibi', 'two']); fire(s, 0, 0); assert.equal(pend(s), 'choice'); assert.equal(s.pending.who, 1); ok(s, 'cancel'); assert.equal(s.pl[1].load, 0); assert.ok(E.mod(s, at(s, 1, 0).c.u).side);
  s = game(2); line(s, 0, ['two', 'comp']); s.pl[0].load = 2; fire(s, 0, 1); assert.equal(s.pl[0].load, 1);
});
test('Push Your Luck cards: High Roller, Nerve, Double Down, Hot Streak, Tightrope', () => {
  let s = game(3); line(s, 0, ['ten', 'six', 'high-roller']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 2); ok(s, 'p1'); ok(s, 'p2'); assert.deepEqual([s.pl[1].load, s.pl[2].load], [1, 1], '2 Load split as you like');
  s = game(2); line(s, 0, ['four', 'high-roller']); line(s, 1, ['two']); fire(s, 0, 1); assert.equal(s.pl[1].load, 0, 'needs 15 or more before this card');
  s = game(2); line(s, 0, ['ten', 'seven', 'nerve']); deck(s, 0, ['two', 'three']); fire(s, 0, 2); assert.equal(pend(s), 'choice'); ok(s, 'draw'); assert.equal(ids(s, 0).pop(), 'two');
  s = game(2); line(s, 0, ['double-down', 'two']); line(s, 1, ['three']); deck(s, 0, ['four', 'five']); s.stack = [{ t: 'turn', step: 0 }]; E.run(s); assert.ok(E.act(s, 0, 'double').ok); assert.deepEqual(ids(s, 0).slice(-2), ['four', 'five']); assert.equal(s.pl[1].load, 1);
  s = game(3); line(s, 0, ['two', 'two', 'two', 'two', 'hot-streak']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 4); assert.deepEqual([s.pl[1].load, s.pl[2].load], [1, 1], '5 cards counting Hot Streak itself');
  s = game(3); line(s, 0, ['two', 'two', 'two', 'hot-streak']); line(s, 1, ['two']); fire(s, 0, 3); assert.equal(s.pl[1].load, 0, '4 cards is not enough');
});
test('Line cards: Headcount, Shave Job, Sleight, Chain Gang, Run', () => {
  let s = game(3); line(s, 0, ['sleight', 'two', 'ten']); fire(s, 0, 0); ok(s, 'c' + at(s, 0, 2).c.u); ok(s, 'i0'); assert.equal(ids(s, 0)[0], 'ten');
  s = game(3); line(s, 0, ['chain-gang', 'two', 'one', 'ten', 'hi-lo']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); ok(s, 'p1'); ok(s, 'p2'); assert.equal(s.pl[1].load + s.pl[2].load, 2, 'each other fixed 1 or 2 counts (a 2 and a 1); the 10 and the flex Hi-Lo do not; Chain Gang itself does not');
  s = game(3); line(s, 0, ['chain-gang', 'three', 'ten']); line(s, 1, ['two']); fire(s, 0, 0); assert.equal(s.pl[1].load, 0, 'no other 1 or 2: nothing');
});
test('Catch-up cards: Long Shot', () => {
  const s = game(3); s.pl[0].pts = 1; s.pl[1].pts = 5; s.pl[2].pts = 3; line(s, 0, ['long-shot']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); assert.equal(s.pl[1].load, 2, '2 Load to the leader');
  const t = game(3); line(t, 0, ['long-shot']); line(t, 1, ['two']); line(t, 2, ['three']); fire(t, 0, 0); assert.equal(t.pl[1].load + t.pl[2].load, 0, 'round 1: nothing');
});
test('the simulation: random all-AI games finish, cards stay put, Load never goes negative', () => {
  for (const n of [2, 3, 4, 5, 6]) for (let k = 1; k <= 4; k++) {
    const s = E.newGame({ seed: k * 11 + n, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'ai', level: ['easy', 'medium', 'hard'][i % 3] })) });
    let steps = 0;
    while (s.phase !== 'over') { assert.ok(++steps < 30000, 'stuck'); assert.ok(advance(s).ok); if (steps % 9 === 0 && !s.stack.some(t => t.t === 'draw' && t.card)) E.auditCards(s); }
    assert.ok(s.winner !== null);
  }
});
test('every card in a line is public; the computer sees no deck but its own', () => {
  const s = game(3); line(s, 1, ['nine', 'three']); deck(s, 1, ['one', 'two']);
  const v = E.viewFor(s, 0, true); assert.deepEqual(v.pl[1].line.map(e => e.c.id), ['nine', 'three'], 'cards in a line are face up for everyone'); assert.equal(v.pl[1].deck[0].id, '?', 'other decks stay private'); assert.equal(v.pl[1].known, null);
  assert.ok(!E.newGame({ seed: 4, seats: [{ name: 'a' }, { name: 'b' }] }).pl.some(p => p.line.some(e => e.down)), 'no card is ever dealt face down');
});

test('values from 0 to 10 are valid in the data and resolve in a line', () => {
  const vals = c => c.val.kind === 'fixed' ? [c.val.v] : c.val.kind === 'flex' ? c.val.opts : c.val.kind === 'range' ? [c.val.min, c.val.max] : [];
  for (const c of D.numbers.concat(D.wild)) for (const v of vals(c)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 10, c.id + ' has value ' + v);
  const s = game(); line(s, 0, ['hi-lo', 'feather', 'ten']); assert.deepEqual(E.lineValuesFor(s, 0, [10, 0, 10]), [10, 0, 10]); assert.deepEqual(E.range(s, 0), { min: 11, max: 23 }); assert.equal(total(s, 0), 20, 'best total at 21 or less: Hi-Lo 10, Feather 0, ten 10');
});

const resultsOf = (s) => { s.phase = 'results'; s.pending = { who: null, kind: 'results', opts: [{ id: 'continue' }], prompt: '' }; ok(s, 'continue'); };
test('first to 21 points: the game ends at the end of a round where someone reaches the target; the highest total wins', () => {
  assert.equal(D.rules.WIN_POINTS, 21); assert.equal(D.rules.QUICK_WIN_POINTS, 13);
  let s = game(3); s.pl.forEach((p, i) => { p.pts = [10, 12, 5][i]; }); resultsOf(s); assert.equal(s.phase, 'draft', 'nobody at 21: the draft follows');
  s = game(3); s.pl.forEach((p, i) => { p.pts = [23, 25, 10][i]; }); resultsOf(s);
  assert.equal(s.phase, 'over'); assert.equal(s.winner, 1, 'the highest total wins even though player 0 crossed first'); assert.equal(s.market.length, 0, 'no draft after the final round'); assert.equal(s.draft, null);
  s = game(3); s.pl.forEach((p, i) => { p.pts = [20, 21, 5][i]; }); resultsOf(s); assert.equal(s.winner, 1);
  s = game(2); s.pl.forEach((p, i) => { p.pts = [14, 3][i]; }); resultsOf(s); assert.equal(s.phase, 'draft', '14 points is not 21');
  const q = E.newGame({ seed: 3, quick: true, seats: [0, 1, 2].map(i => ({ name: 'P' + i, kind: 'ai', level: 'easy' })) }); assert.equal(q.winAt, 13);
  q.stack = []; q.pl.forEach((p, i) => { p.pts = [12, 5, 5][i]; }); resultsOf(q); assert.equal(q.phase, 'draft', 'Quick Game: 12 is not enough');
  const q2 = E.newGame({ seed: 3, quick: true, seats: [0, 1, 2].map(i => ({ name: 'P' + i, kind: 'ai', level: 'easy' })) }); q2.stack = []; q2.pl.forEach((p, i) => { p.pts = [13, 5, 5][i]; }); resultsOf(q2);
  assert.equal(q2.phase, 'over'); assert.equal(q2.winner, 0, 'Quick Game ends at 13');
  assert.equal(E.newGame({ seed: 1, seats: [{ name: 'a' }, { name: 'b' }] }).winAt, 21);
});

test('a tie for the most points runs tiebreak rounds: only the tied players, no draft, no points, highest finisher wins', () => {
  let s = game(3); s.pl.forEach((p, i) => { p.pts = [22, 22, 8][i]; }); resultsOf(s);
  assert.equal(s.tiebreak, true); assert.deepEqual(s.part, [0, 1]); assert.equal(s.phase, 'play'); assert.equal(s.market.length, 0, 'no draft'); assert.equal(s.pl[2].status, 'out');
  line(s, 0, ['ten', 'nine']); line(s, 1, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; s.pending = null; E.run(s);
  assert.deepEqual(s.pl.map(p => p.pts), [22, 22, 8], 'tiebreak points are not added'); resultsOf(s); assert.equal(s.winner, 0); assert.equal(s.phase, 'over');
  s = game(3); s.pl.forEach((p, i) => { p.pts = [22, 22, 22][i]; }); resultsOf(s); assert.deepEqual(s.part, [0, 1, 2]);
  line(s, 0, ['ten', 'ten', 'five']); line(s, 1, ['ten', 'ten', 'five']); line(s, 2, ['ten', 'ten', 'five']); s.stack = [{ t: 'reveal', step: 0 }]; s.pending = null; E.run(s); resultsOf(s);
  assert.equal(s.phase, 'play', 'everyone busted: still tied, another tiebreak'); assert.deepEqual(s.part, [0, 1, 2]);
  line(s, 0, ['ten', 'nine']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); chip(s, 0, 19, 9); chip(s, 1, 19, 4); chip(s, 2, 18, 1); s.stack = [{ t: 'reveal', step: 0 }]; s.pending = null; E.run(s); resultsOf(s); s.pending = null; E.run(s); resultsOf(s);
  assert.equal(s.phase, 'over'); assert.equal(s.winner, 1, 'tied totals in a tiebreak round: the earlier arrival wins, so the game is decided');
});

test('the upgrade deck has two copies of every upgrade card (92, or 86 in a Friendly Game); two copies in a line work on their own', () => {
  assert.equal(D.rules.WILDCARD_COPIES, 2);
  const mk = fr => E.newGame({ seed: 4, friendly: fr, seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] });
  const all = s => s.wild.concat(...s.pl.map(p => p.deck.filter(c => DEF_UP.has(c.id))));
  const DEF_UP = new Set(D.wild.map(c => c.id));
  let s = mk(false); assert.equal(s.wild.length, 92); for (const c of D.wild) assert.equal(s.wild.filter(x => x.id === c.id).length, 2, c.id + ' x2');
  s = mk(true); assert.equal(s.wild.length, 86); for (const id of ['cooler', 'hit-man', 'last-call']) assert.equal(s.wild.filter(x => x.id === id).length, 0, 'Friendly removes both copies of ' + id);
  s = game(); line(s, 0, ['ten', 'nine', 'getaway-car', 'getaway-car', 'five']); s.stack = [{ t: 'bustcheck' }]; E.run(s); ok(s, 'getaway-car');
  assert.equal(s.removed.filter(c => c.id === 'getaway-car').length, 1, 'only the copy that was used leaves the game'); assert.equal(s.pl[0].line.filter(e => e.c.id === 'getaway-car').length, 1);
  s = game(); line(s, 0, ['muscle', 'muscle', 'two']); assert.ok(E.hasMuscle(s, 0)); line(s, 0, ['palm', 'palm', 'two']); assert.equal(E.canUseFree(s, 0).length, 0, 'nothing drawn yet: Palm cannot be used');
  s = game(); line(s, 0, ['two', 'second-deal', 'second-deal']); const e1 = E.entry(s, 0, 'second-deal'); E.mod(s, e1.c.u).side = true; assert.notEqual(E.entry(s, 0, 'second-deal').c.u, e1.c.u, 'a used copy does not hide the unused one');
});

test('naming: Stackjack, wildcards and number cards; no "Loaded" or "upgrade" anywhere a player can read', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(D.title, 'Stackjack'); assert.equal(D.tagline, 'Stack the deck. Hit 21.');
  const bad = x => /\bLoaded\b|\bLOADED\b/.test(x) || /upgrade/i.test(x);
  assert.ok(!bad(JSON.stringify(D)), 'the data block'); assert.ok(!bad(html), 'the page: title, tips, help, prompts, screens');
  assert.match(html, /<title>Stackjack<\/title>/); assert.ok(Array.isArray(D.wild) && D.wild.length === 46 && Array.isArray(D.numbers) && D.numbers.length === 9); assert.equal(D.rules.WILDCARD_COPIES, 2);
  assert.ok(D.numbers.every(c => c.cat === 'Number card'));
  assert.equal(D.texts.tips.welcome[1], 'Get closest to 21 without going over. Each round, the highest total scores the most points. Between rounds, draft wildcards to stack your deck. First to 21 points wins.');
  assert.equal(D.texts.tips.draft[0], 'Draft wildcards');
  const s = game(3); s.pl.forEach(p => { p.pts = 3; }); s.phase = 'results'; s.pending = { who: null, kind: 'results', opts: [{ id: 'continue' }], prompt: '' }; ok(s, 'continue');
  assert.match(s.pending.prompt, /: pick a wildcard$/);
});

test('tied round totals: the chip that arrived first ranks higher; every place is different', () => {
  const s = game(3); line(s, 0, ['ten', 'five']); line(s, 1, ['ten', 'five']); line(s, 2, ['ten', 'two']);
  chip(s, 0, 15, 8); chip(s, 1, 15, 3); chip(s, 2, 12, 1); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s);
  assert.deepEqual(s.result.rows.map(r => [r.place, r.pts]), [[2, 4], [1, 6], [3, 2]], 'player 1 got to 15 first, so places higher than player 0');
  const t2 = game(3); line(t2, 0, ['ten', 'ten']); line(t2, 1, ['ten', 'ten']); line(t2, 2, ['ten', 'ten']); t2.pl[0].load = 1; t2.pl[1].load = 1; t2.pl[2].load = 1; t2.pl[1].line.push({ c: card(t2, 'tightrope', 1), down: false, unk: false }); t2.pl[1].load = 0;
  chip(t2, 0, 21, 1); chip(t2, 1, 21, 9); chip(t2, 2, 21, 2); t2.stack = [{ t: 'reveal', step: 0 }]; E.run(t2);
  assert.deepEqual(t2.result.rows.map(r => [r.total, r.place]), [[21, 2], [21, 1], [21, 3]], 'Tightrope at exactly 21 beats earlier 21s; the others go by arrival');
});

test('arrival: a chip that leaves a space and comes back arrives again; one effect that moves several chips gives each its own number, in the order it is applied', () => {
  const s = game(3); line(s, 0, ['five']); line(s, 1, ['two']); line(s, 2, ['three']); E.trackAll(s);
  const a0 = s.pl[0].arrivedAt; assert.ok(Number.isFinite(a0)); E.trackAll(s); assert.equal(s.pl[0].arrivedAt, a0, 'nothing moved: the arrival stays');
  s.pl[0].line.push({ c: card(s, 'three', 0), down: false, unk: false }); E.trackAll(s); const a1 = s.pl[0].arrivedAt; assert.ok(a1 > a0, 'a new total is a new arrival');
  s.pl[0].line.pop(); E.trackAll(s); assert.ok(s.pl[0].arrivedAt > a1, 'back on the old space: the later arrival counts');
  const before = s.tick; line(s, 0, ['pit-boss']); s.pl[0].line[0].c.id = 'pit-boss'; fire(s, 0, 0);
  assert.ok(s.pl[1].arrivedAt >= before && s.pl[2].arrivedAt > s.pl[1].arrivedAt, 'Pit Boss: every other player takes 1 Load, in seat order, each with a different arrival number');
  const k = game(2); line(k, 0, ['ten']); line(k, 1, ['ten']); E.trackAll(k); const x0 = k.pl[0].arrivedAt; k.pl[0].load = 0; E.giveLoad(k, 0, 1, 1); assert.ok(k.pl[0].arrivedAt > x0, 'Load moves the chip');
  const hh = game(2); line(hh, 0, ['two', 'three']); line(hh, 1, ['two']); deck(hh, 0, ['six']); hh.stack = [{ t: 'turn', step: 0 }]; E.run(hh); const b0 = hh.pl[0].arrivedAt; E.act(hh, 0, 'hit'); assert.ok(hh.pl[0].arrivedAt > b0, 'a hit moves the chip');
});
