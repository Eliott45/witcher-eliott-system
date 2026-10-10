import test from "node:test";
import assert from "node:assert/strict";
import { bestiarySources, bestiaryPreset } from "../scripts/data/bestiary.mjs";
import { CORE_BESTIARY } from "../scripts/data/bestiary-core.mjs";
import { CORE_EQUIPMENT } from "../scripts/data/core-equipment.mjs";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { ALCHEMY } from "../scripts/data/workshop-alchemy.mjs";
import { ELDER_EQUIPMENT } from "../scripts/data/elder-equipment.mjs";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { focusOptions } from "../scripts/magic/rules.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { hitLocation } from "../scripts/combat/weapon-rules.mjs";

const equipment = [...CORE_EQUIPMENT, ...MATERIALS, ...ALCHEMY, ...ELDER_EQUIPMENT];
const equipmentUuid = entry => `Compendium.witcher-eliott-system.equipment.Item.${entry.documentId}`;

test("audited creature exceptions preserve book statistics and the tail or wing hit location", () => {
  const sources=bestiarySources(),get=name=>sources.find(source=>source.name===name);
  const chief=get("Накер-вожак"),chiefStats=deriveStatistics(chief.system);
  assert.equal(chief.system.attributes.body,4);
  assert.equal(chiefStats.stun,4);assert.equal(chiefStats.recovery,4);assert.equal(chiefStats.carryMax,40);
  assert.equal(chiefStats.healthMax,20);assert.equal(chiefStats.staminaMax,20);
  const bird=get("Птица"),birdStats=deriveStatistics(bird.system);
  assert.equal(birdStats.run,10);assert.equal(birdStats.leap,2);
  const fiendStats=deriveStatistics(get("Бес").system);
  assert.equal(fiendStats.recovery,11);assert.equal(fiendStats.stun,10);
  assert.equal(get("Скальный тролль").system.creature.sizeClass,"large");
  for(const name of ["Сирена","Эндриага-воин","Птица"]) {
    const anatomy=get(name).system.creature;
    assert.equal(hitLocation(10,"monster",anatomy).id,"tail",name);
  }
  assert.equal(hitLocation(10,"monster",get("Эндриага-рабочий").system.creature).id,"leftArm");
});

test("the complete bestiary is a stable flat set of 35 distinct NPCs with distinct embedded IDs", () => {
  const sources = bestiarySources();
  assert.equal(sources.length, 35);
  assert.equal(new Set(sources.map(source => source._id)).size, 35);
  assert.equal(new Set(sources.map(source => source.name)).size, 35);
  assert.deepEqual(sources.slice(0, 2).map(source => source._id), ["bestiaryBandit01", "bestiaryDrowner1"]);
  for (const source of sources) {
    assert.equal(source.type, "npc");
    assert.ok(!source.folder, source.name);
    assert.match(source._id, /^[a-zA-Z0-9]{16}$/u);
    assert.equal(new Set(source.items.map(item => item._id)).size, source.items.length, source.name);
    for (const item of source.items) assert.match(item._id, /^[a-zA-Z0-9]{16}$/u);
  }
  assert.deepEqual(bestiarySources(), sources);
});

test("every specific harvested item resolves to the real catalog; only random loot and currency stay generic", () => {
  const catalog = new Set(equipment.map(equipmentUuid));
  const generic = new Set(["Кроны", "Обычные предметы", "Странные предметы", "Странные вещи", "Случайные предметы", "Случайная руна",
    // Monster Hunter's Journal p.26 names this essence without a price or substance, so it has no catalog item.
    "Эссенция баргеста"]);
  for (const source of bestiarySources()) {
    for (const row of source.system.harvest ?? []) {
      assert.ok(catalog.has(row.uuid), `${source.name}: ${row.uuid}`);
      assert.ok(row.quantity > 0 || row.formula, `${source.name}: ${row.id}`);
    }
    for (const row of source.system.creature.loot ?? []) assert.ok(generic.has(row.name), `${source.name}: ${row.name}`);
  }
  const ghoul = bestiarySources().find(source => source.name === "Гуль");
  assert.ok(ghoul.system.harvest.some(row => row.uuid === equipmentUuid(MATERIALS.find(entry => entry.id === "material.ghoul-claw"))));
});

