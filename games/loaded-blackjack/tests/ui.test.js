const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const SEEN = JSON.stringify({ welcome: 1, deal: 1, turn: 1, load: 1, window: 1, bust: 1, reveal: 1, draft: 1 });
async function open(viewport) {
  const b = await chromium.launch(), p = await b.newPage({ viewport });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(seen => { try { if (!localStorage.getItem('tabletop-library-loaded-blackjack-tips')) localStorage.setItem('tabletop-library-loaded-blackjack-tips', seen); } catch (e) { /* fine */ } }, SEEN);
  await p.goto(URL); return { b, p, errs };
}

test('ui: play a round against the computer: hit, pass, results, the draft, the next round', { skip: !chromium, timeout: 120000 }, async () => {
  const { b, p, errs } = await open({ width: 820, height: 1180 });
  try {
    await p.click('[data-act=newgame]'); await p.fill('.seed', '5'); await p.click('[data-act=start]');
    let sawDraft = false;
    for (let i = 0; i < 600; i++) {
      await p.waitForTimeout(40);
      const st = await p.evaluate(() => { const s = LB.ui.s, pd = s.pending; return { phase: s.phase, round: s.round, kind: pd && pd.kind, who: pd && pd.who, human: pd && pd.who != null && s.pl[pd.who].kind === 'human' }; });
      if (st.round >= 2 && st.phase === 'play') break;
      if (st.phase === 'draft') sawDraft = true;
      if (st.kind === 'turn' && st.human) { await p.click('[data-act=ans][data-v=pass]'); continue; }
      if (st.kind === 'results') { await p.waitForSelector('.results [data-v=continue]'); await p.click('.results [data-v=continue]'); continue; }
      if (st.human && st.kind === 'pick') { await p.click('.market .canpick'); continue; }
      if (st.human && st.kind) { await p.evaluate(() => { const s = LB.ui.s; const b = document.querySelector('.sheet [data-act=ans]'); if (b) b.click(); else { Engine.answer(s, s.pending.opts[0].id); LB.render(); } }); }
    }
    assert.ok(sawDraft, 'the draft screen came up');
    assert.equal(await p.evaluate(() => LB.ui.s.round), 2, 'the second round began');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: pass and play hides each player\'s private cards behind a handoff screen', { skip: !chromium }, async () => {
  const { b, p, errs } = await open({ width: 820, height: 1180 });
  try {
    await p.click('[data-act=newgame]');
    await p.click('[data-act=kind][data-i="1"][data-v=human]');
    await p.click('[data-act=start]');
    await p.waitForSelector('.cover');
    assert.equal(await p.locator('.card').count(), 0, 'nothing private on the handoff screen');
    const who = await p.evaluate(() => LB.ui.s.pending.who);
    await p.click('[data-act=handoff]');
    await p.waitForSelector('.pnl.me');
    assert.match(await p.innerText('.pnl.me'), /HIDDEN/i);
    await p.click('[data-act=ans][data-v=pass]');
    await p.waitForTimeout(900);
    const next = await p.evaluate(() => LB.ui.s.pending && LB.ui.s.pending.who);
    if (next !== who && next != null && await p.evaluate(() => LB.ui.s.pl[LB.ui.s.pending.who].kind === 'human')) { await p.waitForSelector('.cover'); assert.equal(await p.locator('.pnl.me').count(), 0, 'the other player\'s cards are hidden until they take the device'); }
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: the first-time tips come once and the game waits for them', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=newgame]'); await p.click('[data-act=start]');
    await p.waitForSelector('.sheet [data-act=tipok]');
    assert.match(await p.innerText('.sheet'), /Welcome/);
    const before = await p.evaluate(() => LB.ui.s.log.length); await p.waitForTimeout(1200);
    assert.equal(await p.evaluate(() => LB.ui.s.log.length), before, 'nothing moves while a tip is open');
    await p.click('[data-act=tipok]');
  } finally { await b.close(); }
});
