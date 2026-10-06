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
import { damageTypeLabel } from "../combat/damage-rules.mjs";
import { toggleQuickDraw } from "../combat/quick-draw.mjs";
import { grappleOptions, grappleState, rollGrappleAction } from "../combat/grapple.mjs";
import { statusEffect } from "../data/effect-counters.mjs";
import { unarmedContext, rollFeint, dualWeapons } from "../combat/brawling.mjs";
import { healingContext, healingPatient, stabilizePatientWound, treatPatientWound, startNaturalHealing, restDay, stabilizeDying } from "../combat/healing.mjs";

export function combatContext(actor,options={}) {
  const fastPending=actor.flags?.[SYSTEM_ID]?.fastStrike?.round===(actionRoundKey(actor)||"free");
  const quickDraw=Boolean(statusEffect(actor,"quick-draw"));
  const extra=Boolean(actor.system.combatAction?.extra),key=actionRoundKey(actor),used=Boolean(key&&actor.system.combatAction?.lastExtraRound===key);
  const canAct=conditionRules(actor).canAct;
  const fullTurn=fullTurnContext(actor);
  const encounter=globalThis.game?.combat,ambusher=encounter?.combatants.find(entry=>entry.actor?.uuid===actor.uuid);
  const ambush=ambushState(encounter,ambusher);
  const ambushTargets=(ambush?.targets??[]).map(uuid=>({uuid,name:encounter.combatants.find(entry=>entry.token?.uuid===uuid)?.name??"Цель"}));
  const defenses=[{mode:"dodge"},{mode:"reposition"},...equippedItems(actor.items).filter(item=>item.type==="weapon"&&["melee","shield"].includes(item.system.category)).flatMap(item=>[{mode:"block",itemId:item.id},{mode:"parry",itemId:item.id}]),{mode:"block",itemId:""},{mode:"parry",itemId:""}]
    .map(entry=>{const quote=defenseQuote(actor,{...options,...entry});return {...quote,base:quote.total===null?"—":signed(quote.total),disabled:Boolean(quote.blocked),hint:quote.blocked||`${quote.math} ${quote.note}`};});
  const unarmed=actor.type==="npc"?[]:unarmedContext(actor,options,{extra,fastPending:fastPending&&actor.flags[SYSTEM_ID].fastStrike.extra===extra});
  return { healing:healingContext(actor), unarmed, feint:{disabled:!canAct,hint:"Обман вместо первого удара быстрой атаки: если цель провалит встречную проверку Внимания, второй удар получает +3 (стр. 164). Выберите цель (T)."}, extra,used,canAct,location:options.location??"random",range:options.range??"normal",modifier:options.modifier??0,
    grapple:(()=>{const state=grappleState(actor);return {options:grappleOptions(actor),holding:state.holding?{name:state.holding.name,pinned:state.holding.pinned,choking:state.holding.choking}:null,heldBy:state.heldBy?{name:state.heldBy.name}:null};})(),
    fullTurn,defenses,quickDraw,canQuickDraw:canAct&&Boolean(globalThis.game?.combat?.started&&Array.from(globalThis.game.combat.combatants).some(entry=>entry.actor?.uuid===actor.uuid)),ambush:{active:Boolean(ambush),targets:ambushTargets,count:ambushTargets.length,
      canPrepare:Boolean(canAct&&ambusher&&!encounter.started&&!tacticsFlags(ambusher).tacticRequest),pending:Boolean(tacticsFlags(ambusher).tacticRequest)},
    repeat:!fullTurn.activeDodge&&Boolean(options.repeat),defenseModifier:options.defenseModifier??0,
    incoming:INCOMING_ATTACKS.map(entry=>({...entry,selected:entry.id===(options.incoming??"melee")})),
    locations:ATTACK_LOCATIONS.map(entry=>({...entry,selected:entry.id===(options.location??"random")})),
    ranges:RANGED_BANDS.map(entry=>({...entry,selected:entry.id===(options.range??"normal")})),
    weapons:Array.from(actor.items ?? []).filter(item=>item.type==="weapon").map(item=>{
      const modes=attackModes(actor,item).map(mode=>{
        const quote=weaponAttack(actor,item,{...options,mode:mode.id,extraPenalty:extra?-3:0});
        const reason=quote.blocked||(!canAct?"Нельзя действовать":extra&&(used||actor.system.stamina.value<3)?"Дополнительное действие недоступно":"");
        const second=mode.pair&&fastPending&&actor.flags[SYSTEM_ID].fastStrike.extra===extra;
        const label=mode.pair?(second?"Быстрая · удар 2/2":"Быстрая · удар 1/2"):mode.name;
        const pairHint=mode.pair?(second?"Второй удар той же быстрой атаки: можно по другой цели, нового действия не нужно. ":"Быстрая атака — два удара за одно действие. Каждый удар бросается отдельно. "):"";
        return {...mode,name:label,second,base:quote.total===null?"—":signed(quote.total),damage:quote.damage,disabled:Boolean(reason),hint:reason||pairHint+quote.parts.map(part=>`${part.label}: ${signed(part.value??0)}`).join("; ")};
      });
      const loaded=item.system.skill!=="crossbow"||item.system.loaded!==false;
      return {id:item.id,name:item.name,img:item.img,properties:item.system.properties??"",damageTypes:damageTypeLabel(item.system.damageType),rate:actor.type==="npc"?item.system.attackRate??1:null,natural:Boolean(item.system.natural),grip:gripOf(item),
        equipped:equippedItems(actor.items).some(entry=>entry.id===item.id),modes,loaded,needsReload:!loaded,
        melee:item.system.category==="melee"&&!item.system.natural,techniques:actor.type!=="npc"&&!item.system.natural&&modes.some(mode=>mode.secondary)&&equippedItems(actor.items).some(entry=>entry.id===item.id),
        skill:game.i18n.localize(`WITCHER.Skills.Entries.${item.system.skill}.Label`)};
    }) };
}
const guard=fn=>async function(...args){try{return await fn.apply(this,args);}catch(error){ui.notifications.warn(error.message);}};
const healingPatientOf=sheet=>healingPatient(sheet.actor);
export const combatActions={
  healStabilize:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await stabilizePatientWound(this.actor,healingPatientOf(this),target.dataset.effectId);}finally{await this.render();}}),
  healDying:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await stabilizeDying(this.actor,healingPatientOf(this));}finally{await this.render();}}),
  healTreat:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await treatPatientWound(this.actor,healingPatientOf(this),target.dataset.effectId);}finally{await this.render();}}),
  healStart:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await startNaturalHealing(this.actor,healingPatientOf(this));}finally{await this.render();}}),
  healRestDay:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;
    const active=Boolean(this.element.querySelector("[data-heal-active]")?.checked);
    try{await restDay(this.actor,{active});}finally{await this.render();}}),
  grappleAction:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await rollGrappleAction(this.actor,target.dataset.grapple);}finally{await this.render();}}),
  releaseGrapple:guard(async function(){if(!this.isEditable)return;const {holding}=grappleState(this.actor);if(holding)await holding.effect.delete();await this.render();}),
  quickDraw:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await toggleQuickDraw(this.actor);}finally{await this.render();}}),
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
  attackUnarmed:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await rollWeaponAttack(this.actor,null,{...this.combatOptions,unarmed:target.dataset.strike,mode:target.dataset.mode});}finally{await this.render();}}),
  feint:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await rollFeint(this.actor);}finally{await this.render();}}),
  attackDual:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;
    try{
      const pair=dualWeapons(this.actor,equippedItems(this.actor.items)),first=pair.find(item=>item.id===target.dataset.itemId),second=pair.find(item=>item!==first);
      if(!first||!second)throw new Error("Нужны два одноручных оружия в руках.");
      const opened=await rollWeaponAttack(this.actor,first.id,{...this.combatOptions,mode:"dual"});
      if(opened)await rollWeaponAttack(this.actor,second.id,{...this.combatOptions,mode:"dual",free:true});
    }finally{await this.render();}}),
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
