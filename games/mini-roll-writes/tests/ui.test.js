// A whole game of each of the four, played through taps against the computer, at the iPad and the iPhone size.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* browser tests skip themselves */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

async function playOut(p, errs) {
  for (let step = 0; step < 900; step++) {
    if (await p.locator('[data-act=again], [data-act=nextgame]').count()) return step;
    const click = async sel => { const l = p.locator(sel).first(); if (await l.count()) { await l.click({ timeout: 2000, force: true }).catch(() => {}); return true; } return false; };
    if (await click('[data-act=tipok]')) continue;
    if (await click('[data-act=ack]')) { await p.waitForTimeout(30); continue; }
    if (await click('[data-act=wall]')) continue;
    if (await click('[data-act=throw]')) { await p.waitForTimeout(720); continue; }
    if (await click('[data-act=troll]')) { await p.waitForTimeout(720); continue; }
    if (await p.locator('.tcard.glow[data-act=take]').count()) { await click('.tcard.glow[data-act=take]'); continue; }
    if (await click('[data-act=reroll]')) { await p.waitForTimeout(720); continue; }
    if (await click('[data-act=lroll]')) { await p.waitForTimeout(720); continue; }
    if (await p.locator('[data-act=claim]').count()) { await p.locator('[data-act=claim]').nth(Math.floor(Math.random() * 10)).click({ force: true }); continue; }
    if (await click('[data-act=accuse][data-y="0"]')) continue;
    if (await click('[data-act=brag][data-y="1"]')) continue;
    if (await p.locator('[data-act=setnum]').count()) { await p.locator('[data-act=setnum]').nth(3).click(); await p.locator('[data-act=setnum]').nth(11).click(); await click('[data-act=hide]'); continue; }
    if (await p.locator('[data-act=radarpick]').count()) { await click('[data-act=radarpick]'); await p.waitForTimeout(30); continue; }
    if (await p.locator('[data-act=attack]').count()) { await p.locator('[data-act=attack]').nth(Math.floor(Math.random() * await p.locator('[data-act=attack]').count())).click({ force: true }); continue; }
    if (await click('[data-act=mode][data-m=attack]')) continue;
    await p.waitForTimeout(120);
  }
  throw new Error('the game did not finish; errors: ' + errs.join('|'));
}

for (const [w, h] of [[820, 1180], [402, 874]]) for (const kind of ['darts', 'tp', 'lie', 'ship']) {
  test(`ui: a whole game of ${kind} against the computer, played through taps, at ${w}x${h}`, { skip: !chromium, timeout: 240000 }, async () => {
    const b = await chromium.launch(), p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    try {
      await p.goto(URL); assert.match(await p.innerText('h1'), /Mini Roll/); assert.equal(await p.locator('.tile').count(), 4, 'four games on the menu');
      await p.click('.tile[data-k=' + kind + ']'); await p.click('[data-act=opp][data-v=easy]'); if (kind === 'darts' || kind === 'ship') await p.click('[data-act=cfg][data-k=match][data-v="1"]'); await p.click('[data-act=start]');
      await playOut(p, errs);
      assert.ok(await p.locator('.sheet .box h2').count() >= 1, 'a result is shown'); assert.deepEqual(errs, []);
      const over = await p.evaluate(() => { const e = document.querySelector('.screen'); return e.scrollHeight <= innerHeight + 2 && e.scrollWidth <= innerWidth + 2; }); assert.ok(over, 'nothing spills off the screen');
    } finally { await b.close(); }
  });
}

test('ui: pass & play hides the secrets behind a hand-off screen (Where\'s the Lie? and Battleship)', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('.tile[data-k=lie]'); await p.click('[data-act=opp][data-v=pass]'); await p.click('[data-act=start]');
    await p.locator('[data-act=tipok]').click({ timeout: 800 }).catch(() => {});
    assert.equal(await p.locator('.handoff').count(), 1, 'a hand-off screen comes first'); assert.doesNotMatch(await p.innerText('#app'), /Your die/);
    await p.click('[data-act=seen]'); await p.click('[data-act=lroll]'); await p.waitForTimeout(800); assert.match(await p.innerText('#app'), /only you can see/);
    await p.locator('[data-act=claim]').first().click(); assert.equal(await p.locator('.handoff').count(), 1, 'the other player is handed the device before they decide'); assert.doesNotMatch(await p.innerText('#app'), /only you can see/);
    await p.click('[data-act=seen]'); assert.equal(await p.locator('[data-act=accuse]').count(), 2, 'accuse or believe');
    await p.click('[data-act=menu0]').catch(() => {}); await p.evaluate(() => window.__mrw.A.menu0()); await p.click('.tile[data-k=ship]'); await p.click('[data-act=opp][data-v=pass]'); await p.click('[data-act=start]'); await p.locator('[data-act=tipok]').click({ timeout: 800 }).catch(() => {});
    await p.click('[data-act=seen]'); await p.locator('[data-act=setnum]').nth(1).click(); await p.locator('[data-act=setnum]').nth(8).click(); await p.click('[data-act=hide]');
    assert.equal(await p.locator('.handoff').count(), 1, 'the next wizard hides theirs in private'); assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
