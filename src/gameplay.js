import { describeInteraction } from './assets.js';
import { findRoute, neighbors, tileToWorld, walkable } from './geometry.js';
import { emitGroundDust, groundContact, groundPosition, villagerGroundTuning } from './ground.js';
import { construction, costLabel, landmarks, researchProjects } from './progression.js';
import { initializeVillagerQuirks, jobSkill } from './villagers.js';
import { moveVillager, previewPlacement } from './world.js';

const stages = ['foundation', 'p25', 'p50', 'p75', 'completed'];
const labels = {
  gather: 'Gathering food', chop: 'Cutting wood', mine: 'Gathering stone', build: 'Building',
  research: 'Researching', farm: 'Tending crops', fish: 'Fishing', heal: 'Healing',
  investigate: 'Investigating', family: 'Spending time together', collect: 'Collecting',
};
const reusableJobs = new Set(['gather', 'chop', 'mine', 'research', 'farm', 'fish']);
const jobAnimations = { family: 'talk', collect: 'gather' };
const holding = { food: 'berries', wood: 'log', stone: 'stone' };
const restReasons = { gather: 'gathering', chop: 'woodcutting', mine: 'gathering stone', build: 'building',
  research: 'researching', farm: 'farming', fish: 'fishing' };
const dropActions = {
  gather: ['Gather Food', 'resource_berries'], chop: ['Chop Wood', 'resource_wood_log'],
  mine: ['Mine Stone', 'resource_stone'], fish: ['Fish', 'resource_fish_small'],
  farm: ['Tend Crops', 'icon_work'], build: ['Build', 'icon_build'], research: ['Research', 'icon_research'],
  heal: ['Heal', 'icon_health'], family: ['Spend Time Together', 'icon_love'],
  investigate: ['Investigate', 'icon_curious'], collect: ['Collect', 'icon_discovery'],
};

