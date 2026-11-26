// A whole game on a landscape iPad by touch: two invites, taking, multi-select put back, dragging, building on the figure, reveal, the end. Portrait loads; the debug gallery.
const test = require('node:test');
const { after } = test;
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* browser tests skip themselves */ }
const browsers = []; const launch = async () => { const b = await chromium.launch(); browsers.push(b); return b; };
after(async () => { for (const b of browsers) await b.close().catch(() => {}); });
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const SETTINGS = JSON.stringify({ bots: 3, rounds: 2, thriftSecs: 60, botSpeed: 'fast' });

async function open(b, w, h, settings = SETTINGS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); await ctx.addInitScript(s => { try { localStorage.setItem('thriftshop26-settings', s); } catch (e) { /* none */ } }, settings);
  const p = await ctx.newPage(); p.setDefaultTimeout(5000); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL); return { p, errs };
}
const state = p => p.evaluate(() => { const s = window.__t2.ui.s; return { phase: s.phase, round: s.round, hand: s.players[0].hand.slice(), cells: s.cells.filter(Boolean).length, invites: window.__t2.E.inviteNames(s) }; });

test('Thrift Shop: a whole 2-round game by touch at 1180x820', { skip: !chromium, timeout: 120000 }, async () => {
  const b = await launch(); const { p, errs } = await open(b, 1180, 820);
  await p.click('[data-act=play]'); let st = await state(p); assert.equal(st.phase, 'invite'); assert.equal(st.cells, 100); assert.equal(st.hand.length, 5); assert.equal(st.invites.length, 2);
  assert.equal(await p.locator('.invitepanel .one').count(), 2); assert.equal(await p.locator('.topbar .invitecard').count(), 2); assert.equal(await p.locator('.tile').count(), 120);
  await p.click('[data-act=begin]'); assert.equal((await state(p)).phase, 'thrift');
  // the mess is all face down; a full hand (5) refuses a take and shows the hint
  assert.equal(await p.locator('.tile.up').count(), 0); await p.locator('.tile.down').first().click(); await p.waitForTimeout(150); assert.ok(await p.locator('.hint').count()); assert.equal((await state(p)).hand.length, 5);
  // a single tap on a hand card selects it and never puts it back; a second card joins the selection; Put back (N) shows the count
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(80); assert.equal((await state(p)).hand.length, 5); assert.equal(await p.locator('.hc.sel').count(), 1);
  await p.locator('.hc[data-hand="2"]').click(); await p.waitForTimeout(80); assert.equal(await p.locator('.hc.sel').count(), 2); assert.match(await p.locator('[data-act=putback]').innerText(), /Put back \(2\)/);
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(80); assert.equal(await p.locator('.hc.sel').count(), 1); // a second tap deselects
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(80);
  const gone = (await state(p)).hand; const n0 = (await state(p)).cells; await p.click('[data-act=putback]'); await p.waitForTimeout(150); st = await state(p);
  assert.equal(st.hand.length, 3); assert.equal(st.cells, n0 + 2); assert.ok(!st.hand.includes(gone[0]) && !st.hand.includes(gone[2])); assert.equal(await p.locator('.tile.up').count(), 0); assert.equal(await p.locator('.hc.sel').count(), 0);
  const faceUp = await p.evaluate(() => window.__t2.ui.s.cells.filter(c => c && c.up !== undefined).length); assert.equal(faceUp, 0);
  // take two cards blind
  await p.locator('.tile.down').nth(5).click(); await p.waitForTimeout(100); await p.locator('.tile.down').nth(9).click(); await p.waitForTimeout(100); assert.equal((await state(p)).hand.length, 5);
  // drag to reorder: the first card goes to the third place
  const first = (await state(p)).hand[0]; const a = await p.locator('.hc[data-hand="0"]').boundingBox(), c = await p.locator('.hc[data-hand="2"]').boundingBox();
  await p.mouse.move(a.x + 40, a.y + 60); await p.mouse.down(); await p.mouse.move(a.x + 120, a.y + 70, { steps: 4 }); await p.mouse.move(c.x + 60, c.y + 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150);
  assert.equal((await state(p)).hand[2], first);
  // time up -> build on the figure
  await p.evaluate(() => window.__t2.endThrift()); await p.waitForTimeout(200); assert.equal((await state(p)).phase, 'build'); assert.equal(await p.locator('.figwrap .zone').count(), 4);
  const types = await p.evaluate(() => window.__t2.ui.s.players[0].hand.map(c => SHEET.cards[c].type)); const ci = types.findIndex(t => t !== 'Accessory'), type = types[ci], wrong = ['Head', 'Top', 'Bottom'].find(t => t !== type);
  await p.locator(`.hc[data-hand="${ci}"]`).click(); await p.locator(`.zone[data-slot="${wrong}"]`).click(); await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => Object.values(window.__t2.ui.s.players[0].board).filter(x => x != null).length), 0); // the wrong part of the figure refuses
  await p.locator(`.zone[data-slot="${type}"]`).click(); await p.waitForTimeout(100); assert.equal(await p.evaluate(t => window.__t2.ui.s.players[0].board[t] != null, type), true);
  assert.ok(await p.locator('.figwrap [data-print], .figwrap svg').count());
  const oi = types.findIndex((t, i) => i !== ci && t !== type); if (oi >= 0) { const bb = await p.locator(`.hc[data-hand="${oi}"]`).boundingBox(), zb = await p.locator(`.zone[data-slot="${types[oi]}"]`).boundingBox(); await p.mouse.move(bb.x + 40, bb.y + 40); await p.mouse.down(); await p.mouse.move(bb.x + 80, bb.y + 60, { steps: 4 }); await p.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150); assert.equal(await p.evaluate(t => window.__t2.ui.s.players[0].board[t] != null, types[oi]), true); }
  await p.click('[data-act=done]'); await p.waitForTimeout(200); assert.equal((await state(p)).phase, 'reveal'); assert.equal(await p.locator('.rv').count(), 4); assert.equal(await p.locator('.rv').first().locator('.parts').count(), 2);
  const r = await p.evaluate(() => { const R = window.__t2.ui.s.results; return R.players.every(x => x.likes === x.byInvite[0].likes + x.byInvite[1].likes); }); assert.equal(r, true);
  const prev = (await state(p)).invites; await p.click('[data-act=next]'); st = await state(p); assert.equal(st.round, 2); assert.equal(st.phase, 'invite'); assert.ok(st.invites.every(n => !prev.includes(n))); assert.ok(st.cells < 120);
  await p.click('[data-act=begin]'); await p.evaluate(() => window.__t2.endThrift()); await p.click('[data-act=done]'); await p.click('[data-act=next]'); await p.waitForTimeout(200);
  assert.equal((await state(p)).phase, 'over'); assert.equal(await p.locator('.row2').count(), 4); await p.click('[data-act=log]'); assert.match(await p.locator('#logtext').inputValue(), /Round 1:[\s\S]*Round 2:[\s\S]*Final:/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errs, []);
});

