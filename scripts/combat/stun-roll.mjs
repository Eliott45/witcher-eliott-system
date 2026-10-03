import { stunSucceeded } from "../data/statistics.mjs";
import { hasStunned, setStunned, reportEffectError } from "./status-effects.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { stunTooltip, escapeTooltip } from "../sheets/statistics-tooltips.mjs";

export async function rollStun(actor) {
  if (!actor.isOwner) return;
  const target = actor.system.statistics.stun;
  if (target === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledPhysical"));
    return;
  }
  const messageMode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll("1d10").evaluate({ allowInteractive: messageMode !== "blind" });
  const outcome = game.i18n.localize(stunSucceeded(roll.total, target)
    ? "WITCHER.Statistics.Success" : "WITCHER.Statistics.Failure");
  const tooltip = stunTooltip(actor.system, {
    localize: key => game.i18n.localize(key), format: (key, data) => game.i18n.format(key, data)
  });
  const display = trackRollDisplay();
  try {
    const message = await roll.toMessage({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true } },
      flavor: game.i18n.format("WITCHER.Statistics.StunResult", {
        target: `<strong class="witcher-stun-target" data-tooltip="${escapeTooltip(tooltip)}" tabindex="0">${target}</strong>`, outcome
      })
    }, { messageMode });
    await display.wait(message);
    if (message && stunSucceeded(roll.total, target) && hasStunned(actor)) await setStunned(actor, false).catch(reportEffectError);
    return message;
  } finally { display.close(); }
}
