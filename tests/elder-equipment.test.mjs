import {test} from "node:test";
import assert from "node:assert/strict";
import {ELDER_EQUIPMENT} from "../scripts/data/elder-equipment.mjs";
import {inventoryContext, equipItem} from "../scripts/sheets/inventory-context.mjs";
import {carriedWeight, armorEncumbrance} from "../scripts/data/physical-items.mjs";
import {equipmentEntry, filterEquipment} from "../scripts/data/equipment-search.mjs";

test("Elder catalogue includes weapons, shields, armor and individual ammunition without duplicate IDs",()=>{
  assert.equal(ELDER_EQUIPMENT.length,30);
  assert.equal(new Set(ELDER_EQUIPMENT.map(x=>x.documentId)).size,30);
  assert.deepEqual(["weapon","armor","equipment"].map(type=>ELDER_EQUIPMENT.filter(x=>x.type===type).length),[22,6,2]);
  const entries=ELDER_EQUIPMENT.map(equipmentEntry);
  assert.equal(filterEquipment(entries,{types:["shield"]}).length,3);
  assert.equal(filterEquipment(entries,{types:["weapon"]}).length,19);
  assert.equal(filterEquipment(entries,{zone:"head"}).length,5);
});

test("a full suit occupies three zones but contributes weight and encumbrance only once",async()=>{
  const suit=structuredClone(ELDER_EQUIPMENT.find(x=>x.id==="armor.mahakam-plate"));
  suit.id="suit"; Object.assign(suit.system,{equipped:true,carried:true,quantity:1,layer:0});
  const items=[suit];
  const context=inventoryContext({items,system:{}});
  assert.ok(context.zones.every(zone=>zone.items[0].id==="suit"));
  assert.equal(carriedWeight(items),30);assert.equal(armorEncumbrance(items),2);
  const helmet={id:"helmet",type:"armor",system:{zone:"head",layer:0,quantity:1,equipped:false}};
  items.push(helmet); items.get=id=>items.find(item=>item.id===id);
  const updates=[];
  const actor={uuid:"Actor.elder-test",isOwner:true,items,updateEmbeddedDocuments:async(_type,data)=>updates.push(...data)};
  await equipItem.call({actor,isEditable:true},null,{dataset:{itemId:"helmet"}});
  // A light helmet is a second layer over the heavy suit on the head; the suit stays on.
  assert.ok(!updates.some(update=>update._id==="suit"));
  assert.ok(updates.some(update=>update._id==="helmet"&&update["system.equipped"]===true));
});
