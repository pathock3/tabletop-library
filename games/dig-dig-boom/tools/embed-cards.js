// Prints the v2.7.1 card list (tools/cards-v271.psv, imported once from the "v2.7.1 Cards" tab) as the JavaScript for DDB.cards in index.html.
// The game never reads the sheet at run time: to change a card, edit DDB.cards in index.html (or this file's source and run this again).
const fs = require('fs'), path = require('path');
const rows = fs.readFileSync(path.join(__dirname, 'cards-v271.psv'), 'utf8').trim().split('\n').map(l => l.split('|'));
rows.shift();
const q = s => JSON.stringify(s);
const out = rows.filter(r => Number(r[5]) > 0).map(r => `    { id: ${q(r[0])}, name: ${q(r[1])}, type: ${q(r[2])}, number: ${r[3] === '' ? 'null' : r[3]}, deck: ${q(r[4])}, count: ${r[5]}, text: ${q(r[6])}${r[7] === 'Yes' ? ', cantStart: true' : ''} },`);
process.stdout.write(out.join('\n') + '\n');
