import {test} from "node:test";
import assert from "node:assert/strict";
import {drawPower} from "../scripts/magic/power-places.mjs";
import {powerVisit,powerBonus,POWER_MONTH} from "../scripts/magic/power-place-rules.mjs";
import {deriveStatistics,ATTRIBUTE_KEYS} from "../scripts/data/statistics.mjs";
import {CORE_MAGIC} from "../scripts/data/spells.mjs";
import {learningError,learningRule,learningProgress} from "../scripts/magic/learning-rules.mjs";
import {startStudy,studyDay,finishStudy,cancelStudy} from "../scripts/magic/learning.mjs";
const SYS="witcher-eliott-system";
function fixture(){
  const events=[],messages=[],state={total:24,cancel:false};
  const actor={name:"Маг",uuid:"Actor.magic",id:"magic",type:"character",isOwner:true,items:[],effects:[],system:{experience:30,
    attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,8])),health:{value:40,max:40},stamina:{value:40,max:40},vigor:10,
    skills:{endurance:4,spellCasting:6,ritualCrafting:3,hexWeaving:2},abilityState:{},details:{profession:"mage"},magic:{improvementPoints:0,powerVisits:[],study:{sourceUuid:""}}}};
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
function source(id="spell.aenye") {
  const row=CORE_MAGIC.find(s=>s.id===id);
  return {id:row.documentId,type:"spell",name:row.name,uuid:`Compendium.spells.Item.${row.documentId}`,system:structuredClone(row.system),testUserPermission:()=>true,toObject(){return {type:this.type,name:this.name,system:structuredClone(this.system)};}};
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
test("learning uses all four printed tiers and the correct ritual/hex skill, with profession restrictions",()=>{
  const {actor}=fixture();
  assert.deepEqual(["novice","journeyman","master","archpriest"].map(grade=>learningRule({kind:"spell",grade})),[
    {cost:10,baseDays:4,dc:14,required:2,skill:"spellCasting"},{cost:20,baseDays:7,dc:18,required:4,skill:"spellCasting"},
    {cost:30,baseDays:21,dc:22,required:6,skill:"spellCasting"},{cost:40,baseDays:35,dc:24,required:8,skill:"spellCasting"}]);
  assert.equal(learningRule({kind:"hex",hex:{danger:"high"}}).skill,"hexWeaving");
  assert.equal(learningRule({kind:"hex",hex:{danger:"high"}}).cost,30);
  assert.equal(learningRule({kind:"ritual",grade:"master"}).skill,"ritualCrafting");
  const spell=source(),sign=source("sign.igni"),inv=source("invocation.healing-rest");
  assert.equal(learningError(actor,spell),"");assert.match(learningError(actor,inv),/Маг/);
  actor.system.details.profession="priest";assert.match(learningError(actor,spell),/Жрец/);assert.equal(learningError(actor,inv),"");
  actor.system.details.profession="witcher";assert.equal(learningError(actor,sign),"");assert.match(learningError(actor,spell),/только знаки/);
  actor.system.vigor=0;assert.match(learningError(actor,sign),/Энергия/);
});
test("study reserves points atomically, waits for days and successes, keeps a failed day and imports one canonical Item",async()=>{
  const {actor,state,events,messages}=fixture(),spell=source();foundry.utils.fromUuid=async()=>spell;
  actor.system.magic.improvementPoints=6;
  const study=await startStudy(actor,spell,"Книга из Аретузы");assert.equal(actor.system.experience,26);assert.equal(actor.system.magic.improvementPoints,0);
  assert.equal(events.length,1);assert.equal(actor.items.length,0);
  await assert.rejects(startStudy(actor,spell,"Учитель"),/текущее/);
  await assert.rejects(finishStudy(actor,study.id),/все дни/);
  const first=studyDay(actor,study.id),second=studyDay(actor,study.id);assert.equal(first,second);await first;
  assert.equal(actor.system.magic.study.days,1);assert.equal(actor.system.magic.study.successes,1);
  state.total=10;await studyDay(actor,study.id);assert.equal(actor.system.magic.study.failures,1);
  assert.equal(learningProgress(actor.system.magic.study).requiredDays,5);
  actor.system.magic=JSON.parse(JSON.stringify(actor.system.magic));state.total=24;
  await studyDay(actor,study.id);assert.equal(actor.system.magic.study.successes,2);
  await studyDay(actor,study.id);await studyDay(actor,study.id);
  assert.equal(messages.filter(m=>m.rolls).length,3,"Days after required successes do not roll or spend Luck");
  assert.ok(messages.filter(m=>m.rolls).every(m=>m.flags[SYS]?.skipLuck!==true));
  assert.equal(learningProgress(actor.system.magic.study).ready,true);
  const item=await finishStudy(actor,study.id);assert.equal(actor.items.length,1);assert.equal(item.flags.core.sourceId,spell.uuid);
  assert.equal(actor.system.magic.study.sourceUuid,"");assert.equal(actor.system.experience,26);
  await assert.rejects(finishStudy(actor,study.id),/изменился/);assert.equal(actor.items.length,1);
});
test("learning rejects insufficient points, missing knowledge source and cancelled checks without consuming progress",async()=>{
  const {actor,state}=fixture(),spell=source();foundry.utils.fromUuid=async()=>spell;
  await assert.rejects(startStudy(actor,spell," "),/наставника/);
  actor.system.experience=5;await assert.rejects(startStudy(actor,spell,"Учитель"),/Недостаточно/);
  assert.equal(actor.system.experience,5);actor.system.experience=10;
  const study=await startStudy(actor,spell,"Учитель");state.cancel=true;
  await assert.rejects(studyDay(actor,study.id),/не создан/);assert.equal(actor.system.magic.study.days,0);
  actor.isOwner=false;await assert.rejects(studyDay(actor,study.id),/права/);actor.isOwner=true;
  await cancelStudy(actor,study.id);assert.equal(actor.system.magic.study.sourceUuid,"");assert.equal(actor.system.experience,0);
});
test("interrupted finalization can be safely retried and existing book imports never duplicate",async()=>{
  const {actor}=fixture(),spell=source();foundry.utils.fromUuid=async()=>spell;
  const study=await startStudy(actor,spell,"Учитель");Object.assign(actor.system.magic.study,{days:4,successes:2});
  const update=actor.update;actor.update=async()=>null;
  await assert.rejects(finishStudy(actor,study.id),/план не закрыт/);assert.equal(actor.items.length,1);
  actor.update=update;await finishStudy(actor,study.id);assert.equal(actor.items.length,1);
});
test("changing a catalog entry to a higher tier cannot complete at the old price",async()=>{
  const {actor}=fixture(),spell=source();foundry.utils.fromUuid=async()=>spell;
  const study=await startStudy(actor,spell,"Учитель");spell.system.grade="master";
  await assert.rejects(studyDay(actor,study.id),/Уровень или вид/);
  Object.assign(actor.system.magic.study,{days:4,successes:2});
  await assert.rejects(finishStudy(actor,study.id),/Уровень или вид/);assert.equal(actor.items.length,0);
});
