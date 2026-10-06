import { creatureResistances, conditionResistant, DAMAGE_TYPE_NAMES } from "../combat/damage-rules.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { consumptionActions } from "./consumption-actions.mjs";
import { applyEffectItem } from "../data/effect-items.mjs";
import { ATTRIBUTE_KEYS } from "../data/statistics.mjs";
import { SKILLS, skillValue } from "../data/skills.mjs";
import { MONSTER_CATEGORIES } from "../data/monster-categories.mjs";
import { bestiarySources } from "../data/bestiary.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { inventoryContext,bindInventory,equipItem,toggleVisor,changeGrip,createInventoryItem,browseEquipment,addCatalogItem,changeInventoryQuantity,toggleCarried,toggleInventoryGroup,inventoryWrite } from "./inventory-context.mjs";
import { itemPresentation,toggleItemDescription,postItem,searchItemTrait } from "./item-presentation.mjs";
import { chooseContainer,toggleContainer,dropPhysicalItem } from "./container-actions.mjs";
import { viewSheetItem,removeSheetItem,createAbility,browseAbilities } from "./sheet-items.mjs";
import { combatContext,combatActions,bindCombat } from "./combat-context.mjs";
import { effectActions,effectsContext } from "./effects-context.mjs";
import { workshopActorActions, workshopActorContext } from "./workshop-actor-context.mjs";
import { rollActionCheck } from "../combat/action-economy.mjs";
import { sheetPreferences } from "./sheet-preferences.mjs";
import { rollSkill } from "../combat/skill-roll.mjs";
import { rollAttribute } from "../combat/attribute-roll.mjs";
import { rollStun } from "../combat/stun-roll.mjs";
import { rollDeath } from "../combat/death-state.mjs";
import { recoverStamina } from "../combat/exhaustion.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { requestEffectSave } from "../combat/condition-saves.mjs";
import { generateCreatureLoot } from "../combat/creature-loot.mjs";
import { skillCalculationTooltip } from "./skills-context.mjs";

