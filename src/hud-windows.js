export const HUD_CONFIG = {
  storageKey: 'island-colony.hud-layout.v1',
  version: 1,
  minScale: 0.62,
  maxScale: 1.45,
  minWindowWidthPx: 112,
  minWindowHeightPx: 42,
  edgePaddingPct: 0.4,
  tearOffDistancePx: 28,
  baseZIndex: 20,
};

export const DEFAULT_HUD_LAYOUT = [
  { id: 'grp-resources', tabs: ['resources'], activeTab: 'resources', xPct: 0.8, yPct: 1.0, scale: 1, minimized: false },
  { id: 'grp-clock', tabs: ['clock'], activeTab: 'clock', xPct: 71.0, yPct: 1.0, scale: 1, minimized: false },
  { id: 'grp-nav', tabs: ['nav'], activeTab: 'nav', xPct: 0.8, yPct: 13.5, scale: 1, minimized: false },
  { id: 'grp-menu', tabs: ['menu'], activeTab: 'menu', xPct: 63.0, yPct: 16.5, scale: 1, minimized: false },
  { id: 'grp-selection', tabs: ['selection'], activeTab: 'selection', xPct: 35.0, yPct: 78.0, scale: 1, minimized: false },
  { id: 'grp-camera', tabs: ['camera'], activeTab: 'camera', xPct: 81.0, yPct: 87.0, scale: 1, minimized: false },
  { id: 'grp-dev', tabs: ['dev'], activeTab: 'dev', xPct: 7.5, yPct: 13.5, scale: 1, minimized: false },
];

export function cloneLayout(groups = DEFAULT_HUD_LAYOUT) {
  return groups.map(group => ({
    ...group,
    tabs: [...group.tabs],
  }));
}

/**
 * Clamps scale between configured min/max while guaranteeing rendered dimensions
 * never shrink below `minWindowWidthPx` / `minWindowHeightPx`.
 */
export function clampWindowScale(requestedScale, naturalSize, viewport, config = HUD_CONFIG) {
  const natW = Math.max(1, naturalSize.width || 1);
  const natH = Math.max(1, naturalSize.height || 1);
  const floorByW = config.minWindowWidthPx / natW;
  const floorByH = config.minWindowHeightPx / natH;
  const minAllowed = Math.min(config.maxScale, Math.max(config.minScale, Math.min(1, Math.max(floorByW, floorByH))));
  const maxByViewportW = Math.max(minAllowed, ((viewport.width || 1280) * 0.96) / natW);
  const maxByViewportH = Math.max(minAllowed, ((viewport.height || 720) * 0.94) / natH);
  const maxAllowed = Math.min(config.maxScale, maxByViewportW, maxByViewportH);
  return Math.max(minAllowed, Math.min(Math.max(minAllowed, maxAllowed), Number(requestedScale) || 1));
}

/**
 * Clamps percentage position (xPct, yPct) so the entire scaled window stays strictly
 * inside the screen viewport.
 */
export function clampWindowPercent(xPct, yPct, scaledSize, viewport, config = HUD_CONFIG) {
  const vw = Math.max(1, viewport.width || 1);
  const vh = Math.max(1, viewport.height || 1);
  const widthPct = Math.min(100, (Math.max(0, scaledSize.width) / vw) * 100);
  const heightPct = Math.min(100, (Math.max(0, scaledSize.height) / vh) * 100);
  const pad = config.edgePaddingPct;
  const maxX = Math.max(0, 100 - widthPct - pad);
  const maxY = Math.max(0, 100 - heightPct - pad);
  const minX = Math.min(pad, maxX);
  const minY = Math.min(pad, maxY);
  return {
    xPct: Math.max(minX, Math.min(maxX, Number.isFinite(xPct) ? xPct : minX)),
    yPct: Math.max(minY, Math.min(maxY, Number.isFinite(yPct) ? yPct : minY)),
  };
}

/**
 * Pure state operation: merges all tabs from `sourceGroupId` into `targetGroupId`
 * (or moves a single `tabId` into `targetGroupId`).
 */
