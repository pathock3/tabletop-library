const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const build = (env = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-build-'));
  execFileSync('node', [path.join(root, 'tools', 'build.js'), dir], { env: { ...process.env, ...env }, stdio: 'ignore' });
  return dir;
};
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const stamp = html => html.match(/<meta name="build" content="([^"]*)">/)[1];
const games = fs.readdirSync(path.join(root, 'games')).filter(d => fs.existsSync(path.join(root, 'games', d, 'index.html')));

test('build: the library page and every game are built, each stamped with commit, date and branch', () => {
  const dir = build({ WORKERS_CI_COMMIT_SHA: 'abcdef1234567', WORKERS_CI_BRANCH: 'claude/test-branch' });
  const pages = ['index.html', ...games.map(g => `games/${g}/index.html`)];
  assert.ok(games.includes('fossil-frenzy'));
  for (const rel of pages) {
    assert.match(stamp(read(dir, rel)), /^abcdef1 · \d{4}-\d\d-\d\d · preview: claude\/test-branch$/, rel);
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(read(dir, rel).length - src.length, stamp(read(dir, rel)).length - '__BUILD__'.length, rel + ': only the stamp changes');
  }
});

test('build: only the pages and the icons are published (no tests, docs or tools)', () => {
  const dir = build();
  const files = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.relative(dir, path.join(d, e.name)))));
  walk(dir);
  const icons = fs.readdirSync(path.join(root, 'assets')).filter(f => f.endsWith('.png'));
  assert.deepEqual(files.sort(), ['index.html', '_redirects', path.join('games', 'loaded-blackjack', 'index.html'), ...icons.map(f => path.join('assets', f)), ...games.map(g => path.join('games', g, 'index.html'))].sort(), '(the two extra files are the redirect from the old Loaded Blackjack address)');
});

test('icons: every page has a Home Screen / Favorites icon that exists, and the page title is the Home Screen name', () => {
  const dir = build();
  for (const rel of ['index.html', ...games.map(g => `games/${g}/index.html`)]) {
    const html = read(dir, rel);
    const href = html.match(/<link rel="apple-touch-icon" href="([^"]+)">/);
    assert.ok(href, rel + ' has no apple-touch-icon');
    assert.ok(fs.existsSync(path.join(dir, path.normalize(path.join(path.dirname(rel), href[1])))), rel + ' points at a missing icon');
    assert.match(html, /<link rel="icon" type="image\/png" href="[^"]*favicon\.png">/, rel);
  }
  const png = fs.readFileSync(path.join(dir, 'assets', 'apple-touch-icon.png'));
  assert.equal(png.readUInt32BE(16), 180); assert.equal(png.readUInt32BE(20), 180);   // iPad wants 180x180

});

test('build: production (main) builds are not labelled as previews', () => {
  const dir = build({ WORKERS_CI_COMMIT_SHA: 'abcdef1234567', WORKERS_CI_BRANCH: 'main' });
  assert.doesNotMatch(stamp(read(dir, 'index.html')), /preview/);
});

test('build: the unbuilt files still open on their own and call themselves a local file', () => {
  for (const rel of ['index.html', ...games.map(g => `games/${g}/index.html`)]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(stamp(src), '__BUILD__', rel);
    assert.match(src, /'local file'/, rel);
  }
});

test('build: the old Loaded Blackjack address redirects to Stackjack', () => {
  const { execFileSync } = require('child_process'), os = require('os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  execFileSync('node', [path.join(__dirname, '..', 'tools', 'build.js'), out], { stdio: 'ignore' });
  assert.match(fs.readFileSync(path.join(out, 'games', 'loaded-blackjack', 'index.html'), 'utf8'), /stackjack\/index\.html/);
  assert.match(fs.readFileSync(path.join(out, '_redirects'), 'utf8'), /\/games\/loaded-blackjack\/\* \/games\/stackjack\/:splat 301/);
  assert.ok(fs.existsSync(path.join(out, 'games', 'stackjack', 'index.html')));
});
