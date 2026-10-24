// Browser tests: drive the real page with touch taps. Skipped when Playwright/Chromium is unavailable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findChromium() {
  const tries = [() => require('playwright'), () => require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))];
  for (const t of tries) { try { return t().chromium; } catch (e) { /* next */ } }
  return null;
}
const chromium = findChromium();
const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const SKIP = { skip: !chromium && 'Playwright/Chromium not available', timeout: 120000 };
const LEVELS = ['Beginner', 'Novice', 'Normal', 'Challenging', 'Master'];

// Most tests ask for reduced motion, which shows an opponent's whole turn at once; the animation tests turn that off.
// The rules reminders (a note the first time a match or a gem comes up) are switched off in most tests, so they do not sit in the way of the taps; the tests of the reminders turn them on (`tips: true`).
async function open({ viewport = { width: 1024, height: 768 }, query = '', animated = false, tips = false } = {}) {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: animated ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(FILE + query);
  if (!tips) {                                                         // (set once, then reload: an init script that touches storage on every load made reloads flaky)
    await page.evaluate(() => {
      try {
        localStorage.setItem('tabletop-library-fossil-frenzy-tips', JSON.stringify(['match', 'gem']));
        localStorage.setItem('tabletop-library-fossil-frenzy-passplay', JSON.stringify({ n: 2, size: 'large', reminders: false }));          // (the 31-tile board, as most tests were written for; sizes have their own test)
      } catch (e) { /* no storage */ }
    });
    await page.reload();
  }
  return { browser, page, errors };
}

// ---------- ways into a game ----------
// Choosing Campaign or Pass & Play when a game of that kind is saved asks first: these start a NEW game (which replaces the saved one); the tests of the question tap Continue themselves.
const chooseMode = async (page, v) => { await page.tap(`[data-act=mode][data-v=${v}]`); if (await page.locator('[data-act=newgame]').count()) await page.tap('[data-act=newgame]'); };
const passAndPlay = async (page, n) => {
  await chooseMode(page, 'pass');
  await page.tap(`[data-act=n][data-v="${n}"]`);
  await page.tap('[data-act=deal]');
  await page.tap('[data-act=begin]');
};
const campaign = async (page, level = 0) => {
  await chooseMode(page, 'campaign');
  await page.tap(`[data-act=level][data-i="${level}"]`);
  await page.tap('[data-act=begin]');
};

// ---------- helpers ----------
const ui = (page, fn) => page.evaluate(fn);
const screenOf = page => page.evaluate(() => window.FossilFrenzyUI.ui.screen);
const gameState = page => page.evaluate(() => { const s = window.FossilFrenzyUI.ui.st; return s ? JSON.stringify([s.phase, s.current, s.turnNo, s.matchedCount, s.turn, s.players.map(p => [p.sets, p.points, p.banked])]) : null; });
const cellOf = (page, tid) => page.evaluate(i => window.FossilFrenzyUI.ui.st.tokens[i].cell, tid).then(c => `[data-act=cell][data-id="${c}"]`);

// Selectors for two fossils still on the board (the second differs from the one being peeked).
const firstFree = page => page.evaluate(() => `[data-act=cell][data-id="${window.FossilFrenzyUI.ui.st.tokens.find(t => !t.matched).cell}"]`);
const otherFree = page => page.evaluate(() => { const st = window.FossilFrenzyUI.ui.st; return `[data-act=cell][data-id="${st.tokens.find(t => !t.matched && t.id !== st.turn.T).cell}"]`; });
const openSettings = async page => { if (await page.locator('[data-act=menu]').count()) await page.tap('[data-act=menu]'); await page.tap('[data-act=settings]'); };
const openRules = async page => { if (await page.locator('[data-act=menu]').count()) await page.tap('[data-act=menu]'); await page.tap('[data-act=help]'); };
const quitToStart = async page => { await page.tap('[data-act=menu]'); await page.tap('[data-act=quit]'); };
const idle = page => page.waitForFunction(() => { const u = window.FossilFrenzyUI.ui; return (!u.steps || u.stage >= u.steps.length) && !u.fx; });   // an opponent's turn has finished being shown (and its film, if it found or dug a map)
// (a match ends the turn by itself once its film has played; otherwise there is the End turn button)
const takeATurn = async page => {
  await idle(page);
  const turn = await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo);
  await page.tap(await firstFree(page)); await page.tap(await otherFree(page));
  await page.waitForFunction(t => { const u = window.FossilFrenzyUI.ui; return u.st.over || u.st.turnNo !== t || (!u.fx && !!document.querySelector('[data-act=end]')); }, turn, { timeout: 15000 });
  if (await page.locator('[data-act=end]').count()) await page.tap('[data-act=end]');
};

// Make specific fossils particular values by swapping with another fossil that has it (keeps the set intact).
const rig = (page, wanted) => page.evaluate(w => {
  const st = window.FossilFrenzyUI.ui.st, used = new Set();
  Object.entries(w).forEach(([id, value]) => {
    const a = st.tokens[Number(id)];
    used.add(a.id);
    if (a.value === value) return;
    const c = st.tokens.find(t => t.value === value && !used.has(t.id));
    [a.value, c.value] = [c.value, a.value]; [a.gem, c.gem] = [c.gem, a.gem];
  });
  window.FossilFrenzyUI.render();
}, wanted);

// Ends the game right now with the given points for players 0 and 1 (no sets popped, so every tie-break is level).
const forceFinish = (page, points) => page.evaluate(pts => {
  const { ui, render } = window.FossilFrenzyUI, st = ui.st;
  pts.forEach((p, i) => { st.players[i].points = p; });
  st.players.forEach(p => { p.poppedSets = 0; }); st.lastPopper = -1;     // an opponent that went first may already have popped a pair: keep every tie-break level
  st.over = true; st.phase = 'over'; st.result = Engine.computeResult(st); ui.overSeen = true;          // (the results screen straight away: the tap that brings it up has its own test)
  render();
}, points);

const fingerprint = () => {
  const st = window.FossilFrenzyUI.ui.st;
  return JSON.stringify([window.FossilFrenzyUI.ui.turnCard, !!window.FossilFrenzyUI.ui.tip, window.FossilFrenzyUI.ui.overSeen, st.phase, st.turnNo, st.matchedCount, st.turn.revealed, st.players.map(p => [p.sets.length, p.points])]);
};

// Plays a whole game with taps only. A hidden helper bot (perfect memory) chooses what a human would tap.
async function playByTaps(page, humanSeats) {
  await page.evaluate(seats => {
    const { ui } = window.FossilFrenzyUI;
    window.__helpers = seats.map(i => { const b = Bots.create({ seat: i, profile: 'expert', rng: Engine.mulberry32(i + 1) }); ui.st.observers.push(b); return b; });
  }, humanSeats);
  for (let step = 0; step < 2000; step++) {
    const plan = await page.evaluate(() => {
      const { ui } = window.FossilFrenzyUI, real = ui.st;
      if (real.over) return ui.overSeen ? { done: true } : { sel: '[data-act=results]' };          // the last match has played out: tap for the results
      if (ui.tip) return { sel: '[data-act=tip-ok]' };
      if (ui.turnCard) return { sel: '[data-act=begin]' };
      // while an opponent's finished turn is on the board, my first tap ends it and starts mine: plan from there
      let st = real;
      if (ui.botWaiting) { st = Engine.restore(Engine.serialize(real), { data: real.data }); Engine.endTurn(st); }
      const b = window.__helpers.find(h => h.seat === st.current);
      const a = b.decide(Engine.publicView(st, st.current));
      const cell = tid => `[data-act=cell][data-id="${st.tokens[tid].cell}"]`;
      switch (a.type) {
        case 'peek': case 'flipOther': case 'flipSecond': return { sel: cell(a.tid) };
        case 'flipOwn': {                                            // two gems: tapping any third fossil is the consent
          const ahead = Engine.restore(Engine.serialize(st), { data: st.data });        // look one move ahead on a copy to see which third fossil the helper wants
          Engine.flipOwn(ahead);
          const a2 = b.decide(Engine.publicView(ahead, ahead.current));
          const third = a2.type === 'flipSecond' ? a2.tid : st.tokens.find(t => !t.matched && t.id !== st.turn.T && t.id !== st.turn.F).id;
          return { sel: cell(third) };
        }
        case 'bank': return { sel: `[data-act=set][data-i="${a.set}"]` };
        default: return { sel: '[data-act=end]' };
      }
    });
    if (plan.done) return step;
    const before = await page.evaluate(fingerprint);
    await page.tap(plan.sel);
    assert.notEqual(await page.evaluate(fingerprint), before, 'tap had no effect: ' + plan.sel + ' in ' + before);
  }
  throw new Error('game did not finish: ' + JSON.stringify(await page.evaluate(() => { const u = window.FossilFrenzyUI.ui, st = u.st; return { phase: st.phase, cur: st.current, turnNo: st.turnNo, left: st.tokens.filter(t => !t.matched).map(t => [t.id, t.value]), sets: st.players.map(p => p.sets), turn: st.turn, card: u.turnCard, bw: u.botWaiting }; })));
}

