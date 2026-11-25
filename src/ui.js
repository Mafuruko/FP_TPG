import { describeInteraction } from './assets.js';
import { sampleWeather, timePeriod, weatherId, weatherProfiles } from './climate.js';
import { tileToWorld, walkable, worldToTile } from './geometry.js';
import { debugOptions, svgUrl } from './render.js';
import { abilities } from './world.js';
import { construction, costLabel, landmarks, researchProjects } from './progression.js';
import { needStatus, recolorSvgToGold, skillProgress, villagerQuirks, villagerSkills } from './villagers.js';
import { bindSmartTooltips } from './tooltips.js';
import { createHudWindowManager } from './hud-windows.js';
import { renderDevActionsHtml, runDevAction } from './dev-tools.js';
import { createMusicPlayer } from './music.js';
import { bindPreferences, renderPreferences } from './preferences.js';
import {
  ACHIEVEMENT_DEFS, CHALLENGE_DEFS, FEATURE_GUIDE_MAP, FEATURE_GUIDES,
  findNearestResource, getActiveChapter, landmarkAnchor, STORY_CONFIG,
} from './story.js';

const element = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const img = (svg, css) => `<img class="${css}" src="${escape(svgUrl(svg))}" alt="">`;
const names = {
  villagers: 'Villagers', buildings: 'Buildings', research: 'Research',
  collection: 'Collection Book', settings: 'Settings', save: 'Save & Load',
  achievements: 'Achievements', notifications: 'Notifications & Events', pause: 'Paused', journal: 'Island Journal',
  guide: 'Field Guide',
};
const panelIcons = {
  villagers: 'villagers', buildings: 'build', research: 'research', collection: 'book',
  settings: 'gear', save: 'save', achievements: 'trophy', notifications: 'info', pause: 'pause', journal: 'book',
  guide: 'curious',
};
const researchIcons = {
  heal: 'health', farm: 'hunger', fish: 'discovery', advanced_construction: 'build', ancient_knowledge: 'knowledge',
};
const collectionTabs = [
  ['seashell', 'Shells'],
  ['mineral', 'Minerals'],
  ['artifact', 'Artifacts'],
  ['butterfly', 'Butterflies'],
];

const RESOURCES_TAB_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">
  <path fill="#3b2a22" d="M2 3h10v9H2z"/>
  <path fill="#c89456" d="M3 4h8v7H3z"/>
  <path fill="#8e6032" d="M3 7h8v1H3zm3-3h2v7H6z"/>
  <path fill="#f0d28b" d="M4 5h2v1H4zm4 0h2v1H8z"/>
