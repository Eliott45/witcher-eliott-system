import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compendiumData } from "./compendium-data.mjs";

// Use the installed core's LevelDB runtime; no Foundry code is copied into this system.
// Close the world before rebuilding packs. LevelDB refuses to open a locked live pack.
assert.ok(process.argv[2], "Usage: node tools/build-packs.mjs <Foundry resources/app directory>");
const require = createRequire(pathToFileURL(join(resolve(process.argv[2]), "package.json")));
const { ClassicLevel } = require("classic-level");
const root = fileURLToPath(new URL("../", import.meta.url));
const translations = JSON.parse(await readFile(join(root, "lang/ru.json"), "utf8"));
const packs = compendiumData(translations);
await mkdir(join(root, "packs"), { recursive: true });
await mkdir(join(root, "pack-sources"), { recursive: true });

for (const [name, documents] of Object.entries(packs)) {
  for (const document of documents) assert.match(document._id, /^[a-zA-Z0-9]{16}$/);
  const db = new ClassicLevel(join(root, "packs", name), { keyEncoding: "utf8", valueEncoding: "json" });
  try {
    await db.open();
    const items = db.sublevel("items", { valueEncoding: "json" });
    // Upsert only our stable IDs; never delete unrelated/user-added records.
    await items.batch(documents.map(document => ({ type: "put", key: document._id, value: document })));
    const stored = await items.getMany(documents.map(document => document._id));
    assert.deepEqual(stored, documents);
    const keys = await db.keys().all();
    await db.compactRange(keys[0], keys.at(-1));
  } finally {
    await db.close();
  }
  await writeFile(join(root, "pack-sources", `${name}.json`), `${JSON.stringify(documents, null, 2)}\n`);
  console.log(`${name}: ${documents.length} Item documents written and verified`);
}
