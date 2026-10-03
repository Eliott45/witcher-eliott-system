import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { FAMILY_STATUSES, getFamilyReward, suggestedFamilyGroup } from "../scripts/data/family-statuses.mjs";
import { EQUIPMENT } from "../scripts/data/equipment.mjs";
import { selectionEntries, filterEntries } from "../scripts/sheets/selection-data.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const localize = key => key.split(".").reduce((value, part) => value[part], translations);

test("each family column covers 1–10 and its rewards are searchable", () => {
  const entries = selectionEntries("familyStatus", localize);
  assert.equal(entries.length, 21);
  for (const group of ["north", "nilfgaard", "elder"]) {
    assert.equal(filterEntries(entries, "", group).length, 7);
    const rolls = FAMILY_STATUSES.filter(entry => entry.group === group).flatMap(entry => {
      const [from, to = from] = entry.roll.split("–").map(Number);
      return Array.from({ length: to - from + 1 }, (_, index) => from + index);
    });
    assert.deepEqual(rolls, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }
  assert.deepEqual(filterEntries(entries, "храбрости").map(entry => entry.id), ["nilfgaard.high-clergy"]);
  assert.deepEqual(filterEntries(entries, "2 знакомых", "elder").map(entry => entry.id), ["elder.merchants"]);
  assert.deepEqual(filterEntries(entries, "летопись", "north").map(entry => entry.id), ["north.mage-ward"]);
});

test("witchers never receive family rewards; table suggestions follow race and origin", () => {
  for (const entry of FAMILY_STATUSES) {
    assert.equal(getFamilyReward("witcher", entry.id), null);
    assert.equal(getFamilyReward("human", entry.id), entry.reward);
    for (const id of entry.equipment) assert.ok(EQUIPMENT.some(item => item.id === id));
  }
  assert.equal(getFamilyReward("elf", ""), null);
  assert.equal(suggestedFamilyGroup("witcher", "redania"), "");
  assert.equal(suggestedFamilyGroup("human", "redania"), "north");
  assert.equal(suggestedFamilyGroup("human", "vicovaro"), "nilfgaard");
  assert.equal(suggestedFamilyGroup("elf", "vicovaro"), "elder");
  assert.equal(suggestedFamilyGroup("dwarf", "mahakam"), "elder");
});
