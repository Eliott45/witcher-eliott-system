import { itemLore } from "../data/item-lore.mjs";

// Core p.167: the ring now explains its effect on a magic adept. Only the shipped line is replaced.
const OLD_RING = "<p>Кольцо со вставкой из тусклого двимерита. Чародеи стараются держаться от такого подальше.</p>";

export function dimeritiumDescriptionUpdate(item) {
  if (item.type !== "equipment" || item.system?.ruleId !== "dimeritium-ring") return {};
  const before = String(item.system.description ?? ""), canonical = itemLore({ name: "Кольцо с двимеритом", type: "equipment" });
  const after = before.trim() ? before.replace(OLD_RING, canonical) : canonical;
  return after === before ? {} : { "system.description": after };
}
