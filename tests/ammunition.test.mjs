import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { CORE_AMMUNITION } from "../scripts/data/core-ammunition.mjs";
import { compendiumData, compendiumFolders } from "../tools/compendium-data.mjs";
import { equipmentEntry, filterEquipment } from "../scripts/data/equipment-search.mjs";
import { inventoryContext } from "../scripts/sheets/inventory-context.mjs";
import { conditionUpdate, carriedWeight } from "../scripts/data/physical-items.mjs";
import { equipmentQuote, acquireEquipment } from "../scripts/data/equipment-purchase.mjs";
import { migrateEquipmentContent } from "../scripts/migrations/equipment-content.mjs";
import { ammunitionUpdate } from "../scripts/migrations/ammunition-data.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const sources = compendiumData(translations).equipment;
const folders = compendiumFolders(translations).equipment;

test("four ammunition records reproduce the supplied table and remain separate from weapons", () => {
  const ammunition = sources.filter(item => item.system.kind === "ammunition");
  assert.equal(ammunition.length, 4);
  assert.equal(new Set(ammunition.map(item => item._id)).size, 4);
  assert.deepEqual(ammunition.map(item => [item.system.damageType, item.system.rarity, item.system.weight, item.system.price]), [
    ["К", "everywhere", .05, 1], ["Д", "common", .1, 5], ["К", "common", .1, 10], ["К", "common", .1, 15]
  ]);
  for (const item of ammunition) {
    assert.equal(item.system.quantity, item.system.ruleId === "ammunition.standard" ? 10 : 1);
    assert.deepEqual(item.system.reliability, { value: 10, max: 10 });
    assert.equal(item.system.concealment, "large");
    assert.equal(folders.find(folder => folder._id === item.folder).name, "Боеприпасы");
  }
  const entries = ammunition.map(equipmentEntry);
  assert.equal(filterEquipment(entries, { types: ["weapon"] }).length, 0);
  assert.equal(filterEquipment(entries, { types: ["ammunition"] }).length, 4);
  assert.equal(filterEquipment(entries, { traits: ["Пробивающее броню"] }).length, 1);
  assert.match(entries[2].traitDetails.find(trait => trait.label === "Кровопускающее (100%)").description, /кровотечение/);
});

test("standard ammunition buys packs of ten but counts individual projectiles and their weight", () => {
  globalThis.game = { user: {} };
  const standard = { ...CORE_AMMUNITION[0], testUserPermission: () => true };
  assert.equal(equipmentQuote({ isOwner: true, system: { crowns: 20 } }, standard, 2).cost, 20);
  assert.equal(equipmentQuote({ isOwner: true, system: { crowns: 20 } }, standard, 2).units, 20);
  standard.system = { ...standard.system, quantity: 20, carried: true };
  assert.equal(carriedWeight([standard]), 1);
  assert.equal(inventoryContext({ items: [standard], system: {} }).groups.find(group => group.id === "ammunition").items.length, 1);
  assert.deepEqual(conditionUpdate(standard, { "system.reliability.value": 20 }), { "system.reliability.value": 10 });
});

function migrationFixture({ fail = false, locked = true, startVersion = 0 } = {}) {
  const gm = {}, writes = [], index = new Map(), packFolders = new Map();
  let version = startVersion;
  const pack = { collection: "witcher-eliott-system.equipment", locked, folders: packFolders,
    getIndex: async () => index,
    getDocument: async id => index.get(id),
    configure: async function(options) { this.locked = options.locked; writes.push(["lock", options.locked]); }
  };
  globalThis.game = { user: gm, users: { activeGM: gm }, packs: new Map([[pack.collection, pack]]), items: [], actors: [], scenes: [],
    settings: { get: () => version, set: async (_scope, _key, value) => { version = value; } } };
  globalThis.fetch = async url => ({ ok: true, json: async () => url.endsWith("folders.json") ? folders : sources });
  globalThis.foundry = { documents: {
    Folder: { implementation: { createDocuments: async (data, options) => {
      assert.equal(options.pack, pack.collection); assert.equal(options.keepId, true);
      data.forEach(folder => packFolders.set(folder._id, folder)); writes.push(["folders", data.length]); return data;
    } } },
    Item: { implementation: { updateDocuments: async (data, options) => {
      const items = options?.pack ? index : new Map(game.items.map(item => [item._id, item]));
      for (const update of data) applyUpdate(items.get(update._id), update);
      writes.push([options?.pack ? "updates" : "world", data.length]); return data;
    }, createDocuments: async (data, options) => {
      assert.equal(options.pack, pack.collection); assert.equal(options.keepId, true); assert.equal(pack.locked, false);
      if (fail) throw new Error("write failed");
      data.forEach(item => index.set(item._id, item)); writes.push(["items", data.length]); return data;
    } } }
  } };
  return { gm, pack, index, writes, get version() { return version; } };
}

