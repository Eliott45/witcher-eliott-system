import { EQUIPMENT_KINDS, RARITIES, ARMOR_COVERAGE, armorZones, CONCEALMENT, isAmmunition } from "./physical-items.mjs";
import { effectiveItem } from "./workshop.mjs";
import { equipmentTrait } from "./equipment-traits.mjs";

export const EQUIPMENT_CATEGORIES = [{ id: "weapon", name: "Оружие" }, { id: "shield", name: "Щиты" }, { id: "armor", name: "Броня" }, ...EQUIPMENT_KINDS, { id: "recipe", name: "Чертежи / формулы" }];
export const equipmentCategory = item => item.type === "weapon" && item.system.category === "shield" ? "shield" : item.type === "equipment" ? (item.system.kind || "gear") : item.type;
const label = (choices, id) => choices.find(entry => entry.id === id)?.name ?? "";
const plain = value => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
export const WEAPON_CATEGORIES = [{ id: "melee", name: "Ближний бой" }, { id: "ranged", name: "Стрелковое" }, { id: "thrown", name: "Метательное" }, { id: "shield", name: "Щит" }];
export const ARMOR_CLASSES = [{ id: "light", name: "Лёгкая броня" }, { id: "medium", name: "Средняя броня" }, { id: "heavy", name: "Тяжёлая броня" }];

/** All chips are views of existing fields, including free-form properties; no parallel tag storage. */
export function equipmentEntry(item) {
  const data = effectiveItem(item), category = equipmentCategory(item);
  const traits = [...new Set([
    label(EQUIPMENT_CATEGORIES, category), label(RARITIES, data.rarity),
    item.type === "weapon" ? label(WEAPON_CATEGORIES, data.category) : "",
    item.type === "weapon" ? `${data.hands} рук.` : "",
    item.type === "armor" ? label(ARMOR_CLASSES, data.armorClass) : "",
    item.type === "armor" ? label(ARMOR_COVERAGE, data.zone) : "",
    ["armor", "weapon"].includes(item.type) && (item.type === "armor" || data.category === "shield") ? `Скованность ${data.encumbrance ?? 0}` : "",
    ["armor", "weapon"].includes(item.type) ? `Усиления ${data.enhancementSlots ?? 0}` : "",
    ...String(data.properties ?? "").split(/[;\n]+/).map(plain).filter(property => property.length <= 64)
  ].filter(Boolean))];
  const facts = [`${data.weight ?? 0} кг`, `${data.price ?? 0} крон`];
  if (data.purchaseQuantity > 1) facts.push(`Пачка: ${data.purchaseQuantity} шт. за ${Math.round(data.price * data.purchaseQuantity * 100) / 100} крон`);
  if (item.type === "weapon") facts.push(`Урон ${data.damage}`, `Точность ${data.accuracy >= 0 ? "+" : ""}${data.accuracy}`, `Н ${data.reliability?.value ?? 0}/${data.reliability?.max ?? 0}`);
  if (item.type === "armor") facts.push(`ПБ ${data.stoppingPower?.value ?? 0}/${data.stoppingPower?.max ?? 0}`, `Скованность ${data.encumbrance}`);
  if (isAmmunition(item)) facts.push(`Тип урона ${data.damageType}`, `Н ${data.reliability?.value ?? 0}/${data.reliability?.max ?? 0}`, `Скрытность: ${label(CONCEALMENT, data.concealment)}`);
  return { id: item.uuid ?? item.id, label: item.name, img: item.img, group: category, groupLabel: label(EQUIPMENT_CATEGORIES, category),
    traits, traitDetails: traits.map(equipmentTrait), summary: facts.join(" · "), details: [], price: data.price ?? 0, weight: data.weight ?? 0,
    rarity: data.rarity ?? "", weaponCategory: item.type === "weapon" ? data.category : "", hands: item.type === "weapon" ? String(data.hands) : "",
    armorClass: item.type === "armor" ? data.armorClass : "", zone: item.type === "armor" ? data.zone : "", zones: item.type === "armor" ? armorZones(item) : [], source: data.source ?? "",
    search: [item.name, ...traits, plain(data.properties), plain(data.description), data.source].join(" ").toLocaleLowerCase() };
}
export function filterEquipment(entries, filters = {}) {
  const query = (filters.query ?? "").trim().toLocaleLowerCase();
  const result = entries.filter(entry => {
    if (query && !entry.search.includes(query)) return false;
    for (const key of ["types", "rarities"]) if (filters[key]?.length && !filters[key].includes(entry[key === "types" ? "group" : "rarity"])) return false;
    for (const key of ["weaponCategory", "hands", "armorClass", "source"]) if (filters[key] && entry[key] !== filters[key]) return false;
    if (filters.zone && entry.zone !== filters.zone && !entry.zones?.includes(filters.zone)) return false;
    const traits = filters.traits ?? [];
    if (traits.length && !(filters.traitMode === "any" ? traits.some(tag => entry.traits.includes(tag)) : traits.every(tag => entry.traits.includes(tag)))) return false;
    for (const key of ["price", "weight"]) for (const bound of ["Min", "Max"]) {
      const value = filters[key + bound];
      if (value !== undefined && value !== "" && (bound === "Min" ? entry[key] < Number(value) : entry[key] > Number(value))) return false;
    }
    return true;
  });
  const direction = filters.descending ? -1 : 1;
  return result.sort((a, b) => direction * ((["price", "weight"].includes(filters.sort) ? a[filters.sort] - b[filters.sort] : 0) || a.label.localeCompare(b.label, "ru")));
}
export function equipmentFacets(entries) {
  return { types: EQUIPMENT_CATEGORIES, rarities: RARITIES, weaponCategories: WEAPON_CATEGORIES, armorClasses: ARMOR_CLASSES, zones: ARMOR_COVERAGE,
    traits: [...new Set(entries.flatMap(entry => entry.traits))].sort((a, b) => a.localeCompare(b, "ru")).map(equipmentTrait),
    sources: [...new Set(entries.map(entry => entry.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")) };
}
