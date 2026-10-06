import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { completePregenLoadout, pendingPregenItems } from "../scripts/migrations/pregen-loadouts.mjs";

const sources = JSON.parse(await readFile(new URL("../pack-sources/pregens.json", import.meta.url), "utf8"));
const shortages = { "letho-of-gulet": ["bomb.northern-wind", "bomb.devils-puffball"],
  "yennefer-of-vengerberg": ["gear.ritual-pouch"], "triss-merigold": ["gear.ritual-pouch"] };
const set = (object, path, value) => {
  const keys = path.split("."), key = keys.pop();
  for (const part of keys) object = object[part] ??= {};
  object[key] = structuredClone(value);
};
function oldActor(id) {
  const actor = structuredClone(sources.find(source => source.flags[SYSTEM_ID].pregen.id === id));
  const missing = actor.items.filter(item => shortages[id].includes(item.system.ruleId));
  actor.flags[SYSTEM_ID].pregen.revision = 1;
  actor.flags[SYSTEM_ID].pregen.missing = missing.map(item => ({ name: item.name, quantity: item.system.quantity }));
  actor.items = actor.items.filter(item => !missing.includes(item));
  actor.items.forEach(item => { item.id = item._id; if (item.system.containerId === "gearRitualBag001") item.system.containerId = ""; });
  actor.system.biography.sessionNotes = `Мои заметки.\n\nВ каталоге пока отсутствуют и не добавлены в инвентарь: ${actor.flags[SYSTEM_ID].pregen.missing.map(item => `${item.name} ×${item.quantity}`).join("; ")}.\n\nПродолжение заметок.`;
  actor.name = `Моя версия: ${actor.name}`;
  actor.system.health.value = 17; actor.isOwner = true;
  actor.mode = "success"; actor.created = [];
  actor.createEmbeddedDocuments = async (type, rows) => {
    assert.equal(type, "Item");
    if (actor.mode === "failure") throw new Error("offline");
    const result = (actor.mode === "partial" ? rows.slice(0,1) : rows).map(row => {
      assert.equal(row._id, undefined);
      const item = { ...structuredClone(row), id: `new${actor.created.length}`, _id: `new${actor.created.length}` };
      actor.created.push(item); actor.items.push(item); return item;
    });
    return result;
  };
  actor.updateEmbeddedDocuments = async (type, rows) => {
    assert.equal(type, "Item");
    for (const row of rows) for (const [key, value] of Object.entries(row)) if (key !== "_id") set(actor.items.find(item => item.id === row._id), key, value);
  };
  actor.update = async patch => { for (const [key, value] of Object.entries(patch)) set(actor, key, value); };
  return actor;
}

test("explicit pregen shortages are completed once while names, notes, HP and existing gear survive", async () => {
  for (const id of Object.keys(shortages)) {
    const actor = oldActor(id), before = actor.items.map(item => [item.id, item.system.quantity]);
    await completePregenLoadout(actor, sources);
    assert.equal(actor.created.length, shortages[id].length);
    assert.deepEqual(actor.flags[SYSTEM_ID].pregen.missing, []);
    assert.equal(actor.flags[SYSTEM_ID].pregen.revision, 2);
    assert.equal(actor.system.health.value, 17); assert.ok(actor.name.startsWith("Моя версия:"));
    assert.equal(actor.system.biography.sessionNotes, "Мои заметки.\n\nПродолжение заметок.");
    assert.deepEqual(actor.items.slice(0, before.length).map(item => [item.id, item.system.quantity]), before);
    actor.items = actor.items.filter(item => !actor.created.includes(item));
    await completePregenLoadout(actor, sources);
    assert.equal(actor.created.length, shortages[id].length, "deleted or used gear is never restocked");
  }
});

test("an already supplied bomb stack keeps its current count, including an empty stack", async () => {
  for (const quantity of [0, 1, 5]) {
    const actor = oldActor("letho-of-gulet"), existing = structuredClone(sources.at(-1).items.find(item => item.system.ruleId === "bomb.northern-wind"));
    existing._id = existing.id = "custom-bomb"; existing.name = "Переименованная бомба"; existing.system.quantity = quantity;
    actor.items.push(existing);
    await completePregenLoadout(actor, sources);
    assert.equal(actor.created.length, 1); assert.equal(existing.system.quantity, quantity);
    assert.equal(actor.created[0].system.quantity, 3);
  }
});

test("ritual ingredients use the newly assigned pouch ID without moving already organized contents", async () => {
  const actor = oldActor("yennefer-of-vengerberg"), dust = actor.items.find(item => item.system.ruleId === "material.infused-dust");
  dust.system.containerId = "custom-container";
  await completePregenLoadout(actor, sources);
  const pouch = actor.created[0];
  assert.notEqual(pouch.id, "gearRitualBag001");
  assert.equal(dust.system.containerId, "custom-container");
  for (const ruleId of ["material.fifth-essence", "gear.chalk"]) assert.equal(actor.items.find(item => item.system.ruleId === ruleId).system.containerId, pouch.id);
});

test("failed and partial item creation leave shortages retryable without duplicating the first bomb", async () => {
  const actor = oldActor("letho-of-gulet");
  actor.mode = "failure";
  await assert.rejects(completePregenLoadout(actor, sources), /offline/);
  assert.equal(actor.flags[SYSTEM_ID].pregen.revision, 1);
  actor.mode = "partial";
  await assert.rejects(completePregenLoadout(actor, sources), /не все предметы/);
  assert.equal(actor.created.length, 1); assert.equal(actor.flags[SYSTEM_ID].pregen.missing.length, 2);
  actor.mode = "success";
  await completePregenLoadout(actor, sources);
  assert.equal(actor.created.length, 2); assert.deepEqual(actor.flags[SYSTEM_ID].pregen.missing, []);
});

test("unmarked actors and unrelated shortages are untouched; a broken source fails before any write", async () => {
  const actor = oldActor("letho-of-gulet");
  assert.throws(() => pendingPregenItems(actor, []), /Не найден источник/);
  assert.throws(() => pendingPregenItems(actor, [{ ...sources.at(-1), items: [] }]), /Не найден предмет/);
  actor.flags[SYSTEM_ID].pregen.missing = [{name:"Мой особый предмет",quantity:1}];
  await completePregenLoadout(actor, sources);
  assert.equal(actor.created.length, 0); assert.equal(actor.flags[SYSTEM_ID].pregen.missing.length, 1);
  delete actor.flags[SYSTEM_ID].pregen;
  await completePregenLoadout(actor, sources);
  assert.equal(actor.created.length, 0);
});
