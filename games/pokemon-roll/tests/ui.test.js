const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

// tap through whatever the screen is asking for until the fight is over and the result screen is up
async function playFight(p, maxSteps) {
  for (let i = 0; i < (maxSteps || 120); i++) {
    if (await p.locator('.banner').count()) return true;
    const q = async sel => (await p.locator(sel).count()) ? (await p.locator(sel).first().click(), true) : false;
    if (await q('[data-act=tipok]')) continue;
    if (await p.locator('[data-act=skip]').count()) { await p.click('[data-act=skip]'); continue; }
    if (await q('[data-act=next]')) continue;
    if (await p.locator('[data-act=go]:not([disabled])').count()) { await p.click('[data-act=go]'); await p.waitForTimeout(150); continue; }
    if (await p.locator('[data-act=tray]').count()) {
      const t = p.locator('[data-act=tray]').first(); if (await p.locator('.mini.sel').count() === 0) { await t.click(); continue; }
      if (await q('[data-act=join]')) continue; if (await q('[data-act=ins]')) continue;
    }
    // dice phase: tap a free die, then a card of ours that has no die yet
    const free = p.locator('.die[data-act=die]:not(.used)');
    if (await free.count()) {
      if (await p.locator('.die.sel').count() === 0) { await free.first().click(); continue; }
      const mine = p.locator('.col .mini:not(.foe):not(.ko) .mv.dash');
      if (await mine.count()) { await mine.first().click(); continue; }
    }
    await p.waitForTimeout(250);
  }
  return false;
}

test('ui: menu, new game, map, and a whole first fight through real taps, with no errors', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  try {
    await p.goto(URL);
    assert.match(await p.innerText('.logo'), /ROLL!/); assert.ok(await p.locator('.sprites img').count() === 5, 'the five partners');
    await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5);
    await p.click('[data-act=starter][data-k=charmander]');
    assert.equal(await p.locator('.nd').count(), 18, 'every place and fight on the map');
    assert.equal(await p.locator('.nd:not(.lock)').count(), 1, 'only the first rival is open');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), 'the page does not scroll');
    await p.click('[data-id=rival1]'); await p.click('[data-act=pickc]'); await p.click('[data-act=fight]');
    assert.ok(await playFight(p), 'the fight reached a result');
    assert.match(await p.innerText('.banner'), /Victory|Not this time/);
    await p.click('[data-act=done]').catch(() => {});
    if (await p.locator('[data-act=take]').count()) await p.click('[data-act=take]');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: the table fits on the iPad and the iPhone, and cards open into the full design', { skip: !chromium }, async () => {
  const b = await chromium.launch();
  try {
    for (const [w, h] of [[820, 1180], [402, 874], [1180, 820]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(URL);
      await p.evaluate(() => {
        const s = Engine.newGame({ seed: 12, starter: 'bulbasaur', size: 'short', ai: 'medium' });
        s.done.rival1 = true; s.done.B1 = true; s.done.B2 = true; s.done.B3 = true; s.lv = 4; s.coll[0].id = '2.4';
        ['74', '56', '100', '3.5', '16', '19'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: i === 1 ? 1 : 0 }));
        window.__pokemonRoll.setG(s);
      });
      await p.click('[data-id=B4]');
      for (const c of await p.locator('[data-act=pickc]').all()) { if (await p.locator('.chip').first().innerText() === '4 / 4') break; await c.click(); }
      await p.click('[data-act=fight]');
      for (let i = 0; i < 40; i++) { await p.waitForTimeout(400); await p.locator('[data-act=tipok]').click({ timeout: 250 }).catch(() => {}); if (await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return g && g.stage === 'place' && g.pl.side === 0; })) break; }
      // put all four down quickly
      for (let i = 0; i < 40; i++) {
        await p.locator('[data-act=tipok]').click({ timeout: 250 }).catch(() => {});
        const st = await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return g.stage + ':' + g.pl.side; });
        if (st.startsWith('assign')) break;
        if (st === 'place:0') { await p.locator('[data-act=tray]').first().click(); const j = p.locator('[data-act=join]'); if (await j.count()) await j.first().click(); else await p.locator('[data-act=ins]').first().click(); } else await p.waitForTimeout(300);
      }
      await p.waitForTimeout(700);
      const fits = await p.evaluate(() => ({ sx: document.documentElement.scrollWidth <= innerWidth, sy: document.documentElement.scrollHeight <= innerHeight, over: [...document.querySelectorAll('.mini')].every(m => { const r = m.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }) }));
      assert.deepEqual(fits, { sx: true, sy: true, over: true }, w + 'x' + h);
      // tap one of our cards with no die chosen: the full card opens, weakness tab flush with the top edge
      await p.locator('.col .mini:not(.foe)').first().click();
      const card = await p.evaluate(() => { const c = document.querySelector('.sheet .card'), t = c && c.querySelector('.wkt'); return c && { faces: c.querySelectorAll('.f').length, tab: Math.round(t.getBoundingClientRect().top - c.getBoundingClientRect().top), name: c.querySelector('.nm').textContent }; });
      assert.ok(card, 'a card opens'); assert.equal(card.faces, 6, 'six faces'); assert.ok(card.tab <= 6, 'the weakness tab sits flush with the top edge of the card');
      assert.deepEqual(errs, []); await p.close();
    }
  } finally { await b.close(); }
});

test('ui: a shiny sparkles on the table and on its card, and is only a look (the same numbers)', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL);
    await p.evaluate(() => {
      const s = Engine.newGame({ seed: 5, starter: 'squirtle' }); s.coll.push({ uid: 8, id: '25.2', sh: 1 });
      window.__pokemonRoll.setG(s);
    });
    await p.click('[data-act=coll]'); assert.ok(await p.locator('.mini.shiny').count() >= 1, 'a shiny in your cards'); assert.ok(await p.locator('.mini.shiny .star').count() >= 3, 'sparkles');
    await p.click('.mini.shiny'); assert.ok(await p.locator('.card.shiny').count() === 1); assert.match(await p.innerText('.card .nm'), /✨/);
    const same = await p.evaluate(() => { const c = Engine.CARDS['25.2']; return c.hp; }); assert.equal(same, 4);
    const sprites = await p.evaluate(() => [...document.querySelectorAll('.card .art img')].map(i => i.src.slice(0, 30)));
    assert.ok(sprites[0].startsWith('data:image/png;base64'), 'sprites are built into the page: no network');
  } finally { await b.close(); }
});

test('ui: the game is saved, and Continue brings it back', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 402, height: 874 } });
  try {
    await p.goto(URL); assert.equal(await p.locator('[data-act=continue]').count(), 0);
    await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=pikachu]');
    await p.reload(); assert.equal(await p.locator('[data-act=continue]').count(), 1);
    await p.click('[data-act=continue]'); assert.equal(await p.locator('.nd').count(), 18);
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.starter), 'pikachu');
  } finally { await b.close(); }
});
