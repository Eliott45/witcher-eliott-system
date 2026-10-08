import { RELIC_ARMOR_LORE } from "./relic-armor.mjs";
import { RELIC_WEAPON_LORE } from "./relic-weapons.mjs";

/** A stable rule ID, rather than a translated or user-edited name, identifies a legend. */
export const relicLore = item => item?.type === "armor" ? RELIC_ARMOR_LORE[item.system?.ruleId] ?? null
  : item?.type === "weapon" ? RELIC_WEAPON_LORE[item.system?.ruleId] ?? null : null;
