# Dig Dig BOOM! (v2.7.1) — browser prototype

One file: `index.html`. Open it directly or from the build. On the library shelf (`listed: true` in the root `index.html`); also at `games/dig-dig-boom/`.

## Where the rules live
- **The cards are in the game** (v2.7.1): `DDB.cards` in the `data` script, imported once from the owner's "v2.7.1 Cards" tab (record: `tools/cards-v271.psv`, printed by `tools/embed-cards.js`). The game never reads the sheet and keeps no saved copy. To change a card, change its line in `DDB.cards`.
- **`<script id="data">`** (`DDB`): the cards, card types and colours, and every rule number (`DDB.rules`: the d10, the tracks (Health 0–10, Extra Rolls 0–5, Grit 0–3), start values, `grit` (rates and the 3-a-battle limit), rulings; `DDB.run`: rounds, reward ladder, Crown start; `DDB.phrases`: the phrase book).
- **Card behaviour is read from the card text.** `DDB.phrases` lists sentence patterns (for numbered Ongoing and Immediate cards, unnumbered Ongoing cards, Consumables); the `dig` script maps each to an effect. A text the phrase book does not understand is shown as "not built yet", and `tests/dig.test.js` fails if any card of the game is not understood. To teach the game a new kind of sentence: add a pattern to `DDB.phrases` and handle its `op` in `Dig`.

## Scripts (in order)
`data` → `engine` (the card list, text fitting) → `dig` (one Dig: the battle — roll, result, firing, Grit, Extra Rolls, markers, damage — Consumables, every effect, save/load) → `board` (Leaderboard, Crown, Pledge, dibs; any number of players) → `run` (rounds, Prep, Booster Packs, Starter Kit, Escape Bonus, save/load) → `ui` (the Top Tab card design, Cards page) → `solo` (the game screen) → `printv` (print-and-play sheets).

The engines have no DOM. State is plain data (the rng carries `.state()`/`.restore()`), so a game saves after every tap and a reload puts you back exactly where you were.

## Open rules questions
`QUESTIONS.md` — each answer is one value in `DDB.rules` (see `rulings`). `STATUS.md` has the step list.

## Tests
`node --test games/dig-dig-boom/tests/*.test.js` (browser tests need Playwright + Chromium and skip themselves otherwise).
