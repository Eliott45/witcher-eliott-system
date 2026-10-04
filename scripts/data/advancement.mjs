import { ATTRIBUTE_KEYS } from "./statistics.mjs";
import { SKILLS } from "./skills.mjs";
import { LANGUAGES, languageForEntry } from "./languages.mjs";
import { getProfession, professionPrerequisite } from "./professions.mjs";
import { magicPayment,magicAdvancement } from "../magic/improvement-points.mjs";

/** Book pp. 59, 61: each step uses its old rank; learning a skill starts at one IP. */
export function advancementCost(from, to, multiplier = 1) {
  if (![from, to, multiplier].every(Number.isSafeInteger) || from < 0 || to <= from || to > 10 || multiplier < 1) throw new Error("Invalid advancement range");
  return Array.from({ length: to - from }, (_, index) => Math.max(1, from + index) * multiplier);
}

export function advancementEntries(actor, localize = key => key) {
  const system = actor.system;
  const modifiers = system.statistics.modifiers ?? [];
  const entry = (id, kind, name, base, target, extra = {}) => {
    // Lifepath grants ranks, racial perks grant bonuses (Sage's Answers 15).
    // TODO: no explicit IP pricing ruling for permanent negative modifiers was found.
    // Preserve their separate modifier records; do not sell cheaper ranks due to a penalty.
    const ranks = modifiers.filter(mod => mod.target === target && mod.category === "lifepath" && !mod.condition
      && (!mod.languageId || mod.languageId === extra.languageRuleId) && mod.value > 0)
      .reduce((sum, mod) => sum + mod.value, 0);
    const level = base === null ? null : base + ranks;
    return { id, kind, name, base, ranks, level, multiplier: kind === "attributes" ? 10 : 1,
      prerequisite: "", detail: "", ...extra };
  };
  const entries = SKILLS.filter(skill => skill.key !== "language").map(skill => entry(`skill:${skill.key}`, "skills",
    localize(skill.label), system.skills[skill.key], `skills.${skill.key}`,
    { key: skill.key, multiplier: skill.complex ? 2 : 1, detail: localize(`WITCHER.Attributes.${skill.attribute}.Label`) }));
  const languages = system.languages.map(language => ({ ...language, rule: languageForEntry(language) }));
  for (const language of LANGUAGES) if (!languages.some(row => row.rule?.id === language.id)) {
    languages.push({ id: language.documentId, name: localize(language.name), level: 0, rule: language });
  }
  for (const language of languages) entries.push(entry(`language:${language.id}`, "languages", language.name, language.level,
    "skills.language", { key: language.id, languageRuleId: language.rule?.id ?? "", multiplier: 2 }));
  for (const key of ATTRIBUTE_KEYS) entries.push(entry(`attribute:${key}`, "attributes", localize(`WITCHER.Attributes.${key}.Label`),
    system.attributes[key], `attributes.${key}`, { key }));
  const profession = getProfession(system.details.profession);
  for (const ability of profession?.abilities ?? []) {
    const owned = [...(actor.items ?? [])].find(item => item.type === "ability" && item.system.ruleId === ability.id);
    entries.push(entry(`ability:${ability.id}`, "profession", ability.name, owned?.system.level ?? 0, ability.id,
      { key: ability.id, definition: ability, itemId: owned?.id ?? "", prerequisite: professionPrerequisite(ability)?.id ?? "",
        detail: ability.tier ? `${profession.branches[Number(ability.branch)]} · ${ability.tier}` : localize("WITCHER.Advancement.Defining") }));
  }
  return entries;
}

// Only advancement-relevant data: wounds, current pools and dice cannot invalidate a plan.
export function advancementFingerprint(actor) {
  return JSON.stringify([actor.system.experience ?? 0, actor.system.magic?.improvementPoints??0, actor.system.details.profession,
    advancementEntries(actor).map(({ id, base, ranks, itemId }) => [id, base, ranks, itemId])]);
}

export function advancementPlan(actor, selection, localize) {
  const entries = advancementEntries(actor, localize);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const changes = [];
  const errors = [];
  for (const [id, target] of Object.entries(selection)) {
    const row = byId.get(id);
    if (!row || row.base === null || (row.kind === "attributes" && row.base === 0)
      || !Number.isSafeInteger(target) || target <= row.base || target + row.ranks > 10) {
      errors.push("Invalid"); continue;
    }
    const steps = advancementCost(row.level, target + row.ranks, row.multiplier);
    if (row.prerequisite) {
      const predecessor = byId.get(`ability:${row.prerequisite}`);
      if (!predecessor || (selection[predecessor.id] ?? predecessor.base) + predecessor.ranks < 5) errors.push("Locked");
    }
    changes.push({ ...row, target, to: target + row.ranks, steps, cost: steps.reduce((sum, cost) => sum + cost, 0) });
  }
  const cost = changes.reduce((sum, row) => sum + row.cost, 0);
  const payment=magicPayment(actor,cost,changes.filter(magicAdvancement).reduce((sum,row)=>sum+row.cost,0));
  if (payment.remaining<0) errors.push("Insufficient");
  return { entries, changes, cost, ...payment, errors, valid: changes.length > 0 && errors.length === 0 };
}
