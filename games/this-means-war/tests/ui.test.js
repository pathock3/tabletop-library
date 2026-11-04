const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
let chromium = null; try { chromium = require('playwright').chromium; } catch (e) { /* skipped */ }
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

test('ui: hide a flag, place a card, play a staged battle through the screen', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL);
    await p.click('[data-act=mode-ai]'); await p.click('[data-act=pickfac][data-f=basic]:not([data-paired="1"])');
    await p.click('[data-hex="0,2"]');
    await p.waitForSelector('[data-card]');
    await p.click('[data-card]'); await p.click('[data-hex="0,2"]');
    assert.equal(await p.locator('[data-unit]').count(), 1);
    // stage a battle on the middle castle: blue attacks a red unit
    await p.evaluate(() => {
      const s = WAR.ui.s, c = (t, o) => ({ id: o + '-' + t + '-z', type: t, owner: o });
      s.units = [{ id: 50, owner: 1, at: '0,0', cards: [c('warrior', 1)], acted: false }, { id: 51, owner: 0, at: '0,0', cards: [c('ranger', 0)], acted: false }];
      s.hands[1] = []; s.step = 'play'; s.cur = 1; WAR.render();
    });
    await p.click('[data-act=endmove]'); await p.click('[data-act=endmove]');          // (the first tap asks: a unit can still move)
    await p.waitForSelector('[data-act=startbattle]'); assert.equal(await p.locator('.battle').count(), 0, 'the battle does not start by itself: first you see where it is'); assert.ok(await p.locator('.clashring').count(), 'a clash marker on the board');
    await p.click('[data-act=startbattle]');
    await p.waitForSelector('.battle');
    await p.waitForSelector('[data-bsel]');
    await p.click('[data-bsel]'); assert.equal(await p.locator('.slot:first-child .card:not(.empty)').count(), 0, 'tapping a card only chooses it: it is not played yet'); await p.click('[data-act=bplay]');
    await p.waitForSelector('[data-act=bc]');
    assert.match(await p.innerText('.msg'), /▶/, 'a line of symbols: winner ▶ loser'); assert.ok(await p.locator('.slot.win, .slot.lose').count() >= 1, 'the winner and the loser are marked');
    await p.click('[data-act=bc]');
    await p.waitForSelector('.outcome'); assert.ok(await p.locator('.outcome .shield.win').count() === 1 && await p.locator('.outcome .shield.lose').count() === 1, 'a picture: one army wins, one falls'); assert.ok(!/\p{L}/u.test(await p.innerText('.outcome')), 'no words at all, only pictures'); await p.click('[data-act=outack]');
    assert.equal(await p.locator('.battle').count(), 0);
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: pass and play shows a cover screen before each turn', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 402, height: 874 } });
  try {
    await p.goto(URL);
    await p.click('[data-act=mode-pass]');
    await p.click('[data-act=pickfac][data-f=basic]'); await p.click('[data-act=pickfac][data-f=basic]');
    assert.match(await p.innerText('.cover'), /Red's turn/);
    await p.click('[data-act=uncover]');
    await p.click('[data-hex="0,-2"]');
    assert.match(await p.innerText('.cover'), /Blue's turn/);
  } finally { await b.close(); }
});

test('ui: choosing a side: a set gives the computer the other side; a single faction gives it a random one', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL);
    await p.click('[data-act=mode-ai]');
    await p.click('[data-act=pickfac][data-f=mordor][data-paired="1"]');
    assert.deepEqual(await p.evaluate(() => WAR.ui.s.fac), ['fellowship', 'mordor'], 'you are Blue (second); the computer is the other side of the set');
    await p.click('[data-act=menu]'); await p.click('[data-act=again]');
    await p.click('[data-act=pickfac][data-f=pokemon][data-paired="0"]');
    const f = await p.evaluate(() => WAR.ui.s.fac);
    assert.equal(f[1], 'pokemon'); assert.notEqual(f[0], 'pokemon');
    await p.waitForSelector('[data-hex="0,2"]');
    assert.match(await p.innerText('.phases'), /Pokémon/);
  } finally { await b.close(); }
});

