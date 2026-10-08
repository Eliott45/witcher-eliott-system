import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { EXPERIMENTAL_DEVICES } from "../scripts/data/experimental-devices.mjs";
import { experimentalEffect } from "../scripts/combat/experimental-effects.mjs";
import { installTrap } from "../scripts/combat/experimental-traps.mjs";
import { createDragonCloud } from "../scripts/combat/dragon-clouds.mjs";
import { combatContext } from "../scripts/sheets/combat-context.mjs";
import { alchemyContext } from "../scripts/sheets/crafting-context.mjs";

/** Native document schemas and strict HBS. Scene interaction and dice mechanics have separate unit tests. */
export async function checkNativeExperimental(combatTemplate,alchemyTemplate,documents) {
  const saved={canvas:globalThis.canvas,user:game.user,users:game.users,combat:game.combat,settings:game.settings,documents:foundry.documents};
  try {
    const gm={id:"deviceGM00000001",isGM:true,can:()=>true};game.user=gm;game.users={activeGM:gm};
    game.combat=null;
    // Client clock adapter only; every generated effect is validated by the installed BaseActiveEffect below.
    foundry.documents={...foundry.documents,ActiveEffect:{getEffectStart:()=>({time:game.time?.worldTime??0})}};
    const definition=EXPERIMENTAL_DEVICES.find(item=>item.id==="trap.marker");
    const actor=new foundry.documents.BaseActor({_id:"deviceActor00001",name:"Native devices",type:"character",
      system:{attributes:{intelligence:8,reflex:8,dexterity:8,body:8,speed:8,empathy:8,craft:8,will:8,luck:8},health:{value:40,max:40},stamina:{value:40,max:40}},
      items:[{_id:definition.documentId,name:definition.name,type:definition.type,img:definition.img,system:{...definition.system,ruleId:definition.id,quantity:2,carried:true}}]});
    Object.defineProperty(actor,"isOwner",{value:true});
    actor.update=async changes=>{const {items,...rest}=changes;for(const row of items??[])actor.items.get(row._id).updateSource(row);actor.updateSource(rest);return actor;};
    const scene={uuid:"Scene.nativeDevices",grid:{size:100,distance:2},regions:[],tokens:[],async createEmbeddedDocuments(type,sources){
      assert.equal(type,"Region");return sources.map(source=>{
        const region=new foundry.documents.BaseRegion(source,{strict:true});assert.equal(region.validate({strict:true}),true);
        this.regions.push(region);return region;
      });
    }};
    const token={uuid:"Scene.nativeDevices.Token.device0000000001",actor,parent:scene,x:0,y:0,width:1,height:1,getSize:()=>({width:100,height:100})};
    Object.defineProperty(actor,"isToken",{value:true});Object.defineProperty(actor,"token",{value:token});
    globalThis.canvas={ready:true,scene,tokens:{controlled:[]}};
    const trap=await installTrap(actor,actor.items.get(definition.documentId),{point:{x:300,y:100},triggerRadius:1,noticeDC:17,disarmDC:18});
    assert.equal(trap.visibility,CONST.REGION_VISIBILITY.LAYER);assert.equal(trap.shapes[0].radiusX,50);
    const cloud=await createDragonCloud(scene,{x:500,y:500},{uuid:"ChatMessage.nativeGas",speakerActor:actor});
    assert.equal(cloud.shapes[0].radiusX,400);assert.equal(cloud.visibility,CONST.REGION_VISIBILITY.ALWAYS);
    const sources=["freeze","fury","marker"].map((kind,index)=>({...experimentalEffect(actor,kind),_id:`nativeDeviceFx0${index}`}));
    sources.push({_id:"nativeTracking01",name:"Выслеживающий боеприпас",type:"base",statuses:["tracking-ammunition"],flags:{[SYS]:{trackingAmmunition:{key:"native"}}}});
    for(const source of sources){const effect=new foundry.documents.BaseActiveEffect(source,{parent:actor,strict:true});assert.equal(effect.validate({strict:true}),true);}
    actor.updateSource({effects:sources});actor.system.prepareDerivedData();
    let context=combatContext(actor),html=combatTemplate({combat:context,editable:true});
    assert.equal(context.devices.placed.length,1);assert.equal(context.devices.clouds.length,1);
    for(const action of ["installTrap","deviceTrap","deviceCloud","experimentalMarker","trackingAmmunition"])assert.ok(html.includes(`data-action="${action}"`),action);
    for(const kind of ["notice","disarm","trigger"])assert.ok(html.includes(`data-kind="${kind}"`));
    assert.ok(context.experimentalEffects.frozen);assert.ok(context.experimentalEffects.fury);assert.ok(context.trackingAmmunition.tracked);
    assert.equal(context.canAct,true);assert.equal(actor.system.statistics.effective.speed,0);
    game.combat={id:"deviceCombat",started:true,round:1,combatants:[],turns:[]};
    actor.updateSource({"system.health.value":-1,[`flags.${SYS}.adrenaline`]:{combatId:"deviceCombat",dice:2,temporaryHP:3,emergencyHP:4,damageDice:1}});
    game.settings={...saved.settings,get:(scope,key)=>key==="adrenalineRules"?true:saved.settings.get(scope,key)};
    context=combatContext(actor);html=combatTemplate({combat:context,editable:true});
    assert.ok(html.includes('data-action="useAdrenaline"'));assert.ok(!html.match(/<button[^>]*data-action="useAdrenaline"[^>]*>/)[0].includes("disabled"));
    game.user={...gm,isGM:false};context=combatContext(actor);html=combatTemplate({combat:context,editable:false});
    assert.equal(context.devices.placed.length,0);assert.equal(context.devices.clouds.length,0);
    assert.ok(!html.includes('data-action="deviceTrap"'));assert.ok(!html.includes('data-action="deviceCloud"'));
    for(const tag of html.match(/<button[^>]*data-action="(?:installTrap|experimentalMarker|trackingAmmunition|useAdrenaline)"[^>]*>/g)??[])assert.ok(tag.includes("disabled"));
    console.log("Experimental devices: native trap/cloud Regions, timed conditions, tracking and emergency adrenaline render in strict combat templates");
    game.user=gm;game.combat=null;
    const formulas=[...documents.values()].filter(item=>item.type==="recipe"&&item.system.ruleId.startsWith("formula.bomb."));
    const materials=new Map();
    for(const formula of formulas)for(const component of formula.system.recipe.components) {
      const source=materials.get(component.uuid)??documents.get(component.uuid).toObject();
      source.system.quantity=(materials.has(component.uuid)?source.system.quantity:0)+component.quantity;source.system.carried=true;
      materials.set(component.uuid,source);
    }
    const tools=[...documents.values()].find(item=>item.system?.ruleId==="gear.alchemy-tools").toObject();tools.system.carried=true;
    const alchemist=new foundry.documents.BaseActor({_id:"bombAlchemy00001",name:"Bomb formulas",type:"character",
      system:{attributes:{craft:8,intelligence:8,body:8,will:8},health:{value:40,max:40},stamina:{value:40,max:40},skills:{alchemy:6}},
      items:[...formulas.map(item=>item.toObject()),...materials.values(),tools]});
    Object.defineProperty(alchemist,"isOwner",{value:true});alchemist.system.prepareDerivedData();
    const alchemy=await alchemyContext(alchemist),alchemyHTML=alchemyTemplate({alchemy,editable:true,rootId:"bombAlchemy"});
    assert.equal(alchemy.count,8);assert.ok(alchemyHTML.includes('<option value="">Все составы</option>'));assert.ok(alchemyHTML.includes('<option value="bomb">Бомбы</option>'));
    for(const recipe of alchemy.groups.flatMap(group=>group.recipes)) {
      assert.equal(recipe.kind,"bomb");assert.equal(recipe.unavailable,false);assert.equal(recipe.error,false);
      assert.equal(recipe.signs.length,0);assert.ok(recipe.extras.length>=5);
      assert.ok(alchemyHTML.includes(`data-action="craftInventory" data-item-id="${recipe.id}"`));
    }
    assert.equal((alchemyHTML.match(/data-kind="bomb"/g)??[]).length,8);
    console.log("Experimental alchemy: all eight bomb formulas use exact ingredient chips and remain craftable in the All/Bombs filters");
  } finally {globalThis.canvas=saved.canvas;game.user=saved.user;game.users=saved.users;game.combat=saved.combat;game.settings=saved.settings;foundry.documents=saved.documents;}
}
