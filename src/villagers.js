export const SKILL_CONFIG = {
  levelsPerTier: 10,
  masterLevelSpan: 10,
  needThresholds: { high: 65, mid: 35 },
};

export const villagerSkills = {
  gathering: { label: 'Gathering', jobs: ['gather', 'chop', 'mine', 'farm', 'fish'] },
  building: { label: 'Building', jobs: ['build'] },
  research: { label: 'Research', jobs: ['research'] },
  healing: { label: 'Healing', jobs: ['heal'] },
};

const ranks = [
  { name: 'Trainee', threshold: 0, workTime: 1, capacity: 2 },
  { name: 'Adept', threshold: 5, workTime: 0.82, capacity: 3 },
  { name: 'Master', threshold: 14, workTime: 0.65, capacity: 5 },
];

export function skillLevelInTier(xp, rank, next, config = SKILL_CONFIG) {
  const maxLevel = config.levelsPerTier;
  const localXp = Math.max(0, xp - rank.threshold);
  if (next) {
    const span = Math.max(1, next.threshold - rank.threshold);
    if (span === 1) return maxLevel;
    return Math.max(1, Math.min(maxLevel, 1 + Math.round((localXp / (span - 1)) * (maxLevel - 1))));
  }
  const masterSpan = Math.max(2, config.masterLevelSpan);
  return Math.max(1, Math.min(maxLevel, 1 + Math.round((Math.min(localXp, masterSpan - 1) / (masterSpan - 1)) * (maxLevel - 1))));
}

export function skillProgress(villager, skill, config = SKILL_CONFIG) {
  const xp = villagerSkills[skill].jobs.reduce((total, job) => total + (villager.skills?.[job] ?? 0), 0);
  const tier = ranks.findLastIndex(rank => xp >= rank.threshold);
  const rank = ranks[tier];
  const next = ranks[tier + 1];
  const progress = next ? (xp - rank.threshold) / (next.threshold - rank.threshold) : 1;
  const maxLevel = config.levelsPerTier;
  const level = skillLevelInTier(xp, rank, next, config);
  return { xp, tier, rank, next, progress, level, maxLevel };
}

export function needStatus(value, config = SKILL_CONFIG) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const tone = clamped >= config.needThresholds.high ? 'good'
    : clamped >= config.needThresholds.mid ? 'warn' : 'low';
  return { value: clamped, tone };
}

export function jobSkill(villager, job) {
  const skill = Object.keys(villagerSkills).find(key => villagerSkills[key].jobs.includes(job));
  return skill ? skillProgress(villager, skill) : null;
}

export const villagerQuirks = {
  snakeShy: 'Afraid of Snakes',
  fastWalker: 'Fast Walker',
  curious: 'Curious',
};

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
  if (reaction?.until > seconds && reactionFaces[reaction.icon]) return reactionFaces[reaction.icon];
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
      villager.skills[job] = Math.max(villager.skills[job] || 0, 25);
    }
  }
  villager.needs.health = 100;
  villager.needs.hunger = 100;
  villager.needs.energy = 100;
  delete villager.illness;
  villager.special = { ...(villager.special || {}), champion: true };
  return true;
}
