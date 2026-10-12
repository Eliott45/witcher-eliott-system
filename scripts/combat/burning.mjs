import { activeEffect } from "../data/effect-counters.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { ATTACK_LOCATIONS, bodyPlanOf } from "./weapon-rules.mjs";
import { armorAt, resolveDamage, monsterMaterial, fireVulnerable } from "./damage-rules.mjs";
import { applyWeaponWear } from "./weapon-wear.mjs";

// Core p.161 «Горение»: 5 damage to every body part each turn; armor absorbs it (fire resistance halves
// the rest, fire vulnerability doubles it), and the fire deals 1 damage to the armor and weapons every turn.
export const BURN_PER_PART = 5;
const FIRE = { types: ["elemental"], piercing: "none", silver: false, silverDice: "" };

export function burningParts(actor) {
  if (bodyPlanOf(actor) === "humanoid") return ["head", "torso", "rightArm", "leftArm", "rightLeg", "leftLeg"];
  return ["head", "torso", "rightArm", "leftArm", ...(actor.system.creature?.hasTailOrWings ? ["tail"] : [])];
}
export const isBurning = actor => actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("burning"))
  && !actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead"));

/** Damage per part against the current armor; no location multipliers — every part takes its own 5. */
export function burningDamage(actor) {
  if (!isBurning(actor) || immuneToCondition(actor, ["burning"])) return null;
  const material = monsterMaterial(actor), vulnerable = fireVulnerable(actor);
  const parts = burningParts(actor).map(id => {
    const armor = armorAt(actor, id), result = resolveDamage({ base: BURN_PER_PART, location: id, multiplier: 1, traits: FIRE, armor, monsterMaterial: material, vulnerableToFire: vulnerable });
    return { id, name: ATTACK_LOCATIONS.find(entry => entry.id === id)?.name ?? id, sp: armor.sp, total: result.total, resisted: armor.resistances.includes("elemental") };
  });
  return { total: parts.reduce((sum, part) => sum + part.total, 0), parts, vulnerable };
}

/** Fire wears every worn armor piece by 1 SP and every wielded weapon by 1 reliability. */
export async function burnEquipment(actor) {
  const notes = [];
  for (const item of equippedItems(actor.items)) {
    const key = item.type === "armor" ? "stoppingPower" : item.type === "weapon" && !item.system.natural ? "reliability" : null;
    const from = key && item.system[key]?.value;
    if (!(from > 0)) continue;
    const wear=key==="reliability"?await applyWeaponWear(item,1):null;
    if(!wear)await item.update({ [`system.${key}.value`]: from - 1 });
    notes.push(`${item.name}: ${key === "stoppingPower" ? "ПБ" : "надёжность"} ${from} → ${wear?.to??from - 1}${wear?.protectedByRune?" (Чернобог)":""}`);
  }
  return notes;
}
