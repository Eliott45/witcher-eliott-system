import { test } from "node:test";
import assert from "node:assert/strict";
import { carriedWeight, conditionUpdate, armorEncumbrance } from "../scripts/data/physical-items.mjs";
import { equipItem, inventoryContext, changeInventoryQuantity, toggleCarried } from "../scripts/sheets/inventory-context.mjs";
import { CORE_EQUIPMENT } from "../scripts/data/core-equipment.mjs";
const item = (id, type, system) => ({ id, name: id, type, system: { quantity: 1, carried: true, equipped: false, weight: 0, layer: 0, ...system } });
test("inventory weight counts quantity once, excludes storage and companions, tolerates old gear", () => {
  const items = [item("a", "weapon", { quantity: 3, weight: 0.1 }), item("b", "armor", { weight: 7, equipped: true }),
    item("c", "equipment", { weight: 30, carried: false }), item("d", "equipment", { kind: "companion", weight: 30 }), { type: "equipment", system: {} }];
  assert.equal(carriedWeight(items), 7.3);
});
test("condition changes clamp to real limits, including lowered max and negative values", () => {
  const sword = item("a", "weapon", { reliability: { value: 10, max: 15 } });
  assert.equal(conditionUpdate(sword, { "system.reliability.value": 100 })["system.reliability.value"], 15);
  assert.equal(conditionUpdate(sword, { system: { reliability: { max: 5 } } })["system.reliability.value"], 5);
  assert.equal(conditionUpdate(sword, { "system.reliability.value": -1 })["system.reliability.value"], 0);
});
test("equip switches only the same armor zone/layer; quantities and base SP remain untouched", async () => {
  const pieces = [item("old", "armor", { equipped: true, zone: "torso", encumbrance: 1 }), item("new", "armor", { zone: "torso", encumbrance: 2 }), item("head", "armor", { equipped: true, zone: "head" })];
  const actor = { isOwner: true, items: Object.assign(pieces, { get: id => pieces.find(item => item.id === id) }),
    async updateEmbeddedDocuments(_type, updates) { for (const change of updates) for (const [key,value] of Object.entries(change)) if (key.startsWith("system.")) this.items.get(change._id).system[key.slice(7)] = value; } };
  await equipItem.call({ actor, isEditable: true }, null, { dataset: { itemId: "new" } });
  assert.equal(pieces[0].system.equipped, false); assert.equal(pieces[1].system.equipped, true); assert.equal(pieces[2].system.equipped, true);
  assert.equal(armorEncumbrance(pieces), 2); assert.equal(armorEncumbrance(pieces, -2), 0);
  await equipItem.call({ actor, isEditable: false }, null, { dataset: { itemId: "new" } });
  assert.equal(pieces[1].system.equipped, true);
});
test("catalog identifiers are unique and shields have reliability instead of SP", () => {
  assert.equal(new Set(CORE_EQUIPMENT.map(item => item.id)).size, CORE_EQUIPMENT.length);
  assert.equal(new Set(CORE_EQUIPMENT.map(item => item.documentId)).size, CORE_EQUIPMENT.length);
  const shields = CORE_EQUIPMENT.filter(item => item.system.category === "shield");
  assert.equal(shields.length, 11);
  for (const shield of shields) { assert.ok(shield.system.reliability.max > 0); assert.equal(shield.system.stoppingPower, undefined); }
});

test("inventory groups include every physical kind once and retain legacy gear and modified weight", () => {
  const items = [item("legacy", "equipment", {}), item("kit", "equipment", { kind: "tool" }),
    item("upgrade", "equipment", { kind: "upgrade" }), item("mutagen", "equipment", { kind: "mutagen" }),
    item("sword", "weapon", { weight: 2, quantity: 2, installations: [{ bonuses: [{ target: "weight", value: -0.5 }] }] }),
    item("recipe", "recipe", {}), item("ability", "ability", {})];
  const context = inventoryContext({ items, system: { statistics: { carryMax: 2 } } }, { collapsed: { "inventory-gear": true } });
  assert.equal(context.weight, 3); assert.equal(context.overloaded, true); assert.equal(context.loadPercent, 100);
  assert.deepEqual(context.groups.find(group => group.id === "gear").items.map(item => item.id), ["legacy", "kit"].sort());
  assert.equal(context.groups.find(group => group.id === "gear").open, false);
  assert.equal(context.groups.flatMap(group => group.items).length, 6);
  assert.equal(new Set(context.groups.flatMap(group => group.items.map(item => item.id))).size, 6);
  items[1].sort = 100;
  assert.deepEqual(inventoryContext({ items }).groups.find(group => group.id === "gear").items.map(item => item.id), ["legacy", "kit"], "Foundry drag/drop order wins over alphabetical fallback");
});

test("quick inventory controls serialize quantity, cannot go negative, and leaving gear unequips it", async () => {
  const sword = item("sword", "weapon", { quantity: 1, equipped: true, weight: 2 });
  sword.update = async changes => { await Promise.resolve(); for (const [path, value] of Object.entries(changes)) sword.system[path.slice(7)] = value; };
  const sheet = { isEditable: true, actor: { isOwner: true, items: { get: () => sword } } };
  const target = delta => ({ dataset: { itemId: "sword", delta: String(delta) } });
  await Promise.all([changeInventoryQuantity.call(sheet, null, target(1)), changeInventoryQuantity.call(sheet, null, target(1))]);
  assert.equal(sword.system.quantity, 3);
  await toggleCarried.call(sheet, null, target(0));
  assert.equal(sword.system.carried, false); assert.equal(sword.system.equipped, false);
  assert.equal(carriedWeight([sword]), 0);
  await toggleCarried.call(sheet, null, target(0));
  assert.equal(sword.system.carried, true); assert.equal(sword.system.equipped, false);
  await Promise.all(Array.from({ length: 4 }, () => changeInventoryQuantity.call(sheet, null, target(-1))));
  assert.equal(sword.system.quantity, 0);
  await changeInventoryQuantity.call({ ...sheet, isEditable: false }, null, target(1));
  sheet.actor.isOwner = false;
  await changeInventoryQuantity.call(sheet, null, target(1));
  assert.equal(sword.system.quantity, 0);
});
