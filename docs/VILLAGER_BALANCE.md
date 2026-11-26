# Villager balance

## Experience and rank

The four personal skills sum XP from their own jobs. Gathering includes berries, wood, stone, crops, and fishing. The other three each have one job. A delivered haul, completed construction stage or productive landmark action, and completed research cycle each earn 1 XP in their respective skills. Healing earns `ceil(actual Health restored / 20)` XP plus 4 XP for curing sickness. Idle time, movement, cancelled work, and cycles without a result give no XP.

| Rank | Skill XP | Gathering | Building | Research per cycle | Healing per treatment |
| --- | ---: | --- | --- | --- | --- |
| Trainee | 0–17 | 2 units per trip, 100% cycle time | 100% cycle time | 2 Knowledge at camp, 3 at the hut | 50 treatment power |
| Adept | 18–53 | 3 units per trip, 90% cycle time | 86% cycle time | 3 at camp, 4 at the hut | 62 treatment power |
| Master | 54+ | 5 units per trip, 80% cycle time | 72% cycle time | 4 at camp, 5 at the hut | 75 treatment power |

The normal base cycle is 3.2 simulation seconds before applicable modifiers. Low Food or Energy can reduce the cycle rate to 85%. Treatments use a 7.5-second cycle and a completed Healing Hut adds 25 treatment power. The [survival guide](SURVIVAL_BALANCE.md) explains how that power affects Health and illness. Knowledge goes to the shared village pool. Buying village abilities still uses that pool and the existing unlock rules.

Each rank has ten levels. The level thresholds use the rank start plus the rounded fraction of the XP range at `0, .055, .11, .22, .33, .44, .55, .67, .78, .89`. Master progress fills at 114 XP. The previous rank thresholds were 0, 5, and 14. Older saves preserve earned ranks and approximate progress within each rank. Saved fishing practice keeps its original value for the fishing unlock.

## Work preferences and daily life

- **Auto** chooses reachable work. Critical reserves of 0.3 days or less come first and allow a second food worker. Work then considers sick villagers, food when reserves are at most 0.8 days, construction, wood below 35, stone below 25, and research below 35 Knowledge. Food, wood, and stone have separate thresholds for deciding when to stop an existing routine, so a delivery at the threshold need not immediately change jobs. Nearby available specialists get preference for ordinary work.
- **Focus** limits routine work to one skill. A manual command takes priority, and the villager returns to the chosen focus after that order. A depleted target can be replaced with a reachable equivalent. Unavailable work is retried periodically. **Rest / Idle** leaves room for sleep and social activity and accepts explicit orders. Family, collectibles, investigations, and mourning remain player-directed.
- Below 45 Energy a villager can pause a repeated job after any delivery. They may use a reachable camp or home within six tiles, recovering 17 Energy per simulation second there or 13 where they are. At 76 Energy they can resume pending work. Quiet camp visits and brief conversations also restore a little Energy.
- **Stop Work** clears the order and gives a 12-second break from autonomous chores. **Stop Moving** holds the current position and work for 20 seconds. Use **Release Hold** to resume sooner.
- A Fast Walker moves and hauls 15% faster. A Curious villager researches 8% faster and sometimes visits nearby landmarks. A villager who is Afraid of Snakes briefly flees while free and can return to their routine afterward.

## Hauling and balancing checks

Hauls reserve available stock when loaded and use the reachable drop-off with the shortest route among camp and eligible finished storage. Fishing adds 1 and a ripe crop adds 7 food to normal carrying capacity. Source stock and village counters change together when the load arrives. Reassignment releases an undelivered reservation. Saving during delivery preserves the load, and older saves that already awarded its XP keep that credit.

With Dev Mode active, select a villager to inspect this session's work counters, including XP, cycles, deliveries, outputs, travel, and rest. The automated fixtures in `tests/foundation.test.js` start each rank under the same conditions. In 110 simulation seconds the ranks delivered 14, 26, and 47 Food. The same house took 13.1, 11.5, and 9.9 simulation seconds. Camp research produced 2, 3, and 4 Knowledge per cycle. Higher-ranked healers provided more Health and relieved more illness on the same patient.
