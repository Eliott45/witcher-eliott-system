import { AMMUNITION_ICON, CORE_AMMUNITION } from "../data/core-ammunition.mjs";
import { SYSTEM_ID } from "../config.mjs";

/** A patch only: preserve custom art, descriptions, condition, containment and IDs. */
export function ammunitionUpdate(item) {
  const canonical = CORE_AMMUNITION.find(entry => entry.id === item.system?.ruleId);
  if (item.type !== "equipment" || !canonical) return {};
  const update = {};
  if (["icons/svg/arrow.svg", "/icons/svg/arrow.svg"].includes(item.img)) update.img = AMMUNITION_ICON;
  if (canonical.id === "ammunition.standard" && !item.flags?.[SYSTEM_ID]?.ammunitionUnits) {
    update[`flags.${SYSTEM_ID}.ammunitionUnits`] = true;
    if ((item.system.purchaseQuantity ?? 1) !== 1) return update;
    update["system.purchaseQuantity"] = 10;
    update["system.quantity"] = (item.system.quantity ?? 1) * 10;
    update["system.weight"] = (item.system.weight ?? 0.5) / 10;
    update["system.price"] = (item.system.price ?? 10) / 10;
    if (item.name === "Стандартные (×10)") update.name = canonical.name;
    if (item.system.description?.includes("Количество в инвентаре считает наборы;")) update["system.description"] = canonical.system.description;
  }
  return update;
}
