import { tileToWorld, worldToTile } from './geometry.js';

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
  const hitMasks = new WeakMap();
  const maskCanvas = document.createElement('canvas');
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  const overlay = document.createElement('canvas');
  overlay.width = pixelWidth;
  overlay.height = pixelHeight;
  let overlayKey = null;
  let hits = [];

  function image(key, makeSvg) {
    if (!images.has(key)) {
      const image = new Image();
      const svg = makeSvg();
      image.src = svg.length > 40000 ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : svgUrl(svg);
      if (image.src.startsWith('blob:')) {
        const url = image.src;
        image.onload = image.onerror = () => URL.revokeObjectURL(url);
      }
      images.set(key, image);
    }
    return images.get(key);
  }

  function drawImage(image, x, y) {
    if (image.complete && image.naturalWidth) context.drawImage(image, Math.round(x), Math.round(y));
  }

  function describeSprite(entity, asset, options, position, hit) {
    const x = Math.round(position.x - asset.anchor.x);
    const y = Math.round(position.y - asset.anchor.y);
    return { entity, asset, options, x, y, depth: position.y, position, hit };
  }

  function paintSprite(sprite) {
    const { entity, asset, options, x, y, hit } = sprite;
    if (x + asset.width < -camera.x / camera.zoom || y + asset.height < -camera.y / camera.zoom
      || x > (canvas.clientWidth - camera.x) / camera.zoom || y > (canvas.clientHeight - camera.y) / camera.zoom) return;
    const key = [asset.id, options?.config && JSON.stringify(options.config),
      options?.direction, options?.animation, options?.frame].join('|');
    const spriteImage = image(key, () => asset.svg(options));
    drawImage(spriteImage, x, y);
    if (hit && spriteImage.complete && spriteImage.naturalWidth) {
      hits.push({ entity, x, y, width: asset.width, height: asset.height, hit, image: spriteImage });
    }
  }

  function objects() {
    return map.objects.map(object => {
      const current = state.objects[object.id];
      const asset = assets.registry.get(current.art || object.states?.[current.state] || object.assetId);
      return describeSprite(object, asset, undefined, object.anchor, object.decorative ? null : 'object');
    });
  }

  function villagers() {
    return state.villagers.map(entity => {
      const config = { ...entity.appearance, name: entity.name, lifeStage: entity.lifeStage };
      const animation = entity.animation;
      const definition = assets.villager.animations[animation];
      const fps = assets.characterFps(animation, config);
      return describeSprite(entity, assets.villager, {
        config, animation, direction: entity.direction,
        frame: frameAt({ ...definition, fps }, state.time.seconds),
      }, entity.position, 'villager');
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
      return describeSprite(entity, asset, {
        animation, direction: entity.direction, frame: frameAt(asset.animations[animation], state.time.seconds),
      }, entity.position);
    });
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

  function drawEffects() {
    for (const effect of assets.effects) {
      if (effect.id === 'waterfall_flow' && state.worldFlags.open_waterfall_passage) continue;
      const asset = assets.registry.get(effect.id);
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
    const scale = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * scale);
    const height = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#3f7f9c';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.setTransform(camera.zoom * scale, 0, 0, camera.zoom * scale, camera.x * scale, camera.y * scale);
    drawImage(image('island', assets.terrain.svg), 0, 0);
    hits = [];
    const scenery = objects();
    const villagersOnMap = villagers();
    const foreground = scenery.filter(sprite => sprite.entity.canopy);
    const entities = [...scenery.filter(sprite => sprite.entity.layer !== 'ground-decoration'),
      ...crops(), ...buildings(), ...villagersOnMap.filter(sprite => sprite.entity.id !== view.drag?.id),
      ...creatures(), ...collectibles()].sort((a, b) => a.depth - b.depth || a.x - b.x);
    for (const sprite of scenery.filter(sprite => sprite.entity.layer === 'ground-decoration')) paintSprite(sprite);
    for (const sprite of entities) paintSprite(sprite);
    for (const sprite of foreground) drawImage(
      image(`canopy:${sprite.asset.id}`, () => assets.canopySvg(sprite.asset.id)), sprite.x, sprite.y,
    );
    drawEffects();
    if (state.abilities.fish) {
      const wave = assets.registry.get('icon_arrowD');
      for (const spot of map.fishingSpots) {
        if (spot.requires.includes('bridge_repaired') && !state.worldFlags.repair_bridge) continue;
        const { x, y } = tileToWorld(spot.waterTarget, tileSize);
        drawImage(image(wave.id, wave.svg), x - 8, y - 8);
      }
    }
    drawPreview();
    const sprites = [...scenery.filter(sprite => sprite.entity.layer === 'ground-decoration'), ...entities];
    drawDebug(sprites);
    const selected = sprites.find(sprite => sprite.entity.id === view.selectedVillager);
    if (selected) {
      drawStudioMarker('marker_selection_ring', selected.position);
      const destination = selected.entity.route.at(-1);
      if (destination) drawStudioMarker('marker_destination', tileToWorld(destination, tileSize));
    }
    const object = world.objects.get(view.selectedObject);
    if (object) drawStudioMarker('marker_interactable', object.anchor || tileToWorld(object.standPosition, tileSize));
    if (view.drag) {
      const sprite = villagersOnMap.find(entry => entry.entity.id === view.drag.id);
      if (sprite) {
        drawStudioMarker('marker_picked_up', view.drag.position);
        const { x, y } = view.drag.position;
        paintSprite(describeSprite(sprite.entity, sprite.asset, {
          ...sprite.options, animation: 'idle', frame: 0,
        }, { x, y: y - 6 }));
      }
    }
  }

  function hasPixel(sprite, position) {
    const x = Math.floor(position.x - sprite.x);
    const y = Math.floor(position.y - sprite.y);
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
