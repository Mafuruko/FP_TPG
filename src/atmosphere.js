import { clamp01, CLOCK_CONFIG, lerp, sampleWeather, smooth, timePeriod } from './climate.js';

export const ATMOSPHERE_CONFIG = {
  ambientStops: [
    [0, [110, 134, 184]], [285, [130, 145, 191]], [350, [196, 162, 194]],
    [390, [255, 211, 187]], [500, [255, 240, 213]], [660, [255, 255, 255]],
    [845, [255, 255, 255]], [940, [255, 238, 207]], [1065, [252, 193, 140]],
    [1140, [210, 160, 176]], [1195, [156, 145, 201]], [1260, [123, 138, 190]],
    [1440, [110, 134, 184]],
  ],
  overcastTint: [168, 189, 220],
  dawnLightFade: [298, 418],
  duskLightFade: [1100, 1230],
  maxShadowOffset: 6,
  cloudCount: 19,
  clearCloudCount: 6,
  cloudZoomRange: [0.74, 1.16],
  rainDropCount: 165,
  rainSplashCount: 35,
  rainSpeed: 365,
  debrisCount: 24,
  lightningIntensity: 0.085,
  reducedMotion: false,
};

export const glowPresets = {
  campfire: { radius: 62, intensity: 0.43, offset: { x: 0, y: -6 } },
  window: { radius: 36, intensity: 0.29, offset: { x: 0, y: -8 } },
  torch: { radius: 39, intensity: 0.36, offset: { x: 0, y: -10 } },
  lantern: { radius: 32, intensity: 0.31, offset: { x: 0, y: -12 } },
};

const wrap = (value, span) => ((value % span) + span) % span;
const between = ([start, end], value) => smooth((value - start) / (end - start));

function hash(n) {
  let x = (n ^ 61) ^ (n >>> 16);
  x = (x + (x << 3)) ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

export function computeAtmosphere(minutes, weather = 'clear', seconds = 0, config = ATMOSPHERE_CONFIG) {
  const m = wrap(minutes, CLOCK_CONFIG.minutesPerDay);
  const stops = config.ambientStops;
  const lower = stops.findLastIndex(([minute]) => m >= minute);
  const [start, base] = stops[lower];
  const [end, next] = stops[lower + 1];
  const conditions = sampleWeather(weather, seconds);
  const t = between([start, end], m);
  const ambient = base.map((channel, i) =>
    Math.round(lerp(channel, next[i], t) * lerp(1, config.overcastTint[i] / 255, conditions.cloud * 0.65)));
  const lampGlow = Math.max(1 - between(config.dawnLightFade, m), between(config.duskLightFade, m));
  const angle = (m - 720) / 1440 * Math.PI * 2;
  const sun = between([-0.15, 0.28], Math.cos(angle));
  const shadow = {
    x: Math.sin(angle) * sun * config.maxShadowOffset,
    y: Math.abs(Math.sin(angle)) * sun * 2,
    stretch: 1 + Math.abs(Math.sin(angle)) * sun * 0.33,
    opacity: lerp(0.35, 1, sun) * (1 - conditions.cloud * 0.27),
  };
  const gust = config.reducedMotion ? 0 : Math.pow(Math.max(0, Math.sin(seconds * 0.34 + 0.5 * Math.sin(seconds * 0.19))), 6);
  return {
    ...conditions, phase: timePeriod(m), ambient, lampGlow, shadow, gust,
    overlayStyle: ambient.every(channel => channel === 255) ? null : `rgb(${ambient.join(',')})`,
  };
}

export function drawAtmosphereOverlay(context, width, height, atmosphere) {
  if (!atmosphere.overlayStyle) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'multiply';
  context.fillStyle = atmosphere.overlayStyle;
  context.fillRect(0, 0, width, height);
  context.restore();
}

export function drawDistantLightning(context, width, height, rain, seconds, config = ATMOSPHERE_CONFIG) {
  if (rain < 0.86 || config.reducedMotion || config.lightningIntensity <= 0) return;
  const cycle = Math.floor(seconds / 47);
  const age = seconds - (cycle * 47 + 12 + hash(cycle + 405) * 30);
  if (age < 0 || age > 0.42) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = Math.sin(Math.PI * age / 0.42) * config.lightningIntensity;
  context.fillStyle = '#d4e0ee';
  context.fillRect(0, 0, width, height);
  context.restore();
}

let lightMask;
function glowMask() {
  if (lightMask) return lightMask;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffd18a';
  const midX = canvas.width / 2;
  const midY = canvas.height / 2;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const dx = (x + 0.5 - midX) / midX;
      const dy = (y + 0.5 - midY) / midY;
      const radius = Math.hypot(dx, dy);
      const alpha = Math.floor(smooth(1 - radius) * 16) / 16;
      if (alpha <= 0) continue;
      context.globalAlpha = alpha;
      context.fillRect(x, y, 1, 1);
    }
  }
  lightMask = canvas;
  return canvas;
}

