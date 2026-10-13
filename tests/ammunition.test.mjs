import { RADOLF_UPGRADES, RADOLF_POTIONS, RADOLF_RECIPES } from "../scripts/data/radolf-additions.mjs";
import { CORE_GENERAL_ADDITIONS } from "../scripts/data/general-gear.mjs";
import { RADOLF_EQUIPMENT, RADOLF_FOLDER } from "../scripts/data/radolf-equipment.mjs";
import { CORE_TRANSPORT, CORE_TACK } from "../scripts/data/core-transport.mjs";
import { TOOL_RULES, LEGACY_TOOL_SOURCE } from "../scripts/data/tool-rules.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { CORE_AMMUNITION } from "../scripts/data/core-ammunition.mjs";
import { ELDER_EQUIPMENT } from "../scripts/data/elder-equipment.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { EXPERIMENTAL_DEVICES, EXPERIMENTAL_RECIPES } from "../scripts/data/experimental-devices.mjs";
import { compendiumData, compendiumFolders } from "../tools/compendium-data.mjs";
import { equipmentEntry, filterEquipment } from "../scripts/data/equipment-search.mjs";
import { inventoryContext } from "../scripts/sheets/inventory-context.mjs";
import { conditionUpdate, carriedWeight } from "../scripts/data/physical-items.mjs";
import { equipmentQuote, acquireEquipment } from "../scripts/data/equipment-purchase.mjs";
import { migrateEquipmentContent, EQUIPMENT_CONTENT_VERSION } from "../scripts/migrations/equipment-content.mjs";
import { ammunitionUpdate } from "../scripts/migrations/ammunition-data.mjs";
import { legacyMaterialProse } from "../scripts/data/material-descriptions.mjs";
import { materialUuid } from "../scripts/data/workshop-materials.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const sources = compendiumData(translations).equipment;
const folders = compendiumFolders(translations).equipment;
const diagrams = sources.filter(item => item.type === "recipe" && item.system.recipe.category === "diagram");
const pureSubstances = sources.filter(item => item.system.ruleId?.startsWith("substance."));
const radolfAdditions = sources.filter(item => item.system.ruleId.startsWith("radolf.crossbow.") || item.system.ruleId.startsWith("radolf.potion.") || item.system.ruleId.startsWith("formula.radolf."));
const experiments = sources.filter(item => [...EXPERIMENTAL_DEVICES, ...EXPERIMENTAL_RECIPES.filter(entry => entry.system.recipe.category === "formula")].some(entry => entry.id === item.system.ruleId));

test("four ammunition records reproduce the supplied table and remain separate from weapons", () => {
  const ammunition = sources.filter(item => CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId));
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

function migrationFixture({ fail = false, locked = true, startVersion = 0, elder = true, transport = true, general = true, special = true, substances = true } = {}) {
  const gm = {}, writes = [], index = new Map(), packFolders = new Map();
  let version = startVersion;
  for (const item of diagrams) index.set(item._id, structuredClone(item));
  for (const item of radolfAdditions) index.set(item._id, structuredClone(item));
  for (const item of experiments) index.set(item._id, structuredClone(item));
  for (const item of sources.filter(item => item.system.ruleId.startsWith("radolf."))) index.set(item._id, structuredClone(item));
  if (substances) for (const item of pureSubstances) index.set(item._id, structuredClone(item));
  if (elder) for (const item of sources.filter(item=>ELDER_EQUIPMENT.some(entry=>entry.id===item.system.ruleId))) index.set(item._id,structuredClone(item));
  if(transport) for(const item of sources.filter(item=>[...CORE_TRANSPORT,...CORE_TACK].some(entry=>entry.id===item.system.ruleId)))index.set(item._id,structuredClone(item));
  if (general) for (const item of sources.filter(item => CORE_GENERAL_ADDITIONS.some(entry => entry.id === item.system.ruleId))) index.set(item._id, structuredClone(item));
  if (special) for (const item of sources.filter(item => WITCHER_SPECIAL_EQUIPMENT.some(entry => entry.id === item.system.ruleId))) index.set(item._id, structuredClone(item));
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
      if (options?.pack) assert.equal(options.broadcast, false, "Core v14 peers may not have these pack documents cached");
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
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION); assert.equal(state.index.size, 52 + radolfAdditions.length + RADOLF_EQUIPMENT.length + CORE_GENERAL_ADDITIONS.length + WITCHER_SPECIAL_EQUIPMENT.length + diagrams.length + pureSubstances.length + experiments.length);
  assert.equal(state.index.get("custom-canonical").system.price, 999);
  await migrateEquipmentContent(); assert.equal(state.writes.length, 4);
});

