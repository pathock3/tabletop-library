# Grit balance experiment (v2.7.1)

Run before building Grit, as asked. Tool: `tools/grit-experiment.js` (`node tools/grit-experiment.js <section> <digs> <random|engine>`). It is a purpose-built model of the v2.7.1 battle (free roll, upright numbered cards fire one at a time, Extra Rolls, damage markers, Grit before/after the roll) played through whole Digs with the v2.7.1 card list, **not** the app engine (Grit is not in the app yet).

## How to read it
- **depth** = Monsters survived in one Dig before BOOM (9 = the whole Mine, 10+ = into the gauntlet; the model stops at 40). Higher = stronger.
- **by size** = depth with 0 / 4 / 8 / 14 Booster cards collected (the 0 column has no Boosters at all, so it is the same for every policy).
- Two kinds of collection: **random** = Booster cards drawn at random (a typical game); **engine** = someone who deliberately drafts the 19 Grit-generating cards (a stress test of the loop).
- The player is a good one: before every roll and every choice it looks at all ten die faces and picks what keeps the most Health (BOOM = very bad), with a small value on saved Grit and Extra Rolls.
- "grit gained/battle" is what the cards give back; "wasted at cap" is Grit that the cards offered but the 6-track could not hold.
- Setup assumed (question 1 below): Health 10, Extra Rolls 0, Grit 0 at the start of a Dig. Starting with 2 Grit changes depth by about +0.5 early and nothing late. Extra Rolls can also take Grit before their roll. Not modelled: Consumables, card-moving Immediates, banking and the Leaderboard, so absolute depths are rough; only the differences mean something. ~100 Digs per size per row, so differences under ~0.4 are noise.

## A. Before vs after (cap 6, before 1 Grit = +1, after 3 Grit = +1)

### Typical (random) collections
| policy | depth | by size 0/4/8/14 | grit spent/battle | pre share | grit gained/battle | wasted at cap/battle |
|---|---|---|---|---|---|---|
| never spend Grit | 5.85 | 3.88 / 5.10 / 5.24 / 9.18 | 0.00 | 0.00 | 0.25 | 0.44 |
| before only (best look-ahead) | 7.24 | 3.88 / 5.67 / 6.39 / 13.01 | 0.91 | 1.00 | 0.95 | 0.22 |
| after only (best look-ahead) | 6.72 | 3.88 / 5.82 / 5.99 / 11.20 | 0.20 | 0.00 | 0.39 | 0.44 |
| after only, only to avoid BOOM | 6.45 | 3.88 / 5.44 / 5.72 / 10.74 | 0.08 | 0.00 | 0.30 | 0.44 |
| before + after only to avoid BOOM | 7.32 | 3.88 / 5.68 / 6.66 / 13.04 | 0.94 | 0.98 | 0.98 | 0.24 |
| before + after, both best | 7.35 | 3.88 / 5.71 / 6.70 / 13.10 | 0.96 | 0.95 | 1.01 | 0.25 |
| spend everything before every roll | 6.96 | 3.88 / 5.62 / 5.96 / 12.36 | 1.02 | 1.00 | 1.05 | 0.07 |

### Grit-engine collections
| policy | depth | by size 0/4/8/14 | grit spent/battle | pre share | grit gained/battle | wasted at cap/battle |
|---|---|---|---|---|---|---|
| never spend Grit | 4.76 | 3.88 / 4.66 / 5.16 / 5.34 | 0.00 | 0.00 | 0.71 | 2.56 |
| before only (best look-ahead) | 15.96 | 3.88 / 6.87 / 20.87 / 32.20 | 5.11 | 1.00 | 5.27 | 10.43 |
| after only (best look-ahead) | 7.13 | 3.88 / 5.93 / 8.44 / 10.25 | 1.27 | 0.00 | 1.74 | 5.17 |
| after only, only to avoid BOOM | 5.46 | 3.88 / 5.39 / 6.03 / 6.53 | 0.26 | 0.00 | 0.87 | 3.06 |
| before + after only to avoid BOOM | 18.43 | 3.88 / 7.58 / 25.75 / 36.53 | 5.00 | 0.91 | 5.15 | 10.45 |
| before + after, both best | 18.71 | 3.88 / 7.58 / 25.81 / 37.56 | 5.10 | 0.88 | 5.26 | 10.64 |
| spend everything before every roll | 15.86 | 3.88 / 6.83 / 20.15 / 32.59 | 5.13 | 1.00 | 5.28 | 10.53 |

**Findings**
- Spending Grit **before** the roll is clearly the better use: on typical collections it gives 1.4 of the 1.5 Monsters Grit is worth in total; adding after-roll spending on top of it adds about 0.1. After-roll alone is worth about half as much (+0.9 vs +1.4).
- After-roll Grit is a safety valve, as intended: of the after-roll spends the good player makes (about 0.1–0.2 per Dig), a third save him from BOOM and two thirds are "1 away from a card". None are anything else.
- **The loop is real.** With an engine collection, "before only" lifts the same player from depth 4.8 (never spending) to 16.0 (18.7 with after-roll too). Spending Grit for a high result fires Gecko / Gopher / Squirrel / Mole…, which hand back as much Grit as was spent (regained ÷ spent = 1.00, and in 93% of battles where he spent 3+ he got at least that much back). The cap does not stop it: the cards offer ~10 more Grit per battle than the track can hold.

