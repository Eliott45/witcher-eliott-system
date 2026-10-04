import { test } from "node:test";
import assert from "node:assert/strict";
import { advancementCost, advancementEntries, advancementPlan, advancementFingerprint } from "../scripts/data/advancement.mjs";
import { purchaseAdvancement, setExperience } from "../scripts/data/advancement-purchase.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { PROFESSIONS } from "../scripts/data/professions.mjs";

const actor = () => {
  const result = { uuid: `Actor.${Math.random()}`, isOwner: true, items: [], updates: [], system: {
    experience: 100, attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 5])), skills: Object.fromEntries(SKILL_KEYS.map(key => [key, 0])),
    languages: [], health: { value: 25, max: 25 }, stamina: { value: 12, max: 25 }, details: { race: "human", profession: "" }, abilityState: {} } };
  Object.defineProperty(result.system, "statistics", { get: () => deriveStatistics(result.system) });
  result.update = async function(update) {
    this.updates.push(update);
    for (const [path, value] of Object.entries(update)) {
      if (!path.startsWith("system.")) continue;
      const parts = path.split("."); const key = parts.pop(); let target = this;
      for (const part of parts) target = target[part];
      target[key] = value;
    }
    return this;
  };
  return result;
};

test("advancement prices every step, including learning complex skills", () => {
  assert.deepEqual(advancementCost(4, 7), [4, 5, 6]);
  assert.deepEqual(advancementCost(0, 3), [1, 1, 2]);
  assert.deepEqual(advancementCost(0, 3, 2), [2, 2, 4]);
  assert.deepEqual(advancementCost(6, 8, 10), [60, 70]);
  assert.throws(() => advancementCost(10, 11));
  assert.throws(() => advancementCost(2, 1));
  assert.throws(() => advancementCost(1, 1.5));
});
test("restricted magic points cannot buy physical skills and participate in the guarded advancement transaction",async()=>{
  const a=actor();a.system.experience=1;a.system.magic={improvementPoints:10};
  let plan=advancementPlan(a,{"skill:spellCasting":1,"skill:athletics":1});
  assert.equal(plan.valid,true);assert.equal(plan.magicSpent,2);assert.equal(plan.regularSpent,1);assert.equal(plan.remaining,0);
  plan=advancementPlan(a,{"skill:athletics":3});assert.equal(plan.valid,false);assert.equal(plan.magicSpent,0);
  const expected=advancementFingerprint(a);await purchaseAdvancement(a,{"skill:spellCasting":1,"skill:athletics":1},expected);
  assert.equal(a.system.magic.improvementPoints,8);assert.equal(a.system.experience,0);
  assert.equal(a.updates.length,1);assert.equal(a.system.skills.spellCasting,1);
  await assert.rejects(purchaseAdvancement(a,{"skill:spellCasting":2},expected),/Stale/);
});

test("lifepath ranks affect price and cap while racial perks remain bonuses", () => {
  const a = actor(); a.system.details.origin = "redania";
  a.system.skills.education = 4;
  const plan = advancementPlan(a, { "skill:education": 7, "skill:deduction": 1 });
  assert.equal(plan.changes[0].level, 5);
  assert.equal(plan.changes[0].cost, 5 + 6 + 7);
  assert.equal(plan.changes[1].cost, 1, "Human ingenuity does not increase purchase price");
  assert.equal(advancementPlan(a, { "skill:education": 10 }).valid, false);
  assert.equal(advancementPlan(a, { "skill:education": 9 }).valid, true);
  a.system.details.race = "elf"; a.system.skills.archery = 9;
  assert.equal(advancementPlan(a, { "skill:archery": 10 }).changes[0].cost, 9);
});

test("injury, death and worn gear never discount paid attributes; null/legacy high ranks are preserved", () => {
  const a = actor(); a.system.health.value = -1;
  assert.equal(advancementPlan(a, { "attribute:body": 6 }).cost, 50);
  a.system.attributes.intelligence = null;
  assert.equal(advancementPlan(a, { "attribute:intelligence": 1 }).valid, false);
  a.system.attributes.body = 12;
  assert.equal(advancementPlan(a, { "attribute:body": 13 }).valid, false);
  assert.equal(a.system.attributes.body, 12);
  a.system.attributes.body = 0;
  assert.equal(advancementPlan(a, { "attribute:body": 1 }).valid, false, "Initialize a zero attribute in the existing editor, not by a free purchase");
});

