import { describeInteraction } from './assets.js';
import { tileToWorld } from './geometry.js';
import { landmarks, researchProjects } from './progression.js';
import { skillProgress, villagerSkills } from './villagers.js';

export const STORY_CONFIG = {
  // Staged survival & danger pacing
  needsIntervalSec: 12,
  starvationHealthLoss: 9,
  tutorialStarvationFloor: 25,
  lowFoodWarningThreshold: 5,
  lowFoodWarningCooldownSec: 70,
  // Guided Stage 1 tutorial illness (gentle, non-fatal, non-contagious)
  tutorialIllnessStartHealth: 64,
  tutorialIllnessFloor: 25,
  tutorialIllnessDrainPerSec: 0.16,
  // Stage 2 full survival illness pacing (real risk without instant wipe)
  illnessIntervalSec: 95,
  rainIllnessIntervalSec: 55,
  illnessStartHealth: 52,
  illnessBaseDrainPerSec: 0.28,
  illnessLightRainBonus: 0.14,
  illnessHeavyRainBonus: 0.32,
  illnessHungerBonus: 0.30,
  illnessElderBonus: 0.08,
  criticalHealthThreshold: 26,
  contagionDelaySec: 55,
  contagionCheckSec: 22,
  contagionRadiusTiles: 3.5,
  // Generational aging pacing
  birthdayIntervalSec: 55,
  elderDeathAge: 90,
  // Memorial tending comfort
  mournWorkSec: 2.4,
  mournEnergyBoost: 16,
  mournHealthBoost: 10,
  // Villager hold-still & special challenge rewards
  holdStillDurationSec: 20,
  championSpeedMultiplier: 10,
  soloChallengeDays: 100,
  speedrunMaxDays: 100,
  flawlessTargetDay: 100,
  // Camera pan & visual beacon
  panDurationSec: 0.95,
  reducedPanDurationSec: 0.2,
  defaultSpotlightZoom: 2.45,
  villagerSpotlightZoom: 2.85,
  captionCharsPerSec: 60,
  beaconPulseSpeed: 3.6,
};

export function createInitialStoryState() {
  return {
    seenEvents: {},
    seenGuides: {},
    announcedChapters: {},
    campLitAt: null,
    firstCureDone: false,
    deathCount: 0,
    sicknessDeathCount: 0,
    starvationDeathCount: 0,
    oldAgeDeathCount: 0,
    birthCount: 0,
    lastLowFoodWarnAt: -999,
    nextGraveId: 1,
  };
}

export function createInitialChallenges() {
  return {
    soloDays: 0,
    soloVillagerId: null,
    lastCheckedDay: 1,
    championVillagerId: null,
  };
}

export function ensureStoryState(state) {
  if (!state.story || typeof state.story !== 'object') {
    state.story = createInitialStoryState();
  } else {
    const base = createInitialStoryState();
    state.story.seenEvents ??= {};
    state.story.seenGuides ??= {};
    state.story.announcedChapters ??= {};
    if (state.story.campLitAt === undefined) state.story.campLitAt = null;
    if (typeof state.story.firstCureDone !== 'boolean') state.story.firstCureDone = false;
    for (const key of ['deathCount', 'sicknessDeathCount', 'starvationDeathCount', 'oldAgeDeathCount', 'birthCount']) {
      if (!Number.isFinite(state.story[key])) state.story[key] = base[key];
    }
    if (!Number.isFinite(state.story.lastLowFoodWarnAt)) state.story.lastLowFoodWarnAt = base.lastLowFoodWarnAt;
    if (!Number.isFinite(state.story.nextGraveId)) state.story.nextGraveId = base.nextGraveId;
  }
  if (!state.challenges || typeof state.challenges !== 'object') {
    state.challenges = createInitialChallenges();
  } else {
    if (!Number.isFinite(state.challenges.soloDays)) state.challenges.soloDays = 0;
    if (state.challenges.soloVillagerId === undefined) state.challenges.soloVillagerId = null;
    if (!Number.isFinite(state.challenges.lastCheckedDay)) state.challenges.lastCheckedDay = state.time?.day || 1;
    if (state.challenges.championVillagerId === undefined) state.challenges.championVillagerId = null;
  }
  if (!Array.isArray(state.graves)) state.graves = [];
  if (!state.achievements || typeof state.achievements !== 'object') state.achievements = {};
  return state.story;
}

/**
 * Staged survival progression so new saves never crumble before learning Healing:
 * - Stage 0 (Tutorial Safe): No random/forced sickness, calm weather, safe hunger floor.
 * - Stage 1 (Guided Healing Lesson): Unlocked once Spring is cleared and player has >=10 Knowledge or Healing.
 * - Stage 2 (Full Survival): Unlocked once Healing is learned AND first cure is done or Garden is restored.
 */
export function getSurvivalStage(world) {
  const { state } = world;
  const story = ensureStoryState(state);
  if (state.abilities?.heal && (story.firstCureDone || state.worldFlags?.restore_garden)) {
    return 2;
  }
  if ((state.worldFlags?.light_campfire && state.worldFlags?.unblock_spring
    && ((state.resources?.knowledge ?? 0) >= 10 || state.abilities?.heal))
    || state.abilities?.heal) {
    return 1;
  }
  return 0;
}

export function landmarkObject(world, puzzleId) {
  const entry = world.map.puzzleLocations.find(loc => loc.puzzleId === puzzleId);
  return entry ? world.objects.get(entry.objectId) : null;
}

export function landmarkAnchor(world, puzzleId) {
  const obj = landmarkObject(world, puzzleId);
  if (!obj) return tileToWorld(world.map.villagerSpawns[2], world.map.meta.tileSize);
  return obj.anchor ? { x: obj.anchor.x, y: obj.anchor.y } : tileToWorld(obj.tile, world.map.meta.tileSize);
}

export function findNearestResource(world, counter) {
  const camp = world.map.objects.find(o => o.type === 'campfire_site');
  const origin = camp?.anchor || tileToWorld(world.map.villagerSpawns[2], world.map.meta.tileSize);
  let best = null;
  let bestDist = Infinity;
  for (const obj of world.map.objects) {
    if (!obj.resource) continue;
    if ((world.state.objects[obj.id]?.amount ?? 0) <= 0) continue;
    const interaction = describeInteraction(obj, world.assets);
    if (interaction.counter !== counter) continue;
    const pos = obj.anchor || tileToWorld(obj.tile, world.map.meta.tileSize);
    const d = Math.hypot(pos.x - origin.x, pos.y - origin.y);
    if (d < bestDist) {
      bestDist = d;
      best = { object: obj, position: pos };
    }
  }
  return best;
}

