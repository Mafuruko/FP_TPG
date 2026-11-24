import { emitWaterParticles } from './fish.js';
import { tileToWorld, worldToTile } from './geometry.js';

export const DolphinState = Object.freeze({
  SWIMMING: 'SWIMMING', SURFACING: 'SURFACING', BREACHING: 'BREACHING', DIVING: 'DIVING',
});

const animations = {
  [DolphinState.SWIMMING]: 'swim',
  [DolphinState.SURFACING]: 'surface',
  [DolphinState.BREACHING]: 'jump',
  [DolphinState.DIVING]: 'dive',
};

export const dolphinTuning = {
  thrust: 25, waterDrag: 1.55, turnSmoothing: 3.2, maxSpeed: 49,
  firstSurface: 5.6, surfaceInterval: 8.5, breachEvery: 2, swimDepth: 6,
  submergedTint: '#286a88', tintStrength: 0.36,
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function random(dolphin) {
  dolphin.seed = (Math.imul(dolphin.seed, 1664525) + 1013904223) >>> 0;
  return dolphin.seed / 4294967296;
}

export function initializeDolphin(world, entity, canSwim) {
  if (entity.dolphin) return true;
  const { tileSize } = world.map.meta;
  if (!canSwim(entity.tile)) {
    const habitat = world.habitatTiles.get(entity.assetId);
    if (!habitat.length) return false;
    entity.tile = habitat.reduce((best, tile) => distance(tile, entity.tile) < distance(best, entity.tile) ? tile : best);
  }
  entity.position = tileToWorld(entity.tile, tileSize);
  entity.route = [];
  entity.animation = animations[DolphinState.SWIMMING];
  entity.dolphin = {
    state: DolphinState.SWIMMING, home: entity.tile, goal: null, heading: entity.direction === 'left' ? Math.PI : 0,
    vx: 0, vy: 0, phase: 0, age: 0, frame: 0, surfaces: 0, nextSurface: dolphinTuning.firstSurface,
    seed: 6581,
  };
  return true;
}

function clearPath(world, from, to, canSwim) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 3));
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps;
    const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    if (!canSwim(worldToTile(point, world.map.meta.tileSize))) return false;
  }
  return true;
}

function chooseGoal(world, entity, canSwim) {
  const { dolphin, position, tile } = entity;
  const choices = [];
  for (let y = -4; y <= 4; y++) {
    for (let x = -4; x <= 4; x++) {
      const candidate = { x: tile.x + x, y: tile.y + y };
      if (Math.hypot(x, y) < 2 || distance(candidate, dolphin.home) > 6 || !canSwim(candidate)) continue;
      const point = tileToWorld(candidate, world.map.meta.tileSize);
      if (clearPath(world, position, point, canSwim)) choices.push(point);
    }
  }
  return choices[Math.floor(random(dolphin) * choices.length)] ?? null;
}

function changeState(entity, state) {
  const { dolphin } = entity;
  dolphin.state = state;
  dolphin.age = 0;
  dolphin.frame = 0;
  entity.animation = animations[state];
}

function waterSpray(world, entity, count, offset, kind = 'splash') {
  const { dolphin, position } = entity;
  emitWaterParticles(world, { position, water: 'ocean_001', heading: dolphin.heading, depth: dolphinTuning.swimDepth },
    kind, count, () => random(dolphin), offset);
}

