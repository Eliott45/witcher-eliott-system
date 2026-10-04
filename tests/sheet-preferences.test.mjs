import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSheetPreferences, sheetPreferences, visibleSheetTabs, updateSheetPreferences } from "../scripts/sheets/sheet-preferences.mjs";

test("tab visibility always leaves a way back into the sheet", () => {
  const all = ["main", "skills", "profession", "inventory", "actions", "biography", "family", "lifepath", "effects"];
  assert.deepEqual(visibleSheetTabs().map(tab => tab.id), all);
  assert.deepEqual(visibleSheetTabs(all.filter(id => id !== "family")).map(tab => tab.id), ["family"]);
  assert.deepEqual(visibleSheetTabs(all).map(tab => tab.id), ["main"]);
  assert.deepEqual(visibleSheetTabs(["main", "biography", "family", "lifepath", "effects"]).map(tab => tab.id), ["skills", "profession", "inventory", "actions"], "Old preferences reveal new tabs");
  assert.deepEqual(visibleSheetTabs(["parameters"]).map(tab => tab.id), all);
});

test("personal view preferences survive rapid changes without affecting other sheets or users", async () => {
  let user = "owner";
  const values = { owner: {}, observer: {} };
  let scope;
  globalThis.game = { settings: {
    register: (_system, _key, data) => { scope = data.scope; },
    get: () => values[user],
    set: async (_system, _key, value) => { await Promise.resolve(); values[user] = structuredClone(value); }
  } };
  registerSheetPreferences();
  assert.equal(scope, "user");
  await Promise.all([
    updateSheetPreferences("Actor.first", { collapsed: { parents: true } }),
    updateSheetPreferences("Actor.first", { collapsed: { siblings: true } }),
    updateSheetPreferences("Actor.first", { hiddenTabs: ["main"] }),
    updateSheetPreferences("Actor.second", { collapsed: { enemies: true } })
  ]);
  assert.deepEqual(sheetPreferences("Actor.first"), { hiddenTabs: ["main"], collapsed: { parents: true, siblings: true } });
  assert.deepEqual(sheetPreferences("Actor.second").collapsed, { enemies: true });
  await updateSheetPreferences("Actor.first", { collapsed: { parents: false } });
  assert.equal(sheetPreferences("Actor.first").collapsed.parents, false);
  user = "observer";
  assert.deepEqual(sheetPreferences("Actor.first"), {});
  await updateSheetPreferences("Actor.first", { hiddenTabs: ["family"] });
  user = "owner";
  assert.deepEqual(sheetPreferences("Actor.first").hiddenTabs, ["main"]);
});
