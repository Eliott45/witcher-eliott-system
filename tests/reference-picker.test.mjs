import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { selectionEntries, filterEntries } from "../scripts/sheets/selection-data.mjs";
import { ORIGINS, getOriginBonus } from "../scripts/data/origins.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const localize = key => key.split(".").reduce((value, part) => value[part], translations);

test("exact profession names take priority over incidental mentions of magic", () => {
  const entries = selectionEntries("profession", localize);
  for (const entry of entries) {
    assert.deepEqual(filterEntries(entries, `  ${entry.label.toLocaleUpperCase()}  `).map(result => result.id), [entry.id]);
  }
  assert.deepEqual(filterEntries(entries, "мАг", "magic").map(entry => entry.id), ["mage"]);
  assert.deepEqual(filterEntries(entries, "маг", "mundane"), []);
  assert.equal(filterEntries(entries, "").length, 9);
  assert.equal(filterEntries(entries, "  ", "mundane").length, 6);
  assert.deepEqual(filterEntries(entries, "познания").map(entry => entry.id), ["mage"]);
});

test("region filters and multi-word searches match labels and bonus descriptions together", () => {
  const entries = selectionEntries("origin", localize);
  assert.equal(filterEntries(entries, "", "north").length, 10);
  assert.equal(filterEntries(entries, "", "nilfgaard").length, 11);
  assert.equal(filterEntries(entries, "", "elder").length, 2);
  assert.deepEqual(filterEntries(entries, "  ОБРАЗОВАНИЕ  ").map(entry => entry.id), ["redania", "vicovaro"]);
  assert.deepEqual(filterEntries(entries, "образование", "nilfgaard").map(entry => entry.id), ["vicovaro"]);
  assert.deepEqual(filterEntries(entries, "изготовление краснолюды").map(entry => entry.id), ["mahakam"]);
  assert.equal(filterEntries(entries, "несуществующий регион").length, 0);
});

test("race search includes abilities and normalizes е/ё", () => {
  const entries = selectionEntries("race", localize);
  assert.deepEqual(filterEntries(entries, "наметанный").map(entry => entry.id), ["dwarf"]);
  assert.deepEqual(filterEntries(entries, "", "mutants").map(entry => entry.id), ["witcher"]);
  assert.equal(filterEntries(entries, "", "peoples").length, 3);
});

test("all region bonuses are excluded for witchers without deleting the origin", () => {
  for (const origin of ORIGINS) {
    assert.equal(getOriginBonus("witcher", origin.id), null);
    for (const race of ["human", "elf", "dwarf"]) assert.equal(getOriginBonus(race, origin.id), origin.bonus);
  }
  assert.equal(getOriginBonus("human", ""), null);
});
