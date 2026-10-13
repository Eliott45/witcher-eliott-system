import { RADOLF_POTIONS } from "../data/radolf-additions.mjs";

/** Replace the former unspecified weight while preserving custom weights and description notes. */
export function radolfPotionContentUpdate(item) {
  const entry = RADOLF_POTIONS.find(entry => entry.id === item.system?.ruleId);
  if (item.type !== "equipment" || !entry) return {};
  const update = {};
  if (item.system.weight === 0) update["system.weight"] = entry.system.weight;
  const description = item.system.description ?? "";
  const cleaned = description.replace(/\s*Масса в дополнении не указана\./gu, "");
  if (cleaned !== description) update["system.description"] = cleaned;
  return update;
}
