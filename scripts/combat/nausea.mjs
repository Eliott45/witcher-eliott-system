import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_BY_ID, conditionSource, effectRules } from "../data/condition-definitions.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

/**
 * Core p.161, Nausea: every 3 rounds roll 1d10, which must be lower than BODY; otherwise the character spends the
 * round vomiting. The first roll comes after a full interval. Active GM only, at the start of the character's turn.
 */
export async function nauseaTurn(combat, combatant, context) {
  const actor = combatant?.actor;
  if (!actor || game.user !== game.users.activeGM || !combat.started || context.skipped || context.round < 1) return;
  const effect = actor.effects.find(entry => !entry.disabled && !entry.isSuppressed && effectRules(entry).nausea);
  if (!effect) return;
  const every = effectRules(effect).nausea.every ?? 3, state = effect.flags?.[SYSTEM_ID]?.nausea;
  const next = state?.combat === combat.uuid ? state.round : null;
  if (next !== null && context.round < next) return;
  await effect.update({ [`flags.${SYSTEM_ID}.nausea`]: { combat: combat.uuid, round: context.round + every } });
  if (next === null) return;
  const body = actor.system.statistics?.effective?.body ?? 0;
  const roll = await evaluateRoll("1d10");
  const vomits = roll.total >= body;
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<h3>Тошнота</h3><p>Нужно меньше ТЕЛ ${body}: <strong>${vomits ? `${esc(actor.name)} рвёт — этот ход потерян` : "удалось сдержаться"}</strong>.</p>` },
    { messageMode: combatant.hidden ? "gm" : game.settings.get("core", "messageMode") });
  if (!vomits || actor.effects.some(entry => entry.statuses.has("vomiting"))) return;
  const source = conditionSource(CONDITION_BY_ID.vomiting); delete source._id;
  await actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, start: fullTurnStart(actor), duration: { value: 1, units: "rounds", expiry: "turnEnd", expired: false } }]);
}