export function findFarmAnchor(world) {
  const zone = world.map.farmingZones[0];
  if (world.state.crops?.length) {
    return tileToWorld(world.state.crops[0].tile, world.map.meta.tileSize);
  }
  if (zone?.tiles?.length) {
    const [x, y] = zone.tiles[Math.floor(zone.tiles.length / 2)];
    return tileToWorld({ x, y }, world.map.meta.tileSize);
  }
  return landmarkAnchor(world, 'unblock_spring');
}

export function findFishingAnchor(world) {
  const spot = world.map.fishingSpots.find(s => !s.requires.includes('bridge_repaired') || world.state.worldFlags.repair_bridge)
    || world.map.fishingSpots[0];
  return spot ? tileToWorld(spot.standPosition, world.map.meta.tileSize) : landmarkAnchor(world, 'restore_garden');
}

export function findBestDragOrigin(world, fromKind = 'adult', excludeId = null) {
  const pool = world.state.villagers.filter(v => {
    if (v.id === excludeId) return false;
    if (fromKind === 'healthy_adult') return v.lifeStage !== 'baby' && v.lifeStage !== 'child' && !v.illness && v.needs.health >= 65;
    if (fromKind === 'adult') return v.lifeStage !== 'baby' && v.lifeStage !== 'child';
    return v.lifeStage !== 'baby';
  });
  return pool[0] || world.state.villagers.find(v => v.id !== excludeId) || null;
}

function hasCompletedBuilding(state, type) {
  return state.buildings.some(b => b.type === type && b.state === 'completed');
}

