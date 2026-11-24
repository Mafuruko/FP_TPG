import { emitWaterParticles, waterAt } from './fish.js';
import { neighbors, tileToWorld, worldToTile } from './geometry.js';
import { groundContact, groundPosition, recordGroundTravel } from './ground.js';

export const TurtleState = Object.freeze({ LAND_CRAWL: 'LAND_CRAWL', WATER_SWIM: 'WATER_SWIM' });

export const turtleTuning = {
  wanderRadius: 7, crawlSpeed: 17, retreatSpeed: 24, pushTime: 0.48, resetTime: 0.28, idleTime: [0.7, 1.6],
  swimThrust: 15, swimDrag: 1.65, swimSpeed: 35, bankResponse: 5, maxBank: 9,
  shoreInterval: [5, 9], shorelineFadeTime: 0.37, alertRadius: 26, tuckTime: 0.7,
  buoyancyBob: 1.6, waterTint: '#367f90', bubbleInterval: 1.8,
};

const ocean = 'ocean_001';
const limit = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const eased = value => value * value * (3 - 2 * value);

function random(turtle) {
  turtle.seed = (Math.imul(turtle.seed, 1664525) + 1013904223) >>> 0;
  return turtle.seed / 4294967296;
}

function between(turtle, [min, max]) {
  return min + random(turtle) * (max - min);
}

export function initializeTurtle(world, entity, canTravel) {
  if (entity.turtle) return true;
  const { tileSize } = world.map.meta;
  let tile = worldToTile(entity.position, tileSize);
  if (!canTravel(tile)) {
    const valid = world.habitatTiles.get(entity.assetId).filter(canTravel);
    if (!valid.length) return false;
    tile = valid.reduce((best, candidate) => distance(candidate, tile) < distance(best, tile) ? candidate : best);
    entity.position = tileToWorld(tile, tileSize);
  }
  const wet = waterAt(world.map, entity.position) === ocean;
  entity.tile = tile;
  entity.route = [];
  entity.animation = wet ? 'float' : 'rest';
  entity.turtle = {
    state: wet ? TurtleState.WATER_SWIM : TurtleState.LAND_CRAWL, home: tile, seed: 1973 + entity.moves * 341,
    age: 0, frame: 0, phase: 0, speed: 0, bank: 0, blend: wet ? 1 : 0, depth: wet ? 2 : 0,
    crossing: false, idleFor: 0.6, crossIn: wet ? 5 : 3.5, bubbleIn: 0.9,
    tuck: 0, alertCooldown: 0, retreat: false,
  };
  groundContact(entity);
  return true;
}

function oceanTile(world, tile) {
  return world.map.waterBodyGrid[tile.y]?.[tile.x] === ocean;
}

function chooseRoute(world, entity, canTravel, crossing) {
  const { turtle } = entity;
  const { width, tileSize } = world.map.meta;
  const origin = worldToTile(entity.position, tileSize);
  const swimming = turtle.state === TurtleState.WATER_SWIM;
  const key = tile => tile.y * width + tile.x;
  const seen = new Set([key(origin)]);
  const queue = [{ tile: origin, prior: null, steps: 0 }];
  let best;
  let score = -Infinity;
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    const { tile, steps } = node;
    const isWet = oceanTile(world, tile);
    if (steps && (crossing ? isWet !== swimming : isWet === swimming)) {
      // Prefer a nearby shore crossing, or a short varied loop in the current medium.
      const value = crossing ? -steps : steps + random(turtle) * 2.4;
      if (value > score) {
        best = node;
        score = value;
      }
      if (crossing) break;
    }
    if (steps >= (crossing ? turtleTuning.wanderRadius + 2 : swimming ? 4 : 2)) continue;
    for (const offset of neighbors) {
      const next = { x: tile.x + offset.x, y: tile.y + offset.y };
      if (seen.has(key(next)) || distance(next, turtle.home) > turtleTuning.wanderRadius || !canTravel(next)) continue;
      if (!crossing && oceanTile(world, next) !== swimming) continue;
      seen.add(key(next));
      queue.push({ tile: next, prior: node, steps: steps + 1 });
    }
  }
  const route = [];
  for (let node = best; node?.prior; node = node.prior) route.push(node.tile);
  if (!route.length) return false;
  entity.tile = origin;
  entity.route = route.reverse();
  turtle.crossing = crossing;
  turtle.phase = swimming ? 0.85 : 0;
  // Re-center a late turn around a corner instead of cutting over an unwalkable tile.
  if (distance(entity.position, tileToWorld(origin, tileSize)) > 1) entity.route.unshift(origin);
  return true;
}

function nearVillager(world, entity) {
  return world.state.villagers.some(villager => villager.id !== world.heldVillager
    && distance(groundPosition(villager), entity.position) < turtleTuning.alertRadius);
}

