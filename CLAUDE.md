# Tabletop Library — project rules

A collection of Patrick Blim-Hockberger's tabletop game designs, adapted as browser games. The front page (`index.html`) is the library; each game lives in `games/<id>/`. Roadmap and design philosophy: **`docs/PLAN.md`** — read it before starting new work.

## Hard rules
1. **Every game is one self-contained `index.html`** (`games/<id>/index.html`), playable by touch on an iPad in Safari. It must work opened directly, with no runtime dependencies and no network (v2.7.1 of Dig Dig BOOM! has its cards built in: it no longer reads a sheet). Plain JavaScript. The build only copies files and stamps the version.
2. **All rules, point values and board setup live in one data block** per game (`<script id="data">`) — separate from its logic (`engine`, `bots`, `ui` scripts). Logic must not hard-code a rule number that belongs in the data block. The library's catalogue (`LIBRARY` in the root `index.html`) is the same idea for the collection.
3. **Automated tests for every rule**, in each game's `tests/` (library and build tests are in the root `tests/`). While working, run `npm run test:quick` (all but the slow browser file, ~7 s) plus only the browser tests the change touches (`node --test --test-name-pattern="…" games/<id>/tests/ui.test.js`). Run the full `npm test` (several minutes) once before pushing a batch of changes — the deploy build runs it too — and fix failures before merging. **Match the test to the change:** wording, a number or a colour needs no test run at all (look at it); a rule or layout change needs only the test that touches it; the full suite is for the end of a batch, not after every edit. (In Dig Dig BOOM!, `play.test.js` is the slow browser file: run it by `--test-name-pattern`.)
4. **`main` is the live site** (friends play it). Work on a branch (`claude/peaceful-bardeen-fvc0jn` or a feature branch), push it, and the owner tests that branch's preview link on an iPad. Merge to `main` only when the owner says so.
5. **Deployment is automatic**: Cloudflare runs `npm run build` = `npm test` then `tools/build.js` (copies the library page and every `games/*/index.html` into `_site/`, stamping commit · date · branch into each `<meta name="build">`), then deploys with `wrangler.jsonc`. A failing test fails the build, so the old version stays live. `main` is production; every other branch gets a preview link. `.github/workflows/ci.yml` also runs the tests on every push. Don't break the single-file-per-game build.
6. **Commit after each working change** with a short message. Note user-visible changes in `CHANGELOG.md`.

## Target device
The primary target is the iPad **in portrait**, opened from the home screen as a web app: **820 × 1180** CSS pixels, with the status bar overlapping the top edge. The second target is the **iPhone 17 in portrait: 402 × 874**. (The owner tests almost exclusively on iPad in portrait.) Design and check at those sizes first; landscape (the base iPad's 1180 × 820) and other sizes must still work. Dig Dig BOOM! was designed for landscape and also scales its whole layout down on screens shorter than `DDB.screen.designHeight` (an iPhone on its side: 874 × 402); inside it, use `VW()`/`VH()` and `rr(el)` instead of `innerWidth`/`innerHeight`/`getBoundingClientRect`. Keep content clear of the top status-bar area. Buttons are at least 44 pt, and the ones you press all the time (menu, End turn, Tap to start) are bigger.

## Layout
- `index.html` — the Tabletop Library front page; its data block lists the games. To add a game: create `games/<id>/` with `index.html` (build-stamp meta included), then add a catalogue entry. A test fails if they disagree.
- `games/<id>/` — one game: `index.html`, its rulebook/source rules, `DECISIONS.md` (every ambiguous call), `tests/`, optional `tools/` (bot simulations) and `REPORT.md`.
- `games/<id>/tests/` — `npm test` runs them all (Node ≥ 20). A game's `tests/load.js` extracts its data/engine/bots scripts from its `index.html` and runs them in Node. Browser tests use Playwright and skip themselves if it is unavailable.
- Dig Dig BOOM! (the flagship) lives here too, as `games/dig-dig-boom/` — no separate site. It is on the shelf (listed since the owner asked). (v2.7.1: its cards are built into `DDB.cards`, imported once from the owner's "v2.7.1 Cards" tab; it never reads the sheet at run time.) Its Step-by-step plan and open rules questions are in `games/dig-dig-boom/STATUS.md` and `QUESTIONS.md`. Scripts in its `index.html`: `data` (all rules, the phrase book that turns card text into effects, the run/ladder), `engine` (card list, text fitting), `dig` (one Dig: the battle), `run` (rounds, Prep, Leaderboard), `ui` (card designs), `solo` (the game screen), `printv` (print sheets). Card behaviour comes from the card text through `DDB.phrases` — never from a per-card table.
- `tools/build.js`, `wrangler.jsonc`, `.github/workflows/ci.yml` — build and deploy.

## Fossil Frenzy / Torn Treasure (`games/fossil-frenzy/`)
- **Themed as Torn Treasure** (treasure maps; the folder, ids and storage keys keep `fossil-frenzy`): a tile is a tile of sand face down and half a torn map face up; a match is a map put back together; "bank" is "dig up". Rules, scoring and numbers are unchanged. A match and a dig-up each play a short film, then the turn ends by itself; rules reminders (once per device, or per Pass & Play game) appear the first time something comes up.
- **One rule set**: peek (first tap, private) then flip (second tap, public), or bank one set; 31 fossils on a corner-less hexagon; no pieces, no movement; Pass & Play (2–4 people) or Campaign (five levels, beat each to unlock the next; levels are shown by name only, never percentages). Do not reintroduce the removed rulebook mechanics (movement, delivery, a rule-set toggle) without the owner asking.
- `docs/design-summary.md` — the redesign this game implements, plus Patrick's UI philosophy. `rulebook.md` — the original physical game (history only). The owner's later feedback overrides both; it is logged in `DECISIONS.md`.
- `DECISIONS.md` — when a rule is unclear: choose the most sensible reading, log it there, keep going.
- Scripts in `index.html`: `data` (all rules, the campaign levels), `engine` (pure rules, no DOM), `bots`, `campaign` (pure unlock logic), `ui`.

## UI philosophy (from the owner — "the Tabletop Test")
- The table is the UI: tap tiles, pieces and piles like physical components. No verb buttons ("Deliver"), no dropdowns, no modals for game actions. System chrome (help, new game) stays small and quiet.
- Minimum taps; nothing advances on a timer; the player owns pacing (End turn / Start turn).
- Concealed tiles deep umber, public tiles bright; flips get a ring (ring only) in the flipper's colour.
- Page is locked in games: no scrolling or rubber-banding (the help panel scrolls internally). Taps register instantly. (The library's shelf may scroll.)
- Any judgment call is listed in the game's in-game How to Play panel and in its `DECISIONS.md`.
- Information discipline: bots receive a public view of the game (`Engine.publicView`) — never hidden tile values.