export const STORY_CHAPTERS = [
  {
    id: 'ch1_campfire',
    number: 1,
    title: 'Light the Campfire',
    shortTitle: 'Spark of Survival',
    icon: 'work',
    guideId: 'campfire',
    landmarkId: 'light_campfire',
    summary: 'Gather 4 Wood and light the stone campfire ring.',
    howTo: 'Drag an adult onto a tree (4 Wood), then drop them on the stone ring.',
    isComplete: ({ state }) => Boolean(state.worldFlags.light_campfire),
    steps: ({ state }) => [
      { label: 'Wood', done: state.resources.wood >= 4 || Boolean(state.worldFlags.light_campfire), progress: `${Math.min(4, state.resources.wood)}/4` },
      { label: 'Campfire', done: Boolean(state.worldFlags.light_campfire), progress: state.worldFlags.light_campfire ? 'Lit' : '0/1' },
    ],
    resolveTarget: world => {
      if (world.state.resources.wood < 4 && !world.state.worldFlags.light_campfire) {
        const tree = findNearestResource(world, 'wood');
        if (tree) return { position: tree.position, zoom: 2.5, label: 'Drag Adult Here (Wood)', kind: 'object', id: tree.object.id, dragFrom: 'adult' };
      }
      return { position: landmarkAnchor(world, 'light_campfire'), zoom: 2.55, label: 'Drop Adult Here (Campfire)', kind: 'landmark', id: 'light_campfire', dragFrom: 'adult' };
    },
  },
  {
    id: 'ch2_spring',
    number: 2,
    title: 'Unblock the Spring',
    shortTitle: 'Clear the Freshwater Spring',
    icon: 'build',
    guideId: 'resources',
    landmarkId: 'unblock_spring',
    summary: 'Mine 5 Stone and clear the blocked spring north of camp.',
    howTo: 'Drag an adult onto rocks (5 Stone), then drop them on the blocked spring.',
    isComplete: ({ state }) => Boolean(state.worldFlags.unblock_spring),
    steps: ({ state }) => [
      { label: 'Stone', done: state.resources.stone >= 5 || Boolean(state.worldFlags.unblock_spring), progress: `${Math.min(5, state.resources.stone)}/5` },
      { label: 'Spring', done: Boolean(state.worldFlags.unblock_spring), progress: state.worldFlags.unblock_spring ? 'Clear' : '0/1' },
    ],
    resolveTarget: world => {
      if (world.state.resources.stone < 5 && !world.state.worldFlags.unblock_spring) {
        const rock = findNearestResource(world, 'stone');
        if (rock) return { position: rock.position, zoom: 2.45, label: 'Mine Rocks (5 Stone)', kind: 'object', id: rock.object.id, dragFrom: 'adult' };
      }
      return { position: landmarkAnchor(world, 'unblock_spring'), zoom: 2.5, label: 'Clear Spring (5 Stone)', kind: 'landmark', id: 'unblock_spring', dragFrom: 'adult' };
    },
  },
  {
    id: 'ch3_healing',
    number: 3,
    title: 'Research Healing',
    shortTitle: 'Learn the Art of Healing',
    icon: 'health',
    guideId: 'healing',
    landmarkId: null,
    summary: 'Study 10 Knowledge at the campfire and unlock Healing in Research.',
    howTo: 'Drop an adult on the campfire for 10 Knowledge, then unlock Healing.',
    isComplete: ({ state }) => Boolean(state.abilities.heal),
    steps: ({ state }) => [
      { label: 'Knowledge', done: state.resources.knowledge >= 10 || Boolean(state.abilities.heal), progress: `${Math.min(10, state.resources.knowledge)}/10` },
      { label: 'Healing', done: Boolean(state.abilities.heal), progress: state.abilities.heal ? 'Done' : 'Research' },
    ],
    resolveTarget: world => {
      const sick = world.state.villagers.find(v => v.illness || v.needs.health < 65);
      if (sick) return { position: { ...sick.position }, zoom: 2.8, label: `Heal ${sick.name}`, kind: 'villager', id: sick.id, dragFrom: 'healthy_adult' };
      return { position: landmarkAnchor(world, 'light_campfire'), zoom: 2.55, label: 'Study Here (10 Knowledge)', kind: 'landmark', id: 'light_campfire', dragFrom: 'adult' };
    },
  },
  {
    id: 'ch4_farming',
    number: 4,
    title: 'Learn Farming',
    shortTitle: 'Sprouts by the Spring',
    icon: 'hunger',
    guideId: 'farming',
    landmarkId: null,
    summary: 'Unlock Farming (12 Knowledge) to cultivate fertile spring crops.',
    howTo: 'Earn 12 Knowledge, unlock Farming in Research, and tend spring crops.',
    isComplete: ({ state }) => Boolean(state.abilities.farm),
    steps: ({ state }) => [
      { label: 'Knowledge', done: state.resources.knowledge >= 12 || Boolean(state.abilities.farm), progress: `${Math.min(12, state.resources.knowledge)}/12` },
      { label: 'Farming', done: Boolean(state.abilities.farm), progress: state.abilities.farm ? 'Done' : 'Research' },
    ],
    resolveTarget: world => {
      if (world.state.resources.knowledge >= 12) {
        return { position: findFarmAnchor(world), zoom: 2.45, label: 'Spring Crops', kind: 'zone', id: 'farm_zone_001', dragFrom: 'adult' };
      }
      return { position: landmarkAnchor(world, 'light_campfire'), zoom: 2.5, label: 'Study Here (12 Knowledge)', kind: 'landmark', id: 'light_campfire', dragFrom: 'adult' };
    },
  },
  {
    id: 'ch5_garden',
    number: 5,
    title: 'Restore Garden',
    shortTitle: 'Revive the Overgrown Garden',
    icon: 'discovery',
    guideId: 'farming',
    landmarkId: 'restore_garden',
    summary: 'Bring 6 Wood and 4 Food to the eastern flower garden.',
    howTo: 'With Farming learned, drop an adult on the eastern flower garden.',
    isComplete: ({ state }) => Boolean(state.worldFlags.restore_garden),
    steps: ({ state }) => [
      { label: 'Wood', done: state.resources.wood >= 6 || Boolean(state.worldFlags.restore_garden), progress: `${Math.min(6, state.resources.wood)}/6` },
      { label: 'Food', done: state.resources.food >= 4 || Boolean(state.worldFlags.restore_garden), progress: `${Math.min(4, state.resources.food)}/4` },
      { label: 'Garden', done: Boolean(state.worldFlags.restore_garden), progress: state.worldFlags.restore_garden ? 'Done' : '0/1' },
    ],
    resolveTarget: world => ({
      position: landmarkAnchor(world, 'restore_garden'),
      zoom: 2.45,
      label: 'Restore Garden (6W · 4F)',
      kind: 'landmark',
      id: 'restore_garden',
      dragFrom: 'adult',
    }),
  },
  {
    id: 'ch6_family',
    number: 6,
    title: 'Build Family House',
    shortTitle: 'Home & Next Generation',
    icon: 'house',
    guideId: 'families',
    landmarkId: null,
    summary: 'Build a Family House (18 Wood, 8 Stone) and welcome a baby.',
    howTo: 'Build a Family House, then drop two adults together (12 Food).',
    isComplete: ({ state }) => hasCompletedBuilding(state, 'family_house') && ((state.story?.birthCount ?? 0) > 0 || state.villagers.some(v => v.lifeStage === 'baby')),
    steps: ({ state }) => [
      { label: 'Family House', done: hasCompletedBuilding(state, 'family_house'), progress: hasCompletedBuilding(state, 'family_house') ? 'Built' : '18W · 8S' },
      { label: 'Baby', done: (state.story?.birthCount ?? 0) > 0 || state.villagers.some(v => v.lifeStage === 'baby'), progress: (state.story?.birthCount ?? 0) > 0 ? 'Done' : 'Drop 2 Adults' },
    ],
    resolveTarget: world => {
      const site = world.state.buildings.find(b => b.type === 'family_house');
      if (site) return { position: tileToWorld(site.tile, world.map.meta.tileSize), zoom: 2.6, label: 'Family House Site', kind: 'building', id: site.id, dragFrom: 'adult' };
      return { position: tileToWorld(world.map.villagerSpawns[2], world.map.meta.tileSize), zoom: 2.3, label: 'Place Family House Here', kind: 'zone', id: 'village_center' };
    },
  },
  {
    id: 'ch7_fishing',
    number: 7,
    title: 'Learn Fishing',
    shortTitle: 'Bounty of the Waters',
    icon: 'discovery',
    guideId: 'fishing',
    landmarkId: null,
    summary: 'Unlock Fishing (18 Knowledge) and fish at shoreline markers.',
    howTo: 'Learn Fishing in Research, then drop a villager on the lake markers.',
    isComplete: ({ state }) => Boolean(state.abilities.fish),
    steps: ({ state }) => [
      { label: 'Knowledge', done: state.resources.knowledge >= 18 || Boolean(state.abilities.fish), progress: `${Math.min(18, state.resources.knowledge)}/18` },
      { label: 'Fishing', done: Boolean(state.abilities.fish), progress: state.abilities.fish ? 'Done' : 'Research' },
    ],
    resolveTarget: world => ({
      position: findFishingAnchor(world),
      zoom: 2.45,
      label: 'Lake Fishing Shore',
      kind: 'zone',
      id: 'lake_fishing_001',
    }),
  },
  {
    id: 'ch8_cave',
    number: 8,
    title: 'Explore the Cave',
    shortTitle: 'Into the Dark Cave',
    icon: 'curious',
    guideId: 'landmarks',
    landmarkId: 'light_cave',
    summary: 'Bring 5 Wood to investigate the western cave entrance.',
    howTo: 'Hold 5 Wood and drag an adult onto the dark cave entrance.',
    isComplete: ({ state }) => Boolean(state.worldFlags.light_cave),
    steps: ({ state }) => [
      { label: 'Wood', done: state.resources.wood >= 5 || Boolean(state.worldFlags.light_cave), progress: `${Math.min(5, state.resources.wood)}/5` },
      { label: 'Cave', done: Boolean(state.worldFlags.light_cave), progress: state.worldFlags.light_cave ? 'Done' : '0/1' },
    ],
    resolveTarget: world => ({
      position: landmarkAnchor(world, 'light_cave'),
      zoom: 2.5,
      label: 'Explore Cave (5 Wood)',
      kind: 'landmark',
      id: 'light_cave',
      dragFrom: 'adult',
    }),
  },
  {
    id: 'ch9_bridge',
    number: 9,
    title: 'Repair the Bridge',
    shortTitle: 'Span the Gorge',
    icon: 'build',
    guideId: 'landmarks',
    landmarkId: 'repair_bridge',
    summary: 'Learn Advanced Construction and rebuild the broken eastern bridge.',
    howTo: 'Unlock Adv. Construction (24 K), hold 14W & 8S, drop a builder on the bridge.',
    isComplete: ({ state }) => Boolean(state.worldFlags.repair_bridge),
    steps: ({ state }) => [
      { label: 'Adv. Build', done: Boolean(state.abilities.advanced_construction), progress: state.abilities.advanced_construction ? 'Done' : '24 K' },
      { label: 'Materials', done: (state.resources.wood >= 14 && state.resources.stone >= 8) || Boolean(state.worldFlags.repair_bridge), progress: `${Math.min(14, state.resources.wood)}/14W · ${Math.min(8, state.resources.stone)}/8S` },
      { label: 'Bridge', done: Boolean(state.worldFlags.repair_bridge), progress: state.worldFlags.repair_bridge ? 'Done' : '0/1' },
    ],
    resolveTarget: world => ({
      position: landmarkAnchor(world, 'repair_bridge'),
      zoom: 2.45,
      label: 'Repair Bridge (14W · 8S)',
      kind: 'landmark',
      id: 'repair_bridge',
      dragFrom: 'adult',
    }),
  },
  {
    id: 'ch10_waterfall',
    number: 10,
    title: 'Read Waterfall Marks',
    shortTitle: 'Whispers Behind the Falls',
    icon: 'knowledge',
    guideId: 'landmarks',
    landmarkId: 'open_waterfall_passage',
    summary: 'Learn Ancient Knowledge (28 K) and study the northern waterfall.',
    howTo: 'Unlock Ancient Knowledge, then drop an adult onto the waterfall.',
    isComplete: ({ state }) => Boolean(state.worldFlags.open_waterfall_passage),
    steps: ({ state }) => [
      { label: 'Ancient Know.', done: Boolean(state.abilities.ancient_knowledge), progress: state.abilities.ancient_knowledge ? 'Done' : '28 K' },
      { label: 'Waterfall', done: Boolean(state.worldFlags.open_waterfall_passage), progress: state.worldFlags.open_waterfall_passage ? 'Done' : '0/1' },
    ],
    resolveTarget: world => ({
      position: landmarkAnchor(world, 'open_waterfall_passage'),
      zoom: 2.45,
      label: 'Study Waterfall Marks',
      kind: 'landmark',
      id: 'open_waterfall_passage',
      dragFrom: 'adult',
    }),
  },
  {
    id: 'ch11_monument',
    number: 11,
    title: 'Restore Monument',
    shortTitle: 'Crown of the Island',
    icon: 'trophy',
    guideId: 'landmarks',
    landmarkId: 'restore_monument',
    summary: 'Bring 12 Stone and 8 Wood to restore the summit monument.',
    howTo: 'Hold 12 Stone and 8 Wood, then drop an adult on the ancient monument.',
    isComplete: ({ state }) => Boolean(state.worldFlags.restore_monument),
    steps: ({ state }) => [
      { label: 'Stone', done: state.resources.stone >= 12 || Boolean(state.worldFlags.restore_monument), progress: `${Math.min(12, state.resources.stone)}/12` },
      { label: 'Wood', done: state.resources.wood >= 8 || Boolean(state.worldFlags.restore_monument), progress: `${Math.min(8, state.resources.wood)}/8` },
      { label: 'Monument', done: Boolean(state.worldFlags.restore_monument), progress: state.worldFlags.restore_monument ? 'Done' : '0/1' },
    ],
    resolveTarget: world => ({
      position: landmarkAnchor(world, 'restore_monument'),
      zoom: 2.45,
      label: 'Restore Monument (12S · 8W)',
      kind: 'landmark',
      id: 'restore_monument',
      dragFrom: 'adult',
    }),
  },
  {
    id: 'ch12_endless',
    number: 12,
    title: 'Sandbox Mastery',
    shortTitle: 'A Thriving Island Home',
    icon: 'trophy',
    guideId: 'collection',
    landmarkId: null,
    summary: 'Complete all 25 finds, train Masters, and conquer the 3 Challenges.',
    howTo: 'Chase all 25 collectibles and unlock the 3 exclusive Challenge rewards.',
    isComplete: () => false,
    steps: ({ state, assets }) => {
      const found = Object.values(state.collectionProgress).filter(e => e.discovered).length;
      const builds = state.buildings.filter(b => b.state === 'completed').length;
      return [
        { label: 'Finds', done: found >= assets.collectibles.length, progress: `${found}/${assets.collectibles.length}` },
        { label: 'Buildings', done: builds >= 3, progress: `${builds}/3` },
        { label: 'Villagers', done: state.villagers.length >= 8, progress: `${state.villagers.length}/8` },
      ];
    },
    resolveTarget: world => ({
      position: landmarkAnchor(world, 'restore_monument'),
      zoom: 2.2,
      label: 'Restored Monument',
      kind: 'landmark',
      id: 'restore_monument',
    }),
  },
];

