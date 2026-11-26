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

---

## Patch 13 — Collectible Pickup and Rarity Reveal

**Files**

`assets/Villager Character Studio.html`, `src/assets.js`, `src/gameplay.js`, `src/render.js`, `src/main.js`, `src/story.js`, `tests/foundation.test.js`

### Summary

- Villagers reach for a collectible or catch a butterfly, then lift it overhead with a surprised expression.
- The raised item displays its rarity sparkle and label. Repeat finds get the same reveal and still count in the Collection Book.
- The camera eases toward the finder and leaves manual camera controls available. The first-find guide appears after the reveal.

### What to check

1. Drop an eligible villager on a collectible. Watch for the grab before it leaves the ground.
2. Check that the finder holds the item overhead and that its rarity matches the Collection Book.
3. Collect a repeat find and confirm that the reveal still plays. Pan the camera manually during a reveal to interrupt the automatic pan.

---

## Patch 14 — Butterfly Collectible Hover

**Files**

`src/render.js`, `tests/foundation.test.js`

### Summary

- Collectible butterflies make a small, pixel-snapped loop around their spawn point, alternating wingbeats with a gentle glide.
- The catch area covers the butterfly’s moving sprite and its spawn point, so villagers can catch it without chasing it.

### What to check

1. Watch a butterfly for a few seconds. Its wings should alternate between fluttering and gliding while it stays near the same spot.
2. Drop a villager on the butterfly during its glide. Confirm the catch and rarity reveal play as usual.

---

## Patch 15 — Natural Fishing Cues

**Files**

`src/render.js`, `src/story.js`, `src/story-ui.js`, `src/main.js`, `src/ui.js`, `README.md`, `tests/features.test.js`

### Summary

- Replaced fishing arrows with small fish silhouettes and expanding pixel ripples on the water.
- Fishing guides pan to the rippling water and explain where to drop a villager.

### What to check

1. Unlock Fishing, then look for small fish and ripples near the shoreline.
2. Drop an eligible villager on the ripples and check that the Fish preview and fishing task work.
3. Use the Fishing guide to jump to the shore and check that the water cue identifies the tile.

---

## Patch 16 — Name Your Island and Create Its First Two Villagers

**Files**

`src/island-setup.js`, `src/main-menu.js`, `src/main.js`, `src/save.js`, `src/render.js`, `src/ui.js`, `game.css`, `README.md`, `tests/features.test.js`

### Summary

- Added an island setup screen where players name the island and customize exactly two adult villagers before starting.
- Added live pixel-art previews and controls for each villager’s name, body, skin tone, hair style and color, clothing, outfit colors, and accessory.
- Save slots and Continue display the island name. The starting villagers and their appearances are stored with the island.
- Confirming an overwrite opens setup. The previous save stays in the slot until the player starts the new island.

### What to check

1. Start an island in an empty slot. Name the island and both villagers, then change one villager’s hair or outfit and check the live preview.
2. Start the island and confirm the customized pair is the entire starting roster.
3. Return to the Main Menu and check the island name on Continue and its slot. Reload and confirm the same pair returns.
4. Confirm an overwrite, then back out of setup. Load the slot and check that the original island is still there.

---

## Patch 17 — Centered Villager Customization

**Files**

`src/main-menu.js`, `src/island-setup.js`, `src/ui.js`, `game.css`, `tests/features.test.js`

### Summary

- Centered island setup over the live island and styled the two portrait cards with Island Colony’s existing parchment colors and wood borders.
- Labeled the first founder Female Villager and the second Male Villager. Each founder’s label stays with their profile after starting and reloading the island.

### What to check

1. Open **Islands → Start New Island**. Check that the panel is centered and both portraits have clear labels.
2. Try a narrow window and check that the cards stack and can be scrolled.
3. Start the island and select each founder to check the profile label.

---

## Patch 18 — Stormbay Island and Visual Villager Options

**Files**

`src/island-setup.js`, `src/main-menu.js`, `src/main.js`, `game.css`, `tests/features.test.js`

### Summary

