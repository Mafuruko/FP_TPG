import * as island from '/studio/island.js';
import * as character from '/studio/character.js';
import * as building from '/studio/building.js';
import * as collectible from '/studio/collectible.js';
import * as resource from '/studio/resource.js';
import * as wildlife from '/studio/wildlife.js';
import * as studioUI from '/studio/ui.js';
import { createAssets } from './assets.js';
import { screenToWorld, tileToWorld, worldToTile, zoomAt } from './geometry.js';
import { createRenderer } from './render.js';
import { createUI } from './ui.js';
import { createWorld, previewPlacement, updateWorld } from './world.js';
import { startGameplay } from './gameplay.js';
import { landmarks } from './progression.js';
import { advanceOffline, readVillage, restoreVillage, saveVillage } from './save.js';

const assets = createAssets({ island, character, building, collectible, resource, wildlife, ui: studioUI });
const world = createWorld(assets);
let storage;
try { storage = window.localStorage; } catch { /* Continue without persistence. */ }
const savedVillage = readVillage(storage);
const restored = restoreVillage(world, savedVillage);
const gameplay = startGameplay(world);
const offline = restored ? advanceOffline(world, savedVillage.savedAt) : 0;
let hiddenAt = null;
let replacingVillage = false;
const size = world.map.meta.tileSize;
const canvas = document.getElementById('island');
const camera = { x: 0, y: 0, zoom: 2 };
const view = {
  selectedVillager: null, selectedObject: null, debug: new URLSearchParams(location.search).get('debug') === '1',
  overlays: new Set(), placementType: null, placement: null, drag: null,
};
const renderer = createRenderer(canvas, world, camera, view);
const zoomLevels = [0.25, 0.5, 1, 2, 3, 4];
const center = () => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });

function centerOn(position) {
  const screen = center();
  camera.x = Math.round(screen.x - position.x * camera.zoom);
  camera.y = Math.round(screen.y - position.y * camera.zoom);
}

function selectedVillager() {
  return world.state.villagers.find(villager => villager.id === view.selectedVillager);
}

function resetCamera() {
  camera.zoom = canvas.clientWidth < 580 ? 1 : 2;
  centerOn(tileToWorld(world.map.villagerSpawns[2], size));
}

function adjustZoom(direction, point = center()) {
  const current = zoomLevels.indexOf(camera.zoom);
  const next = Math.min(zoomLevels.length - 1, Math.max(0, current + direction));
  if (current !== next) zoomAt(camera, point, zoomLevels[next]);
}

function fitCamera() {
  const { pixelWidth, pixelHeight } = world.map.meta;
  const fit = Math.min(canvas.clientWidth / pixelWidth, canvas.clientHeight / pixelHeight);
  camera.zoom = zoomLevels.findLast(zoom => zoom <= fit) || zoomLevels[0];
  centerOn({ x: pixelWidth / 2, y: pixelHeight / 2 });
}

function selectVillager(id) {
  view.selectedVillager = id;
  view.selectedObject = null;
  ui.selectVillager(selectedVillager());
}

const ui = createUI(world, view, {
  selectVillager, resetCamera, adjustZoom, fitCamera,
  save: () => saveVillage(world, storage),
  lastSave: () => readVillage(storage)?.savedAt,
  reload: () => window.location.reload(),
  resetVillage: () => {
    if (!window.confirm('Replace this saved village with a new one?')) return;
    const next = createWorld(assets);
    if (saveVillage(next, storage)) {
      replacingVillage = true;
      window.location.reload();
    }
    else ui.notify('This browser could not start a new saved village.');
  },
  focusVillager: () => { if (selectedVillager()) centerOn(selectedVillager().position); },
});
gameplay.subscribe(ui.notify);
if (offline >= 10) ui.notify('Your villagers continued their routines while you were away.');
setInterval(() => { if (!document.hidden && !replacingVillage) saveVillage(world, storage); }, 5000);
window.addEventListener('pagehide', () => { if (hiddenAt === null && !replacingVillage) saveVillage(world, storage); });
document.addEventListener('visibilitychange', () => {
  if (replacingVillage) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    saveVillage(world, storage, hiddenAt);
  } else if (hiddenAt !== null) {
    advanceOffline(world, hiddenAt);
    hiddenAt = null;
    saveVillage(world, storage);
  }
});

function canvasPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function command(position, draggedVillager) {
  const hit = renderer.pick(position, undefined, draggedVillager?.id);
  if (hit?.hit === 'villager' && !draggedVillager) {
    selectVillager(hit.entity.id);
    return;
  }
  ui.inspect(position, hit);
  view.selectedObject = hit?.hit === 'object' ? hit.entity.id : null;
  const villager = draggedVillager || selectedVillager();
  if (hit?.hit === 'collectible' && hit.entity.id.startsWith('preview_')) {
    ui.notify(assets.registry.get(hit.entity.assetId).name + ' · developer preview');
    return;
  }
  if (draggedVillager) {
    const ref = hit && { kind: hit.hit, id: hit.entity.id };
    const error = gameplay.drop(draggedVillager, worldToTile(position, size), ref);
    if (error) ui.notify(error);
    return;
  }
  if (hit) {
    if (!villager) {
      const puzzle = landmarks[hit.entity.puzzleId];
      if (puzzle) ui.notify(puzzle.hint);
      else if (hit.hit === 'collectible') ui.notify('Drop a villager on this find to collect it.');
      return;
    }
    const error = gameplay.assign(villager, { kind: hit.hit, id: hit.entity.id });
    if (error) ui.notify(error);
    return;
  }
  const error = villager && gameplay.move(villager, worldToTile(position, size));
  if (error) ui.notify(error);
}

let pointer = null;
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  adjustZoom(event.deltaY < 0 ? 1 : -1, canvasPosition(event));
}, { passive: false });

canvas.addEventListener('pointerdown', event => {
  if (pointer || (event.button !== 0 && event.button !== 2 && event.button !== 1)) return;
  const start = canvasPosition(event);
  const villager = !view.placementType && event.button === 0
    ? renderer.pick(screenToWorld(start, camera), 'villager')?.entity : null;
  pointer = { id: event.pointerId, start, x: camera.x, y: camera.y, villager, moved: false, button: event.button };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  const screen = canvasPosition(event);
  if (pointer?.id === event.pointerId) {
    const dx = screen.x - pointer.start.x;
    const dy = screen.y - pointer.start.y;
    if (Math.hypot(dx, dy) >= 5) pointer.moved = true;
    if (pointer.moved && !pointer.villager) {
      camera.x = Math.round(pointer.x + dx);
      camera.y = Math.round(pointer.y + dy);
      canvas.classList.add('dragging');
    }
    if (pointer.moved && pointer.villager) {
      world.heldVillager = pointer.villager.id;
      view.drag = { id: pointer.villager.id, position: screenToWorld(screen, camera) };
      canvas.classList.add('dragging');
    }
  }
  if (view.placementType) {
    const definition = assets.buildings.find(building => building.type === view.placementType);
    const tile = worldToTile(screenToWorld(screen, camera), size);
    view.placement = previewPlacement(world, definition, tile);
  }
});

canvas.addEventListener('pointerup', event => {
  if (pointer?.id !== event.pointerId) return;
  const { villager, moved, button } = pointer;
  pointer = null;
  world.heldVillager = null;
  view.drag = null;
  canvas.classList.remove('dragging');
  if (button !== 0 || (moved && !villager)) return;
  if (view.placementType) {
    const tile = worldToTile(screenToWorld(canvasPosition(event), camera), size);
    const error = gameplay.place(view.placementType, tile);
    if (error) ui.notify(error);
    else {
      view.placementType = null;
      view.placement = null;
    }
    return;
  }
  if (moved && villager) selectVillager(villager.id);
  command(screenToWorld(canvasPosition(event), camera), moved ? villager : null);
});

for (const event of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => {
  pointer = null;
  world.heldVillager = null;
  view.drag = null;
  canvas.classList.remove('dragging');
});

window.addEventListener('keydown', event => {
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault();
    ui.togglePause();
  }
  if (event.key === 'Escape') {
    if (view.placement || view.placementType) {
      view.placementType = null;
      view.placement = null;
    } else ui.closeMenu();
  }
});

if (view.debug) {
  view.debug = false;
  document.getElementById('debug').click();
}
resetCamera();
ui.refreshStatus();
let last = performance.now();
let lastStatus = 0;
function frame(now) {
  if (document.hidden) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  updateWorld(world, Math.max(0, Math.min(0.1, (now - last) / 1000)));
  renderer.render();
  if (now - lastStatus >= 100) {
    ui.refreshStatus();
    ui.refreshProfile();
    lastStatus = now;
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
