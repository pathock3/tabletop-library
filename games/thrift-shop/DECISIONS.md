# Thrift Shop (2026) — decisions

Source: the designer's "Thrift Shop: digital prototype spec" and the Thrift Shop cards sheet, tabs **Cards 2026** and **Invites 2026** (the older tabs are ignored). Every tunable number is in `GAME_DATA` (the `data` script); the cards and invites are in the generated `sheet` script.

## Where the spec and the repo's rules meet
1. **One file, no fetch.** The game is a single `index.html`; the "JSON snapshots + sync script" live in `data/` and `tools/`, and the sync command also regenerates the `<script id="sheet">` block inside `index.html`. A test fails if the embedded copy differs from `data/*.json` or the CSVs.
2. **Landscape.** The stage is a fixed 1180×820 table scaled to fit. In portrait or on a phone it is the same table smaller, with a dismissible "built for a sideways iPad" strip.
3. **The clock.** The 60-second scramble is the one place a clock runs (the owner's general rule is "nothing advances on a timer"). The clock pauses while the menu is open. Everything else is player-paced.
4. **The old Thrift Shop** (four seasons, Rules Lab, Simulate) was replaced, not kept alongside; it is in git history.

## Where the spec is silent (my defaults)
- **Mess**: a 15 × 10 grid with one space for each of the 150 cards. Every card is laid out face down and the dealt hands (5 each) leave empty spaces, so a put-back always finds a space. A put-back goes into a **random** empty space, face up. Cards the bots or you take leave an empty space; nothing is reshuffled.
- **Press-and-hold** a face-up mess card to see it large without taking it (small extra). Face-down cards can never be previewed.
- **Golden Trophy** doubles the highest Impression only if it is above 0. A tie goes to the tied Impression the invite's rule names first, then the fixed order.
- **Magic Wand**: you choose the target (a picker opens when you place it, Spooky is not allowed); the default and the bots' choice is the first Impression in the invite's "Rewards" column that is not Spooky.
- **Accessory abilities** only look at the clothing on the board; a print counts once per card ("pictured" = "per item with"); animals count `animals` or `bats`.
- **Rivalry** ("on your right"): the previous seat in order, wrapping; you are seat 1.
- **Rounds** are drawn from the 40 invites without repeats (capped at 40 if a bigger number is set).
- **Before Start** the mess is visible but nothing can be taken; the timer starts at Start.
- **Bots** act every 1.5–3.5 s (normal; slow 2.5–5, fast 0.8–2), read only face-up cards and their own hand, maximise the invite's first-block metric, and build their best look instantly. A bot with a full hand puts a card back first, then takes (its planned card, or a random face-down one).
- A wrong slot keeps your card selected; a played card in the hand is marked ON and a tap takes it off the board.
- Settings are saved on the device (`thriftshop26-settings`) and clamped to sane limits.
