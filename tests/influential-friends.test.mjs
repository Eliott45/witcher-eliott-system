import { itemLore, stripPageReferences } from "../scripts/data/item-lore.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { INFLUENTIAL_FRIENDS } from "../scripts/data/influential-friends.mjs";
import { EQUIPMENT, EQUIPMENT_FOLDERS, getEquipment } from "../scripts/data/equipment.mjs";
import { selectionEntries, filterEntries } from "../scripts/sheets/selection-data.mjs";
import { compendiumData, compendiumFolders } from "../tools/compendium-data.mjs";
import { equipmentUuid } from "../scripts/data/compendiums.mjs";
import { generalGearContent } from "../scripts/data/general-gear.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const localize = key => key.split(".").reduce((value, part) => value[part], translations);

test("influential friend selection contains every table result and searches keepsakes and stories", () => {
  const entries = selectionEntries("influentialFriend", localize);
  assert.equal(entries.length, 30);
  for (const group of ["north", "nilfgaard", "elder"]) {
    assert.equal(filterEntries(entries, "", group).length, 10);
    assert.deepEqual(INFLUENTIAL_FRIENDS.filter(entry => entry.group === group).map(entry => Number(entry.roll)),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }
  assert.deepEqual(filterEntries(entries, "двимеритом").map(entry => entry.id), ["nilfgaard.mage-hunter"]);
  assert.deepEqual(filterEntries(entries, "подвергать сомнению").map(entry => entry.id), ["north.mage"]);
  assert.deepEqual(filterEntries(entries, "билет", "elder").map(entry => entry.id), ["elder.performer"]);
});

test("items are sorted by lifepath source and family descriptions do not contain their mechanics", () => {
  const packs = compendiumData(translations);
  const folders = compendiumFolders(translations).equipment;
  assert.deepEqual(folders.slice(0, 2).map(folder => folder.name), ["Семья", "Друг"]);
  assert.equal(packs.equipment.filter(item => item.folder === EQUIPMENT_FOLDERS.family.id).length, 10);
  assert.equal(packs.equipment.filter(item => item.folder === EQUIPMENT_FOLDERS.friend.id).length, 28);
  for (const entry of EQUIPMENT) {
    const item = packs.equipment.find(item => item._id === entry.documentId);
    assert.deepEqual(item.effects, []);
    assert.equal(item.folder, EQUIPMENT_FOLDERS[entry.source].id);
    assert.ok(!item.system.description.includes("+"), "Bonuses belong to the lifepath, not the equipment");
    const expected = stripPageReferences((entry.source === "family" ? `<p>${localize(entry.description)}</p>` : "") + (generalGearContent(entry.id)?.description ?? ""));
    assert.equal(item.system.description, expected || itemLore(item));
  }
  assert.equal(getEquipment("noble-charter").documentId, "gear000000000001");
  assert.equal(getEquipment("trained-snake").documentId, "gear000000000010");
  for (const entry of INFLUENTIAL_FRIENDS) {
    const reference = packs["influential-friends"].find(item => item._id === entry.documentId);
    assert.deepEqual(reference.effects, []);
    for (const id of entry.equipment) {
      assert.equal(getEquipment(id).source, "friend");
      assert.ok(reference.system.description.includes(equipmentUuid(id)));
    }
    assert.ok(!reference.system.description.includes("+"));
  }
  assert.ok(packs["influential-friends"].find(item => item.system.ruleId === "north.performer")
    .system.description.includes("} или @UUID["), "Alternative keepsakes must not become a cumulative reward");
  assert.ok(packs["family-statuses"].find(item => item.system.ruleId === "north.aristocracy").system.description.includes("+2 к репутации"));
});
