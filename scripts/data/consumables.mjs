import { SYSTEM_ID } from "../config.mjs";
import { itemNumber, itemText } from "./item-fields.mjs";
import { available } from "./workshop.mjs";
import { activeEffect } from "./effect-counters.mjs";
import { conditionSource } from "./condition-definitions.mjs";

const expendableGear = new Set(["simple-meal", "good-meal", "feast", "raw-meat", "sweets", "rations", "alcahest", "beer", "spirits", "wine", "tobacco", "candles", "soap", "perfume"].map(id => `gear.${id}`));
const bottleUses = { "alchemy.smelling-salts": 25, "alchemy.chloroform": 25, "gear.candles": 5 };

/** Classification reuses kind/ruleId. Only custom overrides and a partly used bottle need new Item state. */
export function consumptionFields() {
  return new foundry.data.fields.SchemaField({
    mode: itemText("auto", { choices: ["auto", "consume", "none"] }),
    usesPerItem: itemNumber(0, { integer: true }),
    spentUses: itemNumber(0, { integer: true })
  });
}
export function consumableContext(item) {
  const s = item.system, mode = s.consumption?.mode ?? "auto";
  const supported = ["equipment", "weapon", "armor"].includes(item.type);
  const enabled = supported && mode !== "none" && (mode === "consume" || ["alchemy", "mutagen", "ammunition"].includes(s.kind) || /^(?:bomb|trap)\./u.test(s.ruleId ?? "") || expendableGear.has(s.ruleId));
  const uses = Math.max(1, s.consumption?.usesPerItem || bottleUses[s.ruleId] || 1);
  const spent = Math.min(uses - 1, Math.max(0, s.consumption?.spentUses ?? 0));
  const remaining = Math.max(0, (s.quantity ?? 1) * uses - spent);
  return { enabled, uses, spent, remaining, canUse: enabled && available(item), label: "Использовать", hint: uses > 1 ? `Использовать · осталось применений: ${remaining}` : "Использовать одну порцию" };
}
export function consumptionPlan(item) {
  const use = consumableContext(item);
  if (!use.canUse) throw new Error("Нужен расходуемый предмет при себе с оставшимися порциями.");
  const exhausted = use.spent + 1 >= use.uses;
  return { expenses: exhausted ? [{ itemId: item.id, quantity: 1 }] : [],
    updates: [{ _id: item.id, "system.consumption.spentUses": exhausted ? 0 : use.spent + 1 }] };
}

export const consumedDose = effect => effect.flags?.[SYSTEM_ID]?.consumable;
export const doseToxicity = effect => Math.max(0, Number(consumedDose(effect)?.toxicity) || 0);
export const activeDoses = actor => Array.from(actor.effects ?? []).filter(effect => activeEffect(effect) && consumedDose(effect));
export const hasDose = (actor, ruleId) => activeDoses(actor).some(effect => consumedDose(effect).ruleId === ruleId);
export function toxicityState(actor) {
  const witcher = actor.system?.details?.race === "witcher";
  const rank = witcher && actor.system.details?.profession === "witcher"
    ? Math.min(10, Math.max(0, Number(Array.from(actor.items ?? []).find(item => item.type === "ability" && item.system.ruleId === "profession.witcher.iron-stomach")?.system.level) || 0)) : 0;
  const limit = 100 + (rank === 10 ? 50 : Math.ceil(rank / 2) * 5);
  const value = activeDoses(actor).reduce((sum, effect) => sum + doseToxicity(effect), 0);
  const poisoned = Array.from(actor.effects ?? []).some(effect => activeEffect(effect) && effect.flags?.[SYSTEM_ID]?.toxicity);
  return { value, limit, witcher, poisoned, visible: witcher || value > 0 || poisoned, overloaded: value > limit, percent: Math.min(100, value / limit * 100) };
}
const modifiers = {
  "potion.petri": ["spellCasting", "hexWeaving", "ritualCrafting"].map(skill => ({ target: `skills.${skill}`, value: 2 })),
  "potion.tawny-owl": [{ target: "recovery", value: 2 }],
  "potion.thunderbolt": [{ target: "physicalDamage", value: 3 }],
  "decoction.fiend": [{ target: "carryMultiplier", value: 1 }],
  "decoction.nekker": ["riding", "athletics"].map(skill => ({ target: `skills.${skill}`, value: 3 }))
};
// Combat-triggered effects (regeneration, temporary HP, kills, hits) live in workshop/witcher-elixirs.mjs;
// never convert temporary HP into a permanent healthMax bonus.
export function potionEffectSource(item) {
  const s = item.system, ruleId = s.ruleId || item.uuid;
  const rounds = {"radolf.potion.vitality":"2d6","radolf.potion.raffard":"4d6"}[ruleId];
  const source = conditionSource({ id: ruleId, name: item.name, img: item.img, description: "", rules: { ...(rounds?{roundsFormula:rounds,expiry:"turnEnd"}:{seconds:s.alchemy.duration}), modifiers: modifiers[ruleId] ?? [] } });
  delete source._id;
  // Each dose retains its own timer/toxicity. Benefit de-duplication is shared by statistics.
  source.statuses = [];
  source.description = s.description || `<p>${s.properties ?? ""}</p>`;
  source.origin = item.uuid;
  source.flags[SYSTEM_ID].consumable = { ruleId, category: s.alchemy.category, toxicity: s.alchemy.toxicity, consumedAt: globalThis.game?.time?.worldTime ?? 0 };
  return source;
}

export function potionImmunity(actor, statuses) {
  const ids = new Set(statuses);
  return (ids.has("poisoned") && hasDose(actor, "potion.golden-oriole"))
    || (["stunned", "blind", "blinded", "prone"].some(id => ids.has(id)) && hasDose(actor, "decoction.noonwraith"));
}
