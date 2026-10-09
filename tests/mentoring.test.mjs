import { test } from "node:test";
import assert from "node:assert/strict";
import { advancementPlan } from "../scripts/data/advancement.mjs";
import { purchaseAdvancement } from "../scripts/data/advancement-purchase.mjs";
import { advancementFingerprint } from "../scripts/data/advancement.mjs";
import { applyTraining, mentorLimit, trainingQuote, SELF_STUDY_LIMIT } from "../scripts/data/mentoring.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { LANGUAGES } from "../scripts/data/languages.mjs";

const actor = (skills = {}, languages = []) => {
  const result = { uuid: `Actor.${Math.random()}`, isOwner: true, items: [], updates: [], system: {
    experience: 0, attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 5])),
    skills: { ...Object.fromEntries(SKILL_KEYS.map(key => [key, 0])), ...skills }, languages, training: {},
    health: { value: 25, max: 25 }, stamina: { value: 12, max: 25 }, details: { race: "human", profession: "" }, abilityState: {} } };
  Object.defineProperty(result.system, "statistics", { get: () => deriveStatistics(result.system) });
  result.update = async function(update) {
    this.updates.push(update);
    for (const [path, value] of Object.entries(update)) {
      const parts = path.split("."), key = parts.pop(); let target = this;
      for (const part of parts) target = target[part];
      target[key] = value;
    }
    return this;
  };
  return result;
};

test("the mentor limit follows both book examples (core p.59)", () => {
  assert.equal(mentorLimit(10, 2), 6);
  assert.equal(mentorLimit(8, 10), 8);
  assert.equal(mentorLimit(7, 4), 5, "an odd average rounds down");
});

test("a lesson invests IP into one skill, carries the remainder and stops at the teacher's limit", async () => {
  const teacher = actor({ swordsmanship: 10, teaching: 2 }), student = actor({ swordsmanship: 4 });
  let quote = trainingQuote(student, { entryId: "skill:swordsmanship", teacher, points: 5 });
  assert.equal(quote.limit, 6); assert.equal(quote.to, 5); assert.deepEqual(quote.steps, [4]); assert.equal(quote.progress, 1);
  await applyTraining(student, { entryId: "skill:swordsmanship", teacher, points: 5 });
  assert.equal(student.system.skills.swordsmanship, 5); assert.equal(student.system.training["skill:swordsmanship"], 1);
  quote = await applyTraining(student, { entryId: "skill:swordsmanship", teacher, points: 9 });
  assert.equal(quote.to, 6); assert.equal(quote.wasted, 5, "1 + 9 − 5 cannot go past the limit");
  assert.equal(student.system.training["skill:swordsmanship"], 0);
  assert.match(trainingQuote(student, { entryId: "skill:swordsmanship", teacher, points: 3 }).error, /до 6/);
});

test("the teacher must know the skill better, and cannot teach themselves", () => {
  const teacher = actor({ alchemy: 3, teaching: 10 }), student = actor({ alchemy: 3 });
  assert.match(trainingQuote(student, { entryId: "skill:alchemy", teacher, points: 2 }).error, /лучше ученика/);
  assert.match(trainingQuote(student, { entryId: "skill:alchemy", teacher: student, points: 2 }).error, /самому себе/);
  assert.match(trainingQuote(student, { entryId: "skill:alchemy", teacher, points: 0 }).error, /О\.У\./);
});

test("study without a mentor: one IP per day, complex skills cost double, and only up to 2", async () => {
  const student = actor();
  const quote = await applyTraining(student, { entryId: "skill:alchemy", points: 3 });
  assert.equal(SELF_STUDY_LIMIT, 2); assert.equal(quote.to, 1); assert.equal(quote.progress, 1);
  await applyTraining(student, { entryId: "skill:alchemy", points: 1 });
  assert.equal(student.system.skills.alchemy, 2);
  assert.match(trainingQuote(student, { entryId: "skill:alchemy", points: 1 }).error, /только до 2/);
});

test("languages are matched by language, not by the entry id of each actor", async () => {
  const language = LANGUAGES[0];
  // The teacher's own entry has its own id and is recognised by its name.
  const teacher = actor({ teaching: 8 }, [{ id: "teacherEntry00001", name: language.aliases[0], level: 8 }]);
  const student = actor();
  const entryId = `language:${language.documentId}`;
  const quote = trainingQuote(student, { entryId, teacher, points: 4 });
  assert.equal(quote.error, "", quote.error); assert.equal(quote.teacherLevel, 8); assert.equal(quote.to, 2);
  await applyTraining(student, { entryId, teacher, points: 4 });
  assert.equal(student.system.languages[0].level, 2);
});

test("invested points lower the next purchase in the advancement window and are cleared by it", async () => {
  const student = actor({ swordsmanship: 4 });
  student.system.training["skill:swordsmanship"] = 3; student.system.experience = 1;
  const plan = advancementPlan(student, { "skill:swordsmanship": 5 });
  assert.equal(plan.cost, 1); assert.equal(plan.valid, true);
  await purchaseAdvancement(student, { "skill:swordsmanship": 5 }, advancementFingerprint(student));
  assert.equal(student.system.skills.swordsmanship, 5); assert.equal(student.system.training["skill:swordsmanship"], 0);
  assert.equal(student.system.experience, 0);
});
