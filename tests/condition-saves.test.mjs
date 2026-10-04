import {test} from "node:test";
import assert from "node:assert/strict";
import {SYSTEM_ID} from "../scripts/config.mjs";
import {conditionSource,EFFECT_TEMPLATES,effectRules} from "../scripts/data/condition-definitions.mjs";
import {performEffectSave,endTurnConditions,canSaveEffect,registerConditionSaves,requestEffectSave} from "../scripts/combat/condition-saves.mjs";
import {deriveStatistics,ATTRIBUTE_KEYS} from "../scripts/data/statistics.mjs";
import {ALCHEMY} from "../scripts/data/workshop-alchemy.mjs";
import {alchemyDescriptionUpdate} from "../scripts/migrations/alchemy-descriptions.mjs";

function patch(object,changes){for(const [path,value]of Object.entries(changes)){const keys=path.split("."),key=keys.pop();let cursor=object;for(const part of keys)cursor=cursor[part]??={};cursor[key]=value;}}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(key="black-venom",total=4){
  delete globalThis.Hooks;
  const messages=[],updates=[];
  const gm={id:"gm",active:true,isGM:true},player={id:"p",active:true,isGM:false};
  globalThis.game={user:gm,users:Object.assign([gm,player],{activeGM:gm}),time:{worldTime:0},settings:{get:()=>"public"},i18n:{localize:key=>key}};
  globalThis.ui={notifications:{warn(){},error(){},info(){}},chat:{rendered:false}};
  globalThis.foundry={utils:{randomID:()=>"random"},documents:{ChatMessage:{getSpeaker:()=>({actor:"a"})}},dice:{Roll:class{
    constructor(formula){this.formula=formula;}
    async evaluate(){this.total=total;return this;}
    async toMessage(data,options){const message={id:`m${messages.length}`,rolls:[{total:this.total}],...data,options,async update(changes){patch(this,changes);}};messages.push(message);return message;}
  }}};
  const actor={uuid:"Actor.test",documentName:"Actor",isOwner:true,flags:{},effects:[],
    system:{skills:{endurance:4,physique:4,firstAid:3,deduction:2},stamina:{value:20,max:50},statistics:{stun:10,effective:{body:6,craft:5,intelligence:5},modifiers:[]}},
    testUserPermission:()=>true,async update(changes){patch(this,changes);},async createEmbeddedDocuments(_type,entries){updates.push(...entries);return entries;},
    async deleteEmbeddedDocuments(_type,ids){this.effects=this.effects.filter(effect=>!ids.includes(effect.id));}};
  const effect={...conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key===key)),id:"ef",uuid:"Actor.test.ActiveEffect.ef",parent:actor,
    async update(changes){patch(this,changes);},async delete(){updates.push("deleted");actor.effects=actor.effects.filter(entry=>entry.id!==this.id);}};
  effect.statuses=new Set(effect.statuses);actor.effects=[effect];
  const combatant={id:"c",actor},combat={uuid:"Combat.test",started:true,round:1,turn:1,combatants:[combatant]};game.combat=combat;
  return{actor,effect,messages,updates,combat,combatant,gm,player};
}

