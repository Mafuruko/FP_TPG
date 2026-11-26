import { describeInteraction } from './assets.js';
import { sampleWeather } from './climate.js';
import { findRoute, neighbors, tileToWorld, walkable, worldToTile } from './geometry.js';
import { emitGroundDust, groundContact, groundPosition, villagerGroundTuning } from './ground.js';
import { construction, costLabel, landmarks, researchProjects } from './progression.js';
import { initializeVillagerProgress, initializeVillagerQuirks, jobSkill, promoteToChampion, skillBenefits, skillForJob,
  skillProgress, villagerSkills, villagerWorkTuning as tuning } from './villagers.js';
import { moveVillager, previewPlacement, villagerNavigationTile } from './world.js';
import { ensureStoryState, evaluateAchievementsAndChallenges, getSurvivalStage, STORY_CONFIG } from './story.js';
import { dailyFood, foodPerDay, foodSecurity, foodUse, illnessSeverity, initializeSurvival, phaseDuration, sourceCapacity, survival,
  treatmentEffects } from './survival.js';

const stages = ['foundation', 'p25', 'p50', 'p75', 'completed'];
const springLayout = 4;
const labels = {
  gather: 'Gathering food', chop: 'Cutting wood', mine: 'Gathering stone', build: 'Building',
  research: 'Researching', farm: 'Tending crops', fish: 'Fishing', heal: 'Healing',
  investigate: 'Investigating', family: 'Spending time together', collect: 'Collecting',
  mourn: 'Paying respects',
};
const reusableJobs = new Set(['gather', 'chop', 'mine', 'research', 'farm', 'fish']);
const jobAnimations = { family: 'talk', collect: 'gather', mourn: 'sit' };
const holding = { food: 'berries', wood: 'log', stone: 'stone' };
const restReasons = { gather: 'gathering', chop: 'woodcutting', mine: 'gathering stone', build: 'building',
  research: 'researching', farm: 'farming', fish: 'fishing' };
const dropActions = {
  gather: ['Gather Food', 'resource_berries'], chop: ['Chop Wood', 'resource_wood_log'],
  mine: ['Mine Stone', 'resource_stone'], fish: ['Fish', 'resource_fish_small'],
  farm: ['Tend Crops', 'icon_work'], build: ['Build', 'icon_build'], research: ['Research', 'icon_research'],
  heal: ['Heal', 'icon_health'], family: ['Spend Time Together', 'icon_love'],
  investigate: ['Investigate', 'icon_curious'], collect: ['Collect', 'icon_discovery'],
  mourn: ['Pay Respects', 'icon_love'],
};
const travelNames = {
  berry_bush: 'berry bush', palm_tree: 'palm', tree: 'tree', harvestable_rock: 'stone deposit',
  fishing_spot: 'fishing spot', campfire_site: 'campfire', spring: 'spring', cave_entrance: 'cave',
  waterfall: 'waterfall', garden: 'garden', bridge: 'bridge', monument: 'monument',
};

