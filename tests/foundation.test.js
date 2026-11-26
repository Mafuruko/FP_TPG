import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssets, describeInteraction } from '../src/assets.js';
import { findRoute, screenToWorld, tileToWorld, walkable, worldToScreen, worldToTile, zoomAt } from '../src/geometry.js';
import { approachObject, createResourceManager, createWorld, habitatAllows, moveVillager, previewPlacement, updateWorld } from '../src/world.js';
import { readStudioModules } from '../tools/studios.js';
import { musicTrack } from '../src/ui.js';
import { butterflyHover } from '../src/render.js';
import { BirdState, birdAnimations, birdTuning, birdVisuals } from '../src/birds.js';
import { FishState, fishTuning, fishVisuals, launchFish, waterAt } from '../src/fish.js';
import { DolphinState, dolphinVisuals } from '../src/dolphin.js';
import { contactVisual, groundPosition, villagerFrame } from '../src/ground.js';
import { LandState, landWildlifeTuning } from '../src/land-wildlife.js';
import { TurtleState, turtleVisuals } from '../src/turtle.js';
import { enableWildlifeDirector } from '../src/world.js';
import { cameraWorldRect, rangeFromView, wildlifeOpacity, wildlifeTuning, wildlifeZone } from '../src/wildlife-director.js';
import { startGameplay } from '../src/gameplay.js';
import { advanceOffline, readVillage, restoreVillage, saveVillage } from '../src/save.js';
import { skillProgress, villagerBlink, villagerExpression, villagerPortraitExpression } from '../src/villagers.js';

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

test('job drop previews use the same reachable tile and assignment rules as release', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const [villager, patient] = world.state.villagers;
  const initial = { ...villager.tile };
  const bush = map.objects.find(object => object.type === 'berry_bush');
  const tree = map.objects.find(object => object.type === 'tree' && describeInteraction(object, assets).type === 'chop');
  const fishing = map.fishingSpots.find(spot => spot.requires.length === 1);
  const camp = map.objects.find(object => object.type === 'campfire_site');
  const preview = object => game.inspectDrop(villager, object.tile || object.waterTarget, { kind: 'object', id: object.id });
  assert.equal(preview(tree).label, 'Chop Wood');
  assert.match(preview(fishing).issue, /Learn Fishing/);
  world.state.abilities.fish = true;
  assert.equal(preview(fishing).label, 'Fish');
  assert.deepEqual(preview(fishing).tile, { ...fishing.standPosition, facing: fishing.facing });
  world.state.worldFlags.light_campfire = true;
  assert.equal(preview(camp).label, 'Research');
  patient.needs.health = 60;
  world.state.abilities.heal = true;
  assert.equal(game.inspectDrop(villager, patient.tile, { kind: 'villager', id: patient.id }).label, 'Heal');
  for (const key of ['wood', 'stone', 'food']) world.resources.add(key, 100);
  const zone = map.buildingZones.find(entry => entry.allowedBuildingTypes.includes('house'));
  assert.ok(zone.tiles.some(([x, y]) => game.place('house', { x, y }) === null));
  const [site] = world.state.buildings;
  assert.equal(game.inspectDrop(villager, site.tile, { kind: 'building', id: site.id }).label, 'Build');
  assert.deepEqual(villager.tile, initial);
  const drop = preview(bush);
  assert.equal(drop.label, 'Gather Food');
  assert.ok(assets.registry.has(drop.icon));
  assert.equal(game.drop(villager, bush.tile, { kind: 'object', id: bush.id }), null);
  assert.deepEqual(villager.position, tileToWorld(drop.tile, map.meta.tileSize));
  assert.equal(villager.work.job, 'gather');
  assert.ok(world.groundParticles.length >= 3);
  assert.equal(game.drop(villager, initial), null);
  assert.equal(villager.reaction.icon, 'question');
  world.state.objects[bush.id].amount = 0;
  assert.equal(preview(bush).label, undefined);
  assert.match(preview(bush).issue, /empty/);
});

test('saved job experience grants ranks, faster cycles, bigger hauls and different tool art', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const villager = world.state.villagers[0];
  const bush = map.objects.find(object => object.type === 'berry_bush');
  const ref = { kind: 'object', id: bush.id };
  assert.equal(game.drop(villager, bush.tile, ref), null);
  const traineeTime = villager.work.remaining;
  assert.equal(skillProgress(villager, 'gathering').rank.name, 'Trainee');
  villager.skills = { gather: 2, chop: 2, fish: 1 };
  assert.equal(game.drop(villager, bush.tile, ref), null);
  const adeptTime = villager.work.remaining;
  assert.equal(skillProgress(villager, 'gathering').rank.name, 'Adept');
  villager.skills.mine = 9;
  assert.equal(game.drop(villager, bush.tile, ref), null);
  assert.equal(skillProgress(villager, 'gathering').rank.name, 'Master');
  assert.ok(villager.work.remaining < adeptTime && adeptTime < traineeTime);
  runUntil(world, () => villager.work?.phase === 'deliver');
  const amount = world.state.objects[bush.id].amount;
  const camp = map.objects.find(object => object.type === 'campfire_site');
  assert.equal(game.drop(villager, camp.tile, { kind: 'object', id: camp.id }), null);
  assert.equal(world.state.objects[bush.id].amount, amount - 5);
  for (const animation of ['pickup', 'build']) {
    const options = { config: villager.appearance, animation, shadow: false };
    assert.notEqual(assets.villager.svg(options), assets.villager.svg({
      ...options, ...(animation === 'pickup' ? { frame: 1 } : { rank: 2 }),
    }));
  }
});

