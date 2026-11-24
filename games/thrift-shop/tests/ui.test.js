// A whole game on a landscape iPad by touch: taking, the hand-full hint, Put back, dragging, building, reveal, the end screen. Then portrait loads.
const test = require('node:test');
const { after } = test;
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* browser tests skip themselves */ }
const browsers = []; const launch = async () => { const b = await chromium.launch(); browsers.push(b); return b; };
after(async () => { for (const b of browsers) await b.close().catch(() => {}); });
const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const SETTINGS = JSON.stringify({ bots: 3, rounds: 2, thriftSecs: 60, botSpeed: 'fast' });

async function open(b, w, h) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: false }); await ctx.addInitScript(s => { try { localStorage.setItem('thriftshop26-settings', s); } catch (e) { /* none */ } }, SETTINGS);
  const p = await ctx.newPage(); p.setDefaultTimeout(5000); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL); return { p, errs };
}
const state = p => p.evaluate(() => { const s = window.__t2.ui.s; return { phase: s.phase, round: s.round, hand: s.players[0].hand.slice(), cells: s.cells.filter(Boolean).length, up: s.cells.filter(c => c && c.up).length }; });

test('Thrift Shop: a whole 2-round game by touch at 1180x820', { skip: !chromium, timeout: 120000 }, async () => {
  const b = await launch(); const { p, errs } = await open(b, 1180, 820);
  await p.click('[data-act=play]'); assert.equal((await state(p)).phase, 'invite'); assert.equal((await state(p)).cells, 130);
  const hasMessTiles = await p.locator('.tile').count(); assert.equal(hasMessTiles, 150);
  await p.click('[data-act=begin]'); assert.equal((await state(p)).phase, 'thrift');
  // take a card: hand 5 -> 6; a face-down card stays unseen until taken
  await p.locator('.tile.down').first().click(); await p.waitForTimeout(150); let st = await state(p); assert.equal(st.hand.length, 6);
  // hand full: another tap does nothing but show the hint
  const before = st.cells; await p.locator('.tile.down').first().click(); await p.waitForTimeout(150); assert.ok(await p.locator('.hint').count()); assert.equal((await state(p)).hand.length, 6); assert.ok((await state(p)).cells <= before);
  // a single tap on a hand card selects it, never puts it back
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(100); assert.equal((await state(p)).hand.length, 6); assert.equal(await p.locator('.hc.sel').count(), 1);
  assert.equal(await p.locator('[data-act=putback]:not([disabled])').count(), 1);
  // tapping elsewhere deselects
  await p.mouse.click(1100, 40); await p.waitForTimeout(100); assert.equal(await p.locator('.hc.sel').count(), 0);
  // drag to reorder: the first card goes to the third place
  const first = (await state(p)).hand[0]; const a = await p.locator('.hc[data-hand="0"]').boundingBox(), c = await p.locator('.hc[data-hand="2"]').boundingBox();
  await p.mouse.move(a.x + 40, a.y + 60); await p.mouse.down(); await p.mouse.move(a.x + 120, a.y + 70, { steps: 4 }); await p.mouse.move(c.x + 60, c.y + 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150);
  assert.equal((await state(p)).hand[2], first);
  // select and confirm Put back: the card returns face up to the mess, the hand is 5 again
  const upBefore = (await state(p)).up; await p.locator('.hc[data-hand="1"]').click(); await p.click('[data-act=putback]'); await p.waitForTimeout(150); st = await state(p);
  assert.equal(st.hand.length, 5); assert.ok(st.up >= upBefore + 1 - 3); assert.ok(await p.locator('.tile.up').count() >= 1);
  // time up -> build
  await p.evaluate(() => window.__t2.endThrift()); await p.waitForTimeout(200); assert.equal((await state(p)).phase, 'build');
  // tap a card then a slot of the right type; a wrong slot refuses
  const hand = (await p.evaluate(() => window.__t2.ui.s.players[0].hand.map(c => SHEET.cards[c].type)));
  const clothing = hand.findIndex(t => t !== 'Accessory'); const type = hand[clothing]; const wrong = ['Head', 'Top', 'Bottom', 'Shoes'].find(t => t !== type);
  await p.locator(`.hc[data-hand="${clothing}"]`).click(); await p.locator(`.slot[data-slot="${wrong}"]`).click(); await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => Object.values(window.__t2.ui.s.players[0].board).filter(x => x != null).length), 0);
  await p.locator(`.slot[data-slot="${type}"]`).click(); await p.waitForTimeout(100);
  assert.equal(await p.evaluate(t => window.__t2.ui.s.players[0].board[t] != null, type), true);
  // drag another card to its slot
  const other = hand.findIndex((t, i) => i !== clothing && t !== 'Accessory' && t !== type);
  if (other >= 0) { const bb = await p.locator(`.hc[data-hand="${other}"]`).boundingBox(), sb = await p.locator(`.slot[data-slot="${hand[other]}"]`).boundingBox(); await p.mouse.move(bb.x + 40, bb.y + 40); await p.mouse.down(); await p.mouse.move(bb.x + 80, bb.y + 60, { steps: 4 }); await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150); assert.equal(await p.evaluate(t => window.__t2.ui.s.players[0].board[t] != null, hand[other]), true); }
  await p.click('[data-act=done]'); await p.waitForTimeout(200); assert.equal((await state(p)).phase, 'reveal'); assert.ok(await p.locator('.rv').count() === 4);
  await p.click('[data-act=next]'); assert.equal((await state(p)).round, 2); assert.equal((await state(p)).phase, 'invite');
  // the mess is not reshuffled: round 2 keeps its empty spaces
  assert.ok((await state(p)).cells < 150);
  await p.click('[data-act=begin]'); await p.evaluate(() => window.__t2.endThrift()); await p.click('[data-act=done]'); await p.click('[data-act=next]'); await p.waitForTimeout(200);
  assert.equal((await state(p)).phase, 'over'); assert.ok(await p.locator('.row2').count() === 4); assert.ok(await p.locator('[data-act=again]').count());
  await p.click('[data-act=log]'); assert.match(await p.locator('#logtext').inputValue(), /Round 1:[\s\S]*Round 2:[\s\S]*Final:/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errs, []); await b.close();
});

