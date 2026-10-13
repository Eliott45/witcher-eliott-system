import test from "node:test";
import assert from "node:assert/strict";
import { resolvePeasantTarget } from "../scripts/combat/peasant-targets.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
const set=(object,path,value)=>{const parts=path.split(".");const key=parts.pop();let at=object;for(const part of parts)at=at[part]??={};at[key]=value;};
function fixture(slug,total=30){
  const docs=new Map(),notices=[],author={id:"gm",isGM:true};
  const create=(id,type)=>{
    const actor={uuid:`Actor.${id}`,id,type,name:id,isOwner:true,flags:{},system:{details:{profession:"peasant"},health:{value:30},creature:{category:"beast",difficulty:"Обычные"}},items:[],effects:[],
      testUserPermission:()=>true,update:async changes=>{for(const [key,value]of Object.entries(changes))set(actor,key,structuredClone(value));},
      createEmbeddedDocuments:async(type,rows)=>{const target=type==="Item"?actor.items:actor.effects;const result=rows.map((row,i)=>({...structuredClone(row),id:`created${target.length+i}`,statuses:new Set(row.statuses??[])}));target.push(...result);return result;},
      deleteEmbeddedDocuments:async(type,ids)=>{const key=type==="Item"?"items":"effects";actor[key]=actor[key].filter(item=>!ids.includes(item.id));}};
    docs.set(actor.uuid,actor);return actor;
  };
  const actor=create("peasant","character"),victim=create("victim","npc");
  actor.items.push({type:"ability",system:{ruleId:`profession.peasant.${slug}`,level:6}});
  const source={uuid:"Compendium.bones",name:"Звериные кости",type:"equipment",system:{ruleId:"material.beast-bones",kind:"material",quantity:1},toObject(){return {name:this.name,type:this.type,system:{...this.system}};}};docs.set(source.uuid,source);
  victim.system.harvest=[{id:"bones",uuid:source.uuid,formula:"1d6+2",quantity:0,attempted:false}];
  const message={id:"peasantMessage01",author,speakerActor:actor,rolls:[{total}],whisper:[],flags:{[SYS]:{peasantTarget:{actor:actor.uuid,target:victim.uuid,slug,ready:true,dc:18,part:"bones",by:"Token.by",held:"Token.held"}}},
    async update(changes){for(const [key,value]of Object.entries(changes))set(this,key,value);}};
  globalThis.fromUuid=async uuid=>docs.get(uuid);globalThis.fromUuidSync=uuid=>docs.get(uuid);
  docs.set("Token.by",{actor:victim});docs.set("Token.held",{actor});
  globalThis.game={user:author,users:{activeGM:{isSelf:true}},settings:{get:()=>"self"},items:{fromCompendium:item=>item.toObject()}};
  class Roll{constructor(formula){this.formula=formula;}async evaluate(options){this.total=this.formula==="1d6+2"?options?.maximize?8:3:4;this._evaluated=true;this.terms=[];return this;}async toMessage(data){return {...data,rolls:[this]};}}
  globalThis.foundry={dice:{Roll},utils:{deepClone:structuredClone},documents:{ChatMessage:{getSpeaker:()=>({}),create:async data=>notices.push(data)}}};
  return {actor,victim,message,notices};
}
test("butcher awards maximum organic loot once and marks that part spent before transfer",async()=>{
  const {actor,victim,message}=fixture("butcher");victim.system.health.value=0;
  await resolvePeasantTarget(message);assert.equal(victim.system.harvest[0].attempted,true);
  assert.equal(actor.items.find(item=>item.system.ruleId==="material.beast-bones").system.quantity,8);
  const count=actor.items.length;await resolvePeasantTarget(message);assert.equal(actor.items.length,count);
});
test("butcher failure spends one attempt; failed transfer restores the attempt",async()=>{
  let f=fixture("butcher",2);f.victim.system.health.value=0;await resolvePeasantTarget(f.message);
  assert.equal(f.victim.system.harvest[0].attempted,true);assert.equal(f.actor.items.length,1);
  f=fixture("butcher");f.victim.system.health.value=0;f.actor.createEmbeddedDocuments=async()=>{throw new Error("transfer failed");};
  await assert.rejects(resolvePeasantTarget(f.message),/transfer failed/);assert.equal(f.victim.system.harvest[0].attempted,false);
});
test("ear bite deals unreduced damage once, leaves a permanent scar and clears paired grapple effects",async()=>{
  const {actor,victim,message}=fixture("ear-bite");
  actor.effects=[{id:"held",statuses:new Set(["grappled"]),flags:{[SYS]:{grapple:{by:"Token.by"}}}},{id:"pin",statuses:new Set(["pinned"]),flags:{[SYS]:{grapple:{by:"Token.by"}}}}];
  victim.effects=[{id:"holder",statuses:new Set(["grappling"]),flags:{[SYS]:{grapple:{target:"Token.held"}}}}];
  await resolvePeasantTarget(message);
  assert.equal(victim.system.health.value,26);assert.equal(actor.effects.length,0);
  assert.equal(victim.effects.length,1);assert.deepEqual(victim.effects[0].flags[SYS].condition.modifiers,[{target:"skills.charisma",value:-1},{target:"skills.seduction",value:-1}]);
  await resolvePeasantTarget(message);assert.equal(victim.system.health.value,26);assert.equal(victim.effects.length,1);
});
