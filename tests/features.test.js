import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssets } from '../src/assets.js';
import { readStudioModules } from '../tools/studios.js';
import { createWorld, updateIslandPreview, updateWorld } from '../src/world.js';
import { startGameplay } from '../src/gameplay.js';
import { needStatus, skillProgress } from '../src/villagers.js';
import { classifyWheelEvent, createCameraController, wheelZoomFactor } from '../src/camera-controls.js';
import { computeTooltipPosition } from '../src/tooltips.js';
import {
  clampWindowPercent,
  clampWindowScale,
  DEFAULT_HUD_LAYOUT,
  detachTab,
  mergeGroups,
  readHudLayout,
  saveHudLayout,
} from '../src/hud-windows.js';
import { computeAtmosphere } from '../src/atmosphere.js';
import { createClimate, sampleWeather, WEATHER_CONFIG } from '../src/climate.js';
import { runDevAction } from '../src/dev-tools.js';
import { createIslandSaves, readVillage, restoreVillage, saveVillage } from '../src/save.js';
import { loadPreferences, storePreferences } from '../src/preferences.js';

const { uiCss: _uiCss, ...modules } = await readStudioModules();
const studios = Object.fromEntries(await Promise.all(Object.entries(modules).map(async ([key, code]) => [
  key, await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')),
])));
const assets = createAssets(studios);

function browserStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('island slots migrate the old village, rank by save time, and isolate their data', () => {
  const storage = browserStorage();
  const world = createWorld(assets);
  world.state.time.day = 4;
  assert.ok(saveVillage(world, storage, 100));
  const saves = createIslandSaves(storage, world);
  assert.deepEqual(saves.list().map(slot => slot.day), [4, undefined, undefined]);
  assert.equal(readVillage(storage), null);
  world.state.time.day = 9;
  assert.ok(saves.write(2, world.state, 200));
  assert.equal(saves.recent().id, 2);
  assert.equal(saves.read(1).state.time.day, 4);
  assert.equal(saves.read(2).state.settings, undefined);
  assert.equal(saves.write(4, world.state, 400), false);
  storage.setItem('island-colony.slot.3.v1', '{"savedAt":300,"state":{"version":1}}');
  assert.equal(saves.read(3), null);
  assert.ok(saves.remove(2));
  assert.equal(saves.recent().id, 1);
  assert.ok(saves.remove(1));
  assert.equal(createIslandSaves(storage, world).recent(), undefined);
});

test('menu preview animates the world without simulating villager jobs or updating a save', () => {
  const world = createWorld(assets);
  const storage = browserStorage();
  const saves = createIslandSaves(storage, world);
  assert.ok(saves.write(1, world.state, 100));
  startGameplay(world);
  const villager = structuredClone(world.state.villagers[0]);
  const before = JSON.stringify(world.state.wildlife);
  world.state.time.paused = true;
  updateIslandPreview(world, 0.75);
  assert.equal(world.state.time.seconds, 0.75);
  assert.deepEqual(world.state.villagers[0], villager);
  assert.notEqual(JSON.stringify(world.state.wildlife), before);
  assert.equal(saves.read(1).state.time.seconds, 0);
  assert.equal(saves.recent().savedAt, 100);
});

test('global display, comfort and volume settings persist independently of island slots', () => {
  const storage = browserStorage();
  storage.setItem('island-colony.audio', '{"musicVolume":67}');
  assert.equal(loadPreferences(storage).music, 67);
  const changed = { ...loadPreferences(storage), master: 83, music: 54, sfx: 29, integer: true, lightning: true };
  storePreferences(storage, changed);
  const world = createWorld(assets);
  const saves = createIslandSaves(storage, world);
  assert.ok(saves.write(1, world.state));
  assert.ok(saves.remove(1));
  assert.deepEqual(loadPreferences(storage), changed);
});

