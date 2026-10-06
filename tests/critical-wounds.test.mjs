import test from "node:test";
import assert from "node:assert/strict";
import { CRITICAL_WOUNDS } from "../scripts/data/critical-wounds.mjs";
import { WOUND_RULES, woundModifiers, woundEffectData, onWoundCreated, setWoundState, woundAcidDamage, armPenaltyParts, usableHands, CRITICAL_WOUND_SOURCES, linkedConditions } from "../scripts/combat/critical-wound-effects.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { cleanupLootTemplate } from "../scripts/loot/loot.mjs";

const ID = "witcher-eliott-system";
const ALL = Object.values(CRITICAL_WOUNDS).flat();
const attributes = { intelligence: 6, reflex: 6, dexterity: 6, body: 8, speed: 6, empathy: 6, craft: 6, will: 6, luck: 6 };
const woundEffect = (id, level, options) => { const data = woundEffectData(id, level, options); return { ...data, id: "w", disabled: false, statuses: new Set(), flags: data.flags }; };
const stats = (...effects) => deriveStatistics({ attributes, health: { value: 35, max: 35 } }, { effects });

test("all 24 printed wounds have rules for every state, and bleeding/poison/suffocation text is automated", () => {
  assert.equal(ALL.length, 24);
  for (const wound of ALL) {
    assert.equal(WOUND_RULES[wound.id]?.mods.length, 3, wound.id);
    if (/Кровотечение|кровью/.test(wound.effect)) assert.ok(linkedConditions(wound.id, "fresh").includes("bleeding"), wound.id);
  }
  assert.deepEqual(linkedConditions("septic-shock", "fresh"), ["poisoned"]);
  assert.deepEqual(linkedConditions("sucking-chest-wound", "fresh"), ["suffocating"]);
  assert.deepEqual(linkedConditions("ruptured-spleen", "stabilized"), []);
});

test("quartered and halved values, Stun and resource-neutral BODY are derived from the wound state", () => {
  const leg = stats(woundEffect("compound-leg-fracture", "severe"));
  assert.equal(leg.effective.speed, 1);
  const system = { statistics: leg, skills: { dodgeEscape: 6, athletics: 2 }, languages: [], abilityState: {} };
  assert.equal(skillValue(system, "dodgeEscape").total, 3, "(6 + 6) / 4");
  assert.equal(stats(woundEffect("compound-leg-fracture", "severe", { state: "stabilized" })).effective.speed, 3);
  const heart = stats(woundEffect("heart-damage", "deadly"));
  assert.deepEqual([heart.effective.body, heart.effective.speed, heart.staminaMax], [2, 1, 8]);
  assert.equal(stats(woundEffect("minor-head-wound", "medium")).stun, 5);
  const ribs = stats(woundEffect("cracked-ribs", "light"));
  assert.deepEqual([ribs.effective.body, ribs.healthMax], [6, 35], "Cracked Ribs does not lower HP");
  assert.equal(stats(woundEffect("cracked-ribs", "light", { state: "treated" })).carryMax, 70);
  assert.equal(stats(woundEffect("foreign-object", "light")).recovery, 1);
  assert.equal(stats(woundEffect("heart-damage", "deadly", { state: "treated" })).modifiers.find(m => m.target === "bleedingDamage").value, 2);
});

test("arm wounds hit the weapon arm, a disabled arm leaves one hand", () => {
  const right = stats(woundEffect("fractured-arm", "medium", { location: "rightArm", locationName: "Правая рука" }));
  const left = stats(woundEffect("fractured-arm", "medium", { location: "leftArm", locationName: "Левая рука" }));
  const sword = { system: { grip: 1, hands: 1 } }, staff = { system: { grip: 2, hands: 2 } };
  assert.deepEqual(armPenaltyParts({ system: { statistics: right } }, sword).map(part => part.value), [-3]);
  assert.deepEqual(armPenaltyParts({ system: { statistics: left } }, sword), []);
  assert.deepEqual(armPenaltyParts({ system: { statistics: left } }, staff).map(part => part.value), [-3]);
  assert.deepEqual(armPenaltyParts({ system: { statistics: right } }, { system: { natural: true } }), []);
  assert.equal(usableHands({ system: { statistics: stats(woundEffect("dismembered-arm", "deadly", { location: "leftArm" })) } }), 1);
  assert.equal(usableHands({ system: { statistics: stats() } }), 2);
  assert.equal(woundModifiers("sprained-arm", "treated")[0].target, "skills.physique");
});

