import test from "node:test";
import assert from "node:assert/strict";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { immuneToCondition } from "../scripts/data/creatures.mjs";
import { environmentModifiers } from "../scripts/combat/environment.mjs";
import { weaponHitTraits, weaponConditionChances } from "../scripts/combat/weapon-hit-effects.mjs";
import { creatureRegeneration } from "../scripts/data/creature-regeneration.mjs";

// Monster Hunter's Journal pp.16–21: the book prints skill bases (attribute + skill), defenses and derived values.
function creature(name) {
  const source = structuredClone(bestiarySources().find(actor => actor.name === name));
  assert.ok(source, name);
  source.effects = [];
  source.items = source.items.map(item => ({ ...item, id: item._id }));
  for (const item of source.items) item.parent = source;
  source.system.parent = source;
  source.system.statistics = deriveStatistics(source.system, { items: source.items });
  return source;
}
const base = (actor, key) => skillValue(actor.system, key).total;
const weapon = (actor, name) => actor.items.find(item => item.type === "weapon" && item.name === name);

test("graveir, foglet and rotfiend reproduce the printed skill bases, defenses and derived statistics", () => {
  const printed = {
    "Утковол": { athletics: 10, brawling: 14, awareness: 10, wildernessSurvival: 7, intimidation: 14, physique: 20, stealth: 5, resistMagic: 14, resistCoercion: 14, endurance: 20, courage: 15, dodgeEscape: 13 },
    "Туманник": { athletics: 16, brawling: 12, awareness: 14, wildernessSurvival: 12, intimidation: 13, physique: 9, stealth: 15, resistMagic: 14, endurance: 10, courage: 12, dodgeEscape: 15, melee: 15 },
    "Гнилец": { athletics: 12, brawling: 10, awareness: 8, wildernessSurvival: 10, intimidation: 10, physique: 8, stealth: 10, resistMagic: 9, endurance: 8, courage: 13, dodgeEscape: 12, melee: 12 }
  };
  const derived = { "Утковол": [9, 9, 1, 45, 90, 9], "Туманник": [6, 18, 3, 30, 60, 6], "Гнилец": [5, 33, 6, 25, 25, 5] };
  for (const [name, skills] of Object.entries(printed)) {
    const actor = creature(name), stats = actor.system.statistics;
    for (const [key, value] of Object.entries(skills)) assert.equal(base(actor, key), value, `${name}: ${key}`);
    assert.deepEqual([stats.stun, stats.run, stats.leap, actor.system.stamina.max, actor.system.health.max, stats.recovery], derived[name], name);
    assert.equal(actor.system.creature.category, "necrophage");
    assert.equal(actor.system.creature.source, "Дневник охотника на чудовищ");
  }
  // Reposition is DEX + Athletics; block uses the claws' skill.
  const graveir = creature("Утковол"), foglet = creature("Туманник"), rotfiend = creature("Гнилец");
  assert.deepEqual([graveir, foglet, rotfiend].map(actor => base(actor, "athletics")), [10, 16, 12]);
  assert.deepEqual([graveir, foglet, rotfiend].map(actor => base(actor, weapon(actor, "Удар когтями").system.skill)), [14, 15, 12]);
});

test("printed attacks keep their damage, rate, type, range and effects", () => {
  const graveir = creature("Утковол");
  const claws = weapon(graveir, "Удар когтями").system, horns = weapon(graveir, "Удар рогами").system, vomit = weapon(graveir, "Едкая рвота").system;
  assert.deepEqual([claws.damage, claws.attackRate, claws.damageType], ["3d6+3", 2, "Р"]);
  assert.deepEqual([horns.damage, horns.attackRate, horns.damageType], ["5d6", 1, "К"]);
  assert.match(horns.properties, /Кровопускающее \(50%\)/u);
  assert.deepEqual([vomit.damage, vomit.range, vomit.category], ["3d6", 8, "ranged"]);
  assert.equal(base(graveir, vomit.skill) + vomit.accuracy, 13, "acid vomit has a printed base of 13");
  assert.match(vomit.properties, /Нельзя парировать/u);
  assert.equal(graveir.system.creature.naturalArmor, 8);
  const foglet = weapon(creature("Туманник"), "Удар когтями").system, rotfiend = weapon(creature("Гнилец"), "Удар когтями").system;
  assert.deepEqual([foglet.damage, foglet.attackRate, rotfiend.damage, rotfiend.attackRate], ["3d6+2", 2, "3d6", 1]);
});

test("regeneration, immunities and enhanced night vision follow the statblocks", () => {
  const graveir = creature("Утковол"), foglet = creature("Туманник"), rotfiend = creature("Гнилец");
  const regeneration = graveir.items.find(item => item.name === "Регенерация");
  assert.equal(regeneration.flags["witcher-eliott-system"].regeneration, 4);
  for (const actor of [graveir, rotfiend]) {
    assert.equal(immuneToCondition(actor, ["poisoned"]), true, actor.name);
    assert.equal(immuneToCondition(actor, ["bleeding"]), true, actor.name);
  }
  assert.equal(immuneToCondition(foglet, ["bleeding"]), false);
  assert.equal(immuneToCondition(foglet, ["poisoned"]), false);
  const dark = { light: { id: "dark", name: "Темнота", modifiers: [{ target: "skills.awareness", value: -3 }] }, terrain: { id: "normal", modifiers: [] }, heat: false };
  assert.equal(environmentModifiers(dark, { items: graveir.items }).length, 0, "enhanced night vision ignores darkness");
  assert.equal(environmentModifiers(dark, { items: foglet.items }).length, 1, "ordinary night vision does not");
});

test("graveir acid ablates 1d10, wears a blocking item by 1d10 and poisons even through intact armor", () => {
  const vomit = weapon(creature("Утковол"), "Едкая рвота").system, traits = weaponHitTraits(vomit);
  assert.deepEqual([traits.ablating, traits.ablationDice, traits.blockWear, traits.contact, traits.noParry, traits.poisoned], [true, "1d10", "1d10", true, true, 100]);
  assert.deepEqual(weaponConditionChances(traits, { total: 0, penetrated: false }).map(row => row.id), ["poisoned"]);
  assert.deepEqual(weaponConditionChances(traits, { total: 0, penetrated: false, immune: true }), []);
  const ordinary = weaponHitTraits({ properties: "Разрушающее; Отравление (100%)" });
  assert.deepEqual([ordinary.ablationDice, ordinary.blockWear, ordinary.contact], [null, null, false]);
  assert.deepEqual(weaponConditionChances(ordinary, { total: 0, penetrated: false }), []);
});

test("Moon Dust stops the graveir's regeneration of 4", () => {
  const graveir = creature("Утковол");
  assert.equal(creatureRegeneration(graveir).total, 4);
  graveir.effects.push({ statuses: new Set(), flags: { "witcher-eliott-system": { creatureSuppression: { kind: "moon-dust" } } } });
  assert.equal(creatureRegeneration(graveir).total, 0);
});