test('snake-shy villagers run away with a brief alert and fast walkers cross ground sooner', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  assert.ok(world.state.villagers.every(villager => villager.quirks.length >= 1 && villager.quirks.length <= 2));
  const [villager] = world.state.villagers;
  world.state.villagers = [villager];
  villager.quirks = ['snakeShy'];
  const origin = { ...villager.position };
  const snake = world.state.wildlife.find(animal => animal.assetId === 'wildlife_snake');
  snake.position = { x: origin.x + 6, y: origin.y };
  world.state.wildlife = [snake];
  updateWorld(world, 0.1);
  assert.equal(villager.activity, 'Running from a snake');
  assert.equal(villager.reaction.icon, 'warn');
  const end = tileToWorld(villager.route.at(-1), map.meta.tileSize);
  assert.ok(Math.hypot(end.x - snake.position.x, end.y - snake.position.y) > 24);
  world.state.wildlife = [];
  const speedSample = quirks => {
    assert.equal(game.drop(villager, map.villagerSpawns[0]), null);
    villager.quirks = quirks;
    assert.equal(game.move(villager, map.villagerSpawns[2]), null);
    updateWorld(world, 0.1);
    return Math.hypot(villager.position.x - origin.x, villager.position.y - origin.y);
  };
  assert.ok(speedSample(['fastWalker']) > speedSample(['curious']));
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

test('a villager rests after delivering and returns to the same job, then switches when the bush is empty', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const [villager] = world.state.villagers;
  world.state.villagers = [villager];
  world.resources.remove('food', world.resources.get('food'));
  for (const object of map.objects) {
    if (object.type !== 'berry_bush' && describeInteraction(object, assets).type === 'gather') {
      world.state.objects[object.id].amount = 0;
    }
  }
  villager.needs.energy = 50;
  runUntil(world, () => villager.activity === 'Resting before gathering');
  assert.equal(villager.preferredJob, null);
  const { ref } = villager.routine;
  assert.equal(world.objects.get(ref.id).type, 'berry_bush');
  assert.ok(world.resources.get('food') > 0);
  assert.equal(villager.animation, 'sit');
  updateWorld(world, 0.5);
  assert.equal(villager.activity, 'Resting before gathering');
  runUntil(world, () => villager.activity === 'Returning to the berry bush');
  assert.equal(villager.work.ref.id, ref.id);
  assert.ok(villager.needs.energy >= 76);

  assert.equal(game.assign(villager, ref), null);
  villager.needs.energy = 43;
  runUntil(world, () => villager.activity === 'Resting before gathering');
  world.state.objects[ref.id].amount = 0;
  runUntil(world, () => villager.activity === 'Looking for ripe berries' && villager.work && villager.work.ref.id !== ref.id);
  assert.equal(world.objects.get(villager.work.ref.id).type, 'berry_bush');
  assert.equal(villager.preferredJob.ref.id, villager.work.ref.id);
});

test('villager faces follow their activity and reactions even with a surprised face in an older save', () => {
  const villager = createWorld(assets).state.villagers[0];
  villager.appearance = { ...villager.appearance, seed: 0, expression: 'surprised' };
  assert.equal(villagerPortraitExpression(villager), 'neutral');
  assert.equal(villagerExpression(villager, 0), 'happy');
  assert.equal(villagerExpression(villager, 4), 'neutral');
  assert.equal(villagerBlink(villager, 4.1), true);
  assert.equal(villagerBlink(villager, 4.3), false);

  villager.work = { phase: 'work' };
  assert.equal(villagerExpression(villager, 4), 'focused');
  villager.reaction = { icon: 'question', until: 5 };
  assert.equal(villagerExpression(villager, 4), 'confused');
  assert.equal(villagerExpression(villager, 5), 'focused');
  villager.reaction = { icon: 'warn', until: 6 };
  assert.equal(villagerExpression(villager, 5), 'worried');
  villager.illness = {};
  assert.equal(villagerExpression(villager, 6), 'sad');
  delete villager.illness;
  villager.animation = 'sleep';
  assert.equal(villagerExpression(villager, 6), 'tired');

  const face = (expression, animation = 'idle', frame = 0, blinking = false) =>
    assets.villager.svg({ config: { ...villager.appearance, expression, blinking }, animation, frame })
      .match(/<g class="layer-face">(.*?)<\/g>/)[1];
  const expressions = ['neutral', 'happy', 'sad', 'surprised', 'focused', 'worried', 'tired', 'confused'];
  assert.equal(new Set(expressions.map(expression => face(expression))).size, expressions.length);
  assert.notEqual(face('neutral', 'idle', 0, true), face('neutral'));
  assert.ok(face('neutral', 'pickup').includes('#8e3b3b'));
  assert.ok(face('neutral', 'collectLift').includes('#8e3b3b'));
  assert.ok(!face('neutral', 'collectLift', 3).includes('#8e3b3b'));
});