test('skill progression divides each rank into levels 1-10 and promotes Trainee -> Adept -> Master', () => {
  const v = { skills: {} };
  const s0 = skillProgress(v, 'gathering');
  assert.equal(s0.rank.name, 'Trainee');
  assert.equal(s0.level, 1);

  v.skills.gather = 4;
  const s4 = skillProgress(v, 'gathering');
  assert.equal(s4.rank.name, 'Trainee');
  assert.equal(s4.level, 10);

  v.skills.gather = 5;
  const s5 = skillProgress(v, 'gathering');
  assert.equal(s5.rank.name, 'Adept');
  assert.equal(s5.level, 1);

  v.skills.gather = 13;
  const s13 = skillProgress(v, 'gathering');
  assert.equal(s13.rank.name, 'Adept');
  assert.equal(s13.level, 10);

  v.skills.gather = 14;
  const s14 = skillProgress(v, 'gathering');
  assert.equal(s14.rank.name, 'Master');
  assert.equal(s14.level, 1);

  v.skills.gather = 372;
  const sMax = skillProgress(v, 'gathering');
  assert.equal(sMax.rank.name, 'Master');
  assert.equal(sMax.level, 10);
});

test('needStatus maps full, mid, and low percentages to green/yellow/red tones', () => {
  assert.deepEqual(needStatus(100), { value: 100, tone: 'good' });
  assert.deepEqual(needStatus(65), { value: 65, tone: 'good' });
  assert.deepEqual(needStatus(50), { value: 50, tone: 'warn' });
  assert.deepEqual(needStatus(35), { value: 35, tone: 'warn' });
  assert.deepEqual(needStatus(34), { value: 34, tone: 'low' });
  assert.deepEqual(needStatus(0), { value: 0, tone: 'low' });
});

test('camera controller pans on touchpad 2-finger scroll and zooms smoothly on pinch or mouse wheel', () => {
  assert.equal(classifyWheelEvent({ deltaX: 12, deltaY: -8, deltaMode: 0, ctrlKey: false }).action, 'pan');
  assert.equal(classifyWheelEvent({ deltaX: 0, deltaY: 14, deltaMode: 0, ctrlKey: false }).action, 'pan');
  assert.equal(classifyWheelEvent({ deltaX: 0, deltaY: -12, deltaMode: 0, ctrlKey: true }).action, 'zoom');
  assert.equal(classifyWheelEvent({ deltaX: 0, deltaY: 120, deltaMode: 0, ctrlKey: false }).action, 'zoom');
  assert.equal(classifyWheelEvent({ deltaX: 0, deltaY: -3, deltaMode: 1, ctrlKey: false }).action, 'zoom');

  const camera = { x: 100, y: 100, zoom: 2 };
  const ctrl = createCameraController(camera);

  // Touchpad pan moves camera without changing zoom.
  ctrl.handleWheel({ deltaX: 15, deltaY: -10, deltaMode: 0, ctrlKey: false }, { x: 400, y: 300 });
  assert.equal(camera.x, 85);
  assert.equal(camera.y, 110);
  assert.equal(camera.zoom, 2);

  // Pinch spread zooms in smoothly over frames rather than snapping abruptly.
  const zoomBefore = camera.zoom;
  ctrl.handleWheel({ deltaX: 0, deltaY: -20, deltaMode: 0, ctrlKey: true }, { x: 400, y: 300 });
  assert.ok(ctrl.state.targetZoom > zoomBefore);
  ctrl.update(0.016);
  assert.ok(camera.zoom > zoomBefore && camera.zoom < ctrl.state.targetZoom);
  for (let i = 0; i < 60; i++) ctrl.update(0.05);
  assert.ok(Math.abs(camera.zoom - ctrl.state.targetZoom) < 0.001);

  // Wheel factor stays bounded so single ticks never jump wildly.
  const maxStep = wheelZoomFactor(-1000, 'mouse', 0);
  assert.ok(maxStep <= 1.2 && maxStep > 1);
});

test('smart tooltips flip above near bottom edge and stay clamped within screen width', () => {
  const viewport = { width: 1000, height: 700 };
  const topButton = { left: 20, top: 10, right: 80, bottom: 40, width: 60, height: 30 };
  const bottomButton = { left: 920, top: 650, right: 990, bottom: 685, width: 70, height: 35 };
  const tipSize = { width: 220, height: 48 };

  const below = computeTooltipPosition(topButton, tipSize, viewport);
  assert.equal(below.placement, 'bottom');
  assert.ok(below.left >= 8 && below.left + tipSize.width <= viewport.width - 8);
  assert.ok(below.top >= topButton.bottom);

  const above = computeTooltipPosition(bottomButton, tipSize, viewport);
  assert.equal(above.placement, 'top');
  assert.ok(above.left >= 8 && above.left + tipSize.width <= viewport.width - 8);
  assert.ok(above.top + tipSize.height <= bottomButton.top);
});

