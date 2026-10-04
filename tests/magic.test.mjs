import assert from "node:assert/strict";
import {test} from "node:test";
import {CORE_SPELLS,CORE_INVOCATIONS,spellSources,spellFolders,spellRange,spellDuration,SPELL_ELEMENTS,SPELL_GRADES} from "../scripts/data/spells.mjs";
import {castingCost,focusOptions,magicFumble,roundSpent,magicRoundKey} from "../scripts/magic/rules.mjs";
import {castSpell,castingQuote,learnSpell,endConcentration,resetMagicRound} from "../scripts/magic/casting.mjs";
import {deriveStatistics,ATTRIBUTE_KEYS} from "../scripts/data/statistics.mjs";
const SYS="witcher-eliott-system";

function fixture() {
  const events=[],messages=[];
  const actor={isOwner:true,uuid:"Actor.magic",id:"mage",effects:[],items:[],system:{
    attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,8])),health:{value:40,max:40},stamina:{value:40,max:40},vigor:20,
    skills:{spellCasting:6},abilityState:{},details:{profession:"mage"},magic:{roundKey:"",spent:0,sustainedId:"",maintainedRound:""}}};
  Object.defineProperty(actor.system,"statistics",{get(){return deriveStatistics(actor.system,{items:actor.items});}});
  actor.items.get=id=>actor.items.find(item=>item.id===id);
  actor.update=async changes=>{events.push("update");for(const [path,value]of Object.entries(changes)){const keys=path.split('.');let at=actor;for(const k of keys.slice(0,-1))at=at[k];at[keys.at(-1)]=value;}};
  actor.toggleStatusEffect=async id=>{events.push(id);actor.effects.push({id,statuses:new Set([id])});};
  actor.createEmbeddedDocuments=async(_type,sources)=>sources.map((source,index)=>{const item={...source,id:`owned${actor.items.length+index}`,parent:actor};actor.items.push(item);return item;});
  const source=id=>{const row=[...CORE_SPELLS,...CORE_INVOCATIONS].find(entry=>entry.id===(id.startsWith("invocation.")?id:`spell.${id}`));return {id:row.documentId,name:row.name,type:"spell",uuid:`Compendium.spells.Item.${row.documentId}`,system:structuredClone(row.system),testUserPermission:()=>true,toObject(){return {name:this.name,type:this.type,system:structuredClone(this.system),folder:"old"};}};};
  const spell=id=>{const entry=source(id);entry.parent=actor;actor.items.push(entry);return entry;};
  const state={severity:0,cancel:false,mode:"public"};
  globalThis.game={combat:null,user:{id:"player"},settings:{get:()=>state.mode},i18n:{localize:key=>key,format:(_key,data)=>JSON.stringify(data)}};
  globalThis.ui={notifications:{error:message=>events.push(message)}};
  globalThis.foundry={applications:{ux:{TextEditor:{implementation:{enrichHTML:async html=>html}}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;this.dice=[{options:{[SYS]:{criticalChains:state.severity?[{kind:"fumble",total:-state.severity}]:[]}}}];}
      async evaluate(options){events.push("roll");this.options=options;return this;}
      async toMessage(data,options){events.push("message");if(state.cancel)return null;const message={...data,options,roll:this};messages.push(message);return message;}}},
    documents:{ChatMessage:{getSpeaker:({actor})=>({actor:actor.id}),applyMode:(data,mode)=>({...data,mode}),create:async data=>{events.push("message");messages.push(data);return data;}}}};
  return {actor,spell,source,state,events,messages};
}

