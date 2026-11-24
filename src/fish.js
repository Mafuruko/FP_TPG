import { neighbors, tileToWorld, walkable, worldToTile } from './geometry.js';

export const FishState = Object.freeze({
  UNDERWATER: 'UNDERWATER', AIRBORNE: 'AIRBORNE', BEACHED: 'BEACHED',
});

// Speeds, accelerations and depths are in native map pixels and seconds.
export const fishTuning = {
  swimThrust: 18, dashMultiplier: 1.65, waterDrag: 1.65, turnSmoothing: 5.5, maxSpeed: 45,
  hoverAmplitude: 1.6, hoverSpeed: 3.2, maxBank: 12, maxFlopBank: 27,
  underwaterTint: '#287c9c', tintStrength: 0.25, bubbleRate: 0.9,
  jumpVelocity: 48, airGravity: 160, breachInterval: 12, flopVelocity: 26,
};

export const fishAnimations = {
  fish_fresh: { idle: 'idle', swim: 'swim', turn: 'turn', dash: 'flee', flop: 'flee' },
  fish_coast: { idle: 'idle', swim: 'swim', turn: 'turn', dash: 'flee', flop: 'flee' },
};

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);

export function waterAt(map, { x, y }) {
  const tile = worldToTile({ x, y }, map.meta.tileSize);
  const terrain = map.terrainGrid[tile.y]?.[tile.x];
  return map.terrainTypes[terrain]?.water ? map.waterBodyGrid[tile.y][tile.x] : null;
}

function random(fish) {
  fish.seed = (Math.imul(fish.seed, 1664525) + 1013904223) >>> 0;
  return fish.seed / 4294967296;
}

function sameWaterPath(world, from, to, water) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (waterAt(world.map, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }) !== water) return false;
  }
  return true;
}

function closestWater(world, entity) {
  const { map } = world;
  let best;
  let minimum = Infinity;
  for (const tile of world.habitatTiles.get(entity.assetId)) {
    if (entity.fish && map.waterBodyGrid[tile.y][tile.x] !== entity.fish.water) continue;
    const position = tileToWorld(tile, map.meta.tileSize);
    const length = distance(entity.position, position);
    if (length < minimum) {
      minimum = length;
      best = position;
    }
  }
  return best;
}

function shoreRecovery(world, entity) {
  const { map, collision } = world;
  const start = worldToTile(entity.position, map.meta.tileSize);
  const queue = [{ tile: start, previous: null }];
  const seen = new Set([start.y * map.meta.width + start.x]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    const water = waterAt(map, tileToWorld(node.tile, map.meta.tileSize));
    if (water === entity.fish.water) {
      const path = [];
      for (let step = node; step.previous; step = step.previous) path.push(tileToWorld(step.tile, map.meta.tileSize));
      return path.reverse();
    }
    for (const offset of neighbors) {
      const tile = { x: node.tile.x + offset.x, y: node.tile.y + offset.y };
      const water = waterAt(map, tileToWorld(tile, map.meta.tileSize));
      if (water !== entity.fish.water && (water || !walkable(collision, tile))) continue;
      const key = tile.y * map.meta.width + tile.x;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ tile, previous: node });
    }
  }
  return [];
}

export function initializeFish(world, entity, asset) {
  if (entity.fish) return;
  if (!waterAt(world.map, entity.position)) entity.position = closestWater(world, entity) || entity.position;
  const water = waterAt(world.map, entity.position);
  if (!water) return;
  entity.route = [];
  entity.tile = worldToTile(entity.position, world.map.meta.tileSize);
  entity.animation = fishAnimations[asset.key].idle;
  entity.fish = {
    state: FishState.UNDERWATER, water, home: entity.tile, surface: { ...entity.position },
    vx: 0, vy: 0, vz: 0, height: 0, depth: 3, bank: 0, heading: entity.direction === 'left' ? Math.PI : 0,
    seed: entity.moves + 16, goal: null, rest: 0.4 + (entity.moves % 3) * 0.2, turn: 0,
    dash: 0, trips: 0, phase: 0, strokes: 0, frame: 0, age: 0,
    bubbleIn: 0.4 + (entity.moves % 4) * 0.1, breachIn: 6.5 + (entity.moves % 4) * 2, flopIn: 0,
  };
}

