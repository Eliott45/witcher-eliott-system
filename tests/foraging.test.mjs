import test from "node:test";
import assert from "node:assert/strict";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { materialDescriptionDetails, materialProse, legacyMaterialProse } from "../scripts/data/material-descriptions.mjs";
import { materialDescriptionUpdate } from "../scripts/migrations/material-descriptions.mjs";
import { foragingEntries, foragingFormula } from "../scripts/data/foraging.mjs";
import { forage, resolveForaging, foragingState } from "../scripts/workshop/foraging.mjs";
import { registerForaging, processForagingRequest, rollForagingRequest, foragingWrite, resumeForaging } from "../scripts/chat/foraging.mjs";
import { foragingActors } from "../scripts/sheets/foraging-window.mjs";
import { MACRO_SOURCES } from "../scripts/data/macros.mjs";
import { migrateMacroContent } from "../scripts/migrations/macro-content.mjs";

const material = id => {
  const source = MATERIALS.find(entry=>entry.id===`material.${id}`);
  return {id:source.documentId,uuid:`Item.${source.documentId}`,name:source.name,type:'equipment',system:{...structuredClone(source.system),ruleId:source.id},
    testUserPermission:()=>true,toObject(){return {name:this.name,type:this.type,system:structuredClone(this.system)};}};
};
const S='witcher-eliott-system';
const options = {check:true,dc:8,formula:'2d6'};
const updateObject=(object,changes)=>{for(const [path,value] of Object.entries(changes)){const keys=path.split('.'),last=keys.pop();let target=object;for(const key of keys)target=target[key]??={};target[last]=structuredClone(value);}};
function fixture(totals=[20,7]) {
  const notices=[],checks=[],created=[],dice=[],messages=[];
  messages.get=id=>messages.find(message=>message.id===id);
  const gm={id:'gm',isGM:true},player={id:'player',isGM:false},stranger={id:'stranger',isGM:false};
  const actor={uuid:'Actor.forager',id:'forager',name:'Собиратель',type:'character',isOwner:true,effects:[],statuses:new Set(),items:[],
    testUserPermission:user=>user.isGM||user.id==='player',
    system:{statistics:{effective:{intelligence:6},modifiers:[]},skills:{wildernessSurvival:4}},
    async createEmbeddedDocuments(_type,data){created.push(...data);const rows=data.map((row,index)=>({...row,id:`created${index}`}));actor.items.push(...rows);return rows;},async deleteEmbeddedDocuments(){created.length=0;actor.items.length=0;}};
  const source=material('timber');
  delete globalThis.Hooks;
  globalThis.game={user:gm,users:{activeGM:{isSelf:true},get:id=>[gm,player,stranger].find(user=>user.id===id)},messages,
    system:{api:{existing:true}},settings:{get:()=>"blind"},items:{fromCompendium:source=>source.toObject()}};
  globalThis.fromUuid=async uuid=>uuid===actor.uuid?actor:uuid===source.uuid?source:null;
  let nextId=0;
  const create=async(data,mode)=>{
    const message={id:`message${++nextId}`,author:game.user,whisper:[],blind:false,rolls:[],flags:{},...data,
      get speakerActor(){return this.speaker?.actor===actor.id?actor:null;},
      async update(changes){updateObject(this,changes);globalThis.Hooks?.call('updateChatMessage',this,changes);return this;}};
    if(mode?.messageMode==='blind'){message.whisper=['gm'];message.blind=true;}
    messages.push(message);notices.push({data:message,mode});return message;
  };
  globalThis.foundry={utils:{randomID:()=>`nonce${++nextId}`},documents:{ChatMessage:{getSpeaker:({actor})=>({actor:actor.id}),create}},
    dice:{Roll:class{constructor(formula){this.formula=formula;dice.push(formula);}async evaluate(config){assert.equal(config.allowInteractive,false);this.total=totals.shift();return this;}async toMessage(data,mode){checks.push({data,mode});return create({...data,rolls:[this]},mode);}}}};
  return {actor,source,notices,checks,created,dice,messages,gm,player,stranger};
}
async function claimed(f,choices=options){const card=await forage(f.actor,f.source,choices);await processForagingRequest(f.actor,{card:card.id,kind:'claim',nonce:'one',user:'player'},'player');return card;}
async function result(f,card,total=20,{ready=true,check=true}={}){
  const message=await foundry.documents.ChatMessage.create({author:f.player,speaker:{actor:f.actor.id},whisper:['gm'],blind:true,
    rolls:check?[{total}]:[],flags:{[S]:{foragingRoll:{card:card.id,nonce:'one',ready},workshop:{skill:'wildernessSurvival',dc:options.dc}}}});
  return message;
}
function hooks(){
  let id=0;const rows=new Map();
  globalThis.Hooks={on(name,fn){rows.set(++id,{name,fn});return id;},off(_name,key){rows.delete(key);},once(name,fn){this.on(name,fn);},call(name,...args){for(const row of [...rows.values()])if(row.name===name)row.fn(...args);}};
  return Hooks;
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

test("GM publishes only a request, without time, confirmation, dice, result or inventory writes",async()=>{
  const f=fixture(),card=await forage(f.actor,f.source,options);
  assert.equal(foragingState(card).status,'waiting');assert.equal(f.dice.length,0);assert.equal(f.created.length,0);
  assert.match(card.content,/Ожидает проверки/);assert.doesNotMatch(card.content,/мин|Затрачено|2d6|собрано/);
  assert(!('minutes' in foragingState(card).options));assert(!('confirmed' in foragingState(card).options));
  game.user=f.player;await assert.rejects(forage(f.actor,f.source,options),/ведущий/);
});

test("only the owner can claim a request and one completed player roll awards once with original privacy",async()=>{
  const f=fixture([7]),card=await forage(f.actor,f.source,options);
  await processForagingRequest(f.actor,{card:card.id,kind:'claim',nonce:'bad',user:'stranger'},'stranger');assert.equal(foragingState(card).status,'waiting');
  await processForagingRequest(f.actor,{card:card.id,kind:'claim',nonce:'bad',user:'player'},'stranger');assert.equal(foragingState(card).status,'waiting');
  await processForagingRequest(f.actor,{card:card.id,kind:'claim',nonce:'one',user:'player'},'player');
  await processForagingRequest(f.actor,{card:card.id,kind:'claim',nonce:'two',user:'gm'},'gm');assert.equal(foragingState(card).claim.id,'one');
  const message=await result(f,card,20,{ready:false});
  assert.equal(await resolveForaging(card,message),undefined);assert.equal(f.created.length,0);
  message.flags[S].foragingRoll.ready=true;
  assert.deepEqual(await foragingWrite(card,()=>resolveForaging(card,message)),{success:true,quantity:7});
  await foragingWrite(card,()=>resolveForaging(card,message));
  assert.deepEqual(f.dice,['2d6']);assert.equal(f.checks[0].data.flags[S].skipLuck,true);assert.equal(f.checks[0].mode.messageMode,'blind');
  assert.equal(f.created.length,1);assert.equal(f.created[0].system.quantity,7);assert.equal(f.created[0].system.ruleId,'material.timber');
  const notice=f.messages.find(message=>message.flags[S]?.foragingResult);assert.deepEqual(notice.whisper,['gm']);assert.equal(notice.blind,true);assert.doesNotMatch(notice.content,/мин|Затрачено/);
  assert.equal(foragingState(card).status,'complete');
});

test("failed player checks and zero yield grant nothing; source loot also waits for the player's click",async()=>{
  let f=fixture(),card=await claimed(f),message=await result(f,card,7);
  assert.deepEqual(await resolveForaging(card,message),{success:false,quantity:0});assert.equal(f.dice.length,0);assert.equal(f.created.length,0);
  f=fixture([0]);card=await claimed(f,{...options,formula:'1d6 / 2'});message=await result(f,card);
  await resolveForaging(card,message);assert.equal(f.created.length,0);assert.deepEqual(f.dice,['floor(1d6/2)']);
  f=fixture();card=await claimed(f,{...options,check:false,formula:'3'});assert.equal(f.created.length,0);
  message=await result(f,card,0,{check:false});await resolveForaging(card,message);assert.equal(f.dice.length,0);assert.equal(f.created[0].system.quantity,3);
  for(const changes of [{formula:''},{dc:0}]){
    f=fixture();await assert.rejects(forage(f.actor,f.source,{...options,...changes}));assert.equal(f.created.length,0);assert.equal(f.dice.length,0);
  }
  f=fixture();await assert.rejects(forage(f.actor,material('glass'),options),/приобретают/);
});

test("cancelled or stale requests grant nothing; recovery reuses committed dice and never duplicates awarded items",async()=>{
  let f=fixture(),card=await claimed(f);
  await processForagingRequest(f.actor,{card:card.id,kind:'release',nonce:'one',user:'player'},'player');assert.equal(foragingState(card).status,'waiting');
  f=fixture();card=await claimed(f);let message=await result(f,card);
  await processForagingRequest(f.actor,{card:card.id,kind:'release',nonce:'one',user:'player'},'player');assert.equal(foragingState(card).status,'rolling');
  f.source.system.material.forageDC=30;await assert.rejects(resolveForaging(card,message),/изменился/);assert.equal(f.created.length,0);
  f=fixture([7]);card=await claimed(f);message=await result(f,card);const create=f.actor.createEmbeddedDocuments;f.actor.createEmbeddedDocuments=async()=>[];
  await assert.rejects(resolveForaging(card,message),/все предметы/);assert.equal(f.created.length,0);
  f.actor.createEmbeddedDocuments=create;await resolveForaging(card,message);assert.deepEqual(f.dice,['2d6']);assert.equal(f.created.length,1);
  f=fixture([7]);card=await claimed(f);message=await result(f,card);
  const update=card.update;let fail=true;card.update=async changes=>{if(changes[`flags.${S}.foraging`]?.status==='complete'&&fail){fail=false;throw new Error('write failed');}return update.call(card,changes);};
  await assert.rejects(resolveForaging(card,message),/write failed/);await resolveForaging(card,message);
  assert.equal(f.created.length,1);assert.deepEqual(f.dice,['2d6']);assert.equal(f.messages.filter(message=>message.flags[S]?.foragingResult).length,1);
});

test("GM macro is private by default, installs idempotently, and API refuses a player",async()=>{
  const source=MACRO_SOURCES.find(entry=>entry._id==='foragingGM000001');
  assert.equal(source.ownership.default,0);assert.equal(source.command,'await game.system.api.forage();');
  let notices=0;fixture();hooks();globalThis.ui={notifications:{warn:()=>notices++}};registerForaging();assert.equal(game.system.api.existing,true);
  game.user.isGM=false;const original=console.error;console.error=()=>{};
  try{await game.system.api.forage();}finally{console.error=original;}assert.equal(notices,1);
  const index=new Map([[MACRO_SOURCES[0]._id,MACRO_SOURCES[0]]]),locks=[];
  const pack={collection:'witcher-eliott-system.macros',locked:true,index,getIndex:async()=>index,configure:async value=>{pack.locked=value.locked;locks.push(value.locked);}};
  game.users={activeGM:{isSelf:true}};game.packs=new Map([[pack.collection,pack]]);
  foundry.documents.Macro={createDocuments:async data=>{data.forEach(item=>index.set(item._id,item));return data;}};
  await migrateMacroContent();await migrateMacroContent();assert.equal(index.size,MACRO_SOURCES.length);assert.deepEqual(locks,[false,true]);
});

test("player's chat click rolls Survival on their own client, waits for GM claim, and publishes readiness after the die",async()=>{
  const f=fixture([20,7]),card=await forage(f.actor,f.source,options);
  hooks();globalThis.ui={chat:{rendered:false}};globalThis.requestAnimationFrame=fn=>setImmediate(fn);
  f.actor.update=async changes=>{
    const request=changes[`flags.${S}.foragingRequest`];
    await processForagingRequest(f.actor,request,game.user.id);
  };
  game.user=f.player;
  const message=await rollForagingRequest(card);
  assert.equal(message.author.id,'player');assert.equal(message.flags[S].foragingRoll.ready,true);
  assert.deepEqual(f.dice,['1d10wc + 10 + 0']);assert.equal(f.created.length,0);
  assert.equal(f.checks[0].data.flags[S].workshop.skill,'wildernessSurvival');
  game.user=f.gm;await resolveForaging(card,message);
  assert.deepEqual(f.dice,['1d10wc + 10 + 0','2d6']);assert.equal(f.created[0].system.quantity,7);
  delete globalThis.Hooks;delete globalThis.requestAnimationFrame;
});

test("chat cannot be rolled by an observer or without a GM, and forged results do not award",async()=>{
  const f=fixture(),card=await forage(f.actor,f.source,options);
  f.actor.isOwner=false;assert.equal(await rollForagingRequest(card),undefined);f.actor.isOwner=true;
  const gm=game.users.activeGM;game.users.activeGM=null;await assert.rejects(rollForagingRequest(card),/мастер/);game.users.activeGM=gm;
  await processForagingRequest(f.actor,{card:card.id,kind:'claim',nonce:'one',user:'player'},'player');
  const message=await result(f,card);message.author=f.stranger;
  await resolveForaging(card,message);assert.equal(f.created.length,0);
  message.author=f.player;message.flags[S].foragingRoll.nonce='other';await resolveForaging(card,message);assert.equal(f.dice.length,0);
  message.flags[S].foragingRoll.nonce='one';card.author=f.player;await resolveForaging(card,message);assert.equal(f.dice.length,0);
});

test("GM can recover an interrupted display without rerolling the player's check",async()=>{
  const f=fixture([7]),card=await claimed(f),message=await result(f,card,20,{ready:false});
  await resumeForaging(card);assert.equal(message.flags[S].foragingRoll.ready,true);assert.equal(foragingState(card).status,'complete');
  assert.deepEqual(f.dice,['2d6']);assert.equal(f.created[0].system.quantity,7);
});

test("native actor/chat hooks delegate requests to the GM, and a cancelled player die releases its claim",async()=>{
  let f=fixture([7]),card=await forage(f.actor,f.source,options);
  hooks();globalThis.ui={notifications:{warn:message=>assert.fail(message)},chat:{rendered:false}};globalThis.requestAnimationFrame=fn=>setImmediate(fn);
  registerForaging();
  Hooks.call('updateActor',f.actor,{flags:{[S]:{foragingRequest:{card:card.id,kind:'claim',nonce:'one',user:'player'}}}},{},'player');
  await foragingWrite(card,async()=>{});assert.equal(foragingState(card).status,'rolling');
  const message=await result(f,card);Hooks.call('updateChatMessage',message,{});
  await foragingWrite(card,async()=>{});assert.equal(foragingState(card).status,'complete');assert.equal(f.created[0].system.quantity,7);
  f=fixture();card=await forage(f.actor,f.source,options);hooks();
  f.actor.update=async changes=>processForagingRequest(f.actor,changes[`flags.${S}.foragingRequest`],game.user.id);
  game.user=f.player;foundry.dice.Roll.prototype.toMessage=async()=>null;
  await assert.rejects(rollForagingRequest(card),/отменён/);assert.equal(foragingState(card).status,'waiting');assert.equal(f.created.length,0);
  delete globalThis.Hooks;delete globalThis.requestAnimationFrame;
});

test("GM recipient list includes distinct unlinked tokens without duplicating a linked world actor",()=>{
  const f=fixture(),other={...f.actor,uuid:'Scene.s.Token.a.Actor.a',id:'a'};
  game.actors=[f.actor];globalThis.canvas={tokens:{placeables:[{id:'linked',actor:f.actor,name:'Linked',document:{actorLink:true}},{id:'a',actor:other,name:'Бандит',document:{actorLink:false}}],controlled:[{actor:other}]}};
  const choices=foragingActors();assert.equal(choices.length,2);assert.equal(choices.find(row=>row.selected).id,other.uuid);assert.match(choices[1].name,/токен a/);
  delete globalThis.canvas;
});
