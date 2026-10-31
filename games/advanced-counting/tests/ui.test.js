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
const SKIP = { skip: !chromium && 'Playwright/Chromium not available', timeout: 60000 };
const { GAME_DATA: D } = require('./load');

const IPAD_L = { width: 1024, height: 768 }, IPAD_P = { width: 768, height: 1024 }, PHONE = { width: 390, height: 844 }, SMALL = { width: 360, height: 640 };

let browser = null;
test.before(async () => { if (chromium) browser = await chromium.launch(exe ? { executablePath: exe } : {}); });
test.after(async () => { if (browser) await browser.close(); });

// A fresh page (own storage). Reduced motion by default so tests do not wait for flips; animated tests turn it off.
async function open({ viewport = IPAD_L, query = '?seed=11', animated = false, clock = true } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: animated ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
  await page.goto(FILE + query);
  if (clock) await fakeClock(page);
  return { ctx, page, errors, external, close: () => ctx.close() };
}
const fakeClock = page => page.evaluate(() => { window.__t = 0; window.AdvancedCountingUI.ui.now = () => window.__t; window.AdvancedCountingUI.ui.lockMs = 0; });   // (tests tap Next level at once; one test restores the real lock)
const advance = (page, ms) => page.evaluate(ms => { window.__t += ms; }, ms);
const S = page => page.evaluate(() => {
  const { ui } = window.AdvancedCountingUI, r = ui.round;
  return { screen: ui.screen, results: ui.results, rules: ui.rules, round: r && { level: r.def.id, layout: r.layout.slice(), phase: r.phase, next: r.next, mistakes: r.mistakes, practice: r.practice, faceUp: r.faceUp.slice(), timeMs: r.timeMs } };
});
const tapNumber = async (page, layout, n) => page.tap(`[data-pos="${layout.indexOf(n)}"]`);
const tapAll = async (page, layout, from, to) => { for (let n = from; n <= to; n++) await tapNumber(page, layout, n); };
const store = page => page.evaluate(() => JSON.parse(localStorage.getItem('tabletop-library-advanced-counting-profiles')));
const box = (page, sel) => page.locator(sel).first().boundingBox();
const texts = (page, sel) => page.locator(sel).allInnerTexts();

// Plays the level on screen from its study phase: Flip, optionally `mistakes` wrong taps (each re-deals), then 1..N.
async function playLevel(page, { mistakes = 0 } = {}) {
  const lay = (await S(page)).round.layout;
  for (let m = 0; m < mistakes; m++) { await page.tap('[data-act=flip]'); await tapNumber(page, lay, 2); }
  await page.tap('[data-act=flip]');
  await tapAll(page, lay, 1, lay.length);
  return lay;
}

// ---------------------------------------------------------------- main menu
test('menu: tagline, 58px buttons (High scores then How to play), no credit line, no sound icon, no scrolling', SKIP, async () => {
  const t = await open({ viewport: PHONE, clock: false });
  assert.equal(await t.page.locator('.tag').innerText(), 'How high can you count?');
  assert.deepEqual(await texts(t.page, '.buttons .btn'), ['High scores ▸', 'How to play']);
  const [a, b] = [await box(t.page, '.buttons .btn:nth-child(1)'), await box(t.page, '.buttons .btn:nth-child(2)')];
  assert.equal(Math.round(a.height), 58); assert.equal(Math.round(b.height), 58); assert.ok(a.y < b.y, 'High scores is above How to play');
  assert.ok(Math.abs(a.width - Math.min(PHONE.width - 36, 420)) <= 1, 'full width inside the screen margin, but never stretched past 420px'); assert.equal(Math.round(a.width), Math.round(b.width));
  assert.match(await t.page.locator('.menu .credit.by').innerText(), /By Patrick Blim-Hockberger · Version/, 'who made it, with the version and date, at the bottom');
  assert.equal(await t.page.locator('.snd, [aria-label^=Sound]').count(), 0, 'no mute icon in the corner');
  assert.equal(await t.page.locator('h1').innerText(), 'Advanced Counting');
  assert.equal(await t.page.title(), 'Advanced Counting');
  assert.deepEqual(t.errors, []); assert.deepEqual(t.external, [], 'no network');
  await t.close();
});

