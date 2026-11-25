# Update Log — Naufy (Chronological Summary)

This document records Naufy’s Island Colony changes from the first playable village through the live main menu and island save slots. Each patch lists the main files, what changed, and what Rafi can check in the game.

---

## Patch 1 — Playable Island Colony

**Files**  
`index.html`, `game.css`, `src/assets.js`, `src/world.js`, `src/main.js`, `src/gameplay.js`, `src/progression.js`, `src/save.js`, `src/ui.js`, `tools/studios.js`, `tools/serve.js`, `tests/foundation.test.js`

### Summary

- Connected the existing pixel-art studios to a playable canvas island with terrain, villagers, buildings, resources, and collectibles.
- Added autonomous chores, resource gathering and delivery, construction, research, and seven island landmarks.
- Added villager needs, aging, families, healing, local saves, and offline catch-up.
- Corrected the HTML doctype so browsers load the game in standards mode.

### What to check

1. Open the island and watch villagers gather and deliver resources on their own.
2. Open the Journal and check that landmark requirements and unlocks are visible.
3. Save and reload the village. Check that resources, villagers, and unlocked landmarks are restored.

---

## Patch 2 — Island Soundtrack and Volume Controls

**Files**  
`assets/music/`, `src/ui.js`, `src/world.js`, `tools/serve.js`

### Summary

- Added looping menu, daytime, nighttime, and rain music.
- Music starts when the browser allows autoplay. If the browser requires interaction, it retries on the first click or key press.
- The volume slider runs from 1% to 100%, starts at 100% for new players, and remembers the player’s setting.

### What to check

1. Open the game in a fresh browser profile and check the default volume in Settings.
2. Lower the volume and reload. Confirm the game remembers the setting.
3. Switch between day, night, and rain to hear the matching tracks. Patch 9 adds the crossfades.

---

## Patch 3 — Bird Flight and Aquatic Wildlife

**Files**  
`src/birds.js`, `src/fish.js`, `src/dolphin.js`, `src/render.js`, `src/world.js`, `src/save.js`, `tests/foundation.test.js`

### Summary

- Gave birds separate grounded, takeoff, flight, and landing behaviors with flapping, gliding, and ground shadows that shrink with altitude.
- Gave fish tail-powered bursts, underwater glide and tint, bubbles, and splashes. Fish that land on shore flop back toward their water.
- Added offshore dolphin swimming, surfacing, breaching, and diving.

### What to check

1. Watch a bird take off and land. Check that its shadow stays on the terrain as the sprite rises.
2. Observe fish in freshwater and coastal water. Look for the glide between tail strokes and the splash on reentry.
3. Watch the offshore dolphin complete a breach and dive.

---

## Patch 4 — Grounded Wildlife and Amphibious Sea Turtles

**Files**  
`src/ground.js`, `src/land-wildlife.js`, `src/turtle.js`, `src/render.js`, `src/world.js`, `tests/foundation.test.js`

### Summary

- Added distinct gaits and startled reactions for rabbits, snakes, deer, and crabs.
- Added movement-synced frames, contact shadows, footsteps, and terrain particles. Villagers now pass each other using small offsets around their routes.
- Gave turtles a heavy flipper crawl on sand, thrust-and-glide swimming in water, and a ripple when crossing the shoreline.

### What to check

1. Compare a rabbit’s hops, a snake’s slither, a deer’s alert pose, and a crab’s sideways scuttle.
2. Watch a turtle cross between the beach and the shallows. Check its crawl, swim, and shoreline effects.

---

## Patch 5 — Island Wildlife Director

**Files**  
`src/wildlife-director.js`, `src/world.js`, `src/render.js`, `src/main.js`, `docs/ARCHITECTURE.md`, `tests/foundation.test.js`

### Summary

- Added habitat rules and population caps for wildlife around the camera.
- Added off-screen entries and exits plus in-world transitions through cover, sand, and deep water.
- Added bird perches, fish schools that scatter from nearby splashes, and grazing near forage.

### What to check

1. Pan between the village, forest, and beach. Watch for animals entering from the edges, cover, or water.
2. Observe fish schooling in the same water body and birds pausing at perches.

---

## Patch 6 — Villager Routines, Conversations, and Wildlife Recovery

**Files**  
`src/gameplay.js`, `src/ground.js`, `src/land-wildlife.js`, `src/wildlife-director.js`, `tests/foundation.test.js`

### Summary

- Villagers deliver what they are carrying before resting, remember their work, and look for another reachable source when the current one runs out.
- Nearby idle villagers face each other and take turns gesturing during short conversations.
- A startled bird or deer can set off a staggered flock or herd reaction. Deer pause and look back after fleeing.

### What to check

1. Watch a tired gatherer deliver supplies, rest, and then return to work.
2. Let two idle villagers chat. Pick one up and confirm both return to their own activities.
3. Move a villager near a deer and watch the alert, flight, and recovery poses.

---

## Patch 7 — Tactile Job Assignment, Skills, and Quirks