test('Thrift Shop: the bots really scramble in real time, and the timer ends the round', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } }); await ctx.addInitScript(() => { localStorage.setItem('thriftshop26-settings', JSON.stringify({ bots: 3, rounds: 1, thriftSecs: 10, botSpeed: 'fast' })); });
  const p = await ctx.newPage(); await p.goto(URL); await p.click('[data-act=play]'); await p.click('[data-act=begin]'); const snap = () => p.evaluate(() => JSON.stringify(window.__t2.ui.s.cells)); const c0 = await snap();
  await p.waitForTimeout(4000); assert.notEqual(await snap(), c0, 'bots took and put back cards'); assert.ok(await p.locator('#secs').count());
  await p.waitForSelector('[data-act=done]', { timeout: 12000 }); assert.equal((await state(p)).phase, 'build'); await b.close();
});

test('Thrift Shop: settings change the game, and the menu works in portrait and on a phone', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch();
  for (const [w, h] of [[820, 1180], [402, 874]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); await p.goto(URL);
    await p.click('[data-act=settings]'); await p.click('[data-act=num][data-k=bots][data-d="-1"]'); await p.click('[data-act=num][data-k=rounds][data-d="-1"]'); await p.click('[data-act=play]');
    assert.equal(await p.evaluate(() => window.__t2.ui.s.n), 3); assert.equal(await p.evaluate(() => window.__t2.ui.s.invites.length), 6);
    assert.ok(await p.locator('.rotate').count()); await p.click('[data-act=rotateoff]'); assert.equal(await p.locator('.rotate').count(), 0); assert.ok(await p.locator('.invitepanel').count());
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errs, []); await ctx.close();
  }
  await b.close();
});
