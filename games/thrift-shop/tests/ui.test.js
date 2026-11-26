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
  await p.click('[data-act=play]'); let st = await state(p); assert.equal(st.phase, 'invite'); assert.equal(st.cells, 120); assert.equal(st.hand.length, 0); assert.equal(st.invites.length, 2); assert.equal(await p.locator('.tile.down.typed').count(), 120); assert.equal(await p.locator('.invitepanel .legend').count(), 1);
  assert.equal(await p.locator('.invitepanel .one').count(), 2); assert.equal(await p.locator('.topbar .invitecard').count(), 2); assert.equal(await p.locator('.tile').count(), 120);
  await p.click('[data-act=begin]'); assert.equal((await state(p)).phase, 'thrift');
  // everyone starts with 0 cards: take 7 blind; the 8th is refused with a hint. The mess is all face down, and each back shows its card's type (colour + icon)
  assert.equal(await p.locator('.tile.up').count(), 0);
  const back = await p.evaluate(() => { const s = window.__t2.ui.s, i = s.cells.findIndex(Boolean), el = document.querySelector(`.tile[data-cell="${i}"]`); return { ic: el.dataset.ic, want: GAME_DATA.slots.find(x => x.id === SHEET.cards[s.cells[i].c].type).icon, text: el.textContent }; });
  assert.equal(back.ic, back.want); assert.equal(back.text, '');
  for (let k = 0; k < 7; k++) { await p.locator('.tile.down').nth(3 + k * 4).click(); await p.waitForTimeout(450); }
  assert.equal((await state(p)).hand.length, 7); await p.locator('.tile.down').nth(1).click(); await p.waitForTimeout(150); assert.ok(await p.locator('.hint').count()); assert.equal((await state(p)).hand.length, 7);
  await p.evaluate(() => { window.__t2.ui.paused = true; });   // freeze the bots and the clock while counting cards
  // a single tap on a hand card selects it and never puts it back; a second card joins the selection; Put back (N) shows the count
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(80); assert.equal((await state(p)).hand.length, 7); assert.equal(await p.locator('.hc.sel').count(), 1);
  await p.locator('.hc[data-hand="2"]').click(); await p.waitForTimeout(80); assert.equal(await p.locator('.hc.sel').count(), 2); assert.match(await p.locator('[data-act=putback]').innerText(), /Put back \(2\)/);
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(80); assert.equal(await p.locator('.hc.sel').count(), 1); // a second tap deselects
  await p.locator('.hc[data-hand="0"]').click(); await p.waitForTimeout(80);
  const gone = (await state(p)).hand; const n0 = (await state(p)).cells; await p.click('[data-act=putback]'); await p.waitForTimeout(150); st = await state(p);
  assert.equal(st.hand.length, 5); assert.equal(st.cells, n0 + 2); assert.ok(!st.hand.includes(gone[0]) && !st.hand.includes(gone[2])); assert.equal(await p.locator('.tile.up').count(), 0); assert.equal(await p.locator('.hc.sel').count(), 0);
  const faceUp = await p.evaluate(() => window.__t2.ui.s.cells.filter(c => c && c.up !== undefined).length); assert.equal(faceUp, 0);
  await p.evaluate(() => { window.__t2.ui.paused = false; window.__t2.ui.last = Date.now(); });
  // take two cards blind
  await p.locator('.tile.down').nth(5).click(); await p.waitForTimeout(450); await p.locator('.tile.down').nth(9).click(); await p.waitForTimeout(450); assert.equal((await state(p)).hand.length, 7);
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
  assert.ok(await p.locator('.figwrap svg').count()); assert.equal(await p.locator('.figwrap [data-print]').count(), 0);
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
    assert.equal(await p.evaluate(() => window.__t2.ui.s.n), 3); assert.equal(await p.evaluate(() => window.__t2.ui.s.invites.length), 8); assert.equal(await p.evaluate(() => window.__t2.ui.s.cfg.handLimit), 7); assert.equal(await p.evaluate(() => window.__t2.ui.s.cfg.thriftSecs), 90); assert.equal(await p.evaluate(() => window.__t2.ui.s.cfg.typeBacks), true);
    assert.ok(await p.locator('.rotate').count()); await p.click('[data-act=rotateoff]'); assert.equal(await p.locator('.rotate').count(), 0); assert.ok(await p.locator('.invitepanel').count());
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); assert.deepEqual(errs, []); await p.context().close();
  }
});

test('Thrift Shop: the debug menu has an art gallery (every card has art) and the parsed invite rules', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch(); const { p, errs } = await open(b, 1180, 820, JSON.stringify({ debug: true }));
  await p.click('[data-act=settings]'); assert.ok(await p.locator('[data-act=gallery]').count()); await p.click('[data-act=gallery]');
  for (const t of ['Head', 'Top', 'Bottom', 'Accessory']) { await p.click(`[data-act=gtype][data-t=${t}]`); assert.equal(await p.locator('.gcell').count(), 30, t); assert.equal(await p.locator('.gcell.bad').count(), 0, t + ' has a card without art'); assert.equal(await p.locator('.gcell svg').count(), 30); }
  await p.click('[data-act=gfig]'); assert.equal(await p.locator('.gcell svg.figure-svg').count(), 30); assert.match(await p.locator('.top').innerText(), /All 120 cards have art/);
  await p.click('[data-act=menu]'); await p.click('[data-act=settings]'); await p.click('[data-act=rulesview]'); assert.equal(await p.locator('.rrow').count(), 37); assert.match(await p.locator('.rrow code').first().innerText(), /"kind":"rank"/);
  await p.click('[data-act=menu]'); await p.click('[data-act=settings]'); await p.click('[data-act=debug]'); assert.equal(await p.locator('[data-act=gallery]').count(), 0); assert.deepEqual(errs, []);
});

