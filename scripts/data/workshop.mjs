import { hasCrossbowMod } from "./crossbow-modifications.mjs";
import { isCarried } from "./containers.mjs";
import { torchHeldLit } from "./radolf-rules.mjs";
/** Shared, document-independent workshop rules. Catalog entries use the same Items as inventory. */
// Core p. 142: the nine substances, their printed colors and cut signs (assets/substances).
export const SUBSTANCES = [
  ["vitriol", "Купорос", "#9a5aa0"], ["rebis", "Ребис", "#ef5b36"], ["aether", "Эфир", "#8ecbc6"],
  ["quebrith", "Квебрит", "#e3c62c"], ["hydragenum", "Гидраген", "#6e74c4"], ["vermilion", "Киноварь", "#5f9f4d"],
  ["sol", "Солнце", "#f2b44a"], ["caelum", "Аер", "#cdd643"], ["fulgur", "Фульгор", "#b2302e"]
].map(([id, name, color]) => ({ id, name, color, img: `systems/witcher-eliott-system/assets/substances/${id}.svg` }));
export { MONSTER_CATEGORIES } from "./monster-categories.mjs";
export const equipmentUuid = id => `Compendium.witcher-eliott-system.equipment.Item.${id}`;
export const WORKSHOP_BONUS_LABELS = {
  meleeDamage: "Урон в ближнем бою", "attributes.body": "Телосложение", "attributes.reflex": "Реакция",
  healthMax: "Максимум ПЗ", vigor: "Предел магии", reliability: "Надёжность", stoppingPower: "ПБ",
  accuracy: "Точность", weight: "Вес", "skills.stealth": "Скрытность", "skills.courage": "Храбрость", staminaMax: "Максимум Выносливости",
  "skills.resistMagic": "Сопротивление магии", "skills.spellCasting": "Сотворение заклинаний"
};
export const available = item => isCarried(item) && item.system.quantity > 0;
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
    // A salvaged pure substance has no price; keep it for last instead of treating it as the cheapest source.
    const pure = item => Number(Boolean(item.system.ruleId?.startsWith("substance.")));
    candidates.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || pure(a) - pure(b) || a.system.price - b.system.price || a.id.localeCompare(b.id));
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
  const enhancements = (item.system.installations ?? []).filter(entry => !["craftsman", "crossbow"].includes(entry.category)).length;
  // Core p. 140 specifies no repair time: do not silently reuse manufacturing time.
  const components = [...new Map(recipe.components.map(entry => [entry.uuid || entry.substance, { ...entry, quantity: 1 }])).values()];
  return { ...recipe, time: 0, dc: Math.max(0, recipe.dc - 5 + 2 * enhancements), components, physicalBonus: 0 };
}
export function installationBonuses(item) {
  return (item.system.installations ?? []).flatMap(entry => entry.bonuses.map(bonus => ({ ...bonus, source: entry.sourceUuid, label: entry.name, category: "equipment" })));
}
/** Intrinsic bonuses belong to the worn item, independently of its upgrade slots. */
export function wearerBonuses(item) {
  return [...(item.system.wearerBonuses ?? []).map(bonus => ({ ...bonus, source: item.uuid ?? item.system.ruleId, label: item.name, category: "equipment" })), ...installationBonuses(item)];
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
  if (hasCrossbowMod(item,"string") && data.skill === "crossbow") data.damage = `(${data.damage}) + 1d6`;
  if (torchHeldLit(item)) data.properties += "; Горение (25%)";
  return data;
}
export function freeSlots(item) {
  return Math.max(0, (item.system.enhancementSlots ?? 0) - (item.system.installations ?? []).filter(entry => !["craftsman", "crossbow"].includes(entry.category)).length);
}
export function activeOil(item, now) { const oil = item.system.oil; return oil?.sourceUuid && oil.expiresAt > now ? oil : null; }
export function oilDamage(item, category, now) { const oil = activeOil(item, now); return oil?.target === category ? oil.bonus : 0; }
export function mutationModifiers(mutations = []) {
  return mutations.flatMap(entry => entry.bonuses.map(bonus => ({ ...bonus, category: "mutation", source: entry.sourceUuid, label: entry.name })));
}