export function mergeGroups(groups, sourceGroupId, targetGroupId, tabId = null) {
  if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) return groups;
  const next = cloneLayout(groups);
  const srcIndex = next.findIndex(g => g.id === sourceGroupId);
  const dstIndex = next.findIndex(g => g.id === targetGroupId);
  if (srcIndex < 0 || dstIndex < 0) return groups;

  const src = next[srcIndex];
  const dst = next[dstIndex];
  const movingTabs = tabId ? src.tabs.filter(id => id === tabId) : [...src.tabs];
  if (!movingTabs.length) return groups;

  for (const id of movingTabs) {
    if (!dst.tabs.includes(id)) dst.tabs.push(id);
  }
  dst.activeTab = movingTabs[movingTabs.length - 1];
  dst.minimized = false;

  src.tabs = src.tabs.filter(id => !movingTabs.includes(id));
  if (!src.tabs.length) {
    next.splice(srcIndex, 1);
  } else if (!src.tabs.includes(src.activeTab)) {
    src.activeTab = src.tabs[0];
  }
  return next;
}

/**
 * Pure state operation: detaches one `tabId` from a multi-tab group into a new standalone window.
 */
export function detachTab(groups, sourceGroupId, tabId, xPct, yPct) {
  const next = cloneLayout(groups);
  const src = next.find(g => g.id === sourceGroupId);
  if (!src || src.tabs.length <= 1 || !src.tabs.includes(tabId)) return groups;

  src.tabs = src.tabs.filter(id => id !== tabId);
  if (src.activeTab === tabId) src.activeTab = src.tabs[0];

  const newGroup = {
    id: `grp-${tabId}-${Date.now().toString(36).slice(-4)}`,
    tabs: [tabId],
    activeTab: tabId,
    xPct,
    yPct,
    scale: src.scale,
    minimized: false,
  };
  next.push(newGroup);
  return next;
}

export function sanitizeHudLayout(saved, knownWidgetIds, fallback = DEFAULT_HUD_LAYOUT, config = HUD_CONFIG) {
  const validSet = new Set(knownWidgetIds);
  const seen = new Set();
  const cleaned = [];

  if (Array.isArray(saved)) {
    for (const raw of saved) {
      if (!raw || !Array.isArray(raw.tabs)) continue;
      const tabs = raw.tabs.filter(id => validSet.has(id) && !seen.has(id));
      if (!tabs.length) continue;
      tabs.forEach(id => seen.add(id));
      cleaned.push({
        id: String(raw.id || `grp-${tabs[0]}`),
        tabs,
        activeTab: tabs.includes(raw.activeTab) ? raw.activeTab : tabs[0],
        xPct: Number.isFinite(raw.xPct) ? Math.max(0, Math.min(98, raw.xPct)) : 2,
        yPct: Number.isFinite(raw.yPct) ? Math.max(0, Math.min(98, raw.yPct)) : 2,
        scale: Number.isFinite(raw.scale) ? Math.max(config.minScale, Math.min(config.maxScale, raw.scale)) : 1,
        minimized: Boolean(raw.minimized),
      });
    }
  }

  for (const def of fallback) {
    for (const tab of def.tabs) {
      if (!validSet.has(tab) || seen.has(tab)) continue;
      seen.add(tab);
      cleaned.push({
        id: def.id,
        tabs: [tab],
        activeTab: tab,
        xPct: def.xPct,
        yPct: def.yPct,
        scale: def.scale,
        minimized: def.minimized,
      });
    }
  }
  return cleaned;
}

export function readHudLayout(storage, knownWidgetIds, config = HUD_CONFIG) {
  try {
    const parsed = JSON.parse(storage?.getItem(config.storageKey));
    if (parsed?.version === config.version) {
      return sanitizeHudLayout(parsed.groups, knownWidgetIds, DEFAULT_HUD_LAYOUT, config);
    }
  } catch {
    // Fallback to default layout.
  }
  return sanitizeHudLayout(null, knownWidgetIds, DEFAULT_HUD_LAYOUT, config);
}

export function saveHudLayout(storage, groups, config = HUD_CONFIG) {
  try {
    storage?.setItem(config.storageKey, JSON.stringify({ version: config.version, groups }));
    return true;
  } catch {
    return false;
  }
}

/**
 * DOM Floating Window Manager:
 * - Percentage-positioned, viewport-clamped HUD windows
 * - Proportional corner scaling with safe minimum floor
 * - Browser-style icon tabs supporting merge, unmerge (tear-off), and minimize/reveal
 */