## B. The cap does not fix the loop
| policy | depth | by size 0/4/8/14 | grit spent/battle | pre share | grit gained/battle | wasted at cap/battle |
|---|---|---|---|---|---|---|
| cap 3 | 11.24 | 3.88 / 6.47 / 12.55 / 22.07 | 3.11 | 0.88 | 3.23 | 9.85 |
| cap 4 | 13.92 | 3.88 / 7.07 / 16.52 / 28.21 | 3.93 | 0.91 | 4.06 | 10.41 |
| cap 6 | 18.71 | 3.88 / 7.58 / 25.81 / 37.56 | 5.10 | 0.88 | 5.26 | 10.64 |
| cap 8 | 20.41 | 3.88 / 8.03 / 31.52 / 38.21 | 5.57 | 0.91 | 5.76 | 10.12 |
| cap 12 | 20.72 | 3.88 / 9.42 / 31.37 / 38.21 | 5.53 | 0.79 | 5.81 | 9.56 |

(engine collections; typical collections barely move: cap 3 → 6.8, cap 4 → 7.0, cap 6 → 7.35, cap 8 → 7.4.)

## C. After-roll rate
| policy | depth | by size 0/4/8/14 | grit spent/battle | pre share | grit gained/battle | wasted at cap/battle |
|---|---|---|---|---|---|---|
| after = 1 Grit per +1 | 9.41 | 3.88 / 6.56 / 7.60 / 19.59 | 0.96 | 0.49 | 1.06 | 0.54 |
| after = 2 Grit per +1 | 7.53 | 3.88 / 5.72 / 6.14 / 14.37 | 0.88 | 0.87 | 0.92 | 0.30 |
| after = 3 Grit per +1 | 7.35 | 3.88 / 5.71 / 6.70 / 13.10 | 0.96 | 0.95 | 1.01 | 0.25 |
| after = 4 Grit per +1 | 7.24 | 3.88 / 5.66 / 6.37 / 13.05 | 0.90 | 0.97 | 0.94 | 0.23 |
| after = never | 7.24 | 3.88 / 5.67 / 6.39 / 13.01 | 0.91 | 1.00 | 0.95 | 0.22 |

(typical collections) and for engine collections after = 1 Grit per +1 → 24.04, after = 2 Grit per +1 → 20.22, after = 3 Grit per +1 → 18.71, after = 4 Grit per +1 → 17.54, after = never → 15.96.

After 3:1 or 4:1 is the right order of magnitude: at 1:1 and 2:1 after-roll Grit starts to beat before-roll on typical collections (9.4 / 7.5 vs 7.35 at 3:1), and at 1:1 it makes engines unbeatable. At 3:1 it is worth ~0.1 on typical collections, at 4:1 nothing.

## D. What actually breaks the loop: a limit on Grit spent per battle
Rows below are the same good player; "per battle" counts Grit spent before and after rolls, Extra Rolls included.

### Typical collections
| policy | depth | by size 0/4/8/14 | grit spent/battle | pre share | grit gained/battle | wasted at cap/battle |
|---|---|---|---|---|---|---|
| today: cap 6, after 3:1 | 7.73 | 3.83 / 6.52 / 5.80 / 14.77 | 1.19 | 0.95 | 1.24 | 0.32 |
| before-roll spend max 3 | 7.26 | 3.83 / 6.52 / 5.20 / 13.48 | 0.83 | 0.88 | 0.88 | 0.33 |
| before-roll spend max 2 | 7.27 | 3.83 / 6.97 / 5.17 / 13.10 | 0.68 | 0.83 | 0.73 | 0.38 |
| before-roll spend max 1 | 7.01 | 3.83 / 7.05 / 5.02 / 12.15 | 0.47 | 0.64 | 0.58 | 0.44 |
| max 3 Grit spent per battle | 6.86 | 3.83 / 6.53 / 5.17 / 11.90 | 0.63 | 0.95 | 0.71 | 0.32 |
| Grit earned in a battle waits until it ends | 7.32 | 3.83 / 6.50 / 5.35 / 13.60 | 0.98 | 0.97 | 1.25 | 0.06 |
| wait + before-roll max 3 | 6.95 | 3.83 / 6.50 / 5.18 / 12.30 | 0.69 | 0.93 | 0.98 | 0.07 |
| cap 3 + before-roll max 2 | 6.95 | 3.83 / 6.60 / 5.15 / 12.22 | 0.60 | 0.90 | 0.64 | 0.44 |
| cap 4 + before-roll max 2 | 7.05 | 3.83 / 6.58 / 5.13 / 12.63 | 0.62 | 0.89 | 0.67 | 0.41 |
| max 2 Grit spent per battle | 6.71 | 3.88 / 5.65 / 6.19 / 11.13 | 0.47 | 1.00 | 0.57 | 0.28 |
| max 4 Grit spent per battle | 6.96 | 3.88 / 5.71 / 6.28 / 11.99 | 0.68 | 0.96 | 0.75 | 0.23 |
| max 5 Grit spent per battle | 7.09 | 3.88 / 5.71 / 6.29 / 12.50 | 0.80 | 0.96 | 0.85 | 0.20 |
| max 4 per battle, after 2:1 | 7.18 | 3.88 / 5.70 / 5.97 / 13.17 | 0.70 | 0.90 | 0.76 | 0.24 |
| max 3 per battle, after 2:1 | 6.88 | 3.88 / 5.66 / 5.88 / 12.12 | 0.57 | 0.91 | 0.65 | 0.27 |
| max 4 per battle, cap 5 | 6.97 | 3.88 / 5.69 / 6.32 / 12.01 | 0.69 | 0.96 | 0.74 | 0.25 |

