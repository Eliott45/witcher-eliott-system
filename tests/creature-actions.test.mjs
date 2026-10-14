import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { needleDice, chargeProfile, validateCreatureRange, creatureHypnosisPenalty } from "../scripts/combat/creature-actions-rules.mjs";
import { creatureActions, useCreatureAction, applyCreatureSpecial, resolveCreatureArea, damageCreatureWeb, attackCreatureWeb,
  onCreatureExchangeApplied, onCreatureChargeMissed, applyCreatureCollision, dispelSirenIllusion, registerCreatureActions } from "../scripts/combat/creature-actions.mjs";
import { createNoonDance, tickNoonDance, destroyNoonCopy } from "../scripts/combat/creature-actions-dance.mjs";
import { applyCreatureDamage } from "../scripts/combat/creature-actions-damage.mjs";
import { rotfiendDecay, rotfiendDue, rotfiendTurn, startRotfiendDecay, explodeRotfiend } from "../scripts/combat/rotfiend.mjs";
import { onCreatureDamaged } from "../scripts/combat/creature-modes.mjs";
import { burningParts } from "../scripts/combat/burning.mjs";
import { fogRegions, fogSightLimit, revealFogletIfExposed, dispelFog, dismissFoglet } from "../scripts/combat/creature-fog.mjs";
import { afterCreatureAttack } from "../scripts/combat/creature-modes.mjs";
import { actionQuote } from "../scripts/combat/action-economy.mjs";
import { constrainHypnotizedVision } from "../scripts/combat/creature-actions-vision.mjs";
import { igniteHym } from "../scripts/combat/hym.mjs";
import { hymShadow } from "../scripts/combat/creature-spirits.mjs";
import { pestaFliesTurn, onPestaStruck } from "../scripts/combat/pesta.mjs";

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
test("creature hits consume adrenaline and HP in the same transaction and do not replay receipts",async()=>{
  const f=setup(),actor=f.actor("Маг");f.token(actor);f.combat();
  actor.flags[SYSTEM_ID]={...(actor.flags[SYSTEM_ID]??{}),adrenaline:{combatId:"combat",dice:0,temporaryHP:5,emergencyHP:0,damageDice:0,events:[]}};
  const before=actor.system.health.value;actor.failHealth=true;
  await assert.rejects(applyCreatureDamage(actor,{total:8,ablate:[]},"test-adrenaline"),/health failed/);
  assert.equal(actor.flags[SYSTEM_ID].adrenaline.temporaryHP,5);
  await applyCreatureDamage(actor,{total:8,ablate:[]},"test-adrenaline");
  assert.equal(actor.system.health.value,before-3);assert.equal(actor.flags[SYSTEM_ID].adrenaline.temporaryHP,0);
  assert.equal(await applyCreatureDamage(actor,{total:8,ablate:[]},"test-adrenaline"),false);assert.equal(actor.system.health.value,before-3);
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

test("graveir charges only at 5–10 m, at base 12 into the torso, and spends the full turn",async()=>{
  const env=setup(),graveir=env.actor("Утковол"),victim=env.actor("Волк"),from=env.token(graveir);env.combat();
  assert.ok(creatureActions(graveir).some(action=>action.id==="charge"));
  const near=env.token(victim,300);
  await assert.rejects(useCreatureAction(graveir,"charge",{sourceToken:from,targets:[near]}),/дальше 5 м/);
  near.x=700;await assert.rejects(useCreatureAction(graveir,"charge",{sourceToken:from,targets:[near]}),/не дальше 10 м/);
  near.x=500;env.totals.push(20);
  const message=await useCreatureAction(graveir,"charge",{sourceToken:from,targets:[near]}),attack=message.flags[SYSTEM_ID].weaponAttack;
  assert.deepEqual([attack.base,attack.damage,attack.location],[12,"7d6","torso"]);
  assert.deepEqual([attack.creatureAction.pushMeters,attack.creatureAction.collision,attack.creatureAction.blockSave],[5,"half",{skill:"physique",dc:25}]);
  assert.equal(from.x,400,"the graveir stops in contact");
  assert.deepEqual(attack.creatureAction.overrun,{from:{x:450,y:50},to:{x:550,y:50}},"8 m run, 2 m left");
  assert.ok(graveir.effects.some(effect=>effect.flags[SYSTEM_ID].creatureFullTurn));
});

test("a blocked graveir charge throws a target that fails Physique DC 25; a dodged one carries the graveir on",async()=>{
  const env=setup(),graveir=env.actor("Утковол"),victim=env.actor("Волк"),from=env.token(graveir,400),to=env.token(victim,500);
  const action={id:"charge",pushMeters:5,collision:"half",blockSave:{skill:"physique",dc:25},overrun:{from:{x:450,y:50},to:{x:550,y:50}}};
  const blocked=await env.card(graveir,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:action}});
  env.totals.push(24);
  await Promise.all([onCreatureChargeMissed(blocked,0,{hit:false,mode:"block"}),onCreatureChargeMissed(blocked,0,{hit:false,mode:"block"})]);
  assert.equal(env.rolls.length,1);assert.equal(to.x,750,"thrown 5 m away from the graveir");
  const collision=env.messages.at(-1).flags[SYSTEM_ID].creatureCollision;assert.equal(collision.formula,"half");
  const held=await env.card(graveir,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:action}});
  env.totals.push(25);await onCreatureChargeMissed(held,0,{hit:false,mode:"block"});assert.equal(to.x,750);
  const dodged=await env.card(graveir,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:action}});
  assert.equal(await onCreatureChargeMissed(dodged,0,{hit:false,mode:"parry"}),false);assert.equal(from.x,400);
  const missed=await env.card(graveir,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:action}});
  await onCreatureChargeMissed(missed,0,{hit:false,mode:"dodge"});assert.equal(from.x,500);
  assert.equal(graveir.effects.some(effect=>effect.statuses.has("stunned")),false,"no wall, no disorientation");
  from.x=400;from.object={checkCollision:point=>point.x>500};
  const wall=await env.card(graveir,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:action}});
  await onCreatureChargeMissed(wall,0,{hit:false,mode:"reposition"});
  assert.ok(from.x<=450&&from.x>=440,"stops at the wall");assert.ok(graveir.effects.some(effect=>effect.statuses.has("stunned")));
  const ox=await env.card(graveir,{weaponAttack:{target:to.uuid,attacker:from.uuid,count:1,creatureAction:{id:"charge",pushMeters:3}}});
  assert.equal(await onCreatureChargeMissed(ox,0,{hit:false,mode:"block"}),false,"other chargers keep the core rules");
});

