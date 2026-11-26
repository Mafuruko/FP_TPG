import { ATMOSPHERE_CONFIG, computeAtmosphere, drawAtmosphereOverlay, drawCloudShadows,
  drawDistantLightning, drawNightLights, drawRain, drawWeatherParticles } from './atmosphere.js';
import { tileToWorld, worldToTile } from './geometry.js';
import { birdVisuals } from './birds.js';
import { dolphinVisuals } from './dolphin.js';
import { fishVisuals, waterAt } from './fish.js';
import { contactVisual, groundPosition, villagerFrame } from './ground.js';
import { turtleVisuals } from './turtle.js';
import { jobVisual, recolorSvgToGold } from './villagers.js';
import { wildlifeOpacity } from './wildlife-director.js';
import { findBestDragOrigin, STORY_CONFIG } from './story.js';
import { smooth } from './climate.js';

export const RENDER_CONFIG = {
  maxDpr: 1.5,
  cullMarginPx: 64,
  villagerHitPadPx: 11,
};

function memorialSvg(tended) {
  const flowers = tended
    ? '<rect x="3" y="13" width="2" height="2" fill="#e97f8d"/><rect x="11" y="13" width="2" height="2" fill="#f3d66d"/><rect x="7" y="14" width="2" height="1" fill="#7cb868"/>'
    : '<rect x="4" y="14" width="2" height="1" fill="#5e7f4f"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="18" viewBox="0 0 16 18" shape-rendering="crispEdges">
    <rect x="2" y="13" width="12" height="4" fill="#3a2d24"/>
    <rect x="3" y="12" width="10" height="4" fill="#7c7a74"/>
    <rect x="4" y="13" width="8" height="2" fill="#9e9b93"/>
    <rect x="4" y="4" width="8" height="9" fill="#3a2d24"/>
    <rect x="5" y="3" width="6" height="1" fill="#3a2d24"/>
    <rect x="5" y="4" width="6" height="9" fill="#9a9891"/>
    <rect x="6" y="4" width="4" height="2" fill="#bebbb2"/>
    <rect x="6" y="7" width="4" height="1" fill="#5c5952"/>
    <rect x="6" y="9" width="3" height="1" fill="#5c5952"/>
    <rect x="5" y="5" width="1" height="2" fill="#6b8f55"/>
    <rect x="10" y="9" width="1" height="3" fill="#6b8f55"/>
    ${flowers}
  </svg>`;
}

const GRAVE_ASSET_PLAIN = { id: 'memorial_plain', width: 16, height: 18, anchor: { x: 8, y: 16 }, svg: () => memorialSvg(false) };
const GRAVE_ASSET_TENDED = { id: 'memorial_tended', width: 16, height: 18, anchor: { x: 8, y: 16 }, svg: () => memorialSvg(true) };

export const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
export const debugOptions = {
  grid: 'Tile grid', coords: 'Tile coordinates', walk: 'Walkable', collision: 'Collision',
  build: 'Buildable', farm: 'Farmable', fishing: 'Fishing stands', targets: 'Fishing water targets',
  ids: 'Object IDs', interactions: 'Interaction points', anchors: 'Entity anchors',
  depth: 'Depth positions', habitats: 'Wildlife habitats', collectibles: 'Collectible zones',
};

function frameAt(animation, seconds) {
  const frame = Math.floor(seconds * animation.fps);
  return animation.loop === false ? Math.min(frame, animation.frameCount - 1) : frame % animation.frameCount;
}

export function butterflyHover(entity, seconds, flap) {
  const { x, y } = entity.position;
  const seed = entity.tile.x * 0.58 + entity.tile.y * 0.91;
  const orbit = seconds * 1.1 + seed;
  const glideCycle = (seconds + seed * 0.23) % 1.35;
  return {
    position: {
      x: Math.round(x + 5 * Math.sin(orbit) + 1.1 * Math.sin(orbit * 2)),
      y: Math.round(y - 2 + 2.35 * Math.cos(orbit * 2 + 0.3) + 0.65 * Math.sin(orbit)),
    },
    frame: glideCycle < flap.frameCount / flap.fps ? frameAt(flap, glideCycle) : 0,
  };
}

export function createRenderer(canvas, world, camera, view) {
  const context = canvas.getContext('2d', { alpha: false });
  const { map, assets, state } = world;
  const { tileSize, pixelWidth, pixelHeight } = map.meta;
  const images = new Map();
  const bitmaps = new Map();
  const spriteVariants = new WeakMap();
  const hitMasks = new WeakMap();
  const maskCanvas = document.createElement('canvas');
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  const overlay = document.createElement('canvas');
  overlay.width = pixelWidth;
  overlay.height = pixelHeight;
  let overlayKey = null;
  let hits = [];

  function bakeBitmap(key, img) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = img.naturalWidth;
      offscreen.height = img.naturalHeight;
      const offCtx = offscreen.getContext('2d');
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(img, 0, 0);
      bitmaps.set(key, offscreen);
    } catch {
      // Fall back to direct image draw if rasterization fails.
    }
  }

  function image(key, makeSvg) {
    const baked = bitmaps.get(key);
    if (baked) return baked;
    let img = images.get(key);
    if (!img) {
      img = new Image();
      const svg = makeSvg();
      const isBlob = svg.length > 40000;
      const src = isBlob ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : svgUrl(svg);
      img.onload = () => {
        bakeBitmap(key, img);
        if (isBlob) URL.revokeObjectURL(src);
      };
      img.onerror = () => {
        if (isBlob) URL.revokeObjectURL(src);
      };
      img.src = src;
      images.set(key, img);
    } else if (img.complete && img.naturalWidth) {
      bakeBitmap(key, img);
      return bitmaps.get(key) || img;
    }
    return img;
  }

  function isReady(source) {
    return source instanceof HTMLCanvasElement ? source.width > 0 : Boolean(source.complete && source.naturalWidth);
  }

  function drawImage(source, x, y) {
    if (isReady(source)) context.drawImage(source, Math.round(x), Math.round(y));
  }

  function describeSprite(entity, asset, options, position, hit) {
    const x = Math.round(position.x - asset.anchor.x);
    const y = Math.round(position.y - asset.anchor.y);
    return { entity, asset, options, x, y, depth: position.y, position, hit };
  }

  function spriteCacheKey(asset, options) {
    if (!options) return asset.id;
    const cfg = options.config;
    const cfgKey = cfg
      ? [cfg.seed, cfg.lifeStage, cfg.heldObject, cfg.expression, cfg.bodyStyle, cfg.skinTone,
        cfg.hairStyle, cfg.hairColor, cfg.clothingStyle, cfg.primaryColor, cfg.secondaryColor, cfg.accessories?.join(',')].join('|')
      : '';
    return `${asset.id}|${cfgKey}|${options.direction ?? ''}|${options.animation ?? ''}|${options.frame ?? ''}|${options.shadow ?? ''}|${options.rank ?? ''}|${options.golden ? 'gold' : ''}`;
  }

  function paintSprite(sprite, bounds) {
    const { entity, asset, options, x, y, hit } = sprite;
    if (bounds && (x + asset.width < bounds.left || y + asset.height < bounds.top
      || x > bounds.right || y > bounds.bottom)) return;
    if (sprite.opacity === 0) return;
    const key = spriteCacheKey(asset, options);
    const spriteImage = image(key, () => options?.golden ? recolorSvgToGold(asset.svg(options)) : asset.svg(options));
    const ready = isReady(spriteImage);
    const faded = sprite.opacity < 1;
    if (faded) context.globalAlpha = sprite.opacity;
    if (sprite.impact && ready) {
      const { wide, tall } = sprite.impact;
      context.drawImage(spriteImage, x - wide / 2, y - tall, asset.width + wide, asset.height + tall);
    } else if (sprite.sway) drawSway(spriteImage, sprite);
    else if (sprite.angle || sprite.aquatic?.tint) drawSpriteVariant(spriteImage, sprite);
    else if (ready) context.drawImage(spriteImage, x, y);
    if (faded) context.globalAlpha = 1;
    if (hit && ready) {
      hits.push({ entity, x, y, width: asset.width, height: asset.height, hit, image: spriteImage, sway: sprite.sway,
        butterfly: hit === 'collectible' && asset.category === 'butterfly' ? sprite.position : null });
    }
  }

  function drawSway(source, sprite) {
    if (!isReady(source)) return;
    const { x, y, sway, asset: { width, height } } = sprite;
    if (!sway) {
      context.drawImage(source, x, y);
      return;
    }
    const band = Math.floor(height / 3);
    context.drawImage(source, 0, 0, width, band, x + sway, y, width, band);
    context.drawImage(source, 0, band, width, band, x + Math.trunc(sway / 2), y + band, width, band);
    context.drawImage(source, 0, band * 2, width, height - band * 2, x, y + band * 2, width, height - band * 2);
  }

  function drawSpriteVariant(source, sprite) {
    if (!isReady(source)) return;
    const { asset, x, y, angle } = sprite;
    const { width, height, anchor: { x: center } } = asset;
    const tint = sprite.aquatic?.tint;
    const key = `${angle || 0}|${tint?.color || ''}|${tint?.alpha || 0}`;
    if (!spriteVariants.has(source)) spriteVariants.set(source, new Map());
    const variants = spriteVariants.get(source);
    if (!variants.has(key)) {
      const pitch = Math.tan(angle * Math.PI / 180);
      const margin = Math.ceil(Math.max(center, width - center) * Math.abs(pitch));
      const layer = document.createElement('canvas');
      layer.width = width;
      layer.height = height + margin * 2;
      const pixels = layer.getContext('2d');
      // Offset whole source columns at native resolution before scaling with the camera.
      if (angle) {
        for (let column = 0; column < width; column++) {
          const offset = Math.round((column - center) * pitch);
          pixels.drawImage(source, column, 0, 1, height, column, margin + offset, 1, height);
        }
      } else pixels.drawImage(source, 0, 0);
      if (tint) {
        pixels.globalCompositeOperation = 'source-atop';
        pixels.globalAlpha = tint.alpha;
        pixels.fillStyle = tint.color;
        pixels.fillRect(0, 0, layer.width, layer.height);
      }
      variants.set(key, { layer, margin });
    }
    const { layer, margin } = variants.get(key);
    context.drawImage(layer, x, y - margin);
  }

  function drawContactShadow(sprite, shadow, color, sun) {
    const { shadowWidth, shadowHeight, shadowOpacity } = shadow;
    const width = Math.round(shadowWidth * (sun?.stretch ?? 1));
    const left = Math.round(sprite.position.x + (sun?.x ?? 0) - width / 2);
    const top = Math.round(sprite.position.y + (sun?.y ?? 0) - shadowHeight / 2);
    context.fillStyle = color;
    context.globalAlpha = shadowOpacity * (sprite.opacity ?? 1) * (sun?.opacity ?? 1);
    for (let row = 0; row < shadowHeight; row++) {
      const inset = row === 0 || row === shadowHeight - 1 ? Math.round(width / 5) : 0;
      context.fillRect(left + inset, top + row, width - inset * 2, 1);
    }
    context.globalAlpha = 1;
  }

  function drawGroundParticle(particle) {
    context.fillStyle = particle.color;
    context.globalAlpha = (1 - particle.age / particle.life) * 0.86;
    context.fillRect(Math.round(particle.x), Math.round(particle.y), 1, particle.age < 0.09 ? 2 : 1);
    context.globalAlpha = 1;
  }

  function objects(bounds) {
    const list = [];
    const margin = RENDER_CONFIG.cullMarginPx;
    for (const object of map.objects) {
      if (bounds) {
        const ax = object.anchor.x;
        const ay = object.anchor.y;
        if (ax + margin < bounds.left || ax - margin > bounds.right
          || ay + margin < bounds.top || ay - margin * 2 > bounds.bottom) continue;
      }
      const current = state.objects[object.id];
      const asset = assets.registry.get(current.art || object.states?.[current.state] || object.assetId);
      list.push(describeSprite(object, asset, undefined, object.anchor, object.decorative ? null : 'object'));
    }
    return list;
  }

  function villagers() {
    return state.villagers.map(entity => {
      const config = { ...entity.appearance, name: entity.name, lifeStage: entity.lifeStage };
      const reveal = view.mode === 'playing' && world.collectibleReveals?.get(entity.id);
      const { animations } = assets.villager;
      const animation = reveal ? ['collectLift', 'pickup', 'idle'].find(clip => animations[clip]) : entity.animation;
      if (reveal) config.expression = 'surprised';
      const definition = animations[animation];
      const skill = jobVisual(entity);
      const tier = skill?.tier ?? 0;
      if (tier && animation === 'gather' && !config.accessories.includes('bag')) config.accessories = [...config.accessories, 'bag'];
      const fps = assets.characterFps(animation, config) / (skill && entity.work.phase === 'work' ? skill.rank.workTime : 1);
      const grab = entity.work?.job === 'collect' && entity.work.phase === 'work';
      const grabDuration = entity.work?.grabDuration ?? 3.2;
      const frame = reveal ? Math.min(Math.floor(reveal.age * 9), definition.frameCount - 1)
        : grab ? Math.max(0, Math.min(Math.floor((1 - entity.work.remaining / grabDuration) * definition.frameCount), definition.frameCount - 1))
          : villagerFrame(entity, definition.frameCount) ?? frameAt({ ...definition, fps }, state.time.seconds);
      const sprite = describeSprite(entity, assets.villager, {
        config, animation, direction: reveal ? 'front' : entity.direction, frame,
        shadow: false, rank: tier, golden: Boolean(entity.special?.golden),
      }, groundPosition(entity), 'villager');
      sprite.ground = contactVisual(entity, 'villager');
      sprite.reveal = reveal;
      sprite.y += sprite.ground.offsetY;
      const landingAge = state.time.seconds - entity.landedAt;
      if (landingAge >= 0 && landingAge < 0.19) {
        sprite.impact = landingAge < 0.085 ? { wide: 2, tall: -3 } : { wide: -2, tall: 1 };
        if (landingAge >= 0.085) sprite.y -= 1;
      }
      return sprite;
    });
  }

  function drawCollectibleReveal(sprite) {
    const { assetId, age, duration } = sprite.reveal;
    const asset = assets.registry.get(assetId);
    const rarity = assets.collectibleRarities[asset.rarity];
    const x = sprite.position.x;
    const head = { adult: 7, elder: 9, child: 13 }[sprite.entity.lifeStage] ?? 13;
    const top = sprite.y + head + 4 - Math.round(17 * smooth(age / 0.28));
    const frame = frameAt(asset.animations.fx, Math.max(0, age - 0.23));
    context.save();
    context.globalAlpha = smooth((duration - age) / 0.22);
    const raised = age >= 0.22;
    const source = raised ? image(`reveal:${assetId}:${frame}`, () => asset.svg({ animation: 'fx', frame }))
      : image(`reveal:${assetId}`, () => asset.svg());
    drawImage(source, x - asset.width / 2, top);
    if (raised) {
      const sparkleX = Math.round(x + (frame % 2 === 0 ? 10 : -10));
      const sparkleY = Math.round(top + 4 + frame % 2 * 5);
      context.fillStyle = rarity.color;
      context.fillRect(sparkleX - 1, sparkleY, 3, 1);
      context.fillRect(sparkleX, sparkleY - 1, 1, 3);
      context.font = 'bold 7px monospace';
      context.textAlign = 'center';
      const width = Math.ceil(context.measureText(rarity.label).width) + 8;
      context.fillStyle = '#30251d';
      context.fillRect(Math.round(x - width / 2), Math.round(top - 12), width, 10);
      context.fillStyle = rarity.color;
      context.fillText(rarity.label, Math.round(x), Math.round(top - 5));
    }
    context.restore();
  }

  function buildings() {
    return state.buildings.map(entity => {
      const asset = assets.registry.get(`building:${entity.type}_${entity.state}`);
      const { anchor } = asset.metadata;
      const position = { x: entity.tile.x * tileSize + anchor.x, y: entity.tile.y * tileSize + anchor.y };
      return describeSprite(entity, asset, undefined, position, 'building');
    });
  }

  function creatures() {
    return state.wildlife.map(entity => {
      const asset = assets.registry.get(entity.assetId);
      const animation = entity.animation;
      const aquatic = fishVisuals(entity) || dolphinVisuals(entity) || turtleVisuals(entity);
      const sprite = describeSprite(entity, asset, {
        animation, direction: entity.direction,
        frame: entity.land?.frame ?? aquatic?.frame ?? entity.bird?.animationFrame ?? frameAt(asset.animations[animation],
          entity.bird ? entity.bird.animTime ?? 0 : state.time.seconds),
      }, entity.position);
      const bird = birdVisuals(entity, asset);
      sprite.opacity = wildlifeOpacity(entity);
      sprite.y += entity.ecology?.sink || 0;
      const motion = entity.ecology?.motion;
      if (motion?.propId && (motion.fading || motion.kind === 'arrive' && sprite.opacity < 0.55)) {
        const prop = world.objects.get(motion.propId);
        if (prop) sprite.depth = Math.min(sprite.depth, prop.anchor.y - 0.1);
      }
      if (bird) {
        sprite.bird = bird;
        sprite.y -= bird.altitude;
        sprite.angle = bird.angle;
      }
      if (aquatic) {
        sprite.aquatic = aquatic;
        sprite.x += aquatic.offsetX ?? 0;
        sprite.y += aquatic.offsetY;
        sprite.angle = aquatic.bank;
      }
      if (entity.land) {
        sprite.ground = contactVisual(entity, asset.key);
        sprite.y += sprite.ground.offsetY;
      }
      if (entity.turtle && aquatic.contact > 0) {
        sprite.ground = contactVisual(entity, asset.key);
        sprite.ground.shadowOpacity *= aquatic.contact;
      }
      return sprite;
    });
  }

  function paintSubmergedWildlife(sprite) {
    const { x, y, asset, aquatic } = sprite;
    const start = worldToTile({ x, y: y - 4 }, tileSize);
    const end = worldToTile({ x: x + asset.width - 1, y: y + asset.height + 3 }, tileSize);
    context.save();
    context.beginPath();
    for (let ty = start.y; ty <= end.y; ty++) {
      for (let tx = start.x; tx <= end.x; tx++) {
        const point = tileToWorld({ x: tx, y: ty }, tileSize);
        if (waterAt(map, point) === aquatic.water && (!aquatic.deepOnly || map.terrainGrid[ty][tx] === 'deep_water')) {
          context.rect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        }
      }
    }
    context.clip();
    paintSprite(sprite);
    context.restore();
  }

  function drawFishParticles(splash) {
    context.save();
    context.fillStyle = splash ? '#dbf6fc' : '#bce9ee';
    for (const particle of world.fishParticles) {
      if ((particle.kind === 'splash') !== splash) continue;
      const x = Math.round(particle.x + Math.sin(particle.age * 8 + particle.phase) * (splash ? 0 : 1.4));
      const y = Math.round(particle.y);
      if (!splash && waterAt(map, { x, y }) !== particle.water) continue;
      context.globalAlpha = (1 - particle.age / particle.life) * (splash ? 0.9 : 0.72);
      context.fillRect(x, y, particle.size, 1);
      if (particle.size === 2) context.fillRect(x, y + 1, 1, 1);
    }
    context.restore();
  }

  function drawShoreRipples() {
    context.save();
    context.fillStyle = '#d9f1ec';
    for (const ripple of world.shoreRipples) {
      const progress = ripple.age / ripple.life;
      const radius = 3 + Math.round(progress * 11);
      context.globalAlpha = (1 - progress) * 0.73;
      for (let x = -radius; x <= radius; x += 2) {
        const edge = Math.round(Math.sqrt(1 - (x / radius) ** 2) * radius * 0.43);
        for (const o of new Set([-edge, edge])) {
          const pixel = { x: Math.round(ripple.x + x), y: Math.round(ripple.y + o) };
          if (waterAt(map, pixel) === 'ocean_001') context.fillRect(pixel.x, pixel.y, 1, 1);
        }
      }
    }
    context.restore();
  }

  function drawFishingActivity(bounds) {
    if (!state.abilities.fish || (view.mode && view.mode !== 'playing')) return;
    context.save();
    for (const spot of map.fishingSpots) {
      if (spot.requires.includes('bridge_repaired') && !state.worldFlags.repair_bridge) continue;
      const tile = spot.waterTarget;
      const { x, y } = tileToWorld(tile, tileSize);
      if (x + 8 < bounds.left || y + 5 < bounds.top || x - 8 > bounds.right || y - 5 > bounds.bottom) continue;
      const phase = (state.time.seconds / 2.4 + (tile.x * 0.137 + tile.y * 0.271)) % 1;
      const drift = Math.round(Math.sin(phase * Math.PI * 2) * 3);
      const tail = Math.cos(phase * Math.PI * 2) >= 0 ? -2 : 3;
      context.globalAlpha = 0.65;
      context.fillStyle = '#245a6c';
      context.fillRect(x + drift, y, 3, 2);
      context.fillRect(x + drift + tail, y + Math.floor(phase * 8) % 2, 2, 1);
      context.fillStyle = '#d1f2ee';
      for (const progress of [phase, (phase + 0.5) % 1]) {
        const radius = 2 + Math.floor(progress * 5);
        const rise = 1 + Math.floor(progress * 2);
        context.globalAlpha = 0.85 * (1 - progress);
        context.fillRect(x - radius, y - 1, 1, 2);
        context.fillRect(x + radius, y - 1, 1, 2);
        context.fillRect(x - radius + 2, y - rise, radius * 2 - 3, 1);
        context.fillRect(x - radius + 2, y + rise, radius * 2 - 3, 1);
      }
    }
    context.restore();
  }

  function collectibles() {
    return (view.debug ? [...world.collectiblePreviews, ...state.activeCollectibles] : state.activeCollectibles).map(entity => {
      const asset = assets.registry.get(entity.assetId);
      const flight = asset.animations.flap && butterflyHover(entity, state.time.seconds, asset.animations.flap);
      const options = flight ? { animation: 'flap', frame: flight.frame } : undefined;
      return describeSprite(entity, asset, options, flight?.position ?? entity.position, 'collectible');
    });
  }

  function crops() {
    return (state.crops || []).map(crop => {
      const asset = assets.registry.get(`crop_${crop.cropType}_${crop.stage}`);
      const position = { x: (crop.tile.x + 0.5) * tileSize, y: (crop.tile.y + 1) * tileSize };
      return describeSprite(crop, asset, undefined, position, 'crop');
    });
  }

  function drawEffects(bounds) {
    for (const effect of assets.effects) {
      if (effect.id === 'waterfall_flow' && state.worldFlags.open_waterfall_passage) continue;
      const asset = assets.registry.get(effect.id);
      if (bounds && (effect.x + asset.width < bounds.left || effect.y + asset.height < bounds.top
        || effect.x > bounds.right || effect.y > bounds.bottom)) continue;
      const frame = frameAt(asset.animations.default, state.time.seconds);
      drawImage(image(`${effect.id}|${frame}`, () => asset.svg({ frame })), effect.x, effect.y);
    }
  }

  function drawMarker(position, color, radius = 5) {
    context.strokeStyle = '#28251b';
    context.lineWidth = 3;
    context.strokeRect(Math.round(position.x) - radius, Math.round(position.y) - radius, radius * 2, radius * 2);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(Math.round(position.x) - radius, Math.round(position.y) - radius, radius * 2, radius * 2);
  }

  function drawStudioMarker(id, position) {
    const asset = assets.registry.get(id);
    drawImage(image(id, asset.svg), position.x - asset.width / 2, position.y - asset.height / 2);
  }

  function drawPreview() {
    const preview = view.placement;
    if (!preview) return;
    const { origin, asset, tiles, allowed } = preview;
    context.save();
    context.fillStyle = allowed ? '#8fe19065' : '#e77e7065';
    for (const { x, y } of tiles) context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    context.globalAlpha = 0.75;
    drawImage(image(asset.id, asset.svg), origin.x * tileSize, origin.y * tileSize + asset.metadata.sprite.offset.y);
    context.restore();
  }

  function drawDrag(sprite) {
    const { position, landing, target, label, startedAt } = view.drag;
    if (landing) {
      const point = tileToWorld(landing, tileSize);
      drawContactShadow({ position: point }, { shadowWidth: 12, shadowHeight: 4, shadowOpacity: 0.43 }, '#1b1926');
      drawMarker(point, label ? '#e8d180' : '#ddd1ac', 7);
    }
    if (label && target) {
      const box = target.width ? target : { ...tileToWorld(worldToTile(position, tileSize), tileSize), width: 16, height: 16 };
      const left = target.width ? box.x - 1 : box.x - 8;
      const top = target.width ? box.y - 1 : box.y - 8;
      const right = left + box.width + 1;
      const bottom = top + box.height + 1;
      context.fillStyle = '#f9db87';
      for (const x of [left, right]) {
        for (const y of [top, bottom]) {
          context.fillRect(x, y, 1, y === top ? 4 : -4);
          context.fillRect(x, y, x === left ? 4 : -4, 1);
        }
      }
    }
    const { animations } = sprite.asset;
    const fallback = sprite.entity.lifeStage === 'baby' ? 'cry' : 'celebrate';
    const animation = animations.pickup ? 'pickup' : animations[fallback] ? fallback : 'idle';
    const definition = animations[animation];
    const frame = frameAt(definition, Math.max(0, performance.now() - startedAt) / 1000);
    paintSprite(describeSprite(sprite.entity, sprite.asset, {
      ...sprite.options, config: { ...sprite.options.config, heldObject: 'none' },
      animation, frame, direction: 'front', rank: 0,
    }, { x: Math.round(position.x), y: Math.round(position.y) - 8 }));
  }

  function drawDebug(sprites) {
    if (!view.debug) return;
    const on = view.overlays;
    const key = [...on].sort().join(',');
    if (overlayKey !== key) {
      overlayKey = key;
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, pixelWidth, pixelHeight);
      const colorTile = (x, y, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      };
      const habitatColors = ['#ffad6440', '#eebbe250', '#337bfd50', '#77e5fb50', '#4364fe50',
        '#baff8250', '#2aff6050', '#fcba2550', '#f83f5150', '#93f8bc50'];
      map.terrainGrid.forEach((row, y) => row.forEach((_, x) => {
        if (on.has('walk') && !world.collision[y][x]) colorTile(x, y, '#86ff7730');
        if (on.has('collision') && world.collision[y][x]) colorTile(x, y, '#ff556034');
        if (on.has('build') && map.buildableGrid[y][x]) colorTile(x, y, '#f6d65566');
        if (on.has('farm') && map.farmableGrid[y][x]) colorTile(x, y, '#fcb55790');
        if (on.has('grid')) {
          ctx.strokeStyle = '#f4eddd38';
          ctx.strokeRect(x * tileSize + 0.5, y * tileSize + 0.5, tileSize, tileSize);
        }
        if (on.has('coords')) {
          ctx.font = '5px monospace';
          ctx.fillStyle = 'white';
          ctx.fillText(`${x},${y}`, x * tileSize + 1, y * tileSize + 7);
        }
      }));
      if (on.has('habitats')) {
        for (const [index, animal] of assets.animals.entries()) {
          const { habitatTiles } = world;
          for (const { x, y } of habitatTiles.get(animal.id)) colorTile(x, y, habitatColors[index]);
        }
      }
      if (on.has('collectibles')) {
        for (const zone of map.collectibleSpawnZones) for (const [x, y] of zone.tiles) colorTile(x, y, '#ff84ef35');
      }
      for (const spot of map.fishingSpots) {
        if (on.has('fishing')) colorTile(spot.standPosition.x, spot.standPosition.y, '#ffef4c99');
        if (on.has('targets')) colorTile(spot.waterTarget.x, spot.waterTarget.y, '#00ddff99');
      }
      if (on.has('interactions')) {
        for (const object of map.objects) {
          for (const point of object.interactionPoints) {
            const p = tileToWorld(point, tileSize);
            ctx.fillStyle = '#fff16a';
            ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
          }
        }
      }
    }
    context.drawImage(overlay, 0, 0);
    for (const sprite of sprites) {
      const { x, y } = sprite.position;
      if (on.has('anchors')) drawMarker(sprite.position, '#ffaccc', 2);
      if (on.has('depth')) {
        context.fillStyle = '#fff6a3';
        context.fillRect(x - 6, y, 12, 1);
      }
      if (on.has('ids')) {
        context.font = '7px monospace';
        context.fillStyle = '#231e1a';
        context.fillText(sprite.entity.id, x + 5, y + 6);
        context.fillStyle = '#fff';
        context.fillText(sprite.entity.id, x + 4, y + 5);
      }
    }
  }

  function render() {
    const dpr = window.devicePixelRatio || 1;
    const scale = view.settings?.integer ? dpr : Math.min(dpr, RENDER_CONFIG.maxDpr);
    const width = Math.round(canvas.clientWidth * scale);
    const height = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const bounds = {
      left: -camera.x / camera.zoom,
      top: -camera.y / camera.zoom,
      right: (canvas.clientWidth - camera.x) / camera.zoom,
      bottom: (canvas.clientHeight - camera.y) / camera.zoom,
    };
    const terrainSource = image('island', assets.terrain.svg);
    const terrainReady = isReady(terrainSource);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#3f7f9c';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.setTransform(camera.zoom * scale, 0, 0, camera.zoom * scale, camera.x * scale, camera.y * scale);
    if (terrainReady) {
      const sx = Math.max(0, Math.floor(bounds.left));
      const sy = Math.max(0, Math.floor(bounds.top));
      const ex = Math.min(pixelWidth, Math.ceil(bounds.right));
      const ey = Math.min(pixelHeight, Math.ceil(bounds.bottom));
      const sw = ex - sx;
      const sh = ey - sy;
      if (sw > 0 && sh > 0) context.drawImage(terrainSource, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    const atmosphere = computeAtmosphere(state.time.minutes, state.weather, state.time.seconds);
    hits = [];
    const scenery = objects(bounds);
    const villagersOnMap = villagers();
    const foreground = [];
    const flatScenery = [];
    const tallScenery = [];
    for (const sprite of scenery) {
      if (!ATMOSPHERE_CONFIG.reducedMotion && (sprite.entity.canopy || sprite.entity.type === 'tall_grass')) {
        const { wind, gust } = atmosphere;
        const phase = state.time.seconds * 1.65 + wind * 2.1 * Math.sin(state.time.seconds * 0.6) + sprite.x * 0.035;
        sprite.sway = Math.round(Math.sin(phase) * (wind * (2.2 + gust * 1.6)));
      }
      if (sprite.entity.canopy) foreground.push(sprite);
      if (sprite.entity.layer === 'ground-decoration' && sprite.entity.type !== 'tall_grass') flatScenery.push(sprite);
      else tallScenery.push(sprite);
    }
    const animals = creatures();
    const overCanopy = sprite => {
      const motion = sprite.entity.ecology?.motion;
      const inCover = motion?.propId && (motion.fading || motion.kind === 'arrive' && sprite.opacity < 0.55);
      return sprite.bird?.altitude >= 18 && !inCover;
    };
    for (const sprite of animals) {
      if (!sprite.aquatic?.submerged) continue;
      if (sprite.ground) drawContactShadow(sprite, sprite.ground, '#224d51');
      paintSubmergedWildlife(sprite);
    }
    drawFishParticles(false);
    const graves = (state.graves || []).map(grave => {
      const asset = grave.tendedCount > 0 ? GRAVE_ASSET_TENDED : GRAVE_ASSET_PLAIN;
      const pos = grave.position || tileToWorld(grave.tile, tileSize);
      return describeSprite(grave, asset, null, pos, 'grave');
    });
    const entities = [...tallScenery,
      ...crops(), ...buildings(), ...graves, ...villagersOnMap.filter(sprite => sprite.entity.id !== view.drag?.id),
      ...animals.filter(sprite => !overCanopy(sprite) && !sprite.aquatic?.submerged), ...collectibles()];
    for (const sprite of flatScenery) paintSprite(sprite, bounds);
    for (const sprite of animals) if (sprite.bird) drawContactShadow(sprite, sprite.bird, '#1b1926', atmosphere.shadow);
    const terrainEffects = world.groundParticles.map(particle => ({ particle, depth: particle.groundY, x: particle.x }));
    for (const item of [...entities, ...terrainEffects].sort((a, b) => a.depth - b.depth || a.x - b.x)) {
      if (item.particle) drawGroundParticle(item.particle);
      else {
        if (item.ground) drawContactShadow(item, item.ground, '#302a23', atmosphere.shadow);
        paintSprite(item, bounds);
      }
    }
    for (const sprite of foreground) {
      drawSway(image(`canopy:${sprite.asset.id}`, () => assets.canopySvg(sprite.asset.id)), sprite);
    }
    drawEffects(bounds);
    drawShoreRipples();
    drawFishingActivity(bounds);
    drawFishParticles(true);
    for (const sprite of animals) if (overCanopy(sprite)) paintSprite(sprite, bounds);
    drawCloudShadows(context, map, bounds, atmosphere, state.time.seconds);
    drawWeatherParticles(context, map, bounds, atmosphere, state.time.seconds);
    drawAtmosphereOverlay(context, width, height, atmosphere);
    drawNightLights(context, world, atmosphere, bounds);
    drawRain(context, width, height, state.time.seconds, scale, atmosphere);
    if (view.settings?.lightning) drawDistantLightning(context, width, height, atmosphere.rain, state.time.seconds);
    if (view.mode && view.mode !== 'playing') return;
    drawPreview();
    const sprites = [...flatScenery, ...entities];
    drawDebug(sprites);
    const selected = sprites.find(sprite => sprite.entity.id === view.selectedVillager);
    if (selected) {
      drawStudioMarker('marker_selection_ring', selected.position);
      const destination = selected.entity.route.at(-1);
      if (destination) drawStudioMarker('marker_destination', tileToWorld(destination, tileSize));
    }
    const object = world.objects.get(view.selectedObject);
    if (object) drawStudioMarker('marker_interactable', object.anchor || tileToWorld(object.standPosition, tileSize));
    for (const sprite of villagersOnMap) {
      const v = sprite.entity;
      if (sprite.reveal && v.id !== view.drag?.id) {
        drawCollectibleReveal(sprite);
        continue;
      }
      if (v.id !== view.drag?.id && v.holdStillUntil > state.time.seconds) {
        const cx = Math.round(sprite.position.x);
        const cy = Math.round(sprite.position.y - 2);
        context.save();
        context.strokeStyle = '#3b281c';
        context.lineWidth = 2.6;
        context.beginPath();
        context.ellipse(cx, cy, 11, 6.5, 0, 0, Math.PI * 2);
        context.stroke();
        context.strokeStyle = '#7fe3ff';
        context.lineWidth = 1.4;
        context.beginPath();
        context.ellipse(cx, cy, 11, 6.5, 0, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
      if (v.id !== view.drag?.id && (v.special?.golden || v.special?.champion)) {
        const t = performance.now() * 0.004 + (v.appearance?.seed || 0);
        const sx = Math.round(sprite.position.x + Math.cos(t) * 8);
        const sy = Math.round(sprite.y + 4 + Math.sin(t * 1.4) * 5);
        context.save();
        context.fillStyle = v.special?.golden ? '#fff2a6' : '#8df3ff';
        context.fillRect(sx - 1, sy, 3, 1);
        context.fillRect(sx, sy - 1, 1, 3);
        context.restore();
      }
      if (v.id !== view.drag?.id && (v.illness || v.needs.health < 55)) {
        const critical = v.needs.health <= STORY_CONFIG.criticalHealthThreshold;
        const speed = critical ? 9.5 : 4.2;
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.001 * speed);
        const cx = Math.round(sprite.position.x);
        const cy = Math.round(sprite.y - 8 - (critical ? Math.round(pulse * 2) : 0));
        context.save();
        context.globalAlpha = 0.45 + 0.55 * pulse;
        context.fillStyle = '#3b1514';
        context.fillRect(cx - 5, cy - 5, 10, 10);
        context.fillStyle = critical ? '#e5382e' : '#d96c38';
        context.fillRect(cx - 4, cy - 4, 8, 8);
        context.fillStyle = '#fff5dc';
        context.fillRect(cx - 1, cy - 3, 2, 6);
        context.fillRect(cx - 3, cy - 1, 6, 2);
        context.restore();
      }
      const reaction = v.reaction;
      if (v.id !== view.drag?.id && reaction?.until > state.time.seconds) {
        drawStudioMarker(`icon_${reaction.icon}`, { x: sprite.position.x, y: sprite.y - 6 });
      }
    }
    if (view.storyBeacon?.position && (!view.storyBeacon.until || performance.now() < view.storyBeacon.until)) {
      const nowSec = performance.now() * 0.001;
      const t = nowSec * STORY_CONFIG.beaconPulseSpeed;
      const pulse = 0.5 + 0.5 * Math.sin(t);
      const follow = view.storyBeacon.followVillagerId
        ? state.villagers.find(v => v.id === view.storyBeacon.followVillagerId) : null;
      const targetPos = follow ? follow.position : view.storyBeacon.position;
      const bx = Math.round(targetPos.x);
      const by = Math.round(targetPos.y);
      const isDanger = view.storyBeacon.tone === 'danger';
      const ringColor = isDanger ? '#ff594d' : '#ffd866';
      const fillColor = isDanger ? 'rgba(229, 56, 46, 0.16)' : 'rgba(255, 216, 102, 0.16)';
      const r = 14 + pulse * 6;
      context.save();

      // Animated curved drag-path guidance arrow from nearest eligible villager -> target circle
      if (view.storyBeacon.dragFrom && !view.drag) {
        const origin = findBestDragOrigin(world, view.storyBeacon.dragFrom, view.storyBeacon.excludeId);
        if (origin) {
          const ox = origin.position.x;
          const oy = origin.position.y - 6;
          const dist = Math.hypot(bx - ox, by - oy);
          if (dist > 14) {
            // Circle mark on the villager to grab
            context.strokeStyle = '#3b281c';
            context.lineWidth = 2.6;
            context.beginPath();
            context.arc(ox, oy + 4, 10 + (1 - pulse) * 3, 0, Math.PI * 2);
            context.stroke();
            context.strokeStyle = '#8ef59a';
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(ox, oy + 4, 10 + (1 - pulse) * 3, 0, Math.PI * 2);
            context.stroke();

            // Marching dots arc from villager -> target
            const mx = (ox + bx) / 2;
            const my = Math.min(oy, by) - Math.min(34, dist * 0.28);
            const dotCount = Math.max(5, Math.min(14, Math.floor(dist / 12)));
            const phase = (nowSec * 1.45) % 1;
            for (let i = 0; i < dotCount; i++) {
              const u = ((i / dotCount) + phase) % 1;
              const inv = 1 - u;
              const dx = inv * inv * ox + 2 * inv * u * mx + u * u * bx;
              const dy = inv * inv * oy + 2 * inv * u * my + u * u * (by - 4);
              const size = u > 0.72 ? 2.4 : 1.7;
              context.fillStyle = '#3b281c';
              context.fillRect(Math.round(dx - size), Math.round(dy - size), Math.round(size * 2 + 1), Math.round(size * 2 + 1));
              context.fillStyle = ringColor;
              context.fillRect(Math.round(dx - size + 0.5), Math.round(dy - size + 0.5), Math.max(1, Math.round(size * 2 - 0.5)), Math.max(1, Math.round(size * 2 - 0.5)));
            }
          }
        }
      }

      // Crisp pulsing circle mark around target
      context.fillStyle = fillColor;
      context.beginPath();
      context.arc(bx, by - 4, r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#3b281c';
      context.lineWidth = 2.8;
      context.beginPath();
      context.arc(bx, by - 4, r, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = ringColor;
      context.lineWidth = 1.6;
      context.beginPath();
      context.arc(bx, by - 4, r, 0, Math.PI * 2);
      context.stroke();

      // Pixel-art bouncing pointer arrow directly above target
      const ay = Math.round(by - 24 - pulse * 6);
      context.fillStyle = '#3b281c';
      context.fillRect(bx - 3, ay - 10, 6, 6);
      context.fillRect(bx - 6, ay - 5, 12, 3);
      context.fillRect(bx - 4, ay - 2, 8, 3);
      context.fillRect(bx - 2, ay + 1, 4, 2);
      context.fillStyle = ringColor;
      context.fillRect(bx - 2, ay - 9, 4, 5);
      context.fillRect(bx - 5, ay - 4, 10, 2);
      context.fillRect(bx - 3, ay - 2, 6, 2);
      context.fillRect(bx - 1, ay, 2, 2);

      // Compact world callout tag above the pointer
      if (view.storyBeacon.label) {
        const label = String(view.storyBeacon.label);
        context.font = 'bold 6px monospace';
        const tw = Math.ceil(context.measureText(label).width);
        const pw = tw + 8;
        const ph = 11;
        const px = Math.round(bx - pw / 2);
        const py = Math.round(ay - 24);
        context.fillStyle = '#3b281c';
        context.fillRect(px - 1, py - 1, pw + 2, ph + 2);
        context.fillStyle = isDanger ? '#7a1f1c' : '#ead6a9';
        context.fillRect(px, py, pw, ph);
        context.fillStyle = isDanger ? '#fff5dc' : '#322317';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, bx, py + ph / 2 + 0.5);
      }

      // Off-screen edge pointer when user pans away from active beacon
      if (bx < bounds.left || bx > bounds.right || by < bounds.top || by > bounds.bottom) {
        const margin = 22 / Math.max(0.5, camera.zoom);
        const ex = Math.max(bounds.left + margin, Math.min(bounds.right - margin, bx));
        const ey = Math.max(bounds.top + margin, Math.min(bounds.bottom - margin, by));
        const ang = Math.atan2(by - ey, bx - ex);
        context.translate(ex, ey);
        context.rotate(ang);
        context.fillStyle = '#3b281c';
        context.beginPath();
        context.moveTo(9, 0);
        context.lineTo(-6, -6);
        context.lineTo(-6, 6);
        context.closePath();
        context.fill();
        context.fillStyle = ringColor;
        context.beginPath();
        context.moveTo(7, 0);
        context.lineTo(-4.5, -4.5);
        context.lineTo(-4.5, 4.5);
        context.closePath();
        context.fill();
      }
      context.restore();
    }
    if (view.drag) {
      const sprite = villagersOnMap.find(entry => entry.entity.id === view.drag.id);
      if (sprite) drawDrag(sprite);
    }
  }

  function hasPixel(sprite, position) {
    const y = Math.floor(position.y - sprite.y);
    const band = Math.floor(sprite.height / 3);
    const shift = !sprite.sway ? 0 : y < band ? sprite.sway : y < 2 * band ? Math.trunc(sprite.sway / 2) : 0;
    const x = Math.floor(position.x - sprite.x - shift);
    if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return false;
    if (!hitMasks.has(sprite.image)) {
      maskCanvas.width = sprite.width;
      maskCanvas.height = sprite.height;
      maskContext.drawImage(sprite.image, 0, 0);
      hitMasks.set(sprite.image, maskContext.getImageData(0, 0, sprite.width, sprite.height).data);
    }
    return hitMasks.get(sprite.image)[(y * sprite.width + x) * 4 + 3] !== 0;
  }

  function findVillagerExpanded(position, excludeId) {
    const pad = RENDER_CONFIG.villagerHitPadPx;
    let best = null;
    let bestDist = Infinity;
    for (const sprite of hits) {
      if (sprite.hit !== 'villager' || sprite.entity.id === excludeId) continue;
      if (position.x < sprite.x - pad || position.x > sprite.x + sprite.width + pad
        || position.y < sprite.y - pad || position.y > sprite.y + sprite.height + pad) continue;
      const cx = sprite.x + sprite.width / 2;
      const cy = sprite.y + sprite.height / 2;
      const d = Math.hypot(position.x - cx, position.y - cy);
      if (d < bestDist) {
        bestDist = d;
        best = sprite;
      }
    }
    if (best) return best;
    // Fallback against live villager coordinates so grabbing works even before first frame mask
    const radius = 14 + pad;
    for (const villager of state.villagers) {
      if (villager.id === excludeId) continue;
      const pos = groundPosition(villager);
      const d = Math.hypot(position.x - pos.x, position.y - (pos.y - 8));
      if (d <= radius && d < bestDist) {
        bestDist = d;
        best = { hit: 'villager', entity: villager };
      }
    }
    return best;
  }

  function pick(position, only, excludeId) {
    const tile = worldToTile(position, tileSize);
    const find = (hit, test = () => true) => hits.findLast(sprite => sprite.hit === hit
      && sprite.entity.id !== excludeId && test(sprite) && hasPixel(sprite, position));
    const exactVillager = find('villager');
    if (only === 'villager') return exactVillager || findVillagerExpanded(position, excludeId);
    if (exactVillager) return exactVillager;
    const exactButterfly = find('collectible', sprite => sprite.butterfly);
    if (exactButterfly) return exactButterfly;
    const object = find('building') || find('grave') || find('crop') || find('collectible') || find('object');
    const nearbyButterfly = hits.findLast(({ butterfly, entity }) => butterfly && !entity.id.startsWith('preview_')
      && (Math.hypot(position.x - butterfly.x, position.y - butterfly.y) <= 10
        || Math.hypot(position.x - entity.position.x, position.y - entity.position.y) <= 8));
    if (!object && nearbyButterfly) return nearbyButterfly;
    const villager = findVillagerExpanded(position, excludeId);
    if (villager) return villager;
    if (object) return object;
    const grave = state.graves?.find(entry => entry.tile.x === tile.x && entry.tile.y === tile.y);
    if (grave) return { hit: 'grave', entity: grave };
    const crop = state.crops?.find(crop => crop.tile.x === tile.x && crop.tile.y === tile.y);
    if (crop) return { hit: 'crop', entity: crop };
    const spot = map.fishingSpots.find(f => [f.standPosition, f.waterTarget].some(point => point.x === tile.x && point.y === tile.y));
    if (spot) return { hit: 'object', entity: spot };
    return null;
  }

  return { render, pick };
}
