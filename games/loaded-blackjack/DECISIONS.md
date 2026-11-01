# Loaded Blackjack — rulings

Source: the owner's "Loaded Blackjack Rulebook" doc (player-facing) and its "Claude Code Spec" tab, which wins where the two differ. Every card is a line in `GAME_DATA.upgrades` (index.html); the engine only does what the data says.

## Rulings from the spec (section 15, built as written)
1. Side Bet scores 2 points instead of 1 when at least one other player also busted (even if everyone busted).
2. Reveal flips do not trigger "When drawn"; Last Call resolves before flex values are chosen.
3. A card moved into another player's line is controlled by its new holder.
4. Stacker and Bribe can be used off-turn to escape a bust.
5. After Hand Mucker, neither player knows their new hidden card until it flips (their total shows "+ ?"; the engine still knows the real card and busts them if needed).
6. The app picks flex values for the best total (preferring a choice that satisfies Run).
7. Draft ties are broken at random with the seeded generator, and the screen says so.
8. Simultaneous effects resolve in seat order from the first player.

## Rulings added while building (beyond the spec)
- **Nerve's draw** is a normal draw, not a hit: it does not change a player's last action or the count of passes in a row.
- **Tell** may be asked of any non-busted player, yourself included; the answer is "15 or more" / "under 15" from the target's best total.
- **Spotter** and **Snitch** need a target whose hidden card is still face down; **Hand Mucker** needs both hidden cards face down.
- **Alibi** is asked of the targeted player when a targeted ability is about to resolve; cancelling turns Alibi sideways, and the cancelled ability still counts as used (its card is turned sideways when it is a once-per-round ability).
- **Palm** can only rescue you on your own turn, when the card that put you over is the last card you drew. **Fall Guy** needs a card entering your line to have caused the bust (not Load). **Holdout** needs another card in your line to discard.
- **Double Down** counts as one hit, ends the turn, and if the deck has only one card left the second hit is skipped.
- **Getaway Car** sets your Load to 0 and your total to 17; Load received afterwards adds to the 17, and if that goes over 21 a new bust window opens without it. You pass by yourself for the rest of the round.
- **Hit Man** forces every other non-busted player whose last action was "pass", clockwise from its holder; **Cooler**/Hit Man are ignored by a player with an empty deck or a played Getaway Car.
- **High Roller** and **Chain Gang** give their Load one token at a time ("split however you like"); each token is a targeted ability (Alibi can cancel it).
- **Tiebreak rounds**: only the tied players deal; points use the number of tied players; no draft (so Run and Sandbag do nothing); the first player is the next tied seat.
- **Bust windows** open in seat order starting with the first player when several players go over at once.
- **Pass-and-play**: whenever the next decision belongs to a different human, a handoff screen hides everyone's private cards. With one human there is none. AIs answer from `Engine.viewFor(s, who, true)` only, even when "Show all hidden info" is on.
- **First-time tips** are a small version of Dig Dig BOOM!'s: each once, saved on the device, the game waits while one is open, Reset tips is in the game menu. (No "Teach me how to play" checkbox here yet.)
- **Layout**: portrait iPad first (the library's rule); landscape works too.

## The 9-card deck update (v3)
- No suits and no Ace anywhere. The starting deck is **one each of 1 through 9 (9 cards)**, all fixed values; a starting card shows only its number. Values on any card may run from 0 to 10; the card face shrinks the number for text like "1/10".
- Card table: Hi-Lo Flex 1/10; Hit Man 8; Squeeze 4+ cards in line; Hot Streak 5+ cards counting itself; Run needs any three cards with consecutive resolved values (like 4-5-6); Chain Gang counts other 1s and 2s; Card Counter is a 2 that lets you see your deck and put one card on top.
- `RULING:` Setup makes exactly one of each starting card, 9 in all (no `copies` field).
- `RULING:` Chain Gang counts other cards in your line whose printed value is a fixed 1 or 2 (starting cards and fixed 1/2 upgrades such as Card Counter); Chain Gang itself does not count, and flex or range cards do not. You may split the Load among other players.
- `RULING:` Card Counter moves the chosen card to the top and keeps every other card in its old order (no shuffle). Choosing the card already on top leaves the deck as it was. The holder's `known` record gets the new top card and the full order. The computer players put the highest card that will not bust them on top (the lowest card if every card would).
- `RULING:` Run's three cards may be anywhere in the line, and the Run card itself counts as one of them.

## Not built
- The spec's "collapsible log" is a Log button that opens a sheet; there is no separate "deck order" view beyond what a peek shows you.