export function emitWaterParticles(world, { position, water, heading, depth }, kind, count, sample, offset = 0) {
  const particles = world.fishParticles;
  for (let i = 0; i < count; i++) {
    const spray = kind === 'splash';
    particles.push({
      kind, water,
      x: position.x + Math.cos(heading) * offset,
      y: position.y + (spray ? 0 : 1 + depth * 0.35) + Math.sin(heading) * offset,
      vx: (sample() - 0.5) * (spray ? 38 : 8),
      vy: -(spray ? 12 : 4) - sample() * (spray ? 14 : 4),
      phase: sample() * 6, age: 0, life: spray ? 0.4 : 0.85 + sample() * 0.7,
      size: i % 3 ? 1 : 2,
    });
  }
  if (particles.length > 48) particles.splice(0, particles.length - 48);
}

function emit(world, { fish, position }, kind, count, offset = 0) {
  const { water, heading, depth } = fish;
  emitWaterParticles(world, { position, water, heading, depth }, kind, count, () => random(fish), offset);
}

export function updateFishParticles(world, elapsed) {
  for (const particle of world.fishParticles) {
    particle.x += particle.vx * elapsed;
    particle.y += particle.vy * elapsed;
    particle.age += elapsed;
    if (particle.kind === 'splash') particle.vy += fishTuning.airGravity * 0.45 * elapsed;
  }
  world.fishParticles = world.fishParticles.filter(particle => particle.age < particle.life);
}

// A breach can be triggered by the ambient controller or another wildlife interaction.
export function launchFish(world, entity, velocity) {
  const { fish } = entity;
  if (fish?.state !== FishState.UNDERWATER || waterAt(world.map, entity.position) !== fish.water) return false;
  if (!Number.isFinite(velocity?.x) || !Number.isFinite(velocity?.y)) return false;
  fish.state = FishState.AIRBORNE;
  fish.surface = { ...entity.position };
  fish.vx = velocity.x;
  fish.vy = velocity.y;
  fish.vz = fishTuning.jumpVelocity;
  fish.height = 0;
  fish.goal = null;
  entity.animation = fishAnimations[world.assets.registry.get(entity.assetId).key].swim;
  fish.frame = 2;
  emit(world, entity, 'splash', 6);
  return true;
}

function chooseGoal(world, entity) {
  const { fish, tile, position } = entity;
  const choices = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const candidate = { x: tile.x + dx, y: tile.y + dy };
      if (Math.hypot(dx, dy) < 1.5 || distance(candidate, fish.home) > 6) continue;
      const point = tileToWorld(candidate, world.map.meta.tileSize);
      if (sameWaterPath(world, position, point, fish.water)) choices.push(point);
    }
  }
  const ecology = entity.ecology;
  const scattered = ecology?.scatterFrom && ecology.scatterUntil > world.state.time.seconds;
  const school = ecology?.schoolGoal && distance(position, ecology.schoolGoal) < 135
    && distance(position, ecology.schoolGoal) > 6 && sameWaterPath(world, position, ecology.schoolGoal, fish.water);
  if (scattered) choices.sort((a, b) => distance(b, ecology.scatterFrom) - distance(a, ecology.scatterFrom));
  fish.goal = (scattered ? choices[0] : school ? ecology.schoolGoal : choices[Math.floor(random(fish) * choices.length)]) || null;
  fish.trips++;
  fish.dash = fish.goal && (scattered || fish.trips % 4 === 1) ? 0.9 : 0;
  fish.phase = 0.88;
  if (!fish.goal) fish.rest = 0.8;
}

function setHeading(entity, speed, desired, dt) {
  const { fish } = entity;
  const delta = desired - fish.heading;
  fish.heading += Math.atan2(Math.sin(delta), Math.cos(delta)) * (1 - Math.exp(-fishTuning.turnSmoothing * dt));
  const horizontal = Math.cos(fish.heading);
  if (Math.abs(horizontal) > 0.38) {
    const direction = horizontal < 0 ? 'left' : 'right';
    if (entity.direction !== direction) fish.turn = 0.26;
    entity.direction = direction;
  }
  const tilt = speed > 2 ? Math.atan2(fish.vy, Math.abs(fish.vx) + 6) * 180 / Math.PI : 0;
  fish.bank = mix(fish.bank, clamp(tilt, -fishTuning.maxBank, fishTuning.maxBank)
    * (entity.direction === 'left' ? -1 : 1), fishTuning.turnSmoothing, dt);
}

