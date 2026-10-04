import { SYSTEM_ID } from "../config.mjs";
import { endTurnConditions } from "../combat/condition-saves.mjs";

export class WitcherCombat extends foundry.documents.Combat {
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant,context);
    try { await endTurnConditions(this,combatant,context); }
    catch(error) { console.error(`${SYSTEM_ID} | End-turn conditions`,error); ui.notifications.error("Не удалось проверить эффект в конце хода. Можно повторить проверку вручную."); }
  }
  async rollInitiative(ids, options = {}) {
    const batch = foundry.utils.randomID();
    const messageOptions = foundry.utils.mergeObject(options.messageOptions ?? {}, {
      [`flags.${SYSTEM_ID}.initiativeBatch`]: batch
    }, { inplace: false });
    await super.rollInitiative(ids, { ...options, messageOptions });
    // Native initiative writes the tracker before creating its chat messages.
    // Use the posted total if the chat creation applied selected Luck.
    const combatants = (typeof ids === "string" ? [ids] : ids).map(id => this.combatants.get(id)).filter(Boolean);
    const updates = [];
    for (const message of game.messages) {
      const flags = message.flags[SYSTEM_ID];
      if (flags?.initiativeBatch !== batch || !flags.luck) continue;
      const combatant = combatants.find(entry => entry.actorId === message.speaker.actor
        && (entry.tokenId ?? null) === (message.speaker.token ?? null));
      if (combatant?.isOwner) updates.push({ _id: combatant.id, initiative: message.rolls[0].total });
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, {
      turnEvents: false, ...(options.updateTurn === false ? { combatTurn: this.turn } : {})
    });
    return this;
  }
}
