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
    assert.match(await p.innerText('.logo'), /ROLL!/); await p.waitForSelector('.arena .toy', { timeout: 4000 }); assert.equal(await p.locator('.arena .toy.stand img').count(), 5, 'the five starters are on the toy table'); assert.equal(await p.locator('.arena .toy.cube').count(), 5, 'ROLL! is five blocks'); assert.equal(await p.locator('[data-act=help]').count(), 0, 'help lives under More'); assert.ok(await p.locator('[data-act=more]').count() === 1, 'a More button');
    await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5);
    await p.click('[data-act=starter][data-k=charmander]');
    assert.equal(await p.locator('.place').count(), 6, 'what is open, and one step beyond it');
    assert.equal(await p.locator('.place:not(.lock)').count(), 3, 'Viridian Forest, Brock and Mt. Moon are open from the start');
    assert.equal(await p.locator('.place > svg, .place .ptop > svg').count(), 6, 'each place is drawn as a picture (a gym, or the back of a deck)');
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
      const cards = await p.evaluate(() => [...document.querySelectorAll('.board .card')].map(c => { const r = c.getBoundingClientRect(), t = c.querySelector('.wkt'); return { faces: c.querySelectorAll('.f').length, ab: !!c.querySelector('.ab'), art: !!c.querySelector('.art img'), hp: !!c.querySelector('.hpc'), tab: t ? Math.round(t.getBoundingClientRect().top - r.top) : 99, foe: c.classList.contains('foe'), upside: c.classList.contains('foe') ? getComputedStyle(c).rotate : '', w: Math.round(r.width), clipped: c.scrollHeight > c.clientHeight + 1, inView: r.left >= -1 && r.right <= innerWidth + 1 }; }));
      assert.ok(cards.length >= 6, 'cards on the table');
      cards.forEach(c => { assert.equal(c.faces, 6); assert.ok(c.ab && c.art && c.hp); assert.ok(c.tab <= 6, 'weakness tab flush with the top'); assert.ok(!c.clipped, 'no part of the card is cut off'); assert.ok(c.w >= 120, 'big enough to read: ' + c.w); });
      if (w === 820) assert.ok(cards.every(c => c.inView), 'on the iPad in portrait the whole table is on screen');
      assert.ok(cards.some(c => c.foe && !/180deg/.test(c.upside)), 'their cards are the right way up, like yours, head to head'); assert.ok(cards.filter(c => !c.foe).every(c => !c.upside));
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