test("all 65 core spells have unique identities, structured fields and stable grade folders",()=>{
  assert.equal(CORE_SPELLS.length,65);assert.equal(new Set(CORE_SPELLS.map(s=>s.id)).size,65);
  assert.deepEqual(Object.keys(SPELL_GRADES).map(grade=>CORE_SPELLS.filter(s=>s.system.grade===grade).length),[40,15,10,0]);
  for(const element of Object.keys(SPELL_ELEMENTS))assert.equal(CORE_SPELLS.filter(s=>s.system.element===element).length,13);
  for(const spell of spellSources()){assert.match(spell._id,/^[a-zA-Z0-9]{16}$/);assert.ok(spellFolders().some(f=>f._id===spell.folder));assert.ok(spell.system.description.length>35);assert.ok(spell.system.defense.length);}
  assert.equal(CORE_SPELLS.find(s=>s.id==="spell.zephyr").system.damage,"1d6");
  assert.match(CORE_SPELLS.find(s=>s.id==="spell.afan-mirror").system.description,/не могут выходить/);
  assert.match(CORE_SPELLS.find(s=>s.id==="spell.magic-healing").system.description,/3 ПЗ/);
});
test("cost counts only additional overexertion, enforces focus minimum and rejects fractional resources",()=>{
  assert.deepEqual(castingCost({cost:5,focus:2,spent:9,vigor:10}),{base:5,focus:2,stamina:3,before:9,after:12,vigor:10,excess:2,damage:10});
  assert.equal(castingCost({cost:3,spent:12,vigor:10}).damage,15);
  assert.equal(castingCost({cost:2,focus:3}).stamina,1);
  for(const cost of [-1,NaN,Infinity,1.5])assert.throws(()=>castingCost({cost}));
  assert.equal(roundSpent({roundKey:"battle:2",spent:8},"battle:3"),0);
  assert.equal(magicRoundKey({started:true,id:"battle",round:3}),"battle:3");
});

test("28 invocations share the catalog, with deity, graded folders, alternate ranges and days",()=>{
  assert.equal(CORE_INVOCATIONS.length,28);
  assert.deepEqual(Object.keys(SPELL_GRADES).map(grade=>CORE_INVOCATIONS.filter(s=>s.system.grade===grade).length),[12,6,4,6]);
  const sources=spellSources(),folders=spellFolders();
  assert.equal(new Set(sources.map(s=>s._id)).size,93);assert.equal(new Set(sources.map(s=>s.system.ruleId)).size,93);
  assert.equal(new Set(folders.map(f=>f._id)).size,folders.length);
  for(const f of folders){assert.match(f._id,/^[a-zA-Z0-9]{16}$/);if(f.folder)assert.ok(folders.some(parent=>parent._id===f.folder));}
  for(const inv of CORE_INVOCATIONS){assert.equal(inv.system.element,"mixed");assert.ok(inv.system.page>=110&&inv.system.page<=113);if(inv.system.grade==="archpriest")assert.ok(inv.system.deity);}
  assert.equal(spellRange(CORE_INVOCATIONS.find(s=>s.id==="invocation.animal-friend").system.range),"На себя / 5 м");
  assert.equal(spellDuration(CORE_INVOCATIONS.find(s=>s.id==="invocation.healing-rest").system.duration),"1 день");
  assert.deepEqual(CORE_INVOCATIONS.find(s=>s.id==="invocation.blood-boil").system.defense,["willTriple"]);
});

test("invocation variable tiers reject invalid spending before rolling; focus follows chosen tier",async()=>{
  const {actor,spell,events,messages}=fixture();actor.system.details.profession="priest";
  const item=spell("invocation.cursed-illness");
  for(const cost of [undefined,0,1,3,5,7,8,2.5])await assert.rejects(castSpell(actor,item.id,{cost}),/Стоимость/);
  assert.deepEqual(events,[]);
  actor.items.push({id:"amulet",name:"Амулет",type:"equipment",system:{carried:true,equipped:true,quantity:1,containerId:"",properties:"Фокусирующее (1)"}});
  await castSpell(actor,item.id,{cost:6,focusId:"amulet"});
  assert.equal(actor.system.stamina.value,35);assert.equal(actor.system.magic.spent,5);
  assert.match(messages[0].flavor,/Инвокация: Проклятая болезнь/);assert.match(messages[0].flavor,/6 − 1 = 5/);
});