test("graveir throw collisions deal Xd6 for half the metres flown, without a mass factor",async()=>{
  const env=setup(),victim=env.actor("Волк"),to=env.token(victim,100),before=victim.system.health.value;
  const card=await env.card(victim,{creatureCollision:{target:to.uuid,max:5,applied:false,formula:"half"}});
  env.totals.push(7);await applyCreatureCollision(card,{meters:5});
  assert.deepEqual(env.rolls,["2d6"]);assert.equal(victim.system.health.value,before-7);
  const short=await env.card(victim,{creatureCollision:{target:to.uuid,max:5,applied:false,formula:"half"}});
  await applyCreatureCollision(short,{meters:1});assert.equal(env.rolls.length,1);assert.equal(victim.system.health.value,before-7);
});

test("a rotfiend starts to decay at 5 HP or less after non-fire damage, never from fire or above 5 HP",async()=>{
  const env=setup(),rotfiend=env.actor("Гнилец");env.token(rotfiend);
  await applyCreatureDamage(rotfiend,{total:10,ablate:[]},"hit-1");assert.equal(rotfiendDecay(rotfiend),null,"15 HP left");
  rotfiend.system.health.value=4;await onCreatureDamaged(rotfiend,3,{fire:true});assert.equal(rotfiendDecay(rotfiend),null,"fire kills it cleanly");
  await applyCreatureDamage(rotfiend,{total:11,ablate:[]},"hit-2");await onCreatureDamaged(rotfiend,1);
  assert.equal(rotfiend.effects.filter(effect=>effect.flags[SYSTEM_ID]?.rotfiendDecay).length,1);
  const wolf=env.actor("Волк");wolf.system.health.value=3;await onCreatureDamaged(wolf,5);assert.equal(rotfiendDecay(wolf),null);
  const manual=env.actor("Гнилец");assert.equal(await startRotfiendDecay(manual),false);assert.equal(await startRotfiendDecay(manual,{force:true}),true);
});