function enterMedium(world, entity, wet, edge, travelSpeed) {
  const { turtle } = entity;
  turtle.state = wet ? TurtleState.WATER_SWIM : TurtleState.LAND_CRAWL;
  turtle.crossIn = between(turtle, turtleTuning.shoreInterval);
  turtle.phase = wet ? 0.88 : 0;
  turtle.speed = wet ? Math.min(travelSpeed, turtleTuning.swimSpeed) : 0;
  turtle.frame = 0;
  if (wet) turtle.retreat = false;
  entity.animation = wet ? 'swim' : 'crawl';
  world.shoreRipples.push({ ...edge, age: 0, life: 0.63 });
  if (world.shoreRipples.length > 10) world.shoreRipples.shift();
  emitWaterParticles(world, { position: edge, water: ocean, depth: 0, heading: 0 },
    'splash', 5, () => random(turtle));
}

export function updateShoreRipples(world, dt) {
  for (const ripple of world.shoreRipples) ripple.age += dt;
  world.shoreRipples = world.shoreRipples.filter(ripple => ripple.age < ripple.life);
}

function shorelinePoint(world, a, b, fromWater) {
  let before = a;
  let after = b;
  for (let i = 0; i < 5; i++) {
    const middle = { x: (before.x + after.x) / 2, y: (before.y + after.y) / 2 };
    if ((waterAt(world.map, middle) === ocean) === fromWater) before = middle;
    else after = middle;
  }
  return fromWater ? before : after;
}

function crawlTravel(turtle, dt) {
  const { pushTime, resetTime, crawlSpeed, retreatSpeed } = turtleTuning;
  const cycle = pushTime + resetTime;
  const progress = time => eased(limit(time / pushTime, 0, 1));
  const before = turtle.phase;
  const after = before + dt;
  const traveled = after >= cycle ? 1 - progress(before) + progress(after % cycle) : progress(after) - progress(before);
  turtle.phase = after % cycle;
  return { stride: traveled * (turtle.retreat ? retreatSpeed : crawlSpeed) * pushTime,
    planted: before < pushTime && after >= pushTime };
}

function swimTravel(turtle, dt, moving) {
  turtle.speed *= Math.exp(-turtleTuning.swimDrag * (moving ? 1 : 1.7) * dt);
  if (!moving) return turtle.speed * dt;
  turtle.phase += (1.05 + Math.min(0.75, turtle.speed / 38)) * dt;
  if (turtle.phase >= 1) {
    turtle.phase %= 1;
    turtle.speed = Math.min(turtleTuning.swimSpeed, turtle.speed + turtleTuning.swimThrust);
  }
  return turtle.speed * dt;
}

function smoothWaterTurn(world, entity, canTravel) {
  const [first, second] = entity.route;
  if (!second || !oceanTile(world, first) || !oceanTile(world, second)) return;
  const { tileSize } = world.map.meta;
  const target = tileToWorld(second, tileSize);
  const { position } = entity;
  const samples = Math.ceil(distance(position, target) / 2);
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const point = { x: position.x + (target.x - position.x) * t, y: position.y + (target.y - position.y) * t };
    const tile = worldToTile(point, tileSize);
    if (!oceanTile(world, tile) || !canTravel(tile)) return;
  }
  entity.route.shift();
}