test('HUD window geometry clamps inside viewport, enforces minimum size, and merges/detaches tabs', () => {
  const viewport = { width: 1280, height: 720 };
  const minScale = clampWindowScale(0.1, { width: 200, height: 80 }, viewport);
  assert.ok(minScale >= 0.62);
  assert.ok(200 * minScale >= 112);

  const clamped = clampWindowPercent(150, -30, { width: 320, height: 180 }, viewport);
  assert.ok(clamped.xPct >= 0 && clamped.xPct <= 75);
  assert.ok(clamped.yPct >= 0 && clamped.yPct <= 75);

  const merged = mergeGroups(DEFAULT_HUD_LAYOUT, 'grp-camera', 'grp-clock');
  const clockGroup = merged.find(g => g.id === 'grp-clock');
  assert.deepEqual(clockGroup.tabs, ['clock', 'camera']);
  assert.equal(clockGroup.activeTab, 'camera');
  assert.equal(merged.find(g => g.id === 'grp-camera'), undefined);

  const detached = detachTab(merged, 'grp-clock', 'camera', 40, 50);
  assert.deepEqual(detached.find(g => g.id === 'grp-clock').tabs, ['clock']);
  const newWin = detached.find(g => g.tabs.includes('camera'));
  assert.ok(newWin && newWin.xPct === 40 && newWin.yPct === 50);

  const memory = new Map();
  const storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  assert.equal(saveHudLayout(storage, merged), true);
  const restored = readHudLayout(storage, ['resources', 'clock', 'nav', 'menu', 'selection', 'camera', 'dev']);
  assert.deepEqual(restored.find(g => g.id === 'grp-clock').tabs, ['clock', 'camera']);
});

test('ambient lighting blends color stops, moves sun shadows, and fades lamps around twilight', () => {
  const noon = computeAtmosphere(720, 'clear');
  const dawn = computeAtmosphere(355, 'clear');
  const morning = computeAtmosphere(520, 'clear');
  const sunset = computeAtmosphere(1065, 'clear');
  const dusk = computeAtmosphere(1190, 'clear');
  const midnight = computeAtmosphere(0, 'clear');
  const rainyDay = computeAtmosphere(720, 'heavy_rain');
  assert.equal(noon.phase, 'noon');
  assert.deepEqual(noon.ambient, [255, 255, 255]);
  assert.equal(noon.overlayStyle, null);
  assert.equal(noon.lampGlow, 0);
  assert.equal(dawn.phase, 'dawn');
  assert.ok(dawn.lampGlow > 0 && dawn.lampGlow < 1);
  assert.equal(morning.phase, 'morning');
  assert.equal(sunset.phase, 'sunset');
  assert.ok(sunset.ambient[0] > sunset.ambient[1] && sunset.ambient[1] > sunset.ambient[2]);
  assert.equal(dusk.phase, 'dusk');
  assert.ok(dusk.ambient[2] > dusk.ambient[0]);
  assert.ok(dusk.lampGlow > 0 && dusk.lampGlow < 1);
  assert.equal(midnight.phase, 'night');
  assert.equal(midnight.lampGlow, 1);
  assert.deepEqual(computeAtmosphere(1439.99, 'clear').ambient, midnight.ambient);
  assert.ok(morning.shadow.x < 0 && sunset.shadow.x > 0);
  assert.ok(midnight.shadow.opacity < noon.shadow.opacity);
  assert.ok(rainyDay.ambient[0] < rainyDay.ambient[2] && rainyDay.ambient[2] < 255);
});

