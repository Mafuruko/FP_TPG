# Update Log — Rafi (Chronological Summary)

This document records all updates from the Windows launcher creation through the latest FPS optimization and compact menu redesign.
Each entry lists the changes and the verification checks for that patch.

---

## Patch 1 — One-Click Windows Launcher
**Files:** `start-island-colony.bat`

### Summary
- Added a single Windows batch file to automate setup and game startup.
- The script checks for Node.js 20 or newer and skips installation when Node.js is ready.
- The script checks `package.json` dependencies and skips `npm install` when no packages are missing.
- The script checks whether port `8080` is already active, starts `npm start` if needed, waits for readiness, and opens `http://localhost:8080`.

### What to check
1. Double-click `start-island-colony.bat` on a machine with Node.js 20+.
2. Confirm that the script skips Node.js setup and `npm install`.
3. Confirm that the server starts and the default browser opens `http://localhost:8080`.
4. Run the script again while the server runs and confirm it opens the browser without starting a duplicate server.

---

## Patch 2 — Compact Character Card (Skill Levels and Icon Needs)
**Files:** `src/villagers.js`, `src/ui.js`, `game.css`, `tests/features.test.js`

### Summary
- Replaced raw XP numbers and XP progress bars with levels `1` through `10` per skill tier.
- Kept rank progression from `Trainee` to `Adept` to `Master` while preserving existing rank thresholds and tests.
- Removed the text words `Health`, `Fed`, and `Energy` from the character card.
- Added pixel icons for Health (heart), Fed (crossed fork and spoon), and Energy (lightning bolt) beside color-coded bars (`green` ≥ 65%, `yellow` 35–64%, `red` < 35%).
- Compacted the villager card layout into a tight portrait header, 3-column needs row, and 2×2 skill pill grid.

### What to check
1. Select any villager and open the **Villagers** window.
2. Confirm that no raw XP numbers or skill XP bars appear.
3. Confirm that each skill shows `<Rank> Lv. <1-10>` and promotes after level 10.
4. Use Dev Mode (`Make Sick`, `Low Fed/Energy`, `Full Needs All`) and confirm that the 3 icon bars switch cleanly between red, yellow, and green.

---

## Patch 3 — Touchpad Pan and Smooth Camera Zoom
**Files:** `src/camera-controls.js`, `src/main.js`, `tests/features.test.js`

### Summary
- Replaced abrupt discrete zoom steps with continuous, exponentially damped zooming around the pointer.
- Added automatic wheel classification so two-finger touchpad scrolls pan the map.
- Mapped pinch/spread gestures (`Ctrl+wheel` and touchscreen multi-touch pinch) and standard mouse wheel notches to smooth zooming.
- Updated HUD zoom buttons to use smooth interpolation within `0.25×` to `4×`.

### What to check
1. Scroll with two fingers on a touchpad and confirm the map pans smoothly instead of zooming.
2. Pinch and spread on a touchpad (or hold `Ctrl` and scroll) and confirm smooth zooming anchored at the pointer.
3. Scroll a standard mouse wheel and confirm smooth zoom without harsh leaps.
4. Click the HUD camera buttons (`Zoom in`, `Zoom out`, `Reset`, `Focus`, `Fit`) and confirm smooth camera response.

---

## Patch 4 — Draggable, Resizable, Tabbed Floating HUD Windows
**Files:** `src/hud-windows.js`, `src/ui.js`, `index.html`, `game.css`, `tests/features.test.js`

### Summary
- Converted all 7 HUD widgets (`Resources`, `Clock`, `Menu Bar`, `Panel`, `Selected`, `Camera`, `Dev Mode`) into floating windows.
- Positioned windows with viewport percentages (`xPct`, `yPct`) and clamped every window strictly inside screen bounds.
- Added a bottom-right corner handle that scales the entire window proportionally while enforcing a minimum readable size floor.
- Added browser-style icon tabs so players can merge windows by dragging one onto another, unmerge by dragging a tab out, and minimize or reveal windows without closing them permanently.
- Saved HUD layout in `localStorage` and added **Reset HUD layout** buttons in Settings and Dev Mode.

### What to check
1. Drag each HUD bar and confirm it stays inside the screen edges.
2. Resize a window from its bottom-right corner and confirm the entire widget scales down proportionally and stops at the minimum size floor.
3. Drag one HUD window onto another to merge them into icon tabs, click tabs to switch or minimize/reveal, then drag one tab out to unmerge it.
4. Reload the page and confirm the layout restores; click **Reset HUD layout** and confirm defaults return.

---

## Patch 5 — Content-Aware Smart Tooltips
**Files:** `src/tooltips.js`, `src/ui.js`, `game.css`, `tests/features.test.js`

### Summary
- Replaced the fixed below-only studio tooltip handler with a content-aware tooltip solver.
- Measured tooltip text dimensions against viewport width and height before placement.
- Placed tooltips above or below hovered controls automatically and clamped horizontal bounds inside the viewport.

