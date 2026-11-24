import { describeInteraction } from './assets.js';
import { findRoute, neighbors, sameTile, tileToWorld, walkable } from './geometry.js';

export const abilities = [
  ['gather', 'Gathering', 'gather', true], ['chop', 'Woodcutting', 'chop', true],
  ['mine', 'Stone gathering', 'mine', true], ['build', 'Basic construction', 'build', true],
  ['research', 'Research', 'research', true], ['farm', 'Farming', 'farm', false],
  ['fish', 'Fishing', 'fish', false], ['heal', 'Healing', 'heal', false],
  ['hunt', 'Hunting', null, false], ['advanced_construction', 'Advanced construction', 'build', false],
  ['ancient_knowledge', 'Ancient knowledge', 'investigate', false],
].map(([id, name, animation, startsUnlocked]) => ({ id, name, animation, startsUnlocked }));

export const skillDefinitions = abilities
  .filter(ability => ability.animation)
  .map(ability => ({ id: ability.id, name: ability.name, abilityId: ability.id }));

export function createResourceManager(amounts, limits = {}) {
  const listeners = new Set();
  function valid(key, amount) {
    return Object.hasOwn(amounts, key) && Number.isFinite(amount) && amount >= 0;
  }
  function set(key, value) {
    if (amounts[key] !== value) {
      amounts[key] = value;
      listeners.forEach(listener => listener(key, value));
    }
    return value;
  }
  return {
    get: key => amounts[key],
    add: (key, amount) => valid(key, amount) ? set(key, Math.min(limits[key] ?? Infinity, amounts[key] + amount)) : undefined,
    remove: (key, amount) => valid(key, amount) && amount <= amounts[key] ? set(key, amounts[key] - amount) : undefined,
    canAfford: costs => Object.entries(costs).every(([key, value]) => valid(key, value) && amounts[key] >= value),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function habitatMatches(map, animal, tile, habitat) {
  const { x, y } = tile;
  const terrain = map.terrainGrid[y]?.[x];
  const region = map.regionGrid[y]?.[x];
  const water = map.waterBodyGrid[y]?.[x];
  return habitat.terrain.includes(terrain)
    && (!habitat.regions || habitat.regions.includes(region))
    && (!habitat.waterBodies || habitat.waterBodies.includes(water))
    && (animal.movementType !== 'ground' || walkable(map.collisionGrid, tile));
}

export function habitatAllows(map, animal, tile) {
  const { width, height } = animal.collisionFootprint;
  const firstX = tile.x - Math.floor((width - 1) / 2);
  const habitats = Object.values(animal.metadata.habitatMapping);
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (!habitats.some(habitat => habitatMatches(map, animal, { x: firstX + dx, y: tile.y - dy }, habitat))) return false;
    }
  }
  return true;
}

function createWildlife(map, animals) {
  const origin = map.villagerSpawns[0];
  const occupied = [];
  const habitatTiles = new Map();
  const instances = animals.flatMap((animal, index) => {
    const candidates = [];
    map.terrainGrid.forEach((row, y) => row.forEach((_, x) => {
      const tile = { x, y };
      if (habitatAllows(map, animal, tile)) candidates.push(tile);
    }));
    habitatTiles.set(animal.id, candidates);
    const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const score = tile => distance(tile, origin) + occupied.reduce((penalty, other) =>
      penalty + Math.max(0, 7 - distance(tile, other)) * 2, 0);
    const tile = candidates.sort((a, b) => score(a) - score(b))[0];
    if (!tile) return [];
    occupied.push(tile);
    return [{
      id: `animal_${index + 1}`, assetId: animal.id, tile, position: tileToWorld(tile, map.meta.tileSize),
      direction: 'left', animation: animal.idle, route: [], roamIn: 1 + index * 0.31, moves: index,
    }];
  });
  return { instances, habitatTiles };
}

function previewCollectibles(map, collectibles) {
  const zones = new Map(map.collectibleSpawnZones.map(zone => [zone.id, zone]));
  const fromEachCategory = ['seashell', 'mineral', 'artifact', 'butterfly'];
  return fromEachCategory.flatMap(category => {
    const asset = collectibles.find(item => item.category === category && item.spawn.mapZoneIds.some(id => zones.get(id)?.tiles.length));
    if (!asset) return [];
    const zone = asset.spawn.mapZoneIds.map(id => zones.get(id)).find(entry => entry?.tiles.length);
    const [x, y] = zone.tiles[Math.floor(zone.tiles.length / 2)];
    return [{ id: `preview_${asset.id}`, assetId: asset.id, zoneId: zone.id, tile: { x, y }, position: tileToWorld({ x, y }, map.meta.tileSize) }];
  });
}

