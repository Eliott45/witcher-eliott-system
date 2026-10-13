import assert from "node:assert/strict";
import { RADOLF_UPGRADES, RADOLF_POTIONS, RADOLF_RECIPES } from "../scripts/data/radolf-additions.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { WitcherItemSheet } from "../scripts/sheets/witcher-item-sheet.mjs";
import { WitcherActiveEffect } from "../scripts/documents/witcher-active-effect.mjs";
import { potionEffectSource, toxicityState } from "../scripts/data/consumables.mjs";
import { combatContext } from "../scripts/sheets/combat-context.mjs";
import { alchemyContext } from "../scripts/sheets/crafting-context.mjs";
import { crossbowFullTurn } from "../scripts/combat/crossbow-modifications.mjs";

export async function checkNativeRadolfAdditions(itemTemplate,combatTemplate,alchemyTemplate,documents) {
  const saved={combat:game.combat,Roll:foundry.dice.Roll,documents:foundry.documents};
  try {
    game.combat=null;
    foundry.documents={...foundry.documents,ActiveEffect:{getEffectStart:()=>({time:game.time?.worldTime??0})},ChatMessage:{getSpeaker:({actor})=>({actor:actor.id})}};
    const ids=[...RADOLF_UPGRADES,...RADOLF_POTIONS,...RADOLF_RECIPES].map(entry=>entry.id);
    const source=id=>[...documents.values()].find(item=>item.system?.ruleId===id).toObject();
    const actor=new foundry.documents.BaseActor({_id:"radolfDlcActor01",name:"Radolf pages 2–3",type:"character",system:{details:{race:"human"},
      attributes:{intelligence:8,reflex:8,dexterity:8,body:8,speed:8,empathy:8,craft:8,will:8,luck:8},health:{value:5,max:40},stamina:{value:40,max:40}},
      items:[...ids,"weapon.crossbow","ammunition.standard"].map(source)});
    Object.defineProperty(actor,"isOwner",{value:true});
    for(const item of actor.items)Object.defineProperty(item,"actor",{get:()=>actor});
    const sheet=new WitcherItemSheet();sheet.isEditable=true;
    for(const item of actor.items.filter(item=>ids.includes(item.system.ruleId))) {
      assert.equal(item.validate({strict:true}),true);sheet.item=item;sheet.tabGroups.item="description";
      let context=await sheet._prepareContext({}),html=itemTemplate(context);
      assert.ok(html.includes("Фургончик Родольфа"),item.name);
      if(item.type==="recipe")assert.ok(context.workshop.components.length>0,item.name);
      if(item.system.upgrade?.category==="crossbow")assert.doesNotMatch(html,/устанавливается навсегда/);
      if(item.system.alchemy?.category==="ordinaryPotion")assert.ok(html.includes('data-action="useConsumable"'));
      sheet.isEditable=false;itemTemplate(await sheet._prepareContext({}));sheet.isEditable=true;
    }
    // Use the native Roll evaluator and native ActiveEffect schema, with a local-only chat sink.
    foundry.dice.Roll=class extends saved.Roll {
      async evaluate(options){return super.evaluate({...options,allowInteractive:false});}
      async toMessage(data){return {...data,id:"localRadolfRoll1"};}
    };
    const effects=[];
    for(const definition of RADOLF_POTIONS) {
      const item=actor.items.find(item=>item.system.ruleId===definition.id),data=potionEffectSource(item);
      const effect=new WitcherActiveEffect(data,{parent:actor,strict:true});
      await effect._preCreate(effect.toObject(),{},game.user);
      assert.equal(effect.validate({strict:true}),true);
      if(definition.id.endsWith("stamina")) {assert.equal(effect.duration.units,"seconds");assert.equal(effect.duration.value,1800);}
      else {const dice=definition.id.endsWith("vitality")?2:4;assert.equal(effect.duration.units,"rounds");assert.ok(effect.duration.value>=dice&&effect.duration.value<=dice*6);assert.equal(effect.duration.expiry,"turnEnd");}
      effects.push({...effect.toObject(),_id:foundry.utils.randomID()});
    }
    actor.updateSource({effects});actor.system.prepareDerivedData();
    assert.equal(actor.system.statistics.effective.reflex,8);assert.equal(toxicityState(actor).value,150);assert.equal(toxicityState(actor).visible,true);
    const bow=actor.items.find(item=>item.system.ruleId==="weapon.crossbow");
    bow.updateSource({"system.equipped":true,"system.loaded":false,"system.installations":RADOLF_UPGRADES.filter(entry=>["radolf.crossbow.windlass","radolf.crossbow.skellige"].includes(entry.id)).map(entry=>({id:entry.documentId,name:entry.name,ruleId:entry.id,sourceUuid:`Compendium.${SYS}.equipment.Item.${entry.documentId}`,category:"crossbow",properties:entry.system.properties,bonuses:entry.system.upgrade.bonuses,weight:entry.system.weight}))});
    actor.system.prepareDerivedData();
    const combat=combatContext(actor),html=combatTemplate({combat,editable:true});
    assert.ok(html.includes("Удар арбалетом"));assert.ok(html.includes("Зарядить · передвижение"));
    sheet.item=bow;sheet.tabGroups.item="workshop";const bowHTML=itemTemplate(await sheet._prepareContext({}));
    assert.ok(bowHTML.includes("Модификации арбалета"));assert.ok(bowHTML.includes('data-action="removeCrossbowModification"'));
    const alchemy=await alchemyContext(actor),alchemyHTML=alchemyTemplate({alchemy,editable:true,rootId:"radolf-native"});
    for(const potion of RADOLF_POTIONS)assert.ok(alchemyHTML.includes(potion.name));assert.ok(alchemyHTML.includes('value="ordinaryPotion"'));
    game.combat={started:true,combatants:[],turns:[]};
    const turn=new WitcherActiveEffect(crossbowFullTurn(actor,"Установка")[0],{parent:actor,strict:true});await turn._preCreate(turn.toObject(),{},game.user);
    assert.equal(turn.duration.expiry,"turnStart");assert.equal(turn.flags[SYS].condition.immobilized,true);
    console.log("Radolf pages 2–3: 16 native documents, crossbow controls, alchemy formulas and rolled potion durations validate and render");
  } finally {game.combat=saved.combat;foundry.dice.Roll=saved.Roll;foundry.documents=saved.documents;}
}