test('menu: Start is 124px tall (112px on a small phone), 72% wide, centred, pinned to the bottom, the profile selector just above it', SKIP, async () => {
  for (const [vp, h] of [[IPAD_L, 124], [IPAD_P, 124], [PHONE, 112], [SMALL, 112]]) {
    const t = await open({ viewport: vp, clock: false });
    const st = await box(t.page, '.start'), pr = await box(t.page, '.pbtn');
    assert.equal(Math.round(st.height), h, `${vp.width}x${vp.height}`); assert.equal(D.ui.startHeight, 124); assert.equal(D.ui.startHeightSmall, 112);
    assert.ok(Math.abs(st.width - Math.min(vp.width * 0.72, 420)) <= 1, 'width ' + st.width);
    assert.ok(Math.abs(st.x + st.width / 2 - vp.width / 2) <= 1, 'centred');
    assert.ok(vp.height - (st.y + st.height) < 60 && vp.height - (st.y + st.height) >= 0, 'pinned to the bottom');
    assert.ok(st.y - (pr.y + pr.height) >= 0 && st.y - (pr.y + pr.height) < 30, 'selector sits just above Start');
    assert.equal(await t.page.locator('.start').innerText(), 'Start');
    assert.equal(await t.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
    await t.close();
  }
});

test('menu: the profile dropdown opens upward, lists profiles, "+ New profile", and a quiet "Rename profile…" at the very bottom', SKIP, async () => {
  const t = await open({ viewport: PHONE });
  assert.equal(await t.page.locator('.pname').innerText(), 'Player 1');
  await t.page.tap('[data-act=profile]');
  const d = await box(t.page, '.pdrop'), p = await box(t.page, '.pbtn');
  assert.ok(d.y + d.height <= p.y, 'above the selector, not below'); assert.ok(d.y >= 0);
  const items = await texts(t.page, '.pitem');
  assert.equal(items[items.length - 1], 'Rename profile…'); assert.ok(items.some(x => /New profile/.test(x))); assert.ok(items[0].includes('Player 1'));
  await t.page.tap('[data-act=newprofile]');
  assert.equal(await t.page.locator('.pname').innerText(), 'Player 2');
  await t.page.tap('[data-act=profile]'); assert.equal((await texts(t.page, '.pitem')).filter(x => /Player/.test(x)).length, 2);
  await t.page.tap('[data-act=pick][data-id="p1"]');
  assert.equal(await t.page.locator('.pname').innerText(), 'Player 1');
  assert.equal(await t.page.locator('.pdrop').count(), 0, 'picking closes it');
  assert.deepEqual(t.errors, []); await t.close();
});

test('menu: Rename profile… rejects blank names, keeps records, and the new name is remembered', SKIP, async () => {
  const t = await open({ viewport: PHONE });
  await t.page.evaluate(() => { const { ui } = window.AdvancedCountingUI; Object.assign(ui.store.profiles[0], { highest: 'B', levels: { A: { mistakes: 1, timeMs: 5000 }, B: { mistakes: 0, timeMs: 9000 } } }); });
  await t.page.tap('[data-act=profile]'); await t.page.tap('[data-act=rename]');
  assert.equal(await t.page.inputValue('#rename'), 'Player 1');
  await t.page.fill('#rename', '   '); await t.page.tap('.prename button');
  assert.equal(await t.page.locator('#rename').count(), 1, 'still editing: blank refused');
  assert.equal(await t.page.evaluate(() => window.AdvancedCountingUI.ui.store.profiles[0].name), 'Player 1');
  await t.page.fill('#rename', 'Patrick'); await t.page.tap('.prename button');
  assert.equal(await t.page.locator('.pname').innerText(), 'Patrick');
  const st = await store(t.page);
  assert.equal(st.profiles[0].name, 'Patrick');
  assert.deepEqual(await t.page.evaluate(() => window.AdvancedCountingUI.ui.store.profiles[0].levels), { A: { mistakes: 1, timeMs: 5000 }, B: { mistakes: 0, timeMs: 9000 } }, 'records untouched');
  await t.page.reload(); assert.equal(await t.page.locator('.pname').innerText(), 'Patrick');
  // names are text, never markup
  await t.page.tap('[data-act=profile]'); await t.page.tap('[data-act=rename]'); await t.page.fill('#rename', '<b>x</b>'); await t.page.tap('.prename button');
  assert.equal(await t.page.locator('.pname b').count(), 0);
  assert.deepEqual(t.errors, []); await t.close();
});

test('settings: Sound On/Off lives in Settings (a quiet link under How to play), and is remembered on the device', SKIP, async () => {
  const t = await open({ viewport: PHONE });
  assert.equal(await t.page.locator('.quiet').innerText(), 'Settings');
  const q = await box(t.page, '.quiet'), h = await box(t.page, '.buttons .btn:nth-child(2)');
  assert.ok(q.y >= h.y + h.height - 1 && q.height >= 44, 'quiet but tappable, under How to play');
  assert.equal(await t.page.evaluate(() => window.AdvancedCountingUI.audio.isEnabled()), true);
  await t.page.tap('[data-act=settings]');
  assert.equal(await t.page.locator('.settings [data-act=sound].on').innerText(), 'On');
  await t.page.tap('.settings [data-act=sound][data-v=off]');
  assert.equal(await t.page.evaluate(() => window.AdvancedCountingUI.audio.isEnabled()), false);
  assert.equal(await t.page.locator('.settings [data-act=sound].on').innerText(), 'Off');
  await t.page.tap('[data-act=closesettings]');
  assert.equal(await t.page.locator('.settings').count(), 0);
  await t.page.reload(); assert.equal(await t.page.evaluate(() => window.AdvancedCountingUI.audio.isEnabled()), false);
  await t.page.tap('[data-act=settings]'); await t.page.tap('.settings [data-act=sound][data-v=on]'); await t.page.reload();
  assert.equal(await t.page.evaluate(() => window.AdvancedCountingUI.audio.isEnabled()), true);
  assert.deepEqual(t.errors, []);
  await t.close();
});

test('menu: the title is not clipped (the tail of the g is inside its box), at every size', SKIP, async () => {
  for (const vp of [PHONE, SMALL, IPAD_L, IPAD_P]) {
    const t = await open({ viewport: vp, clock: false });
    const m = await t.page.evaluate(() => { const h = document.querySelector('.title'), r = h.getBoundingClientRect(), fs = parseFloat(getComputedStyle(h).fontSize), cs = getComputedStyle(h); const range = document.createRange(); range.selectNodeContents(h); const tr = range.getBoundingClientRect(); return { fs, lh: parseFloat(cs.lineHeight), pb: parseFloat(cs.paddingBottom), boxH: r.height, textBottom: tr.bottom, boxBottom: r.bottom }; });
    assert.ok(m.lh >= m.fs * 1.18, 'line height leaves room for descenders: ' + JSON.stringify(m));
    assert.ok(m.boxH >= m.fs * 1.2, 'the title box is tall enough for the tail of the g: ' + JSON.stringify(m));
    await t.close();
  }
});

test('menu: How to play shows the rules panel with the judgment calls folded under fine print', SKIP, async () => {
  const t = await open({ viewport: PHONE, clock: false });
  await t.page.tap('[data-act=howto]');
  assert.equal(await t.page.locator('.rules h2').innerText(), 'How to play');
  assert.equal(await t.page.locator('.fine li').count(), D.texts.finePrint.length);
  assert.equal(await t.page.evaluate(() => document.querySelector('.rules details').open), false, 'folded');
  const done = await box(t.page, '.rules .done'); assert.ok(done.y + done.height <= PHONE.height, 'Done is on screen');
  await t.page.tap('[data-act=closerules]'); assert.equal(await t.page.locator('.rules').count(), 0);
  await t.close();
});

// ---------------------------------------------------------------- playing
test('play: a complete level A by taps, then OK deals level B (2x3), whose clock starts on the OK tap', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]');
  let s = await S(t.page);
  assert.equal(s.screen, 'play'); assert.equal(s.round.level, 'A'); assert.equal(s.round.layout.length, 4); assert.equal(await t.page.locator('.card').count(), 4);
  assert.equal(await t.page.locator('.flip').innerText(), 'Flip');
  assert.ok(s.round.faceUp.every(Boolean), 'dealt face up');
  await advance(t.page, 3000);                                     // study time counts
  await t.page.tap('[data-act=flip]');
  s = await S(t.page); assert.equal(s.round.phase, 'study', 'Flip only turns the cards down; nothing says an attempt has begun'); assert.equal(await t.page.locator('.card.down').count(), 4);
  assert.equal(await t.page.locator('.flip').isVisible(), false, 'with everything face down the button has nothing to do');
  await advance(t.page, 2000);
  const lay = s.round.layout;
  await tapAll(t.page, lay, 1, 3);
  assert.equal((await S(t.page)).round.phase, 'recall', 'the first tap on a face-down board began the attempt');
  assert.equal(await t.page.locator('.card.down').count(), 1, 'correct cards stay face up');
  assert.equal((await S(t.page)).results, null);
  await tapNumber(t.page, lay, 4);
  s = await S(t.page);
  assert.equal(s.round.phase, 'done'); assert.deepEqual([s.results.level, s.results.mistakes, s.results.time], ['A', 0, '5.0s']);
  // the results wait for OK: no matter how long, nothing advances and the clock does not run
  await advance(t.page, 10 * 60 * 1000);
  assert.equal((await S(t.page)).screen, 'play'); assert.equal((await S(t.page)).round.level, 'A');
  await t.page.tap('[data-act=ok]');
  s = await S(t.page); assert.equal(s.round.level, 'B'); assert.equal(s.round.layout.length, 6); assert.equal(await t.page.locator('.card').count(), 6);
  assert.equal(await t.page.evaluate(() => window.AdvancedCountingUI.ui.round.acc + (window.__t - window.AdvancedCountingUI.ui.round.since)), 0, "B's clock starts at the OK tap");
  await advance(t.page, 1500); await playLevel(t.page);
  s = await S(t.page); assert.equal(s.results.level, 'B'); assert.equal(s.results.time, '1.5s', 'the ten minutes on the results screen were not counted');
  assert.deepEqual(t.errors, []); await t.close();
});

