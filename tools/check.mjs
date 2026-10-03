import assert from "node:assert/strict";
import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ACTOR_TYPES, SYSTEM_ID } from "../scripts/config.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile("system.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(manifest.id, SYSTEM_ID);
assert.equal(manifest.version, pkg.version);
assert.deepEqual(Object.keys(manifest.documentTypes.Actor), ACTOR_TYPES);
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
const template = await readFile("templates/actor-sheet.hbs", "utf8");
for (const [, key] of template.matchAll(/localize\s+["']([^"']+)["']/g)) {
  assert.ok(keys.has(key), `Missing translation: ${key}`);
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
