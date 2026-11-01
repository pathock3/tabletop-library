#!/usr/bin/env node
// Builds the deployable site into _site/: the library's index.html plus games/<id>/index.html for every game,
// each stamped with the commit, date and branch it came from.   node tools/build.js [outDir]
// `npm run build` runs the tests first, so a failing test stops a deploy.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, '_site'));
const sh = cmd => { try { return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };

// Cloudflare Workers Builds provides these; locally fall back to git.
const sha = (process.env.WORKERS_CI_COMMIT_SHA || sh('git rev-parse HEAD') || '').slice(0, 7) || 'unknown';
let branch = process.env.WORKERS_CI_BRANCH || sh('git rev-parse --abbrev-ref HEAD');
if (branch === 'HEAD') branch = '';
branch = branch.replace(/[<>"&]/g, '');          // goes into HTML
const date = new Date().toISOString().slice(0, 10);
const label = [sha, date, branch && branch !== 'main' ? 'preview: ' + branch : ''].filter(Boolean).join(' · ');

const gamesDir = path.join(root, 'games');
const games = fs.existsSync(gamesDir) ? fs.readdirSync(gamesDir).filter(d => fs.existsSync(path.join(gamesDir, d, 'index.html'))).sort() : [];
const pages = ['index.html', ...games.map(g => path.join('games', g, 'index.html'))];

// the output folder is emptied first: never let that be the repo or one of its parents
const rel0 = path.relative(out, root);
if (rel0 === '' || !rel0.startsWith('..')) throw new Error('Refusing to build into ' + out + ': it is the repository or contains it');
fs.rmSync(out, { recursive: true, force: true });
for (const rel of pages) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!html.includes('content="__BUILD__"')) throw new Error(rel + ' is missing the <meta name="build" content="__BUILD__"> placeholder');
  fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
  fs.writeFileSync(path.join(out, rel), html.replace('content="__BUILD__"', () => 'content="' + label + '"'));
}
// old addresses that still work: Loaded Blackjack was renamed Stackjack (a redirect page, plus a _redirects rule for the host)
const MOVED = { 'games/loaded-blackjack': 'games/stackjack' };
for (const [from, to] of Object.entries(MOVED)) {
  fs.mkdirSync(path.join(out, from), { recursive: true });
  const dest = '/' + to + '/';
  fs.writeFileSync(path.join(out, from, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Stackjack</title><meta http-equiv="refresh" content="0;url=../../' + to + '/index.html"><link rel="canonical" href="' + dest + '"><script>location.replace("../../' + to + '/index.html" + location.search + location.hash)</script><p><a href="../../' + to + '/index.html">Stackjack has moved here.</a></p>\n');
}
fs.writeFileSync(path.join(out, '_redirects'), Object.entries(MOVED).map(([from, to]) => '/' + from + '/* /' + to + '/:splat 301').join('\n') + '\n');
// shared icons (Favorites / Home Screen) are published in assets/, the same place they sit in the repo; pages link to them, but still work without them
const assets = path.join(root, 'assets');
const icons = fs.existsSync(assets) ? fs.readdirSync(assets).filter(f => f.endsWith('.png')) : [];
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const f of icons) fs.copyFileSync(path.join(assets, f), path.join(out, 'assets', f));
console.log('built', pages.length, 'pages and', icons.length, 'icons into', path.relative(root, out) || '.', '—', label);
