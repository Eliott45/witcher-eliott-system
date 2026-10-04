export const rarity = code => ({ e: "everywhere", c: "common", r: "rare", u: "unique" })[code];

/** Shared table importer; IDs and source references belong to each catalogue. */
export function weaponRecord(documentId, row, source) {
  const [id, name, skill, damageType, accuracy, rare, damage, reliability, hands, range, bodyRange, concealment, slots, weight, price, properties = "", category = "melee", encumbrance = 0] = row;
  return { id: `weapon.${id}`, documentId, type: "weapon", name, source: "weapons", system: {
    skill, damageType, accuracy, rarity: rarity(rare), damage, reliability: { value: reliability, max: reliability }, hands,
    range, rangeBodyMultiplier: bodyRange, concealment, enhancementSlots: slots, weight, price, properties, category, encumbrance, source } };
}