test('ui: How to Play is a few pictures with one line each, not a wall of text; the map is titled Kanto Map and centered', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=more]'); await p.click('.sheet [data-act=help]');
    const pages = []; for (let i = 0; i < 7; i++) { pages.push({ nav: await p.evaluate(() => { const r = document.querySelector('.hnav [data-act=hnext]').getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }), imgs: await p.locator('.hvis img, .hvis svg, .hvis .card, .hvis .die').count(), words: ((await p.innerText('.hbox h2')) + ' ' + ((await p.locator('.hcap').count()) ? await p.innerText('.hcap') : '')).split(/\s+/).length }); if (i < 6) await p.click('.hnav [data-act=hnext]'); }
    pages.slice(0, 6).forEach((g, i) => { assert.ok(g.imgs >= 1, 'page ' + (i + 1) + ' is a picture'); assert.ok(g.words < 40, 'page ' + (i + 1) + ' is a line or two: ' + g.words + ' words'); });
    assert.equal(new Set(pages.map(g => g.nav)).size, 1, 'the arrows are always in the same spot: ' + pages.map(g => g.nav).join(' | '));
    assert.equal(await p.locator('.hbox .btn').count(), 0, 'no Skip button'); await p.mouse.click(8, 8); assert.equal(await p.locator('.sheet').count(), 0, 'a tap outside closes it'); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=squirtle]');
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
    // each card's roll is a tap; the die then belongs to its card, and nothing plays until you press Resolve
    assert.equal(await p.locator('.die').count(), 0, 'no dice until you tap'); assert.ok(await p.locator('.rollhint').count() >= 1, 'Tap anywhere to roll');
    await p.locator('.rollhint').click(); await p.waitForSelector('.rail .die', { timeout: 4000 }); await p.waitForTimeout(1100);
    assert.equal(await p.evaluate(() => Object.keys(window.__pokemonRoll.G.battle.asg[0]).length), 1, 'the die is already on the card: one die per card');
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.stage), 'assign', 'and the column does not play by itself'); assert.ok(await p.locator('[data-act=reroll]').count() === 1 && await p.locator('[data-act=go]').count() === 1, 'reroll or resolve');
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
    assert.equal(await p.locator('.place.deck:not(.lock) .eye').count(), await p.locator('.place.deck:not(.lock)').count(), 'every open location has the info button too');
    assert.equal((await p.locator('.place[data-id=B1] .eye').innerText()).trim(), 'i', 'an i for information, not an eyeball');
    await p.click('.place.deck[data-id=L1] .eye'); const total = await p.evaluate(() => window.__pokemonRoll.G.decks[1].length + window.__pokemonRoll.G.discard[1].length);
    const counts = await p.locator('.sheet .tycount').allInnerTexts(); assert.equal(counts.map(Number).reduce((a, b) => a + b, 0), total, 'the types add up to every card in that place (draw and discard piles): ' + counts);
    assert.match(await p.innerText('.hbox'), /in the draw pile[\s\S]*in the discard pile/); assert.equal(await p.locator('.place.deck .pcount').count(), 0, 'no card count on the map decks any more: it is all in the i'); await p.mouse.click(8, 8); assert.equal(await p.locator('.sheet').count(), 0);
    await p.click('.place[data-id=B1] .eye');
    assert.equal(await p.locator('[data-act=closeeye]').count() >= 1, true); const txt = await p.innerText('.hbox');
    assert.match(txt, /team/i); assert.match(txt, /before your game began/i); assert.match(txt, /Mt\. Moon/); assert.match(txt, /Viridian Forest/);
    assert.equal(await p.locator('.sheet .eyerow').count(), 2, 'Brock draws from two places');
    await p.click('.hbox .btn'); assert.equal(await p.locator('.sheet').count(), 0);
    // once you have faced a gym leader, the eye shows their whole team
    const n = await p.evaluate(() => { const G = window.__pokemonRoll.G; G.seen = G.seen || {}; G.seen.B1 = true; window.__pokemonRoll.render(); return G.bosses.B1.length; });
    await p.click('.place[data-id=B1] .eye'); assert.equal(await p.locator('.sheet .card').count(), n, 'every card of their team is on show');
    assert.match(await p.innerText('.hbox'), /whole team/i);
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
    assert.ok(await p.locator('.slot[data-act=ins]').count() >= 1, 'there are spots to tap for the second card');
    const dsz = await p.evaluate(() => { const a = document.querySelector('.slot[data-act=ins]').getBoundingClientRect(), c = document.querySelector('.board .card').getBoundingClientRect(); return [Math.abs(a.width - c.width), Math.abs(a.height - c.height)]; }); assert.ok(dsz[0] <= 3 && dsz[1] <= 3, 'a spot for a card is exactly the size and shape of a card: ' + dsz);
    await p.locator('.slot[data-act=ins]').first().click();
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
    const order = await p.evaluate(() => [...document.querySelectorAll('.handov .card .nm')].map(e => e.textContent.trim()));
    assert.deepEqual(order, ['Venusaur', 'Charizard', 'Bulbasaur', 'Caterpie', 'Pidgey', 'Geodude'], 'level first, then oldest to newest: ' + order.join(', '));
  } finally { await b.close(); }
});
test('ui: Kadabra can change column and Abra can swap two of theirs, right on the cards', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => {
      const s = Engine.newGame({ seed: 12, starter: 'charmander', size: 'short', ai: 'master' }); s.done.B1 = true; s.lv = 4; s.coll[0].id = '5.4'; ['64', '63'].forEach((id, i) => s.coll.push({ uid: 10 + i, id, sh: 0 }));
      const R = window.__pokemonRoll; R.setG(s); R.act({ t: 'go', node: 'B2' }); const G = R.G; let g; while ((g = Bots.step(G))) Engine.apply(G, g);
      for (let i = 0; i < 8 && G.battle.stage === 'place'; i++) { if (G.battle.pl.side === 0 && G.battle.hand[0].length) Engine.apply(G, Object.assign({ t: 'place', side: 0, uid: G.battle.hand[0][0] }, Engine.slotsFor(G.battle, 0).find(x => x.join != null) || Engine.slotsFor(G.battle, 0)[0])); while ((g = Bots.step(G))) Engine.apply(G, g); }
      R.render();
    });
    await p.waitForFunction(() => window.__pokemonRoll.G.battle.stage === 'assign', null, { timeout: 8000 });
    await p.waitForTimeout(600);       // (cards move before anything is rolled)
    const mine = () => p.evaluate(() => window.__pokemonRoll.G.battle.cols.map(c => c[0]));
    const before = await mine(); await p.locator('[data-act=mv][data-dir="1"]').click(); const after = await mine();
    assert.notDeepEqual(after, before, 'Kadabra changed column: ' + before + ' -> ' + after); assert.equal(await p.locator('[data-act=mv]').count(), 0, 'once a round');
    const foes = () => p.evaluate(() => window.__pokemonRoll.G.battle.cols.map(c => c[1]));
    const f0 = await foes(); await p.locator('[data-act=swapstart]').click();
    const cards = p.locator('.card.foe.sel'); assert.ok(await cards.count() >= 2, 'their cards light up'); await cards.nth(0).click(); await cards.nth(1).click().catch(() => {});
    await p.waitForTimeout(300); const f1 = await foes(); assert.notDeepEqual(f1, f0, 'Abra swapped two of their cards');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
