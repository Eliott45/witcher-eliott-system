import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compendiumData } from "../tools/compendium-data.mjs";
import { packRecords, expandPackRecord } from "../tools/pack-records.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { armorZones, carriedWeight } from "../scripts/data/physical-items.mjs";
import { equipmentEntry, filterEquipment } from "../scripts/data/equipment-search.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const packs = compendiumData(translations);
const source = packs.pregens[0];
const byRule = (actor, id) => actor.items.find(item => item.system.ruleId === id);
const actorData = () => structuredClone(source);

test("Geralt's pregen preserves the printed final statistics without double racial bonuses", () => {
  const actor = actorData();
  const stats = deriveStatistics(actor.system, { items: actor.items });
  assert.deepEqual(Object.values(stats.effective), [6,14,10,8,9,3,5,8,3]);
  assert.deepEqual([stats.healthMax, stats.staminaMax, stats.stun, stats.recovery, stats.run, stats.leap, stats.carryMax, stats.vigor], [55,40,8,8,27,5,80,7]);
  assert.equal(actor.system.skills.awareness + stats.skillBonuses.awareness, 9);
  assert.equal(actor.system.skills.swordsmanship, 11);
  const armor = byRule(actor, "armor.raven");
  assert.deepEqual(armorZones(armor), ["torso", "legs"]);
  assert.equal(stats.skillBonuses.courage, 3);
  armor.system.equipped = false;
  assert.equal(deriveStatistics(actor.system, { items: actor.items }).healthMax, 40);
  assert.equal(deriveStatistics(actor.system, { items: actor.items }).skillBonuses.courage, undefined);
});

test("pregen gear references existing catalogue Items, quantities and horse attachment survive LevelDB round-trip", async () => {
  const actor = actorData();
  assert.equal(actor.items.filter(item => item.type === "spell").length, 10);
  assert.equal(actor.items.filter(item => item.type === "ability").length, 10);
  assert.equal(new Set(actor.items.map(item => item._id)).size, actor.items.length);
  for (const item of actor.items) {
    const [, , pack, , id] = item.flags.core.sourceId.split(".");
    assert.ok(packs[pack].some(source => source._id === id), item.name);
  }
  for (const [id, count] of Object.entries({ "weapon.throwing-knife":5, "ammunition.standard":20, "ammunition.explosive":5, "bomb.grapeshot":3, "bomb.samum":3, "potion.thunderbolt":3, "potion.swallow":3 }))
    assert.equal(byRule(actor, id).system.quantity, count);
  const horse = byRule(actor, "transport.horse"), saddle = byRule(actor, "tack.saddle");
  assert.equal(saddle.system.containerId, horse._id);
  // Document-like IDs are used by the inventory's existing container lookup.
  actor.items.forEach(item => { item.id = item._id; });
  assert.equal(carriedWeight(actor.items), carriedWeight(actor.items.filter(item => item !== horse && item !== saddle)));
  const records = packRecords("Actor", [source]);
  const stored = new Map(records.map(row => [`${row.sublevel}:${row.key}`, row.value]));
  assert.deepEqual(await expandPackRecord("Actor", stored.get(`actors:${source._id}`), (level, key) => stored.get(`${level}:${key}`)), source);
});

test("Raven armor is searchable in both covered zones, counts its weight and passive bonuses once", () => {
  const actor = actorData(), armor = byRule(actor, "armor.raven");
  const entry = equipmentEntry(armor);
  assert.equal(filterEquipment([entry], { zone:"head" }).length, 0);
  for (const zone of ["torso", "legs", "torso-legs"]) assert.equal(filterEquipment([entry], { zone }).length, 1);
  assert.equal(carriedWeight([armor]), 12);
  assert.equal(deriveStatistics(actor.system, { items:[armor] }).modifiers.filter(bonus => bonus.target === "healthMax").length, 1);
  armor.system.carried = false;
  assert.equal(deriveStatistics(actor.system, { items:[armor] }).healthMax, 40);
});

test("unpriced relics and medallion may be added but cannot be bought for zero crowns", () => {
  globalThis.game = { user:{} };
  for (const id of ["armor.raven", "weapon.wolf", "weapon.moon-blade", "gear.witcher-medallion"]) {
    const item = { ...structuredClone(byRule(source, id)), testUserPermission: () => true };
    const actor = { isOwner:true, system:{crowns:1000} };
    const quote = equipmentQuote(actor, item);
    assert.equal(quote.canAdd, true); assert.equal(quote.canBuy, false);
    assert.match(quote.buyReason, /цена не указана/);
    assert.match(equipmentEntry(item).summary, /Цена не указана/);
    item.system.price = 100;
    assert.equal(equipmentQuote(actor, item).canBuy, true);
  }
  const ammo = {...byRule(source, "ammunition.explosive"), testUserPermission: () => true};
  assert.equal(equipmentQuote({isOwner:true,system:{crowns:1000}}, ammo, 5).cost, 540);
});
