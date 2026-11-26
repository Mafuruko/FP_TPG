# Architecture

## Source assets and adapters

`tools/studios.js` reads the original HTML files under `assets/` and exposes their rendering and metadata functions as ES modules. The importer cuts at explicit generator boundaries and adds small exports. The UI & HUD Studio contributes its reusable CSS, theme, component definitions, icons, markers and renderer functions. Its embedded copies of the other studio generators and its demo registries stay in the source studio.

`tools/serve.js` serves those generated modules from memory. `src/assets.js` registers native dimensions, SVG functions, states and metadata under stable identifiers. Building variants also resolve through `building:` IDs so ambiguous names such as `monument_restored` can distinguish built art from map art. The runtime uses namespaced IDs for building states and keeps the original IDs in metadata. Shared animation frames reference the existing record when the Island Studio lists them twice.

## World and game state

The island uses zero-indexed `grid[y][x]` coordinates, origin at upper left, with X increasing right and Y increasing downward. Tiles are 16 px across. Geometry helpers convert between tile centers, world positions and camera-relative screen positions. A map object's tile marks the left tile on its bottom footprint row. Its anchor and depth are separate world-pixel values supplied by the studio.

`src/world.js` owns the versioned, serializable gameplay state. Static definitions live in the asset registry. State stores object variants and amounts keyed by map object ID, the villager roster and current routes, wildlife positions, resource counters, collection progress, abilities, weather and time. UI selection, camera state, building ghosts and collectible previews live outside saved gameplay state.

Breadth-first search uses four-way grid navigation and chooses the nearest reachable interaction point. Fishing definitions distinguish the standing point from the water target. The runtime copies the starting collision grid. Construction adds the authored footprint, and landmark changes can reopen tiles. Placement checks paths in use before committing the new collision.

The Resource Manager publishes changes to the shared counters. `src/gameplay.js` handles commands and job phases, which can include approach, work, and delivery. Repeating jobs remember a villager’s assignment. Skills improve through work and abilities apply to the village. `src/progression.js` lists the research costs, construction costs and landmark requirements.

## Rendering and UI

`src/render.js` caches the terrain SVG with its internal definitions and draws it to Canvas as one static layer. Ground decorations, resources, landmarks, villagers, wildlife, any building instances and collectible previews are separate sprite draws. Ground objects and entities sort by their ground depth. Canopies, water effects, markers and debug overlays draw in subsequent layers. Generated sprites are decoded lazily at native dimensions and drawn without smoothing. Building instances use a top-left footprint tile and a type and state from the registry.

`src/main.js` runs the simulation and renderer, converts input through the camera and distinguishes dragging villagers from panning. `src/ui.js` adapts current state to the supplied HUD components, journal and Collection Book. Debug tools remain a separate runtime panel.

`src/save.js` stores three independently versioned island snapshots in browser storage. Continue selects the latest valid snapshot by save time. The first launch with the new system imports the older single save into Slot 1 when all three slots are empty. Only the active gameplay slot receives autosaves or offline catch-up. Catch-up caps at 90 real seconds, and collision is rebuilt from the map and the loaded island.

## Main menu and settings

`src/main.js` runs the `menu`, `entering`, and `playing` states. The menu renders a copy of the latest island, or the starting island, through the same renderer as gameplay. Its ambient update advances climate and wildlife while villager tasks and saves wait for entry. The camera follows a scenic loop and glides to the starting village when an island is opened. Returning through the pause menu saves the active slot and reuses the canvas and sprite cache.

`src/main-menu.js` owns the title screen, island selector, and delete and overwrite confirmations. `src/preferences.js` stores audio, display, and comfort preferences under a separate browser storage key. The title uses existing Studio icons and a small canvas wordmark. The two short menu sound cues are synthesized in `createMenuSounds`, which is the hookup for replacing them with audio files. Lightning is opt-in and uses the intensity in `ATMOSPHERE_CONFIG`.

## Island clock, weather, and lights

`src/climate.js` advances the 24-hour clock and schedules clear, cloudy, light rain, and heavy rain. Adjust `CLOCK_CONFIG.dayLengthSeconds`, `WEATHER_CONFIG`, and `weatherProfiles` to change the cycle speed, transition duration, weather odds, or wind and rain strength. Active blends persist in the village save. `world.climate.subscribe(event, listener)` returns an unsubscribe function. Use `on_time_period_changed` for clock period changes and `on_weather_changed` for the start of a transition. Both deliver a `{ from, to }` payload. Use `sampleWeather` for the current mix of rain, cloud, and wind.

