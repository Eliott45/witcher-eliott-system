import { hasDose } from "./consumables.mjs";
import { mutationModifiers, wearerBonuses } from "./workshop.mjs";
import { equippedItems } from "./physical-items.mjs";
import { backgroundModifiers, modifierTotal, modifierFactor } from "./background-modifiers.mjs";
import { dyingHealth } from "./death.mjs";
import { witcherModifiers } from "./witcher-lifepath.mjs";
import { lifeEventModifiers } from "./life-events.mjs";
import { armorEncumbrance } from "./physical-items.mjs";
import { reputationLevel, reputationModifiers } from "./reputation.mjs";
import { conditionModifiers } from "./condition-definitions.mjs";
import { ENHANCED_SENSES, witcherSensesSuppressed } from "./visor.mjs";
import { environmentModifiers } from "../combat/environment.mjs";
import { dimeritiumModifiers } from "../magic/dimeritium.mjs";
import { creatureModeModifiers, creatureIsAmphibian, creatureProfile, creatureMovementMode } from "./creature-modes.mjs";
import { hagModifiers } from "./hag-circle.mjs";

export const ATTRIBUTE_KEYS = ["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"];

const WOUNDED_ATTRIBUTES = new Set(["intelligence", "reflex", "dexterity", "will"]);

