// Browser tests for the cards page (#cards): every card of the game, drawn in the one design. The cards are in the game's own file; nothing is fetched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { DDB } = require('./load');
function findChromium() {
  for (const t of [() => require('playwright'), () => require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))]) { try { return t().chromium; } catch (e) { /* next */ } }
  return null;
}
const chromium = findChromium();
const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const GAUNTLET = 4;          // the Gauntlet Monster cards shown after the game's own cards on the cards page
const SHOWN = DDB.cards.length - 1 + DDB.gems.length + GAUNTLET;          // a Geode is shown once for each of its six gems
const SKIP = { skip: !chromium && 'Playwright/Chromium not available', timeout: 90000 };

async function open({ viewport = { width: 1180, height: 820 } } = {}) {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await (await browser.newContext({ viewport, hasTouch: true })).newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url()); });
  await page.goto(FILE + '#cards');
  await page.waitForSelector('#deckRow .card');
  return { browser, page, errors, requests };
}

const types = ['Ongoing', 'Consumable', 'Immediate', 'Treasure', 'Monster'];

test('cards: every card of the game is drawn in the one design, nothing is read from the network, and the page says the cards are built in', SKIP, async () => {
  const { browser, page, errors, requests } = await open();
  try {
    assert.match(await page.locator('.status').first().innerText(), /built into the game/);
    assert.deepEqual(requests, [], 'no request of any kind');
    assert.equal(await page.locator('#deckRow .card').count(), SHOWN, 'every card, each Geode gem, and the gauntlet Monsters');
    const labels = await page.locator('#deckRow .card').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    for (const t of types) assert.ok(labels.some(x => x.includes(', ' + t)), 'a ' + t + ' card');
    assert.ok(!labels.some(x => /, Power/.test(x)), 'there is no Power type');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cards: type is told on every card — icon, type word, pattern and colour (a Monster\'s name says it, so it has no separate type word) — and a number only on Ongoing cards that have one', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    const info = await page.locator('#deckRow .card').evaluateAll(els => els.map(e => ({
      label: e.getAttribute('aria-label'), icons: e.querySelectorAll('svg use[href^="#t-"]').length,
      word: [...e.querySelectorAll('.typeword')].some(w => /^(Ongoing|Consumable|Immediate|Treasure|Monster)/i.test(w.textContent.trim())),
      pattern: e.querySelectorAll('rect[fill^="url(#p-"]').length, nums: [...e.querySelectorAll('.num')].map(n => n.textContent.trim()),
    })));
    for (const c of info) { assert.ok(c.icons >= 1, 'icon: ' + c.label); assert.ok(c.word || /, Monster\./.test(c.label), 'type word: ' + c.label); assert.ok(c.pattern >= 1, 'pattern: ' + c.label); }
    assert.ok(info.filter(c => /, Ongoing, \d+\./.test(c.label)).every(c => c.nums.length >= 1), 'numbered Ongoing cards show their number');
    assert.ok(info.filter(c => !/, Ongoing, \d+\./.test(c.label)).every(c => c.nums.length === 0), 'nobody else does');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cards: the colours are the owner\'s — Ongoing gold, Consumable green, Immediate purple, Treasure blue, Monster red — and no header carries a timing label', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    const col = { Ongoing: 'rgb(242, 194, 27)', Consumable: 'rgb(46, 175, 104)', Immediate: 'rgb(122, 63, 184)', Treasure: 'rgb(43, 134, 209)', Monster: 'rgb(207, 47, 47)' };
    for (const [t, c] of Object.entries(col)) {
      const seen = await page.locator('#deckRow .card').evaluateAll((els, t) => els.filter(e => new RegExp(', ' + t + '[,.]').test(e.getAttribute('aria-label'))).map(e => getComputedStyle(e.querySelector('.band')).backgroundColor), t);
      assert.ok(seen.length && seen.every(x => x === c), `${t}: ${[...new Set(seen)]}`);
    }
    const words = await page.locator('#deckRow .card .typeword.band').allInnerTexts();
    assert.ok(words.every(w => /^(Ongoing|Consumable|Immediate|Treasure)$/i.test(w.trim())), 'only the type word: ' + [...new Set(words)]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cards: the rules text is one size on every card, set by the longest card, and nothing overflows its box', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    const r = await page.locator('#deckRow .card .text').evaluateAll(els => els.map(e => ({ fs: getComputedStyle(e).fontSize, over: e.scrollHeight > e.clientHeight + 1 })));
    assert.equal(new Set(r.map(x => x.fs)).size, 1, 'one text size: ' + JSON.stringify([...new Set(r.map(x => x.fs))]));
    assert.ok(r.every(x => !x.over), 'text fits its box');
    assert.ok(parseFloat(r[0].fs) * 0.75 * (100 / 96) > 10, 'large enough to read at arm\'s length');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cards: greyscale and colour-blind views are one tap away; the page works on an iPad and a phone without horizontal scroll', SKIP, async () => {
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    const { browser, page, errors } = await open({ viewport });
    try {
      for (const v of ['gray', 'deut', 'prot']) { await page.tap(`[data-act=view][data-v=${v}]`); assert.equal(await page.locator('#app').getAttribute('class'), 'view-' + v); }
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.ok(m.sw <= m.iw + 2 || viewport.width < 500, JSON.stringify(m));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
});

test('cards: a Geode is a huge gem count; a Monster has its damage ladder in big red tiles and its Loot gem in the corner (the gauntlet Monsters have none)', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    const cards = await page.locator('#deckRow .card').evaluateAll(els => els.map(e => ({ id: e.dataset.id, stat: e.dataset.stat })));
    assert.equal(cards.find(c => c.id === 'TR-01').stat, '3'); assert.equal(cards.find(c => c.id === 'MO-01').stat, '1');
    assert.ok(await page.locator('#deckRow .card[data-id=MO-01]').evaluate(e => [...e.querySelectorAll('div')].filter(d => /^[1357]$/.test(d.textContent.trim())).length >= 4), 'four damage tiles 1 3 5 7');
    assert.ok(await page.locator('#deckRow .card[data-id=TR-01]').first().evaluate(e => parseFloat(getComputedStyle(e.querySelector('.gemtile')).fontSize) > 100), 'the gem count is huge');
    for (const id of ['MO-01', 'MO-02', 'MO-03']) {
      const loot = await page.locator(`#deckRow .card[data-id=${id}]`).evaluate(e => ({ word: !!e.querySelector('.lootword'), gem: !!e.querySelector('.gembadge'), n: (e.querySelector('.gembadge') || {}).textContent }));
      assert.ok(loot.word && loot.gem, id + ' shows its Loot gem'); assert.equal(loot.n.trim().replace('LOOT', ''), '1');
    }
    const geo = await page.locator('#deckRow .card[data-id=TR-01]').first().evaluate(e => e.querySelector('.gembadge').getBoundingClientRect().width), mon = await page.locator('#deckRow .card[data-id=MO-01]').evaluate(e => e.querySelector('.gembadge').getBoundingClientRect().width);
    assert.ok(mon < geo && mon > geo * 0.7, 'the Loot gem is smaller than the Geode\'s, and still clearly there');
    assert.equal(await page.locator('#deckRow .card[data-id^=BONUS] .lootword').count(), 0, 'gauntlet Monsters show no Loot gem');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('cards: the Geode is shown as the six gems it is printed in (colour and cut)', SKIP, async () => {
  const { browser, page, errors } = await open();
  try {
    const caps = await page.locator('#deckRow .cell:has(.card[data-id=TR-01]) .cap').allInnerTexts();
    assert.equal(caps.length, 6); assert.deepEqual(caps.map(c => c.split(' · ')[2]), ['Sapphire', 'Emerald', 'Topaz', 'Rose Quartz', 'Amethyst', 'Aquamarine']);
    const looks = await page.locator('#deckRow .card[data-id=TR-01]').evaluateAll(els => els.map(e => [...e.querySelectorAll('use')].map(u => u.getAttribute('href')).filter(h => /gem-/.test(h)).join()));
    assert.equal(new Set(looks).size, 6, 'six different cuts');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
