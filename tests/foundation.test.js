import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssets, describeInteraction } from '../src/assets.js';
import { findRoute, screenToWorld, tileToWorld, walkable, worldToScreen, worldToTile, zoomAt } from '../src/geometry.js';
import { approachObject, createResourceManager, createWorld, habitatAllows, moveVillager, previewPlacement, updateWorld } from '../src/world.js';
import { readStudioModules } from '../tools/studios.js';
import { musicTrack } from '../src/ui.js';
import { startGameplay } from '../src/gameplay.js';
import { advanceOffline, readVillage, restoreVillage, saveVillage } from '../src/save.js';

const { uiCss, ...modules } = await readStudioModules();
const studios = Object.fromEntries(await Promise.all(Object.entries(modules).map(async ([key, code]) => [
  key, await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')),
])));
const assets = createAssets(studios);
const map = assets.terrain.metadata;

function runUntil(world, condition, limit = 120) {
  for (let elapsed = 0; elapsed < limit && !condition(); elapsed += 0.1) updateWorld(world, 0.1);
  assert.ok(condition(), 'Simulation did not reach its expected result');
}

test('dropping villagers on resources starts repeat work, builds skill, and delivers resources', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const luna = world.state.villagers[0];
  const source = map.objects.find(object => object.type === 'berry_bush');
  const start = world.state.objects[source.id].amount;
  assert.equal(game.assign(luna, { kind: 'object', id: source.id }), null);
  runUntil(world, () => luna.activity === 'Carrying supplies');
  runUntil(world, () => world.state.objects[source.id].amount < start);
  runUntil(world, () => luna.skills.gather >= 2);
  assert.equal(luna.preferredJob.job, 'gather');
  game.stop(luna);
  assert.equal(luna.preferredJob, null);
});

test('dropping lands immediately on reachable ground or at a job, with no walking leg', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const luna = world.state.villagers[0];
  const ground = map.villagerSpawns[2];
  assert.equal(game.drop(luna, ground), null);
  assert.deepEqual(luna.position, tileToWorld(ground, map.meta.tileSize));
  assert.deepEqual(luna.route, []);
  const blocked = map.bridge.footprint.find(tile => !walkable(world.collision, tile));
  assert.match(game.drop(luna, blocked), /reachable ground/);
  assert.deepEqual(luna.tile, ground);
  const east = map.unlockableAreas.find(area => area.id === 'eastern_region').tiles
    .map(([x, y]) => ({ x, y })).find(tile => walkable(world.collision, tile));
  assert.match(game.drop(luna, east), /reachable ground/);
  const bush = map.objects.find(object => object.type === 'berry_bush');
  assert.equal(game.drop(luna, bush.tile, { kind: 'object', id: bush.id }), null);
  assert.ok(bush.interactionPoints.some(point => point.x === luna.tile.x && point.y === luna.tile.y));
  assert.deepEqual(luna.route, []);
  assert.equal(luna.work.phase, 'work');
  assert.equal(luna.animation, 'gather');
  const duration = luna.work.remaining;
  world.heldVillager = luna.id;
  updateWorld(world, 1);
  assert.equal(luna.work.remaining, duration);
  world.heldVillager = null;
  runUntil(world, () => luna.work?.phase === 'deliver');
  const amount = world.state.objects[bush.id].amount;
  const camp = map.objects.find(object => object.type === 'campfire_site');
  assert.equal(game.drop(luna, camp.tile, { kind: 'object', id: camp.id }), null);
  assert.ok(world.state.objects[bush.id].amount < amount);
});

test('villagers walk to useful chores and deliver supplies without player input', () => {
  const world = createWorld(assets);
  startGameplay(world);
  updateWorld(world, 0.1);
  for (const job of ['gather', 'chop', 'mine']) {
    assert.ok(world.state.villagers.some(villager => villager.work?.job === job && villager.route.length));
  }
  runUntil(world, () => world.resources.get('wood') > 0 && world.resources.get('stone') > 0);
  assert.ok(world.state.villagers.every(villager => villager.preferredJob === null));
});

