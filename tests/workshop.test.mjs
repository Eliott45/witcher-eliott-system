import { SCHOOL_GEAR, SCHOOL_DIAGRAMS, SCHOOL_MATERIALS } from "../scripts/data/witcher-school-gear.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { RADOLF_UPGRADES, RADOLF_POTIONS } from "../scripts/data/radolf-additions.mjs";
import { MANTICORE_EQUIPMENT } from "../scripts/data/manticore-school.mjs";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { ALCHEMY, MUTAGENS } from "../scripts/data/workshop-alchemy.mjs";
import { UPGRADES } from "../scripts/data/workshop-upgrades.mjs";
import { RECIPES } from "../scripts/data/workshop-recipes.mjs";
import { CORE_EQUIPMENT, CORE_WEAPONS, CORE_ARMOR } from "../scripts/data/core-equipment.mjs";
import { ELDER_EQUIPMENT } from "../scripts/data/elder-equipment.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { EXPERIMENTAL_DEVICES } from "../scripts/data/experimental-devices.mjs";
import { materialPlan, repairRecipe, effectiveItem, freeSlots, oilDamage, mutationModifiers, equipmentUuid } from "../scripts/data/workshop.mjs";
import { carriedWeight, conditionUpdate } from "../scripts/data/physical-items.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
const physical=(id,ruleId,quantity,extra={})=>({id,uuid:`Actor.a.Item.${id}`,type:"equipment",system:{ruleId,quantity,carried:true,weight:.1,price:1,...extra}});

test("workshop catalog has unique canonical identities and every recipe resolves real ingredients and result",()=>{
 const catalog=[...SCHOOL_GEAR,...SCHOOL_MATERIALS,...MANTICORE_EQUIPMENT,...RADOLF_UPGRADES,...RADOLF_POTIONS,...CORE_EQUIPMENT,...MATERIALS,...ALCHEMY,...MUTAGENS,...UPGRADES,...RECIPES,...WITCHER_SPECIAL_EQUIPMENT,...EXPERIMENTAL_DEVICES];
 assert.equal(new Set(catalog.map(x=>x.id)).size,catalog.length);
 assert.equal(new Set(catalog.map(x=>x.documentId)).size,catalog.length);
 const uuids=new Map(catalog.map(x=>[equipmentUuid(x.documentId),x]));
 for(const entry of RECIPES){const r=entry.system.recipe;assert(uuids.has(r.resultUuid),entry.id);assert(r.dc>0&&r.time>0&&r.quantity>0);for(const c of r.components)assert((c.uuid&&uuids.has(c.uuid))||c.substance,entry.id);}
 // Core p.249: the witcher medallion and both witcher swords have diagrams.
 for(const item of [...CORE_WEAPONS,...CORE_ARMOR,...ELDER_EQUIPMENT,...WITCHER_SPECIAL_EQUIPMENT.filter(x=>["gear.witcher-medallion","weapon.witcher-steel-sword","weapon.witcher-silver-sword"].includes(x.id))])assert(RECIPES.some(r=>r.system.recipe.resultUuid===equipmentUuid(item.documentId)),item.id);
 assert.equal(MUTAGENS.length,12);assert.equal(ALCHEMY.filter(x=>x.system.alchemy.category==="oil").length,12);
});
test("exact components reserve before substances and cannot be double-spent; split stacks and shortages",()=>{
 const tallow=physical("tallow","material.dog-tallow",1,{material:{substance:"fulgur"}});
 const heart=physical("heart","material.golem-heart",2,{material:{substance:"fulgur"}});
 const reference={uuid:"Compendium.tallow",system:{ruleId:"material.dog-tallow"}};
 const requirements=[{substance:"fulgur",quantity:2},{uuid:reference.uuid,quantity:1}];
 const plan=materialPlan([tallow,heart],requirements,new Map([[reference.uuid,reference]]));
 assert(plan.complete);assert.deepEqual(plan.expenses,[{itemId:"tallow",quantity:1},{itemId:"heart",quantity:2}]);
 assert.equal(materialPlan([tallow],requirements,new Map([[reference.uuid,reference]])).rows[0].missing,2);
 const stored={...heart,system:{...heart.system,carried:false}};
 assert(!materialPlan([tallow,stored],requirements,new Map([[reference.uuid,reference]])).complete);
});

