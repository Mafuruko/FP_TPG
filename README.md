# Island Colony

A peaceful top-down pixel-art colony simulator set on an 80 × 64-tile tropical island. Name your island and create two starting villagers. Guide them as they gather supplies, construct a village, raise families, unlock new abilities, discover rare collectibles, and restore seven mysterious island landmarks.

Built with vanilla ES modules, Canvas 2D, procedural SVG studio assets, and a zero-dependency Node.js development server.

---

## Features & What the Player Can Do

### 1. Direct & Autonomous Villager Management
- **Drag-and-Drop Control**: Pick up any villager and drop them onto reachable ground to move them immediately, onto a resource/worksite to start working right away, onto a delivery point (campfire or Food Storage) to drop off carried supplies immediately, or onto another villager to heal or start a family.
- **Click-to-Command**: Select a villager by clicking them on the map or in the **Villagers** panel, then click any walkable tile to send them on foot (4-way BFS pathfinding) or click a resource, crop, building, landmark, collectible, or villager to assign them.
- **Autonomous Village AI**: Idle villagers automatically choose useful chores — caring for sick neighbors, gathering/farming/fishing when food runs low, building unfinished foundations, chopping wood, mining stone, or researching Knowledge — and wander casually when nothing is urgent.
- **Repeating Preferred Jobs**: Player-assigned repeating jobs (`gather`, `chop`, `mine`, `research`, `farm`, `fish`) are remembered. When a resource node runs dry, the villager automatically switches to the nearest remaining source of the same type.
- **Stop Work & Profiles**: Open any villager's profile in the **Villagers** panel to inspect their portrait, life stage, age, active task, Health/Fed/Energy percentages, skill XP, and children count, or click **Stop work** to clear their assignment.

### 2. Resource Gathering, Economy & Skills
- **Four Village Counters**: Track **Food** (starts at 28), **Wood**, **Stone**, and **Knowledge** in the top HUD bar.
- **Physical Supply Delivery**: Villagers harvest berry bushes, coconut palms, crops, fishing spots (Food), trees (Wood), and stone deposits (Stone), then physically carry bundles back to the campfire or a completed **Food Storage** before counters increase.
- **Renewable Regrowth**: Depleted berry bushes and felled trees visually change state (`partial`, `empty`, `stump`) and automatically regrow after 35 seconds.
- **Per-Villager Skill Growth**: Completing any job grants `+1` skill XP in that discipline, reducing work time (`max(1s, 3.2s - skill × 0.12s)`) and increasing carry yield (`2 + floor(skill / 4)`, up to 5 items per trip).

### 3. Village Building & Expansion
- **5 Constructible Buildings** (placed via **Build → Place foundation**):
  | Building | Cost | Gameplay Effect |
  |---|---|---|
  | **House** | 10 Wood · 4 Stone | Raises population capacity by **+3**. |
  | **Family House** | 18 Wood · 8 Stone | Raises population capacity by **+2** and unlocks starting families. |
  | **Food Storage** | 12 Wood · 4 Stone | Adds an extra supply delivery point closer to gathering zones. |
  | **Research Hut** | 14 Wood · 6 Stone | Increases Knowledge earned per research cycle from **2 → 3**. |
  | **Healing Hut** | 12 Wood · 6 Stone | Increases Health restored per healing action from **50 → 75**. |
- **Live Placement Validation**: Hovering shows a translucent building ghost with green (valid) or red (blocked) footprint tiles. Placement checks valid build zones, terrain/water rules, villager clearance, and a clear path to the entrance.
- **Multi-Stage Construction**: Assigned builders advance sites through 5 visual stages (`foundation` → `25%` → `50%` → `75%` → `completed`).
- **12-Building Gallery**: Inspect artwork, footprints, purposes, and all construction states for all 12 studio building designs (`House`, `Family House`, `Food Storage`, `Farm Building`, `Research Hut`, `Crafting Hut`, `Healing Hut`, `School`, `Collection Hut`, `Fishing Dock`, `Campfire`, `Ancient Monument`).

