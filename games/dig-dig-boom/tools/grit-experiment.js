'use strict';
// Dig Dig BOOM! v2.7.1 — Grit balance experiment.
//
// A purpose-built model of the v2.7.1 battle system (free roll, upright numbered cards fire one at a
// time, Extra Rolls, Grit before/after the roll, damage markers) played through a whole Dig with the
// v2.7.1 card list. It is NOT the app engine (Grit isn't built yet); it only models the cards that
// touch Grit, hearts, Extra Rolls, rolls and markers. Consumables and card-moving Immediates count as
// blank cards in the Mine. Run:  node tools/grit-experiment.js [digsPerCell]
//
// Policies are decision-theoretic: the player looks ahead over all ten die faces and picks the option
// with the best "myopic value" (hearts kept + w_e·Extra Rolls + w_g·Grit saved; BOOM = -50).

const fs = require('fs');
const path = require('path');

// ---------- cards ----------
function loadCards() {
  const rows = fs.readFileSync(path.join(__dirname, 'cards-v271.psv'), 'utf8').trim().split('\n').map(l => l.split('|'));
  const head = rows.shift();
  return rows.map(r => ({ id: r[0], name: r[1], type: r[2], number: r[3] === '' ? null : +r[3], deck: r[4], count: +r[5], text: r[6], cantStart: r[7] === 'Yes' }));
}
const CARDS = loadCards();
const BOOSTERS = CARDS.filter(c => c.deck === 'Booster');

// ---------- rng ----------
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- rules (the knobs under test) ----------
const BASE = { heartMax: 10, extraMax: 5, gritMax: 6, preRate: 1, postRate: 3, startHeart: 10, startExtra: 0, startGrit: 0, wE: 0.9, wG: 0.5, boomValue: -50 };
const SCRATCH = {};

// ---------- state ----------
const has = (S, k) => S.fx[k] > 0;
function cloneS(S) {
  const c = Object.assign({}, S);
  c.play = S.play.map(p => Object.assign({}, p));
  c.fx = Object.assign({}, S.fx);
  c.stats = SCRATCH; c.dieFn = S.lookRng; c.probe = true;
  return c;
}
function gain(S, res, n) {
  if (n <= 0) return;
  if (res === 'grit') {
    if (has(S, 'pepHorn')) n += 1;
    if (S.R.delay && S.inBattle) { S.pending = (S.pending || 0) + n; S.stats.gritGained = (S.stats.gritGained || 0) + n; return; }
    const room = S.R.gritMax - S.grit, got = Math.min(room, n);
    S.grit += got; S.stats.gritGained = (S.stats.gritGained || 0) + got; S.stats.gritWasted = (S.stats.gritWasted || 0) + (n - got);
  } else if (res === 'extra') {
    if (has(S, 'diceBag')) n += 1;
    S.extra = Math.min(S.R.extraMax, S.extra + n);
  } else if (res === 'heart') {
    if (has(S, 'nurseBot')) n += 2;
    S.heart = Math.min(S.R.heartMax, S.heart + n);
    if (has(S, 'adrPump')) gain(S, 'grit', 1);
  }
}
function lose(S, n) { S.heart -= n; if (S.heart <= 0) S.dead = true; }

