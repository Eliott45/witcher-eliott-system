import test from "node:test";
import assert from "node:assert/strict";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";

test("page 247 swords use one-handed attacks, printed reliability and existing purchase rules", () => {
  globalThis.game = {user:{}};
  for (const [id, damage, reliability, weight] of [
    ["weapon.witcher-steel-sword", "4d6+2", 15, 2.5],
    ["weapon.witcher-silver-sword", "1d6+2", 10, 1.5]
  ]) {
    const entry = structuredClone(WITCHER_SPECIAL_EQUIPMENT.find(item => item.id === id));
    const item = {...entry,id:entry.documentId,testUserPermission:()=>true,
      system:{...entry.system,ruleId:id,quantity:1,equipped:true,carried:true,grip:1}};
    assert.equal(item.system.damage, damage);
    assert.deepEqual(item.system.reliability, {value:reliability,max:reliability});
    assert.equal(item.system.weight, weight); assert.equal(item.system.enhancementSlots, 2);
    const actor = {type:"character",isOwner:true,items:[item],effects:[],
      system:{crowns:1000,skills:{swordsmanship:6},statistics:{effective:{reflex:8,body:7},modifiers:[]}}};
    const fast = weaponAttack(actor,item), strong = weaponAttack(actor,item,{mode:"strong"});
    assert.equal(fast.blocked, ""); assert.equal(fast.total, 14); assert.equal(fast.attack.count, 1);
    assert.equal(strong.total, 11); assert.equal(strong.attack.count, 1);
    assert.equal(equipmentQuote(actor,item).canAdd, true);
    assert.equal(equipmentQuote(actor,item).canBuy, false);
    item.system.price = 500;
    assert.equal(equipmentQuote(actor,item).canBuy, true);
  }
});