export function createHudWindowManager(layer, widgets, storage, config = HUD_CONFIG) {
  const widgetMap = new Map(widgets.map(w => [w.id, w]));
  const widgetIds = widgets.map(w => w.id);
  let groups = readHudLayout(storage, widgetIds, config);
  let zTop = config.baseZIndex;
  const groupElements = new Map();
  let dragGhost = null;

  function persist() {
    saveHudLayout(storage, groups, config);
  }

  function isWidgetVisible(id) {
    const w = widgetMap.get(id);
    return w ? (w.isVisible ? w.isVisible() : true) : false;
  }

  function visibleTabsOf(group) {
    return group.tabs.filter(isWidgetVisible);
  }

  function ensureActiveTab(group, visibleTabs) {
    if (!visibleTabs.length) return null;
    if (!visibleTabs.includes(group.activeTab)) {
      group.activeTab = visibleTabs[0];
    }
    return group.activeTab;
  }

  function bringToFront(el) {
    zTop += 1;
    el.style.zIndex = String(zTop);
  }

  function applyGroupGeometry(group, natW, natH, viewport) {
    const record = groupElements.get(group.id);
    if (!record) return;
    const { win, scaler, body, slots } = record;
    const visibleTabs = visibleTabsOf(group);
    win.hidden = visibleTabs.length === 0;
    if (win.hidden) return;

    const active = ensureActiveTab(group, visibleTabs);
    body.hidden = group.minimized;
    win.classList.toggle('is-minimized', group.minimized);
    win.classList.toggle('has-tabs', visibleTabs.length > 1);

    for (const [id, slot] of slots.entries()) {
      slot.hidden = id !== active;
    }

    const safeScale = clampWindowScale(group.scale, { width: natW, height: natH }, viewport, config);
    group.scale = safeScale;

    const scaledW = Math.round(natW * safeScale);
    const scaledH = Math.round(natH * safeScale);
    const clamped = clampWindowPercent(group.xPct, group.yPct, { width: scaledW, height: scaledH }, viewport, config);
    group.xPct = clamped.xPct;
    group.yPct = clamped.yPct;

    const leftVal = `${group.xPct.toFixed(3)}%`;
    const topVal = `${group.yPct.toFixed(3)}%`;
    const wVal = `${scaledW}px`;
    const hVal = `${scaledH}px`;
    const trVal = `scale(${safeScale.toFixed(4)})`;

    if (record.lastLeft !== leftVal) { win.style.left = leftVal; record.lastLeft = leftVal; }
    if (record.lastTop !== topVal) { win.style.top = topVal; record.lastTop = topVal; }
    if (record.lastW !== wVal) { win.style.width = wVal; record.lastW = wVal; }
    if (record.lastH !== hVal) { win.style.height = hVal; record.lastH = hVal; }
    if (record.lastTr !== trVal) { scaler.style.transform = trVal; record.lastTr = trVal; }

    record.tabBar.querySelectorAll('.hud-tab').forEach(tabBtn => {
      const id = tabBtn.dataset.tabId;
      const isCurrent = id === active;
      tabBtn.classList.toggle('is-active', isCurrent && !group.minimized);
      tabBtn.setAttribute('aria-selected', String(isCurrent && !group.minimized));
    });
    const minTip = group.minimized ? 'Reveal window' : 'Minimize window';
    if (record.minBtn.dataset.tip !== minTip) {
      record.minBtn.setAttribute('aria-label', minTip);
      record.minBtn.dataset.tip = minTip;
      record.minBtn.textContent = group.minimized ? '+' : '\u2212';
    }
  }

  function syncGroupGeometry(group, remeasure = true) {
    const record = groupElements.get(group.id);
    if (!record) return;
    const { win, scaler, body, slots } = record;
    const visibleTabs = visibleTabsOf(group);
    win.hidden = visibleTabs.length === 0;
    if (win.hidden) return;

    const active = ensureActiveTab(group, visibleTabs);
    body.hidden = group.minimized;
    win.classList.toggle('is-minimized', group.minimized);
    for (const [id, slot] of slots.entries()) slot.hidden = id !== active;

    if (remeasure || !record.natW || !record.natH) {
      scaler.style.transform = 'scale(1)';
      win.style.width = 'auto';
      win.style.height = 'auto';
      record.natW = Math.max(1, scaler.offsetWidth);
      record.natH = Math.max(1, scaler.offsetHeight);
      record.lastW = null;
      record.lastH = null;
      record.lastTr = null;
    }

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    applyGroupGeometry(group, record.natW, record.natH, viewport);
  }

  function syncAllBatched(remeasure = false) {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const toMeasure = [];
    // Phase 1: batch visibility + reset writes before any layout read.
    for (const group of groups) {
      const record = groupElements.get(group.id);
      if (!record) continue;
      const visibleTabs = visibleTabsOf(group);
      record.win.hidden = visibleTabs.length === 0;
      if (record.win.hidden) continue;
      const active = ensureActiveTab(group, visibleTabs);
      record.body.hidden = group.minimized;
      record.win.classList.toggle('is-minimized', group.minimized);
      for (const [id, slot] of record.slots.entries()) slot.hidden = id !== active;
      if (remeasure || !record.natW || !record.natH) {
        record.scaler.style.transform = 'scale(1)';
        record.win.style.width = 'auto';
        record.win.style.height = 'auto';
        record.lastW = null;
        record.lastH = null;
        record.lastTr = null;
        toMeasure.push(record);
      }
    }
    // Phase 2: single combined layout read pass (at most 1 reflow total).
    for (const record of toMeasure) {
      record.natW = Math.max(1, record.scaler.offsetWidth);
      record.natH = Math.max(1, record.scaler.offsetHeight);
    }
    // Phase 3: apply all geometry writes with zero further reads.
    for (const group of groups) {
      const record = groupElements.get(group.id);
      if (!record || record.win.hidden) continue;
      applyGroupGeometry(group, record.natW, record.natH, viewport);
    }
  }

  function findDropTarget(clientX, clientY, excludeGroupId) {
    for (const [id, record] of groupElements.entries()) {
      if (id === excludeGroupId || record.win.hidden) continue;
      const rect = record.win.getBoundingClientRect();
      if (clientX >= rect.left - 8 && clientX <= rect.right + 8
        && clientY >= rect.top - 8 && clientY <= rect.bottom + 8) {
        return id;
      }
    }
    return null;
  }

  function setMergeHighlight(targetGroupId) {
    for (const [id, record] of groupElements.entries()) {
      record.win.classList.toggle('merge-target', id === targetGroupId);
    }
  }

  function startGroupDrag(event, group, tabId = null) {
    if (event.button !== 0) return;
    if (event.target.closest('.hud-min-btn')) return;
    const record = groupElements.get(group.id);
    if (!record) return;
    bringToFront(record.win);

    const startX = event.clientX;
    const startY = event.clientY;
    const startXPct = group.xPct;
    const startYPct = group.yPct;
    const isSingleTabDetach = Boolean(tabId && visibleTabsOf(group).length > 1);
    let moved = false;
    let detached = false;
    let mergeTargetId = null;

    function showGhost(x, y) {
      if (!dragGhost) {
        const w = widgetMap.get(tabId);
        dragGhost = document.createElement('div');
        dragGhost.className = 'hud-tab-ghost gu-panel sm';
        dragGhost.innerHTML = `${w.iconHtml()}<span>${w.title()}</span>`;
        document.body.appendChild(dragGhost);
      }
      dragGhost.style.left = `${x + 10}px`;
      dragGhost.style.top = `${y + 10}px`;
    }

    function clearGhost() {
      dragGhost?.remove();
      dragGhost = null;
    }

    function onMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;

      if (isSingleTabDetach) {
        if (Math.hypot(dx, dy) >= config.tearOffDistancePx) {
          detached = true;
          showGhost(moveEvent.clientX, moveEvent.clientY);
          mergeTargetId = findDropTarget(moveEvent.clientX, moveEvent.clientY, group.id);
          setMergeHighlight(mergeTargetId);
        }
        return;
      }

      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const nextXPct = startXPct + (dx / vw) * 100;
      const nextYPct = startYPct + (dy / vh) * 100;
      const rect = record.win.getBoundingClientRect();
      const clamped = clampWindowPercent(nextXPct, nextYPct, { width: rect.width, height: rect.height }, { width: vw, height: vh }, config);
      group.xPct = clamped.xPct;
      group.yPct = clamped.yPct;
      record.win.style.left = `${group.xPct.toFixed(3)}%`;
      record.win.style.top = `${group.yPct.toFixed(3)}%`;
      record.win.classList.add('is-dragging');

      mergeTargetId = findDropTarget(moveEvent.clientX, moveEvent.clientY, group.id);
      setMergeHighlight(mergeTargetId);
    }

    function onUp(upEvent) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      record.win.classList.remove('is-dragging');
      setMergeHighlight(null);
      clearGhost();

      if (!moved) {
        if (tabId) {
          if (group.minimized) {
            group.activeTab = tabId;
            group.minimized = false;
          } else if (group.activeTab === tabId) {
            group.minimized = true;
          } else {
            group.activeTab = tabId;
          }
          rebuild();
          persist();
        }
        return;
      }

      if (isSingleTabDetach && detached) {
        if (mergeTargetId) {
          groups = mergeGroups(groups, group.id, mergeTargetId, tabId);
        } else {
          const vw = Math.max(1, window.innerWidth);
          const vh = Math.max(1, window.innerHeight);
          const dropXPct = Math.max(0, Math.min(92, (upEvent.clientX / vw) * 100 - 4));
          const dropYPct = Math.max(0, Math.min(92, (upEvent.clientY / vh) * 100 - 2));
          groups = detachTab(groups, group.id, tabId, dropXPct, dropYPct);
        }
        rebuild();
        persist();
        return;
      }

      if (mergeTargetId) {
        groups = mergeGroups(groups, group.id, mergeTargetId);
        rebuild();
        persist();
        return;
      }

      syncGroupGeometry(group);
      persist();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function startGroupResize(event, group) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const record = groupElements.get(group.id);
    if (!record) return;
    bringToFront(record.win);

    const rect = record.win.getBoundingClientRect();
    const originX = rect.left;
    const originY = rect.top;
    const startW = Math.max(1, rect.width);
    const startH = Math.max(1, rect.height);
    const startScale = group.scale;
    const natW = startW / startScale;
    const natH = startH / startScale;
    const startDist = Math.max(24, Math.hypot(event.clientX - originX, event.clientY - originY));

    record.win.classList.add('is-resizing');

    function onMove(moveEvent) {
      const curDist = Math.max(16, Math.hypot(
        Math.max(8, moveEvent.clientX - originX),
        Math.max(8, moveEvent.clientY - originY),
      ));
      const ratio = curDist / startDist;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      group.scale = clampWindowScale(startScale * ratio, { width: natW, height: natH }, viewport, config);
      record.natW = natW;
      record.natH = natH;
      applyGroupGeometry(group, natW, natH, viewport);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      record.win.classList.remove('is-resizing');
      syncGroupGeometry(group, false);
      persist();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function rebuild() {
    // Detach live widget nodes safely before clearing shells so listeners persist.
    for (const w of widgets) {
      if (w.element.parentNode) w.element.parentNode.removeChild(w.element);
    }
    layer.replaceChildren();
    groupElements.clear();

    for (const group of groups) {
      const visibleTabs = visibleTabsOf(group);
      const active = ensureActiveTab(group, visibleTabs);

      const win = document.createElement('div');
      win.className = 'hud-window';
      win.dataset.groupId = group.id;
      win.style.zIndex = String(++zTop);
      win.addEventListener('pointerdown', () => bringToFront(win));

      const scaler = document.createElement('div');
      scaler.className = 'hud-window-scaler';

      const header = document.createElement('div');
      header.className = 'hud-window-bar';
      header.addEventListener('pointerdown', event => {
        if (!event.target.closest('.hud-tab')) startGroupDrag(event, group, null);
      });

      const tabBar = document.createElement('div');
      tabBar.className = 'hud-tab-strip';
      tabBar.setAttribute('role', 'tablist');

      for (const tabId of visibleTabs) {
        const w = widgetMap.get(tabId);
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'hud-tab';
        tabBtn.dataset.tabId = tabId;
        tabBtn.dataset.tip = `${w.title()} · Click to toggle, drag onto another HUD to merge`;
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-label', w.title());
        const text = visibleTabs.length > 1 ? (w.mergedTitle?.() || w.shortTitle?.() || w.title()) : (w.shortTitle ? w.shortTitle() : w.title());
        tabBtn.innerHTML = `<span class="hud-tab-icon">${w.iconHtml()}</span>${text ? `<span class="hud-tab-label">${text}</span>` : ''}`;
        tabBtn.addEventListener('pointerdown', event => {
          event.stopPropagation();
          startGroupDrag(event, group, tabId);
        });
        tabBar.appendChild(tabBtn);
      }

      const minBtn = document.createElement('button');
      minBtn.type = 'button';
      minBtn.className = 'hud-min-btn';
      minBtn.addEventListener('click', event => {
        event.stopPropagation();
        group.minimized = !group.minimized;
        syncGroupGeometry(group);
        persist();
      });

      header.append(tabBar, minBtn);

      const body = document.createElement('div');
      body.className = 'hud-window-body';
      const slots = new Map();
      for (const tabId of group.tabs) {
        const w = widgetMap.get(tabId);
        if (!w) continue;
        const slot = document.createElement('div');
        slot.className = 'hud-tab-slot';
        slot.dataset.tabId = tabId;
        slot.hidden = tabId !== active;
        slot.appendChild(w.element);
        body.appendChild(slot);
        slots.set(tabId, slot);
      }

      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'hud-resize-handle';
      resizeHandle.dataset.tip = 'Drag corner to scale HUD window';
      resizeHandle.setAttribute('aria-label', 'Resize HUD window');
      resizeHandle.addEventListener('pointerdown', event => startGroupResize(event, group));

      scaler.append(header, body, resizeHandle);
      win.appendChild(scaler);
      layer.appendChild(win);
      groupElements.set(group.id, {
        win, scaler, header, tabBar, minBtn, body, slots, resizeHandle,
        natW: 0, natH: 0, lastLeft: null, lastTop: null, lastW: null, lastH: null, lastTr: null,
      });
    }
    syncAllBatched(true);
  }

  function reveal(widgetId) {
    const group = groups.find(g => g.tabs.includes(widgetId));
    if (!group) return;
    group.activeTab = widgetId;
    group.minimized = false;
    refresh();
    const record = groupElements.get(group.id);
    if (record) {
      syncGroupGeometry(group, true);
      bringToFront(record.win);
    }
  }

  function refresh() {
    let structureChanged = false;
    for (const group of groups) {
      const record = groupElements.get(group.id);
      if (!record) {
        structureChanged = true;
        break;
      }
      const visible = visibleTabsOf(group);
      const renderedTabs = [...record.tabBar.querySelectorAll('.hud-tab')].map(el => el.dataset.tabId);
      if (visible.length !== renderedTabs.length || visible.some((id, idx) => id !== renderedTabs[idx])) {
        structureChanged = true;
        break;
      }
      for (const tabBtn of record.tabBar.querySelectorAll('.hud-tab')) {
        const w = widgetMap.get(tabBtn.dataset.tabId);
        const label = visible.length > 1 ? (w.mergedTitle?.() || w.shortTitle?.() || w.title()) : (w.shortTitle ? w.shortTitle() : w.title());
        const labelEl = tabBtn.querySelector('.hud-tab-label');
        if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
        const iconEl = tabBtn.querySelector('.hud-tab-icon');
        const nextIcon = w.iconHtml();
        if (iconEl && iconEl.innerHTML !== nextIcon) iconEl.innerHTML = nextIcon;
      }
      const active = ensureActiveTab(group, visible);
      if (active && !record.slots.has(active)) {
        structureChanged = true;
        break;
      }
    }
    if (structureChanged) rebuild();
    else syncAllBatched(false);
  }

  function resetLayout() {
    groups = sanitizeHudLayout(null, widgetIds, DEFAULT_HUD_LAYOUT, config);
    rebuild();
    persist();
  }

  function clampAll(remeasure = false) {
    syncAllBatched(remeasure);
  }

  function syncWidget(widgetId) {
    const group = groups.find(g => g.tabs.includes(widgetId));
    if (group) syncGroupGeometry(group, true);
  }

  window.addEventListener('resize', () => syncAllBatched(false));
  rebuild();

  return {
    refresh,
    reveal,
    resetLayout,
    clampAll,
    syncWidget,
    getLayout: () => cloneLayout(groups),
    merge(sourceGroupId, targetGroupId, tabId = null) {
      groups = mergeGroups(groups, sourceGroupId, targetGroupId, tabId);
      rebuild();
      persist();
    },
    detach(sourceGroupId, tabId, xPct, yPct) {
      groups = detachTab(groups, sourceGroupId, tabId, xPct, yPct);
      rebuild();
      persist();
    },
  };
}
