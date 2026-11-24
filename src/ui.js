import { describeInteraction } from './assets.js';
import { tileToWorld, walkable, worldToTile } from './geometry.js';
import { debugOptions, svgUrl } from './render.js';
import { abilities } from './world.js';
import { construction, costLabel, landmarks, researchProjects } from './progression.js';

const element = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const img = (svg, css) => `<img class="${css}" src="${escape(svgUrl(svg))}" alt="">`;
const names = {
  villagers: 'Villagers', buildings: 'Buildings', research: 'Research',
  collection: 'Collection Book', settings: 'Settings', save: 'Save & Load',
  achievements: 'Achievements', notifications: 'Notifications & Events', pause: 'Paused', journal: 'Island journal',
};
const panelIcons = {
  villagers: 'villagers', buildings: 'build', research: 'research', collection: 'book',
  settings: 'gear', save: 'save', achievements: 'trophy', notifications: 'info', pause: 'pause', journal: 'book',
};
const audioStorageKey = 'island-colony.audio';
const minimumMusicVolume = 1;
const maximumMusicVolume = 100;

function clampMusicVolume(volume) {
  return Math.max(minimumMusicVolume, Math.min(maximumMusicVolume, volume));
}

function readAudioSettings() {
  try {
    return JSON.parse(localStorage.getItem(audioStorageKey)) ?? {};
  } catch {
    return {};
  }
}

