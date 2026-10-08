import { immuneToCondition } from "../data/creatures.mjs";
import { setStatus } from "./status-effects.mjs";
import { EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { creatureGolemSlowed } from "../data/creature-modes.mjs";

/** Core p.72: bleed requires injury; ablating damages armor on a hit, even when SP holds. */
export function weaponHitTraits(weapon = {}, actor = null) {
  const text = String(weapon.properties ?? "");
  const chance = pattern => Math.min(100, Math.max(0, Number(text.match(pattern)?.[1] ?? 0)));
  return {
    bleeding: chance(/(?:кровопускающ\S*|кровотечение)\s*\((\d+)\s*%\)/iu),
    poisoned: chance(/(?:отравление|яд|отравляющ\S*)\s*\((\d+)\s*%\)/iu),
    burning: chance(/(?:горение|поджигающ\S*)\s*\((\d+)\s*%\)/iu),
    ablating: /разрушающ/iu.test(text),
    wearMultiplier: !creatureGolemSlowed(actor) && /двойной урон (?:оружию|снаряжению)/iu.test(text) ? 2 : 1,
    noParry: !creatureGolemSlowed(actor) && /нельзя парировать/iu.test(text)
  };
}

export function weaponConditionChances(traits, result, { nonLethal = false } = {}) {
  if (result.immune) return [];
  return ["bleeding", "poisoned", "burning"].filter(id => traits?.[id] > 0
    && (id === "burning" || !nonLethal && result.total > 0 && result.penetrated))
    .map(id => ({ id, chance: traits[id] }));
}

/** Roll before mutating the target. Return serializable results for the original attack card. */
export async function rollWeaponConditions(actor, traits, result, options = {}) {
  const rolls = [], effects = [];
  for (const entry of weaponConditionChances(traits, result, options)) {
    const immune = immuneToCondition(actor, [entry.id]);
    const roll = !immune && entry.chance < 100 ? await new foundry.dice.Roll("1d100").evaluate({ allowInteractive: !options.blind }) : null;
    if (roll) rolls.push(roll);
    effects.push({ ...entry, immune, roll: roll?.total ?? null, applied: !immune && (!roll || roll.total <= entry.chance),
      ...(entry.id === "bleeding" && options.ammunition?.ruleId === "ammunition.elven-burrowing" ? {burrowing:true} : {}) });
  }
  return { rolls, effects };
}

export async function applyWeaponConditions(actor, effects) {
  for (const effect of effects) if (effect.applied) {
    if (!effect.burrowing) { await setStatus(actor, effect.id, true); continue; }
    const source=conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="burrowing")); delete source._id;
    const existing=Array.from(actor.effects).find(entry=>entry.statuses.has("bleeding"));
    if (existing) await existing.update(source);
    else await actor.createEmbeddedDocuments("ActiveEffect",[source]);
  }
}

export const weaponConditionLabel = id => ({ bleeding: "Кровотечение", poisoned: "Отравление", burning: "Горение" })[id] ?? id;
export const weaponConditionReport = effects => effects.map(effect => `${weaponConditionLabel(effect.id)} ${effect.chance}%: ${effect.immune ? "иммунитет" : `${effect.roll === null ? "" : `${effect.roll} — `}${effect.applied ? "наложено" : "не сработало"}`}`).join("; ");
