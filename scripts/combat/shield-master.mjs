import { equippedItems } from "../data/physical-items.mjs";
import { usableHands } from "./critical-wound-effects.mjs";
import { chaosHandError } from "../data/prosthetic-rules.mjs";

export const isShieldMaster = actor => actor.system?.details?.race === "witcher" && actor.system?.lifepath?.witcher?.school === "manticore";
export const freeShieldDraw = (actor, item) => isShieldMaster(actor) && item?.type === "weapon" && item.system.category === "shield";

/** Shieldmaster frees the shield hand for exactly these actions, not for another weapon or grappling. */
export function handActionError(actor, action) {
  if (!["sign", "bomb", "potion"].includes(action)) return "";
  const hands = usableHands(actor), held = equippedItems(actor.items ?? []).filter(item => item.type === "weapon" && !item.system.natural);
  const occupied = held.reduce((sum, item) => sum + (item.system.grip || item.system.hands || 1), 0);
  const shieldHands = isShieldMaster(actor) ? held.filter(item => item.system.category === "shield").length : 0;
  if (action === "sign" && hands > occupied - shieldHands) return chaosHandError(actor, { sign: true, shieldMaster: isShieldMaster(actor) });
  return hands > occupied - shieldHands ? "" : `Нужна свободная рука, чтобы ${{ sign: "сотворить знак", bomb: "бросить бомбу", potion: "выпить эликсир" }[action]}. Уберите оружие или измените хват. Ведьмак школы Мантикоры может использовать руку со щитом.`;
}
