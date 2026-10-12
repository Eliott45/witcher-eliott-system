import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { effectRules } from "../data/condition-definitions.mjs";
import { poisonDescription } from "../data/poison-rules.mjs";
import { effectCounter, activeEffect } from "../data/effect-counters.mjs";
import { fullTurnStart } from "../combat/full-turn-rules.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { creatureEffectImmunity } from "../combat/creature-spirits.mjs";

export class WitcherActiveEffect extends foundry.documents.ActiveEffect {
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    const actor=this.parent;
    if(actor?.documentName!=="Actor")return;
    if(options.witcherRestoreEffects)return;
    const immunity = creatureEffectImmunity(actor, this);
    if(immunity){ui.notifications.info(immunity);return false;}
    if(immuneToCondition(actor,this.statuses)){ui.notifications.info("У существа иммунитет к этому состоянию.");return false;}
    if(actor.effects.some(effect=>activeEffect(effect)&&[...this.statuses].some(status=>effect.statuses.has(status)
      && (status!=="poisoned" || Boolean(effect.flags?.[SYSTEM_ID]?.toxicity)===Boolean(this.flags?.[SYSTEM_ID]?.toxicity))))) {
      ui.notifications.info("Это состояние уже действует на персонажа."); return false;
    }
    const rules=effectRules(this);
    if(this.statuses.has("poisoned"))this.updateSource({description:poisonDescription(this)});
    if(!Object.keys(rules).length){this.updateSource({start:this.constructor.getEffectStart(),"duration.expired":false});return;}
    const explicitDuration=this.flags?.[SYSTEM_ID]?.conditionDurationOverride||Number.isFinite(data.duration?.value);
    let value=rules.rounds??rules.seconds??null;
    const formula=rules.roundsFormula??rules.secondsFormula;
    if(formula&&!explicitDuration){
      const display=trackRollDisplay();
      try{
        const mode=game.settings.get("core","messageMode");
        const roll=await evaluateRoll(formula,{allowInteractive:mode!=="blind"});
        value=Math.max(1,Math.floor(roll.total));
        const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor:`Длительность: ${esc(this.name)}`,
          flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:true,effectDuration:{value,units:rules.roundsFormula?"rounds":"seconds"}}}},{messageMode:mode});
        if(!message)return false;
        await display.wait(message);
      }finally{display.close();}
    }
    const counter=effectCounter({statuses:this.statuses,flags:{[SYSTEM_ID]:{condition:rules}}});
    this.updateSource({start:rules.expiry?fullTurnStart(actor):this.constructor.getEffectStart(),[`flags.${SYSTEM_ID}.condition`]:structuredClone(rules),[`flags.${SYSTEM_ID}.conditionState`]:counter?{counter:counter.value}:{},
      [`flags.${SYSTEM_ID}.conditionRequest`]:null,
      ...(!explicitDuration&&value!==null?{duration:{value,units:rules.rounds||rules.roundsFormula?"rounds":"seconds",expiry:rules.expiry??"turnEnd",expired:false}}:{"duration.expired":false})});
  }
}