// =====================================================================
test('home: two ways to play — Pass & Play and Campaign — and no rule-set toggle', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    assert.equal(await screenOf(page), 'home');
    assert.equal(await page.locator('[data-act=mode]').count(), 2);
    const text = await page.locator('.sheet').innerText();
    assert.match(text, /Pass & Play/);
    assert.match(text, /Campaign/);
    assert.doesNotMatch(text, /movement|delivery|original rules|peek, flip, bank|corner|pawn/i);
    assert.equal(await page.locator('[data-act=sys]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('page is locked (no scrolling or zooming) and the setup screens have a back route', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
    assert.match(await page.evaluate(() => document.querySelector('meta[name=viewport]').content), /user-scalable=no/);
    await page.tap('[data-act=help]');
    assert.ok(await page.locator('.help').count());
    await page.tap('[data-act=closehelp]');
    assert.equal(await page.locator('.help').count(), 0);
    await chooseMode(page, 'pass');
    await page.tap('[data-act=home]');
    assert.equal(await screenOf(page), 'home');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- Pass & Play ----------
test('Pass & Play: 2, 3 or 4 people — humans only; names are remembered', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'pass');
    assert.equal(await page.locator('[data-act=n]').count(), 3);
    assert.deepEqual(await page.locator('[data-act=n]').allInnerTexts(), ['2', '3', '4']);
    for (const n of [2, 3, 4]) { await page.tap(`[data-act=n][data-v="${n}"]`); assert.equal(await page.locator('input[data-act=name]').count(), n); }
    assert.equal(await page.locator('text=/Bot|Human/').count(), 0, 'no bot seats in Pass & Play');
    await page.fill('input[data-act=name][data-i="0"]', 'Ada');
    await page.reload();
    await chooseMode(page, 'pass');
    assert.equal(await page.inputValue('input[data-act=name][data-i="0"]'), 'Ada');
    assert.equal(await page.locator('input[data-act=name]').count(), 4, 'the player count is remembered too');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the board: 31 fossils, no corners, no pieces, no movement', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    assert.equal(await page.locator('g.cell').count(), 31);
    assert.equal(await page.locator('.tile').count(), 31);
    assert.equal(await page.locator('.piece, .site, .sitenum').count(), 0);
    assert.doesNotMatch(await page.locator('.game').innerText(), /move|deliver|site/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

for (const n of [2, 4]) {
  test(`Pass & Play: a full ${n}-person game plays through by taps only, ending on a laid-out score screen`, SKIP, async () => {
    const { browser, page, errors } = await open();
    try {
      await passAndPlay(page, n);
      await playByTaps(page, [...Array(n).keys()]);
      assert.match(await page.locator('h1').first().innerText(), /wins|Shared/);
      assert.equal(await page.locator('.results .place').count(), n);
      assert.ok(await page.locator('.results .place.win').count() >= 1);
      assert.equal(await page.locator('table').count(), 0);
      const scores = await page.locator('.place .score').allInnerTexts();
      assert.deepEqual(scores, await page.evaluate(() => window.FossilFrenzyUI.ui.st.result.ranking.map(r => String(r.score))));
      const shown = await page.locator('.place .tiles:not(.lostrow) .mini').count();
      assert.equal(shown, await page.evaluate(() => window.FossilFrenzyUI.ui.st.players.reduce((k, p) => k + p.banked.length, 0)));
      assert.ok(await page.locator('[data-act=again]').count());
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

// ---------- Campaign ----------
test('Campaign: all five levels are shown by name, only the easiest is open, the rest are greyed and locked', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'campaign');
    assert.deepEqual(await page.locator('.lvl b').allInnerTexts(), LEVELS);
    assert.equal(await page.locator('.lvl.locked').count(), 4);
    assert.equal(await page.locator('.lvl:not(.locked)').count(), 1);
    assert.match(await page.locator('.lvl:not(.locked)').innerText(), /Beginner/);
    assert.equal(await page.locator('.lvl.locked[aria-disabled="true"]').count(), 4);
    assert.equal((await page.locator('.lvl.locked .state').allInnerTexts()).every(t => t.includes('🔒')), true);
    assert.ok(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.lvl.locked')).opacity)) < 0.6, 'locked levels are greyed out');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: levels are named only — no percentages or memory figures anywhere in the screen', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'campaign');
    assert.doesNotMatch(await page.locator('.sheet').innerText(), /%|\d\.\d|memory|remember/i);
    await page.tap('[data-act=home]');
    await page.tap('[data-act=help]');
    assert.doesNotMatch(await page.locator('.help').innerText(), /%|\d\.\d/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: a locked level cannot be started; Beginner starts a game against "Beginner"', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'campaign');
    await page.tap('[data-act=level][data-i="1"]', { force: true });            // a finger can still land on a greyed-out level
    assert.equal(await screenOf(page), 'campaign', 'tapping a locked level does nothing');
    await page.tap('[data-act=level][data-i="0"]');
    await page.tap('[data-act=begin]');
    assert.equal(await screenOf(page), 'play');
    assert.deepEqual(await page.evaluate(() => window.FossilFrenzyUI.ui.names), ['You', 'Beginner']);
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.bots.filter(Boolean).length), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: winning outright unlocks the next level, remembers it, and offers it', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    await forceFinish(page, [30, 10]);
    assert.match(await page.locator('h1').first().innerText(), /You beat Beginner!/);
    assert.match(await page.locator('.unlock').innerText(), /Novice unlocked/);
    assert.match(await page.locator('[data-act=next]').innerText(), /Novice/);
    await page.tap('[data-act=home]'); await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 3);
    assert.match(await page.locator('.lvl').nth(0).innerText(), /Beaten/);
    assert.doesNotMatch(await page.locator('.lvl').nth(1).innerText(), /Ready|Beaten|🔒/, 'an open level shows nothing on the right');
    await page.reload();                                                   // progress survives a reload
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: the "next level" button starts that level', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    await forceFinish(page, [30, 10]);
    await page.tap('[data-act=next]');
    assert.equal(await page.locator('.alertback, .tip').count(), 0, 'no note at the start of Novice: the first gem explains itself');
    await page.tap('[data-act=begin]');
    assert.deepEqual(await page.evaluate(() => window.FossilFrenzyUI.ui.names), ['You', 'Novice']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: no note opens level 2 (a gem explains itself when it is first revealed); level 1 has no gems; each level has its own board', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-campaign', JSON.stringify({ beaten: ['beginner', 'novice', 'normal', 'challenging'] })));
    await page.reload();
    const board = () => page.evaluate(() => { const s = window.FossilFrenzyUI.ui.st; return [s.cells.length, s.tokens.filter(t => t.gem).length, (s.data.tokens.find(t => t.gem) || {}).value || 0]; });
    const want = [[18, 0, 0], [21, 3, 10], [25, 3, 11], [31, 3, 12], [37, 3, 15]];
    for (let i = 0; i < 5; i++) {
      await chooseMode(page, 'campaign'); await page.tap(`[data-act=level][data-i="${i}"]`);
      assert.equal(await page.locator('.alertback, .tip, [data-act=alert-ok]').count(), 0, 'nothing is said before the first gem shows');
      assert.deepEqual(await board(), want[i], 'level ' + (i + 1));
      assert.equal(await page.locator('svg.board .cell').count(), want[i][0], 'the board on screen has that many spaces');
      await page.tap('[data-act=menu]'); await page.tap('[data-act=quit]');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: losing, or a shared win, does not unlock anything', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    await forceFinish(page, [5, 20]);
    assert.match(await page.locator('h1').first().innerText(), /Beginner wins/);
    assert.equal(await page.locator('[data-act=next]').count(), 0);
    await page.tap('[data-act=again]'); await page.tap('[data-act=begin]');
    await forceFinish(page, [12, 12]);
    assert.match(await page.locator('h1').first().innerText(), /not a win/i);
    await page.tap('[data-act=home]'); await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 4, 'still only Beginner is open');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: beating Master completes the campaign', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-campaign', JSON.stringify({ beaten: ['beginner', 'novice', 'normal', 'challenging'] })));
    await page.reload();
    await campaign(page, 4);
    await forceFinish(page, [40, 1]);
    assert.match(await page.locator('h1').first().innerText(), /Campaign complete/);
    assert.equal(await page.locator('[data-act=next]').count(), 0);
    await page.tap('[data-act=home]'); await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.done').count(), 5);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: ?unlock opens every level for testing (and saves nothing)', SKIP, async () => {
  const { browser, page, errors } = await open({ query: '?unlock' });
  try {
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 0);
    await page.tap('[data-act=level][data-i="4"]');
    await page.tap('[data-act=begin]');
    assert.deepEqual(await page.evaluate(() => window.FossilFrenzyUI.ui.names), ['You', 'Master']);
    assert.equal(await page.evaluate(() => localStorage.getItem('tabletop-library-fossil-frenzy-campaign')), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Campaign: a full game against an opponent plays through by taps (its turns wait for a tap)', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 768, height: 1024 } });
  try {
    await campaign(page, 0);
    await playByTaps(page, [0]);
    assert.ok(await page.locator('.results .place').count() === 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- how a turn looks and feels ----------
test('peek then flip: a gem sequence — peek a gem, flip a gem, tap a third — makes the set (no need to tap your own gem)', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await rig(page, { 0: 12, 1: 12, 2: 12 });
    await page.tap(await cellOf(page, 0));                                 // first tap: private peek
    await page.tap(await cellOf(page, 1));                                 // second tap: public flip — a gem
    assert.match(await page.locator('.hint').innerText(), /gem/i);
    await page.tap(await cellOf(page, 2));                                 // a third space: that consents to revealing my gem, and it is a gem
    const r = await page.evaluate(() => { const st = window.FossilFrenzyUI.ui.st, p = st.players[st.current]; return [p.sets.length, p.sets[0].size, p.sets[0].gem, st.turn.revealed.length]; });
    assert.deepEqual(r, [1, 3, true, 3]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('gems: a third tap that misses flips my gem and the third, then the turn is over to end', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await rig(page, { 0: 12, 1: 12, 2: 7 });
    await page.tap(await cellOf(page, 0)); await page.tap(await cellOf(page, 1));
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.turn.revealed.length), 1, 'only the flipped gem is public so far');
    await page.tap(await cellOf(page, 2));                                 // a third that is not a gem
    const r = await page.evaluate(() => { const st = window.FossilFrenzyUI.ui.st; return [st.phase, st.turn.revealed.length, st.players[st.current].sets.length]; });
    assert.deepEqual(r, ['resolved', 3, 0]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('gems: if the flipped fossil is not a gem, tapping another fossil just ends the turn (nothing more is flipped)', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await rig(page, { 0: 12, 1: 5, 2: 12 });
    const first = await page.evaluate(() => window.FossilFrenzyUI.ui.st.current);
    await page.tap(await cellOf(page, 0)); await page.tap(await cellOf(page, 1));
    await page.tap(await cellOf(page, 2));
    const r = await page.evaluate(() => { const st = window.FossilFrenzyUI.ui.st; return [st.current, st.turnNo, st.tokens.filter(t => t.matched).length]; });
    assert.deepEqual(r, [1 - first, 1, 0], 'the turn passed to the other player; the third fossil was not flipped');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a turn is a peek AND a flip: no End turn (and no bank) until you have flipped — then End turn, or a tap anywhere, ends it', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 7, gem: false, size: 2, ids: [] }]; render(); });
    assert.equal(await page.locator('[data-act=end]').count(), 0, 'no End turn at the start of a turn');
    await page.tap('body', { position: { x: 5, y: 400 } });                // a tap in empty space does nothing yet
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo), 0);
    await page.tap(await firstFree(page));                                  // peek
    assert.equal(await page.locator('[data-act=end]').count(), 0, 'no End turn after the peek: I must flip');
    assert.equal(await page.locator('.setbtn.act').count(), 0, 'and my sets cannot be banked after a peek');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.phase), 'peeked');
    await page.tap('body', { position: { x: 5, y: 400 } });
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo), 0, 'a tap in empty space still does nothing');
    await page.tap(await otherFree(page));                                  // flip
    assert.equal(await page.locator('[data-act=end]').count(), 1, 'now End turn appears');
    assert.match(await page.locator('.hint').innerText(), /tap anywhere/i);
    await page.tap('body', { position: { x: 5, y: 400 } });                // a tap anywhere ends it
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a match stays face up on the board until the turn ends', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await rig(page, { 0: 7, 1: 7 });
    await page.tap(await cellOf(page, 0)); await page.tap(await cellOf(page, 1));
    assert.equal(await page.locator('.tile.up').count(), 2);
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.matchedCount), 2);
    await page.tap('[data-act=end]');
    assert.equal(await page.locator('.tile.up').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('you bank ONE set, by tapping it, for the number on its fossil', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI;
      ui.st.players[ui.st.current].sets = [{ value: 7, gem: false, size: 2, ids: [] }, { value: 3, gem: false, size: 2, ids: [] }];
      render();
    });
    const banker = await page.evaluate(() => window.FossilFrenzyUI.ui.st.current);
    await page.tap('[data-act=set][data-i="1"]');                          // bank the 3, not the 7 — and the turn ends by itself
    const r = await page.evaluate(b => { const st = window.FossilFrenzyUI.ui.st, p = st.players[b]; return [p.points, p.sets.map(x => x.value), st.current !== b, st.turnNo]; }, banker);
    assert.deepEqual(r, [3, [7], true, 1]);
    assert.match(await page.locator('.turncard').innerText(), /dug up treasure: \+3/i, 'the next player is told what was banked');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('an opponent\'s peek shows as a dashed ring on a face-down space (number hidden), its flip as a solid ring', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'campaign');
    let checked = 0;
    for (let g = 0; g < 6 && checked < 2; g++) {
      await page.tap('[data-act=level][data-i="0"]');
      await page.tap('[data-act=begin]');
      for (let i = 0; i < 40 && checked < 2 && !(await page.evaluate(() => window.FossilFrenzyUI.ui.st.over)); i++) {
        if (await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting)) {
          const t = await page.evaluate(() => { const s = window.FossilFrenzyUI.ui.st.turn; return { banked: !!s.banked, matched: !!s.matched }; });
          const dashed = await page.locator('.ring.peekring').count();       // (0 if it flipped the very fossil it peeked at: that one is solid)
          if (!t.banked && !t.matched && dashed > 0) {
            assert.equal(dashed, 1, 'one dashed ring where it peeked');
            assert.ok(await page.locator('.ring:not(.peekring)').count() >= 1, 'a solid ring on what it flipped');
            assert.equal(await page.locator('.tile.peek').count(), 0, 'the opponent\'s number is never shown');
            checked++;
          }
        }
        await takeATurn(page);                                               // my first tap ends the opponent's turn display and starts mine
      }
      await quitToStart(page);
      await chooseMode(page, 'campaign');
    }
    assert.ok(checked >= 1, 'saw at least one non-matching opponent turn');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- quiet prompts ----------
test('prompts: shown to a new player, quiet after the first finished game, switchable in the help panel', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    assert.notEqual((await page.locator('.hint').innerText()).trim(), '', 'a first-time player gets prompts');
    await forceFinish(page, [3, 1]);
    await page.tap('[data-act=again]'); await page.tap('[data-act=begin]');
    assert.equal((await page.locator('.hint').innerText()).trim(), '', 'quiet once a game has been finished');
    await openSettings(page); await page.tap('[data-act=hints][data-v=on]'); await page.tap('[data-act=closesettings]');
    assert.notEqual((await page.locator('.hint').innerText()).trim(), '');
    await openSettings(page); await page.tap('[data-act=hints][data-v=off]'); await page.tap('[data-act=closesettings]');
    assert.equal((await page.locator('.hint').innerText()).trim(), '');
    await page.reload();                                                  // the choice is remembered
    await openSettings(page);
    assert.equal(await page.locator('[data-act=hints].on').innerText(), 'Off');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- save / resume ----------
test('save: reloading the page opens the Main Menu; Continue resumes the same game, same phase, and play continues', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await rig(page, { 0: 7, 1: 5, 2: 7 });
    await page.tap(await cellOf(page, 0));                                // peek
    await page.tap(await cellOf(page, 1));                                // flip a miss
    const before = await gameState(page);
    await page.reload();
    assert.equal(await screenOf(page), 'home', 'the game opens on the Main Menu, not in the game you were playing');
    await page.tap('[data-act=mode][data-v=pass]');                       // Pass & Play asks: carry on with the game in progress, or start a new one…
    await page.tap('[data-act=continue]');                                // …Continue picks it up (a Pass & Play game says whose turn it is first)
    await page.tap('[data-act=begin]');
    assert.equal(await screenOf(page), 'play');
    assert.equal(await gameState(page), before, 'identical game state after the reload');
    assert.equal(await page.locator('.ring.peekring').count(), 1, 'the peeked space is still marked');
    await page.tap('[data-act=end]');                                     // carry on: end the turn…
    await page.tap('[data-act=begin]');                                   // …the next player sees whose turn it is…
    await page.tap(await cellOf(page, 2)); await page.tap(await cellOf(page, 0));   // …then the next player peeks and flips
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('save: a campaign game resumes against the same opponent, with its turn still on the board', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting)); i++) {
      await takeATurn(page);
    }
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting), true);
    const before = await gameState(page);
    await page.reload();
    assert.equal(await screenOf(page), 'home');
    await page.tap('[data-act=mode][data-v=campaign]');
    await page.tap('[data-act=continue]');
    assert.deepEqual(await page.evaluate(() => [window.FossilFrenzyUI.ui.mode, window.FossilFrenzyUI.ui.levelIdx, window.FossilFrenzyUI.ui.names, window.FossilFrenzyUI.ui.botWaiting]), ['campaign', 0, ['You', 'Beginner'], true]);
    assert.equal(await gameState(page), before);
    await page.tap(await firstFree(page));                                 // my first tap ends its turn and is my peek
    assert.equal(await page.evaluate(() => [window.FossilFrenzyUI.ui.st.current, window.FossilFrenzyUI.ui.st.phase].join()), '0,peeked');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('save: leaving a game keeps it; Pass & Play and the Campaign each ask "continue or start new" (also after a reload); a finished game is not kept', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.tap(await firstFree(page)); await page.tap(await otherFree(page));         // a turn in progress: flipped, not yet ended
    const before = await gameState(page);
    await quitToStart(page);
    assert.equal(await screenOf(page), 'home');
    assert.equal(await page.locator('[data-act=continue]').count(), 0, 'the Main Menu is just Campaign and Pass & Play');
    assert.equal(await page.locator('[data-act=mode]').count(), 2);
    await page.reload();
    assert.equal(await screenOf(page), 'home', 'a reload does not throw you back into a game you left');
    await page.tap('[data-act=mode][data-v=pass]');
    assert.equal(await screenOf(page), 'resume', 'it asks what to do with the game in progress');
    assert.match(await page.locator('[data-act=continue]').innerText(), /Continue this game/);
    assert.match(await page.locator('[data-act=newgame]').innerText(), /Start a new game[\s\S]*replaces/);
    await page.tap('[data-act=continue]'); await page.tap('[data-act=begin]');
    assert.equal(await screenOf(page), 'play');
    assert.equal(await gameState(page), before, 'exactly the game that was left');
    await forceFinish(page, [4, 2]);
    await page.reload();
    await page.tap('[data-act=mode][data-v=pass]');
    assert.equal(await screenOf(page), 'pass', 'a finished game is not offered');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('save: the most recent Campaign game and the most recent Pass & Play game are both kept; a new game replaces only its own kind', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    const pass = await gameState(page);
    await quitToStart(page);
    await page.tap('[data-act=mode][data-v=campaign]');
    assert.equal(await screenOf(page), 'campaign', 'no Campaign game yet: straight to the levels');
    await page.tap('[data-act=level][data-i="0"]'); await page.tap('[data-act=begin]');
    await quitToStart(page);
    assert.deepEqual(await page.evaluate(() => ['campaign', 'pass'].map(m => !!localStorage.getItem('tabletop-library-fossil-frenzy-save-' + m))), [true, true], 'both are saved');
    await page.tap('[data-act=mode][data-v=campaign]');
    assert.match(await page.locator('[data-act=continue]').innerText(), /Continue this game[\s\S]*Beginner/);
    await page.tap('[data-act=home]');
    await page.tap('[data-act=mode][data-v=pass]');
    assert.match(await page.locator('[data-act=continue]').innerText(), /Continue this game[\s\S]*Player 1 0/);
    await page.tap('[data-act=continue]'); await page.tap('[data-act=begin]');
    assert.equal(await gameState(page), pass, 'the Pass & Play game, untouched by the Campaign game');
    await quitToStart(page);
    await page.tap('[data-act=mode][data-v=campaign]'); await page.tap('[data-act=newgame]');       // a new Campaign game replaces the Campaign game only
    assert.equal(await screenOf(page), 'campaign');
    await page.tap('[data-act=level][data-i="0"]'); await page.tap('[data-act=begin]');
    assert.equal(await page.evaluate(() => !!localStorage.getItem('tabletop-library-fossil-frenzy-save-pass')), true, 'the Pass & Play game is still there');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('save: a save from other rules, data from the app\'s earlier name, or a damaged one — cleared with a quiet note, never a crash', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => { const k = 'tabletop-library-fossil-frenzy-save-pass', sv = JSON.parse(localStorage.getItem(k)); sv.game.fingerprint = 'other'; localStorage.setItem(k, JSON.stringify(sv)); });
    await page.reload();
    await page.tap('[data-act=mode][data-v=pass]'); await page.tap('[data-act=continue]');
    assert.equal(await screenOf(page), 'home');
    assert.match(await page.locator('.sheet').innerText(), /changed the rules, so your saved game was cleared/);
    assert.equal(await page.evaluate(() => localStorage.getItem('tabletop-library-fossil-frenzy-save-pass')), null);
    await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-save-pass', '{not json'));
    await page.reload();
    assert.equal(await screenOf(page), 'home');
    await page.tap('[data-act=mode][data-v=pass]');
    assert.equal(await screenOf(page), 'pass', 'a damaged save is not offered');
    await page.evaluate(() => { localStorage.setItem('fossil-frenzy-save-v2', '{"anything":1}'); localStorage.setItem('fossil-frenzy-campaign-v1', '{"beaten":["beginner"]}'); });   // data from the app's earlier name
    await page.reload();
    assert.equal(await screenOf(page), 'home');
    assert.equal(await page.evaluate(() => ['fossil-frenzy-save-v2', 'fossil-frenzy-campaign-v1'].map(k => localStorage.getItem(k)).join()), ',', 'old-name data is discarded, not read');
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 4, 'old campaign progress is not carried over');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// =====================================================================
// ---------- playtest round 2: turn order, scores, animated opponent, bank ends turn, menu ----------
test('no "Who goes first?" screen: the game opens straight on the table, with a card naming whose turn it is', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'pass');
    await page.fill('input[data-act=name][data-i="0"]', 'Ada');
    await page.fill('input[data-act=name][data-i="1"]', 'Bo');
    await page.tap('[data-act=deal]');
    assert.equal(await screenOf(page), 'play', 'dealing goes straight to the table');
    assert.equal(await page.locator('table').count(), 0);
    assert.doesNotMatch(await page.locator('#app').innerText(), /Who goes first|rolled a die/i);
    const card = await page.locator('.turncard').innerText();
    assert.match(card, /(Ada|Bo) goes first/);
    const first = await page.evaluate(() => window.FossilFrenzyUI.ui.seat = window.FossilFrenzyUI.ui.st.current);
    await page.evaluate(() => { const c = document.querySelector('[data-act=cell]'); window.FossilFrenzyUI.onClick({ target: c }); });   // a tap that reached the board under the card does nothing
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.phase), 'action');
    await page.tap('[data-act=begin]');
    assert.equal(await page.locator('.turncard').count(), 0);
    await page.tap(await firstFree(page));
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.phase), 'peeked');
    assert.equal(first, await page.evaluate(() => window.FossilFrenzyUI.ui.st.current));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('who goes first is random: both seats start games', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'pass');
    await page.tap('[data-act=deal]');
    const seen = new Set();
    for (let i = 0; i < 30 && seen.size < 2; i++) {
      seen.add(await page.evaluate(() => window.FossilFrenzyUI.ui.st.current));
      await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-ask][data-v=retry]'); await page.tap('[data-act=retry]');
    }
    assert.equal(seen.size, 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('pass & play: every turn opens with a card naming the next player', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'pass');
    await page.tap('[data-act=n][data-v="3"]');
    await page.fill('input[data-act=name][data-i="0"]', 'Ada');
    await page.fill('input[data-act=name][data-i="1"]', 'Bo');
    await page.fill('input[data-act=name][data-i="2"]', 'Cy');
    await page.tap('[data-act=deal]');
    for (let i = 0; i < 4; i++) {
      await page.tap('[data-act=begin]');
      const cur = await page.evaluate(() => window.FossilFrenzyUI.ui.names[window.FossilFrenzyUI.ui.st.current]);
      await page.tap(await firstFree(page)); await page.tap(await otherFree(page));
      await page.tap('[data-act=end]');
      const next = await page.evaluate(() => window.FossilFrenzyUI.ui.names[window.FossilFrenzyUI.ui.st.current]);
      assert.notEqual(next, cur);
      assert.match(await page.locator('.turncard').innerText(), new RegExp(next + "'s turn"));
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the score is prominent: big numbers for every player, the current player lit up, updated when someone banks', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 3);
    assert.equal(await page.locator('.chip .pts').count(), 3);
    assert.equal(await page.locator('.chip.cur').count(), 1);
    const px = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.chip .pts')).fontSize));
    assert.ok(px >= 32, 'score is at least 32px: ' + px);
    assert.deepEqual(await page.locator('.chip .pts').allInnerTexts(), ['0', '0', '0']);
    const banker = await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI, st = ui.st;
      st.players[st.current].sets = [{ value: 10, gem: false, size: 2, ids: [] }]; st.rng = () => 0.01; render(); return st.current;
    });
    await page.tap('[data-act=set][data-i="0"]');
    const texts = await page.locator('.chip .pts').allInnerTexts();
    assert.equal(texts[banker], '10');
    assert.equal(texts.filter(t => t === '0').length, 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('an opponent\'s turn is animated: its peek (number hidden) shows at once, the flip less than a second later; a tap skips ahead', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await campaign(page, 0);
    let seen = false;
    for (let g = 0; g < 20 && !seen; g++) {
      await page.waitForFunction(() => { const u = window.FossilFrenzyUI.ui; return (!u.steps || u.stage >= u.steps.length) && !u.fx; }, null, { timeout: 5000 });
      await takeATurn(page);
      const info = await page.evaluate(() => { const { ui } = window.FossilFrenzyUI; return { n: ui.steps ? ui.steps.length : 0, first: ui.steps && ui.steps[0] ? ui.steps[0].a.type : null, stage: ui.stage }; });
      if (info.n >= 2 && info.first === 'peek' && info.stage === 1) {
        seen = true;
        // no waiting: the peek is already there
        assert.equal(await page.locator('.ring.peekring').count(), 1, 'the peek shows as a dashed ring');
        assert.equal(await page.locator('.tile.lift').count(), 1, 'and the fossil lifts');
        assert.equal(await page.locator('.tile.up').count(), 0, 'the number is not shown');
        assert.equal(await page.locator('.num, .gem').count(), 0, 'no number anywhere on the board');
        assert.match(await page.locator('.hint').innerText(), /peeks/i);
        const t0 = Date.now();
        await page.waitForFunction(() => window.FossilFrenzyUI.ui.stage === 2, null, { timeout: 5000 });
        assert.ok(Date.now() - t0 < 1000, 'the flip follows in under a second: ' + (Date.now() - t0));
        assert.ok(await page.locator('.tile.up').count() >= 1, 'then the flip is shown');
        if (await page.evaluate(() => { const u = window.FossilFrenzyUI.ui; return u.stage < u.steps.length; })) {
          await page.tap(await firstFree(page));                           // a tap skips to the end of its turn
          assert.equal(await page.evaluate(() => { const u = window.FossilFrenzyUI.ui; return u.stage === u.steps.length; }), true);
        }
        await page.tap(await firstFree(page));                             // the next tap starts my turn: it is my peek
        assert.equal(await page.evaluate(() => [window.FossilFrenzyUI.ui.st.current, window.FossilFrenzyUI.ui.st.phase].join()), '0,peeked');
      }
    }
    assert.ok(seen, 'saw an opponent turn that starts with a peek');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('an opponent\'s score and sets only change when its move is shown, not before', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await campaign(page, 0);
    for (let i = 0; i < 3 && !(await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting)); i++) await takeATurn(page);
    // pretend the opponent's turn banked: the displayed points must stay at the old value until the bank step is shown
    const r = await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI, st = ui.st;
      const old = ui.base.points;
      ui.steps = [{ a: { type: 'peek', tid: 0 }, snap: { points: old, sets: [] } }, { a: { type: 'bank', set: 0 }, snap: { points: old + 9, sets: [] } }];
      ui.stage = 1; st.players[st.current].points = old + 9; render();
      const before = document.querySelectorAll('.chip .pts')[st.current].textContent;
      ui.stage = 2; render();
      return [Number(before) === old, document.querySelectorAll('.chip .pts')[st.current].textContent === String(old + 9)];
    });
    assert.deepEqual(r, [true, true]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- the in-game menu ----------
test('menu: a ☰ button opens rules, retry and back-to-start; retry asks first, leaving does not (it saves)', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    assert.equal(await page.locator('[data-act=menu]').count(), 1);
    assert.equal(await page.locator('.q').count(), 1, 'one small system button, nothing else competing for attention');
    await page.tap('[data-act=menu]');
    assert.deepEqual(await page.locator('.menu button').allInnerTexts(), ['Retry', 'How to play', 'Tiles', 'Settings', 'Main Menu']);
    await page.tap('.backdrop[data-act=menu-close]', { force: true });      // tap away to close
    assert.equal(await page.locator('.menu').count(), 0);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=help]');   // rules from the menu
    assert.ok(await page.locator('.help').count());
    await page.tap('[data-act=closehelp]');
    assert.equal(await page.locator('.menu').count(), 0);
    assert.equal(await screenOf(page), 'play');
    // retry asks first; "no" changes nothing
    await page.tap(await firstFree(page));
    const before = await gameState(page);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-ask][data-v=retry]');
    assert.match(await page.locator('.menu').innerText(), /start this game over/i);
    await page.tap('.menu [data-act=menu-close]');
    assert.equal(await gameState(page), before);
    // leaving does not ask: the game is saved
    await page.tap('[data-act=menu]'); await page.tap('[data-act=quit]');
    assert.equal(await screenOf(page), 'home');
    assert.equal(await page.evaluate(() => !!localStorage.getItem('tabletop-library-fossil-frenzy-save-pass')), true, 'and it is kept');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('menu: retry (confirmed) deals a fresh game at once, same players — no level or player picking', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'pass');
    await page.tap('[data-act=n][data-v="3"]');
    await page.fill('input[data-act=name][data-i="2"]', 'Cy');
    await page.tap('[data-act=deal]'); await page.tap('[data-act=begin]');
    await page.tap(await firstFree(page)); await page.tap(await otherFree(page));
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-ask][data-v=retry]'); await page.tap('[data-act=retry]');
    const r = await page.evaluate(() => { const u = window.FossilFrenzyUI.ui; return [u.screen, u.st.turnNo, u.st.matchedCount, u.st.n, u.names[2], u.st.turn.revealed.length]; });
    assert.deepEqual(r, ['play', 0, 0, 3, 'Cy', 0]);
    assert.ok(await page.locator('.turncard').count(), 'it starts with the who-goes-first card');
    assert.equal(await page.locator('.menu').count(), 0);

    // and in the campaign: the same level, straight away
    await quitToStart(page);
    await campaign(page, 0);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-ask][data-v=retry]'); await page.tap('[data-act=retry]');
    assert.deepEqual(await page.evaluate(() => { const u = window.FossilFrenzyUI.ui; return [u.screen, u.names, u.levelIdx, u.st.turnNo]; }), ['play', ['You', 'Beginner'], 0, 0]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('menu: "Main Menu" (confirmed) leaves the game and clears the save', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await quitToStart(page);
    assert.equal(await screenOf(page), 'home');
    await page.reload();
    assert.equal(await screenOf(page), 'home');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- playtest round 3: menu order, sets in one place, no Continue, the opponent's bank ----------
test('home: Campaign is listed before Pass & Play, over a picture of the board', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    assert.deepEqual(await page.locator('[data-act=mode]').evaluateAll(els => els.map(e => e.dataset.v)), ['campaign', 'pass']);
    assert.equal(await page.locator('.hero-board .h-cell').count(), 31, 'it is the real 31-space board');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('home: a few tiles on the board flip over by themselves, on a loop (no demo game)', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    assert.equal(await page.locator('.hero-board .h-flipper').count(), 7, 'seven tiles take turns flipping');
    assert.equal(await page.locator('.hero-board .h-front').count(), 7);
    assert.equal(await page.locator('.hero-board .ring.peekring').count(), 0, 'no dotted peek ring on the title board');
    const anim = await page.evaluate(() => { const el = document.querySelector('.hero-board .h-flipper'); return getComputedStyle(el).animationName; });
    assert.equal(anim, 'hback', 'the flip is a looping CSS animation');
    // never more than two face up at once: tiles start a second apart and each is up for under two seconds of the 7 s loop
    const delays = await page.evaluate(() => [...document.querySelectorAll('.hero-board .h-flipper')].map(el => -parseFloat(el.style.getPropertyValue('--d'))).sort((a, b) => a - b));
    const upSeconds = 7 * (0.78 - 0.54);                                   // from the start of the flip to the end of the flip back (keyframes hback)
    for (let i = 0; i < delays.length; i++) {
      const overlapping = delays.filter(d => { const gap = (d - delays[i] + 7) % 7; return gap < upSeconds; }).length;
      assert.ok(overlapping <= 2, 'at most two tiles face up at once: ' + JSON.stringify(delays));
    }
    assert.equal(await page.evaluate(() => typeof window.FossilFrenzyUI.demo), 'undefined', 'there is no scripted demo game any more');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('home: it is one screen — nothing to scroll, everything in view — on iPad (both ways) and phones', SKIP, async () => {
  for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 1180, height: 820 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const { browser, page, errors } = await open({ viewport: vp });
    try {
      const r = await page.evaluate(() => {
        const sc = document.querySelector('.screen.home'), inView = sel => { const b = document.querySelector(sel).getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 0.5 && b.left >= 0 && b.right <= innerWidth + 0.5; };
        return { fits: sc.scrollHeight <= sc.clientHeight + 1, wide: sc.scrollWidth <= sc.clientWidth + 1, campaign: inView('[data-v=campaign]'), pass: inView('[data-v=pass]'), help: inView('[data-act=help]'), board: inView('.hero-board'), logo: inView('.logo') };
      });
      assert.deepEqual(r, { fits: true, wide: true, campaign: true, pass: true, help: true, board: true, logo: true }, JSON.stringify(vp));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('campaign screen: no "beat each opponent" line (the locks say it)', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'campaign');
    assert.doesNotMatch(await page.locator('.sheet').innerText(), /unlock the next|beat each/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('sets are shown in one place only — the scoreboard — and tapping them there banks; "no sets" reads plainly', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    assert.equal(await page.locator('.tray, .setcard').count(), 0, 'no side panel');
    assert.deepEqual(await page.locator('.chip .sets').allInnerTexts(), ['', ''], 'nothing is written when there are no sets');
    assert.equal(await page.locator('.bankcap').count(), 0);
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 7, gem: false, size: 2, ids: [] }, { value: 12, gem: true, size: 3, ids: [] }]; ui.st.rng = () => 0.01; render(); });
    assert.equal(await page.locator('.chip.cur .setbtn[data-act=set]').count(), 2, 'the current player\'s sets are the tappable ones');
    assert.equal(await page.locator('.chip:not(.cur) [data-act=set]').count(), 0);
    assert.deepEqual(await page.locator('.chip.cur .setbtn').allInnerTexts(), ['💎\n12', '7']);
    assert.match(await page.locator('.bankcap').innerText(), /tap to dig/i, 'the sets say they can be tapped');
    const box = await page.locator('.chip.cur .setbtn').first().boundingBox();
    assert.ok(box.width >= 48 && box.height >= 48, 'big enough to be a button: ' + JSON.stringify(box));
    await page.tap('.chip.cur .setbtn[data-i="1"]');                       // bank the gem, up there
    assert.equal(await page.evaluate(() => Math.max(...window.FossilFrenzyUI.ui.st.players.map(p => p.points)) >= 12), true, 'the gem scored');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo), 1, 'and the turn is over');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('no Continue: an opponent\'s turn stays on the board until I tap a fossil, and that tap starts my turn', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    for (let i = 0; i < 6 && !(await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting)); i++) await takeATurn(page);
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting), true);
    assert.equal(await page.locator('button', { hasText: /continue/i }).count(), 0, 'there is no Continue button');
    assert.equal(await page.locator('[data-act=end]').count(), 0, 'and no End turn while it is the opponent\'s turn');
    const shown = await page.locator('.ring').count();
    assert.ok(shown >= 1, 'what it peeked and flipped is still showing');
    await page.tap(await firstFree(page));
    const r = await page.evaluate(() => { const st = window.FossilFrenzyUI.ui.st; return [st.current, st.phase, st.turn.peeked !== null, window.FossilFrenzyUI.ui.botWaiting]; });
    assert.deepEqual(r, [0, 'peeked', true, false]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the opponent banks: no pop-up, the little line says what it dug and what it scored — and a tap on the board starts my turn', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    await page.evaluate(() => {                                            // make the opponent hold a 7 and want to bank it
      const { ui } = window.FossilFrenzyUI;
      ui.st.players[1].sets = [{ value: 7, gem: false, size: 2, ids: [] }, { value: 3, gem: false, size: 2, ids: [] }]; ui.bots[1].profile.endSense = 0; ui.st.rng = () => 0.01;
    });
    for (let i = 0; i < 6 && !(await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting && window.FossilFrenzyUI.ui.st.turn.banked)); i++) {
      if (await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting)) { await page.tap(await firstFree(page)); await page.tap(await otherFree(page)); await page.tap('[data-act=end]'); }
      else await takeATurn(page);
    }
    assert.equal(await page.locator('.bankcard, [data-act=dismissbank]').count(), 0, 'no pop-up for it');
    assert.match(await page.locator('.event').innerText(), /Beginner dug up treasure: \+7/, 'the little line says what happened');
    assert.equal(await page.locator('.chip.cur .pts').innerText(), '7');
    assert.equal(await page.locator('button', { hasText: /continue/i }).count(), 0);
    await page.tap(await firstFree(page));                                 // a tap on the board starts my turn (it is my peek)
    assert.equal(await page.evaluate(() => [window.FossilFrenzyUI.ui.st.current, window.FossilFrenzyUI.ui.st.phase].join()), '0,peeked');
    assert.equal(await page.locator('.event').count(), 0, 'and the line is gone');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('after I bank, the turn is over at once and the opponent starts — what I banked shows in a line, with my new score big', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[0].sets = [{ value: 6, gem: false, size: 2, ids: [] }]; ui.st.rng = () => 0.01; render(); });
    await page.tap('[data-act=set]');                                      // my set, up in the scoreboard (also works while the opponent's finished turn is still showing)
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.current), 1);
    assert.match(await page.locator('.event').innerText(), /You dug up treasure: \+6/);
    assert.equal(await page.locator('.chip .pts').first().innerText(), '6');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});