export function startGameplay(world) {
  const { state, map, assets, resources } = world;
  const { tileSize } = map.meta;
  const listeners = new Set();
  const camp = map.objects.find(object => object.type === 'campfire_site');
  state.simulation ??= { nextNeeds: 12, nextCollectible: 8, nextBirthday: 180, nextIllness: 110, nextVillager: 6, nextWeather: 150 };
  const clock = state.simulation;
  let revision = 0;
  let reachableCollectibleTiles;

  function announce(message) {
    revision++;
    for (const listener of listeners) listener(message);
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
    if (!completeBuilding('family_house')) return 'Build a Family House first.';
    if (a.lifeStage !== 'adult' || b.lifeStage !== 'adult') return 'Only adults can start a family.';
    if ((a.relationships.partner && a.relationships.partner !== b.id)
      || (b.relationships.partner && b.relationships.partner !== a.id)) return 'One of these villagers already has a partner.';
    if (state.villagers.length >= state.world.populationCapacity) return 'Build more housing first.';
    if (a.careUntil > state.time.seconds || b.careUntil > state.time.seconds) return 'This family is already caring for a newborn.';
    if (!resources.canAfford({ food: 12 })) return 'The village needs 12 Food before welcoming a baby.';
    return null;
  }

  function plan(target, villager) {
    const kind = target.kind;
    if (kind === 'villager') {
      if (target.id === villager.id) return { error: 'Choose another villager.' };
      if (target.needs.health < 75) {
        return state.abilities.heal ? { job: 'heal', points: memberPoints(target) } : { error: 'Learn Healing in Research first.' };
      }
      const error = familyIssue(villager, target);
      return error ? { error } : { job: 'family', points: memberPoints(target) };
    }
    if (kind === 'collectible') {
      const asset = assets.registry.get(target.assetId);
      if (!asset.interaction.eligibleLifeStages.includes(villager.lifeStage)) return 'Choose a villager of a different age for this find.';
      const points = mapFacingTile(target.tile);
      return { job: 'collect', points, animation: asset.category === 'butterfly' ? 'catch' : 'gather' };
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
        return puzzleBlocked(puzzle) ? { error: puzzle.hint } : { job: puzzle.job, points: target.interactionPoints };
      }
      return target.id === camp.id ? { job: 'research', points: camp.interactionPoints } : { error: 'This landmark has been restored.' };
    }
    if (kind === 'crop') {
      return state.abilities.farm ? { job: 'farm', points: [target.tile] } : { error: 'Learn Farming in Research first.' };
    }
    const interaction = describeInteraction(target, assets);
    if (interaction.ability && !state.abilities[interaction.ability]) return { error: `Learn ${interaction.ability === 'fish' ? 'Fishing' : interaction.ability} in Research first.` };
    if (target.requires?.includes('bridge_repaired') && !state.worldFlags.repair_bridge) return { error: 'Repair the bridge to reach this fishing spot.' };
    if (target.requires?.includes('fishing_level_2') && (villager.skills.fish || 0) < 3) return { error: 'Try a shallower fishing spot to train first.' };
    if (interaction.type !== 'inspect') {
      if (world.state.objects[target.id]?.amount === 0) return { error: 'This source is empty.' };
      return { job: interaction.type, points: interaction.positions, counter: interaction.counter };
    }
    return { points: interaction.positions };
  }

  function mapFacingTile(tile) {
    return [tile, ...neighbors.map(offset => ({ x: tile.x + offset.x, y: tile.y + offset.y }))];
  }

  function getTarget(ref) {
    const lookup = {
      building: state.buildings, villager: state.villagers, collectible: state.activeCollectibles,
      crop: state.crops,
    };
    const found = lookup[ref.kind]?.find(target => target.id === ref.id) || world.objects.get(ref.id);
    return found && { ...found, kind: ref.kind };
  }

  function assignmentIssue(villager, action) {
    if (action.error) return action.error;
    if (villager.lifeStage === 'baby' || (villager.lifeStage === 'child'
      && action.job && !['gather', 'collect', 'fish'].includes(action.job))) return 'This villager is too young for that job.';
    if (villager.careUntil > state.time.seconds && action.job) return 'This villager is caring for a newborn.';
    if (villager.needs.health < 30 && action.job) return 'This villager needs care before working.';
    return null;
  }

  function setAssignment(villager, target, ref, action, remember) {
    endConversation(villager);
    villager.appearance.heldObject = 'none';
    villager.retryAt = 0;
    villager.leisure = null;
    villager.workBreak = false;
    villager.snakeFlee = false;
    villager.reaction = null;
    villager.work = action.job ? {
      ref, job: action.job, phase: 'approach', counter: action.counter, animation: action.animation,
    } : null;
    const repeatable = reusableJobs.has(action.job) && (!target.puzzleId || target.id === camp.id && action.job === 'research');
    const routine = repeatable ? { ref, job: action.job, counter: action.counter } : null;
    if (remember) {
      villager.preferredJob = routine;
      villager.routine = null;
    } else if (!villager.preferredJob) villager.routine = routine;
  }

  function assign(villager, ref, remember = true) {
    const target = getTarget(ref);
    if (!target) return 'That target is no longer available.';
    const action = plan(target, villager);
    const issue = assignmentIssue(villager, action);
    if (issue) return issue;
    if (!moveVillager(world, villager, action.points || [], ref.id)) return 'No reachable interaction point.';
    setAssignment(villager, target, ref, action, remember);
    return null;
  }

  function land(villager, tile) {
    endConversation(villager);
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
    villager.snakeFlee = false;
    villager.reaction = null;
    const ground = groundContact(villager);
    ground.x = ground.y = ground.vx = ground.vy = 0;
    villager.landedAt = state.time.seconds;
    emitGroundDust(world, villager.position, 0, 0, 4);
    const facing = { up: 'back', down: 'front', left: 'left', right: 'right' };
    if (tile.facing) villager.direction = facing[tile.facing];
  }

  function inspectDrop(villager, tile, ref) {
    const target = ref && getTarget(ref);
    if (!target) {
      if (ref?.kind === 'collectible' && ref.id.startsWith('preview_')) return { issue: 'This find is a developer preview.' };
      return findRoute(world.collision, villager.tile, [tile]) ? { tile }
        : { issue: 'Choose reachable ground to put this villager down.' };
    }
    const action = plan(target, villager);
    const issue = assignmentIssue(villager, action);
    const candidates = action.points || target.interactionPoints
      || (target.kind === 'villager' ? memberPoints(target) : target.kind === 'building' ? buildingPoints(target) : [target.tile || target.standPosition].filter(Boolean));
    const closest = [...candidates].sort((a, b) => distance(a, tile) - distance(b, tile))
      .find(point => findRoute(world.collision, villager.tile, [point]));
    if (!closest) return { issue: 'There is no reachable place to put this villager down.' };
    const delivery = villager.work?.phase === 'deliver' && (target.id === camp.id
      || (target.kind === 'building' && target.type === 'food_storage' && target.state === 'completed'));
    const [label, icon] = delivery ? ['Deliver Supplies', 'icon_done'] : (!issue && dropActions[action.job]) || [];
    return { tile: closest, target, action, issue: delivery ? null : issue, delivery, label, icon };
  }

  function drop(villager, tile, ref) {
    const { tile: landing, target, action, issue, delivery } = inspectDrop(villager, tile, ref);
    if (!landing) return issue;
    const work = villager.work;
    land(villager, landing);
    if (delivery) {
      villager.work = work;
      deliver(villager);
      return null;
    }
    if (issue || !action?.job) {
      villager.reaction = { icon: 'question', until: state.time.seconds + 1.2 };
      return issue || null;
    }
    setAssignment(villager, target, ref, action, true);
    beginWork(villager);
    return null;
  }

  function stop(villager) {
    endConversation(villager);
    villager.work = null;
    villager.preferredJob = null;
    villager.routine = null;
    villager.workBreak = false;
    villager.snakeFlee = false;
    villager.reaction = null;
    villager.appearance.heldObject = 'none';
    villager.activity = 'Idle';
    villager.leisure = null;
    if (!villager.route.length) villager.animation = 'idle';
  }

  function move(villager, tile) {
    if (!moveVillager(world, villager, [tile])) return 'That tile is blocked or unreachable.';
    stop(villager);
    return null;
  }

  function applyPuzzle(target, villager) {
    const { puzzleId } = target;
    const puzzle = landmarks[puzzleId];
    if (state.worldFlags[puzzleId] || puzzleBlocked(puzzle) || !pay(puzzle.cost)) return;
    state.worldFlags[puzzleId] = true;
    state.objects[target.id].state = puzzle.state;
    state.objects[target.id].art = puzzle.art;
    if (puzzleId === 'unblock_spring') {
      state.crops = map.farmingZones[0].tiles.filter((_, index) => index % 9 === 0).slice(0, 8)
        .map(([x, y], index) => ({ id: `crop_${index}`, tile: { x, y }, cropType: map.farmingZones[0].cropTypes[index % 5], stage: 0 }));
    }
    if (puzzleId === 'restore_monument') state.achievements.island_restored = true;
    refreshCollision();
    announce(puzzleId === 'repair_bridge' ? 'The bridge is open. Explore the eastern island.'
      : puzzleId === 'restore_monument' ? 'The ancient monument is restored. Your village can keep growing.'
        : `${villager.name} finished: ${puzzle.label}.`);
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
    return false;
  }

  function haveChild(villager, target) {
    const partner = state.villagers.find(member => member.id === target.id);
    if (!partner || familyIssue(villager, partner) || !pay({ food: 12 })) return;
    const index = clock.nextVillager++;
    const { name, direction, ...appearance } = assets.generateVillager(8100 + index, { stage: 'baby' });
    const id = `villager_${String(index).padStart(3, '0')}`;
    const tile = buildingPoints(completeBuilding('family_house')).find(point => walkable(world.collision, point)) || villager.tile;
    state.villagers.push({
      id, name, age: 0, lifeStage: 'baby', appearance, direction, animation: 'idle',
      tile, position: tileToWorld(tile, tileSize), currentTask: null, route: [], preferredJob: null,
      needs: { hunger: 90, energy: 100, health: 100 }, skills: {}, relationships: { parents: [villager.id, partner.id] },
    });
    initializeVillagerQuirks(state.villagers.at(-1));
    for (const [parent, other] of [[villager, partner], [partner, villager]]) {
      parent.relationships.partner = other.id;
      (parent.relationships.children ??= []).push(id);
    }
    villager.careUntil = state.time.seconds + 30;
    announce(`${villager.name} and ${partner.name} welcomed ${name}.`);
  }

  function collect(target) {
    const index = state.activeCollectibles.findIndex(item => item.id === target.id);
    if (index < 0) return;
    state.activeCollectibles.splice(index, 1);
    const entry = state.collectionProgress[target.assetId];
    entry.discoveryCount++;
    if (!entry.discovered) {
      entry.discovered = true;
      entry.firstDiscoveredAt = state.time.day;
      announce(`Discovered ${assets.registry.get(target.assetId).name}.`);
    }
  }

  function deliveryPoints() {
    const storage = completeBuilding('food_storage');
    if (storage) return [...buildingPoints(storage), ...camp.interactionPoints];
    return camp.interactionPoints;
  }

  function finishWork(villager, target) {
    const { work } = villager;
    const job = work.job;
    villager.skills[job] = (villager.skills[job] || 0) + 1;
    villager.needs.energy = Math.max(0, villager.needs.energy - 6);
    if (target.puzzleId && !state.worldFlags[target.puzzleId]) applyPuzzle(target, villager);
    else if (target.kind === 'building' && job === 'build' && build(target)) {
      work.phase = 'approach';
      return;
    } else if (job === 'research') resources.add('knowledge', target.kind === 'building' ? 3 : 2);
    else if (job === 'heal') {
      const patient = state.villagers.find(member => member.id === target.id);
      if (patient) {
        patient.needs.health = Math.min(100, patient.needs.health + (completeBuilding('healing_hut') ? 75 : 50));
        announce(`${villager.name} cared for ${patient.name}.`);
        if (patient.needs.health < 100) {
          work.phase = 'approach';
          return;
        }
      }
    } else if (job === 'family') haveChild(villager, target);
    else if (job === 'collect') collect(target);
    else if (job === 'farm' && target.stage < 3) {
      state.crops.find(crop => crop.id === target.id).stage++;
    } else if (work.counter || job === 'farm') {
      const counter = work.counter || 'food';
      if (moveVillager(world, villager, deliveryPoints())) {
        work.counter = counter;
        work.phase = 'deliver';
        villager.appearance.heldObject = holding[counter];
        return;
      }
    }
    villager.work = null;
  }

  function deliver(villager) {
    const { work } = villager;
    const source = state.objects[work.ref.id];
    let quantity = jobSkill(villager, work.job)?.rank.capacity ?? 2;
    if (work.job === 'farm') {
      const crop = state.crops.find(item => item.id === work.ref.id);
      quantity = crop?.stage === 3 ? quantity + 5 : 0;
      if (quantity) crop.stage = 0;
    }
    if (Number.isFinite(source?.amount)) {
      quantity = Math.min(source.amount, quantity);
      source.amount -= quantity;
      const object = world.objects.get(work.ref.id);
      if (object.type === 'berry_bush') source.state = source.amount ? 'partial' : 'empty';
      if (object.type === 'tree' && !source.amount) source.state = 'stump';
      if (object.resource.renewable) source.regrowAt ??= state.time.seconds + 35;
    }
    resources.add(work.counter, quantity);
    villager.appearance.heldObject = 'none';
    villager.work = null;
  }

  function routineNeeded(routine) {
    if (routine.counter === 'food' || ['farm', 'fish'].includes(routine.job)) return resources.get('food') < state.villagers.length * 14;
    if (routine.counter === 'wood') return resources.get('wood') < 35;
    if (routine.counter === 'stone') return resources.get('stone') < 25;
    return routine.job === 'research' && resources.get('knowledge') < 35;
  }

  function resumeJob(villager, preference) {
    const returningToBerries = world.objects.get(preference.ref.id)?.type === 'berry_bush';
    const search = returningToBerries ? 'Looking for ripe berries' : preference.counter === 'food' ? 'Looking for food' : 'Waiting for work';
    if (!assign(villager, preference.ref, false)) {
      villager.work.walkLabel = returningToBerries ? 'Returning to the berry bush' : 'Returning to work';
      return;
    }
    if (preference.counter && preference.ref.kind === 'object') {
      const candidates = map.objects.filter(object => state.objects[object.id].amount > 0
        && describeInteraction(object, assets).counter === preference.counter
        && describeInteraction(object, assets).type === preference.job);
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
    if (!villager.preferredJob) villager.routine = null;
    villager.activity = search;
    villager.retryAt = state.time.seconds + 4;
  }

  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function beginWork(villager) {
    const { work } = villager;
    work.phase = 'work';
    work.remaining = 3.2 * (jobSkill(villager, work.job)?.rank.workTime ?? 1);
    villager.activity = labels[work.job];
    villager.animation = work.animation || jobAnimations[work.job] || work.job;
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
    const employed = job => state.villagers.filter(member => member.id !== villager.id
      && (member.work?.job || member.preferredJob?.job || member.routine?.job) === job).length;
    const occupied = id => state.villagers.some(member => member.work?.ref.id === id);
    function tryTargets(kind, targets) {
      return targets.filter(target => !occupied(target.id))
        .sort((a, b) => distance(villager.tile, a.tile || a.standPosition)
          - distance(villager.tile, b.tile || b.standPosition))
        .some(target => !assign(villager, { kind, id: target.id }, false));
    }
    const resourceTargets = job => (sources.get(job) || []).filter(source => state.objects[source.id].amount > 0);
    if (adults && state.abilities.heal && tryTargets('villager', state.villagers.filter(member =>
      member.id !== villager.id && member.needs.health < 65))) return true;
    const foodPerVillager = resources.get('food') / state.villagers.length;
    const foodWorkers = employed('gather') + employed('farm') + employed('fish');
    if (foodWorkers < (foodPerVillager < 6 ? 2 : 1) && foodPerVillager < 14) {
      if (adults && state.abilities.farm && tryTargets('crop', state.crops)) return true;
      if (tryTargets('object', resourceTargets('gather'))) return true;
      if (state.abilities.fish && tryTargets('object', map.fishingSpots)) return true;
    }
    if (!adults) return false;
    if (tryTargets('building', state.buildings.filter(building => building.state !== 'completed'))) return true;
    if (!employed('chop') && resources.get('wood') < 35 && tryTargets('object', resourceTargets('chop'))) return true;
    if (!employed('mine') && resources.get('stone') < 25 && tryTargets('object', resourceTargets('mine'))) return true;
    if (!employed('research') && resources.get('knowledge') < 35) {
      const hut = completeBuilding('research_hut');
      if (hut && tryTargets('building', [hut])) return true;
      if (state.worldFlags.light_campfire && tryTargets('object', [camp])) return true;
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
    const now = state.time.seconds;
    return villager && villager.id !== world.heldVillager && villager.lifeStage !== 'baby'
      && villager.needs.energy >= 45 && villager.needs.health >= 55 && !(villager.careUntil > now)
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

  function conversationActivity(villager) {
    const conversation = villager.conversation;
    if (!conversation) return false;
    const partner = state.villagers.find(member => member.id === conversation.partnerId);
    const elapsed = state.time.seconds - conversation.start;
    if (!canSocialize(villager) || !canSocialize(partner) || partner.conversation?.partnerId !== villager.id
      || elapsed >= villagerGroundTuning.conversationLength) {
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
    return true;
  }

  function leisureActivity(villager) {
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

  function advanceVillager(villager, elapsed) {
    if (world.heldVillager === villager.id) {
      endConversation(villager);
      return;
    }
    if (villager.route.length) {
      villager.activity = villager.snakeFlee ? 'Running from a snake'
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
    if (!work && villager.needs.health < 100 && state.villagers.some(member => member.id !== world.heldVillager
      && member.work?.job === 'heal' && member.work.ref.id === villager.id)) {
      endConversation(villager);
      villager.activity = 'Waiting for care';
      villager.animation = 'sit';
      return;
    }
    const pending = villager.preferredJob || villager.routine || (work?.phase === 'approach' && work);
    if (pending && (villager.workBreak || villager.needs.energy < 45) && (!work || work.phase === 'approach')) {
      endConversation(villager);
      villager.workBreak = true;
      const reason = restReasons[pending.job];
      villager.activity = reason ? `Resting before ${reason}` : 'Taking a work break';
      villager.animation = 'sit';
      villager.needs.energy = Math.min(100, villager.needs.energy + 16 * elapsed);
      if (villager.needs.energy >= 76) villager.workBreak = false;
      return;
    }
    if (work) {
      const target = getTarget(work.ref);
      if (!target || work.phase === 'approach' && work.counter && state.objects[work.ref.id]?.amount === 0) {
        villager.work = null;
        return;
      }
      if (target.kind === 'villager' && distance(villager.tile, target.tile) > 1) {
        if (moveVillager(world, villager, memberPoints(target), target.id)) work.phase = 'approach';
        else {
          villager.work = null;
          announce(`${villager.name} could not reach ${target.name}.`);
        }
        return;
      }
      if (work.phase === 'approach') {
        beginWork(villager);
      }
      villager.activity = labels[work.job];
      villager.animation = work.animation || jobAnimations[work.job] || work.job;
      work.remaining -= elapsed;
      if (work.remaining <= 0) finishWork(villager, target);
      return;
    }
    if (villager.careUntil > state.time.seconds) {
      villager.activity = 'Caring for a newborn';
      villager.animation = 'holdBaby';
      return;
    }
    if (villager.lifeStage !== 'baby' && villager.needs.energy < 45) {
      endConversation(villager);
      villager.activity = 'Resting';
      villager.animation = 'sleep';
      villager.needs.energy = Math.min(100, villager.needs.energy + 6 * elapsed);
      return;
    }
    if (reactToSnake(villager) || conversationActivity(villager)) return;
    if (villager.needs.health >= 55 && leisureActivity(villager)) return;
    villager.animation = villager.needs.health < 55 && villager.lifeStage !== 'baby' ? 'sick' : 'idle';
    if (villager.retryAt > state.time.seconds) return;
    villager.activity = villager.needs.health < 55 ? 'Unwell' : 'Idle';
    const repeat = villager.preferredJob || villager.routine;
    if (repeat && (villager.preferredJob || villager.needs.health >= 55 && routineNeeded(repeat))) {
      resumeJob(villager, repeat);
      return;
    }
    villager.routine = null;
    if (villager.lifeStage === 'baby' || villager.needs.health < 55) return;
    villager.retryAt = state.time.seconds + 2;
    if (chooseChore(villager)) return;
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
    const learned = Object.keys(researchProjects).filter(id => state.abilities[id]).length;
    const requirements = {
      research_level_1: learned >= 1, research_level_2: learned >= 2, research_level_3: learned >= 3,
      cave_unlocked: state.worldFlags.light_cave, bridge_repaired: state.worldFlags.repair_bridge,
      flower_garden_restored: state.worldFlags.restore_garden,
    };
    const zonesFor = asset => asset.id === 'butterfly_moonlight' ? ['garden_zone_001'] : asset.spawn.mapZoneIds;
    const candidates = assets.collectibles.filter(asset => !active.has(asset.id)
      && (asset.spawn.timeOfDay.includes('any') || asset.spawn.timeOfDay.includes(day))
      && (asset.spawn.weather.includes('any') || asset.spawn.weather.includes(state.weather.current))
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

  function advance(elapsed) {
    const now = state.time.seconds;
    if (now >= clock.nextNeeds) {
      clock.nextNeeds += 12;
      for (const villager of state.villagers) {
        villager.needs.hunger = Math.max(0, villager.needs.hunger - (villager.lifeStage === 'baby' ? 7 : 12));
        if (villager.needs.hunger <= 70 && pay({ food: 1 })) villager.needs.hunger += 25;
        if (villager.needs.hunger <= 20) villager.needs.health = Math.max(10, villager.needs.health - 7);
      }
    }
    if (now >= clock.nextIllness) {
      clock.nextIllness += 110;
      const villager = state.villagers.filter(member => member.lifeStage !== 'baby')
        .sort((a, b) => a.needs.health - b.needs.health)[0];
      if (villager?.needs.health >= 75) {
        villager.needs.health = 58;
        announce(`${villager.name} is unwell. Drop another villager onto them to offer care.`);
      }
    }
    if (now >= clock.nextBirthday) {
      clock.nextBirthday += 180;
      for (const villager of state.villagers) {
        villager.age++;
        const stage = villager.age < 2 ? 'baby' : villager.age < 18 ? 'child' : villager.age < 65 ? 'adult' : 'elder';
        if (stage !== villager.lifeStage) {
          stop(villager);
          villager.lifeStage = stage;
          announce(`${villager.name} is now ${stage === 'adult' || stage === 'elder' ? 'an' : 'a'} ${stage}.`);
        }
      }
      const deceased = state.villagers.filter(villager => villager.age >= 90);
      if (deceased.length) {
        const ids = new Set(deceased.map(villager => villager.id));
        state.villagers = state.villagers.filter(villager => !ids.has(villager.id));
        for (const villager of state.villagers) {
          if (ids.has(villager.relationships.partner)) delete villager.relationships.partner;
        }
        for (const villager of deceased) announce(`${villager.name} passed away at age ${villager.age}.`);
      }
    }
    if (now >= clock.nextWeather) {
      clock.weatherChanges = (clock.weatherChanges || 0) + 1;
      state.weather.current = state.weather.current === 'clear' ? 'rain' : 'clear';
      clock.nextWeather += state.weather.current === 'clear' ? 145 + clock.weatherChanges % 4 * 10 : 38;
    }
    if (now >= clock.nextCollectible) {
      clock.nextCollectible += 17;
      spawnCollectible();
    }
    for (const object of map.objects) {
      const resource = state.objects[object.id];
      if (resource.regrowAt && resource.regrowAt <= now) {
        resource.amount = object.resource.maxAmount;
        resource.state = object.state;
        delete resource.regrowAt;
      }
    }
    state.villagers.slice().forEach(villager => advanceVillager(villager, elapsed));
  }

  state.crops ??= [];
  state.villagers.forEach(initializeVillagerQuirks);
  const gameplay = {
    advance, inspectDrop, assign(villager, ref) {
      const result = assign(villager, ref);
      if (!result) villager.appearance.heldObject = 'none';
      return result;
    }, move(villager, tile) {
      const result = move(villager, tile);
      if (!result) villager.appearance.heldObject = 'none';
      return result;
    }, drop, place, research, stop(villager) {
      if (villager.route.length) moveVillager(world, villager, [villager.tile]);
      stop(villager);
      villager.retryAt = state.time.seconds + 12;
    }, refreshCollision,
    get revision() { return revision; },
    subscribe(listener) { listeners.add(listener); },
  };
  refreshCollision();
  world.gameplay = gameplay;
  return gameplay;
}
