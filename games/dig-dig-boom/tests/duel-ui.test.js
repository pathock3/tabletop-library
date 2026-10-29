// Browser tests for the two-player screen: the mode picker, two seats, one shared die in the middle, Pause.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
function findChromium() {
  for (const t of [() => require('playwright'), () => require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))]) { try { return t().chromium; } catch (e) { /* next */ } }
  return null;
}
const chromium = findChromium();
const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const SKIP = { skip: !chromium && 'Playwright/Chromium not available', timeout: 90000 };
const TOP = '.duel .seatbox.top ', BOT = '.duel .seatbox.bottom ';

async function open() {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.DDB_TALLY_PACE = 0.01; window.DDB_DUEL_ROLL_MS = 400; });
  await page.goto(FILE);
  await page.waitForSelector('#play .home');
  return { browser, page, errors };
}
async function startDuel(page, names) {
  await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play .modepick');
  await page.click('#play [data-p=startduel]'); await page.waitForSelector('#play .namepick');
  if (names) { await page.fill('.ninput[data-id=p1]', names[0]); await page.fill('.ninput[data-id=p2]', names[1]); }
  await page.click('#play [data-p=duelgo]'); await page.waitForSelector('.duel');
}
// Open the pack, keep the first card and get to the Starter Kit, for one seat.
async function prep(page, seat) {
  await page.click(seat + '[data-p=openpack]'); await page.waitForSelector(seat + '[data-p=pick]');
  await page.click(seat + '[data-p=pick]'); await page.click(seat + '[data-p=keepgo]'); await page.waitForSelector(seat + '[data-p=startround]');
}
// Both Mines are Geodes (no Monster to fight), so the first dig can always be banked.
async function geodes(page) {
  await page.evaluate(() => { const D = window.DigDigBoomDuel, all = window.DigDigBoomUI.state.all, g = all.find(c => /^Geode$/i.test(c.name));
    for (const id of ['p1', 'p2']) { const sd = D.seats[id]; sd.S.st.mine = [0, 1, 2, 3].map(i => ({ ...g, uid: 9000 + i })); sd.S.st.known = 0; sd.render(); } });
}

