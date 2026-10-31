// Browser tests, part 2: whole games, the computers, the menu, saving, prompts, sound and layout.
const { tapTable, test, assert, SKIP, SIZES, open, state, setup, start, errorsOf, rig, place, range, settled, sounds, nextTap, playToEnd, H, C } = require('./browser');

const SAVE = 'tabletop-library-one-more-save', SOUND = 'tabletop-library-one-more-sound', DONE = 'tabletop-library-one-more-games-finished', HINTS = 'tabletop-library-one-more-hints';
const ls = (page, k) => page.evaluate(key => localStorage.getItem(key), k);

// ---------- whole games by taps ----------
test('a full two-player game is played by taps only and ends on a score screen with the winner marked', SKIP, async () => {
  const { page, errors, close } = await open({ query: '?seed=11' });
  try {
    await start(page, [H, H]);
    const taps = await playToEnd(page);
    assert.ok(taps > 20, 'a real game: ' + taps + ' taps');
    await page.waitForSelector('.over');
    const r = await page.evaluate(() => window.OneMoreUI.ui.st.result);
    assert.equal(await page.locator('.over .place').count(), 2);
    assert.ok(await page.locator('.over .place.win').count() >= 1);
    assert.deepEqual(await page.locator('.over .place .ps').allInnerTexts(), r.ranking.map(x => String(x.score)));
    if (r.reason === 'target') assert.ok(Math.max(...r.scores) >= 20);
    assert.match(await page.locator('.over h1').innerText(), /win|tie/i);
    assert.equal(await page.locator('[data-act=again]').count(), 1);
    assert.equal(await page.locator('[data-act=tohome]').count(), 1);
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('a four-seat game with three computers plays through; each computer’s turn waits for a tap; the scores add up to 38', SKIP, async () => {
  const { page, errors, close } = await open({ query: '?seed=21' });
  try {
    await start(page, [{ ...H, name: 'Me' }, { ...C, style: 'careful' }, { ...C, style: 'steady' }, { ...C, style: 'daring' }]);
    let holds = 0;
    await playToEnd(page, 3000, p => { if (p.hold) holds++; });
    await page.waitForSelector('.over');
    assert.ok(holds > 3, 'the computers’ turns each waited for a tap (' + holds + ')');
    const r = await page.evaluate(() => window.OneMoreUI.ui.st.result);
    assert.equal(r.reason, 'all-saved');
    assert.equal(r.scores.reduce((a, b) => a + b, 0), 38);
    assert.equal(await page.locator('.over .place').count(), 4);
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

for (const n of [3, 5, 6]) {
  test(`a ${n}-seat all-human game plays through (3–6 players end when all gems are saved)`, SKIP, async () => {
    const { page, errors, close } = await open({ query: '?seed=' + (30 + n) });
    try {
      await start(page, Array.from({ length: n }, () => H));
      await playToEnd(page);
      await page.waitForSelector('.over');
      assert.equal(await page.evaluate(() => Engine.savedTotal(window.OneMoreUI.ui.st)), 38);
      assert.equal(await page.locator('.over .place').count(), n);
      assert.deepEqual(errorsOf(errors), []);
    } finally { await close(); }
  });
}

test('an all-computer table can be watched: a tap goes on from each turn and the game ends', SKIP, async () => {
  const { page, errors, close } = await open({ query: '?seed=8' });
  try {
    await start(page, [{ ...C, style: 'careful' }, { ...C, style: 'daring' }]);
    await playToEnd(page);
    await page.waitForSelector('.over');
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('play again: the rematch seats the player with the fewest gems first, everyone keeps their colour', SKIP, async () => {
  const { page, close } = await open({ query: '?seed=4' });
  try {
    await start(page, [{ ...H, name: 'Ann' }, { ...H, name: 'Bob' }, { ...H, name: 'Cy' }]);
    await place(page, { current: 2, draw: range(38, 44), table: [37], safe: [range(0, 20), range(20, 29), range(29, 37)] });     // Ann 20, Bob 9, Cy 8 (+1 on the table)
    await tapTable(page);                                  // Cy saves the last gem: game over
    await page.waitForSelector('.over');
    const res = await page.evaluate(() => window.OneMoreUI.ui.st.result);
    assert.deepEqual(res.scores, [20, 9, 9]);
    assert.deepEqual(res.winners, [0]);
    assert.match(await page.locator('.over .next').innerText(), /Bob goes first/);
    await page.tap('[data-act=again]');
    const s = await state(page);
    assert.deepEqual(s.seats, ['Bob', 'Cy', 'Ann'], 'fewest first; the tied seats keep their order');
    assert.equal(s.cur, 0);
    assert.equal(s.over, false);
    assert.equal(await page.locator('.over').count(), 0);
    assert.equal(new Set(await page.evaluate(() => window.OneMoreUI.ui.seats.map(x => x.colour))).size, 3);
    assert.equal(await page.locator('.seat .nm').first().innerText(), 'Bob');
  } finally { await close(); }
});

test('play again, two players: the loser goes first; after a 19–19 tie, the one who went second', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [{ ...H, name: 'Ann' }, { ...H, name: 'Bob' }]);
    await place(page, { current: 1, draw: range(38, 44), table: [37], safe: [range(0, 19), range(19, 37)] });
    await tapTable(page);
    await page.waitForSelector('.over');
    assert.match(await page.locator('.over h1').innerText(), /tie/i);
    assert.equal(await page.locator('.over .place.win').count(), 2, 'both marked');
    assert.deepEqual(await page.locator('.over .place .ps').allInnerTexts(), ['19', '19']);
    assert.match(await page.locator('.over .next').innerText(), /Bob goes first/);
    await page.tap('[data-act=again]');
    assert.deepEqual((await state(page)).seats, ['Bob', 'Ann']);
    await place(page, { current: 0, draw: range(38, 44), table: [37], safe: [range(0, 19), range(19, 37)] });
    await tapTable(page);                                  // Bob (now first) saves: 20 wins at once
    await page.waitForSelector('.over');
    assert.match(await page.locator('.over h1').innerText(), /Bob wins/);
    assert.match(await page.locator('.over .next').innerText(), /Ann goes first/, 'the loser');
  } finally { await close(); }
});

test('game over: a tie with more players is a shared win', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [H, H, H, H]);
    await place(page, { current: 3, draw: range(38, 44), table: [37], safe: [range(0, 12), range(12, 24), range(24, 31), range(31, 37)] });
    await tapTable(page);
    await page.waitForSelector('.over');
    assert.match(await page.locator('.over h1').innerText(), /shared/i);
    assert.equal(await page.locator('.over .place.win').count(), 2);
  } finally { await close(); }
});

// ---------- computers on the table ----------
test('a computer’s turn is shown one draw at a time, then it waits for a tap; that tap releases the hold without also drawing', SKIP, async () => {
  const { page, errors, close } = await open({ animated: true, query: '?seed=2' });
  try {
    await start(page, [H, C]);
    await page.evaluate(() => { Object.assign(window.OneMoreUI.ui.pace, { botStart: 40, botDraw: 90, botSave: 90, afterSave: 40 }); });
    await rig(page, ['g', 'g']);
    await page.tap('[data-act=draw]'); await page.tap('[data-act=draw]');
    await rig(page, ['g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'g']);
    await tapTable(page);                                        // I save; the computer starts
    const seen = await page.evaluate(() => new Promise(resolve => {
      const { ui } = window.OneMoreUI, out = [];
      const t = setInterval(() => {
        const n = ui.st.table.length;
        if (ui.st.current === 1 && (!out.length || out[out.length - 1] !== n)) out.push(n);
        if ((!ui.botBusy && ui.st.current !== 1) || ui.hold) { clearInterval(t); resolve(out); }
      }, 15);
    }));
    assert.ok(seen.length >= 4, 'several steps were visible: ' + seen);
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] - seen[i - 1] <= 1, 'one draw at a time: ' + seen);
    const s = await state(page);
    assert.equal(s.hold, true, 'after saving it waits for a tap');
    assert.equal(s.busy, false);
    assert.match(await page.locator('.narr').innerText(), /banked \d+/);
    assert.ok(s.scores[1] >= 5);
    assert.equal(s.cur, 0, 'the lit seat is already mine');
    await page.tap('[data-act=draw]');                                // ...but a tap only releases the hold; it does not draw
    const s2 = await state(page);
    assert.equal(s2.hold, false);
    assert.equal(s2.table, 0);
    await page.tap('[data-act=draw]');
    assert.equal((await state(page)).table, 1);
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('a tap while a computer is digging skips to the end of its turn (and does not also pass the turn)', SKIP, async () => {
  const { page, close } = await open({ animated: true, query: '?seed=2' });
  try {
    await start(page, [H, C]);
    await page.evaluate(() => { Object.assign(window.OneMoreUI.ui.pace, { botStart: 30, botDraw: 60000, botSave: 60000, afterSave: 30 }); });
    await rig(page, ['g']);
    await page.tap('[data-act=draw]');
    await rig(page, ['g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'g']);
    await tapTable(page);
    await page.waitForFunction(() => window.OneMoreUI.ui.st.current === 1 && window.OneMoreUI.ui.st.table.length >= 1);
    assert.equal((await state(page)).busy, true);
    await tapTable(page);
    const s = await state(page);
    assert.equal(s.busy, false, 'its whole turn was played at once');
    assert.ok(s.hold || s.phase === 'boomed', 'and it waits');
    assert.equal(s.cur, s.hold ? 0 : 1);
  } finally { await close(); }
});

test('a computer that goes boom leaves the boom on the table until I tap, then the next seat is up', SKIP, async () => {
  const { page, close } = await open({ query: '?seed=2' });
  try {
    await start(page, [H, C, H]);
    await rig(page, ['g']);
    await page.tap('[data-act=draw]');
    await rig(page, ['b']);                                           // the computer's first card will be a boom
    await tapTable(page);                                        // I save one; the computer plays at once (reduced motion)
    const s = await state(page);
    assert.equal(s.phase, 'boomed');
    assert.equal(s.cur, 1);
    assert.match(await page.locator('#banner').innerText(), /BOOM/);
    assert.match(await page.locator('.narr').innerText(), /Bot 2 drew a BOOM and lost nothing/);
    await tapTable(page);
    const s2 = await state(page);
    assert.equal(s2.phase, 'turn');
    assert.equal(s2.cur, 2);
    assert.equal(s2.boomsOut, 1);
  } finally { await close(); }
});

test('reduced motion: a computer’s whole turn appears at once, then waits for my tap', SKIP, async () => {
  const { page, close } = await open({ query: '?seed=6' });
  try {
    await start(page, [C, H]);
    const s = await state(page);
    assert.equal(s.busy, false);
    assert.ok(s.hold || s.phase === 'boomed', JSON.stringify(s));
    assert.match(await page.locator('.narr').innerText(), /banked|BOOM/);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('rm')), true);
  } finally { await close(); }
});

test('a new game starts on a clean table: no banner, no leftover cards, no booms out', SKIP, async () => {
  const { page, close } = await open({ query: '?seed=6' });
  try {
    await start(page, [C, H]);
    assert.match(await page.locator('.narr').innerText(), /banked|BOOM/);
    await start(page, [H, H]);
    assert.equal(await page.locator('#banner').innerText(), '');
    assert.equal(await page.locator('.card.lost, .card.atrisk, .card.bang').count(), 0);
    assert.equal(await page.locator('.zboom .pips i.on').count(), 0);
    assert.equal(await page.locator('.zdraw .zcount').innerText(), '44 cards');
    assert.deepEqual(await page.locator('.seat .score').allInnerTexts(), ['0/20', '0/20']);
  } finally { await close(); }
});

// ---------- the menu, help, settings ----------
test('menu: a bigger ☰ opens How to play, Settings, Restart and Main menu (no Sound: it is in Settings); tapping outside closes it; the table underneath is not touched', SKIP, async () => {
  const { page, errors, close } = await open();
  try {
    await start(page, [H, H]);
    await page.tap('[data-act=menu]');
    assert.deepEqual(await page.locator('.menupanel button').allInnerTexts().then(a => a.map(t => t.replace(/\s+/g, ' ').trim())), ['How to play', 'Settings', 'Restart', 'Main menu']);
    const before = JSON.stringify(await state(page));
    await page.tap('[data-act=draw]', { force: true, position: { x: 4, y: 4 } }).catch(() => {});
    assert.equal(JSON.stringify(await state(page)), before, 'a tap behind the menu does nothing');
    await page.mouse.click(900, 600);
    assert.equal(await page.locator('.menupanel').count(), 0, 'closed');
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('settings: sound on/off is remembered on this device', SKIP, async () => {
  const { page, close } = await open({ fakeAudio: true });
  try {
    await start(page, [H, H]);
    await rig(page, ['g', 'g', 'g']);
    await page.tap('[data-act=draw]');
    await page.waitForFunction(() => window.__voices > 0);
    await page.tap('[data-act=menu]');
    await page.tap('[data-act=menu-settings]');
    await page.tap('[data-act=sound][data-v=off]');
    assert.equal(await ls(page, SOUND), 'off');
    await page.tap('[data-act=closesettings]');
    const v = await page.evaluate(() => window.__voices);
    await page.tap('[data-act=draw]'); await page.tap('[data-act=draw]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__voices), v, 'nothing plays while sound is off');
    await page.reload();
    assert.equal(await page.evaluate(() => window.OneMoreUI.audio.isEnabled()), false, 'still off after a reload');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-settings]'); await page.tap('[data-act=sound][data-v=on]');
    assert.equal(await ls(page, SOUND), 'on');
  } finally { await close(); }
});

test('menu: How to play shows three little pictures, the rules in a line, and the judgment calls folded under "fine print"', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [H, H]);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-help]');
    assert.equal(await page.locator('.help .hcard').count(), 3);
    const text = await page.locator('.help').innerText();
    assert.match(text, /Dig/); assert.match(text, /Save/); assert.match(text, /Boom/);
    assert.match(text, /20 gems/); assert.match(text, /19–19/); assert.match(text, /all 38 gems/);
    const n = await page.evaluate(() => GAME_DATA.texts.judgments.length);
    assert.equal(await page.locator('.help details li').count(), n, 'every judgment call is listed');
    assert.equal(await page.locator('.help details[open]').count(), 0, 'folded away');
    await page.tap('.help .bigbtn');
    assert.equal(await page.locator('.help').count(), 0);
    assert.equal((await state(page)).screen, 'play');
  } finally { await close(); }
});

test('menu: Restart asks first and deals a new game at once, Main menu leaves and keeps the game for Continue', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [H, H]);
    await rig(page, ['g', 'g']);
    await page.tap('[data-act=draw]'); await page.tap('[data-act=draw]');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-restart]');
    assert.match(await page.locator('.menupanel').innerText(), /Start this game over\?/);
    await page.tap('[data-act=menu-back]');
    assert.equal((await state(page)).table, 2, 'keep playing: nothing lost');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-restart]'); await page.tap('[data-act=restart-yes]');
    let s = await state(page);
    assert.deepEqual([s.table, s.draw, s.turnNo], [0, 44, 0]);
    assert.equal(s.screen, 'play');
    assert.ok(await ls(page, SAVE), 'the new game is saved');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=leave-yes]');          // Main menu goes straight there: nothing to confirm, the game is kept
    assert.equal((await state(page)).screen, 'home');
    assert.ok(await ls(page, SAVE), 'the game is kept: Continue brings it back');
  } finally { await close(); }
});

