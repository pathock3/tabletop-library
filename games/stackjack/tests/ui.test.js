const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const SEEN = JSON.stringify({ welcome: 1, deal: 1, turn: 1, load: 1, window: 1, bust: 1, reveal: 1, draft: 1 });
async function open(viewport) {
  const b = await chromium.launch(), p = await b.newPage({ viewport });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(seen => { try { if (!localStorage.getItem('tabletop-library-stackjack-tips')) localStorage.setItem('tabletop-library-stackjack-tips', seen); } catch (e) { /* fine */ } }, SEEN);
  await p.goto(URL); return { b, p, errs };
}

test('ui: play a round against the computer: hit, pass, results, the draft, the next round', { skip: !chromium, timeout: 120000 }, async () => {
  const { b, p, errs } = await open({ width: 820, height: 1180 });
  try {
    await p.click('[data-act=newgame]'); await p.evaluate(() => LB.newGame({ seed: 5 }));
    let sawDraft = false;
    for (let i = 0; i < 600; i++) {
      await p.waitForTimeout(40);
      const st = await p.evaluate(() => { const s = LB.ui.s, pd = s.pending; return { phase: s.phase, round: s.round, kind: pd && pd.kind, who: pd && pd.who, human: pd && pd.who != null && s.pl[pd.who].kind === 'human', canAct: Engine.isOpen(s) && s.pl[0].kind === 'human' && s.pl[0].status === 'active' && !s.pl[0].locked }; });
      if (st.round >= 2 && st.phase === 'play') break;
      if (st.phase === 'draft') sawDraft = true;
      if (st.canAct) { await p.click('[data-act=act][data-v=pass]'); continue; }
      if (st.kind === 'results') { await p.waitForSelector('.results [data-v=continue]'); await p.click('.results [data-v=continue]'); continue; }
      if (st.human && st.kind === 'pick') { await p.click('.market .canpick'); continue; }
      if (st.human && st.kind) { await p.evaluate(() => { const s = LB.ui.s; const b = document.querySelector('.sheet [data-act=ans]'); if (b) b.click(); else { Engine.answer(s, s.pending.opts[0].id); LB.render(); } }); }
    }
    assert.ok(sawDraft, 'the draft screen came up');
    assert.equal(await p.evaluate(() => LB.ui.s.round), 2, 'the second round began');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: the first-time tips come once and the game waits for them', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=newgame]');
    await p.waitForSelector('.sheet [data-act=tipok]');
    assert.match(await p.innerText('.sheet'), /Welcome/);
    const before = await p.evaluate(() => LB.ui.s.log.length); await p.waitForTimeout(1200);
    assert.equal(await p.evaluate(() => LB.ui.s.log.length), before, 'nothing moves while a tip is open');
    await p.click('[data-act=tipok]');
  } finally { await b.close(); }
});

