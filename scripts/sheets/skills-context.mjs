import { LANGUAGES, languageForEntry } from "../data/languages.mjs";
import { nativeLanguage } from "../data/character-creation.mjs";
import { SKILLS, SKILL_GROUPS, skillValue } from "../data/skills.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { escapeTooltip, attributeTooltip } from "./statistics-tooltips.mjs";

export function skillTooltip(key, localize) {
  const skill = SKILLS.find(entry => entry.key === key);
  const prefix = `WITCHER.Skills.Entries.${key}`;
  return [escapeTooltip(localize(`${prefix}.Description`)),
    ...(skill.complex ? [escapeTooltip(localize("WITCHER.Skills.Complex"))] : []),
    ...[[10, "Ten"], [13, "Thirteen"], [16, "Sixteen"], [20, "Twenty"]]
      .map(([base, label]) => `<b>${base}</b> — ${escapeTooltip(localize(`${prefix}.${label}`))}`)
  ].join("<br><br>");
}

export function skillCalculationTooltip(system, value, i18n) {
  const { localize, format } = i18n;
  return [value.attributeOverride ? escapeTooltip(value.attributeOverride.label) : attributeTooltip(system, value.attribute, i18n),
    ...value.modifiers.map(modifier => `${modifier.value >= 0 ? "+" : "−"}${Math.abs(modifier.value)} — ${escapeTooltip(localize(modifier.label))}`),
    escapeTooltip(format("WITCHER.Skills.Formula", {
      attribute: localize(`WITCHER.Attributes.${value.attribute}.Short`), value: value.attributeValue ?? "—",
      level: value.level, bonus: value.bonus, total: value.total ?? "—"
    }))].join("<br>");
}

export function skillsContext(actor, i18n, { query = "", editing = false } = {}) {
  const { localize, format } = i18n;
  const canAct = conditionRules(actor).canAct;
  const search = query.trim().toLocaleLowerCase();
  const row = (key, languageId = "") => {
    const value = skillValue(actor.system, key, languageId);
    const label = value.language?.name ?? localize(value.label);
    return { ...value, label, languageId, total: value.total ?? "—", bonusText: value.bonus > 0 ? `+${value.bonus}` : String(value.bonus),
      attributeText: value.attributeValue ?? "—", attributeShort: `WITCHER.Attributes.${value.attribute}.Short`,
      tooltip: skillTooltip(key, localize), calculation: skillCalculationTooltip(actor.system, value, i18n),
      rollUnavailable: !canAct || value.total === null, rollHint: format("WITCHER.Skills.Roll", { skill: label, base: value.total ?? "—" }),
      searchName: `${label} ${localize(`WITCHER.Attributes.${value.attribute}.Label`)}`,
      visible: !search || `${label} ${localize(`WITCHER.Attributes.${value.attribute}.Label`)}`.toLocaleLowerCase().includes(search) };
  };
  const groups = SKILL_GROUPS.map(attribute => ({
    attribute, label: `WITCHER.Attributes.${attribute}.Label`,
    rows: SKILLS.filter(skill => skill.attribute === attribute && skill.key !== "language").map(skill => row(skill.key))
  })).map(group => ({ ...group, visible: group.rows.some(skill => skill.visible) }));
  // Core tongues first (the native one marked), then any custom language the player added.
  const native = actor.system.details?.race === "witcher" ? "language.common" : nativeLanguage(actor.system.details?.origin ?? "");
  const stored = actor.system.languages;
  const languages = [...LANGUAGES.map(language => {
    const entry = stored.find(item => languageForEntry(item)?.id === language.id);
    return { ...row("language", entry?.id ?? language.id), core: true, native: language.id === native };
  }), ...stored.filter(item => !languageForEntry(item)).map(item => ({ ...row("language", item.id), core: false, native: false }))];
  return { query, editing, groups, languages, empty: !groups.some(group => group.visible) && !languages.some(skill => skill.visible),
    languageTooltip: skillTooltip("language", localize) };
}
