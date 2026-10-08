import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { CONDITION_BY_ID, conditionSource } from "../scripts/data/condition-definitions.mjs";
import { effectCounter, changeEffectCounter, statusEffect } from "../scripts/data/effect-counters.mjs";
import { ACTIVE_DODGE, AIMING, aimingBonus, fullTurnStart } from "../scripts/combat/full-turn-rules.mjs";
import { fullTurnContext, performFullTurnAction } from "../scripts/combat/full-turn-actions.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { rollWeaponAttack } from "../scripts/combat/weapon-rolls.mjs";
import { defenseQuote, rollDefense } from "../scripts/combat/defense-rolls.mjs";
import { recoverStamina } from "../scripts/combat/exhaustion.mjs";

function patch(target, changes) {
  for (const [path,value] of Object.entries(changes)) {
    const keys=path.split(".");let owner=target;
    for(const key of keys.slice(0,-1))owner=owner[key]??=( {} );
    owner[keys.at(-1)]=structuredClone(value);
  }
}
function fixture() {
  const effects=[];effects.get=id=>effects.find(effect=>effect.id===id);
  const items=[{id:"bow",name:"Bow",type:"weapon",system:{quantity:1,hands:2,grip:2,equipped:true,carried:true,category:"ranged",skill:"archery",damage:"3d6",accuracy:0,reliability:{value:10,max:10}}}];
  items.get=id=>items.find(item=>item.id===id);
  items.push({id:"arrows",name:"Стрелы",type:"equipment",system:{kind:"ammunition",quantity:10,carried:true,damageType:"К"}});
  const actor={uuid:"Actor.archer",documentName:"Actor",isOwner:true,type:"character",effects,items,
    system:{attributes:{},skills:{archery:5,dodgeEscape:4,swordsmanship:3},abilityState:{},combatAction:{extra:false},stamina:{value:20,max:40},
      statistics:{effective:{reflex:8,dexterity:7,body:8,speed:6},modifiers:[],recovery:8,run:18}},
    async update(changes){const {items:updates,...rest}=changes;for(const update of updates??[]){const {_id,...data}=update;patch(items.get(_id),data);}patch(this,rest);},
    async createEmbeddedDocuments(type,sources){assert.equal(type,"ActiveEffect");return sources.map(source=>addEffect(source));}};
  let sequence=0,accepted=true;const messages=[];
  function addEffect(source) {
    const effect={...structuredClone(source),id:`effect${++sequence}`,parent:actor,statuses:new Set(source.statuses),
      async update(changes){patch(this,changes);},async delete(){effects.splice(effects.indexOf(this),1);}};
    effects.push(effect);return effect;
  }
  globalThis.game={settings:{get:()=>"public"},i18n:{localize:key=>key},time:{worldTime:12}};
  globalThis.ui={notifications:{warn:message=>{throw new Error(message);}}};
  globalThis.foundry={documents:{ActiveEffect:{getEffectStart:()=>({time:game.time.worldTime,combat:game.combat?.id??null,round:game.combat?.round??null,turn:game.combat?.turn??null,combatant:game.combat?.combatant?.id??null})},
    ChatMessage:{getSpeaker:()=>({actor:"archer"}),applyMode:data=>data,async create(data){messages.push(data);return accepted?data:null;}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){return this;}async toMessage(data){return foundry.documents.ChatMessage.create(data);}}}};
  const combatant={id:"archer",actor,initiative:9},other={id:"other",actor:{uuid:"Actor.other"},initiative:20};
  const combat={id:"combat",started:true,round:1,turn:0,combatant:other,combatants:[other,combatant],turns:[other,combatant]};
  return {actor,effects,messages,combat,setAccepted:value=>{accepted=value;},add:status=>addEffect(conditionSource(CONDITION_BY_ID[status]))};
}

test("Aim creates one counter, coalesces clicks and increases at most once per combat round up to three",async()=>{
  const f=fixture();game.combat=f.combat;
  const first=performFullTurnAction(f.actor,AIMING);assert.equal(first,performFullTurnAction(f.actor,AIMING));await first;
  assert.equal(f.effects.length,1);assert.equal(aimingBonus(f.actor),1);assert.equal(fullTurnContext(f.actor).aimUsed,true);
  await performFullTurnAction(f.actor,AIMING);assert.equal(aimingBonus(f.actor),1);
  for(let round=2;round<=4;round++) {game.combat.round=round;await performFullTurnAction(f.actor,AIMING);assert.equal(aimingBonus(f.actor),Math.min(3,round));}
  assert.equal(f.effects.length,1);assert.equal(f.effects[0].start.round,4);
  assert.equal(f.effects[0].start.combatant,"archer");assert.equal(f.effects[0].start.turn,1,"Off-turn GM activation expires on the affected actor's turn");
  assert.deepEqual(f.effects[0].duration,{value:1,units:"rounds",expiry:"turnEnd",expired:false});
  assert.equal(f.actor.system.stamina.value,20);
  await performFullTurnAction(f.actor,"clear-aiming");assert.equal(f.effects.length,0);
});

