import { SYSTEM_ID } from "../config.mjs";
import { endTurnConditions } from "../combat/condition-saves.mjs";
import { startTurnPoison } from "../combat/poison-damage.mjs";
import { tickNoonDance } from "../combat/creature-actions-dance.mjs";
import { criticalWoundTurn } from "../combat/critical-wound-effects.mjs";
import { nauseaTurn } from "../combat/nausea.mjs";
import { dimeritiumTurn } from "../magic/dimeritium.mjs";
import { tacticsFlags } from "../combat/tactics-rules.mjs";

export class WitcherCombat extends foundry.documents.Combat {
  _sortCombatants(a,b) {
    const aOrder=tacticsFlags(a).turnOrder,bOrder=tacticsFlags(b).turnOrder;
    if(Number.isFinite(aOrder)||Number.isFinite(bOrder)) {
      const order=(Number.isFinite(bOrder)?bOrder:-Infinity)-(Number.isFinite(aOrder)?aOrder:-Infinity);
      if(order)return order;
    }
    return super._sortCombatants(a,b);
  }
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant,context);
    try { await tickNoonDance(this,combatant,context); }
    catch(error) { console.error("witcher-eliott-system | Noonwraith dance",error); ui.notifications.error(error.message); }
    try { await startTurnPoison(this,combatant,context); }
    catch(error) { console.error(`${SYSTEM_ID} | Start-turn poison`,error); ui.notifications.error("Не удалось завершить обработку отравления. Проверьте ПЗ и сообщение в чате; подробности в консоли."); }
    try { await nauseaTurn(this,combatant,context); }
    catch(error) { console.error(`${SYSTEM_ID} | Nausea`,error); ui.notifications.error("Не удалось бросить проверку тошноты. Бросьте её вручную."); }
    try { await dimeritiumTurn(this,combatant,context); }
    catch(error) { console.error(`${SYSTEM_ID} | Dimeritium turn`,error); ui.notifications.error("Не удалось бросить проверку от двимерита. Бросьте её вручную."); }
    try { await criticalWoundTurn(this,combatant,context); }
    catch(error) { console.error(`${SYSTEM_ID} | Critical wound turn`,error); ui.notifications.error("Не удалось провести испытание Устойчивости от критического ранения. Бросьте его вручную."); }
  }
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
    // Use the posted total after selected Luck and the zero minimum.
    const combatants = (typeof ids === "string" ? [ids] : ids).map(id => this.combatants.get(id)).filter(Boolean);
    const updates = [];
    for (const message of game.messages) {
      const flags = message.flags[SYSTEM_ID];
      if (flags?.initiativeBatch !== batch) continue;
      const combatant = combatants.find(entry => entry.actorId === message.speaker.actor
        && (entry.tokenId ?? null) === (message.speaker.token ?? null));
      const total = message.rolls[0]?.total;
      if (combatant?.isOwner && Number.isFinite(total) && combatant.initiative !== total) updates.push({ _id: combatant.id, initiative: total });
    }
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, {
      turnEvents: false, ...(options.updateTurn === false ? { combatTurn: this.turn } : {})
    });
    return this;
  }
}