test('Thrift Shop: the bots scramble in real time (taking blind, putting back several at once), and the timer ends the round', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch(); const { p } = await open(b, 1180, 820, JSON.stringify({ bots: 3, rounds: 1, thriftSecs: 10, botSpeed: 'fast' }));
  await p.click('[data-act=play]'); await p.click('[data-act=begin]'); const snap = () => p.evaluate(() => JSON.stringify(window.__t2.ui.s.cells)); const c0 = await snap();
  await p.waitForTimeout(4000); assert.notEqual(await snap(), c0, 'bots took and put back cards'); assert.equal(await p.locator('.tile.up').count(), 0); assert.ok(await p.locator('#secs').count());
  await p.waitForSelector('[data-act=done]', { timeout: 12000 }); assert.equal((await state(p)).phase, 'build');
});

test('Thrift Shop: settings change the game, and the menu works in portrait and on a phone', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch();
  for (const [w, h] of [[820, 1180], [402, 874]]) {
    const { p, errs } = await open(b, w, h, '{}');
    await p.click('[data-act=settings]'); await p.click('[data-act=num][data-k=bots][data-d="-1"]'); await p.click('[data-act=num][data-k=rounds][data-d="-1"]'); await p.click('[data-act=play]');
    assert.equal(await p.evaluate(() => window.__t2.ui.s.n), 3); assert.equal(await p.evaluate(() => window.__t2.ui.s.invites.length), 12); assert.equal(await p.evaluate(() => window.__t2.ui.s.cfg.handLimit), 5);
    assert.ok(await p.locator('.rotate').count()); await p.click('[data-act=rotateoff]'); assert.equal(await p.locator('.rotate').count(), 0); assert.ok(await p.locator('.invitepanel').count());
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errs, []); await p.context().close();
  }
});

test('Thrift Shop: the debug menu has an art gallery (all 120 cards match their sheet prints) and the parsed invite rules', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch(); const { p, errs } = await open(b, 1180, 820, JSON.stringify({ debug: true }));
  await p.click('[data-act=settings]'); assert.ok(await p.locator('[data-act=gallery]').count()); await p.click('[data-act=gallery]');
  for (const t of ['Head', 'Top', 'Bottom', 'Accessory']) { await p.click(`[data-act=gtype][data-t=${t}]`); assert.equal(await p.locator('.gcell').count(), 30, t); assert.equal(await p.locator('.gcell.bad').count(), 0, t + ' art disagrees with the sheet'); assert.equal(await p.locator('.gcell svg').count(), 30); }
  await p.click('[data-act=gfig]'); assert.equal(await p.locator('.gcell svg.figure-svg').count(), 30); assert.match(await p.locator('.top').innerText(), /All 120 match the sheet/);
  await p.click('[data-act=menu]'); await p.click('[data-act=settings]'); await p.click('[data-act=rulesview]'); assert.equal(await p.locator('.rrow').count(), 37); assert.match(await p.locator('.rrow code').first().innerText(), /"kind":"rank"/);
  await p.click('[data-act=menu]'); await p.click('[data-act=settings]'); await p.click('[data-act=debug]'); assert.equal(await p.locator('[data-act=gallery]').count(), 0); assert.deepEqual(errs, []);
});