// ---------- card effects ----------
// fire(S,B,card): numbered Ongoing effect. dug(S): "when dug". Anything not listed is inert here.
const FX = {
  'ON-02': { fire: (S) => { lose(S, 1); if (!S.dead) gain(S, 'grit', 2); } },
  'ON-03': { fire: (S, B) => { B.duck = true; } },
  'ON-04': { fire: (S) => gain(S, 'grit', 1) },
  'ON-05': { fire: (S) => { if (S.heart <= 5) gain(S, 'extra', 1); } },
  'ON-06': { fire: (S) => gain(S, 'heart', 1) },
  'ON-07': { fire: (S, B, c) => { gain(S, 'grit', 2); c.pendingUp = 2; } },
  'ON-08': { fire: (S) => { gain(S, 'grit', 1); gain(S, 'heart', 1); } },
  'ON-09': { fire: (S, B) => { B.markers += 1; } },
  'ON-10': { fire: (S) => gain(S, 'heart', 3) },
  'ON-11': { fire: (S) => gain(S, 'grit', 2) },
  'ON-12': { fire: (S, B) => { B.conga = true; } },
  'ON-13': { fire: (S, B) => { B.markers += 2; } },
  'ON-14': { fire: (S) => { gain(S, 'grit', 1); gain(S, 'heart', 1); } },
  'ON-15': { fire: (S, B) => { B.cricket = true; } },
  'ON-16': { fire: (S, B) => { B.halve = true; } },
  'ON-17': { fire: (S) => gain(S, 'extra', 1) },
  'ON-18': { fire: (S) => gain(S, 'extra', 1), dug: (S) => gain(S, 'grit', 2) },
  'ON-19': { fire: (S) => { if (S.heart <= 3) gain(S, 'heart', 5); } },
  'ON-20': { fire: (S) => gain(S, 'heart', 2) },
  'ON-21': { fire: (S, B) => { B.markers += 3; } },
  'ON-22': { fire: (S, B) => { const v = rollValue(S, B, S.dieFn(), 0, false); if (v >= 6) B.defeated = true; if (v > B.best) B.best = v; } },
  'ON-24': { fire: (S) => gain(S, 'grit', 2), dug: (S) => gain(S, 'grit', 1) },
  'ON-25': { fire: (S) => gain(S, 'extra', 1), dug: (S) => gain(S, 'grit', 1) },
  'ON-26': { fire: (S) => gain(S, 'extra', 2) },
  'ON-27': { fire: (S, B) => gain(S, 'heart', Math.floor(B.best / 2)) },
  'ON-28': { fire: (S) => gain(S, 'heart', 5) },
  'ON-29': { fire: (S) => gain(S, 'grit', 3) },
  'ON-30': { fire: (S) => { gain(S, 'extra', 1); gain(S, 'grit', 1); gain(S, 'heart', 2); } },
  'ON-31': { fire: (S) => gain(S, 'extra', 2) },
  'ON-32': { fire: (S, B) => gain(S, 'heart', B.dmg) },
  PET: { fire: (S, B) => { B.defeated = true; B.pet = true; } },
};
// passive / reactive flags: card id -> flag name
const FLAG = { 'ON-33': 'adrPump', 'ON-34': 'applause', 'ON-37': 'bumper', 'ON-41': 'crumple', 'ON-42': 'siren', 'ON-43': 'depth', 'ON-44': 'diceBag', 'ON-46': 'drone', 'ON-47': 'dynamo',
  'ON-48': 'floorJack', 'ON-50': 'giantSlayer', 'ON-51': 'caddy', 'ON-52': 'jerky', 'ON-53': 'scope', 'ON-54': 'nurseBot', 'ON-56': 'patchKit', 'ON-57': 'pepHorn', 'ON-59': 'rageValve',
  'ON-60': 'redline', 'ON-61': 'salvage', 'ON-63': 'stubborn', 'ON-65': 'trophy', 'ON-66': 'tuneUp', 'ON-67': 'bell', 'ON-69': 'wreckingBall', 'ON-58': 'petWhistle', 'ON-39': 'confetti', 'ON-45': 'disco' };