test("content v24 adds experimental devices, all 17 exact recipes and the missing relic weapons once", async () => {
  const state = migrationFixture({ startVersion: 23 });
  for (const item of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(item._id, structuredClone(item));
  const additions = sources.filter(item => [...EXPERIMENTAL_DEVICES, ...EXPERIMENTAL_RECIPES].some(entry => entry.id === item.system.ruleId)
    || item.type === "weapon" && /Реликвия/u.test(item.system.properties ?? "") && !["weapon.wolf", "weapon.moon-blade"].includes(item.system.ruleId));
  assert.equal(additions.length, 39);
  for (const item of additions) state.index.delete(item._id);
  const customized = structuredClone(additions.find(item => item.system.ruleId === "weapon.caroline"));
  customized._id = "ownCaroline00001"; customized.name = "Мой меч"; customized.system.reliability.value = 2;
  customized.system.description = "<p>Запись игрока</p>";
  state.index.set(customized._id, customized);
  const before = structuredClone(customized);
  await migrateEquipmentContent();
  assert.equal(state.writes.find(([kind]) => kind === "items")[1], 38);
  assert.deepEqual(state.index.get(customized._id), before);
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  for (const item of EXPERIMENTAL_RECIPES) {
    const created = state.index.get(item.documentId);
    assert.equal(created.system.recipe.time, 1800);
    assert.ok(created.system.recipe.components.every(row => row.uuid && !row.substance));
  }
  const count = state.writes.length; await migrateEquipmentContent(); assert.equal(state.writes.length, count);
});

function applyUpdate(item, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("system.")) {
      const parts = key.split("."), last = parts.pop();
      parts.reduce((target, part) => target[part] ??= {}, item)[last] = value;
    }
    else if (key.startsWith("flags.")) {
      const [, scope, flag] = key.split(".");
      item.flags ??= {}; item.flags[scope] ??= {}; item.flags[scope][flag] = value;
    }
    else item[key] = value;
  }
}

