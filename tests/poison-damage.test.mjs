import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { startTurnPoison, poisonDamage } from "../scripts/combat/poison-damage.mjs";
import { conditionSource, EFFECT_TEMPLATES, effectRules } from "../scripts/data/condition-definitions.mjs";
import { poisonEffectUpdate, migratePoisonEffects } from "../scripts/migrations/poison-effects.mjs";
import { toxicityState } from "../scripts/data/consumables.mjs";

const patch = (target, changes) => {
  for (const [path,value] of Object.entries(changes)) {
    const keys=path.split("."),last=keys.pop();let owner=target;
    for(const key of keys)owner=owner[key]??={};owner[last]=value;
  }
};
function fixture(toxic=true) {
  const gm={id:"gm",isActiveGM:true},messages=[],writes=[],refreshes=[];
  globalThis.game={user:gm,users:{activeGM:gm},settings:{get:()=>"public"}};
  const effect={...conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="poisoned")),id:"poison",statuses:new Set(["poisoned"])};
  if(toxic)effect.flags[SYSTEM_ID].toxicity=true;
  const dose=(id,value,consumedAt)=>({id,statuses:new Set(),duration:{expired:false},flags:{[SYSTEM_ID]:{consumable:{ruleId:`potion.${id}`,category:"potion",toxicity:value,consumedAt}}}});
  const actor={uuid:"Actor.a",documentName:"Actor",type:"character",name:"<Witcher>",isOwner:true,flags:{},items:[],
    system:{details:{race:"witcher",profession:"witcher"},health:{value:10,max:40}},
    effects:[effect,...(toxic?[dose("one",75,1),dose("two",50,2)]:[])],
    async update(changes){writes.push(changes);patch(this,changes);},
    async deleteEmbeddedDocuments(_type,ids){this.effects=this.effects.filter(effect=>!ids.includes(effect.id));}};
  const combatant={id:"c",actor},combat={uuid:"Combat.c",started:true,round:2,turn:0,previous:{round:1,turn:1}};
  globalThis.foundry={documents:{ActiveEffect:{registry:{async refresh(event,context){refreshes.push({event,context});}}},
    ChatMessage:{getSpeaker:({actor})=>({actor:actor.uuid}),async create(data,options){messages.push({...data,options});return data;}}}};
  return {actor,combat,combatant,effect,messages,writes,refreshes,context:{round:2,turn:0,skipped:false}};
}

test("poison deals three HP once at the actor's next turn and posts the actual loss",async()=>{
  const f=fixture();assert.equal(f.actor.system.health.value,10);
  await Promise.all([startTurnPoison(f.combat,f.combatant,f.context),startTurnPoison(f.combat,f.combatant,f.context)]);
  assert.equal(f.actor.system.health.value,7);assert.equal(f.messages.length,1);
  assert.match(f.messages[0].content,/−3 ПЗ \(10 → 7\)/);
  assert.match(f.messages[0].content,/&lt;Witcher&gt;/);
  assert.equal(f.messages[0].flags[SYSTEM_ID].skipLuck,true);
  assert.equal(f.writes[0]["system.health.value"],7);
  assert.equal(f.writes[0][`flags.${SYSTEM_ID}.poisonTurns`].rounds.c,2);
  f.actor.flags=JSON.parse(JSON.stringify(f.actor.flags));
  await startTurnPoison(f.combat,f.combatant,f.context);assert.equal(f.messages.length,1);
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:1});assert.equal(f.messages.length,1);
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:3});assert.equal(f.actor.system.health.value,4);
});
test("periodic poison spends adrenaline HP with the turn receipt, and a failed write keeps the pool",async()=>{
  const f=fixture(false);f.combat.id="c";game.combat=f.combat;
  f.actor.flags[SYSTEM_ID]={adrenaline:{combatId:"c",dice:0,temporaryHP:5,emergencyHP:0,damageDice:0,events:[]}};
  const update=f.actor.update.bind(f.actor);let reject=true;
  f.actor.update=async changes=>{if(reject){reject=false;throw new Error("failed HP");}return update(changes);};
  await assert.rejects(startTurnPoison(f.combat,f.combatant,f.context),/failed HP/);
  assert.equal(f.actor.flags[SYSTEM_ID].adrenaline.temporaryHP,5);
  await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(f.actor.system.health.value,10);assert.equal(f.actor.flags[SYSTEM_ID].adrenaline.temporaryHP,2);
  assert.match(f.messages[0].content,/Временные ПЗ поглотили 3/);
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:3});assert.equal(f.actor.system.health.value,9);
});
test("Full Moon absorbs periodic damage before adrenaline, and is refunded if the HP transaction fails",async()=>{
  const f=fixture(false);f.combat.id="c";game.combat=f.combat;
  const moon={id:"moon",statuses:new Set(),flags:{[SYSTEM_ID]:{consumable:{ruleId:"potion.full-moon"},elixirState:{temporary:2}}}};
  f.actor.effects.push(moon);f.actor.effects.get=id=>f.actor.effects.find(row=>row.id===id);
  f.actor.flags[SYSTEM_ID]={adrenaline:{combatId:"c",dice:0,temporaryHP:5,emergencyHP:0,damageDice:0,events:[]}};
  foundry.utils={deepClone:structuredClone,getProperty:(object,path)=>path.split(".").reduce((value,key)=>value?.[key],object)};
  f.actor.updateEmbeddedDocuments=async(_type,changes)=>{for(const change of changes)patch(f.actor.effects.get(change._id),Object.fromEntries(Object.entries(change).filter(([key])=>key!=="_id")));};
  const update=f.actor.update.bind(f.actor);let reject=true;
  f.actor.update=async changes=>{if(reject){reject=false;throw new Error("failed HP");}return update(changes);};
  await assert.rejects(startTurnPoison(f.combat,f.combatant,f.context),/failed HP/);
  assert.equal(moon.flags[SYSTEM_ID].elixirState.temporary,2);assert.equal(f.actor.flags[SYSTEM_ID].adrenaline.temporaryHP,5);
  await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(moon.flags[SYSTEM_ID].elixirState.temporary,0);assert.equal(f.actor.flags[SYSTEM_ID].adrenaline.temporaryHP,4);assert.equal(f.actor.system.health.value,10);
});

