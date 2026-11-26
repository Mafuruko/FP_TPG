export const researchProjects = {
  farm: { cost: 12, flag: 'unblock_spring', hint: 'Clear the freshwater spring.' },
  fish: { cost: 18, flag: 'restore_garden', hint: 'Restore the garden and observe the shoreline wildlife it attracts.' },
  heal: { cost: 10, hint: 'Learn to care for sick and injured villagers.' },
  advanced_construction: { cost: 24, hint: 'Learn to repair the eastern bridge.' },
  ancient_knowledge: { cost: 28, flag: 'light_cave', hint: 'Investigate the dark cave.' },
};

export const construction = {
  house: { wood: 10, stone: 4 },
  family_house: { wood: 18, stone: 8 },
  food_storage: { wood: 12, stone: 4 },
  research_hut: { wood: 14, stone: 6 },
  healing_hut: { wood: 12, stone: 6 },
};

export const landmarks = {
  light_campfire: {
    label: 'Light the campfire', hint: 'Bring 4 Wood to the stone ring. A lit camp is somewhere to share what you learn.',
    cost: { wood: 4 }, state: 'lit', art: 'building:campfire_lit', job: 'build',
  },
  unblock_spring: {
    label: 'Restore the spring', hint: 'Light the campfire, then bring 5 Stone to brace the spring outlet.',
    cost: { stone: 5 }, flags: ['light_campfire'], state: 'clear', art: 'spring_clear', job: 'build', dropLabel: 'Restore Spring',
  },
  restore_garden: {
    label: 'Restore the garden', hint: 'Bring 6 Wood and 4 Food after learning Farming.',
    cost: { wood: 6, food: 4 }, ability: 'farm', state: 'restored', job: 'farm',
  },
  repair_bridge: {
    label: 'Repair the eastern bridge', hint: 'Learn Advanced construction. The repairs use 14 Wood and 8 Stone.',
    cost: { wood: 14, stone: 8 }, ability: 'advanced_construction', state: 'repaired', job: 'build',
  },
  light_cave: {
    label: 'Investigate the cave', hint: 'A lit campfire and 5 Wood will help you explore the cave.',
    cost: { wood: 5 }, flags: ['light_campfire'], state: 'unlocked', job: 'investigate',
  },
  open_waterfall_passage: {
    label: 'Read the marks by the waterfall', hint: 'Learn Ancient knowledge and bring a villager to study the waterfall.',
    ability: 'ancient_knowledge', state: 'unlocked', job: 'investigate',
  },
  restore_monument: {
    label: 'Restore the island monument', hint: 'Read the waterfall marks, restore the garden, and bring 12 Stone and 8 Wood.',
    flags: ['open_waterfall_passage', 'restore_garden'], cost: { stone: 12, wood: 8 },
    ability: 'ancient_knowledge', state: 'restored', job: 'build',
  },
};

export function costLabel(cost = {}) {
  return Object.entries(cost).map(([key, value]) => `${value} ${key[0].toUpperCase() + key.slice(1)}`).join(' · ');
}