test('ui: beating Lance records the whole-game best (and Lance\'s own), and the help mentions the reroll', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.removeItem('pokemon-roll-scores'); });
    const sc = await p.evaluate(() => {
      const R = window.__pokemonRoll, s = Engine.newGame({ seed: 3, starter: 'charmander', size: 'short', ai: 'normal' }); s.turn = 31; s.bossTurns.B7 = 31; s.phase = 'won'; s.res = { win: true, node: 'B7', kind: 'boss' }; R.setG(s); R.recordResult();
      return JSON.parse(localStorage.getItem('pokemon-roll-scores'));
    });
    assert.equal(sc.short.game, 31, 'the whole-game record'); assert.equal(sc.short.B7, 31, 'and Lance');
    const hof = await p.evaluate(() => JSON.parse(localStorage.getItem('pokemon-roll-hof') || '[]')); assert.equal(hof.length, 1, 'the run is in the Hall of Fame'); assert.equal(hof[0].turns, 31); assert.ok(Array.isArray(hof[0].team) && hof[0].team.length > 0, 'with the team that fought');
    const dx = await p.evaluate(() => JSON.parse(localStorage.getItem('pokemon-roll-dex') || '{}')); assert.ok(dx[4], 'Charmander is in the Pokédex (your starter)');
    assert.match(await p.evaluate(() => document.body.innerHTML), /reroll|🔄/, 'the help or the screen says you can reroll');
  } finally { await b.close(); }
});
test('ui: locations are decks of cards; picking one sweeps the map away, the pile sits on the table, cards are drawn from it, and it flies away when drawing is done', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => { const s = Engine.newGame({ seed: 12, starter: 'charmander', size: 'short', ai: 'normal' }); s.done.B1 = true; s.coll.push({ uid: 10, id: '1.2', sh: 0 }, { uid: 11, id: '7.2', sh: 0 }); s.lv = 3; window.__pokemonRoll.setG(s); });
    assert.ok(await p.locator('.place.deck .pile .ptop svg').count() >= 3, 'locations are decks with a card back');
    assert.equal(await p.locator('.mypile').count(), 1, 'your cards are a pile');
    await p.click('[data-id=L1]');
    await p.waitForFunction(() => window.__pokemonRoll.G.battle && window.__pokemonRoll.G.battle.stage === 'place', null, { timeout: 5000 });
    await p.waitForSelector('.pilebay .pile', { timeout: 3000 });
    const n0 = Number(await p.locator('.pilebay .pcount').innerText());
    for (let i = 0; i < 40 && !(await p.evaluate(() => window.__pokemonRoll.G.battle.stage !== 'place')); i++) {
      await p.locator('[data-act=tipok]').click({ timeout: 200 }).catch(() => {});
      if (await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return g.stage === 'place' && g.pl.side === 0; })) {
        await p.locator('[data-act=tray]').first().click({ timeout: 1500 }).catch(() => {}); const j = p.locator('[data-act=join]'); if (await j.count()) await j.first().click({ timeout: 1500 }).catch(() => {}); else await p.locator('[data-act=ins]').first().click({ timeout: 1500 }).catch(() => {});
        if (await p.locator('[data-act=ready]').count()) { await p.waitForTimeout(900); await p.click('[data-act=ready]', { timeout: 1500 }).catch(() => {}); }
      } else await p.waitForTimeout(300);
    }
    const left = await p.evaluate(() => window.__pokemonRoll.G.battle.stage);
    assert.notEqual(left, 'place', 'placing is over'); await p.waitForTimeout(1100);
    assert.equal(await p.locator('.pilebay').count(), 0, 'the pile has flown away');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
