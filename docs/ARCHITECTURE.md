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
