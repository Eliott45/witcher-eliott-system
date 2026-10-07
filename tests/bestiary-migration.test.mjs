import test from "node:test";
import assert from "node:assert/strict";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { migrateBestiaryCreatures } from "../scripts/migrations/bestiary-content.mjs";

const SYSTEM_ID = "witcher-eliott-system";
function fixture({ locked = true, allPresent = false } = {}) {
  const sources = bestiarySources(), original = sources.slice(0, allPresent ? sources.length : 2).map(source => ({ ...structuredClone(source), name: `${source.name}: правка ведущего` }));
  const gm = {}, index = new Map(original.map(source => [source._id, source]));
  const state = { version: 1, calls: [], locks: [], notices: [], limit: Infinity, fail: false, original, index };
  const pack = { collection: `${SYSTEM_ID}.bestiary`, locked, getIndex: async () => index,
    configure: async ({ locked }) => { state.locks.push(locked); pack.locked = locked; } };
  globalThis.game = { user: gm, users: { activeGM: gm }, packs: new Map([[pack.collection, pack]]),
    settings: { get: () => state.version, set: async (_scope, _key, version) => { state.version = version; } } };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.ui = { notifications: { info: text => state.notices.push(text) } };
  globalThis.Actor = { implementation: { createDocuments: async (documents, options) => {
    state.calls.push({ documents, options });
    if (state.fail) throw new Error("Database failure");
    const created = documents.slice(0, state.limit);
    for (const source of created) index.set(source._id, source);
    return created.map(source => ({ id: source._id }));
  } } };
  return { state, pack, sources };
}

test("bestiary v2 appends thirty missing creatures, preserving existing edits and pack lock", async () => {
  const { state, pack, sources } = fixture(), saved = structuredClone(state.original);
  await migrateBestiaryCreatures();
  assert.equal(state.version, 2);
  assert.equal(state.index.size, 32);
  assert.deepEqual(state.original, saved);
  assert.deepEqual(state.calls[0].options, { pack: pack.collection, keepId: true });
  assert.deepEqual(state.calls[0].documents.map(source => source._id), sources.slice(2).map(source => source._id));
  assert.deepEqual(state.locks, [false, true]);
  assert.equal(state.notices.length, 1);
  await migrateBestiaryCreatures();
  assert.equal(state.calls.length, 1);
});

test("partial bestiary creation stays retryable and only missing actors are retried", async () => {
  const { state, pack } = fixture();
  state.limit = 1;
  await assert.rejects(migrateBestiaryCreatures(), /Не удалось добавить всех/);
  assert.equal(state.version, 1);
  assert.equal(state.index.size, 3);
  assert.equal(pack.locked, true);
  assert.deepEqual(state.notices, []);
  const firstId = state.calls[0].documents[0]._id;
  state.limit = Infinity;
  await migrateBestiaryCreatures();
  assert.equal(state.calls[1].documents.length, 29);
  assert.ok(state.calls[1].documents.every(source => source._id !== firstId));
  assert.equal(state.version, 2);
  assert.equal(state.index.size, 32);
});

test("failed writes relock the bestiary and never mark v2 complete", async () => {
  const { state, pack } = fixture();
  state.fail = true;
  await assert.rejects(migrateBestiaryCreatures(), /Database failure/);
  assert.equal(state.version, 1);
  assert.equal(pack.locked, true);
  assert.deepEqual(state.locks, [false, true]);
});

test("already complete or unlocked packs retain their lock state", async () => {
  const { state } = fixture({ allPresent: true });
  await migrateBestiaryCreatures();
  assert.equal(state.version, 2);
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.locks, []);
  const unlocked = fixture({ locked: false });
  await migrateBestiaryCreatures();
  assert.equal(unlocked.pack.locked, false);
  assert.deepEqual(unlocked.state.locks, []);
});

test("bestiary migration waits for the active GM and for the pack", async () => {
  const { state } = fixture();
  game.user = {};
  await migrateBestiaryCreatures();
  assert.equal(state.version, 1);
  assert.deepEqual(state.calls, []);
  game.user = game.users.activeGM;
  game.packs.clear();
  await migrateBestiaryCreatures();
  assert.equal(state.version, 1);
});
