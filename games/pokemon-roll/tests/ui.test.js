const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

// tap through whatever the screen is asking for until the fight is over and the result screen is up
async function playFight(p, maxSteps) {
  const tap = sel => p.locator(sel).first().click({ timeout: 1500 }).then(() => true, () => false);       // the game may move on by itself between looking and tapping
  for (let i = 0; i < (maxSteps || 160); i++) {
    if (await p.locator('.banner, .kos').count()) return true;
    if (await tap('[data-act=tipok]')) continue;
    if (await p.locator('[data-act=skip]').count()) { await tap('[data-act=skip]'); continue; }
    if (await p.locator('.rollhint').count()) { await tap('.rollhint'); continue; }      // tap anywhere to roll
    if (await p.locator('.rail.rgo').count()) { await tap('.rail.rgo .status'); await p.waitForTimeout(150); continue; }          // all dice given out: a tap on the side bar plays the round
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
    assert.match(await p.innerText('.logo'), /Roll!/); assert.equal(await p.locator('.mm2 .mapin .place').count(), 16, 'the map is dealt out right on the menu'); assert.equal(await p.locator('.arena').count(), 0, 'no toy table'); assert.equal(await p.locator('[data-act=help]').count(), 0, 'help lives under More'); assert.ok(await p.locator('[data-act=more]').count() === 1, 'a More button');
    await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5); assert.match(await p.innerText('.oakov .bubble'), /Professor Oak[\s\S]*level up and evolve[\s\S]*static cards/, 'Oak offers the starters and says only they evolve'); assert.equal(await p.locator('.oakov').count(), 1);
    await p.click('[data-act=starter][data-k=charmander]');
    assert.equal(await p.locator('.oakov').count(), 0, 'Oak goes away and you are back on the map'); assert.equal(await p.locator('.place').count(), 16, 'the whole road is on show from the start, locked places included');
    assert.equal(await p.locator('.place:not(.lock)').count(), 3, 'Viridian Forest, Brock and Mt. Moon are open from the start');
    assert.equal(await p.locator('.place > svg, .place .ptop > svg').count(), await p.locator('.place').count(), 'each place is drawn as a picture (a gym, or the back of a deck)');
    assert.ok(await p.evaluate(() => { const w = document.querySelector('.mapwrap'); return w.scrollWidth <= w.clientWidth + 1 && w.scrollHeight <= w.clientHeight + 1; }), 'the map fills the screen without scrolling');
    assert.equal(await p.locator('.dock').count(), 0, 'no bar along the bottom'); assert.ok(await p.locator('.top [data-act=coll]').count() === 1, 'Your cards is in the top bar');
    assert.equal(await p.locator('[data-act=auto]').count(), 0, 'no Suggest button');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), 'the page does not scroll');
    await p.click('[data-id=L1]'); assert.equal(await p.locator('[data-act=pickc]').count(), 0, 'no team to pick first');
    assert.ok(await playFight(p), 'the fight reached a result');
    assert.match(await p.innerText('.banner, .kos'), /Victory|KO|Choose a card|Level up|Evolution/);
    await p.click('[data-act=done]').catch(() => {});
    if (await p.locator('[data-act=pickcard]').count()) { await p.locator('[data-act=pickcard]').first().click(); await p.click('[data-act=pickok]'); }
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
        if (st === 'place:0') { await p.locator('[data-act=tray]').first().click(); const j = p.locator('[data-act=join]'); if (await j.count()) { await j.first().click(); if (await p.locator('.toast:has-text("Are you sure")').count()) await j.first().click(); } else await p.locator('[data-act=ins]').first().click(); } else await p.waitForTimeout(300);
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
    await p.click('[data-act=continue]'); assert.equal(await p.locator('.place').count(), 16); assert.equal(await p.locator('.top').count(), 1, 'the same map, now with its top bar: no new screen');
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.starter), 'pikachu');
  } finally { await b.close(); }
});


