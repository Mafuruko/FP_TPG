import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssets } from '../src/assets.js';
import { readStudioModules } from '../tools/studios.js';
import { createWorld } from '../src/world.js';
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
import { blendAtmosphereOverlay, computeAtmosphere } from '../src/atmosphere.js';
import { runDevAction } from '../src/dev-tools.js';

const { uiCss: _uiCss, ...modules } = await readStudioModules();
const studios = Object.fromEntries(await Promise.all(Object.entries(modules).map(async ([key, code]) => [
  key, await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')),
])));
const assets = createAssets(studios);

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

test('atmosphere math smoothly darkens night, tints dawn/dusk, and flags rain overcast', () => {
  const noon = computeAtmosphere(720, 'clear');
  const dawn = computeAtmosphere(375, 'clear');
  const dusk = computeAtmosphere(1125, 'clear');
  const midnight = computeAtmosphere(0, 'clear');
  const rainyDay = computeAtmosphere(720, 'rain');

  assert.equal(noon.phase, 'day');
  assert.equal(noon.nightAlpha, 0);
  assert.equal(noon.lampGlow, 0);

  assert.equal(dawn.phase, 'dawn');
  assert.ok(dawn.twilightAlpha > 0.1);

  assert.equal(dusk.phase, 'dusk');
  assert.ok(dusk.twilightAlpha > 0.1);

  assert.equal(midnight.phase, 'night');
  assert.ok(midnight.nightAlpha >= 0.5);
  assert.ok(midnight.lampGlow > 0.9);

  assert.equal(rainyDay.isRain, true);
  assert.ok(rainyDay.overcastAlpha > 0.1);
  assert.equal(noon.overlayStyle, null);
  assert.match(blendAtmosphereOverlay(midnight), /^rgba\(/);
  assert.match(blendAtmosphereOverlay(rainyDay), /^rgba\(/);
});

test('Dev Mode actions trigger time, weather, resources, skills, landmarks, and collectibles', () => {
  const world = createWorld(assets);
  startGameplay(world);
  const view = { selectedVillager: world.state.villagers[0].id };

  assert.equal(runDevAction('time-night', world, view).ok, true);
  assert.equal(world.state.time.minutes, 0);

  assert.equal(runDevAction('weather-rain', world, view).ok, true);
  assert.equal(world.state.weather.current, 'rain');

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
