import assert from "node:assert/strict";
import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTOR_TYPES, ITEM_TYPES, SYSTEM_ID } from "../scripts/config.mjs";
import { RACES } from "../scripts/data/races.mjs";
import { ORIGINS, ORIGIN_GROUPS } from "../scripts/data/origins.mjs";
import { FAMILY_STATUSES, FAMILY_GROUPS } from "../scripts/data/family-statuses.mjs";
import { EQUIPMENT } from "../scripts/data/equipment.mjs";
import { INFLUENTIAL_FRIENDS } from "../scripts/data/influential-friends.mjs";
import { LANGUAGES } from "../scripts/data/languages.mjs";
import { compendiumData, compendiumFolders } from "./compendium-data.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile("system.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.id, SYSTEM_ID);
assert.equal(manifest.version, pkg.version);
assert.deepEqual(Object.keys(manifest.documentTypes.Actor), ACTOR_TYPES);
assert.deepEqual(Object.keys(manifest.documentTypes.Item), ITEM_TYPES);
assert.equal(manifest.grid.distance, 2);
assert.equal(manifest.grid.units, "m");

for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(language => language.path)]) {
  await access(path);
}

const leaves = (object, prefix = "") => Object.entries(object).flatMap(([key, value]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return typeof value === "object" ? leaves(value, path) : [path];
});
const languages = await Promise.all(manifest.languages.map(async ({ path }) => JSON.parse(await readFile(path, "utf8"))));
assert.deepEqual(leaves(languages[0]).sort(), leaves(languages[1]).sort(), "Translation keys must match");
const keys = new Set(leaves(languages[0]));
for (const name of ["actor-sheet", "item-sheet", "reference-picker", "sheet-tabs"]) {
  const template = await readFile(`templates/${name}.hbs`, "utf8");
  for (const [, key] of template.matchAll(/localize\s+["']([^"']+)["']/g)) {
    assert.ok(keys.has(key), `Missing translation: ${key}`);
  }
}
const expectedPacks = compendiumData(languages[0]);
const expectedFolders = compendiumFolders(languages[0]);
for (const pack of manifest.packs) {
  await access(`${pack.path}/CURRENT`);
  const documents = JSON.parse(await readFile(`pack-sources/${pack.name}.json`, "utf8"));
  assert.deepEqual(documents, expectedPacks[pack.name], `Rebuild stale ${pack.name} compendium`);
  const folders = expectedFolders[pack.name] ?? [];
  if (folders.length) {
    assert.deepEqual(JSON.parse(await readFile(`pack-sources/${pack.name}.folders.json`, "utf8")), folders);
  }
  for (const document of documents) {
    if (document.folder) assert.ok(folders.some(folder => folder._id === document.folder), `Missing folder for ${document.name}`);
  }
  assert.equal(pack.ownership.PLAYER, "OBSERVER", "Players must be able to read racial bonuses");
}
const ids = new Set();
for (const entry of [...FAMILY_STATUSES, ...EQUIPMENT, ...INFLUENTIAL_FRIENDS, ...LANGUAGES]) {
  for (const key of [entry.label, entry.description, entry.reward, FAMILY_GROUPS[entry.group]].filter(Boolean)) {
    assert.ok(keys.has(key), `Missing family/equipment translation: ${key}`);
  }
  assert.match(entry.documentId, /^[a-zA-Z0-9]{16}$/);
  assert.ok(!ids.has(entry.documentId), `Duplicate document ID: ${entry.documentId}`);
  ids.add(entry.documentId);
}
for (const origin of ORIGINS) {
  for (const key of [origin.label, origin.bonus, ORIGIN_GROUPS[origin.group]]) assert.ok(keys.has(key), `Missing origin translation: ${key}`);
  assert.match(origin.documentId, /^[a-zA-Z0-9]{16}$/);
  assert.ok(!ids.has(origin.documentId), `Duplicate origin document ID: ${origin.documentId}`);
  ids.add(origin.documentId);
}
for (const race of RACES) {
  assert.ok(!ids.has(race.id), `Duplicate race ID: ${race.id}`);
  ids.add(race.id);
  for (const entry of [race, ...race.abilities]) {
    for (const key of [entry.label, entry.description, entry.note].filter(Boolean)) {
      assert.ok(keys.has(key), `Missing race translation: ${key}`);
    }
  }
  for (const ability of race.abilities) {
    assert.ok(!ids.has(ability.id), `Duplicate ability ID: ${ability.id}`);
    ids.add(ability.id);
  }
}

async function checkScripts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await checkScripts(path);
    else if (path.endsWith(".mjs")) {
      const result = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || String(result.error));
    }
  }
}
for (const directory of ["scripts", "tests", "tools"]) await checkScripts(directory);
console.log("Manifest, file references, translations and JavaScript syntax: OK");