const DUG = { 'ON-47': (S) => gain(S, 'grit', 2), 'ON-44': (S) => gain(S, 'extra', 1) };
const IMM = {
  'IM-02': (S) => gain(S, 'grit', 2), 'IM-07': (S, top) => gain(S, 'heart', 2 * top.slice(0, 5).filter(c => c.type === 'Monster').length),
  'IM-08': (S) => { gain(S, 'grit', 2); gain(S, 'heart', 3); }, 'IM-09': (S) => gain(S, 'grit', 4), 'IM-10': (S) => gain(S, 'extra', 2),
  'IM-11': (S) => { gain(S, 'grit', 1); gain(S, 'extra', 1); gain(S, 'heart', 2); }, 'IM-12': (S) => gain(S, 'heart', 5), 'IM-13': (S) => gain(S, 'heart', 3),
  'IM-14': (S) => gain(S, 'grit', 2), 'IM-15': (S) => gain(S, 'extra', 1), 'IM-17': (S) => gain(S, 'heart', 2 * S.play.filter(c => c.type === 'Ongoing').length),
  'IM-18': (S) => { S.petTreat = true; }, 'IM-19': (S) => gain(S, 'grit', 2), 'IM-20': (S) => gain(S, 'extra', S.survived), 'IM-21': (S) => { S.heart = 8; },
  'IM-23': (S) => { lose(S, 1); if (!S.dead) gain(S, 'extra', 2); }, 'IM-24': (S) => gain(S, 'grit', 2), 'IM-26': (S) => gain(S, 'heart', S.discImm + 1),
  'IM-27': (S) => gain(S, 'heart', S.survived), 'IM-29': (S) => { gain(S, 'extra', 1); gain(S, 'grit', 1); }, 'IM-32': (S) => gain(S, 'grit', S.play.filter(c => c.type === 'Ongoing').length),
  'IM-35': (S) => { S.nextBonus += 2; },
};

// ---------- rolls ----------
function bonusFor(S, B) {
  let m = 0;
  if (has(S, 'tuneUp')) m += 1;
  if (has(S, 'depth')) m += Math.floor(S.survived / 3);
  if (has(S, 'giantSlayer') && B.dmg >= 6) m += 3;
  if (has(S, 'scope') && B.dmg >= 5) m += 2;
  if (has(S, 'redline') && S.heart <= 3) m += 2;
  return m;
}
function rollValue(S, B, die, boost, first) {
  let v = die + boost + bonusFor(S, B);
  if (first && B.bonus) { v += B.bonus; B.bonus = 0; }
  if (has(S, 'floorJack') && v < 4) v = 4;
  if (has(S, 'wreckingBall') && S.firstMonster && B.dmgIsFirst) v *= 2;
  return v;
}
function upright(S, B) { const lim = B.best; return S.play.filter(c => c.num != null && !c.tapped && c.num <= lim).sort((a, b) => a.num - b.num)[0]; }
function chain(S, B) {
  for (;;) {
    const c = upright(S, B); if (!c || S.dead) return;
    c.tapped = true; B.fired++; B.firedIds.push(c.id);
    const f = FX[c.fx]; if (f && f.fire) f.fire(S, B, c);
    if (c.pendingUp) { c.num = Math.min(10, c.num + c.pendingUp); c.pendingUp = 0; }
  }
}
// spend grit before a roll; returns the roll boost
function preSpend(S, B, k) {
  if (k <= 0) return 0;
  S.grit -= k; B.spent += k; B.spentPre += k; B.rollSpent += k;
  let boost = k * S.R.preRate;
  if (has(S, 'drone')) boost += 1;
  if (has(S, 'caddy') && k >= 3) gain(S, 'grit', 1);
  return boost;
}
function doRoll(S, B, die, boost) {
  B.rolls++;
  const v = rollValue(S, B, die, boost, B.rolls === 1);
  if (v > B.best) { B.best = v; chain(S, B); }
  B.lastDie = die; B.lastValue = v;
}
function endValue(S, B) {
  const c = cloneS(S); const cb = Object.assign({}, B); cb.firedIds = B.firedIds.slice();
  finish(c, cb);
  if (c.dead) return S.R.boomValue;
  return c.heart + S.R.wE * c.extra + S.R.wG * Math.min(S.R.gritMax, c.grit + (c.pending || 0));
}
function finish(S, B) {
  if (B.duck && B.fired === 1) gain(S, 'extra', 1);
  if (B.conga) gain(S, 'grit', B.fired - 1);
  if (has(S, 'applause') && B.fired >= 3) gain(S, 'extra', 2);
  let dmg = B.defeated ? 0 : Math.max(0, (B.halve ? Math.floor(B.dmg / 2) : B.dmg) - B.markers);
  if (dmg > 0) {
    if (dmg >= S.heart && B.cricket) { S.heart = 1; dmg = 0; B.cricketSaved = true; }
    else {
      lose(S, dmg);
      if (!S.dead) {
        if (has(S, 'patchKit')) gain(S, 'heart', 1);
        if (has(S, 'stubborn')) gain(S, 'grit', 1);
        if (has(S, 'rageValve') && dmg >= 3) gain(S, 'grit', 2);
        if (has(S, 'crumple') && dmg >= 4) gain(S, 'extra', 2);
      }
    }
  }
  B.taken = dmg;
  if (!S.dead && B.defeated) {
    if (has(S, 'jerky')) gain(S, 'heart', 3);
    if (has(S, 'salvage')) { gain(S, 'grit', 1); gain(S, 'heart', 1); }
    if (has(S, 'trophy')) gain(S, 'grit', 2);
    if (has(S, 'bell')) gain(S, 'extra', 1);
  }
}

