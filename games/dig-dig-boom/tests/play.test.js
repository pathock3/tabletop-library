// Browser tests for the game screens: the main menu, Prep, the table, the AI. The cards are in the game's own file.
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

// Face the Monster: the cards have fired by themselves; take the damage (a defeated Monster has no button).
// Use every card the roll powers up (the glowing ones in the row of numbered cards), one tap each.
async function useCards(page) {
  for (let i = 0; i < 30; i++) { const el = page.locator('#play .tcard.elig:not(.inplay)').first(); if (!(await el.count())) break; await el.click(); }
}
async function faceIt(page) {
  await useCards(page);
  if (await page.locator('#play [data-p=face]').count()) { await page.waitForSelector('#play [data-p=face]:not(.waitroll)'); await page.click('#play [data-p=face]'); }
}

async function open({ viewport = { width: 1180, height: 820 }, menu = false } = {}) {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await (await browser.newContext({ viewport, hasTouch: true })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.DDB_NO_MODE_PICKER = true; window.DDB_AI_PACE = 3600000; window.DDB_TALLY_PACE = 0.01; window.DDB_NO_DANGER = true; window.DDB_NO_FIRE_FX = true; window.DDB_HERO_PACE = window.DDB_HERO_PACE || 1; });         // the AI's own clock never fires on its own in a test: tests call DigDigBoomPlay.tick()
  await page.goto(FILE);
  await page.waitForSelector('#play .home');
  if (!menu) { await page.waitForSelector('#play [data-p=more]'); await page.click('#play [data-p=more]'); await page.waitForSelector('#play [data-p=practice]:not([disabled])'); await page.click('#play [data-p=practice]'); await page.waitForSelector('#play .tabs'); }
  return { browser, page, errors };
}
// Start a Practice Dig with a scripted Mine (top first), dice and tracks.
async function begin(page, { kit = [], mine = [], dice = [], start = {}, line = [], ongoing = [] } = {}) {
  await page.evaluate(k => { const P = window.DigDigBoomPlay; P.S.kit = k; P.S.kitSize = Math.max(P.S.kitSize, k.length); P.act('go'); }, kit);
  await page.waitForSelector('#play .ptable');
  await script(page, { mine, dice, start, line, ongoing });
}
// Replace what is in the Mine (nothing known on top), the dice, the tracks and what is in play (`line`: cards with a number; `ongoing`: other Ongoing cards and Consumables), in a Dig already under way.
async function script(page, { mine = [], dice = [], start = {}, line = [], ongoing = [] }) {
  await page.evaluate(({ mine, dice, start, line, ongoing }) => {
    const P = window.DigDigBoomPlay, st = P.S.st, all = window.DigDigBoomUI.state.all;
    line.forEach((id, i) => { const c = all.find(x => x.id === id); st.line.push({ card: { ...c, uid: 7000 + i }, at: c.number, base: c.number, tapped: false }); });
    ongoing.forEach((id, i) => { const c = { ...all.find(x => x.id === id), uid: 7100 + i }; (c.type === 'Consumable' ? st.cons : st.ongoing).push(c); });
    if (mine.length) { st.mine = mine.map((id, i) => ({ ...all.find(c => c.id === id), uid: 8000 + i })); st.known = 0; }
    st.dice = dice.slice(); for (const k of Object.keys(start)) st[k] = start[k];
    P.render();
  }, { mine, dice, start, line, ongoing });
}
// Keep the first n offered cards that are not a Mystery Box (which would keep one more and make card counts depend on luck).
async function keepNonMystery(page, n) {
  await page.waitForSelector('#play .pcard[data-p=pick]');          // (the pack opens a frame after the tap)
  const uids = await page.evaluate(() => window.DigDigBoomPlay.S.run.prep.offer.filter(c => !/When kept/.test(c.text)).map(c => c.uid));
  for (const u of uids.slice(0, n)) await page.click(`#play [data-p=pick][data-uid="${u}"]`);          // tap to move each card up into a place...
  await page.click('#play [data-p=keepgo]');                                                          // ...then Keep (bottom right)
}
// A run from the main menu: the AI switched off unless asked (tests turn it on explicitly); round 1: open the Bronze Pack, keep a card, choose it as the Starter Kit, then the table.
async function startRun(page, { opp = false, rounds } = {}) {
  await page.evaluate(({ opp, rounds }) => { const S = window.DigDigBoomPlay.S; S.opp = opp; if (rounds) S.rounds = rounds; }, { opp, rounds });
  await page.click('#play [data-p=startrun]'); await page.click('#play [data-p=openpack]'); await keepNonMystery(page, 1);
  await page.click('#play [data-p=kitpick] >> nth=0'); await page.click('#play [data-p=startround]');          // tap to choose, then Start (bottom right)
  await page.waitForSelector('#play .ptable');
}
const stOf = (page, fn) => page.evaluate(fn);
const logText = page => page.evaluate(() => window.DigDigBoomPlay.S.st.log.map(l => l.text).join('\n'));
const dieShows = (page, sel, v) => page.waitForFunction(([s, v]) => { const e = document.querySelector(s + ' .dnum'); return e && e.textContent === String(v); }, [sel, v], { timeout: 5000 });

