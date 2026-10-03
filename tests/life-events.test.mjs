import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLifeEvent } from "../scripts/data/life-event-generator.mjs";
import { lifeEventModifiers } from "../scripts/data/life-events.mjs";
import { validateLifeEvent } from "../scripts/data/life-event-fields.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";

const generate = async (draws, age = 30) => {
  const result = await generateLifeEvent(age, async faces => { assert.equal(faces, 10); assert.ok(draws.length); return draws.shift(); });
  assert.equal(draws.length, 0); return result;
};
test("ordinary tables use independent parity rolls, months, enemy power and romance followups", async () => {
  assert.deepEqual((await generate([1, 2, 1, 7])).fortune, { result: "money", amount: 700 });
  assert.deepEqual((await generate([4, 1, 2, 8])).misfortune, { result: "prison", months: 8 });
  const enemy = (await generate([7, 1, 2, 10, 4, 2, 9, 8, 10])).enemy;
  assert.equal(enemy.gender, "Женщина"); assert.equal(enemy.strength, 9); assert.equal(enemy.power, "Магия");
  assert.equal(enemy.injured, "Персонаж");
  assert.equal((await generate([8, 4, 10])).romance.tragedy, "nature");
  assert.equal((await generate([10, 6, 9])).romance.difficulty, "married");
  assert.equal((await generate([9, 7])).romance.result, "casual");
});
test("all generated table routes are finite and produce persistable kinds", async () => {
  for (let main = 1; main <= 10; main++) for (let parity = 1; parity <= 10; parity++) for (let result = 1; result <= 10; result++) {
    const values = [main, parity, result]; let draws = 0;
    const event = await generateLifeEvent(40, async () => { assert.ok(++draws < 20); return values.shift() ?? 5; });
    assert.ok(["fortune", "misfortune", "ally", "enemy", "romance"].includes(event.kind));
  }
});
test("life events modify only their character, respect skill ceilings and isolate languages", () => {
  const system = { details: { race: "human" }, attributes: Object.fromEntries(["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"].map(key => [key, 10])),
    health: { value: 45, max: 50 }, skills: { education: 9 }, languages: [{ id: "lang000000000001", name: "Всеобщий", level: 8 }, { id: "lang000000000002", name: "Старшая Речь", level: 8 }],
    abilityState: {}, lifepath: { events: [
      { id: "a", kind: "fortune", fortune: { result: "teacher", skill: "education", skillBonus: 2 } },
      { id: "b", kind: "misfortune", misfortune: { result: "trauma", trauma: "poison" } },
      { id: "c", kind: "fortune", fortune: { result: "teacher", skill: "language.common", skillBonus: 1 } }
    ] } };
  system.statistics = deriveStatistics(system);
  assert.equal(system.statistics.healthMax, 45); assert.equal(system.statistics.staminaMax, 50);
  assert.equal(skillValue(system, "education").total, 20);
  assert.equal(skillValue(system, "language", "lang000000000001").total, 19);
  assert.equal(skillValue(system, "language", "lang000000000002").total, 18);
  system.details.race = "witcher"; assert.deepEqual(lifeEventModifiers(system), []);
});
test("training rejects wrong stats and amounts", () => {
  const event = { kind: "fortune", fortune: { result: "teacher", skill: "swordsmanship", skillBonus: 1 } };
  assert.ok(validateLifeEvent(event)); event.fortune.result = "instructor";
  assert.equal(validateLifeEvent(event), ""); event.fortune.skillBonus = 7; assert.ok(validateLifeEvent(event));
});
