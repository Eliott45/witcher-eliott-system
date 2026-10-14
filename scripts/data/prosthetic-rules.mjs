import { SYSTEM_ID } from "../config.mjs";
import { equippedItems } from "./physical-items.mjs";

export const PROSTHETIC_TYPES = { "gear.simple-prosthesis": "simple", "gear.quality-prosthesis": "quality",
  "gear.magical-prosthesis": "magical", "gear.witcher-prosthesis": "witcher", "gear.conduit-prosthesis": "conduit" };
export const WHEELCHAIRS = { "gear.basic-wheelchair": -3, "gear.quality-wheelchair": -1 };
export const originalProsthesis = item => Boolean(PROSTHETIC_TYPES[item?.system?.ruleId]) && item.system.ruleId !== "gear.quality-prosthesis";
const active = effect => !effect.disabled && !effect.isSuppressed && !effect.duration?.expired;
export function fittedProsthesis(actor, location) {
  for (const effect of actor?.effects ?? []) {
    const wound = effect.flags?.[SYSTEM_ID]?.criticalWound;
    if (!active(effect) || wound?.state !== "treated" || wound.arm !== location || !wound.prosthesis?.itemId) continue;
    const item = Array.from(actor.items ?? []).find(item => item.id === wound.prosthesis.itemId);
    if (item && item.system.equipped && item.system.carried !== false && !item.system.containerId && item.system.quantity > 0) return { effect, item };
  }
  return null;
}
export const wheelchair = actor => equippedItems(actor?.items ?? []).filter(item => Object.hasOwn(WHEELCHAIRS, item.system.ruleId))
  .sort((a, b) => WHEELCHAIRS[b.system.ruleId] - WHEELCHAIRS[a.system.ruleId])[0] ?? null;
export const wheelchairPenalty = (actor, activity) => ["swimming", "climbing"].includes(activity) ? WHEELCHAIRS[wheelchair(actor)?.system.ruleId] ?? 0 : 0;
export function mobilityWoundSources(effects) {
  return new Set(Array.from(effects ?? []).filter(effect => active(effect) &&
    (effect.flags?.[SYSTEM_ID]?.criticalWound || effect.flags?.[SYSTEM_ID]?.condition?.disability))
    .map(effect => `effect.${effect.id}`));
}
export const mobilityPenalty = (modifier, sources) => sources.has(modifier.source) && (modifier.value < 0 || modifier.factor < 1);
export function limbAvailable(actor, limb) {
  return !Array.from(actor.effects ?? []).some(effect => active(effect) && effect.flags?.[SYSTEM_ID]?.criticalWound?.arm === limb
    && (effect.flags[SYSTEM_ID].criticalWound.id === (limb.endsWith("Arm") ? "dismembered-arm" : "dismembered-leg")
      || effect.flags[SYSTEM_ID].condition?.modifiers?.some(mod => mod.target === "hands" && mod.value < 0)) && !fittedProsthesis(actor, limb));
}
export const limbName = limb => ({ rightArm: "Правая рука", leftArm: "Левая рука", rightLeg: "Правая нога", leftLeg: "Левая нога" })[limb];
export function strikeLimbs(actor, strike) {
  return (strike === "kick" ? ["rightLeg", "leftLeg"] : ["rightArm", "leftArm"]).map(limb => {
    const fitted = fittedProsthesis(actor, limb), available = limbAvailable(actor, limb);
    const parts = (actor.system?.statistics?.modifiers ?? []).filter(mod => mod.target === "combat.arm" && mod.arm === limb && mod.value)
      .map(mod => ({ label: mod.label ?? limbName(limb), value: mod.value }));
    return { limb, name: limbName(limb), available, parts, silver: fitted?.item.system.ruleId === "gear.witcher-prosthesis", prosthesis: fitted?.item.name ?? "" };
  });
}
/** Hands have the same right-first convention as weapon wounds; a Manticore shield leaves its hand available. */
export function chaosHandError(actor, { sign = false, shieldMaster = false } = {}) {
  if (!sign && (actor.system.skills?.spellCasting ?? 0) >= 9) return "";
  let occupied = 0;
  const usable = ["rightArm", "leftArm"].filter(limb => limbAvailable(actor, limb));
  const held = equippedItems(actor.items ?? []).filter(item => item.type === "weapon" && !item.system.natural);
  for (const item of held) if (!(shieldMaster && item.system.category === "shield")) occupied += item.system.grip || item.system.hands || 1;
  const candidates = sign ? usable.slice(occupied) : usable;
  const conducts = limb => !["simple", "magical", "quality"].includes(PROSTHETIC_TYPES[fittedProsthesis(actor, limb)?.item.system.ruleId]);
  return candidates.some(conducts) ? "" : "Нет подходящей руки для проведения Хаоса: простой и магический протезы его не проводят.";
}