function actorFixture() {
  const effects = [], statuses = new Set();
  const actor = { documentName: "Actor", isOwner: true, uuid: "Actor.a", effects, system: { statistics: { stun: 6 } },
    async createEmbeddedDocuments(_type, data) {
      const created = data.map((source, i) => ({ ...source, id: `c${effects.length + i}`, statuses: new Set(source.statuses ?? []), disabled: false }));
      effects.push(...created); for (const entry of created) for (const status of entry.statuses) statuses.add(status); return created;
    },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) effects.splice(effects.findIndex(entry => entry.id === id), 1); },
    async updateEmbeddedDocuments(_type, updates) { for (const { _id, ...changes } of updates) { const effect = effects.find(entry => entry.id === _id);
      for (const [key, value] of Object.entries(changes)) { const path = key.split("."), last = path.pop(); path.reduce((o, k) => o[k] ??= {}, effect)[last] = value; } } }
  };
  const wound = (id, level, options = {}) => {
    const data = woundEffectData(id, level, options);
    const effect = { ...data, id: `w${effects.length}`, parent: actor, statuses: new Set(), disabled: false,
      async update(changes) { for (const [key, value] of Object.entries(changes)) { const path = key.split("."), last = path.pop(); path.reduce((o, k) => o[k] ??= {}, effect)[last] = value; } } };
    effects.push(effect);
    return effect;
  };
  return { actor, wound, effects };
}
const rolls = [];
globalThis.game = { user: { id: "u" }, users: {}, settings: { get: () => "public" } };
globalThis.Hooks = { on() {}, once() {} };
globalThis.foundry = { dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = rolls.shift() ?? 1; return this; } async toMessage() {} } },
  documents: { ChatMessage: { getSpeaker: () => ({}) } }, utils: {} };

test("a new wound links its conditions once, resolves the arm and teeth, and stabilising removes the bleed", async () => {
  const f = actorFixture();
  const spleen = f.wound("ruptured-spleen", "medium");
  await onWoundCreated(spleen, {}, "u");
  assert.equal(f.effects.filter(effect => effect.flags?.[ID]?.criticalWoundSource === spleen.id).length, 1);
  assert.ok(spleen.flags[ID].criticalWound.applied);
  await onWoundCreated(spleen, {}, "u");
  assert.equal(f.effects.filter(effect => effect.flags?.[ID]?.criticalWoundSource).length, 1, "Runs once");
  const eye = f.wound("damaged-eye", "deadly");
  await onWoundCreated(eye, {}, "u");
  assert.equal(f.effects.filter(effect => effect.statuses.has("bleeding")).length, 1, "Statuses do not stack");
  await setWoundState(spleen, "stabilized");
  assert.equal(f.effects.find(effect => effect.statuses.has("bleeding"))?.flags[ID].criticalWoundSource, eye.id, "The eye still bleeds");
  await setWoundState(eye, "stabilized");
  assert.equal(f.effects.filter(effect => effect.flags?.[ID]?.criticalWoundSource).length, 0);
  rolls.push(2, 7);
  const arm = f.wound("compound-arm-fracture", "severe", { location: "torso", locationName: "Корпус" });
  await onWoundCreated(arm, {}, "u");
  assert.equal(arm.flags[ID].criticalWound.arm, "leftArm");
  assert.equal(arm.flags[ID].criticalWound.locationName, "Левая рука");
  const teeth = f.wound("lost-teeth", "medium");
  await onWoundCreated(teeth, {}, "u");
  assert.match(teeth.description, /Выбито зубов: 7/);
  await onWoundCreated(f.wound("damaged-eye", "deadly"), {}, "other-user");
  assert.equal(f.effects.filter(effect => effect.flags?.[ID]?.criticalWoundSource).length, 1, "Only the creating client applies side effects");
});

test("only an untreated Torn Stomach burns 4 acid per turn", () => {
  const f = actorFixture();
  f.wound("torn-stomach", "severe");
  assert.equal(woundAcidDamage(f.actor), 4);
  f.effects[0].flags[ID].criticalWound.state = "stabilized";
  assert.equal(woundAcidDamage(f.actor), 0);
});

test("the effects compendium holds every wound with a unique ID and state rules", () => {
  assert.equal(CRITICAL_WOUND_SOURCES.length, 24);
  assert.equal(new Set(CRITICAL_WOUND_SOURCES.map(entry => entry._id)).size, 24);
  assert.ok(CRITICAL_WOUND_SOURCES.every(entry => /^efct\d{12}$/.test(entry._id) && entry.name.startsWith("Крит: ") && entry.flags[ID].criticalWound.state === "fresh"));
  assert.match(CRITICAL_WOUND_SOURCES.find(entry => entry.flags[ID].criticalWound.id === "decapitation").description, /погибает/);
});

test("the shared loot actor is deleted once no pile token uses it", async () => {
  let deleted = false;
  const template = { id: "tmpl", flags: { [ID]: { lootTemplate: true } }, delete: async () => { deleted = true; } };
  const scene = { tokens: [{ actorId: "tmpl" }] };
  game.actors = { get: id => id === "tmpl" ? template : null };
  game.scenes = [scene];
  await cleanupLootTemplate("tmpl");
  assert.equal(deleted, false);
  scene.tokens = [];
  await cleanupLootTemplate("tmpl");
  assert.equal(deleted, true);
  game.actors = { get: () => ({ id: "chest", flags: {}, delete: async () => assert.fail("A GM chest is never removed") }) };
  await cleanupLootTemplate("chest");
});
