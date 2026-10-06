import test from "node:test";
import assert from "node:assert/strict";
import { parseDamageTypes, weaponDamageTraits, layeredStoppingPower, criticalLevel, resolveDamage } from "../scripts/combat/damage-rules.mjs";
import { criticalWoundByRoll, aimedCriticalRoll } from "../scripts/data/critical-wounds.mjs";

const armor = (sp, resistances = []) => ({ sp, resistances, layers: sp ? [{ name: "Броня", sp }] : [], ablate: sp ? "armor" : null });
const traits = (properties = "", damageType = "Р/К") => weaponDamageTraits({ properties, damageType });
const hit = options => resolveDamage({ location: "torso", multiplier: 1, traits: traits(), armor: armor(0), ...options });

test("damage types and weapon traits are read from catalog fields", () => {
  assert.deepEqual(parseDamageTypes("Р/К"), ["slashing", "piercing"]);
  assert.deepEqual(parseDamageTypes("К/Д"), ["piercing", "bludgeoning"]);
  assert.equal(traits("Пробивающее броню; Метеоритное").piercing, "normal");
  assert.equal(traits("Улучшенное пробивающее броню").piercing, "improved");
  assert.equal(traits("Реликвия; Серебряное (7d6+4)").silverDice, "7d6+4");
  assert.equal(traits("Горение (30%)").types.includes("elemental"), false, "a burn chance is not fire damage");
});

test("layered armor follows the errata example: gambeson 3, brigandine 12, plate 20 → 24", () => {
  assert.equal(layeredStoppingPower([20, 3, 12]), 24);
  assert.equal(layeredStoppingPower([12]), 12);
  assert.equal(layeredStoppingPower([0, 0]), 0);
});

test("SP first, resistance halves what is left, then the location multiplier", () => {
  assert.equal(hit({ base: 20, armor: armor(5) }).total, 15);
  assert.equal(hit({ base: 20, armor: armor(5, ["slashing", "piercing"]) }).total, 7);
  assert.equal(hit({ base: 20, armor: armor(5, ["slashing"]) }).total, 15, "attacker picks the unresisted type");
  assert.equal(hit({ base: 20, armor: armor(5, ["slashing", "piercing"]), traits: traits("Пробивающее броню") }).total, 15);
  assert.equal(hit({ base: 20, armor: armor(10), traits: traits("Улучшенное пробивающее броню") }).total, 15);
  assert.equal(hit({ base: 10, armor: armor(4), location: "head", multiplier: 3 }).total, 18);
  assert.equal(hit({ base: 11, location: "leftArm", multiplier: 0.5 }).total, 5);
});

test("armor ablates only when the weapon damage penetrates; critical bonus ignores armor", () => {
  const blocked = hit({ base: 6, armor: armor(10), critical: { name: "Лёгкое", bonus: 3 } });
  assert.equal(blocked.total, 3); assert.equal(blocked.penetrated, false); assert.equal(blocked.ablate, null);
  const through = hit({ base: 12, armor: armor(10) });
  assert.equal(through.total, 2); assert.equal(through.ablate, "armor");
});

test("monsters halve non-silver damage; silver dice count only against them; fire is exempt", () => {
  assert.equal(hit({ base: 20, monster: true }).total, 10);
  assert.equal(hit({ base: 6, silver: 9, monster: true, traits: traits("Серебряное (3d6)") }).total, 15);
  assert.equal(hit({ base: 6, silver: 9, monster: false, traits: traits("Серебряное (3d6)") }).total, 6);
  assert.equal(hit({ base: 20, monster: true, traits: traits("", "С") }).total, 20);
  assert.equal(hit({ base: 20, monster: true, vulnerableToFire: true, traits: traits("", "С") }).total, 40);
});

test("critical levels by margin and the aimed critical rule", () => {
  assert.equal(criticalLevel(6), null);
  assert.deepEqual([7, 10, 13, 15, 22].map(margin => criticalLevel(margin).id), ["light", "medium", "severe", "deadly", "deadly"]);
  assert.equal(criticalWoundByRoll("medium", 7).id, "broken-ribs");
  assert.equal(criticalWoundByRoll("deadly", 12).id, "decapitation");
  assert.deepEqual([aimedCriticalRoll("head", 4), aimedCriticalRoll("head", 5), aimedCriticalRoll("torso", 2), aimedCriticalRoll("torso", 6), aimedCriticalRoll("leftArm", 1), aimedCriticalRoll("rightLeg", 1)], [11, 12, 6, 9, 4, 2]);
});