### Grit-engine collections
| policy | depth | by size 0/4/8/14 | grit spent/battle | pre share | grit gained/battle | wasted at cap/battle |
|---|---|---|---|---|---|---|
| today: cap 6, after 3:1 | 18.49 | 3.83 / 7.97 / 25.10 / 37.07 | 5.03 | 0.88 | 5.18 | 10.84 |
| before-roll spend max 3 | 15.07 | 3.83 / 8.22 / 18.00 / 30.22 | 3.79 | 0.78 | 3.97 | 10.85 |
| before-roll spend max 2 | 13.20 | 3.83 / 7.68 / 14.98 / 26.30 | 3.14 | 0.67 | 3.34 | 9.93 |
| before-roll spend max 1 | 11.48 | 3.83 / 6.83 / 13.67 / 21.58 | 2.32 | 0.47 | 2.60 | 9.48 |
| max 3 Grit spent per battle | 7.26 | 3.83 / 6.13 / 9.22 / 9.87 | 1.92 | 0.99 | 2.32 | 4.95 |
| Grit earned in a battle waits until it ends | 12.68 | 3.83 / 6.62 / 17.13 / 23.12 | 4.36 | 1.00 | 13.71 | 0.06 |
| wait + before-roll max 3 | 10.51 | 3.83 / 7.03 / 13.37 / 17.80 | 2.94 | 0.90 | 11.44 | 0.07 |
| cap 3 + before-roll max 2 | 9.91 | 3.83 / 6.35 / 12.28 / 17.17 | 2.36 | 0.81 | 2.49 | 8.17 |
| cap 4 + before-roll max 2 | 10.44 | 3.83 / 6.68 / 13.05 / 18.20 | 2.52 | 0.80 | 2.69 | 8.37 |
| max 2 Grit spent per battle | 6.37 | 3.88 / 5.70 / 7.61 / 8.28 | 1.22 | 1.00 | 1.69 | 4.04 |
| max 4 Grit spent per battle | 8.35 | 3.88 / 6.27 / 10.35 / 12.90 | 2.60 | 0.99 | 2.94 | 6.29 |
| max 5 Grit spent per battle | 9.95 | 3.88 / 6.85 / 13.06 / 16.02 | 3.40 | 0.99 | 3.68 | 7.17 |
| max 4 per battle, after 2:1 | 8.52 | 3.88 / 6.61 / 10.44 / 13.15 | 2.61 | 0.97 | 2.95 | 6.38 |
| max 3 per battle, after 2:1 | 7.31 | 3.88 / 6.39 / 9.17 / 9.80 | 1.88 | 0.97 | 2.30 | 4.87 |
| max 4 per battle, cap 5 | 8.29 | 3.88 / 6.26 / 10.15 / 12.86 | 2.60 | 0.99 | 2.89 | 6.33 |

(Rows G0–G8 are 60 Digs per size, G9–G14 are 100.)

**Findings**
- Limiting **what you can put into one roll** does the job, because that is what turns Grit into guaranteed results: "max 4 per battle" brings the engine from 18.5 to 8.3 (about +1.4 over typical collections instead of +11), while typical collections only lose 0.4–0.8 of depth. "Max 3" is tighter (engine ≈ typical); "max 5" is looser (engine +2.9).
- Limits on the *before-roll* part only, or a lower cap, are weaker and hurt typical play as much. Making Grit earned in a battle wait until the battle ends removes the in-battle chain but not the loop across battles.
- Rates and the cap are not the problem; the **amount of Grit that can be turned into result in one battle** is.

## Recommendation
1. Keep the track at **0–6** and keep your two rates: **before the roll 1 Grit = +1 (the first Grit with Drone Booster +2), after the roll 3 Grit = +1**. Both behave as you wanted: before-roll is the better use, after-roll is a rescue (BOOM, or one away from a card).
2. Add one rule: **you can spend at most 4 Grit per battle** (all rolls of that battle together, before and after). This is the one change that stops the refill loop without making Grit feel weak: typical collections keep about three quarters of today's benefit (+1.1 instead of +1.5 Monsters); Grit-engine collections drop from invincible to a strong-but-beatable +1.4 over typical. If engines still feel too strong in your tests, **3** is the knob (engine ≈ typical); **5** if Grit feels flat.
3. Nothing else needs to change for Grit: no cap change, no rate change.