test("invocation upkeep and mixed fumbles reuse magic state and do not spend extra Luck",async()=>{
  const {actor,spell,state,messages}=fixture();actor.system.details.profession="priest";game.combat={id:"p",started:true,round:1};
  const heal=spell("invocation.healing-blessing");await castSpell(actor,heal.id);
  assert.equal(actor.system.magic.sustainedId,heal.id);game.combat.round=2;
  await castSpell(actor,heal.id,{maintenance:true});assert.equal(actor.system.stamina.value,32);assert.equal(messages[1].flags[SYS].skipLuck,true);
  await endConcentration(actor);state.severity=7;
  await castSpell(actor,spell("invocation.cleansing-fire").id);
  assert.equal(actor.effects.length,0);assert.match(messages[2].flavor,/ведущий выбирает/);
});
test("focus comes from one equipped carried item, excludes broken/in-container gear and non-magic-users",()=>{
  const {actor}=fixture();
  const staff=(id,rating,extra={})=>({id,type:"weapon",name:id,system:{properties:`Фокусирующее (${rating}); Улучшенное фокусирующее`,quantity:1,carried:true,equipped:true,containerId:"",reliability:{value:10,max:10},...extra}});
  actor.items.push(staff("wood",1),staff("crystal",3),staff("broken",4,{reliability:{value:0,max:10}}),staff("packed",5,{equipped:false}));
  assert.deepEqual(focusOptions(actor).map(f=>[f.id,f.rating,f.greater]),[["wood",1,true],["crystal",3,true]]);
  actor.system.details.profession="witcher";assert.deepEqual(focusOptions(actor),[]);
});
test("casting reuses effective skill including armor, native exploding d10 and chat privacy, then spends once",async()=>{
  for(const mode of ["public","self","gm","blind"]){const {actor,spell,state,messages,events}=fixture();state.mode=mode;
    actor.items.push({type:"armor",id:"mail",system:{equipped:true,carried:true,quantity:1,containerId:"",encumbrance:2}});
    const item=spell("aenye");await castSpell(actor,item.id);
    assert.equal(messages[0].roll.formula,"1d10wc + 12");assert.equal(messages[0].options.messageMode,mode);assert.equal(messages[0].roll.options.allowInteractive,mode!=="blind");
    assert.equal(messages[0].flags[SYS].skipLuck,undefined,"Normal casting must use selected Luck through the native ChatMessage lifecycle");
    assert.equal(actor.system.stamina.value,35);assert.equal(actor.system.magic.spent,5);assert.equal(actor.system.health.value,40);
    assert.deepEqual(events,["roll","message","update"]);
  }
});
test("blocked, unknown, unaffordable and unconfirmed overload casts never roll or debit",async()=>{
  const {actor,spell,events}=fixture(),item=spell("aenye");
  actor.system.stamina.value=4;await assert.rejects(castSpell(actor,item.id),/Недостаточно/);
  actor.system.stamina.value=40;actor.system.vigor=0;await assert.rejects(castSpell(actor,item.id),/Подтвердите/);
  actor.effects.push({statuses:new Set(["stunned"])});await assert.rejects(castSpell(actor,item.id),/не может/);actor.effects=[];
  await assert.rejects(castSpell(actor,"missing"),/добавьте/);
  actor.isOwner=false;await castSpell(actor,item.id);assert.deepEqual(events,[]);
});
test("rapid repeated submission shares one pending cast and spends once",async()=>{
  const {actor,spell,events}=fixture(),item=spell("aenye");
  const first=castSpell(actor,item.id),second=castSpell(actor,item.id);
  assert.equal(first,second);await Promise.all([first,second]);
  assert.equal(actor.system.stamina.value,35);assert.equal(events.filter(e=>e==="roll").length,1);
});
test("natural fumble severity is independent of the skill/Luck total; post failure does not spend",async()=>{
  for(const severity of [1,6,7,9,11,26]){
    const {actor,spell,state,messages}=fixture();state.severity=severity;const item=spell("aenye");await castSpell(actor,item.id);
    assert.equal(actor.system.health.value,40-severity);assert.equal(messages[0].flags[SYS].magicCast.fumble.failed,severity>=7);
    assert.equal(actor.effects.some(e=>e.statuses.has("burning")),severity>=7);
    assert.equal(messages[0].flags[SYS].magicCast.fumble.explosion,severity>9);
  }
  const {actor,spell,state}=fixture();state.cancel=true;await assert.rejects(castSpell(actor,spell("aenye").id),/не созданы|не создано/);
  assert.equal(actor.system.stamina.value,40);assert.equal(actor.system.magic.spent,0);
});
test("overload applies only new excess and elemental condition after chat",async()=>{
  const {actor,spell,events}=fixture();actor.system.vigor=3;
  const item=spell("aenye");await castSpell(actor,item.id,{allowOverexertion:true});
  assert.equal(actor.system.health.value,30);assert.equal(actor.system.stamina.value,35);assert.deepEqual(events,["roll","message","update","burning"]);
  await castSpell(actor,item.id,{allowOverexertion:true});assert.equal(actor.system.health.value,5);assert.equal(actor.system.magic.spent,10);
});
test("concentration prevents a second spell, pays upkeep once per round without dice/Luck, survives data roundtrip",async()=>{
  const {actor,spell,events,messages}=fixture();game.combat={id:"fight",started:true,round:1};
  const item=spell("afan-mirror");await castSpell(actor,item.id);
  assert.equal(actor.system.magic.sustainedId,item.id);
  actor.system.magic=JSON.parse(JSON.stringify(actor.system.magic));
  await assert.rejects(castSpell(actor,spell("aenye").id),/поддержание/);
  await assert.rejects(castSpell(actor,item.id,{maintenance:true}),/уже оплачено/);
  game.combat.round=2;await castSpell(actor,item.id,{maintenance:true});
  assert.equal(actor.system.magic.spent,2);assert.equal(actor.system.stamina.value,35);
  assert.equal(events.filter(e=>e==="roll").length,1);assert.equal(messages[1].flags[SYS].skipLuck,true);assert.equal(messages[1].mode,"public");
  await assert.rejects(castSpell(actor,item.id,{maintenance:true}),/уже оплачено/);
  assert.throws(()=>resetMagicRound(actor),/смене раунда/);
  await endConcentration(actor);assert.equal(actor.system.magic.sustainedId,"");
  game.combat=null;await resetMagicRound(actor);assert.equal(actor.system.magic.spent,0);
});
test("catalog and drop share idempotent learning; custom spells and third-party UUIDs are preserved",async()=>{
  const {actor,source}=fixture(),spell=source("aenye");
  const [first,second]=await Promise.all([learnSpell(actor,spell),learnSpell(actor,spell)]);
  assert.equal(first,second);assert.equal(actor.items.length,1);assert.equal(first.folder,null);assert.equal(first.system.description,spell.system.description);
  const custom=source("zephyr");custom.system.ruleId="";custom.name="Свой ветер";
  await learnSpell(actor,custom);await learnSpell(actor,custom);assert.equal(actor.items.length,2);
  custom.testUserPermission=()=>false;await assert.rejects(learnSpell(actor,custom),/недоступно/);
});
test("a focus cannot be spoofed by its ID and variable costs must be set explicitly",()=>{
  const {actor,spell}=fixture(),item=spell("dispel");
  assert.throws(()=>castingQuote(actor,item),/стоимость|Стоимость/);
  assert.throws(()=>castingQuote(actor,item,{cost:2,focusId:"unknown"}),/не экипирован/);
  assert.equal(castingQuote(actor,item,{cost:2}).stamina,2);
});

