#!/usr/bin/env node
// Re-pulls the Thrift Shop cards sheet (tabs "Cards 2026" and "Invites 2026"), validates it, and regenerates
//   data/cards.json, data/invites.json (the checked-in snapshots) and the <script id="sheet"> block inside index.html.
//
//   node games/thrift-shop/tools/sync-sheet.js
//       Downloads both tabs as CSV. This only works while the sheet is shared "Anyone with the link can view"
//       (Share > General access > Anyone with the link > Viewer). If Google refuses, the script says so.
//   node games/thrift-shop/tools/sync-sheet.js --csv-cards cards.csv --csv-invites invites.csv
//       Offline: use CSV files you downloaded yourself (File > Download > Comma-separated values, one tab at a time).
//
// Any problem (a bad card type, a non-integer Impression, an accessory ability that matches no pattern, an invite
// without a scoring rule in data/scoring.json, a scoring rule for an invite that is not in the sheet) stops the import,
// lists every offending row, and changes nothing.
const fs = require('fs');
const path = require('path');
const lib = require('./sheet-lib.js');

const SHEET_ID = '1X64GNGXkTAnA-nbe5CGqJviQbmOTcZa3Sb0FUpeojsg';
const root = path.join(__dirname, '..');
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const tabUrl = tab => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

async function fetchTab(tab) {
  let res; try { res = await fetch(tabUrl(tab)); } catch (e) { throw new Error(`Could not reach Google Sheets (${e.message}). Check your network, or use --csv-cards / --csv-invites with downloaded files.`); }
  if (!res.ok) throw new Error(`Google answered ${res.status} for the "${tab}" tab. Share the sheet as "Anyone with the link can view", or use --csv-cards / --csv-invites with downloaded files.`);
  const text = await res.text();
  if (/^\s*<(!DOCTYPE|html)/i.test(text)) throw new Error(`Google returned a web page, not CSV, for the "${tab}" tab: the sheet is probably not shared with "Anyone with the link can view".`);
  return text;
}

(async () => {
  const cardsFile = arg('--csv-cards'), invitesFile = arg('--csv-invites');
  const cardsCsv = cardsFile ? fs.readFileSync(cardsFile, 'utf8') : await fetchTab('Cards 2026');
  const invitesCsv = invitesFile ? fs.readFileSync(invitesFile, 'utf8') : await fetchTab('Invites 2026');
  const scoring = JSON.parse(fs.readFileSync(path.join(root, 'data', 'scoring.json'), 'utf8'));
  const sheet = lib.build(lib.parseCsv(cardsCsv), lib.parseCsv(invitesCsv), scoring);   // throws, listing every bad row
  fs.mkdirSync(path.join(root, 'data', 'source'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'source', 'cards-2026.csv'), cardsCsv);
  fs.writeFileSync(path.join(root, 'data', 'source', 'invites-2026.csv'), invitesCsv);
  fs.writeFileSync(path.join(root, 'data', 'cards.json'), JSON.stringify(sheet.cards, null, 1) + '\n');
  fs.writeFileSync(path.join(root, 'data', 'invites.json'), JSON.stringify(sheet.invites, null, 1) + '\n');
  const htmlPath = path.join(root, 'index.html');
  fs.writeFileSync(htmlPath, lib.embedInto(fs.readFileSync(htmlPath, 'utf8'), sheet, scoring));
  console.log(`Synced ${sheet.cards.length} cards and ${sheet.invites.length} invites into data/*.json and index.html.`);
})().catch(e => { console.error(e.message); process.exit(1); });
