import { available } from "./workshop.mjs";

export const recipeKey = item => item.system.ruleId || item.flags?.["witcher-eliott-system"]?.recipeSource || item._stats?.compendiumSource || item.uuid || item.id;
export function recipeGroups(actor) {
  const groups = new Map();
  for (const item of actor.items) {
    if (item.type !== "recipe") continue;
    const key = recipeKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].map(copies => ({
    item: copies.find(available) ?? copies.find(item => item.system.recipe.memorized) ?? copies[0], copies,
    physical: copies.some(available), memorized: copies.some(item => item.system.recipe.memorized)
  }));
}
export function recipeAccess(actor, item) {
  return recipeGroups(actor).find(group => recipeKey(group.item) === recipeKey(item)) ?? { physical: false, memorized: false, copies: [] };
}
export function recipeMemory(actor) {
  const capacity = Math.max(0, Math.floor(actor.system.statistics.effective.intelligence ?? 0));
  const used = recipeGroups(actor).filter(group => group.memorized).length;
  return { used, capacity, free: Math.max(0, capacity - used), full: used >= capacity };
}
export function requireMemorySlot(actor, item) {
  if (!recipeAccess(actor, item).memorized && recipeMemory(actor).full)
    throw new Error("Лимит запомненных рецептов равен Интеллекту. Сначала забудьте другой рецепт.");
}
/** Round once per component, even if a recipe repeats it or inventory splits it into stacks. */
export function salvagedComponents(components) {
  const totals = new Map();
  for (const { uuid, quantity } of components) totals.set(uuid, (totals.get(uuid) ?? 0) + quantity);
  return [...totals].map(([uuid, quantity]) => ({ uuid, quantity: Math.ceil(quantity / 2) }));
}
export function craftingDuration(seconds) {
  if (!seconds) return "—";
  if (seconds < 60) return `${Math.ceil(seconds / 3)} раунд.`;
  let remaining = Math.ceil(seconds / 60);
  const parts = [];
  for (const [size, label] of [[1440, "дн."], [60, "ч."], [1, "мин."]]) {
    const count = Math.floor(remaining / size);
    if (count) parts.push(`${count} ${label}`);
    remaining %= size;
  }
  return parts.join(" ");
}
