import { BirdState } from './birds.js';
import { emitWaterParticles, FishState, waterAt } from './fish.js';
import { emitGroundDust, gaitPhase, groundContact, groundPosition, recordGroundTravel } from './ground.js';
import { LandState, landWildlifeTuning } from './land-wildlife.js';
import { neighbors, tileToWorld, worldToTile } from './geometry.js';
import { TurtleState } from './turtle.js';

export const wildlifeTuning = {
  spawnDistance: [26, 160], despawnDistance: 230, turnOverEvery: 0.8, offscreenGrace: 0.55,
  populationCap: 29, groupAlertRadius: 82, groupAlertDelay: [0.16, 0.72], startleRadius: 32, schoolSize: 4,
  species: {
    songbird: { cap: 4, zones: { forest: 3, grassland: 3 }, lifetime: [27, 46], kind: 'bird' },
    seagull: { cap: 3, zones: { coast: 3, ocean: 3 }, lifetime: [35, 54], kind: 'bird' },
    fish_fresh: { cap: 5, zones: { freshwater: 5 }, school: true, lifetime: [30, 51], kind: 'fish' },
    fish_coast: { cap: 5, zones: { ocean: 5 }, school: true, lifetime: [29, 51], kind: 'fish' },
    rabbit: { cap: 4, zones: { forest: 3, grassland: 3 }, lifetime: [26, 43], kind: 'cover' },
    snake: { cap: 2, zones: { forest: 2, grassland: 2 }, lifetime: [34, 57], kind: 'cover' },
    deer: { cap: 4, zones: { forest: 4, grassland: 2 }, lifetime: [38, 61], kind: 'deer' },
    crab: { cap: 4, zones: { coast: 4 }, lifetime: [22, 39], kind: 'sand' },
    turtle: { cap: 2, zones: { ocean: 2, coast: 2 }, lifetime: [55, 82], kind: 'turtle' },
    dolphin: { cap: 1, zones: { ocean: 1 }, lifetime: [52, 74], kind: 'marine' },
  },
};

