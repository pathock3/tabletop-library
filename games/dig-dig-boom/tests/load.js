// Loads the data and engine scripts of index.html into Node (the page is one file).
const fs = require('fs'), path = require('path'), vm = require('vm');
let cache = null;
function load() {
  if (cache) return cache;
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['data', 'engine', 'dig', 'board', 'run', 'ai']) {
    const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
    if (!m) throw new Error('missing <script id="' + id + '">');
    vm.runInThisContext(m[1], { filename: 'index.html#' + id });
  }
  cache = vm.runInThisContext('({ DDB, Engine, Dig, Board, Run, AI, Basic, Match, Duel })');
  return cache;
}
module.exports = load();
