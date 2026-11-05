# Pokémon Roll! — decisions

Sources (Patrick's Google Drive, folder "Pokémon Roll"): **Pokémon Roll! Rulebook**, **Pokémon Roll design doc**, **Pokémon Roll cards** (sheet, tab `v2`, 175 cards). The rulebook is a draft full of open questions; every call below is mine unless marked *(owner)*.

## Decided by the owner
- *(owner)* **One roll, no rerolls.** Each side rolls one die per card; the strategy is which die goes on which card. Cards that say "+1 reroll" or "you may always reroll 3s" still do, because the card says so.
- *(owner)* **Solo against the computer** (Easy / Medium / Hard); no pass and play for now.
- *(owner)* **Legendaries are in.** The nine level-6 cards that are not starters: Articuno, Zapdos, Moltres, Dragonite, Mewtwo, Suicune, Lugia, Ho-oh, Celebi. Once you have two dice, a 9 on two dice at the start of a turn spots one: it is shuffled into the place on its card (with that place's discard pile). Lance holds one, drawn at the start of the game.
- *(owner)* **A blocker takes the leftover.** If a block cannot soak the whole attack, the blocker takes what is left.
- *(owner)* **A card is out the moment it reaches 0 health.**
- *(owner)* **Bosses get a random team** from the places on their boss card (short or long game).
- *(owner)* **Art:** Crystal sprites, shown as big as the card allows. A card drawn from the wild has a fresh **5% chance to be shiny** each time; a card on your team or on a boss's team keeps its form for good. Shiny is **purely cosmetic**, with a sparkle when it comes into play.
- *(owner)* **Card design:** the weakness is a tab flush with the top of the card.

- *(owner)* **No opening rival fight.** In the paper game it only decides who goes first, so it is gone. `RULING:` your partner starts at level 2 (the level that fight gave), and Viridian Forest, Mt. Moon and Brock are open from the start. The final fight against your rival after Lance is still there (one line in the data to remove it).
- *(owner)* **One card design, always whole.** The same card (name, level, HP, weakness tab, sprite, element, role, ability, all six faces, special move) is used on the table, in your hand, in the picker and in your collection. There is no tap-to-enlarge version. The row for the die you pick lights up on every card, and the row a card is using this round is lit. Cards are as big as the table allows (at least 150 wide); a very wide team scrolls sideways.
- *(owner)* **Tap anywhere to roll** after a round; there is no Next button. The dice tumble when they are rolled. There is no Suggest button.
- *(owner)* **The map** runs left to right, each place drawn as a little scene. It shows what is open and one step beyond it (so the two paths after Brock show as a fork until they meet at Blue).

## Reading the sheet
- `RULING:` **Move 1–6 are the six faces of the die.** A card with fewer than six moves has blank faces (a blank is a die with nothing to do). The sheet lists the moves strongest first, and the design doc says blanks exist.
- `RULING:` **Arrows.** `<` the column to the left, `^` the card facing it, `>` the column to the right, `v` itself, `<<` two columns. `<^>` is all of them at once; `<^ or >` is a choice of one of them; `and/or` takes everything that is there. `<<<<^ or ^>>>>` is one side or the other. For an attack `^` is the matchup; for a heal or block `v` is the card itself and `<`/`>` are its neighbours.
- `RULING:` **`over`** (`7a over <^>`) splits the points among the targets however you like; the game gives each point to wherever it does the most good. **`, +2a <>`** is an extra attack on the neighbours that happens only if the card attacked. **`or` between two moves** (`3a <^> or 3h <v>`) is a choice of one; the game takes the one worth more right now. **`&` and `,`** do both.
- `RULING:` A block's arrows say **who it can protect**. It stays up the whole round and soaks attacks as they come, from itself first, then (if it helps) one neighbour per attack.
- `RULING:` **Special moves** (`66: 12a`) need that many dice on that number on the same card; those dice are all it gets, so some other card goes without a die that round.
- `RULING:` Weakness is the card's weak element against the element of the attacking card. Weak types the sheet gives that are not elements ("Enemy Heals", "Ghost") mean no weakness.
- `RULING:` A **blocker that is itself weak** to the attack takes the doubled amount before the block soaks it (rulebook).

## The fight
- Cards stand in columns facing one opponent. The computer puts down one card, then both sides two at a time; you may go first instead if you tap your own card first. Columns never exceed the team size.
- Each round: roll → give dice → **heal first**, then cards act from left to right, **your card first in each column** (cards that "attack first" go before everyone). Damage is double on a weakness; a card at 0 is out at once and does not act later in the round.
- After a round, knocked-out cards leave, empty columns close, and cards left without a matchup are paired with a matchless card across the table next to them (the side with fewer cards moves). `RULING:` the rulebook's turn-by-turn choosing is automatic.
- `RULING:` If both sides fall in the same round: **sudden death**. Each side keeps its best card that was standing at the start of the round (at that health); the side that deals more damage in the next round wins; a tie repeats up to three times, then the computer wins.
- `RULING:` A fight with no damage or healing for **six rounds** is lost (the rulebook says a stalemate is a loss for the hero), and so is one that lasts 60 rounds. "Give up" is in the menu.
- Your cards are never lost in a fight. A fight is lost, nothing happens.

## The campaign (the design doc's Map 2)
- You start with **one die** (one card per challenge). Each gym leader you beat is another die (up to six). Challenge a place with as many cards as you have dice; it brings the same number. Win and you keep one of theirs (the rest go to the place's discard pile); lose and they go back to the deck.
- Gym leaders: Brock 2, Misty 3, Lt. Surge 3, Blaine 4/5, Erika 4/5, Blue 5/7, Lance 6/9 (short/long), drawn from the places on the boss card. `RULING:` you take as many cards as you have (up to the boss's number): an outnumbered fight is allowed, as the rulebook says.
- `RULING:` The map opens like the design doc's list: Viridian Forest, Mt. Moon, Brock → Power Plant, Misty, Surge → S.S. Anne / Pokemon Tower, Blaine / Erika → Safari Zone, Cinnabar Island, Blue (needs both Blaine and Erika) → Seafoam, Victory Road, Lance → the final rival fight.
- Your partner starts at level 2 and levels to one above the level on the boss's card when you beat them. Pikachu may evolve into Raichu at level 5 (you choose once; Raichu then goes on to level 6).
- Your rival picks the partner whose element beats yours. In the last fight the rival brings their level 6 partner and five other cards (levels 4–5).
- When a place's deck runs out it is refilled from its discard pile. After beating a gym leader, their team goes to the discard piles of the places it came from.
- Beating Lance gives you his legendary.

## Abilities
Every ability on the sheet is read from its text by the table in the data block. **Not in this version** (they move cards between columns, change dice or reach outside the fight): Golbat/Tangela (no repositioning), Abra (swap two opponents), Kadabra (move one column), Alakazam (redirect an attack), Machop/Machoke/Machamp (pushing), Slowpoke/Slowbro (lower an enemy die), Haunter (keep another ability), Weezing (give a die), Rhyhorn/Rhydon (push everything), Jynx (freeze an ally die — its ice attack freeze works), Magikarp, Porygon, Dratini, Lugia, Celebi, Gyarados. A test lists them so nothing is silently dropped.
- `RULING:` "Loses a round" (and "freeze") means that card gets no die next round. "Cannot attack next round" is the same.
- `RULING:` "Attackers take 1d" hurts the attacker whenever it damages the card; "When KO'd, attacker takes 4d" is plain damage that nothing blocks.
- `RULING:` Auras ("+1a <>") add to a neighbour's matching moves; they do not add to the card's own moves. "Neighbor moves +<" adds 1 to the card on its left, "+>" to the card on its right.
- `RULING:` Dice-changing abilities (Golduck, Exeggcute, Exeggutor, Staryu) are a button on the card sheet ("Use ability on its die") during the dice step.
- `RULING:` "Dodge" means the attack does nothing; "immune" cards take no damage from that element; "absorb" (Oddish vs water, Magmar vs fire) heals instead.
- `RULING:` The heal ability "Receives double effect from healing" doubles heals on that card only.

- *(owner)* **Magikarp:** while it has allies, anything the card directly across from it attacks with is cut by 9. Alone, it is an ordinary card.
- `RULING:` **Slowpoke/Slowbro** lower the die of the card facing them by 1 (1 becomes 6), every other round, automatically. **Porygon** (every other round) gives a teammate's attack the element its target is weak to. **Weezing** hands one of its damage to a healthier card facing it at the end of the round. **Dratini** lets its dragon allies' plain attacks hit left, across or right. **Lugia** takes one reroll from the other side.

## Not in this version
- Colored dice and the elemental dice rules, trading cards, the GM-swapping two-player game, Map 1 (the same data would do it), the ten-card hard-mode rival, quests, and the Hall of Fame.
