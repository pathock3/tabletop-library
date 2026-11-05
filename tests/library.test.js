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
