import { SYSTEM_ID } from "../config.mjs";
import { wheelchair, wheelchairPenalty } from "../data/prosthetic-rules.mjs";
import { rollActionCheck } from "./action-economy.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";
import { skillCalculationTooltip } from "../sheets/skills-context.mjs";

export async function rollSkill(actor, key, languageId = "", { activity } = {}) {
  if (!actor.isOwner) return;
  if (!conditionRules(actor).canAct) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Conditions.CannotAct"));
    return;
  }
  const skill = skillValue(actor.system, key, languageId);
  if (!skill) return;
  if (skill.total === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledAttribute"));
    return;
  }
  const name = skill.language?.name ?? game.i18n.localize(skill.label);
  const i18n = { localize: key => game.i18n.localize(key), format: (key, values) => game.i18n.format(key, values) };
  const calculation = skillCalculationTooltip(actor.system, skill, i18n);
  if (key === "athletics" && wheelchair(actor) && !activity) {
    activity = await foundry.applications.api.DialogV2.wait({ window: { title: "Атлетика в коляске" },
      content: `<p>Для плавания и лазания действует штраф ${wheelchairPenalty(actor, "swimming")}.</p>`,
      buttons: [{ action: "ordinary", label: "Обычная проверка", callback: () => "ordinary" },
        { action: "swimming", label: "Плавание", callback: () => "swimming" }, { action: "climbing", label: "Лазание", callback: () => "climbing" }], rejectClose: false });
    if (!["ordinary", "swimming", "climbing"].includes(activity)) return;
  }
  const penalty = wheelchairPenalty(actor, activity), base = skill.total + penalty;
  return rollActionCheck(actor, {
    formula: `1d10wc + ${base}`,
    flavor: `<span data-tooltip="${escapeTooltip(calculation)}">${escapeTooltip(game.i18n.format("WITCHER.Skills.Roll", { skill: name, base }))}</span>${penalty ? `<p>${activity === "swimming" ? "Плавание" : "Лазание"} в коляске: ${penalty}</p>` : ""}`,
    flags: { [SYSTEM_ID]: { skillCheck: { key, languageId, base, level: skill.level, attribute: skill.attributeValue, bonus: skill.bonus + penalty, activity: activity ?? "" } } }
  });
}
