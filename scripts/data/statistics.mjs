import { backgroundModifiers, modifierTotal } from "./background-modifiers.mjs";
import { dyingHealth } from "./death.mjs";

export const ATTRIBUTE_KEYS = ["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"];

const WOUNDED_ATTRIBUTES = new Set(["intelligence", "reflex", "dexterity", "will"]);

/** Use base BODY/WILL for resource limits: wound penalties must not lower their own threshold. */
export function deriveStatistics({ attributes, health, details = {} }, { dying = false, dead = false } = {}) {
  const modifiers = backgroundModifiers(details);
  const adjusted = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, attributes[key] === null ? null
    : attributes[key] + modifierTotal(modifiers, `attributes.${key}`)]));
  if (details.race === "witcher" && adjusted.empathy !== null) adjusted.empathy = Math.min(6, Math.max(1, adjusted.empathy));
  const { body, will } = adjusted;
  const physical = body !== null && will !== null ? Math.floor((body + will) / 2) : null;
  const healthMax = physical === null ? null : physical * 5;
  const woundThreshold = Math.floor((healthMax ?? health.max) / 5);
  const wounded = woundThreshold > 0 && health.value < woundThreshold;
  dying ||= dyingHealth({ value: health.value, max: healthMax ?? health.max });
  const effective = Object.fromEntries(ATTRIBUTE_KEYS.map(key => {
    const value = adjusted[key];
    // Death replaces (rather than stacks with) the serious-wound penalty. Luck is exempt.
    if (value !== null && (dying || dead) && key !== "luck") return [key, Math.floor(value / 3)];
    return [key, value !== null && wounded && WOUNDED_ATTRIBUTES.has(key) ? Math.floor(value / 2) : value];
  }));
  const { speed } = effective;
  const run = speed === null ? null : speed * 3;
  return {
    healthMax, staminaMax: healthMax,
    stun: physical === null ? null : Math.min(10, physical),
    recovery: physical, woundThreshold, wounded, dying: dying && !dead, dead, effective, adjusted, modifiers,
    reputationBonus: modifierTotal(modifiers, "reputation"), naturalArmor: modifierTotal(modifiers, "naturalArmor"),
    skillBonuses: Object.fromEntries([...new Set(modifiers.filter(modifier => modifier.target.startsWith("skills.")).map(modifier => modifier.target))]
      .map(target => [target.slice(7), modifierTotal(modifiers, target)])),
    initiative: effective.reflex,
    run, leap: run === null ? null : Math.floor(run / 5),
    carryMax: effective.body === null ? null : effective.body * 10 + modifierTotal(modifiers, "carryMax")
  };
}

export function stunSucceeded(result, target) {
  return result < target;
}
