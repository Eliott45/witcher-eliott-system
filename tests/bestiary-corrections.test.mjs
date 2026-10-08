import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { bestiaryCorrectionPatch, migrateBestiaryCorrections } from "../scripts/migrations/bestiary-corrections.mjs";

const sourceByName = name => bestiarySources().find(source => source.name === name);
const setAt = (source, path, value) => {
  const parts = path.split("."), last = parts.pop();
  const parent = parts.reduce((object, key) => object[key] ??= {}, source);
  if (value === undefined) delete parent[last]; else parent[last] = value;
};
const oldValues = {
  "Сирена": { "system.creature.hasTailOrWings": false },
  "Эндриага-воин": { "system.creature.hasTailOrWings": false },
  "Бес": { "system.creature.recoveryBase": 0 },
  "Накер-вожак": { "system.attributes.body": 7 },
  "Скальный тролль": { "system.creature.sizeClass": "medium" },
  "Птица": { "system.creature.runBase": 0, "system.creature.hasTailOrWings": false }
};

function fixture({ locked = true } = {}) {
  const state = { version: 2, writes: [], locks: [], packActors: [], failUuid: "", cancelUuid: "", failLock: false };
  const actor = (name, uuid, changes = {}) => {
    const source = structuredClone(sourceByName(name));
    for (const [path, value] of Object.entries({ ...oldValues[name], ...changes })) setAt(source, path, value);
    const document = { ...source, id: source._id, uuid, update: async patch => {
      state.writes.push({ uuid, patch: structuredClone(patch) });
      if (state.failUuid === uuid) throw new Error("Database failure");
      if (state.cancelUuid === uuid) return null;
      for (const [path, value] of Object.entries(patch)) setAt(document, path, value);
      return document;
    } };
    return document;
  };
  const gm = {}, pack = { collection: `${SYSTEM_ID}.bestiary`, locked,
    getDocuments: async () => state.packActors,
    configure: async ({ locked }) => {
      state.locks.push(locked);
      if (locked && state.failLock) throw new Error("Relock failure");
      pack.locked = locked;
    } };
  globalThis.game = { user: gm, users: { activeGM: gm }, packs: new Map([[pack.collection, pack]]), actors: [], scenes: [],
    settings: { get: () => state.version, set: async (_scope, _key, value) => { state.version = value; } } };
  return { state, pack, actor };
}

test("v3 repairs stock values in the pack, renamed world copies and unlinked tokens without resetting gameplay state", async () => {
  const { state, pack, actor } = fixture();
  state.packActors = Object.keys(oldValues).map(name => actor(name, `Compendium.${SYSTEM_ID}.bestiary.Actor.${sourceByName(name)._id}`));
  const world = actor("Накер-вожак", "Actor.worldChief", { "system.health.value": 3, "system.stamina.value": 2, "system.creature.lootGenerated": true });
  world.id = world._id = "worldChief";
  world.name = "Мой вожак";
  world.flags = { core: { sourceId: `Compendium.${SYSTEM_ID}.bestiary.Actor.${sourceByName("Накер-вожак")._id}` } };
  const originalItems = structuredClone(world.items), originalLoot = structuredClone(world.system.creature.loot);
  const token = actor("Птица", "Scene.s.Token.bird.Actor.bird");
  game.actors = [world, world];
  game.scenes = [{ tokens: [{ actorLink: false, actor: token }, { actorLink: false, actor: token }, { actorLink: true, actor: world }] }];
  await migrateBestiaryCorrections();
  assert.equal(state.version, 3);
  assert.deepEqual(state.locks, [false, true]);
  assert.equal(pack.locked, true);
  assert.equal(state.writes.length, 8);
  assert.equal(world.system.attributes.body, 4);
  assert.equal(world.system.health.value, 3);
  assert.equal(world.system.stamina.value, 2);
  assert.equal(world.system.creature.lootGenerated, true);
  assert.deepEqual(world.items, originalItems);
  assert.deepEqual(world.system.creature.loot, originalLoot);
  assert.equal(token.system.creature.runBase, 10);
  assert.equal(token.system.creature.hasTailOrWings, true);
  const current = new Map(bestiarySources().map(source => [source._id, source]));
  for (const document of state.packActors) {
    for (const path of Object.keys(oldValues[document.name])) {
      const read = object => path.split(".").reduce((value, key) => value[key], object);
      assert.equal(read(document), read(current.get(document.id)), `${document.name}: ${path}`);
    }
  }
  await migrateBestiaryCorrections();
  assert.equal(state.writes.length, 8);
});

