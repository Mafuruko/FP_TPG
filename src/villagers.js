import { survival, treatmentEffects } from './survival.js';

export const SKILL_CONFIG = {
  levelsPerTier: 10,
  thresholds: [0, 18, 54, 114],
  levelFractions: [0, 0.055, 0.11, 0.22, 0.33, 0.44, 0.55, 0.67, 0.78, 0.89],
  needThresholds: { high: 65, mid: 35 },
};

export const villagerWorkTuning = {
  cycleSeconds: 3.2, cycleEnergy: 6, restBelow: 45, restUntil: 76,
  lowFed: 35, tiredRate: 0.85, restRecovery: 13, shelteredRecovery: 17, restRadius: 6,
  retrySeconds: 4, decisionSeconds: 2, stopSeconds: 12, quietAtCamp: 3, talkRecovery: 1.1,
  woodFloor: 35, stoneFloor: 25, knowledgeFloor: 35,
  healXpPerHealth: 20, healCureXp: 4, memorialComfortCooldown: 60,
  fastWalker: 1.15, curiousResearch: 1.08,
};

export const villagerSkills = {
  gathering: { label: 'Gathering', jobs: ['gather', 'chop', 'mine', 'farm', 'fish'],
    bonuses: [{ workTime: 1, capacity: 2 }, { workTime: 0.90, capacity: 3 }, { workTime: 0.80, capacity: 5 }] },
  building: { label: 'Building', jobs: ['build'], bonuses: [{ workTime: 1 }, { workTime: 0.86 }, { workTime: 0.72 }] },
  research: { label: 'Research', jobs: ['research'], bonuses: [{ knowledge: 0 }, { knowledge: 1 }, { knowledge: 2 }] },
  healing: { label: 'Healing', jobs: ['heal'], bonuses: [{ treatment: 50 }, { treatment: 62 }, { treatment: 75 }] },
};

const rankNames = ['Trainee', 'Adept', 'Master'];
const skillByJob = new Map(Object.entries(villagerSkills).flatMap(([skill, def]) => def.jobs.map(job => [job, skill])));
export const skillForJob = job => skillByJob.get(job);

export function skillProgress(villager, skill, config = SKILL_CONFIG) {
  const { jobs, bonuses } = villagerSkills[skill];
  const xp = jobs.reduce((total, job) => total + (villager.skills?.[job] ?? 0), 0);
  const tier = rankNames.findLastIndex((_, index) => xp >= config.thresholds[index]);
  const rankAt = index => ({ name: rankNames[index], threshold: config.thresholds[index], workTime: 1, ...bonuses[index] });
  const rank = rankAt(tier);
  const next = tier < rankNames.length - 1 ? rankAt(tier + 1) : null;
  const goal = config.thresholds[tier + 1];
  const progress = Math.min(1, (xp - rank.threshold) / (goal - rank.threshold));
  const maxLevel = config.levelsPerTier;
  const level = 1 + config.levelFractions.findLastIndex(fraction => xp - rank.threshold >= Math.round(fraction * (goal - rank.threshold)));
  return { xp, tier, rank, next, goal, progress, level, maxLevel };
}

export function skillBenefits(skill, rank) {
  if (skill === 'gathering') return `Carries ${rank.capacity} per trip · ${Math.round(rank.workTime * 100)}% cycle time`;
  if (skill === 'building') return `${Math.round(rank.workTime * 100)}% construction cycle time`;
  if (skill === 'research') return `${2 + rank.knowledge} Knowledge at camp · ${3 + rank.knowledge} at hut`;
  const normal = treatmentEffects(rank.treatment);
  const hut = treatmentEffects(rank.treatment + survival.healingHutPower);
  return `+${normal.recovery.toFixed(1)} Health, −${normal.relief.toFixed(1)} illness · With hut +${hut.recovery.toFixed(1)} Health, −${hut.relief.toFixed(1)} illness`;
}

export function needStatus(value, config = SKILL_CONFIG) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const tone = clamped >= config.needThresholds.high ? 'good'
    : clamped >= config.needThresholds.mid ? 'warn' : 'low';
  return { value: clamped, tone };
}

export function jobSkill(villager, job) {
  const skill = skillForJob(job);
  return skill ? skillProgress(villager, skill) : null;
}

export const villagerQuirks = {
  snakeShy: 'Afraid of Snakes',
  fastWalker: 'Fast Walker',
  curious: 'Curious',
};

export const quirkBenefits = {
  snakeShy: 'Briefly flees nearby snakes during free time, then returns to their routine.',
  fastWalker: `Walks and hauls ${Math.round((villagerWorkTuning.fastWalker - 1) * 100)}% faster.`,
  curious: `Studies ${Math.round((villagerWorkTuning.curiousResearch - 1) * 100)}% faster and visits nearby landmarks.`,
};