**Files**  
`assets/Villager Character Studio.html`, `src/main.js`, `src/render.js`, `src/gameplay.js`, `src/villagers.js`, `src/ui.js`, `game.css`, `tests/foundation.test.js`

### Summary

- Added a pickup animation, a shadow on the exact landing tile, and icon-and-label previews for available jobs.
- Dropped villagers land with a dust puff and start valid jobs immediately. Empty ground shows a brief question mark.
- Added four skill groups and three ranks. Experience improves work speed, haul size, and tool visuals.
- Added persistent quirks such as Fast Walker, Curious, and Afraid of Snakes.

### What to check

1. Hold a villager over a berry bush. Check the landing shadow and **Gather Food** preview, then release to start the job.
2. Drop a villager on an empty tile and look for the question mark.
3. Check the villager profile for skill ranks and quirks.

---

## Patch 8 — Villager Pickup Crash Fix

**Files**  
`src/render.js`, `tools/serve.js`

### Summary

- Added a fallback pose for older character assets that lack the pickup animation.
- Updated the development server to read current Studio assets on refresh.

### What to check

1. Refresh the game, pick up a villager, and drop them on a job target.
2. Try the same with mouse and touch. Confirm the game continues running through the drop.

---

## Patch 9 — Music Crossfades

**Files**  
`src/music.js`, `src/ui.js`, `tests/music.test.js`

### Summary

- The outgoing track keeps playing until the incoming track is ready. They then blend over 2.5 seconds.
- The volume slider applies to both tracks during a fade. Rapid weather or time changes redirect the current fade smoothly.

### What to check

1. In Dev Mode, start rain, clear the sky, and switch between day and night. Listen for overlapping fades.
2. Change the volume while two tracks overlap and confirm both respond.

---

## Patch 10 — Smooth Day/Night Lighting and Gradual Weather

**Files**  
`src/climate.js`, `src/atmosphere.js`, `src/render.js`, `src/world.js`, `src/save.js`, `src/gameplay.js`, `src/ui.js`, `src/dev-tools.js`, `assets/ui-hud-studio.html`, `index.html`, `game.css`, `docs/ARCHITECTURE.md`, `tests/features.test.js`

### Summary

- Added six lighting periods with a continuous ambient tint, sun-driven shadows, and warm additive lights at dusk and night.
- Added clear, cloudy, light rain, and heavy rain states that blend over 32 in-game minutes. Cloud shadows, rain, splashes, and gusts follow the current weather mix.
- Weather follows the simulation speed, pauses at 0×, and resumes from the same point after a save. The soundtrack follows rain as it arrives and fades.
- Added time and weather events for future gameplay reactions. The [architecture notes](ARCHITECTURE.md#island-clock-weather-and-lights) document how to attach lights to map props and buildings.

### What to check

1. Try Dawn, Noon, Dusk, and Night in Dev Mode. Check neutral colors at clear noon and a warm campfire glow at night.
2. Switch from clear skies to heavy rain. Watch for gradual tint, rain, and splashes, then switch back to clear.
3. Pause mid-transition and resume at 3×. Confirm the weather holds while paused and advances faster at 3×.
4. Run `npm test` to check clock speed, weather transitions, and save restoration.

---

## Patch 11 — Naufy’s Update Log

**Files**  
`docs/UPADTE_NAUFY.md`, `AGENTS.md`

### Summary

- Added this chronological log in the same patch-by-patch format as [Rafi’s update log](UPDATE_RAFI.md).
- Recorded how to add future changes with file references and checks Rafi can follow.

### What to check

1. Open both logs and compare their patch headings, file lists, summaries, and verification steps.
2. Look for a new entry at the bottom after the next completed update.

---

## Patch 12 — Live Island Main Menu and Three Save Slots

**Files**

`src/main-menu.js`, `src/main.js`, `src/save.js`, `src/preferences.js`, `src/ui.js`, `src/world.js`, `src/render.js`, `src/atmosphere.js`, `index.html`, `game.css`, `docs/ARCHITECTURE.md`, `tests/features.test.js`

### Summary

- Added a title screen that pans across the live island with active weather, surf, and wildlife. It previews the latest valid save or the starting island while keeping gameplay controls out of the way.
- Added three separate save slots with Continue, new and load flows, and confirmation before deleting or overwriting. Existing single-village saves can migrate to Slot 1.
- Added a 1.25-second camera glide into gameplay and a return to the title from the pause menu.
- Added independent volume sliders, fullscreen, integer scaling, and opt-in lightning settings. The menu uses existing pixel icons and soft synthesized button sounds.

### What to check

1. Open the game and watch the island pan behind the title. Check that the gameplay HUD appears after entering an island.
2. Create islands in two slots, then return through the pause menu. Check the day and villager count on each slot and verify that Continue opens the most recent one.
3. Cancel an overwrite and confirm the island is still there. Try deleting a test island and check that the slot becomes empty.
4. Change the volume or display settings, reload, and verify that the settings carry across islands.
