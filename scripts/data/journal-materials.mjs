// Monster Hunter's Journal pp.142–143 «Компоненты»: substance, weight and price of one unit, and where it comes from.
// Only the components dropped by bestiary creatures are listed; add the rest together with their creatures.
// Components already shipped as unpriced school-gear placeholders keep their ids and documents and gain the data.
export const JOURNAL_SOURCE = "Дневник охотника на чудовищ";
export const JOURNAL_COMPONENTS = {
  "bullvore-eyes": ["vitriol", 0.5, 87, "Утковолы"],
  "bullvore-blood": ["rebis", 0.1, 85, "Утковолы"],
  "bullvore-brain": ["fulgur", 1, 150, "Утковолы"],
  "rotfiend-blood": ["rebis", 0.1, 30, "Гнильцы"],
  // Hides (p.142) are crafting leather, not alchemical: no substance.
  "bear-hide": ["", 6, 30, "Медведи"],
  "archespores-tendrils": ["quebrith", 0.5, 44, "Археспоры"]
};
const description = (name, substance, location) => substance ? `<p>${name}: алхимический компонент. Добывается: ${location}.</p>`
  : `<p>${name}: идёт на кожу и украшение оружия или брони. Добывается: ${location}.</p>`;
const rows = [
  ["foglet-teeth", "Зубы туманника", "rebis", 0.1, 40, "Туманники"],
  ["foglet-essence", "Эссенция туманника", "aether", 0.1, 43, "Туманники"],
  ["rotfiend-liver", "Печень гнильца", "caelum", 0.5, 42, "Гнильцы"],
  ["barghest-essence", "Эссенция баргеста", "vermilion", 0.1, 36, "Баргесты"],
  ["crystalline-essence", "Кристаллическая эссенция", "hydragenum", 0.1, 292, "Химы, песты, вендиго, лешие, циклопы"],
  ["bear-fat", "Медвежий жир", "rebis", 0.5, 90, "Медведи"],
  ["boar-tusks", "Клыки вепря", "vitriol", 0.1, 82, "Вепри"],
  ["boar-hide", "Шкура вепря", "", 2, 10, "Вепри"],
  ["panther-hide", "Шкура пантеры", "", 3, 38, "Пантеры"],
  ["archespore-juice", "Сок археспоры", "vitriol", 0.1, 38, "Археспоры"],
  ["botchling-bones", "Кости игоши", "hydragenum", 0.1, 55, "Игоши"],
  ["botchling-blood", "Кровь игоши", "vitriol", 0.1, 66, "Игоши"],
  ["botchling-brain", "Мозг игоши", "caelum", 0.1, 164, "Игоши"],
  ["botchling-ear", "Ухо игоши", "fulgur", 0.1, 100, "Игоши"],
  ["wendigo-fur", "Мех вендиго", "fulgur", 0.1, 76, "Вендиго"],
  ["wendigo-heart", "Сердце вендиго", "aether", 1, 167, "Вендиго"]
];
// Appended rows only: documents follow the array index.
export const JOURNAL_MATERIALS = rows.map(([id, name, substance, weight, price, location], index) => ({
  id: `material.${id}`, documentId: `journalMatr${String(index + 1).padStart(5, "0")}`, name, type: "equipment", source: "materials",
  system: { kind: "material", weight, price, rarity: "", material: { substance, forageDC: 0, quantityFormula: "", location }, source: JOURNAL_SOURCE,
    description: description(name, substance, location) } }));

/** Data for an already shipped school placeholder (or null); the migration fills untouched documents with it. */
export function journalComponentData(id) {
  const row = JOURNAL_COMPONENTS[id.replace(/^material\./u, "")];
  if (!row) return null;
  const [substance, weight, price, location] = row;
  return { weight, price, material: { substance, forageDC: 0, quantityFormula: "", location } };
}