test("the blast comes at the rotfiend's next turn start, or once the order has passed a skipped dead rotfiend",()=>{
  const a={id:"a"},b={id:"b"},c={id:"c"},combat={id:"combat",round:1,turn:1,turns:[a,b,c]},state={combatId:"combat",round:1,turn:1};
  assert.equal(rotfiendDue(combat,a,state,c),false,"its slot comes next round");
  assert.equal(rotfiendDue(combat,a,state,a),true,"its own turn start");
  Object.assign(combat,{round:2,turn:1});assert.equal(rotfiendDue(combat,a,state,b),true,"slot 0 of round 2 was skipped");
  Object.assign(combat,{round:1,turn:2});assert.equal(rotfiendDue(combat,c,{...state,turn:0},b),false);
  assert.equal(rotfiendDue(combat,c,{...state,combatId:"other"},b),false);
});

test("the burst destroys the rotfiend, hits everyone in melee range per body part, stinks and may nauseate",async()=>{
  const env=setup(),rotfiend=env.actor("Гнилец"),wolf=env.actor("Волк"),other=env.actor("Гнилец"),far=env.actor("Грифон");
  const from=env.token(rotfiend),to=env.token(wolf,100),next=env.token(other,0,100);env.token(far,2000);
  rotfiend.system.health.value=3;await startRotfiendDecay(rotfiend);other.system.health.value=6;
  const combat=env.combat();combat.turns=combat.combatants;
  await Promise.all([rotfiendTurn(combat,combat.combatants[0],{round:1}),explodeRotfiend(rotfiend)]);
  const card=env.messages.find(message=>message.flags[SYSTEM_ID]?.creatureArea?.id==="rotfiend-blast");
  assert.deepEqual(card.flags[SYSTEM_ID].creatureArea.targets.map(row=>row.name),["Волк","Гнилец"]);
  assert.equal(rotfiend.system.health.value,0);assert.ok(rotfiend.effects.some(effect=>effect.statuses.has("dead")));
  assert.equal(rotfiendDecay(rotfiend),null);assert.equal(await explodeRotfiend(rotfiend),null,"bursts once");
  const before=wolf.system.health.value,parts=burningParts(wolf).length;
  env.totals.push(...Array(parts).fill(4),13);await resolveCreatureArea(card,0,{mode:"none"});
  assert.equal(env.rolls.filter(formula=>formula==="2d6").length,parts);
  const hit=card.flags[SYSTEM_ID].creatureArea.targets[0].result;
  assert.equal(wolf.system.health.value,before-hit.damage.total);assert.ok(hit.damage.total>0);
  assert.ok(wolf.effects.some(effect=>effect.flags[SYSTEM_ID]?.rotfiendSmell));assert.ok(wolf.effects.some(effect=>effect.statuses.has("nauseated")));
  await resolveCreatureArea(card,0,{mode:"none"});assert.equal(wolf.system.health.value,before-hit.damage.total);
  await assert.rejects(resolveCreatureArea(card,1,{mode:"dodge"}),/Смена позиции/);
  env.totals.push(...Array(burningParts(other).length).fill(6),14);await resolveCreatureArea(card,1,{mode:"none"});
  assert.equal(other.effects.some(effect=>effect.statuses.has("nauseated")),false,"Endurance 14 holds it down");
  assert.ok(rotfiendDecay(other),"a rotfiend left at 5 HP or less bursts in turn");
});