test('ui: arriving on the map deals the piles out from the left, once, not on every redraw', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => { const s = Engine.newGame({ seed: 12, starter: 'charmander', size: 'short', ai: 'normal' }); window.__pokemonRoll.setG(s); });
    const n1 = await p.evaluate(() => document.getAnimations().filter(a => !(a instanceof CSSAnimation) && a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('place')).length);
    assert.ok(n1 >= 3, 'the piles are dealt out: ' + n1);
    await p.waitForTimeout(1200); await p.evaluate(() => window.__pokemonRoll.render());
    const n2 = await p.evaluate(() => document.getAnimations().filter(a => !(a instanceof CSSAnimation) && a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('place')).length);
    assert.equal(n2, 0, 'a redraw on the same map does not deal them again');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: a card lists its moves from 6 at the top down to 1 at the bottom', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=pikachu]'); await p.click('.mypile'); await p.waitForSelector('.handf .card');
    const pips = await p.locator('.handf .card').first().locator('.pip').allInnerTexts(); assert.deepEqual(pips, ['6', '5', '4', '3', '2', '1'], 'best on top');
    const rows = await p.locator('.handf .card').first().locator('.f .mt').allInnerTexts(); assert.match(rows[0], /Attack/, 'move 1 is on the 6'); assert.match(rows[5], /Damage/, 'the damage to itself is on the 1');
  } finally { await b.close(); }
});

test('ui: one column at a time: tap to roll, keep or reroll once, resolve, then the next column rolls', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => {
      const T = Engine._t, s = Engine.newGame({ seed: 3, starter: 'charmander' }); s.phase = 'battle';
      const bt = T.startBattle(s, 'loc', 'L1', [{ id: '25.3', sh: 0 }, { id: '6.5', sh: 0 }], [{ id: '19', sh: 0 }, { id: '16', sh: 0 }]);
      bt.hand = [[], []]; bt.cols = [[bt.units[0].uid, bt.units[2].uid], [bt.units[1].uid, bt.units[3].uid]]; T.startRound(s); window.__pokemonRoll.setG(s);
    });
    const st = () => p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return { rolled: g.rolled, cur: g.cur, stage: g.stage, more: g.more }; });
    assert.equal((await st()).rolled, false); assert.equal(await p.locator('.col.cur').count(), 1, 'the current column is marked');
    await p.mouse.click(300, 500); await p.waitForTimeout(1300);
    let s1 = await st(); assert.equal(s1.rolled, true); assert.equal(s1.cur, 0);
    await p.locator('[data-act=reroll]').click(); await p.waitForTimeout(1000); assert.equal(await p.locator('[data-act=reroll]:not([disabled])').count(), 0, 'one reroll per card');
    await p.locator('[data-act=go]').click(); await p.waitForFunction(() => { const g = window.__pokemonRoll.G.battle; return g.stage !== 'assign'; }, null, { timeout: 5000 });
    for (let i = 0; i < 30; i++) { const g = await st(); if (g.stage === 'resolved') break; await p.mouse.click(300, 500); await p.waitForTimeout(250); }
    assert.equal((await st()).more, true, 'the second column is still to come');
    for (let i = 0; i < 6 && (await st()).cur !== 1; i++) { await p.mouse.click(300, 500); await p.waitForTimeout(500); }
    await p.waitForTimeout(800); const s2 = await st(); assert.equal(s2.cur, 1, 'tapping carried on to the second column, rolled');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