export function initializeVillagerProgress(villager) {
  if (villager.workPreference !== 'rest' && !Object.hasOwn(villagerSkills, villager.workPreference)) villager.workPreference = 'auto';
  if (villager.skillVersion === 2) return;
  const old = [0, 5, 14, 24];
  for (const [skill, { jobs }] of Object.entries(villagerSkills)) {
    const { xp } = skillProgress(villager, skill);
    if (!xp) continue;
    const tier = old.slice(0, 3).findLastIndex(threshold => xp >= threshold);
    const { thresholds } = SKILL_CONFIG;
    const converted = thresholds[tier] + Math.floor((xp - old[tier]) *
      (thresholds[tier + 1] - thresholds[tier]) / (old[tier + 1] - old[tier]));
    // Credit migration to the first job so fishing practice still uses its own completed trips.
    villager.skills[jobs[0]] = (villager.skills[jobs[0]] || 0) + converted - xp;
  }
  villager.skillVersion = 2;
}

export function initializeVillagerQuirks(villager) {
  if (Array.isArray(villager.quirks)) return;
  const names = Object.keys(villagerQuirks);
  const seed = villager.appearance.seed >>> 0;
  const first = seed % names.length;
  villager.quirks = [names[first]];
  if (seed % 4 === 1) villager.quirks.push(names[(first + 1 + Math.floor(seed / 4) % (names.length - 1)) % names.length]);
}

export function jobVisual(villager) {
  const { work } = villager;
  if (!work || work.phase === 'approach') return null;
  return jobSkill(villager, work.job);
}

const reactionFaces = {
  question: 'confused', warn: 'worried', danger: 'worried',
  sick: 'sad', happy: 'happy', love: 'happy',
};

export function villagerPortraitExpression(villager) {
  return villager.appearance.expression === 'happy' ? 'happy' : 'neutral';
}

export function villagerExpression(villager, seconds) {
  const { animation, appearance, conversation, illness, needs, reaction, snakeFlee, work } = villager;
  const reactionFace = reaction?.expression || reactionFaces[reaction?.icon];
  if (reaction?.until > seconds && reactionFace) return reactionFace;
  if (snakeFlee) return 'worried';
  if (illness || needs.health < 55) return 'sad';
  if (animation === 'sleep' || needs.energy < 40) return 'tired';
  if (animation === 'eat' || animation === 'holdBaby' || animation === 'celebrate' || animation === 'talk') return 'happy';
  if (conversation) return 'neutral';
  if (work?.phase === 'work' || animation === 'investigate') return 'focused';
  if (animation === 'idle' || animation === 'sit') {
    const seed = appearance.seed >>> 0;
    const cycle = 9 + seed % 6;
    const smile = villagerPortraitExpression(villager) === 'happy' ? 3 : 1.8;
    if ((seconds + seed % 97 / 7) % cycle < smile) return 'happy';
  }
  return 'neutral';
}

export function villagerBlink(villager, seconds) {
  const seed = villager.appearance.seed >>> 0;
  const cycle = 4.2 + seed % 19 / 10;
  return (seconds + seed % 127 / 23) % cycle >= cycle - 0.14;
}

const GOLD_RAMP = [
  [0.0, [52, 34, 8]],
  [0.18, [104, 68, 12]],
  [0.42, [196, 138, 26]],
  [0.68, [242, 198, 66]],
  [0.88, [255, 232, 134]],
  [1.0, [255, 249, 206]],
];

const toHexByte = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

/**
 * Pure math-based luminance-to-gold recolor for the Lone Survivor golden villager skin.
 * Remaps every #RGB / #RRGGBB hex color onto a metallic gold gradient while preserving outlines.
 */
export function recolorSvgToGold(svg) {
  if (!svg || typeof svg !== 'string') return svg;
  return svg.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (_, hex) => {
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    let lo = GOLD_RAMP[0];
    let hi = GOLD_RAMP[GOLD_RAMP.length - 1];
    for (let i = 0; i < GOLD_RAMP.length - 1; i++) {
      if (lum >= GOLD_RAMP[i][0] && lum <= GOLD_RAMP[i + 1][0]) {
        lo = GOLD_RAMP[i];
        hi = GOLD_RAMP[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, hi[0] - lo[0]);
    const t = Math.max(0, Math.min(1, (lum - lo[0]) / span));
    const nr = lo[1][0] + (hi[1][0] - lo[1][0]) * t;
    const ng = lo[1][1] + (hi[1][1] - lo[1][1]) * t;
    const nb = lo[1][2] + (hi[1][2] - lo[1][2]) * t;
    return `#${toHexByte(nr)}${toHexByte(ng)}${toHexByte(nb)}`;
  });
}

/**
 * Promotes a chosen villager into the Speedrun Champion (maxed skills, full needs, 10x speed).
 */
export function promoteToChampion(villager) {
  if (!villager) return false;
  villager.skills ??= {};
  for (const def of Object.values(villagerSkills)) {
    for (const job of def.jobs) {
      villager.skills[job] = Math.max(villager.skills[job] || 0, SKILL_CONFIG.thresholds.at(-1));
    }
  }
  villager.needs.health = 100;
  villager.needs.hunger = 100;
  villager.needs.energy = 100;
  delete villager.illness;
  villager.special = { ...(villager.special || {}), champion: true };
  return true;
}