export function createWorld(assets) {
  const map = assets.terrain.metadata;
  const { tileSize } = map.meta;
  const wildlife = createWildlife(map, assets.animals);
  const startingRoster = [
    ['Luna', 4821, 'adult', 23], ['Kai', 127, 'adult', 26], ['Mira', 719, 'adult', 31],
    ['Tavi', 116, 'child', 9], ['Oren', 806, 'elder', 66],
  ];
  const state = {
    version: 1,
    world: { mapId: assets.terrain.id, populationCapacity: map.villagerSpawns.length },
    resources: { food: 28, wood: 0, stone: 0, knowledge: 0 },
    villagers: map.villagerSpawns.map((tile, index) => {
      const [name, seed, lifeStage, age] = startingRoster[index];
      const { id: _, name: _name, lifeStage: _stage, direction, animation, ...appearance } =
        assets.generateVillager(seed, { stage: lifeStage });
      return {
        id: `villager_${String(index + 1).padStart(3, '0')}`, name, lifeStage, age, appearance,
        position: tileToWorld(tile, tileSize), tile, direction, animation, currentTask: null, route: [],
        preferredJob: null, needs: { hunger: 90, energy: 100, health: 100 }, skills: {}, relationships: {},
      };
    }),
    objects: Object.fromEntries(map.objects.map(object => [object.id, {
      state: object.state, amount: object.resource?.initialAmount ?? null,
    }])),
    buildings: [],
    wildlife: wildlife.instances,
    activeCollectibles: [],
    collectionProgress: Object.fromEntries(assets.collectibles.map(({ id }) => [
      id, { collectibleId: id, discovered: false, discoveryCount: 0, firstDiscoveredAt: null },
    ])),
    abilities: Object.fromEntries(abilities.map(ability => [ability.id, ability.startsUnlocked])),
    achievements: {}, worldFlags: {},
    time: { seconds: 0, minutes: 480, day: 1, speed: 1, paused: false },
    weather: { current: 'clear' },
    settings: { musicVolume: 100 },
  };
  return {
    assets, map, state, resources: createResourceManager(state.resources), collision: map.collisionGrid.map(row => row.slice()),
    habitatTiles: wildlife.habitatTiles,
    objects: new Map([...map.objects, ...map.fishingSpots].map(object => [object.id, object])),
    collectiblePreviews: previewCollectibles(map, assets.collectibles),
  };
}

const mapFacing = { up: 'back', down: 'front', left: 'left', right: 'right' };

export function moveVillager(world, villager, destinations, targetId = null) {
  const { tileSize } = world.map.meta;
  const atCenter = sameTile(villager.position, tileToWorld(villager.tile, tileSize));
  const route = findRoute(world.collision, villager.tile, destinations);
  if (!route) return false;
  villager.route = route.path;
  if (!atCenter && !sameTile(villager.route[0] || {}, villager.previousStep || {})) {
    villager.route.unshift(villager.tile);
  }
  villager.currentTask = { type: targetId ? 'approach' : 'move', targetId, facing: mapFacing[route.target.facing] ?? null };
  if (!route.path.length) finishMove(villager);
  return true;
}

export function approachObject(world, villager, object) {
  const { positions } = describeInteraction(object, world.assets);
  return moveVillager(world, villager, positions || [], object.id);
}

function finishMove(villager) {
  if (villager.currentTask.facing) villager.direction = villager.currentTask.facing;
  villager.currentTask = null;
  villager.animation = 'idle';
}

function advanceEntity(entity, distance, size, onDirection) {
  while (entity.route.length && distance > 0) {
    const tile = entity.route[0];
    const target = tileToWorld(tile, size);
    const dx = target.x - entity.position.x;
    const dy = target.y - entity.position.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining !== 0) onDirection(dx, dy);
    if (distance >= remaining) {
      entity.position = target;
      entity.tile = entity.route.shift();
      distance -= remaining;
    } else {
      entity.position.x += dx / remaining * distance;
      entity.position.y += dy / remaining * distance;
      break;
    }
  }
}

