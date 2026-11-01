# What the owner likes — apply to every game from the start

These come from feedback repeated across Dig Dig BOOM!, One More, Advanced Counting, Torn Treasure, This Means WAR!, Loaded Blackjack and the library page. Build every new game to this list, and check an old game against it when touching it, so the same edits are not asked for twice.

## Screen and layout
- **Use the whole screen.** No dead space between areas, no big empty margins. If there is a gap, grow the content into it. Check at iPad portrait 820×1180 first, then iPhone 402×874, then landscape.
- **Do not shrink things to make room for a button.** Put the button inside the row or area it belongs to instead.
- **Matching things match in size** (draw pile and discard pile; a card in a row and the same card elsewhere).
- Keep content clear of the status bar at the top. Locked page: no scrolling or rubber-banding (help panels scroll inside).
- **Cards that carry text are big.** Name, rule text and numbers must be readable on an iPad at arm's length. Put the important numbers where a player expects them: big and central, with small labels in the corners.
- Cards say what they do on the card. No obscure symbols standing in for words, no flags or icons that raise questions.
- Buttons at least 44 pt; ones used all the time (menu, End turn, Tap to start, Roll) are bigger. Put the main action next to the thing it acts on (for example, directly above the die).

## Menus and chrome
- **One in-game menu**, not scattered buttons. It holds help/how to play, settings, new game, pause, back to the library. Everything else on the table stays about the game.
- **The homepage and each game's main menu must be very attractive**: art, a clear title, a real sense of the game's theme, big friendly buttons. Not a plain list.
- Every game has a small, quiet way back to the library, and a credits line.
- Do not show the player's own name or colour as a label ("You are Blue"). Use colour and position instead.

## Interaction
- **The table is the UI** (the Tabletop Test): tap cards, tiles and piles directly. No verb buttons for game actions, no dropdowns, no modals for actions.
- Fewest taps possible. Nothing advances on a timer; the player controls pace (End turn / Start turn / Tap to continue). Exception: short animations that end by themselves.
- Taps register instantly. No checkmarks on tapped cards.
- When the game asks the player to look at cards in a pop-up, **number them** and show the result plainly ("+4 hearts"), so the player sees what happened.
- Confirm risky taps (tap again to confirm) rather than adding modal dialogs.
- Hidden information stays hidden: computer players get the public view only, and shared devices use a hand-off screen.

## Teaching
- **First-time tips**: short one-time pop-ups, shown once per device when something comes up, never before a game even starts. A "Teach me how to play" option on the new-game screen turns them on. Wording stays the same every time.
- A rules reminder appears the first time a rule matters. No tips for things the player can see.
- Any judgment call is listed in the in-game How to Play and in the game's `DECISIONS.md`.
- **Rules text in the game matches the data exactly.** When a number changes, every place that mentions it (help, tips, setup captions, tooltips, card text) changes too.

## Feel and polish
- Animation with meaning: open the box, flip the card, tear the pack, replay the round. Make it smooth on an iPad, with no pauses that make the player wait for nothing.
- Visual theme per game (the Torn Treasure map and sand, the casino felt of Loaded Blackjack). Dark, rich, high-contrast; concealed things deep and dark, public things bright.
- The library shows games as proper standard-sized boxes on wooden shelves, one shelf per row of games.
- Computer players have Easy, Medium and Hard, and play at a human pace.

## How to work (process)
- Commit straight to `main` and push; also push to the working branch. Say "pushed, building", not "live".
- Run only the tests the change touches plus `npm run test:quick`; not the full suite unless it is the end of a big batch.
- No pull requests unless asked. Do not ask questions that have a sensible default; choose, log it in `DECISIONS.md`, and keep going.
- When asking the owner to open something, give the exact link and the exact steps.
- Report plainly what changed, anything that needed more than a value change, and any new `RULING:` comments.

## Checklist before calling a game finished
1. Fills the screen at 820×1180 and 402×874, and works in landscape.
2. Text on cards is large and readable; nothing is cut off.
3. One in-game menu; attractive main menu; way back to the library.
4. All actions are taps on the table; no timers; the player sets the pace.
5. First-time tips and "Teach me how to play"; help text matches the rules data.
6. Easy/Medium/Hard computer players if the game has opponents.
7. Rules and numbers live in one data block; tests cover every rule.