test("creature regeneration heals once per turn up to maximum, pauses under suppression and never revives the dead",async()=>{
  const f=fixture(false);f.actor.type="npc";f.actor.effects=[];
  f.actor.items=[{type:"ability",system:{ruleId:"creature.regeneration"},flags:{[SYSTEM_ID]:{regeneration:5,regenerationSunlight:3}}}];
  f.actor.system.creature={regenerationMode:"normal"};
  f.actor.system.health.value=38;
  await Promise.all([startTurnPoison(f.combat,f.combatant,f.context),startTurnPoison(f.combat,f.combatant,f.context)]);
  assert.equal(f.actor.system.health.value,40);assert.equal(f.messages.length,1);
  f.actor.system.health.value=30;f.actor.system.creature.regenerationMode="suppressed";
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:3});assert.equal(f.actor.system.health.value,30);
  f.actor.system.creature.regenerationMode="sunlight";
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:4});assert.equal(f.actor.system.health.value,33);
  f.actor.effects.push({statuses:new Set(["dead"])});
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:5});assert.equal(f.actor.system.health.value,33);
});

test("poison applied after a healthy turn begins cannot damage retroactively",async()=>{
  const f=fixture();const poison=f.actor.effects.shift();
  await startTurnPoison(f.combat,f.combatant,f.context);assert.equal(f.actor.system.health.value,10);
  f.actor.effects.unshift(poison);
  await startTurnPoison(f.combat,f.combatant,f.context);assert.equal(f.actor.system.health.value,10);
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:3});assert.equal(f.actor.system.health.value,7);
});

test("a dose applied while the start-turn refresh is pending cannot cause immediate damage",async()=>{
  const f=fixture(),poison=f.actor.effects.shift();
  foundry.documents.ActiveEffect.registry.refresh=async()=>{f.actor.effects.unshift(poison);};
  await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(f.actor.system.health.value,10);assert.equal(f.messages.length,0);
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:3});
  assert.equal(f.actor.system.health.value,7);
});

test("expiry is resolved before turn damage; a drop below the toxicity limit clears only toxic poison",async()=>{
  const f=fixture();
  foundry.documents.ActiveEffect.registry.refresh=async(event,context)=>{
    assert.equal(event,"turnStart");assert(context.actors.has(f.actor));
    f.actor.effects.find(effect=>effect.id==="two").duration.expired=true;
  };
  await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(toxicityState(f.actor).value,75);assert.equal(toxicityState(f.actor).poisoned,false);
  assert.equal(f.actor.system.health.value,10);assert.equal(f.messages.length,0);
});

