import { SYSTEM_ID } from "../config.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { hasStatus, setStatus, DYING, DEAD } from "./status-effects.mjs";

/** Called by the per-actor death event queue, including the manual sheet button. */
export async function rollDeathSave(actor, cause = "manual", { onPosted = () => {} } = {}) {
  if (!actor.isOwner || hasStatus(actor, DEAD) || !actor.system.statistics.dying) return;
  const statistics = actor.system.statistics;
  if (statistics.stun === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledPhysical"));
    return;
  }
  const episode = actor.system.death.episode;
  const save = { base: statistics.stun, penalty: actor.system.death.penalty, episode, cause,
    body: statistics.adjusted.body, will: statistics.adjusted.will, physical: statistics.recovery };
  const messageMode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll("1d10").evaluate({ allowInteractive: messageMode !== "blind" });
  const display = trackRollDisplay();
  try {
    const message = await roll.toMessage({
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], deathSave: save } }
    }, { messageMode });
    if (message) onPosted(message);
    await display.wait(message);
    const result = message?.flags[SYSTEM_ID]?.deathSave;
    // External healing or a GM correction while the dice were rolling invalidates this episode.
    if (result?.resolved && !result.succeeded && actor.system.death.episode === episode
      && actor.system.statistics.dying && !hasStatus(actor, DEAD)) {
      await setStatus(actor, DEAD, true);
      await setStatus(actor, DYING, false);
    }
    return message;
  } finally { display.close(); }
}