function swim(world, entity, art, dt) {
  const { fish, position } = entity;
  const tune = fishTuning;
  fish.rest -= dt;
  fish.turn = Math.max(0, fish.turn - dt);
  fish.dash = Math.max(0, fish.dash - dt);
  fish.breachIn -= dt;
  if (fish.goal && distance(position, fish.goal) < 6) {
    fish.goal = null;
    fish.rest = 0.65 + random(fish) * 0.85;
  }
  if (!fish.goal && fish.rest <= 0) chooseGoal(world, entity);

  const speed = Math.hypot(fish.vx, fish.vy);
  const steering = fish.goal ? Math.atan2(fish.goal.y - position.y, fish.goal.x - position.x) : fish.heading;
  setHeading(entity, speed, steering, dt);
  const drag = Math.exp(-tune.waterDrag * (fish.goal ? 1 : 1.5) * dt);
  fish.vx *= drag;
  fish.vy *= drag;

  if (fish.goal && fish.turn === 0) {
    const rate = clamp(speed / 26, 0, 1);
    fish.phase += (1.35 + rate * 1.35 + (fish.dash > 0 ? 0.85 : 0)) * dt;
    if (fish.phase >= 1) {
      fish.phase %= 1; // Frame zero is the first bent-tail pose in both swim clips.
      fish.strokes++;
      const impulse = tune.swimThrust * (fish.dash > 0 ? tune.dashMultiplier : 1);
      fish.vx += Math.cos(fish.heading) * impulse;
      fish.vy += Math.sin(fish.heading) * impulse;
      const magnitude = Math.hypot(fish.vx, fish.vy);
      if (magnitude > tune.maxSpeed) {
        fish.vx *= tune.maxSpeed / magnitude;
        fish.vy *= tune.maxSpeed / magnitude;
      }
      if (fish.dash > 0) emit(world, entity, 'wake', 3, -6);
    }
  } else if (!fish.goal && speed > 7) fish.phase = (fish.phase + dt * (0.5 + speed / 36)) % 1;

  const next = { x: position.x + fish.vx * dt, y: position.y + fish.vy * dt };
  if (sameWaterPath(world, position, next, fish.water)) {
    entity.position = next;
    fish.surface = next;
  } else {
    fish.goal = null;
    fish.rest = 0.25;
    fish.vx = fish.vy = 0;
  }
  const tile = worldToTile(entity.position, world.map.meta.tileSize);
  fish.depth = mix(fish.depth, world.map.terrainGrid[tile.y][tile.x] === 'deep_water' ? 6 : 2, 2.6, dt);
  if (fish.turn > 0) {
    entity.animation = art.turn;
    fish.frame = fish.turn > 0.13 ? 0 : 1;
  } else if (fish.goal || speed > 7) {
    entity.animation = fish.dash > 0 ? art.dash : art.swim;
    fish.frame = Math.floor(fish.phase * 4);
  } else {
    entity.animation = art.idle;
    fish.frame = Math.floor(fish.age * 2.5) % 2;
  }

  fish.bubbleIn -= dt;
  if (tune.bubbleRate > 0 && fish.bubbleIn <= 0) {
    emit(world, entity, 'bubble', 1, 5);
    fish.bubbleIn = (0.8 + random(fish) * 0.55) / tune.bubbleRate;
  }
  if (fish.breachIn <= 0) {
    const velocity = { x: Math.cos(fish.heading) * 20, y: Math.sin(fish.heading) * 20 };
    const duration = 2 * tune.jumpVelocity / tune.airGravity;
    const landing = { x: entity.position.x + velocity.x * duration, y: entity.position.y + velocity.y * duration };
    const clear = sameWaterPath(world, entity.position, landing, fish.water);
    fish.breachIn = clear ? tune.breachInterval + random(fish) * 6 : 1.8;
    if (clear) launchFish(world, entity, velocity);
  }
}

function landInWater(world, entity, art) {
  const { fish } = entity;
  emit(world, entity, 'splash', 6);
  fish.state = FishState.UNDERWATER;
  fish.surface = { ...entity.position };
  fish.vx *= 0.5;
  fish.vy *= 0.5;
  fish.height = fish.vz = 0;
  fish.bank = clamp(fish.bank, -fishTuning.maxBank, fishTuning.maxBank);
  fish.depth = 1;
  fish.rest = 0.5;
  fish.breachIn = fishTuning.breachInterval;
  fish.recovery = null;
  entity.animation = art.idle;
  fish.frame = 0;
}

