export const islandNameLimit = 36;
export const villagerNameLimit = 24;
const founderSexes = ['female', 'male'];

export const founderChoices = {
  bodyStyle: { label: 'Body', options: [['style_01', 'Style 1'], ['style_02', 'Style 2']] },
  skinTone: { label: 'Skin tone', options: Array.from({ length: 6 }, (_, i) => [`skin_0${i + 1}`, `Tone ${i + 1}`]) },
  hairStyle: { label: 'Hair style', options: ['short', 'messy', 'curly', 'long', 'ponytail', 'braid', 'bun', 'bob', 'bald', 'receding'] },
  hairColor: { label: 'Hair color', options: ['black', 'dark_brown', 'brown', 'auburn', 'blonde', 'ginger', 'gray', 'white'] },
  clothingStyle: { label: 'Clothing', options: ['tunic', 'sleeveless', 'farmer', 'dress', 'wrap', 'researcher'] },
  accessory: { label: 'Accessory', options: ['', 'flower', 'headband', 'hat', 'bag', 'beard', 'necklace', 'stick', 'bandana'] },
};
export const founderColors = { primaryColor: 'Outfit color', secondaryColor: 'Trim color' };

export function createIslandDraft(template, slot) {
  return {
    name: `Island ${slot}`,
    villagers: template.villagers.slice(0, 2).map(({ name, appearance }, index) => ({
      name,
      sex: founderSexes[index],
      ...Object.fromEntries(Object.keys(founderChoices).filter(key => key !== 'accessory').map(key => [key, appearance[key]])),
      ...Object.fromEntries(Object.keys(founderColors).map(key => [key, appearance[key]])),
      accessory: appearance.accessories[0] ?? '',
    })),
  };
}

export function founderAppearance(founder) {
  const appearance = Object.fromEntries([...Object.keys(founderChoices), ...Object.keys(founderColors)]
    .filter(key => key !== 'accessory').map(key => [key, founder[key]]));
  return { ...appearance, accessories: founder.accessory ? [founder.accessory] : [] };
}

function cleanName(name, limit) {
  return typeof name === 'string' ? [...name.trim()].slice(0, limit).join('') : '';
}

export function createStartingIsland(template, draft) {
  const name = cleanName(draft?.name, islandNameLimit);
  if (!name || !Array.isArray(draft.villagers) || draft.villagers.length !== 2) return null;
  const choices = Object.entries(founderChoices);
  for (const founder of draft.villagers) {
    if (!cleanName(founder?.name, villagerNameLimit)
      || !choices.every(([key, { options }]) => options.some(option => (Array.isArray(option) ? option[0] : option) === founder[key]))
      || !Object.keys(founderColors).every(key => /^#[\da-f]{6}$/i.test(founder[key]))) return null;
  }
  const state = structuredClone(template);
  state.world.name = name;
  state.villagers = state.villagers.slice(0, 2).map((base, index) => ({
    ...base,
    name: cleanName(draft.villagers[index].name, villagerNameLimit),
    sex: founderSexes[index],
    appearance: { ...base.appearance, ...founderAppearance(draft.villagers[index]) },
  }));
  return state;
}