// ---------- decisions ----------
// After a roll's chain has settled: best of end / spend grit after / use an Extra Roll.
function bestAction(S, B, P, extraDepth) {
  let best = { kind: 'end', value: endValue(S, B) };
  const rate = S.R.postRate;
  if (P.post !== 'off' && maxSpend(S, B) >= rate && !S.dead) {
    const base = best.value, boomNow = base <= S.R.boomValue;
    for (let j = 1; j <= Math.floor(maxSpend(S, B) / rate); j++) {
      const c = cloneS(S), cb = Object.assign({}, B); cb.firedIds = B.firedIds.slice();
      c.grit -= j * rate; cb.rollSpent += j * rate;
      if (has(c, 'caddy') && cb.rollSpent >= 3 && B.rollSpent < 3) gain(c, 'grit', 1);
      cb.best += j; const before = cb.fired; chain(c, cb);
      const v = c.dead ? S.R.boomValue : endValue(c, cb);
      if (P.post === 'boom') { if (boomNow && v > S.R.boomValue) { best = { kind: 'post', j, value: v, boom: true }; break; } continue; }
      if (v > best.value + 1e-9) best = { kind: 'post', j, value: v, boom: boomNow, thresh: cb.fired > before };
    }
  }
  if (S.extra > 0 && extraDepth > 0 && !S.dead) {
    let tot = 0;
    for (let d = 1; d <= 10; d++) {
      const c = cloneS(S), cb = Object.assign({}, B); cb.firedIds = B.firedIds.slice();
      c.extra--; cb.rollSpent = 0; doRoll(c, cb, d, 0);
      tot += c.dead ? S.R.boomValue : bestAction(c, cb, P, extraDepth - 1).value;
    }
    const v = tot / 10 - 0.0;
    if (v > best.value + 1e-9) best = { kind: 'extra', value: v };
  }
  return best;
}
function maxSpend(S, B) { return Math.max(0, Math.min(S.grit, (S.R.battleLimit || 99) - B.spent)); }
function chooseK(S, B, P) {
  const top = Math.min(maxSpend(S, B), S.R.preLimit || 99);
  if (P.pre === 'off' || top <= 0) return 0;
  if (P.pre === 'all') return top;
  let bestK = 0, bestV = -1e9;
  for (let k = 0; k <= top; k++) {
    let tot = 0;
    for (let d = 1; d <= 10; d++) {
      const c = cloneS(S), cb = Object.assign({}, B); cb.firedIds = B.firedIds.slice();
      const boost = preSpend(c, cb, k); doRoll(c, cb, d, boost);
      tot += c.dead ? S.R.boomValue : bestAction(c, cb, P, 1).value;
    }
    const v = tot / 10;
    if (v > bestV + 1e-9) { bestV = v; bestK = k; }
  }
  return bestK;
}

