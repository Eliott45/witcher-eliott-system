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
    packs: new Map(["races", "abilities", "origins", "family-statuses", "equipment", "influential-friends", "languages", "professions", "effects"].map(name => [`witcher-eliott-system.${name}`, {
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
  assert.deepEqual(writes, ["races", "abilities", "origins", "family-statuses", "equipment", "influential-friends", "languages", "professions", "effects"].map(name => [name, "witcher-folder"]));
  assert.equal(folders.length, 1);
  await migrateCompendiumFolders();
  assert.equal(writes.length, 9, "Later manual organization must not be overwritten");
  for (const [from, expected] of [
    [1, ["origins", "family-statuses", "equipment", "influential-friends", "languages", "professions", "effects"]],
    [2, ["family-statuses", "equipment", "influential-friends", "languages", "professions", "effects"]],
    [3, ["influential-friends", "languages", "professions", "effects"]],
    [4, ["languages", "professions", "effects"]], [5, ["professions", "effects"]], [6, ["effects"]]
  ]) {
    version = from;
    const start = writes.length;
    await migrateCompendiumFolders();
    assert.deepEqual(writes.slice(start), expected.map(name => [name, "witcher-folder"]));
  }
  version = 0;
  await migrateCompendiumFolders();
  assert.equal(folders.length, 1, "Reuse the folder created by the manifest or previous attempts");
});
