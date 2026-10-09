import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RANDOM_LOOT_TABLES, randomLootCategory, randomLootEntry } from "../scripts/data/random-loot.mjs";
import { stripPageReferences } from "../scripts/data/item-lore.mjs";

test("all three p.223 tables cover each percentile result exactly once", () => {
  assert.deepEqual(Object.keys(RANDOM_LOOT_TABLES), ["ordinary", "strange", "occult"]);
  for (const [category, entries] of Object.entries(RANDOM_LOOT_TABLES)) {
    assert.equal(entries.length, 33);
    for (let roll = 1; roll <= 100; roll++) {
      const matching = entries.filter(entry => entry.min <= roll && entry.max >= roll);
      assert.equal(matching.length, 1, `${category}: ${roll}`);
      assert.equal(randomLootEntry(category, roll), matching[0]);
    }
    assert.deepEqual(entries.at(-1).min, 97);
    assert.deepEqual(entries.at(-1).max, 100);
    assert.ok(entries.every(entry => entry.quantity === 1 && entry.source.includes("223")));
    // The sheet hides citation-only paragraphs: the prose must survive that.
    for (const entry of entries) assert.ok(stripPageReferences(entry.description).replace(/<[^>]*>/g, "").trim().length > 40, entry.name);
  }
  for (const roll of [0, 101, -1, NaN, Infinity, 1.5, "1"]) assert.equal(randomLootEntry("ordinary", roll), null);
  assert.equal(randomLootEntry("unknown", 1), null);
});

test("bestiary loot labels select explicit categories without guessing unspecified loot", () => {
  for (const suffix of ["предметы", "вещи"]) {
    assert.equal(randomLootCategory(`Обычные ${suffix}`), "ordinary");
    assert.equal(randomLootCategory(`Странные ${suffix}`), "strange");
    assert.equal(randomLootCategory(`Оккультные ${suffix}`), "occult");
  }
  assert.equal(randomLootCategory("Случайные предметы"), null);
  assert.equal(randomLootCategory("Случайная руна"), null);
  assert.equal(randomLootCategory("Кроны"), null);
});

test("catalogue links resolve by stable IDs; incidental possessions have no invented stats", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
  const entries = Object.values(RANDOM_LOOT_TABLES).flat();
  assert.equal(entries.filter(entry => entry.ruleId).length, 16);
  for (const entry of entries) {
    if (entry.ruleId) assert.ok(catalogue.some(item => item._id === entry.documentId && item.system.ruleId === entry.ruleId), entry.name);
    else assert.equal(entry.documentId, undefined);
    assert.equal(entry.price, undefined);
    assert.equal(entry.weight, undefined);
  }
  assert.equal(randomLootEntry("ordinary", 19).ruleId, "gear.thieves-tools");
  assert.equal(randomLootEntry("ordinary", 85).ruleId, "material.feathers");
  assert.equal(randomLootEntry("occult", 22).ruleId, "material.glowing-ore");
  for (const [category, roll] of [["ordinary", 40], ["ordinary", 49], ["strange", 25], ["strange", 97]]) {
    assert.equal(randomLootEntry(category, roll).ruleId, undefined);
  }
  assert.equal(randomLootEntry("strange", 79).name, "Пять железных гвоздей");
  assert.equal(randomLootEntry("occult", 19).name, "Часть чудовища (на выбор ведущего)");
});