test('the island journal progression can unlock and complete every landmark', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const [luna, kai] = world.state.villagers;
  function complete(id) {
    const puzzle = map.puzzleLocations.find(entry => entry.puzzleId === id);
    assert.equal(game.assign(luna, { kind: 'object', id: puzzle.objectId }), null, id);
    runUntil(world, () => world.state.worldFlags[id]);
  }
  assert.match(game.assign(luna, { kind: 'object', id: 'campfire_site_001' }), /Wood/);
  world.resources.add('wood', 120);
  world.resources.add('stone', 100);
  world.resources.add('food', 100);
  complete('light_campfire');
  assert.equal(game.assign(kai, { kind: 'object', id: 'campfire_site_001' }), null);
  runUntil(world, () => world.resources.get('knowledge') >= 2);
  complete('unblock_spring');
  assert.ok(world.state.crops.length);
  world.resources.add('knowledge', 100);
  assert.equal(game.research('farm'), null);
  const crop = world.state.crops[0];
  assert.equal(game.assign(world.state.villagers[2], { kind: 'crop', id: crop.id }), null);
  runUntil(world, () => crop.stage === 3);
  runUntil(world, () => crop.stage === 0);
  complete('restore_garden');
  assert.equal(game.research('fish'), null);
  const angler = world.state.villagers[4];
  const spot = map.fishingSpots.find(entry => !entry.requires.includes('bridge_repaired')
    && !entry.requires.includes('fishing_level_2')
    && findRoute(world.collision, angler.tile, [entry.standPosition]));
  assert.equal(game.assign(angler, { kind: 'object', id: spot.id }), null);
  runUntil(world, () => angler.activity === 'Carrying supplies');
  const food = world.resources.get('food');
  runUntil(world, () => world.resources.get('food') > food);
  game.stop(angler);
  assert.equal(game.research('advanced_construction'), null);
  complete('repair_bridge');
  assert.ok(map.bridge.footprint.every(tile => walkable(world.collision, tile)));
  complete('light_cave');
  assert.equal(game.research('ancient_knowledge'), null);
  complete('open_waterfall_passage');
  complete('restore_monument');
  assert.equal(world.state.achievements.island_restored, true);
});

test('building, families, healing, collectible discovery, and local saves work together', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const [luna, kai] = world.state.villagers;
  world.resources.add('wood', 80);
  world.resources.add('stone', 50);
  world.resources.add('food', 60);
  world.resources.add('knowledge', 30);
  const zone = map.buildingZones.find(entry => entry.allowedBuildingTypes.includes('family_house'));
  assert.ok(zone.tiles.some(([x, y]) => game.place('family_house', { x, y }) === null));
  const site = world.state.buildings[0];
  assert.equal(game.assign(luna, { kind: 'building', id: site.id }), null);
  runUntil(world, () => site.state === 'completed');
  assert.equal(world.state.world.populationCapacity, 7);
  assert.equal(game.assign(luna, { kind: 'villager', id: kai.id }), null);
  runUntil(world, () => world.state.villagers.length === 6);
  assert.equal(world.state.villagers.at(-1).lifeStage, 'baby');
  kai.needs.health = 50;
  const mira = world.state.villagers[2];
  assert.equal(game.research('heal'), null);
  assert.equal(game.assign(mira, { kind: 'villager', id: kai.id }), null);
  runUntil(world, () => kai.needs.health === 100);
  const find = world.state.activeCollectibles[0];
  assert.ok(find);
  assert.equal(game.assign(mira, { kind: 'collectible', id: find.id }), null);
  runUntil(world, () => world.state.collectionProgress[find.assetId].discovered);
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  assert.equal(saveVillage(world, storage, 1000), true);
  const loaded = createWorld(assets);
  assert.equal(restoreVillage(loaded, readVillage(storage)), true);
  startGameplay(loaded);
  assert.equal(loaded.state.villagers.length, 6);
  assert.equal(loaded.resources.get('food'), world.resources.get('food'));
  assert.equal(advanceOffline(loaded, 1000, 400000), 90);
  loaded.state.time.paused = true;
  assert.equal(advanceOffline(loaded, 1000, 400000), 0);
});

