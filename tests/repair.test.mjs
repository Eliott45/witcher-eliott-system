import test from "node:test";
import assert from "node:assert/strict";
import { disassemblyYield, disassemblyBlocker, disassembleItem, repairContext, repairDC } from "../scripts/workshop/repair.mjs";
import { inventoryTransaction } from "../scripts/workshop/transaction.mjs";
import { PURE_SUBSTANCES, MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { SUBSTANCES } from "../scripts/data/workshop.mjs";
import { materialDescriptionDetails } from "../scripts/data/material-descriptions.mjs";

const SOURCE = "Compendium.witcher-eliott-system.equipment.Item.sword00000000001";
function fixture({ weapon = {}, recipe = {}, confirm = true } = {}) {
  const notices = [], dialogs = [], references = new Map();
  let serial = 0;
  const set = (object, path, value) => { const keys = path.split("."), last = keys.pop(); keys.reduce((o, k) => o[k] ??= {}, object)[last] = value; };
  const item = (id, type = "equipment", extra = {}) => ({ id, uuid: `Actor.smith.Item.${id}`, documentName: "Item", name: id, type, img: "icons/svg/sword.svg",
    system: { ruleId: id, quantity: 8, carried: true, price: 1, weight: 1, ...extra }, testUserPermission: () => true,
    toObject() { return { _id: this.id, name: this.name, type: this.type, system: structuredClone(this.system) }; }
  });
  const iron = item("iron"), wood = item("wood");
  references.set("Item.iron", iron); references.set("Item.wood", wood);
  const sword = { ...item("sword", "weapon", { quantity: 1, equipped: false, reliability: { value: 0, max: 10 }, installations: [], ...weapon }), _stats: { compendiumSource: SOURCE } };
  const diagram = item("diagram", "recipe", { quantity: 1, recipe: { category: "diagram", resultUuid: SOURCE, quantity: 1, dc: 16, time: 600, tools: [], forge: false,
    components: [{ uuid: "Item.iron", quantity: 5, substance: "" }, { uuid: "Item.wood", quantity: 1, substance: "" }, { uuid: "Item.iron", quantity: 2, substance: "" }], ...recipe } });
  const items = [iron, wood, sword, diagram];
  items.get = id => items.find(i => i.id === id);
  const actor = { uuid: "Actor.smith", isOwner: true, items, effects: [], system: { details: {} },
    async updateEmbeddedDocuments(_type, updates) { for (const update of updates) for (const [key, value] of Object.entries(update)) if (key !== "_id") set(items.get(update._id), key, value); return updates; },
    async createEmbeddedDocuments(_type, data) { const created = data.map(source => Object.assign(item(source._id ?? `created${serial++}`, source.type, structuredClone(source.system)), { name: source.name })); items.push(...created); return created; },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) items.splice(items.findIndex(i => i.id === id), 1); }
  };
  for (const entry of items) entry.parent = actor;
  globalThis.game = { user: {}, settings: { get: () => "private" }, items: { fromCompendium: source => source.toObject() } };
  globalThis.foundry = { utils: { fromUuid: async uuid => references.get(uuid), deepClone: structuredClone, getProperty: (o, p) => p.split(".").reduce((v, k) => v?.[k], o) },
    applications: { api: { DialogV2: { confirm: async config => { dialogs.push(config); return confirm; } } } },
    documents: { ChatMessage: { getSpeaker: () => ({}), create: async data => { notices.push(data); return data; } } } };
  return { actor, sword, iron, wood, diagram, notices, dialogs };
}

test("disassembly returns half of each diagram component, at least one, once per kind", () => {
  assert.deepEqual(disassemblyYield([{ uuid: "a", quantity: 5 }, { uuid: "b", quantity: 1 }, { uuid: "a", quantity: 2 }, { uuid: "", substance: "rebis", quantity: 4 }]),
    [{ uuid: "a", quantity: 3 }, { uuid: "b", quantity: 1 }]);
  assert.deepEqual(disassemblyYield([{ uuid: "c", quantity: 9 }]), [{ uuid: "c", quantity: 4 }]);
});