`src/atmosphere.js` holds the color stops and glow presets. The renderer multiplies the world colors before drawing additive lights and rain. Clear noon uses white, and the HUD stays at its normal brightness. Set `ATMOSPHERE_CONFIG.reducedMotion` to reduce moving effects.

The lit campfire and completed buildings receive default glows. To attach a light to a map prop, add `glow: { preset: 'lantern', offset: { x: 2, y: -12 } }` to the object metadata in the Island Map Studio. A building instance can carry the same `glow` descriptor. Offsets are world pixels from the sprite anchor. Use `campfire`, `window`, `torch`, or `lantern` and optionally override `radius` and `intensity`. A `requiresFlag` value such as `'light_campfire'` gates the glow on a landmark flag. Set `glow: false` to opt out of the default building or campfire glow.

## Auron dialogue and tutorials

The original portrait renderer lives in `assets/island-guardian-studio.html`. Run `npm run export:guardian` after editing it to regenerate `src/guardian-art.js`, which the game loads with its other browser scripts. `src/story-ui.js` uses the Studio’s expressions, mouth frames, and blink state inside the existing wood-and-parchment UI. `src/dialogue-voice.js` synthesizes short Web Audio syllables. Punctuation pauses typing and speech, and settings save text speed, dialogue volume, and voice mute independently of each island.

Define new dialogue entries in `src/auron-dialogue.js` and register gameplay triggers through `buildEventSequence` in `src/story.js` and `handleGameplayEvent` in `src/main.js`. Sequences supply an ID, a mode, and a list of beats with text, expression, and optional title or camera focus. Use `guide` for the compact panel during play, `story` for a paused scene, and `choice` for a paused prompt with response buttons. Guide beats can use `waitFor(world)` to advance after a map action. Choices may set a zero-based `next` beat index or end the sequence, and can provide `onChoose`. Sequence `onComplete` receives the world, dismissal reason, and closing choice ID. Use `followUp` to open another sequence when the current one finishes.

## Bird movement

`src/birds.js` drives the Island Songbird and Seagull through `GROUNDED`, `TAKEOFF`, `FLYING` and `LANDING`. The world position tracks the point on the map below the bird. Altitude, vertical velocity and horizontal momentum live in the saved bird state. Landing and walking use walkable habitat tiles, while airborne movement can cross terrain outside that habitat. Older saves initialize birds on valid ground.

Edit `birdTuning` to tune flap force, glide gravity, drag, maximum altitude, bobbing, tilt and shadow scale. The `birdAnimations` table maps clips from the Wildlife Studio. The songbird uses `idle`, `hop`, `peck` and `fly`, with a held `fly` frame for gliding. The seagull uses `stand`, `walk`, `fly` and `glide`. The renderer draws a separate pixel-snapped shadow on the surface and shifts the sprite upward. It caches tilted sprites at native resolution before applying the camera.

## Fish movement

`src/fish.js` runs the freshwater and coastal fish as ambient wildlife. In `UNDERWATER`, the swim cycle applies thrust on the first bent-tail frame and water drag between strokes. Fish steer within their assigned water body, idle between trips, and occasionally jump over a clear patch of water. In `AIRBORNE`, they follow a gravity arc with splashes on exit and reentry. If a jump lands on shore, `BEACHED` uses small ballistic hops along a route to the same water body.

Edit `fishTuning` for thrust, drag, turn smoothing, hover amplitude, tint, bubble rate and jump timing. The `fishAnimations` table maps the studio's `idle`, `swim`, `turn` and `flee` clips. Flopping plays the fast `flee` frames with a separate motion and bank. The renderer clips the tinted fish to matching water tiles and draws surface effects above it. Bubbles, dash wakes and splashes are short-lived render effects. Saved fish retain their movement state, and older saves initialize a submerged fish on load.

The dolphin has its own controller in `src/dolphin.js`. Its full footprint stays in offshore water while it swims, surfaces, occasionally breaches and dives. It shares the water renderer and particle effects with the fish. The original `surface`, `jump` and `dive` frames already contain the body arc, so the renderer plays those frames at the waterline.

## Grounded wildlife and villagers

`src/land-wildlife.js` defines the rabbit, snake, deer and crab profiles in `landWildlifeTuning`. Profiles set the wander radius, movement and flee speeds, idle pause range, and awareness or flee radii. Wildlife reacts to nearby villagers and uses the original habitat and footprint data. Rabbits use `hop`, `flee`, `idle` and `eat`. Snakes use `slither`, `idle` and `warn`. Deer use `walk`, `graze`, `alert` and `run`. Crabs use `walk`, `claw`, `idle` and `hide`.

