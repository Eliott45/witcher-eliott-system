export const PHYSICAL_TYPES = ["equipment", "weapon", "armor"];
export const isPhysical = item => PHYSICAL_TYPES.includes(item.type);
export const ARMOR_ZONES = [{ id: "head", name: "Голова", icon: "fa-helmet-safety" }, { id: "torso", name: "Корпус / руки", icon: "fa-shirt" }, { id: "legs", name: "Ноги", icon: "fa-person-walking" }];
export const RARITIES = [{ id: "everywhere", name: "Повсеместное" }, { id: "common", name: "Обычное" }, { id: "rare", name: "Редкое" }, { id: "unique", name: "Уникальное" }];
export const EQUIPMENT_KINDS = [{ id: "gear", name: "Снаряжение" }, { id: "tool", name: "Инструменты" }, { id: "ammunition", name: "Боеприпасы" }, { id: "companion", name: "Компаньон" }, { id: "material", name: "Материалы" }, { id: "alchemy", name: "Алхимия" }, { id: "upgrade", name: "Улучшения" }];
export function carriedWeight(items = []) {
  return Math.round(Array.from(items).filter(item => isPhysical(item) && item.system.carried !== false && item.system.kind !== "companion")
    .reduce((sum, item) => sum + (item.system.weight ?? 0) * (item.system.quantity ?? 1), 0) * 1000) / 1000;
}
export const conditionKey = item => item.type === "weapon" ? "reliability" : item.type === "armor" ? "stoppingPower" : null;
export const equippedItems = items => Array.from(items ?? []).filter(item => isPhysical(item) && item.system.equipped && item.system.carried && item.system.quantity > 0);
export function armorEncumbrance(items, reduction = 0) {
  return Math.max(0, equippedItems(items).reduce((sum, item) => sum + (item.system.encumbrance ?? 0), 0) + reduction);
}
export function conditionUpdate(item, change) {
  const key = conditionKey(item);
  if (!key) return {};
  const current = item.system[key];
  const max = Math.max(0, Math.trunc(Number(change[`system.${key}.max`] ?? change.system?.[key]?.max ?? current.max) || 0));
  const value = Math.max(0, Math.min(max, Math.trunc(Number(change[`system.${key}.value`] ?? change.system?.[key]?.value ?? current.value) || 0)));
  return { [`system.${key}.value`]: value };
}