test("corrections preserve customized values and ignore unrelated actors; missing new fields are eligible", () => {
  const { actor } = fixture();
  assert.deepEqual(bestiaryCorrectionPatch(actor("Накер-вожак", "Actor.custom", { "system.attributes.body": 9 })), {});
  assert.deepEqual(bestiaryCorrectionPatch(actor("Скальный тролль", "Actor.custom", { "system.creature.sizeClass": "huge" })), {});
  assert.deepEqual(bestiaryCorrectionPatch(actor("Бес", "Actor.custom", { "system.creature.recoveryBase": 15 })), {});
  const bird = actor("Птица", "Actor.custom", { "system.creature.runBase": 18, "system.creature.hasTailOrWings": true });
  assert.deepEqual(bestiaryCorrectionPatch(bird), {});
  bird.id = bird._id = "unrelated"; bird.name = "Другая птица";
  bird.system.creature.runBase = 0; bird.system.creature.hasTailOrWings = false;
  assert.deepEqual(bestiaryCorrectionPatch(bird), {});
  assert.deepEqual(bestiaryCorrectionPatch(actor("Бес", "Actor.fiend", { "system.creature.recoveryBase": undefined })), { "system.creature.recoveryBase": 11 });
  assert.deepEqual(bestiaryCorrectionPatch(actor("Птица", "Actor.bird", { "system.creature.runBase": undefined, "system.creature.hasTailOrWings": undefined })),
    { "system.creature.runBase": 10, "system.creature.hasTailOrWings": true });
});

test("partially failed writes relock the pack and retry only remaining corrections", async () => {
  const { state, pack, actor } = fixture();
  state.packActors = [actor("Накер-вожак", "Compendium.chief"), actor("Скальный тролль", "Compendium.troll")];
  state.failUuid = "Compendium.troll";
  await assert.rejects(migrateBestiaryCorrections(), /Database failure/);
  assert.equal(state.version, 2);
  assert.equal(pack.locked, true);
  assert.equal(state.packActors[0].system.attributes.body, 4);
  state.failUuid = "";
  await migrateBestiaryCorrections();
  assert.equal(state.version, 3);
  assert.deepEqual(state.writes.map(call => call.uuid), ["Compendium.chief", "Compendium.troll", "Compendium.troll"]);
  assert.deepEqual(state.locks, [false, true, false, true]);
});

test("cancelled writes and failed relocking never mark v3 complete", async () => {
  const { state, pack, actor } = fixture();
  state.packActors = [actor("Накер-вожак", "Compendium.chief")];
  state.cancelUuid = "Compendium.chief";
  await assert.rejects(migrateBestiaryCorrections(), /Не удалось исправить/);
  assert.equal(state.version, 2);
  assert.equal(pack.locked, true);
  state.cancelUuid = ""; state.failLock = true;
  await assert.rejects(migrateBestiaryCorrections(), /Relock failure/);
  assert.equal(state.version, 2);
});

test("world failures remain retryable even after pack corrections succeed", async () => {
  const { state, pack, actor } = fixture();
  state.packActors = [actor("Накер-вожак", "Compendium.chief")];
  game.actors = [actor("Скальный тролль", "Actor.troll")];
  state.failUuid = "Actor.troll";
  await assert.rejects(migrateBestiaryCorrections(), /Database failure/);
  assert.equal(state.version, 2);
  assert.equal(pack.locked, true);
  state.failUuid = "";
  await migrateBestiaryCorrections();
  assert.equal(state.version, 3);
  assert.deepEqual(state.locks, [false, true]);
});

test("v3 rechecks old values before each write and treats synthetic copies with the same actor ID separately", async () => {
  const { state, actor } = fixture();
  const packed = actor("Накер-вожак", "Compendium.chief"), world = actor("Накер-вожак", "Actor.chief");
  const firstToken = actor("Птица", "Scene.s.Token.first.Actor.bird"), secondToken = actor("Птица", "Scene.s.Token.second.Actor.bird");
  state.packActors = [packed]; game.actors = [world];
  game.scenes = [{ tokens: [{ actorLink: false, actor: firstToken }, { actorLink: false, actor: secondToken }] }];
  const update = packed.update;
  packed.update = async patch => { await update(patch); world.system.attributes.body = 12; return packed; };
  await migrateBestiaryCorrections();
  assert.equal(world.system.attributes.body, 12);
  assert.equal(firstToken.system.creature.runBase, 10);
  assert.equal(secondToken.system.creature.runBase, 10);
  assert.deepEqual(state.writes.map(call => call.uuid), [packed.uuid, firstToken.uuid, secondToken.uuid]);
});

test("unlocked packs stay unlocked and current packs are not needlessly unlocked", async () => {
  const unlocked = fixture({ locked: false });
  unlocked.state.packActors = [unlocked.actor("Накер-вожак", "Compendium.chief")];
  await migrateBestiaryCorrections();
  assert.equal(unlocked.pack.locked, false);
  assert.deepEqual(unlocked.state.locks, []);
  const current = fixture();
  current.state.packActors = [current.actor("Накер-вожак", "Compendium.chief", { "system.attributes.body": 4 })];
  await migrateBestiaryCorrections();
  assert.equal(current.state.version, 3);
  assert.deepEqual(current.state.writes, []);
  assert.deepEqual(current.state.locks, []);
});

test("v3 waits for the active GM and bestiary pack, and skips an already migrated world", async () => {
  const { state, actor } = fixture();
  state.packActors = [actor("Накер-вожак", "Compendium.chief")];
  game.user = {};
  await migrateBestiaryCorrections();
  assert.equal(state.version, 2);
  assert.deepEqual(state.writes, []);
  game.user = game.users.activeGM; state.version = 3;
  await migrateBestiaryCorrections();
  assert.deepEqual(state.writes, []);
  state.version = 2; game.packs.clear();
  await migrateBestiaryCorrections();
  assert.equal(state.version, 2);
  assert.deepEqual(state.writes, []);
});
