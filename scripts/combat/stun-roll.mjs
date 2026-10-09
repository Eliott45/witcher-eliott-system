import { stunSucceeded } from "../data/statistics.mjs";
import { hasStunned, setStunned, setStatus, EXHAUSTED_STUN, reportEffectError } from "./status-effects.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { stunTooltip, escapeTooltip } from "../sheets/statistics-tooltips.mjs";

/**
 * A stun save. As a recovery save (default) success ends Stunned. As a test (`test: true`: critical wounds,
 * fumbles, dimeritium) failure makes the character stunned and success leaves the state unchanged.
 */
export async function rollStun(actor, { messageMode = game.settings.get("core", "messageMode"), messageData = {}, test = false } = {}) {
  if (!actor.isOwner) return;
  const conditions = conditionRules(actor);
  if (!conditions.canStunSave) {
    ui.notifications.warn(conditions.exhausted && !conditions.ready
      ? game.i18n.format("WITCHER.Conditions.StaminaRequired", { value: conditions.required })
      : game.i18n.localize("WITCHER.Conditions.CannotStunSave"));
    return;
  }
  const exhaustionEpisode = actor.system.exhaustionEpisode;
  const exhaustedEffectIds = new Set(actor.effects.filter(effect => effect.statuses.has(EXHAUSTED_STUN)).map(effect => effect.id));
  const target = actor.system.statistics.stun;
  if (target === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledPhysical"));
    return;
  }
  const roll = await new foundry.dice.Roll("1d10").evaluate({ allowInteractive: messageMode !== "blind" });
  const outcome = game.i18n.localize(stunSucceeded(roll.total, target)
    ? "WITCHER.Statistics.Success" : "WITCHER.Statistics.Failure");
  const tooltip = stunTooltip(actor.system, {
    localize: key => game.i18n.localize(key), format: (key, data) => game.i18n.format(key, data)
  });
  const display = trackRollDisplay();
  try {
    const message = await roll.toMessage({
      ...messageData,
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true } },
      flavor: game.i18n.format("WITCHER.Statistics.StunResult", {
        target: `<strong class="witcher-stun-target" data-tooltip="${escapeTooltip(tooltip)}" tabindex="0">${target}</strong>`, outcome
      })
    }, { messageMode });
    await display.wait(message);
    if (message && test) {
      if (!stunSucceeded(roll.total, target) && !hasStunned(actor)) await setStunned(actor, true).catch(reportEffectError);
      return message;
    }
    if (message && stunSucceeded(roll.total, target) && hasStunned(actor)) {
      const current = conditionRules(actor);
      if (current.canStunSave && actor.system.exhaustionEpisode === exhaustionEpisode) {
        await setStunned(actor, false).catch(reportEffectError);
        if (conditions.exhausted && current.exhausted && actor.effects.some(effect => exhaustedEffectIds.has(effect.id)
          && effect.statuses.has(EXHAUSTED_STUN) && !effect.disabled && !effect.isSuppressed)) {
          await setStatus(actor, EXHAUSTED_STUN, false).catch(reportEffectError);
        }
      }
    }
    return message;
  } finally { display.close(); }
}
