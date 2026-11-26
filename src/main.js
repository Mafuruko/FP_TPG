import * as island from '/studio/island.js';
import * as character from '/studio/character.js';
import * as building from '/studio/building.js';
import * as collectible from '/studio/collectible.js';
import * as resource from '/studio/resource.js';
import * as wildlife from '/studio/wildlife.js';
import * as studioUI from '/studio/ui.js';
import { createAssets } from './assets.js';
import { screenToWorld, tileToWorld, worldToScreen, worldToTile } from './geometry.js';
import { clampZoom, createCameraController } from './camera-controls.js';
import { createRenderer, svgUrl } from './render.js';
import { createUI } from './ui.js';
import { createWorld, enableWildlifeDirector, previewPlacement, updateIslandPreview, updateWorld } from './world.js';
import { cameraWorldRect } from './wildlife-director.js';
import { startGameplay } from './gameplay.js';
import { landmarks } from './progression.js';
import { advanceOffline, createIslandSaves, loadUnlocks, restoreVillage, saveUnlocks, wipeAllGameData } from './save.js';
import { runDevAction } from './dev-tools.js';
import { createMainMenu } from './main-menu.js';
import { createMenuSounds, loadPreferences, storePreferences } from './preferences.js';
import { lerp, smooth } from './climate.js';
import { buildEventSequence, ensureStoryState, getActiveChapter, STORY_CONFIG } from './story.js';
import { createStoryDirector } from './story-ui.js';