test("magic consequences wait for both chat and Dice So Nice, and display listeners are released",async()=>{
  for(const chatFirst of [false,true]){
    const {actor,spell,state,messages}=fixture();state.severity=7;
    const callbacks=new Map();
    globalThis.Hooks={on:(event,fn)=>{callbacks.set(event,fn);return fn;},off:event=>callbacks.delete(event)};
    globalThis.requestAnimationFrame=fn=>setImmediate(fn);
    foundry.utils={randomID:()=>"magic-display"};game.dice3d={};ui.chat={rendered:true};
    const OldRoll=foundry.dice.Roll;foundry.dice.Roll=class extends OldRoll{
      async toMessage(data,options){const message=await super.toMessage(data,options);message.id="magic-message";message.visible=true;message._dice3danimating=true;return message;}
    };
    try {
      const work=castSpell(actor,spell("aenye").id);await new Promise(resolve=>setImmediate(resolve));
      assert.equal(actor.system.stamina.value,40);assert.equal(actor.effects.length,0);
      const render=()=>callbacks.get("renderChatMessageHTML")(messages[0]);
      const animate=()=>callbacks.get("diceSoNiceRollComplete")("magic-message");
      (chatFirst?render:animate)();await new Promise(resolve=>setImmediate(resolve));assert.equal(actor.effects.length,0);
      (chatFirst?animate:render)();await work;
      assert.equal(actor.system.stamina.value,35);assert.equal(actor.effects[0].id,"burning");assert.equal(callbacks.size,0);
    }finally{delete globalThis.Hooks;}
  }
});