test("alchemy spends ordinary ingredients before free pure substances and reuses saved substances", () => {
 const pure=physical("pure","substance.rebis",1,{price:0,material:{substance:"rebis"}});
 const herb=physical("herb","material.celandine",1,{price:8,material:{substance:"rebis"}});
 const first=materialPlan([pure,herb],[{substance:"rebis",quantity:1}]);
 assert.deepEqual(first.expenses,[{itemId:"herb",quantity:1}]);
 herb.system.quantity=0;
 const next=materialPlan([pure,herb],[{substance:"rebis",quantity:1}]);
 assert.deepEqual(next.expenses,[{itemId:"pure",quantity:1}]);assert.equal(next.complete,true);
});
test("repair needs one each and DC includes runes/glyphs/armor enhancements, not independent craftsman augmentations",()=>{
 const result=repairRecipe({dc:18,components:[{uuid:"iron",quantity:5},{uuid:"wood",quantity:4}]},{system:{installations:[{category:"rune"},{category:"craftsman"},{category:"glyph"}]}});
 assert.equal(result.dc,17);assert.deepEqual(result.components.map(c=>c.quantity),[1,1]);assert.equal(result.physicalBonus,0);
});
test("upgrades derive maxima and weight without overwriting base values; condition is bounded by enhanced maximum",()=>{
 const item={...physical("a","armor",1),type:"armor"};
 item.system={...item.system,weight:2,stoppingPower:{value:7,max:5},enhancementSlots:1,installations:[{category:"armor",bonuses:[{target:"stoppingPower",value:3},{target:"weight",value:1}],properties:"fire"}]};
 assert.deepEqual(effectiveItem(item).stoppingPower,{value:7,max:8});assert.equal(item.system.stoppingPower.max,5);
 assert.equal(freeSlots(item),0);assert.equal(carriedWeight([item]),3);
 assert.deepEqual(conditionUpdate(item,{"system.stoppingPower.value":100}),{"system.stoppingPower.value":8});
 assert.equal(conditionUpdate(item,{"system.installations":[]})["system.stoppingPower.value"],5);
 item.system.installations.push({category:"craftsman",bonuses:[{target:"stoppingPower",value:2}]});
 item.system.stoppingPower.value=10;
 assert.deepEqual(effectiveItem(item).stoppingPower,{value:10,max:10},"All bonuses precede clamping");
});
test("oil only contributes against matching monster category while active, with no slot use",()=>{
 const item={system:{enhancementSlots:1,oil:{sourceUuid:"oil",expiresAt:1800,target:"necrophage",bonus:5}}};
 assert.equal(oilDamage(item,"necrophage",1799),5);assert.equal(oilDamage(item,"beast",1799),0);assert.equal(oilDamage(item,"necrophage",1800),0);assert.equal(freeSlots(item),1);
});
test("permanent mutations are independent sources, survive serialization and alter stats once without base edits",()=>{
 const mutations=[{sourceUuid:"mutagen.fiend",name:"Бес",bonuses:[{target:"attributes.body",value:1}]},{sourceUuid:"mutagen.griffin",name:"Грифон",bonuses:[{target:"meleeDamage",value:2}]}];
 const actor={attributes:Object.fromEntries(["intelligence","reflex","dexterity","body","speed","empathy","craft","will","luck"].map(x=>[x,10])),health:{value:50,max:50},mutations};
 const result=deriveStatistics(actor);assert.equal(result.adjusted.body,11);assert.equal(result.meleeDamageBonus,2);assert.equal(actor.attributes.body,10);
 assert.deepEqual(deriveStatistics(JSON.parse(JSON.stringify(actor))),result);assert.equal(mutationModifiers(mutations).length,2);
});
test("inventory transaction consumes units, creates canonical output and refunds on a failed create",async()=>{
 globalThis.foundry={utils:{deepClone:structuredClone,getProperty:(o,path)=>path.split('.').reduce((v,k)=>v[k],o)}};
 const {inventoryTransaction}=await import("../scripts/workshop/transaction.mjs");
 const material=physical("iron","material.iron",3);
 const actor={isOwner:true,items:new Map([["iron",material]]),updateEmbeddedDocuments:async(_type,updates)=>{for(const u of updates){for(const[k,v]of Object.entries(u)){if(k==="system.quantity")actor.items.get(u._id).system.quantity=v;}}},createEmbeddedDocuments:async()=>{throw Error("offline");},deleteEmbeddedDocuments:async()=>{},update:async()=>{}};
 await assert.rejects(inventoryTransaction(actor,{expenses:[{itemId:"iron",quantity:2}],creates:[{type:"weapon"}]}),/offline/);assert.equal(material.system.quantity,3);
 actor.createEmbeddedDocuments=async(_type,data)=>data.map(x=>({...x,id:"created"}));
 const [created]=await inventoryTransaction(actor,{expenses:[{itemId:"iron",quantity:2}],creates:[{type:"weapon",system:{ruleId:"weapon.dagger"}}]});
 assert.equal(material.system.quantity,1);assert.equal(created.type,"weapon");assert.equal(created.system.ruleId,"weapon.dagger");
 await assert.rejects(inventoryTransaction(actor,{expenses:[{itemId:"iron",quantity:2}]}),/Запасы/);assert.equal(material.system.quantity,1);
});

