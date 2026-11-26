# OMG Babies! — decisions

Sources: "OMG Babies! Rulebook" (Dec 2023, a draft) and the "Babies Photo Cards" sheet, both in the Drive folder "OMG Babies!". The rulebook has gaps and one contradiction; every call is here and every number is in `GAME_DATA.rules`.

## Rules as built
- 2–8 players: you and 1–7 computer parents, played clockwise; you go first. Everyone starts with 1 Poop and one Baby.
- **Morning** (each costs 1 Energy, any number of times): **New Baby** (draw from the 40 babies), **Daycare** (flip any number of babies face down or up; face-down babies are not in your Home: no dice, no Poop, no Night effects), **Deep Clean** (lose all Poop, Joy and Energy; your peak Joy stays).
- **Afternoon**: roll 5 dice + 1 per baby at home (max 10; skills add fixed dice). Reroll any dice for 1 Energy each time. Faces: 1 Learn, 2 Move, 3 Social, 4 Diaper (removes up to 2 Poop each), 5 Rest (+2 Energy each), 6 Play (wild).
- **Joy**: only with at least one baby at home; for each of Learn, Move and Social, n of a kind pays 2→1, 3→2, 4→4, 5→6, 6→8, 7→10, 8→12, 9→14, 10→15, and the three kinds add up.
- **Goals**: five face-up Goal cards; pay the dice (Play dice fill in) to take one. A **Memory** gives its Joy; a **Skill** is a permanent extra die face (+1 Learn / Move / Social) added to every afternoon.
- **Night**: −1 Joy per 2 Poop at home, then +1 Poop and −1 Energy for each baby at home (Energy and Joy do not go below 0).
- **Winning**: the highest **peak** Joy at any point in the game, after 7 rounds (a setting, 3–19).

## Where the rulebook is silent or contradicts itself (my defaults)
1. **Starting Energy**: the Setup says 5, the "Start of the Game" says the first player starts with 1, the next with 2 and so on. I follow the second (a catch-up for later seats), capped at 5. (`startEnergy`, `startEnergyCap`.)
2. **Game length**: "play as long as players are having fun" does not work in an app, so the game ends after 7 rounds ("a week", the rulebook's other idea).
3. **Skill costs** are blank on the sheet: 3 of the matching die (`skillCost`).
4. **Unnamed goal cards**: the sheet lists 12 cards with no name (Memory 2M/2L/2S/2R = 1 Joy, 3M/3L/3S/3R = 2, 4M/4L/4S/4R = 4); I gave them names (Tummy Time, Bedtime Story, Peekaboo, Cozy Nap, Crawling Race, Picture Book, Giggle Party, Lazy Sunday, Big Adventure, First Birthday, Family Reunion, Perfect Day). Costs: M = Move, L = Learn, S = Social, R = Rest.
5. **Play dice**: they are assigned automatically at the end of the afternoon to whatever pays most (Joy sets, Diaper, Rest); when buying a goal they fill in for any missing die.
6. **Dice spent on goals are used up**: they no longer score Joy, clean Poop or give Energy.
7. **Baby cards** have only names on the sheet; the 40 names are made up and each baby gets a cartoon face from its number. Unnamed babies are named automatically.
8. **Energy** has a top (10, `energyMax`); the rulebook has none. **Deep Clean** costs 1 Energy and then loses all Energy (as written).
9. **Event cards** (25, shown in parentheses in the rulebook) and shop **Items** have no content, so they are not built.
10. **Everything is public** (dice are rolled in the open), so the bots see what you see. The bots play a whole turn at once; a recap after your Night shows what each did.