test('music follows the menu, weather and island clock', () => {
  const { state } = createWorld(assets);
  assert.equal(state.settings.musicVolume, 100);
  assert.equal(musicTrack(state), 'daytime');
  state.time.minutes = 1140;
  assert.equal(musicTrack(state), 'nighttime');
  state.weather.current = 'rain';
  assert.equal(musicTrack(state), 'rain');
  state.time.paused = true;
  assert.equal(musicTrack(state), 'menu');
});

test('HUD studio exports reusable renderers, styles, icons, markers and frames', () => {
  assert.match(uiCss, /\.gu-top/);
  assert.ok(assets.registry.has('icon_knowledge'));
  assert.ok(assets.registry.has('marker_selection_ring'));
  assert.ok(assets.registry.has('frame_panel'));
  assert.equal(typeof studios.ui.GameUI.renderGameHUD, 'function');
});

test('map exports preserve grids, object identity, bridge lock and SVG references', () => {
  const { width, height, tileSize } = map.meta;
  assert.deepEqual([width, height, tileSize], [80, 64, 16]);
  assert.ok(assets.validation.every(result => result.ok));
  for (const grid of [map.terrainGrid, map.collisionGrid, map.regionGrid, map.buildableGrid, map.farmableGrid]) {
    assert.equal(grid.length, height);
    assert.ok(grid.every(row => row.length === width));
  }
  assert.equal(new Set(map.objects.map(object => object.id)).size, 250);
  for (const object of map.objects) {
    assert.ok(assets.registry.has(object.assetId), object.id);
    for (const id of Object.values(object.states || {})) assert.ok(assets.registry.has(id), id);
  }
  const mon = map.objects.find(object => object.type === 'monument');
  assert.equal(findRoute(map.collisionGrid, map.villagerSpawns[0], mon.interactionPoints), null);
  assert.notEqual(assets.registry.get('monument_restored'), assets.registry.get('building:monument_restored'));
  const svg = assets.terrain.svg();
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const [, id] of svg.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), id);
  assert.ok(!svg.includes('data-object-type='));
});

test('collectible, building, resource and wildlife artwork can be generated', () => {
  const categoryCounts = { seashell: 10, mineral: 5, artifact: 5, butterfly: 5 };
  for (const [category, count] of Object.entries(categoryCounts)) {
    assert.equal(assets.collectibles.filter(item => item.category === category).length, count);
  }
  for (const asset of new Set(assets.registry.values())) {
    assert.match(asset.svg(), /^<svg\b/, asset.id);
  }
  for (const asset of assets.collectibles) {
    assert.match(asset.svg({ state: 'undiscovered' }), /class="silhouette"/);
    for (const [animation, meta] of Object.entries(asset.animations)) {
      assert.match(asset.svg({ animation, frame: meta.frameCount - 1 }), /^<svg\b/);
    }
  }
  for (const animal of assets.animals) {
    for (const [animation, meta] of Object.entries(animal.animations)) {
      for (const direction of animal.dirs) {
        assert.match(animal.svg({ animation, direction, frame: meta.frameCount - 1 }), /^<svg\b/);
      }
    }
  }
  assert.equal(assets.buildings.length, 12);
  assert.equal(assets.resourceItems.length, 20);
  assert.equal(assets.animals.length, 10);
});

test('coordinates round-trip through tiles, world, and zoomed camera', () => {
  const tile = { x: 24, y: 43 };
  const world = tileToWorld(tile, 16);
  const camera = { x: -79, y: 42, zoom: 2 };
  const screen = worldToScreen(world, camera);
  assert.deepEqual(worldToTile(world, 16), tile);
  assert.deepEqual(screenToWorld(screen, camera), world);
  zoomAt(camera, screen, 3);
  assert.deepEqual(worldToScreen(world, camera), screen);
  assert.deepEqual(worldToTile({ x: -0.1, y: 0 }, 16), { x: -1, y: 0 });
});

