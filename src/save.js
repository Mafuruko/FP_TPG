import { updateWorld } from './world.js';

const key = 'island-colony.village.v1';
export const offlineLimit = 90;

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
  Object.assign(world.state, save.state, { resources });
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