test('end of game: the choices are plain buttons — play again (or the next level) and Main menu; no hidden "Levels"', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await forceFinish(page, [4, 2]);
    assert.deepEqual(await page.locator('.over-buttons button').allInnerTexts(), ['Play again', 'Main menu']);
    assert.ok(await page.evaluate(() => { const b = document.querySelector('[data-act=home]').getBoundingClientRect(); return b.height >= 48 && b.width >= 200; }), 'Main menu is a full-size button');
    assert.doesNotMatch(await page.locator('.sheet').innerText(), /Levels|Change players/);
    await page.tap('[data-act=home]');
    assert.equal(await screenOf(page), 'home');
    await campaign(page, 0);
    await forceFinish(page, [30, 10]);
    assert.deepEqual((await page.locator('.over-buttons button').allInnerTexts()).map(t => t.replace(/:.*/, '')), ['Next', 'Play Beginner again', 'Main menu'], 'after a win: on to the next level, the same level again, or the main menu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('settings: Reset campaign is always there — it forgets wins (and any unlock-all) after asking first', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-campaign', JSON.stringify({ beaten: ['beginner', 'novice'] })));
    await page.reload();
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.done').count(), 2);
    await page.tap('[data-act=home]'); await page.tap('[data-act=settings]');
    assert.equal(await page.locator('[data-act=reset-ask]').count(), 1, 'offered although nothing was unlocked from the menu');
    await page.tap('[data-act=reset-ask]');
    assert.match(await page.locator('.settings .warn').innerText(), /Reset the campaign\?/);
    await page.tap('[data-act=reset-no]');
    await page.tap('[data-act=closesettings]'); await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.done').count(), 2, 'keeping progress changes nothing');
    await page.tap('[data-act=home]'); await page.tap('[data-act=settings]'); await page.tap('[data-act=reset-ask]'); await page.tap('[data-act=reset-yes]');
    await page.tap('[data-act=closesettings]'); await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.done').count(), 0);
    assert.equal(await page.locator('.lvl.locked').count(), 4);
    assert.equal(await page.evaluate(() => localStorage.getItem('tabletop-library-fossil-frenzy-campaign')), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- sound ----------
test('sound: a peek, a flip and its outcome, and a bank each make their sound — and Settings switches sound off and on, remembered', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    const played = () => page.evaluate(() => window.FossilFrenzyUI.audio.played.slice());
    const n0 = (await played()).length;
    await page.tap(await firstFree(page));                                   // peek
    await page.tap(await otherFree(page));                                   // public flip (a miss: the board is shuffled, a random pair is unlikely)
    await page.waitForTimeout(200);
    const heard = (await played()).slice(n0);
    assert.equal(heard[0], 'peek');
    assert.equal(heard[1], 'flip');
    assert.ok(['miss', 'match', 'gem'].includes(heard[2]), 'the outcome follows the flip: ' + heard);
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 7, gem: false, size: 2, ids: [] }]; render(); });
    // (end the turn first so the bank is a fresh action)
    await page.tap('[data-act=end]'); await page.tap('[data-act=begin]');
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 7, gem: false, size: 2, ids: [] }]; render(); });
    const b0 = (await played()).length;
    await page.tap('[data-act=set]');
    assert.equal((await played()).slice(b0)[0], 'bank');
    // Settings (opened from the ☰ menu): Sound On -> Off, remembered
    await openSettings(page);
    assert.equal(await page.locator('.settings [data-act=sound].on').innerText(), 'On');
    await page.tap('[data-act=sound][data-v=off]');
    assert.equal(await page.locator('.settings [data-act=sound].on').innerText(), 'Off', 'the panel shows the new state');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.audio.isEnabled()), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('tabletop-library-fossil-frenzy-sound')), 'off');
    await page.reload();                                                     // remembered after a reload (the game resumes)
    await openSettings(page);
    assert.equal(await page.locator('.settings [data-act=sound].on').innerText(), 'Off');
    await page.tap('[data-act=sound][data-v=on]');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.audio.isEnabled()), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('tabletop-library-fossil-frenzy-sound')), 'on');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('sound: an opponent\'s moves are heard as they are shown — its peek, its flip and what came of it', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await campaign(page, 0);
    await page.evaluate(() => { window.FossilFrenzyUI.audio.played.length = 0; });
    // play a few turns; whenever an opponent's turn is shown its moves must be heard
    let heardOpp = false;
    for (let i = 0; i < 12 && !heardOpp; i++) {
      await takeATurn(page);
      await page.waitForTimeout(1600);                                       // let its turn play out
      heardOpp = await page.evaluate(() => window.FossilFrenzyUI.ui.botWaiting && window.FossilFrenzyUI.audio.played.length >= 5);
    }
    assert.ok(heardOpp, 'sounds for both players\' moves were requested');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('sound: the end of a game has its own sound, played when the end screen appears', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => { window.FossilFrenzyUI.audio.played.length = 0; });
    await forceFinish(page, [11, 3]);
    await page.waitForTimeout(400);
    assert.ok((await page.evaluate(() => window.FossilFrenzyUI.audio.played)).includes('win'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('fossils panel: the menu shows how many of each number are in THIS game (from its data), nothing about what is left', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=fossils]');
    assert.equal(await page.locator('.menu').count(), 0, 'the menu closes');
    const rows = await page.locator('.fossils .frow').evaluateAll(els => els.map(e => [e.querySelector('.mini').textContent, e.querySelector('b').textContent.replace(/\s+/g, ' ')]));
    const expect = await page.evaluate(() => window.FossilFrenzyUI.ui.st.data.tokens.slice().sort((a, b) => (a.gem ? 1 : 0) - (b.gem ? 1 : 0) || a.value - b.value).map(t => [t.gem ? '💎' : String(t.value), '× ' + t.count]));
    assert.deepEqual(rows, expect);
    assert.match(await page.locator('.fossils .total').innerText(), /31 tiles/);
    const text = await page.locator('.fossils').innerText();
    assert.doesNotMatch(text, /\bleft\b|remain/i, 'it does not say what remains');
    // it follows the game's own data: a different game, different counts
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.data.tokens[0].count += 2; render(); });
    assert.match(await page.locator('.fossils .frow').first().innerText(), /× 8/);
    await page.tap('[data-act=closefossils]');
    assert.equal(await page.locator('.fossils').count(), 0);
    assert.equal(await screenOf(page), 'play');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a gem always shows what it is worth: on its fossil, on the set you hold, and on the end screen', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    const gemCell = await page.evaluate(() => { const st = window.FossilFrenzyUI.ui.st; return st.tokens.find(t => t.gem && !t.matched).cell; });
    await page.tap(`[data-act=cell][data-id="${gemCell}"]`);                // peek a gem: my own number shows
    assert.equal(await page.locator(`[data-id="${gemCell}"] .num.gem`).textContent(), '12', 'the worth is under the jewel on the tile');
    assert.equal(await page.locator(`[data-id="${gemCell}"] .parch.gem`).count(), 1, 'a gem piece is a dark map piece');
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 12, gem: true, size: 3, ids: [] }]; render(); });
    assert.equal(await page.locator('.chip.cur .setbtn').first().innerText(), '💎\n12', 'and under the gem in the set you hold');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=settings]');
    const heads = await page.locator('.settings h3').allInnerTexts();
    assert.deepEqual(heads.slice(0, 2), ['Sound effects', 'Prompts above the board'], 'Sound effects come first in Settings');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('how to play: four little pictures with a line each, short, and the fine print folded away', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.tap('[data-act=help]');
    assert.equal(await page.locator('.help .hcard svg').count(), 4, 'peek, flip, match, bank — each illustrated');
    const words = await page.evaluate(() => { const c = document.querySelector('.help .sheet').cloneNode(true); c.querySelector('details').remove(); return c.innerText.split(/\s+/).filter(Boolean).length; });
    assert.ok(words < 110, 'short: ' + words + ' words');
    assert.equal(await page.locator('.help details').evaluate(d => d.open), false, 'the judgment calls are folded away');
    await page.tap('.help summary');
    assert.equal(await page.locator('.help details').evaluate(d => d.open), true, 'and open when asked');
    assert.ok((await page.locator('.help details li').count()) >= 8, 'the judgment calls are all still there');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('privacy: an opponent\'s peek is never shown — at any moment of any turn, animated or not, across whole games', SKIP, async () => {
  for (const animated of [false, true]) {
    const { browser, page, errors } = await open({ animated });
    try {
      await campaign(page, 0);
      // After every change to the page, every number showing on the board must be public (flipped this turn, or part of a match
      // from this turn) — or be MY OWN peek on MY turn. An opponent's peeked fossil is never one of them.
      await page.evaluate(() => {
        window.__leaks = []; window.__audits = 0;
        const audit = () => {
          const U = window.FossilFrenzyUI, st = U.ui.st; if (!st || U.ui.screen !== 'play') return;
          window.__audits++;
          const mine = !U.ui.bots[st.current] && !U.ui.botWaiting;
          document.querySelectorAll('.board .cell').forEach(el => {
            if (!el.querySelector('.num, .gem')) return;
            let tid = st.tokenAt[+el.dataset.id]; if (tid < 0) tid = (st.turn.matched || []).find(i => st.tokens[i].cell === +el.dataset.id);
            const isPublic = (st.turn.revealed || []).includes(tid) || (st.turn.matched || []).includes(tid);
            const myPeek = mine && tid === st.turn.peeked;
            if (!isPublic && !myPeek) window.__leaks.push({ turn: st.turnNo, cur: st.current, tid, phase: st.phase, peeked: st.turn.peeked, botWaiting: U.ui.botWaiting });
            if (!mine && el.querySelector('.tile.peek')) window.__leaks.push({ peekClassOnOpponent: tid });
          });
        };
        new MutationObserver(audit).observe(document.getElementById('app') || document.body, { subtree: true, childList: true, attributes: true });
      });
      for (let t = 0; t < 14; t++) {
        if (await page.evaluate(() => window.FossilFrenzyUI.ui.st.over)) break;
        await takeATurn(page);
        await page.waitForTimeout(animated ? 120 : 0);
      }
      const r = await page.evaluate(() => ({ leaks: window.__leaks, audits: window.__audits }));
      assert.ok(r.audits > 20, 'the audit actually ran: ' + r.audits);
      assert.deepEqual(r.leaks, [], 'an opponent\'s peek was shown');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('tapping the fossil you peeked at does nothing: its number stays, nothing animates, the turn is unchanged', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await passAndPlay(page, 2);
    const first = await firstFree(page);
    await page.tap(first);                                                  // peek
    await page.waitForTimeout(700);
    const snap = () => page.evaluate(() => { const U = window.FossilFrenzyUI, st = U.ui.st; return { phase: st.phase, T: st.turn.T, peekTiles: document.querySelectorAll('.tile.peek').length, board: document.querySelector('.boardwrap').innerHTML }; });
    const before = await snap();
    assert.equal(before.phase, 'peeked');
    assert.equal(before.peekTiles, 1, 'my peeked number is showing');
    await page.tap(first);                                                  // tap it again
    const mid = await page.evaluate(() => document.querySelectorAll('.tile.lift, .ring.pulse, .tile.flipping').length);
    const after = await snap();
    assert.equal(after.phase, 'peeked'); assert.equal(after.T, before.T);
    assert.equal(after.peekTiles, 1, 'the number is still showing: no hiding it');
    assert.equal(mid, 0, 'no animation');
    assert.equal(after.board, before.board, 'the board was not even redrawn');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('held sets are shown highest to lowest, and a tap still banks the set you touched', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI;
      ui.st.players[ui.st.current].sets = [3, 12, 7, 5].map(v => ({ value: v, gem: v === 12, size: v === 12 ? 3 : 2, ids: [] }));
      render();
    });
    const banker = await page.evaluate(() => window.FossilFrenzyUI.ui.st.current);
    assert.deepEqual(await page.locator('.chip.cur .setbtn').allInnerTexts(), ['💎\n12', '7', '5', '3'], 'gem (12) first, then 7, 5, 3');
    await page.tap('.chip.cur .setbtn >> nth=2');                          // the "5"
    assert.equal(await page.evaluate(b => window.FossilFrenzyUI.ui.st.players[b].points, banker), 5);
    assert.deepEqual(await page.evaluate(b => window.FossilFrenzyUI.ui.st.players[b].sets.map(x => x.value), banker), [3, 12, 7]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('end screen: a win says what happened once (the headline), the unlock is a quiet non-button line; a win offers the next level, the same level again and the menu; a loss the same level again', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);
    await forceFinish(page, [30, 10]);
    assert.match(await page.locator('.unlock').innerText(), /Novice unlocked/);
    assert.ok(await page.evaluate(() => document.querySelector('.unlock').getBoundingClientRect().top < innerHeight / 2), 'in the top half of the screen, not tucked away');
    assert.ok(await page.evaluate(() => { const h = document.querySelector('h1'), u = document.querySelector('.unlock'); return parseFloat(getComputedStyle(h).fontSize) > parseFloat(getComputedStyle(u).fontSize); }), 'the headline outranks the unlock line');
    assert.equal(await page.evaluate(() => { const st = getComputedStyle(document.querySelector('.unlock')); return [st.backgroundImage, st.boxShadow, document.querySelector('.unlock').tagName]; }).then(r => r.join()), 'none,none,P', 'it does not look like a button');
    assert.deepEqual(await page.locator('.over-buttons button').allInnerTexts(), ['Next: Novice', 'Play Beginner again', 'Main menu'], 'a win: on, the same level again, or the menu');
    assert.ok(await page.locator('.confetti').count());
    await page.tap('[data-act=home]'); await chooseMode(page, 'campaign'); await page.tap('[data-act=level][data-i="0"]'); await page.tap('[data-act=begin]');
    await forceFinish(page, [5, 20]);
    assert.deepEqual(await page.locator('.over-buttons button').allInnerTexts(), ['Play Beginner again', 'Main menu']);
    assert.equal(await page.locator('.unlock, .confetti').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('end screen: each player\'s fossils are two labelled rows — Banked, and Matched, not banked — with no "+" anywhere', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => {
      const { ui } = window.FossilFrenzyUI, st = ui.st;
      st.players[0].banked = [{ value: 7, gem: false, base: 7 }, { value: 3, gem: false, base: 3 }]; st.players[0].sets = [{ value: 5, gem: false, size: 2, ids: [] }, { value: 12, gem: true, size: 3, ids: [] }];
      st.players[1].banked = []; st.players[1].sets = [];
    });
    await forceFinish(page, [11, 0]);
    const first = page.locator('.place').first();
    assert.deepEqual(await first.locator('.rowlab').evaluateAll(els => els.map(e => e.textContent)), ['Dug', 'Found, not dug']);
    assert.deepEqual(await first.locator('.tiles:not(.lostrow) .mini').allInnerTexts(), ['7', '3']);
    assert.deepEqual(await first.locator('.tiles.lostrow .mini').allInnerTexts(), ['💎\n12', '5']);
    assert.doesNotMatch(await page.locator('.results').innerText(), /\+/);
    assert.deepEqual(await page.locator('.place').nth(1).locator('.dim').allInnerTexts(), ['none', 'none']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- settings: unlock everything ----------
test('settings: reachable from the main menu and from the in-game menu; holds the prompts choice', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.tap('[data-act=settings]');
    assert.match(await page.locator('.settings').innerText(), /Settings/);
    assert.equal(await page.locator('.settings [data-act=hints]').count(), 3);
    await page.tap('[data-act=closesettings]');
    assert.equal(await page.locator('.settings').count(), 0);
    await passAndPlay(page, 2);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=settings]');
    assert.equal(await page.locator('.settings').count(), 1);
    await page.tap('[data-act=closesettings]');
    assert.equal(await screenOf(page), 'play');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('settings: "Unlock all opponents" warns first (recommended: play the campaign), then opens every level — and it sticks', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 4);
    await page.tap('[data-act=home]');
    await page.tap('[data-act=settings]');
    await page.tap('[data-act=unlock-ask]');
    const warning = await page.locator('.settings .warn').innerText();
    assert.match(warning, /Unlock all opponents\?/);
    assert.match(warning, /intended way/i);
    assert.match(warning, /lock them again/i, 'it says it can be undone');
    assert.doesNotMatch(warning, /you're very welcome|just so you know/i);
    await page.tap('[data-act=unlock-no]');                               // keeping the campaign as is changes nothing
    await page.tap('[data-act=closesettings]');
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 4, 'still locked after keeping the campaign as is');
    await page.tap('[data-act=home]');
    await page.tap('[data-act=settings]'); await page.tap('[data-act=unlock-ask]'); await page.tap('[data-act=unlock-yes]');
    assert.match(await page.locator('.settings').innerText(), /All opponents are unlocked/);
    await page.tap('[data-act=closesettings]');
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 0, 'every level is open');
    await page.tap('[data-act=level][data-i="4"]'); await page.tap('[data-act=begin]');
    assert.deepEqual(await page.evaluate(() => window.FossilFrenzyUI.ui.names), ['You', 'Master']);
    assert.equal(await page.evaluate(() => localStorage.getItem('tabletop-library-fossil-frenzy-campaign')), null, 'unlocking is not the same as winning: no progress is recorded');
    await quitToStart(page);
    await page.reload();                                                   // it stays unlocked
    await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 0);
    assert.equal(await page.locator('.lvl.done').count(), 0, 'and nothing is marked beaten');
    // and it can be switched back
    await page.tap('[data-act=home]'); await page.tap('[data-act=settings]'); await page.tap('[data-act=reset-ask]'); await page.tap('[data-act=reset-yes]');
    await page.tap('[data-act=closesettings]'); await chooseMode(page, 'campaign');
    assert.equal(await page.locator('.lvl.locked').count(), 4);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a visible tell: when an opponent slips (taps the wrong spot, or plays a random move) it mutters something on its chip until you act', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await campaign(page, 0);                                               // Beginner slips a lot
    let said = '';
    for (let i = 0; i < 60 && !said; i++) {
      await takeATurn(page);
      said = await page.evaluate(() => (window.FossilFrenzyUI.ui.botWaiting ? window.FossilFrenzyUI.ui.say : ''));
    }
    assert.ok(said, 'saw the opponent slip');
    assert.ok(['Hm…', 'Oops!', 'Wait — no.'].includes(said));
    assert.equal(await page.locator('.chip.cur .say').innerText(), said);
    assert.equal(await page.locator('.chip:not(.cur) .say').count(), 0, 'only the one that slipped');
    await page.tap(await firstFree(page));                                 // my first tap starts my turn: the remark goes
    assert.equal(await page.locator('.say').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------- Torn Treasure: the look, the films, the reminders, what the others flipped ----------
const pairOf = page => page.evaluate(() => {
  const st = window.FossilFrenzyUI.ui.st, by = {};
  for (const t of st.tokens) if (!t.gem && !t.matched) (by[t.value] = by[t.value] || []).push(t);
  const v = Object.values(by).find(a => a.length >= 2);
  return v.slice(0, 2).map(t => `[data-act=cell][data-id="${t.cell}"]`);
});
const missOf = page => page.evaluate(() => {          // two fossils that do not match (neither a gem)
  const st = window.FossilFrenzyUI.ui.st, free = st.tokens.filter(t => !t.matched && !t.gem && !window.FossilFrenzyUI.ui.recall.some(e => e.tid === t.id));
  const a = free[0], b = free.find(t => t.value !== a.value);
  return [a, b].map(t => `[data-act=cell][data-id="${t.cell}"]`);
});
const filmOver = page => page.waitForFunction(() => !window.FossilFrenzyUI.ui.fx, null, { timeout: 15000 });

test('theme: face down a tile is sand, face up half of a torn treasure map in its tier\'s colours, with the number biggest; the title says Torn Treasure', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    assert.equal(await page.title(), 'Torn Treasure');
    assert.match(await page.locator('h1.logo').innerText(), /Torn\s+Treasure/);
    await passAndPlay(page, 2);
    assert.ok(await page.locator('svg.board .tile .sand').count() >= 30, 'face down: sand');
    const tiers = await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI, st = ui.st, seen = {};
      st.tokens.forEach(t => { st.turn.revealed.push(t.id); });          // show everything, to look at the art
      render();
      const out = {};
      st.tokens.forEach(t => { const el = document.querySelector(`[data-id="${t.cell}"] .parch`); if (el) out[t.gem ? 'gem' : t.value] = el.getAttribute('class'); });
      return out;
    });
    const want = { 2: 'plain', 3: 'plain', 5: 'aged', 6: 'aged', 7: 'aged', 9: 'gold', 10: 'gold', 12: 'gem' };
    for (const [v, tier] of Object.entries(want)) if (tiers[v] || tiers[v] === '') assert.match(tiers[v], new RegExp('parch ' + tier), v + ' is ' + tier);
    assert.ok(await page.locator('.parch.gem').count() >= 3, 'gem pieces are dark map pieces');
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.tile .num:not(.gem)')].map(n => parseFloat(getComputedStyle(n).fontSize)));
    assert.ok(sizes.length && Math.min(...sizes) >= 25, 'the number is large on every tile: ' + Math.min(...sizes));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a match: the film plays (tiles lift and slide together, become one square map, fly to the player\'s maps), then the turn ends by itself', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await passAndPlay(page, 2);
    const who = await page.evaluate(() => window.FossilFrenzyUI.ui.st.current), turn = await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo);
    const [a, b] = await pairOf(page);
    await page.tap(a); await page.tap(b);
    await page.waitForFunction(() => window.FossilFrenzyUI.ui.fx && document.querySelectorAll('#fx .flyer').length === 2);
    assert.equal(await page.locator('#fx .flysq').count(), 1, 'the square map is ready to appear');
    assert.equal(await page.locator('#fx').evaluate(e => getComputedStyle(e).pointerEvents), 'none', 'the film never takes a tap');
    assert.equal(await page.locator(`.chip[data-p="${who}"] .setbtn.landing`).count(), 1, 'the map\'s place in the player\'s maps is waiting');
    await page.waitForFunction(t => window.FossilFrenzyUI.ui.st.turnNo > t, turn, { timeout: 15000 });
    assert.equal(await page.locator('#fx > *').count(), 0, 'the layer is cleared');
    assert.equal(await page.evaluate(w => window.FossilFrenzyUI.ui.st.players[w].sets.length, who), 1);
    assert.equal(await page.locator(`.chip[data-p="${who}"] .setbtn`).count(), 1, 'the found map sits with its player');
    assert.equal(await page.evaluate(w => window.FossilFrenzyUI.ui.st.players[w].points, who), 0, 'found, not scored');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a match: a tap skips the film and the turn still ends; with reduced motion there is no film and a tap ends the turn as before', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await passAndPlay(page, 2);
    const turn = await page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo);
    const [a, b] = await pairOf(page);
    await page.tap(a); await page.tap(b);
    await page.waitForFunction(() => !!window.FossilFrenzyUI.ui.fx);
    await page.tap('.boardwrap');
    assert.equal(await page.evaluate(() => !!window.FossilFrenzyUI.ui.fx), false);
    assert.equal(await page.evaluate(t => window.FossilFrenzyUI.ui.st.turnNo, turn), turn + 1, 'the turn ended');
  } finally { await browser.close(); }
  const r = await open();
  try {
    await passAndPlay(r.page, 2);
    const [a, b] = await pairOf(r.page);
    await r.page.tap(a); await r.page.tap(b);
    assert.equal(await r.page.evaluate(() => !!window.FossilFrenzyUI.ui.fx), false, 'no film');
    assert.equal(await r.page.evaluate(() => window.FossilFrenzyUI.ui.st.phase), 'resolved', 'waiting for the tap');
    assert.equal(await r.page.locator('[data-act=end]').count(), 1);
    assert.deepEqual(r.errors, []);
  } finally { await r.browser.close(); }
});

test('digging a map up: the film plays (the map becomes an open chest, the points count up), then the turn ends; the score is right', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await passAndPlay(page, 2);
    const who = await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 7, gem: false, size: 2, ids: [] }]; render(); return ui.st.current; });
    await page.tap('.chip.cur .setbtn[data-i="0"]');
    await page.waitForFunction(() => window.FossilFrenzyUI.ui.fx && window.FossilFrenzyUI.ui.fx.kind === 'dig');
    assert.equal(await page.locator('#fx .chest').count(), 1, 'the chest');
    assert.equal(await page.locator('#fx .plus').innerText(), '+7');
    await page.waitForFunction(() => !window.FossilFrenzyUI.ui.fx, null, { timeout: 15000 });
    assert.equal(await page.evaluate(w => window.FossilFrenzyUI.ui.st.players[w].points, who), 7);
    assert.equal(await page.locator(`.chip[data-p="${who}"] .pts`).innerText(), '7', 'the count ends on the score');
    assert.notEqual(await page.evaluate(w => window.FossilFrenzyUI.ui.st.current, who), who, 'the turn ended');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('reminder: the first match on the easiest level says the map is not scored yet and how to score it; once per device; never on other levels', SKIP, async () => {
  const { browser, page, errors } = await open({ tips: true });
  try {
    await campaign(page, 0);
    const turn = () => page.evaluate(() => window.FossilFrenzyUI.ui.st.turnNo);
    const [a, b] = await pairOf(page);
    await page.tap(a);
    if (await page.evaluate(() => window.FossilFrenzyUI.ui.st.current) === 0) { await page.tap(b); }
    else { await page.tap(await pairOf(page).then(p => p[1])); }
    const t0 = await turn();
    assert.equal(await page.locator('.tip').count(), 1, 'a reminder appears');
    const text = await page.locator('.tip').innerText();
    assert.match(text, /isn.t scored/i); assert.match(text, /tap it/i); assert.match(text, /later turn/i); assert.ok(text.split(/\s+/).length < 40, 'short: ' + text.split(/\s+/).length + ' words');
    assert.equal(await page.locator('.chip.cur .setbtn.spot').count() + await page.locator('.setbtn.spot').count() >= 1, true, 'the map in question is lit');
    assert.equal(await turn(), t0, 'play waits for the tap');
    await page.tap('[data-act=tip-ok]');
    assert.equal(await page.locator('.tip').count(), 0);
    assert.deepEqual(errors, []);
    // not again on this device
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('tabletop-library-fossil-frenzy-tips')));
    assert.ok(seen.includes('match'));
  } finally { await browser.close(); }
});

