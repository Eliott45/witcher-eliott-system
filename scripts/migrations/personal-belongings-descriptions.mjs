import { RANDOM_LOOT_TABLES, legacyRandomLootDescription } from "../data/random-loot.mjs";

// Possessions rolled before the table had prose carry a citation-only paragraph, which the sheet hides.
const LEGACY = new Map(Object.entries(RANDOM_LOOT_TABLES).flatMap(([category, entries]) => entries
  .filter(entry => !entry.documentId).map(entry => [legacyRandomLootDescription(category, entry.name), entry])));

export function personalBelongingsDescriptionUpdate(item) {
  if (item.type !== "equipment" || item.system?.ruleId) return {};
  const entry = LEGACY.get(String(item.system?.description ?? "").trim());
  if (!entry || item.name !== entry.name) return {};
  return { "system.description": entry.description, ...(item.system.source ? {} : { "system.source": entry.source }) };
}
