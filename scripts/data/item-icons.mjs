import { SYSTEM_ID } from "../config.mjs";
import { AMMUNITION_ICON } from "./core-ammunition.mjs";
export const EQUIPMENT_ICONS = {
  head: `systems/${SYSTEM_ID}/assets/icons/helmet.svg`,
  torso: `systems/${SYSTEM_ID}/assets/icons/armor.svg`,
  legs: `systems/${SYSTEM_ID}/assets/icons/greaves.svg`,
  shield: "icons/svg/shield.svg", weapon: "icons/svg/sword.svg", gear: "icons/svg/item-bag.svg"
};
export function defaultItemIcon(item) {
  if (item.type === "equipment" && item.system.kind === "ammunition") return AMMUNITION_ICON;
  if (item.type === "armor") return EQUIPMENT_ICONS[item.system.zone] ?? EQUIPMENT_ICONS.torso;
  if (item.type === "weapon") return EQUIPMENT_ICONS[item.system.category === "shield" ? "shield" : "weapon"];
  return EQUIPMENT_ICONS.gear;
}
export function equipmentIconUpdate(item) {
  if (item.type === "armor" && item.img === EQUIPMENT_ICONS.shield
    || item.type === "weapon" && item.system.category === "shield" && item.img === EQUIPMENT_ICONS.weapon)
    return { img: defaultItemIcon(item) };
  return {};
}