export function startGameplay(world) {
  const { state, map, assets, resources } = world;
  const { tileSize } = map.meta;
  const reveals = world.collectibleReveals = new Map();
  const listeners = new Set();
  const eventListeners = new Set();
  const camp = map.objects.find(object => object.type === 'campfire_site');
  const story = ensureStoryState(state);
  state.simulation ??= {
    nextNeeds: survival.mealInterval,
    nextCollectible: 8,
    nextIllness: survival.illnessCadence,
    nextVillager: 6,
  };
  const clock = state.simulation;
  initializeSurvival(state);
  let revision = 0;
  let reachableCollectibleTiles;
  const previewRoutes = new Map();
  let previewOrigin;
  let diagnosticsEnabled = false;
  const diagnostics = new Map();

  function track(villager, measure, amount = 1) {
    if (!diagnosticsEnabled) return;
    if (!diagnostics.has(villager.id)) diagnostics.set(villager.id, {});
    const record = diagnostics.get(villager.id);
    record[measure] = (record[measure] ?? 0) + amount;
  }

  function awardWork(villager, job, xp = 1) {
    const skill = skillForJob(job);
    if (!skill || xp <= 0) return;
    const before = skillProgress(villager, skill);
    villager.skills[job] = (villager.skills[job] || 0) + xp;
    track(villager, `XP · ${skill}`, xp);
    const after = skillProgress(villager, skill);
    if (before.tier === after.tier && before.level === after.level) return;
    track(villager, 'Skill levels gained', before.tier === after.tier ? after.level - before.level : 1);
    const name = villagerSkills[skill].label;
    if (before.tier !== after.tier) {
      announce(`${villager.name} reached ${after.rank.name} ${name}. ${skillBenefits(skill, after.rank)}.`);
      villager.reaction = { icon: 'skillup', expression: 'happy', until: state.time.seconds + 2 };
    } else {
      villager.reaction = { icon: 'skillup', until: state.time.seconds + 0.9 };
    }
  }

  function announce(message) {
    revision++;
    for (const listener of listeners) listener(message);
  }

  function emitEvent(type, payload = {}) {
    revision++;
    const event = { type, ...payload };
    for (const listener of eventListeners) listener(event);
  }

  function checkAchievements() {
    const unlocked = evaluateAchievementsAndChallenges(world);
    for (const item of unlocked) {
      const rewardNote = item.reward ? ` — ${item.reward}!` : '!';
      announce(`${item.isChallenge ? 'Challenge Complete' : 'Achievement Unlocked'}: ${item.title}${rewardNote}`);
      emitEvent('achievement', { achievement: item });
    }
    return unlocked;
  }

  function pay(cost = {}) {
    if (!resources.canAfford(cost)) return false;
    for (const [key, value] of Object.entries(cost)) resources.remove(key, value);
    return true;
  }

  function buildingAsset(building) {
    return assets.registry.get(`building:${building.type}_${building.state}`);
  }

  function buildingPoints(building) {
    return buildingAsset(building).metadata.interactionPoints.map(point => ({
      x: building.tile.x + point.x, y: building.tile.y + point.y, facing: point.facing,
    }));
  }

  function completeBuilding(type) {
    return state.buildings.find(building => building.type === type && building.state === 'completed');
  }

  function refreshCollision() {
    map.collisionGrid.forEach((row, y) => row.forEach((value, x) => { world.collision[y][x] = value; }));
    if (state.worldFlags.repair_bridge) for (const { x, y } of map.bridge.footprint) world.collision[y][x] = 0;
    if (state.worldFlags.light_cave) world.collision[23][18] = 0;
    if (state.worldFlags.open_waterfall_passage) world.collision[14][37] = 0;
    for (const building of state.buildings) {
      for (const [x, y] of buildingAsset(building).metadata.collisionTiles) {
        world.collision[building.tile.y + y][building.tile.x + x] = 1;
      }
    }
    reachableCollectibleTiles = null;
    previewRoutes.clear();
  }

  function place(type, tile) {
    const cost = construction[type];
    if (!cost) return 'This building is awarded or unavailable in the current village.';
    const definition = assets.buildings.find(building => building.type === type);
    const preview = previewPlacement(world, definition, tile);
    if (!preview?.allowed) return 'Choose an open footprint in the village clearing.';
    const key = point => `${point.x},${point.y}`;
    const footprint = new Set(preview.tiles.map(key));
    if (state.villagers.some(villager => [villager.tile, ...villager.route].some(point => footprint.has(key(point))))) {
      return 'Wait until the villagers have cleared that footprint.';
    }
    const site = { id: `site_${state.buildings.length + 1}`, type, tile, state: 'foundation', progress: 0 };
    const collision = world.collision.map(row => row.slice());
    for (const point of preview.tiles) collision[point.y][point.x] = 1;
    const points = buildingPoints(site);
    if (!state.villagers.some(villager => findRoute(collision, villager.tile, points))) return 'Leave a clear path to the entrance.';
    if (!pay(cost)) return `You need ${costLabel(cost)}.`;
    state.buildings.push(site);
    refreshCollision();
    announce('Foundation placed. Drop a villager on it to start building.');
    return null;
  }

  function research(id) {
    const project = researchProjects[id];
    if (!project || state.abilities[id]) return 'That ability is already available.';
    if (project.flag && !state.worldFlags[project.flag]) return project.hint;
    if (!pay({ knowledge: project.cost })) return `You need ${project.cost} Knowledge.`;
    state.abilities[id] = true;
    announce(`Learned ${id.replaceAll('_', ' ')}.`);
    emitEvent('research', { abilityId: id });
    checkAchievements();
    return null;
  }

  function puzzleBlocked(puzzle) {
    return (puzzle.ability && !state.abilities[puzzle.ability])
      || puzzle.flags?.some(flag => !state.worldFlags[flag])
      || !resources.canAfford(puzzle.cost || {});
  }

  function memberPoints(target) {
    const facings = ['left', 'right', 'up', 'down'];
    return neighbors.map((offset, i) => ({
      x: target.tile.x + offset.x, y: target.tile.y + offset.y, facing: facings[i],
    })).filter(point => walkable(world.collision, point));
  }

  function familyIssue(a, b) {
    if (a.lifeStage !== 'adult' || b.lifeStage !== 'adult') return 'Only adults can start a family.';
    if (a.sex === b.sex) return 'Starting a family needs a male and female adult.';
    const relatives = member => new Set([member.id, ...(member.relationships.parents || []).flatMap(id =>
      [id, ...(state.villagers.find(person => person.id === id)?.relationships.parents
        || state.graves.find(grave => grave.villagerId === id)?.family?.parents || [])])]);
    const aFamily = relatives(a);
    if ([...relatives(b)].some(id => aFamily.has(id))) return 'Close relatives cannot become partners.';
    if ((a.relationships.partner && a.relationships.partner !== b.id)
      || (b.relationships.partner && b.relationships.partner !== a.id)) return 'One of these villagers already has a partner.';
    if (a.illness || b.illness || a.needs.health < 75 || b.needs.health < 75
      || a.needs.hunger < 40 || b.needs.hunger < 40) return 'Both adults need to be healthy and fed first.';
    return null;
  }

  function familyOptions(a, b) {
    const issue = familyIssue(a, b);
    const familiarity = a.relationships.bonds?.[b.id]?.points || 0;
    if (issue) return { issue, familiarity };
    const partners = a.relationships.partner === b.id && b.relationships.partner === a.id;
    if (!partners && familiarity < survival.familiarityReady) {
      return { label: 'Spend Time Together', familiarity };
    }
    if (!completeBuilding('family_house')) return { issue: 'Build a Family House first.', familiarity, partners };
    const reserved = state.villagers.filter(member => member.pregnancy).length;
    if (a.pregnancy || b.pregnancy) return { issue: 'This family is expecting a baby.', familiarity, partners };
    if (state.villagers.length + reserved >= state.world.populationCapacity) return { issue: 'Build more housing first.', familiarity, partners };
    if (!partners) return { label: 'Become Partners', familiarity, partners };
    if (Math.max(a.familyAfter || 0, b.familyAfter || 0) > state.time.seconds) {
      return { issue: 'Give this family some time after the birth.', familiarity, partners };
    }
    const extra = foodPerDay(survival.hungerUse.baby + survival.pregnancyFood);
    const reserve = Math.ceil((dailyFood(state) + extra) * survival.familyReserve);
    return resources.get('food') >= reserve ? { label: 'Plan a Baby', reserve, familiarity, partners }
      : { issue: `Store ${reserve} Food to prepare for a baby.`, reserve, familiarity, partners };
  }

  function plan(target, villager, continuingJob) {
    const kind = target.kind;
    if (kind === 'villager') {
      if (target.id === villager.id) return { error: 'Choose another villager.' };
      if (target.id === world.heldVillager) return { error: 'This villager is being carried.' };
      if (target.illness || target.needs.health < (continuingJob === 'heal' ? 100 : 75)) {
        return state.abilities.heal ? { job: 'heal', points: memberPoints(target) } : { error: 'Learn Healing in Research first.' };
      }
      if (target.work?.manual && target.work.job !== 'family' || target.currentTask?.manual) {
        return { error: 'Let this villager finish their current order or give them a break first.' };
      }
      const { issue, label } = familyOptions(villager, target);
      return issue ? { error: issue } : { job: 'family', label, points: memberPoints(target) };
    }
    if (kind === 'grave') {
      return { job: 'mourn', points: mapFacingTile(target.tile), animation: 'sit' };
    }
    if (kind === 'collectible') {
      const asset = assets.registry.get(target.assetId);
      if (!asset.interaction.eligibleLifeStages.includes(villager.lifeStage)) return { error: 'Choose a villager of a different age for this find.' };
      const points = mapFacingTile(target.tile);
      const grab = assets.villager.animations.collectGrab ? 'collectGrab' : 'gather';
      return { job: 'collect', points, animation: asset.category === 'butterfly' ? 'catch' : grab };
    }
    if (kind === 'building') {
      const points = buildingPoints(target);
      if (target.state !== 'completed') return { job: 'build', points };
      if (target.type === 'research_hut') return { job: 'research', points };
      if (target.type === 'family_house') return { error: 'Drop one adult onto another to start a family.' };
      return { error: 'This building is complete.' };
    }
    if (target.puzzleId) {
      const puzzle = landmarks[target.puzzleId];
      if (!state.worldFlags[target.puzzleId]) {
        return puzzleBlocked(puzzle) ? { error: puzzle.hint }
          : { job: puzzle.job, points: target.interactionPoints, label: puzzle.dropLabel };
      }
      return target.id === camp.id ? { job: 'research', points: camp.interactionPoints } : { error: 'This landmark has been restored.' };
    }
    if (kind === 'crop') {
      if (!state.abilities.farm) return { error: 'Learn Farming in Research first.' };
      if (reservedHaul(target.id)) return { error: 'This harvest is on its way to storage.' };
      if (target.growthAt > state.time.seconds) return { error: 'This plot is growing. Tend or harvest it when it is ready.' };
      return { job: 'farm', points: [target.tile] };
    }
    const interaction = describeInteraction(target, assets);
    if (interaction.ability && !state.abilities[interaction.ability]) return { error: `Learn ${interaction.ability === 'fish' ? 'Fishing' : interaction.ability} in Research first.` };
    if (target.requires?.includes('bridge_repaired') && !state.worldFlags.repair_bridge) return { error: 'Repair the bridge to reach this fishing spot.' };
    if (target.requires?.includes('fishing_level_2') && (villager.skills.fish || 0) < 3) return { error: 'Try a shallower fishing spot to train first.' };
    if (interaction.type !== 'inspect') {
      if (world.state.objects[target.id]?.amount === 0) return { error: 'This source is empty.' };
      if (interaction.counter && availableSupply(target.id) === 0) return { error: 'The remaining supplies are being hauled.' };
      return { job: interaction.type, points: interaction.positions, counter: interaction.counter };
    }
    return { points: interaction.positions };
  }

  function mapFacingTile(tile) {
    return [tile, ...memberPoints({ tile })];
  }

  function getTarget(ref) {
    const lookup = {
      building: state.buildings, villager: state.villagers, collectible: state.activeCollectibles,
      crop: state.crops, grave: state.graves,
    };
    const found = ref.kind === 'object' ? world.objects.get(ref.id) : lookup[ref.kind]?.find(target => target.id === ref.id);
    return found && { ...found, kind: ref.kind };
  }

  function assignmentIssue(villager, action) {
    if (action.error) return action.error;
    if (villager.lifeStage === 'baby' || (villager.lifeStage === 'child'
      && action.job && !['gather', 'collect', 'fish', 'mourn'].includes(action.job))) return 'This villager is too young for that job.';
    if (villager.carryingBaby && action.job && !survival.newbornJobs.has(action.job)) return 'This caregiver can only do light work while carrying a newborn.';
    if (action.job && (villager.needs.health < 30 || illnessSeverity(villager) === 'critical')) return 'This villager needs care before working.';
    if (action.job === 'heal' && (villager.illness || villager.needs.health < 65)) return 'Choose a healthy adult to provide treatment.';
    return null;
  }

  function interaction(villager, ref, continuingJob) {
    const target = getTarget(ref);
    if (!target) return { issue: ref.kind === 'collectible' && ref.id.startsWith('preview_')
      ? 'This find is a developer preview.' : 'That target is no longer available.' };
    const storage = target.kind === 'building' && target.type === 'food_storage' && target.state === 'completed';
    if (villager.work?.phase === 'deliver' && (target.id === camp.id || storage)) {
      const points = storage ? buildingPoints(target) : camp.interactionPoints;
      return { target, delivery: true, action: { points, label: 'Deliver Supplies', icon: 'icon_done' } };
    }
    const action = plan(target, villager, continuingJob);
    return { target, action, issue: assignmentIssue(villager, action) };
  }

  function actionFeedback(action) {
    const [label, icon] = dropActions[action.job] || [];
    return { label: action.label ?? label, icon: action.icon ?? icon };
  }

  function travelLabel(target) {
    const name = target.name || travelNames[target.type]
      || (target.kind === 'building' && buildingAsset(target).metadata.name)
      || (target.kind === 'collectible' && assets.registry.get(target.assetId).name)
      || target.cropType || target.type?.replaceAll('_', ' ') || 'target';
    return `Going to ${name}`;
  }

  function setAssignment(villager, target, ref, action, remember) {
    reveals.delete(villager.id);
    endConversation(villager);
    villager.appearance.heldObject = 'none';
    villager.retryAt = 0;
    villager.leisure = null;
    villager.workBreak = false;
    villager.resting = null;
    villager.snakeFlee = false;
    if (remember || villager.reaction?.icon !== 'skillup' || villager.reaction.until <= state.time.seconds) villager.reaction = null;
    villager.work = action.job ? {
      ref, job: action.job, phase: 'approach', counter: action.counter, animation: action.animation,
      manual: remember, walkLabel: travelLabel(target),
      workLabel: action.job === 'family' ? action.label : target.type === 'berry_bush' ? 'Gathering berries' : labels[action.job],
    } : null;
    const repeatable = reusableJobs.has(action.job) && (!target.puzzleId || target.id === camp.id && action.job === 'research');
    const routine = repeatable ? { ref, job: action.job, counter: action.counter } : null;
    if (remember) {
      villager.preferredJob = villager.workPreference === 'rest' ? null : routine;
      villager.routine = null;
    } else if (!villager.preferredJob) villager.routine = routine;
  }

  function assign(villager, ref, remember = true) {
    const { target, action, issue, delivery } = interaction(villager, ref);
    if (issue) return issue;
    if (!moveVillager(world, villager, action.points || [], ref.id)) return 'No reachable interaction point.';
    delete villager.holdStillUntil;
    if (delivery) {
      villager.work.manual = remember;
      villager.activity = 'Carrying supplies';
      if (villager.route.length) villager.animation = 'carry';
      return null;
    }
    setAssignment(villager, target, ref, action, remember);
    track(villager, remember ? 'Manual assignments' : 'Autonomous assignments');
    if (villager.currentTask) villager.currentTask.manual = remember;
    villager.activity = villager.route.length ? travelLabel(target) : 'Idle';
    if (villager.route.length) villager.animation = villager.lifeStage === 'baby' ? 'crawl' : 'walk';
    return null;
  }

  function canReach(villager, point, cached) {
    if (!walkable(world.collision, point)) return false;
    const start = villagerNavigationTile(world, villager);
    if (!cached) return Boolean(findRoute(world.collision, start, [point]));
    const origin = `${start.x},${start.y}`;
    if (origin !== previewOrigin || previewRoutes.size >= 64) {
      previewOrigin = origin;
      previewRoutes.clear();
    }
    const key = `${point.x},${point.y}`;
    if (!previewRoutes.has(key)) previewRoutes.set(key, Boolean(findRoute(world.collision, start, [point])));
    return previewRoutes.get(key);
  }

  function inspectTarget(villager, ref, preview = true) {
    const { target, action, issue } = interaction(villager, ref);
    if (issue) return { issue };
    if (preview && !action.points?.some(point => canReach(villager, point, true))) return { issue: 'No reachable interaction point.' };
    return { target, ...actionFeedback(action) };
  }

  function land(villager, tile) {
    reveals.delete(villager.id);
    endConversation(villager);
    delete villager.holdStillUntil;
    villager.tile = { x: tile.x, y: tile.y };
    villager.position = tileToWorld(tile, tileSize);
    villager.route = [];
    villager.currentTask = null;
    villager.previousStep = null;
    villager.appearance.heldObject = 'none';
    villager.work = null;
    villager.animation = 'idle';
    villager.activity = 'Idle';
    villager.retryAt = state.time.seconds + 2;
    villager.leisure = null;
    villager.workBreak = false;
    villager.resting = null;
    villager.snakeFlee = false;
    villager.reaction = null;
    const ground = groundContact(villager);
    ground.x = ground.y = ground.vx = ground.vy = 0;
    villager.landedAt = state.time.seconds;
    emitGroundDust(world, villager.position, 0, 0, 4);
    const facing = { up: 'back', down: 'front', left: 'left', right: 'right' };
    if (tile.facing) villager.direction = facing[tile.facing];
  }

  function inspectDrop(villager, tile, ref, preview = false) {
    if (villager.lifeStage === 'baby') return { issue: 'Babies stay with their caregiver or in the nursery.' };
    const { target, action, issue, delivery } = ref ? interaction(villager, ref) : {};
    if (!target) {
      if (ref) return { issue };
      return canReach(villager, tile, preview) ? { tile }
        : { issue: 'Choose reachable ground to put this villager down.' };
    }
    const candidates = action.points || target.interactionPoints
      || (target.kind === 'villager' ? memberPoints(target) : target.kind === 'building' ? buildingPoints(target) : [target.tile || target.standPosition].filter(Boolean));
    const closest = [...candidates].sort((a, b) => distance(a, tile) - distance(b, tile))
      .find(point => canReach(villager, point, preview));
    if (!closest) return { issue: issue || 'No reachable interaction point.' };
    return { tile: closest, target, action, issue, delivery, ...(!issue ? actionFeedback(action) : {}) };
  }

  function drop(villager, tile, ref) {
    const { tile: landing, target, action, issue, delivery } = inspectDrop(villager, tile, ref);
    if (!landing) {
      if (villager.work?.phase === 'deliver' && !villager.route.length) cancelPickup(villager);
      villager.reaction = { icon: 'question', until: state.time.seconds + 0.9 };
      return issue;
    }
    const work = villager.work;
    land(villager, landing);
    if (delivery) {
      villager.work = work;
      deliver(villager);
      return null;
    }
    if (issue || !action?.job) {
      const friendly = !issue && state.villagers.some(member => member !== villager
        && distance(member.tile, villager.tile) <= 1) && villager.appearance.seed % 3 === 0;
      villager.reaction = { icon: friendly ? 'happy' : 'question', until: state.time.seconds + 1.1 };
      return issue ?? null;
    }
    setAssignment(villager, target, ref, action, true);
    track(villager, 'Manual assignments');
    beginWork(villager);
    const curious = villager.quirks.includes('curious');
    const expression = ['chop', 'mine', 'build'].includes(action.job) ? 'focused'
      : curious && ['research', 'investigate'].includes(action.job) ? 'happy'
        : action.job === 'gather' && villager.appearance.seed % 3 !== 0 ? 'happy' : null;
    if (expression) villager.reaction = { expression, until: state.time.seconds + 0.8 };
    return null;
  }

  function stop(villager) {
    reveals.delete(villager.id);
    endConversation(villager);
    villager.work = null;
    villager.preferredJob = null;
    villager.routine = null;
    villager.workBreak = false;
    villager.resting = null;
    villager.snakeFlee = false;
    villager.reaction = null;
    villager.appearance.heldObject = 'none';
    villager.activity = 'Idle';
    villager.leisure = null;
    if (!villager.route.length) villager.animation = 'idle';
  }

  function move(villager, tile) {
    if (villager.lifeStage === 'baby') return 'Babies stay with their caregiver or in the nursery.';
    if (!moveVillager(world, villager, [tile])) return 'That tile is blocked or unreachable.';
    delete villager.holdStillUntil;
    stop(villager);
    if (villager.currentTask) villager.currentTask.manual = true;
    if (villager.route.length) {
      villager.activity = 'Walking';
      villager.animation = villager.lifeStage === 'baby' ? 'crawl' : 'walk';
    }
    return null;
  }

  function clearRoute(villager) {
    const tile = worldToTile(villager.position, tileSize);
    if (walkable(world.collision, tile)) villager.tile = tile;
    villager.route = [];
    villager.currentTask = null;
    villager.previousStep = null;
  }

  function pickUp(villager) {
    const delivery = villager.work?.phase === 'deliver' ? villager.work : null;
    const held = villager.appearance.heldObject;
    const sleepy = villager.animation === 'sleep';
    clearRoute(villager);
    delete villager.holdStillUntil;
    stop(villager);
    if (delivery) {
      villager.work = delivery;
      villager.appearance.heldObject = held;
    }
    return sleepy;
  }

  function cancelPickup(villager) {
    stop(villager);
    villager.retryAt = state.time.seconds + 2;
  }

  function cancelCommand(villager, issue) {
    const manual = villager.currentTask?.manual || villager.work?.manual;
    const repeat = villager.preferredJob && villager.work?.ref.id === villager.preferredJob.ref.id;
    const { preferredJob, routine } = villager;
    clearRoute(villager);
    stop(villager);
    if (repeat) Object.assign(villager, { preferredJob, routine });
    villager.retryAt = state.time.seconds + tuning.retrySeconds;
    track(villager, 'Unavailable commands');
    if (manual) {
      villager.activity = issue;
      announce(`${villager.name}: ${issue}`);
    }
  }

  function prepareMovement(villager) {
    const { work, currentTask } = villager;
    const blocked = !walkable(world.collision, villager.route[0]);
    let approach;
    if (!villager.resting && work?.phase === 'approach' && (blocked || !(work.checkAt > state.time.seconds))) {
      work.checkAt = state.time.seconds + 0.25;
      approach = interaction(villager, work.ref, work.job);
      if (approach.issue || approach.action.job !== work.job) {
        cancelCommand(villager, approach.issue || 'That task is no longer available.');
        return;
      }
      const destination = villager.route.at(-1);
      if (approach.action.points.some(point => point.x === destination.x && point.y === destination.y) && !blocked) return;
      if (work.ref.kind === 'villager' && !allowMovingTargetRetry(villager)) return;
    } else if (!blocked) return;
    track(villager, 'Repaths');
    const destinations = approach ? approach.action.points : work?.phase === 'deliver' ? deliveryPoints()
      : [currentTask?.destination || villager.route.at(-1)];
    if (!moveVillager(world, villager, destinations, currentTask?.targetId)) {
      if (villager.resting) {
        clearRoute(villager);
        villager.resting.sheltered = false;
      } else cancelCommand(villager, 'Cannot reach the destination.');
    } else if (villager.currentTask) {
      villager.currentTask.manual = currentTask?.manual;
      if (!approach) villager.currentTask.facing = currentTask?.facing ?? null;
    }
  }

  function allowMovingTargetRetry(villager) {
    villager.work.repaths = (villager.work.repaths ?? 0) + 1;
    if (villager.work.repaths <= 8) return true;
    cancelCommand(villager, 'The villager moved away.');
    return false;
  }

  function holdStill(villager, duration = STORY_CONFIG.holdStillDurationSec) {
    if (!villager) return false;
    clearRoute(villager);
    endConversation(villager);
    villager.leisure = null;
    villager.animation = 'idle';
    villager.activity = `Hold Position (${Math.ceil(duration)}s)`;
    villager.holdStillUntil = state.time.seconds + duration;
    const contact = groundContact(villager);
    contact.x = contact.y = contact.vx = contact.vy = 0;
    revision++;
    return true;
  }

  function releaseHold(villager) {
    delete villager.holdStillUntil;
    villager.retryAt = state.time.seconds;
    if (villager.work?.phase === 'deliver' && !moveVillager(world, villager, deliveryPoints())) {
      cancelCommand(villager, 'Cannot reach storage.');
    }
    if (!villager.route.length) villager.activity = 'Idle';
  }

  function setWorkPreference(villager, preference) {
    if (!['auto', 'rest'].includes(preference) && !Object.hasOwn(villagerSkills, preference)) return false;
    clearRoute(villager);
    stop(villager);
    delete villager.holdStillUntil;
    villager.workPreference = preference;
    villager.retryAt = state.time.seconds;
    villager.activity = preference === 'rest' ? 'Taking it easy' : 'Looking for work';
    revision++;
    return true;
  }

  function promoteChampion(villagerId) {
    if (!state.achievements.challenge_speedrun) return 'Complete the Speedrun Legend challenge (<100 days) first.';
    if (state.challenges?.championVillagerId) return 'A village Champion has already been promoted.';
    const villager = state.villagers.find(v => v.id === villagerId);
    if (!villager) return 'Choose a living villager to promote.';
    promoteToChampion(villager);
    state.challenges.championVillagerId = villager.id;
    announce(`${villager.name} ascended as Island Champion — Max Stats & 10x Speed!`);
    emitEvent('challenge_reward', { challengeId: 'challenge_speedrun', villager });
    return null;
  }

  function applyPuzzle(target, villager) {
    const { puzzleId } = target;
    const puzzle = landmarks[puzzleId];
    if (state.worldFlags[puzzleId] || puzzleBlocked(puzzle) || !pay(puzzle.cost)) return;
    state.worldFlags[puzzleId] = true;
    state.objects[target.id].state = puzzle.state;
    state.objects[target.id].art = puzzle.art;
    if (puzzleId === 'light_campfire') story.campLitAt ??= state.time.seconds;
    if (puzzleId === 'unblock_spring') {
      state.crops = map.farmingZones[0].tiles.filter((_, index) => index % 9 === 0).slice(0, 8)
        .map(([x, y], index) => ({ id: `crop_${index}`, tile: { x, y }, cropType: map.farmingZones[0].cropTypes[index % 5], stage: 0 }));
    }
    if (puzzleId === 'restore_monument') state.achievements.island_restored = true;
    refreshCollision();
    announce(puzzleId === 'repair_bridge' ? 'The bridge is open. Explore the eastern island.'
      : puzzleId === 'restore_monument' ? 'The ancient monument is restored. Your village can keep growing.'
        : `${villager.name} finished: ${puzzle.label}.`);
    emitEvent('landmark', { puzzleId, villager, object: target });
    checkAchievements();
    return true;
  }

  function updateSpringLayout() {
    if (state.world.springLayout === springLayout) return;
    const spring = map.objects.find(object => object.type === 'spring');
    const restored = state.worldFlags[spring.puzzleId];
    const springState = restored ? 'clear' : 'blocked';
    Object.assign(state.objects[spring.id], { state: springState, art: spring.states[springState] });

    const { tile, footprint } = spring;
    const covers = point => point.x >= tile.x && point.x < tile.x + footprint.width
      && point.y <= tile.y && point.y > tile.y - footprint.height;
    const banks = spring.interactionPoints.filter(point => walkable(world.collision, point));
    function relocate(entity) {
      if (!covers(entity.tile) && (!entity.position || !covers(worldToTile(entity.position, tileSize)))) return false;
      const bank = banks.reduce((nearest, point) =>
        distance(entity.tile, point) < distance(entity.tile, nearest) ? point : nearest);
      entity.tile = { x: bank.x, y: bank.y };
      entity.position = tileToWorld(bank, tileSize);
      return true;
    }

    for (const item of [...(state.activeCollectibles ?? []), ...state.graves]) relocate(item);
    for (const villager of state.villagers) {
      const relocated = relocate(villager);
      if (relocated) {
        villager.previousStep = null;
        const contact = groundContact(villager);
        contact.x = contact.y = contact.vx = contact.vy = 0;
      }
      const springJob = villager.work?.ref?.id === spring.id;
      const destination = villager.route.at(-1);
      if (springJob) {
        if (!restored && moveVillager(world, villager, banks, spring.id)) {
          villager.work.phase = 'approach';
          continue;
        }
      } else {
        if (!destination || (!relocated && !villager.route.some(covers))) continue;
        const task = villager.currentTask;
        if (moveVillager(world, villager, [destination], task?.targetId)) {
          if (villager.currentTask) villager.currentTask.facing = task?.facing ?? null;
          continue;
        }
      }
      villager.route = [];
      villager.currentTask = null;
      villager.work = null;
      villager.appearance.heldObject = 'none';
      villager.animation = 'idle';
      villager.activity = 'Idle';
    }
    state.world.springLayout = springLayout;
  }

  function build(target) {
    const site = state.buildings.find(building => building.id === target.id);
    if (site.state === 'completed') return false;
    site.progress++;
    site.state = stages[site.progress];
    if (site.state !== 'completed') return true;
    if (site.type === 'house') state.world.populationCapacity += 3;
    if (site.type === 'family_house') state.world.populationCapacity += 2;
    refreshCollision();
    announce(`${assets.buildings.find(building => building.type === site.type).name} completed.`);
    emitEvent('building', { building: site });
    checkAchievements();
    return false;
  }

  function spawnChild(villager, partner, planned = false) {
    const index = clock.nextVillager++;
    const { name, direction, ...appearance } = assets.generateVillager(8100 + index, { stage: 'baby' });
    const id = `villager_${String(index).padStart(3, '0')}`;
    const familyHome = completeBuilding('family_house');
    const homePoints = familyHome ? buildingPoints(familyHome) : [];
    const nursery = homePoints.find(point => walkable(world.collision, point)) || villager.tile;
    const tile = { ...villagerNavigationTile(world, villager) };
    const parents = [villager.id, partner?.id].filter(Boolean);
    const newborn = {
      id, name, age: 0, lifeStage: 'baby', sex: index % 2 ? 'female' : 'male', appearance, direction, animation: 'idle',
      tile, position: tileToWorld(tile, tileSize), currentTask: null, route: [], preferredJob: null,
      needs: { hunger: 90, energy: 100, health: 100 }, skills: {}, relationships: { parents },
      stageSince: state.time.seconds, stageAge: 0, development: 'carried', caregiverId: villager.id,
      nursery: { ...nursery }, founder: false,
    };
    state.villagers.push(newborn);
    initializeVillagerQuirks(newborn);
    initializeVillagerProgress(newborn);
    for (const parent of [villager, partner].filter(Boolean)) {
      (parent.relationships.children ??= []).push(id);
      if (planned) parent.familyAfter = state.time.seconds + survival.familyCooldown;
      parent.reaction = { icon: 'love', expression: 'happy', until: state.time.seconds + 3 };
    }
    updateCaregivers();
    story.birthCount = (story.birthCount || 0) + 1;
    announce(`${villager.name} and ${partner.name} welcomed ${name}.`);
    emitEvent('birth', { baby: newborn, parents: [villager, partner] });
    return newborn;
  }

  function deepenBond(a, b) {
    if (familyIssue(a, b) || a.relationships.partner === b.id) return false;
    const saved = a.relationships.bonds?.[b.id];
    if (saved?.after > state.time.seconds || saved?.points >= survival.familiarityReady) return false;
    const bond = { points: (saved?.points || 0) + 1, after: state.time.seconds + survival.familiarityCooldown };
    (a.relationships.bonds ??= {})[b.id] = { ...bond };
    (b.relationships.bonds ??= {})[a.id] = { ...bond };
    revision++;
    return true;
  }

  function planFamily(villager, target, action) {
    const partner = state.villagers.find(member => member.id === target.id);
    if (!partner) return;
    const { issue, label } = familyOptions(villager, partner);
    if (issue || action && action !== label) return;
    if (label === 'Spend Time Together') {
      if (deepenBond(villager, partner)) announce(`${villager.name} and ${partner.name} are getting closer.`);
    } else if (label === 'Become Partners') {
      villager.relationships.partner = partner.id;
      partner.relationships.partner = villager.id;
      for (const parent of [villager, partner]) parent.reaction = { icon: 'love', expression: 'happy', until: state.time.seconds + 3 };
      announce(`${villager.name} and ${partner.name} became partners.`);
      revision++;
    } else if (label === 'Plan a Baby') {
      const [mother, otherParent] = villager.sex === 'female' ? [villager, partner] : [partner, villager];
      mother.pregnancy = { partnerId: otherParent.id, startedAt: state.time.seconds, dueAt: state.time.seconds + survival.pregnancySeconds };
      announce(`${mother.name} is expecting a baby.`);
      emitEvent('pregnancy', { villager: mother });
    }
  }

  function settlerOptions() {
    const grown = state.villagers.filter(member => member.lifeStage === 'adult' && member.relationships.parents?.length);
    const available = grown.find(member => !member.relationships.partner);
    if (!story.generationalMilestone && !grown.length) return { issue: 'Welcome settlers after an island-born child reaches adulthood.' };
    const capacity = state.world.populationCapacity - state.villagers.length - state.villagers.filter(member => member.pregnancy).length;
    if (!completeBuilding('family_house') || capacity < 1) return { issue: 'A finished Family House and an open space are needed.' };
    if (clock.nextSettlerAt > state.time.seconds) return { issue: 'The last arrival is still settling in.' };
    const reserve = Math.ceil((dailyFood(state) + foodPerDay(survival.hungerUse.adult)) * survival.familyReserve);
    if (state.resources.food < reserve) return { issue: `Store ${reserve} Food before welcoming a settler.`, reserve };
    return { reserve, sex: available?.sex === 'female' ? 'male' : 'female' };
  }

  function welcomeSettler() {
    const { issue, sex } = settlerOptions();
    if (issue) return issue;
    const index = clock.nextVillager++;
    const id = `villager_${String(index).padStart(3, '0')}`;
    const { name, direction, ...appearance } = assets.generateVillager(13400 + index, { stage: 'adult' });
    const tile = map.villagerSpawns.find(point => walkable(world.collision, point))
      || state.villagers.find(member => member.lifeStage === 'adult').tile;
    const settler = {
      id, name, direction, appearance, sex, age: 22, lifeStage: 'adult', animation: 'idle',
      tile: { ...tile }, position: tileToWorld(tile, tileSize), route: [], currentTask: null, preferredJob: null,
      stageSince: state.time.seconds, stageAge: 22, founder: false, relationships: {}, skills: {},
      needs: { hunger: 85, energy: 95, health: 100 },
    };
    initializeVillagerQuirks(settler);
    initializeVillagerProgress(settler);
    state.villagers.push(settler);
    clock.nextSettlerAt = state.time.seconds + survival.settlerCooldown;
    announce(name + ' arrived on the beach and joined the village.');
    emitEvent('settler', { villager: settler });
    return null;
  }

  function collect(villager, target) {
    const index = state.activeCollectibles.findIndex(item => item.id === target.id);
    if (index < 0) return;
    state.activeCollectibles.splice(index, 1);
    const entry = state.collectionProgress[target.assetId];
    entry.discoveryCount++;
    const firstDiscovery = !entry.discovered;
    if (firstDiscovery) {
      entry.discovered = true;
      entry.firstDiscoveredAt = state.time.day;
    }
    const firstEver = firstDiscovery && Object.values(state.collectionProgress).filter(item => item.discovered).length === 1;
    const asset = assets.registry.get(target.assetId);
    villager.activity = `Showing ${asset.name}`;
    villager.animation = 'idle';
    reveals.set(villager.id, { assetId: asset.id, age: 0, duration: 1.9 });
    if (firstDiscovery) announce(`Discovered ${asset.name}.`);
    emitEvent('collectible', { assetId: asset.id, villagerId: villager.id, position: villager.position, firstEver });
    if (firstDiscovery) checkAchievements();
  }

  function deliveryPoints() {
    return [...camp.interactionPoints, ...state.buildings
      .filter(site => site.type === 'food_storage' && site.state === 'completed')
      .flatMap(buildingPoints)];
  }

  function reservedHaul(id) {
    return state.villagers.reduce((total, { work }) =>
      total + (work?.phase === 'deliver' && work.ref.id === id ? work.haul ?? 0 : 0), 0);
  }

  function availableSupply(id) {
    const amount = state.objects[id]?.amount;
    return Number.isFinite(amount) ? Math.max(0, amount - reservedHaul(id)) : Infinity;
  }

  function haulSize(villager) {
    const { work } = villager;
    const capacity = jobSkill(villager, work.job)?.rank.capacity ?? 2;
    if (work.job === 'farm') {
      const ready = state.crops.some(crop => crop.id === work.ref.id && crop.stage === 3);
      return ready && !reservedHaul(work.ref.id) ? capacity + survival.cropBonus : 0;
    }
    return Math.min(capacity + (work.job === 'fish' ? survival.fishingBonus : 0), availableSupply(work.ref.id));
  }

  function finishWork(villager, target) {
    const { work } = villager;
    const job = work.job;
    const extraEffort = Number(Boolean(villager.pregnancy)) + Number(villager.lifeStage === 'elder' && survival.heavyWork.has(job)) * 2;
    villager.needs.energy = Math.max(0, villager.needs.energy - tuning.cycleEnergy - extraEffort);
    track(villager, `Completed cycles · ${job}`);
    if (target.puzzleId && !state.worldFlags[target.puzzleId]) {
      if (applyPuzzle(target, villager)) awardWork(villager, job);
    } else if (target.kind === 'building' && job === 'build') {
      const continues = build(target);
      track(villager, 'Construction stages');
      awardWork(villager, job);
      if (continues) {
        work.phase = 'approach';
        return;
      }
    } else if (job === 'research') {
      const knowledge = (target.kind === 'building' ? 3 : 2) + jobSkill(villager, job).rank.knowledge;
      resources.add('knowledge', knowledge);
      track(villager, 'Knowledge produced', knowledge);
      awardWork(villager, job);
    } else if (job === 'heal') {
      const patient = state.villagers.find(member => member.id === target.id);
      if (patient) {
        const health = patient.needs.health;
        const treatment = treatmentEffects(jobSkill(villager, job).rank.treatment
          + (completeBuilding('healing_hut') ? survival.healingHutPower : 0));
        const illness = patient.illness;
        if (illness) illness.burden = Math.max(0, illness.burden - treatment.relief);
        patient.needs.health = Math.min(100, health + treatment.recovery);
        const restored = patient.needs.health - health;
        const cured = illness?.burden === 0;
        if (cured) {
          startRecovery(patient);
          story.firstCureDone = true;
          patient.reaction = { icon: 'happy', until: state.time.seconds + 1.8 };
        }
        if (restored > 0 || illness) {
          awardWork(villager, job, Math.ceil(restored / tuning.healXpPerHealth) + (cured ? tuning.healCureXp : 0));
          track(villager, 'Treatments');
          track(villager, 'Health restored', restored);
        }
        if (cured || patient.needs.health === 100) announce(`${villager.name} cared for ${patient.name}.`);
        emitEvent('healed', { villager, patient });
        checkAchievements();
        if (patient.illness || !illness && patient.needs.health < 100) {
          work.phase = 'approach';
          return;
        }
      }
    } else if (job === 'mourn') {
      const grave = state.graves.find(entry => entry.id === target.id);
      if (grave) {
        grave.tendedCount = (grave.tendedCount || 0) + 1;
        if (!(villager.memorialComfortAt > state.time.seconds)) {
          villager.needs.energy = Math.min(100, villager.needs.energy + survival.memorialEnergy);
          villager.memorialComfortAt = state.time.seconds + tuning.memorialComfortCooldown;
        }
        villager.reaction = { icon: 'love', until: state.time.seconds + 1.8 };
        announce(`${villager.name} laid island blossoms at ${grave.name}'s memorial.`);
      }
    } else if (job === 'family') planFamily(villager, target, work.workLabel);
    else if (job === 'collect') collect(villager, target);
    else if (job === 'farm' && target.stage < 3) {
      const crop = state.crops.find(crop => crop.id === target.id);
      crop.stage++;
      const wait = survival.cropGrowthSeconds[crop.stage - 1];
      if (wait) crop.growthAt = state.time.seconds + wait;
      else delete crop.growthAt;
    } else if (work.counter || job === 'farm') {
      const counter = work.counter || 'food';
      const quantity = haulSize(villager);
      if (quantity > 0 && moveVillager(world, villager, deliveryPoints())) {
        work.counter = counter;
        work.phase = 'deliver';
        work.haul = quantity;
        track(villager, 'Supplies loaded', quantity);
        villager.appearance.heldObject = holding[counter];
        return;
      }
    }
    villager.work = null;
  }

  function deliver(villager) {
    const { work } = villager;
    villager.work = null;
    villager.appearance.heldObject = 'none';
    const source = state.objects[work.ref.id];
    let quantity = work.haul ?? 0;
    if (work.job === 'farm') {
      const crop = state.crops.find(item => item.id === work.ref.id);
      if (crop?.stage !== 3) quantity = 0;
      if (quantity) crop.stage = 0;
    }
    if (Number.isFinite(source?.amount)) {
      quantity = Math.min(source.amount, quantity);
      source.amount -= quantity;
      const object = world.objects.get(work.ref.id);
      if (object.type === 'berry_bush') source.state = source.amount ? 'partial' : 'empty';
      if (object.type === 'tree' && !source.amount) source.state = 'stump';
      if (object.resource.renewable) source.regrowAt ??= state.time.seconds + (object.type === 'berry_bush'
        ? survival.berryRegrowSeconds : work.counter === 'food' ? survival.otherFoodRegrowSeconds : 35);
    }
    if (quantity <= 0) return;
    resources.add(work.counter, quantity);
    if (!work.xpAwarded) awardWork(villager, work.job);
    track(villager, 'Delivery trips');
    track(villager, `Delivered · ${work.counter}`, quantity);
    if (!(villager.reaction?.until > state.time.seconds) && quantity >= (jobSkill(villager, work.job)?.rank.capacity ?? 2)) {
      villager.reaction = { expression: 'happy', until: state.time.seconds + 0.6 };
    }
    villager.retryAt = state.time.seconds + 0.45;
  }

  function routineNeeded(routine) {
    if (routine.counter === 'food' || ['farm', 'fish'].includes(routine.job)) return foodSecurity(state).reserve < 1;
    if (routine.counter === 'wood') return resources.get('wood') < tuning.woodFloor + 5;
    if (routine.counter === 'stone') return resources.get('stone') < tuning.stoneFloor + 5;
    return routine.job === 'research' && resources.get('knowledge') < tuning.knowledgeFloor;
  }

  function resumeJob(villager, preference) {
    const returningToBerries = world.objects.get(preference.ref.id)?.type === 'berry_bush';
    const search = returningToBerries ? 'Looking for ripe berries' : preference.counter === 'food' ? 'Looking for food' : 'Waiting for work';
    if (!assign(villager, preference.ref, false)) {
      villager.work.walkLabel = returningToBerries ? 'Returning to the berry bush' : 'Returning to work';
      return;
    }
    if (preference.counter && preference.ref.kind === 'object' && preference.job !== 'fish') {
      const candidates = (sources.get(preference.job) || []).filter(object => availableSupply(object.id) > 0
        && state.objects[object.id].amount > 0 && describeInteraction(object, assets).counter === preference.counter);
      const rank = object => distance(villager.tile, object.tile) + (returningToBerries && object.type !== 'berry_bush' ? 8 : 0)
        + (state.villagers.some(member => member !== villager && member.work?.ref.id === object.id) ? 4 : 0);
      candidates.sort((a, b) => rank(a) - rank(b));
      for (const target of candidates) {
        const ref = { kind: 'object', id: target.id };
        if (!assign(villager, ref, false)) {
          preference.ref = ref;
          villager.work.walkLabel = search;
          return;
        }
      }
    }
    const alternatives = preference.job === 'fish' ? map.fishingSpots.map(target => ({ kind: 'object', id: target.id }))
      : preference.job === 'farm' ? state.crops.map(target => ({ kind: 'crop', id: target.id }))
        : preference.job === 'research' ? [
          ...state.buildings.filter(site => site.type === 'research_hut' && site.state === 'completed')
            .map(target => ({ kind: 'building', id: target.id })),
          { kind: 'object', id: camp.id },
        ] : [];
    alternatives.sort((a, b) => distance(villager.tile, getTarget(a).tile || getTarget(a).standPosition)
      - distance(villager.tile, getTarget(b).tile || getTarget(b).standPosition));
    for (const ref of alternatives) {
      if (ref.id !== preference.ref.id && !assign(villager, ref, false)) {
        preference.ref = ref;
        return;
      }
    }
    if (!villager.preferredJob) villager.routine = null;
    villager.activity = returningToBerries ? 'Waiting for a reachable berry bush'
      : preference.counter === 'food' ? 'No reachable food source right now'
        : `No reachable ${restReasons[preference.job] || 'assigned'} work right now`;
    villager.retryAt = state.time.seconds + tuning.retrySeconds;
  }

  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function beginWork(villager) {
    const { work } = villager;
    work.phase = 'work';
    work.repaths = 0;
    work.remaining = work.job === 'heal' ? survival.treatmentSeconds : work.job === 'family' ? survival.togetherSeconds
      : work.job === 'collect' ? 0.62 : work.job === 'mourn'
      ? STORY_CONFIG.mournWorkSec
      : tuning.cycleSeconds * (jobSkill(villager, work.job)?.rank.workTime ?? 1)
        / (villager.needs.energy < tuning.restBelow || villager.needs.hunger < tuning.lowFed ? tuning.tiredRate : 1)
        / (work.job === 'research' && villager.quirks.includes('curious') ? tuning.curiousResearch : 1);
    const severity = illnessSeverity(villager);
    if (severity === 'mild') work.remaining /= 0.88;
    if (severity === 'serious' || villager.recoveryUntil > state.time.seconds) work.remaining /= 0.70;
    work.duration = work.remaining;
    villager.activity = work.workLabel || labels[work.job];
    villager.animation = work.animation || jobAnimations[work.job] || work.job;
    if (work.job === 'collect') {
      const target = getTarget(work.ref);
      const dx = target.position.x - villager.position.x;
      const dy = target.position.y - villager.position.y;
      villager.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'back' : 'front');
      work.grabDuration = work.remaining;
    }
  }

  const sources = new Map();
  for (const object of map.objects) {
    const { type, counter } = describeInteraction(object, assets);
    if (!counter || !object.resource) continue;
    if (!sources.has(type)) sources.set(type, []);
    sources.get(type).push(object);
  }

  function chooseChore(villager) {
    const adults = villager.lifeStage !== 'child';
    const focus = villager.workPreference === 'auto' ? null : villager.workPreference;
    const allows = skill => !focus || focus === skill;
    const { status: foodStatus } = foodSecurity(state);
    const criticalFood = foodStatus === 'critical';
    const employed = job => state.villagers.filter(member => member.id !== villager.id
      && member.work?.job === job && !(member.holdStillUntil > state.time.seconds)).length;
    const occupied = id => state.villagers.some(member => member.work?.ref.id === id);
    const targetTile = target => target.tile || target.standPosition;
    function defersToSpecialist(target, job, skill, rank) {
      if (focus || criticalFood && ['gather', 'farm', 'fish'].includes(job)) return false;
      const tile = targetTile(target);
      const localRange = distance(villager.tile, tile) + 2;
      return state.villagers.some(member => member !== villager && member.workPreference === 'auto'
        && !member.preferredJob && !member.work && !member.route.length && !member.resting
        && member.lifeStage !== 'baby' && (member.lifeStage !== 'child' || ['gather', 'fish'].includes(job))
        && member.needs.health >= 55 && member.needs.hunger >= tuning.lowFed && member.needs.energy >= tuning.restBelow
        && !(member.holdStillUntil > state.time.seconds) && !member.carryingBaby && illnessSeverity(member) !== 'critical'
        && !(member.retryAt > state.time.seconds)
        && distance(member.tile, tile) <= localRange && skillProgress(member, skill).tier > rank);
    }
    function tryTargets(kind, targets, job) {
      const skill = skillForJob(job);
      const rank = skillProgress(villager, skill).tier;
      const score = target => distance(villager.tile, targetTile(target))
        + (occupied(target.id) ? 5 : 0)
        - (rank === 2 && ['gather', 'chop', 'mine'].includes(job)
          ? Math.min(1.5, availableSupply(target.id) / 10) : 0);
      return targets.filter(target => (job === 'build' && focus) || !occupied(target.id))
        .sort((a, b) => score(a) - score(b))
        .some(target => !defersToSpecialist(target, job, skill, rank)
          && !assign(villager, { kind, id: target.id }, false));
    }
    const resourceTargets = job => (sources.get(job) || []).filter(source => availableSupply(source.id) > 0);
    const foodJob = () => (adults && state.abilities.farm && tryTargets('crop', state.crops, 'farm'))
      || (!criticalFood && state.abilities.fish && tryTargets('object', map.fishingSpots, 'fish'))
      || tryTargets('object', resourceTargets('gather'), 'gather')
      || (criticalFood && state.abilities.fish && tryTargets('object', map.fishingSpots, 'fish'));
    const foodWorkers = employed('gather') + employed('farm') + employed('fish');
    if (criticalFood && allows('gathering') && foodWorkers < 2 && foodJob()) return true;
    if (adults && allows('healing') && state.abilities.heal && tryTargets('villager', state.villagers.filter(member =>
      member.id !== villager.id && (member.needs.health < 65 || illnessSeverity(member) === 'serious'
        || illnessSeverity(member) === 'critical' || focus && member.illness)), 'heal')) return true;
    if (!criticalFood && allows('gathering') && foodWorkers < 1 && foodStatus === 'low' && foodJob()) return true;
    if (!adults) return false;
    if (allows('building') && tryTargets('building', state.buildings.filter(site => site.state !== 'completed'), 'build')) return true;
    if (allows('gathering')) {
      if ((!employed('chop') || focus) && resources.get('wood') < tuning.woodFloor && tryTargets('object', resourceTargets('chop'), 'chop')) return true;
      if ((!employed('mine') || focus) && resources.get('stone') < tuning.stoneFloor && tryTargets('object', resourceTargets('mine'), 'mine')) return true;
      if (focus && foodJob()) return true;
    }
    if (allows('research') && (!employed('research') || focus) && (focus || resources.get('knowledge') < tuning.knowledgeFloor)) {
      const huts = state.buildings.filter(site => site.type === 'research_hut' && site.state === 'completed');
      if (tryTargets('building', huts, 'research')) return true;
      if (state.worldFlags.light_campfire && tryTargets('object', [camp], 'research')) return true;
    }
    return false;
  }

  function endConversation(villager) {
    if (!villager.conversation) return;
    const partner = state.villagers.find(member => member.id === villager.conversation.partnerId);
    const participants = partner?.conversation?.partnerId === villager.id ? [villager, partner] : [villager];
    for (const member of participants) {
      member.conversation = null;
      if (member.activity?.startsWith('Talking with ')) {
        member.activity = 'Idle';
        member.animation = 'idle';
      }
    }
  }

  function canSocialize(villager) {
    return villager && villager.id !== world.heldVillager && villager.lifeStage !== 'baby'
      && villager.needs.energy >= 45 && villager.needs.health >= 55 && illnessSeverity(villager) !== 'critical'
      && !villager.work && !villager.route.length && !villager.preferredJob && !villager.routine && !villager.workBreak;
  }

  function beginConversation(a, b) {
    const now = state.time.seconds;
    if (!canSocialize(a) || !canSocialize(b) || a === b || a.conversation || b.conversation
      || a.socialAfter > now || b.socialAfter > now) return false;
    const pa = groundPosition(a);
    const pb = groundPosition(b);
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > villagerGroundTuning.conversationRadius) return false;
    for (const [speaker, partner, leads] of [[a, b, true], [b, a, false]]) {
      speaker.conversation = { partnerId: partner.id, start: now, leads };
      speaker.socialAfter = now + villagerGroundTuning.conversationCooldown;
      speaker.leisure = null;
    }
    conversationActivity(a);
    conversationActivity(b);
    return true;
  }

  function conversationActivity(villager, dt = 0) {
    const conversation = villager.conversation;
    if (!conversation) return false;
    const partner = state.villagers.find(member => member.id === conversation.partnerId);
    const elapsed = state.time.seconds - conversation.start;
    if (!canSocialize(villager) || !canSocialize(partner) || partner.conversation?.partnerId !== villager.id
      || elapsed >= villagerGroundTuning.conversationLength) {
      if (canSocialize(villager) && canSocialize(partner) && partner.conversation?.partnerId === villager.id
        && elapsed >= villagerGroundTuning.conversationLength) deepenBond(villager, partner);
      endConversation(villager);
      return false;
    }
    const from = groundPosition(villager);
    const to = groundPosition(partner);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) > villagerGroundTuning.conversationRadius + 4) {
      endConversation(villager);
      return false;
    }
    villager.direction = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'front' : 'back');
    villager.activity = `Talking with ${partner.name}`;
    villager.animation = (Math.floor(elapsed / 0.65) % 2 === 0) === conversation.leads ? 'talk' : 'idle';
    villager.needs.energy = Math.min(100, villager.needs.energy + Math.min(dt, elapsed) * tuning.talkRecovery);
    return true;
  }

  function leisureActivity(villager, elapsed) {
    const now = state.time.seconds;
    const current = villager.leisure;
    if (current) {
      if (current.partnerId) {
        const partner = state.villagers.find(member => member.id === current.partnerId);
        villager.leisure = null;
        return beginConversation(villager, partner);
      }
      const [start, end] = villagerGroundTuning.leisurePause;
      current.until ??= now + start + (villager.appearance.seed % 10) / 10 * (end - start);
      if (now < current.until) {
        villager.activity = current.label;
        villager.animation = current.clip;
        if (current.clip === 'sit') villager.needs.energy = Math.min(100, villager.needs.energy + elapsed * tuning.quietAtCamp);
        return true;
      }
      villager.leisure = null;
    }
    return false;
  }

  function chooseLeisure(villager) {
    const now = state.time.seconds;
    const { leisureDelay, leisureRadius } = villagerGroundTuning;
    villager.leisureAt ??= now + leisureDelay[0] + villager.appearance.seed % 5;
    if (villager.leisureAt > now) return;
    const step = (villager.leisureSteps ?? 0) + 1;
    villager.leisureSteps = step;
    const seed = villager.appearance.seed + step;
    villager.leisureAt = now + leisureDelay[0] + seed % (1 + leisureDelay[1] - leisureDelay[0]);
    const close = tile => distance(villager.tile, tile) <= leisureRadius;
    const partners = state.villagers.filter(member => member !== villager && canSocialize(member) && !member.conversation
      && !(member.socialAfter > now) && close(member.tile));
    if (seed % 3 !== 0 && partners.some(partner => beginConversation(villager, partner))) return;
    const destinations = [
      ...partners.map(member => ({ points: memberPoints(member), partnerId: member.id })),
      { points: camp.interactionPoints, clip: 'sit', label: 'Taking a break at the campfire' },
      ...state.buildings.filter(building => building.state === 'completed')
        .map(building => ({ points: buildingPoints(building), clip: 'idle', label: 'Looking around the village' })),
    ].map(destination => ({ ...destination, points: destination.points.filter(close) })).filter(destination => destination.points.length);
    if (villager.quirks.includes('curious') && seed % 3 === 0) {
      const landmark = map.objects.find(object => object.puzzleId && object.id !== camp.id
        && object.interactionPoints.some(close) && moveVillager(world, villager, object.interactionPoints.filter(close)));
      if (landmark) {
        villager.leisure = { clip: 'investigate', label: 'Looking at a landmark' };
        return;
      }
    }
    if (destinations.length && seed % 3 !== 0) {
      const destination = destinations[seed % destinations.length];
      if (moveVillager(world, villager, destination.points)) {
        villager.leisure = { clip: destination.clip, label: destination.label, partnerId: destination.partnerId };
        return;
      }
    }
    const start = seed % neighbors.length;
    const directions = [...neighbors.slice(start), ...neighbors.slice(0, start)];
    const villageRange = Math.max(leisureRadius + 3, distance(villager.tile, camp.tile));
    for (const offset of directions) {
      let destination = villager.tile;
      for (let count = 0; count < 1 + seed % 3; count++) {
        const next = { x: destination.x + offset.x, y: destination.y + offset.y };
        if (!walkable(world.collision, next) || distance(next, camp.tile) > villageRange) break;
        destination = next;
      }
      if (destination !== villager.tile && moveVillager(world, villager, [destination])) return;
    }
  }

  function reactToSnake(villager) {
    const now = state.time.seconds;
    if (!villager.quirks.includes('snakeShy') || villager.lifeStage === 'baby' || villager.needs.health < 55
      || villager.snakeAfter > now || villager.reaction?.until > now) return false;
    const origin = groundPosition(villager);
    const range = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const snake = state.wildlife.find(animal => animal.assetId === 'wildlife_snake'
      && (animal.ecology?.opacity ?? 1) >= 0.65 && range(animal.position, origin) < 30);
    if (!snake) return false;
    const routes = neighbors.map(offset => {
      let tile = villager.tile;
      for (let i = 0; i < 3; i++) {
        const next = { x: tile.x + offset.x, y: tile.y + offset.y };
        if (!walkable(world.collision, next)) break;
        tile = next;
      }
      return { tile, distance: range(tileToWorld(tile, tileSize), snake.position) };
    }).sort((a, b) => b.distance - a.distance);
    villager.snakeAfter = now + 12;
    if (!(routes[0].distance > range(origin, snake.position) + 12) || !moveVillager(world, villager, [routes[0].tile])) return false;
    endConversation(villager);
    villager.leisure = null;
    villager.snakeFlee = true;
    villager.animation = 'run';
    villager.activity = 'Running from a snake';
    villager.reaction = { icon: 'warn', until: now + 1.2 };
    return true;
  }

  function recoverEnergy(villager, elapsed) {
    if (!villager.resting) {
      endConversation(villager);
      villager.leisure = null;
      const points = [...camp.interactionPoints, ...state.buildings
        .filter(site => site.state === 'completed' && ['house', 'family_house'].includes(site.type))
        .flatMap(buildingPoints)]
        .filter(point => distance(villager.tile, point) <= tuning.restRadius);
      const nearby = points.length && moveVillager(world, villager, points);
      villager.resting = {
        sheltered: Boolean(nearby), destination: nearby ? villager.route.at(-1) || villager.tile : null,
      };
      villager.workBreak = true;
      if (villager.route.length) {
        villager.activity = 'Going to rest';
        return;
      }
    }
    const pending = villager.preferredJob || villager.work || villager.routine;
    const reason = restReasons[pending?.job];
    villager.activity = reason ? `Resting before ${reason}` : 'Resting';
    villager.animation = pending ? 'sit' : 'sleep';
    const { sheltered, destination } = villager.resting;
    const atRestSpot = sheltered && destination.x === villager.tile.x && destination.y === villager.tile.y;
    const rate = atRestSpot ? tuning.shelteredRecovery : tuning.restRecovery;
    villager.needs.energy = Math.min(100, villager.needs.energy + elapsed * rate);
    track(villager, 'Seconds resting', elapsed);
    if (villager.needs.energy >= tuning.restUntil) {
      villager.workBreak = false;
      villager.resting = null;
      if (pending) villager.activity = 'Ready to resume work';
    }
  }

  function advanceVillager(villager, elapsed, treatments, familyVisits) {
    if (villager.lifeStage === 'baby') return;
    if (world.heldVillager === villager.id) {
      reveals.delete(villager.id);
      delete villager.holdStillUntil;
      endConversation(villager);
      return;
    }
    if (reveals.has(villager.id)) return;
    if (villager.holdStillUntil !== undefined) {
      if (state.time.seconds < villager.holdStillUntil) {
        villager.route = [];
        villager.currentTask = null;
        villager.animation = 'idle';
        villager.activity = `Hold Position (${Math.ceil(villager.holdStillUntil - state.time.seconds)}s)`;
        return;
      }
      releaseHold(villager);
    }
    const needsCare = illnessSeverity(villager) === 'critical';
    const receivingCare = (villager.illness || villager.needs.health < 100) && treatments.has(villager.id);
    const familyVisitor = familyVisits.get(villager.id);
    if (familyVisitor?.work?.job === 'family' && villager.work?.phase !== 'deliver' && !villager.work?.manual && !villager.currentTask?.manual) {
      clearRoute(villager);
      endConversation(villager);
      villager.work = null;
      villager.leisure = null;
      const face = memberPoints(familyVisitor).find(point => point.x === villager.tile.x && point.y === villager.tile.y)?.facing;
      if (face) villager.direction = { left: 'left', right: 'right', up: 'back', down: 'front' }[face];
      villager.activity = 'Spending time with ' + familyVisitor.name;
      villager.animation = Math.floor(familyVisitor.work.remaining / 0.7) % 2 ? 'talk' : 'idle';
      return;
    }
    if ((needsCare || receivingCare && villager.illness && villager.work?.phase !== 'deliver') && villager.work) {
      const pending = villager.preferredJob;
      clearRoute(villager);
      stop(villager);
      villager.preferredJob = pending;
    }
    if (villager.route.length) {
      track(villager, 'Seconds traveling', elapsed);
      villager.activity = villager.resting ? 'Going to rest' : villager.snakeFlee ? 'Running from a snake'
        : villager.work?.phase === 'deliver' ? 'Carrying supplies' : villager.work?.walkLabel || 'Walking';
      if (villager.work?.phase === 'deliver') villager.animation = 'carry';
      return;
    }
    villager.snakeFlee = false;
    const { work } = villager;
    if (work?.phase === 'deliver') {
      deliver(villager);
      villager.animation = 'idle';
      return;
    }
    if (!work && receivingCare) {
      endConversation(villager);
      villager.activity = 'Waiting for care';
      villager.animation = 'sit';
      return;
    }
    if ((!work || work.phase === 'approach') && (villager.resting || villager.workBreak
      || villager.needs.energy < tuning.restBelow + (villager.pregnancy && villager.pregnancy.dueAt - state.time.seconds < survival.pregnancySeconds / 3 ? 7 : 0))) {
      recoverEnergy(villager, elapsed);
      return;
    }
    if (work) {
      if (work.phase === 'work') track(villager, `Seconds working · ${work.job}`, elapsed);
      if (work.phase === 'approach' || work.remaining <= elapsed || work.ref.kind === 'villager') {
        const { target, action, issue } = interaction(villager, work.ref, work.job);
        if (issue || action.job !== work.job) {
          cancelCommand(villager, issue || 'That task is no longer available.');
          return;
        }
        if (!action.points.some(point => point.x === villager.tile.x && point.y === villager.tile.y
          && walkable(world.collision, point))) {
          if (work.ref.kind === 'villager' && !allowMovingTargetRetry(villager)) return;
          if (moveVillager(world, villager, action.points, target.id)) {
            work.phase = 'approach';
            villager.activity = work.walkLabel || 'Returning to work';
          } else cancelCommand(villager, 'No reachable interaction point.');
          return;
        }
        if (work.phase === 'work' && work.remaining <= elapsed) {
          finishWork(villager, target);
          if (!villager.work) {
            if (!reveals.has(villager.id)) villager.activity = 'Idle';
            villager.animation = 'idle';
          }
          return;
        }
      }
      if (work.phase === 'approach') {
        beginWork(villager);
        return;
      }
      villager.activity = work.workLabel || labels[work.job];
      villager.animation = work.animation || jobAnimations[work.job] || work.job;
      work.remaining -= elapsed;
      return;
    }
    if (needsCare || villager.recoveryUntil > state.time.seconds && villager.needs.health < 55) {
      villager.activity = villager.illness ? 'Resting with critical illness' : 'Recovering after treatment';
      villager.animation = 'sick';
      return;
    }
    if (reactToSnake(villager) || conversationActivity(villager, elapsed)) return;
    if (villager.needs.health >= 55 && leisureActivity(villager, elapsed)) return;
    villager.animation = villager.illness ? 'sick' : villager.carryingBaby ? 'holdBaby' : 'idle';
    if (villager.retryAt > state.time.seconds) return;
    villager.activity = villager.illness ? 'Unwell' : villager.carryingBaby ? 'Caring for a newborn' : 'Idle';
    if (villager.workPreference === 'rest') {
      chooseLeisure(villager);
      return;
    }
    const repeat = villager.preferredJob || villager.routine;
    if (repeat && (villager.preferredJob || villager.needs.health >= 55
      && (villager.workPreference === 'research' || routineNeeded(repeat)))) {
      resumeJob(villager, repeat);
      return;
    }
    villager.routine = null;
    if (villager.lifeStage === 'baby' || villager.needs.health < 55) return;
    villager.retryAt = state.time.seconds + tuning.decisionSeconds;
    if (chooseChore(villager)) return;
    if (villager.workPreference !== 'auto') villager.activity = `Waiting for ${villagerSkills[villager.workPreference].label.toLowerCase()} work`;
    chooseLeisure(villager);
  }

  function availableCollectibleTiles() {
    if (reachableCollectibleTiles) return reachableCollectibleTiles;
    const queue = [{ ...map.villagerSpawns[0] }];
    const seen = new Set();
    const key = ({ x, y }) => y * map.meta.width + x;
    seen.add(key(queue[0]));
    for (let index = 0; index < queue.length; index++) {
      const tile = queue[index];
      for (const offset of neighbors) {
        const next = { x: tile.x + offset.x, y: tile.y + offset.y };
        if (!walkable(world.collision, next) || seen.has(key(next))) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    reachableCollectibleTiles = new Map(map.collectibleSpawnZones.map(zone => [zone.id,
      zone.tiles.filter(([x, y]) => seen.has(key({ x, y }))),
    ]));
    if (state.worldFlags.restore_garden) {
      const garden = map.buildingZones.find(zone => zone.id === 'garden_zone_001');
      reachableCollectibleTiles.set(garden.id, garden.tiles.filter(([x, y]) => seen.has(key({ x, y }))));
    }
    return reachableCollectibleTiles;
  }

  function spawnCollectible() {
    const tilesByZone = availableCollectibleTiles();
    const replace = state.activeCollectibles.length >= 5
      ? state.activeCollectibles.findIndex(item => !state.villagers.some(member => member.work?.ref.id === item.id))
      : -1;
    if (state.activeCollectibles.length >= 5 && replace < 0) return;
    const active = new Set(state.activeCollectibles.filter((_, index) => index !== replace).map(item => item.assetId));
    const day = state.time.minutes >= 360 && state.time.minutes < 1140 ? 'day' : 'night';
    const weather = sampleWeather(state.weather, state.time.seconds).rain >= 0.12 ? 'rain' : 'clear';
    const learned = Object.keys(researchProjects).filter(id => state.abilities[id]).length;
    const requirements = {
      research_level_1: learned >= 1, research_level_2: learned >= 2, research_level_3: learned >= 3,
      cave_unlocked: state.worldFlags.light_cave, bridge_repaired: state.worldFlags.repair_bridge,
      flower_garden_restored: state.worldFlags.restore_garden,
    };
    const zonesFor = asset => asset.id === 'butterfly_moonlight' ? ['garden_zone_001'] : asset.spawn.mapZoneIds;
    const candidates = assets.collectibles.filter(asset => !active.has(asset.id)
      && (asset.spawn.timeOfDay.includes('any') || asset.spawn.timeOfDay.includes(day))
      && (asset.spawn.weather.includes('any') || asset.spawn.weather.includes(weather))
      && asset.spawn.requires.every(requirement => requirements[requirement])
      && zonesFor(asset).some(id => tilesByZone.get(id)?.length));
    if (!candidates.length) return;
    if (replace >= 0) state.activeCollectibles.splice(replace, 1);
    const undiscovered = candidates.filter(asset => !state.collectionProgress[asset.id].discovered);
    const pool = undiscovered.length ? undiscovered : candidates;
    const index = clock.collectIndex ?? 0;
    clock.collectIndex = index + 1;
    const asset = pool[index % pool.length];
    const zoneId = zonesFor(asset).find(id => tilesByZone.get(id)?.length);
    const tiles = tilesByZone.get(zoneId);
    const [x, y] = tiles[((index + 1) * 13) % tiles.length];
    const tile = { x, y };
    state.activeCollectibles.push({ id: `find_${asset.id}`, assetId: asset.id, zoneId, tile, position: tileToWorld(tile, tileSize) });
  }

  function inflictIllness(villager, cause = 'fever', forced = false, options = {}) {
    if (!villager || !state.villagers.includes(villager) || villager.illness) return false;
    const now = state.time.seconds;
    const tutorialSafe = Boolean(options.tutorialSafe);
    const startHp = tutorialSafe ? survival.tutorialIllnessHealth : forced ? 52 : 84;
    villager.needs.health = Math.min(villager.needs.health, startHp);
    villager.illness = {
      cause,
      tutorialSafe,
      startedAt: now,
      burden: tutorialSafe ? 32 : forced ? 52 : 24,
      nextExposureAt: now + survival.contagionInterval,
    };
    villager.reaction = { icon: 'sick', until: now + 2.4 };
    announce(tutorialSafe
      ? `${villager.name} is unwell! Learn Healing (10 Knowledge) and drag a healthy adult onto them.`
      : `${villager.name} caught a fever! Drag a healer onto them before their health runs out.`);
    emitEvent('illness', { villager, cause, forced, tutorialSafe });
    return true;
  }

  function startRecovery(villager) {
    delete villager.illness;
    villager.recoveryUntil = state.time.seconds + survival.recoverySeconds;
    villager.immunityUntil = state.time.seconds + survival.immunitySeconds;
  }

  function tickMeals(now, stage) {
    if (now < clock.nextNeeds) return;
    clock.nextNeeds += survival.mealInterval;
    const floor = stage >= 2 ? 0 : survival.tutorialFloor;
    const hungry = [...state.villagers].sort((a, b) => a.needs.hunger - b.needs.hunger);
    for (const villager of hungry) {
      const needs = villager.needs;
      needs.hunger = Math.max(0, needs.hunger - foodUse(villager));
      if (needs.hunger <= survival.mealAt && pay({ food: 1 })) needs.hunger += survival.mealValue;
      if (needs.hunger > survival.starvationAt) {
        delete villager.starvedAt;
        continue;
      }
      villager.starvedAt ??= now;
      if (now - villager.starvedAt < survival.starvationGrace) continue;
      if (needs.health > floor) needs.health = Math.max(floor, needs.health - survival.starvationDamage);
      if (needs.health <= 0) killVillager(villager, 'starvation');
    }
    const { status } = foodSecurity(state);
    if (state.villagers.length && status !== 'steady' && now - story.lastLowFoodWarnAt >= survival.warningCooldown) {
      story.lastLowFoodWarnAt = now;
      announce(status === 'critical' ? 'Food is critically low. Send a worker to berries, crops, or fish now.'
        : 'Less than a day of food remains. Assign a villager to bring in more.');
      emitEvent('low_food', { food: resources.get('food') });
    }
  }

  function tickExposure(villager, rain, now, stage) {
    const { illness } = villager;
    if (stage !== 2 || illness.spread || illness.cause === 'contagion' || now < illness.nextExposureAt) return;
    illness.nextExposureAt = now + survival.contagionInterval;
    const eligible = state.villagers.filter(member => member !== villager && !member.illness
      && member.lifeStage !== 'baby' && !(member.immunityUntil > now) && member.id !== world.heldVillager);
    if (eligible.filter(member => !['baby', 'child'].includes(member.lifeStage) && member.needs.health >= 65).length < 2) return;
    const contact = eligible.find(member => member.work?.job !== 'heal' && distance(member.tile, villager.tile) <= survival.contagionRadius);
    if (!contact) {
      delete illness.exposure;
      return;
    }
    if (illness.exposure?.id !== contact.id) illness.exposure = { id: contact.id, seconds: 0 };
    else illness.exposure.seconds += survival.contagionInterval * (rain >= 0.12 || contact.needs.hunger < 45 ? 1.5 : 1);
    if (illness.exposure.seconds >= survival.contagionExposure) {
      illness.spread = inflictIllness(contact, 'contagion');
      delete illness.exposure;
    }
  }

  function tickIllness(elapsed, now, rain, stage) {
    for (const villager of [...state.villagers]) {
      const { illness, needs } = villager;
      if (!illness) {
        if (villager.recoveryUntil > now && needs.hunger > 35 && needs.health < 85) {
          needs.health = Math.min(85, needs.health + elapsed * (villager.route.length || villager.work ? 0.45 : 0.8));
        }
        continue;
      }
      if (illness.tutorialSafe) {
        needs.health = Math.max(Math.min(needs.health, survival.tutorialFloor), needs.health - survival.tutorialIllnessDrain * elapsed);
        continue;
      }
      illness.burden ??= survival.seriousAt;
      illness.nextExposureAt ??= now + survival.contagionInterval;
      const severity = illnessSeverity(villager);
      const canRecover = severity === 'mild' && needs.hunger >= 60 && needs.health >= 60 && !villager.work && !villager.route.length;
      const risk = (rain >= 0.6 ? survival.illnessRain[1] : rain >= 0.12 ? survival.illnessRain[0] : 0)
        + (needs.hunger <= 25 ? survival.illnessHungry : 0) + (villager.lifeStage === 'elder' ? survival.illnessElder : 0);
      illness.burden = Math.max(0, Math.min(100, illness.burden + (canRecover ? -survival.mildRecovery : survival.illnessGrowth + risk) * elapsed));
      if (illness.burden === 0) {
        startRecovery(villager);
        continue;
      }
      const current = illnessSeverity(villager);
      if (current !== 'mild' && !illness.majorNotified) {
        illness.majorNotified = true;
        emitEvent('major_illness', { villager });
      }
      const drain = survival.illnessDrain[current] + risk;
      const floor = stage < 2 ? Math.min(needs.health, survival.tutorialFloor) : 0;
      needs.health = Math.max(floor, needs.health - drain * elapsed);
      if (needs.health <= 0) {
        killVillager(villager, 'sickness');
        continue;
      }
      if (current === 'critical' && !illness.criticalWarned) {
        illness.criticalWarned = true;
        villager.reaction = { icon: 'danger', until: now + 3 };
        announce(villager.name + ' is critically ill. Assign a healer now.');
      }
      if (current !== 'mild') tickExposure(villager, rain, now, stage);
    }
    if (stage === 1 && !story.seenEvents.first_illness && !state.villagers.some(member => member.illness)) {
      const victim = pickIllnessCandidate();
      if (victim) inflictIllness(victim, 'fever', true, { tutorialSafe: true });
    } else if (now >= clock.nextIllness) {
      clock.nextIllness = now + (rain >= 0.12 ? survival.rainyIllnessCadence : survival.illnessCadence);
      const victim = pickIllnessCandidate();
      const adults = state.villagers.filter(member => !['child', 'baby'].includes(member.lifeStage));
      const capacity = Math.max(1, Math.floor(adults.length / 4));
      const active = state.villagers.filter(member => member.illness).length;
      if (stage === 2 && active < capacity && victim && (rain >= 0.12 || victim.needs.energy < 65 || victim.needs.hunger < 60)) {
        inflictIllness(victim, rain >= 0.12 ? 'storm_chill' : 'fever');
      }
    }
  }

  function killVillager(villager, cause = 'sickness') {
    if (!villager || !state.villagers.includes(villager)) return null;
    const now = state.time.seconds;
    const rememberedName = id => state.villagers.find(member => member.id === id)?.name
      || state.graves.find(grave => grave.villagerId === id)?.name;
    const family = {
      partner: villager.relationships.partner || null,
      parents: [...(villager.relationships.parents || [])],
      children: [...(villager.relationships.children || [])],
      partnerName: rememberedName(villager.relationships.partner) || null,
      parentNames: (villager.relationships.parents || []).map(rememberedName).filter(Boolean),
      childNames: (villager.relationships.children || []).map(rememberedName).filter(Boolean),
    };
    const best = Object.keys(villagerSkills).map(skill => ({ skill, ...skillProgress(villager, skill) }))
      .sort((a, b) => b.xp - a.xp)[0];
    endConversation(villager);
    state.villagers = state.villagers.filter(member => member.id !== villager.id);
    if (world.heldVillager === villager.id) world.heldVillager = null;
    for (const member of state.villagers) {
      if (member.relationships.partner === villager.id) delete member.relationships.partner;
      if (member.relationships.bonds) delete member.relationships.bonds[villager.id];
      if (member.work?.ref?.kind === 'villager' && member.work.ref.id === villager.id) cancelCommand(member, 'The villager has passed away.');
      if (family.partner === member.id || family.parents.includes(member.id) || family.children.includes(member.id)) {
        member.reaction = { expression: 'sad', icon: 'love', until: now + 5 };
      }
    }
    const grave = {
      id: `grave_${story.nextGraveId++}`,
      name: villager.name,
      villagerId: villager.id, founder: villager.founder, lifeStage: villager.lifeStage, family,
      bestSkill: best.xp ? { name: villagerSkills[best.skill].label, rank: best.rank.name, xp: best.xp } : null,
      age: villager.age,
      cause,
      day: state.time.day,
      tile: { x: villager.tile.x, y: villager.tile.y },
      position: tileToWorld(villager.tile, tileSize),
      tendedCount: 0,
      createdAt: now,
    };
    state.graves.push(grave);
    updateCaregivers();
    story.deathCount = (story.deathCount || 0) + 1;
    if (cause === 'sickness') story.sicknessDeathCount = (story.sicknessDeathCount || 0) + 1;
    else if (cause === 'starvation') story.starvationDeathCount = (story.starvationDeathCount || 0) + 1;
    else if (cause === 'old_age') story.oldAgeDeathCount = (story.oldAgeDeathCount || 0) + 1;

    const msg = cause === 'sickness'
      ? `${villager.name} died of untreated sickness. Drop a villager at their memorial and learn Healing to protect survivors.`
      : cause === 'starvation'
        ? `${villager.name} starved to death! Gather Food immediately.`
        : `${villager.name} passed away peacefully at age ${villager.age}.`;
    announce(msg);
    emitEvent('death', { cause, villager, grave });
    if (state.villagers.length === 0) {
      emitEvent('colony_lost', { gravesCount: state.graves.length });
    }
    return grave;
  }

  function pickIllnessCandidate() {
    const candidates = state.villagers.filter(member => member.lifeStage !== 'baby' && !member.illness
      && !(member.immunityUntil > state.time.seconds));
    if (!candidates.length) return null;
    return candidates.sort((a, b) => {
      const aBusy = a.work || a.preferredJob ? 1 : 0;
      const bBusy = b.work || b.preferredJob ? 1 : 0;
      if (aBusy !== bBusy) return aBusy - bBusy;
      const aScore = a.needs.energy + a.needs.hunger - (a.lifeStage === 'elder' ? 20 : 0);
      const bScore = b.needs.energy + b.needs.hunger - (b.lifeStage === 'elder' ? 20 : 0);
      return aScore - bScore;
    })[0];
  }

  function updateCaregivers() {
    const babies = state.villagers.filter(member => member.lifeStage === 'baby');
    const adults = state.villagers.filter(member => member.lifeStage === 'adult' || member.lifeStage === 'elder');
    for (const adult of adults) delete adult.carryingBaby;
    for (const baby of babies.filter(member => member.development === 'crawling')) {
      if (!adults.some(member => member.id === baby.caregiverId)) {
        const caregiver = adults.find(member => baby.relationships.parents?.includes(member.id)) || adults[0];
        if (caregiver) baby.caregiverId = caregiver.id;
        else delete baby.caregiverId;
      }
    }
    for (const baby of babies.filter(member => member.development === 'carried')) {
      const healthy = adults.filter(member => !member.carryingBaby && illnessSeverity(member) !== 'critical' && member.needs.health >= 30);
      const caregiver = healthy.find(member => member.id === baby.caregiverId)
        || healthy.find(member => baby.relationships.parents?.includes(member.id)) || healthy[0];
      if (!caregiver) {
        delete baby.caregiverId;
        baby.activity = 'Resting in a safe spot';
        continue;
      }
      baby.caregiverId = caregiver.id;
      caregiver.carryingBaby = baby.id;
      baby.tile = { ...villagerNavigationTile(world, caregiver) };
      baby.position = { ...caregiver.position };
      baby.direction = caregiver.direction;
      baby.activity = 'Carried by ' + caregiver.name;
      baby.animation = 'idle';
      baby.route = [];
      if (caregiver.work && caregiver.work.phase !== 'deliver' && !survival.newbornJobs.has(caregiver.work.job)) {
        const pending = caregiver.preferredJob;
        clearRoute(caregiver);
        stop(caregiver);
        caregiver.preferredJob = pending;
      }
    }
  }

  function crawlInNursery(baby, now) {
    if (baby.route.length) {
      baby.activity = 'Crawling';
      return;
    }
    baby.animation = 'sit';
    baby.activity = 'Playing near the nursery';
    if (baby.nextCrawlAt > now) return;
    baby.nextCrawlAt = now + 7 + (baby.appearance.seed >>> 0) % 5;
    const caregiver = state.villagers.find(member => member.id === baby.caregiverId);
    if (caregiver && distance(baby.tile, caregiver.tile) <= survival.nurseryRadius && !(baby.nextCareAt > now)) {
      baby.nextCareAt = now + 40;
      caregiver.needs.energy = Math.max(0, caregiver.needs.energy - 2);
      caregiver.reaction ??= { expression: 'happy', until: now + 1 };
    }
    const offset = (Math.floor(now / 7) + (baby.appearance.seed >>> 0)) % neighbors.length;
    const points = [...neighbors.slice(offset), ...neighbors.slice(0, offset)]
      .map(({ x, y }) => ({ x: baby.tile.x + x, y: baby.tile.y + y }))
      .filter(tile => distance(tile, baby.nursery) <= survival.nurseryRadius && walkable(world.collision, tile));
    if (points.length) moveVillager(world, baby, [points[0]]);
  }

  function advanceFamilies(now) {
    for (const parent of [...state.villagers]) {
      if (!(parent.pregnancy?.dueAt <= now)) continue;
      const { partnerId } = parent.pregnancy;
      delete parent.pregnancy;
      const partner = state.villagers.find(member => member.id === partnerId);
      const baby = spawnChild(parent, partner, true);
      if (!partner && partnerId) {
        baby.relationships.parents.push(partnerId);
        const grave = state.graves.find(entry => entry.villagerId === partnerId);
        if (grave) {
          (grave.family.children ??= []).push(baby.id);
          (grave.family.childNames ??= []).push(baby.name);
        }
      }
    }
    for (const villager of [...state.villagers]) {
      const duration = phaseDuration(villager);
      const elapsed = now - villager.stageSince;
      if (villager.lifeStage === 'baby' && villager.development === 'carried' && elapsed >= survival.carriedSeconds) {
        villager.development = 'crawling';
        if (!walkable(world.collision, villager.nursery) || distance(villager.tile, villager.nursery) > survival.nurseryRadius) {
          villager.nursery = { ...villager.tile };
        }
        announce(villager.name + ' learned to crawl!');
        emitEvent('first_steps', { villager });
      }
      if (elapsed >= duration) {
        const next = { baby: 'child', child: 'adult', adult: 'elder' }[villager.lifeStage];
        if (!next) {
          killVillager(villager, 'old_age');
          continue;
        }
        if (next === 'child') {
          clearRoute(villager);
          delete villager.development;
          delete villager.caregiverId;
          delete villager.nursery;
        }
        villager.lifeStage = next;
        villager.stageSince += duration;
        villager.age = villager.stageAge = { child: 2, adult: 18, elder: 65 }[next];
        if (next === 'adult' && villager.relationships.parents?.length) story.generationalMilestone = true;
        villager.reaction = { icon: 'happy', expression: 'happy', until: now + 2 };
        announce(villager.name + (next === 'child' ? ' is now a child.' : ' is now an ' + next + '.'));
        emitEvent('life_stage', { villager, stage: next });
      } else {
        const endAge = { baby: 2, child: 18, adult: 65, elder: 92 }[villager.lifeStage];
        const startAge = villager.stageAge ?? villager.age;
        villager.age = Math.max(villager.age, Math.floor(startAge + Math.max(0, endAge - startAge) * elapsed / duration));
        if (villager.development === 'crawling') crawlInNursery(villager, now);
      }
    }
    if (!story.warnedSuccession && state.villagers.some(member => member.founder
      && (member.lifeStage === 'elder' || now - member.stageSince >= survival.adultSeconds * 0.65))
      && !state.villagers.some(member => member.pregnancy || member.relationships.parents?.length)) {
      story.warnedSuccession = true;
      announce('Your founders are aging. Open the Family House to check the village’s plans for a next generation.');
    }
    updateCaregivers();
  }

  function advance(elapsed) {
    for (const [id, reveal] of reveals) {
      reveal.age += elapsed / (state.time.speed || 1);
      if (reveal.age >= reveal.duration || !state.villagers.some(villager => villager.id === id)) {
        reveals.delete(id);
        const villager = state.villagers.find(member => member.id === id);
        if (villager) villager.activity = 'Idle';
      }
    }
    const now = state.time.seconds;
    const rain = sampleWeather(state.weather, now).rain;
    const stage = getSurvivalStage(world);

    tickMeals(now, stage);
    tickIllness(elapsed, now, rain, stage);
    advanceFamilies(now);

    if (now >= clock.nextCollectible) {
      clock.nextCollectible += 17;
      spawnCollectible();
    }
    for (const object of map.objects) {
      const resource = state.objects[object.id];
      if (resource.regrowAt && resource.regrowAt <= now) {
        const berry = object.type === 'berry_bush';
        const max = sourceCapacity(object);
        if (resource.amount < max) resource.amount = berry ? Math.min(max, resource.amount + survival.berryRegrowAmount) : max;
        resource.state = berry && resource.amount < max ? 'partial' : object.state;
        if (resource.amount < max) resource.regrowAt = now + survival.berryRegrowSeconds;
        else delete resource.regrowAt;
      }
    }
    const treatments = new Set();
    const familyVisits = new Map();
    for (const member of state.villagers) {
      if (world.heldVillager === member.id || member.holdStillUntil > now) continue;
      if (member.work?.job === 'heal' && illnessSeverity(member) !== 'critical') treatments.add(member.work.ref.id);
      if (member.work?.job === 'family' && member.work.phase === 'work') familyVisits.set(member.work.ref.id, member);
    }
    state.villagers.slice().forEach(villager => advanceVillager(villager, elapsed, treatments, familyVisits));
    checkAchievements();
  }

  state.crops ??= [];
  for (const villager of state.villagers) {
    initializeVillagerQuirks(villager);
    initializeVillagerProgress(villager);
    if (villager.work?.phase === 'deliver' && !Number.isFinite(villager.work.haul)) {
      villager.work.haul = haulSize(villager);
      villager.work.xpAwarded = true;
    }
  }
  updateCaregivers();
  const gameplay = {
    advance, inspectDrop, inspectTarget, pickUp, cancelPickup, prepareMovement, assign, move(villager, tile) {
      const result = move(villager, tile);
      if (!result) villager.appearance.heldObject = 'none';
      return result;
    }, drop, place, research, stop(villager) {
      delete villager.holdStillUntil;
      clearRoute(villager);
      stop(villager);
      villager.retryAt = state.time.seconds + tuning.stopSeconds;
      villager.activity = 'Taking a break';
    },
    holdStill, releaseHold, setWorkPreference, familyOptions, settlerOptions, welcomeSettler,
    setDiagnostics(enabled) { diagnosticsEnabled = enabled; },
    diagnosticsFor(id) { return { ...diagnostics.get(id) }; },
    promoteChampion,
    checkAchievements,
    refreshCollision, spawnCollectible,
    inflictIllness,
    killVillager,
    triggerBirth(a, b) {
      const adults = state.villagers.filter(v => v.lifeStage === 'adult');
      const p1 = a || adults[0] || state.villagers[0];
      const p2 = b || adults.find(v => v !== p1) || state.villagers.find(v => v !== p1);
      if (!p1 || !p2) return null;
      return spawnChild(p1, p2);
    },
    get revision() { return revision; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
  };
  refreshCollision();
  updateSpringLayout();
  world.gameplay = gameplay;
  return gameplay;
}
