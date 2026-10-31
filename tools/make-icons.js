#!/usr/bin/env node
// Draws the Tabletop Library icon (a shelf with three game boxes) and writes assets/icon.svg plus the PNGs
// that iPad Safari uses for Favorites and the Home Screen.   node tools/make-icons.js   (needs Playwright; only run when the design changes)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// A shelf with three game boxes standing on it (and a die leaning on the end): the library, not any one game.
const box = (x, y, w, h, c1, c2, mark) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${c1}" stroke="#1b130e" stroke-width="3"/><rect x="${x + 5}" y="${y + 6}" width="${w - 10}" height="${(h * .36).toFixed(1)}" rx="3" fill="${c2}"/>${mark}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
<defs><radialGradient id="g" cx="50%" cy="0%" r="110%"><stop offset="0" stop-color="#5b3a22"/><stop offset="1" stop-color="#1b130e"/></radialGradient></defs>
<rect width="180" height="180" fill="url(#g)"/>
${box(22, 52, 44, 92, '#e0772a', '#ffd45e', '<circle cx="44" cy="106" r="11" fill="#fff3d6" stroke="#1b130e" stroke-width="3"/>')}
${box(70, 36, 46, 108, '#2b86d1', '#9ed3ff', '<polygon points="93,86 105,106 93,126 81,106" fill="#fff3d6" stroke="#1b130e" stroke-width="3"/>')}
${box(120, 62, 40, 82, '#e8344e', '#ffb3be', '<rect x="130" y="98" width="20" height="20" rx="4" fill="#fff3d6" stroke="#1b130e" stroke-width="3"/>')}
<rect x="10" y="144" width="160" height="16" rx="5" fill="#c98a43" stroke="#1b130e" stroke-width="3"/>
</svg>`;
const root = path.join(__dirname, '..', 'assets');
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'icon.svg'), svg);

const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
(async () => {
  const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  for (const [file, size] of [['apple-touch-icon.png', 180], ['favicon.png', 64], ['icon-512.png', 512]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body>`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(root, file) });
  }
  await b.close();
  console.log('icons written to assets/');
})();
