// A whole game by touch against the computer parents, on an iPad and an iPhone (portrait).
const test = require('node:test');
const { after } = test;
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* browser tests skip themselves */ }
const browsers = []; const launch = async () => { const b = await chromium.launch(); browsers.push(b); return b; };
after(async () => { for (const b of browsers) await b.close().catch(() => {}); });
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

for (const [w, h, tag] of [[820, 1180, 'iPad'], [402, 874, 'iPhone']]) {
  test('OMG Babies!: a whole game by taps on the ' + tag, { timeout: 90000, skip: !chromium }, async () => {
    const b = await launch(); const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage(); p.setDefaultTimeout(5000); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL); await p.click('[data-act=bots][data-n="1"]'); await p.click('[data-act=level][data-k=easy]'); await p.click('[data-act=play]');
    const has = async sel => (await p.locator(sel).count()) > 0; let turns = 0, bought = false, daycare = false;
    for (let step = 0; step < 300; step++) {
      if (await has('.final')) break;
      if (await has('[data-act=closesheet]')) { await p.click('[data-act=closesheet]'); continue; }
      if (await has('[data-act=toafternoon]')) {
        if (!daycare && await has('[data-act=daystart]:not([disabled])')) { daycare = true; await p.click('[data-act=daystart]'); await p.locator('.baby').first().click(); assert.equal(await p.locator('.baby.pick').count(), 1); await p.click('[data-act=daycancel]'); continue; }
        if (await has('[data-act=newbaby]:not([disabled])')) { await p.click('[data-act=newbaby]'); await p.waitForTimeout(60); continue; }
        await p.click('[data-act=toafternoon]'); assert.ok(await p.locator('.die').count() >= 6); continue;
      }
      if (await has('[data-act=finish]')) {
        if (!bought && await has('.goal.ok')) { bought = true; const g = p.locator('.goal.ok').first(); await g.click(); assert.equal(await p.locator('.goal.pick').count(), 1); await g.click(); await p.waitForTimeout(100); continue; }
        if (await has('.die:not(.fixed)')) { await p.locator('.die:not(.fixed)').first().click(); assert.equal(await p.locator('.die.sel').count(), 1); await p.locator('.die.sel').click(); }
        await p.click('[data-act=finish]'); continue;
      }
      if (await has('[data-act=next]')) { turns++; await p.click('[data-act=next]'); continue; }
      await p.waitForTimeout(50);
    }
    assert.ok(await has('.final'), 'the game did not finish'); assert.equal(turns, 7); assert.equal(await p.locator('.final .r').count(), 2);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errs, []);
  });
}