const guard=fn=>async function(...args){try{return await fn.apply(this,args);}catch(error){ui.notifications.error(error.message);console.error(`${SYSTEM_ID} | Creature sheet`,error);}};
export class WitcherNPCSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  editing=false;
  static DEFAULT_OPTIONS={classes:["witcher-eliott","npc-sheet"],position:{width:820,height:820},window:{resizable:true},form:{submitOnChange:true,closeOnSubmit:false},actions:{
    ...combatActions,...effectActions,...workshopActorActions,...consumptionActions,
    equipItem,toggleVisor,changeGrip,createInventoryItem,browseEquipment,addCatalogItem,changeInventoryQuantity,toggleCarried,toggleInventoryGroup,
    toggleItemDescription,postItem,searchItemTrait,chooseContainer,toggleContainer,viewSheetItem,removeSheetItem,createAbility,browseAbilities,
    editCreature:guard(async function(){if(this.isEditable){this.editing=!this.editing;await this.render();}}),
    creaturePortrait:guard(async function(){if(this.isEditable)new foundry.applications.apps.FilePicker.implementation({type:"image",current:this.actor.img,document:this.actor,callback:path=>this.actor.update({img:path})}).browse();}),
    creatureInitiative:guard(async function(){if(this.isEditable)await this.actor.rollInitiative({createCombatants:true,rerollInitiative:true});}),
    creatureSkill:guard(async function(_e,target){if(this.isEditable)await rollSkill(this.actor,target.dataset.skill);}),
    creatureDefense:guard(async function(_e,target){if(!this.isEditable||!conditionRules(this.actor).canDefend)return;const skill=skillValue(this.actor.system,target.dataset.skill);if(skill?.total!=null)await rollActionCheck(this.actor,{formula:`1d10wc + ${skill.total}`,flavor:`Сопротивление: ${game.i18n.localize(skill.label)}.`},{ignoreExtra:true});}),
    creatureAttribute:guard(async function(_e,target){if(this.isEditable)await rollAttribute(this.actor,target.dataset.attribute);}),
    creatureStun:guard(async function(){if(!this.isEditable)return;const effect=this.actor.effects.find(e=>!e.disabled&&(e.statuses.has("stunned")||e.statuses.has("exhausted-stun")));if(effect)await requestEffectSave(this.actor,effect);else await rollStun(this.actor);}),
    creatureDeath:guard(async function(){if(this.isEditable)await rollDeath(this.actor);}),
    creatureRecover:guard(async function(){if(this.isEditable)await recoverStamina(this.actor);}),
    creatureLoot:guard(async function(){await generateCreatureLoot(this.actor);}),
    restoreCreatureItems:guard(async function(){
      if(!this.isEditable)return;
      await inventoryWrite(this.actor,async()=>{
        const preset=bestiarySources().find(entry=>entry.system.creature.source===this.actor.system.creature.source);
        if(preset&&!this.actor.items.size)await this.actor.createEmbeddedDocuments("Item",preset.items,{keepId:true});
      });
    }),
    creaturePreset:guard(async function(_e,target){
      if(!this.isEditable||this.actor.items.size||ATTRIBUTE_KEYS.some(key=>this.actor.system.attributes[key]!==null))return;
      const preset=bestiarySources().find(entry=>entry._id===target.dataset.preset);if(!preset)return;
      const {_id,ownership,...source}=preset;await this.actor.update(source);
    }),
    removeCreatureEffect:guard(async function(_e,target){if(this.isEditable&&game.user.isGM)await this.actor.deleteEmbeddedDocuments("ActiveEffect",[target.dataset.effectId]);}),
    removeEffect:guard(async function(_e,target){if(this.isEditable&&!target.disabled)await this.actor.effects.get(target.dataset.effectId)?.delete();}),
    addCreatureRow:guard(async function(_e,target){if(!this.isEditable)return;const key=target.dataset.list;if(!["loot","lore"].includes(key))return;await this.actor.update({[`system.creature.${key}`]:[...this.actor.system.creature[key],key==="loot"?{name:"Новая добыча",formula:"1"}:{name:"Знания",skill:"education",dc:10,text:""}]});}),
    removeCreatureRow:guard(async function(_e,target){if(!this.isEditable)return;const key=target.dataset.list;if(!["loot","lore"].includes(key))return;await this.actor.update({[`system.creature.${key}`]:this.actor.system.creature[key].filter((_r,i)=>i!==Number(target.dataset.index))});})
  }};
  static PARTS={content:{template:`systems/${SYSTEM_ID}/templates/npc-sheet.hbs`,scrollable:[".witcher-npc-body"]}};
  static TABS={creature:{initial:"combat",tabs:[{id:"combat",label:"Бой",icon:"fa-solid fa-swords"},{id:"inventory",label:"Инвентарь",icon:"fa-solid fa-sack"},{id:"lore",label:"Сведения",icon:"fa-solid fa-book-open"},{id:"effects",label:"Эффекты",icon:"fa-solid fa-person-rays"}]}};
  async _prepareContext(options) {
    const context=await super._prepareContext(options),actor=this.actor,system=actor.system,stats=system.statistics,editing=this.isEditable&&this.editing;
    const inventory=inventoryContext(actor,sheetPreferences(actor.uuid));
    await Promise.all(inventory.items.map(async row=>{row.containerOpen=!this.collapsedContainers?.has(row.id);row.expanded=this.expandedInventoryItems?.has(row.id)??false;row.presentation=row.expanded?await itemPresentation(actor.items.get(row.id),{secrets:actor.isOwner}):null;}));
    const i18n={localize:key=>game.i18n.localize(key),format:(key,data)=>game.i18n.format(key,data)};
    const abilities=await Promise.all(actor.items.filter(item=>item.type==="ability").map(async item=>({id:item.id,name:item.name,img:item.img,description:await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description,{secrets:actor.isOwner,relativeTo:item})})));
    return {...context,actor,system,stats,editing,inventory,abilities,workshop:await workshopActorContext(actor),isGM:game.user.isGM,conditions:conditionRules(actor),combat:combatContext(actor,this.combatOptions),effects:await effectsContext(this),
      empty:!actor.items.size&&ATTRIBUTE_KEYS.every(key=>system.attributes[key]===null),
      canRestoreItems:!actor.items.size&&bestiarySources().some(entry=>entry.system.creature.source===system.creature.source),
      categories:MONSTER_CATEGORIES.map(entry=>({...entry,selected:entry.id===system.creature.category})),category:MONSTER_CATEGORIES.find(c=>c.id===system.creature.category)?.name,
      creatureClass:MONSTER_CATEGORIES.find(entry=>entry.id===system.creature.category),
      attributes:ATTRIBUTE_KEYS.filter(key=>key!=="luck").map(key=>({key,name:i18n.localize(`WITCHER.Attributes.${key}.Short`),label:i18n.localize(`WITCHER.Attributes.${key}.Label`),base:system.attributes[key],value:stats.effective[key]??"—"})),
      skills:SKILLS.filter(skill=>skill.key!=="language"&&(editing||system.skills[skill.key]>0)).map(skill=>{const value=skillValue(system,skill.key);return {...value,name:i18n.localize(skill.label),calculation:skillCalculationTooltip(system,value,i18n)};}),
      facts:[{key:"size",label:"Рост"},{key:"weight",label:"Вес тела"},{key:"habitat",label:"Среда обитания"},{key:"intellect",label:"Интеллект"},{key:"group",label:"Численность"}].map(entry=>({...entry,value:system.creature[entry.key]})),
      resistanceList:[...creatureResistances(actor).map(type=>DAMAGE_TYPE_NAMES[type]),...(conditionResistant(actor,"poison")?["яд"]:[]),...(conditionResistant(actor,"bleeding")?["кровотечение"]:[])],
      defenses:["resistMagic","endurance"].map(key=>({key,name:i18n.localize(`WITCHER.Skills.Entries.${key}.Label`),total:skillValue(system,key).total??"—"}))};
  }
  async _onRender(context,options) {
    await super._onRender(context,options);bindInventory(this);bindCombat(this);
    // The model caps HP/STA anyway; clamp the field too, otherwise an unchanged value keeps showing the typed number.
    for(const field of this.element.querySelectorAll("[data-clamp-max]"))field.addEventListener("change",()=>{
      const max=Number(field.dataset.clampMax);if(Number.isFinite(max)&&Number(field.value)>max)field.value=max;
    });
    for(const field of this.element.querySelectorAll("[data-weapon-rate]"))field.addEventListener("change",event=>{
      event.stopPropagation();
      const item=this.actor.items.get(field.dataset.weaponRate),value=Math.min(10,Math.max(1,Math.round(Number(field.value)||1)));
      if(this.isEditable&&item)item.update({"system.attackRate":value}).catch(error=>ui.notifications.error(error.message));
    });
    for(const field of this.element.querySelectorAll("[data-creature-list]"))field.addEventListener("change",()=>{
      if(!this.isEditable||!this.editing)return;
      const {creatureList:list,index,key}=field.dataset;
      if(!["loot","lore"].includes(list))return;
      inventoryWrite(this.actor,()=>{
        const rows=this.actor.system.creature[list].map(row=>({...row}));
        rows[Number(index)][key]=field.type==="number"?Number(field.value):field.type==="checkbox"?field.checked:field.value;
        return this.actor.update({[`system.creature.${list}`]:rows});
      }).catch(error=>ui.notifications.error(error.message));
    });
  }
  _toggleDisabled(disabled){super._toggleDisabled(disabled);for(const control of this.element.querySelectorAll('[data-action="tab"],[data-action="viewSheetItem"],[data-action="toggleItemDescription"],[data-inventory-search],[data-action="toggleInventoryGroup"],[data-action="toggleContainer"]'))control.disabled=false;}
  async _onDropItem(event,item){if(!this.isEditable)return null;if(item.type==="effect")return applyEffectItem(this.actor,item);if(isPhysical(item))return dropPhysicalItem(this,event,item);return super._onDropItem(event,item);}
}