### 4. Villager Needs, Life Cycle, Families & Healing
- **Needs & Routines**: Villagers track **Hunger**, **Energy**, and **Health**. They automatically eat `1 Food` when hungry (`≤ 70%`), lose health if starving (`≤ 20%`), and rest (`sleep` animation) when energy drops below `45%`.
- **Illness & Healing**: Villagers occasionally become **Unwell** (`sick` animation). After learning **Healing**, drop or assign another villager onto a sick villager (Health `< 75%`) to restore their health.
- **Aging & Life Stages**: Villagers age over time through **Baby** (`0–1`), **Child** (`2–17`), **Adult** (`18–64`), and **Elder** (`65–89`), passing away at age `90`. Babies cannot work; children can gather, collect, and fish.
- **Starting Families**: Once a **Family House** is built, housing capacity is available, and the village has at least `12 Food`, drop one eligible adult onto another to welcome a baby. Parents record partner/parent/child links, and one parent spends 30 seconds holding and caring for the newborn.

### 5. Research & Village-Wide Abilities
- **5 Starting Abilities**: `Gathering`, `Woodcutting`, `Stone gathering`, `Basic construction`, and `Research`.
- **Earn Knowledge**: Assign villagers to the lit **Campfire** (`+2` Knowledge) or a completed **Research Hut** (`+3` Knowledge).
- **5 Unlockable Research Projects** (in the **Research** menu):
  | Ability | Cost | Prerequisite | Effect |
  |---|---|---|---|
  | **Healing** | 10 Knowledge | None | Allows villagers to care for sick/injured neighbors. |
  | **Farming** | 12 Knowledge | Clear the spring | Unlocks tending and harvesting the 8 spring crop plots (`carrot`, `corn`, `potato`, `cabbage`, `tomato`; harvests `7 Food` at stage 3) and restoring the garden. |
  | **Fishing** | 18 Knowledge | Restore the garden | Look for small fish and ripples at river and coastal fishing spots. Some spots require Fishing skill level 3 or the repaired bridge. |
  | **Advanced construction** | 24 Knowledge | None | Enables repairing the eastern bridge. |
  | **Ancient knowledge** | 28 Knowledge | Investigate the cave | Unlocks reading the waterfall marks and restoring the ancient monument. |

### 6. Seven-Landmark Island Progression
Click any landmark without a villager selected to view its clue, or assign a villager to complete it once requirements are met:
1. **Light the campfire** — `4 Wood`. Creates a place to research Knowledge.
2. **Clear the spring** — `5 Stone` + lit campfire. Stabilizes the streambed and opens 8 farmable crop plots.
3. **Restore the garden** — `6 Wood · 4 Food` + **Farming**. Restores the flower garden and unlocks Farming-to-Fishing progression and Moonlight Butterfly spawns.
4. **Repair the eastern bridge** — `14 Wood · 8 Stone` + **Advanced construction**. Opens walkable access to the eastern island and eastern fishing/collectible zones.
5. **Investigate the cave** — `5 Wood` + lit campfire. Unlocks cave access and **Ancient knowledge** research.
6. **Read the marks by the waterfall** — **Ancient knowledge**. Clears the waterfall flow and opens the hidden waterfall passage.
7. **Restore the island monument** — `12 Stone · 8 Wood` + **Ancient knowledge** + waterfall passage + restored garden. Awards the **Island Restoration** achievement in **Achievements** and lets you continue sandbox play indefinitely.

### 7. Collection Book & Live Island Discoveries
- **25 Collectibles Across 4 Tabs**: 10 seashells, 5 minerals, 5 ancient artifacts, and 5 animated butterflies.
- **Dynamic Spawning**: Up to 5 live collectibles appear on reachable island tiles depending on time of day (`day`/`night`), weather (`clear`/`rain`), number of researched abilities, and unlocked landmarks.
- **Discovery Tracking**: Drop or send an age-eligible villager onto a live collectible to record it in the **Collection Book**, replacing its silhouette and tracking discovery count and first-discovered day.

### 8. Living Island, Weather, Day/Night & Adaptive Music
- **10 Wildlife Species**: Island Songbird, Seagull, Small Freshwater Fish, Coastal Fish, Dolphin, Rabbit, Deer, Forest Snake, Beach Crab, and Sea Turtle roam autonomously within their authentic terrain/water habitats.
- **Environmental Effects**: Animated water ripples, shore waves, waterfall flow, and layered tree canopies rendered over depth-sorted entities.
- **Clock & Weather**: Cycles through in-game days (`5 in-game minutes/sec` at 1× speed), daytime (`06:00–19:00`) / nighttime (`19:00–06:00`), and alternating `clear` / `rain` weather.
- **Adaptive Soundtrack**: Automatically switches between four MP3 tracks (`daytime`, `nighttime`, `rain`, and `menu` when paused). Adjust volume from `1%` to `100%` (plus `Min` / `Max` shortcuts) in **Settings → Audio**; browser remembers volume locally.

