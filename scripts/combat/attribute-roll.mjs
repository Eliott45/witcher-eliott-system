import { ATTRIBUTE_KEYS } from "../data/statistics.mjs";
import { rollActionCheck } from "./action-economy.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { modifierTotal } from "../data/background-modifiers.mjs";

export async function rollAttribute(actor, key) {
  if (!actor.isOwner || !ATTRIBUTE_KEYS.includes(key)) return;
  if (!conditionRules(actor).canAct) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Conditions.CannotAct"));
    return;
  }
  const base = actor.system.statistics.effective[key];
  const value = base === null ? null : base + modifierTotal(actor.system.statistics.modifiers ?? [],"attributeCheck");
  if (value === null) {
    ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledAttribute"));
    return;
  }
  return rollActionCheck(actor, {
    formula: `1d10wc + ${value}`,
    flavor: game.i18n.format("WITCHER.Statistics.AttributeRoll", {
      attribute: game.i18n.localize(`WITCHER.Attributes.${key}.Label`), value
    })
  });
}