// ---------- a battle ----------
function runBattle(S, dmg, P, nth) {
  const B = { dmg, markers: 0, defeated: false, best: 0, fired: 0, firedIds: [], rolls: 0, spent: 0, spentPre: 0, spentPost: 0, rollSpent: 0, bonus: S.nextBonus, dmgIsFirst: S.survived === 0 };
  S.nextBonus = 0;
  if (has(S, 'bumper')) B.markers += 1;
  if (has(S, 'siren') && dmg >= 6) gain(S, 'grit', 2);
  const pet = S.play.find(c => c.fx === 'PET');
  if (S.petTreat) { pet.num = Math.min(pet.num, 7); }
  const gBefore = S.stats.gritGained || 0;
  S.dieFn = () => 1 + Math.floor(S.rng() * 10);
  S.inBattle = true; S.pending = 0;
  const k = chooseK(S, B, P);
  doRoll(S, B, S.dieFn(), preSpend(S, B, k));
  for (let guard = 0; guard < 40 && !S.dead; guard++) {
    const a = bestAction(S, B, P, 1);
    if (a.kind === 'end') break;
    if (a.kind === 'post') {
      S.grit -= a.j * S.R.postRate; B.spent += a.j * S.R.postRate; B.spentPost += a.j * S.R.postRate; B.rollSpent += a.j * S.R.postRate;
      if (has(S, 'caddy') && B.rollSpent >= 3 && B.rollSpent - a.j * S.R.postRate < 3) gain(S, 'grit', 1);
      B.best += a.j; chain(S, B);
      S.stats.postEvents = (S.stats.postEvents || 0) + 1;
      if (a.boom) S.stats.postBoom = (S.stats.postBoom || 0) + 1; else if (a.thresh) S.stats.postThresh = (S.stats.postThresh || 0) + 1; else S.stats.postOther = (S.stats.postOther || 0) + 1;
    } else {
      S.extra--; B.rollSpent = 0; S.stats.extraUsed = (S.stats.extraUsed || 0) + 1;
      const k2 = chooseK(S, B, P);
      doRoll(S, B, S.dieFn(), preSpend(S, B, k2));
    }
  }
  if (!S.dead) finish(S, B);
  S.inBattle = false; S.grit = Math.min(S.R.gritMax, S.grit + (S.pending || 0)); S.pending = 0;
  S.stats.battles = (S.stats.battles || 0) + 1;
  S.stats.spentPre = (S.stats.spentPre || 0) + B.spentPre; S.stats.spentPost = (S.stats.spentPost || 0) + B.spentPost;
  if (B.spent > 0) {
    S.stats.spendBattles = (S.stats.spendBattles || 0) + 1;
    const regained = (S.stats.gritGained || 0) - gBefore;
    S.stats.regainedOnSpend = (S.stats.regainedOnSpend || 0) + regained;
    S.stats.spentOnSpend = (S.stats.spentOnSpend || 0) + B.spent;
    if (B.spent >= 3 && regained >= B.spent) S.stats.loopBattles = (S.stats.loopBattles || 0) + 1;
    if (B.spent >= 3) S.stats.bigSpendBattles = (S.stats.bigSpendBattles || 0) + 1;
  }
  if (B.pet) S.stats.petWins = (S.stats.petWins || 0) + 1;
  if (S.dead) S.stats.booms = (S.stats.booms || 0) + 1;
  S.play.forEach(c => { c.tapped = false; });
  S.petTreat = false; if (pet) pet.num = pet.base;
  return B;
}

