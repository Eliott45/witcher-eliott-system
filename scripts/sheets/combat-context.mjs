import { equippedItems } from "../data/physical-items.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { actionRoundKey, actionQuote, actionUpdate } from "../combat/action-economy.mjs";
import { attackModes, weaponAttack, gripOf, signed, ATTACK_LOCATIONS, RANGED_BANDS } from "../combat/weapon-rules.mjs";
import { rollWeaponAttack } from "../combat/weapon-rolls.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { defenseQuote, rollDefense, INCOMING_ATTACKS } from "../combat/defense-rolls.mjs";
import { fullTurnContext, performFullTurnAction } from "../combat/full-turn-actions.mjs";
import { recoverStamina } from "../combat/exhaustion.mjs";
import { consumeAiming } from "../combat/full-turn-rules.mjs";
import { ambushState, tacticsFlags } from "../combat/tactics-rules.mjs";

export function combatContext(actor,options={}) {
  const extra=Boolean(actor.system.combatAction?.extra),key=actionRoundKey(actor),used=Boolean(key&&actor.system.combatAction?.lastExtraRound===key);
  const canAct=conditionRules(actor).canAct;
  const fullTurn=fullTurnContext(actor);
  const encounter=globalThis.game?.combat,ambusher=encounter?.combatants.find(entry=>entry.actor?.uuid===actor.uuid);
  const ambush=ambushState(encounter,ambusher);
  const ambushTargets=(ambush?.targets??[]).map(uuid=>({uuid,name:encounter.combatants.find(entry=>entry.token?.uuid===uuid)?.name??"Цель"}));
  const defenses=[{mode:"dodge"},{mode:"reposition"},...equippedItems(actor.items).filter(item=>item.type==="weapon"&&["melee","shield"].includes(item.system.category)).flatMap(item=>[{mode:"block",itemId:item.id},{mode:"parry",itemId:item.id}])]
    .map(entry=>{const quote=defenseQuote(actor,{...options,...entry});return {...quote,base:quote.total===null?"—":signed(quote.total),disabled:Boolean(quote.blocked),hint:quote.blocked||`${quote.math} ${quote.note}`};});
  return { extra,used,canAct,location:options.location??"random",range:options.range??"normal",modifier:options.modifier??0,
    fullTurn,defenses,ambush:{active:Boolean(ambush),targets:ambushTargets,count:ambushTargets.length,
      canPrepare:Boolean(canAct&&ambusher&&!encounter.started&&!tacticsFlags(ambusher).tacticRequest),pending:Boolean(tacticsFlags(ambusher).tacticRequest)},
    repeat:!fullTurn.activeDodge&&Boolean(options.repeat),defenseModifier:options.defenseModifier??0,
    incoming:INCOMING_ATTACKS.map(entry=>({...entry,selected:entry.id===(options.incoming??"melee")})),
    locations:ATTACK_LOCATIONS.map(entry=>({...entry,selected:entry.id===(options.location??"random")})),
    ranges:RANGED_BANDS.map(entry=>({...entry,selected:entry.id===(options.range??"normal")})),
    weapons:Array.from(actor.items ?? []).filter(item=>item.type==="weapon").map(item=>{
      const modes=attackModes(actor,item).map(mode=>{
        const quote=weaponAttack(actor,item,{...options,mode:mode.id,extraPenalty:extra?-3:0});
        const reason=quote.blocked||(!canAct?"Нельзя действовать":extra&&(used||actor.system.stamina.value<3)?"Дополнительное действие недоступно":"");
        return {...mode,base:quote.total===null?"—":signed(quote.total),damage:quote.damage,disabled:Boolean(reason),hint:reason||quote.parts.map(part=>`${part.label}: ${signed(part.value??0)}`).join("; ")};
      });
      const loaded=item.system.skill!=="crossbow"||item.system.loaded!==false;
      return {id:item.id,name:item.name,img:item.img,properties:item.system.properties??"",natural:Boolean(item.system.natural),grip:gripOf(item),
        equipped:equippedItems(actor.items).some(entry=>entry.id===item.id),modes,loaded,needsReload:!loaded,
        skill:game.i18n.localize(`WITCHER.Skills.Entries.${item.system.skill}.Label`)};
    }) };
}
const guard=fn=>async function(...args){try{return await fn.apply(this,args);}catch(error){ui.notifications.warn(error.message);}};
export const combatActions={
  openAmbush:guard(async function(_event,target){
    if(!this.isEditable||target.disabled)return;target.disabled=true;
    try{const {requestAmbush}=await import("../combat/group-ambush.mjs");await requestAmbush(this.actor);}finally{await this.render();}
  }),
  fullTurnAction:guard(async function(_event,target){
    if(!this.isEditable||target.disabled)return;
    target.disabled=true;
    try{await performFullTurnAction(this.actor,target.dataset.fullTurn);if(fullTurnContext(this.actor).activeDodge)this.combatOptions={...this.combatOptions,repeat:false};}
    finally{await this.render();}
  }),
  fullTurnRecovery:guard(async function(_event,target){
    if(!this.isEditable||target.disabled)return;target.disabled=true;
    try{await this.submit();await recoverStamina(this.actor);}finally{await this.render();}
  }),
  defend:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await rollDefense(this.actor,{...this.combatOptions,mode:target.dataset.mode,itemId:target.dataset.itemId});}finally{await this.render();}}),
  toggleExtraAction:guard(async function(){if(!this.isEditable)return;await inventoryWrite(this.actor,()=>this.actor.update({"system.combatAction.extra":!this.actor.system.combatAction.extra}));}),
  attackWeapon:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await rollWeaponAttack(this.actor,target.dataset.itemId,{...this.combatOptions,mode:target.dataset.mode});}finally{await this.render();}}),
  reloadWeapon:guard(async function(_event,target){
    if(!this.isEditable)return;
    await inventoryWrite(this.actor,async()=>{
      const item=this.actor.items.get(target.dataset.itemId);if(item?.system.skill!=="crossbow"||item.system.loaded)return;
      const quote=actionQuote(this.actor);
      const message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor:this.actor}),
        content:`<p>Арбалет перезаряжен — действие${quote.extra?"; дополнительно, 3 ВЫН":""}. Болты учитываются в инвентаре вручную.</p>`,flags:{[SYSTEM_ID]:{skipLuck:true}}},game.settings.get("core","messageMode")));
      if(message){await this.actor.update({...actionUpdate(this.actor,quote),items:[{_id:item.id,"system.loaded":true}]});await consumeAiming(this.actor);}
    });
  }),
  spendExtraAction:guard(async function(){
    if(!this.isEditable)return;
    await inventoryWrite(this.actor,async()=>{
      const quote=actionQuote(this.actor);if(!quote.extra)return;
      await this.actor.update(actionUpdate(this.actor,quote));
      await consumeAiming(this.actor);
      ui.notifications.info("Дополнительное действие без проверки: потрачено 3 ВЫН.");
    });
  })
};
export function bindCombat(sheet) {
  for(const control of sheet.element.querySelectorAll("[data-combat-option]"))control.addEventListener("change",()=>{
    const key=control.dataset.combatOption;
    sheet.combatOptions={...sheet.combatOptions,[key]:control.type==="checkbox"?control.checked:["modifier","defenseModifier"].includes(key)?Math.min(100,Math.max(-100,Number(control.value)||0)):control.value};
    sheet.render();
  });
}
