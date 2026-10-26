# Rules questions — running list

## v2.7.1 — questions asked (newest first). Answered ones are removed once built in.
Q1. **Starting values.** "Tracks reset to the starred values each Dig": what are the stars for Health (10?), Extra Rolls and Grit? The Grit experiment assumed 10 / 0 / 0 (starting with 2 Grit changes little). — asked
Q2. **Grit and Extra Rolls.** Can you spend Grit *before* an Extra Roll's roll as well (same rate)? Does Grit Caddy ("spend 3+ Grit on one roll") count Grit spent before and after a roll together? The experiment assumed yes to both. — asked
Q3. **Roll again (Falcon Finisher).** Does its roll count as a roll that can beat the best result and fire upright cards (like an Extra Roll), and can Grit go into it? Assumed: yes it can fire cards, no Grit. — asked
Q4. **Monster sets.** Is each set (4 / 3 / 2) three Monster cards with fixed printed damage dug in ascending order (1 then 3 then 5 then 7), shuffled among all 30 cards, or is the damage set by "how many Monsters you have survived"? Assumed: set order is fixed, the three sets interleave randomly. — asked
Q5. **Starter Kit.** Are kit cards put into play at the start of the Dig, or put on top of the Mine and dug first (as in v2.7)? Assumed: top of the Mine. — asked
Q6. **Grit limit per battle.** Proposed rule from the experiment: at most 4 Grit spent per battle (see `GRIT-EXPERIMENT.md`). Waiting for your answer before building Grit. — asked

---

Only questions still waiting for the owner are listed (**open**), plus calls I made that you can overrule (**assumed** / **my call**). Anything you have ruled on is removed.

## Written in the sheet itself (Notes column, "Question:")
Each is a note you wrote on a card. Card text is quoted exactly.
- **Prickly Porcupine** (Power, number 1): see the Grit list below (Grit is cut; proposed: lose 1 Health, then +1 Reroll).
- **Falcon Finisher** (Power, number 8): "Roll again. If it's 10 or more, defeat this Monster". Your note: should bonuses add to this second roll? Right now the second roll counts the cards' roll bonuses (like Tune-Up), and nothing else (Grit is cut). — open
- **Floor Jack** (Ongoing): "If your result is less than 4, it becomes 4". Your note: should the floor be 4, 5 or 6? — open
- **Shoo Spray** (Immediate): "+2 {grit}. Move the top card of your Mine to the bottom without looking". Your note: is a blind move fun, or does it feel like nothing happened? — open (a design question, not a rules one)
- **Wormhole** (Immediate): "Reveal cards from your Mine until you find an Immediate card. Do it, then shuffle the rest back". Your note: is chaining into another Immediate card the fun part of Portal, or was it the free choice? — open (design)

## About a Dig (each is one line in `DDB.rules`, so easy to change)
9. **Order of result changes:** Tune-Up and friends add; Wrecking Ball doubles; Backfire turns 1 into 10; Floor Jack lifts below 4 to 4. Default: add, then double, then "becomes", then "less than" (`rulings.transformOrder`). Second Spark (3 or less rerolls free) looks at the result *before* the double/becomes/floor changes, once per Monster. — open
10. **Panic Button:** the free reroll happens after the line has triggered and before damage; does the rerolled result trigger the line *again* (so heals and Grit stack)? Default: yes (`rulings.panicRetriggers`). — open
13. **"Whenever you gain …" at a full track:** does gaining Health at 10 (a full track) still count? Default: no — the track has to actually move (`rulings.gainAtCapFires`). — open
15. **Losing Health to a card** (Prickly Porcupine, Risky Shortcut) can take you to 0 and BOOM you. Default: yes. Lucky Cricket only protects against a Monster's damage. — open
16. **Sneak Attack** defeats the dug Monster without a roll — it counts as survived (and defeated, so Monster Jerky and Bounty Poster apply). — assumed
17. **Cloning Machine** goes under a Power card of your choice, the Pet included. If you move that card later, the clone goes with it. — assumed
18. **A Monster beyond the Mine** has no card, only a number: it appears when you dig from an empty Mine. — assumed
19. **Damage you take** is reduced by Block *and* by Bumper; "first Monster deals no damage" (Cowcatcher) applies to the first Monster dug this Dig, including one you only revealed with Cave Scout until you actually face it. — assumed
20. **Magpie/Echo** copy the top Immediate card of the discard pile, not the cards that copied it (two Echoes in a row copy nothing). — assumed

