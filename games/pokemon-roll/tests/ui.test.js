const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

// tap through whatever the screen is asking for until the fight is over and the result screen is up
async function playFight(p, maxSteps) {
  const tap = sel => p.locator(sel).first().click({ timeout: 1500 }).then(() => true, () => false);       // the game may move on by itself between looking and tapping
  for (let i = 0; i < (maxSteps || 160); i++) {
    if (await p.locator('.banner').count()) return true;
    if (await tap('[data-act=tipok]')) continue;
    if (await p.locator('[data-act=skip]').count()) { await tap('[data-act=skip]'); continue; }
    if (await p.locator('.rollhint').count()) { await tap('.rollhint'); continue; }      // tap anywhere to roll
    if (await p.locator('[data-act=go]:not([disabled])').count()) { await tap('[data-act=go]'); await p.waitForTimeout(150); continue; }
    if (await p.locator('[data-act=tray]').count()) {
      if (await p.locator('.card.sel').count() === 0) { if (await tap('[data-act=tray]')) continue; }
      if (await tap('[data-act=join]')) continue; if (await tap('[data-act=ins]')) continue;
    }
    const free = p.locator('.die[data-act=die]:not(.used)');
    if (await free.count()) {
      if (await p.locator('.die.sel').count() === 0) { await tap('.die[data-act=die]:not(.used)'); continue; }
      if (await tap('.col .card:not(.foe):not(.ko):not(.has-die)')) continue;
    }
    if (await p.locator('.status:has-text("Tap who")').count()) { await tap('.card.sel:not(.act)'); continue; }          // an "or" on one of our cards
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
    assert.equal(await p.locator('.place').count(), 6, 'what is open, and one step beyond it');
    assert.equal(await p.locator('.place:not(.lock)').count(), 3, 'Viridian Forest, Brock and Mt. Moon are open from the start');
    assert.equal(await p.locator('.place svg').count(), 6, 'each place is drawn as a picture');
    assert.ok(await p.evaluate(() => { const w = document.querySelector('.mapwrap'); return w.scrollWidth <= w.clientWidth + 1 && w.scrollHeight <= w.clientHeight + 1; }), 'the map fills the screen without scrolling');
    assert.equal(await p.locator('.dock').count(), 0, 'no bar along the bottom'); assert.ok(await p.locator('.top [data-act=coll]').count() === 1, 'Your cards is in the top bar');
    assert.equal(await p.locator('[data-act=auto]').count(), 0, 'no Suggest button');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), 'the page does not scroll');
    await p.click('[data-id=L1]'); assert.equal(await p.locator('[data-act=pickc]').count(), 0, 'no team to pick first');
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
        const s = Engine.newGame({ seed: 12, starter: 'bulbasaur', size: 'short', ai: 'normal' });
        s.done.rival1 = true; s.done.B1 = true; s.done.B2 = true; s.done.B3 = true; s.lv = 4; s.coll[0].id = '2.4';
        ['74', '56', '100', '3.5', '16', '19'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: i === 1 ? 1 : 0 }));
        window.__pokemonRoll.setG(s);
      });
      await p.click('[data-id=B4]');
      assert.equal(await p.locator('.card.foe').count(), 0, 'a gym leader is a surprise: none of their cards are shown in advance'); assert.equal(await p.locator('.back').count(), 0, 'no card is ever shown face down');
      for (let i = 0; i < 40; i++) { await p.waitForTimeout(400); await p.locator('[data-act=tipok]').click({ timeout: 250 }).catch(() => {}); if (await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return g && g.stage === 'place' && g.pl.side === 0; })) break; }
      // put all four down quickly
      for (let i = 0; i < 40; i++) {
        await p.locator('[data-act=tipok]').click({ timeout: 250 }).catch(() => {});
        const st = await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return g.stage + ':' + g.pl.side; });
        if (st.startsWith('assign')) break;
        if (st === 'place:0') { await p.locator('[data-act=tray]').first().click(); const j = p.locator('[data-act=join]'); if (await j.count()) await j.first().click(); else await p.locator('[data-act=ins]').first().click(); } else await p.waitForTimeout(300);
      }
      await p.waitForTimeout(700);
      const fits = await p.evaluate(() => ({ sx: document.documentElement.scrollWidth <= innerWidth, sy: document.documentElement.scrollHeight <= innerHeight, over: true }));
      assert.ok(fits.sx && fits.sy, w + 'x' + h + ' the page itself never scrolls');
      // every card on the table is the whole card: six faces, ability, weakness tab flush with the top edge, art, HP, and nothing clipped
      const cards = await p.evaluate(() => [...document.querySelectorAll('.board .card')].map(c => { const r = c.getBoundingClientRect(), t = c.querySelector('.wkt'); return { faces: c.querySelectorAll('.f').length, ab: !!c.querySelector('.ab'), art: !!c.querySelector('.art img'), hp: !!c.querySelector('.hpc'), tab: t ? Math.round(c.classList.contains('foe') ? r.bottom - t.getBoundingClientRect().bottom : t.getBoundingClientRect().top - r.top) : 99, foe: c.classList.contains('foe'), upside: c.classList.contains('foe') ? getComputedStyle(c).rotate : '', w: Math.round(r.width), clipped: c.scrollHeight > c.clientHeight + 1, inView: r.left >= -1 && r.right <= innerWidth + 1 }; }));
      assert.ok(cards.length >= 6, 'cards on the table');
      cards.forEach(c => { assert.equal(c.faces, 6); assert.ok(c.ab && c.art && c.hp); assert.ok(c.tab <= 6, 'weakness tab flush with the top'); assert.ok(!c.clipped, 'no part of the card is cut off'); assert.ok(c.w >= 120, 'big enough to read: ' + c.w); });
      if (w === 820) assert.ok(cards.every(c => c.inView), 'on the iPad in portrait the whole table is on screen');
      assert.ok(cards.some(c => c.foe && /180deg/.test(c.upside)), 'their cards are upside down, head to head'); assert.ok(cards.filter(c => !c.foe).every(c => !c.upside));
      assert.equal(await p.locator('.sheet .card').count(), 0, 'there is no second, enlarged version of a card');
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
    await p.click('[data-act=coll]'); assert.ok(await p.locator('.card.shiny').count() === 1, 'a shiny in your cards'); assert.ok(await p.locator('.card.shiny .star').count() >= 3, 'sparkles'); assert.match(await p.innerText('.card.shiny .nm'), /✨/);
    // tapping a card in your collection fills the screen with it, and a tap closes it
    await p.click('.card.shiny'); const big = await p.locator('.sheet .card').last().boundingBox(); assert.ok(big.width >= 500, 'the card fills the screen: ' + big.width);
    await p.click('.sheet .card >> nth=-1'); assert.equal(await p.locator('.sheet[data-act=closezoom]').count(), 0, 'a tap closes it');
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
    await p.click('[data-act=continue]'); assert.equal(await p.locator('.place').count(), 6);
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.starter), 'pikachu');
  } finally { await b.close(); }
});