test('settings: sound and prompts, reachable from the home screen and the menu, remembered', SKIP, async () => {
  const { page, errors, close } = await open();
  try {
    await page.tap('[data-act=settings]');
    assert.equal(await page.locator('[data-act=sound]').count(), 2);
    assert.equal(await page.locator('[data-act=hints]').count(), 3);
    await page.tap('[data-act=sound][data-v=off]');
    await page.tap('[data-act=hints][data-v=on]');
    await page.tap('[data-act=closesettings]');
    assert.equal(await page.locator('.panel').count(), 0);
    await page.reload();
    assert.equal(await page.evaluate(() => window.OneMoreUI.ui.sound), false);
    assert.equal(await page.evaluate(() => window.OneMoreUI.ui.hints), 'on');
    await start(page, [H, H]);
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-settings]');
    assert.equal(await page.locator('[data-act=hints][data-v=on].on').count(), 1);
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

// ---------- prompts ----------
test('prompts: a one-line hint above the table until this device has finished one game, then quiet; Settings can bring it back', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [H, H]);
    assert.equal(await page.locator('.narr').innerText(), 'Tap the pile to dig.');
    await rig(page, ['g']);
    await page.tap('[data-act=draw]');
    assert.match(await page.locator('.narr').innerText(), /tap Bank/);
    await place(page, { current: 0, draw: range(38, 44), table: [37], safe: [range(0, 19), range(19, 37)] });
    await tapTable(page);                                  // game over: 20 for seat 0
    await page.waitForSelector('.over');
    assert.equal(await ls(page, DONE), '1');
    await page.tap('[data-act=again]');
    assert.equal(await page.locator('.narr').innerText(), '', 'quiet after the first finished game');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-settings]'); await page.tap('[data-act=hints][data-v=on]'); await page.tap('[data-act=closesettings]');
    assert.equal(await page.locator('.narr').innerText(), 'Tap the pile to dig.');
    await page.tap('[data-act=menu]'); await page.tap('[data-act=menu-settings]'); await page.tap('[data-act=hints][data-v=off]'); await page.tap('[data-act=closesettings]');
    assert.equal(await page.locator('.narr').innerText(), '');
  } finally { await close(); }
});

