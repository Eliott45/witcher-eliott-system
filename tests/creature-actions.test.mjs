import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { needleDice, chargeProfile, validateCreatureRange, creatureHypnosisPenalty } from "../scripts/combat/creature-actions-rules.mjs";
import { creatureActions, useCreatureAction, applyCreatureSpecial, resolveCreatureArea, damageCreatureWeb, attackCreatureWeb,
  onCreatureExchangeApplied, applyCreatureCollision, dispelSirenIllusion, registerCreatureActions } from "../scripts/combat/creature-actions.mjs";
import { createNoonDance, tickNoonDance, destroyNoonCopy } from "../scripts/combat/creature-actions-dance.mjs";
import { applyCreatureDamage } from "../scripts/combat/creature-actions-damage.mjs";

const put=(object,path,value)=>{const keys=path.split(".");for(const key of keys.slice(0,-1))object=object[key]??= {};object[keys.at(-1)]=value;};
const collection=values=>Object.assign(values,{get(id){return this.find(row=>row.id===id);},has(id){return this.some(row=>row.id===id);}});
function setup() {
  let serial=0;const id=()=>String(++serial).padStart(16,"0"),documents=new Map(),rolls=[],totals=[],messages=collection([]),actors=collection([]);
  const scene={id:"scene",uuid:"Scene.scene",grid:{size:100,distance:2},tokens:collection([]),templates:[],
    async createEmbeddedDocuments(type,data){assert.equal(type,"Token");return data.map(source=>token(actors.get(source.actorId),source.x,source.y,source));},
    async deleteEmbeddedDocuments(type,ids){assert.equal(type,"Token");this.tokens.splice(0,this.tokens.length,...this.tokens.filter(token=>!ids.includes(token.id)));}};
  const gm={id:"gm",isGM:true};globalThis.game={user:gm,users:{activeGM:gm},messages,actors,scenes:[scene],settings:{get:()=>false},time:{worldTime:0},i18n:{localize:text=>text},combat:null};
  gm.targets=new Set();globalThis.canvas={scene,ready:false,tokens:{controlled:[]}};globalThis.fromUuidSync=uuid=>documents.get(uuid);
  const register=document=>{documents.set(document.uuid,document);return document;};
  const update=async function(data){if(this.failHealth&&"system.health.value"in data){this.failHealth=false;throw new Error("health failed");}for(const [path,value]of Object.entries(data))put(this,path,value);return this;};
  function effect(actor,source) {
    const effect={...structuredClone(source),id:id(),statuses:new Set(source.statuses??[]),parent:actor,update,
      async delete(){actor.effects.splice(actor.effects.indexOf(this),1);}};
    return effect;
  }
  function actor(name="Волколак",overrides={}) {
    const source=structuredClone(bestiarySources().find(row=>row.name===name));assert.ok(source,name);
    const value={...source,...overrides,id:source._id,uuid:`Actor.${id()}`,isOwner:true,effects:collection([]),update,getFlag(scope,key){return this.flags?.[scope]?.[key];},
      async setFlag(scope,key,val){return this.update({[`flags.${scope}.${key}`]:val});},
      async createEmbeddedDocuments(type,sources){assert.equal(type,"ActiveEffect");if(this.failEffect){this.failEffect=false;throw new Error("effect failed");}const rows=sources.map(source=>effect(this,source));this.effects.push(...rows);return rows;},
      async deleteEmbeddedDocuments(type,ids){assert.equal(type,"ActiveEffect");this.effects.splice(0,this.effects.length,...this.effects.filter(effect=>!ids.includes(effect.id)));},
      async updateEmbeddedDocuments(type,changes){const list=type==="ActiveEffect"?this.effects:this.items;for(const change of changes){const entry=list.get(change._id);await entry.update(Object.fromEntries(Object.entries(change).filter(([key])=>key!=="_id")));}},
      async delete(){actors.splice(actors.indexOf(this),1);},
      toObject(){return JSON.parse(JSON.stringify({name:this.name,type:this.type,system:this.system,items:this.items,effects:[],flags:this.flags,prototypeToken:{width:1,height:1}}));}};
    value.flags??={};value.system.skills={...Object.fromEntries(SKILL_KEYS.map(key=>[key,0])),...value.system.skills};
    value.system.combatAction={extra:false,lastExtraRound:""};value.system.abilityState={};
    value.items=collection(value.items.map(item=>({...item,id:item._id,update,system:{quantity:1,...item.system}})));
    value.system.statistics=deriveStatistics(value.system,{items:value.items});
    value.prototypeToken={toObject:()=>({width:1,height:1})};
    actors.push(value);return register(value);
  }
  function token(actor,x=0,y=0,extra={}) {
    const token={id:id(),uuid:`Scene.scene.Token.${id()}`,name:actor.name,actor,actorId:actor.id,width:1,height:1,x,y,rotation:0,sight:{angle:360},flags:{},...extra,
      parent:scene,isOwner:true,update,getSize(){return {width:this.width*100,height:this.height*100};}};
    token.actor=actor;scene.tokens.push(token);return register(token);
  }
  const makeMessage=async data=>{const message={id:id(),uuid:`ChatMessage.${id()}`,flags:{},rolls:[],whisper:[],isContentVisible:true,...data,update,
    speakerActor:documents.get(data.speaker?.actor),getFlag(scope,key){return this.flags?.[scope]?.[key];}};messages.push(message);return register(message);};
  class Roll {
    constructor(formula){this.formula=formula;this.dice=[];rolls.push(formula);}
    async evaluate(){assert.ok(totals.length,`No result for ${this.formula}`);this.total=totals.shift();return this;}
    toMessage(data){return makeMessage({...data,rolls:[this]});}
  }
  globalThis.foundry={dice:{Roll},utils:{randomID:id,deepClone:structuredClone,getProperty:(object,path)=>path.split(".").reduce((value,key)=>value?.[key],object)},documents:{ActiveEffect:{getEffectStart:()=>({time:0})},
    ChatMessage:{create:makeMessage,applyMode:data=>data,getSpeaker:({actor})=>({actor:actor.uuid})},
    Actor:{implementation:{async create(data){const copy=actor("Полуденница");Object.assign(copy,data);copy.id=id();copy.flags=data.flags;copy.prototypeToken={toObject:()=>({width:1,height:1})};return copy;}}}}};
  foundry.documents.ChatMessage.implementation=foundry.documents.ChatMessage;
  const combat=()=>{const combatants=scene.tokens.map(token=>({id:token.id,actor:token.actor,initiative:10}));game.combat={id:"combat",started:true,round:1,turn:0,scene,combatants,turns:combatants,combatant:combatants[0]};return game.combat;};
  const card=(actor,flags,extra={})=>makeMessage({speaker:{actor:actor.uuid},flags:{[SYSTEM_ID]:flags},...extra});
  return {actor,token,scene,totals,rolls,messages,combat,card,gm,documents};
}

