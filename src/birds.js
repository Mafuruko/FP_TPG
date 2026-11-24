import { neighbors, tileToWorld, worldToTile } from './geometry.js';

export const BirdState = Object.freeze({
  GROUNDED: 'GROUNDED', TAKEOFF: 'TAKEOFF', FLYING: 'FLYING', LANDING: 'LANDING',
});

// Speed and acceleration are in native world pixels per second and per second squared.
export const birdTuning = {
  flapForce: 220, glideGravity: 38, groundGravity: 220,
  airSpeed: 56, airDrag: 3.1, groundSpeed: 19, groundFriction: 16,
  maxAltitude: 40, takeoffTime: 0.18, hoverTime: 0.5,
  bobSpeed: 5, bobAmplitude: 2.1, maxTiltAngle: 7,
  shadowMinScale: 0.55, shadowMaxScale: 1, shadowMinOpacity: 0.17, shadowMaxOpacity: 0.43,
};

export const birdAnimations = {
  songbird: {
    idle: 'idle', groundMove: 'hop', groundDetail: 'peck', flap: 'fly',
    glide: 'fly', glideFrame: 1, shadowWidth: 14, groundTime: 2.4,
  },
  seagull: {
    idle: 'stand', groundMove: 'walk', groundDetail: 'stand', flap: 'fly',
    glide: 'glide', glideFrame: 0, shadowWidth: 20, groundTime: 3.2,
  },
};

const limit = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function changeState(bird, state) {
  bird.state = state;
  bird.age = 0;
  bird.hover = 0;
}

function nearestGround(world, asset, position, canLand) {
  let nearest;
  let minimum = Infinity;
  for (const tile of world.habitatTiles.get(asset.id)) {
    if (!canLand(tile)) continue;
    const weight = distance(position, tileToWorld(tile, world.map.meta.tileSize));
    if (weight < minimum) {
      minimum = weight;
      nearest = tile;
    }
  }
  return nearest;
}

export function initializeBird(world, entity, asset, canLand) {
  if (entity.bird) return true;
  const tile = canLand(entity.tile) ? entity.tile : nearestGround(world, asset, entity.position, canLand);
  if (!tile) return false;
  entity.tile = tile;
  entity.position = tileToWorld(tile, world.map.meta.tileSize);
  entity.route = [];
  entity.animation = birdAnimations[asset.key].idle;
  entity.bird = {
    state: BirdState.GROUNDED, age: 0, hover: 0, altitude: 0, vz: 0, vx: 0, vy: 0,
    home: tile, target: null, groundStep: false, trips: 0, animationFrame: null,
  };
  return true;
}

function steer(entity, target, speed, drag, dt, map) {
  const { bird, position } = entity;
  const dx = target ? target.x - position.x : 0;
  const dy = target ? target.y - position.y : 0;
  const remaining = Math.hypot(dx, dy);
  const gain = 1 - Math.exp(-drag * dt);
  const factor = remaining ? Math.min(speed / remaining, 5) : 0;
  bird.vx += (dx * factor - bird.vx) * gain;
  bird.vy += (dy * factor - bird.vy) * gain;
  if (Math.abs(bird.vx) > 4) entity.direction = bird.vx < 0 ? 'left' : 'right';
  const x = limit(position.x + bird.vx * dt, 0, map.meta.pixelWidth - 1);
  const y = limit(position.y + bird.vy * dt, 0, map.meta.pixelHeight - 1);
  return { x, y };
}

function flyTo(entity, destination) {
  const { bird } = entity;
  bird.target = destination;
  bird.vz = birdTuning.flapForce * 0.32;
  bird.trips++;
  changeState(bird, BirdState.TAKEOFF);
}

function flightDestination(entity, canLand) {
  const { tile, bird } = entity;
  const choices = [];
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const candidate = { x: tile.x + dx, y: tile.y + dy };
      const span = Math.hypot(dx, dy);
      if (span >= 3 && span <= 6 && distance(candidate, bird.home) <= 7 && canLand(candidate)) choices.push(candidate);
    }
  }
  return choices[(bird.trips * 7 + entity.moves * 3) % choices.length] || null;
}

function groundStep(world, entity, canLand, dt) {
  const { bird, tile } = entity;
  const { tileSize } = world.map.meta;
  if (!bird.groundStep && bird.age >= 0.55) {
    bird.groundStep = true;
    const steps = neighbors.map(offset => ({ x: tile.x + offset.x, y: tile.y + offset.y })).filter(canLand);
    bird.target = steps[(bird.trips + entity.moves) % steps.length] || null;
  }
  if (bird.target && !canLand(bird.target)) {
    bird.target = null;
    bird.vx = bird.vy = 0;
  }
  const goal = bird.target && tileToWorld(bird.target, tileSize);
  const next = steer(entity, goal, birdTuning.groundSpeed, birdTuning.groundFriction, dt, world.map);
  const nextTile = worldToTile(next, tileSize);
  if (canLand(nextTile)) {
    entity.position = next;
    entity.tile = nextTile;
  } else {
    bird.vx = bird.vy = 0;
    bird.target = null;
  }
  if (goal && distance(entity.position, goal) < 0.65) {
    entity.position = goal;
    bird.target = null;
    bird.vx = bird.vy = 0;
  }
  bird.altitude = 0;
  bird.vz = 0;
}