// ---------- save / resume ----------
test('save: reloading the page mid-turn resumes the same game — the table, the piles, whose turn — and play goes on', SKIP, async () => {
  const { page, errors, close } = await open({ query: '?seed=3' });
  try {
    await start(page, [{ ...H, name: 'Ann' }, { ...H, name: 'Bob' }]);
    await rig(page, ['g', 'g', 'g', 'g']);
    await page.tap('[data-act=draw]'); await page.tap('[data-act=draw]'); await tapTable(page);          // Ann saves 2
    await page.tap('[data-act=draw]');                                                                           // Bob has 1 at risk
    const before = await page.evaluate(() => JSON.stringify(Engine.serialize(window.OneMoreUI.ui.st)));
    await page.reload();
    const s = await state(page);
    assert.equal(s.screen, 'play');
    assert.deepEqual([s.cur, s.table, s.scores], [1, 1, [2, 0]]);
    assert.equal(await page.evaluate(() => JSON.stringify(Engine.serialize(window.OneMoreUI.ui.st))), before, 'exactly the same game');
    assert.deepEqual(s.seats, ['Ann', 'Bob']);
    assert.equal(await page.locator('.card.atrisk').count(), 1);
    assert.equal(await page.locator('.zdraw .zcount').innerText(), '41 cards');
    await page.tap('[data-act=draw]'); await tapTable(page);
    assert.equal((await state(page)).scores[1], 2);
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('save: a boom showing survives a reload and still waits for a tap; so does a computer’s finished turn', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [H, H]);
    await rig(page, ['g', 'b']);
    await page.tap('[data-act=draw]'); await page.tap('[data-act=draw]');
    await page.reload();
    let s = await state(page);
    assert.equal(s.phase, 'boomed');
    assert.match(await page.locator('#banner').innerText(), /BOOM/);
    assert.match(await page.locator('.narr').innerText(), /lost 1 gem\b/);
    assert.equal(await page.locator('.card.lost').count(), 1);
    await page.waitForTimeout(500);
    await tapTable(page);
    assert.equal((await state(page)).phase, 'turn');
    // a computer's finished turn
    await start(page, [C, H]);
    s = await state(page);
    assert.ok(s.hold || s.phase === 'boomed');
    await page.reload();
    const t = await state(page);
    assert.deepEqual([t.hold, t.phase], [s.hold, s.phase]);
    assert.match(await page.locator('.narr').innerText(), /banked|BOOM/);
  } finally { await close(); }
});

