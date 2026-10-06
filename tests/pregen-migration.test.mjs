import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { migratePregenContent, PREGEN_CONTENT_VERSION } from "../scripts/migrations/pregen-content.mjs";

const sources = JSON.parse(await readFile(new URL("../pack-sources/pregens.json", import.meta.url), "utf8"));
const entry = source => ({ _id: source._id, name: source.name, flags: structuredClone(source.flags) });

function fixture(t, { locked = true } = {}) {
  const previous = Object.fromEntries(["game", "foundry", "fetch"].map(key => [key, globalThis[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  const gm = {}, index = new Map([[sources[0]._id, entry(sources[0])]]), created = [], locks = [];
  const state = { version: 0, fetches: 0, mode: "success" };
  const pack = { collection: `${SYSTEM_ID}.pregens`, locked, async getIndex() { return index; },
    async configure({ locked: value }) { this.locked = value; locks.push(value); } };
  globalThis.game = { user: gm, users: { activeGM: gm }, packs: new Map([[pack.collection, pack]]),
    settings: { get: () => state.version, async set(_system, _key, value) { state.version = value; } } };
  globalThis.fetch = async url => {
    assert.equal(url, `systems/${SYSTEM_ID}/pack-sources/pregens.json`);
    state.fetches++;
    return { ok: state.mode !== "fetch-failure", status: 404, async json() { return structuredClone(sources); } };
  };
  globalThis.foundry = { documents: { Actor: { implementation: { async createDocuments(rows, options) {
    assert.equal(pack.locked, false);
    assert.deepEqual(options, { pack: pack.collection, keepId: true });
    if (state.mode === "failure") throw new Error("create failed");
    const result = state.mode === "partial" ? rows.slice(0, 2) : rows;
    for (const source of result) { index.set(source._id, entry(source)); created.push(source); }
    return result;
  } } } } };
  return { state, pack, index, created, locks };
}

test("an existing world gets seven pregens once without changing edited profiles or imported actors", async t => {
  const f = fixture(t), geralt = f.index.get(sources[0]._id);
  geralt.name = "Мой изменённый Геральт";
  const saved = structuredClone(geralt);
  await migratePregenContent();
  assert.equal(f.created.length, 7);
  assert.equal(f.state.version, PREGEN_CONTENT_VERSION);
  assert.deepEqual(f.index.get(sources[0]._id), saved);
  assert.deepEqual(f.locks, [false, true]);
  assert.equal(f.created.find(actor => actor.name === "Лето из Гулеты").items.length, 39);
  await migratePregenContent();
  assert.equal(f.created.length, 7); assert.equal(f.state.fetches, 1);
});

test("stable profile identity prevents duplicates even after the document ID changes", async t => {
  const f = fixture(t, { locked: false });
  f.index.set("custom-copy", { ...entry(sources[1]), _id: "custom-copy", name: "Моя Йеннифэр" });
  await migratePregenContent();
  assert.equal(f.created.length, 6);
  assert.ok(!f.created.some(actor => actor._id === sources[1]._id));
  assert.deepEqual(f.locks, []);
});

test("failed and partial imports restore the lock and resume only missing profiles", async t => {
  const f = fixture(t);
  f.state.mode = "failure";
  await assert.rejects(migratePregenContent(), /create failed/);
  assert.equal(f.state.version, 0); assert.equal(f.pack.locked, true);
  f.state.mode = "partial";
  await assert.rejects(migratePregenContent(), /не все прегены/);
  assert.equal(f.state.version, 0); assert.equal(f.created.length, 2); assert.equal(f.pack.locked, true);
  f.state.mode = "success";
  await migratePregenContent();
  assert.equal(f.created.length, 7);
  assert.equal(new Set(f.created.map(actor => actor._id)).size, 7);
  assert.equal(f.state.version, PREGEN_CONTENT_VERSION);
});

test("occupied IDs and failed source reads never overwrite other documents or mark migration complete", async t => {
  const f = fixture(t);
  f.state.mode = "fetch-failure";
  await assert.rejects(migratePregenContent(), /404/);
  assert.equal(f.state.version, 0);
  f.state.mode = "success";
  f.index.set(sources[1]._id, { _id: sources[1]._id, name: "Другой персонаж", flags: {} });
  await assert.rejects(migratePregenContent(), /ID занят/);
  assert.equal(f.created.length, 0); assert.equal(f.state.version, 0); assert.deepEqual(f.locks, []);
});

test("players, secondary GMs and a missing pack do not run the import", async t => {
  const f = fixture(t), gm = game.user;
  game.user = {};
  await migratePregenContent();
  assert.equal(f.state.fetches, 0);
  game.user = gm; game.packs.clear();
  await migratePregenContent();
  assert.equal(f.state.fetches, 0); assert.equal(f.state.version, 0);
});
