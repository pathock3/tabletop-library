# Kingslayer — decisions

Source: Patrick's Kingslayer Rulebook (Feb 2022) and the "Kingslayer cards" sheet (Small Council, Ravens) in his Drive. Every number below is in `GAME_DATA.rules` and editable in the Rules Lab.

## What the app is
A playtest table, not the game with real people. Talking is replaced by ravens (preset messages, optionally with coins); the computer houses read them, remember who kept promises, and some lie. There is no timer: a duration card's seconds become beats (`beatSecs` = 30 each), and "Vote now" skips the wait.

## Where the rulebook is silent (my defaults)
1. **Payout tracker amounts**: not written. Default 1, 2, 3, 4, 5, then +5 each time round (the rulebook's "5+ the amount above, starting at 6"). `tracker`, `trackerWrap`.
2. **Starting coins**: 2 each. **Duration cards**: Sovereign 90 / 120 / 60 / 90 and Assassins 60 / 90 seconds.
3. **"Unless the sovereign voted to block their coup"**: ambiguous. Default: the sovereign's vote counts like anyone's and the tie rule protects them. Lab toggle `sovereignBlocksByVote`: if the sovereign votes for the top challenger, the coup is blocked.
4. **Council cards arrive**: the sovereign names a house to draw one at the end of every round (`councilEvery: 'round'`); lab option: only after a coup. A coup always shuffles every council card back first.
5. **Rock-paper-scissors** between tied challengers is drawn by the app, not played.
6. **Late-voter fee** does not apply (nobody can be late).
7. **Nobody votes for themselves** (banners are given to the *other* houses).
8. **Council cards with "next round"** are played from the hand during the argument and count for that round's vote (Opportunist, Propaganda, Psychopath, Royal Spy, the Prince). Cards that work by themselves (Fundraising, Hand of the Queen/King, Kingslayer, Decoy, Peaceful Transition, Master of Coin) fire automatically.
9. Master of War, Opportunist, Propaganda, Psychopath, Royal Spy and the Prince are only played in Sovereign rounds. Fundraising / Decoy / Peaceful Transition / Hand count only in Sovereign rounds.
10. High Sparrow: a correct accusation takes the bribe's coins from whoever received it. Master of Whispers: revealing shows the card to everyone and lets the holder see every council card; the "tongue" bars one house from sending ravens until the vote. Royal Executioner steals all of a house's cards. The Prince dispenses the treasury one coin at a time round the table, skipping the Prince.
11. **Kingslayer**: if the sovereign votes for the holder, the holder takes the throne as a new sovereign (the old sovereign's vote makes them a supporter-less coup: the voters for the holder still count as supporters).

## Computer houses
Levels change how noisy and forgetful they are and how many ravens they send. Each house has a character (loyal, greedy, schemer, wild) that sets how often it backs the sitting sovereign anyway, lies about a pledge, and bribes. All these levers are in `GAME_DATA.ai`. They only see the public table, their own vault/cards/ravens and the votes of past rounds.

## Not in v1
Winter is Coming (the d6 / 2d6 end-of-game dice), the secret Objectives, the 7 Kingdoms module, the Sovereign deck, IOUs and sideways banners, pass-and-play at one device.

## Playtest notes
- The first simulations showed the computer houses herding behind the sitting sovereign (coups in about 12% of rounds) because voting for the incumbent was scored like any other vote. Voting for the incumbent earns the voter nothing, so I removed the incumbent's head start and added an "incumbent loyalty" chance per character (fear, habit, a past favour). At Normal, about three in four sovereign rounds are now coups.