test("manual and end-turn saves share a persisted turn marker, survive reopening and respect privacy",async()=>{
  const f=fixture();
  const turn="Combat.test:1:c";
  await performEffectSave(f.actor,f.effect,{turn,messageMode:"blind"});
  assert.equal(f.messages.length,1);assert.equal(f.messages[0].options.messageMode,"blind");
  assert.equal(f.messages[0].flags[SYSTEM_ID].skipLuck,false);
  assert.match(f.messages[0].flavor,/Неудача/);assert.equal(f.actor.effects.length,1);
  f.effect.flags=JSON.parse(JSON.stringify(f.effect.flags));
  await endTurnConditions(f.combat,f.combatant,{round:1,turn:0,skipped:false});
  assert.equal(f.messages.length,1);
  f.combat.round=2;
  await endTurnConditions(f.combat,f.combatant,{round:2,turn:0,skipped:false});
  assert.equal(f.messages.length,2);assert.equal(f.messages[1].flags[SYSTEM_ID].skipLuck,true);
  await endTurnConditions(f.combat,f.combatant,{round:2,turn:0,skipped:false});assert.equal(f.messages.length,2);
});
test("end-turn checks ignore reordering/skipped turns, honor the toggle and never add a death save",async()=>{
  const f=fixture();
  await endTurnConditions(f.combat,f.combatant,{round:1,turn:1,skipped:false});
  await endTurnConditions(f.combat,f.combatant,{round:1,turn:0,skipped:true});
  f.effect.flags[SYSTEM_ID].condition.autoSave=false;
  await endTurnConditions(f.combat,f.combatant,{round:1,turn:0,skipped:false});assert.equal(f.messages.length,0);
  const dying=fixture("dying");dying.effect.flags[SYSTEM_ID].condition.autoSave=true;
  await endTurnConditions(dying.combat,dying.combatant,{round:1,turn:0,skipped:false});assert.equal(dying.messages.length,0);
});
test("chloroform is a plain strict-less-than d10 save without Luck; unrelated unconsciousness remains",async()=>{
  let f=fixture("chloroform",8);
  await performEffectSave(f.actor,f.effect);assert.equal(f.actor.effects.length,1);
  f=fixture("chloroform",7);f.actor.effects.push({id:"other",statuses:new Set(["unconscious"])});
  await performEffectSave(f.actor,f.effect);
  assert.deepEqual(f.actor.effects.map(effect=>effect.id),["other"]);
  assert.equal(f.messages[0].flags[SYSTEM_ID].skipLuck,true);assert.equal(f.messages[0].flags[SYSTEM_ID].conditionSave.target,8);
});
test("exhaustion, glue and unconscious fisstech gate saves instead of granting premature recovery",()=>{
  let f=fixture("exhausted-stun");f.actor.system.stamina.value=19;assert.equal(canSaveEffect(f.actor,f.effect),false);
  f.actor.system.stamina.value=20;assert.equal(canSaveEffect(f.actor,f.effect),true);
  f=fixture("adhesive");assert.equal(canSaveEffect(f.actor,f.effect),false);
  game.time.worldTime=6;assert.equal(canSaveEffect(f.actor,f.effect),true);
  f=fixture("fisstech");f.actor.effects.push({id:"sleep",statuses:new Set(["fisstech-unconscious"])});
  assert.equal(canSaveEffect(f.actor,f.effect),false);
});
test("illusion recognition preserves the condition; low fisstech roll causes a separate five-round blackout",async()=>{
  let f=fixture("hallucinogen",20);await performEffectSave(f.actor,f.effect);assert.equal(f.actor.effects.length,1);
  assert.match(f.messages[0].flavor,/эффект остаётся/);
  f=fixture("fisstech",9);await performEffectSave(f.actor,f.effect);
  assert.equal(f.updates[0].flags[SYSTEM_ID].condition.rounds,5);assert.deepEqual(f.updates[0].statuses,["fisstech-unconscious"]);
});
test("effect modifiers derive without editing base values or stacking after repeated preparation",()=>{
  const f=fixture("frozen");
  const system={attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,8])),health:{value:40,max:40}};
  const stats=deriveStatistics(system,{effects:[f.effect]});assert.equal(stats.effective.speed,5);assert.equal(stats.effective.reflex,7);
  assert.deepEqual(deriveStatistics(system,{effects:[f.effect]}),stats);assert.equal(system.attributes.speed,8);
  f.effect.disabled=true;assert.equal(deriveStatistics(system,{effects:[f.effect]}).effective.speed,8);
});

