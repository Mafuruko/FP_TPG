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