export function getActiveChapter(world) {
  const storyChapters = STORY_CHAPTERS.slice(0, -1);
  const completedCount = storyChapters.filter(ch => ch.isComplete(world)).length;
  const active = storyChapters.find(ch => !ch.isComplete(world)) || STORY_CHAPTERS[STORY_CHAPTERS.length - 1];
  return {
    chapter: active,
    completedCount,
    totalCount: storyChapters.length,
    target: active.resolveTarget(world),
    steps: active.steps(world),
  };
}

export const ACHIEVEMENT_DEFS = [
  {
    id: 'first_flame',
    title: 'First Flame',
    desc: 'Light the island campfire',
    icon: 'work',
    eval: ({ state }) => ({ done: Boolean(state.worldFlags.light_campfire), current: state.worldFlags.light_campfire ? 1 : 0, goal: 1 }),
  },
  {
    id: 'spring_keeper',
    title: 'Spring Keeper',
    desc: 'Clear the freshwater spring',
    icon: 'build',
    eval: ({ state }) => ({ done: Boolean(state.worldFlags.unblock_spring), current: state.worldFlags.unblock_spring ? 1 : 0, goal: 1 }),
  },
  {
    id: 'village_healer',
    title: 'First Cure',
    desc: 'Heal a sick villager',
    icon: 'health',
    eval: ({ state }) => ({ done: Boolean(state.story?.firstCureDone), current: state.story?.firstCureDone ? 1 : 0, goal: 1 }),
  },
  {
    id: 'village_builder',
    title: 'Village Builder',
    desc: 'Complete 3 village buildings',
    icon: 'house',
    eval: ({ state }) => {
      const count = state.buildings.filter(b => b.state === 'completed').length;
      return { done: count >= 3, current: Math.min(3, count), goal: 3 };
    },
  },
  {
    id: 'island_scholar',
    title: 'Island Scholar',
    desc: 'Learn all 5 research skills',
    icon: 'knowledge',
    eval: ({ state }) => {
      const total = Object.keys(researchProjects).length;
      const count = Object.keys(researchProjects).filter(id => state.abilities[id]).length;
      return { done: count >= total, current: count, goal: total };
    },
  },
  {
    id: 'island_collector',
    title: 'Island Collector',
    desc: 'Discover all 25 finds',
    icon: 'discovery',
    eval: ({ state, assets }) => {
      const total = assets.collectibles.length;
      const count = Object.values(state.collectionProgress).filter(e => e.discovered).length;
      return { done: count >= total, current: count, goal: total };
    },
  },
  {
    id: 'growing_village',
    title: 'Growing Village',
    desc: 'Reach 8 living villagers',
    icon: 'villagers',
    eval: ({ state }) => ({ done: state.villagers.length >= 8, current: Math.min(8, state.villagers.length), goal: 8 }),
  },
  {
    id: 'master_craft',
    title: 'Master Craft',
    desc: 'Train any villager to Master',
    icon: 'skillup',
    eval: ({ state }) => {
      const has = state.villagers.some(v => Object.keys(villagerSkills).some(s => skillProgress(v, s).tier >= 2));
      return { done: has, current: has ? 1 : 0, goal: 1 };
    },
  },
  {
    id: 'island_restored',
    title: 'Island Restoration',
    desc: 'Restore all 7 island landmarks',
    icon: 'trophy',
    eval: ({ state }) => {
      const total = Object.keys(landmarks).length;
      const count = Object.keys(landmarks).filter(id => state.worldFlags[id]).length;
      return { done: Boolean(state.worldFlags.restore_monument), current: count, goal: total };
    },
  },
];

