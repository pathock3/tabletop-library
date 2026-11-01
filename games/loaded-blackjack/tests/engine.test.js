const test = require('node:test');
const assert = require('node:assert/strict');
const { GAME_DATA: D, Engine: E, AI } = require('./load');

// The starting deck stops at 7, so the tests that need bigger numbers use these test-only cards (they are never dealt).
for (const [id, v] of [['eight', 8], ['nine', 9], ['ten', 10]]) E.DEF[id] = { id, name: String(v), val: { kind: 'fixed', v }, cat: 'Starting', trig: 'none', text: '' };

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
const uOf = (s, p, id) => s.pl[p].line.find(e => e.c.id === id).c.u;

test('the data: 14 starting cards (two each of 1 to 7), 50 upgrade cards, no suits and no Ace', () => {
  assert.deepEqual(D.starting.map(c => c.id), ['one', 'two', 'three', 'four', 'five', 'six', 'seven']); assert.ok(D.starting.every((c, k) => c.copies === 2 && c.val.kind === 'fixed' && c.val.v === k + 1 && c.trig === 'none'));
  const g = game(2); assert.equal(g.pl[0].deck.length + g.pl[0].line.length, 14, 'setup gives each player 14 cards'); assert.deepEqual(Object.values(g.cards).filter(c => c.o === 0 && D.starting.some(d => d.id === c.id)).map(c => c.id).sort(), ['five', 'five', 'four', 'four', 'one', 'one', 'seven', 'seven', 'six', 'six', 'three', 'three', 'two', 'two']);
  const all = D.starting.concat(D.upgrades); assert.ok(!all.some(c => 'suit' in c || c.id === 'ace' || (c.name || '') === 'Ace'), 'no card has a suit, and there is no Ace');
  assert.ok(!/[♠♥♣♦]|\bAces?\b|\bsuits?\b/i.test(JSON.stringify(D)), 'no suit or Ace anywhere in the game data');
  const html = require('fs').readFileSync(require('./load').FILE, 'utf8'); assert.ok(!/[♠♥♣♦]/.test(html), 'no suit symbols in the game file'); assert.ok(!/\bAces?\b/.test(html.replace(/there is no Ace/g, '')), 'no Ace in the game file');
  assert.equal(D.upgrades.length, 50); assert.deepEqual(D.upgrades.find(c => c.id === 'hi-lo').val, { kind: 'flex', opts: [1, 7] }); assert.equal(D.upgrades.find(c => c.id === 'hit-man').val.v, 7);
  assert.deepEqual(D.upgrades.filter(c => c.mean).map(c => c.id).sort(), ['cooler', 'hand-mucker', 'hit-man', 'last-call']);
  for (const c of D.upgrades) { assert.ok(c.ai >= 1 && c.ai <= 5, c.id); assert.ok(c.name && c.cat && c.trig, c.id); }
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
  const s = game(); line(s, 0, ['hi-lo', 'ten']); assert.deepEqual(E.range(s, 0), { min: 11, max: 17 }); assert.equal(total(s, 0), 17, 'Hi-Lo counts as 1 or 7');
  line(s, 0, ['hi-lo', 'hi-lo', 'ten', 'seven']); assert.equal(E.minTotal(s, 0), 19); assert.equal(total(s, 0), 19, '1+1+10+7; any 7 for a Hi-Lo is over 21');
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

test('turns: a lap of passes ends the round; a hit resets the count; Getaway passes by itself', () => {
  const s = game(3); line(s, 0, ['two', 'three']); line(s, 1, ['two', 'four']); line(s, 2, ['two', 'five']); for (const p of [0, 1, 2]) deck(s, p, ['six', 'seven', 'eight']);
  s.stack = [{ t: 'turn', step: 0 }]; E.run(s);
  assert.equal(pend(s), 'turn'); ok(s, 'pass'); ok(s, 'pass'); assert.equal(s.consec, 2); ok(s, 'hit'); assert.equal(s.consec, 0, 'a hit resets the count');
  assert.equal(s.pl[2].last, 'hit'); ok(s, 'pass'); ok(s, 'pass'); ok(s, 'pass'); assert.equal(pend(s), 'results', 'one full lap with no hits: reveal and score');
});

test('scoring: every row of the examples table, plus Tightrope, Side Bet, Run and Sandbag', () => {
  const score = (totals, mk) => {
    const n = totals.length, s = game(n); s.mod = {};
    totals.forEach((t, p) => { s.pl[p].load = 0; line(s, p, t === 'bust' ? ['ten', 'ten', 'five'] : ['ten']); if (t !== 'bust') s.pl[p].load = t - 10; if (mk) mk(s, p, t); });
    s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); return s;
  };
  const pts = s => s.result.rows.map(r => r.pts);
  assert.deepEqual(pts(score([21, 20, 18, 17, 15])), [5, 4, 3, 2, 1]);
  assert.deepEqual(pts(score([20, 20, 18, 'bust', 'bust'])), [5, 5, 3, 1, 1], 'ties share the higher place and the next is skipped; every bust scores 1');
  assert.deepEqual(pts(score([14, 'bust', 'bust', 'bust', 'bust'])), [5, 1, 1, 1, 1]);
  assert.deepEqual(pts(score(['bust', 'bust', 'bust'])), [1, 1, 1]);
  let s = score([21, 21, 19], (st, p) => { if (p === 1) st.pl[1].line.push({ c: card(st, 'tightrope', 1), down: false, unk: false }); if (p === 1) { st.pl[1].load = 10; st.pl[1].line.pop(); st.pl[1].line.push({ c: card(st, 'tightrope', 1), down: false, unk: false }); st.pl[1].load = 10; } });
  s = game(3); line(s, 0, ['ten', 'ten', 'one'].slice(0, 2).concat([])); s.pl[0].load = 1; line(s, 1, ['ten', 'ten']); s.pl[1].line.push({ c: card(s, 'tightrope', 1), down: false, unk: false }); line(s, 2, ['ten', 'nine']);
  s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.deepEqual(s.result.rows.map(r => [r.total, r.place, r.pts]), [[21, 2, 2], [21, 1, 3], [19, 3, 1]], 'Tightrope ranks above the other 21');
  s = game(3); line(s, 0, ['ten', 'ten', 'five', 'side-bet']); line(s, 1, ['ten', 'ten', 'five']); line(s, 2, ['ten', 'nine']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s);
  assert.deepEqual(s.result.rows.map(r => r.pts), [2, 1, 3], 'Side Bet: 2 instead of 1 when another player also busted');
  s = game(3); line(s, 0, ['ten', 'ten', 'five', 'side-bet']); line(s, 1, ['nine', 'nine']); line(s, 2, ['ten', 'nine']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s);
  assert.equal(s.result.rows[0].pts, 1, 'Side Bet needs another bust');
  s = game(3); line(s, 0, ['three', 'four', 'five', 'six', 'run']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(s.pl[0].prio, 'Run: four consecutive values');
  s = game(3); line(s, 0, ['five', 'six', 'seven', 'run']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(!s.pl[0].prio, 'Run: three consecutive (5-6-7, and the Run card itself is a 3) is not enough');
  s = game(3); line(s, 0, ['two', 'sandbag']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(s.pl[0].prio, 'Sandbag: finished last without busting');
  s = game(3); s.tiebreak = true; line(s, 0, ['two', 'sandbag']); line(s, 1, ['ten', 'nine']); line(s, 2, ['ten', 'eight']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.ok(!s.pl[0].prio, 'no draft in a tiebreak round');
});

test('the draft: priority first, then fewest points; ties are random but repeatable; cards join the owner; the rest leave the game', () => {
  const s = game(4, 5); s.pl.forEach((p, i) => { p.pts = [5, 2, 2, 7][i]; p.prio = false; }); s.pl[3].prio = true;
  s.stack = []; s.pending = null;
  const before = s.upgrade.length;
  s.phase = 'results'; E.answer; s.pending = { who: null, kind: 'results', opts: [{ id: 'continue' }], prompt: '' }; ok(s, 'continue');
  assert.equal(s.phase, 'draft'); assert.equal(s.market.length, 8, '2 cards per player'); assert.equal(s.upgrade.length, before - 8);
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
  const run = seed => { const s = E.newGame({ seed, seats: [0, 1, 2].map(i => ({ name: 'P' + i, kind: 'ai', level: ['easy', 'medium', 'hard'][i] })) }); let n = 0; while (s.phase !== 'over' && n++ < 20000) { const pd = s.pending; E.answer(s, pd.kind === 'results' ? 'continue' : AI.answer(s, pd.who)); } return s.log.map(l => l.t).join('|') + s.pl.map(p => p.pts); };
  assert.equal(run(42), run(42)); assert.notEqual(run(42), run(43));
});

// ---------- one test per upgrade card ----------
test('Control cards: Two-Faced, Sleeve Card, Feather, Hi-Lo, Dealer\'s Choice, Mechanic, Ringer', () => {
  const s = game(); const t = (ids, want) => { line(s, 0, ids); assert.equal(total(s, 0), want, ids.join()); };
  t(['two-faced', 'nine', 'ten'], 21); t(['sleeve-card', 'ten', 'ten'], 21); t(['feather', 'ten', 'ten'], 20); t(['hi-lo', 'ten'], 17); t(['dealers-choice', 'ten', 'nine'], 21); t(['mechanic', 'nine', 'nine'], 21); t(['ten', 'ringer'], 20); t(['ringer', 'ten'], 11);
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
  s = game(); line(s, 0, ['card-counter', 'two']); deck(s, 0, ['nine', 'three']); fire(s, 0, 0); assert.equal(s.pending.show.length, 2); ok(s, 'ok'); assert.deepEqual(s.pl[0].deck.map(c => c.id), ['nine', 'three']);
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
  s = game(3); line(s, 0, ['heat', 'two']); line(s, 1, ['two']); line(s, 2, ['three']); s.pl[1].last = 'pass'; fire(s, 0, 0); assert.equal(s.pl[1].load, 1, 'only a player who passed (one target: no question)'); assert.equal(s.pl[2].load, 0);
  s = game(3); line(s, 0, ['squeeze']); line(s, 1, ['two', 'two', 'two', 'two', 'two']); line(s, 2, ['three', 'three', 'three', 'three']); fire(s, 0, 0); assert.equal(s.pl[1].load, 2, '5 or more cards'); assert.equal(s.pl[2].load, 0, '4 cards is not enough');
  s = game(3); line(s, 0, ['pit-boss']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); assert.deepEqual([s.pl[1].load, s.pl[2].load], [1, 1]);
  s = game(3); line(s, 0, ['cooler']); line(s, 1, ['two']); line(s, 2, ['three']); deck(s, 1, ['six']); fire(s, 0, 0); ok(s, 'p1'); assert.equal(ids(s, 1).pop(), 'six'); assert.equal(s.pl[1].last, 'hit');
  s = game(3); line(s, 0, ['hit-man']); line(s, 1, ['two']); line(s, 2, ['three']); deck(s, 1, ['six']); deck(s, 2, ['seven']); s.pl[1].last = 'pass'; s.pl[2].last = 'pass'; fire(s, 0, 0); assert.equal(ids(s, 1).pop(), 'six'); assert.equal(ids(s, 2).pop(), 'seven');
  s = game(3); line(s, 0, ['two', 'plant']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 1); ok(s, 'p2'); assert.equal(ids(s, 2).pop(), 'plant'); assert.equal(ids(s, 0).length, 1);
  s = game(2); line(s, 0, ['two', 'last-call']); line(s, 1, ['three']); s.stack = [{ t: 'reveal', step: 0 }]; E.run(s); assert.equal(s.pl[1].load, 1, 'Last Call at reveal');
});
test('Info cards: Spotter, Snitch, Tell, Hand Mucker', () => {
  let s = game(2); line(s, 0, ['two', 'spotter'], 1); line(s, 1, ['nine', 'three'], 1); fire(s, 0, 1); assert.equal(pend(s), 'ack'); assert.equal(s.cards[s.pl[0].known.hidden[1]].id, 'nine'); ok(s, 'ok');
  s = game(2); line(s, 0, ['two', 'snitch']); line(s, 1, ['nine', 'three'], 1); fire(s, 0, 1); assert.equal(at(s, 1, 0).down, false);
  s = game(2); line(s, 0, ['two', 'tell']); line(s, 1, ['ten', 'seven']); fire(s, 0, 1); ok(s, 'p1'); assert.equal(s.pl[0].known.tell[0].over, true); assert.equal(pend(s), 'ack'); ok(s, 'ok');
  s = game(2); line(s, 0, ['hand-mucker', 'two'], 1); at(s, 0, 0).down = false; at(s, 0, 1).down = true; line(s, 1, ['nine', 'three'], 1); const a = at(s, 0, 1).c, b = at(s, 1, 0).c; fire(s, 0, 0); assert.equal(at(s, 0, 1).c, b); assert.equal(at(s, 1, 0).c, a); assert.ok(at(s, 0, 1).unk && at(s, 1, 0).unk);
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
  s = game(2); line(s, 0, ['double-down', 'two']); line(s, 1, ['three']); deck(s, 0, ['four', 'five']); s.stack = [{ t: 'turn', step: 0 }]; E.run(s); ok(s, 'double'); assert.deepEqual(ids(s, 0).slice(-2), ['four', 'five']); assert.equal(s.pl[1].load, 1);
  s = game(3); line(s, 0, ['two', 'two', 'two', 'two', 'two', 'hot-streak']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 5); assert.deepEqual([s.pl[1].load, s.pl[2].load], [1, 1], '6 cards counting Hot Streak itself');
  s = game(3); line(s, 0, ['two', 'two', 'two', 'two', 'hot-streak']); line(s, 1, ['two']); fire(s, 0, 4); assert.equal(s.pl[1].load, 0, '5 cards is not enough');
});
test('Line cards: Headcount, Shave Job, Sleight, Chain Gang, Run', () => {
  let s = game(3); line(s, 0, ['sleight', 'two', 'ten']); fire(s, 0, 0); ok(s, 'c' + at(s, 0, 2).c.u); ok(s, 'i0'); assert.equal(ids(s, 0)[0], 'ten');
  s = game(3); line(s, 0, ['chain-gang', 'two', 'one', 'cold-deck', 'ten']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); ok(s, 'p1'); ok(s, 'p2'); assert.equal(s.pl[1].load + s.pl[2].load, 2, 'for each other 1: a starting 1 and a value-1 upgrade (Cold Deck), not the 2');
  s = game(3); line(s, 0, ['chain-gang', 'two', 'ten']); line(s, 1, ['two']); fire(s, 0, 0); assert.equal(s.pl[1].load, 0, 'no other 1: nothing');
});
test('Catch-up cards: Long Shot', () => {
  const s = game(3); s.pl[0].pts = 1; s.pl[1].pts = 5; s.pl[2].pts = 3; line(s, 0, ['long-shot']); line(s, 1, ['two']); line(s, 2, ['three']); fire(s, 0, 0); assert.equal(s.pl[1].load, 2, '2 Load to the leader');
  const t = game(3); line(t, 0, ['long-shot']); line(t, 1, ['two']); line(t, 2, ['three']); fire(t, 0, 0); assert.equal(t.pl[1].load + t.pl[2].load, 0, 'round 1: nothing');
});
test('the simulation: random all-AI games finish, cards stay put, Load never goes negative', () => {
  for (const n of [2, 3, 4, 5, 6]) for (let k = 1; k <= 8; k++) {
    const s = E.newGame({ seed: k * 11 + n, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'ai', level: ['easy', 'medium', 'hard'][i % 3] })) });
    let steps = 0;
    while (s.phase !== 'over') { assert.ok(++steps < 20000 && s.pending, 'stuck'); const pd = s.pending; assert.ok(E.answer(s, pd.kind === 'results' ? 'continue' : AI.answer(s, pd.who)).ok); if (steps % 9 === 0 && !s.stack.some(t => t.t === 'draw' && t.card)) E.auditCards(s); }
    assert.ok(s.winner !== null);
  }
});
test('the computer never sees hidden cards: a view hides other players\' hidden cards and decks', () => {
  const s = game(3); line(s, 1, ['nine', 'three'], 1); deck(s, 1, ['one', 'two']);
  const v = E.viewFor(s, 0, true); assert.equal(v.pl[1].line[0].c.id, '?'); assert.equal(v.pl[1].deck[0].id, '?'); assert.equal(v.pl[1].known, null);
  s.showAll = true; assert.equal(E.viewFor(s, 0, true).pl[1].line[0].c.id, '?', 'even with Show all hidden info on, an AI does not cheat'); assert.equal(E.viewFor(s, 0, false).pl[1].line[0].c.id, 'nine');
});
