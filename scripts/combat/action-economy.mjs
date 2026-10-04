import { SYSTEM_ID } from "../config.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";

export function actionFields() {
  const { SchemaField, BooleanField, StringField } = foundry.data.fields;
  return new SchemaField({ extra: new BooleanField({initial:false}), lastExtraRound:new StringField({required:true,nullable:false,initial:"",blank:true}) });
}
export function actionRoundKey(actor, combat = globalThis.game?.combat) {
  return combat?.started && Array.from(combat.combatants ?? []).some(c=>c.actor?.uuid===actor.uuid)
    ? `${combat.id}:${combat.round}` : "";
}
/** Errata p.151: one extra ACTION, not one extra attack; all its checks take −3. */
export function actionQuote(actor, { ignoreExtra = false, cost = 0 } = {}) {
  if (!actor.isOwner || !conditionRules(actor).canAct) throw new Error("Персонаж сейчас не может действовать.");
  const extra = !ignoreExtra && Boolean(actor.system.combatAction?.extra), roundKey = actionRoundKey(actor);
  if (extra && roundKey && actor.system.combatAction.lastExtraRound === roundKey) throw new Error("Дополнительное действие в этом раунде уже использовано.");
  const stamina = extra ? 3 : 0;
  if (stamina + cost > 0 && actor.system.stamina.value < stamina + cost) throw new Error(`Недостаточно Выносливости: нужно ${stamina + cost}.`);
  return { extra, penalty: extra ? -3 : 0, stamina, roundKey };
}
export const actionNote = quote => quote.extra ? '<p class="witcher-extra-note">Дополнительное действие: −3 к проверкам · 3 ВЫН за всё действие.</p>' : "";
export function actionUpdate(actor, quote, otherCost = 0) {
  return { ...(quote.stamina + otherCost ? { "system.stamina.value": Math.max(0, actor.system.stamina.value - quote.stamina - otherCost) } : {}),
    ...(quote.extra ? { "system.combatAction.extra": false, "system.combatAction.lastExtraRound": quote.roundKey } : {}) };
}

/** Ordinary action checks share the inventory/casting queue. Saves and initiative bypass it. */
export function rollActionCheck(actor, { formula, flavor, flags = {} }, options = {}) {
  return inventoryWrite(actor, async () => {
    const quote = actionQuote(actor,options), display = trackRollDisplay(), messageMode = game.settings.get("core", "messageMode");
    try {
      const roll = await new foundry.dice.Roll(`${formula}${quote.penalty ? ` - 3` : ""}`).evaluate({allowInteractive:messageMode!=="blind"});
      const systemFlags = { ...flags[SYSTEM_ID], ...display.flags[SYSTEM_ID], action: quote };
      // Rerolls retain the original paid modifier without buying another action.
      for (const key of ["skillCheck", "professionCheck"]) if (systemFlags[key]) systemFlags[key] = {...systemFlags[key], base:systemFlags[key].base + quote.penalty};
      const message = await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor:flavor+actionNote(quote),flags:{...flags,[SYSTEM_ID]:systemFlags}},{messageMode});
      if (!message) return;
      await display.wait(message);
      if (quote.extra) await actor.update(actionUpdate(actor,quote));
      return message;
    } finally { display.close(); }
  }).catch(error=>{ui.notifications.warn(error.message);});
}
