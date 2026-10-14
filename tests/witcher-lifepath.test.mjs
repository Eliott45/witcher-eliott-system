import { test } from "node:test";
import assert from "node:assert/strict";
import { WITCHER_TABLES, witcherModifiers, witcherTrialModifier, witcherOutcome } from "../scripts/data/witcher-lifepath.mjs";
import { generateDecade } from "../scripts/data/witcher-decades.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { cappedSkillModifiers } from "../scripts/data/background-modifiers.mjs";

test("witcher schools and histories derive once, vanish on race change and preserve base values", () => {
  const system = { details: { race: "witcher" }, attributes: Object.fromEntries(["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"].map(key => [key, 10])),
    health: { value: 50, max: 50 }, vigor: 2, lifepath: { witcher: { school: "griffin", training: "gauntlet", trial: "extra", decades: [{ id: "wound", danger: { kind: "wound", wound: "breath" } }] } } };
  const a = deriveStatistics(system), b = deriveStatistics(system);
  assert.equal(a.vigor, 4); assert.equal(a.effective.speed, 9); assert.equal(a.staminaMax, 45);
  assert.equal(a.healthMax, 50); assert.deepEqual(a, b); assert.equal(system.attributes.speed, 10);
  system.details.race = "human";
  assert.equal(witcherModifiers(system).length, 0); assert.equal(deriveStatistics(system).staminaMax, 50);
  assert.equal(WITCHER_TABLES.school.length, 6);
  assert.equal(witcherTrialModifier({ recruitment: "infancy", training: "reaction" }), -4);
});
test("risk and benefit tables retain both independent events in a decade", async () => {
  assert.equal(witcherOutcome("cautious", 4), "nothing");
  assert.equal(witcherOutcome("risky", 5), "benefit");
  const draws = [1, 1, 4, 6, 3, 7]; // danger %, benefit outcome, wound, breath, money, amount
  const entry = await generateDecade(40, "risky", async () => draws.shift());
  assert.equal(draws.length, 0);
  assert.equal(entry.danger.wound, "breath"); assert.equal(entry.benefit.amount, 700);
});
test("lifepath ranks respect 10 while racial bonuses remain outside the cap", () => {
  const adjusted = cappedSkillModifiers(9, [{ category: "lifepath", value: 2 }, { category: "race", value: 2 }]);
  assert.deepEqual(adjusted.map(entry => entry.value), [1, 2]);
});
