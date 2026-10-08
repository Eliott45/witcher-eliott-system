import test from "node:test";
import assert from "node:assert/strict";
import { canGenerateCreatureLoot, generateCreatureLoot, pendingLegacyLoot } from "../scripts/combat/creature-loot.mjs";
import { RANDOM_LOOT_TABLES } from "../scripts/data/random-loot.mjs";
import { UPGRADES } from "../scripts/data/workshop-upgrades.mjs";

const set = (object, path, value) => {
  const keys = path.split("."), key = keys.pop();
  keys.reduce((value, key) => value[key] ??= {}, object)[key] = structuredClone(value);
};
const defaultBelonging = RANDOM_LOOT_TABLES.ordinary.find(entry => !entry.documentId);
function fixture(totals = [12, 2, defaultBelonging.min, defaultBelonging.min, 3]) {
  const gm = { isGM: true, id: "gm" }, items = [{ id: "weapon", name: "Когти", type: "weapon", system: { equipped: true, quantity: 1 } }];
  items.get = id => items.find(item => item.id === id);
  const state = { rolls: [], messages: [], writes: [], created: [], deleted: [], limit: Infinity, failUpdate: false, cancel: false, totals };
  const source = id => ({ id, uuid: `Compendium.test.Item.${id}`, type: "equipment", name: `Реагент ${id}`, img: "material.svg",
    system: { ruleId: `material.${id}`, quantity: 1, kind: "material", weight: 0.1, price: 5, equipped: true },
    flags: { core: { sourceId: `Compendium.test.Item.${id}` } },
    toObject() { return { name: this.name, type: this.type, img: this.img, system: structuredClone(this.system), flags: structuredClone(this.flags) }; } });
  const references = new Map(["fixed", "random", "skilled"].map(id => { const item = source(id); return [item.uuid, item]; }));
  const row = (id, extra = {}) => ({ id, uuid: `Compendium.test.Item.${id}`, quantity: 1, formula: "", skill: "", dc: 0, attempted: false, ...extra });
  const actor = { id: "npc", uuid: "Actor.npc", type: "npc", name: "Утопец", isOwner: true, items, effects: [],
    system: { crowns: 5, creature: { lootGenerated: false, loot: [{ name: "Кроны", formula: "3d10", currency: true }, { name: "Случайные предметы", formula: "1d6", currency: false }] },
      harvest: [row("fixed"), row("random", { quantity: 0, formula: "1d6" }), row("skilled", { skill: "alchemy", dc: 16 }), row("claimed", { attempted: true, quantity: 99 })] },
    async createEmbeddedDocuments(type, data, options = {}) {
      assert.equal(type, "Item");
      const created = data.slice(0, state.limit).map(source => ({ ...structuredClone(source), id: options.keepId ? source._id : `created${state.created.length++}` }));
      items.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Item"); state.deleted.push(...ids);
      for (const id of ids) items.splice(items.findIndex(item => item.id === id), 1);
    },
    async update(update) {
      assert.ok(!("items" in update), "Never rewrite the NPC's existing equipment");
      if (state.failUpdate) throw new Error("Actor write failed");
      state.writes.push(update);
      for (const [key, value] of Object.entries(update)) set(actor, key, value);
    }
  };
  delete globalThis.Hooks;
  globalThis.game = { user: gm, users: { activeGM: gm }, settings: { get: () => "blind" }, items: { fromCompendium: source => source.toObject() } };
  globalThis.foundry = { applications:{api:{DialogV2:{prompt:async()=>state.category===false?null:"ordinary"}}}, utils: { fromUuid: async uuid => references.get(uuid), deepClone: structuredClone },
    dice: { Roll: class {
      constructor(formula) { this.formula = formula; this.dice = /\d+d\d+/u.test(formula) ? [{}] : []; }
      async evaluate({ allowInteractive }) { assert.equal(allowInteractive, false); state.rolls.push(this.formula); this.total = totals.shift(); return this; }
    } },
    documents: { ChatMessage: { getSpeaker: () => ({ actor: actor.id }), applyMode: (data, mode) => ({ ...data, mode }), create: async data => {
      state.messages.push(data); state.onMessage?.(); return state.cancel ? null : data;
    } } }
  };
  globalThis.ui = { notifications: { error: text => { throw new Error(text); } } };
  return { actor, state, references, gm, row, source };
}

