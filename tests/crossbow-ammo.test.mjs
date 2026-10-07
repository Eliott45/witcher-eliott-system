import test from "node:test";
import assert from "node:assert/strict";
import { loadedBolt, loadUpdate, firedUpdate, unloadCrossbow, boltChoices } from "../scripts/combat/crossbow-ammo.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

function fixture() {
  const crossbow = { id: "xbow", name: "Ручной арбалет", type: "weapon", flags: {}, system: { skill: "crossbow", category: "ranged", loaded: false } };
  const bolts = { id: "bolts", name: "Бронебойные", img: "bolt.webp", type: "equipment", flags: {}, system: { kind: "ammunition", ruleId: "ammunition.armor-piercing", quantity: 2, properties: "Пробивающее броню" },
    toObject() { return structuredClone({ _id: this.id, name: this.name, img: this.img, type: this.type, flags: this.flags, system: this.system }); } };
  const items = [crossbow, bolts];
  const apply = rows => { for (const row of rows) { const item = items.find(entry => entry.id === row._id);
    for (const [path, value] of Object.entries(row)) { if (path === "_id") continue; const keys = path.split("."); let owner = item;
      for (const key of keys.slice(0, -1)) owner = owner[key] ??= {}; owner[keys.at(-1)] = value; } } };
  const actor = { items, async update(changes) { if (changes.items) apply(changes.items); }, async updateEmbeddedDocuments(_type, rows) { apply(rows); },
    async createEmbeddedDocuments(_type, sources) { for (const source of sources) items.push({ id: `new${items.length}`, flags: {}, ...structuredClone(source) }); } };
  return { actor, crossbow, bolts, items };
}

test("loading takes a bolt from the stack and remembers its kind; a shot spends it", async () => {
  const { actor, crossbow, bolts } = fixture();
  assert.equal(loadedBolt(crossbow), null);
  const { ammo, items } = loadUpdate(actor, crossbow, "");
  assert.equal(ammo.id, "bolts");
  await actor.update({ items });
  assert.equal(bolts.system.quantity, 1);
  assert.equal(crossbow.system.loaded, true);
  assert.equal(loadedBolt(crossbow).name, "Бронебойные");
  assert.throws(() => loadUpdate(actor, crossbow, ""), /уже заряжен/);
  await actor.update({ items: [firedUpdate(crossbow)] });
  assert.equal(crossbow.system.loaded, false);
  assert.equal(crossbow.flags[SYSTEM_ID].loadedAmmo, null);
  assert.equal(bolts.system.quantity, 1, "the shot bolt does not return");
});

test("unloading returns the bolt to its stack, or recreates the stack when it is gone", async () => {
  const { actor, crossbow, bolts, items } = fixture();
  await actor.update({ items: loadUpdate(actor, crossbow, "bolts").items });
  await unloadCrossbow(actor, crossbow);
  assert.equal(crossbow.system.loaded, false);
  assert.equal(bolts.system.quantity, 2);
  bolts.system.quantity = 1;
  await actor.update({ items: loadUpdate(actor, crossbow, "bolts").items });
  items.splice(items.indexOf(bolts), 1);
  assert.equal(boltChoices(actor).length, 0);
  assert.throws(() => loadUpdate({ items: [crossbow] }, { ...crossbow, system: { ...crossbow.system, loaded: false } }, ""), /Нет болтов/);
  await unloadCrossbow(actor, crossbow);
  const back = items.find(item => item.system?.kind === "ammunition");
  assert.equal(back.name, "Бронебойные");
  assert.equal(back.system.quantity, 1);
  assert.equal(back.system.ruleId, "ammunition.armor-piercing");
});

test("a crossbow loaded before bolts were tracked holds a standard bolt", async () => {
  const { actor, crossbow, items } = fixture();
  crossbow.system.loaded = true; items.splice(1, 1);
  assert.equal(loadedBolt(crossbow).name, "Стандартные боеприпасы");
  await unloadCrossbow(actor, crossbow);
  assert.equal(items.find(item => item.system?.kind === "ammunition").system.quantity, 1);
});