test("oil expiry also reaches unlinked scene actors and does not mutate on a non-active GM",async()=>{
 const callbacks={};globalThis.Hooks={on:(key,fn)=>callbacks[key]=fn,once:(key,fn)=>callbacks[key]=fn};
 const expiredActor=uuid=>({uuid,isOwner:true,items:[{id:"weapon",system:{oil:{sourceUuid:"oil",target:"beast",expiresAt:30}}}],updateEmbeddedDocuments:async function(_type,updates){for(const update of updates)this.items.find(i=>i.id===update._id).system.oil.sourceUuid=update["system.oil.sourceUuid"];}});
 const world=expiredActor("Actor.world"),token=expiredActor("Scene.s.Token.t.Actor.a");
 globalThis.game={actors:[world],scenes:[{tokens:[{actorLink:false,actor:token}]}],user:{isActiveGM:false},time:{worldTime:31}};
 const {registerOilExpiry,canInstall}=await import("../scripts/workshop/upgrades.mjs");registerOilExpiry();
 await callbacks.updateWorldTime();assert.equal(world.items[0].system.oil.sourceUuid,"oil");
 game.user.isActiveGM=true;await callbacks.ready();
 assert.equal(world.items[0].system.oil.sourceUuid,"");assert.equal(token.items[0].system.oil.sourceUuid,"");
 const rune=physical("r","rune",1,{kind:"upgrade",upgrade:{target:"weapon",category:"rune"}});
 assert(!canInstall({type:"weapon",system:{enhancementSlots:0}},rune));
 assert(canInstall({type:"weapon",system:{enhancementSlots:1}},rune));
});

test("workshop result notices preserve the native private/blind message mode",async()=>{
 let creation;
 globalThis.game={settings:{get:()=>"blind"}};
 globalThis.foundry={documents:{ChatMessage:{getSpeaker:()=>({actor:"qa"}),create:async(data,options)=>(creation={data,options})}}};
 const {workshopNotice}=await import("../scripts/workshop/check.mjs");
 await workshopNotice({},"result");assert.equal(creation.options.messageMode,"blind");assert.equal(creation.data.speaker.actor,"qa");
});
