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

export function skillProgress(villager, skill) {
  const xp = villagerSkills[skill].jobs.reduce((total, job) => total + (villager.skills?.[job] ?? 0), 0);
  const tier = ranks.findLastIndex(rank => xp >= rank.threshold);
  const rank = ranks[tier];
  const next = ranks[tier + 1];
  const progress = next ? (xp - rank.threshold) / (next.threshold - rank.threshold) : 1;
  return { xp, tier, rank, next, progress };
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
