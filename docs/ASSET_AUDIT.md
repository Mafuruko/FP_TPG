# Asset audit

The workspace contains seven self-contained HTML studios and four MP3s under `assets/`. The UI & HUD Studio appeared during the audit and is integrated. There was no pre-existing game runtime, engine, package configuration, README, or standalone SVG, PNG, atlas, or JSON export.

| Studio | Source | Category and count | Format | Integration and dependencies |
|---|---|---|---|---|
| Island Map | `Island Map Studio (1).html` | 80 × 64 tiles, 250 placed objects, 14 fishing spots, five villager starts | SVG groups, JS grids and registries | Reuse the terrain renderer and its SVG definitions. Adapt individual objects, states, anchors, zones, effects, collision and interactions. |
| Villager Character | `Villager Character Studio.html` | Four stages, four directions, 27 animation IDs | Seeded JS generator and SVG frame renderer | Reuse both generators and expose stage-specific animation availability. Hunting has no dedicated animation. |
| Building | `Building Studio.html` | 12 types with state-specific geometry and metadata | JS generators and layered SVG | Namespace visual IDs because monument IDs overlap the island. Five types support construction, and the gallery includes all 12. The fixed island monument keeps the map art. |
| Collectible | `Collectible Studio.html` | 25 items, including five butterflies | JS registry, SVG, silhouettes and animation frames | Collection Book uses source silhouettes. Use the collectible studio’s zone mapping because map zone allowlists contain older generic IDs and extra insects. Map decorative shells remain scenery. |
| Resource & Food | `Resource & Food Studio.html` | 20 item and storage designs | JS definitions, source mappings and SVG | Preserve artwork and variants. Adapt object types, fish water body IDs and crop types to the matching item and economy counter. Herbs, seeds and clay have no village counter. Seeds and clay have map art but no matching Resource Studio item. |
| Wildlife | `Wildlife Studio.html` | 10 species | JS habitat and animation registries, SVG frames | Match habitat definitions to map grids and check movement footprints. Coastal fishing uses the source’s proposed small-fish mapping. There is no separate coastal fish item icon. |
| UI & HUD | `ui-hud-studio.html` | HUD, navigation, menu templates, reusable controls, icons, markers and nine-slice frames | CSS, SVG and pure HTML renderer functions | Import the gameplay CSS, theme, vector art and pure renderers. Bind them to runtime state. The dedicated studios supply the six duplicated world-art generators. Omit the studio demo data and preview controls. |
| Music | `assets/music/*.mp3` | Four tracks | MP3 | Direct browser playback through opt-in music and state-based track selection. |

Artwork is generated from the original studio scripts at server startup. The importer uses explicit boundaries between generator and preview code. It serves reusable modules without modifying the studios. The terrain SVG retains its local definitions. Individual assets render as separate images, so SVG IDs cannot collide across images.

The Building Studio has a farm building design but the island's build zones provide no matching placement type. The Island map and Building Studio also disagree on monument footprints and variant names. Runtime uses the Island Studio for the fixed landmark and exposes the Building Studio's variants independently in the gallery. Original puzzle metadata is inspectable and serves as source reference for later design.
