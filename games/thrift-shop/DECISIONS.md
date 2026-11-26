# Thrift Shop (2026) — decisions

Source: the designer's prototype spec, the later change notes (they win where they conflict), the Design Vision doc, and the Thrift Shop cards sheet, tabs **Cards 2026** and **Invites 2026**. Every tunable number is in `GAME_DATA` (the `data` script); the cards, invites and scoring rules are in the generated `sheet` script.

## Rules as built
- **Four Impressions**, always in this order: Fancy 👑, Wacky 🤪, Cute 🧸, Spooky 👻 (opposites: Fancy vs Wacky, Cute vs Spooky). Cool and Important are gone.
- **Board**: Head, Top, Bottom, Accessory (up to 4 cards played); the figure is always barefoot; empty slots show bald / plain undershirt / heart boxers / empty hand. **Hand limit 5, starting hand 5**, so a round opens with putting cards back. 7 rounds, 60-second thrift, hands carry over.
- **Two invites per round**, both visible all round; both score for every player; round Likes = A + B; both are discarded (14 of 37 per game at 7 rounds; rounds capped at 18). Each invite is ranked across all players on its own, with its own two-player line.
- **Mess**: 120 cells (15 × 8), always face down. A put-back is a confirmed action on a multi-selection (**Put back (N)**), and the cards go face down into random empty spaces. Nothing is reshuffled between rounds.
- **Scoring** follows the spec: dense ranking, tied players all get the better payout, the better of a place or a last-place payout within one block. "0 or less X gets 1 more" = `ifAtMost 0`.
- **Accessories**: per-print, per-animal (animals or bats), per-banana, per-bat, per-**print in your outfit** (every print on the clothing counts, so a card with two prints counts 2), per empty clothing slot (0–3), conversions, **Your X becomes 0** (after clothing), Golden Trophy, Magic Wand.
- **Bots**: at the start of thrifting each bot scores its hand against both invites (best look; a sum of two Impressions is halved so pairs are not favoured), targets the better one for the round, and builds for it. It takes blind; when its hand is full it puts back, all at once and face down, every card its best look does not use. Pace 1.5–3.5 s (slow 2.5–5, fast 0.8–2).

## Calls where the notes are silent (my defaults)
- **Invite scoring rules** (`data/scoring.json`) are written by hand from each invite's "Payout (Likes)" and "Notes" text. A test cross-checks that every number in a rule is printed in the invite's text and every number in the payout line is paid by the rule. The debug view lists every invite with its text and parsed rule.
- **Rivalry**: Family Photo Day looks to the player on your **right** = the previous seat in order, wrapping; Beach Day looks to the player on your **left** = the next seat in order, wrapping. You are seat 1. At 2 players each looks at the other.
- **Invites simplified**: every invite that combines or subtracts two Impressions pays "1st 5, 2nd 2" only; there are no lower-of-two invites and no "0 or less gets 1 more" bonuses; the scoring block kinds are rank, threshold, perPoints and rivalry.
- **Golden Trophy** doubles the highest Impression only if it is above 0; a tie goes to the tied Impression named first in invite A's rule, then invite B's, then the fixed order.
- **Magic Wand**: you choose the target (a picker opens when it is placed; Spooky is not allowed); the default and the bots' choice is the first Impression rewarded by invite A, then B, that is not Spooky.
- **Prints** are drawn only by the 16-stamp library, straight from each sheet row; an accessory lists no prints, so its art carries none (a heart-shaped balloon is the object, not a "hearts" print). Two pattern prints on one garment (e.g. Clown Pants) share it side by side.
- **Art** is one flat-cartoon style on one shared figure (viewBox 240 × 340), so a card's picture is the garment as worn, and the build board and reveal show the real outfit. Hand cards are stats on the left, art on the right.
- **One file, no fetch.** `data/*.json` and `data/source/*.csv` are the checked-in snapshots; the sync command (`node games/thrift-shop/tools/sync-sheet.js`) also regenerates the `<script id="sheet">` block inside `index.html`, and a test fails if they differ. Columns are read by header name.
- **Landscape.** The stage is a fixed 1180 × 820 table scaled to fit; in portrait or on a phone it is the same table smaller with a dismissible "built for a sideways iPad" strip.
- **The clock** is the one place a timer runs; it pauses while a menu is open. Everything else is player-paced.
- **Debug** (Settings): shows face-down names and the bots' hands, and unlocks the art gallery (every card with the sheet's prints against the prints drawn, a toggle to see each card on the figure, the Power tag) and the invite rules list.

## Not built
Real sound, online play, saves, pass-and-play, the headless simulation UI (the engine is pure and `Bots.playGame` runs whole bot games for it later).