function advanceDolphin(world, entity, asset, canSwim, dt) {
  const { dolphin, position } = entity;
  const { maxSpeed, thrust, waterDrag, turnSmoothing } = dolphinTuning;
  dolphin.age += dt;
  const speed = Math.hypot(dolphin.vx, dolphin.vy);
  const swimming = dolphin.state === DolphinState.SWIMMING;
  const inAir = dolphin.state === DolphinState.BREACHING;
  if (swimming) {
    if (!dolphin.goal || distance(position, dolphin.goal) <= 9) dolphin.goal = chooseGoal(world, entity, canSwim);
    if (dolphin.goal) {
      const aim = Math.atan2(dolphin.goal.y - position.y, dolphin.goal.x - position.x);
      const angle = aim - dolphin.heading;
      dolphin.heading += Math.atan2(Math.sin(angle), Math.cos(angle)) * (1 - Math.exp(-turnSmoothing * dt));
    }
    const horizontal = Math.cos(dolphin.heading);
    if (Math.abs(horizontal) > 0.38) entity.direction = horizontal < 0 ? 'left' : 'right';
    const phase = dolphin.phase + (1.1 + Math.min(1, speed / 35) * 0.9) * dt;
    if (phase >= 1 && dolphin.goal) {
      dolphin.vx += horizontal * thrust;
      dolphin.vy += Math.sin(dolphin.heading) * thrust;
    }
    dolphin.phase = phase % 1;
    dolphin.frame = Math.floor(dolphin.phase * asset.animations.swim.frameCount);
    dolphin.nextSurface -= dt;
    if (dolphin.nextSurface <= 0) {
      dolphin.surfaces++;
      changeState(entity, DolphinState.SURFACING);
      waterSpray(world, entity, 4, -12, 'wake');
    }
  } else {
    const clip = asset.animations[entity.animation];
    dolphin.frame = Math.min(clip.frameCount - 1, Math.floor(dolphin.age * clip.fps));
    if (dolphin.age >= clip.frameCount / clip.fps) {
      if (dolphin.state === DolphinState.SURFACING && (dolphin.surfaces - 1) % dolphinTuning.breachEvery === 0) {
        changeState(entity, DolphinState.BREACHING);
        waterSpray(world, entity, 9, 10);
        dolphin.vx += Math.cos(dolphin.heading) * 17;
        dolphin.vy += Math.sin(dolphin.heading) * 17;
      } else if (dolphin.state === DolphinState.DIVING) {
        changeState(entity, DolphinState.SWIMMING);
        dolphin.nextSurface = dolphinTuning.surfaceInterval + random(dolphin) * 2;
      } else {
        changeState(entity, DolphinState.DIVING);
        waterSpray(world, entity, inAir ? 11 : 4, 13);
      }
    }
  }
  const magnitude = Math.hypot(dolphin.vx, dolphin.vy);
  const drag = dolphin.state === DolphinState.BREACHING ? 1 : Math.exp(-waterDrag * dt);
  const limit = magnitude > maxSpeed ? maxSpeed / magnitude : 1;
  dolphin.vx *= drag * limit;
  dolphin.vy *= drag * limit;
  const next = { x: position.x + dolphin.vx * dt, y: position.y + dolphin.vy * dt };
  if (canSwim(worldToTile(next, world.map.meta.tileSize))) {
    entity.position = next;
    entity.tile = worldToTile(next, world.map.meta.tileSize);
  } else {
    dolphin.vx = dolphin.vy = 0;
    dolphin.goal = null;
  }
}

export function updateDolphin(world, entity, asset, canSwim, elapsed) {
  if (!initializeDolphin(world, entity, canSwim)) return;
  const steps = Math.ceil(elapsed * 60);
  for (let step = 0; step < steps; step++) advanceDolphin(world, entity, asset, canSwim, elapsed / steps);
}

export function dolphinVisuals(entity) {
  const { dolphin } = entity;
  if (!dolphin) return null;
  const submerged = dolphin.state === DolphinState.SWIMMING || dolphin.state === DolphinState.DIVING;
  return {
    submerged, water: 'ocean_001', deepOnly: true, frame: dolphin.frame, bank: 0,
    // The original surface, jump and dive frames already contain the height and pitch of the arc.
    offsetY: dolphin.state === DolphinState.SWIMMING ? dolphinTuning.swimDepth : 0,
    tint: submerged ? { color: dolphinTuning.submergedTint, alpha: dolphinTuning.tintStrength } : null,
  };
}
