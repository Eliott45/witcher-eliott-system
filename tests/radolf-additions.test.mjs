import { disassemblyBlocker } from "../scripts/workshop/repair.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { RADOLF_UPGRADES, RADOLF_POTIONS, RADOLF_RECIPES } from "../scripts/data/radolf-additions.mjs";
import { CORE_EQUIPMENT } from "../scripts/data/core-equipment.mjs";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { effectiveItem, freeSlots, equipmentUuid } from "../scripts/data/workshop.mjs";
import { crossbowCapacity, crossbowSlots } from "../scripts/data/crossbow-modifications.mjs";
import { installOwnedUpgrade, installCatalogUpgrade } from "../scripts/workshop/upgrades.mjs";
import { reloadCrossbow, removeCrossbowModification, movementReloadAvailable, registerCrossbowMovement } from "../scripts/combat/crossbow-modifications.mjs";
import { weaponAttack, attackModes } from "../scripts/combat/weapon-rules.mjs";
import { rollWeaponAttack } from "../scripts/combat/weapon-rolls.mjs";
import { conditionRules } from "../scripts/combat/condition-rules.mjs";
class Collection extends Array { get(id){return this.find(item=>item.id===id);} has(id){return Boolean(this.get(id));} }
const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
function patch(o,changes){for(const [path,value] of Object.entries(changes)){const keys=path.split('.'),last=keys.pop();keys.reduce((v,k)=>v[k]??={},o)[last]=structuredClone(value);}}
function fixture(){
  delete globalThis.Hooks;delete globalThis.canvas;let serial=0;const messages=[];
  const actor={id:"hero",uuid:"Actor.hero",type:"character",isOwner:true,flags:{},items:new Collection(),effects:new Collection(),
    system:{attributes:{},details:{race:"human"},abilityState:{},skills:{crossbow:5,melee:4},statistics:{effective:{body:10,reflex:8,dexterity:7},modifiers:[],meleeDamageBonus:0},stamina:{value:30,max:30},combatAction:{extra:false}},
    async update(changes){const {items,...rest}=changes;patch(this,rest);if(items)await this.updateEmbeddedDocuments("Item",items);},
    async updateEmbeddedDocuments(type,changes){for(const row of changes)patch((type==="Item"?this.items:this.effects).get(row._id),row);},
    async createEmbeddedDocuments(type,sources){return sources.map(data=>{const entry={...structuredClone(data),id:String(++serial)};if(type==="ActiveEffect"){entry.statuses=new Set(entry.statuses);this.effects.push(entry);}else{entry.actor=this;entry.uuid=`Actor.hero.Item.${entry.id}`;this.items.push(entry);}return entry;});},
    async deleteEmbeddedDocuments(type,ids){const list=type==="Item"?this.items:this.effects;for(const id of ids)list.splice(list.findIndex(row=>row.id===id),1);}
  };
  const gm={isGM:true};globalThis.game={user:gm,users:{activeGM:gm},combat:null,time:{worldTime:0},i18n:{localize:key=>key},settings:{get:()=>"public"},items:{fromCompendium:source=>source.toObject()}};
  globalThis.ui={notifications:{warn:message=>{throw new Error(message);}}};
  globalThis.foundry={utils:{getProperty:get,deepClone:structuredClone,randomID:()=>String(++serial),fromUuid:async uuid=>actor.items.find(item=>item.uuid===uuid)},
    documents:{ActiveEffect:{getEffectStart:()=>({time:0})},ChatMessage:{getSpeaker:()=>({}),applyMode:data=>data,create:async data=>{messages.push(data);return data;}}},
    dice:{Roll:class {constructor(formula){this.formula=formula;}async evaluate(){this.total=20;return this;}}}};
  const add=entry=>{const item={type:entry.type,name:entry.name,id:String(++serial),flags:{},_stats:{},actor,
    system:{quantity:1,carried:true,equipped:false,installations:[],...structuredClone(entry.system),ruleId:entry.id}};
    item.uuid=`Actor.hero.Item.${item.id}`;item.toObject=()=>({name:item.name,type:item.type,flags:structuredClone(item.flags),system:structuredClone(item.system)});actor.items.push(item);return item;};
  const bow=add(CORE_EQUIPMENT.find(entry=>entry.id==="weapon.crossbow"));Object.assign(bow.system,{equipped:true,loaded:false,enhancementSlots:1});
  const mod=id=>add(RADOLF_UPGRADES.find(entry=>entry.id===`radolf.crossbow.${id}`));
  const combat=()=>{game.combat={id:"battle",started:true,round:1,combatants:[{actor,id:"hero",initiative:5}],turns:[],turn:0};game.combat.turns=game.combat.combatants;game.combat.combatant=game.combat.combatants[0];};
  return {actor,bow,mod,add,combat,messages};
}

test("DLC recipes preserve prices, supplements, exact component links and visually verified potion signs",()=>{
  assert.equal(RADOLF_UPGRADES.length,5);assert.equal(RADOLF_POTIONS.length,3);assert.equal(RADOLF_RECIPES.length,8);
  assert.deepEqual(RADOLF_UPGRADES.map(row=>[row.system.weight,row.system.price]),[[.1,275],[.5,440],[.5,375],[.1,425],[.5,395]]);
  assert.deepEqual(RADOLF_RECIPES.slice(0,5).map(row=>[row.system.recipe.dc,row.system.recipe.time,row.system.price,row.system.recipe.investment]),[[15,14400,550,176],[20,36000,880,284],[10,3600,750,242],[17,14400,850,280],[12,7200,790,260]]);
  for(const recipe of RADOLF_RECIPES) {
    assert.ok([...RADOLF_UPGRADES,...RADOLF_POTIONS].some(item=>equipmentUuid(item.documentId)===recipe.system.recipe.resultUuid));
    for(const component of recipe.system.recipe.components.filter(row=>row.uuid))assert.ok(MATERIALS.some(item=>equipmentUuid(item.documentId)===component.uuid));
  }
  const signs=RADOLF_RECIPES.slice(5).map(row=>Object.fromEntries(row.system.recipe.components.map(c=>[c.substance,c.quantity])));
  assert.deepEqual(signs,[{vitriol:1,fulgur:2,hydragenum:1,rebis:2},{aether:2,caelum:1,vermilion:2},{aether:1,caelum:1,quebrith:1,rebis:1,vermilion:1,vitriol:1}]);
});

