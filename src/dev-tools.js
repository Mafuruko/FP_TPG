import { tileToWorld, walkable } from './geometry.js';
import { landmarks, researchProjects } from './progression.js';
import { initializeVillagerProgress, initializeVillagerQuirks, SKILL_CONFIG, villagerSkills } from './villagers.js';
import { ensureStoryState, STORY_CONFIG } from './story.js';
import { initializeSurvival, phaseDuration, survival } from './survival.js';

export const DEV_CONFIG = {
  resourceBurst: 25,
  allResourceBurst: 50,
  skillXpStep: 3,
  skillMaxXp: SKILL_CONFIG.thresholds.at(-1),
  timePresets: {
    dawn: 360,     // 06:00
    day: 720,      // 12:00
    dusk: 1170,    // 19:30
    night: 0,      // 00:00
  },
};

export const DEV_GROUPS = [
  {
    id: 'atmosphere',
    title: 'Time & Weather',
    actions: [
      { id: 'time-dawn', label: 'Dawn (06:00)', tip: 'Set island clock to 06:00 sunrise' },
      { id: 'time-day', label: 'Day (12:00)', tip: 'Set island clock to bright noon' },
      { id: 'time-dusk', label: 'Dusk (19:30)', tip: 'Set island clock to purple twilight' },
      { id: 'time-night', label: 'Night (00:00)', tip: 'Set island clock to midnight' },
      { id: 'time-plus-hour', label: '+1 Hour', tip: 'Advance the island clock by 60 minutes' },
      { id: 'time-plus-day', label: '+1 Day', tip: 'Advance the island calendar by 1 day' },
      { id: 'weather-clear', label: 'Clear Sky', tip: 'Fade to clear weather' },
      { id: 'weather-cloudy', label: 'Cloudy', tip: 'Fade to cloudy, breezy weather' },
      { id: 'weather-rain', label: 'Light Rain', tip: 'Fade into light rain' },
      { id: 'weather-heavy-rain', label: 'Heavy Rain', tip: 'Fade into heavy rain' },
    ],
  },
  {
    id: 'resources',
    title: 'Resources & Economy',
    actions: [
      { id: 'res-all', label: '+50 All', tip: 'Add 50 Food, Wood, Stone, and Knowledge' },
      { id: 'res-food', label: '+25 Food', tip: 'Add 25 Food to village stores' },
      { id: 'res-wood', label: '+25 Wood', tip: 'Add 25 Wood to village stores' },
      { id: 'res-stone', label: '+25 Stone', tip: 'Add 25 Stone to village stores' },
      { id: 'res-knowledge', label: '+25 Knowledge', tip: 'Add 25 Knowledge for research' },
      { id: 'res-regrow', label: 'Regrow All', tip: 'Refill all depleted berry bushes, trees, and rocks' },
    ],
  },
  {
    id: 'villagers',
    title: 'Villagers & Needs',
    actions: [
      { id: 'vil-heal-all', label: 'Full Needs All', tip: 'Set Health, Fed, and Energy to 100% for all villagers' },
      { id: 'vil-sick', label: 'Make Sick', tip: 'Set selected (or first) villager Health to 48%' },
      { id: 'vil-tired-hungry', label: 'Low Fed/Energy', tip: 'Lower selected villager Fed to 28% and Energy to 30%' },
      { id: 'vil-skill-up', label: '+Skill Levels', tip: 'Grant XP across all skills for selected villager' },
      { id: 'vil-skill-max', label: 'Max Skills', tip: 'Promote selected villager to Master Lv. 10 in all skills' },
      { id: 'vil-age-up', label: 'Age +1 Yr', tip: 'Age every villager by 1 year and update life stages' },
      { id: 'vil-spawn-adult', label: 'Spawn Adult', tip: 'Add a new adult villager near camp' },
      { id: 'vil-spawn-baby', label: 'Spawn Baby', tip: 'Add a new baby villager near camp' },
    ],
  },
  {
    id: 'progression',
    title: 'Landmarks, Buildings & Finds',
    actions: [
      { id: 'prog-research', label: 'Unlock Research', tip: 'Unlock all 5 researchable abilities immediately' },
      { id: 'prog-next-landmark', label: 'Next Landmark', tip: 'Complete the next unfinished island landmark' },
      { id: 'prog-all-landmarks', label: 'All Landmarks', tip: 'Complete all 7 landmarks and award Island Restoration' },
      { id: 'prog-finish-builds', label: 'Finish Builds', tip: 'Instantly complete all active building sites' },
      { id: 'prog-grow-crops', label: 'Grow Crops', tip: 'Mature all spring crops to harvest stage 3' },
      { id: 'prog-spawn-collectible', label: 'Spawn Find', tip: 'Spawn a live collectible on reachable island ground' },
      { id: 'prog-discover-all', label: 'All 25 Finds', tip: 'Mark all 25 Collection Book entries as discovered' },
    ],
  },
  {
    id: 'story',
    title: 'Story, Events & Challenges',
    actions: [
      { id: 'story-intro', label: 'Intro Guide', tip: 'Replay the interactive arrival drag tutorial' },
      { id: 'story-pan-next', label: 'Pan to Goal', tip: 'Pan the camera to the current objective landmark' },
      { id: 'story-first-illness', label: '1st Illness', tip: 'Trigger the guided first-illness healing prompt' },
      { id: 'story-sickness-death', label: 'Sickness Death', tip: 'Force a villager death from sickness with memorial' },
      { id: 'story-old-age-death', label: 'Old Age Death', tip: 'Force an elder passing from old age with memorial' },
      { id: 'story-first-birth', label: '1st Birth', tip: 'Force a newborn birth event and family guide' },
      { id: 'story-starve', label: 'Empty Food (0)', tip: 'Drop Food to 0 and enable Stage 2 famine testing' },
      { id: 'chal-solo-100', label: 'Solo 100d Gold', tip: 'Test Lone Survivor (100 solo days) and grant Golden skin' },
      { id: 'chal-speedrun', label: 'Speedrun <100d', tip: 'Complete Monument before Day 100 to unlock Champion picker' },
      { id: 'chal-flawless', label: 'Flawless 100d', tip: 'Reach Day 100 with 0 deaths to unlock Dev Mode' },
    ],
  },
  {
    id: 'system',
    title: 'System & Data Reset',
    actions: [
      { id: 'sys-reset-hud', label: 'Reset HUD', tip: 'Reset all floating HUD windows to default layout' },
      { id: 'sys-open-journal', label: 'Open Journal', tip: 'Open the Island Journal landmark tracker' },
      { id: 'sys-open-guide', label: 'Field Guide', tip: 'Open the illustrated Feature Guide reference' },
      { id: 'sys-wipe-all', label: 'Wipe All Data', tip: 'Delete all saves, HUD layout, and settings and restart fresh' },
    ],
  },
];