export const CHALLENGE_DEFS = [
  {
    id: 'challenge_lone_survivor',
    title: 'Lone Survivor',
    desc: 'Survive 100 days with only 1 villager.',
    reward: 'Unlocks Golden Villager skin for that survivor',
    icon: 'sun',
    eval: ({ state }) => {
      const done = Boolean(state.achievements.challenge_lone_survivor);
      const current = done ? STORY_CONFIG.soloChallengeDays : Math.min(STORY_CONFIG.soloChallengeDays, state.challenges?.soloDays || 0);
      return { done, current, goal: STORY_CONFIG.soloChallengeDays };
    },
  },
  {
    id: 'challenge_speedrun',
    title: 'Speedrun Legend',
    desc: 'Restore the Ancient Monument in under 100 days.',
    reward: 'Promote 1 villager to Max Stats + 10× Speed',
    icon: 'skillup',
    eval: ({ state }) => {
      const done = Boolean(state.achievements.challenge_speedrun)
        || (Boolean(state.worldFlags.restore_monument) && state.time.day < STORY_CONFIG.speedrunMaxDays);
      const landmarksDone = Object.keys(landmarks).filter(id => state.worldFlags[id]).length;
      return { done, current: done ? 7 : landmarksDone, goal: 7 };
    },
  },
  {
    id: 'challenge_flawless_century',
    title: 'Flawless Century',
    desc: 'Reach Day 100 without any villager dying.',
    reward: 'Permanently unlocks Dev Mode',
    icon: 'trophy',
    eval: ({ state }) => {
      const deaths = (state.story?.deathCount || 0) + (state.graves?.length || 0);
      const done = Boolean(state.achievements.challenge_flawless_century)
        || (state.time.day >= STORY_CONFIG.flawlessTargetDay && deaths === 0);
      return {
        done,
        failed: !done && deaths > 0,
        current: done ? STORY_CONFIG.flawlessTargetDay : Math.min(STORY_CONFIG.flawlessTargetDay, state.time.day),
        goal: STORY_CONFIG.flawlessTargetDay,
      };
    },
  },
];

/**
 * Evaluates all progression achievements and the 3 exclusive challenges.
 * Returns newly unlocked achievement/challenge definitions for reward notifications.
 */
export function evaluateAchievementsAndChallenges(world) {
  const { state } = world;
  ensureStoryState(state);
  const newlyUnlocked = [];

  // Update consecutive solo-day counter whenever the calendar day advances.
  const today = state.time.day;
  const ch = state.challenges;
  if (today > ch.lastCheckedDay) {
    const deltaDays = today - ch.lastCheckedDay;
    ch.lastCheckedDay = today;
    if (state.villagers.length === 1) {
      const lone = state.villagers[0];
      if (ch.soloVillagerId === lone.id) {
        ch.soloDays += deltaDays;
      } else {
        ch.soloVillagerId = lone.id;
        ch.soloDays = deltaDays;
      }
    } else {
      ch.soloVillagerId = null;
      ch.soloDays = 0;
    }
  } else if (state.villagers.length === 1 && !ch.soloVillagerId) {
    ch.soloVillagerId = state.villagers[0].id;
  } else if (state.villagers.length !== 1 && ch.soloDays > 0 && !state.achievements.challenge_lone_survivor) {
    ch.soloVillagerId = null;
    ch.soloDays = 0;
  }

  // Standard milestone achievements
  for (const def of ACHIEVEMENT_DEFS) {
    if (state.achievements[def.id]) continue;
    if (def.eval(world).done) {
      state.achievements[def.id] = true;
      newlyUnlocked.push({ ...def, isChallenge: false });
    }
  }

  // Challenge 1: Lone Survivor -> Golden Skin for that specific villager
  if (!state.achievements.challenge_lone_survivor
    && ch.soloDays >= STORY_CONFIG.soloChallengeDays
    && state.villagers.length === 1) {
    const survivor = state.villagers[0];
    survivor.special = { ...(survivor.special || {}), golden: true };
    state.achievements.challenge_lone_survivor = true;
    newlyUnlocked.push({ ...CHALLENGE_DEFS[0], isChallenge: true, targetVillager: survivor });
  }

  // Challenge 2: Speedrun Legend -> Monument restored before Day 100
  if (!state.achievements.challenge_speedrun
    && state.worldFlags.restore_monument
    && state.time.day < STORY_CONFIG.speedrunMaxDays) {
    state.achievements.challenge_speedrun = true;
    newlyUnlocked.push({ ...CHALLENGE_DEFS[1], isChallenge: true });
  }

  // Challenge 3: Flawless Century -> Reach Day 100 with 0 deaths -> Unlocks Dev Mode
  const deaths = (state.story.deathCount || 0) + (state.graves?.length || 0);
  if (!state.achievements.challenge_flawless_century
    && state.time.day >= STORY_CONFIG.flawlessTargetDay
    && deaths === 0) {
    state.achievements.challenge_flawless_century = true;
    newlyUnlocked.push({ ...CHALLENGE_DEFS[2], isChallenge: true });
  }

  return newlyUnlocked;
}