### 9. Camera, HUD, Speed Controls & Menus
- **Camera Controls**: Drag empty map space to pan, scroll wheel to zoom (`0.25×`, `0.5×`, `1×`, `2×`, `3×`, `4×`), or use bottom-right buttons for **Zoom in**, **Zoom out**, **Reset camera**, **Focus selected villager**, and **Fit to map**.
- **Simulation Speed**: Switch between **Pause (`0`)**, **1×**, **2×**, and **3×** speed in the top-right HUD, or press `Space` (when page body is focused) to pause/resume.
- **Panels & Accessibility**: Navigation rail for **Build**, **Villagers**, **Research**, **Collection Book**, **Achievements**, and **Settings** (plus **Pause**, **Save & Load**, **Notifications & Events**, and **Main Menu**). Includes toast notifications, submenu **Back** history, tooltips, and `Escape` close/cancel with focus restoration.

### 10. Local Persistence & Offline Catch-Up
- **Auto & Manual Saves**: The active slot saves to browser storage every 5 seconds and whenever you hide or leave the tab. Use **Pause → Save & Load** to save manually or manage the three island slots.
- **Bounded Offline Simulation**: When returning to an unpaused village, simulation catches up in `0.25s` increments for up to **90 real seconds** to prevent unexpected starvation or losses. Pausing before leaving freezes the village completely.

### 11. Developer Debug Mode
- Toggle via the lower-left **Debug** button or launch with `?debug=1`.
- **14 Visual Overlays**: `Tile grid`, `Tile coordinates`, `Walkable`, `Collision`, `Buildable`, `Farmable`, `Fishing stands`, `Fishing water targets`, `Object IDs`, `Interaction points`, `Entity anchors`, `Depth positions`, `Wildlife habitats`, and `Collectible zones`.
- **Live Inspector & Previews**: Click any tile or entity to inspect its JSON record (IDs, coordinates, terrain, walkability, interaction, puzzle, locked region) and view 4 developer collectible previews on the map.

---

## Controls Quick Reference

| Action | Input |
|---|---|
| Pan camera | Drag empty map space |
| Zoom camera | Mouse wheel or bottom-right HUD camera buttons |
| Pick up & drop villager | Left-drag villager onto ground, resource, building, landmark, collectible, or villager |
| Select villager / send on foot | Left-click villager, then left-click target tile or interactable |
| Place building foundation | **Build** → select building → **Place foundation** → left-click green footprint |
| Cancel placement / close panel | `Escape` (or panel close button) |
| Toggle pause | `Space` (when page body has focus) or HUD speed controls |
| Open Debug tools | Lower-left **Debug** button or add `?debug=1` to the URL |

---

## Run Locally & Test

Requires **Node.js 20 or newer**. No `npm install` step is needed.

```bash
# Start the local development server (default: http://localhost:8080)
npm start

# Optional: run on a custom port
ISLAND_PORT=3000 npm start

# Run the automated test suite (13 tests via node:test)
npm test
```

Open [http://localhost:8080](http://localhost:8080) in a modern browser. Restart `npm start` after editing any HTML studio file under `assets/` so the server reloads its generated modules.

---

## Project Structure & Documentation

```text
assets/                  Source HTML art studios (7) and MP3 music tracks (4)
docs/
  ARCHITECTURE.md        Runtime design, coordinates, rendering layers, and saves
  ASSET_AUDIT.md         Inventory of studio assets and integration boundaries
  DEVELOPMENT_ROADMAP.md Balance and feature roadmap
  FUNCTIONS_MAP.md       Complete map of every module, export, helper, and call flow
  GAME_DESIGN.md         Core design direction, economy, and progression rules
src/                     Browser ES modules (main, world, gameplay, render, ui, assets, geometry, progression, save)
tests/                   Automated verification suite (foundation.test.js)
tools/                   Studio importer (studios.js) and Node HTTP dev server (serve.js)
```

See [Functions Map](docs/FUNCTIONS_MAP.md), [Architecture](docs/ARCHITECTURE.md), [Game Design](docs/GAME_DESIGN.md), [Asset Audit](docs/ASSET_AUDIT.md), and [Development Roadmap](docs/DEVELOPMENT_ROADMAP.md).
