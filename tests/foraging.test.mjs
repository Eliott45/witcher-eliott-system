import test from "node:test";
import assert from "node:assert/strict";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { materialDescriptionDetails, materialProse, legacyMaterialProse } from "../scripts/data/material-descriptions.mjs";
import { materialDescriptionUpdate } from "../scripts/migrations/material-descriptions.mjs";
import { foragingEntries, foragingFormula } from "../scripts/data/foraging.mjs";
import { forage, registerForaging } from "../scripts/workshop/foraging.mjs";
import { foragingActors } from "../scripts/sheets/foraging-window.mjs";
import { MACRO_SOURCES } from "../scripts/data/macros.mjs";
import { migrateMacroContent } from "../scripts/migrations/macro-content.mjs";

const material = id => {
  const source = MATERIALS.find(entry=>entry.id===`material.${id}`);
  return {id:source.documentId,uuid:`Item.${source.documentId}`,name:source.name,type:'equipment',system:{...structuredClone(source.system),ruleId:source.id},
    testUserPermission:()=>true,toObject(){return {name:this.name,type:this.type,system:structuredClone(this.system)};}};
};
const options = {check:true,dc:8,formula:'2d6',minutes:30,confirmed:true};
function fixture(totals=[20,7]) {
  const notices=[],checks=[],created=[],dice=[];
  const actor={uuid:'Actor.forager',id:'forager',name:'Собиратель',type:'character',isOwner:true,effects:[],statuses:new Set(),items:[],
    system:{statistics:{effective:{intelligence:6},modifiers:[]},skills:{wildernessSurvival:4}},
    async createEmbeddedDocuments(_type,data){created.push(...data);return data.map((row,index)=>({...row,id:`created${index}`}));},async deleteEmbeddedDocuments(){created.length=0;}};
  const source=material('timber');
  delete globalThis.Hooks;
  globalThis.game={user:{isGM:true},system:{api:{existing:true}},settings:{get:()=>"blind"},items:{fromCompendium:source=>source.toObject()}};
  globalThis.foundry={documents:{ChatMessage:{getSpeaker:({actor})=>({actor:actor.id}),create:async(data,mode)=>{notices.push({data,mode});return data;}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;dice.push(formula);}async evaluate(config){assert.equal(config.allowInteractive,false);this.total=totals.shift();return this;}async toMessage(data,mode){checks.push({data,mode});const message={...data,rolls:[this],update:async changes=>Object.assign(message,changes)};return message;}}}};
  return {actor,source,notices,checks,created,dice};
}

test("page 128 materials show exact gathering DC/yield and distinguish merchant stock from animal sources",()=>{
  assert.equal(MATERIALS.slice(0,22).length,22);
  const expected={ashes:[10,'1d10'],coal:[14,'1d10'],cotton:[12,'1d10'],resin:[10,'1d6'],timber:[8,'2d6'],wax:[12,'1d6']};
  for(const [id,[dc,formula]] of Object.entries(expected)){const item=material(id);assert.equal(item.system.material.forageDC,dc);assert.equal(item.system.material.quantityFormula,formula);assert.match(materialDescriptionDetails(item.system),new RegExp(`СЛ ${dc}`));}
  assert.equal(material('beast-bones').system.material.location,'Чудовища и животные');
  assert.equal(material('wolf-hide').system.material.quantityFormula,'3');
  assert.equal(material('draconid-scales').system.material.forageDC,0);
  const entries=foragingEntries(['glass','silk','cow-hide','lyrian-leather','timber','feathers'].map(material));
  assert.deepEqual(entries.map(e=>e.label),['Древесина','Перья']);
  assert.equal(entries[1].group,'harvest');assert.match(entries[1].summary,/СЛ не задана/);
});

test("material facts reflect edits, escape text and keep prose free of repeated locations or stats",()=>{
  const item=material('resin');
  assert(!materialProse(item).includes('Где искать'));
  item.system.material.forageDC=19;item.system.material.location='<img src=x onerror=bad>';
  const details=materialDescriptionDetails(item.system);
  assert.match(details,/СЛ 19/);assert(!details.includes('СЛ 10'));assert(!details.includes('<img'));
  assert.match(details,/&lt;img/);assert.match(details,/за одну единицу/);
  assert(!materialDescriptionDetails(material('glass').system).includes('Сложность сбора'));
  assert.equal(materialDescriptionDetails({kind:'gear'}),'');
});

test("stock material descriptions and incorrect default locations migrate once without changing custom writing or inventory",()=>{
  const item=material('beast-bones');item.system.material.location='Покупается или изготавливается';item.system.description=legacyMaterialProse(item.system);item.system.quantity=8;
  const before=structuredClone(item.system),update=materialDescriptionUpdate(item);
  assert.equal(update['system.material.location'],'Чудовища и животные');assert.equal(update['system.description'],materialProse(item));
  item.system.description=update['system.description'];item.system.material.location=update['system.material.location'];
  assert.deepEqual(materialDescriptionUpdate(item),{});assert.equal(item.system.quantity,before.quantity);assert.equal(item.system.price,before.price);
  item.system.description='<p>Мои заметки</p>';item.system.material.location='Личная коллекция';
  assert.deepEqual(materialDescriptionUpdate(item),{});
});

test("yield accepts plain dice/whole quantities, rounds fractions down and rejects exploding or executable formulas",()=>{
  assert.equal(foragingFormula('1d6 / 2'),'floor(1d6/2)');assert.equal(foragingFormula('2D6'),'2d6');assert.equal(foragingFormula('3'),'3');
  for(const value of ['1d10x','1d10wc','0','-1','1d6/0','999d9999','@actor.level','eval(1)','1.5'])assert.throws(()=>foragingFormula(value));
});