test('ui: a die is dragged onto a card and lands in its art area (and a tap still works)', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
    await p.evaluate(() => {
      const s = Engine.newGame({ seed: 3, starter: 'bulbasaur' }); s.done.B1 = true; s.coll.push({ uid: 9, id: '10', sh: 0 });
      const R = window.__pokemonRoll; R.setG(s); R.act({ t: 'go', node: 'L1' });
      const G = R.G; let g; while ((g = Bots.step(G))) Engine.apply(G, g);
      Engine.apply(G, Object.assign({ t: 'place', side: 0, uid: G.battle.hand[0][0] }, Engine.slotsFor(G.battle, 0).find(x => x.join != null)));
      Engine.apply(G, Object.assign({ t: 'place', side: 0, uid: G.battle.hand[0][0] }, Engine.slotsFor(G.battle, 0).find(x => x.at != null)));   // bring a second card: they draw one more
      while ((g = Bots.step(G))) Engine.apply(G, g);
      Engine.apply(G, { t: 'ready' }); R.render();
    });
    await p.locator('.rollhint').click({ timeout: 4000 }); await p.waitForSelector('.die[data-act=die]', { timeout: 5000 }); await p.waitForTimeout(1200);
    await p.locator('[data-act=tipok]').click({ timeout: 300 }).catch(() => {});
    const dr = await p.locator('.die[data-act=die]').first().boundingBox(), cr = await p.locator('.col .card:not(.foe)').first().boundingBox();
    await p.mouse.move(dr.x + dr.width / 2, dr.y + dr.height / 2); await p.mouse.down();
    await p.mouse.move(dr.x + 20, dr.y - 60, { steps: 4 }); await p.mouse.move(cr.x + cr.width / 2, cr.y + 60, { steps: 6 });
    assert.equal(await p.locator('.die.ghost').count(), 1, 'the die follows the finger');
    await p.mouse.up();
    assert.equal(await p.evaluate(() => Object.keys(window.__pokemonRoll.G.battle.asg[0]).length), 1, 'the die was given to the card');
    assert.equal(await p.locator('.col .card:not(.foe) .art .dbadge').count(), 1, 'it sits in the art area of the card');
    assert.equal(await p.locator('.die.ghost').count(), 0);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: How to Play is a few pictures with one line each, not a wall of text; the map is titled Kanto Map and centered', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=help]');
    const pages = []; for (let i = 0; i < 7; i++) { pages.push({ imgs: await p.locator('.hvis img, .hvis svg, .hvis .card, .hvis .die').count(), words: ((await p.innerText('.hbox h2')) + ' ' + ((await p.locator('.hcap').count()) ? await p.innerText('.hcap') : '')).split(/\s+/).length }); if (i < 6) await p.click('.hnav [data-act=hnext]'); }
    pages.slice(0, 6).forEach((g, i) => { assert.ok(g.imgs >= 1, 'page ' + (i + 1) + ' is a picture'); assert.ok(g.words < 40, 'page ' + (i + 1) + ' is a line or two: ' + g.words + ' words'); });
    await p.click('.hbox .btn'); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=squirtle]');
    const t = await p.evaluate(() => { const e = document.querySelector('.top .t'), r = e.getBoundingClientRect(); return { text: e.textContent, mid: Math.round(r.left + r.width / 2) }; });
    assert.equal(t.text, 'Kanto Map'); assert.ok(Math.abs(t.mid - 410) <= 2, 'centered on the screen: ' + t.mid);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: New Game asks first when there is a saved game to lose', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5, 'no save: straight to choosing a partner');
    await p.click('[data-act=starter][data-k=squirtle]'); await p.reload();
    await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 0, 'the first tap does not start over');
    assert.match(await p.innerText('[data-act=new]'), /deletes your saved game/i);
    await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5, 'the second tap does');
    await p.evaluate(() => window.__pokemonRoll.A.menu0()); assert.equal(await p.locator('[data-act=continue]').count(), 1, 'the old game is still saved until a partner is chosen');
  } finally { await b.close(); }
});