test("creature actions preserve identities on renamed imports and reject another GM",async()=>{
  const env=setup(),arachas=env.actor("Главоглаз");arachas.name="Лесной паук";
  assert.ok(creatureActions(arachas).some(action=>action.id==="web"));
  game.user={id:"other-gm",isGM:true};assert.ok(creatureActions(arachas).every(action=>action.disabled));
  await assert.rejects(useCreatureAction(arachas,"web"),/активный ведущий/);
});

test("fixed needle DC, strict minimum distances and printed charge profiles",()=>{
  assert.deepEqual([20,15,14,10,-2].map(needleDice),[0,0,1,5,17]);
  assert.throws(()=>validateCreatureRange({min:8,max:10},8),/дальше/);
  assert.equal(validateCreatureRange({min:8,max:10},10),10);
  assert.throws(()=>validateCreatureRange({min:8,max:10},10.1),/не дальше/);
  assert.deepEqual(chargeProfile("ox"),{damage:"8d6",pushMeters:3,skill:"melee",weapon:"Рога"});
  assert.equal(chargeProfile("golem").skill,"brawling");assert.equal(chargeProfile("fiend").damage,"10d6");
});

test("charge is one attack at -4, spends the full turn, moves to contact and coalesces double clicks",async()=>{
  const env=setup(),golem=env.actor("Голем"),victim=env.actor("Волк"),from=env.token(golem),to=env.token(victim,700);env.combat();env.totals.push(23);
  const a=useCreatureAction(golem,"charge",{sourceToken:from,targets:[to]}),b=useCreatureAction(golem,"charge",{sourceToken:from,targets:[to]});
  const [message,duplicate]=await Promise.all([a,b]);assert.equal(message,duplicate);assert.equal(env.rolls.length,1);
  const attack=message.flags[SYSTEM_ID].weaponAttack;assert.equal(attack.damage,"10d6");assert.equal(attack.count,1);assert.equal(attack.base,11);
  assert.equal(attack.creatureAction.pushMeters,8);assert.equal(from.x,600);
  assert.ok(golem.effects.some(effect=>effect.flags[SYSTEM_ID].creatureFullTurn));
  await assert.rejects(useCreatureAction(golem,"charge",{sourceToken:from,targets:[to]}),/Полный ход/);
});

