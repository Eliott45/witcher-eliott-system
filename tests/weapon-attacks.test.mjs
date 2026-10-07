import test from "node:test";
import assert from "node:assert/strict";
import { attackModes, weaponAttack, bodyDamage, gripOf, hitLocation, shieldPunch } from "../scripts/combat/weapon-rules.mjs";
import { actionQuote, actionUpdate, rollActionCheck } from "../scripts/combat/action-economy.mjs";
import { rollWeaponAttack, rollWeaponDamage, rollHitLocation } from "../scripts/combat/weapon-rolls.mjs";
import { defenseQuote, rollDefense } from "../scripts/combat/defense-rolls.mjs";
import { shieldClass } from "../scripts/data/shields.mjs";
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
  const fast=weaponAttack(actor,weapon);assert.equal(fast.total,15);assert.equal(fast.attack.count,1);assert.equal(fast.damage,"(2d6+2 + 6)");
  const strong=weaponAttack(actor,weapon,{mode:"strong",extraPenalty:-3,location:"head",modifier:2});assert.equal(strong.total,5);assert.equal(strong.damage,"(2d6+2 + 6) * 2");
  weapon.system.grip=1;assert.equal(weaponAttack(actor,weapon).blocked,"");assert.equal(weaponAttack(actor,weapon).total,12);
  assert.equal(weaponAttack(actor,weapon,{mode:"strong",extraPenalty:-3}).total,6);
  weapon.system.equipped=false;assert.match(weaponAttack(actor,weapon).blocked,/Возьмите/);weapon.system.equipped=true;
  weapon.system.reliability.value=0;assert.match(weaponAttack(actor,weapon).blocked,/сломано/);weapon.system.reliability.value=10;
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
test("a fast attack is two single strikes for one action; an extra action is paid once for the pair",async()=>{
  const actor=fixture();actor.system.combatAction.extra=true;actor.flags={};let sent=[];
  const update=actor.update.bind(actor);actor.update=async changes=>{for(const [path,value] of Object.entries(changes))if(path.startsWith(`flags.${SYSTEM_ID}.`))(actor.flags[SYSTEM_ID]??={})[path.split(".").at(-1)]=value;return update(changes);};
  globalThis.game={settings:{get:()=>"blind"}};
  globalThis.foundry={dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(opts){assert.equal(opts.allowInteractive,false);return this;}}},documents:{ChatMessage:{getSpeaker:()=>({actor:"fighter"}),applyMode:data=>data,async create(data){sent.push(data);return data;}}}};
  await rollWeaponAttack(actor,"sword");
  assert.equal(sent[0].rolls.length,1);assert.equal(sent[0].rolls[0].formula,"1d10wc + 12");assert.equal(sent[0].flags[SYSTEM_ID].weaponAttack.strike,1);
  assert.equal(actor.system.stamina.value,17);assert.equal(actor.system.combatAction.extra,true,"the extra action stays open for strike 2");
  await rollWeaponAttack(actor,"sword");
  assert.equal(sent[1].rolls[0].formula,"1d10wc + 12","strike 2 keeps the −3");assert.equal(sent[1].flags[SYSTEM_ID].weaponAttack.strike,2);
  assert.equal(actor.system.stamina.value,17,"no second payment");assert.equal(actor.system.combatAction.extra,false);
  assert.equal(actor.flags[SYSTEM_ID].fastStrike,null);
  assert.equal(sent[0].flags[SYSTEM_ID].weaponAttack.damage,"(2d6+2 + 6)");
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

test("shield strikes use their class and punch table without adding BODY twice; legacy shields resolve by ID",()=>{
  const actor=fixture(),shield=actor.items[0];
  Object.assign(shield.system,{category:"shield",skill:"melee",damage:"0",hands:1,ruleId:"weapon.temerian-shield"});
  assert.equal(shieldClass(shield.system),"light");
  assert.equal(weaponAttack(actor,shield).damage,"(1d6 + 6)");
  shield.system.ruleId="weapon.kaedwen-shield";assert.equal(shieldClass(shield.system),"medium");
  assert.equal(weaponAttack(actor,shield).damage,"(1d6 + 10)");
  actor.system.statistics.effective.body=5;
  assert.deepEqual(["light","medium","heavy"].map(weight=>shieldPunch(5,weight)),[0,4,8]);
  shield.system.ruleId="homebrew";assert.match(weaponAttack(actor,shield).blocked,/класс/);
  shield.system.shieldClass="medium";assert.equal(weaponAttack(actor,shield).blocked,"");
  shield.system.damage="2d6";shield.system.damageIncludesBody=true;assert.equal(weaponAttack(actor,shield).damage,"(2d6 + 2)");
});

test("defense uses skill without WA or extra-action penalty, and enforces projectile restrictions",()=>{
  const actor=fixture();actor.system.combatAction.extra=true;
  assert.equal(defenseQuote(actor,{mode:"block",itemId:"sword"}).total,14);
  assert.equal(defenseQuote(actor,{mode:"parry",itemId:"sword"}).total,11);
  assert.equal(defenseQuote(actor,{mode:"parry",itemId:"sword",incoming:"thrown"}).total,9);
  assert.match(defenseQuote(actor,{mode:"block",itemId:"sword",incoming:"thrown"}).blocked,/щитом/);
  assert.match(defenseQuote(actor,{mode:"parry",itemId:"sword",incoming:"ranged"}).blocked,/стрелы/);
  actor.items[0].system.category="shield";
  assert.equal(defenseQuote(actor,{mode:"block",itemId:"sword",incoming:"ranged"}).blocked,"");
  actor.items[0].system.reliability.value=0;assert.match(defenseQuote(actor,{mode:"block",itemId:"sword"}).blocked,/сломано/);
  assert.equal(defenseQuote(actor,{mode:"dodge",repeat:true}).cost,1);
  actor.system.stamina.value=0;assert.match(defenseQuote(actor,{repeat:true}).blocked,/Выносливости/);
});

