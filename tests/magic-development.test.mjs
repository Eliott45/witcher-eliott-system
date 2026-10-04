import {test} from "node:test";
import assert from "node:assert/strict";
import {drawPower} from "../scripts/magic/power-places.mjs";
import {powerVisit,powerBonus,POWER_MONTH} from "../scripts/magic/power-place-rules.mjs";
import {deriveStatistics,ATTRIBUTE_KEYS} from "../scripts/data/statistics.mjs";
const SYS="witcher-eliott-system";
function fixture(){
  const events=[],messages=[],state={total:24,cancel:false};
  const actor={name:"Маг",uuid:"Actor.magic",id:"magic",type:"character",isOwner:true,items:[],effects:[],system:{experience:30,
    attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,8])),health:{value:40,max:40},stamina:{value:40,max:40},vigor:10,
    skills:{endurance:4,spellCasting:6,ritualCrafting:3,hexWeaving:2},abilityState:{},details:{profession:"mage"},magic:{improvementPoints:0,powerVisits:[]}}};
  Object.defineProperty(actor.system,"statistics",{get(){return deriveStatistics(actor.system,{items:actor.items});}});
  actor.items.get=id=>actor.items.find(item=>item.id===id);
  actor.update=async changes=>{events.push("save");for(const [path,value]of Object.entries(changes)){
    if(["effects","items"].includes(path)){for(const source of value){const i=actor[path].findIndex(row=>row.id===source._id);const row={...source,id:source._id,statuses:new Set(source.statuses??[])};if(i<0)actor[path].push(row);else actor[path][i]=row;}continue;}
    const keys=path.split('.');let at=actor;for(const k of keys.slice(0,-1))at=at[k];at[keys.at(-1)]=value;
  }return actor;};
  actor.toggleStatusEffect=async id=>{events.push(id);actor.effects.push({statuses:new Set([id])});};
  actor.createEmbeddedDocuments=async(_type,sources)=>sources.map(source=>{const item={...source,id:`owned${actor.items.length}`,parent:actor};actor.items.push(item);return item;});
  const place={uuid:"Actor.place",name:"Круг камней",type:"powerPlace",testUserPermission:()=>true,system:{element:"earth",available:true}};
  let id=0;
  globalThis.game={time:{worldTime:100},combat:null,user:{id:"player"},settings:{get:()=>"public"},i18n:{localize:key=>key}};
  globalThis.ui={notifications:{warn:message=>events.push(message)}};
  globalThis.foundry={utils:{randomID:()=>`id${++id}`,fromUuid:async()=>({toObject:()=>({type:"equipment",name:"Пятая эссенция",system:{ruleId:"material.fifth-essence",quantity:1}})})},documents:{ActiveEffect:{getEffectStart:()=>({time:game.time.worldTime})},ChatMessage:{getSpeaker:()=>({actor:actor.id}),applyMode:data=>data,create:async data=>{messages.push(data);return data;}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){events.push("roll");this.total=this.formula==="5d6"?15:state.total;return this;}async toMessage(data){events.push("message");const message={...data,rolls:[this]};messages.push(message);return state.cancel?null:message;}}}};
  return {actor,place,state,events,messages};
}
test("a place awards one restricted reward per pending draw and only the matching elemental bonus",async()=>{
  const {actor,place,events}=fixture();
  const first=drawPower(actor,place,{prepared:true}),second=drawPower(actor,place,{prepared:true});assert.equal(first,second);await first;
  assert.equal(actor.system.magic.improvementPoints,10);assert.equal(actor.system.experience,30);assert.equal(events.filter(e=>e==="save").length,1);
  assert.deepEqual(powerBonus(actor,{kind:"spell",element:"earth"}),{vigor:5,casting:2,label:"Место силы: Земля"});
  assert.equal(powerBonus(actor,{kind:"spell",element:"fire"}).vigor,0);assert.equal(powerBonus(actor,{kind:"ritual",element:"earth"}).casting,0);
  await drawPower(actor,place,{prepared:true});assert.equal(actor.effects.length,1,"Refresh without stacking");
  game.time.worldTime+=3600;assert.equal(powerBonus(actor,{element:"earth"}).vigor,0);
});
test("repeat difficulty grows only on successful saves, resets after a month and stays per character",async()=>{
  const {actor,place,state,events,messages}=fixture();
  await drawPower(actor,place,{prepared:true,reward:"essence"});assert.equal(actor.items[0].system.quantity,5);assert.equal(actor.effects.length,0);
  assert.equal(powerVisit(actor,place).dc,20);await drawPower(actor,place,{prepared:true});assert.equal(powerVisit(actor,place).dc,24);
  state.total=10;await drawPower(actor,place,{prepared:true});assert.equal(powerVisit(actor,place).dc,24);assert.equal(actor.system.health.value,25);
  assert.ok(events.indexOf("message")<events.lastIndexOf("save"));assert.equal(events.at(-1),"stunned");
  assert.equal(messages.find(m=>m.rolls?.[0].formula==="5d6").flags[SYS].skipLuck,true);
  assert.equal(powerVisit(actor,{uuid:"Actor.another"}).dc,0);
  game.time.worldTime+=POWER_MONTH;assert.equal(powerVisit(actor,place).dc,0);
});
test("unprepared, unavailable and incapable draws cannot grant resources; a cancelled roll does not grant twice",async()=>{
  const {actor,place,state,events}=fixture();
  await assert.rejects(drawPower(actor,place),/трёх/);
  actor.isOwner=false;await assert.rejects(drawPower(actor,place,{prepared:true}),/своего/);actor.isOwner=true;
  place.system.available=false;await assert.rejects(drawPower(actor,place,{prepared:true}),/недоступно/);place.system.available=true;
  actor.system.vigor=0;await assert.rejects(drawPower(actor,place,{prepared:true}),/магическим/);actor.system.vigor=10;
  assert.deepEqual(events,[]);await drawPower(actor,place,{prepared:true});state.cancel=true;
  await assert.rejects(drawPower(actor,place,{prepared:true}),/не создан/);assert.equal(actor.system.magic.improvementPoints,10);assert.equal(powerVisit(actor,place).dc,20);
});
