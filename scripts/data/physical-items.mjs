import { layeringEncumbrance } from "./armor-layers.mjs";
import { effectiveItem } from "./workshop.mjs";
import { isCarried, containerParent } from "./containers.mjs";
import { EQUIPMENT_ICONS } from "./item-icons.mjs";
import { relicArmorLore } from "./relic-armor.mjs";
export const PHYSICAL_TYPES = ["equipment", "weapon", "armor", "recipe"];
export const isPhysical = item => PHYSICAL_TYPES.includes(item.type);
export const isAmmunition = item => item.type === "equipment" && item.system.kind === "ammunition";
export const CONCEALMENT = [{ id: "tiny", name: "Маленькое — в кармане" }, { id: "small", name: "Небольшое — под курткой" }, { id: "large", name: "Крупное — под плащом" }, { id: "none", name: "Не спрятать" }];
export const ARMOR_ZONES = [{ id: "head", name: "Голова", img: EQUIPMENT_ICONS.head }, { id: "torso", name: "Корпус / руки", img: EQUIPMENT_ICONS.torso }, { id: "legs", name: "Ноги", img: EQUIPMENT_ICONS.legs }];
export const ARMOR_COVERAGE = [...ARMOR_ZONES, { id: "torso-legs", name: "Корпус / руки и ноги" }, { id: "all", name: "Все зоны" }];
export const armorZones = item => item.system.zone === "all" ? ARMOR_ZONES.map(zone => zone.id) : item.system.zone === "torso-legs" ? ["torso", "legs"] : [item.system.zone];
export const RARITIES = [{ id: "everywhere", name: "Повсеместное" }, { id: "common", name: "Обычное" }, { id: "rare", name: "Редкое" }, { id: "unique", name: "Уникальное" }];
export const EQUIPMENT_KINDS = [{ id: "transport", name: "Транспорт" }, { id: "tack", name: "Упряжь" }, { id: "gear", name: "Снаряжение" }, { id: "tool", name: "Инструменты" }, { id: "container", name: "Контейнеры" }, { id: "ammunition", name: "Боеприпасы" }, { id: "companion", name: "Компаньон" }, { id: "material", name: "Материалы" }, { id: "alchemy", name: "Алхимия" }, { id: "upgrade", name: "Улучшения" }, { id: "mutagen", name: "Мутагены" }];
export const itemWeight = item => ["companion", "transport"].includes(item.system.kind) ? 0 : (effectiveItem(item).weight ?? 0) * (item.system.quantity ?? 1);
export function carriedWeight(items = []) {
  const all = Array.from(items);
  return Math.round(all.filter(item => isPhysical(item) && isCarried(item, all)).reduce((sum, item) => sum + itemWeight(item), 0) * 1000) / 1000;
}
export const conditionKey = item => (item.type === "weapon" && !item.system.natural) || isAmmunition(item) ? "reliability" : item.type === "armor" ? "stoppingPower" : null;
export function equippedItems(items) {
  const relics = new Set();
  return Array.from(items ?? []).filter(item => {
    if (!isPhysical(item) || !item.system.equipped || !isCarried(item, items) || containerParent(item, items) || !(item.system.quantity > 0)) return false;
    // Imported or edited inventories can contain several equipped copies of one unique suit.
    // Count the suit once for its armor, wearer bonuses, encumbrance and equipment wear.
    if (relicArmorLore(item)) {
      if (relics.has(item.system.ruleId)) return false;
      relics.add(item.system.ruleId);
    }
    return true;
  });
}
export function armorEncumbrance(items, reduction = 0) {
  const worn = equippedItems(items);
  return Math.max(0, worn.reduce((sum, item) => sum + (item.system.encumbrance ?? 0), 0) + layeringEncumbrance(worn) + reduction);
}
export function conditionUpdate(item, change) {
  const key = conditionKey(item);
  if (!key) return {};
  const current = item.system[key];
  const installations = change["system.installations"] ?? change.system?.installations ?? item.system.installations ?? [];
  const bonus = installations.flatMap(entry=>entry.bonuses).filter(entry=>entry.target===key).reduce((sum,entry)=>sum+entry.value,0);
  const max = Math.max(0, Math.trunc(Number(change[`system.${key}.max`] ?? change.system?.[key]?.max ?? current.max) || 0) + bonus);
  const value = Math.max(0, Math.min(max, Math.trunc(Number(change[`system.${key}.value`] ?? change.system?.[key]?.value ?? current.value) || 0)));
  return { [`system.${key}.value`]: value };
}