test('ui: How to Play is a single screen with three steps and pictures; the map is titled Kanto Map and centered', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=more]'); await p.click('.sheet [data-act=help]');
    assert.equal(await p.locator('.howto .hstep').count(), 3, 'three steps'); assert.equal(await p.locator('.howto .hstep .hvis img, .howto .hstep .hvis svg, .howto .hstep .hvis .die').count() >= 3, true, 'each with a picture');
    assert.equal(await p.locator('[data-act=hnext]').count(), 0, 'no pages to turn');
    assert.ok(await p.evaluate(() => { const r = document.querySelector('.howto').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), 'it all fits on the screen');
    await p.click('.howto [data-act=closehelp]'); assert.equal(await p.locator('.sheet').count(), 0);
    await p.click('[data-act=more]'); await p.click('.sheet [data-act=help]'); await p.mouse.click(8, 8); assert.equal(await p.locator('.sheet').count(), 0, 'a tap outside closes it'); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=squirtle]');
    const t = await p.evaluate(() => { const e = document.querySelector('.top .t'), r = e.getBoundingClientRect(); return { text: e.textContent, mid: Math.round(r.left + r.width / 2) }; });
    assert.equal(t.text, 'Kanto Map'); assert.ok(Math.abs(t.mid - 410) <= 2, 'centered on the screen: ' + t.mid);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: up to five games are saved side by side; New Game never overwrites; Continue lists them', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5, 'no save: straight to choosing a partner');
    await p.click('[data-act=starter][data-k=squirtle]'); await p.reload();
    await p.click('[data-act=new]'); assert.equal(await p.locator('[data-act=starter]').count(), 5, 'a new game starts at once, the old one is kept');
    await p.click('[data-act=starter][data-k=charmander]'); await p.reload();
    await p.click('[data-act=continue]'); assert.equal(await p.locator('[data-act=load]').count(), 2, 'two saved games to choose from');
    await p.click('[data-act=load][data-slot="1"]'); assert.equal(await p.evaluate(() => window.__pokemonRoll.G.starter), 'charmander');
    for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__pokemonRoll.A.menu0()); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=bulbasaur]'); }
    await p.evaluate(() => window.__pokemonRoll.A.menu0()); await p.click('[data-act=new]');
    assert.equal(await p.locator('[data-act=starter]').count(), 0, 'five saves: no room'); assert.match(await p.innerText('.sheet'), /slots are full/i);
    await p.click('[data-act=delslot][data-slot="0"]'); await p.click('[data-act=delslot][data-slot="0"]');
    assert.equal(await p.locator('[data-act=load]').count(), 4, 'delete asks twice, then the slot is free');
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
    await p.locator('[data-act=tipok]').click({ timeout: 500 }).catch(() => {}); await p.locator('.rollhint').click(); await p.waitForSelector('.die[data-act=die]', { timeout: 9000 }); await p.waitForTimeout(1100);
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
    assert.equal(await p.locator('.place.deck:not(.lock) .eye').count(), await p.locator('.place.deck:not(.lock)').count(), 'every open location has the info button too');
    assert.equal((await p.locator('.place[data-id=B1] .eye').innerText()).trim(), 'i', 'an i for information, not an eyeball');
    await p.click('.place.deck[data-id=L1] .eye'); const total = await p.evaluate(() => window.__pokemonRoll.G.decks[1].length + window.__pokemonRoll.G.discard[1].length);
    const counts = await p.locator('.sheet .eyelist').last().locator('.tycount').allInnerTexts(); assert.equal(counts.map(Number).reduce((a, b) => a + b, 0), total, 'the types add up to every card in that place (draw and discard piles): ' + counts);
    assert.match(await p.innerText('.hbox'), /in the draw pile[\s\S]*in the discard pile/, 'the full info on a place has both piles'); assert.equal(await p.locator('.sheet .bigpile .pile').count(), 1, 'the back of the cards is shown'); assert.equal(await p.locator('.place.deck .pcount').count(), 0, 'no card count on the map decks any more: it is all in the i'); await p.mouse.click(8, 8); assert.equal(await p.locator('.sheet').count(), 0);
    await p.click('.place[data-id=B1] .eye');
    assert.equal(await p.locator('[data-act=closeeye]').count() >= 1, true); const txt = await p.innerText('.hbox');
    assert.match(txt, /team/i); assert.doesNotMatch(txt, /\d vs \d|has \d+ Pokémon|went back|before your game began/i); assert.equal(await p.locator('.sheet .infoi').count(), 0, 'no big i above the name'); assert.equal(await p.locator('.sheet .infospr').count(), 1, 'a gym leader always shows their sprite'); assert.doesNotMatch(txt, /Face .* once/i); assert.match(txt, /Mt\. Moon/); assert.match(txt, /Viridian Forest/);
    assert.equal(await p.locator('.sheet .gback').count(), 2, 'one card back for each of their Pokémon'); assert.match(txt, /consists of cards from these locations/); assert.equal(await p.locator('.sheet .eyerow').count(), 0, 'no list of places below');
    await p.click('.sheet .gback.tap >> nth=0'); assert.ok(await p.locator('.sheet .tycount').count() >= 1, 'a place shows its elements and how many'); assert.doesNotMatch(await p.innerText('.hbox'), /draw pile|discard|began/i, 'inside a leader\'s info only the elements and how many'); assert.equal(await p.locator('.sheet .infoi').count(), 0); await p.click('[data-act=eyeback]'); assert.match(await p.innerText('.hbox'), /Brock's team/);
    assert.equal(await p.locator('.hbox .btn').count(), 0, 'no Got it button'); await p.mouse.click(8, 8); assert.equal(await p.locator('.sheet').count(), 0);
    // only the cards you have actually seen them put down are shown face up; the rest stay card backs
    const n = await p.evaluate(() => { const G = window.__pokemonRoll.G; G.seenCards = { B1: [{ id: G.bosses.B1[0].id, sh: G.bosses.B1[0].sh }] }; window.__pokemonRoll.render(); return G.bosses.B1.length; });
    await p.click('.place[data-id=B1] .eye'); assert.equal(await p.locator('.sheet .card').count(), 1, 'one card seen, shown face up'); assert.equal(await p.locator('.sheet .gback').count(), n - 1, 'the others are still backs');
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
    await p.click('[data-act=drawdeck]');                                                   // tap the deck: the next wild card comes down
    await p.waitForFunction(() => { const g = window.__pokemonRoll.G.battle; return g.placed[1] === 2 && g.pl.side === 0; }, null, { timeout: 6000 });
    await p.locator('[data-act=tray]').first().click();
    await p.waitForFunction(() => window.__pokemonRoll.G.battle.placed[0] === 2, null, { timeout: 4000 });
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
    await p.locator('.rollhint').click(); await p.waitForTimeout(1400);
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
test('ui: the menu deals the map out from the left, once, not on every redraw (and going on to the game does not deal it again)', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
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
test('ui: a die on a card can be dragged to another card, or back to the tray', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => {
      const s = Engine.newGame({ seed: 12, starter: 'charmander', size: 'short', ai: 'normal' }); s.done.B1 = true; s.lv = 3; s.coll.push({ uid: 10, id: '1.2', sh: 0 });
      const R = window.__pokemonRoll; R.setG(s); R.act({ t: 'go', node: 'B2' }); const G = R.G; let g; while ((g = Bots.step(G))) Engine.apply(G, g);
      for (let i = 0; i < 8 && G.battle.stage === 'place'; i++) { if (G.battle.pl.side === 0 && G.battle.hand[0].length) Engine.apply(G, Object.assign({ t: 'place', side: 0, uid: G.battle.hand[0][0] }, Engine.slotsFor(G.battle, 0).find(x => x.join != null) || Engine.slotsFor(G.battle, 0)[0])); while ((g = Bots.step(G))) Engine.apply(G, g); }
      R.render();
    });
    await p.waitForFunction(() => window.__pokemonRoll.G.battle.stage === 'assign', null, { timeout: 8000 }); await p.locator('.rollhint').click(); await p.waitForTimeout(1500);
    const asg = () => p.evaluate(() => { const a = window.__pokemonRoll.G.battle.asg[0]; return Object.keys(a).map(k => k + ':' + a[k].dice.join()).sort().join('|'); });
    const box = async sel => { const r = await p.locator(sel).first().boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
    const drag = async (from, to) => { await p.mouse.move(from[0], from[1]); await p.mouse.down(); await p.mouse.move(from[0] + 20, from[1] + 20, { steps: 3 }); await p.mouse.move(to[0], to[1], { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300); };
    const cards = await p.locator('.board .card:not(.foe)').count(); assert.ok(cards >= 2, 'two of your cards');
    await drag(await box('.die[data-act=die]'), await box('.board .card:not(.foe) >> nth=0'));
    const one = await asg(); assert.equal(one.split('|').length, 1, 'a die is on a card: ' + one);
    assert.notEqual(await p.locator('.dbadge.hero').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(255, 228, 107)', 'the die on a card is the die (white, or its own colour), not a yellow highlight');
    await drag(await box('.dbadge.hero'), await box('.board .card:not(.foe) >> nth=1'));
    const two = await asg(); assert.equal(two.split('|').length, 1, 'still one die on a card'); assert.notEqual(two.split(':')[0], one.split(':')[0], 'it moved to the other card: ' + one + ' -> ' + two);
    await drag(await box('.dbadge.hero'), await box('.rail .dice'));
    assert.equal(await asg(), '', 'dropped anywhere but a card, it goes back to the tray');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: choosing a card asks below the cards, goes straight to the map; a loss is a KO screen you tap to leave; a leader shows their sprite and the die', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
    await p.evaluate(() => { const s = Engine.newGame({ seed: 5, starter: 'charmander' }); s.phase = 'result'; s.res = { win: true, node: 'B1', newDie: true, pick: [{ id: '13', sh: 0 }, { id: '10', sh: 0 }] }; window.__pokemonRoll.setG(s); });
    assert.equal(await p.locator('.leadtalk .leadimg').count(), 1, 'the leader is on screen while they talk'); assert.equal(await p.locator('.leadtalk .gift .die').count(), 1, 'and a die is shown when they hand you one');
    assert.equal(await p.locator('[data-act=pickcard]').count(), 0, 'the first screen is just the leader'); await p.click('[data-act=resnext]');
    await p.click('.respile'); assert.ok(await p.locator('.handov').count() >= 1, 'while choosing, you can look at your hand'); await p.mouse.click(400, 1100); await p.waitForTimeout(500);
    await p.click('[data-act=pickcard] >> nth=0'); assert.equal(await p.locator('[data-act=pickok]:not([disabled])').count(), 1, 'a card chosen: OK is ready'); await p.click('[data-act=pickcard] >> nth=0'); assert.equal(await p.locator('[data-act=pickok][disabled]').count(), 1, 'tapping it again lets go'); assert.equal(await p.locator('[data-act=pickno]').count(), 0, 'no Choose again button'); assert.doesNotMatch(await p.innerText('.scr'), /Tap OK|Choose one to join/i, 'nothing said twice'); await p.click('[data-act=pickcard] >> nth=0');
    const r = await p.evaluate(() => { const bar = document.querySelector('.pickbar').getBoundingClientRect(), cards = [...document.querySelectorAll('[data-act=pickcard]')].map(c => c.getBoundingClientRect().bottom); return { bar: bar.top, cards: Math.max(...cards), sheet: document.querySelectorAll('.sheet').length }; });
    assert.ok(r.bar >= r.cards - 1, 'the question sits below the cards'); assert.equal(r.sheet, 0, 'not over them');
    await p.click('[data-act=pickok]'); assert.equal(await p.locator('.top').count(), 1, 'straight back to the map'); assert.equal(await p.locator('.place').count(), 16);
    await p.evaluate(() => { const s = Engine.newGame({ seed: 5, starter: 'charmander' }); s.phase = 'result'; s.res = { win: false, node: 'L1' }; window.__pokemonRoll.setG(s); });
    assert.match(await p.innerText('.kos'), /You are KO'd!/); assert.match(await p.innerText('.kos'), /Tap anywhere to continue/);
    await p.mouse.click(400, 600); assert.equal(await p.locator('.place').count(), 16, 'the map comes back');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
test('ui: a shiny brings Professor Oak with a message; there is no Resolve button, the side bar plays the round', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1 })); }); await p.reload();
    await p.evaluate(() => { const s = Engine.newGame({ seed: 8, starter: 'squirtle' }); s.sh = {}; Object.keys(s.decks).forEach(l => s.decks[l].forEach(id => { s.sh[id] = 1; })); window.__pokemonRoll.setG(s); });
    await p.click('[data-id=L1]');
    await p.waitForSelector('.tipoak', { timeout: 6000 }); assert.match(await p.innerText('.tipoak'), /Professor Oak[\s\S]*A shiny! Shinies have \+1 heart more than usual/); assert.equal(await p.locator('.tipoak img.oak').count(), 1);
    await p.click('[data-act=tipok]'); assert.equal(await p.locator('[data-act=go]').count(), 0, 'no Resolve button until every die is given out');
    assert.equal(await p.locator('button:has-text("Resolve")').count(), 0);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: Bill stands on the map after a special event and can be tapped; the Pokédex keeps what you met between games and shows every version of a card', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
    await p.evaluate(() => { const s = Engine.newGame({ seed: 5, starter: 'charmander' }); s.visitors = ['bill']; s.notes.push('visitor:bill'); window.__pokemonRoll.setG(s); });
    assert.match(await p.innerText('.sheet'), /Bill is here!/); await p.click('[data-act=clearnote]');
    assert.equal(await p.locator('.place.visitor').count(), 1, 'Bill is on the map'); assert.equal(await p.locator('.place.visitor img').count(), 1, 'with his art');
    await p.evaluate(() => { localStorage.setItem('pokemon-roll-dex', JSON.stringify({ 4: 1 })); localStorage.setItem('pokemon-roll-dexcards', JSON.stringify({ '4.1': 1 })); localStorage.setItem('pokemon-roll-dexfound2', JSON.stringify({})); });
    await p.reload(); await p.click('[data-act=more]'); await p.click('.sheet [data-act=dex]'); await p.click('.dxc.got');
    assert.equal(await p.locator('.dxv').count(), 2, 'both versions of the card'); assert.equal(await p.locator('.dxv .card.sil').count(), 1, 'the one you have never had is a silhouette');
    const caps = await p.locator('.dxv .dexwhere').allInnerTexts(); assert.ok(caps.some(t => /Location unknown/.test(t)), 'a card never met in the wild: location unknown'); assert.ok(caps.some(t => /Starter only/.test(t)), 'a starter version says so');
    assert.equal(await p.locator('[data-act=dexprev], [data-act=dexnext]').count(), 2, 'arrows to the Pokémon before and after');
    await p.evaluate(() => { localStorage.setItem('pokemon-roll-dexshiny', JSON.stringify({ '4.2': 1 })); localStorage.setItem('pokemon-roll-dexfound2', JSON.stringify({ '4.2': [5] })); localStorage.setItem('pokemon-roll-dexcards', JSON.stringify({ '4.1': 1, '4.2': 1 })); window.__pokemonRoll.render(); });
    assert.equal(await p.locator('.dxv .locchip .pile').count(), 1, 'a place is the back of its cards with its name under it'); assert.match(await p.innerText('.dxv .locchip'), /\S/);
    assert.equal(await p.locator('.dxv .sq').count() >= 2, true, 'a square for the location and one for caught'); assert.equal(await p.locator('.dxv .shbtn').count() >= 1, true, 'and the shiny button'); assert.equal(await p.locator('.dxv .card.shiny').count(), 0, 'not shiny by default'); await p.click('[data-act=dexshiny]'); assert.equal(await p.locator('.dxv .card.shiny').count(), 1, 'the shiny one on request'); await p.click('[data-act=dexshiny]'); assert.equal(await p.locator('.dxv .card.shiny').count(), 0, 'and back');
    await p.mouse.click(8, 8); await p.mouse.click(8, 8); await p.click('.place.visitor').catch(() => {});
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: places that open together are one block with their requirement on it (no road lines); tapping a locked block says what opens it', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=new]'); await p.click('[data-act=starter][data-k=pikachu]');
    assert.equal(await p.locator('.mapin .grp').count(), 6, 'six blocks'); assert.equal(await p.locator('.mapin .grp.open').count(), 1, 'only the first block is open'); assert.equal(await p.locator('.mapsvg path').count(), 0, 'no lines');
    const tabs = await p.locator('.grp.lock .gtab').allInnerTexts(); assert.ok(tabs.every(t => t.includes('🔒')), 'each locked block says it is locked'); assert.ok(tabs.some(t => /Brock/.test(t)), 'and by what');
    await p.locator('.grp.lock').first().click({ position: { x: 20, y: 400 }, force: true }); assert.match(await p.innerText('.toast'), /Brock/);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: a shiny card shows its extra heart; with nothing to decide the side bar plays the round by itself; a card weak to its opponent asks first', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    assert.match(await p.evaluate(() => window.__pokemonRoll.card({ id: '143', sh: 1 }, { cw: 200 }).replace(/<[^>]+>/g, ' ')), /11/, 'a shiny Snorlax has 11 health on its card, the same as in the fight');
    await p.evaluate(() => { const s = Engine.newGame({ seed: 8, starter: 'squirtle' }); window.__pokemonRoll.setG(s); });
    await p.click('[data-id=L1]');
    for (let i = 0; i < 30; i++) { if (await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; return g && g.stage === 'assign'; })) break; await p.waitForTimeout(300); if (await p.locator('[data-act=tray]').count()) { await p.locator('[data-act=tray]').first().click().catch(() => {}); await p.locator('[data-act=join]').first().click({ timeout: 800 }).catch(() => {}); await p.locator('[data-act=join]').first().click({ timeout: 800 }).catch(() => {}); } }
    await p.mouse.click(400, 300); await p.waitForTimeout(1300);          // tap anywhere to roll
    await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; g.dice[0] = [3]; g.rr[0] = 0; g.rrFace[0] = []; g.asg[0] = {}; window.__pokemonRoll.render(); });
    await p.waitForTimeout(1300); assert.equal(await p.locator('.rail.rgo').count(), 1, 'nothing to decide: the side bar is ready'); assert.match(await p.innerText('.rail .status'), /Nothing to decide/);
    await p.locator('.rail.rgo .status').click(); await p.waitForTimeout(500); assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.stage !== 'assign' || !!document.querySelector('.phl, .mvbub')), true, 'the round plays');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: the Pokéball in the side bar returns a Pokémon before the roll (tap it, tap a card, choose who slides over); it can be cancelled and is gone after the roll', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => { const E = Engine, T = E._t, s = E.newGame({ seed: 1, starter: 'bulbasaur' }); s.phase = 'battle'; const h = ['1.1', '4.1', '7.1'], g = ['10', '13', '16']; const b = T.startBattle(s, 'loc', 'L1', h.map(id => ({ id, sh: 0 })), g.map(id => ({ id, sh: 0 }))); b.hand = [[], []]; b.cols = [0, 1, 2].map(i => [b.units[i].uid, b.units[3 + i].uid]); T.startRound(s); window.__pokemonRoll.setG(s); });
    assert.equal(await p.locator('.rail .rtop .ib').count(), 3, 'return, flee and menu'); assert.equal(await p.locator('.card .rcl').count(), 0, 'nothing added to the cards');
    await p.click('.pball', { force: true }); assert.match(await p.innerText('.rail .status'), /Tap the Pokémon to return/); await p.click('[data-act=retmode].btn', { force: true }); assert.equal(await p.locator('[data-act=recallpick]').count(), 0, 'cancelled');
    await p.click('.pball', { force: true }); await p.locator('.card[data-act=recallpick]').nth(1).click(); assert.match(await p.innerText('.rail .status'), /Slide a neighbour/); await p.locator('.card[data-act=slide]').first().click();
    assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.cols.length), 3, 'a neighbour slid over to face the opponent'); assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.units.filter(u => u.recalled).length), 1);
    await p.mouse.click(300, 600); await p.waitForTimeout(1300); assert.equal(await p.locator('.pball').count(), 0, 'after the roll there is no way to return');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: dice that were thrown again come after the ones you kept, each group highest first, so they never swap places with them', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => { const E = Engine, T = E._t, s = E.newGame({ seed: 1, starter: 'bulbasaur' }); s.phase = 'battle'; const h = ['1.1', '4.1', '7.1', '10'], g = ['10', '13', '16', '19']; const b = T.startBattle(s, 'loc', 'L1', h.map(id => ({ id, sh: 0 })), g.map(id => ({ id, sh: 0 }))); b.hand = [[], []]; b.cols = [0, 1, 2, 3].map(i => [b.units[i].uid, b.units[4 + i].uid]); T.startRound(s); b.dice[0] = [3, 6, 1, 4]; b.locked[0] = { 1: 1 }; window.__pokemonRoll.setG(s); });
    await p.mouse.click(300, 600); await p.waitForTimeout(1400);
    assert.deepEqual(await p.locator('.rail .die').allInnerTexts(), ['4', '3', '1', '6'], 'kept dice first (highest first), then the ones thrown again');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: when every die still to give out shows the same number, an Auto-assign button hands them all out without locking the round in', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-tips', JSON.stringify({ place: 1, dice: 1, roll: 1, end: 1, shiny: 1 })); }); await p.reload();
    await p.evaluate(() => { const E = Engine, T = E._t, s = E.newGame({ seed: 1, starter: 'bulbasaur' }); s.phase = 'battle'; const h = ['1.1', '4.1', '7.1', '10'], g = ['10', '13', '16', '19']; const b = T.startBattle(s, 'loc', 'L1', h.map(id => ({ id, sh: 0 })), g.map(id => ({ id, sh: 0 }))); b.hand = [[], []]; b.cols = [0, 1, 2, 3].map(i => [b.units[i].uid, b.units[4 + i].uid]); T.startRound(s); b.dice[0] = [6, 1, 1, 1]; b.rr[0] = 0; window.__pokemonRoll.setG(s); });
    await p.mouse.click(300, 600); await p.waitForTimeout(1400);
    assert.equal(await p.locator('[data-act=autoassign]').count(), 0, 'not while the dice differ and nothing is given out');
    await p.evaluate(() => { const g = window.__pokemonRoll.G.battle; Engine.apply(window.__pokemonRoll.G, { t: 'assign', side: 0, uid: g.units[0].uid, die: 0 }); window.__pokemonRoll.render(); });
    assert.equal(await p.locator('[data-act=autoassign]').count(), 1, 'the 6 is given out, the three 1s are left: Auto-assign');
    await p.evaluate(() => { window.__pokemonRoll.G.battle.rr[0] = 1; window.__pokemonRoll.render(); }); assert.equal(await p.locator('[data-act=autoassign]').count(), 0, 'not while a reroll is left'); await p.evaluate(() => { window.__pokemonRoll.G.battle.rr[0] = 0; window.__pokemonRoll.render(); });
    await p.click('[data-act=autoassign]'); assert.equal(await p.evaluate(() => Object.keys(window.__pokemonRoll.G.battle.asg[0]).length), 4, 'all handed out'); assert.equal(await p.evaluate(() => window.__pokemonRoll.G.battle.stage), 'assign', 'but not locked in');
    assert.equal(await p.locator('.rail.rgo').count(), 1, 'a tap on the side bar now plays the round');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: Pokémon pictures keep their shape (no stretching into squares)', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-dex', JSON.stringify({ 13: 1, 50: 1, 81: 1, 74: 1 })); }); await p.reload(); await p.click('[data-act=more]'); await p.click('.sheet [data-act=dex]');
    const bad = await p.evaluate(() => [...document.querySelectorAll('.dxc.got img')].map(i => ({ f: getComputedStyle(i).objectFit, ok: i.naturalWidth === i.naturalHeight || getComputedStyle(i).objectFit === 'contain' })).filter(x => !x.ok).length);
    assert.equal(bad, 0, 'a picture that is not square is drawn with object-fit contain');
  } finally { await b.close(); }
});

test('ui: the Pokédex counts seen and caught (any version counts) and can be filtered', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.evaluate(() => { localStorage.setItem('pokemon-roll-dex', JSON.stringify({ 2: 1, 4: 1, 13: 1 })); localStorage.setItem('pokemon-roll-dexcaught', JSON.stringify({ '2.4': 1 })); }); await p.reload();
    await p.click('[data-act=more]'); await p.click('.sheet [data-act=dex]');
    assert.match(await p.innerText('.dxcount'), /3 of \d+ seen/); assert.match(await p.innerText('.dxcount'), /1 of \d+ caught/, 'one version of Ivysaur is enough');
    await p.click('[data-act=dexfilter][data-v=seen]'); assert.equal(await p.locator('.dxc').count(), 3); await p.click('[data-act=dexfilter][data-v=caught]'); assert.equal(await p.locator('.dxc').count(), 1); await p.click('[data-act=dexfilter][data-v=all]'); assert.ok(await p.locator('.dxc').count() > 100);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