test('play: before Flip, tapping any card turns it face down or up again (free flips in every round) — so you can test yourself, in order', SKIP, async () => {
  const t = await open({ viewport: IPAD_L });
  const { page } = t;
  try {
    await page.tap('[data-act=start]');
    const lay = (await S(page)).round.layout;
    const up = n => page.evaluate(p => window.AdvancedCountingUI.ui.round.faceUp[p], lay.indexOf(n));
    for (let n = 1; n <= lay.length - 1; n++) await tapNumber(page, lay, n);    // practise 1, 2, 3: turn them face down (one card stays up)
    for (let n = 1; n <= lay.length - 1; n++) assert.equal(await up(n), false, 'card ' + n + ' is face down');
    for (let n = 1; n <= lay.length - 1; n++) { await tapNumber(page, lay, n); assert.equal(await up(n), true, 'tapping ' + n + ' again turns it face up'); }
    const s = await S(page);
    assert.equal(s.round.phase, 'study'); assert.equal(s.round.mistakes, 0, 'testing yourself costs nothing');
    await page.tap('[data-act=flip]');                                           // Flip turns everything down
    assert.equal((await S(page)).round.phase, 'study'); assert.equal(await page.locator('.card.down').count(), lay.length);
    await tapAll(page, lay, 1, lay.length);
    assert.ok((await S(page)).results, 'and the level completes as usual');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('menu: Start begins at level A; Continue (shown once a level is beaten) picks up on the first level not yet beaten', SKIP, async () => {
  const t = await open({ viewport: SMALL });
  const { page } = t;
  try {
    assert.equal(await page.locator('.cont').count(), 0, 'a fresh profile has nothing to continue');
    const fresh = await box(page, '.start'); assert.ok(fresh.y + fresh.height <= 640);
    await page.tap('[data-act=start]');
    let s = await S(page); await playLevel(page); await page.tap('[data-act=ok]');          // beat level A, then B is dealt
    assert.equal((await S(page)).round.level, 'B');
    await page.tap('[data-act=gamemenu]'); await page.tap('[data-act=mainmenu]');            // leave in the middle of B
    assert.equal(await page.locator('.cont').innerText(), 'Continue · Level B');
    // the layout still fits a small phone: nothing off screen, Start above Continue, no overlap
    const st = await box(page, '.start'), co = await box(page, '.cont'), cr = await box(page, '.bottom');
    assert.ok(co.y >= st.y + st.height && co.y + co.height <= 640 && cr.y + cr.height <= 640 + 1, JSON.stringify({ st, co, cr }));
    assert.equal(Math.round(co.height), 58); assert.ok(Math.abs(co.width - st.width) < 1, 'as wide as Start');
    await page.tap('[data-act=continue]');
    s = await S(page); assert.equal(s.round.level, 'B'); assert.equal(s.round.practice, false, 'a climb round');
    await page.tap('[data-act=gamemenu]'); await page.tap('[data-act=mainmenu]');
    await page.tap('[data-act=start]');
    assert.equal((await S(page)).round.level, 'A', 'Start is always a fresh game from the beginning');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('cards show the number and nothing else — no corner numbers — in the biggest size possible', SKIP, async () => {
  const t = await open({ viewport: PHONE });
  try {
    await t.page.tap('[data-act=start]');
    assert.equal(await t.page.locator('.card .face').first().evaluate(f => f.children.length), 1, 'a face holds just the number');
    assert.equal(await t.page.locator('.card .ix').count(), 0, 'no corner indices');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('play: no attempt switch — turn every card down by hand and count: a lucky run completes the level; a wrong tap turns everything face up', SKIP, async () => {
  const t = await open({ viewport: IPAD_L });
  const { page } = t;
  try {
    await page.tap('[data-act=start]');
    for (let i = 0; i < 4; i++) { await advance(page, 1000); }
    const lay = (await S(page)).round.layout;
    await tapAll(page, lay, 1, 4);                                      // turn all four face down by tapping them
    assert.equal(await page.locator('.card.down').count(), 4);
    assert.equal(await page.locator('.flip').isVisible(), false);
    assert.equal(await page.locator('body').innerText().then(x => /attempt|try|count/i.test(x.replace(/Advanced Counting/i, ''))), false, 'the screen never says an attempt has begun');
    await tapNumber(page, lay, 2);                                       // wrong first tap: mistake, everything face up
    let s = await S(page);
    assert.equal(s.round.mistakes, 1); assert.equal(await page.locator('.card.down').count(), 0);
    assert.equal(await page.locator('.flip').isVisible(), true, 'the Flip button is back');
    await tapAll(page, lay, 1, 4);                                       // all down by hand again...
    await tapAll(page, lay, 1, 4);                                       // ...and the lucky run, in order
    s = await S(page);
    assert.ok(s.results, 'that was enough to complete the level'); assert.equal(s.results.mistakes, 1);
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('results: always seen first — a fast extra tap right after the last card cannot skip them (Next level ignores taps for a moment), and the sheet stays until Next level', SKIP, async () => {
  const t = await open({ viewport: PHONE, animated: true });
  const { page } = t;
  try {
    await page.evaluate(() => { window.AdvancedCountingUI.ui.lockMs = window.AdvancedCountingUI.ui.lockMs || 900; });
    await page.evaluate(() => { window.AdvancedCountingUI.ui.lockMs = 900; });
    await page.tap('[data-act=start]');
    const lay = (await S(page)).round.layout;
    await page.tap('[data-act=flip]');
    await tapAll(page, lay, 1, 4);
    assert.ok((await S(page)).results, 'the results exist the moment the last card is right');
    await page.evaluate(() => window.AdvancedCountingUI.okTap());               // an immediate extra tap on Next level
    assert.equal((await S(page)).round.level, 'A', 'ignored: the level did not skip ahead');
    assert.ok((await S(page)).results);
    await page.waitForTimeout(1600);                                           // the sheet has faded in and the button is ready
    assert.equal(await page.locator('.results .ok').evaluate(e => e.classList.contains('wait')), false);
    assert.match(await page.locator('.results').innerText(), /LEVEL[\s\S]*MISTAKES[\s\S]*TIME/);
    await page.tap('[data-act=ok]');
    assert.equal((await S(page)).round.level, 'B');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('results: beside every stat that is not a record, the best so far ("Best 4.2s") — and a stat that is a record shows NEW RECORD! instead', SKIP, async () => {
  const t = await open();
  const { page } = t;
  try {
    await page.tap('[data-act=start]');
    let lay = (await S(page)).round.layout;
    await page.tap('[data-act=flip]'); await advance(page, 4000); await tapAll(page, lay, 1, 4);        // level A in 4.0s, no mistakes
    assert.equal(await page.locator('.results .best').count(), 0, 'a first completion has nothing to compare with');
    assert.equal(await page.locator('.results .record').count(), 1, 'only the level is a new record');
    await page.tap('[data-act=ok]'); await page.tap('[data-act=gamemenu]'); await page.tap('[data-act=mainmenu]');
    await page.tap('[data-act=start]');                                                                   // again from level A: slower, with a mistake
    lay = (await S(page)).round.layout;
    await page.tap('[data-act=flip]'); await advance(page, 2000); await tapNumber(page, lay, 3);          // a mistake
    await page.tap('[data-act=flip]'); await advance(page, 5000); await tapAll(page, lay, 1, 4);
    const best = await texts(page, '.results .best');
    assert.deepEqual(best, ['Best A', 'Best 0', 'Best 4.0s'], 'what the records are: ' + JSON.stringify(best));
    assert.equal(await page.locator('.results .record').count(), 0);
    assert.match((await page.locator('.results').innerText()).replace(/\s+/g, ' '), /MISTAKES 1 Best 0.*TIME 7.0s Best 4.0s/);
    // practice shows how close you are too, and changes nothing
    await page.tap('[data-act=ok]'); await page.tap('[data-act=gamemenu]'); await page.tap('[data-act=mainmenu]');
    await page.tap('[data-act=scores]'); await page.tap('.row[data-i="0"]');
    lay = (await S(page)).round.layout;
    await page.tap('[data-act=flip]'); await advance(page, 100); await tapAll(page, lay, 1, 4);
    assert.ok((await texts(page, '.results .best')).some(x => /Best 4\.0s/.test(x)), 'practice shows the best time too');
    assert.deepEqual(t.errors, []);
  } finally { await t.close(); }
});

test('play: a wrong tap re-deals the identical layout face up, counts a mistake, and only completion deals a new layout', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]'); await t.page.tap('[data-act=flip]');
  const lay = (await S(t.page)).round.layout;
  await tapNumber(t.page, lay, 1);
  await tapNumber(t.page, lay, 3);                                 // wrong: 2 was next
  let s = await S(t.page);
  assert.deepEqual(s.round.layout, lay, 'identical layout'); assert.equal(s.round.mistakes, 1); assert.ok(s.round.faceUp.every(Boolean));
  assert.equal(await t.page.locator('.card.down').count(), 0, 'every card, even the found one, is face up again');
  assert.equal(await t.page.locator('.card.wrong').count(), 1);
  assert.equal(await t.page.locator('.flip').innerText(), 'Flip'); assert.equal(await t.page.locator('.flip').isVisible(), true);
  // the DOM shows the same numbers in the same places
  assert.deepEqual(await t.page.locator('.card .num').allInnerTexts(), lay.map(String));
  await t.page.tap('[data-act=flip]'); await tapNumber(t.page, lay, 2);      // the count restarted at 1
  s = await S(t.page); assert.equal(s.round.mistakes, 2); assert.deepEqual(s.round.layout, lay);
  await t.page.tap('[data-act=flip]'); await tapAll(t.page, lay, 1, 4);
  s = await S(t.page); assert.equal(s.results.mistakes, 2);
  await t.page.tap('[data-act=ok]');
  assert.equal((await S(t.page)).round.level, 'B');
  await t.close();
});

test('play: the results screen has LEVEL / MISTAKES / TIME columns (label above value) and waits for OK', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]'); await advance(t.page, 4200); await playLevel(t.page, { mistakes: 1 });
  assert.deepEqual(await texts(t.page, '.results .lab'), ['LEVEL', 'MISTAKES', 'TIME']);
  assert.deepEqual(await texts(t.page, '.results .val'), ['A', '1', '4.2s']);
  const lab = await box(t.page, '.results .col .lab'), val = await box(t.page, '.results .col .val');
  assert.ok(lab.y + lab.height <= val.y, 'label above value');
  const cols = await t.page.locator('.results .col').evaluateAll(els => els.map(e => e.getBoundingClientRect().x));
  assert.ok(cols[0] < cols[1] && cols[1] < cols[2]);
  assert.ok(await t.page.locator('.results [data-act=ok]').isVisible());
  assert.equal(await t.page.locator('.results [data-act=ok]').innerText(), 'Next level', 'the button says what it does: it starts the next level (and its clock)');
  await t.close();
});

test('play: NEW RECORD! badges sit under the stat that set a record, and glow', SKIP, async () => {
  const t = await open({ animated: true });
  const badgeUnder = async () => t.page.locator('.results .col').evaluateAll(cols => cols.map(c => c.querySelectorAll('.record').length));
  // first ever completion: only LEVEL (baseline for the rest), with one mistake and 6.0 s
  await t.page.tap('[data-act=start]'); await advance(t.page, 6000); await playLevel(t.page, { mistakes: 1 });
  assert.deepEqual(await badgeUnder(), [1, 0, 0]);
  assert.equal(await t.page.locator('.record').first().innerText(), 'NEW RECORD!');
  assert.ok(await t.page.locator('.record').first().evaluate(e => getComputedStyle(e).animationName !== 'none'), 'glowing');
  // a clean, faster second climb: MISTAKES and TIME records, no LEVEL
  await t.page.tap('[data-act=ok]'); await t.page.tap('[data-act=gamemenu]'); await t.page.tap('[data-act=mainmenu]');
  await t.page.tap('[data-act=start]'); await advance(t.page, 2000); await playLevel(t.page);
  assert.deepEqual(await badgeUnder(), [0, 1, 1]);
  assert.deepEqual(await texts(t.page, '.results .val'), ['A', '0', '2.0s']);
  // the same result again: no badges
  await t.page.tap('[data-act=ok]'); await t.page.tap('[data-act=gamemenu]'); await t.page.tap('[data-act=mainmenu]');
  await t.page.tap('[data-act=start]'); await advance(t.page, 2000); await playLevel(t.page);
  assert.deepEqual(await badgeUnder(), [0, 0, 0]);
  const st = await store(t.page); assert.deepEqual(st.profiles[0].levels.A, { mistakes: 0, timeMs: 2000 }); assert.equal(st.profiles[0].highest, 'A');
  await t.close();
});

test('play: records are saved, survive a reload, and the profile shows them in High scores', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]'); await advance(t.page, 3300); await playLevel(t.page); await t.page.tap('[data-act=ok]');
  await t.page.reload(); await fakeClock(t.page);
  await t.page.tap('[data-act=scores]');
  assert.equal(await t.page.locator('.screen.scores .row').count(), 13);
  assert.deepEqual(await texts(t.page, '.row .rl'), 'ABCDEFGHIJKLM'.split(''));
  assert.deepEqual(await texts(t.page, '.row .rg'), ['2×2', '2×3', '3×3', '3×4', '4×4', '4×5', '5×5', '5×6', '6×6', '6×7', '7×7', '7×8', '8×8']);
  const first = await t.page.locator('.row').first().innerText();
  assert.match(first, /3\.3s/); assert.match(first, /0/);
  assert.equal(await t.page.locator('.row.hi .rl').innerText().then(x => x.replace(/\W/g, '')), 'A', 'highest level is marked');
  assert.equal(await t.page.locator('.row:nth-child(2) .rt').innerText(), '—');
  assert.equal(await t.page.locator('.row:nth-child(2) .rm').innerText(), '—');
  await t.close();
});

test('high scores: tapping a level row starts practice: Start button, free card flips, no records, OK returns to High scores', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=scores]'); await t.page.tap('.row[data-i="2"]');
  let s = await S(t.page);
  assert.equal(s.screen, 'play'); assert.equal(s.round.level, 'C'); assert.equal(s.round.practice, true); assert.equal(s.round.layout.length, 9);
  assert.equal(await t.page.locator('.flip').innerText(), 'Start');
  assert.equal(await t.page.locator('.lvl i').innerText(), 'Practice');
  await t.page.tap('[data-pos="0"]'); assert.equal(await t.page.locator('.card.down').count(), 1, 'cards flip freely');
  await t.page.tap('[data-pos="0"]'); assert.equal(await t.page.locator('.card.down').count(), 0);
  await t.page.tap('[data-act=flip]'); assert.equal(await t.page.locator('.card.down').count(), 9);
  assert.equal(await t.page.locator('.flip').isVisible(), false);
  const lay = (await S(t.page)).round.layout;
  await tapAll(t.page, lay, 1, 9);
  assert.equal(await t.page.locator('.results .record').count(), 0, 'no badges in practice');
  assert.deepEqual(await texts(t.page, '.results .lab'), ['LEVEL', 'MISTAKES', 'TIME']);
  assert.equal(await t.page.evaluate(() => JSON.stringify(window.AdvancedCountingUI.ui.store.profiles[0].levels)), '{}', 'practice changed no records');
  assert.equal(await store(t.page), null, 'and saved nothing');
  assert.equal(await t.page.locator('.results [data-act=ok]').innerText(), 'Done', 'practice: Done returns to High scores');
  await t.page.tap('[data-act=ok]');
  assert.equal((await S(t.page)).screen, 'scores');
  await t.close();
});

test('play: the in-game menu holds exactly Rules and Main Menu; Rules is only there; Main Menu leaves at once; the clock rests while Rules is open', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]');
  assert.equal(await t.page.locator('.mbtn').innerText().then(x => /Menu/.test(x)), true);
  await t.page.tap('.mbtn');
  assert.deepEqual(await texts(t.page, '.gmenu button'), ['Rules', 'Main Menu']);
  const m = await box(t.page, '.mbtn'), g = await box(t.page, '.gmenu'); assert.ok(g.y >= m.y + m.height - 2, 'a dropdown under the button');
  await t.page.tap('[data-act=rules]');
  assert.equal(await t.page.locator('.rules h2').innerText(), 'How to play');
  await advance(t.page, 5 * 60 * 1000);                           // reading the rules takes as long as it takes
  await t.page.tap('[data-act=closerules]');
  await advance(t.page, 1000); await playLevel(t.page);
  assert.equal((await S(t.page)).results.time, '1.0s', 'the time the Rules were open is not counted');
  await t.page.tap('[data-act=ok]');
  await t.page.tap('.mbtn'); await t.page.tap('[data-act=mainmenu]');
  assert.equal((await S(t.page)).screen, 'menu'); assert.equal(await t.page.locator('.start').count(), 1);
  await t.close();
});

test('play: a tap on a card while the Menu is open only closes the Menu', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]'); await t.page.tap('[data-act=flip]');
  await t.page.tap('.mbtn'); assert.equal(await t.page.locator('.gmenu').count(), 1);
  await t.page.evaluate(() => document.querySelector('.card').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
  assert.equal(await t.page.locator('.gmenu').count(), 0); assert.equal((await S(t.page)).round.mistakes, 0);
  await t.close();
});

test('play: after level M the button reads Main menu and returns to it', SKIP, async () => {
  const t = await open({ viewport: PHONE });
  await t.page.evaluate(() => window.AdvancedCountingUI.dealRound(12, false));
  await t.page.tap('[data-act=flip]');
  const lay = (await S(t.page)).round.layout; assert.equal(lay.length, 64);
  await t.page.evaluate(lay => { for (let n = 1; n <= lay.length; n++) document.querySelector(`[data-pos="${lay.indexOf(n)}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); }, lay);
  assert.equal((await S(t.page)).results.level, 'M');
  assert.equal(await t.page.locator('.results [data-act=ok]').innerText(), 'Main menu');
  await t.page.tap('[data-act=ok]');
  assert.equal((await S(t.page)).screen, 'menu');
  assert.equal((await store(t.page)).profiles[0].highest, 'M');
  await t.close();
});

// ---------------------------------------------------------------- the table
test('page: locked — fixed, nothing scrolls, touchmove and pinch are blocked, no double-tap zoom', SKIP, async () => {
  const t = await open({ viewport: PHONE });
  const check = async () => t.page.evaluate(() => {
    const cs = getComputedStyle(document.body), ch = getComputedStyle(document.documentElement), ev = new Event('touchmove', { bubbles: true, cancelable: true });
    document.getElementById('app').dispatchEvent(ev);
    const g = new Event('gesturestart', { cancelable: true, bubbles: true }); document.dispatchEvent(g);
    return { pos: [cs.position, ch.position], ov: [cs.overflow, ch.overflow], ob: cs.overscrollBehaviorY, ta: cs.touchAction, fits: document.documentElement.scrollHeight <= innerHeight, wide: document.documentElement.scrollWidth <= innerWidth, tm: ev.defaultPrevented, gs: g.defaultPrevented };
  });
  for (const go of [async () => {}, async () => t.page.tap('[data-act=scores]'), async () => { await t.page.tap('[data-act=back]'); await t.page.tap('[data-act=start]'); }]) {
    await go();
    const c = await check();
    assert.deepEqual(c.pos, ['fixed', 'fixed']); assert.deepEqual(c.ov, ['hidden', 'hidden']); assert.equal(c.ob, 'none'); assert.equal(c.ta, 'manipulation');
    assert.ok(c.fits && c.wide); assert.equal(c.tm, true); assert.equal(c.gs, true);
  }
  assert.match(await t.page.getAttribute('meta[name=viewport]', 'content'), /user-scalable=no/);
  await t.close();
});

test('play: no next-number indicator of any kind in the DOM while counting', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]'); await t.page.tap('[data-act=flip]');
  const lay = (await S(t.page)).round.layout;
  for (const n of [1, 2]) {
    await tapNumber(t.page, lay, n);
    const found = await t.page.evaluate(() => {
      const bad = [], re = /next|hint|expect|target|current|cue|which/i;
      document.querySelectorAll('#app *').forEach(el => {
        for (const a of el.attributes) if (re.test(a.name) || (a.name !== 'style' && a.name !== 'class' && a.name !== 'data-pos' && a.name !== 'data-act' && re.test(a.value))) bad.push(el.tagName + '[' + a.name + '=' + a.value + ']');
        el.classList.forEach(c => { if (re.test(c)) bad.push('.' + c); });
      });
      const chrome = Array.from(document.querySelectorAll('.top *, .dock *')).map(e => e.children.length ? '' : e.textContent.trim()).join(' ').trim();
      return { bad, chrome, text: document.getElementById('app').textContent.replace(/\s+/g, ' ') };
    });
    assert.deepEqual(found.bad, []);
    assert.match(found.chrome, /^☰ Menu\s+A\s+Flip$/, 'only the menu, the level and the (hidden) button');
    assert.doesNotMatch(found.text, /next|tap|hint|find/i);
    assert.equal(await t.page.locator('.card.done').count(), n, 'only cards already turned carry a mark');
  }
  await t.close();
});

test('play: the 8x8 level fits a phone without scrolling, cards are legible, and nothing overlaps the controls', SKIP, async () => {
  for (const vp of [PHONE, SMALL, IPAD_L, IPAD_P]) {
    const t = await open({ viewport: vp });
    await t.page.evaluate(() => window.AdvancedCountingUI.dealRound(12, false));
    assert.equal(await t.page.locator('.card').count(), 64);
    const cards = await t.page.locator('.card').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.right, r.bottom]; }));
    const top = await box(t.page, '.top'), dock = await box(t.page, '.dock');
    const minX = Math.min(...cards.map(c => c[0])), maxX = Math.max(...cards.map(c => c[2])), minY = Math.min(...cards.map(c => c[1])), maxY = Math.max(...cards.map(c => c[3]));
    assert.ok(minX >= 0 && maxX <= vp.width && minY >= 0 && maxY <= vp.height, `${vp.width}x${vp.height} on screen`);
    assert.ok(minY >= top.y + top.height - 1, 'clear of the menu bar');
    if (vp.width / vp.height < 1.1) assert.ok(maxY <= dock.y + 1, 'clear of the Flip button'); else assert.ok(maxX <= dock.x + 1, 'clear of the Flip button (beside the board)');
    const w = cards[0][2] - cards[0][0]; assert.ok(w >= 38, `card width ${w}`);
    const fs = await t.page.locator('.card .num').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize)); assert.ok(fs >= 18, 'number size ' + fs);
    assert.equal(await t.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true);
    // 2-digit numbers sit inside their card
    const inside = await t.page.locator('.card.n2').evaluateAll(els => els.every(e => { const n = e.querySelector('.num').getBoundingClientRect(), c = e.getBoundingClientRect(); return n.left >= c.left && n.right <= c.right; }));
    assert.equal(inside, true);
    await t.close();
  }
});

test('play: every level A-M fits, in portrait and landscape', SKIP, async () => {
  for (const vp of [PHONE, IPAD_L]) {
    const t = await open({ viewport: vp });
    for (let i = 0; i < 13; i++) {
      await t.page.evaluate(i => window.AdvancedCountingUI.dealRound(i, false), i);
      const n = await t.page.locator('.card').count(); assert.equal(n, [4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 49, 56, 64][i]);
      const ok = await t.page.locator('.card').evaluateAll((els, v) => els.every(e => { const r = e.getBoundingClientRect(); return r.x >= 0 && r.right <= v.width && r.y >= 0 && r.bottom <= v.height; }), vp);
      assert.equal(ok, true, 'level ' + i);
    }
    await t.close();
  }
});

test('motion: with reduced motion the cards turn instantly with no stagger; otherwise they turn in a staggered wave', SKIP, async () => {
  const r = await open({ animated: false });
  await r.page.tap('[data-act=start]');
  assert.equal(await r.page.locator('.inner').first().evaluate(e => getComputedStyle(e).transitionDuration), '0s');
  await r.page.tap('[data-act=flip]');
  assert.deepEqual(await r.page.locator('.card').evaluateAll(els => els.map(e => e.style.getPropertyValue('--d'))), ['0ms', '0ms', '0ms', '0ms']);
  await r.close();
  const a = await open({ animated: true });
  await a.page.evaluate(() => window.AdvancedCountingUI.dealRound(12, false));
  await a.page.tap('[data-act=flip]');
  const delays = await a.page.locator('.card').evaluateAll(els => els.map(e => parseInt(e.style.getPropertyValue('--d'), 10)));
  assert.equal(delays[0], 0); assert.ok(delays[63] > 300 && delays[63] <= D.ui.staggerMaxMs, 'a wave, capped: ' + delays[63]);
  assert.ok(await a.page.locator('.inner').first().evaluate(e => parseFloat(getComputedStyle(e).transitionDuration) > 0.2));
  // the wrong-tap re-deal ripples outward from the tapped card
  const lay = (await S(a.page)).round.layout;
  await a.page.evaluate(lay => document.querySelector(`[data-pos="${lay.indexOf(9)}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })), lay);
  const pos = lay.indexOf(9);
  const d2 = await a.page.locator('.card').evaluateAll(els => els.map(e => parseInt(e.style.getPropertyValue('--d'), 10)));
  assert.equal(d2[pos], 0); assert.ok(Math.max(...d2) > 0 && Math.max(...d2) <= D.ui.staggerMaxMs);
  assert.equal(await a.page.locator('.board.shake').count(), 1, 'the table shudders');
  await a.close();
});

test('sound: a correct tap chimes at a rising pitch, a mistake plays the low note, completion plays the fanfare, a record the sparkle', SKIP, async () => {
  const t = await open();
  await t.page.tap('[data-act=start]'); await t.page.tap('[data-act=flip]');
  const lay = (await S(t.page)).round.layout;
  await tapNumber(t.page, lay, 1); await tapNumber(t.page, lay, 3);
  await t.page.tap('[data-act=flip]'); await tapAll(t.page, lay, 1, 4);
  await t.page.waitForFunction(() => window.AdvancedCountingUI.audio.played.includes('sparkle'), null, { timeout: 4000 });
  const { played, pitches } = await t.page.evaluate(() => ({ played: window.AdvancedCountingUI.audio.played.slice(), pitches: window.AdvancedCountingUI.audio.pitches.slice() }));
  assert.ok(played.includes('miss') && played.includes('fanfare') && played.includes('sparkle') && played.includes('riffle'));
  const chimes = played.map((n, i) => n === 'chime' ? pitches[i] : null).filter(x => x !== null);
  assert.equal(chimes.length, 5); assert.ok(chimes[0] === 1 && chimes[4] > chimes[1] && chimes[4] > chimes[0], 'pitch climbs: ' + chimes);
  assert.deepEqual(t.errors, []); await t.close();
});