test('save: starting over, leaving, or finishing a game clears the save', SKIP, async () => {
  const { page, close } = await open();
  try {
    await start(page, [H, H]);
    assert.ok(await ls(page, SAVE));
    await place(page, { current: 0, draw: range(38, 44), table: [37], safe: [range(0, 19), range(19, 37)] });
    await tapTable(page);
    await page.waitForSelector('.over');
    assert.equal(await ls(page, SAVE), null, 'a finished game is not resumed');
    await page.reload();
    assert.equal((await state(page)).screen, 'home');
  } finally { await close(); }
});

test('save: a save from other rules, or a damaged one, is cleared with a quiet note — never a crash', SKIP, async () => {
  for (const [label, mutate, note] of [
    ['other rules', sv => { sv.game.fingerprint = 'zzz'; return JSON.stringify(sv); }, /changed the rules/],
    ['damaged', () => '{"schema":1,"seats":[', /could not be resumed/],
    ['wrong cards', sv => { sv.game.draw = sv.game.draw.slice(1); return JSON.stringify(sv); }, /could not be resumed/],
    ['wrong seats', sv => { sv.seats = sv.seats.slice(1); return JSON.stringify(sv); }, /could not be resumed/],
  ]) {
    const { page, errors, close } = await open();
    try {
      await start(page, [H, H]);
      const sv = JSON.parse(await ls(page, SAVE));
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE, mutate(sv)]);
      await page.reload();
      assert.equal((await state(page)).screen, 'home', label);
      assert.match(await page.locator('.home').innerText(), note, label);
      assert.equal(await ls(page, SAVE), null, label);
      assert.deepEqual(errorsOf(errors), [], label);
    } finally { await close(); }
  }
});