// ---------- a Dig ----------
function newPlayCard(c) { return { id: c.id, fx: c.id, type: c.type, num: c.number, base: c.number, tapped: false }; }
function playDig(coll, kitSize, seed, R, P, startOpts) {
  const r = mulberry(seed);
  const S = { R, heart: R.startHeart, extra: R.startExtra, grit: R.startGrit, play: [], fx: {}, survived: 0, discImm: 0, nextBonus: 0, dead: false, stats: {}, rng: mulberry(seed ^ 0x9e3779b9), lookRng: (() => { const lr = mulberry(12345); return () => 1 + Math.floor(lr() * 10); })(), petTreat: false, firstMonster: true };
  S.dieFn = () => 1 + Math.floor(S.rng() * 10);
  const pet = { id: 'ON-01', fx: 'PET', type: 'Ongoing', num: 9, base: 9, tapped: false }; S.play.push(pet);
  // mine
  const chains = [[1, 3, 5, 7], [2, 4, 6], [3, 5]];
  const mineBase = [];
  for (let i = 0; i < 21; i++) mineBase.push({ type: 'Geode' });
  let tags = []; chains.forEach((ch, ci) => ch.forEach(() => tags.push(ci)));
  tags.forEach(ci => mineBase.push({ type: 'Monster', chain: ci }));
  const collection = coll.slice();
  const eligible = collection.filter(c => !c.cantStart);
  shuffle(eligible, r);
  const kit = eligible.slice(0, kitSize);
  const rest = collection.filter(c => kit.indexOf(c) < 0);
  const mine = shuffle(mineBase.concat(rest), r);
  shuffle(kit, r);
  const deck = kit.concat(mine);
  const chainPos = [0, 0, 0];
  let monsters = 0;
  for (let i = 0; i < deck.length && !S.dead; i++) {
    const c = deck[i];
    if (c.type === 'Monster') {
      const d = chains[c.chain][chainPos[c.chain]++];
      runBattle(S, d, startOpts, monsters); monsters++;
      if (!S.dead) { S.survived++; S.firstMonster = false; }
    } else if (c.type === 'Ongoing') {
      const pc = newPlayCard(c); S.play.push(pc);
      if (FLAG[c.id]) S.fx[FLAG[c.id]] = (S.fx[FLAG[c.id]] || 0) + 1;
      if (c.id === 'ON-58') { pet.num = 8; pet.base = 8; }
      if (DUG[c.id]) DUG[c.id](S); if (FX[c.id] && FX[c.id].dug) FX[c.id].dug(S);
      if (has(S, 'confetti') && false) gain(S, 'grit', 1);
    } else if (c.type === 'Immediate') {
      if (has(S, 'confetti')) gain(S, 'grit', 1);
      if (has(S, 'disco')) gain(S, 'heart', 2);
      const f = IMM[c.id]; if (f) f(S, deck.slice(i + 1));
      S.discImm++;
    }
  }
  // gauntlet
  let g = 8;
  while (!S.dead && S.survived < 40) { runBattle(S, g++, startOpts, monsters++); if (!S.dead) S.survived++; }
  return S;
}

// ---------- collections ----------
function pickCollection(n, r, kind) {
  const pool = BOOSTERS.flatMap(c => Array(c.count).fill(c));
  if (kind === 'engine') {
    const ids = ['ON-04', 'ON-11', 'ON-29', 'ON-24', 'ON-07', 'ON-08', 'ON-14', 'ON-57', 'ON-33', 'ON-51', 'ON-46', 'ON-12', 'ON-02', 'ON-18', 'ON-10', 'ON-30', 'ON-47', 'ON-65', 'ON-63'];
    const list = ids.map(id => BOOSTERS.find(c => c.id === id)); shuffle(list, r); return list.slice(0, n);
  }
  shuffle(pool, r); return pool.slice(0, n);
}