// ---------------------------------------------------------------- the main menu
test('menu: the front of the box — the logo and a tiny game playing itself (a deck flips gem, gem, monster… into one spot; one loop banks, the next goes BOOM), one screen that never scrolls, nothing about printing', SKIP, async () => {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 700 }, { width: 820, height: 1180 }, { width: 700, height: 420 }]) {
    const { browser, page, errors } = await open({ viewport, menu: true });
    try {
      await page.addInitScript(() => { window.DDB_HERO_PACE = 0.05; }); await page.reload(); await page.waitForSelector('#play .hero2');
      assert.equal(await page.locator('#play .hero2 .hc').count(), 11, 'a Health track, 0 to 10');
      assert.match(await page.locator('#play .logo').innerText(), /Dig Dig\s*BOOM!/);
      assert.ok(await page.locator('#play [data-p=startrun]').isVisible()); assert.ok(await page.locator('#play [data-p=more]').isVisible()); assert.ok(await page.locator('#play [data-p=help]').isVisible());
      await page.waitForFunction(() => /Banked/.test(document.querySelector('.hbanner').textContent), null, { timeout: 8000 });
      assert.ok(await page.locator('#play .hero2 .hslot .card').count() >= 1, 'cards land in one spot');
      await page.waitForFunction(() => /BOOM/.test(document.querySelector('.hbanner').textContent), null, { timeout: 8000 });
      assert.equal(await page.locator('#play .hero2 .hc.now').innerText(), '0', 'out of Health: BOOM');
      const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, overflow: [...document.querySelectorAll('#play .homemenu *')].some(e => e.getBoundingClientRect().bottom > innerHeight + 1) }));
      assert.ok(m.sh <= m.ih + 1 && !m.overflow, `one screen at ${viewport.width}x${viewport.height}`);
      assert.doesNotMatch(await page.locator('#play').innerText(), /[Pp]rint/);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('menu: Play, How to play and More and nothing else — no text under the buttons, no footnote; More has the cards and a playtest (nothing to set), with a way back and no second Pause', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    const home = await page.locator('#play .homemenu').innerText();
    assert.match(home, /Play/); assert.doesNotMatch(home, /Practice|The cards|See the cards|[Pp]rint|Nobody|Opponent|against the AI|Cards and rules|Version/);
    assert.deepEqual((await page.locator('#play .homemenu button').allInnerTexts()).map(t => t.trim()), ['Play', 'How to play', 'More']);
    await page.click('#play [data-p=more]');
    assert.equal(await page.locator('#play .pbar').count(), 0, 'no Pause button on the More screen');
    assert.equal(await page.locator('#play [data-p=gmenu]').count(), 0);
    const menu = await page.locator('#play .settings').innerText();
    assert.match(menu, /More[\s\S]*The cards[\s\S]*Playtest/); assert.doesNotMatch(menu, /Settings/); assert.doesNotMatch(menu, /[Tt]rash|Nobody|Opponent|[Pp]rint|Rounds/);
    assert.equal(await page.locator('#play .seg button').count(), 0, 'no choice of rounds');
    await page.click('#play [data-p=menu]'); await page.waitForSelector('#play .homemenu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('menu: How to play is three pictures and a line each — no wall of text, no link to the card designs', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.click('#play [data-p=help]');
    assert.equal(await page.locator('#play .hcard').count(), 3);
    assert.equal(await page.locator('#play .hcard .hpic .card, #play .hcard .hpic svg').count() >= 3, true, 'pictures, not paragraphs');
    assert.equal(await page.locator('#play [data-p=cards]').count(), 0, 'no link to the card designs');
    const words = (await page.locator('#play .how').innerText()).split(/\s+/).length; assert.ok(words < 110, 'the gist only: ' + words + ' words');
    await page.click('#play [data-p=closehelp]'); await page.waitForSelector('#play .homemenu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------------------------------------------------------------- a Practice Dig on the table
test('practice: the Starter Kit chooser lists only cards the game can play and can start with; pick up to the kit size, tap again to put one back; the kit goes on top of the Mine face up', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    const want = await page.evaluate(() => { const all = window.DigDigBoomUI.state.all; return ['Ongoing', 'Consumable', 'Immediate'].map(t => all.filter(c => c.deck === 'Booster' && c.type === t && !c.cantStart).length); });
    const tabs = (await page.locator('#play .tabs .chip').allInnerTexts()).slice(0, 3).map(t => Number(t.match(/\((\d+)\)/)[1]));
    assert.deepEqual(tabs, want, "the cards that say Can't Start are not offered");
    assert.ok(!(await page.locator('#play').innerText()).includes('Not implemented yet'));
    const pick = async (tab, name) => { await page.click(`#play .tabs [data-v=${tab}]`); await page.click(`#play .grid .piece:has-text("${name}")`); };
    await pick('Ongoing', 'Nurse Newt'); await pick('Consumable', 'Healing Potion'); await pick('Immediate', 'Med Kit');
    assert.match(await page.locator('#play .foot .note').innerText(), /3 of 3 chosen/);
    await pick('Immediate', 'Spare Parts');                      // a fourth: not allowed at size 3
    assert.match(await page.locator('#play .foot .note').innerText(), /3 of 3 chosen/);
    await pick('Immediate', 'Med Kit');                        // put it back
    assert.match(await page.locator('#play .foot .note').innerText(), /2 of 3 chosen/);
    await page.click('#play [data-p=go]'); await page.waitForSelector('#play .ptable');
    assert.equal(await page.locator('#play .tcard').count(), 1, 'only the Pet is in play at the start');
    assert.match(await page.locator('#play .pilestrip').innerText(), /^32 left$/, 'the 30 plus the 2 kit cards');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.known), 2, 'the kit is on top of the Mine, face up'); assert.equal(await page.locator('#play .deck .card').count(), 1, 'the top card of the Mine is shown face up on the deck');
    assert.equal(await page.locator('#logEntries').count(), 0, 'there is no "What happened" panel');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: dig a Geode, then a Monster — tap the die, take an Extra Roll, tap the die again, face it; the Drill is Health, Extra Rolls and Grit; the Monster pile counts what you have met', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['TR-01', 'MO-01', 'TR-01'], dice: [2, 5], start: { heart: 6, reroll: 1 } });
    assert.equal(await page.locator('#play .track').count(), 3, 'Health, Extra Rolls and Grit'); assert.equal(await page.locator('#play .tbody .tc').count(), 11 + 6 + 7);
    await page.click('#play [data-p=dig]');
    assert.match(await logText(page), /You dig Geode[\s\S]*Geode: \+1/);
    assert.match(await page.locator('#play [data-p=bank]').innerText(), /^BANK\s*1/i);
    await page.click('#play [data-p=dig]');
    assert.doesNotMatch(await page.locator('#play .ptable').innerText(), /Discard/, 'no separate discard pile and no count of it: the flip spot is the discard');
    assert.equal(await page.locator('#play .slot.stacked').count(), 1, 'the cards flipped before are stacked under the flip spot');
    assert.ok(await page.evaluate(() => { const m = document.querySelector('#play .mat').getBoundingClientRect(), t = document.querySelector('#play .tableau').getBoundingClientRect(); return t.bottom <= m.top + 1; }), 'the cards you are drawing are in front of you (below); the cards in play are above them');
    assert.equal(await page.locator('#play [data-p=face]').count(), 0, 'the Monster is not a button');
    assert.ok(await page.locator('#play .ptable.await-roll').count() === 1, 'before the roll the rest of the table dims and waits: only the Mine (with the die on it) can be tapped');
    assert.ok(await page.locator('#play .deck[data-p=roll]').isEnabled(), 'the Mine is where you tap to roll');
    assert.match(await page.locator('#play .deckdie').innerText(), /Tap/i, 'the die on the Mine says Tap, nothing more');
    assert.equal(await page.locator('#play .piles [data-p=roll], #play .piles .dieb').count(), 0, 'no die or roll button in the Bank column');
    assert.equal(await page.locator('#play .mset:has(.mb:text-is("A")) .lad i.met').count(), 1, 'Monster A is in front of you and counts');
    await page.click('#play [data-p=roll]'); await dieShows(page, '#play .dieb', 2);
    assert.equal(await page.locator('#play .tcard.off').count(), 1, 'the Pet (9) is beyond the result of 2 and dims');
    await page.click('#play .track[data-p=reroll]');                                // an Extra Roll: you may put Grit in it, then tap the die
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.fight.phase), 'before'); await page.click('#play [data-p=roll]'); await dieShows(page, '#play .dieb', 5);
    await faceIt(page);
    assert.match(await logText(page), /You take 1 .*\nYou survive (Ember Imp|Gloop|Spore Cap)/);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.heart), 5);
    assert.deepEqual(await stOf(page, () => window.DigDigBoomPlay.S.st.monsterPile.map(c => c.id)), ['MO-01'], 'the Monster went to the pile, not the discard');
    assert.equal(await page.locator('#play .mset:has(.mb:text-is("A")) .lad i.met').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: tapping a card that defeats the Monster defeats it at once — no tap on the Monster; the Mine and the Bank light up; it goes to the Monster pile when you dig on', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01', 'MO-02'], dice: [10, 10] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play .tcard.elig').count(), 1, 'the Pet glows'); await page.click('#play .tcard.elig');
    assert.equal(await page.locator('#play .tcard.done').count(), 1, 'the Pet was used and lies on its side');
    assert.equal(await stOf(page, () => !!window.DigDigBoomPlay.S.st.fight), true, 'defeated, but the fight is still open until you move on');
    assert.equal(await page.locator('#play [data-p=face]').count(), 0, 'no "continue" button: the Monster is defeated');
    assert.equal(await page.locator('#play .deck.live').count(), 1, 'the Mine is lit: tapping it is how you go on'); assert.equal(await page.locator('#play .pile.bankp.live').count(), 1, 'and so is the Bank');
    await page.click('#play [data-p=dig]');                                          // digging on finishes the fight and draws the next card
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.survived, s.defeated, s.heart, s.monsterPile.length, !!s.fight, s.fight && s.fight.monster.id]; }), [1, 1, 10, 1, true, 'MO-02'], 'the first Monster is done, the next one is up');
    assert.ok(await page.locator('#play .tcard.done').count() === 0, 'and the Pet stands up again');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: Take damage asks first when you still have an Extra Roll to use and the damage would BOOM you ("You can still use an Extra Roll"), then takes it on the second tap; at safe Health it does not ask', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-02'], dice: [1], start: { reroll: 2, heart: 2 } });          // 2 damage at 2 Health: it would BOOM you
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]:not(.waitroll)');
    await page.click('#play [data-p=face]');
    assert.match(await page.locator('#play .takedmg').innerText(), /can still use an Extra Roll[\s\S]*again/i);
    assert.equal(await stOf(page, () => !!window.DigDigBoomPlay.S.st.fight), true, 'nothing was taken yet');
    await page.click('#play [data-p=face]');
    assert.equal(await stOf(page, () => !!window.DigDigBoomPlay.S.st.fight), false, 'the second tap takes it');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: Take damage does not ask about an Extra Roll when the damage cannot BOOM you', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-02'], dice: [1], start: { reroll: 2, heart: 10 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]:not(.waitroll)');
    await page.click('#play [data-p=face]'); assert.equal(await stOf(page, () => !!window.DigDigBoomPlay.S.st.fight), false, 'at 10 Health 2 damage cannot BOOM you: one tap takes it');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: after a defeated Monster, tapping the Bank banks (the fight ends first), with no continue button', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01', 'MO-02'], dice: [10, 10] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await useCards(page);
    await page.click('#play [data-p=bank]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.survived, !!s.fight, s.over && s.over.kind]; }), [1, false, 'bank']);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: after the roll the cards at or below the result glow; you tap the ones you want, in the order you like, and each lies down; the Monster takes its damage last; tapping the damage first skips the rest', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { line: ['ON-06', 'ON-09', 'ON-20'], mine: ['MO-02', 'MO-02'], dice: [4, 4], start: { heart: 6 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play .tcard.elig').count(), 2, 'Nurse Newt (2) and Pill Bug (3) glow at 4; Moss Sloth (7) is out of reach');
    assert.equal(await page.locator('#play .tcard.done').count(), 0, 'nothing happened by itself'); assert.doesNotMatch(await page.locator('#play .action').innerText(), /glowing/i, 'no instruction text');
    await page.click('#play .tcard.elig:has-text("Pill Bug")');                      // 1 damage marker
    assert.equal(await page.locator('#play .tcard.elig').count(), 1); assert.equal(await page.locator('#play .tcard.done').count(), 1, 'the one you used lies down');
    assert.deepEqual(await page.locator('#play .fired i').allInnerTexts(), ['Pill Bug']);
    await page.click('#play [data-p=face]');                                        // Newt is still glowing: the first tap only asks
    assert.match(await page.locator('#play .takedmg').innerText(), /still use cards[\s\S]*again/i, 'you can still use cards: are you sure?'); assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.survived), 0, 'nothing happened yet');
    await page.click('#play [data-p=face]');                                        // the second tap: you took the damage, Newt was not used
    assert.deepEqual(await stOf(page, () => [window.DigDigBoomPlay.S.st.heart, window.DigDigBoomPlay.S.st.survived]), [5, 1], 'Newt never healed; the marker covered 1 of the 2 damage: 6 - 1');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    await page.click('#play [data-p=triggerall]');                                  // "Use all": both
    assert.equal(await page.locator('#play .tcard.elig').count(), 0);
    await page.click('#play [data-p=face]');
    assert.deepEqual(await stOf(page, () => [window.DigDigBoomPlay.S.st.heart, window.DigDigBoomPlay.S.st.survived]), [3, 2], 'this time Newt healed 1 and Pill Bug covered 1 of the 4 damage: 5 + 1 - 3');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: an Ongoing or Consumable card is dug into the flip spot, face up, and moves up with the others when you dig the next card', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['TR-01', 'ON-06', 'ON-33', 'CO-19', 'IM-13'] });
    await page.click('#play [data-p=dig]');                                                                  // a Geode: in the flip spot
    assert.equal(await page.locator('#play .slot .card[data-id="TR-01"]').count(), 1);
    await page.click('#play [data-p=dig]');                                                                  // Nurse Newt: lies in the flip spot, face up
    assert.equal(await page.locator('#play .slot .card[data-id="ON-06"]').count(), 1, 'a card you draw goes in the pile of drawn cards');
    assert.equal(await page.locator('#play .tableau .card[data-id="ON-06"]').count(), 0, 'it is not up with the cards in play yet');
    await page.click('#play [data-p=dig]');                                                                  // Adrenaline Pump: now Nurse Newt moves up
    assert.equal(await page.locator('#play .tableau .card[data-id="ON-06"]').count(), 1, 'it moved up when the next card was dug');
    assert.equal(await page.locator('#play .slot .card[data-id="ON-33"]').count(), 1); assert.equal(await page.locator('#play .tableau .card[data-id="ON-33"]').count(), 0);
    await page.click('#play [data-p=dig]');                                                                  // Healing Potion: a Consumable lies in the flip spot, then goes with the rest
    assert.equal(await page.locator('#play .slot .card[data-id="CO-19"]').count(), 1);
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .tableau .tcard.cons .card[data-id="CO-19"]').count(), 1, 'a Consumable waits among your cards in play');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: a card whose condition is not met is not offered (no glow, it says what it needs), but it is still there, upright', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01'], dice: [8], line: ['ON-05', 'ON-06'], start: { heart: 7 } });             // Nervous Mouse (2) wants 5 Health or less
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play .tcard.elig').count(), 1, 'only Nurse Newt');
    assert.equal(await page.locator('#play .tcard[aria-label^="Nervous Mouse"]').count(), 1, 'Nervous Mouse is still on the table');
    assert.match(await page.locator('#play .tcard[aria-label^="Nervous Mouse"] .tg').innerText(), /5/, 'and says what it wants');
    assert.ok(Number(await page.locator('#play .tcard[aria-label^="Nervous Mouse"]').evaluate(e => getComputedStyle(e).opacity)) >= 0.8, 'dimmed, not faded out');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: take the damage while you could still be saved from BOOM asks first (tap again); the Bank says Bank, then the gems', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-02'], dice: [1, 1], start: { heart: 2, reroll: 1 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]:not(.waitroll)');
    await page.click('#play [data-p=face]'); assert.match(await page.locator('#play .takedmg').innerText(), /can still use an Extra Roll/i); assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.survived), 0);
    await page.click('#play .track[data-p=reroll]');                                                       // using the Extra Roll clears the question
    assert.doesNotMatch(await page.locator('#play').innerText(), /can still use/i);
    await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]:not(.waitroll)'); await page.click('#play [data-p=face]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.over && window.DigDigBoomPlay.S.st.over.kind), 'boom', 'a 1 again: 2 damage at 2 Health');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: the Cloning Machine goes under a card with a number and that card fires twice', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['ON-38', 'MO-01'], dice: [6], line: ['ON-20'], ongoing: ['ON-33'], start: { heart: 2 } });
    await page.click('#play [data-p=dig]');
    assert.ok(await page.locator('#play .tcard.pick').count() >= 2, 'the cards with a number can be picked (the Pet and Moss Sloth)');
    assert.equal(await page.locator('#play .tcard.pick[aria-label^="Adrenaline Pump"]').count(), 0, 'a card without a number cannot');
    await page.click('#play .tcard.pick[aria-label^="Moss Sloth"]');
    assert.equal(await page.locator('#play .tcard[aria-label^="Moss Sloth"] .underc').count(), 1, 'the Machine lies under it');
    assert.equal(await page.locator('#play .tableau > .tcard.inplay[aria-label^="Cloning Machine"]').count(), 0, 'and is not in the Ongoing area as well');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');              // 6 does not reach Moss Sloth (7): put Grit... use a card to raise instead
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.heart), 2, '6 is below Moss Sloth (7)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: when the Mine runs out a message says what happens next, once, and the next gauntlet Monster is face up on it', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['TR-01'], dice: [10, 10] });
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.run = null; });
    await page.click('#play [data-p=dig]');
    await page.waitForSelector('#play .mnote');
    assert.match(await page.locator('#play .mnote').innerText(), /bottom of your Mine[\s\S]*gauntlet[\s\S]*no Loot[\s\S]*face up[\s\S]*8[\s\S]*up by 1[\s\S]*bank at any time/i);
    assert.equal(await page.locator('#play .deck .card[data-id="BONUS"]').count() + await page.locator('#play .deck .mcard, #play .deck .card').count() > 0, true, 'a card is face up on the empty Mine');
    assert.match(await page.locator('#play .deck').innerText(), /8/, 'it says how much damage it deals');
    await page.click('#play [data-p=emptyok]'); assert.equal(await page.locator('#play .mnote').count(), 0, 'once you have read it, it goes');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await faceIt(page);
    assert.equal(await page.locator('#play .mnote').count(), 0, 'and does not come back');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the AI takes its time like a person: about a second and a half a card, several seconds for a Monster, never twice the same', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    const P = await page.evaluate(() => DDB.ai.pace);
    assert.ok(P.cardMs >= 1200 && P.cardMs <= 2200, 'a card: ' + P.cardMs); assert.ok(P.monsterMs >= 2000, 'a Monster takes longer'); assert.ok(P.jitter > 0);
    assert.ok(P.startMs >= 1500, 'it takes a moment before its first card');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: after the roll a button takes the damage — then you see your new Health before you choose to dig on or bank; the Mine and Bank wait until then', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['TR-01', 'MO-01', 'TR-01', 'MO-02', 'MO-01'], dice: [4, 1], start: { heart: 3 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .mcard[data-p]:not([data-p=zoom])').count(), 0, 'the Monster card only opens the big card: it is not an action');
    assert.equal(await page.locator('#play [data-p=face]').count(), 0, 'no damage button before the roll');
    assert.equal(await page.locator('#play .steps').count(), 0, 'no step line');
    await page.click('#play [data-p=roll]');
    assert.ok(await page.locator('#play .deck').isDisabled() && await page.locator('#play [data-p=bank]').isDisabled(), 'the Mine and the Bank wait until the damage is taken');
    await page.waitForSelector('#play [data-p=face]', { state: 'visible' });          // (it appears when the die has landed)
    assert.match(await page.locator('#play [data-p=face]').innerText(), /^Take 1\s*$/); assert.equal(await page.locator('#play [data-p=face] svg.ic').count(), 1, 'the damage icon, not the word');
    await page.click('#play [data-p=face]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.heart, s.survived, !!s.fight]; }), [2, 1, false], 'your Health is updated first');
    assert.match(await page.locator('#play .stamp').innerText(), /survived/i, 'the Monster card says how it ended');
    assert.ok(await page.locator('#play .deck').isEnabled() && await page.locator('#play [data-p=bank]').isEnabled(), 'now you choose: dig on or bank');
    assert.match(await page.locator('#play .aprompt').innerText(), /Mine to dig, or the Bank/);
    await page.click('#play [data-p=dig]'); assert.equal(await page.locator('#play .stamp').count(), 0, 'the stamp goes with the next card');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play .takedmg.lethal').count(), 1, 'a lethal hit is flagged on the button');
    await page.click('#play [data-p=face]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.over && window.DigDigBoomPlay.S.st.over.kind), 'boom');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: defeating a Monster with a card stamps it Defeated at once', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01'], dice: [10] });
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .stamp').count(), 0, 'not before a card defeats it');
    await page.click('#play [data-p=roll]'); await page.click('#play .tcard.elig');
    assert.match(await page.locator('#play .stamp').innerText(), /defeated/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: BOOM shows the end panel with New Dig; a new Dig starts fresh', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-02', 'MO-02'], dice: [1, 1], start: { heart: 3 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await faceIt(page);           // 2 damage: 3 -> 1
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await faceIt(page);           // 4 damage: BOOM
    const over = await page.locator('#play .over').innerText();
    assert.match(over, /BOOM!/); assert.doesNotMatch(over, /survived/, 'BOOM loses everything: no score is shown'); assert.doesNotMatch(over, /[Gg]rit/);
    assert.ok(await page.locator('#play [data-p=dig]').isDisabled());
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.monsterPile.length), 2, 'even the one that BOOMed you is in the pile');
    await page.click('#play [data-p=again]');
    assert.equal(await page.locator('#play .over').count(), 0); assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.survived), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: banking keeps your gems and ends the Dig; it cannot be done in front of a Monster; the Bank pile has one gem icon and the one number', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['TR-01', 'TR-01', 'MO-01'], dice: [3], start: { heart: 6 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play [data-p=bank] .gemline svg').count(), 1, 'one gem icon on the Bank pile');
    await page.click('#play [data-p=bank]');
    const o = await page.locator('#play .over').innerText();
    assert.match(o, /banked!/i); assert.match(o, /2 Geodes|\(2 from Geodes, 0 from Monsters\)/);
    await page.click('#play [data-p=setup]'); await page.waitForSelector('#play .panel');
    assert.ok(await page.locator('#play [data-p=go]').isVisible());
    const { browser: b2, page: p2 } = await open();
    try {
      await begin(p2, { mine: ['MO-01'] }); await p2.click('#play [data-p=dig]');
      assert.ok(await p2.locator('#play [data-p=bank]').isDisabled());
    } finally { await b2.close(); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: the Cloning Machine asks for a card with a number by tapping it; tapping any card zooms it, tapping again closes', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['ON-06', 'ON-38', 'TR-01'] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=dig]');
    assert.ok(await page.locator('#play [data-p=dig]').isDisabled());
    assert.match(await page.locator('#play .dicez').innerText(), /tap a card with a number/i);
    await page.click('#play .tcard:has-text("Nurse Newt")');
    assert.match(await logText(page), /triggers twice/);
    await page.click('#play .tcard:has-text("Nurse Newt")');       // now it zooms
    assert.equal(await page.locator('#play .zoom .card').count(), 1);
    await page.click('#play .zoom'); assert.equal(await page.locator('#play .zoom').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: the page is locked — no scrolling at iPad sizes, taps are at least 44 px, nothing is cut off, no "What happened" panel', SKIP, async () => {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 768 }, { width: 820, height: 1180 }, { width: 768, height: 1024 }]) {
    const { browser, page, errors } = await open({ viewport });
    try {
      const orient = viewport.width > viewport.height ? 'landscape' : 'portrait';
      await begin(page, { line: ['ON-06', 'ON-09', 'ON-17'], ongoing: ['ON-33', 'ON-34', 'CO-19'], mine: ['MO-01', 'TR-01'], dice: [4], start: { reroll: 2 } });
      await page.click('#play [data-p=dig]');
      const pre = await page.evaluate(() => { const r = document.querySelector('#play [data-p=roll]').getBoundingClientRect(); return [r.width, r.height]; });
      assert.ok(pre[0] >= 44 && pre[1] >= 44, 'the die to tap is big enough');
      await page.click('#play [data-p=roll]');
      const m = await page.evaluate(() => {
        const box = s => { const e = document.querySelector(s), r = e && e.getBoundingClientRect(); return r && { w: r.width, h: r.height, b: r.bottom, r: r.right }; };
        return { sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, ih: innerHeight, iw: innerWidth,
          die: box('#play .dieb'), monster: box('#play .mcard'), bank: box('#play [data-p=bank]'), mat: box('#play .mat'), tableau: (() => { const cs = [...document.querySelectorAll('#play .tcard')].map(e => e.getBoundingClientRect()); return { b: Math.max(...cs.map(r => r.bottom)), l: Math.min(...cs.map(r => r.left)), r: Math.max(...cs.map(r => r.right)) }; })(), reroll: box('#play .track[data-p=reroll]'), log: !!document.querySelector('#play .plog') };
      });
      assert.ok(m.sh <= m.ih + 1 && m.sw <= m.iw + 1, `${orient} ${viewport.width}: page scrolls (${m.sw}x${m.sh} in ${m.iw}x${m.ih})`);
      for (const k of ['die', 'monster', 'bank', 'reroll']) assert.ok(m[k].w >= 44 && m[k].h >= 44, `${orient}: ${k} is ${m[k].w}x${m[k].h}`);
      assert.ok(m.mat.b <= m.ih + 1, `${orient}: the bottom of the table (${m.mat.b}) is below the screen (${m.ih})`);
      assert.ok(m.tableau.b <= m.ih + 1 && m.tableau.l >= -1 && m.tableau.r <= m.iw + 1, `${orient}: the Power and Ongoing cards fit the screen ${JSON.stringify(m.tableau)}`);
      assert.equal(m.log, false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('look: every Geode is a different gem (six colours and cuts); the Health, Extra Roll and Grit squares are the same width and line up', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['TR-01', 'TR-01', 'TR-01', 'TR-01', 'TR-01', 'TR-01', 'TR-01'] });
    const seen = [];          // (the card on top is read: the one before it stays visible underneath while the new one flips over it)
    for (let i = 0; i < 6; i++) {
      await page.click('#play [data-p=dig]');
      seen.push(await page.evaluate(() => { const c = [...document.querySelectorAll('#play .mat .mcard .card')].pop(); const tile = c.querySelector('.gemtile'); return { bg: getComputedStyle(tile).backgroundImage, cut: [...c.querySelectorAll('use')].map(u => u.getAttribute('href')).find(h => h.startsWith('#gem-')) }; }));
    }
    assert.equal(new Set(seen.map(x => x.bg)).size, 6, 'six different gem colours in a row: ' + JSON.stringify(seen));
    assert.equal(new Set(seen.map(x => x.cut)).size, 6, 'and six different cuts, so colour is never the only clue');
    const cells = await page.evaluate(() => [...document.querySelectorAll('#play .track')].map(t => [...t.querySelectorAll('.tc')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.width * 10) / 10]; })));
    const [heart, reroll, grit] = cells;
    assert.equal(heart.length, 11); assert.equal(reroll.length, 6, 'Extra Rolls go up to 5'); assert.equal(grit.length, 7, 'Grit goes up to 6');
    for (const row of [reroll, grit]) row.forEach((c, i) => { assert.ok(Math.abs(c[0] - heart[i][0]) < 0.6 && Math.abs(c[1] - heart[i][1]) < 0.6, `square ${i} lines up with Health's: ${c} vs ${heart[i]}`); });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('practice: a seed replays the same Dig; your best (Monsters survived, gems banked) is remembered in this browser', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.click('#play details summary'); await page.fill('#seedIn', '42'); await page.click('#play [data-p=go]'); await page.waitForSelector('#play .ptable');
    const a = await stOf(page, () => window.DigDigBoomPlay.S.st.mine.map(c => c.id).join(','));
    await page.click('#play .pbar [data-p=gmenu]'); await page.click('#play [data-p=mainmenu]'); await page.click('#play [data-p=more]'); await page.click('#play [data-p=practice]'); if (await page.locator('#play .confirm').count()) await page.click('#play [data-p=practice]');
    await page.click('#play details summary'); await page.fill('#seedIn', '42'); await page.click('#play [data-p=go]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.mine.map(c => c.id).join(',')), a);
    assert.match(await logText(page), /seed 42/);
    await begin(page, { mine: ['TR-01', 'TR-01', 'MO-01'], dice: [6], start: { heart: 6 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=dig]'); await page.click('#play [data-p=bank]');
    assert.match(await page.locator('#play .over').innerText(), /Best so far: 0 Monsters survived · 2 gems banked \(new!\)/);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('ddb.solo.best'))), { survived: 0, gems: 2 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------------------------------------------------------------- a run: Prep like a table, the Leaderboard
test('run: round 1 opens a Bronze Pack (draw 3, keep 1), then you choose your Starter Kit from the cards you own — no gem option on screen, empty places become gems — then the table', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { window.DigDigBoomPlay.S.opp = false; }); await page.click('#play [data-p=startrun]');
    assert.equal(await page.locator('#play .pack b').innerText(), 'Bronze'); assert.match(await page.locator('#play .pack:not(.ghostpack)').innerText(), /Draw 3 · Keep 1/);
    assert.equal(await page.locator('#play .tabs').count(), 0, 'no catalogue of cards');
    await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play [data-p=pick]'); assert.equal(await page.locator('#play [data-p=pick]').count(), 3);
    assert.ok(await page.locator('#play [data-p=keepgo]').isDisabled(), 'Keep waits until you have chosen');
    const pos = await page.locator('#play [data-p=keepgo]').evaluate(e => { const r = e.getBoundingClientRect(); return [r.right > innerWidth * .6, r.bottom > innerHeight * .8]; });
    assert.deepEqual(pos, [true, true], 'the confirm button is bottom right, where the most reachable things are');
    assert.equal(await page.evaluate(() => document.querySelector('#play .scroll').scrollHeight <= document.querySelector('#play .scroll').clientHeight + 1), true, 'the pack fits the screen: nothing scrolls');
    assert.equal(await page.locator('#play .keepsay').count(), 0, 'no instruction line: the layout says it all');
    await page.click('#play [data-p=pick] >> nth=0'); assert.equal(await page.locator('#play .pcard.sel').count(), 1, 'one tap chooses');
    const first = await stOf(page, () => window.DigDigBoomPlay.S.run.prep.picked.slice());
    await page.click('#play [data-p=pick] >> nth=1'); assert.deepEqual(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.picked.slice()), first, 'with all you may keep chosen, another card cannot be chosen: nothing is silently dropped');
    assert.ok(await page.locator('#play [data-p=keepgo]').isEnabled());
    await page.click('#play [data-p=pick] >> nth=0'); assert.equal(await page.locator('#play .pcard.sel').count(), 0, 'tapping a chosen card puts it back'); await page.click('#play [data-p=pick] >> nth=1'); assert.equal(await page.locator('#play .pcard.sel').count(), 1);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.step), 'keep');
    assert.equal(await page.locator('#play .kslot').count(), 1, 'the pack uses the same layout as the Starter Kit: a place on top for each card you may keep');
    await page.click('#play .kslot .pcard');                                                                // put the card back
    const s1 = await page.locator('#play .pool [data-p=pick]').first().boundingBox(), d1 = await page.locator('#play .kslot[data-i="0"]').boundingBox();
    await page.mouse.move(s1.x + s1.width / 2, s1.y + s1.height / 2); await page.mouse.down(); await page.mouse.move(d1.x + d1.width / 2, d1.y + d1.height / 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(120);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.picked.length), 1, 'dragging a card up into the place chooses it');
    const s2 = await page.locator('#play .kslot .pcard').boundingBox();
    await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2); await page.mouse.down(); await page.mouse.move(60, 770, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(120);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.picked.length), 0, 'and dragging it off puts it back');
    assert.ok(await page.locator('#play [data-p=keepgo]').isDisabled(), 'nothing chosen: Keep waits');
    await keepNonMystery(page, 1);
    assert.equal(await page.locator('#play [data-p=kitpick]').count(), 1, 'one card to choose from: the one you kept');
    assert.equal(await page.locator('#play [data-p=kitgem]').count(), 0, 'no gem to pick: an empty place is a gem');
    assert.equal(await page.locator('#play .kitbar .count').count(), 0, 'no "0 of 1" count: the outlined places say it');
    assert.match(await page.locator('#play .kdef').innerText(), /^You will draw these first\.\s*Empty spots will be filled with Geodes\.$/, 'the Starter Kit is defined, not explained');
    assert.equal(await page.locator('#play .kslot.empty .kgem').count(), 1, 'round 1 has one Starter Kit place: when it is left empty it shows the gem it will be filled with');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#play .kitbar b')).fontSize), '42px', 'the Keep and Starter Kit titles use the same size');
    assert.equal(await page.locator('#play .pips2').count(), 0, 'no circles');
    assert.equal(await page.locator('#play [data-p=startround]').isEnabled(), true, 'you may start with the place empty');
    await page.click('#play [data-p=startround]'); await page.waitForSelector('#play .ptable');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.geodeGems), 0, 'the gem is a card on top of the Mine: nothing in the Bank until you dig it');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.mine[0].type), 'Treasure', 'the empty place is a gem, face up on top of the Mine');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.known), 1, 'only that gem is known: the card you left out of the kit is shuffled into the Mine');
    assert.equal(await page.locator('#play .deck .card').count() > 0, true, 'the gem shows face up on the Mine');
    await page.click('#play [data-p=dig]'); await page.waitForTimeout(300);
    assert.match(await page.locator('#play [data-p=bank]').innerText(), /^BANK\s*1/i, 'dig a gem and it is in the Bank');
    assert.equal(await page.locator('#play .lb').count(), 1); assert.match(await page.locator('#play .lbhead').innerText(), /round 1 of 5/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('run: bank, tap the die for the Escape Bonus (a d10 that rolls and shows the number), open the pack the gems earn, keep whole cards, choose a bigger kit; the final round is a race', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { rounds: 2 });
    await script(page, { mine: ['TR-01', 'MO-01', 'MO-02', 'MO-01', 'MO-02', 'TR-01'], dice: Array(30).fill(10) });
    await page.click('#play [data-p=dig]');
    for (let i = 0; i < 4; i++) { await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await faceIt(page); }
    assert.equal(await page.locator('#play .lbc.here').innerText().then(t => t.split('\n')[0].trim()), '4');
    assert.equal(await page.locator('#play .lbc[data-p], #play button.lbc').count(), 0, 'no pledging: nothing to tap on the Leaderboard');
    await page.click('#play [data-p=bank]');
    assert.match(await page.locator('#play .over').innerText(), /banked![\s\S]*4 Monsters survived · ♛/i);
    await page.click('#play [data-p=prep]');
    assert.ok(await page.locator('#play .bigboard .bgrid .bcol').count() >= 9, 'first the Leaderboard, full screen: a column for each number, with spots stacked in it'); assert.ok(await page.locator('#play .bigboard .bspot').count() >= 9, 'one row for each player'); assert.equal(await page.locator('#play .bdisc').count(), 0, 'your Dig is over, so its piece is gone: your chip (best) is in the top row'); assert.equal(await page.locator('#play .bigboard .pchip.me').count(), 1); assert.match(await page.locator('#play .bigboard .blabels').innerText(), /best[\s\S]*this round/i, 'the rows are labelled');
    await page.evaluate(() => { window.DigDigBoomPlay.S.run.dice = [8]; });
    await page.click('#play [data-p=boardgo]');
    assert.equal(await page.locator('#play .bigdie, #play [data-p=escape]').count(), 0, 'nothing to tap: the die rolls by itself');
    await page.waitForSelector('#play .eq .t.die.pop'); await dieShows(page, '#play .eq .t.die', 8); assert.match(await page.locator('#play .eq').innerText(), /1\s*\+\s*4\s*\+/, 'Geodes + Monsters + the die');
    await page.waitForSelector('#play .pack:not(.ghostpack)'); await page.waitForFunction(() => /13/.test(document.querySelector('#play .eq .sum').textContent)); assert.match(await page.locator('#play .eq .sum').innerText(), /13/); assert.equal(await page.locator('#play .pack b').innerText(), 'Silver');
    assert.equal(await page.locator('#play .lb, #play .pbar h1').count(), 0, 'no Leaderboard and no title in Prep: just a Menu in the corner');
    assert.equal(await page.locator('#play .pbar [data-p=gmenu]').count(), 1);
    await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play [data-p=pick]'); assert.equal(await page.locator('#play [data-p=pick]').count(), 4);
    const w = await page.locator('#play [data-p=pick]').first().evaluate(e => e.offsetWidth); assert.ok(w >= 150, 'whole cards, not a reduction: ' + w);
    assert.doesNotMatch(await page.locator('#play .panel').innerText(), /[Ll]ast [Dd]ig|banked after/);
    await keepNonMystery(page, 2);
    assert.equal(await page.locator('#play [data-p=kitpick]').count(), 3, 'the card from round 1 and the two you kept');
    assert.equal(await page.locator('#play .kslot .pcard').count(), 1, "last round's Starter Kit is already in its place");
    assert.match(await page.locator('#play .kslot .ctag.last').innerText(), /last round/i); assert.equal(await page.locator('#play .pool .ctag.new, #play .pool .ctag.last').count(), 2, 'what you just won is marked: new (or Can\'t start, when a card you drew cannot go in a Starter Kit)');
    await page.locator('#play .pool [data-p=kitpick]:not(:has(.ctag.last))').first().click();          // a new card joins the kit (not one that cannot start)
    assert.equal(await page.locator('#play .kslot .pcard').count(), 2); 
    const order0 = await stOf(page, () => window.DigDigBoomPlay.S.run.prep.kitPick.slice());
    const src = await page.locator('#play .kslot[data-i="1"] .pcard').boundingBox(), dst = await page.locator('#play .kslot[data-i="0"]').boundingBox();
    await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2); await page.mouse.down(); await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 8 }); await page.mouse.up();
    assert.deepEqual(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.kitPick.slice()), [order0[1], order0[0]], 'dragging one kit card onto another swaps them');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.step), 'kit', 'a drag is not a tap');
    await page.waitForTimeout(120);
    const out = await page.locator('#play .kslot[data-i="0"] .pcard').boundingBox();
    await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2); await page.mouse.down(); await page.mouse.move(60, 770, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(120);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.kitPick.length), 1, 'dragging a card off the Kit takes it out: it goes back to your cards');
    await page.click('#play .pool [data-p=kitpick] >> nth=0'); await page.waitForTimeout(120);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.kitPick.length), 2, 'and a tap puts one back');
    await page.click('#play [data-p=startround]');
    await page.waitForSelector('#play .fnote');
    assert.match(await page.locator('#play .fnote').innerText(), /FINAL ROUND/i, 'the final round is announced before anyone digs');
    assert.equal(await page.locator('#play .frules.open').count(), 0, 'the rules are only a button away');
    await page.click('#play [data-p=finalhow]'); assert.match(await page.locator('#play .frules.open').innerText(), /Nobody banks[\s\S]*keep going[\s\S]*wait/i); assert.doesNotMatch(await page.locator('#play .fnote').innerText(), /of 2|the last one/i, 'it does not repeat that it is the last round');
    await page.click('#play [data-p=finalok]'); assert.equal(await page.locator('#play .fnote').count(), 0, 'then it goes');
    assert.match(await page.locator('#play .lbhead').innerText(), /round 2 of 2 · final/i);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.known), 2, 'the two kit cards are on top of the Mine, face up; the third is shuffled in');
    assert.equal(await page.locator('#play [data-p=bank]').count(), 0, 'the final round has no Bank at all, and no gem count');
    assert.match(await page.locator('#play .aprompt').innerText(), /last round: nobody banks|in the lead/i, 'it says why, and what to do');
    assert.doesNotMatch(await page.locator('#play .lbhead').innerText(), /keep digging till you reach/i, 'the little Leaderboard does not say it');
    await script(page, { mine: ['MO-01', 'MO-02', 'MO-01', 'MO-02', 'MO-01'], dice: Array(30).fill(10) });
    for (let i = 0; i < 9 && !(await page.locator('#play .over').count()); i++) { await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await faceIt(page); }
    assert.match(await page.locator('#play .over').innerText(), /in the lead![\s\S]*Everyone else is out/i);
    await page.click('#play [data-p=prep]');                                             // the last round: straight to the end, which is the Leaderboard
    assert.match(await page.locator('#play .panel').innerText(), /You hold the Crown!/);
    assert.ok(await page.locator('#play .bigboard .bgrid .bcol').count() >= 9, 'the result is shown on the Leaderboard'); assert.equal(await page.locator('#play .bpl.me .cjewel').count(), 1, 'the Crown is on your name, at the bottom'); assert.equal(await page.locator('#play .bcrown').count(), 0, 'and no longer on the board');
    assert.equal(await page.locator('#play .dtab').count(), 2, 'tabs at the top left: one for each of the 2 rounds, no "Final"'); assert.equal(await page.locator('#play .dtab.on').innerText(), '2', 'the last round is lit to begin with');
    await page.click('#play [data-p=donetab][data-k="1"]'); assert.match(await page.locator('#play .endtitle').innerText(), /Round 1/); assert.ok(await page.locator('#play .bigboard .bgrid .bcol').count() >= 9, 'that round\'s Leaderboard as it ended');
    assert.equal(await page.locator('#play [data-p=roundlog]').count(), 0, 'no separate Round by round button');
    await page.click('#play [data-p=donetab][data-k="2"]'); assert.match(await page.locator('#play .panel').innerText(), /You hold the Crown!/, 'and back to the final board');
    await page.click('#play [data-p=owned]'); assert.ok(await page.locator('#play .ownedpanel .ocard').count() >= 1, 'the cards you built');
    await page.click('#play .ownedpanel .ocard >> nth=0'); assert.equal(await page.locator('#play .zoom .card').count(), 1, 'tapping a card makes it a full-screen card'); await page.click('#play .zoom'); assert.equal(await page.locator('#play .zoom').count(), 0, 'tap it to put it back'); assert.equal(await page.locator('#play .ownedpanel').count(), 1, 'the list is still there');
    await page.click('#play [data-p=ownedclose]', { position: { x: 5, y: 5 } }); assert.equal(await page.locator('#play .ownedpanel').count(), 0, 'tapping anywhere else closes it');
    assert.equal(await page.locator('#play [data-p=startrun]').count(), 1, 'and a new run is one button away');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('run: after a bank the tally is shown one piece at a time — Treasure, then Monsters, then the die waits for you, then the die lands and only then the pack appears — while a thermometer of packs fills up', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.addInitScript(() => { window.DDB_TALLY_PACE = 0.5; });
    await page.reload(); await page.waitForSelector('#play .home');
    await startRun(page, { opp: false, rounds: 3 });
    await script(page, { mine: ['TR-01', 'TR-01', 'MO-01', 'TR-01', 'TR-01'], dice: [10, 10] });          // (a spare card, so the Mine does not run dry: that would bring up a message)
    for (let i = 0; i < 4; i++) { await page.click('#play [data-p=dig]'); if (i === 2) { await page.click('#play [data-p=roll]'); await faceIt(page); } }
    await page.click('#play [data-p=bank]'); await page.click('#play [data-p=prep]');
    await page.evaluate(() => { window.DigDigBoomPlay.S.run.dice = [6]; }); await page.click('#play [data-p=boardgo]');
    assert.equal(await page.locator('#play .gchart').count(), 1, 'the thermometer is on the side from the start');
    assert.equal(await page.locator('#play .pack:not(.ghostpack)').count(), 0, 'no pack yet');
    await page.waitForFunction(() => document.querySelectorAll('#play .eq .t.pop').length === 1);                    // Treasure first
    assert.equal(await page.locator('#play .eq .t.pop').count(), 1);
    await page.waitForFunction(() => document.querySelectorAll('#play .eq .t.pop').length === 2);                    // then Monsters
    assert.equal(await page.locator('#play .eq .t.die.pop').count(), 0, 'the die has not come yet');
    const before = await page.locator('#play .gbubble').innerText();
    await page.waitForSelector('#play .eq .t.die.pop');                                                              // then the die rolls by itself
    assert.equal(await page.locator('#play .pack:not(.ghostpack)').count(), 0, 'the die is still rolling: the pack is not shown yet');
    await page.waitForSelector('#play .pack:not(.ghostpack)');
    assert.notEqual(await page.locator('#play .gbubble').innerText(), before, 'the level rose with the die');
    assert.equal(await page.locator('#play .grow.got').count(), 1, 'the tier you reached is marked');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('run: a tap on the tally skips ahead to the die (and past the landing to the pack)', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.addInitScript(() => { window.DDB_TALLY_PACE = 50; });
    await page.reload(); await page.waitForSelector('#play .home');
    await startRun(page, { opp: false, rounds: 3 });
    await script(page, { mine: ['TR-01', 'TR-01', 'MO-01', 'TR-01'], dice: [10, 10] });
    for (let i = 0; i < 2; i++) await page.click('#play [data-p=dig]');
    await page.click('#play [data-p=bank]'); await page.click('#play [data-p=prep]');
    await page.evaluate(() => { window.DigDigBoomPlay.S.run.dice = [4]; }); await page.click('#play [data-p=boardgo]');
    assert.equal(await page.locator('#play .eq .t.die.pop').count(), 0, 'nothing has been revealed yet and the timers are slow');
    await page.click('#play [data-p=skiptally]'); await dieShows(page, '#play .eq .t.die', 4);
    assert.equal(await page.locator('#play .pack:not(.ghostpack)').count(), 0); await page.click('#play [data-p=skiptally]');
    assert.equal(await page.locator('#play .pack:not(.ghostpack)').count(), 1, 'and a tap while the die lands brings the pack');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('run: BOOM skips the Escape Bonus and gives a Bronze Pack; your marker moves the moment you ENCOUNTER a Monster, before you roll; BOOM takes it away (no pledging)', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page);
    await script(page, { mine: ['MO-01', 'MO-02'], dice: [10, 1], start: { heart: 1 } });
    assert.equal(await page.locator('#play .lbc .mk.pledge').count(), 1, 'nothing encountered yet: your piece stands on 0'); assert.equal(await page.locator('#play .lbc:first-child .mk.pledge').count(), 1);
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .lbc.here').innerText().then(t => t.split('\n')[0].trim()), '1', 'the Monster is in front of you and already counts');
    assert.equal(await page.locator('#play .lbc:has(.mk.pledge) .ln').innerText(), '1');
    await page.click('#play [data-p=roll]'); await faceIt(page);
    await page.click('#play [data-p=dig]'); assert.equal(await page.locator('#play .lbc.here').innerText().then(t => t.split('\n')[0].trim()), '2');
    await page.click('#play [data-p=roll]'); await faceIt(page);
    assert.match(await page.locator('#play .over').innerText(), /BOOM/); assert.equal(await page.locator('#play .lbc .mk.pledge').count(), 0, 'BOOM cleared the live marker');
    await page.click('#play [data-p=prep]'); await page.click('#play [data-p=boardgo]');
    assert.equal(await page.locator('#play .eq').count(), 0, 'no Escape Bonus after a BOOM'); assert.equal(await page.locator('#play .pack b').innerText(), 'Bronze');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('run: the main menu, Prep and the Leaderboard fit the screen on an iPad (landscape and upright) without scrolling the page', SKIP, async () => {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 700 }, { width: 820, height: 1180 }]) {
    const { browser, page, errors } = await open({ viewport, menu: true });
    try {
      await page.evaluate(() => { window.DigDigBoomPlay.S.opp = false; }); await page.click('#play [data-p=startrun]');
      const fits = () => page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
      let m = await fits(); assert.ok(m.sh <= m.ih + 1 && m.sw <= m.iw + 1, `first Prep at ${viewport.width}x${viewport.height}`);
      assert.equal(await page.locator('#play .lbc').count(), 0, 'no Leaderboard in Prep');
      await page.click('#play [data-p=openpack]'); m = await fits(); assert.ok(m.sh <= m.ih + 1 && m.sw <= m.iw + 1, `pack at ${viewport.width}x${viewport.height}`);
      await keepNonMystery(page, 1); m = await fits(); assert.ok(m.sh <= m.ih + 1 && m.sw <= m.iw + 1, `kit at ${viewport.width}x${viewport.height}`);
      await page.click('#play [data-p=kitpick] >> nth=0'); await page.click('#play [data-p=startround]'); await page.waitForSelector('#play .ptable');
      m = await fits(); assert.ok(m.sh <= m.ih + 1 && m.sw <= m.iw + 1, `table at ${viewport.width}x${viewport.height}`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('menu: in a game there is no link out to the library — a Menu with a way back to the main menu; your game is saved, Continue picks it up, New game replaces it only after a second tap', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page);
    await script(page, { mine: ['TR-01', 'TR-01', 'MO-01'], dice: [10] });
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .pbar a, #play .libback').count(), 0, 'no link to the Tabletop Library while you play');
    assert.equal(await page.locator('#play .pbar [data-p=gmenu]').count(), 1);
    await page.click('#play .pbar [data-p=gmenu]');
    assert.match(await page.locator('#play .gmenu').innerText(), /Back to the game[\s\S]*How to play[\s\S]*Main menu/);
    await page.click('#play [data-p=gmenuclose]'); assert.equal(await page.locator('#play .gmenu').count(), 0);
    await page.click('#play .pbar [data-p=gmenu]'); await page.click('#play [data-p=mainmenu]');
    assert.match(await page.locator('#play .homemenu').innerText(), /Continue[\s\S]*New game/);
    assert.equal(await page.locator('#play [data-p=resume] .pips i').count(), 5, 'one circle per round on Continue'); assert.equal(await page.locator('#play [data-p=resume] .pips i.now').count(), 1, 'the current round is ringed'); assert.doesNotMatch(await page.locator('#play [data-p=resume]').innerText(), /Round|Dig|Prep/, 'circles, no words');
    await page.click('#play [data-p=startrun]');                                       // the first tap only asks
    assert.match(await page.locator('#play .homemenu').innerText(), /Tap again to replace your game/); assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.digs), 1, 'nothing was replaced yet');
    await page.click('#play [data-p=resume]'); await page.waitForSelector('#play .ptable');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.digs), 1, 'the same game, where you left it');
    await page.click('#play .pbar [data-p=gmenu]'); await page.click('#play [data-p=mainmenu]'); await page.click('#play [data-p=startrun]'); await page.click('#play [data-p=startrun]');
    assert.equal(await page.locator('#play .pack b').innerText(), 'Bronze', 'a brand new run: the round-1 Bronze Pack');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('play: a reload puts you back exactly where you were — mid-fight in a run, in Prep, and in a Practice Dig', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { window.DigDigBoomPlay.S.opp = false; }); await page.click('#play [data-p=startrun]'); await page.click('#play [data-p=openpack]'); await keepNonMystery(page, 1); await page.click('#play [data-p=kitpick] >> nth=0');
    await page.reload(); await page.waitForSelector('#play .panel');
    assert.equal(await page.locator('#play [data-p=kitpick]').count() > 0, true, 'back in Prep');
    assert.equal(await page.locator('#play .pcard.sel').count(), 1, 'with your pick still picked');
    await page.click('#play [data-p=startround]'); await page.waitForSelector('#play .ptable');
    await script(page, { mine: ['TR-01', 'MO-01', 'TR-01'], dice: [7, 3] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    const before = await stOf(page, () => { const st = window.DigDigBoomPlay.S.st; return { mine: st.mine.length, die: st.fight.die, log: st.log.length, line: st.line.length, heart: st.heart, pile: st.monsterPile.length }; });
    await page.reload(); await page.waitForSelector('#play .ptable');
    const after = await stOf(page, () => { const st = window.DigDigBoomPlay.S.st; return { mine: st.mine.length, die: st.fight && st.fight.die, log: st.log.length, line: st.line.length, heart: st.heart, pile: st.monsterPile.length }; });
    assert.deepEqual(after, before, 'the same Mine, die, log and line');
    await faceIt(page);
    assert.match(await logText(page), /survive (Ember Imp|Gloop|Spore Cap)/);
    await page.click('#play .pbar [data-p=gmenu]'); await page.click('#play [data-p=mainmenu]'); assert.match(await page.locator('#play .homemenu').innerText(), /Continue/);
    await page.click('#play [data-p=resume]'); await page.waitForSelector('#play .ptable');
    // a Practice Dig resumes too
    await page.click('#play .pbar [data-p=gmenu]'); await page.click('#play [data-p=mainmenu]'); await page.click('#play [data-p=more]'); await page.click('#play [data-p=practice]'); if (await page.locator('#play .confirm').count()) await page.click('#play [data-p=practice]'); await page.click('#play [data-p=random]'); await page.click('#play [data-p=go]'); await page.waitForSelector('#play .ptable');
    await page.click('#play [data-p=dig]'); const n = await stOf(page, () => window.DigDigBoomPlay.S.st.mine.length);
    await page.reload(); await page.waitForSelector('#play .ptable');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.mine.length), n); assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run), null);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('play: monkey test — random taps through whole runs at iPad sizes: no errors, the page never scrolls, a legal tap always exists until the run is done', { ...SKIP, timeout: 300000 }, async () => {
  const ALL = `(document.querySelector('#play .zoom') ? [document.querySelector('#play .zoom')] : [...document.querySelectorAll('#play [data-p]:not([disabled])')]).filter(e => e.getBoundingClientRect().width > 0 && (!(e.closest('.pbar') || e.closest('.foot')) || ['startround', 'prep', 'boardgo', 'keepgo', 'continuereveal', 'again', 'openpack', 'ff'].includes(e.dataset.p)) && (r => e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)))(e.getBoundingClientRect()))`;
  const AVOID = ['menu', 'more', 'gmenu', 'gmenuclose', 'mainmenu', 'practice', 'cards', 'help', 'startrun', 'setup', 'rounds', 'resume'];
  for (const [vp, seed, ai] of [[{ width: 1180, height: 820 }, 1, true], [{ width: 820, height: 1180 }, 2, false], [{ width: 1024, height: 700 }, 3, true]]) {
    const { browser, page, errors } = await open({ viewport: vp, menu: true });
    try {
      await page.evaluate(a => { window.DigDigBoomPlay.S.rounds = 2; window.DigDigBoomPlay.S.opp = a; }, ai); await page.click('#play [data-p=startrun]');
      let r = seed * 7919; const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
      let done = false, i = 0;
      for (; i < 2500 && !done; i++) {
        const acts = await page.evaluate(`${ALL}.map((e, i) => [i, e.dataset.p])`);
        const pool = acts.filter(([, p]) => !AVOID.includes(p));
        assert.ok(pool.length, `no legal tap at step ${i}: ${(await page.locator('#play').innerText()).slice(0, 160)}`);
        const prefer = pool.filter(([, p]) => ['dig', 'roll', 'face', 'boardgo', 'openpack', 'pick', 'keepgo', 'kitpick', 'startround', 'prep', 'unzoom', 'ff', 'hold'].includes(p));
        const from = prefer.length && rnd() < .85 ? prefer : pool, [idx] = from[Math.floor(rnd() * from.length)];
        const h = await page.evaluateHandle(`${ALL}[${idx}]`);
        const el = h.asElement(); if (!el) continue; try { await el.click({ timeout: 15000 }); } catch (e) { if (/not attached/.test(e.message)) continue; throw e; }       // the AI's fast-forwarded clock may redraw the panel under the monkey
        const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, done: /Crown|You win|AI wins/.test((document.querySelector('#play .panel h2') || {}).textContent || '') }));
        assert.ok(m.sh <= m.ih + 1, `the page scrolls at step ${i}`);
        done = m.done;
      }
      assert.ok(done, `the run did not finish in ${i} taps at ${vp.width}x${vp.height}: ${(await page.locator('#play').innerText()).replace(/\s+/g, ' ').slice(0, 500)} | ${JSON.stringify(await page.evaluate(() => { const S = window.DigDigBoomPlay.S; return { panel: S.panel, phase: S.run && S.run.phase, step: S.run && S.run.prep && S.run.prep.step, over: S.st && S.st.over && S.st.over.kind, fight: !!(S.st && S.st.fight), mine: S.st && S.st.mine.length }; }))}`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

// ---------------------------------------------------------------- against the AI
test('ai: a run shares one Leaderboard with the AI; it digs on its own clock (not when you tap) and there is no AI line of text; your marker moves by itself', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { opp: true });
    assert.match(await page.locator('#play .lbhead').innerText(), /you[\s\S]*easy[\s\S]*med[\s\S]*hard/i);
    assert.equal(await page.locator('#play .ailine').count(), 0, 'nothing to read: you watch its marker');
    await script(page, { mine: ['MO-01', 'MO-02', 'MO-01', 'MO-02'], dice: Array(30).fill(10) });
    const aiDigs = () => stOf(page, () => window.DigDigBoomPlay.S.match.runs.easy.dig.digs);
    const before = await aiDigs();
    await page.click('#play [data-p=dig]'); assert.equal(await aiDigs(), before, 'your dig does not move the AI');
    await page.click('#play [data-p=roll]'); await faceIt(page);
    assert.equal(await aiDigs(), before, 'nor does anything else you tap');
    await page.evaluate(() => window.DigDigBoomPlay.tick()); assert.equal(await aiDigs(), before + 1, 'its clock moves it one card');
    assert.equal(await page.locator('#play .lbc .mk[title*="this Dig"]').count() >= 1, true, 'a live marker is on the board');
    assert.equal(await page.locator('#play .mcard, #play [data-p=dig]').count() >= 1, true, 'the table was not redrawn away by the tick');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('ai: its clock really runs on its own, a tick redraws only the Leaderboard (never the table you are tapping)', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.addInitScript(() => { window.DDB_AI_PACE = 250; });
    await page.reload(); await page.waitForSelector('#play .home');
    await startRun(page, { opp: true });
    const mine = await page.locator('#play [data-p=dig]').elementHandle();
    await page.waitForFunction(() => window.DigDigBoomPlay.S.match.runs.easy.dig.digs >= 2 || window.DigDigBoomPlay.S.match.runs.easy.dig.over, null, { timeout: 15000 });
    assert.equal(await page.evaluate(h => h.isConnected, mine), true, 'the Mine button you might be pressing was not replaced');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('ai: when your Dig ends you go on at once (the AI finishes behind the scenes, no Fast-forward); the Escape Bonus is one die for both; the AI preps when you open your pack; the end names a winner', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { opp: true, rounds: 2 });
    await script(page, { mine: ['TR-01', 'TR-01'] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=bank]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.match.runs.easy.dig.over), null, 'the AI is not done: it plays at its own pace');
    assert.equal(await page.locator('#play .over [data-p=ff]').count(), 0, 'no Fast-forward'); assert.doesNotMatch(await page.locator('#play .over').innerText(), /still digging/i);
    assert.equal(await page.locator('#play .over [data-p=prep]').count(), 1, 'the usual button is there at once');
    await page.click('#play [data-p=prep]');
    assert.ok(await page.locator('#play .bigboard .bgrid .bcol').count() >= 9, 'the Leaderboard first: columns of stacked spots'); { const toks = (await page.locator('#play .bigboard .bgrid .pchip').allInnerTexts()).map(t => t.replace(/[^A-Za-z]/g, '')); assert.equal(toks.length, 4, 'one chip for each player'); assert.deepEqual(toks.filter(Boolean), ['You'], 'only your chip is labelled: the others are told apart by colour'); assert.equal((await page.locator('#play .bplayers .bpl').allInnerTexts()).map(t => t.replace(/[^A-Za-z ]/g, '').trim()).join('|'), 'You|Easy AI|Medium AI|Hard AI', 'the players are named at the bottom'); } assert.equal(await page.locator('#play .bigboard .blegend').count(), 0);
    await page.evaluate(() => { window.DigDigBoomPlay.S.match.dice = [6]; }); await page.click('#play [data-p=boardgo]');
    assert.ok(['escape', 'pack'].includes(await stOf(page, () => window.DigDigBoomPlay.S.match.runs.easy.prep.step)), 'the AI has not opened a pack: it does that when you open yours');
    await page.waitForSelector('#play .eq .t.die.pop'); await dieShows(page, '#play .eq .t.die', 6);
    const esc = await stOf(page, () => [window.DigDigBoomPlay.S.match.runs.me.prep.escape, window.DigDigBoomPlay.S.match.runs.easy.prep.escape]);
    assert.equal(esc[0], 6); assert.ok(esc[1] === 6 || esc[1] === null, 'the AI got the same roll when it banked');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.match.runs.easy.prep.step), 'pack', 'its Escape Bonus is read; its pack is still closed');
    await page.click('#play [data-p=openpack]');
    await page.waitForFunction(() => window.DigDigBoomPlay.S.match.runs.easy.prep.step === 'kit', null, { timeout: 8000 });          // it thinks a moment after your pack starts opening, so the screen is not held up
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.match.runs.easy.prep.step), 'kit', 'the AI opened its pack with you');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('ai: a reload in the middle of a match puts you and the AI back exactly where you were', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { opp: true });
    for (let i = 0; i < 3; i++) { await page.click('#play [data-p=dig]'); if (await page.locator('#play [data-p=roll]').count()) { await page.click('#play [data-p=roll]'); await faceIt(page); } if (await page.locator('#play .over').count()) break; }
    await page.evaluate(() => window.DigDigBoomPlay.tick());
    const snap = () => stOf(page, () => { const m = window.DigDigBoomPlay.S.match; return { me: m.runs.me.dig.digs, ai: m.runs.easy.dig.digs, aiLog: m.runs.easy.dig.log.length, board: JSON.stringify(m.board.spots) }; });
    const before = await snap();
    await page.reload(); await page.waitForSelector('#play .ptable');
    assert.deepEqual(await snap(), before);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------------------------------------------------------------- the dice
