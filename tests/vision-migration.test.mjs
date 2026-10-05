import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateVisionDefaults } from "../scripts/migrations/vision-defaults.mjs";

test("migrate the old 180° default once in actors and scenes, leaving other angles alone", async () => {
  const gm = {};
  let version = 0;
  const writes = [];
  const character = { id: "hero", type: "character", prototypeToken: { sight: { angle: 180 } } };
  const custom = { id: "custom", type: "npc", prototypeToken: { sight: { angle: 90 } } };
  globalThis.game = {
    user: gm, users: { activeGM: gm }, actors: [character, custom],
    settings: { get: () => version, set: async (_system, _key, value) => { version = value; } },
    scenes: [{
      tokens: [
        { id: "old-token", actor: character, sight: { angle: 180 } },
        { id: "custom-token", actor: custom, sight: { angle: 90 } }
      ],
      updateEmbeddedDocuments: async (type, changes) => writes.push({ type, changes })
    }]
  };
  globalThis.foundry = { documents: { Actor: { updateDocuments: async changes => writes.push({ type: "Actor", changes }) } } };
  await migrateVisionDefaults();
  assert.deepEqual(writes, [
    { type: "Actor", changes: [{ _id: "hero", "prototypeToken.sight.angle": 360 }] },
    { type: "Token", changes: [{ _id: "old-token", "sight.angle": 360 }] }
  ]);
  await migrateVisionDefaults();
  assert.equal(writes.length, 2);
  version = 0;
  game.user = {};
  await migrateVisionDefaults();
  assert.equal(writes.length, 2, "Players and secondary GMs must not run migrations");
});

test("Geralt repair reaches the pregen, imported actors and linked/unlinked tokens without changing other custom cones", async () => {
  const gm = {}, writes = [], locks = [];
  let version = 1;
  const actor = (id, angle, pregen = true) => ({ id, type: "character", prototypeToken: { sight: { angle } },
    flags: pregen ? { "witcher-eliott-system": { pregen: { id: "geralt-of-rivia" } } } : {} });
  const geralt = actor("geralt", 180), custom = actor("custom", 90), other = actor("other", 180, false);
  const pack = { collection: "witcher-eliott-system.pregens", locked: true,
    getDocuments: async () => [actor("pregenGeralt0001", 180)],
    async configure({ locked }) { this.locked = locked; locks.push(locked); } };
  globalThis.game = { user: gm, users: { activeGM: gm }, actors: [geralt, custom, other],
    packs: new Map([[pack.collection, pack]]), settings: { get: () => version, set: async (_scope, _key, value) => { version = value; } },
    scenes: [{ tokens: [
      { id: "linked", actor: geralt, sight: { angle: 180 } },
      { id: "unlinked", actor: actor("synthetic", 180), sight: { angle: 180 } },
      { id: "custom", actor: geralt, sight: { angle: 60 } },
      { id: "other", actor: other, sight: { angle: 180 } }
    ], updateEmbeddedDocuments: async (type, changes) => writes.push({ type, changes }) }] };
  globalThis.foundry = { documents: { Actor: { updateDocuments: async (changes, options) => writes.push({ type: "Actor", changes, ...options }) } } };
  await migrateVisionDefaults();
  assert.deepEqual(writes, [
    { type: "Actor", changes: [{ _id: "geralt", "prototypeToken.sight.angle": 360 }] },
    { type: "Token", changes: [{ _id: "linked", "sight.angle": 360 }, { _id: "unlinked", "sight.angle": 360 }] },
    { type: "Actor", changes: [{ _id: "pregenGeralt0001", "prototypeToken.sight.angle": 360 }], pack: pack.collection, broadcast: false }
  ]);
  assert.deepEqual(locks, [false, true]);
  assert.equal(version, 2);
  await migrateVisionDefaults();
  assert.equal(writes.length, 3);
  version = 1;
  foundry.documents.Actor.updateDocuments = async (_changes, options) => { if (options?.pack) throw new Error("failed pack write"); };
  await assert.rejects(migrateVisionDefaults(), /failed pack write/);
  assert.equal(pack.locked, true);
  assert.equal(version, 1, "Failed repair must be retried on next GM login");
});
