import { SYSTEM_ID } from "../config.mjs";
import { isCarried, containerParent } from "./containers.mjs";

export const isRadolfTorch = item => ["gear.torch", "radolf.torch"].includes(item?.system?.ruleId);
export const torchIgnited = item => isRadolfTorch(item) && Boolean(item.flags?.[SYSTEM_ID]?.torchLit);
export const torchHeldLit = item => torchIgnited(item) && item.system.equipped && isCarried(item) && !containerParent(item);
export const holdsLitTorch = actor => Array.from(actor?.items ?? []).some(torchHeldLit);
export const navigationBonus = item => ({ "radolf.compass": 3, "radolf.sunstone": 2 })[item?.system?.ruleId] ?? 0;
export const signalRange = item => ({ "radolf.signal-horn": "около 1 мили", "radolf.whistle": "до ½ мили" })[item?.system?.ruleId] ?? "";

export function radolfItemContext(item) {
  const id = item.system?.ruleId;
  const action = navigationBonus(item) ? { label: `Ориентироваться +${navigationBonus(item)}`, icon: "fa-compass" }
    : isRadolfTorch(item) ? { label: torchIgnited(item) ? "Потушить" : "Зажечь", icon: "fa-fire" }
      : id === "radolf.marbles" ? { label: "Рассыпать шарики", icon: "fa-circle-dot" }
        : signalRange(item) ? { label: "Подать сигнал", icon: "fa-bullhorn" } : null;
  return action ? { ...action, disabled: !isCarried(item) || !item.actor } : null;
}
