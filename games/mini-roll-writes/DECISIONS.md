# Mini Roll & Writes — decisions

Source: Patrick's Google Doc "Mini Roll & Writes" (Wizard Darts, Wizard Battleship, Where's the Lie?, Target Practice). One library entry, a menu of four games. Two players: against the computer (Easy / Normal / Hard) or Pass & Play (a hand-off screen before anything secret).

## Calls the doc left open (change any of them in `data` / `engine`)
- **Wizard Darts** — tie rule: extra rounds are played until someone is ahead after a round; when the score is tied the player with the advantage throws second. Advantage: the first game by a d10 roll-off (re-rolled on a tie), later games the loser of the previous game. Variants offered: 3 or 4 rounds, or first to 21 / 25 (checked at the end of a round). Match: best of three games, or a single game.
- **Wizard Battleship** — radar only reports targets still standing; one action (radar or attack) per turn; who goes first: a d20 roll-off, then the loser of the previous game. Setup (two different numbers 1–20) is secret; Pass & Play uses hand-off screens.
- **Where's the Lie?** — a lie's size is the absolute difference between what was said and what was rolled (the doc only describes "said minus rolled"). Revealing an unaccused lie gives +1 on top of the claim. Wrongly accused: the claim scores and the roller goes again. First to 50 (a single game; the next game, if played, starts with the loser).
- **Target Practice** — targets 2/3, 4–10, 11/12; the doc's "save up to 1 die and re-roll up to 2 dice" is built as: keep at most one die, re-roll the rest, once a turn (twice when either player has one target left); you may stop and take a hit after any roll; after the last re-roll the total is checked automatically. Who starts: a d6 roll-off, then the loser of the previous game. A single game.
- Not included (doc notes / drinking variants): 3+ players, the drinking variants, the "quick reference card" idea.

## The computer
- Wizard Darts: Easy picks at random; Normal always aims for 5 or 6 (3 points a throw on average); Hard also chases the win on the last throw (chance × result).
- Wizard Battleship: Easy attacks numbers it has not tried; Normal / Hard keep every pair of numbers that fits what radar and attacks have told them and attack the likeliest number once it is likely enough, otherwise radar, choosing the die and width whose answer is the least certain.
- Where's the Lie?: Easy tells the truth about two thirds of the time and accuses at random; Normal weighs the odds of being accused for each claim and accuses big claims; Hard also uses how this opponent has behaved in the game so far.
- Target Practice: Easy takes hits and otherwise re-rolls both dice; Normal keeps the die that gives the best chance of a hit; Hard plans the re-roll after that too.
- Bots only get `Engine.viewFor(state, seat)`: never the other wizard's numbers or an unrevealed die.

## The shell
Menu → setup (opponent, game variants, "Teach me as I play", How to play) → the table. The table is the UI: tap the wall, the dice, the targets, the numbers. Results stay until you tap them. Sound is Web Audio beeps, off in the menu.
