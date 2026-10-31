// The Tabletop Library: catalogue integrity (Node) and tapping through to a game and back (browser, skipped without Playwright).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const LIBRARY = vm.runInNewContext(html.match(/<script id="data">([\s\S]*?)<\/script>/)[1] + ';LIBRARY');
const gameDirs = fs.readdirSync(path.join(root, 'games')).filter(d => fs.existsSync(path.join(root, 'games', d, 'index.html')));

test('library: the collection is called Patrick\'s Tabletop Library', () => {
  assert.equal(LIBRARY.name, "Patrick's Tabletop Library");
  assert.match(html, /<title>Patrick's Tabletop Library<\/title>/);
});

test('library: the designer is credited once, at the top — not under each game', () => {
  assert.equal(LIBRARY.tagline, 'Games designed by Patrick Blim-Hockberger');
  assert.ok(LIBRARY.games.every(g => !('by' in g)), 'games carry no per-game credit');
  assert.doesNotMatch(html, /Designed by \$\{/);
});

test('library: an About Patrick section under the shelf (for a publisher): who he is, that Claude Code built the app, and how to reach him', () => {
  const t = [...LIBRARY.about.lines, LIBRARY.about.contact.lead].join(' ');
  assert.equal(LIBRARY.about.heading, 'About Patrick');
  assert.match(t, /Patrick Blim-Hockberger is a composer and elementary music teacher in Boulder, Colorado/);
  assert.match(t, /some of his board game designs[\s\S]*Claude Code/);
  assert.equal(LIBRARY.about.contact.email, 'patrickhockberger@gmail.com');
  assert.match(html, /mailto:\$\{esc\(L\.about\.contact\.email\)\}/, 'the address is a mail link');
});

test('library: every game folder is in the catalogue, and every local catalogue entry has a game', () => {
  const ids = LIBRARY.games.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const d of gameDirs) assert.ok(ids.includes(d), `games/${d} is missing from the catalogue`);
  for (const g of LIBRARY.games.filter(g => g.path)) {
    assert.equal(g.path, `games/${g.id}/index.html`);
    assert.ok(gameDirs.includes(g.id), `${g.id} has no games/${g.id}/index.html`);
  }
});

test('library: every entry has what the shelf shows; entries without an address are never listed', () => {
  for (const g of LIBRARY.games) {
    assert.ok(g.title && g.tagline && g.icon && g.accent && g.art, g.id);
    if (g.listed) assert.ok(g.path || g.url, `${g.id} is listed but has no address`);
  }
  assert.ok(LIBRARY.games.find(g => g.id === 'fossil-frenzy').listed);
});

test('library: Dig Dig BOOM! is on the shelf like the others', () => {
  const d = LIBRARY.games.find(g => g.id === 'dig-dig-boom');
  assert.equal(d.listed, true);
  assert.equal(d.path, 'games/dig-dig-boom/index.html');
});

// ---------- browser ----------
function findChromium() {
  for (const t of [() => require('playwright'), () => require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))]) { try { return t().chromium; } catch (e) { /* next */ } }
  return null;
}
const chromium = findChromium();
const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const serve = () => new Promise(resolve => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(root, u.endsWith('/') ? u + 'index.html' : u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/plain' });
    res.end(fs.readFileSync(f));
  }).listen(0, '127.0.0.1', () => resolve(server));
});

