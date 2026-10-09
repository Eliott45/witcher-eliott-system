import { SYSTEM_ID } from "../config.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { randomLootEntry } from "../data/random-loot.mjs";
import { copyPhysical } from "../workshop/transaction.mjs";

/**
 * Core p.223: one d100 per possession on the chosen column. Catalogue matches are copied from the compendium,
 * the rest become simple items with the table's prose; equal results stack. `rollD100` returns an integer.
 */
export async function rollPersonalBelongings(category, quantity, rollD100) {
  const selected = new Map(), results = [];
  for (let i = 0; i < quantity; i++) {
    const roll = await rollD100(), entry = randomLootEntry(category, roll);
    if (!entry) throw new Error(`Не найден результат ${roll} в таблице личных вещей.`);
    results.push({ roll, name: entry.name });
    const key = `${entry.min}-${entry.max}`, existing = selected.get(key);
    if (existing) { existing.system.quantity += entry.quantity; continue; }
    let item;
    if (entry.documentId) {
      const source = await foundry.utils.fromUuid(`Compendium.${SYSTEM_ID}.equipment.Item.${entry.documentId}`);
      if (!source || !isPhysical(source)) throw new Error(`Предмет случайной добычи недоступен: ${entry.name}.`);
      item = copyPhysical(source, entry.quantity);
    } else item = { name: entry.name, type: "equipment", img: "icons/svg/item-bag.svg",
      system: { quantity: entry.quantity, description: entry.description, source: entry.source } };
    selected.set(key, item);
  }
  return { items: [...selected.values()], results };
}