// ---------- experiment driver ----------
function evaluate(label, R, P, opts) {
  const digs = opts.digs, agg = { depth: 0, clear9: 0, g12: 0, n: 0, stats: {} };
  const depthHist = []; agg.bySize = {}; const cnt = {};
  for (const kind of opts.kinds) for (const n of opts.sizes) {
    const kitSize = n === 0 ? 0 : n <= 4 ? 2 : 3;
    for (let i = 0; i < digs; i++) {
      const seed = 1000 + i * 7919 + n * 131;
      const coll = pickCollection(n, mulberry(seed * 3 + 1), kind);
      const S = playDig(coll, kitSize, seed, R, P, P);
      agg.depth += S.survived; agg.n++; agg.bySize[n] = (agg.bySize[n] || 0) + S.survived; cnt[n] = (cnt[n] || 0) + 1; if (S.survived >= 9) agg.clear9++; if (S.survived >= 12) agg.g12++;
      for (const k in S.stats) agg.stats[k] = (agg.stats[k] || 0) + S.stats[k];
    }
  }
  for (const n in agg.bySize) agg.bySize[n] /= cnt[n];
  const s = agg.stats, nb = s.battles || 1;
  return {
    label, bySize: agg.bySize, depth: agg.depth / agg.n, clear9: agg.clear9 / agg.n, g12: agg.g12 / agg.n,
    spendPerBattle: ((s.spentPre || 0) + (s.spentPost || 0)) / nb, preShare: (s.spentPre || 0) / Math.max(1, (s.spentPre || 0) + (s.spentPost || 0)),
    gainPerBattle: (s.gritGained || 0) / nb, wastedPerBattle: (s.gritWasted || 0) / nb,
    regainRatio: (s.regainedOnSpend || 0) / Math.max(1, s.spentOnSpend || 0), loopShare: (s.loopBattles || 0) / Math.max(1, s.bigSpendBattles || 0),
    postBoom: (s.postBoom || 0) / Math.max(1, s.postEvents || 0), postThresh: (s.postThresh || 0) / Math.max(1, s.postEvents || 0), postOther: (s.postOther || 0) / Math.max(1, s.postEvents || 0), postPerDig: (s.postEvents || 0) / agg.n,
    petShare: (s.petWins || 0) / nb, boomRate: (s.booms || 0) / agg.n,
  };
}
const f = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : x);
function table(rows, cols) {
  const head = cols.map(c => c[0]); const lines = [head.join(' | '), head.map(() => '---').join(' | ')];
  rows.forEach(r => lines.push(cols.map(c => c[1](r)).join(' | '))); return lines.join('\n');
}
module.exports = { evaluate, BASE, playDig, CARDS, BOOSTERS, pickCollection, table, f, mulberry };

