import test from "node:test";
import assert from "node:assert/strict";
import { attackModes, weaponAttack, bodyDamage, gripOf } from "../scripts/combat/weapon-rules.mjs";
import { actionQuote, actionUpdate, rollActionCheck } from "../scripts/combat/action-economy.mjs";
import { rollWeaponAttack, rollWeaponDamage } from "../scripts/combat/weapon-rolls.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";
function fixture() {
  const weapon={id:"sword",type:"weapon",name:"Sword",system:{hands:2,grip:0,category:"melee",skill:"swordsmanship",damage:"2d6+2",accuracy:1,quantity:1,carried:true,equipped:true,reliability:{value:10,max:10}}};
  const items=[weapon];items.get=id=>items.find(i=>i.id===id);
  return {uuid:"Actor.fighter",isOwner:true,type:"character",items,effects:[],system:{attributes:{},skills:{swordsmanship:6,archery:5,crossbow:4},abilityState:{},
    statistics:{effective:{reflex:8,dexterity:7,body:9},modifiers:[],meleeDamageBonus:2},combatAction:{extra:false,lastExtraRound:""},stamina:{value:20,max:40}},
    async update(changes){for(const [path,value] of Object.entries(changes))if(path.startsWith("system.")){const keys=path.split(".").slice(1);let owner=this.system;for(const key of keys.slice(0,-1))owner=owner[key];owner[keys.at(-1)]=value;}if(changes.items)for(const row of changes.items)for(const [key,value] of Object.entries(row))if(key.startsWith("system."))items.get(row._id).system[key.slice(7)]=value;}};
}
test("weapon checks combine base, accuracy, mode, aim and extra action; damage includes BODY once",()=>{
  const actor=fixture(),weapon=actor.items[0];
  assert.equal(gripOf(weapon),2);
  const fast=weaponAttack(actor,weapon);assert.equal(fast.total,15);assert.equal(fast.attack.count,2);assert.equal(fast.damage,"(2d6+2 + 6)");
  const strong=weaponAttack(actor,weapon,{mode:"strong",extraPenalty:-3,location:"head",modifier:2});assert.equal(strong.total,5);assert.equal(strong.damage,"(2d6+2 + 6) * 2");
  weapon.system.grip=1;assert.match(weaponAttack(actor,weapon).blocked,/Нужно рук/);
  weapon.system.natural=true;assert.equal(weaponAttack(actor,weapon).blocked,"");
  weapon.system.damageIncludesBody=true;assert.equal(weaponAttack(actor,weapon).body,0);
  assert.deepEqual([1,3,5,7,9,11,13].map(bodyDamage),[-4,-2,0,2,4,6,8]);
});
test("bows have one fast shot, crossbows no strong shot, NPCs only their printed rate",()=>{
  const actor=fixture(),weapon=actor.items[0];weapon.system.category="ranged";weapon.system.skill="archery";
  assert.equal(attackModes(actor,weapon)[0].count,1);assert.equal(weaponAttack(actor,weapon).body,0);
  assert.equal(weaponAttack(actor,weapon,{range:"extreme"}).total,7);
  weapon.system.skill="crossbow";weapon.system.loaded=true;
  assert.equal(attackModes(actor,weapon).length,1);assert.throws(()=>weaponAttack(actor,weapon,{mode:"strong"}));
  weapon.system.loaded=false;assert.match(weaponAttack(actor,weapon,{mode:"shot"}).blocked,/перезарядка/);
  actor.type="npc";weapon.system.attackRate=3;assert.deepEqual(attackModes(actor,weapon).map(a=>a.id),["npc"]);assert.equal(attackModes(actor,weapon)[0].count,3);
});
test("extra action costs three once and cannot be repeated in the same combat round",()=>{
  const actor=fixture();actor.system.combatAction.extra=true;
  globalThis.game={combat:{started:true,id:"fight",round:2,combatants:[{actor}]}};
  const quote=actionQuote(actor);assert.equal(quote.penalty,-3);assert.equal(quote.stamina,3);
  assert.deepEqual(actionUpdate(actor,quote,5),{"system.stamina.value":12,"system.combatAction.extra":false,"system.combatAction.lastExtraRound":"fight:2"});
  actor.system.combatAction.lastExtraRound="fight:2";assert.throws(()=>actionQuote(actor),/уже/);
  game.combat.round=3;assert.equal(actionQuote(actor).stamina,3);
  actor.system.stamina.value=2;assert.throws(()=>actionQuote(actor),/Недостаточно/);
  delete game.combat;
});
test("two quick attacks share one message and STA payment, repeat clicks share the pending action",async()=>{
  const actor=fixture();actor.system.combatAction.extra=true;let writes=0,sent;
  const update=actor.update.bind(actor);actor.update=async changes=>{writes++;return update(changes);};
  globalThis.game={settings:{get:()=>"blind"}};
  globalThis.foundry={dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(opts){assert.equal(opts.allowInteractive,false);return this;}}},documents:{ChatMessage:{getSpeaker:()=>({actor:"fighter"}),applyMode:data=>data,async create(data){sent=data;assert.equal(actor.system.stamina.value,20);return data;}}}};
  const first=rollWeaponAttack(actor,"sword"),second=rollWeaponAttack(actor,"sword");assert.equal(first,second);await first;
  assert.equal(sent.rolls.length,2);assert.equal(sent.rolls[0].formula,"1d10wc + 12");assert.equal(writes,1);assert.equal(actor.system.stamina.value,17);assert.equal(actor.system.combatAction.extra,false);
  assert.equal(sent.flags[SYSTEM_ID].weaponAttack.damage,"(2d6+2 + 6)");
});
test("generic extra action preserves privacy and costs nothing on canceled chat",async()=>{
  const actor=fixture();actor.system.combatAction.extra=true;let formula,accepted=false;
  globalThis.game={settings:{get:()=>"self"}};globalThis.ui={notifications:{warn:message=>{throw new Error(message);}}};
  globalThis.foundry={dice:{Roll:class{constructor(value){formula=value;}async evaluate(){return this;}async toMessage(data,options){assert.equal(options.messageMode,"self");return accepted?data:null;}}},documents:{ChatMessage:{getSpeaker:()=>({})}}};
  await rollActionCheck(actor,{formula:"1d10wc + 10",flavor:"Skill"});assert.equal(formula,"1d10wc + 10 - 3");assert.equal(actor.system.stamina.value,20);assert.equal(actor.system.combatAction.extra,true);
  accepted=true;await rollActionCheck(actor,{formula:"1d10wc + 10",flavor:"Skill"});assert.equal(actor.system.stamina.value,17);assert.equal(actor.system.combatAction.extra,false);
});
test("damage preserves attack snapshot and private recipients without spending Luck",async()=>{
  const actor=fixture();let result;
  globalThis.foundry={dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){return this;}async toMessage(data,options){result={formula:this.formula,data,options};return result;}}}};
  const message={id:"attack",speakerActor:actor,isContentVisible:true,blind:false,whisper:["original-player"],speaker:{actor:"fighter"},flags:{[SYSTEM_ID]:{weaponAttack:{damage:"(2d6+2) * 2",name:"Sword",location:"head",multiplier:3,itemId:"sword"}}}};
  actor.items[0].system.damage="99d6";
  await rollWeaponDamage(message);
  assert.equal(result.formula,"(2d6+2) * 2");assert.deepEqual(result.data.whisper,["original-player"]);assert.equal(result.options.messageMode,"gm");assert.equal(result.data.flags[SYSTEM_ID].skipLuck,true);
  message.isContentVisible=false;result=null;await rollWeaponDamage(message);assert.equal(result,null);
});