</svg>`;

/**
 * Pixel-art crisp SVG icons matching the warm wood/parchment studio palette (#3b2a22 outline):
 * - health: heart
 * - hunger: crossed fork & spoon
 * - energy: lightning bolt
 */
export const NEED_ICONS = {
  health: `<svg class="need-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="#3b2a22" d="M3 2h3v1h2V2h3v1h1v1h1v3h-1v2h-1v1h-1v1H9v1H8v1H6v-1H5v-1H4v-1H3V9H2V7H1V4h1V3h1z"/>
    <path fill="#d94e45" d="M3 3h3v1h2V3h3v1h1v3h-1v2h-1v1H9v1H8v1H6v-1H5v-1H4V9H3V7H2V4h1z"/>
    <path fill="#f79c8e" d="M3 4h2v1H4v1H3z"/>
  </svg>`,
  hunger: `<svg class="need-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="#3b2a22" d="M2 1h1v2h1V1h1v2h1v3H5v1h2v1h1V6h1V2h2v1h1v3h-1v1H9v1h1v1h1v1h1v2h-2v-1H9v-1H8V9H6v1H5v1H4v1H2v-2h1V9h1V8h1V7H3V6H2V1z"/>
    <path fill="#e7dec8" d="M3 2h1v2H3V2zm2 0h1v2H5V2zM3 4h3v2H3V4zm7-1h1v3h-1V3z"/>
    <path fill="#c89e64" d="M5 6h2v2H5V6zm2 1h2v2H7V7zm-2 2h1v1H4v1H3v-1h1V9h1zm4 0h1v1h1v1h-1v-1H9V9z"/>
  </svg>`,
  energy: `<svg class="need-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true">
    <path fill="#3b2a22" d="M7 1h4v2h-1v2h2v2h-1v1h-1v1H9v1H8v2H6v1H4v-3h1V8H3V6h1V5h1V3h1V2h1z"/>
    <path fill="#f2c444" d="M7 2h3v1H9v2H8v1h3v1h-1v1H9v1H8v1H7v1H5v-2h1V7H4V6h1V5h1V3h1z"/>
    <path fill="#fff4b8" d="M7 3h1v2H7V3zM6 6h2v1H6V6z"/>
  </svg>`,
};

function formatClockTime(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function musicTrack({ time, weather }) {
  if (time.paused) return 'menu';
  if (sampleWeather(weather, time.seconds).rain >= 0.12) return 'rain';
  return time.minutes >= 360 && time.minutes < 1140 ? 'daytime' : 'nighttime';
}

export function createUI(world, view, actions) {
  const { state, assets, map } = world;
  const { GameUI, applyTheme, timeBox } = assets.ui;
  const { btn, ic } = GameUI;
  applyTheme();
  const panel = element('panel');
  const content = element('panel-content');
  const hud = element('studio-hud');
  const hudWindowsLayer = element('hud-windows');
  const questTracker = element('quest-tracker');
  const debugPanel = element('debug-panel');
  const wipeDataBtn = element('wipe-data');
  let storage = null;
  try { storage = window.localStorage; } catch { /* Ignore storage unavailability. */ }
  const { preferences } = actions;
  let menu = null;
  let collectionDetail = null;
  let collectionTab = 'seashell';
  let buildingFilter = 'buildable';
  let buildingType = 'house';
  let buildingState = 'completed';
  let buildingSitePage = 0;
  let villagerPage = 0;
  let journalPage = 0;
  let notesPage = 0;
  let achTab = 'milestones';
  let achPage = 0;
  let guideId = 'basics';
  let guidePage = 0;
  let confirmSaveWipe = false;
  let wipeArmedUntil = 0;
  let wipeArmTimer = null;
  let lastQuestSignature = '';
  let devTab = 'actions';
  let devActionPage = 0;
  let noticeTimer;
  let lastClockVisualKey = null;
  let lastClockDay = null;
  let lastClockMinute = null;
  let lastSpeed;
  let lastPaused;
  let lastPopulation;
  let menuTrigger;
  const menuHistory = [];
  const notes = [];
  let lastRevision;
  const music = createMusicPlayer({
    volume: preferences.master * preferences.music / 10000,
    onError: () => notify('Music could not start in this browser.'),
  });

  const resources = [
    ['food', 'Food', 'resource_berries'], ['wood', 'Wood', 'resource_wood_log'],
    ['stone', 'Stone', 'resource_stone'], ['knowledge', 'Knowledge'],
  ].map(([id, tip, assetId]) => ({ id, tip, assetId, icon: !assetId && 'knowledge', warn: -1 }));
  const hudState = () => ({
    screen: menu, res: state.resources, day: state.time.day, hour: (Math.floor(state.time.minutes) + 0.00001) / 60,
    weather: weatherId(state.weather.current), weatherLabel: weatherProfiles[weatherId(state.weather.current)].label,
    period: timePeriod(state.time.minutes), speed: state.time.paused ? 0 : state.time.speed,
    pop: state.villagers.length, popMax: state.world.populationCapacity, toasts: [],
  });
  GameUI.A = (kind, id, options = {}) => {
    const asset = assets.registry.get(id);
    if (kind === 'vil') return options.v ? portrait(options.v, 'thumb') : '';
    if (!asset) return '';
    const url = escape(svgUrl(asset.svg(options)));
    const scale = options.z || 1;
    return `<img src="${url}" width="${asset.width * scale}" height="${asset.height * scale}" alt="">`;
  };
  hud.innerHTML = GameUI.renderGameHUD(hudState(), { resources });
  const topPanels = [...hud.querySelectorAll('.gu-top > .gu-panel')];
  const resourcePanel = topPanels[0];
  const timePanel = topPanels.at(-1);
  const counters = [...resourcePanel.querySelectorAll('.gu-res .gu-ctr')];
  resources.forEach((resource, index) => { counters[index].setAttribute('aria-label', resource.tip); });
  counters.at(-1).setAttribute('aria-label', 'Population and housing capacity');
  const selection = hud.querySelector('.gu-sel');
  const toasts = hud.querySelector('.gu-toasts');
  const nav = hud.querySelector('.gu-nav');
  const cameraPanel = hud.querySelector('.gu-br > .gu-panel') || hud.querySelector('.gu-br');
  const focusButton = cameraPanel.querySelector('[data-act="cam"][data-arg="focus"]');
  selection.replaceChildren();
  hud.querySelector('.gu-top')?.remove();
  hud.querySelector('.gu-br')?.remove();
  element('close-panel').innerHTML = ic('close', 16);

  // Build modular floating, resizable, viewport-clamped, mergeable HUD windows.
  const hudWindows = createHudWindowManager(hudWindowsLayer, [
    {
      id: 'resources',
      element: resourcePanel,
      title: () => 'Resources',
      shortTitle: () => 'Resources',
      iconHtml: () => RESOURCES_TAB_ICON,
      isVisible: () => true,
    },
    {
      id: 'quest',
      element: questTracker,
      title: () => 'Island Guide',
      shortTitle: () => 'Guide',
      iconHtml: () => ic('curious', 14),
      isVisible: () => true,
    },
    {
      id: 'clock',
      element: timePanel,
      title: () => 'Clock & Speed',
      shortTitle: () => 'Clock',
      iconHtml: () => ic('clock', 14),
      isVisible: () => true,
    },
    {
      id: 'nav',
      element: nav,
      title: () => 'Menu Bar',
      shortTitle: () => '',
      mergedTitle: () => 'Menu',
      iconHtml: () => ic('book', 14),
      isVisible: () => true,
    },
    {
      id: 'menu',
      element: panel,
      title: () => names[menu] || 'Panel',
      shortTitle: () => names[menu] || 'Panel',
      iconHtml: () => ic(panelIcons[menu] || 'info', 14),
      isVisible: () => Boolean(menu),
    },
    {
      id: 'selection',
      element: selection,
      title: () => 'Selected Villager',
      shortTitle: () => 'Selected',
      iconHtml: () => ic('villagers', 14),
      isVisible: () => Boolean(view.selectedVillager && selection.childElementCount),
    },
    {
      id: 'camera',
      element: cameraPanel,
      title: () => 'Camera Controls',
      shortTitle: () => 'Camera',
      iconHtml: () => ic('zoomin', 14),
      isVisible: () => true,
    },
    {
      id: 'dev',
      element: debugPanel,
      title: () => 'Dev Mode',
      shortTitle: () => 'Dev Mode',
      iconHtml: () => ic('gear', 14),
      isVisible: () => Boolean(view.debug),
    },
  ], storage);

  world.resources.subscribe((key, value) => {
    counters[resources.findIndex(resource => resource.id === key)].querySelector('span').textContent = value;
    if ((menu === 'research' && key === 'knowledge') || menu === 'buildings') renderMenu();
  });

  function clearToasts() {
    clearTimeout(noticeTimer);
    toasts.replaceChildren();
  }

  function notify(text) {
    const note = { id: `note-${notes.length + 1}`, type: 'info', title: text, text: '' };
    notes.push(note);
    if (menu === 'notifications') renderMenu();
    if (view.storyActive) return;
    toasts.innerHTML = GameUI.renderNotification(note);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { toasts.replaceChildren(); }, 3600);
  }

  function syncMusic() {
    music.select(view.mode === 'playing' ? musicTrack(state) : 'menu');
  }

  function syncVolume() {
    music.setVolume(preferences.master * preferences.music / 10000);
  }

  function startMusic(event) {
    if (event.isTrusted) music.retry();
  }
  window.addEventListener('click', startMusic);
  window.addEventListener('keydown', startMusic);

  let clockDayNode = null;
  let clockTimeNode = null;
  function bindClockNodes() {
    const bolds = timePanel.firstElementChild?.querySelectorAll('b');
    clockDayNode = bolds?.[0] || null;
    clockTimeNode = bolds?.[1] || null;
  }
  bindClockNodes();

  function refreshStatus() {
    const { time, weather } = state;
    const wholeMinute = Math.floor(time.minutes);
    const visualKey = `${timePeriod(time.minutes)}|${weather.current}`;
    const speed = time.paused ? 0 : time.speed;
    syncMusic();

    // Rebuild the clock artwork only when the period or weather label changes.
    if (visualKey !== lastClockVisualKey) {
      lastClockVisualKey = visualKey;
      lastClockDay = time.day;
      lastClockMinute = wholeMinute;
      const clock = document.createElement('div');
      clock.innerHTML = timeBox(hudState());
      timePanel.firstElementChild.replaceWith(clock.firstElementChild);
      bindClockNodes();
      hudWindows.syncWidget('clock');
    } else if (wholeMinute !== lastClockMinute || time.day !== lastClockDay) {
      // Fast zero-reflow in-place text update on normal minute ticks.
      if (time.day !== lastClockDay) {
        lastClockDay = time.day;
        if (clockDayNode) clockDayNode.textContent = `Day ${time.day}`;
      }
      if (wholeMinute !== lastClockMinute) {
        lastClockMinute = wholeMinute;
        if (clockTimeNode) clockTimeNode.textContent = formatClockTime(wholeMinute);
      }
    }

    if (lastSpeed !== speed) {
      lastSpeed = speed;
      timePanel.querySelectorAll('[data-act="speed"]').forEach(button => {
        const active = Number(button.dataset.arg) === speed;
        button.setAttribute('aria-pressed', active);
        button.classList.toggle('g', active);
        button.classList.toggle('s', !active);
      });
    }
    if (lastPaused !== time.paused) {
      lastPaused = time.paused;
      hud.querySelector('.gu-paused')?.remove();
      if (time.paused) hud.insertAdjacentHTML('beforeend', `<div class="gu-paused">${btn('Paused · Menu', { icon: 'pause', act: 'open', arg: 'pause' })}</div>`);
    }
    const population = `${state.villagers.length}/${state.world.populationCapacity}`;
    if (population !== lastPopulation) {
      lastPopulation = population;
      const counter = counters.at(-1);
      counter.querySelector('span').firstChild.textContent = state.villagers.length;
      counter.querySelector('small').textContent = '/' + state.world.populationCapacity;
      counter.classList.toggle('low', state.villagers.length >= state.world.populationCapacity);
    }
    focusButton.disabled = !view.selectedVillager;
    if (lastRevision !== world.gameplay?.revision) {
      lastRevision = world.gameplay?.revision;
      if (view.selectedVillager && !state.villagers.some(villager => villager.id === view.selectedVillager)) {
        view.selectedVillager = null;
        selection.replaceChildren();
        hudWindows.refresh();
      }
      if (['villagers', 'journal', 'buildings', 'research', 'collection', 'achievements'].includes(menu)) renderMenu();
    }
  }

  function portrait(villager, css) {
    const raw = assets.villager.svg({ config: { ...villager.appearance, name: villager.name, lifeStage: villager.lifeStage } });
    return img(villager.special?.golden ? recolorSvgToGold(raw) : raw, css);
  }

  function renderPager(page, totalPages, act) {
    if (totalPages <= 1) return '';
    return `<div class="pager-bar">
      <button type="button" class="gu-btn s pager-btn" data-act="${act}" data-arg="${Math.max(0, page - 1)}" ${page <= 0 ? 'disabled' : ''}>‹ Prev</button>
      <span class="pager-count">${page + 1} / ${totalPages}</span>
      <button type="button" class="gu-btn s pager-btn" data-act="${act}" data-arg="${Math.min(totalPages - 1, page + 1)}" ${page >= totalPages - 1 ? 'disabled' : ''}>Next ›</button>
    </div>`;
  }

  function renderNeedRow(key, tipLabel) {
    return `<div class="need-bar-item" data-need="${key}" data-tip="${tipLabel}" aria-label="${tipLabel}">
      ${NEED_ICONS[key]}
      <div class="need-bar-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-label="${tipLabel}">
        <div class="need-bar-fill" data-tone="good" style="width:100%"></div>
      </div>
    </div>`;
  }

  function renderVillagers() {
    const selected = state.villagers.find(villager => villager.id === view.selectedVillager);
    const illBadge = selected?.illness
      ? `<div class="villager-illness-alert">${ic('sick', 14)}<span>Fever active! ${state.abilities.heal ? 'Drag a healthy adult onto them to heal.' : 'Unlock Healing (10 Knowledge) in Research!'}</span></div>`
      : '';
    const isHolding = Boolean(selected && selected.holdStillUntil > state.time.seconds);
    const specialTags = selected ? [
      selected.special?.golden ? '<span class="villager-special-chip is-gold">★ Golden</span>' : '',
      selected.special?.champion ? '<span class="villager-special-chip is-champ">⚡ 10× Speed</span>' : '',
    ].filter(Boolean).join('') : '';
    const profile = selected ? `<div class="villager-card">
      <div class="villager-card-top">
        ${portrait(selected, 'portrait')}
        <div class="villager-card-meta">
          <div class="villager-card-head">
            <h3>${escape(selected.name)}</h3>
            <span class="villager-age-chip">${escape(selected.lifeStage)} · <span id="villager-age">${selected.age}</span></span>
          </div>
          ${specialTags ? `<div class="villager-special-row">${specialTags}</div>` : ''}
          <p class="villager-task-line" id="villager-task"></p>
          <p class="villager-quirks">${(selected.quirks || []).map(quirk => escape(villagerQuirks[quirk])).join(' · ')}</p>
          <div class="villager-needs-bars" id="villager-needs" aria-label="Villager needs">
            ${renderNeedRow('health', 'Health')}
            ${renderNeedRow('hunger', 'Fed')}
            ${renderNeedRow('energy', 'Energy')}
          </div>
        </div>
      </div>
      ${illBadge}
      <div class="villager-skills-grid" aria-label="Skills">${Object.entries(villagerSkills).map(([key, skill]) => `
        <div class="villager-skill-pill" data-skill="${key}">
          <span class="skill-label">${skill.label}</span>
          <b class="skill-rank" data-tier="0"></b>
        </div>`).join('')}</div>
      ${selected.relationships.children?.length ? `<div class="villager-children-row"><span class="villager-children">Children: ${selected.relationships.children.length}</span></div>` : ''}
      <div class="villager-actions-grid" aria-label="Villager actions">
        <button type="button" class="gu-btn s villager-act-btn" data-act="stop-work" data-tip="Cancel current task">Stop Work</button>
        <button type="button" class="gu-btn ${isHolding ? 'g' : 's'} villager-act-btn" id="btn-stop-moving" data-act="stop-moving" data-tip="Freeze in place for 20s so grabbing is easy">${isHolding ? 'Holding…' : 'Stop Moving'}</button>
        <button type="button" class="gu-btn s villager-act-btn" data-act="find-villager" data-tip="Pan and zoom camera to this villager">Find Me</button>
      </div>
    </div>` : '';

    const perPage = 6;
    const totalPages = Math.max(1, Math.ceil(state.villagers.length / perPage));
    villagerPage = Math.max(0, Math.min(totalPages - 1, villagerPage));
    const slice = state.villagers.slice(villagerPage * perPage, villagerPage * perPage + perPage);

    return profile + `<div class="entries villager-roster">${slice.map(villager =>
      `<button class="gu-btn s entry${villager.illness ? ' is-sick' : ''}${villager.special?.golden ? ' is-golden' : ''}" data-villager="${villager.id}" aria-pressed="${selected === villager}">
      ${portrait(villager, 'thumb')}<span>${escape(villager.name)}${villager.special?.golden ? ' ★' : ''}${villager.illness ? ' ⚠' : ''}</span></button>`).join('')}</div>${renderPager(villagerPage, totalPages, 'vil-page')}`;
  }

  function renderBuildings() {
    const buildableList = assets.buildings.filter(b => Boolean(construction[b.type]));
    const list = buildingFilter === 'buildable' ? buildableList : assets.buildings;
    if (!list.some(b => b.type === buildingType)) {
      buildingType = list[0].type;
      const states = list[0].states;
      buildingState = states.completed ? 'completed' : Object.keys(states)[0];
    }
    const definition = list.find(b => b.type === buildingType) || list[0];
    const stateKeys = Object.keys(definition.states);
    if (!definition.states[buildingState]) {
      buildingState = definition.states.completed ? 'completed' : stateKeys[0];
    }
    const asset = definition.states[buildingState];
    const cost = construction[definition.type];
    const canAfford = cost ? world.resources.canAfford(cost) : false;

    const sitesPerPage = 4;
    const totalSitePages = Math.max(1, Math.ceil(state.buildings.length / sitesPerPage));
    buildingSitePage = Math.max(0, Math.min(totalSitePages - 1, buildingSitePage));
    const siteSlice = state.buildings.slice(buildingSitePage * sitesPerPage, buildingSitePage * sitesPerPage + sitesPerPage);

    return `<div class="compact-toolbar">
      <div class="compact-tabs" role="tablist">
        <button type="button" class="gu-btn ${buildingFilter === 'buildable' ? 'g' : 's'} compact-tab" data-act="bld-filter" data-arg="buildable">Build (${buildableList.length})</button>
        <button type="button" class="gu-btn ${buildingFilter === 'all' ? 'g' : 's'} compact-tab" data-act="bld-filter" data-arg="all">Gallery (${assets.buildings.length})</button>
      </div>
      <span class="compact-meta-badge">Sites: ${state.buildings.length}</span>
    </div>
    <div class="compact-card bld-card">
      <div class="bld-card-top">
        <div class="bld-preview-box">${img(asset.svg(), 'bld-thumb')}</div>
        <div class="bld-card-meta">
          <div class="bld-card-head">
            <h3>${escape(definition.name)}</h3>
            <span class="compact-chip">${asset.footprint.width}×${asset.footprint.height}</span>
          </div>
          <p class="compact-desc">${escape(asset.metadata.purpose)}</p>
          <div class="bld-state-pills">${stateKeys.map(key =>
            `<button type="button" class="state-chip ${key === buildingState ? 'is-active' : ''}" data-act="bld-state" data-arg="${key}">${escape(key)}</button>`).join('')}</div>
        </div>
      </div>
      <div class="bld-card-foot">
        <span class="compact-cost ${cost && !canAfford ? 'is-short' : ''}">${cost ? costLabel(cost) : 'Gallery preview only'}</span>
        ${cost ? `<button class="gu-btn ${canAfford ? 'p' : 's'} compact-cta" type="button" data-placement="${definition.type}">${ic('build', 14)} Place</button>` : ''}
      </div>
    </div>
    <div class="bld-picker-grid">${list.map(b => `
      <button type="button" class="gu-btn ${b.type === definition.type ? 'g' : 's'} bld-pick-btn" data-act="bld-select" data-arg="${b.type}">
        <span class="bld-pick-name">${escape(b.name)}</span>
        ${construction[b.type] ? `<small class="bld-pick-tag">${construction[b.type].wood}W · ${construction[b.type].stone}S</small>` : '<small class="bld-pick-tag">View</small>'}
      </button>`).join('')}</div>
    ${state.buildings.length ? `<div class="compact-section-head">Active sites</div>
      <div class="site-pills">${siteSlice.map(site => {
        const name = assets.buildings.find(b => b.type === site.type)?.name || site.type;
        const pct = site.progress * 25;
        return `<div class="site-pill ${pct === 100 ? 'is-done' : ''}"><span>${escape(name)}</span><b>${pct}%</b></div>`;
      }).join('')}</div>${renderPager(buildingSitePage, totalSitePages, 'bld-site-page')}` : ''}`;
  }

  function renderResearch() {
    const projects = abilities.filter(ability => Boolean(researchProjects[ability.id]));
    const unlockedCount = projects.filter(a => state.abilities[a.id]).length;
    const baseNames = abilities.filter(a => a.startsUnlocked).map(a => a.name).join(' · ');

    return `<div class="compact-toolbar">
      <span class="compact-meta-badge">${ic('knowledge', 14)} Knowledge: <b>${state.resources.knowledge}</b></span>
      <span class="compact-chip">${unlockedCount} / ${projects.length} Learned</span>
    </div>
    <div class="compact-card research-grid-card">
      <div class="research-grid">${projects.map(ability => {
        const project = researchProjects[ability.id];
        const unlocked = state.abilities[ability.id];
        const flagReady = !project.flag || state.worldFlags[project.flag];
        const canLearn = !unlocked && flagReady && state.resources.knowledge >= project.cost;
        const iconName = researchIcons[ability.id] || 'research';
        return `<div class="research-tile ${unlocked ? 'is-done' : !flagReady ? 'is-locked' : ''}">
          <div class="research-tile-head">
            <span class="research-tile-icon">${ic(iconName, 16)}</span>
            <b>${escape(ability.name)}</b>
          </div>
          <p class="compact-desc">${unlocked ? 'Unlocked for village' : escape(project.hint)}</p>
          <div class="research-tile-foot">
            ${unlocked
              ? `<span class="status-pill is-done">${ic('check', 12)} Learned</span>`
              : `<button type="button" class="gu-btn ${canLearn ? 'p' : 's'} compact-cta" data-act="research" data-arg="${ability.id}" ${!canLearn ? 'disabled' : ''}>Learn · ${project.cost}</button>`}
          </div>
        </div>`;
      }).join('')}</div>
    </div>
    <p class="compact-footnote"><b>Starting skills:</b> ${escape(baseNames)}. Assign a villager to a lit campfire or Research Hut for Knowledge.</p>`;
  }

  function renderBook() {
    const totalDiscovered = assets.collectibles.filter(c => state.collectionProgress[c.id]?.discovered).length;
    const totalCount = assets.collectibles.length;
    const items = assets.collectibles.filter(c => c.category === collectionTab);
    if (!collectionDetail || !items.some(c => c.id === collectionDetail)) {
      collectionDetail = items[0]?.id || null;
    }
    const selected = items.find(c => c.id === collectionDetail) || items[0];
    const progressEntry = selected ? state.collectionProgress[selected.id] : null;
    const isFound = Boolean(progressEntry?.discovered);
    const pct = Math.round((totalDiscovered / Math.max(1, totalCount)) * 100);

    return `<div class="compact-toolbar">
      <div class="col-tabs" role="tablist">${collectionTabs.map(([id, label]) => {
        const catItems = assets.collectibles.filter(c => c.category === id);
        const catFound = catItems.filter(c => state.collectionProgress[c.id]?.discovered).length;
        return `<button type="button" class="gu-btn ${collectionTab === id ? 'g' : 's'} compact-tab col-tab-btn" data-act="coltab" data-arg="${id}">${label} <small>${catFound}/${catItems.length}</small></button>`;
      }).join('')}</div>
    </div>
    <div class="compact-meter-row">
      <span class="compact-chip">${ic('discovery', 13)} ${totalDiscovered} / ${totalCount}</span>
      <div class="need-bar-track compact-meter"><div class="need-bar-fill" data-tone="${pct >= 80 ? 'good' : pct >= 40 ? 'warn' : 'low'}" style="width:${pct}%"></div></div>
      <span class="compact-chip">${pct}%</span>
    </div>
    <div class="compact-card col-grid-card">
      <div class="col-slot-grid">${items.map(item => {
        const found = Boolean(state.collectionProgress[item.id]?.discovered);
        const active = item.id === selected?.id;
        return `<button type="button" class="col-slot rarity-${item.rarity} ${found ? 'is-found' : 'is-hidden'} ${active ? 'is-selected' : ''}" data-act="colsel" data-arg="${item.id}" data-tip="${found ? escape(item.name) : 'Undiscovered'}">
          ${img(item.svg({ state: found ? 'normal' : 'undiscovered' }), 'col-sprite')}
        </button>`;
      }).join('')}</div>
    </div>
    ${selected ? `<div class="compact-card col-detail-card">
      <div class="col-detail-icon rarity-${selected.rarity}">${img(selected.svg({ state: isFound ? 'normal' : 'undiscovered' }), 'col-detail-sprite')}</div>
      <div class="col-detail-meta">
        <div class="bld-card-head">
          <h3>${isFound ? escape(selected.name) : 'Undiscovered Find'}</h3>
          <span class="compact-chip rarity-chip-${selected.rarity}">${escape(selected.rarity)}</span>
        </div>
        <p class="compact-desc">${isFound ? escape(selected.description) : 'Drop a villager onto a live sparkle on the island to discover this item.'}</p>
        <p class="compact-footnote">${isFound
          ? `Zone: ${escape((selected.spawn.zoneTags?.[0] || 'island').replaceAll('_', ' '))} · Day ${progressEntry.firstDiscoveredAt ?? '—'} · Found ×${progressEntry.discoveryCount}`
          : `Habitat hint: ${escape((selected.spawn.zoneTags?.[0] || 'island').replaceAll('_', ' '))}`}</p>
      </div>
    </div>` : ''}`;
  }

  function renderAchievements() {
    const milestoneStates = ACHIEVEMENT_DEFS.map(def => ({ ...def, ...def.eval(world) }));
    const challengeStates = CHALLENGE_DEFS.map(def => ({ ...def, ...def.eval(world) }));
    const doneMilestones = milestoneStates.filter(c => c.done).length;
    const doneChallenges = challengeStates.filter(c => c.done).length;

    const toolbar = `<div class="compact-toolbar">
      <div class="compact-tabs" role="tablist">
        <button type="button" class="gu-btn ${achTab === 'milestones' ? 'g' : 's'} compact-tab" data-act="ach-tab" data-arg="milestones">Milestones (${doneMilestones}/${milestoneStates.length})</button>
        <button type="button" class="gu-btn ${achTab === 'challenges' ? 'g' : 's'} compact-tab" data-act="ach-tab" data-arg="challenges">Challenges (${doneChallenges}/${challengeStates.length})</button>
      </div>
      <span class="compact-chip">${ic('trophy', 12)} ${doneMilestones + doneChallenges}/${milestoneStates.length + challengeStates.length}</span>
    </div>`;

    if (achTab === 'challenges') {
      const goldenVillager = state.villagers.find(v => v.special?.golden);
      const champion = state.villagers.find(v => v.id === state.challenges?.championVillagerId || v.special?.champion);
      return `${toolbar}
      <div class="compact-card challenge-list">${challengeStates.map(ch => {
        const pct = Math.round((ch.current / Math.max(1, ch.goal)) * 100);
        let rewardUi = `<span class="challenge-reward-tag">Reward: ${escape(ch.reward)}</span>`;
        if (ch.id === 'challenge_lone_survivor' && ch.done) {
          rewardUi = `<span class="challenge-reward-tag is-claimed">★ Golden Skin Active${goldenVillager ? `: ${escape(goldenVillager.name)}` : ''}</span>`;
        } else if (ch.id === 'challenge_speedrun' && ch.done) {
          if (champion) {
            rewardUi = `<span class="challenge-reward-tag is-claimed">⚡ Champion: ${escape(champion.name)} (Max Stats · 10× Speed)</span>`;
          } else if (state.villagers.length) {
            rewardUi = `<div class="champion-picker-row">
              <select id="champion-select" class="champion-select" aria-label="Choose villager to promote">${state.villagers.map(v =>
                `<option value="${v.id}">${escape(v.name)} (${escape(v.lifeStage)})</option>`).join('')}</select>
              <button type="button" class="gu-btn g compact-mini-btn" data-act="promote-champion">Promote 10×</button>
            </div>`;
          }
        } else if (ch.id === 'challenge_flawless_century' && ch.done) {
          rewardUi = `<span class="challenge-reward-tag is-claimed">✓ Dev Mode Permanently Unlocked</span>`;
        }
        const statusChip = ch.done ? 'Unlocked' : ch.failed ? 'Failed' : `${ch.current}/${ch.goal}`;
        return `<div class="challenge-card ${ch.done ? 'is-done' : ch.failed ? 'is-failed' : ''}">
          <div class="ach-tile-head">
            <span class="ach-tile-icon">${ic(ch.icon, 16)}</span>
            <b>${escape(ch.title)}</b>
            <span class="compact-chip ${ch.done ? 'is-done' : ''}">${statusChip}</span>
          </div>
          <p class="compact-desc">${escape(ch.desc)}</p>
          <div class="need-bar-track ach-bar"><div class="need-bar-fill" data-tone="${ch.done ? 'good' : ch.failed ? 'low' : pct >= 40 ? 'warn' : 'low'}" style="width:${pct}%"></div></div>
          ${rewardUi}
        </div>`;
      }).join('')}</div>`;
    }

    const perPage = 6;
    const totalPages = Math.max(1, Math.ceil(milestoneStates.length / perPage));
    achPage = Math.max(0, Math.min(totalPages - 1, achPage));
    const slice = milestoneStates.slice(achPage * perPage, achPage * perPage + perPage);

    return `${toolbar}
    <div class="compact-card ach-grid-card">
      <div class="ach-grid">${slice.map(card => {
        const pct = Math.round((card.current / Math.max(1, card.goal)) * 100);
        return `<div class="ach-tile ${card.done ? 'is-done' : ''}">
          <div class="ach-tile-head">
            <span class="ach-tile-icon">${ic(card.icon, 16)}</span>
            <b>${escape(card.title)}</b>
            <span class="compact-chip ${card.done ? 'is-done' : ''}">${card.done ? 'Done' : `${card.current}/${card.goal}`}</span>
          </div>
          <p class="compact-desc">${escape(card.desc)}</p>
          <div class="need-bar-track ach-bar"><div class="need-bar-fill" data-tone="${card.done ? 'good' : pct >= 40 ? 'warn' : 'low'}" style="width:${pct}%"></div></div>
        </div>`;
      }).join('')}</div>
    </div>${renderPager(achPage, totalPages, 'ach-page')}`;
  }

  function renderJournal() {
    const entries = Object.entries(landmarks);
    const perPage = 4;
    const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
    journalPage = Math.max(0, Math.min(totalPages - 1, journalPage));
    const slice = entries.slice(journalPage * perPage, journalPage * perPage + perPage);
    const doneCount = entries.filter(([id]) => state.worldFlags[id]).length;

    return `<div class="compact-toolbar">
      <span class="compact-meta-badge">${ic('book', 14)} Landmarks: <b>${doneCount} / ${entries.length}</b></span>
      <button type="button" class="gu-btn s compact-mini-btn" data-act="open" data-arg="guide">${ic('curious', 12)} Field Guide</button>
    </div>
    <div class="compact-card journal-list">${slice.map(([id, puzzle]) => `
      <div class="journal-row ${state.worldFlags[id] ? 'is-done' : ''}">
        <div class="bld-card-head">
          <b>${escape(puzzle.label)}</b>
          <div class="journal-row-actions">
            <button type="button" class="gu-btn s compact-mini-btn" data-act="pan-landmark" data-arg="${id}" data-tip="Pan camera to this landmark">Locate</button>
            <span class="compact-chip ${state.worldFlags[id] ? 'is-done' : ''}">${state.worldFlags[id] ? 'Done' : 'Open'}</span>
          </div>
        </div>
        <p class="compact-desc">${state.worldFlags[id] ? 'Completed' : escape(puzzle.hint)}</p>
      </div>`).join('')}</div>${renderPager(journalPage, totalPages, 'jrn-page')}`;
  }

  function renderGuide() {
    const perPage = 6;
    const totalPages = Math.max(1, Math.ceil(FEATURE_GUIDES.length / perPage));
    const selectedIndex = FEATURE_GUIDES.findIndex(item => item.id === guideId);
    const activeGuide = FEATURE_GUIDE_MAP[guideId] || FEATURE_GUIDES[0];
    if (selectedIndex >= 0 && Math.floor(selectedIndex / perPage) !== guidePage) {
      guidePage = Math.floor(selectedIndex / perPage);
    }
    guidePage = Math.max(0, Math.min(totalPages - 1, guidePage));
    const slice = FEATURE_GUIDES.slice(guidePage * perPage, guidePage * perPage + perPage);
    const target = activeGuide.resolveTarget?.(world);

    return `<div class="compact-toolbar">
      <span class="compact-meta-badge">${ic('curious', 14)} Topics: <b>${FEATURE_GUIDES.length}</b></span>
      <button type="button" class="gu-btn s compact-mini-btn" data-act="replay-intro" data-tip="Replay the opening island cutscene">Replay Intro</button>
    </div>
    <div class="guide-topic-grid">${slice.map(item => `
      <button type="button" class="gu-btn ${item.id === activeGuide.id ? 'g' : 's'} guide-topic-btn" data-act="guide-select" data-arg="${item.id}">
        ${ic(item.icon, 13)}<span>${escape(item.title)}</span>
      </button>`).join('')}</div>
    ${renderPager(guidePage, totalPages, 'guide-page')}
    <div class="compact-card guide-detail-card">
      <div class="bld-card-head">
        <span class="guide-detail-title">${ic(activeGuide.icon, 16)}<b>${escape(activeGuide.title)}</b></span>
        ${target ? `<button type="button" class="gu-btn g compact-mini-btn" data-act="guide-locate" data-arg="${activeGuide.id}">Show on Map</button>` : ''}
      </div>
      <p class="compact-desc">${escape(activeGuide.summary)}</p>
      <ol class="guide-steps-list">${activeGuide.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>
      <p class="guide-tip-box">${escape(activeGuide.actionHint)}</p>
    </div>`;
  }

  function refreshQuestTracker() {
    if (!questTracker) return;
    const active = getActiveChapter(world);
    const sick = state.villagers.filter(v => v.illness || v.needs.health < 55)
      .sort((a, b) => a.needs.health - b.needs.health);
    const lowFood = state.villagers.length > 0 && state.resources.food <= STORY_CONFIG.lowFoodWarningThreshold;
    const untendedGrave = (state.graves || []).find(g => !g.tendedCount);
    const sig = [
      active.chapter.id,
      active.completedCount,
      active.steps.map(s => `${s.done}:${s.progress}`).join(','),
      sick.map(v => `${v.id}:${Math.ceil(v.needs.health)}`).join(','),
      lowFood ? state.resources.food : '',
      untendedGrave?.id || '',
    ].join('|');
    if (sig === lastQuestSignature) return;
    lastQuestSignature = sig;

    let alertHtml = '';
    if (sick.length) {
      const worst = sick[0];
      const hp = Math.max(1, Math.ceil(worst.needs.health));
      alertHtml = `<div class="quest-alert is-danger">
        <span class="quest-alert-text">${ic('sick', 13)}<b>${escape(worst.name)} is sick (${hp}% HP)!</b>${sick.length > 1 ? ` +${sick.length - 1}` : ''}</span>
        <button type="button" class="gu-btn d quest-mini-btn" data-act="pan-sick" data-arg="${worst.id}" data-tip="Pan to sick villager">Locate</button>
      </div>`;
    } else if (lowFood) {
      alertHtml = `<div class="quest-alert is-warn">
        <span class="quest-alert-text">${ic('warn', 13)}<b>Food critically low (${state.resources.food})!</b></span>
        <button type="button" class="gu-btn g quest-mini-btn" data-act="pan-food" data-tip="Pan to nearest food source">Find Food</button>
      </div>`;
    } else if (untendedGrave) {
      alertHtml = `<div class="quest-alert is-memorial">
        <span class="quest-alert-text">${ic('info', 13)}<b>${escape(untendedGrave.name)}'s memorial awaits respects</b></span>
        <button type="button" class="gu-btn s quest-mini-btn" data-act="pan-grave" data-arg="${untendedGrave.id}" data-tip="Pan to memorial cairn">Locate</button>
      </div>`;
    }

    const chapterTag = active.chapter.number <= active.totalCount
      ? `Ch. ${active.chapter.number}/${active.totalCount}`
      : 'Restored';

    questTracker.innerHTML = `<div class="quest-head">
        <span class="quest-chapter-badge">${chapterTag}</span>
        <b class="quest-title">${escape(active.chapter.shortTitle)}</b>
        <div class="quest-head-btns">
          <button type="button" class="gu-btn g quest-mini-btn" data-act="pan-objective" data-tip="Pan camera to where to act next">Show Me</button>
          <button type="button" class="gu-btn s quest-mini-btn" data-act="open-guide" data-arg="${active.chapter.guideId}" data-tip="Open step-by-step feature guide">Guide</button>
        </div>
      </div>
      <p class="quest-howto">${escape(active.chapter.howTo)}</p>
      <div class="quest-steps">${active.steps.map(step =>
        `<span class="quest-step-chip ${step.done ? 'is-done' : ''}">${step.done ? '✓ ' : ''}${escape(step.label)}: <b>${escape(step.progress)}</b></span>`
      ).join('')}</div>
      ${alertHtml}`;
    hudWindows.syncWidget('quest');
  }

  function renderSettings() {
    return `${renderPreferences(preferences, actions.fullscreenSupported)}
    <div class="gu-div"></div>
    <section class="gu-col" aria-labelledby="hud-settings-title">
      <h3 id="hud-settings-title" class="gu-h">HUD &amp; Guides</h3>
      <p class="compact-desc">Drag any HUD bar to move, drag a corner to scale, or drop one onto another to merge tabs.</p>
      <div class="gu-row">
        ${btn('Reset HUD layout', { v: 's', act: 'reset-hud' })}
        ${btn('Field Guide', { icon: 'curious', v: 's', act: 'open', arg: 'guide' })}
        ${btn('Island Journal', { icon: 'book', v: 's', act: 'open', arg: 'journal' })}
      </div>
    </section>
    <div class="gu-div"></div>
    ${btn('Notifications & Events', { icon: 'info', v: 's', act: 'open', arg: 'notifications' })}`;
  }

  function renderNotifications() {
    if (!notes.length) return '<div class="gu-empty">No notifications yet.</div>';
    const ordered = [...notes].reverse();
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(ordered.length / perPage));
    notesPage = Math.max(0, Math.min(totalPages - 1, notesPage));
    const slice = ordered.slice(notesPage * perPage, notesPage * perPage + perPage);
    return `<div class="compact-card journal-list">${slice.map(note =>
      `<div class="journal-row"><b>${escape(note.title)}</b></div>`).join('')}</div>${renderPager(notesPage, totalPages, 'note-page')}`;
  }

  const views = {
    villagers: renderVillagers, buildings: renderBuildings, research: renderResearch,
    collection: renderBook, settings: renderSettings, journal: renderJournal,
    guide: renderGuide,
    achievements: renderAchievements,
    save: () => `<p>The village saves automatically in this browser.</p>
      ${actions.lastSave?.() ? `<p>Last save: ${escape(new Date(actions.lastSave()).toLocaleString())}</p>` : ''}
      <div class="gu-row">${btn('Save now', { icon: 'save', act: 'save-now' })}
        ${btn('Manage islands', { icon: 'load', v: 's', act: 'islands' })}</div>
      <div class="gu-div"></div>
      <section class="gu-col">
        <h3 class="gu-h">Testing &amp; Reset</h3>
        <p class="compact-desc">Wipe all saved slots, HUD layout, and settings to restart from the initial state.</p>
        <div class="gu-row">
          ${confirmSaveWipe
            ? `${btn('Confirm Wipe All Data', { icon: 'delete', v: 'd', act: 'wipe-save-confirm' })}
               ${btn('Cancel', { v: 's', act: 'wipe-save-cancel' })}`
            : btn('Wipe All Data (Start Fresh)', { icon: 'delete', v: 'd', act: 'wipe-save-arm' })}
        </div>
      </section>`,
    notifications: renderNotifications,
    pause: () => `<div class="entries">${btn('Resume', { icon: 'play', act: 'resume' })}
      ${btn('Field Guide', { icon: 'curious', v: 's', act: 'open', arg: 'guide' })}
      ${btn('Save & Load', { icon: 'save', v: 's', act: 'open', arg: 'save' })}
      ${btn('Settings', { icon: 'gear', v: 's', act: 'open', arg: 'settings' })}
      ${btn('Main Menu', { icon: 'arrowL', v: 's', act: 'title' })}</div>`,
  };

  function renderMenu() {
    if (!menu) return;
    const active = document.activeElement;
    const key = content.contains(active) && active.dataset.act;
    content.innerHTML = views[menu]();
    if (key) [...content.querySelectorAll('[data-act]')].find(button =>
      button.dataset.act === key && button.dataset.arg === active.dataset.arg)?.focus({ preventScroll: true });
    refreshProfile();
    hudWindows.syncWidget('menu');
  }

  function setMenu(next, focus = true) {
    menu = next;
    panel.hidden = !menu;
    panel.classList.toggle('collection', menu === 'collection');
    element('back-panel').hidden = menuHistory.length === 0;
    nav.querySelectorAll('button').forEach(button => {
      const active = (button.dataset.arg === 'build' ? 'buildings' : button.dataset.arg) === menu;
      button.setAttribute('aria-expanded', active);
      button.setAttribute('aria-pressed', active);
      button.setAttribute('aria-controls', 'panel');
      button.classList.toggle('g', active);
      button.classList.toggle('s', !active);
    });
    if (!menu) {
      hudWindows.refresh();
      return;
    }
    element('panel-title').innerHTML = ic(panelIcons[menu], 22) + escape(names[menu]);
    renderMenu();
    hudWindows.reveal('menu');
    if (focus) element('panel-title').focus();
  }

  function refreshProfile() {
    const tasks = [element('villager-task'), element('selected-task')].filter(Boolean);
    const villager = state.villagers.find(villager => villager.id === view.selectedVillager);
    const text = villager?.activity || (villager?.currentTask ? 'Walking' : 'Idle');
    for (const task of tasks) if (task.textContent !== text) task.textContent = text;
    if (!villager || !element('villager-needs')) return;
    element('villager-age').textContent = villager.age;

    const needLabels = { health: 'Health', hunger: 'Fed', energy: 'Energy' };
    for (const key of ['health', 'hunger', 'energy']) {
      const item = content.querySelector(`[data-need="${key}"]`);
      if (!item) continue;
      const { value, tone } = needStatus(villager.needs[key]);
      const tip = `${needLabels[key]}: ${value}%`;
      if (item.dataset.tip !== tip) {
        item.dataset.tip = tip;
        item.setAttribute('aria-label', tip);
      }
      const track = item.querySelector('.need-bar-track');
      if (track) track.setAttribute('aria-valuenow', String(value));
      const fill = item.querySelector('.need-bar-fill');
      if (fill) {
        const w = `${value}%`;
        if (fill.style.width !== w) fill.style.width = w;
        if (fill.dataset.tone !== tone) fill.dataset.tone = tone;
      }
    }

    for (const row of content.querySelectorAll('[data-skill]')) {
      const { rank, tier, level } = skillProgress(villager, row.dataset.skill);
      const badge = row.querySelector('.skill-rank');
      const label = `${rank.name} Lv. ${level}`;
      if (badge.textContent !== label) badge.textContent = label;
      if (badge.dataset.tier !== String(tier)) badge.dataset.tier = String(tier);
    }

    const holdBtn = element('btn-stop-moving');
    if (holdBtn) {
      const remaining = villager.holdStillUntil ? Math.ceil(villager.holdStillUntil - state.time.seconds) : 0;
      const holding = remaining > 0;
      const nextLabel = holding ? `Holding (${remaining}s)` : 'Stop Moving';
      if (holdBtn.textContent !== nextLabel) holdBtn.textContent = nextLabel;
      holdBtn.classList.toggle('g', holding);
      holdBtn.classList.toggle('s', !holding);
    }
  }

  function inspect(position, hit) {
    if (!view.debug) return;
    const tile = worldToTile(position, map.meta.tileSize);
    const object = hit?.hit === 'object' ? hit.entity : null;
    const activeTile = object?.tile || object?.standPosition || hit?.entity.tile || tile;
    const worldPosition = hit?.entity.anchor || hit?.entity.position || (object ? tileToWorld(activeTile, map.meta.tileSize) : position);
    const record = {
      id: hit?.entity.id, assetId: hit?.entity.assetId, world: { x: Math.round(worldPosition.x), y: Math.round(worldPosition.y) },
      tile: activeTile, terrain: map.terrainGrid[activeTile.y]?.[activeTile.x], walkable: walkable(world.collision, activeTile),
      ...(object && {
        state: state.objects[object.id], footprint: object.footprint,
        interaction: describeInteraction(object, assets),
        puzzle: map.puzzleLocations.find(puzzle => puzzle.objectId === object.id),
        lockedRegion: map.unlockableAreas.find(area => area.contains?.includes(object.id))?.id,
      }),
      ...(hit?.hit === 'collectible' && { preview: true, zone: hit.entity.zoneId }),
    };
    element('inspector').textContent = JSON.stringify(record, null, 2);
  }

  function renderDevActions() {
    element('dev-actions').innerHTML = renderDevActionsHtml(devActionPage);
    hudWindows.syncWidget('dev');
  }

  function setDevTab(next) {
    devTab = next;
    for (const name of ['actions', 'overlays', 'inspector']) {
      element(`dev-tab-${name}`).hidden = name !== devTab;
    }
    debugPanel.querySelectorAll('[data-dev-tab]').forEach(button => {
      const active = button.dataset.devTab === devTab;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('g', active);
      button.classList.toggle('s', !active);
    });
    hudWindows.syncWidget('dev');
  }

  function setDebug(enabled) {
    view.debug = enabled;
    element('debug').setAttribute('aria-pressed', enabled);
    debugPanel.hidden = !enabled;
    if (!enabled) {
      view.placementType = null;
      view.placement = null;
      element('inspector').textContent = '';
      hudWindows.refresh();
    } else {
      setDevTab(devTab);
      hudWindows.reveal('dev');
    }
    if (menu === 'collection') renderMenu();
  }

  element('dev-actions').innerHTML = renderDevActionsHtml(devActionPage);
  element('overlays').innerHTML = Object.entries(debugOptions).map(([key, label]) =>
    `<label><input type="checkbox" value="${key}"> ${label}</label>`).join('');
  element('overlays').addEventListener('change', event => {
    const { value, checked } = event.target;
    if (checked) view.overlays.add(value);
    else view.overlays.delete(value);
  });

  debugPanel.addEventListener('click', event => {
    const tabBtn = event.target.closest('button[data-dev-tab]');
    if (tabBtn) {
      setDevTab(tabBtn.dataset.devTab);
      return;
    }
    const pageBtn = event.target.closest('button[data-dev-page]');
    if (pageBtn) {
      devActionPage = Number(pageBtn.dataset.devPage) || 0;
      renderDevActions();
      return;
    }
    const devBtn = event.target.closest('button[data-dev]');
    if (!devBtn) return;
    const result = runDevAction(devBtn.dataset.dev, world, view, {
      resetHud: () => hudWindows.resetLayout(),
      openMenu: targetMenu => setMenu(targetMenu),
      triggerStory: id => actions.triggerStory?.(id),
      panToObjective: () => actions.panToObjective?.(),
      wipeAllData: () => actions.wipeAllData?.({ enterFresh: true }),
    });
    if (result?.message) notify(result.message);
    refreshStatus();
    refreshProfile();
    refreshQuestTracker();
    if (menu) renderMenu();
    hudWindows.refresh();
  });

  function syncDevLock() {
    const unlocked = actions.isDevUnlocked ? actions.isDevUnlocked() : true;
    const btnEl = element('debug');
    if (!btnEl) return;
    btnEl.dataset.locked = unlocked ? 'false' : 'true';
    btnEl.textContent = unlocked ? 'Dev Mode' : '🔒 Dev Mode';
    btnEl.dataset.tip = unlocked
      ? 'Toggle Dev Mode & Debugger'
      : 'Locked — Reach Day 100 without any villager dying to unlock Dev Mode (or launch with ?debug=1)';
    if (!unlocked && view.debug) setDebug(false);
  }

  element('debug').onclick = () => {
    if (actions.isDevUnlocked && !actions.isDevUnlocked()) {
      notify('Dev Mode is locked! Complete the "Flawless Century" challenge (Day 100 with 0 deaths) to unlock it.');
      return;
    }
    setDebug(!view.debug);
  };
  syncDevLock();
  if (wipeDataBtn) {
    wipeDataBtn.onclick = () => {
      const now = performance.now();
      if (now < wipeArmedUntil) {
        clearTimeout(wipeArmTimer);
        wipeArmedUntil = 0;
        wipeDataBtn.textContent = 'Wipe Data';
        wipeDataBtn.classList.remove('is-armed');
        actions.wipeAllData?.({ enterFresh: true });
        return;
      }
      wipeArmedUntil = now + 4500;
      wipeDataBtn.textContent = 'Confirm Wipe?';
      wipeDataBtn.classList.add('is-armed');
      notify('Click "Confirm Wipe?" within 4 seconds to delete all saved data and start fresh.');
      clearTimeout(wipeArmTimer);
      wipeArmTimer = setTimeout(() => {
        wipeArmedUntil = 0;
        wipeDataBtn.textContent = 'Wipe Data';
        wipeDataBtn.classList.remove('is-armed');
      }, 4500);
    };
  }
  element('close-panel').onclick = closeMenu;
  element('back-panel').onclick = () => {
    const previous = menuHistory.pop();
    if (!previous) return;
    setMenu(previous.menu);
    content.querySelector(`[data-act="open"][data-arg="${previous.arg}"]`)?.focus();
  };

  function setSpeed(value) {
    state.time.paused = value === 0;
    if (value) state.time.speed = value;
    refreshStatus();
    syncMusic();
  }

  document.querySelector('main').addEventListener('click', event => {
    if (view.mode !== 'playing') return;
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const { act, arg } = button.dataset;
    if (act === 'open') {
      const next = arg === 'build' ? 'buildings' : arg;
      if (menu === next) closeMenu();
      else {
        if (content.contains(button)) menuHistory.push({ menu, arg });
        else {
          menuHistory.length = 0;
          menuTrigger = button;
        }
        setMenu(next);
      }
    } else if (act === 'speed') {
      menuHistory.length = 0;
      menuTrigger = button;
      setSpeed(Number(arg));
      if (Number(arg) === 0) setMenu('pause');
      else if (menu === 'pause') setMenu(null);
    } else if (act === 'cam') {
      const camera = { in: () => actions.adjustZoom(1), out: () => actions.adjustZoom(-1),
        reset: actions.resetCamera, focus: actions.focusVillager, fit: actions.fitCamera };
      camera[arg]();
    } else if (act === 'resume') {
      menuHistory.length = 0;
      setMenu(null);
      setSpeed(state.time.speed);
      timePanel.querySelector(`[data-act="speed"][data-arg="${state.time.speed}"]`)?.focus();
    } else if (act === 'title') {
      actions.openTitle();
    } else if (act === 'dismiss') {
      toasts.replaceChildren();
    } else if (act === 'research') {
      const error = world.gameplay.research(arg);
      if (error) notify(error);
      renderMenu();
    } else if (act === 'stop-work') {
      const villager = state.villagers.find(member => member.id === view.selectedVillager);
      if (villager) world.gameplay.stop(villager);
    } else if (act === 'stop-moving') {
      const villager = state.villagers.find(member => member.id === view.selectedVillager);
      if (villager) {
        world.gameplay.holdStill(villager);
        notify(`${villager.name} is holding still for 20s — grab them easily!`);
        refreshProfile();
      }
    } else if (act === 'find-villager') {
      const villager = state.villagers.find(member => member.id === view.selectedVillager);
      if (villager) {
        actions.panToTarget?.(villager.position, STORY_CONFIG.villagerSpotlightZoom, villager.name, 'gold');
      }
    } else if (act === 'ach-tab') {
      achTab = arg;
      renderMenu();
    } else if (act === 'ach-page') {
      achPage = Number(arg) || 0;
      renderMenu();
    } else if (act === 'promote-champion') {
      const selectEl = element('champion-select');
      const chosenId = selectEl?.value || state.villagers[0]?.id;
      const err = world.gameplay.promoteChampion(chosenId);
      if (err) notify(err);
      renderMenu();
      refreshProfile();
    } else if (act === 'save-now') {
      notify(actions.save() ? 'Village saved.' : 'This browser could not save the village.');
      renderMenu();
    } else if (act === 'islands') {
      actions.openTitle('islands');
    } else if (act === 'reset-hud') {
      hudWindows.resetLayout();
      notify('HUD layout reset to default.');
    } else if (act === 'colsel' || act === 'coltab') {
      if (act === 'coltab') {
        collectionTab = arg;
        collectionDetail = null;
      } else collectionDetail = arg;
      renderMenu();
    } else if (act === 'bld-filter') {
      buildingFilter = arg;
      renderMenu();
    } else if (act === 'bld-select') {
      buildingType = arg;
      const states = assets.buildings.find(d => d.type === buildingType)?.states || {};
      buildingState = states.completed ? 'completed' : Object.keys(states)[0];
      renderMenu();
    } else if (act === 'bld-state') {
      buildingState = arg;
      renderMenu();
    } else if (act === 'bld-site-page') {
      buildingSitePage = Number(arg) || 0;
      renderMenu();
    } else if (act === 'vil-page') {
      villagerPage = Number(arg) || 0;
      renderMenu();
    } else if (act === 'jrn-page') {
      journalPage = Number(arg) || 0;
      renderMenu();
    } else if (act === 'note-page') {
      notesPage = Number(arg) || 0;
      renderMenu();
    } else if (act === 'pan-objective') {
      actions.panToObjective?.();
    } else if (act === 'pan-landmark') {
      const puzzle = landmarks[arg];
      actions.panToTarget?.(landmarkAnchor(world, arg), 2.5, puzzle?.label || arg, 'gold');
    } else if (act === 'pan-sick') {
      const sick = state.villagers.find(v => v.id === arg) || state.villagers.find(v => v.illness || v.needs.health < 55);
      if (sick) {
        actions.selectVillager(sick.id);
        actions.panToTarget?.(sick.position, STORY_CONFIG.villagerSpotlightZoom, `${sick.name} — Heal Now!`, 'danger');
      }
    } else if (act === 'pan-food') {
      const food = findNearestResource(world, 'food');
      if (food) actions.panToTarget?.(food.position, 2.5, 'Gather Food Here', 'gold');
    } else if (act === 'pan-grave') {
      const grave = (state.graves || []).find(g => g.id === arg) || state.graves?.[state.graves.length - 1];
      if (grave) actions.panToTarget?.(grave.position, 2.75, `${grave.name}'s Memorial`, 'gold');
    } else if (act === 'open-guide') {
      if (arg && FEATURE_GUIDE_MAP[arg]) guideId = arg;
      setMenu('guide');
    } else if (act === 'guide-select') {
      guideId = arg;
      renderMenu();
    } else if (act === 'guide-page') {
      guidePage = Number(arg) || 0;
      renderMenu();
    } else if (act === 'guide-locate') {
      const target = FEATURE_GUIDE_MAP[arg]?.resolveTarget?.(world);
      if (target) actions.panToTarget?.(target.position, target.zoom || 2.5, target.label, 'gold');
      else notify('No active map target for this guide yet.');
    } else if (act === 'replay-intro') {
      closeMenu();
      actions.triggerStory?.('intro_arrival');
    } else if (act === 'wipe-save-arm') {
      confirmSaveWipe = true;
      renderMenu();
    } else if (act === 'wipe-save-cancel') {
      confirmSaveWipe = false;
      renderMenu();
    } else if (act === 'wipe-save-confirm') {
      confirmSaveWipe = false;
      actions.wipeAllData?.({ enterFresh: true });
    }
  });
  bindPreferences(content, actions.applyPreference);
  content.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.villager) actions.selectVillager(button.dataset.villager);
    if (button.dataset.placement) {
      view.placementType = button.dataset.placement;
      setMenu(null);
      notify('Choose a clear village footprint. Click to place the foundation or Escape to cancel.');
    }
  });

  function selectVillager(villager) {
    if (!villager) return;
    if (menu !== 'villagers') {
      menuHistory.length = 0;
      menuTrigger = nav.querySelector('[data-arg="villagers"]');
    }
    selection.innerHTML = GameUI.panel({ cls: 'sm', body: `<div class="gu-row">
      ${portrait(villager, 'thumb')}<div class="gu-grow"><b>${escape(villager.name)}</b><div class="gu-mut" id="selected-task"></div></div>
      ${btn('Profile', { v: 's', icon: 'villagers', act: 'open', arg: 'villagers' })}</div>` });
    setMenu('villagers', false);
    hudWindows.refresh();
    inspect(tileToWorld(villager.tile, map.meta.tileSize), { entity: villager, hit: 'villager' });
    refreshStatus();
    refreshProfile();
  }

  function closeMenu() {
    menuHistory.length = 0;
    setMenu(null);
    menuTrigger?.focus();
    menuTrigger = null;
  }

  function resetForIsland() {
    menuTrigger = null;
    menuHistory.length = 0;
    notes.length = 0;
    lastRevision = undefined;
    lastPopulation = undefined;
    lastClockVisualKey = undefined;
    lastSpeed = undefined;
    villagerPage = buildingSitePage = journalPage = notesPage = guidePage = 0;
    guideId = 'basics';
    confirmSaveWipe = false;
    lastQuestSignature = '';
    selection.replaceChildren();
    toasts.replaceChildren();
    element('overlays').querySelectorAll('input').forEach(input => { input.checked = false; });
    clearTimeout(noticeTimer);
    setMenu(null);
    setDebug(false);
    resources.forEach(({ id }, index) => { counters[index].querySelector('span').textContent = world.resources.get(id); });
    refreshQuestTracker();
  }

  function togglePause() {
    menuHistory.length = 0;
    setSpeed(state.time.paused ? state.time.speed : 0);
    if (state.time.paused) {
      menuTrigger = timePanel.querySelector('[data-act="speed"][data-arg="0"]');
      setMenu('pause');
    } else closeMenu();
  }

  const tooltips = bindSmartTooltips(document.querySelector('main'));
  return {
    inspect, notify, clearToasts, selectVillager, refreshStatus, refreshProfile, refreshQuestTracker, closeMenu, togglePause,
    resetForIsland, syncMusic, syncVolume, syncDevLock,
    hudWindows, tooltips, setMenu, setDebug,
    setDevPage: page => { devActionPage = Number(page) || 0; renderDevActions(); },
  };
}
