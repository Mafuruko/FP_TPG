import { initializeWorldWildlife, updateWorld } from './world.js';
import { ensureStoryState } from './story.js';

const key = 'island-colony.village.v1';
export const offlineLimit = 90;
export const islandSlots = [1, 2, 3];
const slotKey = id => `island-colony.slot.${id}.v1`;

export const UNLOCKS_STORAGE_KEY = 'island-colony.unlocks.v1';

export const WIPE_STORAGE_KEYS = [
  key,
  ...islandSlots.map(slotKey),
  'island-colony.hud-layout.v1',
  'island-colony.settings.v1',
  'island-colony.audio',
  UNLOCKS_STORAGE_KEY,
];

export function loadUnlocks(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(UNLOCKS_STORAGE_KEY) || 'null');
    return { devMode: Boolean(raw?.devMode) };
  } catch {
    return { devMode: false };
  }
}

export function saveUnlocks(storage, unlocks) {
  try {
    storage?.setItem(UNLOCKS_STORAGE_KEY, JSON.stringify({ devMode: Boolean(unlocks?.devMode) }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears all saved islands, legacy backups, HUD layout, and saved preferences
 * so testing or starting over begins from the pristine initial game state.
 */
export function wipeAllGameData(storage) {
  if (!storage || typeof storage.removeItem !== 'function') {
    return { ok: false, clearedKeys: [] };
  }
  const clearedKeys = [];
  for (const storageKey of WIPE_STORAGE_KEYS) {
    try {
      storage.removeItem(storageKey);
      clearedKeys.push(storageKey);
    } catch { /* Keep clearing remaining keys even if one fails. */ }
  }
  return { ok: clearedKeys.length > 0, clearedKeys };
}

function validVillage(save, { map, assets }) {
  const state = save?.state;
  const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);
  return Number.isFinite(save?.savedAt) && state?.version === 1 && state.world?.mapId === assets.terrain.id
    && Number.isFinite(state.time?.day) && Number.isFinite(state.time?.seconds) && Number.isFinite(state.time?.minutes)
    && [1, 2, 3].includes(state.time.speed)
    && ['resources', 'objects', 'weather', 'worldFlags', 'abilities', 'collectionProgress']
      .every(field => state[field] && typeof state[field] === 'object')
    && map.objects.every(object => state.objects[object.id] && typeof state.objects[object.id] === 'object')
    && ['food', 'wood', 'stone', 'knowledge'].every(key => Number.isFinite(state.resources[key]))
    && Array.isArray(state.villagers) && state.villagers.every(villager => point(villager?.position) && point(villager.tile)
      && Array.isArray(villager.route) && villager.appearance && villager.needs && villager.skills && villager.relationships
      && Object.hasOwn(assets.villager.animations, villager.animation))
    && Array.isArray(state.buildings) && state.buildings.every(building => point(building?.tile)
      && assets.registry.has(`building:${building.type}_${building.state}`))
    && Array.isArray(state.wildlife) && state.wildlife.every(animal => point(animal?.position)
      && point(animal.tile) && assets.animals.some(asset => asset.id === animal.assetId));
}

export function createIslandSaves(storage, world) {
  const memory = new Map();
  const store = storage ?? {
    getItem: key => memory.get(key),
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key),
  };

  function read(id) {
    if (!islandSlots.includes(id)) return null;
    try {
      const save = JSON.parse(store.getItem(slotKey(id)));
      return validVillage(save, world) ? save : null;
    } catch {
      return null;
    }
  }

  function write(id, state, now = Date.now()) {
    if (!islandSlots.includes(id) || !validVillage({ state, savedAt: now }, world)) return false;
    try {
      const { settings: _legacySettings, ...village } = state;
      store.setItem(slotKey(id), JSON.stringify({ savedAt: now, state: village }));
      return true;
    } catch {
      return false;
    }
  }

  function remove(id) {
    if (!islandSlots.includes(id)) return false;
    try {
      store.removeItem(slotKey(id));
      return true;
    } catch {
      return false;
    }
  }

  const legacy = readVillage(store);
  if (validVillage(legacy, world) && !islandSlots.some(id => read(id)) && write(1, legacy.state, legacy.savedAt)) {
    try { store.removeItem(key); } catch { /* Keep the original backup if the browser disallows removal. */ }
  }

  function list() {
    return islandSlots.map(id => {
      const save = read(id);
      return { id, name: `Island ${id}`, day: save?.state.time.day, villagers: save?.state.villagers.length, savedAt: save?.savedAt };
    });
  }

  return {
    read, write, remove, list, persistent: Boolean(storage),
    recent: () => list().filter(slot => slot.savedAt !== undefined).sort((a, b) => b.savedAt - a.savedAt || a.id - b.id)[0],
  };
}

export function readVillage(storage) {
  try {
    const save = JSON.parse(storage.getItem(key));
    return save?.state?.version === 1 && Number.isFinite(save.savedAt) ? save : null;
  } catch {
    return null;
  }
}

export function saveVillage(world, storage, now = Date.now()) {
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, state: world.state }));
    return true;
  } catch {
    return false;
  }
}

export function restoreVillage(world, save) {
  if (!save || save.state.world?.mapId !== world.state.world.mapId) return false;
  const resources = world.state.resources;
  Object.assign(resources, save.state.resources);
  for (const field of Object.keys(world.state)) {
    if (!Object.hasOwn(save.state, field)) delete world.state[field];
  }
  Object.assign(world.state, save.state, { resources });
  ensureStoryState(world.state);
  world.climate.reset();
  world.fishParticles = [];
  world.groundParticles = [];
  world.shoreRipples = [];
  initializeWorldWildlife(world);
  return true;
}

export function advanceOffline(world, savedAt, now = Date.now()) {
  if (world.state.time.paused) return 0;
  const elapsed = Math.max(0, Math.min(offlineLimit, (now - savedAt) / 1000));
  for (let remaining = elapsed; remaining > 0; remaining -= 0.25) {
    updateWorld(world, Math.min(0.25, remaining));
  }
  return elapsed;
}
