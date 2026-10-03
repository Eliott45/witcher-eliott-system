import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import vm from "node:vm";

assert.ok(process.argv[2], "Usage: node tools/check-quick-insert.mjs <Quick Insert module directory>");
const directory = resolve(process.argv[2]);
const source = await readFile(join(directory, "quick-insert.js"), "utf8");
const module = JSON.parse(await readFile(join(directory, "module.json"), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
// Exercise the exact installed module function that initializes subtype filters.
// This intentionally does not claim to test keyboard events or the browser widget.
const functionSource = source.match(/function getSubTypes\(type\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(functionSource, "Installed Quick Insert changed; inspect its subtype initialization");
const sandbox = {
  DocumentType: { ITEM: "Item", ACTOR: "Actor", JOURNALENTRY: "JournalEntry", MACRO: "Macro",
    ROLLTABLE: "RollTable", PLAYLIST: "Playlist", SCENE: "Scene", ADVENTURE: "Adventure" },
  game: { system: { documentTypes: { Actor: manifest.documentTypes.Actor } } }
};
vm.createContext(sandbox);
vm.runInContext(functionSource, sandbox);
assert.throws(() => vm.runInContext('getSubTypes("Item")', sandbox), /Cannot convert undefined or null to object/);
sandbox.game.system.documentTypes = manifest.documentTypes;
assert.deepEqual(Array.from(vm.runInContext('getSubTypes("Item")', sandbox)), ["Item:race", "Item:ability", "Item:origin", "Item:familyStatus", "Item:equipment"]);
assert.deepEqual(Array.from(vm.runInContext('getSubTypes("Actor")', sandbox)), ["Actor:character", "Actor:npc"]);
console.log(`Quick Insert ${module.version}: reproduced missing-Item failure; updated system subtype initialization passes`);