test("content update appends only missing ammunition, keeps edited entries and restores pack locking", async () => {
  const state = migrationFixture();
  state.index.set("custom-canonical", { _id: "custom-canonical", name: "Мои стрелы", system: { ruleId: CORE_AMMUNITION[0].id, price: 999 } });
  game.user = {};
  await migrateEquipmentContent(); assert.deepEqual(state.writes, []);
  game.user = state.gm;
  await migrateEquipmentContent();
  assert.deepEqual(state.writes, [["lock", false], ["folders", 1], ["items", 3], ["lock", true]]);
  assert.equal(state.version, 2); assert.equal(state.index.size, 4);
  assert.equal(state.index.get("custom-canonical").system.price, 999);
  await migrateEquipmentContent(); assert.equal(state.writes.length, 4);
});

function applyUpdate(item, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("system.")) item.system[key.slice(7)] = value;
    else if (key.startsWith("flags.")) {
      const [, scope, flag] = key.split(".");
      item.flags ??= {}; item.flags[scope] ??= {}; item.flags[scope][flag] = value;
    }
    else item[key] = value;
  }
}

test("old packs convert once, preserving total value/weight, custom art and names", () => {
  const old = { _id: "old", type: "equipment", name: "Мои стрелы", img: "custom.webp", system: {
    ruleId: "ammunition.standard", quantity: 3, price: 12, weight: .6, reliability: { value: 7, max: 10 }, containerId: "bag", description: "Мои заметки"
  } };
  applyUpdate(old, ammunitionUpdate(old));
  assert.equal(old.system.quantity, 30); assert.equal(old.system.price, 1.2); assert.equal(old.system.weight, .06);
  assert.equal(old.system.purchaseQuantity, 10); assert.equal(old.img, "custom.webp"); assert.equal(old.name, "Мои стрелы");
  assert.equal(old.system.description, "Мои заметки"); assert.equal(old.system.containerId, "bag"); assert.equal(old.system.reliability.value, 7);
  assert.deepEqual(ammunitionUpdate(old), {});
  old.system.purchaseQuantity = 1;
  assert.deepEqual(ammunitionUpdate(old), {}, "Changing the selling pack size later must not multiply stock again");
  assert.deepEqual(ammunitionUpdate({ ...old, system: { ruleId: "custom" }, img: "icons/svg/arrow.svg" }), {});
});

