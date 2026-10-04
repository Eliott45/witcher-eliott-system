import { test } from "node:test";
import assert from "node:assert/strict";
import { equipmentEntry, filterEquipment } from "../scripts/data/equipment-search.mjs";
import { postItem } from "../scripts/sheets/item-presentation.mjs";

const entry = (id, type, system) => equipmentEntry({ uuid: id, name: id, type, system: { weight: 1, price: 10, properties: "", ...system } });
test("equipment search separates shields, combines property/range filters and preserves numeric sort", () => {
  const entries = [entry("Sword", "weapon", { category: "melee", hands: 1, properties: "Пробивающее броню; Сбалансированное" }),
    entry("Shield", "weapon", { category: "shield", hands: 1, price: 100 }),
    entry("Armor", "armor", { zone: "head", armorClass: "light", rarity: "rare", price: 20 })];
  assert.deepEqual(filterEquipment(entries, { types: ["weapon"] }).map(e => e.label), ["Sword"]);
  assert.deepEqual(filterEquipment(entries, { types: ["shield"] }).map(e => e.label), ["Shield"]);
  assert.deepEqual(filterEquipment(entries, { query: "пробивающее", traits: ["Сбалансированное"], priceMax: 10 }).map(e => e.label), ["Sword"]);
  assert.equal(filterEquipment(entries, { priceMax: 0 }).length, 0);
  assert.deepEqual(filterEquipment(entries, { traits: ["Щиты", "Лёгкая броня"], traitMode: "any", sort: "price", descending: true }).map(e => e.label), ["Shield", "Armor"]);
  assert.equal(filterEquipment(entries, { traits: ["Щиты", "Лёгкая броня"] }).length, 0);
  assert.deepEqual(filterEquipment(entries, { rarities: ["rare"], zone: "head", armorClass: "light" }).map(e => e.label), ["Armor"]);
});
test("posting an item uses native chat privacy and never includes secret description blocks", async () => {
  let enrichment, rendered, posted;
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globalThis.game = { settings: { get: (_scope, key) => { assert.equal(key, "messageMode"); return "gm"; } } };
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { enrichHTML: async (_html, options) => { enrichment = options; return "Public description"; } } } },
    handlebars: { renderTemplate: async (_path, data) => { rendered = data; return "card"; } } },
    documents: { ChatMessage: { getSpeaker: () => ({ actor: "owner" }), implementation: { applyMode: (data, mode) => { data.messageMode = mode; }, create: async data => { posted = data; } } } } };
  const item = { isOwner: true, type: "equipment", name: "Bag", system: { kind: "gear", properties: "", description: "Secret content" } };
  await postItem.call({ item });
  assert.equal(enrichment.secrets, false); assert.equal(rendered.description, "Public description");
  assert.equal(posted.messageMode, "gm"); assert.equal(posted.rolls, undefined);
  posted = null; item.isOwner = false;
  await postItem.call({ item }); assert.equal(posted, null);
});