/** Use base BODY/WILL for resource limits: wound penalties must not lower their own threshold. */
export function deriveStatistics({ attributes, health, details = {}, abilityState = {}, lifepath = {}, mutations = [], vigor = 0, reputation = {}, creature = null, parent = null, skills = {} }, { dying = false, dead = false, abilityIds = [], items = [], effects = [], environment = null, dimeritium = null } = {}) {
  const creatureActor = { id: parent?.id, _id: parent?._id, name: parent?.name, uuid: parent?.uuid, _stats: parent?._stats, flags: parent?.flags,
    isToken: parent?.isToken, token: parent?.token, getActiveTokens: parent?.getActiveTokens?.bind(parent), system: { attributes, health, creature, skills }, items, effects };
  const creatureEnvironment = creatureIsAmphibian(creatureActor) && ["water", "underwater"].includes(environment?.terrain?.id)
    ? { ...environment, terrain: { ...environment.terrain, modifiers: [] } } : environment;
  const background = backgroundModifiers(details, abilityIds).filter(modifier =>
    modifier.source !== ENHANCED_SENSES || !witcherSensesSuppressed(details, items));
  const modifiers = [...background, ...witcherModifiers({ details, lifepath }), ...lifeEventModifiers({ details, lifepath }), ...mutationModifiers(mutations), ...equippedItems(items).flatMap(wearerBonuses), ...conditionModifiers(effects),
    ...environmentModifiers(creatureEnvironment, { items, effects, senses: background.some(modifier => modifier.source === ENHANCED_SENSES) || Array.from(items).some(item => item.type === "ability" && item.system?.ruleId === "creature.night-vision") }), ...creatureModeModifiers(creatureActor, environment), ...hagModifiers(creatureActor)];
  // Resisting dimeritium keeps half of the Vigor every other source produces.
  modifiers.push(...dimeritiumModifiers(dimeritium, Math.max(0, vigor + modifierTotal(modifiers, "vigor"))));
  const reputationBonus = modifierTotal(modifiers, "reputation");
  const reputationTotal = reputationLevel(reputation.value, reputationBonus);
  modifiers.push(...reputationModifiers(reputation, reputationTotal));
  const ev = armorEncumbrance(items, modifierTotal(modifiers, "armorEncumbrance"));
  for (const target of ["attributes.reflex", "attributes.dexterity", "skills.spellCasting", "skills.hexWeaving", "skills.ritualCrafting"])
    if (ev) modifiers.push({ source: "equipment.ev", label: "Скованность брони", category: "equipment", target, value: -ev });
  // Multipliers (critical wounds: "halved", "quartered") apply after every additive modifier.
  const scale = (value, target) => value === null ? null : Math.floor(value * modifierFactor(modifiers, target));
  const adjusted = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, attributes[key] === null ? null
    : scale(attributes[key] + modifierTotal(modifiers, `attributes.${key}`), `attributes.${key}`)]));
  // Some wound penalties leave HP/STA untouched (Cracked Ribs; Heart Damage quarters STA itself): resource limits ignore them.
  const counted = modifiers.filter(modifier => !modifier.resourceNeutral);
  const limitValue = key => attributes[key] === null ? null
    : Math.floor((attributes[key] + modifierTotal(counted, `attributes.${key}`)) * modifierFactor(counted, `attributes.${key}`));
  for (const key of ATTRIBUTE_KEYS) if (adjusted[key] !== null && modifiers.some(modifier=>["effect","creature"].includes(modifier.category)&&modifier.target===`attributes.${key}`)) adjusted[key]=Math.max(0,adjusted[key]);
  for (const key of ["reflex", "dexterity"]) if (ev && adjusted[key] !== null) adjusted[key] = Math.max(1, adjusted[key]);
  if (modifiers.some(modifier => modifier.source === "witcher.dulled-emotions") && adjusted.empathy !== null) adjusted.empathy = Math.min(6, Math.max(1, adjusted.empathy));
  const { body, will } = adjusted;
  const limitBody = limitValue("body"), limitWill = limitValue("will");
  // Core p.176: Resolve = (WILL + INT) / 2 × 5, from the base values like HP and STA.
  const limitInt = limitValue("intelligence");
  const resolveMax = limitInt !== null && limitWill !== null ? Math.floor((Math.max(0, limitInt) + Math.max(0, limitWill)) / 2) * 5 : null;
  const physical = body !== null && will !== null ? Math.floor((Math.max(0, limitBody) + Math.max(0, limitWill)) / 2) : null;
  // A creature's printed HP/STA (set by the GM) replace the BODY/WILL formula; effect modifiers still apply.
  const baseLimit = key => creature?.[key] > 0 ? creature[key] : physical === null ? null : physical * 5;
  const healthMax = baseLimit("healthMax") === null ? null : Math.max(0, baseLimit("healthMax") + modifierTotal(modifiers, "healthMax"));
  const staminaMax = baseLimit("staminaMax") === null ? null : Math.max(0, scale(baseLimit("staminaMax") + modifierTotal(modifiers, "staminaMax"), "staminaMax"));
  const woundThreshold = Math.floor((healthMax ?? health.max) / 5);
  const wounded = woundThreshold > 0 && health.value < woundThreshold;
  const ignoresWoundPenalty = hasDose({effects},"radolf.potion.vitality");
  const lethalHealth = dyingHealth({ value: health.value, max: healthMax ?? health.max });
  if (parent?.type === "npc") {
    dead ||= lethalHealth;
    dying = false;
  } else dying ||= lethalHealth;
  const effective = Object.fromEntries(ATTRIBUTE_KEYS.map(key => {
    const value = adjusted[key];
    // Death replaces (rather than stacks with) the serious-wound penalty. Luck is exempt.
    if (value !== null && (dying || dead) && key !== "luck") return [key, Math.floor(value / 3)];
    return [key, value !== null && wounded && !ignoresWoundPenalty && WOUNDED_ATTRIBUTES.has(key) ? Math.floor(value / 2) : value];
  }));
  const { speed } = effective;
  // Printed creature exceptions (bird RUN 10, fiend REC 11) override the ordinary formulas.
  // Movement still follows changes to SPEED, and recovery still receives its own effect modifiers.
  const flyingBird = creatureProfile(creatureActor)?.id === "bird" && creatureMovementMode(creatureActor, environment) === "flying";
  const run = speed === null ? null : !flyingBird && creature?.runBase > 0 && attributes.speed > 0 ? Math.floor(creature.runBase * speed / attributes.speed) : speed * 3;
  const recoveryBase = creature?.recoveryBase > 0 ? creature.recoveryBase : physical;
  return {
    healthMax, staminaMax, resolveMax, meleeDamageBonus: modifierTotal(modifiers, "meleeDamage"), physicalDamageBonus: modifierTotal(modifiers, "physicalDamage"), encumbrance: ev, vigor: Math.max(0, vigor + modifierTotal(modifiers, "vigor")),
    stun: physical === null ? null : Math.max(0, Math.min(10, physical) + modifierTotal(modifiers, "stun")),
    physical, recovery: recoveryBase === null ? null : Math.max(0, scale(recoveryBase + modifierTotal(modifiers, "recovery"), "recovery")), woundThreshold, wounded, ignoresWoundPenalty, dying: dying && !dead, dead, effective, adjusted, modifiers,
    reputationBonus, reputation: reputationTotal, naturalArmor: modifierTotal(modifiers, "naturalArmor"),
    skillBonuses: Object.fromEntries([...new Set(modifiers.filter(modifier => modifier.target.startsWith("skills.")).map(modifier => modifier.target))]
      .map(target => [target.slice(7), modifierTotal(modifiers, target, abilityState.trustEnabled ? ["humanTarget"] : [])])),
    initiative: effective.reflex,
    run, leap: run === null ? null : Math.floor(run / 5),
    carryMax: effective.body === null ? null : (effective.body * 10 + modifierTotal(modifiers, "carryMax")) * (1 + modifierTotal(modifiers, "carryMultiplier"))
  };
}

export function stunSucceeded(result, target) {
  return result < target;
}
