export const ATMOSPHERE_CONFIG = {
  dayMinutes: 1440,
  sunriseStart: 300,   // 05:00
  sunriseEnd: 450,     // 07:30
  sunsetStart: 1050,   // 17:30
  sunsetEnd: 1200,     // 20:00
  maxNightDarkness: 0.56,
  nightBaseDarkness: 0.44,
  dawnDuskTintAlpha: 0.2,
  rainOvercastAlpha: 0.16,
  rainDropCount: 135,
  rainSplashCount: 28,
  rainSpeedY: 380,
  rainWindX: -76,
  rainStreakLength: 13,
  lampGlowRadius: 56,
  lampGlowAlpha: 0.24,
  reducedMotion: false,
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hash(n) {
  let x = (n ^ 61) ^ (n >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 4294967296;
}

/**
 * Alpha-composites up to three flat atmosphere tint layers into ONE single RGBA pass,
 * eliminating redundant full-screen fillRect overdraw per frame.
 */
export function blendAtmosphereOverlay(atmosphere) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;

  function over(sr, sg, sb, sa) {
    if (sa <= 0.004) return;
    const outA = sa + a * (1 - sa);
    if (outA <= 0) return;
    r = (sr * sa + r * a * (1 - sa)) / outA;
    g = (sg * sa + g * a * (1 - sa)) / outA;
    b = (sb * sa + b * a * (1 - sa)) / outA;
    a = outA;
  }

  over(28, 46, 68, atmosphere.overcastAlpha);
  if (atmosphere.dawnFactor >= atmosphere.duskFactor) {
    over(244, 154, 92, atmosphere.twilightAlpha);
  } else {
    over(224, 108, 72, atmosphere.twilightAlpha);
  }
  over(11, 20, 46, atmosphere.nightAlpha);

  if (a <= 0.004) return null;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
}

/**
 * Computes smooth day/night lighting parameters from in-game minutes [0..1440) and weather.
 * Uses solar elevation cosine + smoothstep transitions for dawn, day, dusk, and deep night.
 */
export function computeAtmosphere(minutes, weather = 'clear', config = ATMOSPHERE_CONFIG) {
  const m = ((Number(minutes) || 0) % config.dayMinutes + config.dayMinutes) % config.dayMinutes;
  const hour = m / 60;
  const sunElevation = -Math.cos((m / config.dayMinutes) * Math.PI * 2);

  let nightFactor = 0;
  let dawnFactor = 0;
  let duskFactor = 0;

  if (m < config.sunriseStart || m >= config.sunsetEnd) {
    nightFactor = 1;
  } else if (m < config.sunriseEnd) {
    const t = smoothstep(config.sunriseStart, config.sunriseEnd, m);
    nightFactor = 1 - t;
    dawnFactor = Math.sin(t * Math.PI);
  } else if (m >= config.sunsetStart) {
    const t = smoothstep(config.sunsetStart, config.sunsetEnd, m);
    nightFactor = t;
    duskFactor = Math.sin(t * Math.PI);
  }

  const midnightDepth = clamp01(-sunElevation);
  const nightAlpha = nightFactor * (config.nightBaseDarkness
    + (config.maxNightDarkness - config.nightBaseDarkness) * midnightDepth);

  const isRain = weather === 'rain';
  const overcastAlpha = isRain ? config.rainOvercastAlpha * (1 - nightFactor * 0.45) : 0;
  const twilightFactor = Math.max(dawnFactor, duskFactor);
  const twilightAlpha = twilightFactor * config.dawnDuskTintAlpha * (isRain ? 0.5 : 1);
  const lampGlow = smoothstep(0.18, 0.72, nightFactor);

  const phase = nightFactor >= 0.85 ? 'night'
    : dawnFactor > 0.2 ? 'dawn'
      : duskFactor > 0.2 ? 'dusk' : 'day';

  const result = {
    minutes: m,
    hour,
    phase,
    sunElevation,
    nightFactor,
    dawnFactor,
    duskFactor,
    darkness: clamp01(nightAlpha + overcastAlpha * 0.6),
    nightAlpha,
    overcastAlpha,
    twilightAlpha,
    lampGlow,
    isRain,
    overlayStyle: null,
  };
  result.overlayStyle = blendAtmosphereOverlay(result);
  return result;
}

// Single pre-baked offscreen radial glow sprite (reused for every night lamp, zero per-frame gradients).
let warmGlowCanvas = null;
function getWarmGlowSprite() {
  if (warmGlowCanvas || typeof document === 'undefined') return warmGlowCanvas;
  const size = 128;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
  grad.addColorStop(0, 'rgba(255, 212, 130, 1)');
  grad.addColorStop(0.5, 'rgba(255, 200, 112, 0.36)');
  grad.addColorStop(1, 'rgba(255, 190, 96, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  warmGlowCanvas = canvas;
  return warmGlowCanvas;
}

/**
 * Renders world-space warm light pools during dusk/night using a single cached glow bitmap
 * and viewport culling (zero per-frame gradient allocations).
 */
export function drawNightLights(context, world, atmosphere, bounds, config = ATMOSPHERE_CONFIG) {
  if (atmosphere.lampGlow <= 0.01) return;
  const sprite = getWarmGlowSprite();
  if (!sprite) return;
  const { state, map, assets } = world;
  const { tileSize } = map.meta;

  let drew = false;
  function blitLight(x, y, radius, alpha) {
    if (bounds && (x + radius < bounds.left || x - radius > bounds.right
      || y + radius < bounds.top || y - radius > bounds.bottom)) return;
    if (!drew) {
      context.save();
      context.globalCompositeOperation = 'screen';
      drew = true;
    }
    context.globalAlpha = alpha;
    context.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  }

  if (state.worldFlags.light_campfire) {
    const camp = world.campObject ??= map.objects.find(object => object.type === 'campfire_site');
    if (camp) {
      const flicker = 1 + Math.sin(state.time.seconds * 9.3) * 0.05 + Math.cos(state.time.seconds * 15.1) * 0.03;
      blitLight(
        camp.anchor.x,
        camp.anchor.y - 6,
        config.lampGlowRadius * 1.3 * flicker,
        config.lampGlowAlpha * 1.15 * atmosphere.lampGlow,
      );
    }
  }

  for (const building of state.buildings) {
    if (building.state !== 'completed') continue;
    const asset = assets.registry.get(`building:${building.type}_${building.state}`);
    if (!asset) continue;
    blitLight(
      building.tile.x * tileSize + asset.metadata.anchor.x,
      building.tile.y * tileSize + asset.metadata.anchor.y - 8,
      config.lampGlowRadius * 0.9,
      config.lampGlowAlpha * 0.82 * atmosphere.lampGlow,
    );
  }

  if (drew) context.restore();
}

// Precomputed deterministic raindrop seeds to avoid recomputing hashes every frame.
const rainSeeds = [];
function ensureRainSeeds(count) {
  for (let i = rainSeeds.length; i < count; i++) {
    rainSeeds.push({
      x: hash(i * 3 + 1),
      y: hash(i * 3 + 2),
      jitter: 0.85 + hash(i * 3 + 3) * 0.35,
      splashCycle: 0.55 + hash(i * 7 + 11) * 0.55,
      splashOffset: hash(i * 7 + 13) * 10,
    });
  }
}

/**
 * Renders deterministic pixel-art rain in screen coordinates using integer fillRect steps
 * (avoids expensive diagonal vector path stroking while staying crisp pixel-art).
 */
export function drawRain(context, width, height, seconds, scale, atmosphere, config = ATMOSPHERE_CONFIG) {
  if (!atmosphere.isRain || width <= 0 || height <= 0) return;
  const t = config.reducedMotion ? 0 : seconds;
  const px = Math.max(1, Math.round(scale));
  const count = config.reducedMotion ? Math.floor(config.rainDropCount * 0.45) : config.rainDropCount;
  ensureRainSeeds(Math.max(count, config.rainSplashCount));

  context.setTransform(1, 0, 0, 1, 0, 0);
  const pad = 32 * scale;
  const spanW = width + pad * 2;
  const spanH = height + pad * 2;
  const split = Math.floor(count * 0.52);
  const isNight = atmosphere.nightFactor > 0.5;

  const layers = [
    { start: 0, end: split, speedMul: 0.78, segH: Math.max(2, Math.round(3 * scale)), fill: isNight ? 'rgba(202,232,248,0.34)' : 'rgba(202,232,248,0.38)' },
    { start: split, end: count, speedMul: 1.18, segH: Math.max(3, Math.round(4 * scale)), fill: isNight ? 'rgba(202,232,248,0.52)' : 'rgba(202,232,248,0.58)' },
  ];

  for (const layer of layers) {
    context.fillStyle = layer.fill;
    const vx = config.rainWindX * scale * layer.speedMul * t;
    const vy = config.rainSpeedY * scale * layer.speedMul * t;
    const segH = layer.segH;
    for (let i = layer.start; i < layer.end; i++) {
      const seed = rainSeeds[i];
      const rx = ((((seed.x * spanW + vx * seed.jitter) % spanW) + spanW) % spanW - pad) | 0;
      const ry = ((((seed.y * spanH + vy * seed.jitter) % spanH) + spanH) % spanH - pad) | 0;
      // 3-step crisp pixel slant (authentic pixel-art rain, pure axis-aligned fillRects).
      context.fillRect(rx, ry, px, segH);
      context.fillRect(rx - px, ry + segH, px, segH);
      context.fillRect(rx - px * 2, ry + segH * 2, px, segH);
    }
  }

  const splashes = config.reducedMotion ? 0 : config.rainSplashCount;
  if (splashes > 0) {
    context.fillStyle = isNight ? 'rgba(218,242,252,0.28)' : 'rgba(218,242,252,0.38)';
    for (let i = 0; i < splashes; i++) {
      const seed = rainSeeds[i];
      const timeVal = t + seed.splashOffset;
      const phase = (timeVal % seed.splashCycle) / seed.splashCycle;
      if (phase > 0.45) continue;
      const bucket = Math.floor(timeVal / seed.splashCycle);
      const sx = (hash(i * 31 + bucket * 17 + 5) * width) | 0;
      const sy = (hash(i * 31 + bucket * 17 + 9) * height) | 0;
      const spread = ((1 + phase * 8) * px) | 0;
      context.fillRect(sx - spread, sy, px, px);
      context.fillRect(sx + spread, sy, px, px);
      if (phase < 0.22) context.fillRect(sx, sy - px, px, px);
    }
  }
}

/**
 * Renders full-screen daylight / dusk / night / rain overcast grading in ONE blended pass.
 */
export function drawAtmosphereOverlay(context, width, height, atmosphere) {
  if (!atmosphere.overlayStyle) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = atmosphere.overlayStyle;
  context.fillRect(0, 0, width, height);
}