test("skips, initiative reorderings, combat not started and other clients never apply damage",async()=>{
  const f=fixture();
  await startTurnPoison(f.combat,f.combatant,{...f.context,skipped:true});
  f.combat.previous={round:2,turn:0};await startTurnPoison(f.combat,f.combatant,f.context);
  f.combat.previous={round:1,turn:1};f.combat.started=false;await startTurnPoison(f.combat,f.combatant,f.context);
  f.combat.started=true;game.user={id:"other"};await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);
});

test("ordinary and toxic poison share one tick; armor SP is ignored, resistance and immunity are respected",async()=>{
  const f=fixture(false);
  f.actor.items=[{id:"armor",type:"armor",system:{quantity:1,carried:true,equipped:true,stoppingPower:{value:99,max:99},resistances:"Кровотечение"}}];
  assert.equal(poisonDamage(f.actor),3);
  f.actor.effects.push({...f.effect,id:"toxic",flags:{[SYSTEM_ID]:{toxicity:true}}});assert.equal(poisonDamage(f.actor),3);
  f.actor.items[0].system.resistances="Яд; Кровотечение";assert.equal(poisonDamage(f.actor),1);
  f.actor.items[0].system.equipped=false;assert.equal(poisonDamage(f.actor),3);
  f.actor.items.push({type:"ability",system:{ruleId:"creature.poison-immunity"}});assert.equal(poisonDamage(f.actor),0);
  f.actor.items=[];f.actor.effects.forEach(effect=>effect.disabled=true);assert.equal(poisonDamage(f.actor),0);
  f.actor.effects=[{statuses:new Set(["poisoned"])},{statuses:new Set(["dead"])}];assert.equal(poisonDamage(f.actor),0);
});

test("damage may cross zero HP, preserves chat privacy and does not replay after a chat failure",async()=>{
  const f=fixture();f.actor.system.health.value=2;f.combatant.hidden=true;
  await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(f.actor.system.health.value,-1);assert.equal(f.messages[0].options.messageMode,"gm");
  foundry.documents.ChatMessage.create=async()=>{throw Error("chat offline");};
  await assert.rejects(startTurnPoison(f.combat,f.combatant,{...f.context,round:3}),/chat offline/);
  assert.equal(f.actor.system.health.value,-4);
  await startTurnPoison(f.combat,f.combatant,{...f.context,round:3});assert.equal(f.actor.system.health.value,-4);
});

test("a rejected HP update does not consume the turn marker",async()=>{
  const f=fixture(),update=f.actor.update;
  f.actor.update=async()=>{throw Error("offline");};
  await assert.rejects(startTurnPoison(f.combat,f.combatant,f.context),/offline/);
  assert.equal(f.actor.system.health.value,10);assert.equal(f.messages.length,0);
  f.actor.update=update;await startTurnPoison(f.combat,f.combatant,f.context);
  assert.equal(f.actor.system.health.value,7);assert.equal(f.messages.length,1);
});

test("legacy poison cleanup preserves a custom DC, notes and timing, and runs idempotently",async()=>{
  const f=fixture(false);f.effect.description="Каждый ход: 3 урона. Урон учитывается вручную. Моя заметка.";
  f.effect.flags[SYSTEM_ID].condition.save.dc=19;f.effect.flags[SYSTEM_ID].condition.autoSave=true;
  f.effect.flags[SYSTEM_ID].conditionState={lastSaveTurn:"already-spent"};
  patch(f.effect,poisonEffectUpdate(f.effect));
  assert.equal(effectRules(f.effect).save.dc,19);assert.equal(effectRules(f.effect).autoSave,false);
  assert.match(f.effect.description,/Моя заметка/);assert(!f.effect.description.includes("вручную"));
  assert.equal(f.effect.flags[SYSTEM_ID].conditionState.lastSaveTurn,"already-spent");
  assert.deepEqual(poisonEffectUpdate(f.effect),{});
  f.actor.updateEmbeddedDocuments=async(_type,updates)=>updates.forEach(update=>patch(f.actor.effects.find(effect=>effect.id===update._id),update));
  const pack={collection:"effects",locked:true,async getDocuments(){return[f.effect];},async configure({locked}){this.locked=locked;}};
  game.actors=[f.actor];game.items=[];game.scenes=[];game.packs={get:()=>pack};
  await migratePoisonEffects();assert.equal(pack.locked,true);
  f.effect.flags[SYSTEM_ID].condition.autoSave=true;game.actors=[];
  foundry.documents.ActiveEffect.implementation={async updateDocuments(){throw Error("pack write failure");}};
  await assert.rejects(migratePoisonEffects(),/pack write failure/);assert.equal(pack.locked,true);
});