test("counter edits clamp, preserve state and duration, and remove the effect at zero",async()=>{
  const f=fixture(),effect=f.add(AIMING);
  effect.flags[SYSTEM_ID].conditionState={counter:2,lastAimRound:"combat:1"};
  const duration=structuredClone(effect.duration);
  await Promise.all([changeEffectCounter(f.actor,effect.id,1),changeEffectCounter(f.actor,effect.id,1)]);
  assert.deepEqual(effectCounter(effect),{value:3,max:3});assert.equal(effect.flags[SYSTEM_ID].conditionState.lastAimRound,"combat:1");assert.deepEqual(effect.duration,duration);
  f.actor.isOwner=false;await changeEffectCounter(f.actor,effect.id,-1);assert.equal(effectCounter(effect).value,3);
  f.actor.isOwner=true;
  for(let i=0;i<3;i++)await changeEffectCounter(f.actor,effect.id,-1);
  assert.equal(f.effects.length,0);
});

test("active dodge prevents repeat-defense STA costs in the domain, without adding to the defense roll",async()=>{
  const f=fixture();game.combat=f.combat;
  f.actor.system.combatAction.extra=true;
  assert.equal(defenseQuote(f.actor,{repeat:true}).cost,1);
  const pending=performFullTurnAction(f.actor,ACTIVE_DODGE);assert.equal(pending,performFullTurnAction(f.actor,ACTIVE_DODGE));await pending;
  const effect=statusEffect(f.actor,ACTIVE_DODGE);
  assert.equal(effect.duration.expiry,"roundStart");assert.equal(effect.duration.value,1);
  const quote=defenseQuote(f.actor,{repeat:true});assert.equal(quote.cost,0);assert.equal(quote.total,12);assert.match(quote.note,/−2/);
  await rollDefense(f.actor,{repeat:true});assert.equal(f.actor.system.stamina.value,20);assert.equal(f.actor.system.combatAction.extra,true);
  effect.duration.expired=true;assert.equal(defenseQuote(f.actor,{repeat:true}).cost,1);assert.equal(fullTurnContext(f.actor).activeDodge,false);
  effect.duration.expired=false;await performFullTurnAction(f.actor,ACTIVE_DODGE);assert.equal(f.effects.length,0);
});

test("ranged attacks add Aim separately from grip, strong-strike and extra-action penalties",()=>{
  const f=fixture(),effect=f.add(AIMING),bow=f.actor.items[0];
  effect.flags[SYSTEM_ID].conditionState={counter:3};bow.system.grip=1;
  assert.equal(weaponAttack(f.actor,bow).total,12); // 7 DEX + 5 skill − 3 grip + 3 Aim
  assert.equal(weaponAttack(f.actor,bow,{mode:"strong",extraPenalty:-3}).total,6);
  assert.equal(weaponAttack(f.actor,bow).blocked,"");
  bow.system.category="melee";bow.system.skill="swordsmanship";assert.equal(weaponAttack(f.actor,bow).total,8);
  bow.system.category="ranged";bow.system.skill="archery";
  effect.disabled=true;assert.equal(weaponAttack(f.actor,bow).total,9);
  effect.disabled=false;effect.isSuppressed=true;assert.equal(weaponAttack(f.actor,bow).total,9);
  effect.isSuppressed=false;effect.duration.expired=true;assert.equal(weaponAttack(f.actor,bow).total,9);
});

test("Aim survives canceled attacks, is recorded in the posted math and is consumed once after success",async()=>{
  const f=fixture(),effect=f.add(AIMING);effect.flags[SYSTEM_ID].conditionState={counter:2};
  f.setAccepted(false);await rollWeaponAttack(f.actor,"bow");assert.equal(aimingBonus(f.actor),2);
  assert.equal(f.actor.items.get("arrows").system.quantity,10);
  f.setAccepted(true);
  const create=foundry.documents.ChatMessage.create;
  foundry.documents.ChatMessage.create=async data=>{assert.equal(aimingBonus(f.actor),2,"Effect remains until the result exists");return create(data);};
  const first=rollWeaponAttack(f.actor,"bow");assert.equal(first,rollWeaponAttack(f.actor,"bow"));await first;
  assert.equal(aimingBonus(f.actor),0);assert.equal(f.messages.at(-1).rolls[0].formula,"1d10wc + 14");assert.match(f.messages.at(-1).flavor,/Прицеливание: \+2/);
  assert.equal(f.messages.at(-1).flags[SYSTEM_ID].weaponAttack.base,14);
  assert.equal(f.actor.items.get("arrows").system.quantity,9);
});

test("Recovery cancels Aim, respects the STA cap and remains allowed during exhaustion",async()=>{
  const f=fixture();f.add(AIMING);f.actor.system.stamina.value=38;
  const first=recoverStamina(f.actor);assert.equal(first,recoverStamina(f.actor));await first;
  assert.equal(f.actor.system.stamina.value,40);assert.equal(aimingBonus(f.actor),0);
  f.add("exhausted-stun");f.add("unconscious");f.actor.system.stamina.value=0;
  assert.equal(fullTurnContext(f.actor).canRecover,true);await recoverStamina(f.actor);assert.equal(f.actor.system.stamina.value,8);
});

test("full-turn activations require ownership and ability to act, but states can still be cleared",async()=>{
  const f=fixture();f.actor.isOwner=false;await performFullTurnAction(f.actor,AIMING);assert.equal(f.effects.length,0);
  f.actor.isOwner=true;f.add("stunned");await assert.rejects(performFullTurnAction(f.actor,AIMING),/не может/);
  f.add(ACTIVE_DODGE);assert.equal(fullTurnContext(f.actor).canToggleDodge,true);
  await performFullTurnAction(f.actor,ACTIVE_DODGE);assert.equal(statusEffect(f.actor,ACTIVE_DODGE),undefined);
  assert.equal(fullTurnContext(f.actor).canToggleDodge,false);
  assert.equal(fullTurnStart(f.actor).time,12);
});
