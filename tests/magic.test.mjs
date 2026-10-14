import assert from "node:assert/strict";
import {test} from "node:test";
import {CORE_MAGIC,CORE_SIGNS,CORE_RITUALS,CORE_HEXES,CORE_SPELLS,CORE_INVOCATIONS,spellSources,spellFolders,spellRange,spellDuration,SPELL_ELEMENTS,SPELL_GRADES} from "../scripts/data/spells.mjs";
import {castingCost,focusOptions,isFocusItem,magicFumble,roundSpent,magicRoundKey,maintenanceCost,ritualDifficulty,signPotency,hexIdentification} from "../scripts/magic/rules.mjs";
import {prepareMagicResult} from "../scripts/chat/magic-result.mjs";
import {castSpell,castingQuote,learnSpell,endConcentration,resetMagicRound} from "../scripts/magic/casting.mjs";
import {deriveStatistics,ATTRIBUTE_KEYS} from "../scripts/data/statistics.mjs";
const SYS="witcher-eliott-system";

function fixture() {
  const events=[],messages=[];
  const actor={isOwner:true,uuid:"Actor.magic",id:"mage",effects:[],items:[],system:{
    attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,8])),health:{value:40,max:40},stamina:{value:40,max:40},vigor:20,
    skills:{spellCasting:6,ritualCrafting:4,hexWeaving:3},abilityState:{},details:{profession:"mage"},magic:{roundKey:"",spent:0,sustainedId:"",maintainedRound:"",sustainedCost:0}}};
  Object.defineProperty(actor.system,"statistics",{get(){return deriveStatistics(actor.system,{items:actor.items});}});
  actor.items.get=id=>actor.items.find(item=>item.id===id);
  actor.update=async changes=>{events.push("update");for(const [path,value]of Object.entries(changes)){const keys=path.split('.');let at=actor;for(const k of keys.slice(0,-1))at=at[k];at[keys.at(-1)]=value;}};
  actor.toggleStatusEffect=async id=>{events.push(id);actor.effects.push({id,statuses:new Set([id])});};
  actor.createEmbeddedDocuments=async(_type,sources)=>sources.map((source,index)=>{const item={...source,id:`owned${actor.items.length+index}`,parent:actor};actor.items.push(item);return item;});
  const source=id=>{const row=CORE_MAGIC.find(entry=>entry.id===(id.includes(".")?id:`spell.${id}`));return {id:row.documentId,name:row.name,type:"spell",uuid:`Compendium.spells.Item.${row.documentId}`,system:structuredClone(row.system),testUserPermission:()=>true,toObject(){return {name:this.name,type:this.type,system:structuredClone(this.system),folder:"old"};}};};
  const spell=id=>{const entry=source(id);entry.parent=actor;actor.items.push(entry);return entry;};
  const state={severity:0,cancel:false,mode:"public",total:20,percent:50};
  const message=data=>{const msg={...data,updateSource(changes){if(changes.flavor)this.flavor=changes.flavor;if(changes[`flags.${SYS}.magicCast`])this.flags[SYS].magicCast=changes[`flags.${SYS}.magicCast`];}};prepareMagicResult(msg);messages.push(msg);return msg;};
  globalThis.game={combat:null,user:{id:"player"},settings:{get:()=>state.mode},i18n:{localize:key=>key,format:(_key,data)=>JSON.stringify(data)}};
  globalThis.ui={notifications:{error:message=>events.push(message)}};
  globalThis.foundry={applications:{ux:{TextEditor:{implementation:{enrichHTML:async html=>html}}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;this.dice=[{options:{[SYS]:{criticalChains:state.severity?[{kind:"fumble",total:-state.severity}]:[]}}}];}
      async evaluate(options){events.push("roll");this.options=options;this.total=this.formula==="1d100"?state.percent:state.total;return this;}
      async toMessage(data,options){events.push("message");if(state.cancel)return null;return message({...data,options,roll:this,rolls:[this]});}}},
    documents:{ChatMessage:{getSpeaker:({actor})=>({actor:actor.id}),applyMode:(data,mode)=>({...data,mode}),create:async data=>{events.push("message");return state.cancel?null:message({...data,rolls:data.rolls??[]});}}}};
  return {actor,spell,source,state,events,messages};
}

