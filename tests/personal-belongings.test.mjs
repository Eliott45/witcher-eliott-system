import test from "node:test";
import assert from "node:assert/strict";
import { RANDOM_LOOT_TABLES, legacyRandomLootDescription } from "../scripts/data/random-loot.mjs";
import { rollPersonalBelongings } from "../scripts/loot/personal-belongings.mjs";
import { personalBelongingsDescriptionUpdate } from "../scripts/migrations/personal-belongings-descriptions.mjs";
import { belongingsCard, openPersonalBelongings, registerPersonalBelongings } from "../scripts/sheets/personal-belongings-window.mjs";
import { MACRO_SOURCES } from "../scripts/data/macros.mjs";

const plain = RANDOM_LOOT_TABLES.occult.find(entry => !entry.documentId);
const catalog = RANDOM_LOOT_TABLES.ordinary.find(entry => entry.documentId);

test("each d100 picks one row; equal results stack, catalogue matches come from the compendium", async () => {
  const sourced = [];
  globalThis.foundry = { utils: { fromUuid: async uuid => { sourced.push(uuid); return { type: "equipment", name: catalog.name, system: { quantity: 1 } }; } } };
  globalThis.game = { items: { fromCompendium: source => structuredClone({ ...source, system: { ...source.system } }) } };
  const rolls = [plain.min, plain.max];
  let { items, results } = await rollPersonalBelongings("occult", 2, () => rolls.shift());
  assert.equal(items.length, 1); assert.equal(items[0].system.quantity, 2);
  assert.deepEqual(results.map(row => row.roll), [plain.min, plain.max]);
  assert.equal(items[0].system.description, plain.description); assert.match(items[0].system.source, /223/);
  ({ items } = await rollPersonalBelongings("ordinary", 1, () => catalog.min));
  assert.equal(items[0].name, catalog.name); assert.ok(sourced[0].endsWith(catalog.documentId));
  await assert.rejects(rollPersonalBelongings("ordinary", 1, () => 0), /Не найден/);
});

test("the GM macro is private and the dialog refuses players", async () => {
  const macro = MACRO_SOURCES.find(entry => entry._id === "belongingsGM0001");
  assert.equal(macro.ownership.default, 0); assert.equal(macro.command, "await game.system.api.personalBelongings();");
  let warned = "";
  globalThis.game = { user: { isGM: false }, system: {} };
  globalThis.ui = { notifications: { warn: text => { warned = text; } } };
  await assert.rejects(openPersonalBelongings(), /ведущий/);
  registerPersonalBelongings();
  const original = console.error; console.error = () => {};
  try { await game.system.api.personalBelongings(); } finally { console.error = original; }
  assert.match(warned, /ведущий/);
});

test("the chat card lists every d100 and the recipient", () => {
  const card = belongingsCard("strange", [{ roll: 5, name: "Состриженные ногти" }], [{ name: "Состриженные ногти", system: { quantity: 1 } }], { name: "Бандит" });
  assert.match(card, /странные/); assert.match(card, /<b>5<\/b>/); assert.match(card, /Получает <b>Бандит<\/b>/);
});

test("possessions rolled earlier get the prose; renamed or edited ones keep theirs", () => {
  const old = { type: "equipment", name: plain.name, system: { ruleId: "", description: legacyRandomLootDescription("occult", plain.name), source: "" } };
  assert.deepEqual(personalBelongingsDescriptionUpdate(old), { "system.description": plain.description, "system.source": plain.source });
  assert.deepEqual(personalBelongingsDescriptionUpdate({ ...old, name: "Моя находка" }), {});
  assert.deepEqual(personalBelongingsDescriptionUpdate({ ...old, system: { ...old.system, description: "<p>Заметки</p>" } }), {});
  assert.deepEqual(personalBelongingsDescriptionUpdate({ ...old, system: { ...old.system, ruleId: "gear.mirror" } }), {});
});
