// Existing canonical IDs, core book pp. 93 and 95. Size restrictions remain descriptive.
// TODO: enforce small/large object limits only when Items have a rules-backed size field;
// weight alone cannot determine whether an object fits in a particular bag.
export const CORE_CONTAINERS = {
  "gear.bag": { capacity: 20, properties: "Для маленьких предметов" },
  "gear.belt-pouch": { capacity: 5, properties: "Для маленьких предметов" },
  "gear.bandolier": { capacity: 25, properties: "Для маленьких предметов; крупные предметы крепятся снаружи" },
  "shoulder-bag": { capacity: 30, properties: "Для небольших предметов" },
  "gear.basket": { capacity: 15, properties: "Для небольших предметов" },
  "gear.hidden-pocket": { capacity: 5, properties: "Для маленьких предметов" },
  // Zero means the book gives no kg limit; contents restrictions remain descriptive.
  "gear.bow-case": { capacity: 0, properties: "Для лука и стрел" },
  "gear.thigh-sheath": { capacity: 0, properties: "Для клинка" },
  "gear.wrist-sheath": { capacity: 0, properties: "Для небольшого клинка" },
  "gear.wooden-chest": { capacity: 30, properties: "Для небольших предметов" },
  "gear.large-wooden-chest": { capacity: 50, properties: "Для крупных предметов" }
};
export function upgradeLegacyContainer(source) {
  const defaults = CORE_CONTAINERS[source.ruleId];
  if (defaults && source.capacity === undefined && (!source.kind || source.kind === "gear") && (source.quantity ?? 1) <= 1) {
    source.kind = "container";
    source.capacity = defaults.capacity;
    source.properties ||= defaults.properties;
  }
  return source;
}