test("version-one worlds repair pack, world, actor and unlinked token copies without duplication", async () => {
  const state = migrationFixture({ startVersion: 1 });
  sources.filter(item => item.system.kind === "ammunition").forEach(item => state.index.set(item._id, { ...structuredClone(item), img: "icons/svg/arrow.svg" }));
  const old = { _id: "old", name: "Стандартные (×10)", img: "icons/svg/arrow.svg", type: "equipment", system: { ruleId: "ammunition.standard", quantity: 1, price: 10, weight: .5 } };
  const standard = state.index.get(CORE_AMMUNITION[0].documentId);
  Object.assign(standard, structuredClone({ ...old, flags: {}, _id: standard._id }));
  game.items = [structuredClone(old)];
  const actor = uuid => ({ uuid, isOwner: true, items: [structuredClone(old)], async updateEmbeddedDocuments(_type, updates) { updates.forEach(update => applyUpdate(this.items.find(item => item._id === update._id), update)); } });
  const worldActor = actor("Actor.one"), synthetic = actor("Scene.one.Token.one.Actor.two");
  game.actors = [worldActor]; game.scenes = [{ tokens: [{ actorLink: false, actor: synthetic }, { actorLink: true, actor: worldActor }] }];
  await migrateEquipmentContent();
  for (const item of [standard, game.items[0], worldActor.items[0], synthetic.items[0]]) {
    assert.equal(item.system.quantity, 10); assert.equal(item.system.weight, .05); assert.equal(item.system.price, 1);
    assert.equal(item.img, CORE_AMMUNITION[0].img); assert.equal(item.name, "Стандартные боеприпасы");
  }
  assert.equal(state.index.size, 4); assert.equal(state.pack.locked, true); assert.equal(state.version, 2);
  assert.ok(Array.from(state.index.values()).every(item => item.img === CORE_AMMUNITION[0].img));
  await migrateEquipmentContent(); assert.equal(worldActor.items[0].system.quantity, 10);
});

test("adding and buying one/two standard packs creates ten/twenty units and charges only pack prices", async () => {
  game = { user: {}, items: { fromCompendium: source => structuredClone({ name: source.name, type: source.type, system: source.system }) } };
  const source = { ...CORE_AMMUNITION[0], testUserPermission: () => true };
  const actor = { isOwner: true, system: { crowns: 30 }, async createEmbeddedDocuments(_type, data) { return data; }, async update(update) { this.system.crowns = update["system.crowns"]; } };
  const [added] = await acquireEquipment(actor, source);
  assert.equal(added.system.quantity, 10); assert.equal(actor.system.crowns, 30); assert.equal(carriedWeight([added]), .5);
  const [bought] = await acquireEquipment(actor, source, { purchase: true, quantity: 2 });
  assert.equal(bought.system.quantity, 20); assert.equal(actor.system.crowns, 10); assert.equal(carriedWeight([bought]), 1);
  const [last] = await acquireEquipment(actor, source, { purchase: true });
  assert.equal(last.system.quantity, 10); assert.equal(actor.system.crowns, 0);
  await assert.rejects(acquireEquipment(actor, source, { purchase: true }), /Недостаточно/);
});

test("failed live content update restores lock and does not mark migration complete", async () => {
  const state = migrationFixture({ fail: true });
  await assert.rejects(migrateEquipmentContent(), /write failed/);
  assert.equal(state.pack.locked, true); assert.equal(state.version, 0);
  const unlocked = migrationFixture({ locked: false });
  await migrateEquipmentContent();
  assert.equal(unlocked.pack.locked, false);
  assert.equal(unlocked.writes.some(([action]) => action === "lock"), false);
});

test("creating or dropping an old pack normalizes once while new individual stacks stay unchanged", async () => {
  foundry = { documents: { Item: class { async _preCreate() {} updateSource(update) { applyUpdate(this, update); } } } };
  const { WitcherItem } = await import("../scripts/documents/witcher-item.mjs");
  const source = sources.find(item => item.system.ruleId === "ammunition.standard");
  const current = Object.assign(new WitcherItem(), structuredClone(source));
  await current._preCreate({}, {}, {});
  assert.equal(current.system.quantity, 10);
  const legacy = Object.assign(new WitcherItem(), structuredClone(source), { flags: {}, img: "icons/svg/arrow.svg" });
  Object.assign(legacy.system, { quantity: 2, purchaseQuantity: 1, price: 10, weight: .5 });
  await legacy._preCreate({}, {}, {});
  assert.equal(legacy.system.quantity, 20); assert.equal(legacy.system.price, 1); assert.equal(legacy.img, source.img);
  legacy.system.purchaseQuantity = 1;
  await legacy._preCreate({}, {}, {});
  assert.equal(legacy.system.quantity, 20);
});