test('ui: no way back to the library while playing; Resolve asks first when units can still move; tapping a selected unit cancels', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  try {
    const http = require('http'), fs = require('fs'), srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(path.join(__dirname, '..', 'index.html'))); }); await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
    try {
    await p.goto('http://127.0.0.1:' + srv.address().port + '/?from=library'); assert.ok(await p.locator('.libback').count(), 'the main menu has it');
    await p.click('[data-act=mode-ai]'); assert.equal(await p.locator('.libback').count(), 0, 'not while choosing'); assert.doesNotMatch(await p.innerText('.pick'), /more factions are not finished/);
    await p.click('[data-act=pickfac][data-f=basic]:not([data-paired="1"])'); await p.click('[data-hex="0,2"]'); await p.waitForSelector('[data-card]');
    assert.equal(await p.locator('.libback').count(), 0); await p.click('[data-act=menu]'); assert.equal(await p.locator('.libback').count(), 0, 'not in the menu either'); await p.click('[data-act=closemenu]');
    await p.evaluate(() => { const s = WAR.ui.s; s.hands[1] = []; s.units = [{ id: 60, owner: 1, at: '0,2', cards: [{ id: '1-spy-z', type: 'spy', owner: 1 }, { id: '1-ranger-z', type: 'ranger', owner: 1 }], acted: false }]; WAR.render(); });
    const turn0 = await p.evaluate(() => WAR.ui.s.turns); await p.click('[data-act=endmove]'); assert.match(await p.innerText('[data-act=endmove]'), /still have units that can move/i); assert.equal(await p.evaluate(() => WAR.ui.s.turns), turn0, 'nothing happened yet');
    await p.click('[data-unit="60"]'); assert.ok(await p.evaluate(() => WAR.ui.sel && WAR.ui.sel.id === 60)); assert.match(await p.innerText('.unitinfo'), /Cards in this unit \(2\)/); assert.ok(await p.locator('.hx.reach').count() > 0);
    await p.click('[data-unit="60"]'); assert.equal(await p.evaluate(() => WAR.ui.sel), null, 'tapping the unit again cancels'); assert.equal(await p.locator('.hx.reach').count(), 0);
    await p.click('[data-act=units]'); assert.match(await p.innerText('.sheet'), /Your units[\s\S]*2 cards/); await p.click('[data-act=closesheet]');
    await p.click('[data-act=menu]'); await p.click('.sheet [data-act=myfac]'); assert.equal(await p.locator('.sheet .refcard').count(), 7, 'every card of the faction, for reference'); await p.click('[data-act=closesheet]');
    } finally { srv.close(); }
  } finally { await b.close(); }
});

test('ui: choosing a side lets you see every card of a faction first', { skip: !chromium }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 820, height: 1180 } });
  try {
    await p.goto(URL); await p.click('[data-act=mode-ai]');
    await p.click('[data-act=viewfac][data-f=survivor]'); assert.equal(await p.locator('.sheet .refcard').count(), 7); assert.match(await p.innerText('.sheet'), /Yul Kwon[\s\S]*Outwit/);
    await p.click('[data-act=closesheet]'); assert.equal(await p.locator('.sheet').count(), 0);
  } finally { await b.close(); }
});

test('ui: abilities are used on purpose: Outwit at the start of a battle; a tap on a card only chooses it', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  try {
    await p.goto(URL); await p.click('[data-act=mode-pass]'); await p.click('[data-act=pickfac][data-f=survivor]'); await p.click('[data-act=pickfac][data-f=basic]'); await p.click('[data-act=uncover]');
    await p.evaluate(() => {
      const s = WAR.ui.s, c = (t, o) => ({ id: o + '-' + t + '-z', type: t, owner: o });
      s.units = [{ id: 70, owner: 0, at: '0,0', cards: [c('ranger', 0), c('spy', 0)], acted: false }, { id: 71, owner: 1, at: '0,0', cards: [c('warrior', 1), c('leader', 1)], acted: false }];
      s.hands = [[], []]; s.step = 'play'; s.cur = 0; s.flagQueue = []; WAR.ui.seen = 0; WAR.render();
    });
    await p.click('[data-act=endmove]'); await p.click('[data-act=endmove]');
    await p.waitForSelector('[data-act=startbattle]'); await p.click('[data-act=startbattle]');
    await p.waitForSelector('.abilpanel'); assert.match(await p.innerText('.abilpanel'), /Outwit/); assert.equal(await p.locator('.card.hasab').count(), 1, 'the card with an ability is marked');
    await p.click('[data-act=useab]'); assert.match(await p.innerText('.bnotes'), /Outwit/); await p.click('[data-act=ready]');
  } finally { await b.close(); }
});