test("Radolf DLC adds only missing items in its own folder and preserves an edited copy", async () => {
  const state = migrationFixture({ startVersion: 29 });
  for (const item of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(item._id, structuredClone(item));
  for (const entry of RADOLF_EQUIPMENT) state.index.delete(entry.documentId);
  const custom = { _id: "customRadolf0001", type: "equipment", name: "Мой компас", system: { ruleId: "radolf.compass", price: 777, description: "Заметки игрока" } };
  state.index.set(custom._id, custom);
  await migrateEquipmentContent();
  assert.equal(state.writes.find(([kind]) => kind === "items")[1], RADOLF_EQUIPMENT.length - 1);
  assert.equal(state.pack.folders.get(RADOLF_FOLDER.id).name, "Фургончик Родольфа");
  assert.equal(state.index.get(custom._id).system.price, 777);
  assert.equal(state.index.get(custom._id).system.description, "Заметки игрока");
  assert.equal(state.pack.locked, true);
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  const count = state.writes.length;
  await migrateEquipmentContent(); assert.equal(state.writes.length, count);
});

test("version-sixteen worlds append the missing p. 132–138 diagrams once and repair only stock helmet components", async () => {
  const state = migrationFixture({ startVersion: 16 });
  for (const item of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(item._id, structuredClone(item));
  const additions = diagrams.filter(item => ["diagram.ammunition.armor-piercing", "diagram.ammunition.broadhead"].includes(item.system.ruleId)
    || ELDER_EQUIPMENT.some(entry => item.system.ruleId === `diagram.${entry.id}`));
  assert.equal(additions.length, 32);
  for (const item of additions) state.index.delete(item._id);
  const custom = structuredClone(additions.find(item => item.system.ruleId === "diagram.ammunition.armor-piercing"));
  custom._id = "customAmmoRecipe";
  custom.name = "Мой чертёж бронебойных";
  custom.system.recipe.dc = 7;
  custom.system.recipe.investment = 777;
  state.index.set(custom._id, custom);
  const expectedCustom = structuredClone(custom);
  const helmet = [...state.index.values()].find(item => item.system.ruleId === "diagram.armor.head.9");
  const corrected = structuredClone(helmet.system.recipe.components);
  helmet.system.recipe.components = "dark-steel:4 hardened-leather:1 darkening-oil:2 drake-oil:2 linen:1 ashes:10 oil:1"
    .split(" ").map(token => { const [id, quantity] = token.split(":"); return { uuid: materialUuid(id), quantity: Number(quantity), substance: "" }; });
  helmet.system.source = "Базовая книга, стр. 130–135 / 139; errata v4";
  helmet.name = "Личный чертёж шлема";
  helmet.system.recipe.memorized = true;
  helmet.system.recipe.investment = 999;
  helmet.system.recipe.time = 42;
  helmet.system.price = 1;
  const customized = structuredClone(helmet);
  customized._id = "customHelmet";
  customized.system.recipe.components[0].quantity = 99;
  const expectedCustomized = structuredClone(customized);
  const world = structuredClone(helmet);
  const actor = uuid => ({ uuid, isOwner: true, items: [structuredClone(helmet)], async updateEmbeddedDocuments(_type, updates) {
    for (const update of updates) applyUpdate(this.items[0], update);
  } });
  const owned = actor("Actor.hero"), token = actor("Scene.s.Token.t.Actor.hero"), pregen = actor("Compendium.pregens.hero");
  game.items = [world, customized]; game.actors = [owned];
  game.scenes = [{ tokens: [{ actorLink: false, actor: token }] }];
  const pregens = { locked: true, getDocuments: async () => [pregen], async configure({ locked }) { this.locked = locked; } };
  game.packs.set("witcher-eliott-system.pregens", pregens);
  await migrateEquipmentContent();
  assert.equal(state.writes.find(([kind]) => kind === "items")[1], 31);
  for (const item of additions) assert.equal([...state.index.values()].filter(entry => entry.system.ruleId === item.system.ruleId).length, 1);
  assert.deepEqual(state.index.get(custom._id), expectedCustom);
  assert.deepEqual(customized, expectedCustomized);
  for (const item of [helmet, world, owned.items[0], token.items[0], pregen.items[0]]) {
    assert.deepEqual(item.system.recipe.components, corrected);
    assert.equal(item.system.source, "Базовая книга");
    assert.equal(item.name, "Личный чертёж шлема");
    assert.equal(item.system.recipe.memorized, true);
    assert.equal(item.system.recipe.investment, 999);
    assert.equal(item.system.recipe.time, 42);
    assert.equal(item.system.price, 1);
  }
  assert.equal(state.pack.locked, true); assert.equal(pregens.locked, true);
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  const writes = state.writes.length;
  await migrateEquipmentContent(); assert.equal(state.writes.length, writes);
});

test("version-eighteen updates ingredient signs and water essence rarity across owned copies without resetting custom art", async () => {
  const state = migrationFixture({ startVersion: 18 });
  const old = id => {
    const item = structuredClone(sources.find(item => item.system.ruleId === "material.water-essence"));
    item._id = id; item.system.rarity = "rare"; item.img = "icons/svg/item-bag.svg";
    item.system.quantity = 7; item.system.description = "Заметки игрока";
    return item;
  };
  const stock = old("stockEssence"), world = old("worldEssence"), customized = old("customEssence");
  customized.img = "my-art.webp"; customized.system.rarity = "common";
  const actor = uuid => ({ uuid, isOwner: true, items: [old("ownedEssence")], async updateEmbeddedDocuments(_type, updates) {
    for (const update of updates) applyUpdate(this.items[0], update);
  } });
  const owned = actor("Actor.alchemist"), token = actor("Scene.s.Token.t.Actor.alchemist"), pregen = actor("Compendium.pregens.alchemist");
  state.index.set(stock._id, stock); game.items = [world, customized]; game.actors = [owned];
  game.scenes = [{ tokens: [{ actorLink: false, actor: token }] }];
  game.packs.set("witcher-eliott-system.pregens", { locked: false, getDocuments: async () => [pregen] });
  await migrateEquipmentContent();
  for (const item of [stock, world, owned.items[0], token.items[0], pregen.items[0]]) {
    assert.equal(item.img, "systems/witcher-eliott-system/assets/substances/hydragenum.svg");
    assert.equal(item.system.rarity, "unique");
    assert.equal(item.system.quantity, 7);
    assert.equal(item.system.description, "Заметки игрока");
  }
  assert.equal(customized.img, "my-art.webp"); assert.equal(customized.system.rarity, "common");
  const writes = state.writes.length; await migrateEquipmentContent(); assert.equal(state.writes.length, writes);
});

test("version-eight worlds append missing pregen gear once and preserve a custom medallion", async () => {
  const state = migrationFixture({ startVersion: 8, special: false });
  for (const item of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(item._id, structuredClone(item));
  const medallion = structuredClone(sources.find(item => item.system.ruleId === "gear.witcher-medallion"));
  medallion._id = "customMedallion1";
  medallion.name = "Медальон моей школы";
  medallion.system.description = "<p>Заметки ведущего</p>";
  state.index.set(medallion._id, medallion);
  const expected = structuredClone(medallion);
  await migrateEquipmentContent();
  assert.equal(state.writes.find(([kind]) => kind === "items")[1], WITCHER_SPECIAL_EQUIPMENT.length - 1);
  assert.deepEqual(state.index.get(medallion._id), expected);
  assert.equal([...state.index.values()].filter(item => item.system.ruleId === "gear.witcher-medallion").length, 1);
  assert.equal(state.pack.locked, true);
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  const writes = state.writes.length;
  await migrateEquipmentContent();
  assert.equal(state.writes.length, writes);
});

test("version-nine cleans stock editorial text in catalog, world, actors, tokens and pregen without resetting custom notes", async () => {
  const state = migrationFixture({ startVersion: 9 });
  for (const item of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(item._id, structuredClone(item));
  const medallion = state.index.get("witchMedallion01");
  const original = medallion.system.description;
  const notes = "<p>Подарок Весемира. Заметка игрока.</p>";
  medallion.system.description += "<p>Срабатывание сообщает ведущий: обнаружение скрытых существ и магии на сцене не автоматизировано. Цена и масса в книге не приведены; нулевая масса в листе означает отсутствие указанного значения.</p>" + notes;
  medallion.name = "Личный медальон";
  medallion.system.price = 777;
  const makeActor = uuid => ({ uuid, isOwner: true, items: [structuredClone(medallion)],
    async updateEmbeddedDocuments(_type, updates) { updates.forEach(update => applyUpdate(this.items[0], update)); } });
  game.items = [structuredClone(medallion)];
  const hero = makeActor("Actor.geralt"), token = makeActor("Scene.one.Token.two.Actor.geralt"), pregen = makeActor("Compendium.pregens.geralt");
  game.actors = [hero]; game.scenes = [{ tokens: [{ actorLink: false, actor: token }] }];
  const pack = { locked: true, getDocuments: async () => [pregen], async configure({ locked }) { this.locked = locked; } };
  game.packs.set("witcher-eliott-system.pregens", pack);
  await migrateEquipmentContent();
  for (const item of [medallion, ...game.items, ...hero.items, ...token.items, ...pregen.items]) {
    assert.equal(item.system.description, original + notes);
    assert.equal(item.name, "Личный медальон"); assert.equal(item.system.price, 777);
  }
  assert.equal(pack.locked, true); assert.equal(state.pack.locked, true);
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  const writes = state.writes.length;
  await migrateEquipmentContent(); assert.equal(state.writes.length, writes);
});

test("version-seven worlds append only missing general gear and enrich stock owned copies once", async () => {
  const state = migrationFixture({ startVersion: 7, general: false });
  for (const source of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(source._id, structuredClone(source));
  const loaded = structuredClone(sources.find(item => item.system.ruleId === "gear.loaded-dice"));
  loaded._id = "customDiceCopy001"; loaded.system.price = 999;
  state.index.set(loaded._id, loaded);
  const lantern = structuredClone(sources.find(item => item.system.ruleId === "gear.lantern"));
  lantern.system.description = "<p>Базовая книга, стр. 92–93</p>";
  lantern.system.properties = "";
  state.index.set(lantern._id, lantern);
  game.items = [structuredClone(lantern)];
  const owned = structuredClone(lantern);
  game.actors = [{ uuid: "Actor.generalGear", isOwner: true, items: [owned], async updateEmbeddedDocuments(_type, updates) { updates.forEach(update => applyUpdate(owned, update)); } }];
  await migrateEquipmentContent();
  assert.equal(state.writes.find(([kind]) => kind === "items")[1], 25);
  assert.equal(state.index.get(loaded._id).system.price, 999);
  for (const item of [lantern, ...game.items, owned]) assert.match(item.system.description, /радиусе 3 м/);
  assert.equal(state.pack.locked, true);
  assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  const count = state.writes.length;
  await migrateEquipmentContent(); assert.equal(state.writes.length, count);
});

test("version-six worlds enrich existing tools in the pack and owned copies without duplicates",async()=>{
  const state=migrationFixture({startVersion:6});
  sources.filter(item=>CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId)).forEach(item=>state.index.set(item._id,structuredClone(item)));
  const tools=sources.filter(item=>TOOL_RULES[item.system.ruleId]).map(source=>({ ...structuredClone(source),system:{...source.system,description:`<p>${LEGACY_TOOL_SOURCE}</p>`,source:LEGACY_TOOL_SOURCE,properties:TOOL_RULES[source.system.ruleId].legacyProperties,concealment:"large"}}));
  tools.forEach(item=>state.index.set(item._id,item));
  game.items=[structuredClone(tools[0])];
  const owned=structuredClone(tools[1]);
  const actor={uuid:"Actor.tools",isOwner:true,items:[owned],async updateEmbeddedDocuments(_type,updates){updates.forEach(update=>applyUpdate(owned,update));}};
  game.actors=[actor];
  const before=state.index.size;
  await migrateEquipmentContent();
  assert.equal(state.index.size,before);assert.equal(state.writes.some(([type])=>type==="items"),false);
  assert.equal(state.pack.locked,true);assert.equal(state.version,EQUIPMENT_CONTENT_VERSION);
  for(const item of [...tools,...game.items,owned])assert.match(item.system.description,/Применение и правила/);
  const writes=state.writes.length;await migrateEquipmentContent();assert.equal(state.writes.length,writes);
});

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
  sources.filter(item => CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId)).forEach(item => state.index.set(item._id, { ...structuredClone(item), img: "icons/svg/arrow.svg" }));
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
  assert.equal(state.index.size, 52 + radolfAdditions.length + RADOLF_EQUIPMENT.length + CORE_GENERAL_ADDITIONS.length + WITCHER_SPECIAL_EQUIPMENT.length + diagrams.length + pureSubstances.length + experiments.length); assert.equal(state.pack.locked, true); assert.equal(state.version, EQUIPMENT_CONTENT_VERSION);
  assert.ok(Array.from(state.index.values()).filter(item=>item.system.kind==="ammunition").every(item => item.img === CORE_AMMUNITION[0].img));
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

test("version-three worlds append all thirty Elder Folk items without recreating ammunition", async () => {
  const state=migrationFixture({startVersion:3,elder:false});
  for(const item of sources.filter(item=>CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId)))state.index.set(item._id,structuredClone(item));
  await migrateEquipmentContent();
  assert.equal(state.index.size,52 + radolfAdditions.length + RADOLF_EQUIPMENT.length + CORE_GENERAL_ADDITIONS.length + WITCHER_SPECIAL_EQUIPMENT.length + diagrams.length + pureSubstances.length + experiments.length);
  assert.equal(state.writes.find(([key])=>key==="items")[1],30);
  assert.equal(state.version,EQUIPMENT_CONTENT_VERSION);
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

test("version-five worlds append transport and tack once with their own folders",async()=>{
 const state=migrationFixture({startVersion:5,transport:false});
 for(const item of sources.filter(item=>CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId)))state.index.set(item._id,structuredClone(item));
 await migrateEquipmentContent();assert.equal(state.index.size,52 + radolfAdditions.length + RADOLF_EQUIPMENT.length + CORE_GENERAL_ADDITIONS.length + WITCHER_SPECIAL_EQUIPMENT.length + diagrams.length + pureSubstances.length + experiments.length);
 assert.equal(state.writes.find(([key])=>key==="items")[1],18);
 assert.equal(state.writes.find(([key])=>key==="folders")[1],2);
 const count=state.writes.length;await migrateEquipmentContent();assert.equal(state.writes.length,count);
});

test("version-fourteen material update reaches pack, world, owned items and unlinked tokens without replacing custom notes",async()=>{
  const state=migrationFixture({startVersion:14});
  for(const item of sources.filter(item=>CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId)))state.index.set(item._id,structuredClone(item));
  const oldMaterial=id=>{
    const item=structuredClone(sources.find(item=>item.system.ruleId==='material.beast-bones'));
    item._id=id;item.system.material.location='Покупается или изготавливается';
    item.system.description=legacyMaterialProse(item.system);item.system.quantity=7;return item;
  };
  const stock=oldMaterial('stock'),world=oldMaterial('world'),owned=oldMaterial('owned'),token=oldMaterial('token'),custom=oldMaterial('custom');
  custom.system.description='<p>Заметки игрока</p>';custom.system.material.location='Мой тайник';
  state.index.set(stock._id,stock);game.items=[world,custom];
  const actor=(uuid,item)=>({uuid,isOwner:true,items:[item],updateEmbeddedDocuments:async(_type,updates)=>{for(const update of updates)applyUpdate(item,update);}});
  game.actors=[actor('Actor.a',owned)];game.scenes=[{tokens:[{actorLink:false,actor:actor('Scene.s.Token.t.Actor.t',token)}]}];
  await migrateEquipmentContent();
  for(const item of [stock,world,owned,token]){assert.equal(item.system.material.location,'Чудовища и животные');assert.match(item.system.description,/Кости, полученные/);assert.equal(item.system.quantity,7);assert.equal(item.system.price,8);}
  assert.equal(custom.system.description,'<p>Заметки игрока</p>');assert.equal(custom.system.material.location,'Мой тайник');
  assert.equal(state.version,EQUIPMENT_CONTENT_VERSION);assert.equal(state.pack.locked,true);
  const writes=state.writes.length;await migrateEquipmentContent();assert.equal(state.writes.length,writes);
});

test("version-seventeen worlds append the nine pure substances once with their signs", async () => {
  const state = migrationFixture({ startVersion: 17, substances: false });
  for (const item of sources.filter(item => CORE_AMMUNITION.some(entry => entry.id === item.system.ruleId))) state.index.set(item._id, structuredClone(item));
  assert.equal(pureSubstances.length, 9);
  await migrateEquipmentContent();
  assert.deepEqual(state.writes, [["lock", false], ["folders", 1], ["items", 9], ["lock", true]]);
  const added = [...state.index.values()].filter(item => item.system.ruleId?.startsWith("substance."));
  assert.equal(added.length, 9);
  assert.ok(added.every(item => item.img.startsWith("systems/witcher-eliott-system/assets/substances/") && item.system.material.substance && item.flags["witcher-eliott-system"].priceUnavailable));
  await migrateEquipmentContent();
  assert.equal(state.writes.length, 4);
});


test("page two and three migration adds all missing DLC items/recipes once and preserves custom entries",async()=>{
  const state=migrationFixture({startVersion:30});
  for(const item of sources.filter(item=>CORE_AMMUNITION.some(entry=>entry.id===item.system.ruleId)))state.index.set(item._id,structuredClone(item));
  const entries=[...RADOLF_UPGRADES,...RADOLF_POTIONS,...RADOLF_RECIPES];
  for(const entry of entries)state.index.delete(entry.documentId);
  const custom={_id:"customRadolf0002",name:"Мой прицел",type:"equipment",system:{ruleId:RADOLF_UPGRADES[0].id,price:777,description:"Мои заметки"}};
  state.index.set(custom._id,custom);
  await migrateEquipmentContent();
  assert.equal(state.writes.find(([kind])=>kind==="items")[1],15);
  for(const entry of entries)assert.ok([...state.index.values()].some(item=>item.system.ruleId===entry.id));
  assert.equal(state.index.get(custom._id).system.price,777);assert.equal(state.pack.locked,true);
  const count=state.writes.length;await migrateEquipmentContent();assert.equal(state.writes.length,count);
});
