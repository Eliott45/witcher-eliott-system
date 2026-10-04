/** Shared, document-independent workshop rules. Catalog entries use the same Items as inventory. */
export const SUBSTANCES = Object.entries({ vitriol: "Купорос", rebis: "Ребис", aether: "Эфир", quebrith: "Квебрит", hydragenum: "Гидраген", vermilion: "Киноварь", sol: "Солнце", caelum: "Аер", fulgur: "Фульгор" }).map(([id, name]) => ({ id, name }));
export const MONSTER_CATEGORIES = Object.entries({ beast: "Звери", cursed: "Проклятые", draconid: "Дракониды", elemental: "Духи стихий", humanoid: "Гуманоиды", hybrid: "Гибриды", insectoid: "Инсектоиды", necrophage: "Трупоеды", ogroid: "Огры", relict: "Реликты", specter: "Духи", vampire: "Вампиры" }).map(([id, name]) => ({ id, name }));
export const equipmentUuid = id => `Compendium.witcher-eliott-system.equipment.Item.${id}`;
export const WORKSHOP_BONUS_LABELS = {
  meleeDamage: "Урон в ближнем бою", "attributes.body": "Телосложение", "attributes.reflex": "Реакция",
  healthMax: "Максимум ПЗ", vigor: "Предел магии", reliability: "Надёжность", stoppingPower: "ПБ",
  accuracy: "Точность", weight: "Вес", "skills.stealth": "Скрытность"
};
export const available = item => item.system.carried !== false && item.system.quantity > 0;
export const sameItem = (item, reference) => Boolean(reference && (item.uuid === reference.uuid || (reference.system.ruleId && item.system.ruleId === reference.system.ruleId) || item._stats?.compendiumSource === reference.uuid));

/** Reserve exact ingredients first so a mandatory component cannot also pay for a substance. */
export function materialPlan(items, requirements, references = new Map(), choices = {}) {
  const remaining = new Map(Array.from(items).filter(available).map(item => [item.id, item.system.quantity]));
  const expenses = new Map();
  const rows = requirements.map((requirement, index) => ({ ...requirement, index, used: [], missing: requirement.quantity }));
  for (const row of [...rows].sort((a, b) => Boolean(a.substance) - Boolean(b.substance))) {
    const candidates = Array.from(items).filter(item => available(item) && (row.substance
      ? item.system.material?.substance === row.substance : sameItem(item, references.get(row.uuid))));
    const preferred = choices[row.index];
    candidates.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || a.system.price - b.system.price || a.id.localeCompare(b.id));
    for (const item of candidates) {
      const quantity = Math.min(row.missing, remaining.get(item.id) ?? 0);
      if (!quantity) continue;
      row.used.push({ itemId: item.id, name: item.name, quantity }); row.missing -= quantity;
      remaining.set(item.id, remaining.get(item.id) - quantity);
      expenses.set(item.id, (expenses.get(item.id) ?? 0) + quantity);
    }
  }
  return { rows, expenses: [...expenses].map(([itemId, quantity]) => ({ itemId, quantity })), complete: rows.every(row => row.missing === 0) };
}
export function repairRecipe(recipe, item) {
  const enhancements = (item.system.installations ?? []).filter(entry => entry.category !== "craftsman").length;
  // Core p. 140 specifies no repair time: do not silently reuse manufacturing time.
  return { ...recipe, time: 0, dc: Math.max(0, recipe.dc - 5 + 2 * enhancements), components: recipe.components.map(entry => ({ ...entry, quantity: 1 })), physicalBonus: 0 };
}
export function installationBonuses(item) {
  return (item.system.installations ?? []).flatMap(entry => entry.bonuses.map(bonus => ({ ...bonus, source: entry.sourceUuid, label: entry.name, category: "equipment" })));
}
export function effectiveItem(item) {
  const data = structuredClone(item.system.toObject ? item.system.toObject() : item.system);
  if(data.kind==="upgrade" && data.upgrade?.category==="armor") data.weight *= data.upgrade.zones.length / 3;
  for (const { target, value } of installationBonuses(item)) {
    if (["weight", "accuracy"].includes(target)) data[target] = Math.max(target === "weight" ? 0 : -100, data[target] + value);
    if (["reliability", "stoppingPower"].includes(target) && data[target]) {
      data[target].max += value;
    }
  }
  // Clamp once after ALL installations; incremental clamping would lose restored condition.
  for (const key of ["reliability", "stoppingPower"]) if (data[key]) {
    data[key].max = Math.max(0, data[key].max);
    data[key].value = Math.max(0, Math.min(data[key].max, data[key].value));
  }
  data.properties = [data.properties, ...(data.installations ?? []).map(entry => entry.properties)].filter(Boolean).join("; ");
  return data;
}
export function freeSlots(item) {
  return Math.max(0, (item.system.enhancementSlots ?? 0) - (item.system.installations ?? []).filter(entry => entry.category !== "craftsman").length);
}
export function activeOil(item, now) { const oil = item.system.oil; return oil?.sourceUuid && oil.expiresAt > now ? oil : null; }
export function oilDamage(item, category, now) { const oil = activeOil(item, now); return oil?.target === category ? oil.bonus : 0; }
export function mutationModifiers(mutations = []) {
  return mutations.flatMap(entry => entry.bonuses.map(bonus => ({ ...bonus, category: "mutation", source: entry.sourceUuid, label: entry.name })));
}
