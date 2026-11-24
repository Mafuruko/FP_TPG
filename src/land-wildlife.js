import { gaitPhase, groundContact, groundPosition, recordGroundTravel } from './ground.js';
import { neighbors, worldToTile } from './geometry.js';

export const LandState = Object.freeze({
  WANDER: 'WANDER', IDLE_ACTIVITY: 'IDLE_ACTIVITY', ALERT: 'ALERT', FLEE: 'FLEE', RECOVER: 'RECOVER', HIDE: 'HIDE',
});

// Distances are in world pixels, except wanderRadius, which is measured in tiles.
export const landWildlifeTuning = {
  rabbit: { speed: 31, fleeSpeed: 61, fleeRadius: 25, wanderRadius: 5, pause: [0.65, 1.65],
    idle: ['idle', 'eat', 'idle'], recover: [0.9, 1.6], move: 'hop', flee: 'flee', hop: [0.34, 0.13], fleeHop: [0.23, 0.055], stride: 15 },
  snake: { speed: 15, fleeSpeed: 28, alertRadius: 32, fleeRadius: 22, warnTime: 0.9, wanderRadius: 5, pause: [1.0, 2.35],
    idle: ['idle'], recover: [1, 1.8], move: 'slither', flee: 'slither', alert: 'warn', stride: 12 },
  deer: { speed: 19, fleeSpeed: 57, alertRadius: 58, fleeRadius: 27, wanderRadius: 6, pause: [1.8, 3.6],
    idle: ['graze', 'graze', 'idle'], recover: [1.8, 3.2], move: 'walk', flee: 'run', alert: 'alert', stride: 19 },
  crab: { speed: 29, fleeSpeed: 55, fleeRadius: 24, hideRadius: 13, wanderRadius: 5, pause: [0.9, 2.2],
    idle: ['claw', 'idle', 'claw'], recover: [0.7, 1.3], move: 'walk', flee: 'walk', hop: [0.22, 0.1], fleeHop: [0.18, 0.07], stride: 11 },
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const smooth = value => value * value * (3 - 2 * value);

function random(land) {
  land.seed = (Math.imul(land.seed, 1664525) + 1013904223) >>> 0;
  return land.seed / 4294967296;
}

export function initializeLandWildlife(entity, key) {
  if (entity.land) return;
  const config = landWildlifeTuning[key];
  entity.land = {
    state: LandState.IDLE_ACTIVITY, home: entity.tile, seed: 193 + entity.moves * 937,
    age: 0, until: 0.65 + entity.moves % 3 * 0.22, pulse: 0, frame: 0,
  };
  entity.animation = config.idle[0];
  entity.route = [];
  groundContact(entity);
}

function changeState(entity, state, animation) {
  const { land } = entity;
  land.state = state;
  land.age = land.pulse = land.frame = 0;
  entity.animation = animation;
}

function idle(entity, config) {
  const { land } = entity;
  entity.route = [];
  const [minimum, maximum] = config.pause;
  land.until = minimum + random(land) * (maximum - minimum);
  const nearFood = entity.ecology?.forage && (config.idle.includes('graze') || config.idle.includes('eat'));
  const clip = nearFood ? config.idle.find(clip => clip === 'graze' || clip === 'eat')
    : config.idle[Math.floor(random(land) * config.idle.length)];
  changeState(entity, LandState.IDLE_ACTIVITY, clip);
}

function nearestVillager(world, entity, radius) {
  let nearest = null;
  let range = radius;
  for (const villager of world.state.villagers) {
    if (villager.id === world.heldVillager) continue;
    const target = groundPosition(villager);
    const span = distance(entity.position, target);
    if (span < range) {
      range = span;
      nearest = { position: target, range };
    }
  }
  return nearest;
}

function face(entity, asset, dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) entity.direction = dx > 0 ? 'right' : 'left';
  else if (dy && asset.dirs.includes('front')) entity.direction = dy > 0 ? 'front' : 'back';
}

