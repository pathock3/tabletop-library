const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

test('ui: hide a flag, place a card, play a staged battle through the screen', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
    await p.click('[data-act=mode-ai]');
    await p.click('[data-hex="0,2"]');
    await p.waitForSelector('[data-card]');
    await p.click('[data-card]'); await p.click('[data-hex="0,2"]');
    assert.equal(await p.locator('[data-unit]').count(), 1);
    // stage a battle on the middle castle: blue attacks a red unit
    await p.evaluate(() => {
      const s = WAR.ui.s, c = (t, o) => ({ id: o + '-' + t + '-z', type: t, owner: o });
      s.units = [{ id: 50, owner: 1, at: '0,0', cards: [c('warrior', 1)], acted: false }, { id: 51, owner: 0, at: '0,0', cards: [c('ranger', 0)], acted: false }];
      s.hands[1] = []; s.step = 'play'; s.cur = 1; WAR.render();
    });
    await p.click('[data-act=endmove]');
    await p.waitForSelector('.battle');
    await p.waitForSelector('[data-pick]');
    await p.click('[data-pick]');
    await p.waitForSelector('[data-act=bc]');
    assert.match(await p.innerText('.msg'), /defeats/);
    await p.click('[data-act=bc]');
    assert.equal(await p.locator('.battle').count(), 0);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: pass and play shows a cover screen before each turn', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 402, height: 874 } });
  try {
    await p.goto(URL);
    await p.click('[data-act=mode-pass]');
    assert.match(await p.innerText('.cover'), /Red's turn/);
    await p.click('[data-act=uncover]');
    await p.click('[data-hex="0,-2"]');
    assert.match(await p.innerText('.cover'), /Blue's turn/);
  } finally { await b.close(); }
});