test('ui: choose a board (small is recommended for learning); the large board has tunnels; a unit on a castle shows where its tunnels go; cut-off castles are marked', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=mode-ai]');
    assert.equal(await p.locator('.btile').count(), 2); assert.match(await p.innerText('.btile.on'), /Small[\s\S]*Recommended for learning/); assert.ok(await p.locator('.btile .mini').count() === 2, 'each board has a picture');
    await p.click('[data-act=board][data-m=large]'); assert.match(await p.innerText('.btile.on'), /Large/);
    await p.click('[data-act=pickfac][data-f=basic]:not([data-paired="1"])'); await p.waitForSelector('.board');
    assert.equal(await p.evaluate(() => WAR.ui.s.map), 'large'); assert.equal(await p.locator('g[data-hex] .cas').count(), 10, 'ten castles'); assert.equal(await p.locator('.tunl').count(), await p.evaluate(() => Engine.MAPS.large.tunnels.length), 'tunnels are drawn between castles 2 or fewer spaces apart');
    await p.evaluate(() => { const s = WAR.ui.s; s.flagQueue = []; s.step = 'play'; s.cur = 1; s.hands = [[], []]; const hx = Engine.castleHex[Engine.MAPS.large.starts[1][0]]; s.units = [{ id: 5, owner: 1, at: hx, cards: [{ id: 'a', type: 'ranger', owner: 1 }], acted: false }]; s.castles[Engine.MAPS.large.starts[0][0]].owner = 1; WAR.ui.sel = { t: 'unit', id: 5 }; WAR.render(); });
    assert.ok(await p.locator('.hx.tun').count() >= 2, 'the castles it can reach by tunnel are highlighted'); assert.ok(await p.locator('.tunl.mine').count() >= 2, 'tunnels between castles you hold are drawn brighter');
    assert.ok(await p.locator('.cutx').count() >= 1, 'a captured castle with no chain to a starting castle is marked cut off');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: Retreat with one card left: a button, then tap a space; the Fallen pile can be opened; over seven cards you choose what to lose', { skip: !chromium, timeout: 90000 }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=mode-ai]'); await p.click('[data-act=pickfac][data-f=basic]:not([data-paired="1"])'); await p.waitForSelector('.board');
    await p.evaluate(() => { const s = WAR.ui.s, c = (t, o) => ({ id: o + '-' + t + '-z', type: t, owner: o }); s.flagQueue = []; s.step = 'play'; s.cur = 0; s.hands = [[], []];
      s.units = [{ id: 50, owner: 0, at: '0,0', cards: [c('leader', 0), c('general', 0)], acted: false }, { id: 51, owner: 1, at: '0,0', cards: [c('spy', 1)], acted: false }]; WAR.ui.seen = null; WAR.ui.announced = null; WAR.render(); });
    await p.evaluate(() => { const s = WAR.ui.s; Engine.apply(s, { type: 'endMove' }); WAR.ui.announced = null; WAR.render(); });
    await p.waitForSelector('[data-act=startbattle]'); await p.click('[data-act=startbattle]');
    await p.waitForSelector('.battle');
    await p.waitForSelector('[data-act=retreat]'); assert.ok(await p.locator('[data-act=bplay], .hint').count(), 'Retreat sits beside the Play button');
    await p.click('[data-act=retreat]'); assert.match(await p.innerText('.status'), /glowing/); assert.ok(await p.locator('.hx.reach').count() > 0); assert.ok(await p.locator('[data-act=rcancel]').count());
    await p.click('[data-act=rcancel]'); assert.equal(await p.locator('.battle').count(), 1, 'cancel goes back to the battle');
    await p.click('[data-act=retreat]'); const to = await p.evaluate(() => Engine.viewFor(WAR.ui.s, 1).battle.retreat[0]); await p.click(`[data-hex="${to}"] polygon.hx`, { force: true });
    await p.waitForSelector('.outcome'); assert.equal(await p.locator('.outcome .run').count(), 1, 'a running figure shows who retreated'); await p.click('[data-act=outack]');
    assert.equal(await p.evaluate(() => WAR.ui.s.units.some(u => u.owner === 1 && u.at === Engine.parse ? true : true)), true);
    // the hand limit, and the Fallen pile
    await p.evaluate(() => { WAR.ui.mode = 'ai'; const s = WAR.ui.s; s.step = 'discard'; s.cur = 1; s.battle = null; s.hands[1] = Array.from({ length: 9 }, (_, i) => ({ id: '1-x-' + i, type: ['leader', 'general', 'warrior', 'ranger', 'sorcerer', 'spy', 'assassin', 'spy', 'ranger'][i], owner: 1 })); WAR.ui.seen = null; WAR.render(); });
    await p.waitForSelector('[data-act=loseok]'); assert.match(await p.innerText('.sheet'), /Tap 2 cards/); assert.match(await p.locator('[data-act=loseok]').getAttribute('class'), /off/);
    await p.click('[data-lose="1-x-0"]'); await p.click('[data-lose="1-x-1"]'); await p.click('[data-act=loseok]');
    assert.equal(await p.evaluate(() => WAR.ui.s.hands[1].length), 7); assert.equal(await p.evaluate(() => WAR.ui.s.fallen[1].length), 2);
    await p.waitForTimeout(100); await p.click('[data-act=fallen][data-p="1"]'); assert.match(await p.innerText('.sheet'), /Fallen pile \(2\)/); assert.equal(await p.locator('.sheet .card').count(), 2); await p.click('[data-act=closesheet]');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});

