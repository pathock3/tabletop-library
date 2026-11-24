# Thrift Shop — decisions

Source: Patrick's "Thrift Shop rules" (2–10 players in the current copy, 2–4 in the old one) and the "Thrift Shop cards" sheet, tab "cards 1.1". Every number is in `GAME_DATA.rules` and editable in the Rules Lab.

1. **Players**: you + 1–5 computer shoppers (2–6 players), default 3.
2. **Copies of each card**: the sheet has one of each (14–18 per stack); the rulebook counts about 25 per type. Default 2 of each (about 30 per stack). The four gym cards are one each.
3. **Cards**: all rows of "cards 1.1" (the Santa Hat and the four gym cards from the bottom of the sheet included). Spelling of card names is as in the sheet ("Chain Neckless", "Water-Resistent Boots").
4. **The clock**: the table game is a 2-minute scramble. Default is *Relaxed*: the shoppers take one action for every purchase or sale you make and finish their share when you tap Done shopping. *Timed* (setup screen) runs a 2:00 countdown; a shopper acts every 4 seconds. A shopper's total actions per season is its level's `actions` lever.
5. **Buying**: pay `pricePerCard` (1) per card, up to `maxBuy` (6) cards; you must keep one drawn card, the others go to the bottom in the order drawn. Nothing you draw is hidden from you; other players' draws are not shown (only a log line, "bought 3 from shoes").
6. **Selling**: the card goes to the bottom of its stack. A gym card has a negative resale value: you need that many coins to sell it.
7. **The look**: one card of each type, any card in hand. The app picks the best look and shows it; at the reveal you can tap a slot to cycle through your cards of that type (or none). The picker holds back Ripped Jeans if they score more later (`wornOnceHold`).
8. **Ripped Jeans** are discarded (to the bottom of the bottoms stack) when they were worn in the season's look.
9. **Gym cards**: −2 (shirt), −3 (shorts), −4 (socks), −5 (shoes) points if still in your hand when the round ends. A gym card you wear counts as 0 points and is not penalised (so wearing one is a way to avoid the penalty).
10. **Scoring**: the sum of a season's four numbers (negatives count) plus penalties; four seasons added up; coins score `coinPoints` (0) each at the end. Ties share the win.
11. **Hidden information**: hands are hidden until the reveal; coin and card counts are public (as on a table); the order of a stack is unknown. The computer shoppers use only that view.
12. Brand names on the sheet (Converse, Uggs, Birkenstocks, Oilers) are kept as written.

## Not in v1
The Halloween variant (Scary / Cute / Funny / Cool values and a Head slot), real-time simultaneous play for several people on one device.

## Playtest notes
Simulated at 4 players: Hard shoppers average about 45 points, Normal 38, Easy 29 over four seasons; the gap between first and last place is about 14 points at every level.