const cloudShapes = [
  [[10, 15, 9, 5], [20, 12, 10, 7], [29, 10, 11, 8], [38, 15, 9, 5]],
  [[9, 16, 8, 4], [16, 12, 10, 8], [26, 14, 11, 7], [36, 13, 10, 6]],
  [[11, 15, 10, 5], [21, 11, 11, 7], [27, 13, 9, 7], [36, 12, 11, 8]],
];
const cloudArt = [];

function cloudSprite(shape, layer) {
  cloudArt[shape] ??= {};
  if (cloudArt[shape][layer]) return cloudArt[shape][layer];
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 24;
  const context = canvas.getContext('2d');
  const lobes = cloudShapes[shape];
  const shadow = layer === 'shadow';
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const distance = Math.min(...lobes.map(([cx, cy, rx, ry]) => Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)));
      if (distance > 1) continue;
      if (shadow) {
        context.globalAlpha = distance > 0.9 ? 0.27 : distance > 0.76 ? 0.62 : 1;
        context.fillStyle = '#233451';
      } else {
        const shadeLine = 14 + Math.round(Math.sin(x * 0.21 + shape) * 2);
        context.fillStyle = y > shadeLine + 2 ? '#b9ced9'
          : y > shadeLine ? '#d9e6eb' : y < 9 || distance > 0.84 ? '#fffdf3' : '#eff4f2';
      }
      context.fillRect(x, y, 1, 1);
    }
  }
  cloudArt[shape][layer] = canvas;
  return canvas;
}

export function sampleClouds({ pixelWidth, pixelHeight }, atmosphere, seconds, zoom, config = ATMOSPHERE_CONFIG) {
  const time = config.reducedMotion ? 0 : seconds;
  const bodyVisibility = 1 - between(config.cloudZoomRange, zoom);
  const columns = 5;
  const rows = Math.ceil(config.cloudCount / columns);
  const padding = 200;
  const spanX = pixelWidth + padding * 2;
  const spanY = pixelHeight + padding * 2;
  const clouds = [];
  for (let i = 0; i < config.cloudCount; i++) {
    const density = i < config.clearCloudCount ? 1 : smooth(atmosphere.cloud * config.cloudCount - (i - config.clearCloudCount));
    if (density <= 0) continue;
    const column = i % columns;
    const row = (Math.floor(i / columns) + column * 2) % rows;
    const px = wrap(padding + (column + 0.18 + hash(i + 3) * 0.65) * pixelWidth / columns + time * (1.8 + hash(i + 4) * 2.1), spanX);
    const py = wrap(padding + (row + 0.18 + hash(i + 57) * 0.65) * pixelHeight / rows + time * (0.4 + hash(i + 21) * 0.7), spanY);
    const fade = smooth(Math.min(px, spanX - px, py, spanY - py) / 120) * density;
    const width = Math.round(128 + hash(i + 90) * 114);
    const height = Math.round(width * 0.49);
    const altitude = 58 + hash(i + 77) * 70;
    const x = px - padding - width / 2;
    const y = py - padding - height / 2;
    clouds.push({
      shape: i % cloudShapes.length,
      body: { x: Math.round(x), y: Math.round(y - altitude), width, height,
        opacity: fade * bodyVisibility * lerp(0.81, 0.67, atmosphere.rain) },
      shadow: { x: Math.round(x + atmosphere.shadow.x * altitude / 19),
        y: Math.round(y + height * 0.14 + atmosphere.shadow.y * altitude / 19),
        width, height: Math.round(height * 0.8),
        opacity: fade * lerp(0.14, 0.23, atmosphere.cloud) * atmosphere.shadow.opacity },
    });
  }
  return clouds;
}