function finishLanding(entity, goal) {
  const { bird } = entity;
  entity.position = goal;
  entity.tile = bird.target;
  bird.altitude = bird.vz = bird.vx = bird.vy = 0;
  bird.target = null;
  bird.groundStep = false;
  changeState(bird, BirdState.GROUNDED);
}

function birdStep(world, entity, asset, canLand, dt) {
  const { bird } = entity;
  const art = birdAnimations[asset.key];
  const config = birdTuning;
  const { tileSize } = world.map.meta;
  bird.age += dt;
  bird.animationFrame = null;

  if (bird.state === BirdState.GROUNDED) {
    const safe = canLand(entity.tile);
    if (safe) groundStep(world, entity, canLand, dt);
    if (bird.age >= art.groundTime || !safe) {
      const destination = flightDestination(entity, canLand)
        || nearestGround(world, asset, entity.position, canLand);
      if (destination) flyTo(entity, destination);
    }
    entity.animation = bird.state === BirdState.TAKEOFF ? art.flap
      : bird.target ? art.groundMove : bird.age % 2.5 > 1.55 ? art.groundDetail : art.idle;
    if (bird.state === BirdState.GROUNDED) return;
  }

  if (!bird.target || !canLand(bird.target)) {
    bird.target = nearestGround(world, asset, entity.position, canLand) || null;
    if (bird.state === BirdState.LANDING) changeState(bird, BirdState.FLYING);
  }
  const goal = bird.target && tileToWorld(bird.target, tileSize);
  const remaining = goal ? distance(entity.position, goal) : Infinity;
  const speed = bird.state === BirdState.LANDING ? config.groundSpeed : config.airSpeed;
  entity.position = steer(entity, goal, speed, config.airDrag, dt, world.map);
  entity.tile = worldToTile(entity.position, tileSize);
  entity.animation = art.flap;

  if (bird.state === BirdState.TAKEOFF) {
    bird.vz += (config.flapForce * 0.44 - config.glideGravity) * dt;
    if (bird.age >= config.takeoffTime) changeState(bird, BirdState.FLYING);
  } else if (bird.state === BirdState.FLYING) {
    const cruise = config.maxAltitude * 0.77;
    const coasting = remaining >= 8 && remaining < 52 && bird.altitude >= cruise * 0.78 && bird.vz > -18;
    const lift = coasting ? 0 : limit((cruise - bird.altitude) * 10 - bird.vz * 5 + config.glideGravity, 0, config.flapForce);
    bird.vz += (lift - config.glideGravity) * dt;
    if (coasting) {
      entity.animation = art.glide;
      bird.animationFrame = art.glideFrame;
    }
    bird.hover = remaining < 6 ? bird.hover + dt : 0;
    if (goal && bird.hover >= config.hoverTime) {
      bird.vz = Math.min(bird.vz, 0);
      changeState(bird, BirdState.LANDING);
    }
  } else {
    bird.vz -= config.groundGravity * dt;
    entity.animation = art.glide;
    bird.animationFrame = art.glideFrame;
  }

  bird.altitude = limit(bird.altitude + bird.vz * dt, 0, config.maxAltitude);
  if (bird.altitude === config.maxAltitude) bird.vz = Math.min(0, bird.vz);
  if (bird.state === BirdState.LANDING && goal && bird.altitude === 0 && distance(entity.position, goal) <= 5) {
    finishLanding(entity, goal);
    entity.animation = art.idle;
  }
}

export function updateBird(world, entity, asset, canLand, elapsed) {
  if (!initializeBird(world, entity, asset, canLand)) return;
  // Offline catch-up and faster simulation speeds may supply larger deltas.
  const steps = Math.ceil(elapsed * 60);
  const dt = elapsed / steps;
  for (let step = 0; step < steps; step++) {
    const priorAnimation = entity.animation;
    const priorFrame = entity.bird.animationFrame;
    birdStep(world, entity, asset, canLand, dt);
    entity.bird.animTime = entity.animation === priorAnimation && entity.bird.animationFrame === priorFrame
      ? (entity.bird.animTime ?? 0) + dt : 0;
  }
}

export function birdVisuals(entity, asset) {
  const { bird } = entity;
  if (!bird) return null;
  const config = birdTuning;
  const grounded = bird.state === BirdState.GROUNDED;
  const ratio = grounded ? 0 : limit(bird.altitude / config.maxAltitude, 0, 1);
  const hover = bird.state === BirdState.FLYING ? Math.min(1, bird.hover * 6) : 0;
  const bob = Math.sin(bird.age * config.bobSpeed) * config.bobAmplitude * hover;
  const facing = entity.direction === 'left' ? 1 : -1;
  return {
    altitude: grounded ? 0 : Math.max(0, Math.round(bird.altitude + bob)),
    angle: grounded ? 0 : Math.round(limit(bird.vz / 7, -config.maxTiltAngle, config.maxTiltAngle) * facing),
    shadowWidth: Math.round(birdAnimations[asset.key].shadowWidth
      * (config.shadowMaxScale + (config.shadowMinScale - config.shadowMaxScale) * ratio)),
    shadowHeight: Math.round(5 * (config.shadowMaxScale + (config.shadowMinScale - config.shadowMaxScale) * ratio)),
    shadowOpacity: config.shadowMaxOpacity + (config.shadowMinOpacity - config.shadowMaxOpacity) * ratio,
  };
}