test('Thrift Shop: the colour-coded backs toggle in Settings; off means plain backs and no legend', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch(); const { p, errs } = await open(b, 1180, 820, '{}');
  await p.click('[data-act=settings]'); assert.match(await p.locator('[data-act=typebacks]').innerText(), /On/); await p.click('[data-act=typebacks]'); assert.match(await p.locator('[data-act=typebacks]').innerText(), /Off/);
  await p.click('[data-act=play]'); assert.equal(await p.locator('.tile.down').count(), 120); assert.equal(await p.locator('.tile.down.typed').count(), 0); assert.equal(await p.locator('.legend').count(), 0);
  assert.equal(await p.evaluate(() => window.__t2.ui.s.cfg.typeBacks), false); assert.ok(await p.evaluate(() => window.__t2.E.viewFor(window.__t2.ui.s, 0).cells.filter(Boolean).every(c => c.t === null))); assert.deepEqual(errs, []);
});

test('Thrift Shop: an accessory that needs a trait shows the picker when placed; Hatbox opens a second Head slot; a Changing Room Key swap happens before scoring', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await launch(); const { p, errs } = await open(b, 1180, 820, JSON.stringify({ bots: 1, rounds: 1, thriftSecs: 60, botSpeed: 'fast' }));
  await p.click('[data-act=play]'); await p.click('[data-act=begin]'); await p.evaluate(() => window.__t2.endThrift());
  await p.evaluate(() => { const { ui } = window.__t2, s = ui.s, id = n => SHEET.cards.findIndex(c => c.name === n); const me = s.players[0]; me.hand = ['Mood Ring', 'Hatbox', 'Tiara', 'Pearl Hair Bow', 'Changing Room Key', 'Tutu'].map(id); window.__t2.render(); });
  assert.equal(await p.locator('.strip').count(), 0);
  await p.locator('.hc[data-hand="0"]').click(); await p.locator('.zone[data-slot="Accessory"]').click(); await p.waitForTimeout(100);
  assert.equal(await p.locator('.strip .pick').count(), 1); assert.equal(await p.locator('.strip .chip').count(), 4);
  await p.locator('.strip .chip[data-imp="Spooky"]').click(); await p.waitForTimeout(100); assert.deepEqual(await p.evaluate(() => window.__t2.ui.s.players[0].picks.Accessory), ['Spooky']); assert.match(await p.locator('.totals').innerText(), /Mood Ring: \+2 Spooky/);
  assert.equal(await p.locator('.extras').count(), 0);
  await p.locator('.hc[data-hand="1"]').click(); await p.locator('.zone[data-slot="Accessory"]').click(); await p.waitForTimeout(100);   // Hatbox replaces the ring
  assert.equal(await p.locator('.strip').count(), 0); assert.equal(await p.locator('.extras .zone.xz').count(), 1);
  await p.locator('.hc[data-hand="2"]').click(); await p.locator('.zone[data-slot="Head"]').click(); await p.locator('.hc[data-hand="3"]').click(); await p.locator('.zone[data-slot="Head"]').click(); await p.waitForTimeout(100);
  assert.deepEqual(await p.evaluate(() => { const b = window.__t2.ui.s.players[0].board; return [b.Head, b.Head2].map(c => c == null ? null : SHEET.cards[c].name); }), ['Tiara', 'Pearl Hair Bow']);   // the second Head went to the bonus slot
  await p.evaluate(() => { const { ui } = window.__t2, E = window.__t2.E, s = ui.s, id = n => SHEET.cards.findIndex(c => c.name === n); E.apply(s, { type: 'unplace', seat: 0, slot: 'Accessory' }); E.apply(s, { type: 'place', seat: 0, card: id('Changing Room Key') }); window.__t2.render(); });
  assert.equal(await p.locator('.extras').count(), 0); await p.click('[data-act=done]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => window.__t2.ui.s.phase), 'swap'); assert.equal(await p.locator('.swapnote').count(), 1); assert.match(await p.locator('[data-act=keepswap]').innerText(), /Keep my outfit/);
  const tutu = await p.evaluate(() => SHEET.cards.findIndex(c => c.name === 'Tutu')); await p.locator(`.hc[data-card="${tutu}"]`).click(); await p.locator('.zone[data-slot="Bottom"]').click(); await p.waitForTimeout(100);   // nothing worn there: refused
  assert.equal(await p.evaluate(() => window.__t2.ui.s.phase), 'swap');
  await p.locator('.hc[data-hand="3"]').click(); await p.locator('.zone[data-slot="Head"]').click(); await p.waitForTimeout(100);   // Pearl Hair Bow is already on the board: refused
  await p.evaluate(() => { const s = window.__t2.ui.s, E = window.__t2.E; E.apply(s, { type: 'place', seat: 0, card: SHEET.cards.findIndex(c => c.name === 'Tiara') }); });
  await p.click('[data-act=keepswap]'); await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => window.__t2.ui.s.phase), 'reveal'); assert.equal(await p.locator('.rv').count(), 2); assert.deepEqual(errs, []);
});