test('library (browser): the shelf shows the listed games; tapping a box opens the game; the game links back', { skip: !chromium && 'Playwright/Chromium not available', timeout: 60000 }, async () => {
  const server = await serve(), base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // Dig Dig BOOM! reads its cards from the owner's Google Sheet; the test must not depend on the network
    await page.route('**/docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv', body: 'ID,Name,Type,Number,Deck,Count,Card Text\n' }));
    await page.goto(base + '/index.html');
    assert.equal(await page.title(), "Patrick's Tabletop Library");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY), 'none', 'no pull-to-refresh on the shelf');
    const listed = LIBRARY.games.filter(g => g.listed && (g.path || g.url));
    assert.equal(await page.locator('a.box').count(), listed.length, 'only listed games with an address are on the shelf');
    assert.deepEqual(await page.locator('a.box').evaluateAll(els => els.map(e => e.dataset.id)), Array.from(listed.slice().sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base', ignorePunctuation: true })), g => g.id), 'alphabetical by title');
    for (const g of listed) {                                                 // every box is its own cover art, and the art is the game's
      const art = page.locator(`a.box[data-id="${g.id}"] .art svg`);
      assert.equal(await art.count(), 1, g.id + ' cover art');
      assert.equal(await art.getAttribute('aria-label'), g.title);
      assert.ok(g.art && (await art.evaluate(el => el.querySelectorAll('rect,polygon,path,circle').length)) > 10, g.id + ' art is a real picture');
    }
    const ids = await page.locator('a.box .art svg').evaluateAll(els => els.map(e => e.innerHTML));
    assert.equal(new Set(ids).size, ids.length, 'each game is visually distinct');
    const ff = 'a.box[data-id="fossil-frenzy"]';
    assert.match(await page.locator(ff).getAttribute('aria-label'), /Torn Treasure/);
    // a box is a picture first: cover art (an SVG) only, not a paragraph of text
    const box = await page.locator(ff).boundingBox();
    assert.ok(box.width >= 240 && box.height >= box.width * 1.2, 'a box is a big, upright rectangle: ' + JSON.stringify(box));
    assert.equal(await page.locator('a.box p').count(), 0, 'no paragraph of text on the box');
    assert.equal(await page.locator('a.box .strip, a.box .pill, a.box .played').count(), 0, 'nothing but the cover art: no players, no time, no Played tag');
    assert.match(await page.locator(ff).getAttribute('aria-label'), /1–4 players/, 'the player count is still there for screen readers');
    // the tagline in the ribbon fits inside its oval
    const fit = await page.evaluate(() => { const svg = document.querySelector('a.box[data-id="fossil-frenzy"] .art svg'), t = [...svg.querySelectorAll('text')].find(x => /PEEK/.test(x.textContent)), r = [...svg.querySelectorAll('rect')].find(x => x.getAttribute('rx') === '13'); const tb = t.getBBox(), rb = r.getBBox(); return { tx: tb.x, tr: tb.x + tb.width, rx: rb.x, rr: rb.x + rb.width }; });
    assert.ok(fit.tx >= fit.rx + 10 && fit.tr <= fit.rr - 10, 'the words sit inside the oval: ' + JSON.stringify(fit));
    await page.goto(base + '/index.html?unlisted');
    assert.equal(await page.locator('a.box').count(), LIBRARY.games.filter(g => g.path || g.url).length, '?unlisted shows the hidden games that have an address (and never a dead link)');
    // the way-back chip never covers a game's title, at any size
    for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(vp);
      for (const g of listed.filter(g => g.path)) {
        await page.goto(base + '/' + g.path + '?from=library');
        const o = await page.evaluate(() => {
          const chip = document.querySelector('a.libback').getBoundingClientRect(), hit = [];
          document.querySelectorAll('h1, .title, .logo').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height && !(r.right <= chip.left || r.left >= chip.right || r.bottom <= chip.top || r.top >= chip.bottom)) hit.push(e.className || e.tagName); });
          return hit;
        });
        assert.deepEqual(o, [], `${g.id} at ${vp.width}x${vp.height}: the library chip covers ${o}`);
      }
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(base + '/index.html');
    await page.tap(ff);
    await page.waitForURL(/games\/fossil-frenzy\/index\.html\?from=library/);
    assert.match(await page.locator('h1').first().innerText(), /Torn\s+Treasure/);
    const back = await page.locator('a.back').boundingBox();
    assert.ok(back.x < 40 && back.y < 40, 'the way back is in the very top-left corner: ' + JSON.stringify(back));
    assert.ok(back.height >= 44, 'and big enough to tap: ' + JSON.stringify(back));
    await page.tap('a.back');
    await page.waitForURL(base + '/index.html');
    for (const g of listed.filter(g => g.path && g.id !== 'fossil-frenzy')) {      // every other game links back too, from the top-left
      await page.goto(base + '/' + g.path + '?from=library');
      await page.waitForSelector('a.libback', { timeout: 15000 });
      const link = await page.locator('a.libback').boundingBox();
      assert.ok(link && link.x < 40 && link.y < 40 && link.height >= 44, g.id + ' has the way back in the top-left: ' + JSON.stringify(link));
    }
    // a game's own address, opened by somebody it was shared with, knows nothing of the library: no way back, no mention
    for (const g of listed.filter(g => g.path)) {
      const solo = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
      await solo.goto(base + '/' + g.path); await solo.waitForTimeout(1500);
      assert.equal(await solo.locator('a.libback, a[href$="../../index.html"]').count(), 0, g.id + ': opened on its own it has no link to the library');
      assert.doesNotMatch(await solo.locator('body').innerText(), /Tabletop Library/, g.id + ': nor any mention of it');
      await solo.close();
    }
    await page.goto(base + '/index.html');
    assert.equal(await page.title(), "Patrick's Tabletop Library");
    assert.equal(await page.locator('.played').count(), 0, 'boxes carry no Played tag');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
