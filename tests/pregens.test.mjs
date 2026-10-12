import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compendiumData } from "../tools/compendium-data.mjs";
import { packRecords, expandPackRecord } from "../tools/pack-records.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { armorZones, carriedWeight } from "../scripts/data/physical-items.mjs";
import { equipmentEntry, filterEquipment } from "../scripts/data/equipment-search.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { PROFESSION_ABILITIES } from "../scripts/data/professions.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const packs = compendiumData(translations);
const source = packs.pregens[0];
const byRule = (actor, id) => actor.items.find(item => item.system.ruleId === id);
const actorData = () => structuredClone(source);

test("Geralt's pregen preserves the printed final statistics without double racial bonuses", () => {
  const actor = actorData();
  assert.equal(actor.prototypeToken.sight.angle, 360);
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

const printedProfiles = [
  ["yennefer-of-vengerberg", 13, [10,8,6,7,5,6,8,10,7], [40,40,8,8,15,3,70,25], [10,10,8,9,6,7,8,10,8,8]],
  ["dandelion", 14, [7,4,7,4,6,10,4,8,10], [30,30,6,6,18,3,40,0], [10,9,8,8,6,7,6,9,8,7]],
  ["zoltan-chivay", 15, [7,8,7,10,5,7,7,9,6], [45,45,9,9,15,3,125,0], [10,8,8,7,9,8,6,9,6,5]],
  ["triss-merigold", 16, [9,7,7,5,5,8,7,9,6], [35,35,7,7,15,3,50,21], [10,6,6,7,7,6,4,8,7,6]],
  ["vernon-roche", 17, [7,9,8,8,6,4,5,9,4], [40,40,8,8,18,3,80,0], [10,7,6,4,7,6,7,8,9,8]],
  ["iorveth", 18, [7,9,10,7,8,4,5,8,4], [35,35,7,7,24,4,70,0], [10,8,9,8,7,6,4,7,6,6]],
  ["letho-of-gulet", 19, [7,12,10,12,8,2,5,8,5], [50,50,10,10,24,4,120,7], [10,10,10,5,6,7,7,10,9,6]]
];
const hero = id => packs.pregens.find(actor => actor.flags[SYSTEM_ID].pregen.id === id);

test("pp.13–19 profiles reproduce all printed attributes, derived resources and profession ranks", () => {
  assert.equal(packs.pregens.length, 8);
  for (const [id, page, attributes, resources, ranks] of printedProfiles) {
    const actor = hero(id), metadata = actor.flags[SYSTEM_ID].pregen;
    assert.equal(metadata.source, "Базовая книга");
    const stats = deriveStatistics(actor.system);
    assert.deepEqual(Object.values(stats.effective), attributes, actor.name);
    assert.deepEqual([stats.healthMax,stats.staminaMax,stats.stun,stats.recovery,stats.run,stats.leap,stats.carryMax,stats.vigor], resources, actor.name);
    assert.equal(actor.system.health.value, stats.healthMax); assert.equal(actor.system.stamina.value, stats.staminaMax);
    const abilities = actor.items.filter(item => item.type === "ability");
    assert.deepEqual(abilities.map(item => item.system.level), ranks, actor.name);
    assert.deepEqual(abilities.map(item => item.system.ruleId), PROFESSION_ABILITIES.filter(entry => entry.profession === actor.system.details.profession).map(entry => entry.id));
    assert.ok(Object.keys(actor.system.skills).every(key => SKILL_KEYS.includes(key)));
    assert.equal(actor.prototypeToken.sight.angle, 360);
  }
});

test("racial skill ranks are not counted twice and armor penalties remain independent", () => {
  const printed = { dandelion: { deduction: 5 }, "zoltan-chivay": { business: 9, physique: 8 }, iorveth: { archery: 9 }, "letho-of-gulet": { awareness: 9 } };
  for (const [id, skills] of Object.entries(printed)) {
    const actor = hero(id), stats = deriveStatistics(actor.system);
    for (const [skill, rank] of Object.entries(skills)) assert.equal(actor.system.skills[skill] + (stats.skillBonuses[skill] ?? 0), rank);
  }
  for (const id of ["vernon-roche", "iorveth", "letho-of-gulet"]) {
    const actor = hero(id), innate = deriveStatistics(actor.system), equipped = deriveStatistics(actor.system, { items: actor.items });
    assert.equal(equipped.encumbrance, 1);
    assert.equal(equipped.effective.reflex, innate.effective.reflex - 1);
    assert.equal(equipped.effective.dexterity, innate.effective.dexterity - 1);
  }
  assert.equal(hero("letho-of-gulet").system.lifepath.witcher.school, "viper");
});

test("all heroes embed independent canonical Items and survive the pack's embedded record format", async () => {
  for (const actor of packs.pregens) {
    assert.match(actor._id, /^[a-zA-Z0-9]{16}$/);
    assert.equal(new Set(actor.items.map(item => item._id)).size, actor.items.length, actor.name);
    for (const item of actor.items) {
      assert.match(item._id, /^[a-zA-Z0-9]{16}$/);
      const [, , pack, , id] = item.flags.core.sourceId.split(".");
      const reference = packs[pack].find(source => source._id === id);
      assert.equal(reference?.system.ruleId, item.system.ruleId, `${actor.name}: ${item.name}`);
      assert.notEqual(item, reference);
      if (item.system.containerId) assert.ok(actor.items.some(parent => parent._id === item.system.containerId));
    }
    const records = packRecords("Actor", [actor]), stored = new Map(records.map(row => [`${row.sublevel}:${row.key}`, row.value]));
    assert.deepEqual(await expandPackRecord("Actor", stored.get(`actors:${actor._id}`), (level, key) => stored.get(`${level}:${key}`)), actor);
  }
  const notes = hero("dandelion").items.filter(item => item.system.ruleId === "gear.ledger");
  assert.equal(notes.length, 2); assert.notEqual(notes[0]._id, notes[1]._id);
  assert.equal(notes[0].flags.core.sourceId, notes[1].flags.core.sourceId);
});

test("loadouts retain stacks and full magic lists, including the completed ritual pouches and bombs", () => {
  for (const [id, count] of [["yennefer-of-vengerberg",11],["triss-merigold",11],["letho-of-gulet",10],["dandelion",0],["zoltan-chivay",0],["vernon-roche",0],["iorveth",0]])
    assert.equal(hero(id).items.filter(item => item.type === "spell").length, count);
  for (const id of ["zoltan-chivay", "vernon-roche", "iorveth"]) assert.equal(byRule(hero(id), "ammunition.standard").system.quantity, 20);
  assert.equal(byRule(hero("iorveth"), "ammunition.elven-burrowing").system.quantity, 20);
  assert.equal(byRule(hero("vernon-roche"), "ammunition.armor-piercing").system.quantity, 10);
  assert.equal(byRule(hero("vernon-roche"), "ammunition.broadhead").system.quantity, 10);
  for (const id of ["vernon-roche", "iorveth"]) assert.equal(byRule(hero(id), "gear.stakes").system.quantity, 1, "one five-stake pack");
  assert.equal(byRule(hero("letho-of-gulet"), "weapon.throwing-knife").system.quantity, 4);
  assert.equal(byRule(hero("letho-of-gulet"), "alchemy.black-venom").system.quantity, 3);
  assert.equal(byRule(hero("triss-merigold"), "alchemy.wives-tears").system.quantity, 2);
  assert.equal(byRule(hero("yennefer-of-vengerberg"), "material.fifth-essence").system.quantity, 10);
  const shortages = packs.pregens.flatMap(actor => (actor.flags[SYSTEM_ID].pregen.missing ?? []).map(item => {
    assert.ok(actor.system.biography.sessionNotes.includes(item.name));
    assert.ok(!actor.items.some(owned => owned.name === item.name));
    return [actor.name, item.name, item.quantity];
  }));
  assert.deepEqual(shortages, []);
  for (const id of ["bomb.northern-wind", "bomb.devils-puffball"]) assert.equal(byRule(hero("letho-of-gulet"), id).system.quantity, 3);
  for (const id of ["yennefer-of-vengerberg", "triss-merigold"]) {
    const actor = hero(id), pouch = byRule(actor, "gear.ritual-pouch");
    assert.equal(pouch.system.kind, "container"); assert.equal(pouch.system.quantity, 1);
    assert.equal(pouch.system.capacity, 5);
    const ingredients = actor.items.filter(item => item.system.kind === "material" || item.system.ruleId === "gear.chalk");
    assert.ok(ingredients.length);
    assert.ok(ingredients.every(item => item.system.containerId === pouch._id));
    assert.ok(!actor.system.biography.sessionNotes.includes("В каталоге пока отсутствуют"));
  }
});

test("Zoltan's horse, saddle, saddlebags and cart use native transport links and do not weigh down the character", () => {
  const actor = structuredClone(hero("zoltan-chivay"));
  actor.items.forEach(item => { item.id = item._id; });
  const horse = byRule(actor,"transport.horse"), cart = byRule(actor,"transport.cart"), saddle = byRule(actor,"tack.saddle"), bags = byRule(actor,"tack.saddlebags");
  assert.equal(cart.system.transport.mountId, horse.id);
  assert.equal(saddle.system.containerId, horse.id); assert.equal(bags.system.containerId, horse.id);
  assert.equal(carriedWeight(actor.items), carriedWeight(actor.items.filter(item => ![horse,cart,saddle,bags].includes(item))));
  assert.deepEqual(hero("dandelion").system.languages.map(row => row.level), [8,8,8]);
  assert.equal(hero("zoltan-chivay").system.languages.find(row => row.id === "language.common").level, 9);
});
