# Tabletop Library

Patrick Blim-Hockberger's tabletop game designs, adapted as browser games you can play on one shared screen (built for an iPad in Safari). The front page is a shelf of game boxes; tap one to play.

- **Library:** `index.html` — open it in a browser, no install, works offline.
- **Games:** `games/<name>/index.html`, each one a single self-contained file that also works on its own.
  - **Torn Treasure** (`games/fossil-frenzy/`, formerly Fossil Frenzy) — a fast memory game: peek, flip and match torn treasure maps, then dig them. **Pass & Play** (2–4 people, one device) or **Campaign**: five opponents — Beginner, Novice, Normal, Challenging, Master — each of which you must beat to unlock the next.
- **Dig Dig Boom** (the flagship) is a separate site; the library links to it once it has an address.

**Deployment:** hosted on Cloudflare (Workers Builds, static assets), connected to this repo.
- **Live:** `https://tabletop-library.patrick-blim-hockberger.workers.dev/` is the library; Fossil Frenzy is at `…/games/fossil-frenzy/`. It changes whenever `main` does (a failing test keeps the old version up).
- **Preview (optional):** every other branch is built as a preview with its own address (the branch `claude/peaceful-bardeen-fvc0jn` → `https://claude-peaceful-bardeen-fvc0jn-tabletop-library.patrick-blim-hockberger.workers.dev/`), for trying something risky on an iPad. Day-to-day work goes straight to `main`, so the live link is never behind. A preview address has its own browser storage: a game saved there is not on the live link.
- Build command `npm run build` (runs the tests, then copies the library page and each game into `_site/`, stamped with commit · date · branch — shown quietly at the bottom of each page), deploy command `npx wrangler deploy`, config in `wrangler.jsonc`. `.github/workflows/ci.yml` only runs the tests.
- On an iPad, Safari → Share → *Add to Home Screen* on the library page gives a full-screen app.

## Fossil Frenzy in one paragraph
31 fossils lie face down on a hexagonal board (no pieces, no movement). On your turn you **peek** (first tap, private) at any fossil, then **flip** (second tap, public) another. If they match, they are yours; otherwise they flip back — remember them. Or **bank** one of your sets: it scores the number on its fossil (gems are worth 12), plus a d6 bonus chain. Gems match as a set of three. The game ends when every fossil is matched; unbanked sets are lost. The rules and every number in them are in the data block at the top of `games/fossil-frenzy/index.html`; every ambiguous call is in `games/fossil-frenzy/DECISIONS.md`.

## Files
- `index.html` — the library page; its data block is the catalogue of games.
- `games/fossil-frenzy/` — the game (`index.html`), `DECISIONS.md` (every ambiguous rule and how it was resolved), `REPORT.md` (1,000-game bot simulations, including how hard each campaign level is), `tests/`, `tools/simulate.js`, and the sources: `docs/design-summary.md` (the rules) and `rulebook.md` (the original physical game, kept as history).
- `tests/` — library and build tests. `npm test` runs everything (Node ≥ 20; browser tests need Playwright and are skipped without it).
- `tools/build.js`, `wrangler.jsonc`, `.github/workflows/ci.yml` — build and deploy.
- `CLAUDE.md` — project rules for working on the code. `docs/PLAN.md` — the roadmap. `CHANGELOG.md` — what changed.
