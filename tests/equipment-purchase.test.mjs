import assert from "node:assert/strict";
import { test } from "node:test";
import { acquireEquipment, equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { inventoryWrite } from "../scripts/data/inventory-writes.mjs";

function fixture(crowns = 100, price = 25) {
  globalThis.game = { user: {}, items: { fromCompendium: source => structuredClone({ _id: "source", name: source.name, type: source.type, system: source.system }) } };
  const source = { name: "Тестовый предмет", type: "weapon", system: { price, quantity: 9, equipped: true, carried: false, containerId: "old-bag", ruleId: "weapon.test" }, testUserPermission: () => true };
  let nextId = 0;
  const actor = { isOwner: true, system: { crowns }, items: new Map(),
    async createEmbeddedDocuments(_type, data) {
      const created = data.map(row => ({ ...row, id: String(++nextId) }));
      created.forEach(item => this.items.set(item.id, item));
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) { ids.forEach(id => this.items.delete(id)); },
    async update(data) { this.system.crowns = data["system.crowns"]; }
  };
  return { actor, source };
}

test("catalog adds for free and buys the requested quantity at unit price, without copying equipment/container state", async () => {
  const { actor, source } = fixture();
  const [added] = await acquireEquipment(actor, source, { quantity: 2 });
  assert.equal(actor.system.crowns, 100);
  assert.equal(added.system.quantity, 2);
  assert.equal(added.system.equipped, false);
  assert.equal(added.system.carried, true);
  assert.equal(added.system.containerId, "");
  assert.equal(added.system.ruleId, "weapon.test");
  assert.equal(added._id, undefined);
  await acquireEquipment(actor, source, { purchase: true, quantity: 4 });
  assert.equal(actor.system.crowns, 0);
  assert.equal(actor.items.size, 2);
  assert.equal(source.system.quantity, 9);
  await assert.rejects(acquireEquipment(actor, source, { purchase: true }), /Недостаточно крон/);
  assert.equal(actor.items.size, 2);
});

test("catalog serializes concurrent purchases and reads the live balance instead of the displayed quote", async () => {
  const { actor, source } = fixture(25);
  const results = await Promise.allSettled([acquireEquipment(actor, source, { purchase: true }), acquireEquipment(actor, source, { purchase: true })]);
  assert.deepEqual(results.map(row => row.status), ["fulfilled", "rejected"]);
  assert.equal(actor.system.crowns, 0); assert.equal(actor.items.size, 1);
  actor.system.crowns = 50;
  assert.equal(equipmentQuote(actor, source).canBuy, true);
  actor.system.crowns = 0;
  await assert.rejects(acquireEquipment(actor, source, { purchase: true }), /Недостаточно/);
});

test("invalid amounts, prices, access and stacked containers cannot be bought; decimal crowns remain exact", async () => {
  const { actor, source } = fixture(.3, .1);
  await acquireEquipment(actor, source, { purchase: true, quantity: 3 });
  assert.equal(actor.system.crowns, 0);
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) await assert.rejects(acquireEquipment(actor, source, { purchase: true, quantity }), /Количество/);
  for (const price of [-1, NaN, Infinity]) {
    source.system.price = price;
    await assert.rejects(acquireEquipment(actor, source, { purchase: true }), /цена/);
  }
  source.type = "equipment"; source.system.kind = "container";
  await assert.rejects(acquireEquipment(actor, source, { quantity: 2 }), /Контейнеры/);
  source.testUserPermission = () => false;
  await assert.rejects(acquireEquipment(actor, source), /недоступен/);
  actor.isOwner = false;
  await assert.rejects(acquireEquipment(actor, source), /доступа/);
  assert.equal(actor.items.size, 1);
});

test("failed creation never charges crowns; failed payment removes the created item and the queue recovers", async () => {
  const { actor, source } = fixture();
  const create = actor.createEmbeddedDocuments;
  actor.createEmbeddedDocuments = async () => { throw new Error("create failed"); };
  await assert.rejects(acquireEquipment(actor, source, { purchase: true }), /create failed/);
  assert.equal(actor.system.crowns, 100); assert.equal(actor.items.size, 0);
  actor.createEmbeddedDocuments = create;
  const update = actor.update;
  actor.update = async () => { throw new Error("payment failed"); };
  await assert.rejects(acquireEquipment(actor, source, { purchase: true }), /payment failed/);
  assert.equal(actor.system.crowns, 100); assert.equal(actor.items.size, 0);
  actor.update = update;
  await acquireEquipment(actor, source, { purchase: true });
  assert.equal(actor.system.crowns, 75); assert.equal(actor.items.size, 1);
});

test("ownership revoked while a purchase is queued prevents both creation and a false success", async () => {
  const { actor, source } = fixture();
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const preceding = inventoryWrite(actor, () => gate);
  const buying = acquireEquipment(actor, source, { purchase: true });
  actor.isOwner = false;
  unblock(); await preceding;
  await assert.rejects(buying, /доступа/);
  assert.equal(actor.system.crowns, 100); assert.equal(actor.items.size, 0);
});
