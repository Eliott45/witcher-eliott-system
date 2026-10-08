// Core pp.264–265: these checks recall the legends; wearing the armor does not require identification.
export const RELIC_ARMOR_LORE = Object.freeze({
  "armor.raven": { dc: 14, page: 264 },
  "armor.mountain-folk": { dc: 16, page: 265 },
  "armor.draug": { dc: 18, page: 265 }
});

export const relicArmorLore = item => item?.type === "armor" ? RELIC_ARMOR_LORE[item.system?.ruleId] ?? null : null;