test("web applies only on a hit, has its own DC and ten HP, and retries never stack it",async()=>{
  const env=setup(),spider=env.actor("Главоглаз"),victim=env.actor("Волк"),from=env.token(spider),to=env.token(victim,600);
  const card=await env.card(spider,{weaponAttack:{name:"Паутина",special:"creature:web",attacker:from.uuid,target:to.uuid}});
  assert.equal(await applyCreatureSpecial(card,0,{hit:false}),false);assert.equal(victim.effects.length,0);
  victim.failEffect=true;await assert.rejects(applyCreatureSpecial(card,0,{hit:true}),/effect failed/);
  assert.equal(await applyCreatureSpecial(card,0,{hit:true}),true);assert.equal(await applyCreatureSpecial(card,0,{hit:true}),false);
  const web=victim.effects[0];assert.equal(web.flags[SYSTEM_ID].creatureWeb.hp,10);assert.equal(web.flags[SYSTEM_ID].condition.save.skill,"physique");assert.equal(web.flags[SYSTEM_ID].condition.save.dc,16);
  await damageCreatureWeb(victim,6,"hit-1");await damageCreatureWeb(victim,6,"hit-1");assert.equal(web.flags[SYSTEM_ID].creatureWeb.hp,4);
  await damageCreatureWeb(victim,4,"hit-2");assert.equal(victim.effects.length,0);
});

test("whirlwind persists its rolled duration through a failed effect write and cannot be cleared by a generic one-turn action",async()=>{
  const env=setup(),spirit=env.actor("Полуденница"),victim=env.actor("Волк"),from=env.token(spirit),to=env.token(victim,100);
  const card=await env.card(spirit,{weaponAttack:{name:"Вихрь",special:"creature:whirlwind",attacker:from.uuid,target:to.uuid}});
  env.totals.push(4);victim.failEffect=true;await assert.rejects(applyCreatureSpecial(card,0,{hit:true}),/effect failed/);
  await applyCreatureSpecial(card,0,{hit:true});assert.equal(env.rolls.length,1);assert.equal(victim.effects[0].duration.value,4);
  assert.equal(victim.effects[0].flags[SYSTEM_ID].condition.action,null);
});

test("needle failure rolls one d6 per missing point and applies damage and poison only once",async()=>{
  const env=setup(),drone=env.actor("Эндриага-трутень"),victim=env.actor("Волк"),from=env.token(drone),to=env.token(victim,100);
  victim.system.creature.naturalArmor=4;
  const card=await env.card(drone,{creatureArea:{id:"needles",source:from.uuid,dc:15,targets:[{uuid:to.uuid,name:to.name,done:false}]}});
  const before=victim.system.health.value;env.totals.push(12,9);
  await Promise.all([resolveCreatureArea(card,0),resolveCreatureArea(card,0)]);
  assert.ok(env.rolls.includes("3d6"));assert.equal(victim.system.health.value,before-5);assert.equal(victim.effects.filter(effect=>effect.statuses.has("poisoned")).length,1);
  assert.equal(victim.system.creature.naturalArmor,3);
  await resolveCreatureArea(card,0);assert.equal(victim.system.health.value,before-5);assert.equal(env.rolls.length,2);
});

test("scream uses a strict roll below STUN minus one; hypnosis is five rounds and opponent-specific",async()=>{
  const env=setup(),fiend=env.actor("Бес"),wolf=env.actor("Волк"),other=env.actor("Грифон"),from=env.token(fiend),to=env.token(wolf,100);
  wolf.system.statistics.stun=7;env.totals.push(6);
  const scream=await env.card(fiend,{creatureArea:{id:"scream",source:from.uuid,targets:[{uuid:to.uuid,name:to.name,done:false}]}});
  await resolveCreatureArea(scream,0);assert.ok(wolf.effects.some(effect=>effect.statuses.has("stunned")));
  wolf.effects.length=0;env.totals.push(20);
  const hypnosis=await env.card(fiend,{creatureArea:{id:"hypnosis",source:from.uuid,total:25,targets:[{uuid:to.uuid,name:to.name,done:false}]}});
  await resolveCreatureArea(hypnosis,0);const effect=wolf.effects[0];assert.equal(effect.duration.value,5);
  assert.equal(creatureHypnosisPenalty(wolf,fiend),-4);assert.equal(creatureHypnosisPenalty(wolf,other),0);
  effect.duration.expired=true;assert.equal(creatureHypnosisPenalty(wolf,fiend),0);
});