const roamAnimations = {
  songbird: 'fly', seagull: 'fly', fish_fresh: 'swim', fish_coast: 'swim', dolphin: 'swim',
  rabbit: 'hop', deer: 'walk', snake: 'slither', crab: 'walk',
};

function updateWildlife(world, time) {
  for (const entity of world.state.wildlife) {
    const asset = world.assets.registry.get(entity.assetId);
    entity.roamIn -= time;
    if (entity.roamIn <= 0 && !entity.route.length) {
      const adjacent = neighbors.map(offset => ({ x: entity.tile.x + offset.x, y: entity.tile.y + offset.y }));
      const eligible = adjacent.filter(tile => habitatAllows(world.map, asset, tile)
        && (asset.group !== 'fish' || world.map.waterBodyGrid[tile.y][tile.x] === world.map.waterBodyGrid[entity.tile.y][entity.tile.x]));
      if (eligible.length) {
        const tile = eligible[entity.moves++ % eligible.length];
        entity.route.push(tile);
        entity.animation = asset.key === 'turtle'
          ? world.map.waterBodyGrid[tile.y][tile.x] ? 'swim' : 'crawl'
          : roamAnimations[asset.key];
      }
      entity.roamIn = 2 + (entity.moves % 4) * 0.4;
    }
    advanceEntity(entity, 12 * time, world.map.meta.tileSize, (dx, dy) => {
      if (dx) entity.direction = dx < 0 ? 'left' : 'right';
      else if (asset.dirs.includes('front')) entity.direction = dy < 0 ? 'back' : 'front';
    });
    if (!entity.route.length) {
      entity.animation = asset.key === 'turtle' && !world.map.waterBodyGrid[entity.tile.y][entity.tile.x] ? 'rest' : asset.idle;
    }
  }
}

export function updateWorld(world, delta) {
  const { time, villagers } = world.state;
  if (time.paused || delta <= 0) return;
  const elapsed = delta * time.speed;
  time.seconds += elapsed;
  time.minutes += elapsed * 5;
  if (time.minutes >= 1440) {
    time.day += Math.floor(time.minutes / 1440);
    time.minutes %= 1440;
  }
  for (const villager of villagers) {
    if (world.heldVillager === villager.id) continue;
    if (!villager.route.length) continue;
    villager.animation = villager.lifeStage === 'baby' ? 'crawl' : 'walk';
    advanceEntity(villager, elapsed * 44, world.map.meta.tileSize, (dx, dy) => {
      villager.direction = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
    });
    villager.previousStep = villager.route[0] || null;
    if (!villager.route.length) finishMove(villager);
  }
  world.gameplay?.advance(elapsed);
  updateWildlife(world, elapsed);
}

export function previewPlacement(world, definition, origin) {
  const asset = definition?.states.ghost;
  if (!asset) return null;
  const { width, height } = asset.footprint;
  const zone = world.map.buildingZones.find(entry => entry.allowedBuildingTypes.includes(definition.type));
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) tiles.push({ x: origin.x + x, y: origin.y + y });
  }
  const allowed = Boolean(zone) && tiles.every(tile => {
    if (world.state.buildings.some(building => {
      const footprint = world.assets.registry.get(`building:${building.type}_${building.state}`).footprint;
      return tile.x >= building.tile.x && tile.y >= building.tile.y
        && tile.x < building.tile.x + footprint.width && tile.y < building.tile.y + footprint.height;
    })) return false;
    const local = [tile.x - origin.x, tile.y - origin.y];
    if (asset.metadata.requiredWaterTiles?.some(([x, y]) => x === local[0] && y === local[1])) {
      return Boolean(world.map.waterBodyGrid[tile.y]?.[tile.x])
        && !world.map.objects.some(object => object.blocksBuilding && tile.x >= object.tile.x
          && tile.x < object.tile.x + object.footprint.width && tile.y <= object.tile.y
          && tile.y > object.tile.y - object.footprint.height);
    }
    return walkable(world.collision, tile) && zone.tiles.some(([x, y]) => sameTile(tile, { x, y }))
      && (!asset.placement.terrain || asset.placement.terrain.includes(world.map.terrainGrid[tile.y][tile.x]));
  });
  return { asset, origin, tiles, allowed };
}
