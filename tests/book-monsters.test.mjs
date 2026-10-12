import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { monsterMaterial, weaponDamageTraits, resolveDamage } from "../scripts/combat/damage-rules.mjs";
import { bookMonstersEnabled } from "../scripts/settings.mjs";

const creature = category => ({ type: "npc", items: [], system: { creature: { category } } });
const hit = (actor, properties, options = {}) => resolveDamage({ base: 20, silver: 9, multiplier: 1, location: "torso",
  traits: weaponDamageTraits({ properties, damageType: "Р" }), armor: { sp: 0, layers: [], resistances: [], ablate: [] },
  monsterMaterial: monsterMaterial(actor), ...options });
const silver = "Серебряное (3d6)", meteorite = "Метеоритное";

function rule(t, enabled) {
  const previous = globalThis.game;
  t.after(() => { if (previous === undefined) delete globalThis.game; else globalThis.game = previous; });
  globalThis.game = { settings: { get: (namespace, key) => {
    assert.equal(namespace, SYSTEM_ID); assert.equal(key, "bookMonsters"); return enabled;
  } } };
}

test("base rules remain the default and are restored when the optional rule is disabled", t => {
  rule(t, false);
  assert.equal(bookMonstersEnabled(), false);
  for (const category of ["hybrid", "draconid", "insectoid", "ogroid", "necrophage"]) {
    const actor = creature(category);
    assert.equal(monsterMaterial(actor), "silver");
    assert.equal(hit(actor, "", { silver: 0 }).total, 10);
    assert.equal(hit(actor, meteorite, { silver: 0 }).total, 10);
    assert.equal(hit(actor, silver).total, 29);
  }
  for (const category of ["beast", "humanoid"]) {
    assert.equal(monsterMaterial(creature(category)), null);
    assert.equal(hit(creature(category), silver).total, 20);
  }
});

test("all eleven book categories use their listed metal, including beasts", t => {
  rule(t, true);
  for (const [material, categories] of [
    ["silver", ["cursed", "elemental", "necrophage", "relict", "specter", "vampire"]],
    ["meteorite", ["beast", "hybrid", "draconid", "insectoid", "ogroid"]]
  ]) for (const category of categories) {
    const actor = creature(category);
    assert.equal(monsterMaterial(actor), material, category);
    assert.equal(hit(actor, "", { silver: 0 }).total, 10, `${category}: ordinary steel`);
    assert.equal(hit(actor, meteorite, { silver: 0 }).total, material === "meteorite" ? 20 : 10, `${category}: meteorite`);
    assert.equal(hit(actor, silver).total, material === "silver" ? 29 : 10, `${category}: silver`);
    assert.equal(hit(actor, `${meteorite}; ${silver}`).total, material === "silver" ? 29 : 20, `${category}: both metals`);
  }
});

test("humanoids, characters and a werewolf's human form do not acquire metal resistance", t => {
  rule(t, true);
  const werewolf = creature("cursed");
  werewolf.items.push({ type: "ability", system: { ruleId: "creature.werewolf.transform" } });
  werewolf.system.creature.transformed = false;
  for (const actor of [creature("humanoid"), { ...creature("beast"), type: "character" }, werewolf]) {
    assert.equal(monsterMaterial(actor), null);
    assert.equal(hit(actor, silver).total, 20);
  }
});

test("metal resistance preserves armor, location, critical bonus and fire rules", t => {
  rule(t, true);
  const actor = creature("hybrid");
  const armor = { sp: 4, layers: [{ name: "Шкура", sp: 4 }], resistances: [], ablate: ["natural"] };
  const result = hit(actor, "", { silver: 0, armor, multiplier: 0.5, critical: { name: "Лёгкое", bonus: 3 } });
  assert.equal(result.total, 7, "(20 − 4) × ½ limb × ½ resistance + 3 critical");
  assert.deepEqual(result.ablate, ["natural"]);
  assert.ok(result.steps.some(step => step.label === "Чудовище: не метеоритная сталь"));
  assert.equal(hit(actor, meteorite, { silver: 0, armor, multiplier: 0.5 }).total, 8);
  assert.equal(hit(actor, "", { silver: 0, traits: weaponDamageTraits({ damageType: "С" }) }).total, 20);
  assert.equal(hit(actor, "", { silver: 0, traits: weaponDamageTraits({ damageType: "С" }), vulnerableToFire: true }).total, 40);
});