// ---------- sound ----------
test('sound: a card draw ticks and glints (higher with each gem of a run), a save clinks and chimes, a boom booms and rumbles', SKIP, async () => {
  const { page, errors, close } = await open({ fakeAudio: true });
  try {
    await start(page, [H, H]);
    await rig(page, ['g', 'g', 'g', 'b']);
    await page.tap('[data-act=draw]');
    await page.waitForFunction(() => window.OneMoreUI.audio.played.includes('glint'));
    assert.ok((await sounds(page)).includes('draw'));
    await page.tap('[data-act=draw]'); await page.tap('[data-act=draw]');
    await tapTable(page);
    await page.waitForFunction(() => window.OneMoreUI.audio.played.includes('save'));
    const played = await sounds(page);
    assert.equal(played.filter(n => n === 'clink').length, 3, 'one clink for each gem landing in the pile');
    await page.tap('[data-act=draw]');
    await page.waitForFunction(() => window.OneMoreUI.audio.played.includes('boom'));
    await page.waitForFunction(() => window.OneMoreUI.audio.played.includes('rumble'));
    assert.ok(await page.evaluate(() => window.__voices) > 10, 'voices were really started');
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('sound: the shuffle after the 6th boom and the fanfare at the end each have their sound', SKIP, async () => {
  const { page, close } = await open({ fakeAudio: true });
  try {
    await start(page, [H, H, H]);
    for (let i = 0; i < 6; i++) { await rig(page, ['b']); await page.tap('[data-act=draw]'); await tapTable(page); }
    await page.waitForFunction(() => window.OneMoreUI.audio.played.includes('refresh'));
    await place(page, { current: 0, draw: range(38, 44), table: [37], safe: [range(0, 20), range(20, 28), range(28, 37)] });
    await tapTable(page);
    await page.waitForSelector('.over');
    assert.ok((await page.evaluate(() => window.OneMoreUI.audio.played)).includes('win'));
  } finally { await close(); }
});

// ---------- motion ----------
test('motion: cards fly with a transition and a hop, a boom shakes the screen; with reduced motion none of it', SKIP, async () => {
  const a = await open({ animated: true });
  try {
    await start(a.page, [H, H]);
    await rig(a.page, ['g', 'b']);
    await a.page.tap('[data-act=draw]');
    assert.ok(parseFloat(await a.page.evaluate(() => getComputedStyle(document.querySelector('.card')).transitionDuration)) >= 0.3, 'cards glide');
    assert.ok(await a.page.locator('.lift.hop').count() >= 1, 'the drawn card hops as it lands');
    await a.page.tap('[data-act=draw]');
    await a.page.waitForFunction(() => document.getElementById('world').classList.contains('shake'));
    assert.ok(await a.page.locator('.sp').count() > 5, 'sparks fly from the boom');
    assert.equal(await a.page.locator('#banner .big').count(), 1);
  } finally { await a.close(); }
  const r = await open();
  try {
    await start(r.page, [H, H]);
    await rig(r.page, ['g', 'b']);
    await r.page.tap('[data-act=draw]'); await r.page.tap('[data-act=draw]');
    assert.ok(parseFloat(await r.page.evaluate(() => getComputedStyle(document.querySelector('.card')).transitionDuration)) <= 0.02, 'no gliding');
    assert.equal(await r.page.evaluate(() => document.getElementById('world').classList.contains('shake')), false);
    assert.equal(await r.page.locator('.sp, .flash').count(), 0);
    assert.equal(await r.page.locator('#banner .big').count(), 1, 'but the boom is still shown');
  } finally { await r.close(); }
});

test('motion: saving sends the gems to the pile one after another and the score counts up with them', SKIP, async () => {
  const { page, close } = await open({ animated: true });
  try {
    await start(page, [H, H]);
    await rig(page, ['g', 'g', 'g', 'g']);
    for (let i = 0; i < 4; i++) await page.tap('[data-act=draw]');
    const seat = (await state(page)).cur;
    await tapTable(page);
    const shown = await page.evaluate(s => new Promise(resolve => {
      const { ui } = window.OneMoreUI, out = [];
      const t = setInterval(() => { const v = ui.shown[s]; if (!out.length || out[out.length - 1] !== v) out.push(v); if (v === 4) { clearInterval(t); resolve(out); } }, 10);
    }), seat);
    assert.deepEqual(shown, [0, 1, 2, 3, 4], 'the number counts up as the gems land');
    assert.equal(await page.locator(`.seat[data-seat="${seat}"] .score`).innerText().then(t => t.replace(/\D.*$/, '')), '4');
  } finally { await close(); }
});

test('motion: the next player can dig straight away while the saved gems are still landing — nobody is held up', SKIP, async () => {
  const { page, close } = await open({ animated: true });
  try {
    await start(page, [H, H]);
    await rig(page, ['g', 'g', 'g', 'g', 'g']);
    for (let i = 0; i < 4; i++) await page.tap('[data-act=draw]');
    const seat = (await state(page)).cur;
    await tapTable(page);
    await page.tap('[data-act=draw]');                           // the next player digs straight away: not held up
    const s = await state(page);
    assert.equal(s.table, 1);
    assert.equal(s.scores[seat], 4);
  } finally { await close(); }
});

// ---------- layout ----------
const rects = page => page.evaluate(() => {
  const R = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  return {
    vw: innerWidth, vh: innerHeight,
    seats: [...document.querySelectorAll('.seat')].map(s => ({ r: R(s), nm: s.querySelector('.nm').scrollWidth <= s.querySelector('.nm').clientWidth + 1, score: R(s.querySelector('.score')), pile: R(s.querySelector('.pilezone')), seat: +s.dataset.seat })),
    draw: R(document.querySelector('.zdraw')), table: R(document.querySelector('.ztable')), boom: R(document.querySelector('.zboom')), felt: R(document.querySelector('.felt')),
    safe: [...document.querySelectorAll('.card')].map(c => ({ id: +c.dataset.id, r: R(c), op: +c.style.opacity, z: window.OneMoreUI.ui.st.safe.findIndex(p => p.includes(+c.dataset.id)) })).filter(c => c.z >= 0),
    boomCards: [...document.querySelectorAll('.card')].map(c => ({ id: +c.dataset.id, r: R(c), op: +c.style.opacity })).filter(c => window.OneMoreUI.ui.st.boomPile.includes(c.id)),
  };
});
const overlaps = (a, b, tol = 1) => a.l < b.r - tol && b.l < a.r - tol && a.t < b.b - tol && b.t < a.b - tol;
const inside = (a, b, tol = 2) => a.l >= b.l - tol && a.r <= b.r + tol && a.t >= b.t - tol && a.b <= b.b + tol;

for (const [name, viewport] of Object.entries(SIZES)) {
  test(`layout: a six-seat table is clean on ${name} — every seat, name and score fits, piles and cards stay in their places`, SKIP, async () => {
    const { page, errors, close } = await open({ viewport });
    try {
      await start(page, [H, H, H, H, H, H]);
      await place(page, { current: 2, draw: range(25, 33).concat(range(38, 42)), boomPile: [33, 34, 35, 42, 43], table: [36, 37, 24], safe: [range(0, 12), range(12, 17), range(17, 19), range(19, 22), [22], [23]] });
      await settled(page);
      const m = await rects(page);
      const view = { l: 0, t: 0, r: m.vw, b: m.vh };
      assert.equal(m.seats.length, 6);
      for (const s of m.seats) {
        assert.ok(inside(s.r, view, 0), `${name}: seat ${s.seat} is on screen`);
        assert.ok(s.nm, `${name}: seat ${s.seat}'s name is not cut off`);
        assert.ok(inside(s.score, s.r, 1), `${name}: seat ${s.seat}'s score is inside its panel`);
        assert.ok(!overlaps(s.score, s.pile), `${name}: score does not overlap the pile`);
        assert.ok(s.score.w > 12 && s.score.h >= 20, `${name}: the score is big enough (${Math.round(s.score.h)}px tall)`);
      }
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(!overlaps(m.seats[i].r, m.seats[j].r), `${name}: seats ${i} and ${j} do not overlap`);
      for (const z of [m.draw, m.table, m.boom, m.felt]) assert.ok(inside(z, view, 0), `${name}: zone on screen`);
      assert.ok(!overlaps(m.draw, m.table) && !overlaps(m.boom, m.table) && !overlaps(m.draw, m.boom), `${name}: the draw pile, the table and the boom pile do not overlap`);
      for (const s of m.safe) { const seat = m.seats[s.z]; assert.ok(inside(s.r, { l: seat.r.l, t: seat.r.t, r: seat.r.r, b: seat.r.b }, 3), `${name}: saved gem ${s.id} stays inside seat ${s.z}`); }
      for (const c of m.boomCards.filter(c => c.op > 0)) assert.ok(inside(c.r, m.boom, 6) || inside(c.r, m.felt, 2), `${name}: boom pile card ${c.id} inside the felt`);
      const cardsOn = await page.evaluate(() => [...document.querySelectorAll('.card.atrisk')].map(c => { const b = c.getBoundingClientRect(), t = document.querySelector('.ztable').getBoundingClientRect(); return b.left >= t.left - 2 && b.right <= t.right + 2 && b.top >= t.top - 2 && b.bottom <= t.bottom + 2; }));
      assert.deepEqual(cardsOn, [true, true, true]);
      assert.deepEqual(errorsOf(errors), [], name);
    } finally { await close(); }
  });
}

test('layout: the boom banner fits on screen at every size and sits above the cards', SKIP, async () => {
  for (const [name, viewport] of Object.entries(SIZES)) {
    const { page, close } = await open({ viewport });
    try {
      await start(page, [H, H, H, H]);
      await rig(page, ['g', 'g', 'g', 'b']);
      for (let i = 0; i < 4; i++) await page.tap('[data-act=draw]');
      await settled(page);
      const b = await page.evaluate(() => { const r = document.getElementById('banner').getBoundingClientRect(); const g = [...document.querySelectorAll('.card.up')].map(c => c.getBoundingClientRect()); return { r: { l: r.left, t: r.top, r: r.right, b: r.bottom }, vw: innerWidth, vh: innerHeight, cardTop: Math.min(...g.map(x => x.top)) }; });
      assert.ok(b.r.l >= 0 && b.r.r <= b.vw && b.r.t >= 0 && b.r.b <= b.vh, `${name}: the banner is on screen`);
      const text = await page.evaluate(() => [...document.querySelectorAll('#banner .big, #banner .lostn, #banner .go')].map(e => { const r = e.getBoundingClientRect(); return [r.bottom]; }));
      assert.ok(Math.max(...text.map(t => t[0])) <= b.cardTop + 4, `${name}: the banner text sits above the cards (${Math.max(...text.map(t => t[0]))} vs ${b.cardTop})`);
    } finally { await close(); }
  }
});

test('layout: turning the device mid-game re-lays out the table: the gems are still in the table area', SKIP, async () => {
  const { page, errors, close } = await open();
  try {
    await start(page, [H, H]);
    await rig(page, Array(8).fill('g'));
    for (let i = 0; i < 8; i++) await page.tap('[data-act=draw]');
    await page.setViewportSize(SIZES.ipadPort);
    await page.waitForFunction(() => innerWidth === 768);
    await page.waitForTimeout(150);
    await settled(page);
    const ok = await page.evaluate(() => { const t = document.querySelector('.ztable').getBoundingClientRect(); return [...document.querySelectorAll('.card.atrisk')].every(c => { const b = c.getBoundingClientRect(); return b.left >= t.left - 2 && b.right <= t.right + 2 && b.top >= t.top - 2 && b.bottom <= t.bottom + 2; }); });
    assert.ok(ok);
    assert.equal(await page.locator('.card.atrisk').count(), 8);
    assert.deepEqual(errorsOf(errors), []);
  } finally { await close(); }
});

test('touch: the table swallows touch-moves (no rubber-banding); the setup list may scroll', SKIP, async () => {
  const { page, close } = await open({ viewport: SIZES.phone });
  try {
    const move = sel => page.evaluate(s => { const t = document.querySelector(s); const ev = new TouchEvent('touchmove', { cancelable: true, bubbles: true, touches: [new Touch({ identifier: 1, target: t, clientX: 10, clientY: 10 })] }); t.dispatchEvent(ev); return ev.defaultPrevented; }, sel);
    await page.tap('[data-act=play]');
    assert.equal(await move('.sheet'), false, 'setup is a scrolling list');
    await start(page, [H, H]);
    assert.equal(await move('.ztable'), true);
    assert.equal(await move('.seat'), true);
  } finally { await close(); }
});