### What to check
1. Hover buttons near the top bar (`Resources`, `Clock`) and confirm tooltips open below without clipping.
2. Hover buttons near the bottom edge (`Dev Mode`, `Camera`) and confirm tooltips flip above the button cleanly.
3. Hover controls near the left and right edges and confirm long tooltip text wraps inside screen width.

---

## Patch 6 — Visual Weather (Rain) and Day/Night Lighting
**Files:** `src/atmosphere.js`, `src/render.js`, `index.html`, `game.css`, `tests/features.test.js`

### Summary
- Built a mathematical daylight model using solar elevation cosine and smoothstep curves across dawn, day, dusk, and midnight.
- Added visual night darkening, warm dawn/dusk tints, rain overcast shading, and warm night light pools around the lit campfire and completed buildings.
- Added deterministic pixel-art rain streaks and splash particles whenever weather equals `rain`.

### What to check
1. Open **Dev Mode** and click `Dawn`, `Day`, `Dusk`, and `Night` to verify smooth lighting changes.
2. Light the campfire (`Next Landmark`) at `Night` and confirm a warm glow appears around the campfire.
3. Click `Start Rain` and confirm slanted pixel rain and splashes render across the scene; click `Clear Sky` to stop rain.

---

## Patch 7 — Interactive Dev Mode Panel
**Files:** `src/dev-tools.js`, `src/gameplay.js`, `src/ui.js`, `index.html`, `tests/features.test.js`

### Summary
- Upgraded the Debug panel into a 3-tab **Dev Mode** (`Actions`, `Overlays`, `Inspector`).
- Added one-click test buttons for time presets, weather toggles, resources, source regrowth, villager needs/illness/skills/aging/spawning, research unlocks, landmark completion, building completion, crop growth, collectible discovery, journal access, and HUD reset.
- Preserved all 14 visual map overlays and the live click JSON inspector.

### What to check
1. Click **Dev Mode** in the bottom-left (or open `?debug=1`).
2. Switch between `Actions`, `Overlays`, and `Inspector` tabs and between `World & Supply` and `Village & Story` action pages.
3. Trigger buttons in each section and confirm immediate updates on the map, HUD counters, and menus.

---

## Patch 8 — FPS Optimization Routine
**Files:** `src/hud-windows.js`, `src/ui.js`, `src/render.js`, `src/atmosphere.js`, `src/main.js`, `index.html`, `game.css`

### Summary
- Removed per-minute and per-resource `hudWindows.clampAll()` layout thrashing, replacing full clock DOM rebuilds with in-place text updates (`statusTickMs`: `40.03 ms` → `0.033 ms`).
- Cached HUD natural sizes and batched layout reads before writes (`clampMs`: `36.73 ms` → `0.267 ms`).
- Pre-baked decoded SVG sprites and the terrain map into raster `<canvas>` bitmaps, capped backing-store DPR at `1.5`, and added viewport culling for map objects, canopies, fishing icons, and animated water effects.
- Replaced per-frame `JSON.stringify` villager cache keys and per-frame radial gradient allocations with lightweight string keys and one reusable pre-baked glow bitmap.
- Moved full-screen atmosphere tinting to a GPU-composited `#atmosphere-veil` layer and replaced diagonal stroked rain paths with axis-aligned pixel `fillRect` drops (`nightClear`: `123 ms` → `74 ms`; `dayRain`: `133 ms` → `70 ms` in software capture).

### What to check
1. Run the village at `3×` speed during daytime and rainy nighttime and confirm smooth frame pacing without periodic stutters.
2. Pan and zoom across the island and verify all terrain, objects, canopies, wildlife, villagers, rain, and night lights draw cleanly.
3. Run `npm test` and confirm all automated tests pass.

---

## Patch 9 — Compact Menu Bar Redesign and Raw Scrollbar Removal
**Files:** `src/ui.js`, `src/dev-tools.js`, `game.css`

### Summary
- Redesigned **Buildings**, **Research**, **Collection Book**, and **Achievements** into compact card layouts matching the Villager card style.
- Removed all raw browser scrollbars globally (`overflow: hidden` on menus plus scrollbar suppression) and replaced tall lists with compact grids and `‹ Prev` / `Next ›` pagination across Villagers, active building sites, Journal, Notifications, and Dev Mode actions.

### What to check
1. Open **Buildings** and verify `Build (5)` / `Gallery (12)` tabs, compact preview card, state chips, 3-column picker, and zero scrollbars.
2. Open **Research** and verify the compact 2-column skill grid with Knowledge counter and clean two-line title spacing.
3. Open **Collection Book** and verify the single-row 4-tab bar (`Shells`, `Minerals`, `Artifacts`, `Butterflies`), 5-column rarity grid, progress meter, and compact bottom detail card.
4. Open **Achievements** and verify all 6 milestone cards with live color progress bars and zero scrollbars.
5. Open **Villagers**, **Journal**, and **Dev Mode** and confirm no raw browser scrollbars appear anywhere.
