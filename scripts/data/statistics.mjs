import { backgroundModifiers, modifierTotal } from "./background-modifiers.mjs";

export const ATTRIBUTE_KEYS = ["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"];

const WOUNDED_ATTRIBUTES = new Set(["intelligence", "reflex", "dexterity", "will"]);

/** Use base BODY/WILL for resource limits: wound penalties must not lower their own threshold. */
export function deriveStatistics({ attributes, health, details = {} }) {
  const modifiers = backgroundModifiers(details);
  const adjusted = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, attributes[key] === null ? null
    : attributes[key] + modifierTotal(modifiers, `attributes.${key}`)]));
  if (details.race === "witcher" && adjusted.empathy !== null) adjusted.empathy = Math.min(6, Math.max(1, adjusted.empathy));
  const { body, will, speed } = adjusted;
  const physical = body !== null && will !== null ? Math.floor((body + will) / 2) : null;
  const healthMax = physical === null ? null : physical * 5;
  const woundThreshold = Math.floor((healthMax ?? health.max) / 5);
  const wounded = woundThreshold > 0 && health.value < woundThreshold;
  const effective = Object.fromEntries(ATTRIBUTE_KEYS.map(key => {
    const value = adjusted[key];
    return [key, value !== null && wounded && WOUNDED_ATTRIBUTES.has(key) ? Math.floor(value / 2) : value];
  }));
  const run = speed === null ? null : speed * 3;
  return {
    healthMax, staminaMax: healthMax,
    stun: physical === null ? null : Math.min(10, physical),
    recovery: physical, woundThreshold, wounded, effective, adjusted, modifiers,
    reputationBonus: modifierTotal(modifiers, "reputation"), naturalArmor: modifierTotal(modifiers, "naturalArmor"),
    skillBonuses: Object.fromEntries([...new Set(modifiers.filter(modifier => modifier.target.startsWith("skills.")).map(modifier => modifier.target))]
      .map(target => [target.slice(7), modifierTotal(modifiers, target)])),
    initiative: effective.reflex,
    run, leap: run === null ? null : Math.floor(run / 5),
    carryMax: body === null ? null : body * 10 + modifierTotal(modifiers, "carryMax")
  };
}

export function stunSucceeded(result, target) {
  return result < target;
}