export const wildlifePropTags = {
  tree: ['canopy', 'perch', 'cover'], palm_tree: ['canopy', 'perch', 'cover'],
  bush: ['cover', 'forage'], berry_bush: ['cover', 'forage'], tall_grass: ['cover', 'forage'],
  flower: ['forage'], harvestable_rock: ['perch', 'cover'], large_rock: ['perch', 'cover'],
  driftwood: ['perch'], fence_post: ['perch'],
  reeds: ['water_cover'], water_lily: ['water_cover'], seaweed: ['water_cover'], coral: ['water_cover'],
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const opacityCurve = t => t * t * (3 - 2 * t);

export function cameraWorldRect(camera, width, height) {
  const { x, y, zoom } = camera;
  return { left: -x / zoom, top: -y / zoom, right: (width - x) / zoom, bottom: (height - y) / zoom };
}

export function rangeFromView(point, rect) {
  return Math.hypot(Math.max(rect.left - point.x, point.x - rect.right, 0),
    Math.max(rect.top - point.y, point.y - rect.bottom, 0));
}

export function wildlifeZone(map, tile) {
  const water = map.waterBodyGrid[tile.y]?.[tile.x];
  if (water) return water === 'ocean_001' ? 'ocean' : 'freshwater';
  const terrain = map.terrainGrid[tile.y]?.[tile.x];
  if (terrain === 'sand') return 'coast';
  if (map.regionGrid[tile.y]?.[tile.x] === 'forest') return 'forest';
  return 'grassland';
}

export function wildlifeOpacity(entity) {
  return entity.ecology?.opacity ?? 1;
}

export function createWildlifeDirector(world, hooks, options = {}) {
  const config = { ...wildlifeTuning, ...options, species: { ...wildlifeTuning.species, ...options.species } };
  const { state, map, assets, habitatTiles } = world;
  const size = map.meta.tileSize;
  const props = { canopy: [], cover: [], forage: [], perch: [], water_cover: [] };
  for (const object of map.objects) {
    for (const tag of new Set([...(wildlifePropTags[object.type] || []), ...(object.wildlifeTags || [])])) {
      props[tag]?.push(object);
    }
  }
  const tiles = new Map(assets.animals.map(asset => [asset.id, habitatTiles.get(asset.id).map(tile => ({
    tile, position: tileToWorld(tile, size), zone: wildlifeZone(map, tile),
  }))]));
  const marineTiles = [];
  map.terrainGrid.forEach((row, y) => row.forEach((terrain, x) => {
    if (terrain === 'deep_water' && map.waterBodyGrid[y][x] === 'ocean_001') {
      const tile = { x, y };
      marineTiles.push({ tile, position: tileToWorld(tile, size), zone: 'ocean' });
    }
  }));
  const shallows = tiles.get('wildlife_turtle').filter(entry => map.terrainGrid[entry.tile.y][entry.tile.x] === 'shallow_water');
  const turtleEntrances = marineTiles.filter(entry => shallows.some(shore => distance(entry.position, shore.position) <= 110));
  let view;
  let clock = state.time.seconds;
  let nextPass = 0;
  let nextSchool = 0;
  let serial = 0;

  function random() {
    serial++;
    return ((Math.imul(serial + Math.floor(state.time.seconds * 100), 1597334677) >>> 0) / 4294967296);
  }

  function adopt(entity) {
    const asset = assets.registry.get(entity.assetId);
    const rule = config.species[asset.key];
    if (!rule) return null;
    entity.ecology ??= {
      age: 0, lifetime: rule.lifetime[0] + random() * (rule.lifetime[1] - rule.lifetime[0]),
      zone: wildlifeZone(map, worldToTile(entity.position, size)), opacity: 1, unseen: 0,
      perchIn: clock + 8 + random() * 8,
    };
    return { entity, asset, rule, ecology: entity.ecology };
  }

  function canUse(asset, tile, origin, transit = false) {
    const aquatic = transit && asset.key === 'turtle';
    if (!hooks.canTravel(asset, tile, aquatic)) return false;
    if (origin && config.species[asset.key].kind === 'fish') {
      return waterAt(map, tileToWorld(tile, size)) === waterAt(map, origin);
    }
    return true;
  }

  function routeTo(actor, goals, transit = false) {
    if (!goals.length) return null;
    const { asset, entity } = actor;
    const point = worldToTile(entity.position, size);
    const id = tile => tile.y * map.meta.width + tile.x;
    const validGoals = new Map(goals.filter(goal => canUse(asset, goal, entity.position, transit)).map(tile => [id(tile), tile]));
    if (!validGoals.size) return null;
    const queue = [{ tile: point, previous: null }];
    const visited = new Set([id(point)]);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      if (validGoals.has(id(node.tile))) {
        const route = [];
        for (let cursor = node; cursor.previous; cursor = cursor.previous) route.push(cursor.tile);
        return route.reverse();
      }
      for (const offset of neighbors) {
        const neighbor = { x: node.tile.x + offset.x, y: node.tile.y + offset.y };
        if (visited.has(id(neighbor)) || !canUse(asset, neighbor, entity.position, transit)) continue;
        visited.add(id(neighbor));
        queue.push({ tile: neighbor, previous: node });
      }
    }
    return null;
  }

  function setRoute(actor, route) {
    const { entity } = actor;
    entity.tile = worldToTile(entity.position, size);
    entity.route = route;
  }

  function tileNearProp(asset, prop) {
    const origin = worldToTile(prop.anchor, size);
    const candidates = [prop.tile, origin, ...neighbors.flatMap(({ x, y }) => [
      { x: origin.x + x, y: origin.y + y }, { x: origin.x + x * 2, y: origin.y + y * 2 },
    ])];
    return candidates.find(tile => config.species[asset.key].kind === 'bird'
      ? hooks.canLand(asset, tile) : canUse(asset, tile));
  }

  function sourceAtProp(asset, tag, from) {
    return props[tag].filter(prop => activeProp(prop) && distance(prop.anchor, from) <= 115)
      .sort((a, b) => distance(a.anchor, from) - distance(b.anchor, from))
      .map(prop => ({ prop, tile: tileNearProp(asset, prop) }))
      .filter(source => source.tile);
  }

  function activeProp(prop) {
    return !['stump', 'sapling', 'empty'].includes(state.objects[prop.id]?.state);
  }

  function rustle(prop, position) {
    if (!prop?.canopy && !['bush', 'berry_bush', 'tall_grass'].includes(prop?.type)) {
      emitGroundDust(world, position, 0, 0, 3);
      return;
    }
    for (const [index, dx] of [-11, -6, 8, 13].entries()) {
      world.groundParticles.push({
        x: prop.anchor.x + dx, y: prop.anchor.y - (prop.canopy ? 22 : 7),
        groundY: prop.anchor.y + 1, vx: dx * 0.7, vy: -3 + index * 3,
        color: index % 2 ? '#b9c482' : '#779757', age: 0, life: 0.55,
      });
    }
    if (world.groundParticles.length > 60) world.groundParticles.splice(0, world.groundParticles.length - 60);
  }

  function occupied(entry, asset) {
    return state.wildlife.some(entity => entity.assetId === asset.id && distance(entity.position, entry.position) < 19);
  }

  function capAllows(asset, zone) {
    const rule = config.species[asset.key];
    const matching = state.wildlife.filter(entity => entity.assetId === asset.id);
    return state.wildlife.length < config.populationCap && matching.length < rule.cap
      && matching.filter(entity => entity.ecology?.zone === zone).length < (rule.zones?.[zone] ?? rule.cap);
  }

  function padded(asset) {
    return Math.max(asset.width / 2, asset.height) + (config.species[asset.key].kind === 'bird' ? 42 : 4);
  }

  function offscreen(entry, asset, margin) {
    return rangeFromView(entry.position, view) > padded(asset) + margin;
  }

  function usableEntries(asset, entries, condition, transit = false) {
    return entries.filter(entry => condition(entry) && !occupied(entry, asset) && canUse(asset, entry.tile, null, transit))
      .sort((a, b) => rangeFromView(a.position, view) - rangeFromView(b.position, view));
  }

  function nearViewEntries(asset, from, max = 140) {
    return tiles.get(asset.id).filter(entry => rangeFromView(entry.position, view) < 18
      && distance(entry.position, from) < max).sort((a, b) => distance(a.position, from) - distance(b.position, from)).slice(0, 14);
  }

  function startMotion(actor, kind, route = [], prop) {
    setRoute(actor, route);
    actor.ecology.motion = { kind, age: 0, propId: prop?.id, fading: false,
      endpoint: route.length ? tileToWorld(route.at(-1), size) : { ...actor.entity.position } };
  }

  function chooseEntrance(asset, rule) {
    const entries = rule.kind === 'turtle' ? turtleEntrances : tiles.get(asset.id);
    const [minimum, maximum] = config.spawnDistance;
    const outside = usableEntries(asset, entries, entry => {
      const range = rangeFromView(entry.position, view);
      return offscreen(entry, asset, minimum) && range <= maximum + padded(asset)
        && (rule.kind !== 'deer' || entry.zone === 'forest')
        && (rule.kind !== 'fish' || map.terrainGrid[entry.tile.y][entry.tile.x] === 'deep_water')
        && capAllows(asset, entry.zone);
    }, rule.kind === 'turtle');
    if (outside.length) return { entries: outside.slice(0, 14), offscreen: true };
    if (rule.kind === 'bird' || rule.kind === 'cover') {
      const tag = rule.kind === 'bird' ? 'canopy' : 'cover';
      const entries = props[tag].filter(prop => activeProp(prop) && rangeFromView(prop.anchor, view) < 12
        && (rule.kind !== 'bird' || state.villagers.some(v => v.id !== world.heldVillager && distance(groundPosition(v), prop.anchor) < config.groupAlertRadius * 0.62)))
        .map(prop => ({ prop, tile: tileNearProp(asset, prop) })).filter(entry => entry.tile)
        .map(entry => ({ ...entry, position: tileToWorld(entry.tile, size), zone: wildlifeZone(map, entry.tile) }))
        .filter(entry => !occupied(entry, asset) && capAllows(asset, entry.zone));
      if (entries.length) return { entries, offscreen: false };
    }
    if (rule.kind === 'fish') {
      const sheltered = props.water_cover.filter(prop => activeProp(prop) && rangeFromView(prop.anchor, view) < 12)
        .map(prop => ({ prop, tile: tileNearProp(asset, prop) })).filter(entry => entry.tile)
        .map(entry => ({ ...entry, position: tileToWorld(entry.tile, size), zone: wildlifeZone(map, entry.tile) }))
        .filter(entry => !occupied(entry, asset) && capAllows(asset, entry.zone));
      const nearby = usableEntries(asset, entries, entry => rangeFromView(entry.position, view) < 15
        && map.terrainGrid[entry.tile.y][entry.tile.x] === 'deep_water' && capAllows(asset, entry.zone));
      return { entries: nearby.length ? nearby.slice(0, 20) : sheltered, offscreen: false };
    }
    if (rule.kind === 'sand' || rule.kind === 'turtle') {
      const nearby = usableEntries(asset, entries, entry => rangeFromView(entry.position, view) < 15
        && capAllows(asset, entry.zone), rule.kind === 'turtle');
      return { entries: nearby.slice(0, 20), offscreen: false };
    }
    return { entries: [], offscreen: false };
  }

  function makeEntity(asset, entry) {
    let id;
    do { id = `wildlife_visit_${++serial}`; } while (state.wildlife.some(existing => existing.id === id));
    return { id, assetId: asset.id, tile: entry.tile, position: { ...entry.position }, direction: 'left',
      animation: asset.idle, route: [], moves: serial };
  }

  function addAnimal(asset, rule) {
    const { entries, offscreen: outside } = chooseEntrance(asset, rule);
    if (!entries.length) return false;
    const start = Math.floor(random() * entries.length);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[(start + i) % entries.length];
      const entity = makeEntity(asset, entry);
      const actor = adopt(entity);
      actor.ecology.zone = entry.zone;
      const approach = nearViewEntries(asset, entry.position, 195).filter(goal =>
        rule.kind !== 'turtle' || map.terrainGrid[goal.tile.y][goal.tile.x] === 'shallow_water');
      const route = rule.kind === 'bird' ? [] : routeTo(actor, approach.map(goal => goal.tile), rule.kind === 'turtle');
      if (rule.kind === 'turtle' && !route?.length) continue;
      if (outside && rule.kind === 'deer' && !route?.length) continue;
      hooks.initialize(entity, asset, rule.kind === 'turtle');
      if (rule.kind === 'bird') {
        const target = approach.find(goal => hooks.canLand(asset, goal.tile));
        const landing = target?.tile || entry.tile;
        if (entity.bird) {
          entity.position = { ...entry.position };
          entity.tile = entry.tile;
          entity.bird.state = BirdState.FLYING;
          entity.bird.target = landing;
          entity.bird.altitude = outside ? 28 : 21;
          entity.bird.age = 0;
          entity.animation = 'fly';
        }
      }
      startMotion(actor, rule.kind === 'sand' ? 'unbury' : 'arrive', route || [], entry.prop);
      actor.ecology.opacity = outside && !['fish', 'turtle', 'sand'].includes(rule.kind) ? 1 : 0;
      if (entry.prop || rule.kind === 'sand') rustle(entry.prop, entry.position);
      state.wildlife.push(entity);
      return true;
    }
    return false;
  }

  function leave(actor) {
    const { entity, asset, rule } = actor;
    if (rule.kind === 'sand') {
      startMotion(actor, 'bury');
      emitGroundDust(world, entity.position, 0, 0, 3);
      return true;
    }
    if (rule.kind === 'bird' || rule.kind === 'cover') {
      const tag = rule.kind === 'bird' ? 'canopy' : 'cover';
      const candidates = sourceAtProp(asset, tag, entity.position);
      for (const source of candidates.slice(0, 5)) {
        const route = rule.kind === 'bird' ? [source.tile] : routeTo(actor, [source.tile]);
        if (!route) continue;
        startMotion(actor, 'cover', route, source.prop);
        return true;
      }
    }
    if (rule.kind === 'fish' || rule.kind === 'turtle' || rule.kind === 'marine') {
      const candidates = (rule.kind === 'turtle' ? marineTiles : tiles.get(asset.id))
        .filter(entry => map.terrainGrid[entry.tile.y][entry.tile.x] === 'deep_water' && distance(entry.position, entity.position) < 125)
        .sort((a, b) => distance(a.position, entity.position) - distance(b.position, entity.position));
      const route = routeTo(actor, candidates.slice(0, 16).map(entry => entry.tile), rule.kind === 'turtle');
      if (route) {
        startMotion(actor, 'dive', route);
        return true;
      }
      if (rule.kind === 'fish') {
        for (const source of sourceAtProp(asset, 'water_cover', entity.position).slice(0, 5)) {
          const sheltered = routeTo(actor, [source.tile]);
          if (!sheltered) continue;
          startMotion(actor, 'dive', sheltered, source.prop);
          return true;
        }
      }
    }
    const entries = tiles.get(asset.id).filter(entry => offscreen(entry, asset, config.despawnDistance)
      && (rule.kind !== 'deer' || entry.zone === 'forest'))
      .sort((a, b) => distance(a.position, entity.position) - distance(b.position, entity.position));
    const route = rule.kind === 'bird' && entries.length ? [entries[0].tile] : routeTo(actor, entries.slice(0, 55).map(entry => entry.tile));
    if (route?.length) {
      startMotion(actor, 'depart', route);
      return true;
    }
    return false;
  }

  function stepVisual(actor, elapsed) {
    const { entity, asset, rule, ecology } = actor;
    const motion = ecology.motion;
    if (!motion) return false;
    motion.age += elapsed;
    if (motion.kind === 'arrive' && rule.kind === 'bird') {
      ecology.opacity = Math.max(ecology.opacity, opacityCurve(clamp(motion.age / 0.65, 0, 1)));
      if (motion.age > 0.7) delete ecology.motion;
      return false;
    }
    if (['bury', 'unbury'].includes(motion.kind)) {
      const entering = motion.kind === 'unbury';
      const phase = clamp(motion.age / 0.72, 0, 1);
      ecology.opacity = entering ? phase : 1 - phase;
      ecology.sink = Math.round((entering ? 1 - phase : phase) * 4);
      entity.animation = 'hide';
      entity.land.frame = Number(entering ? phase < 0.45 : phase > 0.45);
      if (phase === 1) {
        delete ecology.sink;
        delete ecology.motion;
        if (!entering) ecology.remove = true;
        else if (entity.route.length) startMotion(actor, 'arrive', entity.route);
      }
      return true;
    }
    const wasMoving = entity.route.length > 0;
    const before = { ...entity.position };
    const bird = rule.kind === 'bird';
    const swimmer = rule.kind === 'fish' || rule.kind === 'marine' || rule.kind === 'turtle';
    const water = waterAt(map, entity.position);
    if (wasMoving && !bird && !canUse(asset, entity.route[0], entity.position, rule.kind === 'turtle')) entity.route = [];
    const speed = bird ? 55 : rule.kind === 'deer' && motion.kind === 'depart' ? 57 : swimmer ? (water ? 26 : 14) : 22;
    const gait = landWildlifeTuning[asset.key]?.hop;
    const stride = gait && motion.age % (gait[0] + gait[1]) >= gait[0] ? 0 : speed * elapsed;
    hooks.advance(entity, stride, size, dx => {
      if (Math.abs(dx) > 0.5) entity.direction = dx > 0 ? 'right' : 'left';
    });
    const depth = clamp(motion.age / 1.05, 0, 1);
    if (bird && entity.bird) {
      entity.bird.state = BirdState.FLYING;
      const targetAltitude = motion.kind === 'depart' ? 24 + Math.min(16, motion.age * 6)
        : motion.kind === 'perch' && !entity.route.length ? (motion.height ?? 18) : 24;
      entity.bird.altitude += (targetAltitude - entity.bird.altitude) * (1 - Math.exp(-7 * elapsed));
      entity.bird.animTime = motion.age;
      entity.bird.animationFrame = null;
      if (!entity.route.length && motion.kind === 'perch') {
        entity.animation = asset.animations.perch ? 'perch' : 'stand';
        motion.restFor = (motion.restFor ?? 2.5) - elapsed;
        if (motion.restFor <= 0) {
          entity.bird.state = BirdState.GROUNDED;
          entity.bird.age = asset.key === 'songbird' ? 3 : 4;
          entity.bird.target = null;
          ecology.perchIn = clock + 12;
          delete ecology.motion;
        }
        return true;
      }
      entity.animation = 'fly';
    } else if (swimmer) {
      const tileWater = waterAt(map, entity.position);
      if (entity.fish) {
        entity.fish.state = FishState.UNDERWATER;
        entity.fish.depth = motion.kind === 'dive' ? 6 + depth * 5 : 5 + (1 - depth) * 4;
        entity.fish.frame = Math.floor(motion.age * 8) % 4;
      }
      if (entity.turtle) {
        entity.turtle.state = tileWater ? TurtleState.WATER_SWIM : TurtleState.LAND_CRAWL;
        entity.turtle.blend = tileWater ? 1 : 0;
        entity.turtle.depth = motion.kind === 'dive' ? 3.5 + depth * 2 : 3 + (1 - depth) * 2;
        entity.turtle.frame = Math.floor(motion.age * (tileWater ? 6 : 5)) % (tileWater ? 4 : 5);
        if (Boolean(water) !== Boolean(tileWater)) {
          const edge = tileWater ? entity.position : before;
          world.shoreRipples.push({ ...edge, age: 0, life: 0.63 });
          emitWaterParticles(world, { position: edge, water: 'ocean_001', depth: 0, heading: 0 }, 'splash', 5, random);
        }
      }
      if (entity.dolphin) entity.dolphin.frame = Math.floor(motion.age * 8) % 4;
      entity.animation = tileWater ? 'swim' : 'crawl';
    } else if (entity.land) {
      const profile = landWildlifeTuning[asset.key];
      entity.animation = motion.kind === 'depart' ? profile.flee : profile.move;
      recordGroundTravel(world, entity, before, elapsed);
      entity.land.frame = Math.floor(gaitPhase(entity, profile.stride) * asset.animations[entity.animation].frameCount);
    }
    if (motion.kind === 'arrive') {
      ecology.opacity = Math.max(ecology.opacity, opacityCurve(depth));
      if (!entity.route.length && depth === 1) {
        delete ecology.motion;
        if (entity.land) entity.land.home = worldToTile(entity.position, size);
        if (entity.fish) entity.fish.home = worldToTile(entity.position, size);
        if (entity.turtle) entity.turtle.home = worldToTile(entity.position, size);
        if (entity.dolphin) entity.dolphin.home = worldToTile(entity.position, size);
      }
    } else if (!entity.route.length && motion.kind !== 'depart') {
      if (distance(entity.position, motion.endpoint) > 5) {
        ecology.retryLeave = clock + 4;
        delete ecology.motion;
        return true;
      }
      if (!motion.fading) {
        motion.fading = true;
        motion.fadeAge = 0;
        if (motion.kind === 'cover') rustle(world.objects.get(motion.propId), entity.position);
      }
      motion.fadeAge = (motion.fadeAge ?? 0) + elapsed;
      ecology.opacity = 1 - opacityCurve(clamp(motion.fadeAge / 0.9, 0, 1));
      if (ecology.opacity <= 0) ecology.remove = true;
    } else if (!entity.route.length && motion.kind === 'depart') {
      if (offscreen({ position: entity.position }, asset, config.despawnDistance)) ecology.remove = true;
      else {
        delete ecology.motion;
        if (bird && entity.bird) {
          entity.bird.state = BirdState.GROUNDED;
          entity.bird.age = 3;
          entity.bird.target = null;
        }
      }
    }
    return true;
  }

  function tryPerch(actor) {
    const { entity, asset, ecology, rule } = actor;
    if (rule.kind !== 'bird' || !entity.bird || clock < ecology.perchIn || ecology.motion) return;
    if (ecology.flockAt !== undefined || clock < (ecology.alarmedUntil ?? 0)) return;
    ecology.perchIn = clock + 12;
    const source = sourceAtProp(asset, 'perch', entity.position).find(entry => distance(entry.prop.anchor, entity.position) < 80);
    if (!source) return;
    startMotion(actor, 'perch', [source.tile], source.prop);
    ecology.motion.height = source.prop.canopy ? 22 : 6;
  }

  function canStartleBird({ entity, ecology }) {
    return entity.bird && (ecology.motion ? ecology.motion.kind === 'perch' : entity.bird.state === BirdState.GROUNDED);
  }

  function startleBird({ entity, ecology }) {
    if (!canStartleBird({ entity, ecology })) return;
    if (ecology.motion) {
      rustle(world.objects.get(ecology.motion.propId), entity.position);
      delete ecology.motion;
      entity.bird.state = BirdState.GROUNDED;
      entity.route = [];
    }
    entity.bird.age = Math.max(4, entity.bird.age);
    ecology.alarmedUntil = clock + 5;
    emitGroundDust(world, entity.position, 0, 0, 3);
  }

  function alarmGroup(group) {
    const [first, last] = config.groupAlertDelay;
    for (const actor of group) {
      const { entity, ecology, asset, rule } = actor;
      const peers = () => group.filter(other => other !== actor && other.asset.id === asset.id
        && distance(entity.position, other.entity.position) <= config.groupAlertRadius);
      const reactAt = other => clock + first + (last - first) *
        clamp(distance(entity.position, other.entity.position) / Math.max(1, config.groupAlertRadius), 0, 1);
      if (rule.kind === 'bird') {
        if (ecology.flockAt !== undefined && clock >= ecology.flockAt) {
          delete ecology.flockAt;
          startleBird(actor);
        }
        if (!canStartleBird(actor) || clock < (ecology.alarmedUntil ?? 0)) continue;
        const nearby = state.villagers.some(v => v.id !== world.heldVillager
          && distance(groundPosition(v), entity.position) < config.startleRadius);
        if (!nearby) continue;
        delete ecology.flockAt;
        startleBird(actor);
        for (const other of peers()) {
          if (canStartleBird(other) && other.ecology.flockAt === undefined && clock >= (other.ecology.alarmedUntil ?? 0)) {
            other.ecology.flockAt = reactAt(other);
          }
        }
      }
      if (rule.kind === 'deer') {
        const fleeing = entity.land?.state === LandState.FLEE;
        if (fleeing && !ecology.wasFleeing && clock >= Math.max(ecology.herdUntil ?? 0, ecology.alarmedUntil ?? 0)) {
          ecology.alarmedUntil = clock + 5;
          for (const other of peers()) {
            if (other.ecology.motion || [LandState.FLEE, LandState.RECOVER].includes(other.entity.land?.state)
              || clock < Math.max(other.ecology.herdUntil ?? 0, other.ecology.alarmedUntil ?? 0)) continue;
            other.ecology.herdThreat = { ...(entity.land.threat || entity.position) };
            other.ecology.herdAt = reactAt(other);
            other.ecology.herdUntil = other.ecology.herdAt + 1.25;
            other.ecology.alarmedUntil = other.ecology.herdAt + 5;
          }
        }
        ecology.wasFleeing = fleeing;
      }
    }
  }

  function updateSchools(group) {
    const schools = new Map();
    const schoolSize = clamp(Math.round(config.schoolSize), 3, 5);
    for (const actor of group.filter(item => item.rule.school && item.entity.fish && !item.ecology.motion)) {
      const k = `${actor.asset.id}:${actor.entity.fish.water}`;
      if (!schools.has(k)) schools.set(k, []);
      schools.get(k).push(actor);
    }
    for (const school of schools.values()) {
      for (let index = 0; index < school.length; index += schoolSize) {
        const members = school.slice(index, index + schoolSize);
        const leader = members[0].entity;
        delete members[0].ecology.schoolGoal;
        if (members.length < 3) {
          members.forEach(member => { delete member.ecology.schoolGoal; });
          continue;
        }
        const focus = leader.fish.goal || leader.position;
        for (const [slot, member] of members.slice(1).entries()) {
          const angle = slot * Math.PI * 2 / (members.length - 1) + clock * 0.3;
          const point = { x: focus.x + Math.cos(angle) * 13, y: focus.y + Math.sin(angle) * 13 };
          const target = waterAt(map, point) === member.entity.fish.water ? point : focus;
          member.ecology.schoolGoal = { ...target };
        }
      }
    }
  }

  function localInteractions(group) {
    const freshSplashes = world.fishParticles.filter(p => p.kind === 'splash' && p.age < 0.22);
    for (const { entity, ecology, rule, asset } of group) {
      if (ecology.motion) continue;
      if (rule.kind === 'fish' && entity.fish?.state === FishState.UNDERWATER && clock > (ecology.scatterUntil || 0)) {
        const splash = freshSplashes.find(p => p.water === entity.fish.water
          && distance(p, entity.position) > 4 && distance(p, entity.position) < 51);
        if (splash) {
          ecology.scatterFrom = { x: splash.x, y: splash.y };
          ecology.scatterUntil = clock + 1.6;
          entity.fish.goal = null;
          entity.fish.rest = 0;
          entity.fish.dash = 1;
        }
      }
      if (rule.kind === 'deer' || asset.key === 'rabbit') {
        ecology.forage = props.forage.some(prop => activeProp(prop) && distance(prop.anchor, entity.position) < 29);
      }
      if (rule.kind === 'sand' && clock > (ecology.waveUntil || 3)) {
        const tile = worldToTile(entity.position, size);
        const wave = neighbors.map(({ x, y }) => tileToWorld({ x: tile.x + x, y: tile.y + y }, size))
          .find(point => waterAt(map, point) === 'ocean_001');
        ecology.waveUntil = clock + 6 + random() * 5;
        if (wave) {
          ecology.wave = wave;
          ecology.waveStart = clock;
        }
      }
    }
  }

  function update(elapsed) {
    if (!view || elapsed <= 0) return;
    clock += elapsed;
    const group = state.wildlife.map(adopt).filter(Boolean);
    for (const actor of group) {
      const { entity, ecology, asset } = actor;
      ecology.age += elapsed;
      if (offscreen({ position: entity.position }, asset, config.despawnDistance)) ecology.unseen += elapsed;
      else ecology.unseen = 0;
      if (ecology.unseen >= config.offscreenGrace) ecology.remove = true;
      const naturalExit = (actor.rule.kind === 'cover' && entity.land?.state === LandState.FLEE
        || actor.rule.kind === 'sand' && entity.land?.state === LandState.HIDE) && ecology.age > ecology.lifetime * 0.6;
      if ((ecology.age >= ecology.lifetime || naturalExit) && !ecology.motion && !ecology.remove && clock >= (ecology.retryLeave || 0)) {
        if (!leave(actor)) ecology.retryLeave = clock + 4;
      }
    }
    const hasRemoval = group.some(actor => actor.ecology.remove);
    if (hasRemoval) state.wildlife = state.wildlife.filter(entity => !entity.ecology?.remove);
    const remaining = hasRemoval ? group.filter(actor => !actor.ecology.remove) : group;
    alarmGroup(remaining);
    localInteractions(remaining);
    if (clock >= nextSchool) {
      updateSchools(remaining);
      nextSchool = clock + 0.55;
    }
    if (clock < nextPass) return;
    nextPass = clock + config.turnOverEvery;
    for (const actor of remaining) tryPerch(actor);
    const ordered = assets.animals.filter(asset => config.species[asset.key]);
    const offset = Math.floor(random() * ordered.length);
    for (let i = 0; i < ordered.length; i++) {
      const asset = ordered[(i + offset) % ordered.length];
      if (state.wildlife.filter(entity => entity.assetId === asset.id).length >= config.species[asset.key].cap) continue;
      if (addAnimal(asset, config.species[asset.key])) break;
    }
  }

  return {
    setView(rect) { view = rect; },
    update,
    step(entity, asset, elapsed) {
      const rule = config.species[asset.key];
      if (!view || !rule || !entity.ecology?.motion) return false;
      return stepVisual({ entity, asset, rule, ecology: entity.ecology }, elapsed);
    },
  };
}