test("one loot click places fixed and rolled materials in NPC inventory and leaves skilled extraction intact", async () => {
  const { actor, state } = fixture(), held = structuredClone(actor.items[0]);
  assert.equal(canGenerateCreatureLoot(actor), true);
  await generateCreatureLoot(actor);
  assert.equal(actor.system.crowns, 17);
  assert.equal(actor.system.creature.lootGenerated, true);
  assert.deepEqual(actor.items[0], held);
  assert.deepEqual(actor.items.slice(1).map(item => [item.name, item.system.quantity]), [[defaultBelonging.name, defaultBelonging.quantity*2], ["Реагент fixed", 1], ["Реагент random", 3]]);
  for (const item of actor.items.slice(2)) {
    assert.equal(item.system.equipped, false);
    assert.equal(item.system.carried, true);
    assert.equal(item.system.weight, 0.1);
    assert.ok(item.flags.core.sourceId);
  }
  assert.deepEqual(actor.system.harvest.map(row => row.attempted), [true, true, false, true]);
  assert.equal(canGenerateCreatureLoot(actor), false);
  assert.equal(state.messages[0].rolls.length, 5);
  assert.equal(state.messages[0].mode, "blind");
  assert.match(state.messages[0].content, /требуется извлечение/u);
});

test("double clicks generate loot and crowns only once", async () => {
  const { actor, state } = fixture();
  await Promise.all([generateCreatureLoot(actor), generateCreatureLoot(actor)]);
  assert.equal(state.messages.length, 1);
  assert.equal(state.writes.length, 1);
  assert.equal(actor.system.crowns, 17);
  assert.equal(actor.items.length, 4);
});

test("ambiguous loot asks its table and cancellation preserves all inventory and currency",async()=>{
  const {actor,state}=fixture();state.category=false;
  await generateCreatureLoot(actor);
  assert.equal(actor.items.length,1);assert.equal(actor.system.crowns,5);assert.equal(actor.system.creature.lootGenerated,false);assert.equal(state.messages.length,0);
});

test("random rune loot creates a real catalog rune only once",async()=>{
  const rune=UPGRADES.find(entry=>entry.id.startsWith("rune.")),{actor,state,source,references}=fixture([1,1]);
  actor.system.harvest=[];actor.system.creature.loot=[{name:"Случайная руна",formula:"1",currency:false}];
  const canonical=source(rune.documentId);canonical.name=rune.name;canonical.system.ruleId=rune.id;
  references.set(`Compendium.witcher-eliott-system.equipment.Item.${rune.documentId}`,canonical);
  await Promise.all([generateCreatureLoot(actor),generateCreatureLoot(actor)]);
  assert.equal(actor.items[1].system.ruleId,rune.id);assert.equal(actor.items[1].system.quantity,1);assert.equal(actor.items.length,2);
  assert.deepEqual(state.rolls,["1",`1d${UPGRADES.filter(entry=>entry.id.startsWith("rune.")).length}`]);
});

test("old rolled loot moves remaining materials without rerolling formulas, currency or previously claimed rows", async () => {
  const { actor, state } = fixture();
  actor.system.creature.lootGenerated = true;
  actor.system.harvest[1].quantity = 4;
  await generateCreatureLoot(actor);
  assert.deepEqual(state.rolls, []);
  assert.equal(actor.system.crowns, 5);
  assert.deepEqual(actor.items.slice(1).map(item => [item.name, item.system.quantity]), [["Реагент fixed", 1], ["Реагент random", 4]]);
  assert.equal(actor.system.harvest[2].attempted, false);
  assert.equal(canGenerateCreatureLoot(actor), false);
});

test("zero random yields make no item and cannot be rerolled", async () => {
  const { actor, state } = fixture([0]);
  actor.system.creature.loot = [];
  actor.system.harvest = [actor.system.harvest[1]];
  await generateCreatureLoot(actor);
  assert.equal(actor.items.length, 1);
  assert.equal(actor.system.harvest[0].quantity, 0);
  assert.equal(actor.system.harvest[0].attempted, true);
  await generateCreatureLoot(actor);
  assert.equal(state.rolls.length, 1);
});

test("partial item creation and final actor update failures roll back new loot without touching equipped items", async () => {
  for (const failure of ["partial", "actor"]) {
    const { actor, state } = fixture(), original = structuredClone(actor.system), held = structuredClone(actor.items[0]);
    if (failure === "partial") state.limit = 1;
    else state.failUpdate = true;
    await assert.rejects(generateCreatureLoot(actor), failure === "partial" ? /Не удалось создать все предметы/u : /Actor write failed/u);
    assert.deepEqual(actor.system, original);
    assert.deepEqual(actor.items.slice(), [held]);
    assert.ok(state.deleted.length > 0);
    assert.equal(canGenerateCreatureLoot(actor), true);
  }
});