test("manufactured weapons retain catalog durability, damage types and crafting identities with statblock attacks", () => {
  for (const source of bestiarySources().slice(2)) {
    const entry = CORE_BESTIARY.find(entry => entry.name === source.name);
    for (const item of source.items.filter(item => item.type === "weapon" && !item.system.natural)) {
      const catalog = CORE_EQUIPMENT.find(entry => entry.id === item.system.ruleId);
      const printed = entry.weapons.find(weapon => weapon.name === item.name);
      assert.ok(catalog, `${source.name}: ${item.name}`);
      assert.equal(item.flags.core.sourceId, equipmentUuid(catalog));
      assert.deepEqual(item.system.reliability, catalog.system.reliability);
      assert.ok(item.system.reliability.value > 0);
      assert.equal(item.system.damageType, catalog.system.damageType);
      assert.equal(item.system.price, catalog.system.price);
      assert.equal(item.system.weight, catalog.system.weight);
      assert.equal(item.system.damage, printed.damage);
      assert.equal(item.system.attackRate, printed.rate);
      assert.equal(item.system.damageIncludesBody, true);
      if (printed.accuracy !== undefined) assert.equal(item.system.accuracy, printed.accuracy);
      if (printed.range !== undefined) {
        assert.equal(item.system.range, printed.range);
        assert.equal(item.system.rangeBodyMultiplier, 0);
      }
    }
  }
});

test("mage has all nine real spells and a usable focus of 2, which ceases to work when broken", () => {
  const mage = bestiarySources().find(source => source.name === "Маг");
  mage.items = mage.items.map(item => ({ ...item, id: item._id }));
  const spells = mage.items.filter(item => item.type === "spell");
  assert.equal(spells.length, 9);
  for (const spell of spells) {
    const canonical = CORE_MAGIC.find(entry => entry.id === spell.system.ruleId);
    assert.ok(canonical, spell.name);
    assert.deepEqual(spell.system, canonical.system);
    assert.equal(spell.flags.core.sourceId, `Compendium.witcher-eliott-system.spells.Item.${canonical.documentId}`);
  }
  const staff = mage.items.find(item => item.system.ruleId === "weapon.iron-staff");
  assert.deepEqual(focusOptions(mage), [{ id: staff.id, name: staff.name, rating: 2, greater: false }]);
  staff.system.reliability.value = 0;
  assert.deepEqual(focusOptions(mage), []);
});

test("archer carries thirty arrows and ten elven arrows exactly once, with canonical ammunition properties", () => {
  const archer = bestiarySources().find(source => source.name === "Лучник скоя'таэлей");
  const ammunition = archer.items.filter(item => item.system.kind === "ammunition");
  assert.deepEqual(ammunition.map(item => [item.system.ruleId, item.system.quantity]), [["ammunition.standard", 30], ["ammunition.elven-burrowing", 10]]);
  for (const item of ammunition) {
    const canonical = equipment.find(entry => entry.id === item.system.ruleId);
    assert.equal(item.flags.core.sourceId, equipmentUuid(canonical));
    assert.equal(item.system.properties, canonical.system.properties);
    assert.equal(item.system.carried, true);
    assert.equal(item.system.equipped, false);
    assert.ok(!archer.system.harvest.some(row => row.uuid === equipmentUuid(canonical)));
  }
});

test("restoration distinguishes endrega variants sharing a page and retains renamed imported identities", () => {
  const sources = bestiarySources(), worker = sources.find(source => source.name === "Эндриага-рабочий"), warrior = sources.find(source => source.name === "Эндриага-воин");
  assert.equal(worker.system.creature.source, warrior.system.creature.source);
  const actor = { id: "customWorld00001", name: warrior.name, system: structuredClone(warrior.system) };
  assert.equal(bestiaryPreset(actor)._id, warrior._id, "Name and source are both required for legacy copies");
  actor.name = "Раненый воин";
  actor._stats = { compendiumSource: `Compendium.witcher-eliott-system.bestiary.Actor.${warrior._id}` };
  assert.equal(bestiaryPreset(actor)._id, warrior._id, "A rename does not change compendium identity");
  delete actor._stats;
  actor.flags = { core: { sourceId: `Compendium.witcher-eliott-system.bestiary.Actor.${warrior._id}` } };
  assert.equal(bestiaryPreset(actor)._id, warrior._id, "A renamed sheet preset keeps its origin flag");
  delete actor.flags;
  actor.id = worker._id;
  assert.equal(bestiaryPreset(actor)._id, worker._id, "Canonical compendium documents can use their own ID");
  actor.id = "unknownActor0001";
  assert.equal(bestiaryPreset(actor), null, "A page reference cannot identify an unknown creature");
});