function findSpawnTile(world) {
  for (const tile of world.map.villagerSpawns) {
    if (walkable(world.collision, tile)) return { x: tile.x, y: tile.y };
  }
  return { x: world.map.villagerSpawns[0].x, y: world.map.villagerSpawns[0].y };
}

function targetVillager(world, view) {
  return world.state.villagers.find(v => v.id === view?.selectedVillager) || world.state.villagers[0] || null;
}

function completeLandmark(world, puzzleId) {
  const { state, map } = world;
  const puzzle = landmarks[puzzleId];
  if (!puzzle || state.worldFlags[puzzleId]) return false;
  const location = map.puzzleLocations.find(entry => entry.puzzleId === puzzleId);
  state.worldFlags[puzzleId] = true;
  if (location && state.objects[location.objectId]) {
    state.objects[location.objectId].state = puzzle.state;
    if (puzzle.art) state.objects[location.objectId].art = puzzle.art;
  }
  if (puzzleId === 'unblock_spring' && !state.crops?.length) {
    state.crops = map.farmingZones[0].tiles.filter((_, index) => index % 9 === 0).slice(0, 8)
      .map(([x, y], index) => ({
        id: `crop_${index}`, tile: { x, y }, cropType: map.farmingZones[0].cropTypes[index % 5], stage: 0,
      }));
  }
  if (puzzleId === 'restore_monument') {
    state.achievements.island_restored = true;
  }
  world.gameplay?.refreshCollision();
  return true;
}

