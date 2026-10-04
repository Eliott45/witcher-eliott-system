import { SYSTEM_ID,COMBAT_ACTOR_TYPES } from "../config.mjs";
import { POWER_ELEMENTS,powerVisit } from "../magic/power-place-rules.mjs";
import { drawPower,resetPowerVisit } from "../magic/power-places.mjs";
const guarded=fn=>async function(...args){try{return await fn.apply(this,args);}catch(error){ui.notifications.error(error.message);console.error(`${SYSTEM_ID} | Place of power`,error);}};

export class WitcherPowerPlaceSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  customerUuid="";
  static DEFAULT_OPTIONS={classes:["witcher-eliott","power-place-sheet"],position:{width:660,height:660},window:{resizable:true},form:{submitOnChange:true,closeOnSubmit:false},actions:{
    drawPower:guarded(async function(_e,target){
      const actor=await foundry.utils.fromUuid(this.customerUuid);if(!actor)throw new Error("Выберите персонажа.");
      target.disabled=true;
      try{await drawPower(actor,this.actor,{prepared:this.element.querySelector('[data-power-prepared]').checked,reward:this.element.querySelector('[data-power-reward]').value});await this.render();}finally{target.disabled=false;}
    }),
    resetPowerVisit:guarded(async function(){const actor=await foundry.utils.fromUuid(this.customerUuid);if(actor)await resetPowerVisit(actor,this.actor);await this.render();})
  }};
  static PARTS={content:{template:`systems/${SYSTEM_ID}/templates/power-place.hbs`,scrollable:[".witcher-power-content"]}};
  get isEditable(){return game.user.isGM&&super.isEditable;}
  _canDragDrop(){return false;}
  async _onDrop(){return false;}
  async _prepareContext(options){
    const context=await super._prepareContext(options);
    const actors=Array.from(game.actors).filter(actor=>COMBAT_ACTOR_TYPES.includes(actor.type)&&actor.isOwner);
    if(!actors.some(actor=>actor.uuid===this.customerUuid))this.customerUuid=actors.find(actor=>actor.id===game.user.character?.id)?.uuid??actors[0]?.uuid??"";
    const actor=actors.find(actor=>actor.uuid===this.customerUuid),visit=actor?powerVisit(actor,this.actor):null;
    return {...context,actor:this.actor,system:this.actor.system,isGM:this.isEditable,element:POWER_ELEMENTS[this.actor.system.element],
      elements:Object.entries(POWER_ELEMENTS).map(([id,row])=>({id,...row,selected:id===this.actor.system.element})),
      customers:actors.map(a=>({uuid:a.uuid,name:a.name,selected:a.uuid===this.customerUuid})),visit,canDraw:Boolean(actor&&this.actor.system.available),magicPoints:actor?.system.magic.improvementPoints??0};
  }
  async _onRender(context,options){await super._onRender(context,options);this.element.querySelector('[data-power-customer]').addEventListener('change',event=>{this.customerUuid=event.target.value;this.render();});}
  _toggleDisabled(disabled){super._toggleDisabled(disabled);for(const control of this.element.querySelectorAll('[data-power-customer],[data-power-prepared],[data-power-reward]'))control.disabled=false;this.element.querySelector('[data-action=drawPower]').disabled=!this.customerUuid||!this.actor.system.available;}
}
