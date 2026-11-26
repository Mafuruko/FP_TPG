import { CLOCK_CONFIG } from './climate.js';

const day = CLOCK_CONFIG.dayLengthSeconds;

export const survival = {
  mealInterval: 12, mealValue: 25, mealAt: 70, hungerUse: { baby: 9, child: 13, adult: 17, elder: 15 },
  pregnancyFood: 3, nursingFood: 2, lowReserve: 0.8, criticalReserve: 0.30, familyReserve: 1.25,
  starvationAt: 20, starvationGrace: 24, starvationDamage: 9,
  berryCapacity: 14, berryRegrowSeconds: 105, berryRegrowAmount: 4, otherFoodRegrowSeconds: 80,
  fishingBonus: 1, cropBonus: 7,
  cropGrowthSeconds: [18, 24],
  treatmentSeconds: 7.5, treatmentHealthFraction: 0.35, treatmentReliefFraction: 0.60,
  recoverySeconds: 32, immunitySeconds: 0.75 * day, illnessCadence: 2 * day,
  rainyIllnessCadence: 1.25 * day, seriousAt: 45, criticalAt: 75,
  illnessGrowth: 0.16, mildRecovery: 0.32, illnessDrain: { mild: 0.05, serious: 0.19, critical: 0.52 },
  illnessRain: [0.08, 0.18], illnessHungry: 0.22, illnessElder: 0.05,
  healingHutPower: 25, warningCooldown: 70,
  tutorialFloor: 25, tutorialIllnessHealth: 64, tutorialIllnessDrain: 0.16,
  contagionInterval: 12, contagionExposure: 48, contagionRadius: 2,
  familiarityReady: 3, familiarityCooldown: 32, togetherSeconds: 5,
  settlerCooldown: 3 * day,
  pregnancySeconds: 2.25 * day, familyCooldown: 3 * day,
  carriedSeconds: 1.25 * day, babySeconds: 3.5 * day, childSeconds: 6 * day,
  adultSeconds: 30 * day, elderMinSeconds: 8 * day, elderVariationSeconds: 5 * day,
  nurseryRadius: 3, heavyWork: new Set(['build', 'chop', 'mine', 'fish']), memorialEnergy: 4,
  newbornJobs: new Set(['gather', 'research', 'collect', 'mourn']),
};

export function dailyFood(state) {
  const total = state.villagers.reduce((use, villager) => use + foodUse(villager), 0);
  return foodPerDay(total);
}

export const foodPerDay = hunger => hunger * day / survival.mealInterval / survival.mealValue;

export function foodUse(villager) {
  return survival.hungerUse[villager.lifeStage] + (villager.pregnancy ? survival.pregnancyFood : 0)
    + (villager.carryingBaby ? survival.nursingFood : 0);
}

export function sourceCapacity(object) {
  return object.type === 'berry_bush' ? survival.berryCapacity : object.resource.maxAmount;
}

export function foodSecurity(state) {
  const daily = dailyFood(state);
  const reserve = daily ? state.resources.food / daily : Infinity;
  return { daily, reserve, status: reserve <= survival.criticalReserve ? 'critical' : reserve <= survival.lowReserve ? 'low' : 'steady' };
}

export function illnessSeverity(villager) {
  if (!villager.illness) return null;
  const burden = villager.illness.burden ?? survival.seriousAt;
  return burden >= survival.criticalAt ? 'critical' : burden >= survival.seriousAt ? 'serious' : 'mild';
}

export function treatmentEffects(power) {
  return { recovery: power * survival.treatmentHealthFraction, relief: power * survival.treatmentReliefFraction };
}

export function phaseDuration(villager) {
  if (villager.lifeStage === 'baby') return survival.babySeconds;
  if (villager.lifeStage === 'child') return survival.childSeconds;
  if (villager.lifeStage === 'adult') return survival.adultSeconds;
  return survival.elderMinSeconds + ((villager.appearance.seed >>> 0) % 101) / 100 * survival.elderVariationSeconds;
}

export function timeToMilestone(state, villager) {
  const duration = villager.lifeStage === 'baby' && villager.development === 'carried'
    ? survival.carriedSeconds : phaseDuration(villager);
  return Math.max(0, ((villager.stageSince ?? state.time.seconds) + duration - state.time.seconds) / day);
}

export function initializeSurvival(state) {
  const now = state.time.seconds;
  const ids = new Set(state.villagers.map(member => member.id));
  const founderIds = state.villagers.slice(0, 2).filter(member => !member.relationships.parents?.length).map(member => member.id);
  const legacy = !state.world.survivalVersion;
  state.story.generationalMilestone ??= state.villagers.some(member => member.relationships.parents?.length
    && ['adult', 'elder'].includes(member.lifeStage));
  for (const villager of state.villagers) {
    if (villager.relationships.partner && !ids.has(villager.relationships.partner)) delete villager.relationships.partner;
    villager.founder ??= legacy && founderIds.includes(villager.id) && /^villager_00[12]$/.test(villager.id);
    const rosterNumber = /^villager_(\d+)$/.exec(villager.id)?.[1];
    villager.sex ??= (Number(rosterNumber ?? villager.appearance.seed) % 2) ? 'female' : 'male';
    if (villager.stageSince == null) {
      const start = { baby: 0, child: 2, adult: 18, elder: 65 }[villager.lifeStage];
      const span = { baby: 2, child: 16, adult: 47, elder: 25 }[villager.lifeStage];
      const progress = Math.min(0.65, Math.max(0, (villager.age - start) / span));
      villager.stageSince = now - (villager.founder ? 0 : progress) * phaseDuration(villager);
      villager.stageAge = villager.founder ? villager.age : start;
      if (villager.lifeStage === 'baby') {
        villager.development = progress * survival.babySeconds >= survival.carriedSeconds ? 'crawling' : 'carried';
        villager.nursery = { ...villager.tile };
      }
    }
    if (villager.illness) {
      villager.illness.burden ??= villager.illness.tutorialSafe ? 32 : villager.needs.health <= 26 ? 76 : 48;
      villager.illness.nextExposureAt ??= now + survival.contagionInterval;
    }
    if (legacy && (villager.work?.job === 'family' || villager.lifeStage === 'baby')) {
      villager.work = null;
      villager.route = [];
      villager.currentTask = null;
      villager.animation = 'idle';
    }
    if (legacy && villager.work?.job === 'heal' && villager.work.phase === 'work') {
      villager.work.remaining = villager.work.duration = survival.treatmentSeconds;
    }
    delete villager.careUntil;
  }
  if (legacy) {
    state.simulation.nextNeeds = now + survival.mealInterval;
    state.simulation.nextIllness = now + survival.illnessCadence;
    delete state.simulation.nextBirthday;
  }
  state.world.survivalVersion = 1;
}