test("native effect creation deduplicates all poisons and resets per-turn state when applying to a new actor",async()=>{
  const f=fixture("black-venom");
  foundry.documents.ActiveEffect=class{static getEffectStart(){return {time:12};}async _preCreate(){} updateSource(data){patch(this,data);}};
  const {WitcherActiveEffect}=await import("../scripts/documents/witcher-active-effect.mjs");
  const incoming=Object.assign(new WitcherActiveEffect(),conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="poisoned")),{parent:f.actor,statuses:new Set(["poisoned"])});
  assert.equal(await incoming._preCreate({}, {}, {}),false,"Other poison variants cannot add a second poisoning instance");
  f.actor.effects=[];
  incoming.flags[SYSTEM_ID].conditionState={lastSaveTurn:"old combat"};incoming.flags[SYSTEM_ID].conditionRequest={id:"old request"};
  await incoming._preCreate({}, {}, {});
  assert.deepEqual(incoming.flags[SYSTEM_ID].conditionState,{});assert.equal(incoming.flags[SYSTEM_ID].conditionRequest,null);
  assert.equal(effectRules(incoming).save.dc,15);
  assert.deepEqual(incoming.start,{time:12},"A newly dropped effect starts now, even when copied from another actor");
  const timed=Object.assign(new WitcherActiveEffect(),conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="clotting")),{parent:f.actor,statuses:new Set(["clotting"])});
  await timed._preCreate({}, {}, {});
  assert.deepEqual(timed.duration,{value:4,units:"rounds",expiry:"turnEnd",expired:false});
  assert.equal(f.messages[0].flags[SYSTEM_ID].skipLuck,true);
});
test("alchemy gains real descriptions and resolvable effect links, while migration preserves player notes",()=>{
  for(const entry of ALCHEMY){assert.match(entry.system.description,/<h3>Действие состава/);for(const [,id]of entry.system.description.matchAll(/ActiveEffect\.([^\]]+)/g))assert(EFFECT_TEMPLATES.some(effect=>effect.documentId===id));}
  const source=ALCHEMY.find(entry=>entry.id==="alchemy.acid");
  assert.equal(alchemyDescriptionUpdate({system:{ruleId:source.id,description:`<p>${source.system.source}</p>`}})["system.description"],source.system.description);
  assert.deepEqual(alchemyDescriptionUpdate({system:{ruleId:source.id,description:"Мои записки"}}),{});
});
test("only the active GM handles a player's native effect request, and duplicate notifications roll once",async()=>{
  const f=fixture();let hook,ready;
  globalThis.Hooks={on:(_name,callback)=>{hook=callback;},once:(_name,callback)=>{ready=callback;}};registerConditionSaves();delete globalThis.Hooks;
  const changes={flags:{[SYSTEM_ID]:{conditionRequest:{id:"request",turn:"Combat.test:1:c"}}}};
  game.user=f.player;hook(f.effect,changes);await tick();assert.equal(f.messages.length,0);
  game.user=f.gm;hook(f.effect,changes);hook(f.effect,changes);await tick();await tick();
  assert.equal(f.messages.length,1);assert.equal(f.effect.flags[SYSTEM_ID].conditionRequest,null);
  f.effect.flags[SYSTEM_ID].conditionRequest={id:"reloaded",turn:"Combat.test:1:c"};
  game.actors=[f.actor];game.scenes=[];ready();await tick();await tick();
  assert.equal(f.messages.length,1,"Reload clears a stale request without repeating this turn's save");
  assert.equal(f.effect.flags[SYSTEM_ID].conditionRequest,null);
});
test("a successful save leaves the effect until both chat and Dice So Nice finish",async()=>{
  const f=fixture("black-venom",20),callbacks=new Map();
  globalThis.Hooks={on:(event,fn)=>{callbacks.set(event,fn);return fn;},off:(event)=>callbacks.delete(event)};
  globalThis.requestAnimationFrame=fn=>setImmediate(fn);ui.chat.rendered=true;game.dice3d={};
  const Original=foundry.dice.Roll;
  foundry.dice.Roll=class extends Original{async toMessage(...args){const message=await super.toMessage(...args);message.visible=true;message._dice3danimating=true;return message;}};
  const work=performEffectSave(f.actor,f.effect);await tick();
  assert.equal(f.actor.effects.length,1);
  callbacks.get("renderChatMessageHTML")(f.messages[0]);await tick();assert.equal(f.actor.effects.length,1);
  callbacks.get("diceSoNiceRollComplete")(f.messages[0].id);await work;
  assert.equal(f.actor.effects.length,0);assert.equal(callbacks.size,0);delete globalThis.Hooks;
});
test("a full-turn extinguish action prevents an extra automatic save, and rapid requests submit once",async()=>{
  const f=fixture("burning");
  await performEffectSave(f.actor,f.effect,{turn:"Combat.test:1:c",action:true});
  const other=fixture("black-venom").effect;other.parent=f.actor;f.actor.effects=[other];
  await endTurnConditions(f.combat,f.combatant,{round:1,turn:0,skipped:false});
  assert.equal(other.flags[SYSTEM_ID].conditionState.lastSaveTurn,undefined);
  let submissions=0;
  other.update=async()=>{submissions++;await tick();};
  await Promise.all([requestEffectSave(f.actor,other),requestEffectSave(f.actor,other)]);
  assert.equal(submissions,1);
});
test("delegated private saves preserve the player author and self-only recipient instead of the executing GM",async()=>{
  let f=fixture();
  await performEffectSave(f.actor,f.effect,{messageMode:"self",requesterId:f.player.id});
  assert.equal(f.messages[0].author,f.player.id);
  assert.deepEqual(f.messages[0].whisper,[f.player.id]);
  assert.equal(f.messages[0].options.messageMode,"gm","Native gm mode preserves an explicit whisper recipient");
  f=fixture();await performEffectSave(f.actor,f.effect,{messageMode:"gm",requesterId:f.player.id});
  assert.equal(f.messages[0].options.messageMode,"gm");
  assert.equal(f.messages[0].whisper,undefined,"Native gm mode chooses actual GM recipients");
});