test('idle villagers face each other and take turns talking until a player redirects one of them', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const [a, b] = world.state.villagers;
  world.state.villagers = [a, b];
  for (const key of ['food', 'wood', 'stone', 'knowledge']) world.resources.add(key, 100);
  const adjacent = [{ x: a.tile.x + 1, y: a.tile.y }, { x: a.tile.x - 1, y: a.tile.y }]
    .find(tile => walkable(world.collision, tile));
  assert.ok(adjacent);
  assert.equal(game.drop(b, adjacent), null);
  b.retryAt = 60;
  a.leisureAt = 0;
  runUntil(world, () => a.conversation?.partnerId === b.id, 12);
  assert.equal(b.conversation.partnerId, a.id);
  assert.equal(a.activity, `Talking with ${b.name}`);
  assert.equal(b.activity, `Talking with ${a.name}`);
  assert.deepEqual([a.direction, b.direction], adjacent.x > a.tile.x ? ['right', 'left'] : ['left', 'right']);
  assert.deepEqual([a.animation, b.animation], ['talk', 'idle']);
  runUntil(world, () => b.animation === 'talk', 1);
  assert.equal(a.animation, 'idle');
  assert.equal(game.move(a, a.tile), null);
  assert.equal(a.conversation, null);
  assert.equal(b.conversation, null);
  assert.equal(b.animation, 'idle');
  updateWorld(world, 2);
  assert.equal(a.conversation, null);
  assert.equal(b.conversation, null);
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

test('collecting stages the grab and reveal, including repeat finds', () => {
  const world = createWorld(assets);
  const game = startGameplay(world);
  const [villager] = world.state.villagers;
  const asset = assets.collectibles.find(item => item.category === 'seashell' && item.rarity === 'rare');
  const events = [];
  game.subscribeEvents(event => { if (event.type === 'collectible') events.push(event); });
  world.state.time.speed = 3;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const find = { id: 'test-find', assetId: asset.id, tile: villager.tile, position: { ...villager.position } };
    world.state.activeCollectibles.push(find);
    assert.equal(game.drop(villager, villager.tile, { kind: 'collectible', id: find.id }), null);
    assert.equal(villager.animation, 'collectGrab');
    updateWorld(world, 0.2);
    assert.ok(world.state.activeCollectibles.includes(find));
    runUntil(world, () => world.collectibleReveals.has(villager.id), 2);
    assert.ok(!world.state.activeCollectibles.includes(find));
    assert.equal(world.state.collectionProgress[asset.id].discoveryCount, attempt);
    assert.equal(events.at(-1).villagerId, villager.id);
    assert.equal(events.at(-1).firstEver, attempt === 1);
    assert.equal(world.collectibleReveals.get(villager.id).assetId, asset.id);
    updateWorld(world, 0.8);
    assert.equal(villager.activity, `Showing ${asset.name}`);
    runUntil(world, () => !world.collectibleReveals.has(villager.id), 2);
  }
  assert.equal(events.length, 2);
});