/** Regions for the fog tests: the shared mock scene only creates tokens. */
function withRegions(env) {
  const scene=env.scene,tokens=scene.createEmbeddedDocuments.bind(scene);let serial=0;
  scene.regions=Object.assign([],{get(id){return this.find(row=>row.id===id);}});
  const region=source=>{const row={...structuredClone(source),id:`region${++serial}`,uuid:`Scene.scene.Region.${serial}`,parent:scene,
    async update(data){if(data.shapes)this.shapes=data.shapes;return this;},async delete(){scene.regions.splice(scene.regions.indexOf(this),1);}};scene.regions.push(row);return row;};
  scene.createEmbeddedDocuments=async(type,data)=>type==="Region"?data.map(region):tokens(type,data);
  scene.deleteEmbeddedDocuments=(original=>async(type,ids)=>{if(type!=="Region")return original.call(scene,type,ids);for(const id of ids)await scene.regions.get(id)?.delete();})(scene.deleteEmbeddedDocuments);
  return region;
}

test("the foglet's fog limits everyone else's sight to 4 m, moves 10 m and cannot be raised in dimeritium",async()=>{
  const env=setup(),region=withRegions(env),foglet=env.actor("Туманник"),wolf=env.actor("Волк"),from=env.token(foglet),inside=env.token(wolf,600),outside=env.token(env.actor("Волк"),5000);env.combat();
  await useCreatureAction(foglet,"fog",{sourceToken:from});
  const [fog]=fogRegions(env.scene);assert.equal(fog.shapes[0].radiusX,1500);assert.deepEqual([fog.shapes[0].x,fog.shapes[0].y],[50,50]);
  assert.deepEqual([fogSightLimit(inside),fogSightLimit(from),fogSightLimit(outside)],[4,null,null]);
  globalThis.PIXI={Circle:class{constructor(x,y,radius){Object.assign(this,{x,y,radius});}}};
  const circle=constrainHypnotizedVision({data:{x:650,y:50},object:inside},{applyConstraint:shape=>shape},{isGM:false});
  assert.equal(circle.radius,250,"4 m from the edge of a 2 m token");
  delete globalThis.PIXI;
  foglet.system.combatAction.extra=false;game.combat.round=2;
  await assert.rejects(useCreatureAction(foglet,"fog-move",{sourceToken:from,destination:{x:650,y:50}}),/не дальше чем на 10 м/);
  await useCreatureAction(foglet,"fog-move",{sourceToken:from,destination:{x:550,y:50}});assert.equal(fogRegions(env.scene)[0].shapes[0].x,550);
  region({shapes:[{type:"ellipse",x:50,y:50,radiusX:300,radiusY:300}],flags:{[SYSTEM_ID]:{creatureZone:{kind:"dimeritium",endTime:1e9}}}});
  foglet.getActiveTokens=()=>[from];game.combat.round=3;await assert.rejects(useCreatureAction(foglet,"fog",{sourceToken:from}),/Двимеритовая бомба/);
  assert.equal(fogRegions(env.scene).length,1,"dimeritium does not disperse the fog");
});

test("the foglet vanishes only in fog, is revealed by its attack until its next turn and by leaving the fog",async()=>{
  const env=setup(),foglet=env.actor("Туманник"),from=env.token(foglet);withRegions(env);
  const combat=env.combat();
  await assert.rejects(useCreatureAction(foglet,"fog-invisible",{sourceToken:from}),/только в тумане/);
  await useCreatureAction(foglet,"fog",{sourceToken:from});combat.round=2;
  await useCreatureAction(foglet,"fog-invisible",{sourceToken:from});assert.equal(foglet.system.creature.invisible,true);
  await afterCreatureAttack(foglet);assert.equal(foglet.system.creature.invisible,false);
  combat.round=3;combat.combatant=null;await assert.rejects(useCreatureAction(foglet,"fog-invisible",{sourceToken:from}),/до своего следующего хода/);
  combat.combatant=combat.combatants[0];await useCreatureAction(foglet,"fog-invisible",{sourceToken:from});assert.equal(foglet.system.creature.invisible,true);
  from.x=5000;await revealFogletIfExposed(foglet);assert.equal(foglet.system.creature.invisible,false);
});

