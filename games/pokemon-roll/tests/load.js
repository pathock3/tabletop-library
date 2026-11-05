// Loads the data/engine/bots scripts out of index.html (the game is a single file) into this Node realm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FILE = path.join(__dirname, '..', 'index.html');
let cache = null;
function scriptText(id) {
  const html = fs.readFileSync(FILE, 'utf8');
  const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  if (!m) throw new Error('missing <script id="' + id + '"> in index.html');
  return m[1];
}
function load() {
  if (cache) return cache;
  for (const id of ['data', 'engine', 'bots']) vm.runInThisContext(scriptText(id), { filename: 'index.html#' + id });
  cache = vm.runInThisContext('({ GAME_DATA, Engine, Bots })');
  cache.scriptText = scriptText;
  cache.FILE = FILE;
  return cache;
}
module.exports = load();