export const FEATURE_GUIDES = [
  {
    id: 'basics',
    title: 'Villagers & Controls',
    icon: 'villagers',
    summary: 'Drag villagers directly onto work targets or freeze them to grab easily.',
    steps: [
      'Hold and drag any villager onto trees, rocks, berry bushes, crops, or landmarks.',
      'Use Stop Moving on a villager card to freeze them in place for 20s so grabbing is effortless.',
      'Click Find Me to smoothly pan and zoom straight to the selected villager.',
    ],
    actionHint: 'Villagers resume moving automatically once you pick them up or after 20 seconds.',
    resolveTarget: world => {
      const v = world.state.villagers[0];
      return v ? { position: { ...v.position }, zoom: 2.6, label: v.name } : null;
    },
  },
  {
    id: 'campfire',
    title: 'Campfire & Knowledge',
    icon: 'knowledge',
    summary: 'Light the stone ring first to start earning Knowledge for Research.',
    steps: [
      'Drag an adult onto trees for 4 Wood, then drop them on the stone ring.',
      'Drop an adult back on the lit campfire to generate +2 Knowledge per cycle.',
      'Build a Research Hut (14 Wood, 6 Stone) later for +3 Knowledge per cycle.',
    ],
    actionHint: 'Earn 10 Knowledge early so you are ready to unlock Healing.',
    resolveTarget: world => ({ position: landmarkAnchor(world, 'light_campfire'), zoom: 2.55, label: 'Campfire Ring' }),
  },
  {
    id: 'resources',
    title: 'Food, Wood & Stone',
    icon: 'work',
    summary: 'Keep Food stocked—running out after the tutorial causes starvation.',
    steps: [
      'Gather berries, coconuts, and mushrooms for Food; chop trees for Wood; mine rocks for Stone.',
      'Depleted bushes and trees regrow after 35 seconds.',
      'Build Food Storage (12 Wood, 4 Stone) to shorten supply trips.',
    ],
    actionHint: 'Keep at least 15–20 Food stored once full survival hazards begin.',
    resolveTarget: world => {
      const berry = findNearestResource(world, 'food');
      return berry ? { position: berry.position, zoom: 2.5, label: 'Food Source' } : null;
    },
  },
  {
    id: 'healing',
    title: 'Sickness, Storms & Healing',
    icon: 'health',
    summary: 'Tutorial stays safe until you clear the spring and earn 10 Knowledge.',
    steps: [
      'Unlock Healing in Research (10 Knowledge) as soon as you can.',
      'When a red cross pulses over a sick villager, drag a healthy adult onto them to cure them.',
      'Build a Healing Hut (12 Wood, 6 Stone) to boost each heal from +50 to +75 Health.',
    ],
    actionHint: 'After your first guided cure, rainstorms and full lethal sickness activate.',
    resolveTarget: world => {
      const sick = world.state.villagers.find(v => v.illness || v.needs.health < 70);
      return sick ? { position: { ...sick.position }, zoom: 2.8, label: `${sick.name} (Needs Care)` }
        : { position: landmarkAnchor(world, 'light_campfire'), zoom: 2.4, label: 'Village Camp' };
    },
  },
  {
    id: 'buildings',
    title: 'Village Buildings',
    icon: 'build',
    summary: 'Place foundations in the village clearing and drop builders on them.',
    steps: [
      'Open Buildings from the Menu Bar, pick a hut, and click Place Foundation.',
      'Click a green footprint in the clearing to lay the foundation.',
      'Drop one or more adults onto the site to complete all 4 stages.',
    ],
    actionHint: 'House (+3 pop), Family House (+2 pop & babies), Healing Hut (+75 heal), Research Hut (+3 Knowledge).',
    resolveTarget: world => ({ position: tileToWorld(world.map.villagerSpawns[2], world.map.meta.tileSize), zoom: 2.25, label: 'Village Clearing' }),
  },
  {
    id: 'research',
    title: 'Research & Abilities',
    icon: 'research',
    summary: 'Spend Knowledge to unlock all 5 village professions.',
    steps: [
      'Open Research from the Menu Bar to unlock Healing, Farming, Fishing, and more.',
      'Some projects unlock after restoring their matching landmark.',
      'Once unlocked, every eligible villager can use the skill immediately.',
    ],
    actionHint: 'Order: Healing (10) -> Farming (12) -> Fishing (18) -> Adv. Construction (24) -> Ancient Knowledge (28).',
    resolveTarget: world => ({ position: landmarkAnchor(world, 'light_campfire'), zoom: 2.5, label: 'Campfire Study Site' }),
  },
  {
    id: 'families',
    title: 'Families, Babies & Aging',
    icon: 'love',
    summary: 'Elders pass at age 90, so raise children to sustain your colony.',
    steps: [
      'Build a Family House (18 Wood, 8 Stone) and keep 12 Food plus 1 open bed.',
      'Drag one adult directly onto another unpaired adult to welcome a baby.',
      'Babies grow into children at age 2 and full adults at age 18.',
    ],
    actionHint: 'Children can gather berries, fish, and collect special island finds.',
    resolveTarget: world => {
      const fh = world.state.buildings.find(b => b.type === 'family_house');
      return fh ? { position: tileToWorld(fh.tile, world.map.meta.tileSize), zoom: 2.6, label: 'Family House' }
        : { position: tileToWorld(world.map.villagerSpawns[2], world.map.meta.tileSize), zoom: 2.3, label: 'Village Camp' };
    },
  },
  {
    id: 'farming',
    title: 'Freshwater Spring & Crops',
    icon: 'hunger',
    summary: 'Clearing the spring unlocks 8 renewable farm plots.',
    steps: [
      'Clear the blocked spring with 5 Stone to irrigate the valley.',
      'Unlock Farming (12 Knowledge) and drop adults onto green sprouts.',
      'Crops grow from stage 0 to 3 and harvest big Food hauls.',
    ],
    actionHint: 'Higher Gathering rank harvests more Food per trip.',
    resolveTarget: world => ({ position: findFarmAnchor(world), zoom: 2.5, label: 'Spring Cropland' }),
  },
  {
    id: 'fishing',
    title: 'Lake & Shore Fishing',
    icon: 'discovery',
    summary: 'Restore the garden, unlock Fishing, and fish along the lake edge.',
    steps: [
      'Restore the Flower Garden to draw fish back to shore.',
      'Learn Fishing (18 Knowledge) so blue markers appear on the water.',
      'Drop any child, adult, or elder onto a shallow marker to start fishing.',
    ],
    actionHint: 'Repair the eastern bridge for deeper coastal fishing spots.',
    resolveTarget: world => ({ position: findFishingAnchor(world), zoom: 2.5, label: 'Lake Fishing Shore' }),
  },
  {
    id: 'collection',
    title: 'Rare Collectibles',
    icon: 'book',
    summary: 'Discover all 25 shells, minerals, artifacts, and butterflies.',
    steps: [
      'Spot sparkling items across beaches, clearings, gardens, and caves.',
      'Drop an eligible villager onto a sparkle to log it in your Collection Book.',
      'Weather, nightfall, and restored landmarks reveal rare finds.',
    ],
    actionHint: 'Open Collection Book to view rarity and habitat hints.',
    resolveTarget: world => {
      const find = world.state.activeCollectibles[0];
      return find ? { position: { ...find.position }, zoom: 2.8, label: 'Active Collectible' } : null;
    },
  },
  {
    id: 'landmarks',
    title: 'The 7 Island Landmarks',
    icon: 'trophy',
    summary: 'Use Show Me or Journal Locate to pan directly to every landmark.',
    steps: [
      'Complete landmarks in order to open farms, caves, bridges, and the monument.',
      'Each completed landmark pans the camera straight to your next destination.',
      'Restoring the Monument in under 100 days unlocks the Speedrun Legend reward!',
    ],
    actionHint: 'Click any landmark with no villager selected to see its quick hint.',
    resolveTarget: world => getActiveChapter(world).target,
  },
  {
    id: 'memorials',
    title: 'Memorials & Challenges',
    icon: 'warn',
    summary: 'Honor fallen villagers at their stone cairns and chase 3 exclusive challenges.',
    steps: [
      'Drop a surviving villager onto a Memorial Cairn to pay respects (+16 Energy, +10 Health).',
      'Open Achievements -> Challenges to track Lone Survivor, Speedrun Legend, and Flawless Century.',
      'Claim Golden Skin, 10x Speed Champion, and Dev Mode directly from Challenges!',
    ],
    actionHint: 'Surviving to Day 100 with 0 deaths unlocks Dev Mode permanently.',
    resolveTarget: world => {
      const grave = world.state.graves?.[world.state.graves.length - 1];
      return grave ? { position: { ...grave.position }, zoom: 2.8, label: `${grave.name}'s Memorial` } : null;
    },
  },
];

