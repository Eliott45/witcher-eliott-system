import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { getProfession } from "../scripts/data/professions.mjs";
import { blankCreation, professionSlots, creationUpdate } from "../scripts/data/character-creation.mjs";
import { CharacterCreationWindow } from "../scripts/sheets/character-creation-window.mjs";
import { creationContext } from "../scripts/sheets/creation-context.mjs";
import { professionContext } from "../scripts/sheets/profession-context.mjs";
import { WitcherActiveEffect } from "../scripts/documents/witcher-active-effect.mjs";
import { usePeasantProduct, peasantProduct, peasantEffectSource } from "../scripts/workshop/peasant-products.mjs";
import { craftPeasant } from "../scripts/workshop/peasant-crafting.mjs";
import { PEASANT_STEWS, peasantEffect } from "../scripts/data/peasant-rules.mjs";
import { prepareMessageLuck, settleMessageLuck, releaseMessageLuck } from "../scripts/chat/luck-rolls.mjs";

export async function checkNativePeasant(handlebars,documents) {
  const saved={packs:game.packs,items:game.items,time:game.time,combat:game.combat,documents:foundry.documents,dialog:foundry.applications.api.DialogV2,Roll:foundry.dice.Roll};
  const source=id=>[...documents.values()].find(item=>item.system?.ruleId===id)?.toObject();
  try {
    game.combat=null;game.time={worldTime:100000};
    game.packs=new Map(["equipment","abilities","spells"].map(name=>[`${SYS}.${name}`,{
      getIndex:async()=>[...documents].filter(([uuid])=>uuid.startsWith(`Compendium.${SYS}.${name}.`)).map(([,item])=>item.toObject()),
      getDocument:async id=>documents.get(`Compendium.${SYS}.${name}.Item.${id}`)
    }]));
    game.items={fromCompendium:item=>structuredClone(item.toObject())};
    const draft=blankCreation();Object.assign(draft,{name:"QA — Крестьянин",race:"human",profession:"peasant",origin:"redania",crowns:140});
    draft.attributes={mode:"points",level:"skilled",values:{intelligence:8,reflex:8,dexterity:8,body:8,speed:8,empathy:8,craft:8,will:7,luck:7}};
    draft.skills.ranks=Object.fromEntries(professionSlots("peasant").map(slot=>[slot.id,4]));draft.skills.ranks.crafting=2;
    draft.skills.pickup={awareness:6,stealth:6,swordsmanship:4};draft.gear.picks=[0,1,4,8,9];
    const items=await CharacterCreationWindow.prototype.buildItems.call({draft,links:[],catalogs:async()=>({magic:[]})});
    assert.equal(items.find(item=>item.system.ruleId==="profession.peasant.intolerance").system.level,4);
    assert.equal(items.filter(item=>item.system.ruleId==="gear.beer").reduce((sum,item)=>sum+item.system.quantity,0),2);
    for(const id of ["gear.pipe","gear.tobacco","gear.cooking-tools","gear.bag"])assert.ok(items.some(item=>item.system.ruleId===id),id);
    const actor=new foundry.documents.BaseActor({_id:"peasantNative001",name:draft.name,type:"character",items});
    actor.updateSource(creationUpdate(draft,id=>id));actor.system.prepareDerivedData();
    Object.defineProperty(actor,"isOwner",{value:true});
    assert.equal(actor.validate({strict:true}),true);assert.equal(actor.system.vigor,0);assert.equal(actor.system.skills.crafting,2);
    assert.equal(actor.system.details.profession,"peasant");
    const creationTemplate=handlebars.compile(await readFile(new URL("../templates/character-creation.hbs",import.meta.url),"utf8"),{strict:true});
    draft.step="profession";const context=creationContext(draft,{magic:[]});
    const creationHTML=creationTemplate({...context,rootId:"peasant-creation",editable:true});
    assert.ok(creationHTML.includes("Крестьянин"));
    await writeFile(new URL("../.dev/radolf/peasant-creation.html",import.meta.url),creationHTML);
    const professionTemplate=handlebars.compile(await readFile(new URL("../templates/profession.hbs",import.meta.url),"utf8"),{strict:true});
    const render=editable=>professionTemplate({profession:professionContext(actor),editable,editingProfession:false,rootId:"peasant-native"});
    const initial=render(true);assert.equal((initial.match(/data-action="usePeasantAbility"/g)??[]).length,10);
    assert.equal((initial.match(/data-peasant="[^"]+" disabled/g)??[]).length,9);
    assert.equal((render(false).match(/data-peasant="[^"]+" disabled/g)??[]).length,10);
    // Local document writers use native models and preCreate hooks, without connecting to a world.
    const refresh=()=>{actor.system.prepareDerivedData();for(const item of actor.items)if(!Object.hasOwn(item,"actor"))Object.defineProperty(item,"actor",{get:()=>actor});};
    actor.update=async changes=>{actor.updateSource(changes);refresh();return actor;};
    actor.createEmbeddedDocuments=async(type,data)=>{
      const collection=type==="Item"?actor.items:actor.effects,created=[];
      for(const row of data){
        const document=type==="Item"?new foundry.documents.BaseItem({...row,_id:foundry.utils.randomID()},{parent:actor,strict:true}):new WitcherActiveEffect({...row,_id:foundry.utils.randomID()},{parent:actor,strict:true});
        if(type==="ActiveEffect"&&await document._preCreate(document.toObject(),{},game.user)===false)continue;
        collection.set(document.id,document);created.push(document);
      }refresh();return created;
    };
    actor.updateEmbeddedDocuments=async(type,data)=>{const collection=type==="Item"?actor.items:actor.effects;const changed=data.map(row=>{const doc=collection.get(row._id);doc.updateSource(row);return doc;});refresh();return changed;};
    actor.deleteEmbeddedDocuments=async(type,ids)=>{for(const id of ids)(type==="Item"?actor.items:actor.effects).delete(id);refresh();return [];};
    foundry.documents={...foundry.documents,ActiveEffect:{getEffectStart:()=>({time:game.time.worldTime})},ChatMessage:{getSpeaker:()=>({actor:actor.id}),create:async data=>data}};
    const answers=[];foundry.applications.api.DialogV2={confirm:async()=>true,prompt:async()=>answers.shift()};
    foundry.dice.Roll=class extends saved.Roll {
      async evaluate(options){return super.evaluate({...options,allowInteractive:false});}
      async toMessage(data){return {...data,id:"peasantCheck0001",rolls:[this],async update(changes){Object.assign(this,changes);}};}
    };
    for(const definition of getProfession("peasant").abilities.slice(1))await actor.createEmbeddedDocuments("Item",[{...source(definition.id),system:{...source(definition.id).system,level:6}}]);
    refresh();
    await writeFile(new URL("../.dev/radolf/peasant-profession.html",import.meta.url),render(true));
    const recipe=PEASANT_STEWS.find(row=>row.id==="spring");
    await actor.createEmbeddedDocuments("Item",recipe.materials.map(row=>({...source(row.id),system:{...source(row.id).system,quantity:row.quantity*2,carried:true}})));
    answers.push({id:"spring"},{time:"on"});await craftPeasant(actor,"stew");
    let stew=actor.items.find(item=>item.flags[SYS]?.peasantProduct?.kind==="stew.spring");
    assert.equal(stew.system.quantity,6);assert.equal(stew.validate({strict:true}),true);
    const day=actor.flags[SYS].peasantCookedDay;
    answers.push({id:"spring"},{time:"on"});await assert.rejects(craftPeasant(actor,"stew"),/уже приготовлено/);
    assert.equal(actor.flags[SYS].peasantCookedDay,day);
    await usePeasantProduct(stew);assert.equal(stew.system.quantity,5);
    let effect=peasantEffect(actor,"stew.spring");assert.ok(effect);assert.equal(effect.duration.value,86400);assert.equal(effect.validate({strict:true}),true);
    assert.equal(actor.system.statistics.modifiers.find(row=>row.target==="skills.endurance"&&row.value===18)?.value,18);
    await usePeasantProduct(stew);assert.equal(stew.system.quantity,4);assert.equal(actor.effects.filter(e=>e.flags[SYS]?.peasant?.kind==="stew.spring").length,1);
    assert.equal(actor.effects.get(effect.id).validate({strict:true}),true,"refreshing an existing meal uses valid Foundry duration fields");
    const [expired]=await actor.createEmbeddedDocuments("Item",[peasantProduct("panacea","Старая панацея",5,{expires:game.time.worldTime})]);
    await assert.rejects(usePeasantProduct(expired),/испортил/);assert.equal(expired.system.quantity,1);
    const [talisman]=await actor.createEmbeddedDocuments("Item",[peasantProduct("talisman","Талисман",6,{quantity:2})]);
    await usePeasantProduct(talisman);assert.equal(talisman.system.quantity,1);
    await assert.rejects(usePeasantProduct(talisman),/уже действует/);assert.equal(talisman.system.quantity,1);
    const makeMessage=async()=>({speakerActor:actor,flags:{},rolls:[await new saved.Roll("1d10").evaluate({allowInteractive:false})],flavor:"",updateSource(changes){for(const [key,value]of Object.entries(changes)){
      if(key==="rolls")this.rolls=value.map(row=>saved.Roll.fromData(row));else foundry.utils.setProperty(this,key,value);
    }}});
    const luck=await makeMessage();await prepareMessageLuck(luck,"peasant-luck");assert.equal(luck.flags[SYS].luck.bonus,6);
    const repeat=await makeMessage();await prepareMessageLuck(repeat,"peasant-simultaneous");assert.equal(repeat.flags[SYS],undefined);
    await settleMessageLuck([luck],"peasant-luck");releaseMessageLuck("peasant-luck");
    assert.equal(peasantEffect(actor,"talisman"),undefined);assert.deepEqual(actor.system.luckSpent,[]);
    const after=await makeMessage();await prepareMessageLuck(after,"peasant-spent");assert.equal(after.flags[SYS],undefined);releaseMessageLuck("peasant-spent");
    console.log("Peasant: full native creation, all ten abilities, observer permissions, six-portion crafting, daily limit, repeated meals, expiry and nonrenewable talisman Luck OK");
  } finally {game.packs=saved.packs;game.items=saved.items;game.time=saved.time;game.combat=saved.combat;foundry.documents=saved.documents;foundry.applications.api.DialogV2=saved.dialog;foundry.dice.Roll=saved.Roll;releaseMessageLuck("peasant-luck");}
}
