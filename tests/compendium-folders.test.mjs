import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateCompendiumFolders } from "../scripts/migrations/compendium-folders.mjs";

test("existing packs move into one Witcher folder once, without changing unrelated packs", async () => {
  const gm = {};
  let version = 0;
  const folders = [];
  const writes = [];
  globalThis.game = {
    user: gm, users: { activeGM: gm }, folders,
    packs: new Map(["races", "abilities"].map(name => [`witcher-eliott-system.${name}`, {
      setFolder: async folder => writes.push([name, folder.id])
    }])),
    settings: { get: () => version, set: async (_system, _key, value) => { version = value; } }
  };
  globalThis.foundry = { documents: { Folder: { create: async data => {
    const folder = { ...data, id: "witcher-folder" };
    folders.push(folder);
    return folder;
  } } } };
  game.user = {};
  await migrateCompendiumFolders();
  assert.equal(folders.length, 0, "Players and secondary GMs must not change world folders");
  game.user = gm;
  await migrateCompendiumFolders();
  assert.deepEqual(writes, [["races", "witcher-folder"], ["abilities", "witcher-folder"]]);
  assert.equal(folders.length, 1);
  await migrateCompendiumFolders();
  assert.equal(writes.length, 2, "Later manual organization must not be overwritten");
  version = 0;
  await migrateCompendiumFolders();
  assert.equal(folders.length, 1, "Reuse the folder created by the manifest or previous attempts");
});