/**
 * Executes a single Dev Mode test action against the live world state.
 * Returns `{ ok, message }` for HUD toast feedback and automated tests.
 */
export function runDevAction(actionId, world, view, hooks = {}, config = DEV_CONFIG) {
  const { state, resources, map, assets } = world;
  const clock = state.simulation ?? (state.simulation = {
    nextNeeds: survival.mealInterval, nextCollectible: 8, nextIllness: survival.illnessCadence, nextVillager: state.villagers.length + 1,
  });

  switch (actionId) {
    case 'time-dawn':
      world.climate.setClock(config.timePresets.dawn);
      return { ok: true, message: 'Dev: Clock set to Dawn (06:00).' };
    case 'time-day':
      world.climate.setClock(config.timePresets.day);
      return { ok: true, message: 'Dev: Clock set to Day (12:00).' };
    case 'time-dusk':
      world.climate.setClock(config.timePresets.dusk);
      return { ok: true, message: 'Dev: Clock set to Dusk (19:30).' };
    case 'time-night':
      world.climate.setClock(config.timePresets.night);
      return { ok: true, message: 'Dev: Clock set to Night (00:00).' };
    case 'time-plus-hour':
      world.climate.setClock(state.time.minutes + 60);
      return { ok: true, message: 'Dev: Advanced clock +1 hour.' };
    case 'time-plus-day':
      state.time.day += 1;
      return { ok: true, message: `Dev: Advanced to Day ${state.time.day}.` };
    case 'weather-clear':
      world.climate.setWeather('clear');
      return { ok: true, message: 'Dev: Clearing skies.' };
    case 'weather-cloudy':
      world.climate.setWeather('cloudy');
      return { ok: true, message: 'Dev: Clouds rolling in.' };
    case 'weather-rain':
      world.climate.setWeather('light_rain');
      return { ok: true, message: 'Dev: Light rain approaching.' };
    case 'weather-heavy-rain':
      world.climate.setWeather('heavy_rain');
      return { ok: true, message: 'Dev: Heavy rain approaching.' };

    case 'res-all':
      for (const key of ['food', 'wood', 'stone', 'knowledge']) resources.add(key, config.allResourceBurst);
      return { ok: true, message: `Dev: Added +${config.allResourceBurst} to all resources.` };
    case 'res-food':
      resources.add('food', config.resourceBurst);
      return { ok: true, message: `Dev: Added +${config.resourceBurst} Food.` };
    case 'res-wood':
      resources.add('wood', config.resourceBurst);
      return { ok: true, message: `Dev: Added +${config.resourceBurst} Wood.` };
    case 'res-stone':
      resources.add('stone', config.resourceBurst);
      return { ok: true, message: `Dev: Added +${config.resourceBurst} Stone.` };
    case 'res-knowledge':
      resources.add('knowledge', config.resourceBurst);
      return { ok: true, message: `Dev: Added +${config.resourceBurst} Knowledge.` };
    case 'res-regrow': {
      let restored = 0;
      for (const object of map.objects) {
        if (!object.resource) continue;
        const entry = state.objects[object.id];
        if (entry) {
          entry.amount = object.resource.maxAmount;
          entry.state = object.state;
          delete entry.regrowAt;
          restored += 1;
        }
      }
      return { ok: true, message: `Dev: Regrew ${restored} resource sources.` };
    }

    case 'vil-heal-all':
      for (const villager of state.villagers) {
        villager.needs.health = 100;
        villager.needs.hunger = 100;
        villager.needs.energy = 100;
        delete villager.illness;
      }
      return { ok: true, message: 'Dev: Restored all villager needs to 100%.' };
    case 'vil-sick': {
      const villager = targetVillager(world, view);
      if (!villager) return { ok: false, message: 'Dev: No villager available.' };
      villager.needs.health = 48;
      villager.illness = {
        cause: 'fever',
        startedAt: state.time.seconds,
        burden: 52,
        nextExposureAt: state.time.seconds + survival.contagionInterval,
      };
      return { ok: true, message: `Dev: ${villager.name} is now unwell (48% Health, active fever).` };
    }
    case 'vil-tired-hungry': {
      const villager = targetVillager(world, view);
      if (!villager) return { ok: false, message: 'Dev: No villager available.' };
      villager.needs.hunger = 28;
      villager.needs.energy = 30;
      return { ok: true, message: `Dev: Lowered ${villager.name}'s Fed (28%) and Energy (30%).` };
    }
    case 'vil-skill-up': {
      const villager = targetVillager(world, view);
      if (!villager) return { ok: false, message: 'Dev: No villager available.' };
      for (const def of Object.values(villagerSkills)) {
        const primaryJob = def.jobs[0];
        villager.skills[primaryJob] = (villager.skills[primaryJob] || 0) + config.skillXpStep;
      }
      return { ok: true, message: `Dev: Increased all skills for ${villager.name}.` };
    }
    case 'vil-skill-max': {
      const villager = targetVillager(world, view);
      if (!villager) return { ok: false, message: 'Dev: No villager available.' };
      for (const def of Object.values(villagerSkills)) {
        const primaryJob = def.jobs[0];
        villager.skills[primaryJob] = Math.max(villager.skills[primaryJob] || 0, config.skillMaxXp);
      }
      return { ok: true, message: `Dev: Promoted ${villager.name} to Master Lv. 10.` };
    }
    case 'vil-age-up': {
      for (const villager of state.villagers) {
        const end = { baby: 2, child: 18, adult: 65, elder: 92 }[villager.lifeStage];
        villager.stageSince = (villager.stageSince ?? state.time.seconds)
          - phaseDuration(villager) / Math.max(1, end - (villager.stageAge ?? villager.age));
      }
      return { ok: true, message: 'Dev: Advanced each villager by one age step. Resume time to apply.' };
    }
    case 'vil-spawn-adult':
    case 'vil-spawn-baby': {
      const isBaby = actionId === 'vil-spawn-baby';
      const index = Math.max(clock.nextVillager || 1, state.villagers.length + 1);
      clock.nextVillager = index + 1;
      const stage = isBaby ? 'baby' : 'adult';
      const age = isBaby ? 0 : 24;
      const { name, direction, ...appearance } = assets.generateVillager(9100 + index, { stage });
      const tile = findSpawnTile(world);
      const villager = {
        id: `villager_${String(index).padStart(3, '0')}`,
        name,
        age,
        lifeStage: stage,
        appearance,
        direction,
        animation: 'idle',
        tile,
        position: tileToWorld(tile, map.meta.tileSize),
        currentTask: null,
        route: [],
        preferredJob: null,
        needs: { hunger: 95, energy: 100, health: 100 },
        skills: {},
        relationships: {},
      };
      initializeVillagerQuirks(villager);
      initializeVillagerProgress(villager);
      state.villagers.push(villager);
      initializeSurvival(state);
      if (state.villagers.length > state.world.populationCapacity) {
        state.world.populationCapacity = state.villagers.length;
      }
      return { ok: true, message: `Dev: Spawned ${stage} villager ${name}.` };
    }

    case 'prog-research':
      for (const id of Object.keys(researchProjects)) state.abilities[id] = true;
      return { ok: true, message: 'Dev: Unlocked all research abilities.' };
    case 'prog-next-landmark': {
      const nextId = Object.keys(landmarks).find(id => !state.worldFlags[id]);
      if (!nextId) return { ok: true, message: 'Dev: All 7 landmarks are already complete.' };
      completeLandmark(world, nextId);
      return { ok: true, message: `Dev: Completed landmark — ${landmarks[nextId].label}.` };
    }
    case 'prog-all-landmarks': {
      for (const id of Object.keys(landmarks)) completeLandmark(world, id);
      return { ok: true, message: 'Dev: Completed all 7 landmarks & Island Restoration.' };
    }
    case 'prog-finish-builds': {
      let finished = 0;
      for (const site of state.buildings) {
        if (site.state === 'completed') continue;
        site.progress = 4;
        site.state = 'completed';
        if (site.type === 'house') state.world.populationCapacity += 3;
        if (site.type === 'family_house') state.world.populationCapacity += 2;
        finished += 1;
      }
      if (finished) world.gameplay?.refreshCollision();
      return { ok: true, message: finished ? `Dev: Completed ${finished} building site(s).` : 'Dev: No unfinished building sites.' };
    }
    case 'prog-grow-crops': {
      if (!state.crops?.length) {
        completeLandmark(world, 'unblock_spring');
      }
      for (const crop of state.crops || []) {
        crop.stage = 3;
        delete crop.growthAt;
      }
      return { ok: true, message: `Dev: Grew ${state.crops.length} crops to harvest stage 3.` };
    }
    case 'prog-spawn-collectible':
      world.gameplay?.spawnCollectible?.();
      return { ok: true, message: `Dev: Active live collectibles: ${state.activeCollectibles.length}.` };
    case 'prog-discover-all': {
      for (const entry of Object.values(state.collectionProgress)) {
        entry.discovered = true;
        entry.discoveryCount = Math.max(1, entry.discoveryCount);
        entry.firstDiscoveredAt ??= state.time.day;
      }
      return { ok: true, message: 'Dev: Discovered all 25 Collection Book items.' };
    }

    case 'story-intro':
      hooks.triggerStory?.('intro_arrival');
      return { ok: true, message: 'Dev: Replaying arrival cutscene.' };
    case 'story-pan-next':
      hooks.panToObjective?.();
      return { ok: true, message: 'Dev: Panning camera to current objective.' };
    case 'story-first-illness': {
      const story = ensureStoryState(state);
      delete story.seenEvents.first_illness;
      const victim = targetVillager(world, view);
      if (!victim) return { ok: false, message: 'Dev: No villager available.' };
      delete victim.illness;
      if (world.gameplay?.inflictIllness) world.gameplay.inflictIllness(victim, 'fever', true, { tutorialSafe: true });
      else {
        victim.needs.health = Math.min(victim.needs.health, survival.tutorialIllnessHealth);
        victim.illness = { cause: 'fever', tutorialSafe: true, burden: 32, startedAt: state.time.seconds };
      }
      return { ok: true, message: `Dev: Triggered First Illness crisis on ${victim.name}.` };
    }
    case 'story-sickness-death': {
      const story = ensureStoryState(state);
      delete story.seenEvents.first_sickness_death;
      const victim = targetVillager(world, view);
      if (!victim) return { ok: false, message: 'Dev: No villager available.' };
      if (world.gameplay?.killVillager) world.gameplay.killVillager(victim, 'sickness');
      return { ok: true, message: `Dev: Triggered Sickness Death event (${victim.name}).` };
    }
    case 'story-old-age-death': {
      const story = ensureStoryState(state);
      delete story.seenEvents.first_old_age_death;
      const elder = state.villagers.find(v => v.lifeStage === 'elder') || targetVillager(world, view);
      if (!elder) return { ok: false, message: 'Dev: No villager available.' };
      elder.age = Math.max(elder.age, 90);
      elder.lifeStage = 'elder';
      if (world.gameplay?.killVillager) world.gameplay.killVillager(elder, 'old_age');
      return { ok: true, message: `Dev: Triggered Old Age passing event (${elder.name}).` };
    }
    case 'story-first-birth': {
      const story = ensureStoryState(state);
      delete story.seenEvents.first_birth;
      const baby = world.gameplay?.triggerBirth?.();
      if (!baby) return { ok: false, message: 'Dev: Need at least 2 villagers to trigger a birth.' };
      if (state.villagers.length > state.world.populationCapacity) {
        state.world.populationCapacity = state.villagers.length;
      }
      return { ok: true, message: `Dev: Triggered First Birth event (${baby.name}).` };
    }
    case 'story-starve': {
      const currentFood = resources.get('food');
      if (currentFood > 0) resources.remove('food', currentFood);
      state.abilities.heal = true;
      ensureStoryState(state).firstCureDone = true;
      for (const v of state.villagers) v.needs.hunger = 15;
      return { ok: true, message: 'Dev: Emptied Food to 0 (Stage 2 survival active).' };
    }
    case 'chal-solo-100': {
      const chosen = targetVillager(world, view);
      if (!chosen) return { ok: false, message: 'Dev: No villager available.' };
      ensureStoryState(state);
      state.villagers = [chosen];
      state.challenges.soloVillagerId = chosen.id;
      state.challenges.soloDays = STORY_CONFIG.soloChallengeDays;
      state.challenges.lastCheckedDay = state.time.day;
      world.gameplay?.checkAchievements?.();
      return { ok: true, message: `Dev: ${chosen.name} completed Lone Survivor (100 solo days) — Golden skin unlocked!` };
    }
    case 'chal-speedrun': {
      for (const id of Object.keys(landmarks)) completeLandmark(world, id);
      if (state.time.day >= STORY_CONFIG.speedrunMaxDays) state.time.day = 50;
      world.gameplay?.checkAchievements?.();
      return { ok: true, message: 'Dev: Speedrun Legend unlocked! Open Achievements -> Challenges to promote a Champion.' };
    }
    case 'chal-flawless': {
      const story = ensureStoryState(state);
      story.deathCount = 0;
      state.graves = [];
      state.time.day = Math.max(state.time.day, STORY_CONFIG.flawlessTargetDay);
      world.gameplay?.checkAchievements?.();
      return { ok: true, message: 'Dev: Reached Day 100 with 0 deaths — Flawless Century & Dev Mode unlocked!' };
    }

    case 'sys-reset-hud':
      hooks.resetHud?.();
      return { ok: true, message: 'Dev: Reset HUD window layout.' };
    case 'sys-open-journal':
      hooks.openMenu?.('journal');
      return { ok: true, message: 'Dev: Opened Island Journal.' };
    case 'sys-open-guide':
      hooks.openMenu?.('guide');
      return { ok: true, message: 'Dev: Opened Field Guide.' };
    case 'sys-wipe-all':
      hooks.wipeAllData?.();
      return { ok: true, message: 'Dev: Wiped all saved data and restarted fresh.' };

    default:
      return { ok: false, message: `Unknown dev action: ${actionId}` };
  }
}