test('the clock and weather blends follow simulation speeds, emit events, and survive save restore', () => {
  const world = createWorld(assets);
  const { time, weather } = world.state;
  const events = [];
  world.climate.subscribe('on_time_period_changed', event => events.push(event));
  world.climate.subscribe('on_weather_changed', event => events.push(event));
  world.climate.setClock(1439);
  for (const speed of [0, 1, 2, 3]) {
    time.speed = speed;
    const start = time.seconds;
    updateWorld(world, 0.4);
    assert.ok(Math.abs(time.seconds - start - 0.4 * speed) < 0.001);
  }
  assert.equal(time.day, 2);
  assert.ok(Math.abs(time.minutes - 11) < 0.001);
  world.climate.setWeather('heavy_rain');
  assert.equal(sampleWeather(weather, time.seconds).rain, 0);
  updateWorld(world, 1);
  const mid = sampleWeather(weather, time.seconds);
  assert.ok(mid.rain > 0.4 && mid.rain < 0.6);
  time.paused = true;
  updateWorld(world, 2);
  assert.deepEqual(sampleWeather(weather, time.seconds), mid);
  const loaded = createWorld(assets);
  assert.ok(restoreVillage(loaded, { state: structuredClone(world.state) }));
  assert.deepEqual(sampleWeather(loaded.state.weather, loaded.state.time.seconds), mid);
  world.climate.setWeather('cloudy');
  assert.deepEqual(sampleWeather(weather, time.seconds), mid);
  time.paused = false;
  updateWorld(world, 3);
  assert.equal(sampleWeather(weather, time.seconds).rain, 0);
  assert.equal(sampleWeather(weather, time.seconds).cloud, 0.52);
  assert.deepEqual(events, [
    { from: 'morning', to: 'night' }, { from: 'clear', to: 'heavy_rain' }, { from: 'heavy_rain', to: 'cloudy' },
  ]);
});

test('natural weather follows the schedule and legacy rain keeps its visual intensity', () => {
  const state = { time: { minutes: 720, seconds: 0, day: 1 }, weather: { current: 'rain' } };
  const climate = createClimate(state, undefined, {
    ...WEATHER_CONFIG, holdMinutes: { ...WEATHER_CONFIG.holdMinutes, light_rain: [40, 40] },
    probabilities: { ...WEATHER_CONFIG.probabilities, light_rain: { heavy_rain: 1 } },
  });
  climate.reset();
  assert.equal(sampleWeather(state.weather, 0).rain, 0.46);
  climate.advance(1);
  climate.advance(8);
  assert.equal(state.weather.current, 'heavy_rain');
  assert.equal(sampleWeather(state.weather, 9).rain, 0.46);
  assert.equal(sampleWeather(state.weather, 15.4).rain, 1);
});

test('Dev Mode actions trigger time, weather, resources, skills, landmarks, and collectibles', () => {
  const world = createWorld(assets);
  startGameplay(world);
  const view = { selectedVillager: world.state.villagers[0].id };

  assert.equal(runDevAction('time-night', world, view).ok, true);
  assert.equal(world.state.time.minutes, 0);

  assert.equal(runDevAction('weather-rain', world, view).ok, true);
  assert.equal(world.state.weather.current, 'light_rain');

  assert.equal(runDevAction('res-all', world, view).ok, true);
  assert.equal(world.resources.get('wood'), 50);
  assert.equal(world.resources.get('stone'), 50);
  assert.equal(world.resources.get('knowledge'), 50);

  assert.equal(runDevAction('vil-sick', world, view).ok, true);
  assert.equal(world.state.villagers[0].needs.health, 48);

  assert.equal(runDevAction('vil-skill-max', world, view).ok, true);
  assert.equal(skillProgress(world.state.villagers[0], 'gathering').rank.name, 'Master');
  assert.equal(skillProgress(world.state.villagers[0], 'gathering').level, 10);

  assert.equal(runDevAction('prog-research', world, view).ok, true);
  assert.equal(world.state.abilities.ancient_knowledge, true);

  assert.equal(runDevAction('prog-all-landmarks', world, view).ok, true);
  assert.equal(world.state.achievements.island_restored, true);
  assert.ok(world.state.crops.length > 0);

  assert.equal(runDevAction('prog-grow-crops', world, view).ok, true);
  assert.ok(world.state.crops.every(crop => crop.stage === 3));

  assert.equal(runDevAction('prog-discover-all', world, view).ok, true);
  assert.ok(Object.values(world.state.collectionProgress).every(entry => entry.discovered));
});
