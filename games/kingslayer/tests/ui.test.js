// A whole game played through taps against the computer houses (iPad and iPhone portrait), and the Rules Lab simulation.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* browser tests skip themselves */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

for (const [w, h, tag] of [[820, 1180, 'iPad'], [402, 874, 'iPhone']]) {
  test('Kingslayer: a whole game by taps on the ' + tag, { skip: !chromium, timeout: 180000 }, async () => {
    const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL); await p.click('[data-act=setup]');
    await p.click('[data-act=houses][data-n="5"]'); await p.click('[data-act=level][data-k=easy]'); await p.click('[data-act=start]');
    const has = async sel => (await p.locator(sel).count()) > 0;
    let over = false, voted = 0;
    for (let step = 0; step < 1500 && !over; step++) {
      if (await has('[data-act=closesheet]')) { await p.click('[data-act=closesheet]'); continue; }
      if (await has('[data-act=continue]')) { await p.click('[data-act=continue]'); continue; }
      if (await has('[data-act=lcpass]')) { await p.click('[data-act=lcpass]'); continue; }
      if (await has('[data-act=early]')) { if (await has('[data-act=playcard]')) await p.click('[data-act=playcard]'); await p.click('[data-act=early]'); continue; }
      if (await has('[data-act=start]:has-text("Play again")')) { over = true; break; }
      const say = await p.locator('.say').first().innerText().catch(() => '');
      if (/small council/.test(say)) { await p.locator('.house:not([disabled])').first().click(); continue; }
      if (/Tap (a house whose|the house)|again to/.test(say)) { const t = p.locator('.house:not([disabled])').nth(step % 4); await t.click(); await t.click(); voted++; continue; }
      await p.waitForTimeout(100);
    }
    assert.ok(over, 'the game did not finish; errors: ' + errs.join('|'));
    assert.ok(voted > 2);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(overflow, false);
    assert.deepEqual(errs, []); await b.close();
  });
}

test('Kingslayer: the Rules Lab changes a rule and Simulate compares it with the 2022 rules', { skip: !chromium, timeout: 120000 }, async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 820, height: 1180 } }); const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL); await p.click('[data-act=lab]');
  for (let i = 0; i < 10; i++) await p.click('[data-act=num][data-k=winCoins][data-d="1"]');
  assert.match(await p.locator('.ctl.chg').first().innerText(), /Coins to win/);
  await p.click('[data-act=simset][data-k=games][data-v="50"]'); await p.click('[data-act=simset][data-k=houses][data-v="4"]'); await p.click('[data-act=simrun]');
  await p.waitForSelector('table.cmp', { timeout: 90000 });
  const rounds = await p.locator('table.cmp tr:nth-child(2) td').allInnerTexts(); assert.ok(parseFloat(rounds[2]) > parseFloat(rounds[1]), 'longer game with more coins to win: ' + rounds.join('|'));
  await p.click('[data-act=setup]'); await p.click('[data-act=start]');
  assert.deepEqual(errs, []); await b.close();
});