export function renderDevActionsHtml(page = 0) {
  const pages = [
    DEV_GROUPS.filter(g => g.id === 'atmosphere' || g.id === 'resources'),
    DEV_GROUPS.filter(g => g.id === 'villagers' || g.id === 'progression'),
    DEV_GROUPS.filter(g => g.id === 'story' || g.id === 'system'),
  ];
  const safePage = Math.max(0, Math.min(pages.length - 1, page));
  const groups = pages[safePage];
  return `<div class="pager-bar dev-subtabs">
      <button type="button" class="gu-btn ${safePage === 0 ? 'g' : 's'} pager-btn" data-dev-page="0">World</button>
      <button type="button" class="gu-btn ${safePage === 1 ? 'g' : 's'} pager-btn" data-dev-page="1">Village</button>
      <button type="button" class="gu-btn ${safePage === 2 ? 'g' : 's'} pager-btn" data-dev-page="2">Story &amp; Wipe</button>
    </div>
    ${groups.map(group => `
    <div class="dev-group">
      <h4>${group.title}</h4>
      <div class="dev-btn-grid">
        ${group.actions.map(action => `<button type="button" class="gu-btn ${action.id === 'sys-wipe-all' ? 'd' : 's'} dev-btn" data-dev="${action.id}" data-tip="${action.tip}">${action.label}</button>`).join('')}
      </div>
    </div>
  `).join('')}`;
}
