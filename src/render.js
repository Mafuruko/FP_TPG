import { ATMOSPHERE_CONFIG, computeAtmosphere, drawAtmosphereOverlay, drawCloudShadows,
  drawDistantLightning, drawNightLights, drawRain, drawWeatherParticles } from './atmosphere.js';
import { tileToWorld, worldToTile } from './geometry.js';
import { birdVisuals } from './birds.js';
import { dolphinVisuals } from './dolphin.js';
import { fishVisuals, waterAt } from './fish.js';
import { contactVisual, groundPosition, villagerFrame } from './ground.js';
import { turtleVisuals } from './turtle.js';
import { jobVisual } from './villagers.js';
import { wildlifeOpacity } from './wildlife-director.js';

export const RENDER_CONFIG = {
  maxDpr: 1.5,
  cullMarginPx: 64,
};

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
      ? `${cfg.seed ?? ''}_${cfg.lifeStage ?? ''}_${cfg.heldObject ?? ''}_${cfg.accessories ? cfg.accessories.join(',') : ''}`
      : '';
    return `${asset.id}|${cfgKey}|${options.direction ?? ''}|${options.animation ?? ''}|${options.frame ?? ''}|${options.shadow ?? ''}|${options.rank ?? ''}`;
  }

  function paintSprite(sprite, bounds) {
    const { entity, asset, options, x, y, hit } = sprite;
    if (bounds && (x + asset.width < bounds.left || y + asset.height < bounds.top
      || x > bounds.right || y > bounds.bottom)) return;
    if (sprite.opacity === 0) return;
    const key = spriteCacheKey(asset, options);
    const spriteImage = image(key, () => asset.svg(options));
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
      hits.push({ entity, x, y, width: asset.width, height: asset.height, hit, image: spriteImage, sway: sprite.sway });
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
      const animation = entity.animation;
      const definition = assets.villager.animations[animation];
      const skill = jobVisual(entity);
      const tier = skill?.tier ?? 0;
      if (tier && animation === 'gather' && !config.accessories.includes('bag')) config.accessories = [...config.accessories, 'bag'];
      const fps = assets.characterFps(animation, config) / (skill && entity.work.phase === 'work' ? skill.rank.workTime : 1);
      const sprite = describeSprite(entity, assets.villager, {
        config, animation, direction: entity.direction,
        frame: villagerFrame(entity, definition.frameCount) ?? frameAt({ ...definition, fps }, state.time.seconds),
        shadow: false, rank: tier,
      }, groundPosition(entity), 'villager');
      sprite.ground = contactVisual(entity, 'villager');
      sprite.y += sprite.ground.offsetY;
      const landingAge = state.time.seconds - entity.landedAt;
      if (landingAge >= 0 && landingAge < 0.19) {
        sprite.impact = landingAge < 0.085 ? { wide: 2, tall: -3 } : { wide: -2, tall: 1 };
        if (landingAge >= 0.085) sprite.y -= 1;
      }
      return sprite;
    });
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

  function collectibles() {
    return (view.debug ? [...world.collectiblePreviews, ...state.activeCollectibles] : state.activeCollectibles).map(entity => {
      const asset = assets.registry.get(entity.assetId);
      const animation = asset.animations.flap && 'flap';
      const options = animation ? { animation, frame: frameAt(asset.animations[animation], state.time.seconds) } : undefined;
      return describeSprite(entity, asset, options, entity.position, 'collectible');
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
    const fullyInsideMap = terrainReady && bounds.left >= 0 && bounds.top >= 0
      && bounds.right <= pixelWidth && bounds.bottom <= pixelHeight;
    if (!fullyInsideMap) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#3f7f9c';
      context.fillRect(0, 0, width, height);
    }
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
    const entities = [...tallScenery,
      ...crops(), ...buildings(), ...villagersOnMap.filter(sprite => sprite.entity.id !== view.drag?.id),
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
    drawFishParticles(true);
    for (const sprite of animals) if (overCanopy(sprite)) paintSprite(sprite, bounds);
    drawCloudShadows(context, map, bounds, atmosphere, state.time.seconds);
    drawWeatherParticles(context, map, bounds, atmosphere, state.time.seconds);
    drawAtmosphereOverlay(context, width, height, atmosphere);
    drawNightLights(context, world, atmosphere, bounds);
    drawRain(context, width, height, state.time.seconds, scale, atmosphere);
    if (view.settings?.lightning) drawDistantLightning(context, width, height, atmosphere.rain, state.time.seconds);
    if (view.mode && view.mode !== 'playing') return;
    if (state.abilities.fish) {
      const wave = assets.registry.get('icon_arrowD');
      for (const spot of map.fishingSpots) {
        if (spot.requires.includes('bridge_repaired') && !state.worldFlags.repair_bridge) continue;
        const { x, y } = tileToWorld(spot.waterTarget, tileSize);
        if (x + 8 < bounds.left || y + 8 < bounds.top || x - 8 > bounds.right || y - 8 > bounds.bottom) continue;
        drawImage(image(wave.id, wave.svg), x - 8, y - 8);
      }
    }
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
      const reaction = sprite.entity.reaction;
      if (sprite.entity.id !== view.drag?.id && reaction?.until > state.time.seconds) {
        drawStudioMarker(`icon_${reaction.icon}`, { x: sprite.position.x, y: sprite.y - 6 });
      }
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

  function pick(position, only, excludeId) {
    const tile = worldToTile(position, tileSize);
    const find = hit => hits.findLast(sprite => sprite.hit === hit && sprite.entity.id !== excludeId && hasPixel(sprite, position));
    if (only === 'villager') return find('villager');
    const villager = find('villager');
    if (villager) return villager;
    const object = find('building') || find('crop') || find('collectible') || find('object');
    if (object) return object;
    const crop = state.crops?.find(crop => crop.tile.x === tile.x && crop.tile.y === tile.y);
    if (crop) return { hit: 'crop', entity: crop };
    const spot = map.fishingSpots.find(f => [f.standPosition, f.waterTarget].some(point => point.x === tile.x && point.y === tile.y));
    if (spot) return { hit: 'object', entity: spot };
    return null;
  }

  return { render, pick };
}
