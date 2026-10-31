// Shared helpers for the browser tests (Playwright + the real page, driven by touch taps).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findChromium() {
  const tries = [() => require('playwright'), () => require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))];
  for (const t of tries) { try { return t().chromium; } catch (e) { /* next */ } }
  return null;
}
const chromium = findChromium();
const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const FILE = 'file://' + path.join(__dirname, '..', 'index.html');
const SKIP = { skip: !chromium && 'Playwright/Chromium not available', timeout: 90000 };
const SIZES = { ipadLand: { width: 1024, height: 768 }, ipadPort: { width: 768, height: 1024 }, phone: { width: 390, height: 844 }, phoneLand: { width: 844, height: 390 } };

let browserP = null;
const getBrowser = () => (browserP = browserP || chromium.launch(exe ? { executablePath: exe } : {}));
test.after(async () => { if (browserP) await (await browserP).close(); });

// Most tests ask for reduced motion, which shows a computer's whole turn at once; the animation tests turn that off.
// A stand-in for the Web Audio API that only counts the voices started (window.__voices), so sound can be heard by a test.
const FAKE_AUDIO = () => {
  window.__voices = 0; window.__contexts = 0;
  window.AudioContext = window.webkitAudioContext = class {
    constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 8000; this.destination = {}; window.__contexts++; }
    resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createDynamicsCompressor() { return { threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect() {} }; }
    createBiquadFilter() { return { frequency: {}, connect() {} }; }
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { connect() {}, start() { window.__voices++; }, stop() {} }; }
    createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() { window.__voices++; }, stop() {} }; }
  };
};
async function open({ viewport = SIZES.ipadLand, query = '', animated = false, storage, fakeAudio = false } = {}) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: animated ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage();
  if (fakeAudio) await page.addInitScript(FAKE_AUDIO);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });   // (the shared icons live outside this folder)
  if (storage) await page.addInitScript(s => { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)); } }, storage);
  await page.goto(FILE + query);
  return { page, errors, close: () => ctx.close() };
}

const state = page => page.evaluate(() => {
  const { ui } = window.OneMoreUI, st = ui.st;
  return st ? { screen: ui.screen, cur: st.current, phase: st.phase, table: st.table.length, draw: st.draw.length, scores: Engine.scores(st), over: st.over, hold: !!ui.hold, busy: ui.botBusy, boomsOut: Engine.boomsOut(st), turnNo: st.turnNo, seats: ui.seats.map(s => s.name) } : { screen: ui.screen };
});
// (a boom normally clears itself a moment later: most tests want it to stay until they tap, so the wait is made very long; the test of the automatic clean-up sets it short)
const noGuard = page => page.evaluate(() => { window.OneMoreUI.ui.pace.boomGuardMs = 0; window.OneMoreUI.ui.pace.boomAutoMs = 1e9; });

// Through the real New game screen (Pass and Play, or against the AI). The app only offers two players; a bigger table is started directly (the layout and the rules still have to hold for it).
const setup = async (page, { n = 2, kinds = ['human', 'human'], styles = [] } = {}) => {
  if (n === 2 && kinds[0] === 'human' && kinds[1] === 'human') { await page.tap('[data-act=play]'); await page.tap('[data-act=start-pass]'); }
  else if (n === 2 && kinds[0] === 'human' && kinds[1] === 'computer') { await page.tap('[data-act=play]'); await page.tap('[data-act=start-ai]'); }
  else await start(page, Array.from({ length: n }, (_, i) => ({ kind: kinds[i] || 'human', style: styles[i] || undefined })));
  await noGuard(page);
};
// Starts a game with the seats exactly as given (turn order = the order listed), bypassing the shuffle of seats.
const H = { kind: 'human' }, C = { kind: 'computer' };
const start = async (page, specs) => {
  await page.evaluate(sp => {
    const D = GAME_DATA;
    window.OneMoreUI.newGame(sp.map((s, i) => ({ id: i, name: s.name || (s.kind === 'computer' ? 'Bot ' + (i + 1) : 'Player ' + (i + 1)), kind: s.kind, style: s.style || 'steady', colour: D.seatColours[i] })));
  }, specs);
  await noGuard(page);
};
const errorsOf = e => e.filter(x => !/ERR_FILE_NOT_FOUND/.test(x));

// Puts specific cards on top of the draw pile (the first one given comes off first): 'g' gem, 'b' boom.
const rig = (page, seq) => page.evaluate(seq0 => {
  const st = window.OneMoreUI.ui.st;
  const pick = (want, used) => st.draw.slice().reverse().find(c => !used.has(c) && (want === 'b') === Engine.isBoom(st, c));
  const used = new Set(), top = seq0.map(w => { const c = pick(w, used); used.add(c); return c; });
  st.draw = st.draw.filter(c => !used.has(c)).concat(top.slice().reverse());
  window.OneMoreUI.render();
}, seq);
// Replaces the whole position: draw pile, boom pile, table and every safe pile (card ids: gems 0-37, booms 38-43).
const place = (page, spec) => page.evaluate(sp => {
  const { ui } = window.OneMoreUI, st = ui.st;
  Object.assign(st, { draw: sp.draw || [], boomPile: sp.boomPile || [], table: sp.table || [], safe: st.safe.map((_, i) => (sp.safe && sp.safe[i]) || []) });
  if (sp.current !== undefined) st.current = sp.current;
  const all = [].concat(st.draw, st.boomPile, st.table, ...st.safe).sort((a, b) => a - b);
  if (all.length !== 44 || all.some((c, i) => c !== i)) throw new Error('place(): not every card exactly once');
  window.OneMoreUI.render();
}, spec);
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);        // [a, b)
// Waits until nothing is moving (transitions and animations finished), so positions can be measured.
const settled = page => page.waitForFunction(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity).length === 0);
const sounds = page => page.evaluate(() => window.OneMoreUI.audio.played.slice());

// What a person would tap next, chosen by the steady computer's rule from the public view only.
const plan = page => page.evaluate(() => {
  const { ui } = window.OneMoreUI, st = ui.st;
  const fp = JSON.stringify([Engine.scores(st), st.draw.length, st.phase, st.table.length, st.current, !!ui.hold, st.over]);
  if (st.over) return { sel: null, fp };
  const sel = (ui.botBusy || ui.hold || st.phase === 'boomed') ? '.ztable' : (Bots.decide(Engine.publicView(st, st.current), 'steady') === 'draw' ? '[data-act=draw]' : '.ztable');
  const r = document.querySelector(sel).getBoundingClientRect();
  return { sel, fp, hold: !!ui.hold, x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const nextTap = page => plan(page).then(p => p.sel);
const fingerprint = page => plan(page).then(p => p.fp);
// Plays on by touch taps (the quick way: one tap at the centre of the right thing) until the game is over; returns the number of taps.
async function playToEnd(page, maxTaps = 3000, onTap) {
  let last = null;
  for (let i = 0; i < maxTaps; i++) {
    const p = await plan(page);
    if (!p.sel) return i;
    assert.notEqual(p.fp, last, 'the previous tap did nothing');
    last = p.fp;
    if (onTap) onTap(p);
    await page.touchscreen.tap(p.x, p.y);
  }
  throw new Error('the game did not finish');
}

module.exports = { test, assert, chromium, SKIP, SIZES, open, state, noGuard, setup, start, H, C, errorsOf, rig, place, range, settled, sounds, plan, nextTap, playToEnd, fingerprint };