test('ui: the menu has Settings (Tips and Computer difficulty live there) and no Your cards entry', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=pikachu]');
    await p.click('[data-act=menu]');
    const items = await p.locator('.sheet .box .btn').allInnerTexts(); assert.ok(items.some(t => /Settings/.test(t))); assert.ok(!items.some(t => /Your cards/.test(t)), 'your cards is on the map, not in the menu');
    assert.equal(await p.locator('.sheet [data-act=tips]').count(), 0, 'tips are not on the menu');
    await p.click('[data-act=settings]'); assert.equal(await p.locator('.sheet [data-act=tips]').count(), 2); assert.equal(await p.locator('.sheet [data-act=ai]').count(), 3);
    await p.click('.sheet [data-act=ai][data-v=master]'); assert.equal(await p.evaluate(() => window.__pokemonRoll.set.ai), 'master');
    await p.click('.sheet [data-act=tips][data-v=false]'); assert.equal(await p.evaluate(() => window.__pokemonRoll.set.tips), false);
  } finally { await b.close(); }
});

test('ui: you only choose when there is a choice for where a card goes, but dice are always yours to give out', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=charmander]');
    await p.waitForSelector('[data-id=L1]'); await p.waitForTimeout(800); await p.locator('[data-act=tipok]').click({ timeout: 300 }).catch(() => {}); await p.click('[data-id=L1]', { timeout: 5000 });
    await p.waitForFunction(() => { const g = window.__pokemonRoll.G.battle; return g && g.stage === 'assign'; }, null, { timeout: 6000 });
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.cols.length), 1, 'your only card is across from theirs: no tap needed');
    // dice are never given out for you: the first roll is a tap, and you drag the die onto your card
    assert.equal(await p.locator('.die').count(), 0, 'no dice until you tap'); assert.ok(await p.locator('.rollhint').count() >= 1, 'Tap anywhere to roll');
    await p.locator('.rollhint').click(); await p.waitForSelector('.die[data-act=die]', { timeout: 4000 }); await p.waitForTimeout(1100);
    assert.equal(await p.evaluate(() => Object.keys(window.__pokemonRoll.G.battle.asg[0]).length), 0, 'the die is not on the card until you put it there');
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.stage), 'assign', 'and the round does not play by itself');
    // several cards but only one spot: tapping the card is enough
    await p.evaluate(() => { const s = Engine.newGame({ seed: 4, starter: 'squirtle' }); s.coll.push({ uid: 8, id: '10', sh: 0 }, { uid: 9, id: '16', sh: 0 }); window.__pokemonRoll.setG(s); });
    await p.waitForTimeout(500); await p.locator('[data-act=tipok]').click({ timeout: 300 }).catch(() => {}); await p.click('[data-id=L1]', { timeout: 5000 }); await p.waitForFunction(() => { const g = window.__pokemonRoll.G.battle; return g && g.stage === 'place' && g.pl.side === 0; }, null, { timeout: 6000 });
    await p.locator('[data-act=tray]').first().click(); await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.placed[0]), 1, 'one tap placed it, because there was only one spot');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: a gym leader has an eye that explains how their team was made; dice carry no name badge', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=larvitar]');
    assert.equal(await p.locator('.place.gym .eye').count(), await p.locator('.place.gym').count(), 'every gym leader has an eye');
    await p.click('.place[data-id=B1] .eye');
    assert.equal(await p.locator('[data-act=closeeye]').count() >= 1, true); const txt = await p.innerText('.hbox');
    assert.match(txt, /random team/i); assert.match(txt, /before your game began/i); assert.match(txt, /Mt\. Moon/); assert.match(txt, /Viridian Forest/);
    assert.equal(await p.locator('.sheet .eyerow').count(), 2, 'Brock draws from two places');
    await p.click('.hbox .btn'); assert.equal(await p.locator('.sheet').count(), 0);
  } finally { await b.close(); }
});

