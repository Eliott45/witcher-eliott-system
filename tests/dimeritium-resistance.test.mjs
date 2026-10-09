import { test } from "node:test";
import assert from "node:assert/strict";
import { dimeritiumModifiers, dimeritiumResistance, rollDimeritiumResistance, clearEndedDimeritiumEffects, DIMERITIUM_RESISTED } from "../scripts/magic/dimeritium.mjs";
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
  await clearEndedDimeritiumEffects([away, exposed], () => null);
  assert.equal(away.statuses.has(DIMERITIUM_RESISTED), false);
  assert.equal(exposed.statuses.has(DIMERITIUM_RESISTED), true);
});

test("every row of the dimeritium table is a real condition, and resisting or ending contact clears the touch-only rows", async () => {
  const { DIMERITIUM_TABLE, DIMERITIUM_TABLE_STATES, dimeritiumBurnActive } = await import("../scripts/magic/dimeritium.mjs");
  for (const row of DIMERITIUM_TABLE) if (row.status) assert.ok(CONDITION_BY_ID[row.status], row.status);
  assert.deepEqual(DIMERITIUM_TABLE.map(row => row.status ?? ""), ["", "", "dimeritium-spasms", "nauseated", "dimeritium-agony", "dimeritium-burn"]);
  const withState = (statuses) => {
    const actor = mage(8, statuses);
    for (const status of statuses) actor.effects.push({ id: status, statuses: new Set([status]), disabled: false });
    actor.deleteEmbeddedDocuments = async (_type, ids) => { for (const id of ids) actor.statuses.delete(id);
      actor.effects.splice(0, actor.effects.length, ...actor.effects.filter(effect => !ids.includes(effect.id))); };
    return actor;
  };
  const burning = withState(["dimeritium-contact", "dimeritium-burn"]);
  assert.equal(dimeritiumBurnActive(burning), true);
  const released = withState(["dimeritium-burn", "nauseated"]);
  assert.equal(dimeritiumBurnActive(released), false, "no damage once the contact ends");
  await clearEndedDimeritiumEffects([burning, released], () => null);
  assert.equal(burning.statuses.has("dimeritium-burn"), true);
  assert.equal(released.statuses.has("dimeritium-burn"), false);
  assert.equal(released.statuses.has("nauseated"), true, "nausea is the ordinary condition with its own end");
  const resisted = withState(["dimeritium-contact", "dimeritium-agony", DIMERITIUM_RESISTED]);
  assert.equal(dimeritiumBurnActive(withState(["dimeritium-contact", "dimeritium-burn", DIMERITIUM_RESISTED])), false);
  await clearEndedDimeritiumEffects([resisted], () => null);
  assert.equal(resisted.statuses.has("dimeritium-agony"), false);
  assert.equal(resisted.statuses.has(DIMERITIUM_RESISTED), true);
  assert.equal(DIMERITIUM_TABLE_STATES.length, 3);
});

test("spasms check Endurance DC 15 after every 1d6 turns and stagger on a failure", async () => {
  const { dimeritiumTurn } = await import("../scripts/magic/dimeritium.mjs");
  const totals = [3, 12, 2], messages = [];
  const gm = { id: "gm" };
  globalThis.game = { user: gm, users: { activeGM: gm }, settings: { get: () => "public" }, time: { worldTime: 0 }, combat: null };
  globalThis.foundry = { dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = totals.shift(); return this; }
    async toMessage(data) { messages.push({ formula: this.formula, ...data }); } } },
    documents: { ChatMessage: { getSpeaker: () => ({}) }, ActiveEffect: { getEffectStart: () => ({ time: 0 }) } } };
  const created = [];
  const actor = mage(0, ["dimeritium-contact"]);
  actor.system.skills = { endurance: 2 };
  actor.system.statistics = { effective: { body: 5, will: 7 }, modifiers: [] };
  actor.system.attributes = { body: 5 };
  const spasms = { id: "s", statuses: new Set(["dimeritium-spasms"]), disabled: false, flags: {},
    async update(changes) { this.flags = { "witcher-eliott-system": { dimeritiumSpasms: changes["flags.witcher-eliott-system.dimeritiumSpasms"] } }; } };
  actor.effects.push(spasms);
  actor.createEmbeddedDocuments = async (_type, sources) => { created.push(...sources); };
  const combat = { uuid: "Combat.c", started: true }, combatant = { actor, hidden: false };
  await dimeritiumTurn(combat, combatant, { round: 1 });
  assert.equal(messages.length, 0, "the first check comes after a full interval");
  assert.equal(spasms.flags["witcher-eliott-system"].dimeritiumSpasms.round, 4);
  await dimeritiumTurn(combat, combatant, { round: 3 });
  assert.equal(messages.length, 0);
  await dimeritiumTurn(combat, combatant, { round: 4 });
  assert.equal(messages.length, 1); assert.match(messages[0].flavor, /СЛ 15/);
  assert.equal(created.length, 1, "Endurance 2 + 2 failed DC 15"); assert.ok(created[0].statuses.includes("staggered"));
  assert.equal(spasms.flags["witcher-eliott-system"].dimeritiumSpasms.round, 4 + 12);
});

test("dimeritium, Mahakaman dimeritium and the ring explain what they do to a magic adept", async () => {
  const { readFile } = await import("node:fs/promises");
  const { materialDescriptionUpdate } = await import("../scripts/migrations/material-descriptions.mjs");
  const { dimeritiumDescriptionUpdate } = await import("../scripts/migrations/dimeritium-descriptions.mjs");
  const sources = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
  const find = id => sources.find(row => row.system.ruleId === id);
  for (const id of ["material.dimeritium", "material.mahakaman-dimeritium", "dimeritium-ring"]) assert.match(find(id).system.description, /Энерги/, id);
  const old = id => ({ type: "equipment", system: { ...structuredClone(find(id).system), ruleId: id } });
  const metal = old("material.dimeritium"); metal.system.description = "<p>Материал для изготовления ремесленных изделий.</p>";
  assert.equal(materialDescriptionUpdate(metal)["system.description"], find("material.dimeritium").system.description);
  metal.system.description = "<p>Базовая книга, стр. 128–129</p>";
  assert.equal(materialDescriptionUpdate(metal)["system.description"], find("material.dimeritium").system.description);
  const steel = old("material.steel"); steel.system.description = "<p>Материал для изготовления ремесленных изделий.</p>";
  assert.equal(materialDescriptionUpdate(steel)["system.description"], undefined, "metals without own prose keep the generic line");
  const ring = old("dimeritium-ring");
  ring.system.description = "<p>Кольцо со вставкой из тусклого двимерита. Чародеи стараются держаться от такого подальше.</p><p>Мои заметки</p>";
  assert.equal(dimeritiumDescriptionUpdate(ring)["system.description"], `${find("dimeritium-ring").system.description}<p>Мои заметки</p>`);
  assert.deepEqual(dimeritiumDescriptionUpdate(old("dimeritium-ring")), {});
});