export function drawCloudLayer(context, clouds, bounds, layer) {
  context.save();
  for (const cloud of clouds) {
    const { x, y, width, height, opacity } = cloud[layer];
    if (opacity < 0.005 || x + width < bounds.left || y + height < bounds.top || x > bounds.right || y > bounds.bottom) continue;
    context.globalAlpha = opacity;
    context.drawImage(cloudSprite(cloud.shape, layer), x, y, width, height);
  }
  context.restore();
}

const authoredLights = new WeakMap();
export function drawNightLights(context, world, atmosphere, bounds, config = ATMOSPHERE_CONFIG) {
  if (atmosphere.lampGlow <= 0.005) return;
  const { state, map, assets } = world;
  if (!authoredLights.has(map)) {
    authoredLights.set(map, map.objects.filter(object => object.glow || object.type === 'campfire_site'));
  }
  const sprite = glowMask();
  const seconds = config.reducedMotion ? 0 : state.time.seconds;

  function drawGlow(position, spec, seed) {
    if (spec === false || (spec.requiresFlag && !state.worldFlags[spec.requiresFlag])) return;
    const { radius, intensity, offset } = { ...glowPresets[spec.preset], ...spec };
    if (!(radius > 0 && intensity > 0)) return;
    const x = Math.round(position.x + (offset?.x ?? 0));
    const y = Math.round(position.y + (offset?.y ?? 0));
    if (x + radius < bounds.left || x - radius > bounds.right || y + radius < bounds.top || y - radius > bounds.bottom) return;
    const flicker = 1 + Math.sin(seconds * 4.8 + seed) * 0.037 + Math.sin(seconds * 8.3 + seed) * 0.019;
    context.globalAlpha = clamp01(atmosphere.lampGlow * intensity * flicker);
    const r = Math.round(radius);
    context.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  }

  context.save();
  context.globalCompositeOperation = 'lighter';
  for (const object of authoredLights.get(map)) {
    drawGlow(object.anchor, object.glow ?? { preset: 'campfire', requiresFlag: 'light_campfire' }, object.anchor.x);
  }
  for (const building of state.buildings) {
    if (building.state !== 'completed') continue;
    const asset = assets.registry.get(`building:${building.type}_completed`);
    if (!asset) continue;
    const { anchor } = asset.metadata;
    const { tileSize } = map.meta;
    const point = { x: building.tile.x * tileSize + anchor.x, y: building.tile.y * tileSize + anchor.y };
    drawGlow(point, building.glow ?? asset.metadata.glow ?? { preset: 'window' }, point.x);
  }
  context.restore();
}

