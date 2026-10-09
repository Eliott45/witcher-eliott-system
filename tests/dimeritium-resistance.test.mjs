import { test } from "node:test";
import assert from "node:assert/strict";
import { dimeritiumModifiers, dimeritiumResistance, rollDimeritiumResistance, clearEndedDimeritiumResistance, DIMERITIUM_RESISTED } from "../scripts/magic/dimeritium.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { CONDITION_BY_ID } from "../scripts/data/condition-definitions.mjs";

const exposure = (changes = {}) => ({ nearby: 0, touching: false, zone: false, resisted: true, ...changes });

test("a resisted exposure keeps half of the Vigor, rounded down (core p.66)", () => {
  assert.equal(dimeritiumModifiers(exposure({ touching: true }), 25)[0].value, -13);
  assert.equal(dimeritiumModifiers(exposure({ nearby: 4 }), 25)[0].value, -4, "a smaller loss is not raised to half");
  assert.equal(dimeritiumModifiers(exposure({ nearby: 20 }), 25)[0].value, -13);
  assert.equal(dimeritiumModifiers(exposure({ zone: true }), 10)[0].value, -5);
  assert.deepEqual(dimeritiumModifiers(exposure({ zone: true, resisted: false }), 10), [], "an unresisted bomb zone forbids casting instead");
  assert.equal(dimeritiumModifiers(exposure({ touching: true, resisted: false }), 25)[0].value, -1000);
  const system = { attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 6])), health: { value: 1, max: 1 }, vigor: 25,
    skills: Object.fromEntries(SKILL_KEYS.map(key => [key, 0])), details: { race: "human", profession: "mage" } };
  assert.equal(deriveStatistics(system, { dimeritium: exposure({ touching: true }) }).vigor, 12);
  assert.equal(deriveStatistics(system, { dimeritium: exposure({ touching: true, resisted: false }) }).vigor, 0);
  assert.equal(CONDITION_BY_ID[DIMERITIUM_RESISTED].name, "Устойчивость к двимериту");
});

const mage = (level, statuses = []) => {
  const effects = [];
  const actor = { uuid: `Actor.${Math.random()}`, type: "character", isOwner: true, effects, statuses: new Set(statuses), items: [
      { type: "ability", system: { ruleId: "profession.mage.dimeritium", level } }],
    system: { details: { profession: "mage" }, statistics: { effective: { will: 7 }, modifiers: [] } },
    async toggleStatusEffect(status) { actor.statuses.add(status); effects.push({ id: status, statuses: new Set([status]) }); },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) actor.statuses.delete(id); effects.splice(0, effects.length); } };
  return actor;
};

test("WILL + ability against DC 16; success marks the exposure, failure leaves dimeritium in force", async () => {
  const totals = [];
  globalThis.foundry = { dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = totals.shift(); return this; }
    async toMessage(data) { messages.push({ formula: this.formula, ...data }); } } },
    documents: { ChatMessage: { getSpeaker: () => ({}) } } };
  const messages = [];
  assert.equal(dimeritiumResistance({ ...mage(5), system: { details: { profession: "priest" } } }), null);
  assert.equal(dimeritiumResistance(mage(0)), null);
  const actor = mage(8);
  assert.equal(dimeritiumResistance(actor).base, 15);
  totals.push(15);
  assert.equal(await rollDimeritiumResistance(actor, exposure({ touching: true, resisted: false })), false);
  assert.match(messages[0].flavor, /таблице двимерита/); assert.equal(actor.statuses.has(DIMERITIUM_RESISTED), false);
  assert.equal(messages[0].formula, "1d10wc + 15");
  totals.push(16);
  assert.equal(await rollDimeritiumResistance(actor, exposure({ touching: true, resisted: false })), true);
  assert.equal(actor.statuses.has(DIMERITIUM_RESISTED), true);
  await assert.rejects(rollDimeritiumResistance(actor, null), /не действует/);
});

test("the resisted state ends with the exposure, so the next one needs a new check", async () => {
  const away = mage(8, [DIMERITIUM_RESISTED]);
  away.effects.push({ id: DIMERITIUM_RESISTED, statuses: new Set([DIMERITIUM_RESISTED]) });
  const exposed = mage(8, [DIMERITIUM_RESISTED, "dimeritium-contact"]);
  exposed.effects.push({ id: DIMERITIUM_RESISTED, statuses: new Set([DIMERITIUM_RESISTED]) });
  await clearEndedDimeritiumResistance([away, exposed], () => null);
  assert.equal(away.statuses.has(DIMERITIUM_RESISTED), false);
  assert.equal(exposed.statuses.has(DIMERITIUM_RESISTED), true);
});
