import { walkable, worldToTile } from './geometry.js';

export const villagerGroundTuning = {
  walkSpeed: 44, carrySpeed: 40, crawlSpeed: 27, runSpeed: 64, stride: 22, avoidanceRadius: 12, laneWidth: 5,
  leisureDelay: [6, 12], leisurePause: [1.2, 2.8], leisureRadius: 7,
  conversationRadius: 26, conversationLength: 2.6, conversationCooldown: 15,
};

const movingClips = new Set(['walk', 'carry', 'crawl', 'run']);
const terrainColors = {
  sand: ['#e8d5a4', '#bba16f'], grass: ['#779757', '#b9c482'],
  dirt: ['#c6a975', '#9d8052'], fertile_soil: ['#a5805a', '#c09d71'],
};

export function groundContact(entity) {
  return entity.ground ??= { distance: 0, vx: 0, vy: 0, x: 0, y: 0, lift: 0, lastDust: -10 };
}

export function groundPosition(entity) {
  const { x, y } = entity.position;
  return { x: x + (entity.ground?.x || 0), y: y + (entity.ground?.y || 0) };
}

export function emitGroundDust(world, position, dx = 0, dy = 0, count = 3) {
  const { x, y } = worldToTile(position, world.map.meta.tileSize);
  const colors = terrainColors[world.map.terrainGrid[y]?.[x]];
  if (!colors) return;
  for (let i = 0; i < count; i++) {
    const spread = i - (count - 1) / 2;
    world.groundParticles.push({
      x: position.x + spread * 2, y: position.y + (i % 2), groundY: position.y,
      vx: spread * 8 - dx * 8, vy: -7 - dy * 5 - i * 2,
      life: 0.22 + i * 0.07, age: 0, color: colors[i % colors.length],
    });
  }
  if (world.groundParticles.length > 60) world.groundParticles.splice(0, world.groundParticles.length - 60);
}

export function updateGroundParticles(world, dt) {
  for (const particle of world.groundParticles) {
    particle.age += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
  world.groundParticles = world.groundParticles.filter(particle => particle.age < particle.life);
}

export function recordGroundTravel(world, entity, before, dt, options = {}) {
  const contact = groundContact(entity);
  const dx = entity.position.x - before.x;
  const dy = entity.position.y - before.y;
  const travel = Math.hypot(dx, dy);
  if (travel > 0.001) {
    const previous = Math.hypot(contact.vx, contact.vy);
    const sharplyTurned = previous > 10 && (contact.vx * dx + contact.vy * dy) / (previous * travel) < 0.35;
    const now = world.state.time.seconds;
    if ((sharplyTurned || options.landed || (options.sprint && Math.floor(contact.distance / 13)
      !== Math.floor((contact.distance + travel) / 13))) && now - contact.lastDust > 0.12) {
      emitGroundDust(world, entity.position, dx / travel, dy / travel, options.sprint || options.landed ? 4 : 2);
      contact.lastDust = now;
    }
    contact.distance += travel;
  } else if (options.landed) {
    emitGroundDust(world, entity.position);
  }
  contact.vx = dx / dt;
  contact.vy = dy / dt;
}

export function gaitPhase(entity, stride) {
  return ((entity.ground?.distance || 0) / stride) % 1;
}

export function villagerFrame(entity, frameCount) {
  if (!movingClips.has(entity.animation)) return undefined;
  const stride = entity.animation === 'crawl' ? 14 : villagerGroundTuning.stride;
  return Math.floor(gaitPhase(entity, stride) * frameCount);
}

export function resolveVillagerSpacing(world, dt) {
  const villagers = world.state.villagers.filter(entity => entity.id !== world.heldVillager);
  const { avoidanceRadius, laneWidth } = villagerGroundTuning;
  const positions = new Map(villagers.map(entity => [entity, groundPosition(entity)]));
  for (const [index, entity] of villagers.entries()) {
    const contact = groundContact(entity);
    const origin = positions.get(entity);
    let x = 0;
    let y = 0;
    for (const [i, other] of villagers.entries()) {
      if (other === entity) continue;
      const target = positions.get(other);
      const dx = origin.x - target.x;
      const dy = origin.y - target.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= avoidanceRadius) continue;
      const push = (avoidanceRadius - distance) * 0.7;
      x += push * (distance > 0.001 ? dx / distance : index < i ? -1 : 1);
      y += push * (distance > 0.001 ? dy / distance : 0);
    }
    const speed = Math.hypot(contact.vx, contact.vy);
    if (speed > 2) {
      const dx = -contact.vy / speed;
      const dy = contact.vx / speed;
      const side = x * dx + y * dy;
      const lane = x || y ? (Math.abs(side) < 0.6 ? 3.8 : side) : 0;
      x = dx * lane;
      y = dy * lane;
    }
    const amount = Math.hypot(x, y);
    if (amount > laneWidth) {
      x *= laneWidth / amount;
      y *= laneWidth / amount;
    }
    const ease = 1 - Math.exp(-9 * dt);
    const desired = { x: contact.x + (x - contact.x) * ease, y: contact.y + (y - contact.y) * ease };
    const point = { x: entity.position.x + desired.x, y: entity.position.y + desired.y };
    if (walkable(world.collision, worldToTile(point, world.map.meta.tileSize))) Object.assign(contact, desired);
    else contact.x = contact.y = 0;
  }
}

export function contactVisual(entity, key) {
  const widths = { villager: 14, rabbit: 14, snake: 24, deer: 26, crab: 11, turtle: 23 };
  const width = widths[key];
  if (!width) return null;
  const lift = entity.ground?.lift || 0;
  const hidden = key === 'crab' && entity.animation === 'hide';
  return {
    offsetY: key === 'villager' && movingClips.has(entity.animation) && gaitPhase(entity, villagerGroundTuning.stride) > 0.7
      ? -1 : -Math.round(lift),
    shadowWidth: Math.round(width * (1 - Math.min(0.14, lift * 0.045))),
    shadowHeight: key === 'snake' ? 3 : key === 'deer' ? 5 : 4,
    shadowOpacity: hidden ? 0.24 : 0.38 - Math.min(0.1, lift * 0.022),
  };
}