const assets = createAssets({ island, character, building, collectible, resource, wildlife, ui: studioUI });
const world = createWorld(assets);
let storage;
try { storage = window.localStorage; } catch { /* Continue without persistence. */ }
const pristine = structuredClone(world.state);
const saves = createIslandSaves(storage, world);
const settings = loadPreferences(storage);
let unlocks = loadUnlocks(storage);
const sound = createMenuSounds(settings);
const fullscreenSupported = document.fullscreenEnabled && Boolean(document.documentElement.requestFullscreen);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let gameplay;
let wildlifeDirector;
let activeSlot;
let hiddenAt = null;
let entry;
let scenicTime = 0;
let returnCamera;
const app = document.querySelector('main');
const title = document.getElementById('title-screen');
const hud = ['studio-hud', 'hud-windows', 'panel', 'debug-panel', 'story-director'].map(id => document.getElementById(id));
hud.push(document.querySelector('.bottom'));
const storyRoot = document.getElementById('story-director');
const size = world.map.meta.tileSize;
const canvas = document.getElementById('island');
const dropHint = document.getElementById('drop-action');
const dropIcon = dropHint.querySelector('img');
const dropLabel = dropHint.querySelector('span');
const camera = { x: 0, y: 0, zoom: 2 };
const renderCamera = { ...camera };
const cameraController = createCameraController(camera);
const devOnEntry = new URLSearchParams(location.search).get('debug') === '1';
const view = {
  selectedVillager: null, selectedObject: null, debug: false, mode: 'menu', settings,
  overlays: new Set(), placementType: null, placement: null, drag: null, storyBeacon: null,
};
const renderer = createRenderer(canvas, world, renderCamera, view);
const center = () => ({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
const villageCenter = tileToWorld(world.map.villagerSpawns[2], size);
let viewportCenter = center();

function syncRenderCamera() {
  if (!settings.integer || view.mode === 'entering') {
    Object.assign(renderCamera, camera);
    return;
  }
  const screen = center();
  const point = screenToWorld(screen, camera);
  const scale = window.devicePixelRatio || 1;
  const zoom = Math.max(1, Math.round(camera.zoom * scale)) / scale;
  renderCamera.x = Math.round((screen.x - point.x * zoom) * scale) / scale;
  renderCamera.y = Math.round((screen.y - point.y * zoom) * scale) / scale;
  renderCamera.zoom = zoom;
}

function centerOn(position) {
  const screen = center();
  camera.x = Math.round(screen.x - position.x * camera.zoom);
  camera.y = Math.round(screen.y - position.y * camera.zoom);
  cameraController.syncFromCamera();
}

window.addEventListener('resize', () => {
  const resized = center();
  if (view.mode === 'playing') {
    camera.x += resized.x - viewportCenter.x;
    camera.y += resized.y - viewportCenter.y;
    cameraController.syncFromCamera();
    syncRenderCamera();
  }
  viewportCenter = resized;
});

function selectedVillager() {
  return world.state.villagers.find(villager => villager.id === view.selectedVillager);
}

function resetCamera() {
  camera.zoom = canvas.clientWidth < 580 ? 1 : 2;
  centerOn(villageCenter);
}

function adjustZoom(direction, point = center()) {
  cameraController.stepButtonZoom(direction, point);
}

function fitCamera() {
  const { pixelWidth, pixelHeight } = world.map.meta;
  const fit = Math.min(canvas.clientWidth / pixelWidth, canvas.clientHeight / pixelHeight);
  camera.zoom = clampZoom(fit);
  centerOn({ x: pixelWidth / 2, y: pixelHeight / 2 });
}

function selectVillager(id) {
  view.selectedVillager = id;
  view.selectedObject = null;
  ui.selectVillager(selectedVillager());
}

function isDevUnlocked() {
  return devOnEntry || Boolean(unlocks.devMode || world.state.achievements?.challenge_flawless_century);
}

function panToTarget(position, targetZoom = STORY_CONFIG.defaultSpotlightZoom, label = '', tone = 'gold', options = {}) {
  if (!position) return;
  const duration = options.duration ?? (reducedMotion.matches ? STORY_CONFIG.reducedPanDurationSec : STORY_CONFIG.panDurationSec);
  cameraController.panTo(position, targetZoom, center(), { duration, immediate: options.immediate });
  if (options.cue === 'water') view.storyBeacon = null;
  else if (label !== null) {
    view.storyBeacon = {
      position: { x: position.x, y: position.y },
      label: label || '',
      tone,
      dragFrom: options.dragFrom || null,
      excludeId: options.excludeId || null,
      until: options.persist ? null : performance.now() + 5500,
    };
  }
}

function panToObjective() {
  const { chapter, target } = getActiveChapter(world);
  if (!target?.position) return;
  panToTarget(target.position, target.zoom || STORY_CONFIG.defaultSpotlightZoom, target.label || chapter.shortTitle, 'gold', {
    dragFrom: target.dragFrom || null,
    cue: target.cue,
  });
}

function triggerStory(eventId, payload = {}) {
  const sequence = buildEventSequence(eventId, payload, world);
  if (!sequence) return false;
  sound('test');
  return storyDirector.play(sequence);
}

function wipeAllAndRestart({ enterFresh = false } = {}) {
  wipeAllGameData(storage);
  Object.assign(settings, loadPreferences(storage));
  unlocks = loadUnlocks(storage);
  ui.syncVolume();
  ui.hudWindows.resetLayout();
  storyDirector.reset();
  clearPointer();
  touchPointers.clear();
  pinchState = null;
  hiddenAt = null;
  if (enterFresh) {
    const freshSave = { state: structuredClone(pristine), savedAt: Date.now() };
    activeSlot = 1;
    saves.write(1, freshSave.state, freshSave.savedAt);
    replaceIsland(freshSave);
    title.hidden = true;
    title.inert = true;
    setMode('playing');
    resetCamera();
    ui.refreshStatus();
    ui.refreshQuestTracker();
    ui.syncDevLock();
    const story = ensureStoryState(world.state);
    story.seenEvents.intro_arrival = true;
    triggerStory('intro_arrival');
    saveActive();
    ui.notify('All saved data wiped. Started a fresh island!');
    return;
  }
  activeSlot = undefined;
  loadPreview();
  ui.syncDevLock();
  scenicCamera(0);
}

const ui = createUI(world, view, {
  selectVillager, resetCamera, adjustZoom, fitCamera,
  preferences: settings, fullscreenSupported, applyPreference, openTitle,
  panToTarget, panToObjective, triggerStory, wipeAllData: wipeAllAndRestart, isDevUnlocked,
  save: () => saveActive(),
  lastSave: () => saves.read(activeSlot)?.savedAt,
  focusVillager: () => { if (selectedVillager()) panToTarget(selectedVillager().position, Math.max(camera.zoom, 2.6), selectedVillager().name, 'gold'); },
});
const storyDirector = createStoryDirector(storyRoot, {
  world, view, icon: assets.ui.GameUI.ic, reducedMotion,
  panTo: (pos, zoom, opts) => cameraController.panTo(pos, zoom, center(), opts),
  onOpen: () => {
    view.storyActive = true;
    ui.clearToasts();
  },
  onAction: (type, arg) => {
    if (type === 'open-menu') ui.setMenu(arg);
    else if (type === 'select-villager') {
      selectVillager(arg);
      const v = world.state.villagers.find(member => member.id === arg);
      if (v) panToTarget(v.position, STORY_CONFIG.villagerSpotlightZoom, v.name, 'gold');
    }
  },
  onWipeFresh: () => wipeAllAndRestart({ enterFresh: true }),
  onOpenTitle: () => openTitle('islands'),
});
const menu = createMainMenu(title, {
  saves, preferences: settings, fullscreenSupported, applyPreference, enter: enterIsland, deleted: loadPreview,
  wipeAll: () => wipeAllAndRestart({ enterFresh: false }),
  sound, icon: assets.ui.GameUI.ic,
});

let pendingFindFocus;
let pendingFirstFind;

function updateFindPresentation() {
  if (pointer || pinchState || view.placementType) return;
  if (pendingFindFocus && !storyDirector.isActive()) {
    const { villagerId, position } = pendingFindFocus;
    if (world.collectibleReveals.has(villagerId)) {
      panToTarget({ x: position.x, y: position.y - 18 }, Math.max(camera.zoom, 1.8), null, 'gold', {
        duration: reducedMotion.matches ? STORY_CONFIG.reducedPanDurationSec : 0.72,
      });
    }
    pendingFindFocus = null;
  }
  if (pendingFirstFind && !world.collectibleReveals.has(pendingFirstFind.villagerId)) {
    triggerStory('first_collectible', pendingFirstFind);
    pendingFirstFind = null;
  }
}

function handleGameplayEvent(ev) {
  if (view.mode !== 'playing') return;
  const story = ensureStoryState(world.state);
  if (ev.type === 'illness' && !story.seenEvents.first_illness) {
    story.seenEvents.first_illness = true;
    triggerStory('first_illness', ev);
  } else if (ev.type === 'death') {
    if (ev.cause === 'sickness' && !story.seenEvents.first_sickness_death) {
      story.seenEvents.first_sickness_death = true;
      triggerStory('first_sickness_death', ev);
    } else if (ev.cause === 'starvation' && !story.seenEvents.first_starvation_death) {
      story.seenEvents.first_starvation_death = true;
      triggerStory('first_starvation_death', ev);
    } else if (ev.cause === 'old_age' && !story.seenEvents.first_old_age_death) {
      story.seenEvents.first_old_age_death = true;
      triggerStory('first_old_age_death', ev);
    }
  } else if (ev.type === 'birth' && !story.seenEvents.first_birth) {
    story.seenEvents.first_birth = true;
    triggerStory('first_birth', ev);
  } else if (ev.type === 'landmark') {
    const key = `landmark_${ev.puzzleId}`;
    if (!story.seenEvents[key]) {
      story.seenEvents[key] = true;
      triggerStory('landmark_reveal', ev);
    }
  } else if (ev.type === 'research') {
    const key = `research_${ev.abilityId}`;
    if (!story.seenEvents[key]) {
      story.seenEvents[key] = true;
      triggerStory('feature_research', ev);
    }
  } else if (ev.type === 'collectible') {
    pendingFindFocus = ev;
    if (ev.firstEver && !story.seenEvents.first_collectible) {
      story.seenEvents.first_collectible = true;
      pendingFirstFind = ev;
    }
  } else if (ev.type === 'achievement') {
    sound('test');
    if (ev.achievement?.id === 'challenge_flawless_century') {
      unlocks.devMode = true;
      saveUnlocks(storage, unlocks);
      ui.syncDevLock();
    }
  } else if (ev.type === 'colony_lost') {
    triggerStory('colony_lost', ev);
  }
  ui.refreshQuestTracker();
}

function setMode(next) {
  view.mode = app.dataset.mode = next;
  for (const layer of hud) layer.inert = next !== 'playing';
  ui.syncMusic();
}

function saveActive(now = Date.now()) {
  return view.mode === 'playing' && saves.write(activeSlot, world.state, now);
}

function replaceIsland(save) {
  pendingFindFocus = pendingFirstFind = null;
  view.selectedVillager = view.selectedObject = view.placementType = view.placement = view.storyBeacon = null;
  view.overlays.clear();
  storyDirector.reset();
  restoreVillage(world, save ?? { state: structuredClone(pristine) });
  gameplay = startGameplay(world);
  gameplay.subscribe(ui.notify);
  gameplay.subscribeEvents(handleGameplayEvent);
  wildlifeDirector = enableWildlifeDirector(world);
  ui.resetForIsland();
  ui.syncDevLock();
}

function loadPreview() {
  const latest = saves.recent();
  replaceIsland(latest && saves.read(latest.id));
}

function openTitle(page = 'home') {
  if (view.mode !== 'playing') return;
  if (!saveActive()) {
    ui.notify('This island could not be saved. You can try again from Save & Load.');
    return;
  }
  clearPointer();
  touchPointers.clear();
  pinchState = null;
  returnCamera = { ...screenToWorld(center(), renderCamera), zoom: renderCamera.zoom };
  activeSlot = undefined;
  hiddenAt = null;
  setMode('menu');
  scenicTime = 0;
  loadPreview();
  scenicCamera(0);
  menu.show(page);
}

function enterIsland(id, fresh, confirmOverwrite = false) {
  if (view.mode !== 'menu') return false;
  let save = saves.read(id);
  if (fresh) {
    if (save && !confirmOverwrite) return false;
    save = { state: structuredClone(pristine), savedAt: Date.now() };
    if (!saves.write(id, save.state, save.savedAt)) return false;
  }
  if (!save) return false;
  activeSlot = id;
  entry = { save, from: screenToWorld(center(), renderCamera), zoom: renderCamera.zoom,
    elapsed: 0, duration: reducedMotion.matches ? 0.2 : 1.25, fresh };
  title.inert = true;
  setMode('entering');
  return true;
}

const campCenter = world.map.objects.find(object => object.type === 'campfire_site').anchor;
const scenicPoints = [
  { x: campCenter.x - 135, y: campCenter.y + 40 },
  { x: campCenter.x - 35, y: campCenter.y },
  { x: villageCenter.x + 95, y: villageCenter.y - 20 },
  { x: campCenter.x - 80, y: villageCenter.y + 102 },
];

function scenicCamera(elapsed) {
  const progress = (reducedMotion.matches ? 0 : elapsed / 12) % scenicPoints.length;
  const index = Math.floor(progress);
  const t = progress - index;
  const [p0, p1, p2, p3] = [-1, 0, 1, 2].map(offset =>
    scenicPoints[(index + offset + scenicPoints.length) % scenicPoints.length]);
  const curve = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t
    + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  const point = { x: curve(p0.x, p1.x, p2.x, p3.x), y: curve(p0.y, p1.y, p2.y, p3.y) };
  camera.zoom = canvas.clientWidth < 580 ? 1.5 : 2;
  if (returnCamera && elapsed < 1.25 && !reducedMotion.matches) {
    const blend = smooth(elapsed / 1.25);
    point.x = lerp(returnCamera.x, point.x, blend);
    point.y = lerp(returnCamera.y, point.y, blend);
    camera.zoom = lerp(returnCamera.zoom, camera.zoom, blend);
  } else returnCamera = null;
  centerOn(point);
}

function advanceEntry(dt) {
  entry.elapsed += dt;
  const progress = Math.min(1, entry.elapsed / entry.duration);
  if (progress >= 0.18 && !entry.loaded) {
    replaceIsland(entry.save);
    entry.offline = entry.fresh ? 0 : advanceOffline(world, entry.save.savedAt);
    world.state.time.paused = false;
    entry.loaded = true;
  }
  const t = smooth(progress);
  const gameplayZoom = canvas.clientWidth < 580 ? 1 : 2;
  const scale = window.devicePixelRatio || 1;
  const endZoom = settings.integer ? Math.max(1, Math.round(gameplayZoom * scale)) / scale : gameplayZoom;
  camera.zoom = lerp(entry.zoom, endZoom, t);
  centerOn({ x: lerp(entry.from.x, villageCenter.x, t), y: lerp(entry.from.y, villageCenter.y, t) });
  if (progress < 1) return;
  title.hidden = true;
  const { offline, fresh } = entry;
  entry = null;
  setMode('playing');
  ui.refreshStatus();
  ui.refreshQuestTracker();
  if (devOnEntry) ui.setDebug(true);
  canvas.focus({ preventScroll: true });
  const story = ensureStoryState(world.state);
  if ((fresh || !story.seenEvents.intro_arrival) && !world.state.worldFlags.light_campfire) {
    story.seenEvents.intro_arrival = true;
    triggerStory('intro_arrival');
  } else if (offline >= 10) {
    ui.notify('Your villagers continued their routines while you were away.');
  }
  saveActive();
}

function setFullscreen(enabled) {
  if (!fullscreenSupported) return;
  showFullscreenStatus('');
  const change = enabled && !document.fullscreenElement ? document.documentElement.requestFullscreen()
    : !enabled && document.fullscreenElement ? document.exitFullscreen() : null;
  change?.catch(() => {
    settings.fullscreen = Boolean(document.fullscreenElement);
    syncFullscreen();
    showFullscreenStatus('The browser did not allow this display change.');
  });
}

function showFullscreenStatus(message) {
  document.querySelectorAll('.fullscreen-status').forEach(status => { status.textContent = message; });
}

function syncFullscreen() {
  document.querySelectorAll('[data-preference="fullscreen"]').forEach(input => { input.checked = settings.fullscreen; });
  storePreferences(storage, settings);
}

function applyPreference(name, value) {
  settings[name] = value;
  storePreferences(storage, settings);
  if (name === 'master' || name === 'music') ui.syncVolume();
  if (name === 'sfx') sound('test');
  if (name === 'fullscreen') setFullscreen(value);
}

document.addEventListener('fullscreenchange', () => {
  settings.fullscreen = Boolean(document.fullscreenElement);
  syncFullscreen();
});
function restoreFullscreen(event) {
  if (!event.isTrusted) return;
  document.removeEventListener('click', restoreFullscreen, true);
  if (settings.fullscreen) setFullscreen(true);
}
document.addEventListener('click', restoreFullscreen, true);

setInterval(() => { if (!document.hidden && hiddenAt === null) saveActive(); }, 5000);
window.addEventListener('pagehide', () => { if (hiddenAt === null) saveActive(); });
document.addEventListener('visibilitychange', () => {
  if (view.mode !== 'playing') return;
  if (document.hidden) {
    hiddenAt = Date.now();
    saveActive(hiddenAt);
  } else if (hiddenAt !== null) {
    advanceOffline(world, hiddenAt);
    hiddenAt = null;
    saveActive();
  }
});

function canvasPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function command(position) {
  const hit = renderer.pick(position);
  if (hit?.hit === 'villager') {
    selectVillager(hit.entity.id);
    return;
  }
  ui.inspect(position, hit);
  view.selectedObject = hit?.hit === 'object' ? hit.entity.id : null;
  const villager = selectedVillager();
  if (hit?.hit === 'collectible' && hit.entity.id.startsWith('preview_')) {
    ui.notify(assets.registry.get(hit.entity.assetId).name + ' · developer preview');
    return;
  }
  if (hit) {
    if (!villager) {
      const puzzle = landmarks[hit.entity.puzzleId];
      if (puzzle) ui.notify(puzzle.hint);
      else if (hit.hit === 'grave') ui.notify(`${hit.entity.name}'s memorial (Day ${hit.entity.day}). Drop a villager here to pay respects.`);
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
const touchPointers = new Map();
let pinchState = null;
const dropRef = hit => hit && { kind: hit.hit, id: hit.entity.id };

function refreshDropPreview() {
  if (!view.drag) return;
  const { position } = view.drag;
  const hit = renderer.pick(position, undefined, pointer.villager.id);
  const { tile, label, icon } = gameplay.inspectDrop(pointer.villager, worldToTile(position, size), dropRef(hit));
  Object.assign(view.drag, { landing: tile, label, target: hit });
  dropHint.hidden = !label;
  if (!label) return;
  if (dropHint.dataset.icon !== icon) {
    dropHint.dataset.icon = icon;
    dropIcon.src = svgUrl(assets.registry.get(icon).svg());
  }
  if (dropLabel.textContent !== label) dropLabel.textContent = label;
}

function updateDragPosition() {
  view.drag.position = screenToWorld(pointer.screen, renderCamera);
}

function positionDropHint() {
  if (dropHint.hidden || !view.drag.landing) return;
  const anchor = worldToScreen(tileToWorld(view.drag.landing, size), renderCamera);
  const margin = dropHint.offsetWidth / 2 + 6;
  dropHint.style.left = `${Math.round(Math.max(margin, Math.min(canvas.clientWidth - margin, anchor.x)))}px`;
  dropHint.style.top = `${Math.round(Math.max(30, Math.min(pointer.screen.y - 46 * renderCamera.zoom, anchor.y - 12)))}px`;
}

function liftVillager() {
  if (!pointer?.villager || view.drag) return;
  delete pointer.villager.holdStillUntil;
  world.heldVillager = pointer.villager.id;
  view.drag = { id: world.heldVillager, startedAt: performance.now() };
  updateDragPosition();
  refreshDropPreview();
  positionDropHint();
  canvas.classList.add('dragging');
}

function clearPointer() {
  clearTimeout(pointer?.holdTimer);
  pointer = null;
  world.heldVillager = null;
  view.drag = null;
  dropHint.hidden = true;
  canvas.classList.remove('dragging');
}

function touchGestureSnapshot() {
  const pts = [...touchPointers.values()];
  if (pts.length < 2) return null;
  const [a, b] = pts;
  return {
    midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
  };
}

canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  if (view.mode !== 'playing') return;
  cameraController.handleWheel(event, canvasPosition(event));
}, { passive: false });

canvas.addEventListener('pointerdown', event => {
  if (view.mode !== 'playing') return;
  const start = canvasPosition(event);
  if (event.pointerType === 'touch') {
    touchPointers.set(event.pointerId, start);
    if (touchPointers.size === 2) {
      clearPointer();
      pinchState = touchGestureSnapshot();
      canvas.setPointerCapture(event.pointerId);
      return;
    }
  }
  if (pointer || pinchState || (event.button !== 0 && event.button !== 2 && event.button !== 1)) return;
  const villager = !view.placementType && event.button === 0
    ? renderer.pick(screenToWorld(start, renderCamera), 'villager')?.entity : null;
  pointer = { id: event.pointerId, start, screen: start, x: camera.x, y: camera.y, villager, moved: false, button: event.button };
  if (villager) pointer.holdTimer = setTimeout(liftVillager, 175);
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', event => {
  if (view.mode !== 'playing') return;
  const screen = canvasPosition(event);
  if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
    touchPointers.set(event.pointerId, screen);
    if (pinchState && touchPointers.size >= 2) {
      const next = touchGestureSnapshot();
      cameraController.handleTouchPinch(pinchState.midpoint, next.midpoint, next.distance / pinchState.distance);
      pinchState = next;
      return;
    }
  }
  if (pointer?.id === event.pointerId) {
    pointer.screen = screen;
    const dx = screen.x - pointer.start.x;
    const dy = screen.y - pointer.start.y;
    if (Math.hypot(dx, dy) >= 5) pointer.moved = true;
    if (pointer.moved && !pointer.villager) {
      camera.x = Math.round(pointer.x + dx);
      camera.y = Math.round(pointer.y + dy);
      cameraController.syncFromCamera();
      canvas.classList.add('dragging');
    }
    if (pointer.moved && pointer.villager) liftVillager();
  }
  if (view.placementType) {
    const definition = assets.buildings.find(building => building.type === view.placementType);
    const tile = worldToTile(screenToWorld(screen, renderCamera), size);
    view.placement = previewPlacement(world, definition, tile);
  }
});

canvas.addEventListener('pointerup', event => {
  if (view.mode !== 'playing') return;
  if (event.pointerType === 'touch') {
    touchPointers.delete(event.pointerId);
    if (touchPointers.size < 2) pinchState = null;
  }
  if (pointer?.id !== event.pointerId) return;
  const { villager, moved, button } = pointer;
  const held = Boolean(view.drag);
  clearPointer();
  if (button !== 0 || (moved && !villager)) return;
  const position = screenToWorld(canvasPosition(event), renderCamera);
  if (view.placementType) {
    const tile = worldToTile(position, size);
    const error = gameplay.place(view.placementType, tile);
    if (error) ui.notify(error);
    else {
      view.placementType = null;
      view.placement = null;
    }
    return;
  }
  if (held) {
    const hit = renderer.pick(position, undefined, villager.id);
    const error = gameplay.drop(villager, worldToTile(position, size), dropRef(hit));
    selectVillager(villager.id);
    if (error) ui.notify(error);
    return;
  }
  command(position);
});

for (const eventName of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(eventName, input => {
  touchPointers.delete(input.pointerId);
  if (touchPointers.size < 2) pinchState = null;
  if (pointer?.id === input.pointerId) clearPointer();
});

window.addEventListener('keydown', event => {
  if (view.mode !== 'playing') {
    if (event.key === 'Escape' && view.mode === 'menu') menu.closePanel();
    return;
  }
  if (storyDirector.isActive()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      storyDirector.close();
      return;
    }
    if ((event.code === 'Space' || event.key === 'Enter') && !storyDirector.getState()?.waiting) {
      event.preventDefault();
      storyDirector.advance();
      return;
    }
  }
  if (event.code === 'Space' && (event.target === document.body || event.target === canvas)) {
    event.preventDefault();
    ui.togglePause();
  }
  if (event.key === 'Escape') {
    if (pointer) {
      const { id } = pointer;
      clearPointer();
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    } else if (view.placement || view.placementType) {
      view.placementType = null;
      view.placement = null;
    } else ui.closeMenu();
  }
});

setMode('menu');
loadPreview();
scenicCamera(0);
menu.show();

window.__ISLAND_DEV__ = {
  world, view, camera, renderCamera, cameraController, renderer, ui, storyDirector,
  selectVillager, panToTarget, panToObjective, triggerStory, wipeAllAndRestart,
  runDevAction: id => runDevAction(id, world, view, {
    resetHud: () => ui.hudWindows.resetLayout(),
    openMenu: next => ui.setMenu(next),
    triggerStory,
    panToObjective,
    wipeAllData: () => wipeAllAndRestart({ enterFresh: true }),
  }),
};

let last = performance.now();
let lastStatus = 0;
let lastPreview = 0;
function frame(now) {
  if (document.hidden) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  if (view.mode === 'menu') {
    scenicTime += dt;
    scenicCamera(scenicTime);
  } else if (view.mode === 'entering') advanceEntry(dt);
  else {
    cameraController.update(dt);
    storyDirector.update(dt);
  }
  syncRenderCamera();
  wildlifeDirector.setView(cameraWorldRect(renderCamera, canvas.clientWidth, canvas.clientHeight));
  if (view.mode === 'menu') updateIslandPreview(world, dt);
  else if (view.mode === 'playing') updateWorld(world, dt);
  if (view.mode === 'playing') updateFindPresentation();
  if (view.drag) {
    updateDragPosition();
    if (now - lastPreview >= 55) {
      refreshDropPreview();
      positionDropHint();
      lastPreview = now;
    }
  }
  renderer.render();
  if (view.mode === 'playing' && now - lastStatus >= 100) {
    ui.refreshStatus();
    ui.refreshProfile();
    ui.refreshQuestTracker();
    lastStatus = now;
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