## Added while building the run (Booster Pack, Prep, Leaderboard) for one player

## Added with your rulings (player-chosen triggers, Starter Kit on top of the Mine, AI, no pledging)
36. **Ongoing cards stay automatic.** You choose which eligible *Power* cards to trigger and in what order, but an Ongoing card's "Whenever…" effect still fires by itself when its event happens. Do you also want to choose whether (and when) each Ongoing card triggers? — open
37. **Conga Crab and Unlucky Duck** ("for each other card that triggers", "if no other card triggers") count the other cards you chose once you have chosen them: they resolve when you take the damage. — my call
38. **No Grit or Rerolls once you start triggering.** The sequence is roll, adjust with Grit/Rerolls, trigger, then damage. — my call
39. **Generator ("at the start of each Dig")** fires when it is dug as part of your Starter Kit (before the first Monster), since the kit is how a Dig starts. — my call
40. **"Trigger all"** is a small chip on the Power line that triggers everything eligible, highest number first. Tapping the Monster takes the damage at once, and any glowing card you did not tap is not used (your ruling). Keep the chip, or remove it? — my call
41. **Panic Button** sends you back to choose your triggers again after its free reroll (gains from cards you already triggered stay). Still open under #10 whether the reroll should let you trigger again at all. — my call
42. **Starter Kit order.** Your kit goes on top of the Mine face up in the order you tap them (1st is dug first); any other card you own is shuffled into the Mine. — ruled by the owner, order mine
44. **How the AI decides** (numbers in `DDB.ai`): it never spends Grit before a roll (it knows nothing yet). After the roll it spends Grit (3 for +1) to reach the Pet if it can, else the nearest card above its result; it rerolls when the Pet is out of reach or no card on its line has triggered; then it triggers everything and takes the damage. It banks when its Health is 3 or less, or when banking would put it in the lead and its Health is under 6 ("not confident"); with Health 6 or more it keeps digging. It keeps the first cards a pack offers and picks its Starter Kit at random. — my call
45. **AI clock:** it digs one card every 1.1 seconds on its own while you play (a Monster, with its rolls, counts as one card). When your Dig is over and it is not, a Fast forward button on the BOOM/Banked panel makes it 0.06 seconds a card. Prep waits for it. — my call
46. **Prep at the same time:** the AI opens its Booster Pack the moment you open yours (yours is drawn first), then keeps cards and chooses its kit without seeing yours. Its Escape Bonus is the same single roll as yours. — my call
47. **Final round details I filled in** (the race itself is your ruling: nobody banks, the leader may wait, everyone else keeps digging): everyone's score is the better of their locked-in best and their live marker, so a player holding the Crown from an earlier round is in the lead from the start; a player who goes BOOM keeps only their earlier best; ties go to whoever reached the number first; alone at the table, you win the moment you are past the Crown tracker (matching it does not count). The round ends when everyone but the leader has gone BOOM. — assumed
49. **Encountering a Monster moves your marker** (your ruling). If it BOOMs you, the marker is removed (your best stays). In the final round that means digging a Monster can take the lead from someone the instant it is revealed. A Monster revealed by Cave Scout and put back does not count until you dig it. — assumed (the last sentence)

