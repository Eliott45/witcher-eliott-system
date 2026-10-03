import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFESSIONS, PROFESSION_ABILITIES, professionAbilityState } from "../scripts/data/professions.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { professionSelectionUpdate } from "../scripts/sheets/profession-context.mjs";

test("nine core professions use existing skills and stable, unique ten-node ability trees", () => {
  assert.equal(PROFESSIONS.length, 9);
  assert.equal(PROFESSION_ABILITIES.length, 90);
  assert.equal(new Set(PROFESSION_ABILITIES.map(entry => entry.id)).size, 90);
  assert.equal(new Set(PROFESSION_ABILITIES.map(entry => entry.documentId)).size, 90);
  for (const profession of PROFESSIONS) {
    assert.equal(profession.abilities.filter(entry => entry.tier === 0).length, 1);
    for (const branch of ["0", "1", "2"]) assert.deepEqual(profession.abilities.filter(entry => entry.branch === branch).map(entry => entry.tier), [1, 2, 3]);
    for (const key of profession.skills) assert.ok(key === "language" || SKILL_KEYS.includes(key), key);
  }
});

test("tree unlocks at 5 in the immediate predecessor, never through a different branch", () => {
  const profession = PROFESSIONS[0];
  const actor = { items: [], system: { statistics: { effective: { empathy: 6, intelligence: 7 } } } };
  assert.equal(professionAbilityState(actor, profession.abilities[1]).unlocked, false);
  actor.items.push({ type: "ability", system: { ruleId: profession.abilities[0].id, level: 5 } });
  assert.equal(professionAbilityState(actor, profession.abilities[1]).unlocked, true);
  assert.equal(professionAbilityState(actor, profession.abilities[2]).unlocked, false);
  actor.items.push({ type: "ability", system: { ruleId: profession.abilities[1].id, level: 5 } });
  assert.equal(professionAbilityState(actor, profession.abilities[2]).unlocked, true);
  assert.equal(professionAbilityState(actor, profession.abilities[5]).unlocked, false);
});

test("profession change initializes default Vigor but preserves existing custom values", () => {
  const actor = { system: { details: { profession: "" }, vigor: 0 } };
  assert.equal(professionSelectionUpdate(actor, "mage")["system.vigor"], 5);
  actor.system.vigor = 17;
  assert.equal(professionSelectionUpdate(actor, "priest")["system.vigor"], undefined);
});