test('ui: with two dice you can add a second Pokémon to a wild fight: there are spots to tap', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
    await p.evaluate(() => { const s = Engine.newGame({ seed: 7, starter: 'bulbasaur' }); s.done.B1 = true; s.coll.push({ uid: 9, id: '10', sh: 0 }, { uid: 11, id: '16', sh: 0 }); window.__pokemonRoll.setG(s); });
    await p.click('[data-id=L2]');
    await p.waitForFunction(() => { const g = window.__pokemonRoll.G.battle; return g && g.stage === 'place' && g.pl.side === 0; }, null, { timeout: 6000 });
    await p.locator('[data-act=tray]').first().click();                                    // the first card goes across from the wild card by itself (one spot)
    await p.waitForFunction(() => window.__pokemonRoll.G.battle.placed[0] === 1, null, { timeout: 4000 });
    assert.ok(await p.locator('[data-act=ready]').count() === 1, 'you can fight now, or bring another');
    await p.locator('[data-act=tray]').first().click();
    assert.ok(await p.locator('.ins[data-act=ins]').count() >= 1, 'there are spots to tap for the second card');
    await p.locator('.ins[data-act=ins]').first().click();
    await p.waitForFunction(() => window.__pokemonRoll.G.battle.placed[0] === 2, null, { timeout: 4000 });
    await p.waitForFunction(() => { const g = window.__pokemonRoll.G.battle; return g.placed[1] === 2 || g.stage === 'assign'; }, null, { timeout: 6000 });
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: your team is sorted by level (highest on the left), then by when you got each card (oldest on the left)', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL);
    await p.evaluate(() => { const s = Engine.newGame({ seed: 3, starter: 'bulbasaur' }); ['10', '3.5', '16', '74', '6.5'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 })); window.__pokemonRoll.setG(s); });   // levels: partner 2, 1, 5, 1, 1, 5
    await p.click('[data-act=coll]');
    const order = await p.evaluate(() => [...document.querySelectorAll('.sheet .card .nm')].map(e => e.textContent.trim()));
    assert.deepEqual(order, ['Venusaur', 'Charizard', 'Bulbasaur', 'Caterpie', 'Pidgey', 'Geodude'], 'level first, then oldest to newest: ' + order.join(', '));
  } finally { await b.close(); }
});