test("four illusory copies appear only in the fog, look like the foglet, may act and vanish with it",async()=>{
  const env=setup(),foglet=env.actor("Туманник"),from=env.token(foglet);withRegions(env);const combat=env.combat();
  await useCreatureAction(foglet,"fog",{sourceToken:from});combat.round=2;
  await assert.rejects(useCreatureAction(foglet,"fog-copies",{sourceToken:from,positions:[{x:150,y:50},{x:250,y:50},{x:350,y:50},{x:9000,y:50}]}),/в тумане/);
  combat.round=3;await useCreatureAction(foglet,"fog-copies",{sourceToken:from,positions:[{x:150,y:50},{x:250,y:50},{x:350,y:50},{x:450,y:50}]});
  const copies=env.scene.tokens.filter(token=>token.flags[SYSTEM_ID]?.noonCopy);
  assert.equal(copies.length,4);assert.ok(copies.every(token=>token.name===from.name&&token.actor.name===foglet.name));
  assert.equal(copies[0].actor.flags[SYSTEM_ID].noonCopy.kind,"fog");
  copies[0].actor.system.combatAction={extra:false,lastExtraRound:""};assert.doesNotThrow(()=>actionQuote(copies[0].actor),"copies act at the foglet's turn");
  const before=foglet.system.health.value;await tickNoonDance(combat,combat.combatants[0],{round:3});assert.equal(foglet.system.health.value,before,"fog copies drain nothing");
  await destroyNoonCopy(copies[0]);assert.equal(env.scene.tokens.filter(token=>token.flags[SYSTEM_ID]?.noonCopy).length,3);
  await dismissFoglet(foglet);
  assert.equal(env.scene.tokens.filter(token=>token.flags[SYSTEM_ID]?.noonCopy).length,0);assert.equal(fogRegions(env.scene).length,0);
});

test("a mage disperses the fog with 5 STA, an action and Spell Casting DC 18",async()=>{
  const env=setup(),foglet=env.actor("Туманник"),mage=env.actor("Маг"),wolf=env.actor("Волк"),from=env.token(foglet),caster=env.token(mage,100),beast=env.token(wolf,200);withRegions(env);
  await useCreatureAction(foglet,"fog",{sourceToken:from});
  assert.throws(()=>dispelFog(foglet,{sourceToken:from,targets:[beast]}),/маг или жрец/);
  const stamina=mage.system.stamina.value;env.totals.push(17);
  await dispelFog(foglet,{sourceToken:from,targets:[caster]});assert.equal(fogRegions(env.scene).length,1);assert.equal(mage.system.stamina.value,stamina-5);
  env.totals.push(18);await dispelFog(foglet,{sourceToken:from,targets:[caster]});assert.equal(fogRegions(env.scene).length,0);
});

test("the hym whispers, sends hallucinations and nightmares to one victim within 10 m",async()=>{
  const env=setup(),hym=env.actor("Хим"),wolf=env.actor("Волк"),from=env.token(hym),near=env.token(wolf,500),far=env.token(env.actor("Волк"),1000);const combat=env.combat();
  await assert.rejects(useCreatureAction(hym,"hym-whisper",{sourceToken:from,targets:[far]}),/не дальше 10 м/);
  env.totals.push(20,10,4);const whisper=await useCreatureAction(hym,"hym-whisper",{sourceToken:from,targets:[near]});
  assert.match(whisper.content,/уединение на 4 ч/u);
  combat.round=2;env.totals.push(9,10);await useCreatureAction(hym,"hym-hallucination",{sourceToken:from,targets:[near]});
  assert.equal(wolf.effects.length,0,"a tie or loss leaves the victim calm");
  combat.round=3;env.totals.push(18,10);await useCreatureAction(hym,"hym-hallucination",{sourceToken:from,targets:[near]});
  assert.deepEqual(wolf.effects[0].flags[SYSTEM_ID].condition.modifiers,[{target:"skills.resistCoercion",value:-3}]);
  combat.round=4;const max=wolf.system.statistics.staminaMax;await useCreatureAction(hym,"hym-nightmare",{sourceToken:from,targets:[near]});
  const nightmare=wolf.effects.find(effect=>effect.flags[SYSTEM_ID].hymNightmare);
  assert.deepEqual(nightmare.flags[SYSTEM_ID].condition.modifiers,[{target:"staminaMax",value:Math.max(5,Math.floor(max/2))-max}]);
  assert.ok(hym.effects.some(effect=>effect.flags[SYSTEM_ID].creatureFullTurn),"nightmares take the full turn");
});

