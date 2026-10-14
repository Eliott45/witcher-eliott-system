import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { setStatus } from "./status-effects.mjs";
import { EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { creatureGolemSlowed } from "../data/creature-modes.mjs";
import { stunSucceeded } from "../data/statistics.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";

/** Core p.72: bleed requires injury; ablating damages armor on a hit, even when SP holds. */
export function weaponHitTraits(weapon = {}, actor = null) {
  const text = String(weapon.properties ?? "");
  const chance = pattern => Math.min(100, Math.max(0, Number(text.match(pattern)?.[1] ?? 0)));
  return {
    bleeding: chance(/(?:кровопускающ\S*|кровотечение)\s*\((\d+)\s*%\)/iu),
    poisoned: chance(/(?:отравление|яд|отравляющ\S*)\s*\((\d+)\s*%\)/iu),
    burning: chance(/(?:горение|поджигающ\S*)\s*\((\d+)\s*%\)/iu),
    frozen: chance(/заморажива\S*\s*\((\d+)\s*%\)/iu),
    staggered: chance(/ошеломлени\S*\s*\((\d+)\s*%\)/iu),
    // Monster Hunter's Journal: «Болезнь (50%)» needs an injury, like bleeding and poison.
    diseased: chance(/болезн\S*\s*\((\d+)\s*%\)/iu),
    shadowDrain: text.match(/теневые когти\s*\((\d+d\d+)\)/iu)?.[1] ?? null,
    stunModifier: /дезориентирующ/iu.test(text) ? Number(text.match(/дезориентирующ\S*\s*\(([−-]?\d+)\)/iu)?.[1]?.replace("−", "-") ?? 0) : null,
    specterDamage: Number(text.match(/\+(\d+)\s+урона\s+призракам/iu)?.[1] ?? 0),
    ablating: /разрушающ/iu.test(text),
    // Monster Hunter's Journal, graveir acid: its own ablation dice, dice against a blocking item, effects on any hit.
    ablationDice: text.match(/разрушающ\S*\s*\((\d+d\d+)\)/iu)?.[1] ?? null,
    // «1d6/2» (archespore) halves the dice like ordinary ablation.
    blockWear: text.match(/разрушает блок\S*\s*\((\d+d\d+)(?:\s*\/\s*(\d+))?\)/iu)?.slice(1, 3).reduce((dice, divisor) => divisor ? `floor(${dice} / ${divisor})` : dice) ?? null,
    contact: /без пробития/iu.test(text),
    wearMultiplier: !creatureGolemSlowed(actor) && /двойной урон (?:оружию|снаряжению)/iu.test(text) ? 2 : 1,
    noParry: !creatureGolemSlowed(actor) && /нельзя парировать/iu.test(text)
  };
}

export function weaponConditionChances(traits, result, { nonLethal = false } = {}) {
  if (result.immune) return [];
  return ["bleeding", "poisoned", "burning", "frozen", "staggered", "diseased"].filter(id => traits?.[id] > 0
    && (["burning", "frozen", "staggered"].includes(id) || !nonLethal && (traits.contact || result.total > 0 && result.penetrated)))
    .map(id => ({ id, chance: traits[id] }));
}

/** Roll before mutating the target. Return serializable results for the original attack card. */
export async function rollWeaponConditions(actor, traits, result, options = {}) {
  const rolls = [], effects = [];
  for (const entry of weaponConditionChances(traits, result, options)) {
    const immune = immuneToCondition(actor, [entry.id]);
    const roll = !immune && entry.chance < 100 ? await evaluateRoll("1d100",{ allowInteractive: !options.blind }) : null;
    if (roll) rolls.push(roll);
    effects.push({ ...entry, immune, roll: roll?.total ?? null, applied: !immune && (!roll || roll.total <= entry.chance),
      ...(entry.id === "bleeding" && options.ammunition?.ruleId === "ammunition.elven-burrowing" ? {burrowing:true} : {}) });
  }
  // Stun (core p.72) is a save on a head/torso hit, even if armor stopped the damage.
  if (!result.immune && traits?.stunModifier != null && ["head", "torso"].includes(options.location)) {
    const target = actor.system?.statistics?.stun;
    if (Number.isFinite(target)) {
      const roll = await evaluateRoll("1d10",{ allowInteractive: !options.blind });
      rolls.push(roll);
      effects.push({ id: "stunned", save: true, target: target + traits.stunModifier, modifier: traits.stunModifier,
        roll: roll.total, applied: !stunSucceeded(roll.total, target + traits.stunModifier) });
    }
  }
  return { rolls, effects };
}

export async function applyWeaponConditions(actor, effects) {
  for (const effect of effects) if (effect.applied) {
    if (effect.id === "staggered") {
      const source = conditionSource(EFFECT_TEMPLATES.find(entry => entry.key === "staggered")); delete source._id;
      source.start = fullTurnStart(actor);
      source.duration = { value: 1, units: "rounds", expiry: "turnStart", expired: false };
      const existing = Array.from(actor.effects).find(entry => entry.statuses.has("staggered"));
      if (existing) await existing.update(source);
      else await actor.createEmbeddedDocuments("ActiveEffect", [source]);
      continue;
    }
    if (!effect.burrowing) { await setStatus(actor, effect.id, true); continue; }
    const source=conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="burrowing")); delete source._id;
    const existing=Array.from(actor.effects).find(entry=>entry.statuses.has("bleeding"));
    if (existing) await existing.update(source);
    else await actor.createEmbeddedDocuments("ActiveEffect",[source]);
  }
}

export const weaponConditionLabel = id => ({ bleeding: "Кровотечение", poisoned: "Отравление", burning: "Горение", frozen: "Замораживание", staggered: "Ошеломление", stunned: "Дезориентация", diseased: "Болезнь" })[id] ?? id;
export const weaponConditionReport = effects => effects.map(effect => effect.save
  ? `Испытание УСТ ${effect.modifier}: ${effect.roll} против ${effect.target} — ${effect.applied ? "дезориентация" : "успех"}`
  : `${weaponConditionLabel(effect.id)} ${effect.chance}%: ${effect.immune ? "иммунитет" : `${effect.roll === null ? "" : `${effect.roll} — `}${effect.applied ? "наложено" : "не сработало"}`}`).join("; ");
