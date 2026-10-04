import { SYSTEM_ID } from "../config.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { pendingActorWrite } from "../data/actor-writes.mjs";
import { reputationContext } from "../sheets/reputation-context.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";

export async function rollReputation(actor) {
  await pendingActorWrite(actor);
  if (!actor.isOwner) return;
  if (!conditionRules(actor).canAct) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Conditions.CannotAct"));
    return;
  }
  const { effective, reputation } = actor.system.statistics;
  if (effective.will === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledAttribute"));
    return;
  }
  const context = reputationContext(actor.system, { localize: key => game.i18n.localize(key), format: (key, data) => game.i18n.format(key, data) });
  const messageMode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll(`1d10 + ${effective.will} + ${reputation}`).evaluate({ allowInteractive: messageMode !== "blind" });
  return roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${escapeTooltip(game.i18n.localize("WITCHER.Reputation.Roll"))}</strong><br><span data-tooltip="${escapeTooltip(context.tooltip)}">${escapeTooltip(context.formula)}</span>`,
    flags: { [SYSTEM_ID]: { reputationCheck: { will: effective.will, level: reputation } } }
  }, { messageMode });
}