test('reminder (Pass & Play): the first gem turned up gets a small "What\'s that?" button — nothing covered, play not held up; a tap shows a picture; Rules reminders Off: no button', SKIP, async () => {
  const { browser, page, errors } = await open({ tips: true });
  try {
    await chooseMode(page, 'pass');
    assert.equal(await page.locator('[data-act=reminders][data-v=on].on').count(), 1, 'reminders are on by default for Pass & Play');
    await page.tap('[data-act=deal]'); await page.tap('[data-act=begin]');
    const gems = await page.evaluate(() => window.FossilFrenzyUI.ui.st.tokens.filter(t => t.gem).map(t => `[data-act=cell][data-id="${t.cell}"]`));
    await page.tap(gems[0]);
    assert.equal(await page.locator('.tip, .tipback').count(), 0, 'no note and no dimming: the gem is simply there');
    assert.match(await page.locator('.whatbtn').innerText(), /What.s that\?/);
    const clear = await page.evaluate(() => { const u = window.FossilFrenzyUI.ui, b = document.querySelector('.whatbtn').getBoundingClientRect(), c = document.querySelector(`.cell[data-id="${u.st.tokens[u.what.tid].cell}"]`).getBoundingClientRect(); return b.right < c.left || b.left > c.right || b.bottom < c.top || b.top > c.bottom; });
    assert.equal(clear, true, 'the button does not sit on the gem');
    await page.tap(gems[1]);                                    // play goes on without tapping the button
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.phase), 'flipped');
    await page.tap('[data-act=what]');
    assert.equal(await page.locator('.tip svg.gempic').count(), 1, 'a picture');
    assert.ok((await page.locator('.tip').innerText()).split(/\s+/).length < 40, 'and a line, not a paragraph');
    assert.equal(await page.locator('.whatbtn').count(), 0);
    await page.tap('[data-act=tip-ok]');
    assert.equal(await page.locator('.tip').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  const off = await open({ tips: true });
  try {
    const { page: p } = off;
    await chooseMode(p, 'pass');
    await p.tap('[data-act=reminders][data-v=off]');
    assert.equal(await p.locator('[data-act=reminders][data-v=off].on').count(), 1);
    await p.reload(); await chooseMode(p, 'pass');
    assert.equal(await p.locator('[data-act=reminders][data-v=off].on').count(), 1, 'remembered');
    await p.tap('[data-act=deal]'); await p.tap('[data-act=begin]');
    const gems = await p.evaluate(() => window.FossilFrenzyUI.ui.st.tokens.filter(t => t.gem).map(t => `[data-act=cell][data-id="${t.cell}"]`));
    await p.tap(gems[0]); await p.tap(gems[1]);
    assert.equal(await p.locator('.tip, .whatbtn').count(), 0, 'no reminders');
    assert.equal(await p.evaluate(() => window.FossilFrenzyUI.ui.st.phase), 'flipped');
    assert.deepEqual(off.errors, []);
  } finally { await off.browser.close(); }
});