- New islands start with the editable name Stormbay Island.
- Body, skin, hair, clothing, and accessories now open a set of selectable SVG thumbnails from the existing villager art. The selected image updates the founder’s live portrait.

### What to check

1. Open a new island. Confirm the name starts at Stormbay Island and that you can replace it.
2. Open Hair Style or Clothing, pick a thumbnail, and check that the main portrait and the selected thumbnail update.
3. Start the island and reload it to verify the chosen name and appearance are saved.

---

## Patch 19 — Auron Dialogue and the Two-Survivor Opening

**Files**

`tools/studios.js`, `src/auron-dialogue.js`, `src/dialogue-voice.js`, `src/story.js`, `src/story-ui.js`, `src/main.js`, `src/preferences.js`, `src/main-menu.js`, `game.css`, `docs/ARCHITECTURE.md`, `tests/features.test.js`

### Summary

- Connected the original Island Guardian Studio portraits to Auron’s dialogue, including expressions, blinks, and changing mouth frames.
- Added a paused opening about two survivors, compact guides for food, wood, shelter, care and research, and a branching mystery prompt.
- Added soft synthesized speech, adjustable text speed, dialogue volume, and a saved voice mute setting.

### What to check

1. Start a new island. Check that Auron’s opening pauses the village and that his portrait changes as you advance.
2. Finish or skip the opening. Drop a villager on the berries during the compact food guide and check that the wood hint follows.
3. Unlock a research ability and finish its guide. Try both responses to Auron’s first mystery prompt.
4. Open Settings and change dialogue text speed, volume, or mute. Check that the preferences persist after reloading.

---

## Patch 20 — Load Auron’s Face on Running Servers

**Files**

`src/guardian-art.js`, `src/main.js`, `tools/studios.js`, `tools/export-guardian.js`, `package.json`, `tests/features.test.js`, `docs/ARCHITECTURE.md`

### Summary

- The game loads Auron’s original Studio artwork through the existing game-script route, which works on a server already running the game.
- Added `npm run export:guardian` to regenerate the browser module from the Studio HTML. A test checks that the generated module matches its source.

### What to check

1. Refresh the game with the development server running, then start a new island.
2. Check that Auron’s face appears and changes expression as the dialogue progresses.

---

## Patch 21 — Island Colony Typography

**Files**

`game.css`, `src/main.js`

### Summary

- Applied Pixelify Sans to headings, Silkscreen to tabs and small labels, and Nunito Sans to body text, buttons, and Auron’s dialogue.
- Recalculate the floating HUD’s dimensions when the browser loads its web fonts.

### What to check

1. Open the island setup screen, Settings, and the in-game HUD. Compare headings, tabs, and button labels.
2. Start a new island and check that Auron’s dialogue uses larger body text with more line spacing.

---

## Patch 22 — Tidier Menu and Dialogue Layouts

**Files**

`game.css`, `src/main-menu.js`, `src/story-ui.js`

### Summary

- Refined heading and button spacing with the existing font families, aligned Settings controls, and let long island names wrap.
- Opened founder appearance choices in a thumbnail tray that keeps both cards aligned. Choosing an option closes the tray and returns focus to its control.
- Moved Auron’s dialogue progress into the footer and let the dialogue text use the full card width on phones.
- Aligned the Collection Book categories in two even rows and gave their counts a consistent type style.

### What to check

1. Open Settings and check that the percentages, dropdown, and checkboxes line up.
2. Open the Hair style and Accessory pickers for both founders. Choose a thumbnail and check that the preview updates and the other founder card stays in place.
3. Start an island at desktop and phone widths. Check that the dialogue text has space to wrap and the progress and buttons appear below it.
4. Open the Collection Book and check that the four categories fit in two rows.

---

## Patch 23 — Occasional Auron Check-ins

**Files**

`src/auron-dialogue.js`, `src/story-ui.js`, `src/main.js`, `game.css`, `tests/features.test.js`

### Summary