test("dance creates three copies, drains the nearest victim once per creator round, and deletes hit copies",async()=>{
  const env=setup(),spirit=env.actor("Полуденница"),victim=env.actor("Волколак"),other=env.actor("Грифон");
  const from=env.token(spirit),to=env.token(victim,1000),far=env.token(other,4000);spirit.system.health.value=50;
  await createNoonDance(spirit,{sourceToken:from,targets:[to],positions:[{x:50,y:50},{x:50,y:150},{x:150,y:50}]});
  const copies=env.scene.tokens.filter(token=>token.flags[SYSTEM_ID]?.noonCopy);assert.equal(copies.length,3);
  const combat=env.combat(),before=victim.system.health.value;
  await tickNoonDance(combat,combat.combatants[0],{round:1});assert.equal(victim.system.health.value,before-9);assert.equal(spirit.system.health.value,59);
  await tickNoonDance(combat,combat.combatants[0],{round:1});assert.equal(victim.system.health.value,before-9);
  await destroyNoonCopy(copies[0]);await tickNoonDance(combat,combat.combatants[0],{round:2});assert.equal(victim.system.health.value,before-15);
  assert.equal(other.system.health.value,100);
});

test("a suppressed spirit cannot teleport; an allowed teleport moves at most ten metres without spending the attack",async()=>{
  const env=setup(),spirit=env.actor("Призрак"),from=env.token(spirit);env.combat();
  spirit.system.creature.spiritMode="suppressed";await assert.rejects(useCreatureAction(spirit,"teleport",{sourceToken:from,destination:{x:550,y:50}}),/подавлена/);
  spirit.system.creature.spiritMode="normal";await useCreatureAction(spirit,"teleport",{sourceToken:from,destination:{x:550,y:50}});
  assert.equal(from.x,500);assert.equal(spirit.effects.length,0);
  await assert.rejects(useCreatureAction(spirit,"teleport",{sourceToken:from,destination:{x:650,y:50}}),/уже использовано/);
});

test("charge cannot push an immune target and collision damage cannot be applied twice",async()=>{
  const env=setup(),fiend=env.actor("Бес"),victim=env.actor("Волк"),from=env.token(fiend),to=env.token(victim,100);
  const card=await env.card(fiend,{weaponAttack:{target:to.uuid,attacker:from.uuid,creatureAction:{id:"charge",pushMeters:8}}});
  await onCreatureExchangeApplied(card,0,{immune:true});assert.equal(to.x,100);
  await onCreatureExchangeApplied(card,0,{total:0});assert.equal(to.x,500);
  await onCreatureExchangeApplied(card,0,{total:0});assert.equal(to.x,500);
  const collision=env.messages.at(-1),before=victim.system.health.value;env.totals.push(20);
  await applyCreatureCollision(collision,{meters:8,weight:"medium"});await applyCreatureCollision(collision,{meters:8,weight:"medium"});
  assert.equal(victim.system.health.value,before-20);assert.equal(env.rolls.length,1);
});

test("siren illusion uses the selected caster's Spell Casting and clears only on DC15 success",async()=>{
  const env=setup(),siren=env.actor("Сирена"),mage=env.actor("Маг"),from=env.token(siren),to=env.token(mage,100);siren.system.creature.illusion=true;
  env.totals.push(14,15);await dispelSirenIllusion(siren,{sourceToken:from,targets:[to]});assert.equal(siren.system.creature.illusion,true);
  await dispelSirenIllusion(siren,{sourceToken:from,targets:[to]});assert.equal(siren.system.creature.illusion,false);
  assert.ok(env.rolls.every(formula=>formula===`1d10wc + ${mage.system.statistics.effective.will+mage.system.skills.spellCasting}`));
});

test("area damage rolls back potion reactions and armor when the HP write fails, then retries once",async()=>{
  const env=setup(),victim=env.actor("Волколак"),before=victim.system.health.value;
  await victim.createEmbeddedDocuments("ActiveEffect",[{statuses:[],flags:{[SYSTEM_ID]:{consumable:{ruleId:"potion.full-moon"},elixirState:{temporary:10}}}}]);
  const potion=victim.effects[0],result={total:15,ablate:["natural"]};victim.failHealth=true;
  await assert.rejects(applyCreatureDamage(victim,result,"test-damage"),/health failed/);
  assert.equal(victim.system.health.value,before);assert.equal(victim.system.creature.naturalArmor,8);assert.equal(potion.flags[SYSTEM_ID].elixirState.temporary,10);
  await applyCreatureDamage(victim,result,"test-damage");await applyCreatureDamage(victim,result,"test-damage");
  assert.equal(victim.system.health.value,before-5);assert.equal(victim.system.creature.naturalArmor,7);assert.equal(potion.flags[SYSTEM_ID].elixirState.temporary,0);
});