test("missing references and cancelled chat creation do not consume any loot", async () => {
  const missing = fixture(); missing.references.clear();
  await assert.rejects(generateCreatureLoot(missing.actor), /Предмет добычи недоступен/u);
  assert.deepEqual(missing.state.rolls, []);
  assert.equal(missing.actor.system.creature.lootGenerated, false);
  const cancelled = fixture(); cancelled.state.cancel = true;
  await generateCreatureLoot(cancelled.actor);
  assert.equal(cancelled.actor.items.length, 1);
  assert.equal(cancelled.actor.system.creature.lootGenerated, false);
  assert.equal(cancelled.actor.system.harvest[0].attempted, false);
});

test("only the owning active GM can generate NPC loot", async () => {
  for (const field of ["type", "owner", "player", "secondGM"]) {
    const { actor, state } = fixture();
    if (field === "type") actor.type = "character";
    if (field === "owner") actor.isOwner = false;
    if (field === "player") game.user = { id: "player", isGM: false };
    if (field === "secondGM") {
      game.user = { id: "other", isGM: true };
      await assert.rejects(generateCreatureLoot(actor), /активный ведущий/u);
    } else await generateCreatureLoot(actor);
    assert.deepEqual(state.rolls, []);
    assert.equal(actor.system.creature.lootGenerated, false);
  }
});

test("editing loot during the roll aborts the stale award", async () => {
  const { actor, state } = fixture();
  state.onMessage = () => { actor.system.harvest[0].quantity = 9; };
  await assert.rejects(generateCreatureLoot(actor), /Список добычи изменился/u);
  assert.equal(actor.items.length, 1);
  assert.equal(actor.system.crowns, 5);
  assert.equal(actor.system.harvest[0].quantity, 9);
  assert.equal(actor.system.creature.lootGenerated, false);
});

test("personal belongings roll d100 per item, use catalog copies and stack repeated results without category placeholders", async () => {
  const catalogEntry = RANDOM_LOOT_TABLES.ordinary.find(entry => entry.documentId);
  const flavorEntry = RANDOM_LOOT_TABLES.ordinary.find(entry => !entry.documentId);
  assert.ok(catalogEntry); assert.ok(flavorEntry);
  const { actor, state, references, source } = fixture([3, catalogEntry.min, flavorEntry.min, catalogEntry.min]);
  actor.system.creature.loot = [{ name: "Обычные предметы", formula: "1d6", currency: false }];
  actor.system.harvest = [];
  const canonical = source(catalogEntry.documentId);
  canonical.name = catalogEntry.name;
  canonical.system.ruleId = catalogEntry.ruleId;
  references.set(`Compendium.witcher-eliott-system.equipment.Item.${catalogEntry.documentId}`, canonical);
  await generateCreatureLoot(actor);
  assert.deepEqual(state.rolls, ["1d6", "1d100", "1d100", "1d100"]);
  assert.equal(state.messages[0].rolls.length, 4);
  assert.equal(actor.items.length, 3);
  const picked = actor.items.find(item => item.system.ruleId === catalogEntry.ruleId);
  assert.equal(picked.system.quantity, catalogEntry.quantity * 2);
  assert.equal(picked.system.price, canonical.system.price);
  const flavor = actor.items.find(item => item.name === flavorEntry.name);
  assert.equal(flavor.system.quantity, flavorEntry.quantity);
  assert.ok(flavor.system.description.includes(flavorEntry.description));
  assert.equal(flavor.system.price, undefined);
  assert.equal(flavor.system.weight, undefined);
  assert.ok(actor.items.every(item => item.name !== "Обычные предметы"));
});