- Added a dozen short remarks with Auron’s dry jokes, island facts, old memories, and friendly check-ins. Rain and nighttime unlock their own lines.
- The first remark can appear after 90–150 seconds of quiet play. Later remarks wait 4–7 minutes, and each island remembers which lines it has heard.
- Check-ins leave the camera and simulation alone, close automatically after the line has been readable for 13 seconds, and make way for tutorials and important events.

### What to check

1. Finish the opening and tutorial prompts, then play with the side panels closed. Look for an occasional Auron card while the villagers keep working.
2. Close the card yourself or let it disappear. Check that subsequent remarks vary and that opening a story prompt takes priority.

---

## Patch 24 — Compact Bottom Dialogue

**Files**

`game.css`, `src/story-ui.js`, `src/story.js`, `src/main.js`, `tests/features.test.js`

### Summary

- Reserved the dimmed, centered layout for story scenes and story choices, including the colony ending.
- Moved birth, old-age, collectible, and landmark updates into bottom cards alongside tutorial hints. The island stays interactive while these cards are open.
- Made Auron’s facts and jokes more compact with a smaller portrait and a close button. They dismiss ten seconds after the text finishes appearing.

### What to check

1. Start a new island and check that Auron’s opening still dims the island. Dismiss it and check that the first tip sits at the bottom while the map remains interactive.
2. Find a first collectible or complete a landmark. Check that its update appears at the bottom and you can keep playing.
3. Let an Auron fact appear on desktop and phone widths. Check its position and automatic dismissal.

---

## Patch 25 — More Expressive Villagers

**Files**

`assets/Villager Character Studio.html`, `src/villagers.js`, `src/render.js`, `src/ui.js`, `tests/foundation.test.js`

### Summary

- Villager faces now follow their current activity and reactions. They smile during conversations, concentrate at work, look tired when low on energy, and react to scares or confusing drops.
- Added brief blinks at different times for each villager. Older saves with a surprised portrait now show a relaxed portrait and use the same activity-driven faces in the world.
- Picked-up villagers still look surprised. When they lift a collectible, their surprised face turns into a smile as they show it off.

### What to check

1. Load an existing island and watch villagers idle, talk, and work. Look for different facial expressions and occasional blinks.
2. Pick up a villager, drop them on empty ground, and watch their expression settle once the reaction ends.
3. Assign a villager to grab a collectible and watch their expression as they raise it overhead.

---

## Patch 26 — Drifting Sky Clouds

**Files**

`src/atmosphere.js`, `src/render.js`, `tests/features.test.js`

### Summary

- Added drifting pixel clouds above the island and ocean, with stepped shading and matching shadows beneath them.
- Cloud bodies fade into view as you zoom out. At close range, their shadows can still pass over the island.
- Clear skies have scattered clouds. The weather blend adds more as the sky turns overcast, and the sun shifts and softens their shadows through the day.

### What to check

1. Use **Fit to map** in the camera toolbar or zoom out with the mouse wheel. Watch the clouds and their shadows drift across the island.
2. Zoom back in and check that the cloud bodies fade while the shadows remain visible.
3. Compare clear weather with heavy rain and look for the change in cloud cover.

---

## Patch 27 — WASD and Arrow-Key Camera Controls

**Files**

`index.html`, `src/camera-controls.js`, `src/main.js`, `tests/features.test.js`

### Summary

- Added continuous camera panning while holding WASD or the arrow keys. Diagonal movement uses the same speed as straight movement.
- Keyboard panning takes over from an automatic camera pan and stops on key release or when the game loses focus. Story scenes and focused form controls keep their keyboard behavior.
- Added the keys to the in-game control hint.

### What to check

1. Hold each direction with WASD and with the arrow keys. Try moving diagonally and release to stop.
2. Use a volume slider with the arrow keys and check that the camera stays put.
3. Switch away from the game while holding a movement key and check that the camera stops.

---

## Patch 28 — Freshwater Spring Restoration

**Files**

`assets/Island Map Studio (1).html`, `tools/studios.js`, `src/render.js`, `src/gameplay.js`, `src/progression.js`, `src/story.js`, `tests/foundation.test.js`

