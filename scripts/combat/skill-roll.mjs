import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";
import { skillCalculationTooltip } from "../sheets/skills-context.mjs";

export async function rollSkill(actor, key, languageId = "") {
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
  const messageMode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll(`1d10wc + ${skill.total}`).evaluate({ allowInteractive: messageMode !== "blind" });
  return roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `<span data-tooltip="${escapeTooltip(calculation)}">${escapeTooltip(game.i18n.format("WITCHER.Skills.Roll", { skill: name, base: skill.total }))}</span>`,
    flags: { [SYSTEM_ID]: { skillCheck: { key, languageId, base: skill.total, level: skill.level, attribute: skill.attributeValue, bonus: skill.bonus } } }
  }, { messageMode });
}