function airborne(world, entity, art, dt) {
  const { fish, position } = entity;
  const tune = fishTuning;
  entity.position = {
    x: clamp(position.x + fish.vx * dt, 0, world.map.meta.pixelWidth - 1),
    y: clamp(position.y + fish.vy * dt, 0, world.map.meta.pixelHeight - 1),
  };
  fish.vz -= tune.airGravity * dt;
  fish.height += fish.vz * dt;
  const direction = Math.sign(fish.vx) || (entity.direction === 'left' ? -1 : 1);
  entity.direction = direction < 0 ? 'left' : 'right';
  fish.bank = clamp(-fish.vz / 2.5, -tune.maxFlopBank, tune.maxFlopBank) * direction;
  entity.animation = art.swim;
  fish.frame = 2;
  if (fish.height > 0) return;
  const water = waterAt(world.map, entity.position);
  if (water === fish.water) landInWater(world, entity, art);
  else if (water) {
    // Keep the freshwater and coastal species in their original water on reentry.
    entity.position = fish.surface;
    landInWater(world, entity, art);
  } else {
    fish.state = FishState.BEACHED;
    fish.height = fish.vz = fish.vx = fish.vy = 0;
    fish.recovery = shoreRecovery(world, entity);
    fish.flopIn = 0.12;
    entity.animation = art.flop;
    fish.frame = 0;
  }
}

function flop(world, entity, art, dt) {
  const { fish, position } = entity;
  const tune = fishTuning;
  if (fish.height <= 0) {
    fish.flopIn -= dt;
    while (fish.recovery?.length > 1 && distance(position, fish.recovery[0]) < 5) fish.recovery.shift();
    const destination = fish.recovery?.[0];
    if (fish.flopIn <= 0 && destination) {
      const dx = destination.x - position.x;
      const dy = destination.y - position.y;
      const aim = Math.atan2(dy, dx) + (random(fish) - 0.5) * 0.55;
      const impulse = 21 + random(fish) * 9;
      fish.vx = Math.cos(aim) * impulse;
      fish.vy = Math.sin(aim) * impulse;
      fish.vz = tune.flopVelocity + random(fish) * 9;
      fish.flopIn = 0.12 + random(fish) * 0.12;
    }
  }
  const next = { x: position.x + fish.vx * dt, y: position.y + fish.vy * dt };
  const tile = worldToTile(next, world.map.meta.tileSize);
  const water = waterAt(world.map, next);
  if (water === fish.water || (!water && walkable(world.collision, tile))) entity.position = next;
  else if (fish.vx || fish.vy) {
    fish.vx = fish.vy = 0;
    fish.recovery = shoreRecovery(world, entity);
  }
  fish.vz -= tune.airGravity * dt;
  fish.height = Math.max(0, fish.height + fish.vz * dt);
  if (fish.height <= 0) {
    fish.vx = fish.vy = 0;
    if (waterAt(world.map, entity.position) === fish.water) {
      landInWater(world, entity, art);
      return;
    }
  }
  if (Math.abs(fish.vx) > 2) entity.direction = fish.vx < 0 ? 'left' : 'right';
  entity.animation = art.flop;
  fish.frame = Math.floor(fish.age * 18) % 4;
  fish.bank = Math.sin(fish.age * 17) * tune.maxFlopBank;
}

export function updateFish(world, entity, asset, elapsed) {
  initializeFish(world, entity, asset);
  if (!entity.fish) return;
  const art = fishAnimations[asset.key];
  const { fish } = entity;
  const steps = Math.ceil(elapsed * 60);
  const dt = elapsed / steps;
  for (let step = 0; step < steps; step++) {
    fish.age += dt;
    if (fish.state === FishState.UNDERWATER) swim(world, entity, art, dt);
    else if (fish.state === FishState.AIRBORNE) airborne(world, entity, art, dt);
    else flop(world, entity, art, dt);
    entity.tile = worldToTile(entity.position, world.map.meta.tileSize);
  }
}

export function fishVisuals(entity) {
  const { fish } = entity;
  if (!fish) return null;
  const submerged = fish.state === FishState.UNDERWATER;
  const idle = 1 - clamp(Math.hypot(fish.vx, fish.vy) / 20, 0, 1);
  return {
    submerged, water: fish.water, frame: fish.frame, bank: Math.round(fish.bank),
    offsetY: Math.round(submerged ? fish.depth * 0.35 + Math.sin(fish.age * fishTuning.hoverSpeed)
      * fishTuning.hoverAmplitude * idle : -fish.height),
    tint: submerged ? {
      color: fishTuning.underwaterTint,
      alpha: Math.round(clamp(fishTuning.tintStrength + fish.depth * 0.015, 0, 1) * 20) / 20,
    } : null,
  };
}