### Summary

- Moved the freshwater spring to the south bank of the lake, directly above the cropland. Its new pixel art shows mossy rock, a seep, a catch pool, and a debris-blocked outlet.
- Restoring it with 5 Stone clears the outlet, adds stone braces, and starts animated water flowing into the field. The journal and drop preview point to the new restoration site.
- Existing saves keep their spring and crop progress. Villagers caught in the new footprint move to a walkable bank, and active spring workers approach the new site.

### What to check

1. Light the campfire, gather 5 Stone, and use the Guide to find the spring between the lake and fields.
2. Drag an adult onto the blocked spring. Check for the **Restore Spring** prompt, then watch for flowing water and crop plots after the job finishes.
3. Load an older island with a restored spring. Check that the new spring is flowing and that crop growth stages carry over.

---

## Patch 29 — Spring in the Southern Woods

**Files**

`assets/Island Map Studio (1).html`, `tools/studios.js`, `src/gameplay.js`, `src/story.js`, `tests/foundation.test.js`

### Summary

- Tucked the spring into a gap among the trees southeast of camp. The canopy frames the pool, and villagers can approach through the open ground along the woodland edge.
- Pointed the Guide at the exposed center of the spring and updated Auron’s directions to the woods.
- Existing saves carry their restoration progress to the new site, including spring work that was underway at the lakeshore.

### What to check

1. Follow the southern path from camp and look through the trees to the east for the spring.
2. Gather 5 Stone and use **Show Me** in the spring chapter of the Guide. Drop an adult on the visible rock and check that they can reach the bank and restore it.
3. Load an island with the lakeside spring already restored and check that it flows in the woodland spot.

---

## Patch 30 — Spring Feeds the Central Pond

**Files**

`assets/Island Map Studio (1).html`, `tools/studios.js`, `src/gameplay.js`, `src/story.js`, `tests/foundation.test.js`

### Summary

- Moved the spring to the north bank of the central pond. Its restored outlet now flows across the shoreline and into the pond.
- Set out dry approaches and updated the Guide. Adults can still restore it with 5 Stone after lighting the campfire, and the restored spring still opens the farming progression.
- Kept the existing fishing spots and crop plots in place. Saved restoration progress and assigned spring workers carry over.

### What to check

1. Head around the west side of the central pond and find the spring just off the north-bank path.
2. Drop an adult onto the blocked spring with 5 Stone. Look for the stream and ripples where the outlet enters the pond.
3. Load a save with the spring already restored and check that the flow and farm progress carry over.

---

## Patch 31 — Unified Villager Commands

**Files**

`src/gameplay.js`, `src/world.js`, `src/main.js`, `src/render.js`, `src/ui.js`, `src/villagers.js`, `src/preferences.js`, `game.css`, `tests/foundation.test.js`

### Summary

- Mouse and touch drops still land and start valid jobs immediately. Click-to-send walks to a reachable working position before beginning the same job. Both use the same task restrictions and supply delivery rules.
- New commands clear superseded movement and tasks. Routes can recover from newly blocked tiles, and targets that disappear or change are checked before work and rewards.
- Added shared hover and drag feedback for job names and requirements, temporary target outlines, a fading arrival marker, and distinct travel and work status lines.
- Added brief contextual reactions and quiet command cues using the existing animation and sound systems. Desktop players can Shift-click another villager to send the selected villager to them.

### What to check

1. Send a villager to a berry bush and check that they walk before gathering. Drag that villager onto a tree and check that chopping starts on landing.
2. Try a locked fishing spot with both controls. Check that both show the same requirement. Try releasing in water or outside the canvas and check that the villager stays safe.
3. Change a walking villager’s destination or pick them up mid-job. Check that the old route, status, and pending work clear.
4. Use touch to tap and select a villager, then hold and drag them to a task. Check that the action preview sits above the finger.

---

## Patch 32 — Villager Work, Skills, and Daily Life

**Files**