test("Griffin armor casts one sign at its normal cost while preserving an already spent extra action", async () => {
  const {actor,spell,messages}=fixture(),sign=spell("sign.axii");
  actor.items.push({id:"armor",type:"armor",system:{ruleId:"armor.school-griffin",equipped:true,carried:true,quantity:1,encumbrance:0}});
  actor.system.combatAction={extra:true,lastExtraRound:"fight:1"};
  const source={id:"griffin-hit",speakerActor:actor,flags:{[SYS]:{weaponAttack:{schoolGear:{armors:["griffin"],witcherWeapon:true,combat:null}}}}};
  const trigger={id:"griffin-trigger",isContentVisible:true,flags:{[SYS]:{exchange:{kind:"applied",attack:source.id,index:0,schoolCritical:true}}}};
  messages.push(source,trigger);game.messages={contents:messages,get:id=>messages.find(message=>message.id === id)};
  const schoolReaction={triggerId:trigger.id,school:"griffin"};
  const quote=castingQuote(actor,sign,{cost:4,schoolReaction});
  assert.equal(quote.action.penalty,0);assert.equal(quote.action.stamina,0);assert.equal(quote.stamina,4);
  assert.throws(()=>castingQuote(actor,spell("aenye"),{schoolReaction}),/только знак/);
  const posted=await castSpell(actor,sign.id,{cost:4,schoolReaction});
  assert.equal(posted.flags[SYS].schoolReaction.triggerId,trigger.id);
  assert.equal(actor.system.stamina.value,36);assert.equal(actor.system.combatAction.extra,true);assert.equal(actor.system.combatAction.lastExtraRound,"fight:1");
  assert.throws(()=>castingQuote(actor,sign,{cost:4,schoolReaction}),/недоступна/);
});

test("Manticore casts a sign with sword and shield; other schools must free a hand before spending stamina", async () => {
  const { actor, spell, events } = fixture(), sign = spell("sign.aard");
  actor.system.details.race = "witcher"; actor.system.lifepath = { witcher: { school: "manticore" } };
  for (const category of ["melee", "shield"]) actor.items.push({ id: category, type: "weapon", system: { category, hands: 1, quantity: 1, carried: true, equipped: true } });
  assert.equal(castingQuote(actor, sign, { cost: 2 }).stamina, 2);
  actor.system.lifepath.witcher.school = "wolf";
  await assert.rejects(castSpell(actor, sign.id, { cost: 2 }), /свободная рука/);
  assert.equal(actor.system.stamina.value, 40); assert.deepEqual(events, []);
  actor.items.get("shield").system.equipped = false;
  assert.equal(castingQuote(actor, sign, { cost: 2 }).stamina, 2);
});

