import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { CORE_AMMUNITION } from "../scripts/data/core-ammunition.mjs";
import { compendiumData, compendiumFolders } from "../tools/compendium-data.mjs";
import { equipmentEntry, filterEquipment } from "../scripts/data/equipment-search.mjs";
import { inventoryContext } from "../scripts/sheets/inventory-context.mjs";
import { conditionUpdate, carriedWeight } from "../scripts/data/physical-items.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { migrateEquipmentContent } from "../scripts/migrations/equipment-content.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const sources = compendiumData(translations).equipment;
const folders = compendiumFolders(translations).equipment;

test("four ammunition records reproduce the supplied table and remain separate from weapons", () => {
  const ammunition = sources.filter(item => item.system.kind === "ammunition");
  assert.equal(ammunition.length, 4);
  assert.equal(new Set(ammunition.map(item => item._id)).size, 4);
  assert.deepEqual(ammunition.map(item => [item.system.damageType, item.system.rarity, item.system.weight, item.system.price]), [
    ["К", "everywhere", .5, 10], ["Д", "common", .1, 5], ["К", "common", .1, 10], ["К", "common", .1, 15]
  ]);
  for (const item of ammunition) {
    assert.equal(item.system.quantity, 1);
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

test("standard ammunition uses packs of ten consistently for purchases and carried weight", () => {
  globalThis.game = { user: {} };
  const standard = { ...CORE_AMMUNITION[0], testUserPermission: () => true };
  assert.equal(equipmentQuote({ isOwner: true, system: { crowns: 20 } }, standard, 2).cost, 20);
  standard.system = { ...standard.system, quantity: 2, carried: true };
  assert.equal(carriedWeight([standard]), 1);
  assert.equal(inventoryContext({ items: [standard], system: {} }).groups.find(group => group.id === "ammunition").items.length, 1);
  assert.deepEqual(conditionUpdate(standard, { "system.reliability.value": 20 }), { "system.reliability.value": 10 });
});

function migrationFixture({ fail = false, locked = true } = {}) {
  const gm = {}, writes = [], index = new Map(), packFolders = new Map();
  let version = 0;
  const pack = { collection: "witcher-eliott-system.equipment", locked, folders: packFolders,
    getIndex: async () => index,
    configure: async function(options) { this.locked = options.locked; writes.push(["lock", options.locked]); }
  };
  globalThis.game = { user: gm, users: { activeGM: gm }, packs: new Map([[pack.collection, pack]]),
    settings: { get: () => version, set: async (_scope, _key, value) => { version = value; } } };
  globalThis.fetch = async url => ({ ok: true, json: async () => url.endsWith("folders.json") ? folders : sources });
  globalThis.foundry = { documents: {
    Folder: { implementation: { createDocuments: async (data, options) => {
      assert.equal(options.pack, pack.collection); assert.equal(options.keepId, true);
      data.forEach(folder => packFolders.set(folder._id, folder)); writes.push(["folders", data.length]); return data;
    } } },
    Item: { implementation: { createDocuments: async (data, options) => {
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
  assert.equal(state.version, 1); assert.equal(state.index.size, 4);
  assert.equal(state.index.get("custom-canonical").system.price, 999);
  await migrateEquipmentContent(); assert.equal(state.writes.length, 4);
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