if (require.main === module) {
  const section = process.argv[2] || 'A', digs = +process.argv[3] || 150, kind = process.argv[4] || 'random';
  const O = { digs, kinds: [kind], sizes: [0, 4, 8, 14] };
  const mk = (over) => Object.assign({}, BASE, over || {});
  const sz = (r, n) => f(r.bySize[n]);
  const cols = [
    ['policy', r => r.label], ['depth', r => f(r.depth)], ['by size 0/4/8/14', r => [0, 4, 8, 14].map(n => sz(r, n)).join(' / ')], ['clear all 9', r => f(r.clear9)], ['gauntlet 12+', r => f(r.g12)],
    ['grit spent/battle', r => f(r.spendPerBattle)], ['pre share', r => f(r.preShare)], ['grit gained/battle', r => f(r.gainPerBattle)], ['wasted at cap/battle', r => f(r.wastedPerBattle)],
    ['regained / spent', r => f(r.regainRatio)], ['loop battles', r => f(r.loopShare)],
  ];
  const run = (title, rows) => { console.log('\n### ' + title + ' [' + kind + ' builds, ' + digs + ' digs per size]\n'); console.log(table(rows, cols)); };
  const R0 = mk();
  const BOTH = { pre: 'opt', post: 'opt' };
  if (section === 'A') run('A. Policies (cap 6, before 1:1, after 3:1)', [
    evaluate('never spend Grit', R0, { pre: 'off', post: 'off' }, O),
    evaluate('before only (best look-ahead)', R0, { pre: 'opt', post: 'off' }, O),
    evaluate('after only (best look-ahead)', R0, { pre: 'off', post: 'opt' }, O),
    evaluate('after only, only to avoid BOOM', R0, { pre: 'off', post: 'boom' }, O),
    evaluate('before + after only to avoid BOOM', R0, { pre: 'opt', post: 'boom' }, O),
    evaluate('before + after, both best', R0, BOTH, O),
    evaluate('spend everything before every roll', R0, { pre: 'all', post: 'off' }, O),
  ]);
  if (section === 'B') run('B. Cap (Grit track maximum), both-best policy', [3, 4, 6, 8, 12].map(c => evaluate('cap ' + c, mk({ gritMax: c }), BOTH, O)));
  if (section === 'C') run('C. After-roll rate (Grit per +1), both-best policy, cap 6', [1, 2, 3, 4, 99].map(r => evaluate('after = ' + (r === 99 ? 'never' : r + ' Grit per +1'), mk({ postRate: r }), BOTH, O)));
  if (section === 'D') run('D. Cap x after-rate, both-best policy', [[4, 2], [4, 3], [6, 2], [6, 3], [6, 4], [8, 3]].map(([c, r]) => evaluate('cap ' + c + ', after ' + r + ':1', mk({ gritMax: c, postRate: r }), BOTH, O)));
  if (section === 'E') run('E. Start with 2 Grit; and with 0 (control)', [0, 2].map(g => evaluate('start Grit ' + g, mk({ startGrit: g }), BOTH, O)));
  if (section.startsWith('G')) {
    const G = [['today: cap 6, after 3:1', {}], ['before-roll spend max 3', { preLimit: 3 }], ['before-roll spend max 2', { preLimit: 2 }], ['before-roll spend max 1', { preLimit: 1 }], ['max 3 Grit spent per battle', { battleLimit: 3 }],
      ['Grit earned in a battle waits until it ends', { delay: true }], ['wait + before-roll max 3', { delay: true, preLimit: 3 }], ['cap 3 + before-roll max 2', { gritMax: 3, preLimit: 2 }], ['cap 4 + before-roll max 2', { gritMax: 4, preLimit: 2 }],
      ['max 2 Grit spent per battle', { battleLimit: 2 }], ['max 4 Grit spent per battle', { battleLimit: 4 }], ['max 5 Grit spent per battle', { battleLimit: 5 }], ['max 4 per battle, after 2:1', { battleLimit: 4, postRate: 2 }], ['max 3 per battle, after 2:1', { battleLimit: 3, postRate: 2 }], ['max 4 per battle, cap 5', { battleLimit: 4, gritMax: 5 }],
      ['cap 3 + Grit earned in battle waits', { gritMax: 3, delay: true }], ['cap 3 + wait + after 2:1', { gritMax: 3, delay: true, postRate: 2 }], ['cap 3 + after 2:1', { gritMax: 3, postRate: 2 }], ['cap 4 + wait', { gritMax: 4, delay: true }], ['cap 3 + max 3 per battle', { gritMax: 3, battleLimit: 3 }], ['cap 4 + max 4 per battle', { gritMax: 4, battleLimit: 4 }], ['cap 3 + wait + after 1:1', { gritMax: 3, delay: true, postRate: 1 }], ['cap 4 + wait + after 2:1', { gritMax: 4, delay: true, postRate: 2 }]];
    const idx = section.length > 1 ? [+section.slice(1)] : G.map((_, i) => i);
    run('G. Loop limiters, both-best policy', idx.map(i => evaluate(G[i][0], mk(G[i][1]), BOTH, O)));
  }
  if (section === 'F') run('F. Before-roll rate (roll points per Grit), both-best, cap 6', [[1, 3], [0.5, 3], [1, 2]].map(([pr, r]) => evaluate('before ' + pr + ':1, after ' + r + ':1', mk({ preRate: pr, postRate: r }), BOTH, O)));
}
