// Loads the data / sheet / engine / bots scripts out of index.html (the game is a single file) into this Node realm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let cache = null;
function load() {
  if (cache) return cache;
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['data', 'sheet', 'engine', 'bots']) {
    const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
    if (!m) throw new Error('missing <script id="' + id + '"> in index.html');
    vm.runInThisContext(m[1], { filename: 'index.html#' + id });
  }
  cache = vm.runInThisContext('({ GAME_DATA, SHEET, Engine, Bots })');
  return cache;
}
module.exports = load();