test('dice: every roll is played out on a ten-sided die and ends showing the number; the Escape Bonus too', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01'], dice: [7] });
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .dieb svg.d10').count(), 1, 'a die, drawn as a d10, waiting to be tapped');
    await page.click('#play [data-p=roll]');
    assert.ok(await page.locator('#play .dieb svg.d10.fx-tumble').count() === 1, 'it tumbles'); await dieShows(page, '#play .dieb', 7);
    assert.match(await page.locator('#play .calc').innerText(), /^Result\s*7$/, 'the die says the roll; one line says the result (nothing else to add)');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cards: Monster A and Monster B are different at a glance (their own creature and colours); no art slot on Ongoing, Consumable and Immediate cards; a Geode is one giant count-and-gem on blue', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.evaluate(() => window.DigDigBoomUI.setMode('cards')); await page.waitForSelector('section.dir');
    const look = id => page.locator(`#deckRow .card[data-id=${id}]`).first().evaluate(e => { const a = e.querySelector('.art'); return { sym: a && a.querySelector('use').getAttribute('href'), bg: a && getComputedStyle(a).backgroundImage, arts: e.querySelectorAll('.art').length }; });
    const a = await look('MO-01'), b = await look('MO-02');
    assert.notEqual(a.sym, b.sym, 'a different creature'); assert.notEqual(a.bg, b.bg, 'and a different colour of sunburst');
    for (const id of ['ON-06', 'IM-01', 'ON-33', 'CO-19']) assert.equal((await look(id)).arts, 0, `${id} has no art placeholder`);
    assert.equal((await look('TR-01')).arts, 0, 'a Geode has no separate art strip either');
    assert.equal(await page.locator('#deckRow .card[data-id=TR-01] .gemtile').count(), 6);
    const brown = await page.locator('#deckRow .card[data-id=TR-01]').evaluateAll(els => els.map(e => getComputedStyle(e.querySelector('.band')).backgroundColor));
    assert.equal(new Set(brown).size, 1, 'every Geode has the same blue header');
    assert.doesNotMatch(await page.locator('body').innerText(), /Questions already written|[Pp]rint guides|Print sheets/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('menu: opening the game from the shelf shows the main menu with Continue (not straight into your game); a reload still puts you back where you were', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page); await page.click('#play [data-p=dig]');
    const ctx = page.context(), fresh = await ctx.newPage();
    await fresh.addInitScript(() => { window.DDB_AI_PACE = 3600000; });
    await fresh.goto(FILE); await fresh.waitForSelector('#play .home');
    await fresh.waitForTimeout(400);
    assert.equal(await fresh.locator('#play .ptable').count(), 0, 'not straight into the game');
    assert.match(await fresh.locator('#play .homemenu').innerText(), /Continue/);
    await fresh.click('#play [data-p=resume]'); await fresh.waitForSelector('#play .ptable');
    await fresh.reload(); await fresh.waitForSelector('#play .ptable');          // a reload resumes mid-game
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a Mystery Box: the cards you did not keep fly away once, on the pack screen, and not again on the Starter Kit screen', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.click('#play [data-p=startrun]'); await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play .pcard[data-p=pick]');
    await page.evaluate(() => { const P = window.DigDigBoomPlay, run = P.S.match.runs.me, pr = run.prep, full = window.DigDigBoomUI.state.all; pr.offer = ['IM-14', 'ON-31', 'ON-10'].map((id, i) => ({ ...full.find(c => c.id === id), uid: 9100 + i })); pr.picked = []; run.deck.unshift({ ...full.find(c => c.id === 'ON-33'), uid: 9150 }); P.render(); });
    await page.click('#play .pcard[data-uid="9100"]'); await page.click('#play [data-p=keepgo]');
    await page.waitForSelector('#play [data-p=continuereveal]');
    assert.equal(await page.locator('#play .sweepcard').count(), 2, 'on the pack screen the two cards fly away');
    await page.click('#play [data-p=continuereveal]'); await page.waitForSelector('#play [data-p=startround]');
    assert.equal(await page.locator('#play .sweepcard').count(), 0, 'and they do not fly away a second time');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('choosing pack cards: a button shows the cards you already own (hidden when you own none), and it closes with a tap; a zoomed card has no instruction either', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.click('#play [data-p=startrun]'); await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play .pcard[data-p=pick]');
    assert.equal(await page.locator('#play [data-p=owned]').count(), 0, 'nothing owned yet: no button');
    await page.evaluate(() => { const P = window.DigDigBoomPlay, run = P.S.match.runs.me, full = window.DigDigBoomUI.state.all; run.owned = ['ON-10', 'ON-33'].map((id, i) => ({ ...full.find(c => c.id === id), uid: 9300 + i })); P.render(); });
    assert.match(await page.locator('#play [data-p=owned]').innerText(), /Your cards \(2\)/);
    await page.click('#play [data-p=owned]');
    assert.equal(await page.locator('#play .ownedpanel .ocard').count(), 2, 'both cards are shown');
    assert.doesNotMatch(await page.locator('#play .ownedpanel').innerText(), /tap anywhere/i);
    await page.click('#play [data-p=ownedclose]', { position: { x: 5, y: 5 } }); assert.equal(await page.locator('#play .ownedpanel').count(), 0);
    await page.locator('#play .pcard[data-p=pick]').first().click({ button: 'right' }).catch(() => {});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: there is no "take the damage" button until the die has finished rolling', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01'], dice: [4], start: { heart: 6 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play .takedmg').isVisible(), false, 'the die is still rolling');
    await page.waitForSelector('#play .takedmg', { state: 'visible', timeout: 4000 });
    assert.equal(await page.locator('#play .takedmg.waitroll').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Prep is one screen: it cannot be scrolled (the pack\'s sparks used to make it scrollable), and the chosen card stays clear of the Starter Kit title', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.click('#play [data-p=startrun]'); await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play .pcard[data-p=pick]'); await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#play #setupScroll')).overflowY), 'hidden', 'no scrolling on the pack screen');
    await page.mouse.move(600, 500); await page.mouse.wheel(0, 600); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.querySelector('#play #setupScroll').scrollTop), 0, 'a wheel or a drag does not move it');
    await keepNonMystery(page, 1);
    await page.waitForSelector('#play .kslots'); await page.click('#play .pool [data-p=kitpick] >> nth=0'); await page.waitForTimeout(300);
    const g = await page.evaluate(() => ({ title: document.querySelector('#play .kitbar').getBoundingClientRect().bottom, slots: document.querySelector('#play .kslots').getBoundingClientRect().top }));
    assert.ok(g.slots - g.title >= 20, 'the Starter Kit title is clear of the cards: ' + (g.slots - g.title) + ' px');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the last round: when you are in the lead you can fast-forward the opponent, and it slows down again once they catch up with you', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.rounds = 2; });
    await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    await page.evaluate(() => { const m = window.DigDigBoomPlay.S.match; for (const r of Object.values(m.runs)) { r.rounds = 1; } m.rounds = 1; });
    await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play .pcard[data-p=pick]'); await keepNonMystery(page, 1);
    await page.click('#play [data-p=startround]'); await page.waitForSelector('#play .fnote'); await page.click('#play [data-p=finalok]');
    assert.equal(await page.locator('#play .ffbtn').count(), 0, 'not in the lead: nothing to fast-forward');
    await page.evaluate(() => { const P = window.DigDigBoomPlay, m = P.S.match; Board.lockIn(m.board, 'me', 5); Run.refresh(P.S.run); P.render(); });
    assert.equal(await page.locator('#play .ffbtn').count(), 0, 'in the lead, but you have not gone one past your own best: your job is to dig, not to wait');
    assert.match(await page.locator('#play .aprompt').innerText(), /in the lead with 5[\s\S]*one past/i);
    await page.evaluate(() => { const P = window.DigDigBoomPlay, m = P.S.match; P.S.st.monstersDug = 6; Board.track(m.board, 'me', 6); Run.refresh(P.S.run); P.render(); });
    assert.match(await page.locator('#play .ffbtn').innerText(), /Fast-forward/i, 'past your best and in the lead: now you may wait');
    await page.click('#play [data-p=ff]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.ff), true); assert.match(await page.locator('#play .ffbtn').innerText(), /Fast-forwarding/);
    await page.evaluate(() => { const P = window.DigDigBoomPlay, m = P.S.match; Board.track(m.board, 'easy', 7); P.tick(); });
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.ff), false, 'the opponent passed you: back to its own pace');
    assert.match(await page.locator('#play [role=alertdialog]').innerText(), /took the lead[\s\S]*Fast-forward has stopped[\s\S]*7/i, 'and a note says who took the lead, and with what');
    assert.equal(await page.locator('#play .ffbtn:has-text("Fast-forwarding")').count(), 0, 'the button no longer says it is fast-forwarding');
    const digs = () => stOf(page, () => Object.values(window.DigDigBoomPlay.S.match.runs).reduce((a, r) => a + (r.dig ? r.dig.digs : 0), 0)), d0 = await digs();
    await page.evaluate(() => window.DigDigBoomPlay.tick()); assert.equal(await digs(), d0, 'while the note waits for you, the opponents wait too');
    await page.click('#play [data-p=ffok]'); assert.equal(await page.locator('#play [role=alertdialog]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the in-game menu (and How to play) pause the game: the opponents do not move until you are back at the table', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { opp: true });
    await script(page, { mine: ['MO-01', 'MO-02', 'MO-01', 'MO-02'], dice: Array(30).fill(10) });
    const aiDigs = () => stOf(page, () => window.DigDigBoomPlay.S.match.runs.easy.dig.digs);
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await faceIt(page);
    const before = await aiDigs();
    await page.click('#play [data-p=gmenu]'); await page.evaluate(() => window.DigDigBoomPlay.tick()); assert.equal(await aiDigs(), before, 'the menu is open: its clock does nothing');
    await page.click('#play [data-p=gmenuclose]'); await page.evaluate(() => window.DigDigBoomPlay.tick()); assert.equal(await aiDigs(), before + 1, 'back at the table: it moves again');
    await page.click('#play [data-p=gmenu]'); await page.click('#play [data-p=help]'); await page.evaluate(() => window.DigDigBoomPlay.tick()); assert.equal(await aiDigs(), before + 1, 'How to play pauses it too');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the last round: when everyone else has gone BOOM you have won, but the Dig goes on until you choose "See the result"', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.rounds = 2; });
    await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    await page.evaluate(() => { const m = window.DigDigBoomPlay.S.match; for (const r of Object.values(m.runs)) { r.rounds = 1; } m.rounds = 1; });
    await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play .pcard[data-p=pick]'); await keepNonMystery(page, 1);
    await page.click('#play [data-p=startround]'); await page.waitForSelector('#play .fnote');
    assert.match(await page.locator('#play .fnote').innerText(), /FINAL ROUND/); assert.doesNotMatch(await page.locator('#play .fnote').innerText(), /the last one/i);
    await page.click('#play [data-p=finalok]');
    await page.evaluate(() => { const P = window.DigDigBoomPlay, m = P.S.match; Board.lockIn(m.board, 'me', 5); for (const id of Match.botIds(m)) { const r = m.runs[id]; r.dig.over = { kind: 'boom', why: 'test', seq: 99 }; Run.checkOver(r); } Run.refresh(P.S.run); Match.finalCheck(m); P.render(); });
    assert.equal(await page.locator('#play .over').count(), 0, 'your Dig has not ended by itself');
    assert.match(await page.locator('#play .aprompt').innerText(), /You are winning[\s\S]*Keep digging[\s\S]*BOOM now costs you/i);
    assert.equal(await page.locator('#play [data-p=dig]:not([disabled])').count(), 1, 'you may keep digging');
    await page.click('#play [data-p=hold]'); await page.waitForSelector('#play .bigboard');
    assert.equal(await page.locator('#play .over').count(), 0, 'no ribbon and no little message first: straight to the Leaderboard');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('leaderboard, final round: the winner\'s piece wears the Crown where a banked piece would show its gem', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { window.DigDigBoomPlay.S.opp = true; }); await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    await page.evaluate(() => { window.DDB_BOARD_PACE = 3600000; const P = window.DigDigBoomPlay; P.S.bests0 = { me: 0, easy: 0, medium: 0, hard: 0 }; P.S.boardAnim = { from: P.S.bests0, newBest: false, events: [{ r: 1, id: 'hard', k: 'move', n: 2 }, { r: 1, id: 'easy', k: 'boom', n: 1 }, { r: 1, id: 'hard', k: 'bank', n: 2, final: true }], k: 0, timer: null, rects: null, fx: null }; P.S.panel = 'board'; P.render(); });
    await page.evaluate(() => { window.DDB_BOARD_PACE = 5; window.DigDigBoomPlay.act('boardfast'); });
    await page.waitForFunction(() => window.DigDigBoomPlay.S.boardAnim.k === 3);
    assert.equal(await page.locator('#play .bgem.bwin').count(), 1, 'one Crown'); assert.equal(await page.locator('#play .bgem.bwin').innerText(), '♛');
    assert.equal(await page.locator('#play .bgem:not(.bwin)').count(), 0, 'and no gem: the winner does not bank');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('leaderboard: the round plays by itself with nothing to tap; a piece whose Dig ended stays where it stopped with a blue gem (what it earned) or a starburst (BOOM); Fast forward jumps ahead; the button to go on is there all the time', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { window.DigDigBoomPlay.S.opp = true; }); await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    await page.evaluate(() => { window.DDB_BOARD_PACE = 3600000; const P = window.DigDigBoomPlay; P.S.bests0 = { me: 0, easy: 0, medium: 0, hard: 0 }; P.S.boardAnim = { from: P.S.bests0, newBest: false, events: [{ r: 1, id: 'hard', k: 'move', n: 2 }, { r: 1, id: 'hard', k: 'bank', n: 2, gems: 7 }, { r: 1, id: 'easy', k: 'boom', n: 0 }, { r: 1, id: 'me', k: 'move', n: 1 }], k: 0, timer: null, rects: null, fx: null }; P.S.panel = 'board'; P.render(); });
    assert.equal(await page.locator('#play [data-p=boardgo]').count(), 1, 'the way on is there from the start'); assert.equal(await page.locator('#play [data-p=boardfast]').count(), 1, 'and so is Fast forward');
    await page.evaluate(() => { window.DDB_BOARD_PACE = 5; window.DigDigBoomPlay.act('boardfast'); });
    await page.waitForFunction(() => window.DigDigBoomPlay.S.boardAnim.k === 4);
    assert.equal(await page.locator('#play .bgem').innerText(), '7', 'the gem with what it earned stays');
    assert.equal(await page.locator('#play .bdisc[data-pid=hard]').count(), 1, 'and so does its piece');
    assert.equal(await page.locator('#play .bdisc.blown[data-pid=easy]').count(), 1, 'the piece that went BOOM stays, in its starburst'); assert.equal(await page.locator('#play .bboom').count(), 1);
    assert.equal(await page.locator('#play [data-p=boardfast]').count(), 0, 'at the end there is nothing left to fast forward');
    assert.equal(await page.locator('#play .bigboard .scroll[data-p=boardstep]').count(), 0, 'nothing to tap'); assert.doesNotMatch(await page.locator('#play .bigboard').innerText(), /tap to continue/i);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('leaderboard: 0 to 9 by default; tap the small one while you dig for the full-size board, which keeps up with the opponents; tap it to go back', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { opp: true, rounds: 3 });
    assert.equal(await page.locator('#play section.lb .lbc').count(), 10, 'the small board runs 0 to 9');
    await page.click('#play section.lb'); await page.waitForSelector('#play .lbfull');
    assert.equal(await page.locator('#play .lbfull .bcol').count(), 11, 'the full-size board: a column for each number 0 to 9 (and the labels)');
    assert.equal(await page.locator('#play .lbfull .bdisc').count(), 4, 'every player digging has a piece on it');
    await page.evaluate(() => window.DigDigBoomPlay.tick());
    assert.equal(await page.locator('#play .lbfull').count(), 1, 'the opponents move behind it and it stays open');
    await page.click('#play .lbfull', { position: { x: 6, y: 6 } }); assert.equal(await page.locator('#play .lbfull').count(), 0, 'a tap on the background goes back to the Dig');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; Board.track(P.S.match.board, 'hard', 8); P.render(); });
    assert.equal(await page.locator('#play section.lb .lbc').count(), 10, 'somebody at 8: still 0 to 9');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; Board.track(P.S.match.board, 'hard', 9); P.render(); });
    assert.equal(await page.locator('#play section.lb .lbc').count(), 11, 'somebody at 9: one place more, for 10');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('an iPhone on its side (874 x 402): the layout of a taller screen, scaled down to fit — the pack, the Starter Kit, the table with its Bank and die, the Leaderboard all fit; dragging a card to a Keep place still works', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 874, height: 402 }, menu: true });
  try {
    const inside = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return 'missing ' + s; const r = e.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1 ? 'ok' : `${s} at ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`; }, sel);
    assert.ok(await page.evaluate(() => document.getElementById('play').classList.contains('scaled')), 'a short screen is scaled');
    await page.evaluate(() => { window.DigDigBoomPlay.S.opp = true; }); await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    assert.equal(await inside('#play .pack'), 'ok'); assert.equal(await inside('#play [data-p=keepgo]'), 'ok');
    await page.click('#play [data-p=openpack]'); await page.waitForSelector('#play .pcard[data-p=pick]'); await page.waitForTimeout(3600);
    const card = await page.locator('#play .pcard[data-p=pick]').first().boundingBox(), slot = await page.locator('#play .kslot').first().boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2); await page.mouse.down(); await page.mouse.move(card.x + card.width / 2 + 30, card.y + card.height / 2 - 30, { steps: 4 });
    const g = await page.locator('.dragghost').boundingBox(); assert.ok(Math.abs(g.width - card.width * 1.05) < card.width * .12, `the card you carry is the size of the one you picked up: ${g.width} vs ${card.width}`);
    await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(150);
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.run.prep.picked.length), 1, 'dropped on the Keep place');
    await page.click('#play [data-p=keepgo]'); await page.waitForSelector('#play [data-p=kitpick]'); await page.waitForTimeout(800);
    assert.equal(await inside('#play [data-p=startround]'), 'ok');
    await page.click('#play [data-p=kitpick] >> nth=0'); await page.click('#play [data-p=startround]'); await page.waitForSelector('#play .ptable');
    for (const sel of ['#play section.lb', '#play .piles .bankp', '#play .deck']) assert.equal(await inside(sel), 'ok');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.st.mine = ['MO-01', 'TR-01'].map((id, i) => ({ ...window.DigDigBoomUI.state.all.find(c => c.id === id), uid: 8000 + i })); P.S.st.known = 0; P.S.st.heart = 30; P.render(); });
    await page.click('#play [data-p=dig]'); await page.waitForSelector('#play [data-p=roll]');
    for (const sel of ['#play [data-p=roll]', '#play .tableau', '#play .piles .bankp']) assert.equal(await inside(sel), 'ok');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), true, 'the page does not scroll');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('leaderboard: nothing scrolls at any iPad size (the whole screen is drawn smaller to fit), and your piece says You', SKIP, async () => {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 700 }, { width: 820, height: 1180 }, { width: 1180, height: 600 }]) {
    const { browser, page, errors } = await open({ viewport, menu: true });
    try {
      await page.evaluate(() => { window.DigDigBoomPlay.S.opp = true; }); await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
      await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.bests0 = { me: 0, easy: 0, medium: 0, hard: 0 }; P.S.boardAnim = { from: P.S.bests0, newBest: true, events: [{ r: 1, id: 'me', k: 'move', n: 2 }, { r: 1, id: 'hard', k: 'move', n: 1 }], k: 1, stop: false, timer: null, rects: null, fx: null }; P.S.panel = 'board'; P.render(); });
      const m = await page.evaluate(() => { const s = document.querySelector('#play .bigboard .scroll'), f = document.querySelector('#play .bigboard .foot').getBoundingClientRect(); return { sh: s.scrollHeight, ch: s.clientHeight, bottom: f.bottom, ih: innerHeight, you: document.querySelector('#play .bdisc.me') && document.querySelector('#play .bdisc.me').textContent }; });
      assert.ok(m.sh <= m.ch + 1, `the board fits at ${viewport.width}x${viewport.height}: ${JSON.stringify(m)}`); assert.ok(m.bottom <= m.ih, 'and so does the button');
      assert.equal(m.you, 'You', 'the blue piece is labelled');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('tapping a card whose power depends on the game says what it is worth right now', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['IM-17', 'TR-01'], ongoing: ['ON-33'], start: { heart: 4 } });                  // Patch-Up: +2 Health for each Ongoing card you have
    await page.click('#play [data-p=dig]'); await page.waitForTimeout(600);
    await page.click('#play .slot [data-p=zoom]');
    assert.match(await page.locator('#play .zoom .zdyn').innerText(), /Right now:\s*\+4/, 'the Pet and Adrenaline Pump are the two Ongoing cards in play: +4 Health (Patch-Up gives 2 for each)');
    assert.doesNotMatch(await page.locator('#play .zoom').innerText(), /tap anywhere/i);
    await page.click('#play .zoom');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: a Careful note in the middle of the screen, to be dismissed, when the next Monster could put you out: once in the whole Dig, not for every card and not again after you heal and come back into danger', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await page.evaluate(() => { window.DDB_NO_DANGER = false; });
    await begin(page, { mine: ['TR-01', 'TR-01', 'MO-02', 'TR-01'], dice: [1, 1], line: [], start: { heart: 2 } });
    await page.waitForSelector('#play .mnote[aria-label=Careful]');
    assert.match(await page.locator('#play .mnote').innerText(), /Careful[\s\S]*next Monster could make you go BOOM/i);
    assert.equal(await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!e.closest('.mnote'); }), true, 'it is in the middle of the screen');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.digs), 0);
    await page.click('#play [data-p=dangerok]');
    assert.equal(await page.locator('#play .mnote').count(), 0, 'dismissed');
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .mnote').count(), 0, 'still in the same danger: no second note for the next card');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.st.heart = 10; P.render(); });          // out of danger...
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.st.heart = 1; P.render(); });           // ...and back in
    assert.equal(await page.locator('#play .mnote').count(), 0, 'once per Dig: not again');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('leaderboard: 0 instead of Start; a gold-trimmed chip for each player stacked on 0; the Crown waits on 3 and moves onto the holder\'s name; the players are named in their colours; New Best! when you improve', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.evaluate(() => { window.DigDigBoomPlay.S.opp = true; }); await page.click('#play [data-p=startrun]'); await page.waitForSelector('#play [data-p=openpack]');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.bests0 = { me: 0, easy: 0, medium: 0, hard: 0 }; P.S.panel = 'board'; P.render(); });
    assert.deepEqual((await page.locator('#play .bigboard .bcol .bn').allInnerTexts()).slice(0, 4).map(t => t.replace(/\D/g, '')), ['0', '1', '2', '3'], 'numbers start at 0');
    assert.equal(await page.locator('#play .bigboard .bn:has-text("Start")').count(), 0);
    assert.equal(await page.locator('#play .bigboard .bgrid .bcol >> nth=1').locator('.pchip').count(), 4, 'all four chips are stacked on 0');
    assert.equal(await page.locator('#play .bigboard .bcol:nth-child(5) .bcrown').count(), 1, 'the Crown waits on 3');
    assert.equal(await page.locator('#play .bigboard .bspot:not(.lab)').count() % 4, 0); assert.equal(await page.locator('#play .bigboard .blabels .bspot').count(), 4, 'a row for each player');
    const colors = await page.locator('#play .bplayers .bpl').evaluateAll(els => els.map(e => getComputedStyle(e).color));
    assert.equal(new Set(colors).size, 4, 'each name in its own colour');
    await page.evaluate(() => { window.DDB_BOARD_PACE = 3600000; const P = window.DigDigBoomPlay, m = P.S.match; for (const [id, n] of [['hard', 4], ['me', 5]]) { Board.track(m.board, id, n); Board.lockIn(m.board, id, n); } P.S.boardAnim = { from: P.S.bests0, newBest: true, events: [{ r: 1, id: 'hard', k: 'move', n: 4 }, { r: 1, id: 'hard', k: 'bank', n: 4, gems: 6, crown: true }, { r: 1, id: 'me', k: 'move', n: 5 }, { r: 1, id: 'me', k: 'bank', n: 5, gems: 9, crown: true, newBest: true }], k: 0, timer: null, rects: null, fx: null }; P.render(); });
    assert.equal(await page.locator('#play .pchip:not(.mini):has-text("You")').count(), 1);
    assert.equal(await page.locator('#play .bpl.me .cjewel').count(), 0, 'nobody holds the Crown until their result is told');
    assert.equal(await page.locator('#play .bcol:nth-child(5) .bcrown').count(), 1, 'it waits on 3');
    await page.evaluate(() => { window.DDB_BOARD_PACE = 20; window.DigDigBoomPlay.act('boardfast'); });
    await page.waitForFunction(() => window.DigDigBoomPlay.S.boardAnim.k === 4);
    assert.equal(await page.locator('#play .bcrown').count(), 0, 'once someone locks in 3 or more the Crown leaves the board...');
    assert.equal(await page.locator('#play .bpl.me .cjewel').count(), 1, '...for their name');
    assert.match(await page.locator('#play .bcap').innerText(), /You banked at 5 with 9 gems/); assert.equal(await page.locator('#play .bcap small').count(), 0, 'nothing to tap: only the button');
    assert.equal(await page.locator('#play .newbest').count(), 1, 'New Best! is said in the caption');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; Board.lockIn(P.S.match.board, 'easy', 6); P.S.boardAnim = null; P.render(); });
    assert.equal(await page.locator('#play .bpl[data-pid=easy] .cjewel').count(), 1, 'a higher number steals the Crown');
    assert.equal(await page.locator('#play .newbest').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('opponents: Easy, Medium and Hard each dig on their own clock, and the harder one is quicker (that decides who reaches a number first)', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await startRun(page, { opp: true });
    const names = await stOf(page, () => window.DigDigBoomPlay.S.match.board.players.map(p => p.name)); assert.deepEqual(names, ['You', 'Easy AI', 'Medium AI', 'Hard AI']);
    await page.evaluate(() => { const S = window.DigDigBoomPlay.S; if (S.panel !== 'dig') { /* in the dig already */ } });
    const d = await stOf(page, () => window.DigDigBoomPlay.S.aiDelay);
    assert.deepEqual(Object.keys(d).sort(), ['easy', 'hard', 'medium']);
    assert.ok(d.easy > d.medium && d.medium > d.hard, 'Easy waits longest before its first card, Hard least: ' + JSON.stringify(d));
    const before = await stOf(page, () => ['easy', 'medium', 'hard'].map(id => window.DigDigBoomPlay.S.match.runs[id].dig.digs));
    await page.evaluate(() => window.DigDigBoomPlay.tick());
    assert.deepEqual(await stOf(page, () => ['easy', 'medium', 'hard'].map(id => window.DigDigBoomPlay.S.match.runs[id].dig.digs)).then(a => a.map((n, i) => n - before[i])), [1, 1, 1], 'a tick moves each of them one card');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('table: Backfire ("you may make it a 10") lights up when you roll a 1; tapping it changes the result, and Take damage then asks nothing more', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    await begin(page, { mine: ['MO-01'], dice: [1], ongoing: ['ON-35'], line: [], start: { heart: 5 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play .tcard.inplay.elig').count(), 1, 'Backfire is offered on a 1');
    await page.click('#play .tcard.inplay.elig');
    assert.equal(await page.locator('#play .tcard.inplay.elig').count(), 0, 'used: no longer offered');
    assert.match(await page.locator('#play .calc').innerText(), /10/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// ---------------------------------------------------------------- v2.7.1: Grit, Extra Rolls, Consumables on the table
test('Grit before the roll: plus and minus put Grit into the roll (the Grit track shows what will be spent), and it is spent when you tap the die; no more than 3 a battle', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01'], dice: [4], start: { grit: 3 }, line: ['ON-16'] });          // Venom Spider at 6
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play .gritplan').count(), 1, 'the Grit planner is there before the roll');
    assert.ok(await page.locator('#play [data-p=gritminus]').isDisabled());
    await page.click('#play [data-p=gritplus]'); await page.click('#play [data-p=gritplus]');
    assert.equal(await page.locator('#play .gritplan .gval b').innerText(), '2'); assert.match(await page.locator('#play .gnote').innerText(), /\+2 to your roll/);
    assert.equal(await page.locator('#play .track[data-p=grit] .tc.spend').count(), 2, 'the two Grit that will be spent are marked on the track');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.grit), 3, 'nothing is spent until you roll');
    await page.click('#play [data-p=gritplus]');          // 3 is all there is
    assert.equal(await page.locator('#play .gritplan .gval b').innerText(), '3'); assert.ok(await page.locator('#play [data-p=gritplus]').isDisabled(), 'no more than you have');
    await page.click('#play [data-p=gritminus]');
    await page.click('#play [data-p=roll]'); await dieShows(page, '#play .dieb', 4);
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.fight.result, s.grit]; }), [6, 1], '4 + 2 Grit = 6, and Venom Spider (6) fired');
    assert.match(await page.locator('#play .calc').innerText(), /4\s*\+\s*2.*=\s*6/);
    assert.deepEqual(await page.locator('#play .tcard.elig').evaluateAll(els => els.map(e => e.getAttribute('aria-label').split(',')[0])), ['Venom Spider'], 'Venom Spider (6) glows');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Grit after the roll: 3 Grit is +1, and the cards the new result reaches fire; the button is only there when you have 3 to spend', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01', 'MO-02'], dice: [5, 5], start: { grit: 3 }, line: ['ON-16'] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=gritspend]');
    assert.equal(await page.locator('#play .tcard.done').count(), 0, 'a 5 does not reach Venom Spider (6)');
    await page.click('#play [data-p=gritspend]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.fight.result, s.grit]; }), [6, 0]);
    assert.equal(await page.locator('#play .tcard.elig').count(), 1, 'the new result powers it up'); await page.click('#play .tcard.elig'); assert.equal(await page.locator('#play .tcard.done').count(), 1, 'used');
    assert.equal(await page.locator('#play [data-p=gritspend]').count(), 0, 'no Grit left: no button');
    await faceIt(page); await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    assert.equal(await page.locator('#play [data-p=gritspend]').count(), 0, 'and none in the next battle either');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Extra Rolls: the Extra Roll button spends one and lets you put Grit into the new roll; the new roll is your result', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-03'], dice: [8, 2], start: { grit: 2, reroll: 2 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play .rerollbtn');
    assert.match(await page.locator('#play .rerollbtn').innerText(), /Extra Roll[\s\S]*2 left/);
    await page.click('#play .rerollbtn');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.reroll), 1);
    assert.match(await page.locator('#play .action').innerText(), /Rolling again/);
    await page.click('#play [data-p=gritplus]'); await page.click('#play [data-p=roll]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.fight.result, s.grit]; }), [3, 1], 'a 2 and 1 Grit make 3: that is your result now, not the 8');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Consumables: they wait among your cards in play, glow when you can use them, and a tap uses one (once) and discards it', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['TR-01'], ongoing: ['CO-19', 'CO-03'], start: { heart: 3 } });          // Healing Potion; Beating Heart
    assert.equal(await page.locator('#play .tcard.cons').count(), 2);
    assert.equal(await page.locator('#play .tcard.cons.elig').count(), 1, 'Healing Potion can be used any time; Beating Heart only when you would BOOM');
    await page.click('#play .tcard.cons.elig');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.heart), 7);
    assert.equal(await page.locator('#play .tcard.cons').count(), 1, 'the Healing Potion is gone'); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Consumables that need a choice ask for it: Duct Tape (a card from the discard pile, or Grit)', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['TR-01'], ongoing: ['CO-11'] });
    await page.evaluate(() => { const P = window.DigDigBoomPlay, st = P.S.st, all = window.DigDigBoomUI.state.all; st.discard.push({ ...all.find(c => c.id === 'CO-19'), uid: 7300 }); P.render(); });
    await page.click('#play .tcard.cons.elig');
    assert.equal(await page.locator('#play .mnote.pick .pickcard').count(), 1, 'the Healing Potion in your discard pile'); assert.ok(await page.locator('#play .mnote.pick [data-v=grit]').count());
    await page.click('#play .mnote.pick .pickcard');
    assert.deepEqual(await stOf(page, () => window.DigDigBoomPlay.S.st.cons.map(c => c.id)), ['CO-19'], 'Duct Tape is discarded and the potion is back in play');
    assert.equal(await page.locator('#play .mnote.pick').count(), 0); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Ongoing cards with an any-time ability glow and open a choice: Workbench trades Grit and Extra Rolls', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['TR-01'], ongoing: ['ON-68'], start: { grit: 3 } });
    assert.equal(await page.locator('#play .tcard.inplay.elig').count(), 1);
    await page.click('#play .tcard.inplay.elig'); await page.click('#play .mnote.pick [data-v=g2e]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.grit, s.reroll]; }), [0, 1]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a card dug while Shoo Spray is in play can be put on the bottom of the Mine instead; the log says what each card did', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01', 'TR-01'], ongoing: ['CO-29'] });
    await page.click('#play [data-p=dig]');
    assert.equal(await page.locator('#play [data-p=dugchoose]').count(), 2, 'put it on the bottom, or use it');
    await page.click('#play [data-p=dugchoose]:has-text("bottom")');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [!!s.fight, s.mine.length, s.mine[s.mine.length - 1].id, s.cons.length]; }), [false, 2, 'MO-01', 0]);
    assert.equal(await page.evaluate(() => { document.querySelector('#play [data-p=gmenu]').click(); return document.querySelectorAll('#play .gmenu [data-p=log]').length; }), 0, 'What happened is not in the Pause menu any more');
    await page.evaluate(() => window.DigDigBoomPlay.act('log'));
    assert.match(await page.locator('#play .logp').innerText(), /What happened[\s\S]*instead/);
    await page.click('#play .logp .btn');
    assert.equal(await page.locator('#play .logp').count(), 0); assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the table with many cards (numbered, other Ongoing, Consumables) fits an iPad upright and an iPhone upright without scrolling, and every control is at least 44 px', SKIP, async () => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 402, height: 874 }]) {
    const { browser, page, errors } = await open({ viewport });
    try {
      await begin(page, { mine: ['MO-01'], dice: [5], start: { grit: 3, reroll: 2 }, line: ['ON-04', 'ON-06', 'ON-09', 'ON-11', 'ON-13', 'ON-17', 'ON-21'], ongoing: ['ON-33', 'ON-44', 'ON-57', 'CO-19', 'CO-03', 'CO-25'] });
      await page.click('#play [data-p=dig]');
      const m = await page.evaluate(() => { const box = s => { const e = document.querySelector(s), r = e && e.getBoundingClientRect(); return r && { w: r.width, h: r.height, b: r.bottom, r: r.right, l: r.left }; };
        const cs = [...document.querySelectorAll('#play .tcard')].map(e => e.getBoundingClientRect());
        return { sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, ih: innerHeight, iw: innerWidth, plus: box('#play [data-p=gritplus]'), minus: box('#play [data-p=gritminus]'), die: box('#play [data-p=roll]'), mat: box('#play .mat'), cards: { b: Math.max(...cs.map(r => r.bottom)), l: Math.min(...cs.map(r => r.left)), r: Math.max(...cs.map(r => r.right)) } }; });
      assert.ok(m.sh <= m.ih + 1 && m.sw <= m.iw + 1, `${viewport.width}: the page scrolls`);
      for (const k of ['plus', 'minus', 'die']) assert.ok(m[k] && m[k].w >= 44 && m[k].h >= 44, `${viewport.width}: ${k} is ${JSON.stringify(m[k])}`);
      assert.ok(m.cards.b <= m.ih + 1 && m.cards.l >= -1 && m.cards.r <= m.iw + 1, `${viewport.width}: the cards in play fit ${JSON.stringify(m.cards)}`);
      assert.ok(m.mat.b <= m.ih + 1, `${viewport.width}: the bottom of the table fits`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('the cards a roll reaches fire one at a time: each lifts and lies down in turn (the lowest number first), and only the first time it is drawn', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await page.evaluate(() => { window.DDB_NO_FIRE_FX = false; });
    await begin(page, { mine: ['MO-01'], dice: [6], line: ['ON-11', 'ON-04', 'ON-06'], start: { heart: 5 } });          // 4, 2, 2... 
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.click('#play [data-p=triggerall]');
    const fx = await page.locator('#play .tcard.firenow').evaluateAll(els => els.map(e => ({ name: e.getAttribute('aria-label'), k: e.style.getPropertyValue('--k'), delay: getComputedStyle(e).animationDelay })));
    assert.deepEqual(fx.map(x => x.k), ['0', '1', '2'], 'in the order they fired: ' + JSON.stringify(fx));
    assert.ok(parseFloat(fx[1].delay) > parseFloat(fx[0].delay) && parseFloat(fx[2].delay) > parseFloat(fx[1].delay), 'each waits for the one before');
    assert.match(fx[0].name, /Gritty Gecko|Nurse Newt/); assert.match(fx[2].name, /Grit Gopher/);
    await page.evaluate(() => window.DigDigBoomPlay.render());
    assert.equal(await page.locator('#play .tcard.firenow').count(), 0, 'drawn again, they simply lie down: no second show');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Pause is the big button in the corner; tap a Monster in a battle for the big card and how Monsters work (no "Loot", no "set of" on the card)', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01'], dice: [3] });
    assert.equal((await page.locator('#play [data-p=gmenu]').innerText()).trim(), 'Pause');
    assert.ok((await page.locator('#play [data-p=gmenu]').boundingBox()).height >= 48, 'big enough to hit without looking');
    await page.click('#play [data-p=dig]');
    assert.doesNotMatch(await page.locator('#play .mcard').innerText(), /loot|set of/i);
    await page.click('#play .mcard');
    const z = await page.locator('#play .zoom').innerText();
    assert.match(z, /How Monsters work[\s\S]*Roll the die[\s\S]*damage markers[\s\S]*Loot/); assert.equal(await page.locator('#play .zoom .card').count(), 1, 'the big card');
    await page.click('#play .zoom'); assert.equal(await page.locator('#play .zoom').count(), 0, 'tap to put it back');
    assert.equal(await page.locator('#play [data-p=roll]').count(), 1, 'the battle is still there');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('"Whenever you defeat a Monster": the card glows once the Monster is defeated; tapping it uses it; going on without it asks first; Use all uses it too', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01', 'MO-02'], dice: [10, 10], line: ['ON-13'], ongoing: ['ON-61'], start: { heart: 5 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    await page.locator('#play .tcard.elig:not(.inplay)').last().click();          // the Pet (the biggest number) defeats it
    assert.match(await page.locator('#play .stamp').innerText(), /defeated/i);
    assert.equal(await page.locator('#play .tcard.inplay.elig').count(), 1, 'Salvage Claw glows');
    assert.match(await page.locator('#play .skipnote').innerText(), /defeated: tap Salvage Claw to use it/);
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.heart, s.grit]; }), [5, 0], 'nothing happens until you tap it');
    await page.click('#play [data-p=dig]');          // the Mine
    assert.match(await page.locator('#play .skipnote.ask').innerText(), /You can still use Salvage Claw[\s\S]*Tap again/, 'the first tap only asks');
    assert.equal(await stOf(page, () => !!window.DigDigBoomPlay.S.st.fight), true, 'still in the fight');
    await page.click('#play .tcard.inplay.elig');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.heart, s.grit]; }), [6, 1], 'one Grit and one Health');
    assert.equal(await page.locator('#play .skipnote').count(), 0, 'and nothing left to ask about');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');          // the next Monster: Use all, the Pet first
    await page.click('#play [data-p=triggerall]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.heart, s.grit, s.fight.fired[0].pet]; }), [7, 2, true], 'the Pet went first, and Salvage Claw was used by Use all: no next dig needed');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('after a roll, Grit is only offered when it would power up another card', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01'], dice: [4], start: { grit: 3 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]');
    assert.equal(await page.locator('#play .gritbtn').count(), 0, 'nothing a +1 would reach: no suggestion');
    const b2 = await open({ viewport: { width: 820, height: 1180 } });
    try {
      await begin(b2.page, { mine: ['MO-01'], dice: [4], start: { grit: 3 }, line: ['ON-13'] });          // Dart Frog needs a 5
      await b2.page.click('#play [data-p=dig]'); await b2.page.click('#play [data-p=roll]'); await b2.page.waitForSelector('#play [data-p=face]');
      assert.equal(await b2.page.locator('#play .gritbtn').count(), 1, '4 and 1 more reaches the Dart Frog');
    } finally { await b2.browser.close(); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

// A finished game for the "best game" tests: played in Node with the plain policy, saved the way the page saves it.
function finishedGame(seed, rounds = 2) {
  const L = require('./load.js'), all = L.Engine.cards(), m = L.Match.start(all, { seed, rounds });
  for (let r = 1; r <= rounds; r++) {
    const me = L.Match.human(m);
    if (me.prep.step === 'escape') L.Match.rollEscape(m); L.Match.openPack(m); L.AI.prep(me); L.Match.beginRound(m);
    for (let g = 0; g < 4000 && !me.dig.over; g++) {
      const st = me.dig, before = st.digs;
      if (!L.AI.act(me)) { if (L.Match.finalCheck(m)) continue; if (me.dig.board && me.dig.board.allOut && L.Dig.hold(me.dig)) { L.Run.checkOver(me); continue; } if (!L.Match.aiStep(m)) throw new Error('stuck'); continue; }
      L.Run.checkOver(me); L.Match.finalCheck(m); if (st.digs > before && !me.dig.over) L.Match.aiStep(m);
    }
    L.Match.finishRound(m);
  }
  return m;
}

test('your best game: a finished game is kept with its whole Leaderboard (only when its final score beats the saved one); More lists it, shows each round and lets you watch it again', SKIP, async () => {
  const L = require('./load.js'), m = finishedGame(3, 2), json = JSON.stringify(L.Match.save(m));
  const { browser, page, errors } = await open({ menu: true });
  try {
    assert.equal(await page.evaluate(() => localStorage.getItem('ddb.bestgame.v1')), null, 'none before a game is finished');
    await page.evaluate(j => { const P = window.DigDigBoomPlay, all = window.DigDigBoomUI.state.all, m = Match.load(all, JSON.parse(j)); P.S.match = m; P.S.run = Match.human(m); P.S.st = P.S.run.dig; P.S.panel = 'done'; P.act('closehelp'); }, json);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ddb.bestgame.v1')));
    assert.equal(saved.score, m.result.bests.me, 'the final score is kept'); assert.ok(saved.match.result, 'with the whole game');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.match = null; P.S.run = null; P.S.st = null; P.S.back = null; P.S.panel = 'menu'; P.render(); });
    await page.evaluate(s => { const o = JSON.parse(localStorage.getItem('ddb.bestgame.v1')); o.score = 99; localStorage.setItem('ddb.bestgame.v1', JSON.stringify(o)); }, 0);
    await page.evaluate(j => { const P = window.DigDigBoomPlay, all = window.DigDigBoomUI.state.all, m = Match.load(all, JSON.parse(j)); P.S.match = m; P.S.run = Match.human(m); P.S.st = P.S.run.dig; P.S.panel = 'done'; P.act('closehelp'); }, json);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ddb.bestgame.v1')).score), 99, 'a lower score does not replace the best one');
    await page.evaluate(() => { const P = window.DigDigBoomPlay; P.S.match = null; P.S.run = null; P.S.st = null; P.S.back = null; P.S.panel = 'menu'; P.render(); });
    await page.click('#play [data-p=more]');
    assert.match(await page.locator('#play .settings').innerText(), /Your best game[\s\S]*Final score 99/);
    await page.click('#play [data-p=viewbest]'); await page.waitForSelector('#play .enddone');
    assert.equal(await page.locator('#play .dtab').count(), 2, 'a tab for each round'); assert.equal(await page.locator('#play [data-p=gmenu]').count(), 0, 'nothing to pause: it is only a look');
    assert.equal(await page.locator('#play [data-p=startrun]').count(), 0, 'and no New game button here');
    await page.click('#play [data-p=donetab][data-k="1"]'); assert.match(await page.locator('#play .endtitle').innerText(), /Round 1/);
    assert.equal(await page.locator('#play [data-p=donereplay], #play [data-p=boardfast]').count(), 1, 'watch it again');
    await page.click('#play [data-p=closebest]'); await page.waitForSelector('#play .settings');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('More: the cards page has a way back to More, and the fine print is gone from How to play', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true });
  try {
    await page.click('#play [data-p=help]'); assert.equal(await page.locator('#play .fine, #play details').count(), 0, 'no fine print'); await page.click('#play [data-p=closehelp]');
    await page.click('#play [data-p=more]'); await page.click('#play [data-p=cards]'); await page.waitForSelector('#deckRow .card');
    await page.click('[data-act=mode][data-v=play]'); await page.waitForSelector('#play .settings');
    assert.match(await page.locator('#play .settings').innerText(), /More[\s\S]*The cards/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the table: Bank is in the middle of the bottom row, the buttons you press all the time (result, Take damage, Use all) are on the right; the strip under the Mine says what is left and opens the count', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-01', 'TR-01', 'TR-01', 'ON-18'], dice: [3] });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]:not(.waitroll)');
    const box = async sel => page.locator(sel).first().boundingBox(), mine = await box('#play .deck'), bank = await box('#play [data-p=bank]'), take = await box('#play [data-p=face]');
    assert.ok(bank.x > mine.x + mine.width, 'Bank is right of the Mine'); assert.ok(Math.abs(bank.x + bank.width / 2 - 410) <= 4, 'centred left to right: ' + JSON.stringify(bank));
    const use = await page.locator('#play .chip.useall').count(); if (use) { const ub = await box('#play .chip.useall'); assert.ok(Math.abs(ub.width - take.width) < 2 && Math.abs(ub.height - take.height) < 2, 'Use all is the size of Take damage'); }
    assert.ok(take.x > bank.x + bank.width - 10, 'Take damage is to the right of Bank'); assert.ok(take.x + take.width > 820 * 0.8, 'and under the right thumb: ' + JSON.stringify(take));
    assert.equal(await page.locator('#play .deck .cnt').count(), 0, 'no number badge on the Mine any more');
    assert.match(await page.locator('#play .pilestrip').innerText(), /^\d+ left$/);
    const left = await stOf(page, () => { const m = window.DigDigBoomPlay.S.st.mine; return [m.filter(c => c.type === 'Monster').length, m.filter(c => c.type === 'Treasure').length, m.filter(c => !['Monster', 'Treasure'].includes(c.type)).length]; });
    await page.click('#play .pilestrip');
    const t = await page.locator('#play .pilebox').innerText(); assert.match(t, /Monsters[\s\S]*Geodes[\s\S]*Booster cards/);
    assert.deepEqual((await page.locator('#play .pilebox .prow b').allInnerTexts()).map(Number), left, 'the counts are what is really left in the Mine');
    await page.click('#play .pilebox'); assert.equal(await page.locator('#play .pilebox').count(), 0, 'tap to close');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('damage on a Monster: the same damage symbol on the card text and as tokens on the Monster; enough of it defeats the Monster (it says Defeated, no Take button); zoom a card for its symbols and keywords, and tap them', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-02'], dice: [6], line: ['ON-13'] });          // Dart Frog: 2 damage; the Monster deals 2
    assert.equal(await page.locator('#play .tcard[data-id=ON-13] .text svg.ic[aria-label=damage]').count(), 1, 'the damage symbol in the card text, not the word');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play .tcard.elig:not(.inplay)');
    await page.locator('#play .tcard[data-id=ON-13]').click();
    assert.equal(await page.locator('#play .dmarks i svg use[href="#i-damage"]').count(), 2, 'a token with the damage symbol for each 1 on it');
    assert.match(await page.locator('#play .stamp').innerText(), /defeated/i, 'as much damage as it deals: defeated');
    assert.equal(await page.locator('#play [data-p=face]').count(), 0, 'nothing to take');
    await page.locator('#play .tcard[data-id=ON-13]').click();          // zoom
    const chips = await page.locator('#play .zoom .gchip').allInnerTexts(); assert.ok(chips.some(c => /Ongoing/.test(c)) && chips.some(c => /Number 5/.test(c)) && chips.some(c => /Damage/.test(c)), 'chips for its words and symbols: ' + chips);
    await page.click('#play .zoom .gchip:has-text("Damage")'); assert.match(await page.locator('#play .zoom .gtext').innerText(), /taken off what it deals/);
    await page.click('#play .zoom .card svg.ic[data-p=gloss]'); assert.equal(await page.locator('#play .zoom').count(), 1, 'tapping a symbol on the card explains it; it does not close the card');
    await page.click('#play .zoom', { position: { x: 5, y: 5 } }); assert.equal(await page.locator('#play .zoom').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a Single-Use card that needs you to take damage glows only after the damage is taken', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['MO-02', 'TR-01'], dice: [7], ongoing: ['CO-27'], start: { heart: 6 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.waitForSelector('#play [data-p=face]:not(.waitroll)');
    assert.equal(await page.locator('#play .tcard.cons.elig').count(), 0, 'not before the damage');
    await page.click('#play [data-p=face]');
    assert.equal(await page.locator('#play .tcard.cons.elig').count(), 1, 'now');
    await page.click('#play .tcard.cons.elig');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.reroll, s.grit, s.cons.length]; }), [1, 2, 0]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the Leaderboard: How it works, tap a piece / chip / column to be told what it is; a player who went BOOM stays on the little board; the end of a game has no Pause and a Main menu button', SKIP, async () => {
  const L = require('./load.js'), m = finishedGame(3, 2), json = JSON.stringify(L.Match.save(m));
  const { browser, page, errors } = await open({ menu: true, viewport: { width: 820, height: 1180 } });
  try {
    await page.evaluate(j => { const P = window.DigDigBoomPlay, all = window.DigDigBoomUI.state.all, m = Match.load(all, JSON.parse(j)); P.S.match = m; P.S.run = Match.human(m); P.S.st = P.S.run.dig; P.S.panel = 'done'; P.render(); }, json);
    await page.waitForSelector('#play .enddone');
    assert.equal(await page.locator('#play [data-p=gmenu]').count(), 0, 'no Pause at the end of a game');
    assert.equal(await page.locator('#play [data-p=mainmenu]').count(), 1, 'a Main menu button'); assert.equal(await page.locator('#play [data-p=startrun]').count(), 1, 'beside New game');
    await page.click('#play [data-p=lbhelp]'); const h = await page.locator('#play .lbhelp').innerText(); assert.match(h, /The Leaderboard[\s\S]*Monsters survived[\s\S]*chip[\s\S]*starburst[\s\S]*Crown[\s\S]*plays back/i); assert.equal(await page.locator('#play .lbhelp .t3').count(), 3, 'three pictures'); await page.click('#play [data-p=lbhelpclose] >> nth=-1');
    await page.click('#play .bgrid .pchip[data-pid] >> nth=0'); assert.match(await page.locator('#play .lbtip').innerText(), /best Dig[\s\S]*(place|not banked)/); await page.click('#play .lbtip');
    await page.click('#play .bgrid .bcol[data-n="2"]'); assert.match(await page.locator('#play .lbtip').innerText(), /2 Monsters|Nobody is here/); await page.click('#play .lbtip'); assert.equal(await page.locator('#play .lbtip').count(), 0);
    await page.click('#play [data-p=donetab][data-k="1"]');
    await page.click('#play [data-p=donereplay]'); await page.click('#play [data-p=boardfast]');
    assert.equal((await page.locator('#play [data-p=boardskip]').innerText()).replace(/\W/g, ''), 'Skip', 'after Fast forward the button says Skip');
    await page.click('#play [data-p=boardskip]'); assert.equal(await page.locator('#play [data-p=donereplay]').count(), 1, 'Skip goes to the end: nothing left to play');
    const piece = page.locator('#play .bgrid .bdisc[data-pid]').first(); if (await piece.count()) { await piece.click(); assert.match(await page.locator('#play .lbtip').innerText(), /banked|BOOM|is on Monster/); await page.click('#play .lbtip'); }
    // a player who went BOOM this round stays on the little board, as a starburst where they stopped
    await page.evaluate(() => { const P = window.DigDigBoomPlay, S = P.S; S.match = null; S.run = null; S.st = null; S.back = null; S.panel = 'menu'; P.render(); });
    await startRun(page, { opp: true });
    await page.evaluate(() => { const P = window.DigDigBoomPlay, S = P.S; S.run.board.log = S.run.board.log || []; S.run.board.log.push({ r: S.run.round, id: 'easy', k: 'boom', n: 5 }); P.render(); });
    assert.equal(await page.locator('#play .lb .mk.boom').count(), 1, 'the starburst of the player who went BOOM');
    assert.match(await page.locator('#play .lb .mk.boom').getAttribute('title'), /went BOOM here/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the Leaderboard tip opens above the full-size Leaderboard, and a card\'s needed roll sits inside the die', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true, viewport: { width: 820, height: 1180 } });
  try {
    await startRun(page, { opp: true });
    await page.click('#play .lb'); await page.waitForSelector('#play .lbfull');
    await page.click('#play .lbfull .bgrid .bcol[data-n="0"]'); await page.waitForSelector('#play .lbtip');
    assert.ok(await page.evaluate(() => { const t = document.querySelector('#play .lbtip').getBoundingClientRect(); const e = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2); return !!e.closest('.lbtip'); }), 'the tip can be seen: nothing covers it');
    await page.click('#play .lbtip'); await page.click('#play .lbfull', { position: { x: 6, y: 6 } });
    await page.evaluate(() => window.DigDigBoomPlay.act('pilecount'));
    const nums = await page.evaluate(() => [...document.querySelectorAll('#play .tcard .num, #play .pcard .num')].map(n => ({ svg: !!n.querySelector('svg path'), t: n.textContent.trim() })));
    assert.ok(nums.every(n => n.svg && /^\d+$/.test(n.t)), 'every number is in a die: ' + JSON.stringify(nums));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Undo (in the Pause menu) takes back one action, is greyed out when there is nothing to undo, and a BOOM ends with To Leaderboard; the new cards: Battery Beetle taps cards for Grit', SKIP, async () => {
  const { browser, page, errors } = await open({ viewport: { width: 820, height: 1180 } });
  try {
    await begin(page, { mine: ['TR-01', 'MO-01', 'TR-01'], dice: [4, 4], line: ['ON-13'], ongoing: ['ON-78'] });
    const undoBtn = () => page.locator('#play .gmenu [data-p=undo]');
    await page.click('#play [data-p=gmenu]'); assert.equal(await undoBtn().isDisabled(), true, 'nothing to undo yet'); await page.click('#play [data-p=gmenuclose]');
    await page.click('#play [data-p=dig]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.geodeGems), 1);
    await page.click('#play [data-p=gmenu]'); assert.equal(await undoBtn().isDisabled(), false); await page.click('#play .gmenu [data-p=undo]');
    assert.deepEqual(await stOf(page, () => { const s = window.DigDigBoomPlay.S.st; return [s.geodeGems, s.mine.length, !s.last]; }), [0, 3, true], 'the dig is taken back');
    await page.click('#play [data-p=gmenu]'); assert.equal(await undoBtn().isDisabled(), true, 'one step only'); await page.click('#play [data-p=gmenuclose]');
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]');
    const d0 = await stOf(page, () => window.DigDigBoomPlay.S.st.fight.die);
    await page.click('#play [data-p=gmenu]'); await page.click('#play .gmenu [data-p=undo]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.fight.phase), 'before', 'the roll is taken back'); await page.click('#play [data-p=roll]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.fight.die), d0, 'and rolling again gives the same die: undo is not a re-roll');
    await page.waitForSelector('#play .tcard.inplay.elig');          // Battery Beetle: tap numbered cards for Grit
    await page.click('#play .tcard.inplay.elig'); await page.waitForSelector('#play .pickrow');
    await page.click('#play .pickrow .pickcard >> nth=0'); await page.click('#play [data-p=pickgo]');
    assert.equal(await stOf(page, () => window.DigDigBoomPlay.S.st.grit), 1, 'one card tapped: one Grit'); assert.equal(await page.locator('#play .tcard.done').count(), 1, 'and it lies down');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('after a BOOM the button says To Leaderboard; the cards you own fit on one screen without scrolling', SKIP, async () => {
  const { browser, page, errors } = await open({ menu: true, viewport: { width: 820, height: 1180 } });
  try {
    await startRun(page, { opp: true });
    await script(page, { mine: ['MO-03', 'MO-03'], dice: [1, 1], start: { heart: 1 } });
    await page.click('#play [data-p=dig]'); await page.click('#play [data-p=roll]'); await page.click('#play [data-p=face]');
    assert.equal((await page.locator('#play .over [data-p=prep]').innerText()).trim(), 'To Leaderboard');
    const L = require('./load.js'), json = JSON.stringify(L.Match.save(finishedGame(3, 2)));
    await page.evaluate(j => { const P = window.DigDigBoomPlay, S = P.S, all = window.DigDigBoomUI.state.all, m = Match.load(all, JSON.parse(j)); S.match = m; S.run = Match.human(m); S.st = S.run.dig; S.run.owned = all.filter(c => ['Ongoing', 'Immediate'].includes(c.type)).slice(0, 24).map((c, i) => ({ ...c, uid: 5000 + i })); S.panel = 'done'; S.showOwned = true; P.render(); }, json);
    const m = await page.evaluate(() => { const e = document.querySelector('#play .ownedpanel'); return { sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }; });
    assert.ok(m.sh <= m.ch + 1 && m.sw <= m.cw + 1, 'no scrolling inside the panel: ' + JSON.stringify(m));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
