import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { backgroundModifiers, modifierTotal } from "../scripts/data/background-modifiers.mjs";
import { ORIGINS } from "../scripts/data/origins.mjs";

const system = details => ({ attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])), health: { value: 50, max: 50 }, details });

test("family Luck is derived once, disappears on switching, and never applies to witchers", () => {
  for (const familyStatus of ["north.peasants", "nilfgaard.peasants", "elder.low-born"]) {
    const data = system({ race: "human", familyStatus });
    assert.equal(deriveStatistics(data).effective.luck, 11);
    assert.equal(deriveStatistics(data).effective.luck, 11);
    assert.equal(data.attributes.luck, 10);
    data.details.race = "witcher";
    assert.equal(deriveStatistics(data).effective.luck, 10);
    data.details.race = "human";
    data.details.familyStatus = "north.merchants";
    assert.equal(deriveStatistics(data).effective.luck, 10);
  }
});

test("witcher bonuses precede wound penalties, preserve base values and obey EMP limits", () => {
  const data = system({ race: "witcher", familyStatus: "north.mage-ward", origin: "redania" });
  const stats = deriveStatistics(data);
  assert.equal(stats.effective.reflex, 11);
  assert.equal(stats.effective.dexterity, 11);
  assert.equal(stats.effective.empathy, 6);
  assert.equal(stats.skillBonuses.education, undefined);
  assert.equal(stats.skillBonuses.awareness, 1);
  data.health.value = 9;
  assert.equal(deriveStatistics(data).effective.reflex, 5);
  assert.equal(data.attributes.reflex, 10);
  data.attributes.empathy = 2;
  assert.equal(deriveStatistics(data).effective.empathy, 1);
  data.attributes.empathy = 100;
  assert.equal(deriveStatistics(data).effective.empathy, 6);
  data.attributes.empathy = null;
  assert.equal(deriveStatistics(data).effective.empathy, null);
});

test("skill/reputation/armor bonuses keep their targets and stack only when eligible", () => {
  const dwarf = deriveStatistics(system({ race: "dwarf", familyStatus: "elder.aristocracy", origin: "mahakam" }));
  assert.equal(dwarf.effective.body, 10);
  assert.equal(dwarf.carryMax, 125);
  assert.equal(dwarf.naturalArmor, 2);
  assert.equal(dwarf.reputationBonus, 2);
  assert.equal(dwarf.skillBonuses.physique, 1);
  assert.equal(dwarf.skillBonuses.crafting, 1);
  const human = deriveStatistics(system({ race: "human", familyStatus: "north.mage-ward", origin: "redania" }));
  assert.equal(human.skillBonuses.education, 2);
  assert.equal(human.effective.intelligence, 10);
  assert.equal(human.skillBonuses.charisma, 0);
  assert.equal(modifierTotal(human.modifiers, "skills.charisma", ["humanTarget"]), 1);
  for (const origin of ORIGINS) {
    const modifiers = backgroundModifiers({ origin: origin.id });
    assert.equal(modifiers.length, 1);
    assert.ok(!modifiers[0].target.includes("undefined"));
    assert.deepEqual(backgroundModifiers({ race: "witcher", origin: origin.id }).filter(mod => mod.source === origin.id), []);
  }
});