export const FEATURE_GUIDE_MAP = Object.fromEntries(FEATURE_GUIDES.map(g => [g.id, g]));

const NEXT_LANDMARK_REVEALS = {
  light_campfire: {
    doneTitle: 'Campfire Lit!',
    doneText: 'Drop an adult on the fire anytime to earn Knowledge.',
    nextLandmarkId: 'unblock_spring',
    nextTitle: 'Next: Clear the Blocked Spring',
    nextText: 'Mine 5 Stone from rocks, then drop an adult here.',
  },
  unblock_spring: {
    doneTitle: 'Freshwater Spring Cleared!',
    doneText: '8 fertile crop plots just sprouted beside the water.',
    nextLandmarkId: 'restore_garden',
    nextTitle: 'Next: Revive the Overgrown Garden',
    nextText: 'Earn 10+ Knowledge (Healing & Farming), then bring 6 Wood & 4 Food here.',
  },
  restore_garden: {
    doneTitle: 'Garden Restored!',
    doneText: 'Fishing can now be unlocked in Research (18 Knowledge).',
    nextLandmarkId: 'light_cave',
    nextTitle: 'Next: Explore the Dark Cave',
    nextText: 'Bring 5 Wood for torches and drop an adult at the cave mouth.',
  },
  light_cave: {
    doneTitle: 'Dark Cave Explored!',
    doneText: 'Ancient Knowledge is now available in Research.',
    nextLandmarkId: 'repair_bridge',
    nextTitle: 'Next: Repair the Eastern Bridge',
    nextText: 'Learn Adv. Construction (24 K), then bring 14 Wood & 8 Stone here.',
  },
  repair_bridge: {
    doneTitle: 'Eastern Bridge Repaired!',
    doneText: 'Villagers can now cross to the eastern plateau.',
    nextLandmarkId: 'open_waterfall_passage',
    nextTitle: 'Next: Read the Waterfall Marks',
    nextText: 'Learn Ancient Knowledge (28 K), then drop an adult at the falls.',
  },
  open_waterfall_passage: {
    doneTitle: 'Waterfall Marks Deciphered!',
    doneText: 'The path to the summit monument is revealed.',
    nextLandmarkId: 'restore_monument',
    nextTitle: 'Final Goal: Restore the Monument',
    nextText: 'Bring 12 Stone and 8 Wood and drop an adult here.',
  },
  restore_monument: {
    doneTitle: 'Ancient Monument Restored!',
    doneText: 'You restored the island! Keep growing your colony.',
    nextLandmarkId: null,
    nextTitle: 'Endless Colony Unlocked',
    nextText: 'Open Achievements -> Challenges to claim exclusive rewards!',
  },
};

const RESEARCH_GUIDE_BEATS = {
  heal: {
    title: 'Healing Unlocked',
    text: 'Drag a healthy adult onto any sick villager to cure them.',
    icon: 'health',
    dragFrom: 'healthy_adult',
  },
  farm: {
    title: 'Farming Unlocked',
    text: 'Drag an adult onto the spring crops to grow and harvest Food.',
    icon: 'hunger',
    dragFrom: 'adult',
  },
  fish: {
    title: 'Fishing Unlocked',
    text: 'Drop any villager on the blue wave markers by the lake.',
    icon: 'discovery',
    dragFrom: 'any',
  },
  advanced_construction: {
    title: 'Advanced Construction Unlocked',
    text: 'Bring 14 Wood & 8 Stone to rebuild the broken eastern bridge.',
    icon: 'build',
    dragFrom: 'adult',
  },
  ancient_knowledge: {
    title: 'Ancient Knowledge Unlocked',
    text: 'Drop an adult onto the northern waterfall to read the marks.',
    icon: 'knowledge',
    dragFrom: 'adult',
  },
};