test("repair DC is the diagram DC − 5 plus 2 per rune, glyph or armor enhancement, not per craftsman modification", () => {
  const recipe = { dc: 16 };
  assert.equal(repairDC(recipe, { system: { installations: [] } }), 11);
  assert.equal(repairDC(recipe, { system: { installations: [{ category: "rune" }, { category: "glyph" }, { category: "craftsman" }] } }), 15);
});

test("disassembling a weapon removes it and returns the halved components without a check", async () => {
  const f = fixture();
  await disassembleItem(f.actor, f.sword);
  assert.equal(f.actor.items.get("sword"), undefined);
  const created = f.actor.items.filter(item => item.id.startsWith("created"));
  assert.deepEqual(created.map(item => [item.system.ruleId, item.system.quantity]), [["iron", 3], ["wood", 1]]);
  assert.match(f.notices[0].content, /разобрано/);
});

test("declined, equipped, plated and incomplete batches are never taken apart", async () => {
  let f = fixture({ confirm: false });
  await disassembleItem(f.actor, f.sword);
  assert.ok(f.actor.items.get("sword"));
  f = fixture({ weapon: { equipped: true } });
  await assert.rejects(disassembleItem(f.actor, f.sword), /снимите/);
  f = fixture({ weapon: { installations: [{ category: "armor", name: "Накладка" }] } });
  await assert.rejects(disassembleItem(f.actor, f.sword), /накладки/);
  f = fixture({ weapon: { quantity: 2 }, recipe: { quantity: 3 } });
  await assert.rejects(disassembleItem(f.actor, f.sword), /вся партия/);
  assert.equal(f.dialogs.length, 0);
  f = fixture({ weapon: { quantity: 4 }, recipe: { quantity: 3 } });
  await disassembleItem(f.actor, f.sword);
  assert.equal(f.actor.items.get("sword").system.quantity, 1, "One batch of a larger stack is used");
  assert.equal(disassemblyBlocker({ type: "equipment", system: { kind: "ammunition", reliability: { value: 1, max: 1 } } }, {}), "Разобрать можно только оружие, щит или часть брони.");
});

test("repair panel lists damaged weapons with their DC and one unit of each component", async () => {
  const f = fixture({ weapon: { installations: [{ category: "rune", name: "Руна", bonuses: [] }] } });
  const view = await repairContext(f.actor);
  assert.equal(view.rows.length, 1);
  assert.equal(view.broken, 1);
  assert.equal(view.rows[0].dc, 13);
  assert.equal(view.rows[0].ready, false, "Components that only exist in the catalog are not counted as carried");
  assert.equal(view.candidates.length, 1);
  f.sword.system.reliability.value = 10;
  assert.equal((await repairContext(f.actor)).rows.length, 0);
});

test("a failed write restores a deleted item with its original ID", async () => {
  const f = fixture();
  f.actor.createEmbeddedDocuments = async function(_type, data, options) {
    if (!options?.keepId) throw new Error("create failed");
    return data.map(source => { const restored = { ...source, id: source._id, system: source.system }; f.actor.items.push(restored); return restored; });
  };
  await assert.rejects(inventoryTransaction(f.actor, { deletes: ["sword"], creates: [{ name: "x", type: "equipment", system: {} }] }), /create failed/);
  assert.equal(f.actor.items.get("sword").system.reliability.max, 10);
});

test("nine pure substances use the printed signs, carry no invented price and explain their origin", () => {
  assert.equal(PURE_SUBSTANCES.length, 9);
  assert.deepEqual(PURE_SUBSTANCES.map(entry => entry.system.material.substance), SUBSTANCES.map(entry => entry.id));
  assert.ok(PURE_SUBSTANCES.every(entry => entry.img.endsWith(`${entry.system.material.substance}.svg`) && entry.flags["witcher-eliott-system"].priceUnavailable));
  assert.equal(new Set(MATERIALS.map(entry => entry.documentId)).size, MATERIALS.length);
  assert.match(materialDescriptionDetails({ ...PURE_SUBSTANCES[0].system, ruleId: PURE_SUBSTANCES[0].id }), /Чистая субстанция[\s\S]*vitriol\.svg/);
  const barley = MATERIALS.find(entry => entry.id === "material.barley");
  assert.match(materialDescriptionDetails(barley.system), /Субстанция<\/dt><dd><span class="witcher-substance-badge"[^>]*><img src="systems\/witcher-eliott-system\/assets\/substances\/vitriol\.svg"/);
});
