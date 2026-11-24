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

`src/save.js` stores a versioned snapshot in local storage and advances an unpaused village in small simulation steps after an absence. It caps catch-up at 90 real seconds. Collision is rebuilt from the authored map and saved changes. Audio volume uses its own preference key.

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

`src/villagers.js` maps the saved per-job XP totals to Gathering, Building, Research, and Healing. Trainee starts at 0 XP, Adept at 5 XP, and Master at 14 XP. Rank shortens the work cycle, increases haul capacity, and supplies tool colors to the Character Studio. Appearance seeds give new villagers and older saves one or two persistent quirks. Snake-shy villagers run from a nearby snake during a free moment, Fast Walkers move faster, and Curious villagers inspect nearby landmarks during leisure.

To add a standard resource target in the Island Map Studio, use a non-decorative map object with a supported `type`, a `resource` record, and walkable `interactionPoints` with `x`, `y`, and optional `facing` (`up`, `down`, `left`, or `right`). For a custom type, add `interaction: { job: 'gather', counter: 'food' }` to the object. To make a research table, use `interaction: { job: 'research', ability: null }` and add its interaction points. Fish use the existing `fishingSpots` records with a standing tile and water target. Construction sites and sick villagers get their jobs from their current state.

### Sea turtle

`src/turtle.js` uses the center of the turtle’s footprint to switch between `LAND_CRAWL` and `WATER_SWIM` as it crosses the map’s beach and shallow ocean tiles. Routing checks the full authored footprint. On land the `crawl` frames follow timed flipper pushes and pauses. A nearby villager triggers the existing tucked `rest` pose and a retreat toward water. In water the `swim` frames follow thrust and drag, and `float` plays between trips.

`turtleTuning` groups crawl and swim speeds, idle durations, wander radius, alert radius, shoreline fade, tint, and bubble timing. The renderer blends between the ground and underwater anchors, fades the contact shadow with depth, and clips ripples to ocean tiles. The save restores the movement state and initializes older saves from the turtle’s current terrain.

## Wildlife director

The camera sends its world-space viewport to `src/wildlife-director.js`. Spawn and removal checks include each sprite’s vertical and horizontal reach. `wildlifeTuning` controls the spawn ring, wider removal ring, grace period, species and origin-zone caps, lifetime ranges, group distances, and school size. The director waits for a safe path or entrance when there is no suitable point near the current view.

Habitat checks use the studio’s terrain, region, water-body, collision, and footprint metadata. The director classifies areas as `forest`, `grassland`, `coast`, `freshwater`, or `ocean`. Land props use the map object’s existing `type` through `wildlifePropTags`. For example, `tree` and `palm_tree` provide canopy cover and perches, `bush` and `tall_grass` provide cover and forage, and `driftwood` provides a perch. Add `wildlifeTags: ['cover', 'perch']` to an individual map object to extend its type’s tags. The director uses adjacent valid tiles to approach blocked props and ignores depleted or felled cover.

The existing movement controllers handle normal behavior. The director supplies short entry and exit paths, underwater fades, perch visits, school targets, and proximity signals. Turtles can transit deep ocean tiles when entering or leaving, then resume their shallow-water and beach controller. Deer use forest-edge routes. When part of the map is visible, foliage, sand, and deep-water transitions give smaller species a way to arrive or leave within the view. The `water_cover` tag also lets fish use existing reeds and water lilies as shelter. Camera-directed transitions pause during offline catch-up and resume once a viewport is available.

Bird and deer alarm signals spread over the configured `groupAlertDelay` range, with closer peers reacting sooner. After fleeing, land wildlife enters `RECOVER` before resuming its idle behavior. Deer use their existing `alert` clip to look back during this pause.