## Grit is cut: proposed replacements (awaiting your approval; until then these 35 cards are out of the Booster Deck)
Rules for the proposals: Grit becomes Rerolls or Health (never "+N to the roll"); Power cards may use the new Burnout wording ("…, then move this card up N (max 10)"); nothing lets a player move cards along the line.
Power cards (the number is where the card sits):
- PW-04 Prickly Porcupine (1): "Lose 1 {heart}, then +2 {grit}" → "Lose 1 {heart}, then +1 {reroll}" (Health for Rerolls every roll).
- PW-06 Gritty Gecko (2): "+1 {grit}" → "+1 {reroll}, then move this card up 4 (max 10)" (a Burnout card: a Reroll on your first Monsters, then it fades).
- PW-08 Helper Hamster (3): "+1 {grit} and +1 {heart}" → "+2 {heart}, then move this card up 2 (max 10)" (early healing that fades).
- PW-10 Grit Gopher (4): "+2 {grit}" → "+1 {reroll}" (the name is about Grit: rename it, e.g. Gopher).
- PW-11 Conga Crab (5): "+1 {grit} for each other card that triggers" → "+1 {heart} for each other card that triggers".
- PW-13 Good Boy (5): "+1 {grit} and +1 {heart}" → "+1 {reroll} and +1 {heart}".
- PW-18 Energy Bat (7): "+1 {reroll}. When dug, +2 {grit}" → "+1 {reroll}. When dug, +2 {heart}".
- PW-23 Muscle Mole (8): "+2 {grit}. When dug, +1 {grit}" → "+3 {heart}. When dug, +1 {reroll}".
- PW-25 Snowball Beetle (8): "+1 {grit}, then move this card down 1" (cards never move down) → "+1 {heart} for each Monster you've survived this Dig" (it snowballs by itself, no moving).
- PW-26 Busy Finch (9): "+1 {reroll}. When dug, +1 {grit}" → "+1 {reroll}. When dug, +1 {heart}".
- PW-29 Hype Squirrel (10): "+3 {grit}" → "+1 {reroll} and +3 {heart}".
- PW-30 Jackpot Ferret (10): "+1 {reroll}, +1 {grit} and +2 {heart}" → "+2 {reroll} and +2 {heart}".
Ongoing cards:
- ON-01 Adrenaline Pump: "Whenever you gain {heart}, +1 {grit}" → "Whenever you gain {heart}, +1 {reroll}" (strong with Nurse Newt at 1: a Reroll every roll, capped at 3; fine?).
- ON-07 Confetti Cannon: "Whenever you dig an Immediate card, +1 {grit}" → "…, +1 {reroll}".
- ON-10 Danger Siren: "Whenever you dig a Monster with 6+ {damage}, +2 {grit}" → "…, +1 {reroll}".
- ON-13 Drone Booster: "The first {grit} you spend before each roll gives +2" → "The first {reroll} you spend each Dig costs nothing" (new wording needed).
- ON-16 Generator: "At the start of each Dig, +2 {grit}" → "At the start of each Dig, +1 {reroll}".
- ON-18 Grit Caddy: "Whenever you spend 3+ {grit} on one roll, get 1 back" → "Whenever you spend a {reroll}, +1 {heart}".
- ON-24 Pep Horn: "Whenever you gain {grit}, gain 1 more" → "Whenever you gain {reroll}, gain 1 more".
- ON-26 Rage Valve: "Whenever you take 3+ {damage}, +2 {grit}" → "Whenever you take 3+ {damage}, +2 {heart}".
- ON-28 Salvage Claw: "Whenever you defeat a Monster, +1 {grit} and +1 {heart}" → "…, +1 {reroll} and +1 {heart}".
- ON-30 Stubborn Engine: "Whenever you take {damage}, +1 {grit}" → "Whenever you take {damage}, +1 {reroll}".
- ON-32 Trophy Case: "Whenever you defeat a Monster, +2 {grit}" → "Whenever you defeat a Monster, +2 {heart}".
- ON-36 Workbench: "Any time, trade 3 {grit} for 1 {reroll}, or 1 {reroll} for 3 {grit}" (a trade is a decision and an economy) → "Whenever you gain {reroll}, +1 {heart}".
Immediate cards:
- IM-02 Boomerang: "+2 {grit}. Slide this card back into the middle of your Mine" → "+1 {reroll}. Slide this card back into the middle of your Mine".
- IM-09 Hot Spring: "+2 {grit} and +3 {heart}" → "+1 {reroll} and +3 {heart}".
- IM-10 Iron Vein: "+4 {grit}" → "+2 {reroll} and +2 {heart}".
- IM-12 Lunchbox: "+1 {grit}, +1 {reroll} and +2 {heart}" → "+1 {reroll} and +2 {heart}" (so Lunchbox, Hot Spring and Spare Parts are near twins: say if you want one of them to be something else).
- IM-15 Mystery Box B: "+2 {grit}. When kept…" → "+1 {reroll} and +1 {heart}. When kept…" (A is +3 Health, C is +1 Reroll).
- IM-19 Pocket Scanner: "+1 {grit}. Look at the top 3 cards of your Mine" → "+1 {heart}. Look at the top 3 cards of your Mine".
- IM-27 Shoo Spray: "+2 {grit}. Move the top card of your Mine to the bottom without looking" → "+1 {reroll}. Move the top card of your Mine to the bottom without looking" (moving a card in the Mine is not moving along the line; the earlier "is a blind move fun?" question still stands).
- IM-29 Spare Parts (2 copies): "+1 {reroll} and +1 {grit}" → "+1 {reroll} and +1 {heart}".
- IM-31 Tool Shed: "+1 {grit} for each Ongoing card you have" → "+1 {reroll} for each Ongoing card you have" (the Lucky Coin counts; Rerolls cap at 3).
- IM-18 Pet Treat: "Your Pet triggers 1 lower until Prep" (a player-chosen move, and it was almost always right) → "+2 {heart} and +1 {reroll}" — or a fresh idea.
- IM-34 Wrench Rat: "Move your highest Power card (not your Pet) down 2" → "+1 {reroll} for each Power card on your line (not your Pet)".

