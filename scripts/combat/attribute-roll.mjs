import { ATTRIBUTE_KEYS } from "../data/statistics.mjs";
import { conditionRules } from "./condition-rules.mjs";

export async function rollAttribute(actor, key) {
  if (!actor.isOwner || !ATTRIBUTE_KEYS.includes(key)) return;
  if (!conditionRules(actor).canAct) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Conditions.CannotAct"));
    return;
  }
  const value = actor.system.statistics.effective[key];
  if (value === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledAttribute"));
    return;
  }
  const messageMode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll(`1d10wc + ${value}`).evaluate({ allowInteractive: messageMode !== "blind" });
  return roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("WITCHER.Statistics.AttributeRoll", {
      attribute: game.i18n.localize(`WITCHER.Attributes.${key}.Label`), value
    })
  }, { messageMode });
}