test("Fury forbids a farther direct spell target before rolling and when assigning targets later, but keeps area casts",async()=>{
  const {actor,spell,events}=fixture(),item=spell("aenye");
  actor.effects.push({statuses:new Set(),flags:{[SYS]:{experimental:{kind:"fury"}}}});
  const scene={id:"fury",grid:{size:100,distance:2},tokens:[]};
  const token=(id,x,target)=>({uuid:`Scene.fury.Token.${id}`,id,x,y:0,width:1,height:1,parent:scene,actor:target,getSize:()=>({width:100,height:100})});
  const source=token("source",0,actor),near=token("near",200,{effects:[]}),far=token("far",500,{effects:[]});
  scene.tokens=[source,near,far];actor.isToken=true;actor.token=source;
  game.user.targets=new Set([{document:far}]);
  await assert.rejects(castSpell(actor,item.id),/ближайшее/);assert.deepEqual(events,[]);assert.equal(actor.system.stamina.value,40);
  const {createSpellStrikes}=await import("../scripts/magic/spell-strikes.mjs");
  await assert.rejects(createSpellStrikes(actor,item,{}),/ближайшее/);
  game.user.targets=new Set([{document:near}]);assert.equal(castingQuote(actor,item).stamina,5);
  game.user.targets.add({document:far});assert.throws(()=>castingQuote(actor,item),/ближайшее/);
  item.system.range.kind="radius";assert.equal(castingQuote(actor,item).stamina,5);
  assert.equal(castingQuote(actor,spell("tanio-ilchar")).stamina,3);
  assert.equal(castingQuote(actor,spell("magic-healing")).stamina,5);
});

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
  assert.equal(new Set(sources.map(s=>s._id)).size,124);assert.equal(new Set(sources.map(s=>s.system.ruleId)).size,124);
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
  assert.equal(actor.effects.length,0);assert.equal(messages[2].flags[SYS].magicCast.element,"mixed");assert.equal(messages[2].flags[SYS].magicCast.elemental,true);
});
test("focus comes from one equipped carried item; only mage/priest get its stamina discount",()=>{
  const {actor}=fixture();
  const staff=(id,rating,extra={})=>({id,type:"weapon",name:id,system:{properties:`Фокусирующее (${rating}); Улучшенное фокусирующее`,quantity:1,carried:true,equipped:true,containerId:"",reliability:{value:10,max:10},...extra}});
  actor.items.push(staff("wood",1),staff("crystal",3),staff("broken",4,{reliability:{value:0,max:10}}),staff("packed",5,{equipped:false}));
  assert.deepEqual(focusOptions(actor).map(f=>[f.id,f.rating,f.greater]),[["wood",1,true],["crystal",3,true]]);
  actor.system.details.profession="witcher";assert.deepEqual(focusOptions(actor).map(f=>[f.id,f.rating,f.greater]),[["wood",0,true],["crystal",0,true]]);
});
test("a worn amulet focuses magic once it is put on; runes are not worn",()=>{
  const {actor}=fixture();
  const amulet={id:"amulet",type:"equipment",name:"Простой амулет",system:{kind:"tool",properties:"Фокусирующее (1)",quantity:1,carried:true,equipped:false,containerId:""}};
  const rune={id:"veles",type:"equipment",name:"Руна Велес",system:{kind:"upgrade",properties:"Улучшенное фокусирующее",quantity:1,carried:true,containerId:""}};
  actor.items.push(amulet,rune);
  assert.equal(isFocusItem(amulet),true);assert.equal(isFocusItem(rune),false);
  assert.equal(isFocusItem({type:"equipment",system:{kind:"tool",properties:""}}),false);
  assert.deepEqual(focusOptions(actor).map(f=>f.id),[],"An amulet in the pack does not focus");
  amulet.system.equipped=true;
  assert.deepEqual(focusOptions(actor).map(f=>[f.id,f.rating]),[["amulet",1]]);
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
test("each cast snapshots the selected glyph; only worn matching glyphs affect damage/DC and upkeep receives no new bonus",async()=>{
  const {actor,spell,messages}=fixture();
  actor.items.push({id:"coat",type:"armor",name:"Куртка",system:{quantity:1,carried:true,equipped:true,encumbrance:0,installations:[{ruleId:"glyph.fire",category:"glyph",name:"Огонь",bonuses:[]}]}});
  const fire=spell("aenye");fire.system.description="<p>Погасить огонь: СЛ 14.</p>";
  const damage=castingQuote(actor,fire,{glyphChoice:"damage"});assert.equal(damage.glyph.damageDice,1);assert.equal(damage.effectDC,0);
  await castSpell(actor,fire.id,{glyphChoice:"dc"});
  assert.equal(messages[0].flags[SYS].magicCast.glyph.dc,3);assert.match(messages[0].flavor,/СЛ 17/);
  assert.equal(messages[0].roll.formula,"1d10wc + 14");
  assert.equal(castingQuote(actor,spell("zephyr"),{glyphChoice:"damage"}).glyph.damageDice,0);
  actor.items[0].system.equipped=false;
  assert.equal(castingQuote(actor,fire,{glyphChoice:"dc"}).effectDC,0);
});
test("NPC mage casts Aenye with focus 2, spends three stamina and accumulates magic only within the current round",async()=>{
  const {actor,spell,messages}=fixture();
  actor.type="npc";actor.system.details.profession="mage";
  actor.system.vigor=10;actor.system.stamina.value=30;actor.system.skills.spellCasting=7;
  actor.items.push({id:"iron-staff",name:"Железный посох",type:"weapon",system:{ruleId:"weapon.iron-staff",properties:"Длинное; Фокусирующее (2)",
    quantity:1,carried:true,equipped:true,containerId:"",reliability:{value:15,max:15}}});
  game.combat={id:"npc-fight",started:true,round:1,combatants:[{actor}]};
  const item=spell("aenye");
  await castSpell(actor,item.id,{focusId:"iron-staff"});
  assert.equal(messages[0].roll.formula,"1d10wc + 15");
  assert.match(messages[0].flavor,/5 − 2 = 3 ВЫН/u);
  assert.equal(actor.system.stamina.value,27);assert.equal(actor.system.magic.spent,3);
  await castSpell(actor,item.id,{focusId:"iron-staff"});
  assert.equal(actor.system.stamina.value,24);assert.equal(actor.system.magic.spent,6);
  assert.equal(actor.system.magic.roundKey,"npc-fight:1");
  game.combat.round=2;
  await castSpell(actor,item.id,{focusId:"iron-staff"});
  assert.equal(actor.system.stamina.value,21);assert.equal(actor.system.magic.spent,3);
  assert.equal(actor.system.magic.roundKey,"npc-fight:2");
  assert.equal(actor.system.health.value,40);
  assert.deepEqual(messages.map(message=>message.flags[SYS].magicCast.stamina),[3,3,3]);
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

test("31 additions have distinct kinds, structured ritual reagents and complete lifting conditions",()=>{
  assert.equal(CORE_SIGNS.length,10);assert.equal(CORE_RITUALS.length,15);assert.equal(CORE_HEXES.length,6);
  for(const s of CORE_SIGNS){assert.equal(s.system.kind,"sign");assert.equal(s.system.costMax,7);}
  assert.deepEqual(CORE_RITUALS.map(s=>s.system.ritual.preparationRounds),[5,5,5,5,5,5,5,5,5,10,10,10,10,10,10]);
  assert.equal(CORE_RITUALS.find(s=>s.id==="ritual.telecommunication").system.ritual.components[0].consumed,false);
  assert.deepEqual(CORE_HEXES.map(s=>s.system.hex.danger),["low","low","medium","medium","high","high"]);
  for(const s of CORE_HEXES)assert.ok(s.system.hex.lifting.length>80);
  assert.deepEqual(hexIdentification("high"),[26,22]);
});

test("sign tiers cap at seven, allow confirmed overload and record chosen power independently of focus",async()=>{
  const {actor,spell,messages}=fixture();actor.system.vigor=2;
  const item=spell("sign.igni");
  for(const cost of [0,8,1.5])await assert.rejects(castSpell(actor,item.id,{cost,allowOverexertion:true}),/Стоимость/);
  await assert.rejects(castSpell(actor,item.id,{cost:3}),/Подтвердите/);
  await castSpell(actor,item.id,{cost:3,allowOverexertion:true});
  assert.equal(actor.system.stamina.value,37);assert.equal(actor.system.health.value,35);
  assert.match(messages[0].flavor,/Урон: 3d6/);
  assert.match(signPotency(spell("sign.yrden").system,7),/−4/);
});

test("variable sign upkeep survives reopening and charges initial cost or half rounded down",async()=>{
  for(const [name,cost,upkeep] of [["active-shield",5,5],["firestream",5,2],["firestream",1,1]]) {
    const {actor,spell}=fixture();game.combat={id:"signs",started:true,round:1};
    const item=spell(`sign.${name}`);await castSpell(actor,item.id,{cost});
    actor.system.magic=JSON.parse(JSON.stringify(actor.system.magic));assert.equal(actor.system.magic.sustainedCost,cost);
    assert.equal(maintenanceCost(item.system,cost),upkeep);game.combat.round=2;
    await castSpell(actor,item.id,{maintenance:true});assert.equal(actor.system.stamina.value,40-cost-upkeep);
    await endConcentration(actor);assert.equal(actor.system.magic.sustainedCost,0);
  }
});

test("rituals use Ritual Crafting, preparation and helpers, with their own fumble damage",async()=>{
  const {actor,spell,state,events,messages}=fixture(),item=spell("ritual.hydromancy");
  await assert.rejects(castSpell(actor,item.id),/подготовки/);assert.deepEqual(events,[]);
  assert.throws(()=>ritualDifficulty(item.system,{helpers:5}),/помощников/);
  state.severity=9;state.total=10;
  await castSpell(actor,item.id,{prepared:true,dc:18,helpers:4});
  assert.equal(messages[0].roll.formula,"1d10wc + 12");
  assert.equal(messages[0].flags[SYS].magicCast.difficulty.target,14);
  assert.equal(actor.system.health.value,35,"Ritual fumble causes damage equal to STA cost, not the fumble die");
  assert.equal(actor.system.stamina.value,35);assert.equal(actor.effects.length,0);assert.equal(actor.system.magic.sustainedId,"");
  assert.match(messages[0].flavor,/Ритуал не удался/);assert.match(messages[0].flavor,/Ингредиенты учитываются вручную/);
});

test("ritual difficulty resolves from Luck-adjusted persisted result, including exact DC",()=>{
  const cast={kind:"ritual",difficulty:{base:18,helpers:3,target:15},maintenance:false};
  const message={flags:{[SYS]:{magicCast:cast,luck:{bonus:4}}},rolls:[{total:15}],flavor:"cast",
    updateSource(changes){this.flavor=changes.flavor;this.flags[SYS].magicCast=changes[`flags.${SYS}.magicCast`];}};
  prepareMagicResult(message);assert.equal(message.flags[SYS].magicCast.succeeded,true);assert.match(message.flavor,/15 ≥ 15/);
  const flavor=message.flavor;prepareMagicResult(message);assert.equal(message.flavor,flavor);
});

test("telecommunication has no skill die or Luck expense, requires preparation and preserves its device",async()=>{
  const {actor,spell,events,messages}=fixture();
  await castSpell(actor,spell("ritual.telecommunication").id,{prepared:true});
  assert.equal(actor.system.stamina.value,37);assert.equal(events.includes("roll"),false);
  assert.equal(messages[0].flags[SYS].skipLuck,true);assert.equal(messages[0].flags[SYS].magicCast.succeeded,true);
  assert.match(messages[0].flavor,/Телекоммуникатор ×1 \(сохраняется\)/);
});

test("hex fumbles use a separate percentage die and never regular fumble damage or elemental effects",async()=>{
  for(const [percent,reflected]of [[1,true],[50,true],[51,false],[100,false]]){
    const {actor,spell,state,messages}=fixture();state.severity=26;state.percent=percent;
    await castSpell(actor,spell("hex.shadows").id);
    const message=messages[0];assert.equal(message.rolls.length,2);assert.equal(message.rolls[0].formula,"1d10wc + 11");
    assert.equal(message.rolls[1].formula,"1d100");assert.equal(message.flags[SYS].magicCast.reflected,reflected);
    assert.equal(actor.system.health.value,40);assert.equal(actor.effects.length,0);assert.equal(actor.system.stamina.value,36);
    assert.equal(message.flags[SYS].skipLuck,undefined,"Only the primary skill roll receives native selected Luck");
  }
  const {actor,spell,state,messages}=fixture();state.total=2;
  await castSpell(actor,spell("hex.shadows").id);assert.equal(messages[0].rolls.length,1,"Ordinary failure never rolls backlash");
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

test("direct magic can be aimed: the location's penalty lowers the casting check and the blow lands there",async()=>{
  const {actor,spell}=fixture(),aenye=spell("aenye"),zephyr=spell("zephyr");
  game.user.targets=new Set();
  const plain=castingQuote(actor,aenye),aimed=castingQuote(actor,aenye,{aim:"head"});
  assert.equal(aimed.skill.total,plain.skill.total-6);assert.deepEqual(aimed.aim,{id:"head",name:"Голова",penalty:-6});
  assert.throws(()=>castingQuote(actor,zephyr,{aim:"head"}),/не областью/);
  const {strikeAttack}=await import("../scripts/magic/spell-strikes.mjs");
  assert.equal(strikeAttack(aenye,{uuid:"T.c"},{uuid:"T.t"},{aim:"head"}).location,"head");
  assert.equal(strikeAttack(aenye,{uuid:"T.c"},{uuid:"T.t"}).location,"random");
  const igni=spell("sign.igni");
  assert.equal(strikeAttack(igni,{uuid:"T.c"},{uuid:"T.t"}).location,"torso","Igni normally strikes the torso");
});