test("the hym steps from shadow to shadow and a fire attack lights it up for the round",async()=>{
  const env=setup(),hym=env.actor("Хим"),wolf=env.actor("Волк"),from=env.token(hym),to=env.token(wolf,300);env.combat();
  assert.ok(creatureActions(hym).find(action=>action.id==="shadow-step").disabled,"daylight scene");
  hym.system.creature.shadowMode="active";
  await useCreatureAction(hym,"shadow-step",{sourceToken:from,destination:{x:550,y:50}});assert.equal(from.x,500);
  assert.equal(hymShadow(hym),true);
  const card=await env.card(wolf,{weaponAttack:{target:from.uuid,traits:{types:["elemental"]},hitTraits:{}}});
  assert.equal(await igniteHym(card),true);assert.equal(hymShadow(hym),false);
  const steel=await env.card(wolf,{weaponAttack:{target:from.uuid,traits:{types:["slashing"]},hitTraits:{}}});
  assert.equal(await igniteHym(steel),false);
});

test("the pesta's flies hinder and infect neighbours at their turn start until fire or wind scatters them",async()=>{
  const env=setup(),pesta=env.actor("Песта"),wolf=env.actor("Волк"),far=env.actor("Волк"),from=env.token(pesta),near=env.token(wolf,100);env.token(far,2000);
  const combat=env.combat(),[,neighbour,distant]=combat.combatants;neighbour.token=near;
  env.totals.push(20);await pestaFliesTurn(combat,neighbour,{round:1});await pestaFliesTurn(combat,neighbour,{round:1});
  assert.equal(wolf.effects.filter(effect=>effect.flags[SYSTEM_ID]?.pestaFlies).length,1);
  assert.ok(wolf.effects.some(effect=>effect.statuses.has("diseased")),"20 ≤ 25%");
  await pestaFliesTurn(combat,distant,{round:1});assert.equal(far.effects.length,0);
  assert.equal(await onPestaStruck({target:from.uuid,traits:{types:["slashing"]}}),false);
  assert.equal(await onPestaStruck({target:from.uuid,traits:{types:["elemental"]}}),true);
  wolf.effects.length=0;combat.round=2;await pestaFliesTurn(combat,neighbour,{round:2});assert.equal(wolf.effects.length,0,"no flies, no penalty");
  await useCreatureAction(pesta,"pesta-flies",{sourceToken:from});
  assert.equal(pesta.flags[SYSTEM_ID].pestaFliesGone,false);
});

test("the pesta calls two rat swarms beside her; a swarm bite hits every body part and may infect",async()=>{
  const env=setup(),pesta=env.actor("Песта"),from=env.token(pesta);env.combat();
  await assert.rejects(useCreatureAction(pesta,"pesta-rats",{sourceToken:from,positions:[{x:150,y:50},{x:1050,y:50}]}),/Расстояние/);
  env.combat().round=2;
  await useCreatureAction(pesta,"pesta-rats",{sourceToken:from,positions:[{x:150,y:50},{x:50,y:150}]});
  const swarms=env.scene.tokens.filter(token=>token.flags[SYSTEM_ID]?.pestaRats);assert.equal(swarms.length,2);
  const rats=env.actor("Стая чумных крыс"),wolf=env.actor("Волк"),bite=env.token(rats,3000),victim=env.token(wolf,3100);
  env.totals.push(10);const attack=(await useCreatureAction(rats,"swarm",{sourceToken:bite,targets:[victim]})).flags[SYSTEM_ID].weaponAttack;
  assert.deepEqual([attack.base,attack.special,attack.defenses],[14,"creature:swarm",["dodge","reposition"]]);
  const card=await env.card(rats,{weaponAttack:{name:"Атака стаи",special:"creature:swarm",attacker:bite.uuid,target:victim.uuid}}),before=wolf.system.health.value;
  const parts=(await import("../scripts/combat/burning.mjs")).burningParts(wolf).length;
  env.totals.push(...Array(parts).fill(5),40);await applyCreatureSpecial(card,0,{hit:true});await applyCreatureSpecial(card,0,{hit:true});
  assert.ok(wolf.system.health.value<before);assert.equal(wolf.effects.filter(effect=>effect.statuses.has("diseased")).length,1);
});