test("successful search uses Survival once, then ordinary yield dice, respects privacy and awards exact units",async()=>{
  const f=fixture();const result=await forage(f.actor,f.source,options);
  assert.deepEqual(result,{success:true,quantity:7});assert.deepEqual(f.dice,['1d10wc + 10 + 0','2d6']);
  assert.equal(f.checks[0].data.flags['witcher-eliott-system'].workshop.skill,'wildernessSurvival');
  assert.equal(f.checks[1].data.flags['witcher-eliott-system'].skipLuck,true);
  assert(f.checks.every(row=>row.mode.messageMode==='blind'));
  assert.equal(f.created[0].system.quantity,7);assert.equal(f.created[0].system.ruleId,'material.timber');
  assert.equal(f.notices[0].mode.messageMode,'blind');assert.match(f.notices[0].data.content,/30 мин/);
});

test("failed search rolls no yield and awards nothing; zero yield never creates a zero-stack",async()=>{
  let f=fixture([7]);assert.deepEqual(await forage(f.actor,f.source,options),{success:false,quantity:0});
  assert.equal(f.dice.length,1);assert.equal(f.created.length,0);
  f=fixture([20,0]);await forage(f.actor,f.source,{...options,formula:'1d6 / 2'});
  assert.equal(f.created.length,0);assert.equal(f.dice[1],'floor(1d6/2)');
});

test("GM can resolve source loot with its fixed quantity, but missing DC/yield/time and unsuitable sources never grant items",async()=>{
  let f=fixture();await forage(f.actor,material('wolf-hide'),{...options,check:false,formula:'3'});
  assert.equal(f.dice.length,0);assert.equal(f.created[0].system.quantity,3);
  for(const changes of [{formula:''},{minutes:NaN},{dc:0},{confirmed:false}]){
    f=fixture();await assert.rejects(forage(f.actor,f.source,{...options,...changes}));assert.equal(f.created.length,0);assert.equal(f.dice.length,0);
  }
  f=fixture();await assert.rejects(forage(f.actor,material('glass'),options),/приобретают/);
  game.user.isGM=false;await assert.rejects(forage(f.actor,f.source,options),/ведущий/);
});

test("cancelled dice, stale source and failed award never leave items; a second pending search cannot double-award",async()=>{
  let f=fixture();foundry.dice.Roll.prototype.toMessage=async()=>null;
  await assert.rejects(forage(f.actor,f.source,options),/отменён/);assert.equal(f.created.length,0);
  f=fixture();const send=foundry.dice.Roll.prototype.toMessage;
  foundry.dice.Roll.prototype.toMessage=async function(...args){f.source.system.material.forageDC=30;return send.apply(this,args);};
  await assert.rejects(forage(f.actor,f.source,options),/изменились/);assert.equal(f.created.length,0);
  f=fixture();f.actor.createEmbeddedDocuments=async()=>[];
  await assert.rejects(forage(f.actor,f.source,options),/все предметы/);
  f=fixture();let release;foundry.dice.Roll.prototype.evaluate=()=>new Promise(resolve=>{release=()=>resolve({toMessage:async()=>null});});
  const first=forage(f.actor,f.source,options);
  await assert.rejects(forage(f.actor,f.source,options),/уже выполняется/);
  while(!release)await new Promise(resolve=>setImmediate(resolve));release();await assert.rejects(first,/отменён/);assert.equal(f.created.length,0);
});

test("GM macro is private by default, installs idempotently, and API refuses a player",async()=>{
  const source=MACRO_SOURCES.find(entry=>entry._id==='foragingGM000001');
  assert.equal(source.ownership.default,0);assert.equal(source.command,'await game.system.api.forage();');
  let notices=0;fixture();globalThis.ui={notifications:{warn:()=>notices++}};registerForaging();assert.equal(game.system.api.existing,true);
  game.user.isGM=false;const original=console.error;console.error=()=>{};
  try{await game.system.api.forage();}finally{console.error=original;}assert.equal(notices,1);
  const index=new Map([[MACRO_SOURCES[0]._id,MACRO_SOURCES[0]]]),locks=[];
  const pack={collection:'witcher-eliott-system.macros',locked:true,index,getIndex:async()=>index,configure:async value=>{pack.locked=value.locked;locks.push(value.locked);}};
  game.users={activeGM:{isSelf:true}};game.packs=new Map([[pack.collection,pack]]);
  foundry.documents.Macro={createDocuments:async data=>{data.forEach(item=>index.set(item._id,item));return data;}};
  await migrateMacroContent();await migrateMacroContent();assert.equal(index.size,2);assert.deepEqual(locks,[false,true]);
});

test("GM recipient list includes distinct unlinked tokens without duplicating a linked world actor",()=>{
  const f=fixture(),other={...f.actor,uuid:'Scene.s.Token.a.Actor.a',id:'a'};
  game.actors=[f.actor];globalThis.canvas={tokens:{placeables:[{id:'linked',actor:f.actor,name:'Linked',document:{actorLink:true}},{id:'a',actor:other,name:'Бандит',document:{actorLink:false}}],controlled:[{actor:other}]}};
  const choices=foragingActors();assert.equal(choices.length,2);assert.equal(choices.find(row=>row.selected).id,other.uuid);assert.match(choices[1].name,/токен a/);
  delete globalThis.canvas;
});