## Decided for the prototype
- Advanced trash is not in the prototype (it stays in the rule book as an optional rule). Lucky Coin stays +1. The 35 Grit/move cards stay out of the game in the proposed form above; variety of Booster cards is a late-stage pivot.


## Echo + Rewind Tape can loop for ever (found by AI simulation)
With both in the Mine, Rewind Tape puts Echo back on top and Echo copies Rewind Tape, so digging them can alternate without end. In a normal round the AI banks after 40 cards, but in the **last round nobody can bank**, so the round never ends. Should one of them change (e.g. Echo cannot copy Rewind Tape, or Rewind Tape skips an Echo), or should a Dig end after some number of cards in a row without a Monster?


## Cloning Machine on an Ongoing card — what does "twice" mean? (a ruling I made; please check)
The Machine now goes under a Power **or** Ongoing card. For an Ongoing card I made everything it does count twice: "+N to your rolls" is +2N, "Whenever …" reactions happen twice, "Block N from every Monster" is Block 2N, "double your result" is ×4, "at the start of each Dig" happens twice. Things that are the same twice (Cowcatcher, "if your result is 1 it becomes 10", Panic Button's "first time") are unchanged, and I left "Monsters you defeat are worth 2" and "You may lose 2 Health instead of a Reroll" alone. The Machine stays one of your Ongoing cards (it still counts for Duct Tape and Tool Shed). The sheet's text still says "Power cards": the game accepts either wording.

## The last round: can the leader bank?
Today nobody banks in the last round; the leader just waits and the round ends when everyone else is out. A player who is in the lead (say, 29 gems at the bottom of the Mine) sees the Bank greyed out and is told to wait. Should the leader be able to stand (bank) once they are in the lead?

## After the 19th Bonus Monster
There are Bonus Monster cards for damage 8 to 19. If a Dig goes past 19 Bonus Monsters the game repeats a 19.

## From the combat redesign (rulings I made; tell me if you meant otherwise)
- **Ongoing cards "at or below the die"**: Ongoing cards have no number, so they still work as always-on effects (not as cards that fire at a number). If you want Ongoing cards on the Power line with numbers, give them one in the sheet and tell me.
- **Extra Roll** replaces your result (owner's clarification): used cards stay used and the new result may reach different cards. (Twin Drill, "keep the higher result", was deleted: it no longer makes sense.)
- **Using a card no longer locks your roll in** (that was the old Reroll rule); Extra Rolls stay available all battle. Backfire ("you may make it a 10") is still a tap.
- **Block cards** are unchanged numerically: "Block N" and "Deal N damage to the Monster" are the same effect (N markers). Reword them in the sheet when you like.
- **Resolving order**: cards still fire when you tap them (or "Use all"); nothing fires by itself except what the AI and "Use all" do.
- The Bonus Monster Loot is 1 (your latest ruling), not 2.
- **Echo + Rewind Tape loop:** with both in your Mine, digging Rewind Tape puts Echo on top, Echo does Rewind Tape (which puts Rewind Tape on top), and so on: you dig for ever, and in the last round (no Bank) there is no way out. Say if one of them should change (for instance Echo "only copies cards that are not Rewind Tape", or Rewind Tape shuffles the card in).