test('villagers initialize deterministically and traverse walkable tiles with directional frames', () => {
  const world = createWorld(assets);
  assert.equal(world.state.villagers.length, 5);
  assert.equal(JSON.stringify(world.state), JSON.stringify(createWorld(assets).state));
  const villager = world.state.villagers[0];
  assert.ok(world.state.villagers.every(v => walkable(world.collision, v.tile)));
  const bush = map.objects.find(object => object.type === 'berry_bush');
  assert.equal(moveVillager(world, villager, [bush.tile]), false);
  assert.ok(approachObject(world, villager, bush));
  assert.ok(villager.route.every(tile => walkable(world.collision, tile)));
  updateWorld(world, 0.1);
  assert.equal(villager.animation, 'walk');
  const config = { ...villager.appearance, lifeStage: villager.lifeStage };
  assert.notEqual(assets.villager.svg({ config, animation: 'walk', frame: 1, direction: 'left' }),
    assets.villager.svg({ config, animation: 'walk', frame: 2, direction: 'right' }));
  const frozen = { ...villager.position };
  world.state.time.paused = true;
  updateWorld(world, 1);
  assert.deepEqual(villager.position, frozen);
  world.state.time.paused = false;
  for (let i = 0; i < 160 && villager.currentTask; i++) updateWorld(world, 0.1);
  assert.equal(villager.animation, 'idle');
  assert.ok(bush.interactionPoints.some(point => point.x === villager.tile.x && point.y === villager.tile.y));
});

test('preview wildlife, collectibles, and building placement use source zones', () => {
  const world = createWorld(assets);
  assert.equal(world.state.wildlife.length, 10);
  for (let i = 0; i < 60; i++) {
    updateWorld(world, 0.1);
    for (const animal of world.state.wildlife) {
      const asset = assets.registry.get(animal.assetId);
      assert.ok(habitatAllows(map, asset, worldToTile(animal.position, 16)));
    }
  }
  assert.equal(world.collectiblePreviews.length, 4);
  for (const preview of world.collectiblePreviews) {
    const zone = map.collectibleSpawnZones.find(zone => zone.id === preview.zoneId);
    assert.ok(zone.tiles.some(([x, y]) => x === preview.tile.x && y === preview.tile.y));
  }
  const house = assets.buildings.find(building => building.type === 'house');
  const zone = map.buildingZones.find(entry => entry.allowedBuildingTypes.includes('house'));
  assert.ok(zone.tiles.some(([x, y]) => previewPlacement(world, house, { x, y }).allowed));
  assert.equal(previewPlacement(world, house, { x: 0, y: 0 }).allowed, false);
  assert.deepEqual(world.state.buildings, []);
});

test('resource changes publish only successful counter updates and preserve source yields', () => {
  const counters = { food: 1, wood: 0, stone: 0, knowledge: 0 };
  const manager = createResourceManager(counters, { food: 5 });
  const updates = [];
  const unsubscribe = manager.subscribe((...event) => updates.push(event));
  assert.equal(manager.remove('stone', 1), undefined);
  assert.equal(manager.add('food', 8), 5);
  assert.equal(manager.canAfford({ food: 5 }), true);
  assert.equal(manager.remove('food', 3), 2);
  unsubscribe();
  manager.add('wood', 2);
  assert.deepEqual(updates, [['food', 5], ['food', 2]]);
  const river = map.fishingSpots.find(spot => spot.waterBodyId === 'river_001');
  const fish = describeInteraction(river, assets);
  assert.equal(fish.resourceId, 'resource_fish_large');
  assert.deepEqual(fish.positions[0], { ...river.standPosition, facing: river.facing });
  assert.deepEqual(fish.waterTarget, river.waterTarget);
  assert.equal(describeInteraction(map.objects.find(object => object.type === 'tree'), assets).counter, 'wood');
});