test('ui: values 0 and 10 and the two-digit "1/10" fit on the card faces', { skip: !chromium, timeout: 60000 }, async () => {
  const { b, p, errs } = await open({ width: 820, height: 1180 });
  try {
    await p.click('[data-act=newgame]'); await p.evaluate(() => LB.newGame({ seed: 5 }));
    await p.waitForSelector('.card');
    const r = await p.evaluate(() => {
      const s = LB.ui.s, pl = s.pl[0]; pl.line[0].c.id = 'hi-lo'; pl.line[1].c.id = 'feather'; pl.line[0].down = false; pl.line[1].down = false; LB.render();
      const vals = [...document.querySelectorAll('.card .cval')].map(e => ({ t: e.textContent.trim(), fits: e.scrollWidth <= e.parentElement.clientWidth + 1 }));
      return { vals, range: Engine.range(s, 0), hi: Engine.lineValuesFor(s, 0, [10, 3]) };
    });
    assert.ok(r.vals.some(v => v.t === '1/10' && v.fits), 'Hi-Lo shows 1/10 inside the card: ' + JSON.stringify(r.vals));
    assert.ok(r.vals.some(v => v.t === '0/3' && v.fits), 'Feather shows 0/3');
    assert.deepEqual(r.hi, [10, 3], 'a 10 and a 3 resolve');
    assert.deepEqual(r.range, { min: 1, max: 13 }, 'Hi-Lo and Feather: 1+0 up to 10+3');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: New Game starts at once against Easy, Medium and Hard; a second game needs a second tap; no way back to the library mid-game', { skip: !chromium, timeout: 60000 }, async () => {
  const { b, p, errs } = await open({ width: 1180, height: 820 });
  try {
    assert.equal(await p.locator('[data-act=start], .seat, .seed').count(), 0, 'no new-game options');
    await p.click('[data-act=newgame]'); await p.waitForSelector('.pnl.me');
    assert.deepEqual(await p.evaluate(() => LB.ui.s.pl.map(x => x.kind === 'ai' ? x.level : x.kind)), ['human', 'easy', 'medium', 'hard']);
    assert.equal(await p.locator('.libback').count(), 0, 'no button back to the library in the middle of a game');
    await p.click('[data-act=menu]'); assert.equal(await p.locator('.sheet [data-act=newgame]').count(), 0, 'no New Game in the in-game menu'); assert.equal(await p.locator('.topbar [data-act=log]').count(), 0, 'Log is not on the table'); await p.click('.sheet [data-act=log]'); assert.match(await p.innerText('.sheet'), /Log/); await p.click('.sheet [data-act=log]'); await p.click('[data-act=menu]');
    await p.click('.sheet [data-act=settings]'); assert.match(await p.locator('.sheet').last().innerText(), /Reset tips/); await p.click('[data-act=resettips]'); assert.match(await p.locator('.sheet').last().innerText(), /Tips reset/); await p.click('[data-act=closesettings]');
    await p.click('.sheet [data-act=home]'); await p.waitForSelector('.home');
    await p.click('[data-act=newgame]'); assert.match(await p.innerText('.home'), /Tap again to erase your current game/);
    const before = await p.evaluate(() => LB.ui.s.seed); await p.click('[data-act=newgame]'); await p.waitForSelector('.pnl.me'); assert.notEqual(await p.evaluate(() => LB.ui.s.seed), before, 'the second tap starts a new game');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: How to Play is three numbered steps with pictures', { skip: !chromium }, async () => {
  const { b, p, errs } = await open({ width: 820, height: 1180 });
  try {
    await p.click('[data-act=help]'); assert.equal(await p.locator('.step').count(), 3); assert.ok(await p.locator('.step .vis .card').count() >= 6, 'real cards are drawn in the steps');
    assert.match(await p.innerText('.sheet'), /First player to reach 21 points wins|first player to reach 21 points wins/i); assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

for (const [w, h] of [[1180, 820], [1440, 800], [820, 1180], [402, 874]]) {
  test(`ui: the table fills the screen at ${w}x${h} and the draft shows big cards and the scoreboard`, { skip: !chromium, timeout: 60000 }, async () => {
    const { b, p, errs } = await open({ width: w, height: h });
    try {
      await p.click('[data-act=newgame]'); await p.evaluate(() => LB.newGame({ seed: 5 })); await p.waitForSelector('.pnl.me .card');
      const r = await p.evaluate(() => { const me = document.querySelector('.pnl.me').getBoundingClientRect(), card = document.querySelector('.pnl.me .card').getBoundingClientRect(), app = document.documentElement; return { bottom: me.bottom, right: me.right, cw: card.width, scrollW: app.scrollWidth, H: innerHeight, W: innerWidth, oppCard: document.querySelector('.opps .card').getBoundingClientRect().width }; });
      assert.ok(r.bottom <= r.H + 1 && r.right <= r.W + 1 && r.scrollW <= r.W + 1, 'nothing runs off the screen: ' + JSON.stringify(r));
      if (w >= 800) assert.ok(r.cw >= 80, 'your cards are big: ' + r.cw);
      await p.evaluate(() => { const s = LB.ui.s; s.stack = []; s.pending = { who: null, kind: 'results', opts: [{ id: 'continue' }], prompt: '' }; s.phase = 'results'; s.result = { round: 1, rows: s.part.map(i => ({ p: i, total: 15, busted: false, place: 1, pts: 6, line: [], load: 0 })) }; Engine.answer(s, 'continue'); LB.render(); });
      await p.waitForSelector('.market .card');
      const d = await p.evaluate(() => ({ n: document.querySelectorAll('.market .card').length, w: document.querySelector('.market .card').getBoundingClientRect().width, score: document.querySelectorAll('.score .sc').length, decks: [...document.querySelectorAll('.dfoot .chip')].map(x => x.textContent), over: document.querySelector('.market').getBoundingClientRect().bottom <= innerHeight + 1 }));
      assert.equal(d.n, 8); assert.equal(d.score, 4, 'the scoreboard is on the draft screen'); assert.deepEqual(d.decks, ['Your deck'], "only your own deck can be opened"); assert.ok(d.over);
      if (w >= 800) assert.ok(d.w >= 120, 'draft cards are big: ' + d.w);
      assert.deepEqual(errs, []);
    } finally { await b.close(); }
  });
}

test('ui: the leaderboard has a chip for every player and moves it the instant you hit; every card is face up and the score is public', { skip: !chromium, timeout: 60000 }, async () => {
  const { b, p, errs } = await open({ width: 1180, height: 820 });
  try {
    await p.click('[data-act=newgame]'); await p.evaluate(() => LB.newGame({ seed: 5 })); await p.waitForSelector('.lb .lbchip');
    assert.equal(await p.locator('.lb .lbchip').count(), 4); 
    assert.equal(await p.locator('.card.back').count(), 0, 'no card is face down'); assert.equal(await p.locator('text=HIDDEN').count(), 0);
    const where = () => p.evaluate(() => { const c = document.querySelector('.lbchip.me'); return { col: c.parentElement.querySelector('.lbn').textContent.trim(), tot: document.querySelector('.pnl.me .tot').textContent.trim() }; });
    const before = await where(); assert.equal(before.col, before.tot, 'the chip sits on your total');
    await p.click('[data-act=act][data-v=hit]'); const after = await where(); assert.equal(after.col, after.tot, 'and moves at once when you hit');
    assert.equal(await p.locator('.pnl.me .line .card').count() >= 3, true, 'your new card is there the moment you tap');
    assert.equal(await p.locator('[data-act=ans][data-v=hit], .topbar [data-act=log], [data-act=flip]').count(), 0);
    await p.click('[data-act=act][data-v=pass]'); await p.waitForTimeout(300); assert.equal(await p.locator('[data-act=act]').count(), 0, 'a pass locks in your score: no more buttons'); assert.match(await p.innerText('.status'), /locked in/i);
    await p.waitForSelector('.results', { timeout: 30000 }); assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