export function buildEventSequence(eventId, payload, world) {
  const campPos = landmarkAnchor(world, 'light_campfire');
  const springPos = landmarkAnchor(world, 'unblock_spring');
  const monumentPos = landmarkAnchor(world, 'restore_monument');
  const villagePos = tileToWorld(world.map.villagerSpawns[2], world.map.meta.tileSize);
  const nearestTree = findNearestResource(world, 'wood');

  switch (eventId) {
    case 'intro_arrival':
      return {
        id: 'intro_arrival',
        tone: 'story',
        pauseWorld: false,
        beats: [
          {
            title: 'Step 1: Chop Wood',
            icon: 'work',
            text: 'Drag an adult onto the circled tree to gather 4 Wood.',
            focus: nearestTree?.position || campPos,
            zoom: 2.55,
            beaconLabel: 'Drop Adult Here',
            dragFrom: 'adult',
            waitFor: w => w.state.resources.wood >= 4
              || Boolean(w.state.worldFlags.light_campfire)
              || w.state.villagers.some(v => v.work?.job === 'chop'),
          },
          {
            title: 'Step 2: Light the Campfire',
            icon: 'work',
            text: 'With 4 Wood, drop an adult onto the stone campfire ring.',
            focus: campPos,
            zoom: 2.6,
            beaconLabel: 'Light Campfire (4W)',
            dragFrom: 'adult',
            waitFor: w => Boolean(w.state.worldFlags.light_campfire),
          },
          {
            title: 'Step 3: Clear the Spring Next',
            icon: 'build',
            text: 'Gather 5 Stone and drop an adult on this blocked spring.',
            focus: springPos,
            zoom: 2.35,
            beaconLabel: 'Next: Spring (5S)',
          },
        ],
      };

    case 'first_illness': {
      const v = payload?.villager || world.state.villagers[0];
      const name = v?.name || 'A villager';
      const pos = v?.position ? { ...v.position } : villagePos;
      const beats = [];
      if (!world.state.abilities.heal) {
        beats.push({
          title: `${name} Is Sick — Learn Healing`,
          icon: 'health',
          text: 'Open Research and unlock Healing (10 Knowledge).',
          focus: pos,
          zoom: STORY_CONFIG.villagerSpotlightZoom,
          beaconLabel: `${name} — Sick!`,
          action: { label: 'Open Research', type: 'open-menu', arg: 'research' },
          waitFor: w => Boolean(w.state.abilities.heal),
        });
      }
      beats.push({
        title: `Heal ${name}`,
        icon: 'sick',
        text: `Drag a healthy adult directly onto ${name} to cure them!`,
        focus: pos,
        followVillagerId: v?.id || null,
        zoom: STORY_CONFIG.villagerSpotlightZoom,
        beaconLabel: `Drop Healer on ${name}`,
        dragFrom: 'healthy_adult',
        excludeId: v?.id || null,
        waitFor: w => {
          const target = w.state.villagers.find(m => m.id === v?.id);
          return !target || (!target.illness && target.needs.health >= 75);
        },
      });
      return {
        id: 'first_illness',
        tone: 'danger',
        pauseWorld: false,
        beats,
      };
    }

    case 'first_sickness_death': {
      const grave = payload?.grave;
      const name = grave?.name || payload?.villager?.name || 'A villager';
      const pos = grave?.position || payload?.villager?.position || villagePos;
      return {
        id: 'first_sickness_death',
        tone: 'danger',
        pauseWorld: false,
        beats: [
          {
            title: `${name} Died of Sickness`,
            icon: 'danger',
            text: 'Drop a villager on the cairn to pay respects. Keep Healing ready.',
            focus: pos,
            zoom: STORY_CONFIG.villagerSpotlightZoom,
            beaconLabel: `Pay Respects (${name})`,
            dragFrom: 'any',
            action: world.state.abilities.heal
              ? { label: 'Build Healing Hut', type: 'open-menu', arg: 'buildings' }
              : { label: 'Learn Healing', type: 'open-menu', arg: 'research' },
            waitFor: w => (w.state.graves?.find(g => g.id === grave?.id)?.tendedCount ?? 0) > 0,
          },
        ],
      };
    }

    case 'first_starvation_death': {
      const grave = payload?.grave;
      const name = grave?.name || payload?.villager?.name || 'A villager';
      const foodSource = findNearestResource(world, 'food');
      return {
        id: 'first_starvation_death',
        tone: 'danger',
        pauseWorld: false,
        beats: [
          {
            title: `${name} Starved — Gather Food!`,
            icon: 'hunger',
            text: 'Food hit 0! Drag a villager onto this food source immediately.',
            focus: foodSource?.position || campPos,
            zoom: 2.55,
            beaconLabel: 'Gather Food Now!',
            dragFrom: 'any',
            waitFor: w => w.state.resources.food >= 4,
          },
        ],
      };
    }

    case 'first_old_age_death': {
      const grave = payload?.grave;
      const name = grave?.name || payload?.villager?.name || 'An elder';
      const age = grave?.age || payload?.villager?.age || 90;
      const pos = grave?.position || payload?.villager?.position || villagePos;
      return {
        id: 'first_old_age_death',
        tone: 'milestone',
        pauseWorld: true,
        beats: [
          {
            title: `${name} Passed at Age ${age}`,
            icon: 'info',
            text: 'Drop a villager at the cairn to pay respects. Build a Family House for new children.',
            focus: pos,
            zoom: 2.7,
            beaconLabel: `${name}'s Cairn`,
            action: { label: 'Open Buildings', type: 'open-menu', arg: 'buildings' },
          },
        ],
      };
    }

    case 'first_birth': {
      const baby = payload?.baby;
      const babyName = baby?.name || 'a newborn';
      const pos = baby?.position ? { ...baby.position } : villagePos;
      return {
        id: 'first_birth',
        tone: 'milestone',
        pauseWorld: true,
        beats: [
          {
            title: `Welcome, Baby ${babyName}!`,
            icon: 'love',
            text: 'A parent carries the newborn for 30s. Keep Food stocked as they grow!',
            focus: pos,
            zoom: STORY_CONFIG.villagerSpotlightZoom,
            beaconLabel: `Baby ${babyName}`,
            action: baby ? { label: `View ${babyName}`, type: 'select-villager', arg: baby.id } : null,
          },
        ],
      };
    }

    case 'landmark_reveal': {
      const puzzleId = payload?.puzzleId;
      const reveal = NEXT_LANDMARK_REVEALS[puzzleId];
      if (!reveal) return null;
      const donePos = landmarkAnchor(world, puzzleId);
      const beats = [
        {
          title: reveal.doneTitle,
          icon: 'check',
          text: reveal.doneText,
          focus: donePos,
          zoom: 2.55,
          beaconLabel: reveal.doneTitle,
        },
      ];
      if (reveal.nextLandmarkId) {
        beats.push({
          title: reveal.nextTitle,
          icon: 'curious',
          text: reveal.nextText,
          focus: landmarkAnchor(world, reveal.nextLandmarkId),
          zoom: 2.45,
          beaconLabel: landmarks[reveal.nextLandmarkId]?.label || reveal.nextTitle,
        });
      } else {
        beats.push({
          title: reveal.nextTitle,
          icon: 'trophy',
          text: reveal.nextText,
          focus: monumentPos,
          zoom: 2.2,
          beaconLabel: 'Island Restored!',
          action: { label: 'Open Challenges', type: 'open-menu', arg: 'achievements' },
        });
      }
      return { id: `landmark_${puzzleId}`, tone: 'milestone', pauseWorld: true, beats };
    }

    case 'feature_research': {
      const abilityId = payload?.abilityId;
      const info = RESEARCH_GUIDE_BEATS[abilityId];
      if (!info) return null;
      const focus = abilityId === 'farm' ? findFarmAnchor(world)
        : abilityId === 'fish' ? findFishingAnchor(world)
        : abilityId === 'advanced_construction' ? landmarkAnchor(world, 'repair_bridge')
        : abilityId === 'ancient_knowledge' ? landmarkAnchor(world, 'open_waterfall_passage')
        : (world.state.villagers.find(v => v.illness || v.needs.health < 70)?.position || campPos);
      return {
        id: `guide_research_${abilityId}`,
        tone: 'guide',
        pauseWorld: false,
        beats: [
          {
            title: info.title,
            icon: info.icon,
            text: info.text,
            focus,
            zoom: 2.5,
            beaconLabel: info.title.replace(' Unlocked', ''),
            dragFrom: info.dragFrom,
          },
        ],
      };
    }

    case 'first_collectible': {
      const asset = payload?.assetId ? world.assets.registry.get(payload.assetId) : null;
      const name = asset?.name || 'a rare find';
      return {
        id: 'first_collectible',
        tone: 'guide',
        pauseWorld: false,
        beats: [
          {
            title: `Found: ${name}`,
            icon: 'discovery',
            text: 'Logged in your Collection Book! 24 more rare finds await across the island.',
            focus: payload?.position || villagePos,
            zoom: 2.6,
            action: { label: 'Collection Book', type: 'open-menu', arg: 'collection' },
          },
        ],
      };
    }

    case 'colony_lost':
      return {
        id: 'colony_lost',
        tone: 'danger',
        pauseWorld: true,
        colonyLost: true,
        beats: [
          {
            title: 'Colony Lost',
            icon: 'danger',
            text: 'Every castaway perished. Wipe and start fresh with Healing and Food ready.',
            focus: world.state.graves?.[world.state.graves.length - 1]?.position || campPos,
            zoom: 2.0,
          },
        ],
      };

    default:
      return null;
  }
}

export function getResearchMeta(id) {
  return researchProjects[id] || null;
}