const rainSeeds = [];
export function drawRain(context, width, height, seconds, scale, atmosphere, config = ATMOSPHERE_CONFIG) {
  const strength = atmosphere.rain;
  if (strength < 0.005 || width <= 0 || height <= 0) return;
  const time = config.reducedMotion ? 0 : seconds;
  const pixel = Math.max(1, Math.round(scale));
  const density = config.rainDropCount * strength * (config.reducedMotion ? 0.45 : 1);
  const pad = 22 * scale;
  const spanW = width + 2 * pad;
  const spanH = height + 2 * pad;
  const wind = atmosphere.wind + atmosphere.gust * 0.28;
  const drift = -time * 42 - 22 * Math.sin(time * 0.34);
  const speed = config.rainSpeed * time;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#c8e3ef';
  for (let i = 0; i < Math.ceil(density); i++) {
    rainSeeds[i] ??= [hash(i * 5 + 1), hash(i * 5 + 2), 0.8 + hash(i * 5 + 3) * 0.45];
    const [sx, sy, rate] = rainSeeds[i];
    const x = Math.round(wrap(sx * spanW + drift * scale * rate, spanW) - pad);
    const y = Math.round(wrap(sy * spanH + speed * scale * rate, spanH) - pad);
    const length = Math.max(4, Math.round((6 + rate * 4) * scale));
    context.globalAlpha = Math.min(1, density - i) * (0.24 + strength * 0.22) * rate;
    let start = 0;
    let lastSlant = 0;
    for (let row = pixel; row < length; row += pixel) {
      const slant = Math.round((row / pixel) * wind * 0.38) * pixel;
      if (slant === lastSlant) continue;
      context.fillRect(x - lastSlant, y + start, pixel, row - start);
      lastSlant = slant;
      start = row;
    }
    context.fillRect(x - lastSlant, y + start, pixel, length - start);
  }
  context.restore();
}

function weatherCells(map, bounds, count, seconds, rate, margin, draw) {
  if (count <= 0) return;
  const { pixelWidth, pixelHeight, tileSize } = map.meta;
  const spacing = Math.sqrt(pixelWidth * pixelHeight / count);
  const firstX = Math.max(0, Math.floor((bounds.left - margin) / spacing));
  const firstY = Math.max(0, Math.floor((bounds.top - margin) / spacing));
  const lastX = Math.ceil(Math.min(pixelWidth, bounds.right + margin) / spacing);
  const lastY = Math.ceil(Math.min(pixelHeight, bounds.bottom + margin) / spacing);
  for (let row = firstY; row < lastY; row++) {
    for (let col = firstX; col < lastX; col++) {
      const seed = (row * 59 + col) * 173;
      const t = seconds * rate + hash(seed + 17) * 14;
      const cycle = seed + Math.floor(t) * 53;
      const x = Math.floor((col + hash(cycle + 31)) * spacing);
      const y = Math.floor((row + hash(cycle + 74)) * spacing);
      const terrain = map.terrainGrid[Math.floor(y / tileSize)]?.[Math.floor(x / tileSize)];
      if (!terrain) continue;
      const water = map.waterBodyGrid[Math.floor(y / tileSize)]?.[Math.floor(x / tileSize)];
      draw(x, y, t % 1, hash(cycle + 19), terrain, water);
    }
  }
}

export function drawWeatherParticles(context, map, bounds, atmosphere, seconds, config = ATMOSPHERE_CONFIG) {
  if (config.reducedMotion) return;
  const wind = atmosphere.wind * atmosphere.gust;
  if (atmosphere.rain > 0.01) {
    weatherCells(map, bounds, config.rainSplashCount * 3, seconds, 1.7, 5, (x, y, age, seed, terrain, water) => {
      const strength = clamp01((atmosphere.rain - seed * 0.92) * 6);
      if (age >= 0.42 || !strength) return;
      context.globalAlpha = (1 - age / 0.42) * strength * (water ? 0.65 : 0.48);
      context.fillStyle = water ? '#c7e6ee' : '#b8c2b6';
      const spread = 1 + Math.floor(age * (water ? 10 : 5));
      context.fillRect(x - spread, y, water ? 2 : 1, 1);
      context.fillRect(x + spread, y, water ? 2 : 1, 1);
      if (age < 0.16) context.fillRect(x, y - 2, 1, 1);
    });
  }
  if (wind > 0.14) {
    weatherCells(map, bounds, config.debrisCount, seconds, 0.65, 45, (x, y, age, seed, terrain, water) => {
      if (water) return;
      context.globalAlpha = Math.sin(age * Math.PI) * clamp01((wind - 0.14 - seed * 0.45) * 1.4) * 0.69;
      context.fillStyle = terrain === 'sand' ? '#e6ca91' : '#a5b66b';
      context.fillRect(x - Math.round(age * 42), y - Math.round(age * 5 + Math.sin(age * 13) * 2), terrain === 'sand' ? 1 : 2, 1);
    });
  }
  context.globalAlpha = 1;
}