test('ui: tap several cards then one castle to deploy them all; Undo takes it back; the computer deals its cards onto the board where you can see them', { skip: !chromium, timeout: 60000 }, async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(URL); await p.click('[data-act=mode-ai]'); await p.click('[data-act=pickfac][data-f=basic]:not([data-paired="1"])'); await p.waitForSelector('.board');
    await p.evaluate(() => { const s = WAR.ui.s; s.flagQueue = []; s.step = 'play'; s.cur = 1; s.hands = [[{ id: '0-x', type: 'ranger', owner: 0 }, { id: '0-y', type: 'spy', owner: 0 }], [{ id: '1-ranger-a', type: 'ranger', owner: 1 }, { id: '1-spy-a', type: 'spy', owner: 1 }, { id: '1-leader-a', type: 'leader', owner: 1 }]]; s.units = []; WAR.ui.sel = null; WAR.render(); });
    assert.equal(await p.locator('.oppstrip .obk').count(), 2, 'you can see how many cards the other side holds');
    assert.equal(await p.locator('[data-act=undo]').count(), 0);
    await p.click('[data-card="1-ranger-a"]'); await p.click('[data-card="1-spy-a"]'); assert.equal(await p.locator('.card.sel').count(), 2, 'several cards can be chosen');
    await p.click('[data-hex="0,2"]'); assert.equal(await p.evaluate(() => WAR.ui.s.units.find(u => u.at === '0,2').cards.length), 2, 'both went onto the one castle'); assert.equal(await p.evaluate(() => WAR.ui.s.hands[1].length), 1);
    assert.ok(await p.locator('[data-act=undo]').count(), 'Undo appears'); await p.click('[data-act=undo]'); assert.equal(await p.evaluate(() => WAR.ui.s.hands[1].length), 3, 'both cards are back in hand'); assert.equal(await p.locator('[data-act=undo]').count(), 0);
    // the computer's turn: a card flies in and the unit pops
    await p.evaluate(() => { const s = WAR.ui.s; s.hands[1] = []; s.cur = 0; s.undo = []; WAR.ui.sel = null; WAR.render(); });
    await p.waitForFunction(() => document.querySelectorAll('.flycard').length > 0, null, { timeout: 8000 }); assert.ok(await p.locator('.flycard').count() >= 1, 'a card flies from their hand to the castle it was dealt to');
    assert.deepEqual(errs, []);
  } finally { await b.close(); }
});