test('Pass & Play: the next player sees the one fossil the last player flipped second (never the one they only peeked), ringed in that player\'s colour', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    const first = await page.evaluate(() => window.FossilFrenzyUI.ui.st.current);
    const [a, b] = await missOf(page);
    const ids = await page.evaluate(([x, y]) => [x, y].map(sel => { const c = +sel.match(/data-id="(\d+)"/)[1]; return window.FossilFrenzyUI.ui.st.tokens.find(t => t.cell === c).id; }), [a, b]);
    await page.tap(a); await page.tap(b);
    assert.equal(await page.locator('.tile.seen').count(), 0, 'my own flips are not "seen" tiles: they are my turn');
    await page.tap('[data-act=end]');
    assert.equal(await page.locator('.tile.seen').count(), 0, 'behind the turn card nothing is shown');
    await page.tap('[data-act=begin]');
    assert.equal(await page.locator('.tile.seen').count(), 1, 'exactly one tile: the one that was flipped second');
    const cellB = await page.evaluate(id => window.FossilFrenzyUI.ui.st.tokens[id].cell, ids[1]), cellA = await page.evaluate(id => window.FossilFrenzyUI.ui.st.tokens[id].cell, ids[0]);
    assert.equal(await page.locator(`[data-id="${cellB}"] .tile.seen`).count(), 1);
    assert.equal(await page.locator(`[data-id="${cellA}"] .tile.up, [data-id="${cellA}"] .tile.peek`).count(), 0, 'the private peek stays private');
    const ring = await page.locator(`[data-id="${cellB}"] .ring`).evaluate(e => e.style.stroke);
    assert.ok(ring.length > 0, 'a ring in the flipper\'s colour: ' + ring);
    assert.match(await page.locator('.hint').innerText(), /ringed/i);
    assert.notEqual(first, await page.evaluate(() => window.FossilFrenzyUI.ui.st.current));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Pass & Play (3 players): you see every fossil flipped since the end of your last turn, from each player, and only those', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 3);
    const seenCount = () => page.locator('.tile.seen').count();
    const flipped = [];
    for (let turn = 0; turn < 4; turn++) {
      const [a, b] = await missOf(page);
      const tid = await page.evaluate(sel => { const c = +sel.match(/data-id="(\d+)"/)[1]; return window.FossilFrenzyUI.ui.st.tokens.find(t => t.cell === c).id; }, b);
      // this player sees what the others flipped since their last turn: 0, 1, 2, then (turn 3: the first player again) the two others'
      const expected = turn === 0 ? 0 : turn === 1 ? 1 : turn === 2 ? 2 : 2;
      assert.equal(await seenCount(), expected, 'turn ' + turn);
      await page.tap(a); await page.tap(b);
      flipped.push(tid);
      await page.tap('[data-act=end]'); await page.tap('[data-act=begin]');
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Pass & Play: a flipped fossil that has since been matched is not shown any more; the Campaign never shows the opponent\'s flips this way', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    const [a, b] = await missOf(page);
    await page.tap(a); await page.tap(b);
    await page.tap('[data-act=end]'); await page.tap('[data-act=begin]');
    assert.equal(await page.locator('.tile.seen').count(), 1);
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI, e = ui.recall[0]; ui.st.tokens[e.tid].matched = true; ui.st.tokenAt[ui.st.tokens[e.tid].cell] = -1; render(); });
    assert.equal(await page.locator('.tile.seen').count(), 0, 'matched: gone from the board, gone from the ringed ones');
    await quitToStart(page);
    await campaign(page, 0);
    assert.equal(await page.locator('.tile.seen').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.FossilFrenzyUI.ui.recall), [], 'nothing is remembered in the Campaign');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('layout, portrait first: iPad portrait (820 x 1180) and iPhone 17 portrait (402 x 874) — the board, the scoreboard and every button fit and are big enough to tap', SKIP, async () => {
  for (const [w, h, minMenu, minEnd] of [[820, 1180, 72, 64], [402, 874, 56, 52]]) {
    const { browser, page, errors } = await open({ viewport: { width: w, height: h } });
    try {
      await passAndPlay(page, 4);
      const box = sel => page.locator(sel).first().boundingBox();
      const menu = await box('.q');
      assert.ok(menu.width >= minMenu && menu.height >= minMenu, `the menu button is at least ${minMenu}px (${w}): ${JSON.stringify(menu)}`);
      const overflow = await page.evaluate(() => [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight]);
      assert.deepEqual(overflow, [false, false], 'nothing scrolls');
      const bar = await box('.chips'), board = await box('svg.board');
      assert.ok(bar.x >= 0 && bar.x + bar.width <= w + 0.5, 'the scoreboard fits the width');
      assert.ok(board.width >= w * 0.9, `the board uses the width in portrait: ${board.width} of ${w}`);
      await page.tap(await firstFree(page)); await page.tap(await otherFree(page));
      const end = await box('[data-act=end]');
      assert.ok(end.height >= minEnd, `End turn is easy to tap (${w}): ${JSON.stringify(end)}`);
      await page.tap('[data-act=end]');
      const start = await box('.tc-tap');
      assert.ok(start.height >= minEnd + 8, `"Tap to start your turn" is big (${w}): ${JSON.stringify(start)}`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('campaign screen: a full-width card per opponent with its board and name (no sizes, no worths, no unlock text, no dots, no Begin button: the whole card is the button), Beaten / a lock; big back button', SKIP, async () => {
  for (const [w, h] of [[820, 1180], [402, 874]]) {
    const { browser, page, errors } = await open({ viewport: { width: w, height: h } });
    try {
      await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-campaign', JSON.stringify({ beaten: ['beginner'] }))); await page.reload();
      await chooseMode(page, 'campaign');
      const rows = page.locator('.lvl');
      assert.equal(await rows.count(), 5);
      assert.equal(await page.locator('.camp-head .pips, .progress').count(), 0, 'no row of dots next to the title');
      assert.doesNotMatch(await page.locator('.sheet').innerText(), /opponents? beaten|Choose your opponent/i);
      assert.match(await rows.nth(0).innerText(), /Beginner[\s\S]*Beaten/);
      assert.match(await rows.nth(1).innerText(), /Novice/);
      assert.match(await rows.nth(2).innerText(), /Normal/);
      assert.doesNotMatch(await page.locator('.levels').innerText(), /tiles|worth|unlock|Beat \w+ to/i, 'no sizes, gem worths or unlock requirements: the lock says it');
      assert.equal(await rows.nth(2).locator('[aria-label=Locked]').count(), 1);
      assert.equal(await page.locator('.lvl.next').count(), 1);
      assert.equal(await page.locator('.lvl .mini-board').count(), 5, 'each card shows its board');
      const first = await rows.nth(0).boundingBox(), back = await page.locator('.back').boundingBox();
      assert.ok(first.height >= 80, 'cards are big: ' + first.height);
      assert.ok(first.width >= w * 0.8, 'and wide: ' + first.width);
      assert.ok(back.height >= 44 && back.width >= 44, 'the back button is at least 44pt');
      const sizes = await rows.evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
      assert.ok(Math.min(...sizes) >= 80);
      await rows.nth(3).tap({ force: true });                             // a locked level does nothing
      assert.equal(await screenOf(page), 'campaign');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('end screen: the results sit in the middle of the page, not hung from the top; Play <level> again deals the same level afresh', SKIP, async () => {
  for (const [w, h] of [[820, 1180], [402, 874]]) {
    const { browser, page, errors } = await open({ viewport: { width: w, height: h } });
    try {
      await campaign(page, 0);
      await forceFinish(page, [5, 20]);
      const box = await page.locator('.over-sheet').boundingBox();
      const above = box.y, below = h - (box.y + box.height);
      assert.ok(above > 20 && Math.abs(above - below) < Math.max(60, h * 0.1), `centred vertically (${w}): ${above} above, ${below} below`);
      assert.ok(Math.abs((box.x + box.width / 2) - w / 2) < 4, 'centred across');
      await page.tap('[data-act=again]');
      assert.equal(await screenOf(page), 'play');
      assert.equal(await page.evaluate(() => [window.FossilFrenzyUI.ui.mode, window.FossilFrenzyUI.ui.levelIdx, window.FossilFrenzyUI.ui.st.over].join()), 'campaign,0,false', 'the same level, a fresh game');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('puzzle pieces: a tile that is flipped but not matched has no torn side; once matched, the two are torn and face each other; a match is not put back on the board', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await passAndPlay(page, 2);
    const [a, b] = await missOf(page);
    await page.tap(a); await page.tap(b);
    const cells = await page.locator('.tile.up .parch').evaluateAll(els => els.map(e => e.getAttribute('d')));
    assert.ok(cells.length >= 1 && cells.every(d => (d.match(/L/g) || []).length === 6), 'flipped, not matched: plain hexagons');
    await page.tap('[data-act=end]'); await page.tap('[data-act=begin]');
    const [c, d] = await pairOf(page);
    await page.tap(c); await page.tap(d);
    const matched = await page.locator('.tile.up .parch').evaluateAll(els => els.map(e => (e.getAttribute('d').match(/L/g) || []).length));
    assert.equal(matched.filter(n => n > 6).length, 2, 'the two matched tiles are torn: ' + matched);
    assert.equal(await page.locator('.gone').count(), 0, 'no film (reduced motion): they stay face up');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('an opponent\'s match: its maps fly to it and are not put back on the board — an empty, dashed space marks where they were', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true });
  try {
    await campaign(page, 0);
    await page.evaluate(() => {          // make the opponent\'s next turn a certain match: it will peek one tile of a pair and flip the other
      const { ui } = window.FossilFrenzyUI; ui.st.rng = () => 0.5;
    });
    let found = false;
    for (let g = 0; g < 40 && !found; g++) {
      await idle(page);
      const info = await page.evaluate(() => { const u = window.FossilFrenzyUI.ui, st = u.st; return { bw: u.botWaiting, cur: st.current, matched: st.turn.matched, over: st.over }; });
      if (info.over) break;
      if (info.bw && info.matched && info.cur === 1) {
        found = true;
        const cells = await page.evaluate(() => window.FossilFrenzyUI.ui.st.turn.matched.map(i => window.FossilFrenzyUI.ui.st.tokens[i].cell));
        for (const c of cells) {
          assert.equal(await page.locator(`[data-id="${c}"] .tile`).count(), 0, 'no tile put back');
          assert.equal(await page.locator(`[data-id="${c}"] .gone`).count(), 1, 'a dashed space where it was');
        }
        assert.equal(await page.locator('.chip[data-p="1"] .setbtn').count() >= 1, true, 'the map is with the opponent');
        break;
      }
      await takeATurn(page);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Pass & Play board sizes: five to choose from; the size is picked from the number of players until you choose; it is kept for the game, a replay and a save', SKIP, async () => {
  const { browser, page, errors } = await open({ tips: true });
  try {
    await chooseMode(page, 'pass');
    assert.equal(await page.locator('[data-act=size]').count(), 5);
    assert.deepEqual(await page.locator('[data-act=size]').allInnerTexts().then(a => a.map(t => t.replace(/\s+/g, ' '))), ['Tiny 18 tiles', 'Small 21 tiles', 'Medium 25 tiles', 'Large 31 tiles', 'Huge 37 tiles']);
    const on = () => page.locator('[data-act=size].on').getAttribute('data-v');
    for (const [n, size] of [[2, 'medium'], [3, 'large'], [4, 'huge']]) {
      await page.tap(`[data-act=n][data-v="${n}"]`);
      assert.equal(await on(), size, n + ' players');
      assert.match(await page.locator('.sheet').innerText(), new RegExp('Picked for ' + n + ' players'));
    }
    await page.tap('[data-act=size][data-v=tiny]');
    assert.match(await page.locator('.sheet').innerText(), /The size you chose/);
    await page.tap('[data-act=n][data-v="2"]');
    assert.equal(await on(), 'tiny', 'a size you chose stays when the number of players changes');
    await page.reload(); await chooseMode(page, 'pass');
    assert.equal(await on(), 'tiny', 'remembered');
    await page.tap('[data-act=deal]'); await page.tap('[data-act=begin]');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.tokens.length), 18);
    assert.equal(await page.locator('svg.board .cell').count(), 18);
    await page.reload();
    await page.tap('[data-act=mode][data-v=pass]'); await page.tap('[data-act=continue]'); await page.tap('[data-act=begin]');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.tokens.length), 18, 'the saved game keeps its board');
    await forceFinish(page, [4, 2]);
    await page.tap('[data-act=again]');
    assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.tokens.length), 18, 'play again: the same size');
    await quitToStart(page);
    await chooseMode(page, 'pass'); await page.tap('[data-act=size][data-v=huge]'); await page.tap('[data-act=deal]');
    assert.equal(await page.evaluate(() => [window.FossilFrenzyUI.ui.st.tokens.length, window.FossilFrenzyUI.ui.st.tokens.filter(t => t.gem).length].join()), '37,3');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('reminder: nothing at the start of Novice; when the opponent turns a gem up for the first time the "What\'s that?" button appears (and its turn goes on)', SKIP, async () => {
  const { browser, page, errors } = await open({ tips: true, animated: true, viewport: { width: 820, height: 1180 } });
  try {
    await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-campaign', JSON.stringify({ beaten: ['beginner'] }))); await page.reload();
    await chooseMode(page, 'campaign'); await page.tap('[data-act=level][data-i="1"]');
    assert.equal(await page.locator('.tip').count(), 0, 'nothing at the start of the level');
    // an opponent turns a gem face up: make the opponent\'s next turn do exactly that (rig the shown steps)
    await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI, st = ui.st, gem = st.tokens.find(t => t.gem), other = st.tokens.find(t => !t.gem);
      ui.turnCard = false; ui.botWaiting = true; st.current = 1;
      ui.base = { points: 0, sets: [] };
      ui.steps = [{ a: { type: 'peek', tid: other.id }, snap: { points: 0, sets: [] } }, { a: { type: 'flipOther', tid: gem.id }, snap: { points: 0, sets: [] } }];
      ui.stage = 1; render(); window.FossilFrenzyUI.startAnim();
    });
    await page.waitForSelector('.whatbtn', { timeout: 5000 });
    assert.equal(await page.locator('.tip').count(), 0, 'no note over the board');
    await page.tap('[data-act=what]');
    assert.equal(await page.locator('.tip svg.gempic').count(), 1);
    assert.match(await page.locator('.tip').innerText(), /worth 10/, 'what a gem map is worth');
    await page.tap('[data-act=tip-ok]');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=quit]');
    // now my own: peek a gem on my turn (not shown again: once per device)
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('tabletop-library-fossil-frenzy-tips')));
    assert.ok(seen.includes('gem'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('iPhone 17 portrait: no menu screen scrolls — home, settings (and its two questions), how to play, campaign, Pass & Play setup, the tiles list, the end screen — even with 780 px (the status and home bars take the rest)', SKIP, async () => {
  for (const H of [874, 780]) {
    const { browser, page, errors } = await open({ viewport: { width: 402, height: H } });
    try {
      await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-campaign', JSON.stringify({ beaten: ['beginner'] }))); await page.reload();
      const fits = async name => {
        const r = await page.evaluate(() => { const s = [...document.querySelectorAll('.screen')].pop(), box = (s.querySelector('.sheet') || s).getBoundingClientRect(); return { sh: s.scrollHeight, ch: s.clientHeight, top: box.top, bottom: box.bottom, h: innerHeight }; });
        assert.ok(r.sh <= r.ch + 1, `${name} (${H}) scrolls: ${r.sh} > ${r.ch}`);
        assert.ok(r.top >= 0 && r.bottom <= r.h + 1, `${name} (${H}) is inside the screen: ${r.top}..${r.bottom}`);
      };
      await fits('home');
      await page.tap('[data-act=settings]'); await fits('settings'); await page.tap('[data-act=unlock-ask]'); await fits('settings: unlock'); await page.tap('[data-act=unlock-no]');
      await page.tap('[data-act=reset-ask]'); await fits('settings: reset'); await page.tap('[data-act=reset-no]'); await page.tap('[data-act=closesettings]');
      await page.tap('[data-act=help]'); await fits('how to play'); await page.tap('[data-act=closehelp]');
      await chooseMode(page, 'campaign'); await fits('campaign'); await page.tap('[data-act=home]');
      await chooseMode(page, 'pass'); await page.tap('[data-act=n][data-v="4"]'); await fits('pass & play setup, 4 players');
      await page.tap('[data-act=deal]'); await page.tap('[data-act=begin]');
      await page.tap('[data-act=menu]'); await page.tap('[data-act=fossils]'); await fits('tiles list'); await page.tap('[data-act=closefossils]');
      await quitToStart(page); await page.tap('[data-act=mode][data-v=pass]'); await fits('continue or start new'); await page.tap('[data-act=newgame]'); await fits('pass & play setup, new game');
      await page.tap('[data-act=deal]'); await page.tap('[data-act=begin]');
      await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI, st = ui.st; ui.overSeen = true; st.over = true; st.phase = 'over'; st.players.forEach((p, i) => { p.points = 40 - i * 5; p.banked = Array.from({ length: 7 - i }, (_, k) => ({ value: [2, 3, 5, 6, 9, 10, 12][k], gem: k === 6, base: 3 })); p.sets = Array.from({ length: 4 }, () => ({ value: 5, gem: false, size: 2, ids: [] })); }); st.result = Engine.computeResult(st); render(); });
      await fits('end screen, 4 players, full rows');
      await page.tap('[data-act=home]'); await fits('home again'); 
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});


test('the last match of the game plays its film, and the board stays on the table until a tap brings up the results', SKIP, async () => {
  for (const animated of [true, false]) {
    const { browser, page, errors } = await open({ animated });
    try {
      await passAndPlay(page, 2);
      await page.evaluate(() => {            // leave one pair on the board
        const { ui, render } = window.FossilFrenzyUI, st = ui.st; const left = st.tokens.filter(t => !t.gem && t.value === 2).slice(0, 2).map(t => t.id);
        st.tokens.forEach(t => { if (!left.includes(t.id)) { t.matched = true; st.tokenAt[t.cell] = -1; } }); st.matchedCount = st.tokens.length - 2; render();
      });
      const [a, b] = await pairOf(page);
      await page.tap(a); await page.tap(b);
      if (animated) {
        assert.equal(await page.evaluate(() => !!window.FossilFrenzyUI.ui.fx), true, 'the last match is animated too');
        await page.waitForFunction(() => !window.FossilFrenzyUI.ui.fx, null, { timeout: 15000 });
      }
      assert.equal(await page.evaluate(() => window.FossilFrenzyUI.ui.st.over), true);
      assert.equal(await page.locator('.over-sheet').count(), 0, 'the results are not shown yet: the board is');
      assert.equal(await page.locator('svg.board').count(), 1);
      assert.equal(await page.locator('[data-act=results]').count(), 1, 'a button says how to go on');
      await page.waitForTimeout(600);
      assert.equal(await page.locator('.over-sheet').count(), 0, 'nothing on a timer');
      await page.tap('.boardwrap');
      assert.equal(await page.locator('.over-sheet').count(), 1, 'a tap anywhere brings up the results');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('the board never moves: maps, a lot of maps, a longer hint, an opponent\'s turn — the board and the scoreboard keep their place (the maps overlap like a hand when they run out of room)', SKIP, async () => {
  for (const [w, h, n] of [[820, 1180, 2], [820, 1180, 4], [402, 874, 4], [402, 874, 2]]) {
    const { browser, page, errors } = await open({ viewport: { width: w, height: h } });
    try {
      await page.evaluate(n => localStorage.setItem('tabletop-library-fossil-frenzy-passplay', JSON.stringify({ n, size: 'huge', reminders: false })), n); await page.reload();
      await chooseMode(page, 'pass'); await page.tap('[data-act=deal]'); await page.tap('[data-act=begin]');
      const where = () => page.evaluate(() => { const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(v => Math.round(v * 10) / 10); }; return { board: r('svg.board'), chips: r('.chips'), legend: r('.legend') }; });
      const base = await where();
      const give = k => page.evaluate(k => { const { ui, render } = window.FossilFrenzyUI, st = ui.st; st.players.forEach(p => { p.sets = Array.from({ length: k }, (_, i) => ({ value: [2, 3, 5, 6, 9, 10][i % 6], gem: false, size: 2, ids: [] })); }); render(); }, k);
      for (const k of [1, 3, 6, 12, 18]) { await give(k); assert.deepEqual(await where(), base, `${k} maps each (${w}x${h}, ${n} players): nothing moves`); }
      const tray = await page.evaluate(() => [...document.querySelectorAll('.chip')].map(c => { const s = c.querySelector('.sets').getBoundingClientRect(), t = [...c.querySelectorAll('.setbtn')].map(b => b.getBoundingClientRect()); return { rows: new Set(t.map(b => Math.round(b.top))).size, inside: t.every(b => b.left >= c.getBoundingClientRect().left - 1 && b.right <= c.getBoundingClientRect().right + 1) }; }));
      assert.ok(tray.every(t => t.rows === 1 && t.inside), 'one row, inside its scoreboard: ' + JSON.stringify(tray));
      await give(2); await page.tap(await firstFree(page));                           // a peek: the hint changes
      assert.deepEqual(await where(), base, 'after a peek');
      await page.tap(await otherFree(page));
      assert.deepEqual(await where(), base, 'after a flip');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('scoring is quick: a chest pops open in the middle of the table (under a second), coins burst, the points fly to the score and count up; the little line says what happened — for me and for the opponent; no pop-up', SKIP, async () => {
  const { browser, page, errors } = await open({ animated: true, viewport: { width: 820, height: 1180 } });
  try {
    await passAndPlay(page, 2);
    await page.evaluate(() => { const { ui, render } = window.FossilFrenzyUI; ui.st.players[ui.st.current].sets = [{ value: 9, gem: false, size: 2, ids: [] }]; render(); });
    const t0 = Date.now();
    await page.tap('.chip.cur .setbtn[data-i="0"]');
    await page.waitForSelector('#fx .chest');
    const mid = await page.evaluate(() => { const b = document.querySelector('.boardwrap').getBoundingClientRect(), c = document.querySelector('#fx .chest'); const r = c.getBoundingClientRect(); return { chestX: Math.abs((r.left + r.width / 2) - (b.left + b.width / 2)), chestW: c.offsetWidth }; });
    assert.ok(mid.chestX < 4 && mid.chestW >= 140, 'a big chest in the middle of the board: ' + JSON.stringify(mid));
    assert.equal(await page.locator('#fx .plus').innerText(), '+9');
    assert.equal(await page.locator('#fx .coin').count(), 10, 'a burst of coins');
    assert.equal(await page.locator('#fx .digtxt, .bankcard').count(), 0, 'no words on top of it');
    await page.waitForFunction(() => !window.FossilFrenzyUI.ui.fx, null, { timeout: 15000 });
    assert.ok(Date.now() - t0 < 1800, 'quick: ' + (Date.now() - t0) + ' ms');
    assert.match(await page.locator('#live').textContent(), /dug up treasure: \+9/, 'announced for screen readers');
    // the opponent: the same film (a rigged turn that is just a bank), then the little line says it
    await quitToStart(page);
    await page.evaluate(() => localStorage.setItem('tabletop-library-fossil-frenzy-tips', JSON.stringify(['match', 'gem']))); await page.reload();
    await chooseMode(page, 'campaign'); await page.tap('[data-act=level][data-i="0"]'); await page.tap('[data-act=begin]');
    await page.evaluate(() => {
      const { ui, render } = window.FossilFrenzyUI, st = ui.st; ui.turnCard = false; st.current = 1; st.players[1].points = 7; st.players[1].sets = [];
      st.turn.banked = true; st.lastBank = { player: 1, value: 7, gem: false, base: 7, total: 7, setsLeft: 0 };
      ui.base = { points: 0, sets: [{ value: 7, gem: false, size: 2 }] }; ui.steps = [{ a: { type: 'bank', set: 0 }, snap: { points: 7, sets: [] } }]; ui.stage = 0; ui.botWaiting = true; render(); window.FossilFrenzyUI.startAnim();
    });
    await page.waitForFunction(() => window.FossilFrenzyUI.ui.fx && window.FossilFrenzyUI.ui.fx.kind === 'dig', null, { timeout: 5000 });
    await page.waitForFunction(() => !window.FossilFrenzyUI.ui.fx, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.querySelector('.chip[data-p="1"] .pts').textContent), '7');
    assert.match(await page.locator('.event').innerText(), /Beginner dug up treasure: \+7/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