function pickRoute(world, entity, key, config, canStand, threat) {
  const { tileSize, width } = world.map.meta;
  const start = worldToTile(entity.position, tileSize);
  const nodes = [{ tile: start, previous: null, steps: 0 }];
  const visited = new Set([start.y * width + start.x]);
  const originThreat = threat && worldToTile(threat.position, tileSize);
  const limit = threat ? 5 : key === 'crab' ? 2 : 3;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const { tile, steps } = node;
    const homeDistance = distance(tile, entity.land.home);
    const farther = !originThreat || distance(tile, originThreat) > distance(start, originThreat);
    if (steps && farther && homeDistance <= config.wanderRadius + (threat ? 3 : 0)) {
      const lateral = key === 'crab' ? Math.abs(start.x - tile.x) * 1.5 - Math.abs(start.y - tile.y) * 0.6 : 0;
      const cover = key === 'snake' && world.map.regionGrid[tile.y][tile.x] === 'forest' ? 1.5 : 0;
      const score = originThreat ? distance(tile, originThreat) * 2 + lateral + cover - steps * 0.12
        : random(entity.land) * 4 + lateral + steps * 0.55 - homeDistance * 0.13;
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }
    if (steps === limit) continue;
    for (const offset of neighbors) {
      const target = { x: tile.x + offset.x, y: tile.y + offset.y };
      const id = target.y * width + target.x;
      if (visited.has(id) || !canStand(target)) continue;
      visited.add(id);
      nodes.push({ tile: target, previous: node, steps: steps + 1 });
    }
  }
  const route = [];
  for (let node = best; node?.previous; node = node.previous) route.push(node.tile);
  return route.reverse();
}

function initiateMove(world, entity, asset, config, canStand, threat) {
  const route = pickRoute(world, entity, asset.key, config, canStand, threat);
  if (!route.length) return false;
  entity.tile = worldToTile(entity.position, world.map.meta.tileSize);
  entity.route = route;
  if (threat) entity.land.threat = { ...threat.position };
  changeState(entity, threat ? LandState.FLEE : LandState.WANDER, threat ? config.flee : config.move);
  return true;
}

function hide(entity) {
  entity.route = [];
  entity.land.until = 1.2 + random(entity.land) * 0.65;
  changeState(entity, LandState.HIDE, 'hide');
}

function pulseTravel(land, profile, speed, dt) {
  const [motion, pause] = profile;
  const cycle = motion + pause;
  const from = land.pulse;
  const to = from + dt;
  const progress = time => smooth(Math.min(1, time / motion));
  const traveled = to >= cycle ? 1 - progress(from) + progress(to - cycle) : progress(to) - progress(from);
  land.pulse = to % cycle;
  return { distance: traveled * speed * motion, landed: from < motion && to >= motion, phase: land.pulse / motion };
}