test("languages reuse canonical aliases and custom entries without duplicates", () => {
  const a = actor(); a.system.languages = [{ id: "legacyCommon", name: "Язык: Всеобщий (2)", level: 8 }, { id: "custom", name: "Secret", level: 2 }];
  const languages = advancementEntries(a).filter(row => row.kind === "languages");
  assert.equal(languages.length, 4);
  assert.equal(languages.filter(row => row.languageRuleId === "language.common").length, 1);
  assert.equal(advancementPlan(a, { "language:legacyCommon": 9 }).cost, 16);
  assert.equal(advancementPlan(a, { "language:custom": 3 }).cost, 4);
});

test("profession branches require their own predecessor, including a planned unlock", () => {
  const a = actor(); const p = PROFESSIONS[0]; a.system.details.profession = p.id;
  const key = index => `ability:${p.abilities[index].id}`;
  assert.equal(advancementPlan(a, { [key(1)]: 1 }).valid, false);
  assert.equal(advancementPlan(a, { [key(0)]: 5, [key(1)]: 1 }).valid, true);
  assert.equal(advancementPlan(a, { [key(0)]: 5, [key(1)]: 5, [key(5)]: 1 }).valid, false);
  assert.equal(advancementPlan(a, { [key(0)]: 5, [key(1)]: 5, [key(2)]: 1 }).valid, true);
});

test("purchase deducts exactly once and preserves unrelated actor data", async () => {
  const a = actor(); a.system.skills.swordsmanship = 4;
  const snapshot = advancementFingerprint(a);
  const results = await Promise.allSettled([
    purchaseAdvancement(a, { "skill:swordsmanship": 7, "language:lang000000000003": 1 }, snapshot),
    purchaseAdvancement(a, { "skill:swordsmanship": 7 }, snapshot)
  ]);
  assert.deepEqual(results.map(row => row.status), ["fulfilled", "rejected"]);
  assert.equal(a.system.experience, 83);
  assert.equal(a.system.skills.swordsmanship, 7);
  assert.equal(a.system.languages[0].level, 1);
  assert.equal(a.system.stamina.value, 12);
  assert.equal(a.updates.length, 1);
});

test("invalid, unaffordable, unauthorized and stale purchases never write", async () => {
  const a = actor(); a.system.experience = 0;
  await assert.rejects(purchaseAdvancement(a, { "skill:swordsmanship": 1 }, advancementFingerprint(a)), /Insufficient/);
  a.system.experience = 100; a.isOwner = false;
  await assert.rejects(purchaseAdvancement(a, { "skill:swordsmanship": 1 }, advancementFingerprint(a)), /NoPermission/);
  a.isOwner = true;
  await assert.rejects(purchaseAdvancement(a, { "unknown": 1 }, advancementFingerprint(a)), /Invalid/);
  const stale = advancementFingerprint(a); a.system.skills.swordsmanship = 1;
  await assert.rejects(purchaseAdvancement(a, { "skill:swordsmanship": 2 }, stale), /Stale/);
  assert.equal(a.updates.length, 0);
});

test("a failed persistence has no separate debit and does not poison the write queue", async () => {
  const a = actor(); const update = a.update;
  a.update = async () => { throw new Error("offline"); };
  await assert.rejects(purchaseAdvancement(a, { "skill:swordsmanship": 1 }, advancementFingerprint(a)), /offline/);
  assert.equal(a.system.experience, 100);
  a.update = update;
  await purchaseAdvancement(a, { "skill:swordsmanship": 1 }, advancementFingerprint(a));
  assert.equal(a.system.experience, 99);
});

test("experience adjustment rejects negative/fractional values and stale balances", async () => {
  const a = actor();
  await assert.rejects(setExperience(a, -1, 100), /InvalidPoints/);
  await assert.rejects(setExperience(a, 1.5, 100), /InvalidPoints/);
  await assert.rejects(setExperience(a, 200, 99), /Stale/);
  await setExperience(a, 125, 100);
  assert.equal(a.system.experience, 125);
});
