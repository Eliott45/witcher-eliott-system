import { SYSTEM_ID } from "../config.mjs";
import { effectRules } from "../data/condition-definitions.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export class WitcherActiveEffect extends foundry.documents.ActiveEffect {
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    const actor=this.parent;
    if(actor?.documentName!=="Actor")return;
    if(actor.effects.some(effect=>!effect.disabled&&!effect.isSuppressed&&[...this.statuses].some(status=>effect.statuses.has(status)))) {
      ui.notifications.info("Это состояние уже действует на персонажа."); return false;
    }
    const rules=effectRules(this);
    if(!Object.keys(rules).length)return;
    let value=rules.rounds??rules.seconds??null;
    const formula=rules.roundsFormula??rules.secondsFormula;
    if(formula){
      const display=trackRollDisplay();
      try{
        const mode=game.settings.get("core","messageMode");
        const roll=await new foundry.dice.Roll(formula).evaluate({allowInteractive:mode!=="blind"});
        const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor:`Длительность: ${esc(this.name)}`,
          flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:true}}},{messageMode:mode});
        if(!message)return false;
        await display.wait(message); value=Math.max(1,Math.floor(roll.total));
      }finally{display.close();}
    }
    this.updateSource({start:this.constructor.getEffectStart(),[`flags.${SYSTEM_ID}.condition`]:structuredClone(rules),[`flags.${SYSTEM_ID}.conditionState`]:{},
      [`flags.${SYSTEM_ID}.conditionRequest`]:null,
      ...(value!==null?{duration:{value,units:rules.rounds||rules.roundsFormula?"rounds":"seconds",expiry:"turnEnd",expired:false}}:{})});
  }
}
