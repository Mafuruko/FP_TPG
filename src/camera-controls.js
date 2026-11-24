import { screenToWorld } from './geometry.js';

export const CAMERA_CONFIG = {
  minZoom: 0.25,
  maxZoom: 4,
  buttonZoomFactor: 1.28,
  mouseWheelSensitivity: 0.0014,
  pinchWheelSensitivity: 0.0062,
  maxWheelZoomFactor: 1.18,
  panSpeed: 1.0,
  smoothRate: 14,
  snapEpsilon: 0.0008,
  mouseNotchMinDelta: 80,
};

export function clampZoom(zoom, config = CAMERA_CONFIG) {
  return Math.max(config.minZoom, Math.min(config.maxZoom, zoom));
}

/**
 * Auto-detects whether a wheel event comes from:
 * - Pinch/spread gesture or Ctrl+wheel -> 'zoom'
 * - Standard notched mouse wheel -> 'zoom'
 * - Two-finger touchpad scroll/pan -> 'pan'
 */
export function classifyWheelEvent(event, config = CAMERA_CONFIG) {
  if (event.ctrlKey || event.metaKey) {
    return { action: 'zoom', source: 'pinch' };
  }
  const absX = Math.abs(event.deltaX || 0);
  const absY = Math.abs(event.deltaY || 0);
  const deltaMode = event.deltaMode || 0;

  // Non-pixel deltaMode (line/page) is always a traditional mouse scroll wheel.
  if (deltaMode !== 0) {
    return { action: 'zoom', source: 'mouse' };
  }

  // Any horizontal delta indicates a 2D touchpad pan gesture.
  if (absX > 0.5) {
    return { action: 'pan', source: 'touchpad' };
  }

  // Typical mouse wheels fire discrete integer vertical notches (e.g. 100, 120, 150).
  const isDiscreteNotch = absY >= config.mouseNotchMinDelta
    && Number.isInteger(event.deltaY)
    && (absY % 50 === 0 || absY % 40 === 0 || absY % 30 === 0);
  if (isDiscreteNotch) {
    return { action: 'zoom', source: 'mouse' };
  }

  // Smaller or smooth fractional pixel deltas come from touchpad two-finger panning.
  return { action: 'pan', source: 'touchpad' };
}

/**
 * Computes a bounded multiplicative zoom scale from wheel deltaY.
 */
export function wheelZoomFactor(deltaY, source, deltaMode = 0, config = CAMERA_CONFIG) {
  const normalizedDelta = deltaMode === 1 ? deltaY * 32 : deltaMode === 2 ? deltaY * 240 : deltaY;
  const sensitivity = source === 'pinch' ? config.pinchWheelSensitivity : config.mouseWheelSensitivity;
  const raw = Math.exp(-normalizedDelta * sensitivity);
  const maxStep = config.maxWheelZoomFactor;
  return Math.max(1 / maxStep, Math.min(maxStep, raw));
}

/**
 * Applies exact continuous zoom anchored to a screen point without rounding drift.
 */
export function zoomCameraAt(camera, screen, nextZoom, config = CAMERA_CONFIG) {
  const clamped = clampZoom(nextZoom, config);
  const world = screenToWorld(screen, camera);
  camera.zoom = clamped;
  camera.x = screen.x - world.x * clamped;
  camera.y = screen.y - world.y * clamped;
  return camera;
}

/**
 * Creates a smooth camera motion controller supporting:
 * - Touchpad 2-finger pan
 * - Touchpad pinch/spread and Ctrl+wheel smooth zoom
 * - Standard mouse wheel smooth zoom
 * - HUD zoom buttons with smooth interpolation
 * - Two-finger touchscreen pinch & pan
 */
export function createCameraController(camera, config = CAMERA_CONFIG) {
  const state = {
    targetZoom: camera.zoom,
    anchor: null,
    active: false,
  };

  function syncFromCamera() {
    state.targetZoom = clampZoom(camera.zoom, config);
    state.active = false;
    state.anchor = null;
  }

  function panBy(dx, dy) {
    camera.x += dx * config.panSpeed;
    camera.y += dy * config.panSpeed;
  }

  function zoomByFactor(factor, screenPoint, immediate = false) {
    const base = state.active ? state.targetZoom : camera.zoom;
    const next = clampZoom(base * factor, config);
    if (immediate) {
      zoomCameraAt(camera, screenPoint, next, config);
      syncFromCamera();
      return next;
    }
    state.targetZoom = next;
    state.anchor = { x: screenPoint.x, y: screenPoint.y };
    state.active = true;
    return next;
  }

  function stepButtonZoom(direction, screenPoint) {
    const factor = direction > 0 ? config.buttonZoomFactor : 1 / config.buttonZoomFactor;
    return zoomByFactor(factor, screenPoint, false);
  }

  function handleWheel(event, screenPoint) {
    const { action, source } = classifyWheelEvent(event, config);
    if (action === 'pan') {
      // Natural drag-aligned panning: two fingers down moves map accordingly.
      panBy(-(event.deltaX || 0), -(event.deltaY || 0));
      if (state.active) state.anchor = { x: screenPoint.x, y: screenPoint.y };
      return { action, source };
    }
    const factor = wheelZoomFactor(event.deltaY || 0, source, event.deltaMode || 0, config);
    // Pinch zoom is already continuous from trackpad, use snappy smoothing for fluid feel.
    zoomByFactor(factor, screenPoint, false);
    return { action, source, factor };
  }

  function handleTouchPinch(prevMidpoint, nextMidpoint, scaleRatio) {
    panBy(nextMidpoint.x - prevMidpoint.x, nextMidpoint.y - prevMidpoint.y);
    if (Number.isFinite(scaleRatio) && scaleRatio > 0 && Math.abs(scaleRatio - 1) > 0.0005) {
      zoomByFactor(scaleRatio, nextMidpoint, true);
    }
  }

  function update(dt) {
    if (!state.active || !state.anchor || dt <= 0) return false;
    const diff = state.targetZoom - camera.zoom;
    if (Math.abs(diff) <= config.snapEpsilon) {
      zoomCameraAt(camera, state.anchor, state.targetZoom, config);
      state.active = false;
      return true;
    }
    const alpha = 1 - Math.exp(-config.smoothRate * dt);
    const next = camera.zoom + diff * alpha;
    zoomCameraAt(camera, state.anchor, next, config);
    return true;
  }

  return {
    config,
    state,
    syncFromCamera,
    panBy,
    zoomByFactor,
    stepButtonZoom,
    handleWheel,
    handleTouchPinch,
    update,
  };
}
