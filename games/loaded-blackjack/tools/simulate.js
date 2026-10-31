// Plays seeded all-AI games without the screen and writes a balancing report.
//   node games/loaded-blackjack/tools/simulate.js [games per player count = 1000] [out.csv]
const fs = require('fs');
const path = require('path');
const { GAME_DATA: D, Engine: E, AI } = require('../tests/load');
const per = Number(process.argv[2]) || 1000, out = process.argv[3] || path.join(__dirname, 'report.csv');
const LEVELS = D.ai.levels;
const lv = { games: 0, rounds: 0, busts: 0, playerRounds: 0, wins: {}, seats: {} };
const card = {}; D.upgrades.forEach(c => { card[c.id] = { drafted: 0, offered: 0, gamesWith: 0, winsWith: 0 }; });
const byLevel = {}; LEVELS.forEach(l => { byLevel[l] = { seats: 0, wins: 0 }; });
let games = 0, rounds = 0, busts = 0, playerRounds = 0, errors = 0;
for (const n of [2, 3, 4, 5, 6]) {
  for (let k = 1; k <= per; k++) {
    const seats = Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'ai', level: LEVELS[(i + k) % 3] }));
    const s = E.newGame({ seed: k * 7919 + n, seats });
    try {
      let steps = 0;
      while (s.phase !== 'over') {
        if (++steps > 40000 || !s.pending) throw new Error('stuck');
        const pd = s.pending, r = E.answer(s, pd.kind === 'results' ? 'continue' : AI.answer(s, pd.who));
        if (!r.ok) throw new Error('refused ' + pd.prompt);
        if (steps % 25 === 0 && !s.stack.some(t => t.t === 'draw' && t.card)) E.auditCards(s);
      }
      E.auditCards(s);
      for (const h of s.history) { const exp = h.tiebreak ? Object.keys(h.pts).length : n; const sum = Object.values(h.pts); sum.forEach(p => { if (p < 1 || p > exp) throw new Error('bad points ' + p + ' of ' + exp); }); }
      games++; rounds += s.history.length; s.pl.forEach(p => { busts += 0; });
      seats.forEach((st, i) => { byLevel[st.level].seats++; if (i === s.winner) byLevel[st.level].wins++; });
      const picks = {}; s.log.forEach(l => { const m = /^(.+) drafts (.+)\.$/.exec(l.t); if (m) { const who = s.pl.findIndex(p => p.name === m[1]); const id = D.upgrades.find(c => c.name === m[2]).id; (picks[who] = picks[who] || new Set()).add(id); card[id].drafted++; } });
      Object.entries(picks).forEach(([who, set]) => set.forEach(id => { card[id].gamesWith++; if (Number(who) === s.winner) card[id].winsWith++; }));
      s.log.forEach(l => { if (/ busts/.test(l.t)) busts++; });
      playerRounds += s.history.reduce((a, h) => a + Object.keys(h.pts).length, 0);
    } catch (e) { errors++; console.error('game failed', n, k, e.message); }
  }
}
const rows = [['card', 'draft_count', 'games_drafted_in', 'win_rate_when_drafted']].concat(D.upgrades.map(c => [c.id, card[c.id].drafted, card[c.id].gamesWith, card[c.id].gamesWith ? (card[c.id].winsWith / card[c.id].gamesWith).toFixed(3) : '']));
const sum = [['games', games], ['errors', errors], ['avg_rounds_per_game', (rounds / games).toFixed(2)], ['bust_rate', (busts / playerRounds).toFixed(3)]].concat(LEVELS.map(l => ['win_rate_' + l, (byLevel[l].wins / byLevel[l].seats).toFixed(3)]));
fs.writeFileSync(out, sum.map(r => r.join(',')).join('\n') + '\n\n' + rows.map(r => r.join(',')).join('\n') + '\n');
console.log(sum.map(r => r.join(': ')).join('\n'));
process.exit(errors ? 1 : 0);
