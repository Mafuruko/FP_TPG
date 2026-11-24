# Island Colony

A top-down pixel-art colony sim. Guide five survivors as they gather supplies, form a village and work out what happened at the island’s landmarks. The project uses vanilla JavaScript modules, Canvas 2D, SVG assets and a dependency-free Node development server.

## Run locally

Install Node.js 20 or newer. From this folder, run:

```text
npm start
```

Open [http://localhost:8080](http://localhost:8080) in a modern browser. The server listens on the local machine. Use `npm test` to run the automated checks. Restart the server after editing an asset studio to reload its artwork and definitions.

## Controls

- Villagers find chores on their own. Drag one onto reachable ground to put them down immediately, or drop them onto a resource or worksite to start there. Selecting a villager and clicking a target sends them there on foot. Workers carry supplies back before the counters increase.
- Drag empty map space to pan. Scroll to zoom. The bottom-right camera controls include zoom, reset, focus on the selected villager, and fit to the full island.
- Use the HUD speed controls to pause, resume or change speed. Space toggles pause when the page body has focus. Escape closes the current menu or clears a building preview.
- In **Build**, choose a building and **Place foundation**. Click a valid site, then assign a villager to it. Houses increase capacity and a Family House lets eligible adults start a family when dropped onto one another.
- Open the **Island journal** for landmark clues. Light the campfire to give your villagers a place to research. Spend Knowledge in the **Research** menu, then revisit landmarks.
- Learn Healing and drop another villager onto someone unwell. Learn Farming to work the crops near the spring and Fishing to use marked fishing spots once they’re available.
- Open **Debug** in the lower-left to inspect terrain, objects and zones. Add `?debug=1` to the URL to open it on startup.
- Music starts at 100% by default and plays on page load when the browser allows it. If sound is blocked, an ordinary click or key press starts playback. **Settings → Audio** controls the volume from 1% to 100% with a slider and Min and Max shortcuts. The browser remembers your volume.
- Use **Back** in a submenu to return to the previous panel. Escape or the close button returns focus to the control that opened the menu.
- The Collection Book has 25 collectibles across four tabs. Drop a villager onto a live discovery to record it. Debug mode also shows separate sample items.

## Saving and progression

Your village saves locally in this browser. You can also save manually through the pause menu. An unpaused village catches up by up to 90 seconds of real time after an absence to limit unexpected losses. Pausing before leaving freezes it.

Seven landmark projects lead to the ancient monument. You can continue building and exploring after restoring it. The costs, timers, and yields are initial balance values. Some building artwork remains available in the gallery for later integration.

See [the asset audit](docs/ASSET_AUDIT.md), [game design](docs/GAME_DESIGN.md), [architecture](docs/ARCHITECTURE.md), and [roadmap](docs/DEVELOPMENT_ROADMAP.md).
