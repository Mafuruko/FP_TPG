export function createAssets(studios) {
  const { island, character, building, collectible, resource, wildlife, ui } = studios;
  const registry = new Map();
  function register(studio, definition, visual, aliases = []) {
    const asset = { ...definition, sourceFile: studio.sourceFile, svg: visual };
    for (const id of new Set([asset.id, ...aliases])) {
      if (registry.has(id)) throw new Error(`Duplicate asset identifier: ${id}`);
      registry.set(id, asset);
    }
    return asset;
  }

  for (const item of island.data.environmentAssets) {
    register(island, { ...item, anchor: { x: item.width / 2, y: item.height } },
      () => island.environmentSvg(item.id, 1));
  }
  for (const id of island.tiles) {
    register(island, { id, category: 'terrain', width: 16, height: 16, anchor: { x: 8, y: 16 } }, () => island.environmentSvg(id, 1));
  }
  for (const animation of island.data.animations) {
    const { id, width, height } = animation;
    register(island, { id, category: 'environment-animation', width, height, animations: { default: animation } },
      ({ frame = 0 } = {}) => island.effectSvg(id, frame));
    animation.frames.forEach((frameId, frame) => {
      if (registry.has(frameId)) return;
      register(island, { id: frameId, category: 'environment-frame', width, height },
        () => island.effectSvg(id, frame));
    });
  }

  const buildings = Object.keys(building.BD).map(type => {
    const states = Object.fromEntries(building.statesOf(type).map(state => {
      const metadata = building.meta(type, state);
      const { assetId, sprite, anchor, placement } = metadata;
      const asset = register(building, {
        id: `building:${assetId}`, category: 'building', width: sprite.width, height: sprite.height,
        anchor: { x: anchor.x, y: anchor.y - sprite.offset.y }, placement,
        footprint: metadata.footprint, metadata,
      }, () => building.sprite(type, state), registry.has(assetId) ? [] : [assetId]);
      return [state, asset];
    }));
    return { type, states, name: building.BD[type].n || type.replaceAll('_', ' ') };
  });

  const collectibles = collectible.COLLECTIBLES.map(item => {
    const animations = Object.fromEntries(collectible.animsOf(item.id).map(anim => [anim.k, {
      fps: anim.fps, frameCount: anim.frames.length, loop: anim.loop,
    }]));
    return register(collectible, {
      ...item, ...item.spriteSize, animations, states: ['normal', 'highlighted', 'undiscovered'], metadata: item,
    }, ({ state = 'normal', animation, frame = 0 } = {}) => {
      if (!animation) return collectible.renderCollectibleSVG(item.id, 1, { state });
      const frames = collectible.animsOf(item.id).find(anim => anim.k === animation).frames;
      return collectible.renderAnimationFrame(frames[frame], 1);
    }, [item.assetId]);
  });

  const resourceItems = resource.ITEMS.map(item => {
    const asset = register(resource, {
      ...item, ...item.spriteSize, anchor: { x: item.spriteSize.width / 2, y: item.spriteSize.height - 2 },
      metadata: item,
    }, ({ state = 'normal' } = {}) => state === 'collected'
      ? resource.renderInventorySlot(item.id, 1)
      : resource.renderResourceSVG(item.id, 1, { hl: state === 'highlighted' }), [item.assetId]);
    for (const state of item.states.filter(state => state !== 'normal')) {
      const size = state === 'collected' ? 4 : 0;
      register(resource, {
        ...asset, id: item.assetIds[state], width: asset.width + size, height: asset.height + size,
        anchor: { x: asset.anchor.x + size / 2, y: asset.anchor.y + size / 2 },
      }, () => asset.svg({ state }));
    }
    return asset;
  });

  const animals = wildlife.WILDLIFE.map(item => {
    const metadata = wildlife.getAnimalMetadata(item.key);
    const animations = Object.fromEntries(Object.entries(metadata.animations).map(([id, anim]) => [
      id, { ...anim, frameCount: anim.frames },
    ]));
    return register(wildlife, {
      ...item, ...item.spriteSize, metadata, animations, idle: wildlife.idleAnim(item.key),
    }, ({ animation = wildlife.idleAnim(item.key), frame = 0, direction = 'left' } = {}) =>
      wildlife.renderAnimalSVG(item.key, 1, animations[animation].reuse || animation, frame, direction));
  });

  const villager = register(character, {
    id: 'villager', category: 'character', width: 24, height: 32, anchor: { x: 12, y: 31 },
    states: character.STG, directions: character.DIRS,
    animations: Object.fromEntries(Object.entries(character.A).map(([id, anim]) => [
      id, { name: anim.n, frameCount: anim.f.length, fps: anim.fps, tool: anim.tool },
    ])),
    metadata: character.metadata,
  }, ({ config, animation = 'idle', frame = 0, direction = 'front', shadow = true, rank = 0 } = {}) => {
    const normalized = character.createCharacter(config);
    return character.renderCharacterSVG(normalized, { an: animation, f: frame, dir: direction, s: 1, sh: Number(shadow), rank });
  });

  const terrain = register(island, {
    id: 'island', category: 'map', width: island.data.meta.pixelWidth, height: island.data.meta.pixelHeight,
    metadata: island.data,
  }, island.terrainSvg);

  const uiAssets = [...Object.values(ui.UI_ICONS), ...Object.values(ui.UI_MARKERS)].map(item => {
    const { width, height } = item.native;
    return register(ui, { ...item, width, height, category: 'ui', metadata: item },
      () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" shape-rendering="crispEdges">${item.svg}</svg>`);
  });
  for (const [key, frame] of Object.entries(ui.frames)) {
    uiAssets.push(register(ui, { id: `frame_${key}`, category: 'ui', width: frame.n, height: frame.n, metadata: frame }, () => frame.svg));
  }

  return {
    registry, buildings, collectibles, resourceItems, resourceSources: resource.SRC, animals, villager, terrain, ui, uiAssets,
    effects: island.effects, canopySvg: island.canopySvg, validation: island.validation,
    generateVillager: character.generateRandomCharacter, characterAnimations: character.animsFor,
    characterFps: character.fps,
  };
}

export function describeInteraction(object, assets) {
  if (object.interaction?.job) {
    const { job: type, counter, ability = type, resourceId } = object.interaction;
    return { type, counter, ability, resourceId, positions: object.interactionPoints, waterTarget: object.waterTarget };
  }
  const fish = object.type === 'fishing_spot';
  const crop = object.type === 'crop';
  const sourceType = object.type === 'coconut' ? 'palm_tree' : object.type;
  const item = assets.resourceItems.find(candidate => {
    if (fish) return assets.resourceSources[candidate.sourceKey].waterBodies?.includes(object.waterBodyId);
    if (crop) return candidate.sourceKey === 'farm' && candidate.art === object.cropType;
    return candidate.sourceObject === sourceType && candidate.source.status === 'exists' && object.resource;
  });
  const counter = item?.resourceType === 'food' ? 'food'
    : ['wood', 'stone'].includes(object.resource?.type) ? object.resource.type : null;
  const type = !item ? 'inspect' : fish ? 'fish' : crop ? 'farm'
    : counter === 'wood' ? 'chop' : counter === 'stone' ? 'mine' : 'gather';
  return {
    type, resourceId: item?.id ?? null, counter, ability: type === 'inspect' ? null : type,
    positions: fish ? [{ ...object.standPosition, facing: object.facing }] : object.interactionPoints,
    waterTarget: object.waterTarget, sourceRequirements: object.requires,
  };
}