test('New game asks: play the AI or two players; the AI path is the one it was', SKIP, async () => {
  const { browser, page, errors } = await open();
  await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play .modepick');
  assert.equal(await page.locator('#play .modebtn').count(), 2);
  await page.click('#play [data-p=startai]'); await page.waitForSelector('#play .setup');
  assert.equal(await page.locator('.duel').count(), 0);
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: two seats (the top one turned round), one Leaderboard and Pause in the middle', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page);
  const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { top: r('.duel .seatbox.top'), band: r('.duel .duelband'), bot: r('.duel .seatbox.bottom'), pause: r('.duel [data-p=gmenu]'), rot: getComputedStyle(document.querySelector('.duel .seatbox.top')).transform }; });
  assert.ok(g.top.bottom <= g.band.top + 1 && g.band.bottom <= g.bot.top + 1, 'seat, middle, seat');
  assert.ok(Math.abs(g.top.height - g.bot.height) < 2, 'halves are equal');
  assert.ok(g.pause.top >= g.band.top && g.pause.bottom <= g.band.bottom, 'Pause is in the middle');
  assert.notEqual(g.rot, 'none');
  assert.equal(await page.locator('.duel .duelband .lb').count(), 0, 'no Leaderboard in the middle while choosing cards');
  assert.equal(await page.locator('.duel [data-p=gmenu]').count(), 1, 'one Pause button');
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: the round starts when both are Ready; one Escape roll, the same for both, then each goes on alone', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page);
  await prep(page, BOT); await prep(page, TOP);
  await page.click(BOT + '[data-p=startround]');
  assert.ok(await page.locator(BOT + '[data-p=startround]:disabled').count(), 'waits for the other player');
  assert.equal(await page.locator(BOT + '[data-p=dig]').count(), 0, 'no Dig yet');
  await page.click(TOP + '[data-p=startround]');
  await page.waitForSelector(BOT + '[data-p=dig]'); await page.waitForSelector(TOP + '[data-p=dig]');
  await geodes(page);
  // one shared deck
  const left = await page.evaluate(() => { const d = window.DigDigBoomDuel.d; return d.runs.p1.deck === d.runs.p2.deck; });
  assert.ok(left, 'both draw from the same deck');
  // each has an Undo of their own: after a dig only that seat's is ready
  await page.click(BOT + '[data-p=dig]');
  assert.equal(await page.locator(BOT + '[data-p=undo]:not([disabled])').count(), 1);
  assert.equal(await page.locator(TOP + '[data-p=undo]:not([disabled])').count(), 0);
  await page.click(TOP + '[data-p=dig]');
  await page.click(BOT + '[data-p=bank]');
  assert.equal(await page.locator('.duelroll').count(), 0, 'no roll while the other is still digging');
  await page.click(TOP + '[data-p=bank]');
  await page.click(BOT + '[data-p=prep]');
  assert.equal(await page.locator('.duelroll').count(), 0, 'no roll until both are ready to move on');
  await page.click(TOP + '[data-p=prep]');
  await page.waitForSelector('.duelroll'); assert.equal(await page.locator('.duelroll').count(), 1, 'one die');
  await page.waitForSelector('.duelroll', { state: 'detached' });
  const esc = await page.evaluate(() => { const d = window.DigDigBoomDuel.d; return [d.escape, d.runs.p1.prep && d.runs.p1.prep.escape, d.runs.p2.prep && d.runs.p2.prep.escape]; });
  assert.ok(esc[0] >= 1 && esc[0] === esc[1] && esc[0] === esc[2], 'the same number for both: ' + esc);
  await page.waitForSelector(BOT + '[data-p=boardgo]'); await page.waitForSelector(TOP + '[data-p=boardgo]');
  await page.click(BOT + '[data-p=boardgo]');
  assert.ok(await page.locator(TOP + '[data-p=boardgo]').count(), 'the other one is still looking at their Leaderboard');
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: Pause asks before leaving, then the main menu', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page);
  await page.click('.duel [data-p=gmenu]');
  await page.click('.duelmenu [data-p=menuclose]'); assert.equal(await page.locator('.duelmenu').count(), 0);
  await page.click('.duel [data-p=gmenu]');
  await page.click('.duelmenu [data-p=leave]'); assert.equal(await page.locator('.duel').count(), 1, 'one tap is not enough');
  await page.click('.duelmenu [data-p=leave]');
  await page.waitForSelector('#play .home'); assert.equal(await page.locator('.duel').count(), 0);
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: names (typed at the start) tell the players apart, in the corners and on the Leaderboard', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page, ['Ada', 'Grace']);
  assert.match(await page.locator(BOT + '.duelname').innerText(), /Ada/);
  assert.match(await page.locator(TOP + '.duelname').innerText(), /Grace/);
  await prep(page, BOT); await prep(page, TOP);
  await page.click(BOT + '[data-p=startround]'); await page.click(TOP + '[data-p=startround]'); await page.waitForSelector(BOT + '[data-p=dig]');
  const legend = await page.locator('.duel .duelband .lb').innerText();
  assert.match(legend, /ADA/i); assert.match(legend, /GRACE/i);
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: the middle holds the Leaderboard only while digging, and it is centred', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page);
  const mid = () => page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), b = r('.duel .duelband'), x = document.querySelector('.duel .duelband .lb'); return { h: b.height, gapTop: x ? r('.duel .duelband .lb').top - b.top : null, gapBottom: x ? b.bottom - r('.duel .duelband .lb').bottom : null }; });
  const slim = await mid(); assert.ok(slim.h < 80, 'a thin middle while choosing cards: ' + slim.h);
  await prep(page, BOT); await prep(page, TOP);
  await page.click(BOT + '[data-p=startround]'); await page.click(TOP + '[data-p=startround]'); await page.waitForSelector(BOT + '[data-p=dig]');
  const full = await mid();
  assert.ok(full.gapTop !== null && Math.abs(full.gapTop - full.gapBottom) <= 2, `centred: ${full.gapTop} above, ${full.gapBottom} below`);
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: the cards on the pack and Starter Kit screens are big', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page);
  await page.click(BOT + '[data-p=openpack]'); await page.waitForSelector(BOT + '[data-p=pick]'); await page.waitForTimeout(1500);
  const h = await page.evaluate(sel => document.querySelector(sel + '.kslot').getBoundingClientRect().height, BOT);
  assert.ok(h >= 150, 'a Keep place is at least 150 px tall: ' + h);
  const fits = await page.evaluate(sel => { const seat = document.querySelector(sel).getBoundingClientRect(), c = [...document.querySelectorAll(sel + '.pool .pcard')].map(x => x.getBoundingClientRect()); return c.every(r => r.bottom <= seat.bottom && r.top >= seat.top); }, BOT);
  assert.ok(fits, 'nothing runs off the half');
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: leaving to the main menu keeps the game, Continue brings it back, so does a reload', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page, ['Ada', 'Grace']);
  await prep(page, BOT); await prep(page, TOP);
  await page.click(BOT + '[data-p=startround]'); await page.click(TOP + '[data-p=startround]'); await page.waitForSelector(BOT + '[data-p=dig]');
  await page.click(BOT + '[data-p=dig]');
  const mine = () => page.evaluate(() => window.DigDigBoomDuel.d.runs.p1.dig.mine.length);
  const before = await mine();
  await page.click('.duel [data-p=gmenu]'); await page.click('.duelmenu [data-p=leave]'); await page.click('.duelmenu [data-p=leave]');
  await page.waitForSelector('#play .home');
  assert.equal(await page.locator('#play [data-p=resume]').count(), 1, 'Continue is there');
  await page.click('#play [data-p=resume]'); await page.waitForSelector('.duel');
  assert.equal(await mine(), before, 'the same game, the same Mine');
  assert.match(await page.locator(BOT + '.duelname').innerText(), /Ada/);
  await page.reload(); await page.waitForSelector('.duel');
  assert.equal(await mine(), before, 'after a reload too');
  assert.deepEqual(errors, []); await browser.close();
});

test('Two players: on a sideways iPad the game asks for it upright and carries on when it is', SKIP, async () => {
  const { browser, page, errors } = await open();
  await startDuel(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForSelector('.duel.turn .duelturn', { state: 'visible' });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForSelector('.duel:not(.turn)'); await page.waitForTimeout(1100);
  const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { top: r('.duel .seatbox.top'), bot: r('.duel .seatbox.bottom'), band: r('.duel .duelband') }; });
  assert.ok(Math.abs(g.top.height - g.bot.height) < 2 && g.top.bottom <= g.band.top + 1 && g.band.bottom <= g.bot.top + 1, 'the layout is as it was');
  assert.deepEqual(errors, []); await browser.close();
});
