import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { SKILL_KEYS, skillValue } from "../scripts/data/skills.mjs";
import { advancementEntries } from "../scripts/data/advancement.mjs";
import { setReputationValue, setReputationBonus } from "../scripts/data/reputation.mjs";
import { rollReputation } from "../scripts/combat/reputation-roll.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

function character() {
  const system = { attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 8])), health: { value: 40, max: 40 },
    skills: Object.fromEntries(SKILL_KEYS.map(key => [key, 10])), languages: [], abilityState: { trustEnabled: false },
    details: { race: "human", familyStatus: "north.aristocracy" }, reputation: { value: 3, bonusEnabled: false, skills: ["charisma"] } };
  Object.defineProperty(system, "statistics", { get() { return deriveStatistics(this); } });
  return { uuid: "Actor.reputation-test", isOwner: true, system, effects: [], items: [] };
}

test("reputation derives family bonuses once, caps at ten and preserves base data across race changes", () => {
  const actor = character();
  assert.equal(actor.system.statistics.reputation, 5);
  assert.equal(actor.system.statistics.reputation, 5);
  assert.equal(actor.system.reputation.value, 3);
  actor.system.details.race = "witcher";
  assert.equal(actor.system.statistics.reputation, 3);
  actor.system.details.race = "human";
  actor.system.reputation.value = 10;
  assert.equal(actor.system.statistics.reputation, 10);
  delete actor.system.reputation;
  assert.equal(actor.system.statistics.reputation, 2, "Old actors retain their existing family source");
});

test("the optional +3 affects chosen conversations once, never ranks, IP costs or the reputation check", () => {
  const actor = character();
  const priceBefore = advancementEntries(actor).find(row => row.key === "charisma");
  assert.equal(skillValue(actor.system, "charisma").bonus, 0);
  actor.system.reputation.bonusEnabled = true;
  actor.system.reputation.skills = ["charisma", "charisma", "swordsmanship"];
  assert.equal(skillValue(actor.system, "charisma").total, 21);
  assert.equal(skillValue(actor.system, "charisma").modifiers.filter(mod => mod.source === "reputation").length, 1);
  assert.equal(skillValue(actor.system, "persuasion").bonus, 0);
  assert.equal(skillValue(actor.system, "swordsmanship").bonus, 0);
  assert.equal(actor.system.statistics.skillBonuses.charisma, 3);
  assert.equal(actor.system.statistics.reputation, 5);
  assert.deepEqual(advancementEntries(actor).find(row => row.key === "charisma"), priceBefore);
  actor.system.reputation.bonusEnabled = false;
  assert.equal(skillValue(actor.system, "charisma").bonus, 0);
  actor.system.reputation = { value: 0, bonusEnabled: true, skills: ["charisma"] };
  actor.system.details.familyStatus = "";
  assert.equal(skillValue(actor.system, "charisma").bonus, 0);
});

test("reputation writes reject invalid or stale edits and serialize bonus choices without touching other fields", async () => {
  const actor = character();
  const writes = [];
  actor.update = async change => {
    writes.push(change);
    for (const [path, value] of Object.entries(change)) actor.system.reputation[path.split(".").at(-1)] = value;
    return actor;
  };
  for (const value of [-1, 11, 1.5, NaN]) await assert.rejects(setReputationValue(actor, value, 3), /Invalid/);
  await assert.rejects(setReputationValue(actor, 5, 2), /Stale/);
  assert.equal(writes.length, 0);
  await setReputationValue(actor, 10, 3);
  await setReputationBonus(actor, true, ["persuasion", "persuasion", "swordsmanship"]);
  assert.deepEqual(actor.system.reputation, { value: 10, bonusEnabled: true, skills: ["persuasion"] });
  await setReputationBonus(actor, false);
  assert.deepEqual(actor.system.reputation.skills, ["persuasion"]);
  await setReputationBonus(actor, true, []);
  assert.equal(actor.system.reputation.bonusEnabled, false);
  actor.isOwner = false;
  await assert.rejects(setReputationValue(actor, 3, 10), /NoPermission/);
  await setReputationBonus(actor, true, ["charisma"]);
  assert.deepEqual(actor.system.reputation.skills, []);
});

test("reputation rolls an ordinary d10 + effective WILL + final reputation through native private chat", async () => {
  const actor = character();
  actor.system.health.value = 7;
  actor.system.reputation.bonusEnabled = true;
  let mode, formula, sent, evaluated = 0;
  globalThis.game = { settings: { get: () => mode }, i18n: { localize: key => key, format: (_key, data) => JSON.stringify(data) } };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.foundry = {
    dice: { Roll: class {
      constructor(value) { formula = value; }
      async evaluate(options) { evaluated++; assert.equal(options.allowInteractive, mode !== "blind"); return this; }
      async toMessage(data, options) { sent = { data, options }; return sent; }
    } },
    documents: { ChatMessage: { getSpeaker: ({ actor: speaker }) => { assert.equal(speaker, actor); return { actor: "reputation-test" }; } } }
  };
  for (mode of ["public", "private", "blind", "self"]) {
    await rollReputation(actor);
    assert.equal(formula, "1d10 + 4 + 5");
    assert.equal(sent.options.messageMode, mode);
    assert.deepEqual(sent.data.flags[SYSTEM_ID].reputationCheck, { will: 4, level: 5 });
    assert.ok(!sent.data.flags[SYSTEM_ID].skipLuck, "Uses the existing optional Luck pipeline");
  }
  actor.isOwner = false;
  await rollReputation(actor);
  actor.isOwner = true;
  actor.system.attributes.will = null;
  await rollReputation(actor);
  assert.equal(evaluated, 4);
});