`src/ground.js` records actual distance traveled for gait cycles and selects ground particles by terrain. `villagerGroundTuning` controls walking, carrying, space between villagers, and leisure timing. Villagers keep their job routes and take short social or campfire breaks between jobs. A bounded lateral offset lets them pass without changing their logical route or moving through obstacles. The renderer draws pixel-snapped contact shadows and sorts particles and tall grass by ground Y.

Villagers finish delivering supplies before resting and remember their work during the break. Autonomous routines continue while the village needs the resource. A worker searches for another reachable source when the current one runs out. The HUD shows what the villager is doing. During leisure, nearby idle villagers face each other and take turns using the existing `talk` and `idle` clips. Picking up or redirecting either villager ends the conversation.

## Drag assignments and villager skills

`src/main.js` uses pointer capture for mouse and touch. Holding or dragging a villager plays the Character Studio's `pickup` clip. `src/gameplay.js` resolves both the hover preview and the release against the same task rules and reachable interaction tiles. `src/render.js` projects the shadow onto that tile. Releasing a valid assignment starts the job immediately, with terrain dust and a brief landing bounce.

`src/villagers.js` maps saved per-job XP to Gathering, Building, Research, and Healing. `src/gameplay.js` awards XP when work produces a result, manages hauling and continuing assignments, and uses each villager's work preference to choose chores. The [villager balance guide](VILLAGER_BALANCE.md) lists the thresholds, bonuses, and autonomy rules.

`src/survival.js` centralizes food, illness, and family tuning and initializes legacy saves. `src/gameplay.js` applies those rules on the simulation clock, and `src/render.js` uses the Character Studio’s carry, hold, and crawl animations for infants and caregivers. The [survival balance guide](SURVIVAL_BALANCE.md) covers the formulas and progression.

To add a standard resource target in the Island Map Studio, use a non-decorative map object with a supported `type`, a `resource` record, and walkable `interactionPoints` with `x`, `y`, and optional `facing` (`up`, `down`, `left`, or `right`). For a custom type, add `interaction: { job: 'gather', counter: 'food' }` to the object. To make a research table, use `interaction: { job: 'research', ability: null }` and add its interaction points. Fish use the existing `fishingSpots` records with a standing tile and water target. Construction sites and sick villagers get their jobs from their current state.

### Sea turtle

`src/turtle.js` uses the center of the turtle’s footprint to switch between `LAND_CRAWL` and `WATER_SWIM` as it crosses the map’s beach and shallow ocean tiles. Routing checks the full authored footprint. On land the `crawl` frames follow timed flipper pushes and pauses. A nearby villager triggers the existing tucked `rest` pose and a retreat toward water. In water the `swim` frames follow thrust and drag, and `float` plays between trips.

`turtleTuning` groups crawl and swim speeds, idle durations, wander radius, alert radius, shoreline fade, tint, and bubble timing. The renderer blends between the ground and underwater anchors, fades the contact shadow with depth, and clips ripples to ocean tiles. The save restores the movement state and initializes older saves from the turtle’s current terrain.

## Wildlife director

The camera sends its world-space viewport to `src/wildlife-director.js`. Spawn and removal checks include each sprite’s vertical and horizontal reach. `wildlifeTuning` controls the spawn ring, wider removal ring, grace period, species and origin-zone caps, lifetime ranges, group distances, and school size. The director waits for a safe path or entrance when there is no suitable point near the current view.

Habitat checks use the studio’s terrain, region, water-body, collision, and footprint metadata. The director classifies areas as `forest`, `grassland`, `coast`, `freshwater`, or `ocean`. Land props use the map object’s existing `type` through `wildlifePropTags`. For example, `tree` and `palm_tree` provide canopy cover and perches, `bush` and `tall_grass` provide cover and forage, and `driftwood` provides a perch. Add `wildlifeTags: ['cover', 'perch']` to an individual map object to extend its type’s tags. The director uses adjacent valid tiles to approach blocked props and ignores depleted or felled cover.

The existing movement controllers handle normal behavior. The director supplies short entry and exit paths, underwater fades, perch visits, school targets, and proximity signals. Turtles can transit deep ocean tiles when entering or leaving, then resume their shallow-water and beach controller. Deer use forest-edge routes. When part of the map is visible, foliage, sand, and deep-water transitions give smaller species a way to arrive or leave within the view. The `water_cover` tag also lets fish use existing reeds and water lilies as shelter. Camera-directed transitions pause during offline catch-up and resume once a viewport is available.

Bird and deer alarm signals spread over the configured `groupAlertDelay` range, with closer peers reacting sooner. After fleeing, land wildlife enters `RECOVER` before resuming its idle behavior. Deer use their existing `alert` clip to look back during this pause.