test("zero weapon damage does not wear down a web but still spends the declared extra action",async()=>{
  const env=setup(),spider=env.actor("Главоглаз"),victim=env.actor("Волк"),from=env.token(spider),to=env.token(victim,600);
  const card=await env.card(spider,{weaponAttack:{name:"Паутина",special:"creature:web",attacker:from.uuid,target:to.uuid}});
  await applyCreatureSpecial(card,0,{hit:true});
  victim.system.combatAction.extra=true;const before=victim.system.stamina.value;env.totals.push(0);
  await attackCreatureWeb(victim,victim.items.find(item=>item.type==="weapon").id);
  assert.equal(victim.effects[0].flags[SYSTEM_ID].creatureWeb.hp,10);
  assert.equal(victim.system.stamina.value,before-3);assert.equal(victim.system.combatAction.extra,false);
});

test("needles cannot poison an incorporeal spirit but a hit still destroys a noon copy",async()=>{
  const env=setup(),drone=env.actor("Эндриага-трутень"),spirit=env.actor("Призрак"),copy=env.actor("Полуденница"),from=env.token(drone),to=env.token(spirit,100),copyToken=env.token(copy,200);
  copy.flags[SYSTEM_ID]={noonCopy:{sourceActor:spirit.uuid,sourceToken:to.uuid}};
  await spirit.createEmbeddedDocuments("ActiveEffect",[{statuses:["creature-slip"],flags:{}}]);
  const before=spirit.system.health.value;
  const card=await env.card(drone,{creatureArea:{id:"needles",source:from.uuid,targets:[{uuid:to.uuid,name:to.name,done:false},{uuid:copyToken.uuid,name:copyToken.name,done:false}]}});
  env.totals.push(14,6,14,6);await resolveCreatureArea(card,0);await resolveCreatureArea(card,1);
  assert.equal(spirit.system.health.value,before);assert.equal(spirit.effects.length,1);assert.equal(spirit.effects[0].statuses.has("poisoned"),false);
  assert.equal(env.scene.tokens.includes(copyToken),false);assert.equal(game.actors.includes(copy),false);
});

test("player-applied charge damage is pushed once by the active GM chat hook, with immunity and unrelated cards ignored",async()=>{
  const env=setup(),fiend=env.actor("Бес"),victim=env.actor("Волк"),from=env.token(fiend),to=env.token(victim,100);
  const hooks=new Map();globalThis.Hooks={on:(name,callback)=>hooks.set(name,callback)};
  globalThis.CONFIG={Canvas:{visionSourceClass:class {}}};
  foundry.canvas={perception:{DetectionMode:class {testVisibility(){return true;}}}};
  registerCreatureActions();const created=hooks.get("createChatMessage");
  const card=await env.card(fiend,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:{id:"charge",pushMeters:8}}});
  const applied=await env.card(victim,{exchange:{attack:card.id,index:0,kind:"applied",total:1}},{author:{id:"player"}});
  game.user={id:"player",isGM:false};await created(applied);assert.equal(to.x,100);
  game.user={id:"other-gm",isGM:true};await created(applied);assert.equal(to.x,100);
  game.user=env.gm;
  const ignored=[{kind:"damage"},{immune:true},{copyDestroyed:true},{index:1},{index:-1},{attack:"missing"}];
  for(const change of ignored)await created(await env.card(victim,{exchange:{...applied.flags[SYSTEM_ID].exchange,...change}}));
  assert.equal(to.x,100);
  const unrelated=await env.card(fiend,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1}});
  await created(await env.card(victim,{exchange:{attack:unrelated.id,index:0,kind:"applied",total:1}}));assert.equal(to.x,100);
  await Promise.all([created(applied),created(applied),onCreatureExchangeApplied(card,0,{total:1})]);
  assert.equal(to.x,500);assert.deepEqual(to.flags[SYSTEM_ID].creaturePushes,[`${card.id}:0`]);
  await created(applied);assert.equal(to.x,500);
  assert.equal(env.messages.filter(message=>message.flags[SYSTEM_ID]?.creatureCollision).length,1);
});