test('collectible butterflies flap and glide in a small pixel-snapped area around their spawn', () => {
  const tile = map.villagerSpawns[0];
  const entity = { tile, position: tileToWorld(tile, map.meta.tileSize) };
  const { flap } = assets.collectibles.find(item => item.category === 'butterfly').animations;
  const samples = Array.from({ length: 180 }, (_, i) => butterflyHover(entity, i / 30, flap));
  const horizontal = new Set();
  for (const { position, frame } of samples) {
    assert.ok(Number.isInteger(position.x) && Number.isInteger(position.y));
    assert.ok(Math.abs(position.x - entity.position.x) <= 6);
    assert.ok(Math.abs(position.y - entity.position.y) <= 5);
    assert.ok(frame >= 0 && frame < flap.frameCount);
    horizontal.add(position.x);
  }
  assert.ok(horizontal.size >= 8);
  assert.ok(samples.some(sample => sample.frame === 2));
  assert.ok(samples.filter(sample => sample.frame === 0).length > samples.length / 2);
  assert.deepEqual(entity.position, tileToWorld(tile, map.meta.tileSize));
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
      if (animal.bird && animal.bird.state !== BirdState.GROUNDED) continue;
      if (animal.fish && animal.fish.state !== FishState.UNDERWATER) continue;
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

test('birds take off, flap and coast, then touch down on walkable terrain in their habitat', () => {
  const world = createWorld(assets);
  const birds = world.state.wildlife.filter(animal => animal.bird);
  assert.equal(birds.length, 2);
  const tracks = new Map(birds.map(animal => [animal.id, { states: [], glide: false, flap: false, outsideHabitat: false }]));
  for (let i = 0; i < 1000; i++) {
    updateWorld(world, 1 / 30);
    for (const entity of birds) {
      const asset = assets.registry.get(entity.assetId);
      const art = birdAnimations[asset.key];
      const track = tracks.get(entity.id);
      const { state, altitude, vx, vy } = entity.bird;
      const tile = worldToTile(entity.position, map.meta.tileSize);
      const visual = birdVisuals(entity, asset);
      if (state !== track.states.at(-1)) track.states.push(state);
      assert.ok(map.terrainGrid[tile.y]?.[tile.x]);
      assert.ok(altitude >= 0 && altitude <= birdTuning.maxAltitude);
      assert.ok(Math.abs(visual.angle) <= birdTuning.maxTiltAngle);
      assert.ok(asset.animations[entity.animation]);
      if (state === BirdState.GROUNDED) {
        assert.ok(walkable(world.collision, tile));
        assert.ok(habitatAllows(map, asset, tile));
        assert.deepEqual([altitude, visual.altitude, visual.angle], [0, 0, 0]);
        assert.equal(visual.shadowWidth, art.shadowWidth);
        assert.ok(Math.hypot(vx, vy) <= birdTuning.groundSpeed);
      } else if (state === BirdState.FLYING) {
        if (!habitatAllows(map, asset, tile) && altitude > 0) track.outsideHabitat = true;
        if (entity.animation === art.flap && entity.bird.animationFrame === null) track.flap = true;
        if (entity.animation === art.glide && entity.bird.animationFrame === art.glideFrame) track.glide = true;
        if (altitude > 12) {
          assert.ok(visual.shadowWidth < art.shadowWidth);
          assert.ok(visual.shadowOpacity < birdTuning.shadowMaxOpacity);
        }
      }
    }
  }
  for (const track of tracks.values()) {
    assert.deepEqual(track.states.slice(0, 5), [...Object.values(BirdState), BirdState.GROUNDED]);
    assert.ok(track.flap && track.glide);
  }
  assert.ok([...tracks.values()].some(track => track.outsideHabitat));
});

test('birds avoid a landing tile that becomes obstructed and restore legacy save animations', () => {
  const saved = createWorld(assets);
  const legacy = saved.state.wildlife.find(animal => animal.assetId === 'wildlife_seagull');
  delete legacy.bird;
  legacy.animation = 'fly';
  const world = createWorld(assets);
  assert.equal(restoreVillage(world, { state: saved.state }), true);
  const bird = world.state.wildlife.find(animal => animal.assetId === legacy.assetId);
  assert.equal(bird.animation, 'stand');
  runUntil(world, () => bird.bird.state === BirdState.FLYING && bird.bird.altitude > 12, 10);
  const projected = bird.tile;
  assert.notDeepEqual(projected, bird.bird.target);
  world.collision[projected.y][projected.x] = 1;
  updateWorld(world, 0.1);
  assert.equal(bird.bird.state, BirdState.FLYING);
  assert.ok(bird.bird.altitude > 0);
  world.collision[projected.y][projected.x] = map.collisionGrid[projected.y][projected.x];
  runUntil(world, () => bird.bird.state === BirdState.LANDING, 15);
  const obstruction = bird.bird.target;
  world.collision[obstruction.y][obstruction.x] = 1;
  updateWorld(world, 0.15);
  assert.equal(bird.bird.state, BirdState.FLYING);
  runUntil(world, () => bird.bird.state === BirdState.GROUNDED, 15);
  assert.ok(walkable(world.collision, bird.tile));
  assert.notDeepEqual(bird.tile, obstruction);
});

test('ambient fish use tail strokes, glide under drag, and keep to their own water body', () => {
  const world = createWorld(assets);
  const fish = world.state.wildlife.filter(entity => entity.fish);
  assert.equal(fish.length, 2);
  const trails = new Map(fish.map(entity => [entity.id, { impulse: false, coast: false, air: false, bob: new Set() }]));
  const particles = new Set();
  for (let i = 0; i < 1000; i++) {
    const before = fish.map(entity => ({ ...entity.fish }));
    updateWorld(world, 1 / 60);
    for (const [index, entity] of fish.entries()) {
      const render = fishVisuals(entity);
      const trace = trails.get(entity.id);
      const current = entity.fish;
      const speed = Math.hypot(current.vx, current.vy);
      const priorSpeed = Math.hypot(before[index].vx, before[index].vy);
      assert.ok(Number.isInteger(render.offsetY));
      if (current.state === FishState.AIRBORNE) {
        trace.air = true;
        assert.equal(render.tint, null);
        continue;
      }
      assert.equal(current.state, FishState.UNDERWATER);
      assert.equal(waterAt(map, entity.position), current.water);
      assert.equal(render.tint.color, fishTuning.underwaterTint);
      assert.ok(Math.abs(render.bank) <= fishTuning.maxBank);
      if (entity.animation === 'idle' && speed < 5) trace.bob.add(render.offsetY);
      if (current.strokes > before[index].strokes) {
        assert.equal(render.frame, 0);
        if (speed > priorSpeed + 3) trace.impulse = true;
      } else if (current.goal && speed > 1 && speed < priorSpeed && speed > priorSpeed - 4) trace.coast = true;
    }
    for (const particle of world.fishParticles) particles.add(particle.kind);
  }
  for (const trace of trails.values()) assert.ok(trace.impulse && trace.coast && trace.air && trace.bob.size > 1);
  assert.deepEqual([...particles].sort(), ['bubble', 'splash', 'wake']);
});

test('a fish that lands on a shore flops back to its water, including after restoring a save', () => {
  const world = createWorld(assets);
  const entity = world.state.wildlife.find(wildlife => wildlife.assetId === 'wildlife_fish_coast');
  const { tileSize } = map.meta;
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  let shoreline;
  for (const water of world.habitatTiles.get(entity.assetId)) {
    const direction = directions.find(step => {
      const land = { x: water.x + step.x, y: water.y + step.y };
      return walkable(world.collision, land) && !waterAt(map, tileToWorld(land, tileSize));
    });
    if (direction) {
      shoreline = { water, direction };
      break;
    }
  }
  assert.ok(shoreline);
  const { water, direction } = shoreline;
  const center = tileToWorld(water, tileSize);
  entity.position = { x: center.x + direction.x * 6, y: center.y + direction.y * 6 };
  assert.equal(launchFish(world, entity, { x: direction.x * 22, y: direction.y * 22 }), true);
  assert.equal(entity.fish.state, FishState.AIRBORNE);
  assert.equal(fishVisuals(entity).tint, null);
  assert.ok(world.fishParticles.some(particle => particle.kind === 'splash'));
  runUntil(world, () => entity.fish.state === FishState.BEACHED, 2);
  assert.equal(waterAt(map, entity.position), null);
  const loaded = createWorld(assets);
  const snapshot = JSON.parse(JSON.stringify(world.state));
  const legacy = snapshot.wildlife.find(wildlife => wildlife.assetId === 'wildlife_fish_fresh');
  delete legacy.fish;
  legacy.animation = 'swim';
  assert.equal(restoreVillage(loaded, { state: snapshot }), true);
  assert.equal(legacy.animation, 'idle');
  assert.equal(legacy.fish.state, FishState.UNDERWATER);
  const recovered = loaded.state.wildlife.find(wildlife => wildlife.id === entity.id);
  runUntil(loaded, () => recovered.animation === 'flee' && recovered.fish.height > 0, 2);
  assert.equal(fishVisuals(recovered).tint, null);
  runUntil(loaded, () => recovered.fish.state === FishState.UNDERWATER, 6);
  assert.equal(waterAt(map, recovered.position), entity.fish.water);
  assert.ok(fishVisuals(recovered).tint);
  assert.ok(loaded.fishParticles.some(particle => particle.kind === 'splash'));
});

test('the dolphin swims, surfaces, breaches, and dives only in offshore water', () => {
  const world = createWorld(assets);
  const entity = world.state.wildlife.find(wildlife => wildlife.assetId === 'wildlife_dolphin');
  const asset = assets.registry.get(entity.assetId);
  world.state.wildlife = [entity];
  const states = [];
  const frames = new Set();
  const effects = new Set();
  for (let i = 0; i < 600; i++) {
    updateWorld(world, 0.05);
    const { state, frame } = entity.dolphin;
    const visuals = dolphinVisuals(entity);
    assert.ok(habitatAllows(map, asset, entity.tile));
    assert.equal(map.terrainGrid[entity.tile.y][entity.tile.x], 'deep_water');
    assert.equal(waterAt(map, entity.position), 'ocean_001');
    assert.ok(frame < asset.animations[entity.animation].frameCount);
    if (states.at(-1) !== state) states.push(state);
    if (state === DolphinState.BREACHING) {
      assert.equal(entity.animation, 'jump');
      assert.equal(visuals.tint, null);
      assert.equal(visuals.offsetY, 0);
      frames.add(frame);
    }
    for (const particle of world.fishParticles) effects.add(particle.kind);
  }
  assert.deepEqual(states.slice(0, 8), [
    'SWIMMING', 'SURFACING', 'BREACHING', 'DIVING', 'SWIMMING', 'SURFACING', 'DIVING', 'SWIMMING',
  ]);
  assert.equal(frames.size, asset.animations.jump.frameCount);
  assert.deepEqual([...effects].sort(), ['splash', 'wake']);
  delete entity.dolphin;
  entity.animation = 'jump';
  const loaded = createWorld(assets);
  assert.equal(restoreVillage(loaded, { state: world.state }), true);
  assert.equal(entity.animation, 'swim');
  assert.equal(entity.dolphin.state, DolphinState.SWIMMING);
});

test('wildlife uses species-specific gaits, shore movements, and idle poses', () => {
  const world = createWorld(assets);
  const wildlife = world.state.wildlife.filter(entity => entity.land);
  const observations = new Map(wildlife.map(entity => [entity.id, { clips: new Set(), step: false, pause: false, lift: false }]));
  world.state.wildlife = wildlife;
  world.state.villagers = [];
  let grassDust = false;
  for (let i = 0; i < 600; i++) {
    updateWorld(world, 0.05);
    for (const entity of wildlife) {
      const asset = assets.registry.get(entity.assetId);
      const config = landWildlifeTuning[asset.key];
      const record = observations.get(entity.id);
      const visual = contactVisual(entity, asset.key);
      record.clips.add(entity.animation);
      assert.ok(entity.land.frame < asset.animations[entity.animation].frameCount);
      assert.ok(habitatAllows(map, asset, worldToTile(entity.position, map.meta.tileSize), world.collision));
      assert.ok(Number.isInteger(visual.offsetY) && Number.isInteger(visual.shadowWidth));
      if (entity.land.state === LandState.WANDER) {
        if (entity.ground.vx || entity.ground.vy) record.step = true;
        else if (config.hop) record.pause = true;
      }
      if (visual.offsetY < 0) record.lift = true;
    }
    grassDust ||= world.groundParticles.some(particle => particle.color === '#779757');
  }
  for (const entity of wildlife) {
    const key = assets.registry.get(entity.assetId).key;
    const record = observations.get(entity.id);
    assert.ok(record.step, key);
    assert.ok(record.clips.has(landWildlifeTuning[key].move), key);
    assert.ok(landWildlifeTuning[key].idle.some(clip => record.clips.has(clip)), key);
    if (key === 'rabbit' || key === 'crab') assert.ok(record.pause && record.lift, key);
  }
  assert.ok(grassDust);
});

test('the sea turtle cycles between land lunges and a tinted water glide with both shoreline effects', () => {
  const world = createWorld(assets);
  const entity = world.state.wildlife.find(wildlife => wildlife.assetId === 'wildlife_turtle');
  const asset = assets.registry.get(entity.assetId);
  world.state.wildlife = [entity];
  world.state.villagers = [];
  const crossings = [];
  const record = { pushes: 0, resets: 0, glides: 0, sand: false, bubble: false, faded: false, banked: false };
  let priorState = entity.turtle.state;
  for (let i = 0; i < 2100; i++) {
    const before = { ...entity.position };
    const speed = entity.turtle.speed;
    updateWorld(world, 1 / 60);
    const { state, frame } = entity.turtle;
    const tile = worldToTile(entity.position, map.meta.tileSize);
    const art = turtleVisuals(entity);
    assert.ok(habitatAllows(map, asset, tile));
    assert.equal(art.submerged, waterAt(map, entity.position) === 'ocean_001');
    assert.ok(frame < asset.animations[entity.animation].frameCount);
    assert.ok(Number.isInteger(art.offsetY) && Number.isInteger(art.bank));
    const traveling = Math.hypot(entity.position.x - before.x, entity.position.y - before.y) > 0.002;
    if (state === TurtleState.LAND_CRAWL) {
      assert.ok(walkable(world.collision, tile));
      if (entity.animation === 'crawl') {
        if (traveling) record.pushes++;
        else record.resets++;
      }
    } else if (traveling && entity.turtle.speed < speed) record.glides++;
    if (state !== priorState) {
      crossings.push(state);
      priorState = state;
      assert.ok(world.shoreRipples.length > 0);
      assert.ok(world.fishParticles.some(particle => particle.kind === 'splash'));
    }
    record.faded ||= art.submerged && art.contact < 0.1 && art.tint.alpha > 0.2;
    record.banked ||= art.submerged && art.bank !== 0;
    record.bubble ||= world.fishParticles.some(particle => particle.kind === 'bubble');
    record.sand ||= world.groundParticles.some(particle => particle.color === '#e8d5a4');
  }
  assert.ok(crossings.includes(TurtleState.LAND_CRAWL) && crossings.includes(TurtleState.WATER_SWIM));
  assert.ok(Object.values(record).every(Boolean), JSON.stringify(record));
});

test('a startled turtle tucks briefly, retreats to water, and restores existing saves', () => {
  const world = createWorld(assets);
  const entity = world.state.wildlife.find(wildlife => wildlife.assetId === 'wildlife_turtle');
  const [observer] = world.state.villagers;
  world.state.wildlife = [entity];
  world.state.villagers = [];
  runUntil(world, () => entity.turtle.state === TurtleState.LAND_CRAWL, 20);
  observer.position = { x: entity.position.x + 2, y: entity.position.y };
  world.state.villagers = [observer];
  const start = { ...entity.position };
  updateWorld(world, 0.15);
  assert.equal(entity.animation, 'rest');
  assert.ok(entity.turtle.retreat && entity.turtle.tuck > 0);
  assert.deepEqual(entity.position, start);
  runUntil(world, () => entity.turtle.state === TurtleState.WATER_SWIM, 12);
  const snapshot = JSON.parse(JSON.stringify(world.state));
  const previous = snapshot.wildlife[0];
  delete previous.turtle;
  previous.animation = 'crawl';
  const loaded = createWorld(assets);
  assert.ok(restoreVillage(loaded, { state: snapshot }));
  assert.equal(previous.turtle.state, TurtleState.WATER_SWIM);
  assert.equal(previous.animation, 'float');
});

function directorOptions(allowed, overrides = {}) {
  return {
    turnOverEvery: 0.1,
    ...overrides,
    species: Object.fromEntries(Object.entries(wildlifeTuning.species).map(([key, rule]) => [
      key, { ...rule, cap: allowed[key] ?? 0, ...(overrides.species?.[key] || {}) },
    ])),
  };
}

test('the camera ring spawns deer beyond their visible bounds and removes them only outside the wider ring', () => {
  const world = createWorld(assets);
  world.state.villagers = [];
  world.state.wildlife = [];
  const asset = assets.animals.find(entry => entry.key === 'deer');
  const director = enableWildlifeDirector(world, directorOptions({ deer: 2 }, { populationCap: 2 }));
  const rect = cameraWorldRect({ x: -620, y: -460, zoom: 2 }, 210, 170);
  director.setView(rect);
  runUntil(world, () => world.state.wildlife.length === 1, 4);
  const [animal] = world.state.wildlife;
  assert.equal(animal.assetId, asset.id);
  assert.equal(wildlifeZone(map, animal.tile), 'forest');
  assert.ok(habitatAllows(map, asset, animal.tile));
  assert.ok(rangeFromView(animal.position, rect) > asset.height + wildlifeTuning.spawnDistance[0]);
  runUntil(world, () => world.state.wildlife.length === 2, 5);
  runUntil(world, () => rangeFromView(animal.position, rect) < 25, 15);
  assert.equal(world.state.wildlife.length, 2);
  const far = { left: 1000, top: 860, right: 1200, bottom: 1010 };
  director.setView(far);
  updateWorld(world, 0.1);
  assert.ok(world.state.wildlife.includes(animal));
  runUntil(world, () => !world.state.wildlife.includes(animal), 3);
  assert.ok(rangeFromView(animal.position, far) > wildlifeTuning.despawnDistance);
});

test('visible crabs emerge from sand and finish burrowing before removal', () => {
  const world = createWorld(assets);
  world.state.villagers = [];
  world.state.wildlife = [];
  const director = enableWildlifeDirector(world, directorOptions({ crab: 1 }, {
    populationCap: 1, species: { crab: { lifetime: [1.2, 1.2] } },
  }));
  director.setView({ left: 0, top: 0, right: 1280, bottom: 1024 });
  updateWorld(world, 0.02);
  const [crab] = world.state.wildlife;
  assert.equal(crab.ecology.motion.kind, 'unbury');
  assert.ok(wildlifeOpacity(crab) < 0.1);
  assert.equal(map.terrainGrid[crab.tile.y][crab.tile.x], 'sand');
  assert.ok(world.groundParticles.length);
  runUntil(world, () => wildlifeOpacity(crab) === 1, 2);
  runUntil(world, () => crab.ecology.motion?.kind === 'bury', 3);
  runUntil(world, () => !world.state.wildlife.includes(crab), 2);
  assert.equal(wildlifeOpacity(crab), 0);
});

test('cover visitors fade by tagged props and aquatic visitors use deep-water arrivals and exits', () => {
  for (const key of ['rabbit', 'fish_fresh', 'turtle']) {
    const world = createWorld(assets);
    world.state.villagers = [];
    world.state.wildlife = [];
    const director = enableWildlifeDirector(world, directorOptions({ [key]: 1 }, {
      populationCap: 1, species: { [key]: { lifetime: key === 'turtle' ? [4, 4] : [1.2, 1.2] } },
    }));
    director.setView({ left: 0, top: 0, right: 1280, bottom: 1024 });
    runUntil(world, () => world.state.wildlife.length === 1, 4);
    const [visitor] = world.state.wildlife;
    assert.ok(wildlifeOpacity(visitor) < 0.1);
    if (key === 'rabbit') {
      assert.ok(visitor.ecology.motion.propId);
      runUntil(world, () => visitor.ecology.motion?.kind === 'cover', 12);
      assert.ok(visitor.ecology.motion.propId);
    } else if (key === 'turtle') {
      assert.equal(map.terrainGrid[visitor.tile.y][visitor.tile.x], 'deep_water');
      runUntil(world, () => !visitor.ecology.motion && wildlifeOpacity(visitor) === 1, 20);
      assert.equal(map.terrainGrid[visitor.tile.y][visitor.tile.x], 'shallow_water');
      runUntil(world, () => visitor.ecology.motion?.kind === 'dive', 12);
    } else {
      assert.equal(map.terrainGrid[visitor.tile.y][visitor.tile.x], 'deep_water');
      runUntil(world, () => visitor.ecology.motion?.kind === 'dive', 8);
      assert.equal(map.waterBodyGrid[visitor.tile.y][visitor.tile.x], visitor.fish.water);
    }
    runUntil(world, () => !world.state.wildlife.includes(visitor), 20);
    assert.equal(wildlifeOpacity(visitor), 0);
  }
});

test('same-water fish form a loose school and scatter from a nearby splash', () => {
  const world = createWorld(assets);
  world.state.villagers = [];
  const base = world.state.wildlife.find(entity => entity.assetId === 'wildlife_fish_fresh');
  const water = base.fish.water;
  const sameWater = world.habitatTiles.get(base.assetId).filter(tile => map.waterBodyGrid[tile.y][tile.x] === water);
  world.state.wildlife = [0, 1, 2, 3].map((index) => {
    const tile = sameWater[8 + index * 2];
    return {
      ...structuredClone(base), id: `test-fish-${index}`, tile, position: tileToWorld(tile, 16), route: [],
      fish: { ...base.fish, home: tile, goal: null, breachIn: 50 },
    };
  });
  const fish = world.state.wildlife;
  const director = enableWildlifeDirector(world, directorOptions({}));
  director.setView({ left: 0, top: 0, right: 1280, bottom: 1024 });
  updateWorld(world, 0.05);
  assert.equal(fish.filter(entity => entity.ecology.schoolGoal).length, 3);
  for (const entity of fish.slice(1)) assert.equal(waterAt(map, entity.ecology.schoolGoal), water);
  const target = fish[2];
  world.fishParticles.push({ kind: 'splash', water, x: target.position.x + 12, y: target.position.y,
    age: 0, life: 1, vx: 0, vy: 0 });
  updateWorld(world, 0.05);
  assert.ok(target.ecology.scatterFrom && target.fish.dash > 0);
});

test('bird and deer panic starts locally and spreads to peers after a short delay', () => {
  for (const key of ['songbird', 'deer']) {
    const world = createWorld(assets);
    const animal = world.state.wildlife.find(entity => entity.assetId === `wildlife_${key}`);
    const otherTile = world.habitatTiles.get(animal.assetId).find(tile => {
      const point = tileToWorld(tile, 16);
      const span = Math.hypot(point.x - animal.position.x, point.y - animal.position.y);
      return span > 57 && span < 73;
    });
    const other = { ...structuredClone(animal), id: 'herd-peer', tile: otherTile, position: tileToWorld(otherTile, 16), route: [] };
    if (other.land) other.land.home = otherTile;
    if (other.bird) other.bird.home = otherTile;
    world.state.wildlife = [animal, other];
    const [nearby] = world.state.villagers;
    world.state.villagers = [nearby];
    nearby.position = { x: animal.position.x + 3, y: animal.position.y };
    const director = enableWildlifeDirector(world, directorOptions({}));
    director.setView({ left: 0, top: 0, right: 1280, bottom: 1024 });
    updateWorld(world, 0.1);
    updateWorld(world, 0.1);
    if (key === 'songbird') {
      assert.notEqual(animal.bird.state, BirdState.GROUNDED);
      assert.equal(other.bird.state, BirdState.GROUNDED);
      runUntil(world, () => other.bird.state !== BirdState.GROUNDED, 1.5);
    } else {
      assert.equal(animal.land.state, LandState.FLEE);
      assert.ok(other.ecology.herdAt > world.state.time.seconds);
      assert.notEqual(other.land.state, LandState.FLEE);
      runUntil(world, () => other.land.state === LandState.FLEE, 1.5);
    }
  }
});

test('a deer stops to look around after a scare before returning to its idle behavior', () => {
  const world = createWorld(assets);
  const deer = world.state.wildlife.find(entity => entity.assetId === 'wildlife_deer');
  const [observer] = world.state.villagers;
  world.state.wildlife = [deer];
  world.state.villagers = [observer];
  observer.position = { x: deer.position.x + 8, y: deer.position.y };
  updateWorld(world, 0.1);
  assert.equal(deer.land.state, LandState.FLEE);
  observer.position = { x: 0, y: 0 };
  runUntil(world, () => deer.land.state === LandState.RECOVER, 5);
  assert.equal(deer.animation, 'alert');
  const stopped = { ...deer.position };
  observer.position = { x: stopped.x + 20, y: stopped.y };
  updateWorld(world, 1);
  assert.equal(deer.land.state, LandState.RECOVER);
  assert.deepEqual(deer.position, stopped);
  runUntil(world, () => deer.land.state === LandState.ALERT, 3);
  assert.deepEqual(deer.position, stopped);
  observer.position = { x: 0, y: 0 };
  runUntil(world, () => deer.land.state === LandState.IDLE_ACTIVITY, 2);
  assert.ok(['graze', 'idle'].includes(deer.animation));
});

test('nearby villagers trigger rabbit flight, deer alert then flight, snake warning, and crab hiding', () => {
  for (const key of ['rabbit', 'deer', 'snake', 'crab']) {
    const world = createWorld(assets);
    const animal = world.state.wildlife.find(entity => entity.assetId === `wildlife_${key}`);
    world.state.wildlife = [animal];
    const observer = world.state.villagers[0];
    world.state.villagers = [observer];
    const approach = distance => { observer.position = { x: animal.position.x + distance, y: animal.position.y }; };
    if (key === 'deer') {
      approach(45);
      updateWorld(world, 0.1);
      assert.equal(animal.land.state, LandState.ALERT);
      assert.equal(animal.animation, 'alert');
      assert.deepEqual(animal.route, []);
    }
    approach(8);
    updateWorld(world, 0.1);
    if (key === 'snake') {
      assert.equal(animal.land.state, LandState.ALERT);
      assert.equal(animal.animation, 'warn');
      runUntil(world, () => animal.land.state === LandState.FLEE, 2);
      assert.equal(animal.animation, 'slither');
    } else if (key === 'crab') {
      assert.equal(animal.land.state, LandState.HIDE);
      assert.equal(animal.animation, 'hide');
    } else {
      assert.equal(animal.land.state, LandState.FLEE);
      assert.equal(animal.animation, key === 'rabbit' ? 'flee' : 'run');
    }
  }
});

test('villagers match step frames to travel, give each other space, and visit village points of interest', () => {
  const world = createWorld(assets);
  const [a, b] = world.state.villagers;
  world.state.villagers = [a, b];
  const size = map.meta.tileSize;
  const west = map.villagerSpawns[1];
  const east = map.villagerSpawns[3];
  for (const [villager, tile] of [[a, west], [b, east]]) {
    villager.tile = tile;
    villager.position = tileToWorld(tile, size);
  }
  assert.ok(moveVillager(world, a, [east]));
  assert.ok(moveVillager(world, b, [west]));
  let clearance = Infinity;
  let stepped = false;
  for (let i = 0; i < 100; i++) {
    const lastDistance = a.ground?.distance || 0;
    updateWorld(world, 0.017);
    const left = groundPosition(a);
    const right = groundPosition(b);
    clearance = Math.min(clearance, Math.hypot(left.x - right.x, left.y - right.y));
    assert.ok(walkable(world.collision, worldToTile(left, size)));
    assert.ok(walkable(world.collision, worldToTile(right, size)));
    if (a.animation === 'walk' && a.ground.distance > lastDistance) {
      assert.ok(Number.isInteger(villagerFrame(a, 4)));
      stepped = true;
    }
  }
  assert.ok(stepped && clearance > 3);
  assert.deepEqual(a.tile, east);
  assert.deepEqual(b.tile, west);
  const settledDistance = a.ground.distance;
  updateWorld(world, 1);
  assert.equal(a.ground.distance, settledDistance);
  startGameplay(world);
  for (const key of ['food', 'wood', 'stone', 'knowledge']) world.resources.add(key, 100);
  runUntil(world, () => world.state.villagers.some(villager => ['sit', 'talk'].includes(villager.animation)), 22);
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
