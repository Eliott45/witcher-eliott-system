import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { skillValue } from "../data/skills.mjs";
import { getProfessionAbility, professionAbilityState } from "../data/professions.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { SYSTEM_ID } from "../config.mjs";

export function workshopBase(actor, skill) {
  const definition = getProfessionAbility(skill);
  if (definition) {
    if (definition.profession !== actor.system.details.profession) return null;
    const state = professionAbilityState(actor, definition);
    return state.attribute !== null && state.level > 0 ? state.attribute + state.level + state.bonus : null;
  }
  return skillValue(actor.system, skill)?.total ?? null;
}
export async function workshopCheck(actor, { name, skill, dc, bonus = 0, details = "", flags = {} }) {
  const base = workshopBase(actor, skill);
  if (!actor.isOwner || !conditionRules(actor).canAct) throw new Error("Персонаж сейчас не может выполнять это действие.");
  if (base === null) throw new Error("Заполните связанный параметр и изучите необходимый профессиональный навык.");
  const display = trackRollDisplay();
  try {
    const messageMode = game.settings.get("core", "messageMode");
    const roll = await evaluateRoll(`1d10wc + ${base} + ${bonus}`,{ allowInteractive: messageMode !== "blind" });
    const message = await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: `<b>${esc(name)}</b><p data-tooltip="${esc(`База ${base}; бонус ${bonus}. ${details}`)}">База ${base} + бонус ${bonus}; СЛ ${dc}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, ...display.flags[SYSTEM_ID], workshop: { skill, dc, base, bonus } } }
    }, { messageMode });
    if (!message) throw new Error("Бросок отменён; предметы не изменены.");
    await display.wait(message);
    // Luck is applied by the shared ChatMessage pipeline: use the persisted roll, not the pre-message total.
    const total = message.rolls[0].total;
    const success = total >= dc;
    await message.update({ flavor: `${message.flavor}<p><strong>${success ? "Успех" : "Неудача"}: ${total} против СЛ ${dc}</strong></p>` });
    return { success, total, message, roll: message.rolls[0] };
  } finally { display.close(); }
}
export async function workshopNotice(actor, content) {
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content, flags: { [SYSTEM_ID]: { skipLuck: true } } }, { messageMode: game.settings.get("core", "messageMode") });
}