`src/gameplay.js`, `src/villagers.js`, `src/world.js`, `src/dev-tools.js`, `src/main.js`, `src/ui.js`, `game.css`, `tests/foundation.test.js`, `tests/features.test.js`, `docs/VILLAGER_BALANCE.md`, `docs/ARCHITECTURE.md`

### Summary

- XP now comes from actual deliveries, build progress, research, and treatment. The four skills have rank-specific benefits, and older saves retain earned ranks.
- Added Auto, four skill focuses, and Rest / Idle. Villagers account for stock, reachable work, and fatigue. Manual orders take priority, and tired villagers finish their haul before resting and resuming an order.
- Loaded supplies are reserved until delivery, including across saves. Higher Gathering ranks carry larger loads and can choose closer finished food storage.
- The profile and roster show work status, skill progress, bonuses, and quirks. Stop Work gives villagers a break, and held villagers can be released early. Dev Mode shows work and output counters.

### What to check

1. Set one villager to Research and another to Rest / Idle. Give the resting villager an explicit gathering order and check that the delivery finishes before they return to leisure.
2. Compare a Trainee and Master on the same gathering route. Save while a worker is carrying supplies, then load and check that the delivery awards supplies and XP once.
3. Expand Skill benefits to see the current and next ranks. Use Stop Moving and Release Hold while the villager is working, and check that they pick up where they left off.

---

## Patch 33 — Survival, Families, and Generations

**Files**

`src/survival.js`, `src/gameplay.js`, `src/world.js`, `src/villagers.js`, `src/story.js`, `src/dev-tools.js`, `src/main.js`, `src/render.js`, `src/ui.js`, `game.css`, `tests/features.test.js`, `tests/foundation.test.js`, `docs/SURVIVAL_BALANCE.md`, `docs/VILLAGER_BALANCE.md`, `docs/ARCHITECTURE.md`

### Summary

- Added a daily food forecast, slower forage replenishment, larger fishing and farm hauls, and gradual starvation warnings and damage.
- Added mild, serious, and critical illness with timed treatment, a tangible Healing Hut benefit, limited contagion, and recovery. The first guided illness remains safe.
- Families now build familiarity, become partners, and deliberately plan a pregnancy. Newborns are carried, crawl in a safe area, and then grow into children. A Family House can welcome an unrelated adult after the first island-born child grows up.
- Calendar-based aging gives the founders time to raise a child. Elders retain skills, memorials preserve character history, and Auron comments on major milestones.

### What to check

1. Compare the food forecast with one founder gathering and with both assigned to other work. Watch the warnings as the reserve falls.
2. Assign a healthy healer to a sick villager and interrupt the first treatment. Try again and compare the results with a completed Healing Hut.
3. Build a Family House, use the partner and baby commands, and save during pregnancy. Continue the slot and check that one baby is born, carried, and later able to crawl.
4. Open a founder’s memorial and check their recorded family and strongest skill. Send another villager to lay flowers.

---

## Patch 34 — Readable Menus and Responsive HUD

**Files**

`game.css`, `index.html`, `src/hud-windows.js`, `src/ui.js`, `src/main-menu.js`, `src/preferences.js`, `src/story-ui.js`

### Summary

- Docked the HUD on phones and short windows so Resources, Clock, and navigation have their own space. Desktop HUD placement and resizing still save normally.
- Long panels scroll beneath an always-visible heading. Labels and long names wrap inside their cards, and notifications appear inside the current panel.
- Shortened the Island Guide and Villager profile. Skill comparisons, family instructions, and advanced settings open on demand.
- Founder appearance options expand inline. Long story text scrolls while its actions stay visible. The colony-loss screen asks for confirmation before resetting all data.

### What to check

1. Open Research, Journal, and Settings on a narrow or short window. Scroll to the bottom and check that Close remains visible.
2. Open a villager with a long name, then expand Skills & traits. Check that needs and actions are easy to find and text wraps inside the profile.
3. Customize both founders on a phone-sized window. Check that the appearance choices and Start Island button are reachable.
4. Resize a desktop window down to a phone width, then back up. Check that the desktop HUD layout returns.