test("modifications have separate capacity, reject duplicates, consume inventory and return when removed",async()=>{
  const {actor,bow,mod}=fixture(),sight=mod("sight"),string=mod("string");
  const weight=bow.system.weight;
  await installOwnedUpgrade(bow,sight);assert.equal(sight.system.quantity,0);assert.equal(freeSlots(bow),1);assert.equal(crossbowSlots(bow),1);
  await assert.rejects(installCatalogUpgrade(bow,sight),/не подходит/);
  await installOwnedUpgrade(bow,string);assert.equal(crossbowSlots(bow),0);
  bow.system.equipped=false;assert.match(disassemblyBlocker(bow,{quantity:1,components:[{uuid:"material",quantity:1}]}),/модификации арбалета/);
  assert.equal(effectiveItem(bow).accuracy,bow.system.accuracy+1);
  assert.equal(effectiveItem(bow).damage,`(${bow.system.damage}) + 1d6`);assert.equal(effectiveItem(bow).weight,weight+.2);
  await assert.rejects(installOwnedUpgrade(bow,mod("windlass")),/недоступна/);
  await removeCrossbowModification(bow,bow.system.installations[0].id);
  assert.equal(crossbowSlots(bow),1);assert.equal(actor.items.filter(item=>item.system.ruleId===sight.system.ruleId).reduce((n,item)=>n+item.system.quantity,0),1);
  bow.system.hands=1;assert.equal(crossbowCapacity(bow),1);assert.equal(crossbowSlots(bow),0);
});

test("Skellige strike ignores other modifications and bolt effects; an unloaded crossbow can still hit in melee",async()=>{
  const {actor,bow,mod,messages}=fixture();await installOwnedUpgrade(bow,mod("skellige"));await installOwnedUpgrade(bow,mod("string"));
  const shot=weaponAttack(actor,bow,{mode:"shot"}),melee=weaponAttack(actor,bow,{mode:"stirrup"});
  assert.match(shot.blocked,/перезарядка/);assert.equal(melee.blocked,"");assert.equal(melee.ranged,false);assert.equal(melee.body,0);
  assert.equal(melee.damage,`(${bow.system.damage})`);assert.equal(melee.total,8+4+bow.system.accuracy-1);assert.equal(melee.weapon.damageType,"Д");
  assert.equal(effectiveItem(bow).reliability.max,bow.system.reliability.max+5);
  bow.system.loaded=true;bow.flags[SYS]={loadedAmmo:{name:"Болт",properties:"Сбалансированное; Кровопускающее (100%)"}};
  await rollWeaponAttack(actor,bow.id,{mode:"stirrup"});
  const attack=messages.at(-1).flags[SYS].weaponAttack;assert.equal(attack.ammunition,null);assert.doesNotMatch(attack.weaponProperties,/Сбалансированное|Кровопускающее/);
  assert.equal(bow.system.loaded,true);
  actor.type="npc";assert.ok(attackModes(actor,bow).some(mode=>mode.id==="stirrup"));
});

test("installation spends the full turn; windlass uses movement once and leaves the ordinary action available",async()=>{
  const f=fixture();f.combat();await installOwnedUpgrade(f.bow,f.mod("windlass"));
  assert.equal(f.actor.effects[0].flags[SYS].creatureFullTurn,true);assert.equal(conditionRules(f.actor).canMove,false);
  await assert.rejects(installOwnedUpgrade(f.bow,f.mod("sight")),/полный ход/);
  f.actor.effects[0].duration.expired=true;game.combat.round=2;
  const ammo=f.add({id:"ammunition.standard",type:"equipment",name:"Болты",system:{kind:"ammunition",quantity:3,damageType:"К"}});
  await reloadCrossbow(f.actor,f.bow,ammo.id,{movement:true});assert.equal(ammo.system.quantity,2);assert.equal(f.bow.system.loaded,true);
  assert.equal(conditionRules(f.actor).canMove,false);assert.equal(conditionRules(f.actor).canAct,true);assert.equal(movementReloadAvailable(f.actor,f.bow),false);
  f.bow.system.loaded=false;await assert.rejects(reloadCrossbow(f.actor,f.bow,ammo.id,{movement:true}),/передвижение/);
  await reloadCrossbow(f.actor,f.bow,ammo.id);assert.equal(ammo.system.quantity,1);
});

test("movement already made this round prevents paying for a windlass reload again",async()=>{
  const f=fixture();await installOwnedUpgrade(f.bow,f.mod("windlass"));f.combat();
  let hook;globalThis.Hooks={on:(_name,fn)=>hook=fn};registerCrossbowMovement();
  await hook({actor:f.actor},{x:100});assert.equal(movementReloadAvailable(f.actor,f.bow),false);
  game.combat.round=2;assert.equal(movementReloadAvailable(f.actor,f.bow),true);delete globalThis.Hooks;
});