test("repeated defense charges once after chat, cancellation is free and extra action remains selected",async()=>{
  const actor=fixture();actor.system.combatAction.extra=true;let accepted=false,posted;
  globalThis.game={settings:{get:()=>"self"}};
  globalThis.foundry={dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){return this;}async toMessage(data,opts){assert.equal(opts.messageMode,"self");assert.equal(actor.system.stamina.value,20);posted=data;return accepted?data:null;}}},documents:{ChatMessage:{getSpeaker:()=>({actor:"fighter"})}}};
  await rollDefense(actor,{repeat:true});assert.equal(actor.system.stamina.value,20);
  accepted=true;const first=rollDefense(actor,{repeat:true}),second=rollDefense(actor,{repeat:true});assert.equal(first,second);await first;
  assert.equal(actor.system.stamina.value,19);assert.equal(actor.system.combatAction.extra,true);
  assert.equal(posted.flags[SYSTEM_ID].defense.cost,1);
});

test("hit location tables cover all d10 results including errata monster torso and right limb",()=>{
  assert.deepEqual(Array.from({length:10},(_,i)=>hitLocation(i+1).id),["head","torso","torso","torso","rightArm","leftArm","rightLeg","rightLeg","leftLeg","leftLeg"]);
  assert.deepEqual(Array.from({length:10},(_,i)=>hitLocation(i+1,"monster").id),["head","torso","torso","torso","torso","rightArm","rightArm","leftArm","leftArm","tail"]);
  assert.equal(hitLocation(1).multiplier,3);assert.equal(hitLocation(10).multiplier,.5);
  assert.equal(hitLocation(10,"monster",{hasTailOrWings:false}).id,"leftArm");
  assert.equal(hitLocation(10,"monster",{hasTailOrWings:false}).multiplier,.5);
  assert.equal(hitLocation(10,"monster",{hasTailOrWings:true}).id,"tail");
  assert.equal(hitLocation(10,"humanoid",{hasTailOrWings:false}).id,"leftLeg");
  assert.throws(()=>hitLocation(11));assert.throws(()=>hitLocation(1,"unknown"));
});

test("location roll is ordinary d10 and preserves private audience without using Luck",async()=>{
  let sent;
  globalThis.foundry={dice:{Roll:class{constructor(formula){assert.equal(formula,"1d10");this.total=10;}async evaluate(){return this;}async toMessage(data,options){sent={data,options};return sent;}}}};
  const message={id:"attack",speakerActor:fixture(),isContentVisible:true,blind:true,whisper:["gm"],speaker:{actor:"fighter"},flags:{[SYSTEM_ID]:{weaponAttack:{name:"Sword",location:"random"}}}};
  await rollHitLocation(message,"monster");assert.deepEqual(sent.data.whisper,["gm"]);assert.equal(sent.options.messageMode,"blind");
  assert.equal(sent.data.flags[SYSTEM_ID].skipLuck,true);assert.equal(sent.data.flags[SYSTEM_ID].hitLocation.id,"tail");
  assert.match(sent.data.flavor,/нет хвоста и крыльев.*левую конечность/);
  sent=null;message.isContentVisible=false;await rollHitLocation(message,"monster");assert.equal(sent,null);
});
test("distance bands are measured from the target automatically or chosen by hand (core p.164)",async()=>{
  const {bandFor}=await import("../scripts/combat/weapon-rules.mjs");
  const {unawareDC}=await import("../scripts/combat/attack-exchange.mjs");
  assert.equal(bandFor(40,0).id,"point");assert.equal(bandFor(40,10).id,"short");assert.equal(bandFor(40,20).id,"medium");
  assert.equal(bandFor(40,40).id,"long");assert.equal(bandFor(40,80).id,"extreme");assert.equal(bandFor(40,81).beyond,true);
  const actor=fixture(),weapon=actor.items[0];Object.assign(weapon.system,{category:"ranged",skill:"archery",hands:2,range:40});
  const context=distance=>({target:{actor:null},parts:[],distance});
  assert.equal(weaponAttack(actor,weapon,{targetContext:context(25)}).band.id,"long");
  assert.equal(weaponAttack(actor,weapon,{targetContext:context(25)}).total,weaponAttack(actor,weapon,{range:"long"}).total);
  assert.equal(weaponAttack(actor,weapon,{range:"point",targetContext:context(25)}).band.id,"point","a manual band wins over the measured one");
  assert.match(weaponAttack(actor,weapon,{targetContext:context(100)}).blocked,/предельной/);
  assert.equal(weaponAttack(actor,weapon).band.id,"auto");
  const target=size=>({system:{creature:{sizeClass:size}}});
  assert.equal(unawareDC({ranged:false},target("huge")).dc,10);
  assert.equal(unawareDC({ranged:true,dc:20},target("small")).dc,22);
  assert.equal(unawareDC({ranged:true,dc:25},target("huge")).dc,21);
  assert.equal(unawareDC({ranged:true,dc:15},{system:{}}).dc,15);
});
