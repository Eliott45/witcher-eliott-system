import { test } from "node:test";
import assert from "node:assert/strict";
import { isContainer, containerParent, canContain, isCarried } from "../scripts/data/containers.mjs";
import { carriedWeight, equippedItems } from "../scripts/data/physical-items.mjs";
import { available } from "../scripts/data/workshop.mjs";
import { inventoryContext, equipItem } from "../scripts/sheets/inventory-context.mjs";
import { moveItemToContainer, dropPhysicalItem } from "../scripts/sheets/container-actions.mjs";
import { upgradeLegacyContainer } from "../scripts/data/core-containers.mjs";

function fixture() {
  const make = (id, kind, weight, containerId = "") => ({ id, name: id, type: "equipment", system: { kind, weight, containerId, quantity: 1, carried: true, equipped: false, capacity: 5 } });
  const items = [make("bag", "container", 1), make("pouch", "container", 0.2, "bag"), make("ore", "material", 2, "pouch")];
  items.get = id => items.find(item => item.id === id);
  const actor = { uuid: "Actor.owner", isOwner: true, items, async updateEmbeddedDocuments(_type, changes) { for (const change of changes) await items.get(change._id).update(change); } };
  for (const item of items) {
    item.actor = actor; item.parent = actor;
    item.update = async change => { for (const [path, value] of Object.entries(change)) if (path.startsWith("system.")) item.system[path.slice(7)] = value; };
  }
  return { actor, bag: items[0], pouch: items[1], ore: items[2], items };
}
test("nested containers count every unit once; leaving the outer bag removes contents from carried weight and crafting", () => {
  const { actor, bag, pouch, ore, items } = fixture();
  ore.system.quantity = 3;
  assert.equal(carriedWeight(items), 7.2);
  const view = inventoryContext(actor);
  const root = view.groups.find(group => group.id === "container").items;
  assert.equal(root.length, 1); assert.equal(root[0].children[0].id, pouch.id);
  assert.equal(root[0].contentsWeight, 6.2); assert.equal(root[0].totalWeight, 7.2); assert.equal(root[0].overloaded, true);
  assert.equal(view.groups.find(group => group.id === "material").items.length, 0);
  bag.system.carried = false;
  assert.equal(isCarried(ore), false); assert.equal(available(ore), false); assert.equal(carriedWeight(items), 0);
  bag.system.carried = true;
  assert.equal(available(ore), true);
});
test("cycles are rejected; dangling references and corrupt old cycles remain accessible at the root", () => {
  const { actor, bag, pouch, ore, items } = fixture();
  assert.equal(canContain(bag, pouch, items), false); assert.equal(canContain(bag, bag, items), false);
  assert.equal(canContain(pouch, ore, items), false); assert.equal(canContain(ore, bag, items), true);
  bag.system.containerId = pouch.id;
  assert.equal(containerParent(bag, items), null); assert.equal(containerParent(ore, items), null);
  assert.equal(carriedWeight(items), 3.2); assert.equal(inventoryContext(actor).groups.flatMap(group => group.items).length, 3);
  pouch.system.containerId = "deleted";
  assert.equal(containerParent(pouch, items), null);
});
test("owned moves preserve Items, packing unequips, equipping takes the item out, invalid and read-only moves do nothing", async () => {
  const { actor, bag, ore, items } = fixture();
  globalThis.ui = { notifications: { warn() {} } };
  ore.type = "weapon"; ore.system.equipped = true;
  assert.equal(equippedItems(items).length, 0);
  await moveItemToContainer(actor, ore.id, bag.id);
  assert.equal(ore.system.containerId, bag.id); assert.equal(ore.system.equipped, false);
  await equipItem.call({ actor, isEditable: true }, null, { dataset: { itemId: ore.id } });
  assert.equal(ore.system.containerId, ""); assert.equal(equippedItems(items).length, 1);
  await moveItemToContainer(actor, bag.id, bag.id); assert.equal(bag.system.containerId, "");
  actor.isOwner = false; await moveItemToContainer(actor, ore.id, bag.id); assert.equal(ore.system.containerId, "");
});
test("drop handles nested owned moves and clears foreign container/equipment references when importing", async () => {
  const { actor, bag, ore } = fixture();
  const event = { target: { closest: () => ({ dataset: { itemId: bag.id } }) } };
  const sheet = { actor, _onSortItem: () => assert.fail("Dropping on a bag must not sort") };
  await dropPhysicalItem(sheet, event, ore); assert.equal(ore.system.containerId, bag.id);
  const data = { _id: "other", type: "weapon", system: { containerId: "foreign", equipped: true } };
  globalThis.game = { items: { fromCompendium: () => structuredClone(data) } };
  actor.createEmbeddedDocuments = async (_type, documents) => documents;
  const created = await dropPhysicalItem(sheet, event, { parent: { uuid: "Actor.other" } });
  assert.equal(created._id, undefined); assert.equal(created.system.containerId, bag.id); assert.equal(created.system.equipped, false);
  assert.equal(isContainer(bag), true);
});
test("only untouched canonical single bags gain book capacity; custom items and stacked bags are preserved", () => {
  const old = { ruleId: "gear.bag", kind: "gear", description: "custom notes" };
  upgradeLegacyContainer(old); assert.equal(old.kind, "container"); assert.equal(old.capacity, 20); assert.equal(old.description, "custom notes");
  old.capacity = 0; old.kind = "gear"; upgradeLegacyContainer(old); assert.equal(old.kind, "gear"); assert.equal(old.capacity, 0);
  const stack = { ruleId: "gear.bag", quantity: 3 }; upgradeLegacyContainer(stack); assert.equal(stack.kind, undefined); assert.equal(stack.quantity, 3);
});
test("document guards reject containment cycles and deleting a bag preserves its children", async () => {
  globalThis.foundry = { documents: { Item: class { async _preUpdate() {} async _preDelete() {} async _preCreate() {} } } };
  globalThis.ui = { notifications: { warn() {} } };
  const { WitcherItem } = await import("../scripts/documents/witcher-item.mjs");
  const { actor, bag, pouch, ore, items } = fixture();
  const doc = Object.assign(new WitcherItem(), pouch);
  const invalid = { "system.containerId": pouch.id };
  assert.equal(await doc._preUpdate(invalid, {}, {}), false);
  bag.system.carried = false;
  await doc._preDelete({}, {});
  assert.equal(items.length, 3); assert.equal(ore.system.containerId, bag.id);
  assert.equal(ore.system.carried, false); assert.equal(isCarried(ore), false);
  const update = { "system.quantity": 8 }; await doc._preUpdate(update, {}, {}); assert.equal(update["system.quantity"], 1);
  assert.equal(actor.items.get(ore.id), ore);
});
