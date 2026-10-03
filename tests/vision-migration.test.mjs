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