function stepTurtle(world, entity, asset, canTravel, advance, dt) {
  const { turtle, ground } = entity;
  const before = { ...entity.position };
  const swimming = turtle.state === TurtleState.WATER_SWIM;
  turtle.age += dt;
  turtle.crossIn -= dt;
  turtle.alertCooldown = Math.max(0, turtle.alertCooldown - dt);
  ground.lift = 0;

  if (!swimming && !turtle.alertCooldown && nearVillager(world, entity)) {
    entity.route = [];
    turtle.crossing = false;
    turtle.retreat = true;
    turtle.tuck = turtleTuning.tuckTime;
    turtle.alertCooldown = 8;
  }
  if (turtle.tuck > 0) {
    turtle.tuck = Math.max(0, turtle.tuck - dt);
    entity.animation = 'rest';
    turtle.frame = asset.animations.rest.frameCount - 1;
  } else {
    if (entity.route.length && !canTravel(entity.route[0])) {
      entity.route = [];
      turtle.crossing = false;
    }
    if ((turtle.crossIn <= 0 || turtle.retreat) && !turtle.crossing) {
      if (!chooseRoute(world, entity, canTravel, true)) {
        turtle.crossIn = 1.4;
        turtle.retreat = false;
      }
      if (swimming) smoothWaterTurn(world, entity, canTravel);
    }
    if (!entity.route.length) {
      turtle.idleFor -= dt;
      if (turtle.idleFor <= 0 && chooseRoute(world, entity, canTravel, false)) {
        turtle.idleFor = between(turtle, turtleTuning.idleTime);
        if (swimming) smoothWaterTurn(world, entity, canTravel);
      }
    }

    const crawling = !swimming && entity.route.length ? crawlTravel(turtle, dt) : null;
    const travel = swimming ? swimTravel(turtle, dt, Boolean(entity.route.length)) : crawling?.stride ?? 0;
    const nextWaypoint = entity.route[0];
    advance(entity, travel, world.map.meta.tileSize, dx => {
      if (Math.abs(dx) > 0.5) entity.direction = dx > 0 ? 'right' : 'left';
    });
    if (swimming && entity.route[0] !== nextWaypoint) smoothWaterTurn(world, entity, canTravel);
    const moved = distance(entity.position, before) > 0.001;
    if (!entity.route.length) turtle.crossing = false;
    if (swimming) {
      entity.animation = moved ? 'swim' : 'float';
      turtle.frame = moved ? Math.floor(turtle.phase * asset.animations.swim.frameCount)
        : Math.floor(turtle.age * 2) % asset.animations.float.frameCount;
    } else if (crawling) {
      entity.animation = 'crawl';
      const ratio = limit(turtle.phase / turtleTuning.pushTime, 0, 0.99);
      turtle.frame = Math.floor(ratio * asset.animations.crawl.frameCount);
      ground.lift = moved ? Math.sin(ratio * Math.PI) : 0;
    } else {
      entity.animation = 'rest';
      turtle.frame = Math.floor(turtle.age * 2) % asset.animations.rest.frameCount;
    }

    if (!swimming) recordGroundTravel(world, entity, before, dt, { landed: crawling?.planted && moved });
    const becameWet = waterAt(world.map, entity.position) === ocean;
    if (becameWet !== swimming) {
      const edge = shorelinePoint(world, before, entity.position, swimming);
      enterMedium(world, entity, becameWet, edge, distance(before, entity.position) / dt);
    }
    if (becameWet) {
      turtle.bubbleIn -= dt;
      if (turtle.bubbleIn <= 0) {
        emitWaterParticles(world, { position: entity.position, water: ocean, depth: turtle.depth,
          heading: entity.direction === 'left' ? Math.PI : 0 }, 'bubble', 1, () => random(turtle), 8);
        turtle.bubbleIn = turtleTuning.bubbleInterval * (0.85 + random(turtle) * 0.4);
      }
    }
  }

  const wet = turtle.state === TurtleState.WATER_SWIM;
  const tile = worldToTile(entity.position, world.map.meta.tileSize);
  const adjacentWater = wet ? neighbors.filter(offset => oceanTile(world, { x: tile.x + offset.x, y: tile.y + offset.y })).length : 0;
  const dy = (entity.position.y - before.y) / dt;
  const targetBank = wet ? limit(dy * 0.42, -turtleTuning.maxBank, turtleTuning.maxBank)
    * (entity.direction === 'right' ? 1 : -1) : entity.animation === 'crawl' ? Math.sin(turtle.phase * 8) * 5 : 0;
  const mix = 1 - Math.exp(-turtleTuning.bankResponse * dt);
  turtle.bank += (targetBank - turtle.bank) * mix;
  turtle.depth += ((wet ? 0.7 + adjacentWater * 0.9 : 0) - turtle.depth) * mix;
  turtle.blend = limit(turtle.blend + (wet ? dt : -dt) / turtleTuning.shorelineFadeTime, 0, 1);
}

export function updateTurtle(world, entity, asset, canTravel, advance, elapsed) {
  if (!initializeTurtle(world, entity, canTravel)) return;
  const steps = Math.ceil(elapsed * 60);
  for (let i = 0; i < steps; i++) stepTurtle(world, entity, asset, canTravel, advance, elapsed / steps);
}

export function turtleVisuals(entity) {
  const { turtle } = entity;
  if (!turtle) return null;
  const submerged = turtle.state === TurtleState.WATER_SWIM;
  const bob = Math.sin(turtle.age * 3.2) * turtleTuning.buoyancyBob;
  return {
    submerged, water: ocean, frame: turtle.frame, bank: Math.round(turtle.bank),
    offsetX: entity.animation === 'crawl' ? Math.round(Math.sin(turtle.phase * 8) * 0.8) : 0,
    offsetY: Math.round(-8 * (1 - turtle.blend) + (turtle.depth + bob) * turtle.blend
      - (entity.ground?.lift || 0) * (1 - turtle.blend)),
    tint: turtle.blend > 0 ? { color: turtleTuning.waterTint,
      alpha: Math.round((0.18 + turtle.depth * 0.042) * turtle.blend * 20) / 20 } : null,
    contact: limit((1 - turtle.blend) + turtle.blend * Math.max(0, 1 - turtle.depth / 2.4) * 0.27, 0, 1),
  };
}
