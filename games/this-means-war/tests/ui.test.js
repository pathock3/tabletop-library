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
    assert.match(await p.innerText('.msg'), /beats/); assert.ok(await p.locator('.slot.win, .slot.lose').count() >= 1, 'the winner and the loser are marked');
    await p.click('[data-act=bc]');
    await p.waitForSelector('.outcome'); assert.match(await p.innerText('.outcome'), /wins/); await p.click('[data-act=outack]');
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
