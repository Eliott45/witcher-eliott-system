import { equippedItems } from "../data/physical-items.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { actionRoundKey, actionQuote, actionUpdate } from "../combat/action-economy.mjs";
import { attackModes, weaponAttack, gripOf, signed, ATTACK_LOCATIONS, RANGED_BANDS } from "../combat/weapon-rules.mjs";
import { rollWeaponAttack } from "../combat/weapon-rolls.mjs";
import { SYSTEM_ID } from "../config.mjs";

export function combatContext(actor,options={}) {
  const extra=Boolean(actor.system.combatAction?.extra),key=actionRoundKey(actor),used=Boolean(key&&actor.system.combatAction?.lastExtraRound===key);
  const canAct=conditionRules(actor).canAct;
  return { extra,used,canAct,location:options.location??"random",range:options.range??"normal",modifier:options.modifier??0,
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
  toggleExtraAction:guard(async function(){if(!this.isEditable)return;await inventoryWrite(this.actor,()=>this.actor.update({"system.combatAction.extra":!this.actor.system.combatAction.extra}));}),
  attackWeapon:guard(async function(_event,target){if(!this.isEditable||target.disabled)return;target.disabled=true;try{await rollWeaponAttack(this.actor,target.dataset.itemId,{...this.combatOptions,mode:target.dataset.mode});}finally{await this.render();}}),
  reloadWeapon:guard(async function(_event,target){
    if(!this.isEditable)return;
    await inventoryWrite(this.actor,async()=>{
      const item=this.actor.items.get(target.dataset.itemId);if(item?.system.skill!=="crossbow"||item.system.loaded)return;
      const quote=actionQuote(this.actor);
      const message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor:this.actor}),
        content:`<p>Арбалет перезаряжен — действие${quote.extra?"; дополнительно, 3 ВЫН":""}. Болты учитываются в инвентаре вручную.</p>`,flags:{[SYSTEM_ID]:{skipLuck:true}}},game.settings.get("core","messageMode")));
      if(message)await this.actor.update({...actionUpdate(this.actor,quote),items:[{_id:item.id,"system.loaded":true}]});
    });
  }),
  spendExtraAction:guard(async function(){
    if(!this.isEditable)return;
    await inventoryWrite(this.actor,async()=>{
      const quote=actionQuote(this.actor);if(!quote.extra)return;
      await this.actor.update(actionUpdate(this.actor,quote));
      ui.notifications.info("Дополнительное действие без проверки: потрачено 3 ВЫН.");
    });
  })
};
export function bindCombat(sheet) {
  for(const control of sheet.element.querySelectorAll("[data-combat-option]"))control.addEventListener("change",()=>{
    const key=control.dataset.combatOption;
    sheet.combatOptions={...sheet.combatOptions,[key]:key==="modifier"?Math.min(100,Math.max(-100,Number(control.value)||0)):control.value};
    sheet.render();
  });
}