test("strange belongings alias selects its own table and a missing catalog roll never grants partial loot", async () => {
  const entry = RANDOM_LOOT_TABLES.strange.find(entry => !entry.documentId);
  const f = fixture([1, entry.min]);
  f.actor.system.creature.loot = [{ name: "Странные вещи", formula: "1d6", currency: false }];
  f.actor.system.harvest = [];
  await generateCreatureLoot(f.actor);
  assert.equal(f.actor.items[1].name, entry.name);
  const catalog = RANDOM_LOOT_TABLES.ordinary.find(entry => entry.documentId), missing = fixture([1, catalog.min]);
  missing.actor.system.creature.loot = [{ name: "Обычные предметы", formula: "1d6", currency: false }];
  missing.actor.system.harvest = [];
  await assert.rejects(generateCreatureLoot(missing.actor), /Предмет случайной добычи недоступен/u);
  assert.equal(missing.actor.items.length, 1);
  assert.equal(missing.actor.system.creature.lootGenerated, false);
  assert.deepEqual(missing.state.writes, []);
});

const legacyItem = (id = "legacy", changes = {}) => ({ id, _id: id, type: "equipment", name: "Обычные предметы", img: "icons/svg/item-bag.svg",
  system: { ruleId: "", quantity: 2, description: "<p>Добыча. Конкретные обычные предметы выбирает ведущий.</p>", ...changes },
  toObject() { return { _id: this.id, type: this.type, name: this.name, img: this.img, system: structuredClone(this.system) }; } });

test("old generic stacks resolve their existing count with d100 only, preserving crowns and similarly named manual items", async () => {
  const entry = RANDOM_LOOT_TABLES.ordinary.find(entry => !entry.documentId);
  const { actor, state } = fixture([entry.min, entry.min]);
  actor.system.harvest = [];
  const old = legacyItem(), manual = legacyItem("manual", { description: "Вещи персонажа" });
  const ruled = legacyItem("ruled", { ruleId: "custom.rule" }), empty = legacyItem("empty", { quantity: 0 });
  const ambiguous = legacyItem("ambiguous"); ambiguous.name = "Случайные предметы";
  actor.items.push(old, manual, ruled, empty, ambiguous);
  assert.deepEqual(pendingLegacyLoot(actor), [], "Unrolled NPCs are not legacy generations");
  actor.system.creature.lootGenerated = true;
  assert.deepEqual(pendingLegacyLoot(actor).map(item => item.id), [old.id]);
  assert.equal(canGenerateCreatureLoot(actor), true);
  await Promise.all([generateCreatureLoot(actor), generateCreatureLoot(actor)]);
  assert.deepEqual(state.rolls, ["1d100", "1d100"]);
  assert.equal(actor.system.crowns, 5);
  assert.equal(actor.items.get(old.id), undefined);
  for (const item of [manual, ruled, empty, ambiguous]) assert.equal(actor.items.get(item.id), item);
  assert.equal(actor.items.find(item => item.name === entry.name).system.quantity, entry.quantity * 2);
  assert.equal(canGenerateCreatureLoot(actor), false);
  assert.deepEqual(state.deleted, [old.id]);
});

test("cancelled or failed legacy resolution keeps the original placeholder, including rollback after deletion", async () => {
  const entry = RANDOM_LOOT_TABLES.ordinary.find(entry => !entry.documentId);
  for (const failure of ["cancel", "partial", "actor"]) {
    const { actor, state } = fixture([entry.min]);
    actor.system.harvest = [];
    actor.system.creature.lootGenerated = true;
    const old = legacyItem("legacy", { quantity: 1 }), saved = old.toObject();
    actor.items.push(old);
    if (failure === "cancel") { state.cancel = true; await generateCreatureLoot(actor); }
    else {
      if (failure === "partial") state.limit = 0;
      if (failure === "actor") state.failUpdate = true;
      await assert.rejects(generateCreatureLoot(actor));
    }
    assert.equal(actor.items.length, 2);
    assert.deepEqual(actor.items.get(old.id).system, saved.system);
    assert.equal(actor.items.get(old.id).name, saved.name);
    assert.equal(actor.system.crowns, 5);
    assert.equal(canGenerateCreatureLoot(actor), true);
  }
});

test("changing an old placeholder during its rolls prevents deleting or replacing the edited stack", async () => {
  const entry = RANDOM_LOOT_TABLES.ordinary.find(entry => !entry.documentId);
  const { actor, state } = fixture([entry.min]);
  actor.system.harvest = [];
  actor.system.creature.lootGenerated = true;
  const old = legacyItem("legacy", { quantity: 1 }); actor.items.push(old);
  state.onMessage = () => { old.system.description = "Обновлено ведущим"; };
  await assert.rejects(generateCreatureLoot(actor), /Список добычи изменился/u);
  assert.equal(actor.items.get(old.id), old);
  assert.equal(actor.items.length, 2);
  assert.deepEqual(state.deleted, []);
});