export function musicTrack({ time, weather }) {
  if (time.paused) return 'menu';
  if (weather.current === 'rain') return 'rain';
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
  const title = element('title-screen');
  const audio = new Audio();
  const preferences = readAudioSettings();
  if (Number.isInteger(preferences.musicVolume)) {
    state.settings.musicVolume = clampMusicVolume(preferences.musicVolume);
  }
  let menu = null;
  let collectionDetail = null;
  let collectionTab = 'seashell';
  let buildingType = 'house';
  let buildingState = 'completed';
  let noticeTimer;
  let track = null;
  let autoplayBlocked = false;
  let playbackFailed = false;
  let pendingPlay = null;
  let lastConditions;
  let lastSpeed;
  let lastPaused;
  let lastPopulation;
  let menuTrigger;
  const menuHistory = [];
  const notes = [];
  let lastRevision;
  audio.loop = true;
  audio.volume = state.settings.musicVolume / 100;

  const resources = [
    ['food', 'Food', 'resource_berries'], ['wood', 'Wood', 'resource_wood_log'],
    ['stone', 'Stone', 'resource_stone'], ['knowledge', 'Knowledge'],
  ].map(([id, tip, assetId]) => ({ id, tip, assetId, icon: !assetId && 'knowledge', warn: -1 }));
  const hudState = () => ({
    screen: menu, res: state.resources, day: state.time.day, hour: (Math.floor(state.time.minutes) + 0.00001) / 60,
    weather: state.weather.current, speed: state.time.paused ? 0 : state.time.speed,
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
  const counters = [...hud.querySelectorAll('.gu-res .gu-ctr')];
  resources.forEach((resource, index) => { counters[index].setAttribute('aria-label', resource.tip); });
  counters.at(-1).setAttribute('aria-label', 'Population and housing capacity');
  const timePanel = hud.querySelector('.gu-top > .gu-panel:last-child');
  const selection = hud.querySelector('.gu-sel');
  const toasts = hud.querySelector('.gu-toasts');
  const nav = hud.querySelector('.gu-nav');
  const focusButton = hud.querySelector('[data-act="cam"][data-arg="focus"]');
  selection.replaceChildren();
  element('close-panel').innerHTML = ic('close', 16);
  world.resources.subscribe((key, value) => {
    counters[resources.findIndex(resource => resource.id === key)].querySelector('span').textContent = value;
    if (menu === 'research' && key === 'knowledge') renderMenu();
  });

  function notify(text) {
    const note = { id: `note-${notes.length + 1}`, type: 'info', title: text, text: '' };
    notes.push(note);
    toasts.innerHTML = GameUI.renderNotification(note);
    if (menu === 'notifications') renderMenu();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { toasts.replaceChildren(); }, 3600);
  }

  function refreshMusicControls() {
    const slider = element('music-volume');
    if (!slider) return;
    const { musicVolume } = state.settings;
    slider.value = musicVolume;
    element('music-volume-value').value = `${musicVolume}%`;
  }

  function saveAudioSettings() {
    const { musicVolume } = state.settings;
    try {
      localStorage.setItem(audioStorageKey, JSON.stringify({ musicVolume }));
    } catch {
      // Audio controls still apply for this session.
    }
  }

  function syncMusic(fromGesture = false) {
    if ((autoplayBlocked || playbackFailed) && !fromGesture) return;
    const next = musicTrack(state);
    if (next === track && (pendingPlay || !audio.paused)) return;
    autoplayBlocked = false;
    playbackFailed = false;
    if (track !== next) {
      track = next;
      audio.src = `/assets/music/${next}-music.mp3`;
    }
    const attempt = audio.play();
    pendingPlay = attempt;
    function finish(error) {
      if (pendingPlay !== attempt) return;
      pendingPlay = null;
      if (error?.name === 'NotAllowedError') autoplayBlocked = true;
      else if (error && error.name !== 'AbortError') {
        playbackFailed = true;
        track = null;
        notify('Music could not start in this browser.');
      }
    }
    attempt.then(() => finish(), finish);
  }

  function setVolume(volume) {
    state.settings.musicVolume = clampMusicVolume(volume);
    audio.volume = state.settings.musicVolume / 100;
    refreshMusicControls();
  }

  function startMusic(event) {
    if (event.isTrusted && (autoplayBlocked || playbackFailed)) syncMusic(true);
  }
  window.addEventListener('click', startMusic);
  window.addEventListener('keydown', startMusic);

  function refreshStatus() {
    const { time, weather } = state;
    const text = [time.day, Math.floor(time.minutes), weather.current].join('|');
    const speed = time.paused ? 0 : time.speed;
    if (text !== lastConditions) {
      lastConditions = text;
      const clock = document.createElement('div');
      clock.innerHTML = timeBox(hudState());
      timePanel.firstElementChild.replaceWith(clock.firstElementChild);
      syncMusic();
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
      }
      if (['villagers', 'journal', 'buildings', 'research', 'collection', 'achievements'].includes(menu)) renderMenu();
    }
  }

  function portrait(villager, css) {
    return img(assets.villager.svg({ config: { ...villager.appearance, name: villager.name, lifeStage: villager.lifeStage } }), css);
  }

  function renderVillagers() {
    const selected = state.villagers.find(villager => villager.id === view.selectedVillager);
    const profile = selected ? `<div class="row">${portrait(selected, 'portrait')}<div><h3>${escape(selected.name)}</h3>
      <p>${escape(selected.lifeStage)} · Age <span id="villager-age">${selected.age}</span></p><p id="villager-task"></p>
      <p id="villager-needs"></p><p id="villager-skills"></p>
      ${selected.relationships.children?.length ? `<p>Children: ${selected.relationships.children.length}</p>` : ''}
      ${btn('Stop work', { v: 's', act: 'stop-work' })}</div></div>` : '';
    return profile + `<div class="entries">${state.villagers.map(villager =>
      `<button class="gu-btn s entry" data-villager="${villager.id}" aria-pressed="${selected === villager}">
      ${portrait(villager, 'thumb')}${escape(villager.name)}</button>`).join('')}</div>`;
  }

  function renderBuildings() {
    const definition = assets.buildings.find(building => building.type === buildingType);
    const asset = definition.states[buildingState];
    const cost = construction[definition.type];
    return `<div class="row"><label>Building <select class="gu-in" id="building-type">${assets.buildings.map(building =>
      `<option value="${building.type}" ${definition === building ? 'selected' : ''}>${escape(building.name)}</option>`).join('')}</select></label>
      <label>State <select class="gu-in" id="building-state">${Object.keys(definition.states).map(key =>
      `<option ${key === buildingState ? 'selected' : ''}>${escape(key)}</option>`).join('')}</select></label></div>
      ${img(asset.svg(), 'building-preview')}
      <p>Footprint ${asset.footprint.width} × ${asset.footprint.height} tiles</p>
      <p>${escape(asset.metadata.purpose)}</p>
      ${cost ? `<p>Materials: ${costLabel(cost)}</p>
      <button class="gu-btn p" type="button" data-placement="${definition.type}">${ic('build', 16)} Place foundation</button>` : '<p>Available to inspect in the gallery.</p>'}
      ${state.buildings.length ? `<h3 class="gu-h">Village buildings</h3><ul>${state.buildings.map(site =>
        `<li>${escape(assets.buildings.find(building => building.type === site.type).name)} · ${site.progress * 25}%</li>`).join('')}</ul>` : ''}`;
  }

  function renderResearch() {
    return `<p>Knowledge: <strong>${state.resources.knowledge}</strong>. Assign a villager to the lit campfire or a completed Research Hut.</p>
      <div class="gu-col">${abilities.filter(ability => ability.startsUnlocked || researchProjects[ability.id]).map(ability => {
        const project = researchProjects[ability.id];
        const unlocked = state.abilities[ability.id];
        const available = !project?.flag || state.worldFlags[project.flag];
        return `<div class="gu-card ${unlocked ? 'done' : ''}"><div class="gu-grow"><b>${escape(ability.name)}</b>
          <p>${unlocked ? 'Available' : escape(project.hint)}</p></div>
          ${unlocked ? ic('check', 24) : btn(`Learn · ${project.cost} Knowledge`, {
            act: 'research', arg: ability.id, dis: !available || state.resources.knowledge < project.cost,
          })}</div>`;
      }).join('')}</div>`;
  }

  function renderJournal() {
    return `<p>Drop villagers on berries, trees and stone deposits to stock the camp. They’ll keep working while supplies are available.</p>
      <p>Drop an adult onto another to start a family once you have a Family House. Drop a villager onto an unwell person to offer care after learning Healing.</p>
      <h3 class="gu-h">Island landmarks</h3>
      <div class="gu-col">${Object.entries(landmarks).map(([id, puzzle]) =>
        `<div class="gu-card ${state.worldFlags[id] ? 'done' : ''}"><div><b>${escape(puzzle.label)}</b>
        <p>${state.worldFlags[id] ? 'Completed' : escape(puzzle.hint)}</p></div></div>`).join('')}</div>`;
  }

  function renderBook() {
    return GameUI.renderCollectionBook({
      disc: Object.fromEntries(Object.entries(state.collectionProgress).map(([id, value]) => [id, value.discovered])),
      ui: { col: { sel: collectionDetail, tab: collectionTab } },
    }, { col: assets.collectibles });
  }

  function renderSettings() {
    return `<section class="gu-col" aria-labelledby="audio-title">
      <h3 id="audio-title" class="gu-h">Audio</h3>
      <div class="volume-control">
        <label for="music-volume">Music volume</label>
        <output id="music-volume-value" for="music-volume">${state.settings.musicVolume}%</output>
        <input class="gu-sl" id="music-volume" type="range" min="${minimumMusicVolume}" max="${maximumMusicVolume}" value="${state.settings.musicVolume}">
      </div>
      <div class="gu-row">
        ${btn('Min', { v: 's', act: 'volume', arg: minimumMusicVolume, label: 'Minimum volume' })}
        ${btn('Max', { v: 's', act: 'volume', arg: maximumMusicVolume, label: 'Maximum volume' })}
      </div>
    </section>
    <div class="gu-div"></div>
    ${btn('Notifications & Events', { icon: 'info', v: 's', act: 'open', arg: 'notifications' })}`;
  }

  const views = {
    villagers: renderVillagers, buildings: renderBuildings, research: renderResearch,
    collection: renderBook, settings: renderSettings, journal: renderJournal,
    achievements: () => state.achievements.island_restored
      ? '<div class="gu-card done">Island Restoration · Restore the ancient monument</div>'
      : '<div class="gu-empty">Island Restoration · Restore the ancient monument</div>',
    save: () => `<p>The village saves automatically in this browser.</p>
      ${actions.lastSave?.() ? `<p>Last save: ${escape(new Date(actions.lastSave()).toLocaleString())}</p>` : ''}
      <div class="gu-row">${btn('Save now', { icon: 'save', act: 'save-now' })}
        ${btn('Reload village', { icon: 'load', v: 's', act: 'reload-save' })}
        ${btn('New village', { v: 'd', act: 'reset-village' })}</div>`,
    notifications: () => notes.length ? [...notes].reverse().slice(0, 12).map(note =>
      GameUI.renderNotification(note).replace(/<button.*?<\/button>/, '')).join('')
      : '<div class="gu-empty">No notifications yet.</div>',
    pause: () => `<div class="entries">${btn('Resume', { icon: 'play', act: 'resume' })}
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
    if (!menu) return;
    element('panel-title').innerHTML = ic(panelIcons[menu], 24) + escape(names[menu]);
    renderMenu();
    panel.scrollTop = 0;
    if (focus) element('panel-title').focus();
  }

  function refreshProfile() {
    const tasks = [element('villager-task'), element('selected-task')].filter(Boolean);
    const villager = state.villagers.find(villager => villager.id === view.selectedVillager);
    const text = villager?.activity || (villager?.currentTask ? 'Walking' : 'Idle');
    for (const task of tasks) if (task.textContent !== text) task.textContent = text;
    if (!villager || !element('villager-needs')) return;
    element('villager-age').textContent = villager.age;
    element('villager-needs').textContent = `Health ${Math.round(villager.needs.health)}% · Fed ${villager.needs.hunger}% · Energy ${Math.round(villager.needs.energy)}%`;
    element('villager-skills').textContent = Object.entries(villager.skills).map(([id, xp]) => `${id} ${xp}`).join(' · ');
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

  function setDebug(enabled) {
    view.debug = enabled;
    element('debug').setAttribute('aria-pressed', enabled);
    element('debug-panel').hidden = !enabled;
    if (!enabled) {
      view.placementType = null;
      view.placement = null;
      element('inspector').textContent = '';
    }
    if (menu === 'collection') renderMenu();
  }

  element('overlays').innerHTML = Object.entries(debugOptions).map(([key, label]) =>
    `<label><input type="checkbox" value="${key}"> ${label}</label>`).join('');
  element('overlays').addEventListener('change', event => {
    const { value, checked } = event.target;
    if (checked) view.overlays.add(value);
    else view.overlays.delete(value);
  });
  element('debug').onclick = () => setDebug(!view.debug);
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

  function openTitle() {
    menuHistory.length = 0;
    setMenu(null);
    setSpeed(0);
    title.hidden = false;
    title.innerHTML = GameUI.renderMainMenu({
      title: 'Island Colony', settings: { tagline: 'Development sandbox' }, saves: [],
    });
    title.querySelector('h1').nextElementSibling.remove();
    title.querySelector('[data-act="newgame"] span').textContent = 'Return to island';
    for (const act of ['continue', 'exit']) title.querySelector(`[data-act="${act}"]`).remove();
    title.querySelector('[data-arg="credits"]').remove();
    title.querySelector('[data-act="newgame"]').focus();
  }

  document.querySelector('main').addEventListener('click', event => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const { act, arg } = button.dataset;
    if (act === 'open') {
      title.hidden = true;
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
    } else if (act === 'resume' || act === 'newgame') {
      title.hidden = true;
      menuHistory.length = 0;
      setMenu(null);
      setSpeed(state.time.speed);
      timePanel.querySelector(`[data-act="speed"][data-arg="${state.time.speed}"]`)?.focus();
    } else if (act === 'title') {
      openTitle();
    } else if (act === 'dismiss') {
      toasts.replaceChildren();
    } else if (act === 'research') {
      const error = world.gameplay.research(arg);
      if (error) notify(error);
      renderMenu();
    } else if (act === 'stop-work') {
      const villager = state.villagers.find(member => member.id === view.selectedVillager);
      if (villager) world.gameplay.stop(villager);
    } else if (act === 'save-now') {
      notify(actions.save() ? 'Village saved.' : 'This browser could not save the village.');
      renderMenu();
    } else if (act === 'reload-save') {
      if (actions.save()) actions.reload();
      else notify('This browser could not save the village.');
    } else if (act === 'reset-village') {
      actions.resetVillage();
    } else if (act === 'volume') {
      setVolume(Number(arg));
      saveAudioSettings();
    } else if (act === 'colsel' || act === 'coltab') {
      if (act === 'coltab') {
        collectionTab = arg;
        collectionDetail = null;
      } else collectionDetail = arg;
      renderMenu();
      content.querySelector(`[data-act="${act}"][data-arg="${arg}"]`)?.focus();
    }
  });
  content.addEventListener('input', event => {
    if (event.target.id === 'music-volume') setVolume(Number(event.target.value));
  });
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
  content.addEventListener('change', event => {
    const field = event.target;
    if (field.id === 'building-type') {
      buildingType = field.value;
      const states = assets.buildings.find(definition => definition.type === buildingType).states;
      buildingState = states.completed ? 'completed' : Object.keys(states)[0];
      renderMenu();
      element(field.id).focus();
    }
    if (field.id === 'building-state') {
      buildingState = field.value;
      renderMenu();
      element(field.id).focus();
    }
    if (field.id === 'music-volume') saveAudioSettings();
  });

  function selectVillager(villager) {
    if (menu !== 'villagers') {
      menuHistory.length = 0;
      menuTrigger = nav.querySelector('[data-arg="villagers"]');
    }
    setMenu('villagers', false);
    selection.innerHTML = GameUI.panel({ cls: 'sm', body: `<div class="gu-row">
      ${portrait(villager, 'thumb')}<div class="gu-grow"><b>${escape(villager.name)}</b><div class="gu-mut" id="selected-task"></div></div>
      ${btn('Profile', { v: 's', icon: 'villagers', act: 'open', arg: 'villagers' })}</div>` });
    inspect(tileToWorld(villager.tile, map.meta.tileSize), { entity: villager, hit: 'villager' });
    refreshStatus();
    refreshProfile();
  }

  function closeMenu() {
    const fromTitle = Boolean(menu && menuTrigger && title.contains(menuTrigger));
    title.hidden = !fromTitle;
    menuHistory.length = 0;
    setMenu(null);
    menuTrigger?.focus();
    menuTrigger = null;
  }

  function togglePause() {
    menuHistory.length = 0;
    setSpeed(state.time.paused ? state.time.speed : 0);
    if (state.time.paused) {
      menuTrigger = timePanel.querySelector('[data-act="speed"][data-arg="0"]');
      setMenu('pause');
    } else closeMenu();
  }

  GameUI.bindTooltips(document.querySelector('main'));
  return { inspect, notify, selectVillager, refreshStatus, refreshProfile, closeMenu, togglePause };
}