function stepWildlife(world, entity, asset, canStand, advance, config, threat, dt) {
  const { land, ground } = entity;
  const key = asset.key;
  const before = { ...entity.position };
  land.age += dt;
  ground.lift = 0;
  const now = world.state.time.seconds;
  const imminent = threat && !threat.indirect && threat.range < config.fleeRadius * 0.42;
  const canFlee = imminent || now >= (land.rearmAt ?? 0);
  const threatened = canFlee && threat && threat.range < config.fleeRadius;

  if (land.state === LandState.RECOVER) {
    const lookAt = threat && !threat.indirect ? threat.position : land.threat;
    if (lookAt) face(entity, asset, lookAt.x - entity.position.x, lookAt.y - entity.position.y);
    if (land.age >= land.until || imminent && land.age >= 0.35) idle(entity, config);
  }
  if (land.state === LandState.HIDE) {
    if (land.age >= land.until) idle(entity, config);
  } else if (land.state !== LandState.FLEE && land.state !== LandState.RECOVER) {
    if (key === 'crab' && threat?.range < config.hideRadius) {
      hide(entity);
    } else if (threatened && (key !== 'snake' || land.state === LandState.ALERT && land.age >= config.warnTime)) {
      if (!initiateMove(world, entity, asset, config, canStand, threat)) {
        if (key === 'crab') hide(entity);
        else if (land.state !== LandState.ALERT) idle(entity, config);
      }
    } else if (threat && config.alert && land.state !== LandState.ALERT) {
      entity.route = [];
      changeState(entity, LandState.ALERT, config.alert);
    } else if (!threat && land.state === LandState.ALERT) idle(entity, config);
  }

  if (land.state === LandState.ALERT && threat) {
    face(entity, asset, threat.position.x - entity.position.x, threat.position.y - entity.position.y);
  }
  if (land.state === LandState.IDLE_ACTIVITY && land.age >= land.until) {
    if (!initiateMove(world, entity, asset, config, canStand)) idle(entity, config);
  }

  const fleeing = land.state === LandState.FLEE;
  const moving = fleeing || land.state === LandState.WANDER;
  if (moving && entity.route.length && !canStand(entity.route[0])) entity.route = [];
  if (moving && entity.route.length) {
    const speed = fleeing ? config.fleeSpeed : config.speed;
    const pulse = config.hop && pulseTravel(land, fleeing ? config.fleeHop : config.hop, speed, dt);
    const travel = pulse ? pulse.distance : speed * dt;
    advance(entity, travel, world.map.meta.tileSize, (dx, dy) => face(entity, asset, dx, dy));
    recordGroundTravel(world, entity, before, dt, { landed: key === 'rabbit' && pulse.landed, sprint: fleeing });
    if (pulse) {
      if (pulse.phase < 1 && travel > 0) {
        entity.animation = fleeing ? config.flee : config.move;
        const cycle = key === 'crab' ? gaitPhase(entity, config.stride) : pulse.phase;
        land.frame = Math.floor(cycle * asset.animations[entity.animation].frameCount);
        if (key === 'rabbit') ground.lift = Math.sin(pulse.phase * Math.PI) * 3;
        if (key === 'crab' && pulse.phase > 0.6) ground.lift = 1;
      } else {
        entity.animation = 'idle';
        land.frame = 0;
      }
    } else {
      entity.animation = fleeing ? config.flee : config.move;
      const phase = gaitPhase(entity, fleeing && key === 'deer' ? 24 : config.stride);
      land.frame = Math.floor(phase * asset.animations[entity.animation].frameCount);
      if (fleeing && key === 'deer') ground.lift = Math.sin(phase * Math.PI) * 2;
    }
    return;
  }
  if (fleeing) {
    const [minimum, maximum] = config.recover;
    land.until = minimum + random(land) * (maximum - minimum);
    land.rearmAt = now + land.until + 2;
    changeState(entity, LandState.RECOVER, key === 'snake' ? 'idle' : config.alert || 'idle');
  } else if (moving) idle(entity, config);
  recordGroundTravel(world, entity, before, dt);
  const clip = asset.animations[entity.animation];
  land.frame = clip.loop ? Math.floor(land.age * clip.fps) % clip.frameCount
    : Math.min(clip.frameCount - 1, Math.floor(land.age * clip.fps));
}

export function updateLandWildlife(world, entity, asset, canStand, advance, elapsed) {
  initializeLandWildlife(entity, asset.key);
  const config = landWildlifeTuning[asset.key];
  const radius = config.alertRadius || config.fleeRadius;
  const steps = Math.ceil(elapsed * 60);
  for (let step = 0; step < steps; step++) {
    const ecology = entity.ecology;
    const now = world.state.time.seconds;
    const herd = ecology?.herdUntil > now && (ecology.herdAt ?? 0) <= now && ecology.herdThreat;
    const wave = ecology?.waveStart !== undefined && now - ecology.waveStart < 0.65 && ecology.wave;
    const villager = nearestVillager(world, entity, radius);
    const threat = herd && (!villager || villager.range >= config.fleeRadius) ? { position: herd, range: 0, indirect: true }
      : villager || (wave ? { position: wave, range: config.fleeRadius * 0.9, indirect: true } : null);
    stepWildlife(world, entity, asset, canStand, advance, config, threat, elapsed / steps);
  }
}
