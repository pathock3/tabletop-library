// A whole game played through taps (iPad and iPhone portrait), and the Rules Lab simulation.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* browser tests skip themselves */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

for (const [w, h, tag] of [[820, 1180, 'iPad'], [402, 874, 'iPhone']]) {
  test('Thrift Shop: a whole game by taps on the ' + tag, { skip: !chromium, timeout: 120000 }, async () => {
    const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL); await p.click('[data-act=setup]'); await p.click('[data-act=players][data-n="3"]'); await p.click('[data-act=start]');
    const has = async sel => (await p.locator(sel).count()) > 0;
    let over = false, bought = 0, sold = 0, bought_this = false;
    for (let step = 0; step < 400 && !over; step++) {
      if (await has('[data-act=keep]')) { await p.locator('[data-act=keep]').first().click(); bought++; continue; }
      if (await has('[data-act=draw]')) { await p.click('[data-act=buyn][data-d="1"]'); await p.click('[data-act=draw]'); continue; }
      if (await has('[data-act=closesheet]')) { await p.click('[data-act=closesheet]'); continue; }
      if (await has('[data-act=start]:has-text("Play again")')) { over = true; break; }
      if (await has('[data-act=nextseason]')) { if (await has('[data-act=slot]')) await p.locator('[data-act=slot]').first().click(); await p.click('[data-act=nextseason]'); bought_this = false; continue; }
      if (await has('[data-act=doneshop]')) {
        if (!bought_this) { bought_this = true; await p.locator('[data-act=stack]').nth(step % 4).click(); continue; }
        if (sold < 2 && await has('[data-act=selcard]')) { await p.locator('[data-act=selcard]').first().click(); if (await has('[data-act=sell]')) { await p.click('[data-act=sell]'); sold++; } continue; }
        await p.click('[data-act=doneshop]'); continue;
      }
      await p.waitForTimeout(60);
    }
    assert.ok(over, 'the game did not finish; errors: ' + errs.join('|')); assert.ok(bought >= 3 && sold >= 1);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errs, []); await b.close();
  });
}

test('Thrift Shop: the Rules Lab changes a rule and Simulate compares it with the rulebook', { skip: !chromium, timeout: 120000 }, async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 820, height: 1180 } }); const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL); await p.click('[data-act=lab]');
  for (let i = 0; i < 2; i++) await p.click('[data-act=num][data-k=seasonCount][data-d="-1"]');
  assert.match(await p.locator('.ctl.chg').first().innerText(), /Seasons played/);
  await p.click('[data-act=simset][data-k=games][data-v="50"]'); await p.click('[data-act=simrun]'); await p.waitForSelector('table.cmp', { timeout: 60000 });
  const row = await p.locator('table.cmp tr:nth-child(4) td').allInnerTexts(); // average points per player
  assert.ok(parseFloat(row[2]) < parseFloat(row[1]), 'fewer seasons, fewer points: ' + row.join('|'));
  assert.deepEqual(errs, []); await b.close();
});
