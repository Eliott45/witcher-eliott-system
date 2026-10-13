import test from "node:test";
import assert from "node:assert/strict";
import { RADOLF_FIRST_PAGE } from "../scripts/data/radolf-equipment.mjs";
import { CORE_GEAR } from "../scripts/data/core-equipment.mjs";
import { sharedEquipmentUpdate, migrateSharedEquipment } from "../scripts/migrations/shared-equipment.mjs";
import { circlePreview } from "../scripts/canvas/circle-preview.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";

test("shared items preserve owned quantities, custom notes and IDs while upgrading the torch", () => {
  globalThis.foundry = {data: {operators: {ForcedReplacement: class { constructor(value) { this.value = value; } }}}};
  const item = { id: "owned", type: "equipment", system: { ruleId: "gear.torch", quantity: 4, description: "Мои заметки", weight: .3 } };
  const update = sharedEquipmentUpdate(item);
  assert.equal(update.type, "weapon"); assert.equal(update.system.value.damage, "1d6");
  assert.equal(update.system.value.reliability.max, 5);
  assert.equal(update.system.value.description, "Мои заметки"); assert.equal(update.system.value.quantity, 4);
  for (const key of ["_id", "system.description", "system.weight", "system.quantity"]) assert.equal(update[key], undefined);
  assert.deepEqual(sharedEquipmentUpdate({ system: { ruleId: "radolf.rations", quantity: 6 } }), { "system.ruleId": "gear.rations" });
  const uuid = `Compendium.${SYS}.equipment.Item.rdlf000000000008`;
  assert.equal(sharedEquipmentUpdate({system: {description: `@UUID[${uuid}]`}})["system.description"], `@UUID[Compendium.${SYS}.equipment.Item.eqip000000000036]`);
});

test("marble preview follows world coordinates, uses scene scale and completely cleans up", () => {
  const calls = [], listeners = new Map();
  globalThis.PIXI = { Graphics: class {
    position = { set: (x,y) => calls.push(["position",x,y]) };
    lineStyle() { return this; } beginFill() { return this; } endFill() { return this; }
    drawCircle(x,y,r) { calls.push(["circle",x,y,r]); return this; }
    moveTo() { return this; } lineTo() { return this; }
    destroy() { calls.push("destroy"); }
  } };
  const stage = { addChild: shape => calls.push(["add",shape.eventMode]), removeChild: () => calls.push("remove"),
    on: (key,fn) => listeners.set(key,fn), off: key => listeners.delete(key) };
  globalThis.canvas = { stage };
  const clear = circlePreview({grid:{size:100,distance:2}}, {x:10,y:20}, 1);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["circle",0,0,50])));
  listeners.get("pointermove")({getLocalPosition: received => {assert.equal(received,stage);return {x:300,y:450};}});
  assert.deepEqual(calls.at(-1), ["position",300,450]); clear();
  assert.equal(listeners.size,0); assert.deepEqual(calls.slice(-2),["remove","destroy"]);
  delete globalThis.PIXI; delete globalThis.canvas;
});

test("shared migration removes only unedited catalogue duplicates, retaining player inventory and custom definitions",async()=>{
  const names=["rations","waterskin","torch"],doc=entry=>({id:entry.documentId,_id:entry.documentId,name:entry.name,type:entry.type,system:{...structuredClone(entry.system),ruleId:entry.id,quantity:1}});
  const canonical=CORE_GEAR.filter(entry=>names.includes(entry.id.slice(5))).map(doc);
  const old=RADOLF_FIRST_PAGE.filter(entry=>names.includes(entry.id.slice(7))).map(doc);
  const custom={...structuredClone(old[0]),id:"custom",_id:"custom",name:"Мой паёк"};
  const items=new Map([...canonical,...old,custom].map(item=>[item.id,item]));let version=0,deleted=[];
  const owned={...structuredClone(old[0]),id:"owned",_id:"owned",system:{...old[0].system,quantity:7,description:"Запасы игрока"}};
  const apply=(item,changes)=>{for(const [key,value] of Object.entries(changes))if(key.startsWith("system."))item.system[key.slice(7)]=value;};
  const actor={uuid:"Actor.owner",isOwner:true,items:[owned],async updateEmbeddedDocuments(_type,changes){for(const change of changes)apply(owned,change);}};
  const gm={},pack={locked:true,collection:`${SYS}.equipment`,getDocuments:async()=>[...items.values()],configure:async changes=>Object.assign(pack,changes)};
  globalThis.game={user:gm,users:{activeGM:gm},packs:new Map([[pack.collection,pack]]),items:[],actors:[actor],scenes:[],settings:{get:()=>version,set:async(_s,_k,n)=>{version=n;}}};
  globalThis.foundry={documents:{Item:{implementation:{
    updateDocuments:async changes=>{for(const change of changes)apply(items.get(change._id),change);},
    deleteDocuments:async ids=>{deleted.push(...ids);for(const id of ids)items.delete(id);}
  }}}};
  await migrateSharedEquipment();assert.deepEqual(deleted.sort(),old.map(item=>item.id).sort());
  assert.equal(items.size,4);assert.ok(items.has("custom"));assert.equal(custom.name,"Мой паёк");
  assert.equal(owned.system.ruleId,"gear.rations");assert.equal(owned.system.quantity,7);assert.equal(owned.system.description,"Запасы игрока");assert.equal(owned.id,"owned");
  assert.equal(pack.locked,true);assert.equal(version,1);
  await migrateSharedEquipment();assert.equal(deleted.length,3);
});
