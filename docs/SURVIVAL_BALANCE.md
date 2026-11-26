# Survival and generations

The calendar runs at 288 simulation seconds per island day. Pause freezes meals, treatment, pregnancy, and aging. Faster speeds advance the same calendar deadlines. The survival values live in `src/survival.js`, and Healing rank power remains in `src/villagers.js`.

## Food reserves

Every 12 simulation seconds, babies, children, adults, and elders lose 9, 13, 17, and 15 Fed points respectively. Pregnancy adds 3, and carrying a newborn adds 2. At 70 Fed or lower, one Food restores 25 points when stock is available. The forecast estimates daily demand as total Fed loss per tick × 24 ÷ 25. Two adult founders need about 32.6 Food per day. At 0.8 days of reserves, Auto workers prioritize food. At 0.3 days, a second worker can help. Manual orders and skill preferences still matter.

New berry bushes hold up to 14 Food and regain 4 every 105 simulation seconds. Other renewable forage regrows after 80 seconds. Fishing supplies one extra Food per haul and crops yield carrying capacity plus 7 after planting, two growth intervals of 18 and 24 seconds, tending, and harvest. Food still reaches stores through delivery. Berries support the opening, fishing supplies steady meals, and farms pay off when tended ahead of a shortage.

Below 35 Fed, work slows. At 20 Fed or lower for 24 simulation seconds, starvation begins taking 9 Health per meal tick. The opening retains its tutorial safety floor. After the colony reaches full survival, sustained starvation can be fatal. In the one-day two-founder test, a dedicated gatherer finished with 45 Food in stores and the other founder at 82% Fed. Two researchers ran out of Food, leaving the second founder at 32% Fed.

## Illness and treatment

Illness burden below 45 is mild, 45–74 is serious, and 75 or above is critical. Mild illness slows work and can improve with food, health, and rest. Serious illness slows work further. Critical illness stops work and drains Health. Rain, hunger, and elder age can worsen a case. Natural illness checks happen roughly every 1.25 to 2 days after the tutorial. An infection needs prolonged nearby exposure. Each source can spread once, secondary cases cannot spread, and a small village keeps an eligible healthy caregiver. The first guided case stays nonfatal and noncontagious.

A healthy adult or elder must complete a 7.5-second treatment cycle at a valid interaction point. Trainee, Adept, and Master use treatment power 50, 62, and 75. A cycle restores 35% of that power as Health and removes 60% as illness burden. A completed Healing Hut adds 25 power. A critical patient needs repeated treatment. After illness clears, a 32-second recovery window restores some Health when the villager is fed, with more recovery while idle. Recovery temporarily reduces work rate. Treatment and the hut save worker time during an illness, and a cancelled cycle grants no reward.

## Families and succession

Three completed conversations or time-together activities establish familiarity. Each pair can earn one increment every 32 simulation seconds. A player must explicitly make eligible adults partners and separately choose **Plan a Baby**. Starting a pregnancy requires healthy, fed, unrelated adults, a finished Family House, a spare housing slot, and 1.25 days of food for the village including expected added demand. That reserve stays in storage. The slot stays reserved until birth.

| Milestone | Time |
| --- | --- |
| Pregnancy | 2.25 island days |
| Carried newborn | First 1.25 days after birth |
| Crawling baby | From 1.25 to 3.5 days after birth |
| Child | 6 days |
| Adult stage | 30 days |
| Elder stage | 8–13 days, determined by the villager’s seed |

Pregnant villagers remain available for ordinary work, use a little more Energy, and rest sooner late in pregnancy. After birth the parents have a three-day family cooldown. One caregiver carries the newborn and can still do light tasks. A healthy substitute can take over. Crawling stays within three tiles of a safe nursery location, with occasional care when a caregiver is nearby. Children can gather berries, fish, and collect finds. Elders keep their skills and spend more Energy on heavy work.

A child can reach adulthood 11.75 days after pregnancy starts, leaving time for the founders to work alongside them. After an island-born child becomes an adult, the Family House can welcome an unrelated adult settler when housing and food allow. Each arrival has a three-day cooldown and partnership still requires the same player-directed steps.

## Death and compatibility

Sustained starvation, neglected illness, and old age can create a memorial. Memorials preserve the cause, life stage, founder status, recorded family, and strongest skill. Paying respects adds flowers and a small capped Energy benefit. Colony loss triggers when the last villager dies and retains the existing restart and island-selection flow.

Older saves retain names, skills, resources, partners, and existing children. Migration assigns calendar-based ages with a grace period for existing elders, initializes illness severity, reconnects infant care, and leaves existing graves readable with their available history. Previously stocked bushes keep their stock. A pending legacy family interaction clears because it did not have the new explicit pregnancy confirmation. Active pregnancies, developmental stages, and reservations persist in new saves.
