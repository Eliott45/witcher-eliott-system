import test from "node:test";
import assert from "node:assert/strict";
import { CRITICAL_WOUNDS } from "../scripts/data/critical-wounds.mjs";
import { WOUND_RULES, woundModifiers, woundEffectData, onWoundCreated, setWoundState, woundAcidDamage, armPenaltyParts, usableHands, CRITICAL_WOUND_SOURCES, linkedConditions } from "../scripts/combat/critical-wound-effects.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { cleanupLootTemplate } from "../scripts/loot/loot.mjs";
import { editWound, canEditWound } from "../scripts/sheets/wound-editor.mjs";

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
  const actor = { documentName: "Actor", type: "character", isOwner: true, uuid: "Actor.a", effects, system: { statistics: { stun: 6 } },
    async toggleStatusEffect(status) { effects.push({ id: status, statuses: new Set([status]), disabled: false }); },
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
let evaluatedRolls = 0;
globalThis.game = { user: { id: "u" }, users: {}, settings: { get: () => "public" } };
globalThis.Hooks = { on() {}, once() {} };
globalThis.foundry = { dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { evaluatedRolls++; this.total = rolls.shift() ?? 1; return this; } async toMessage() {} } },
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

test("monster leg wounds keep the struck side through creation, serialization and stabilization without a second die", async () => {
  for (const [id, level, speed] of [["sprained-leg","light",4],["fractured-leg","medium",3],
    ["compound-leg-fracture","severe",1],["dismembered-leg","deadly",1]]) {
    for (const [location, name] of [["rightArm","Правая конечность"],["leftArm","Левая конечность"]]) {
      const f = actorFixture(); f.actor.type = "npc"; f.actor.system.creature = { category: "beast" };
      // Legacy source data used the generic arm zone with a human-looking label.
      const effect = f.wound(id, level, { location, locationName: "Рука / конечность" });
      const before = evaluatedRolls;
      await onWoundCreated(effect, {}, "u");
      assert.equal(evaluatedRolls, before, "The attack already chose the side");
      assert.equal(effect.flags[ID].criticalWound.locationName, name);
      assert.equal(stats(effect).effective.speed, speed, "Keep the book's leg-wound penalty");
      if (id === "dismembered-leg") assert.equal(effect.flags[ID].criticalWound.arm, location);
      effect.flags = JSON.parse(JSON.stringify(effect.flags));
      await setWoundState(effect, "stabilized");
      assert.equal(effect.flags[ID].criticalWound.location, location);
      assert.equal(effect.flags[ID].criticalWound.locationName, name);
      assert.equal(effect.flags[ID].criticalWound.bodyPlan, "monster");
      assert.ok(effect.description.includes(name));
      assert.equal(evaluatedRolls, before);
    }
  }
});

test("a known struck location wins over a stale opposite side, while unplaced wounds still choose a side", async () => {
  const f = actorFixture(); f.actor.type = "npc"; f.actor.system.creature = { category: "beast" };
  const effect = f.wound("dismembered-leg", "deadly", { location: "rightArm", arm: "leftLeg", locationName: "Левая нога" });
  const before = evaluatedRolls;
  await onWoundCreated(effect, {}, "u");
  assert.equal(evaluatedRolls, before);
  assert.equal(effect.flags[ID].criticalWound.arm, "rightArm");
  assert.equal(effect.flags[ID].criticalWound.locationName, "Правая конечность");
  const unplaced = f.wound("dismembered-leg", "deadly");
  rolls.push(2);
  await onWoundCreated(unplaced, {}, "u");
  assert.equal(evaluatedRolls, before + 1);
  assert.equal(unplaced.flags[ID].criticalWound.arm, "leftLeg");
  assert.equal(unplaced.flags[ID].criticalWound.locationName, "Левая конечность");
});

test("manual wound editing updates penalties and restores linked conditions when a wound is reopened", async () => {
  const f=actorFixture(),wound=f.wound("ruptured-spleen","medium");
  await onWoundCreated(wound,{},"u");
  let answer="stabilized",prompts=0;
  const oldApplications=foundry.applications;
  foundry.applications={api:{DialogV2:{prompt:async options=>{prompts++;assert.match(options.content,/без броска/);return answer;}}}};
  rolls.push(8);
  try {
    assert.equal(canEditWound(wound),true);
    await editWound(wound);
    assert.equal(wound.flags[ID].criticalWound.state,"stabilized");
    assert.equal(f.effects.some(effect=>effect.statuses.has("bleeding")),false);
    answer="treated";await editWound(wound);
    assert.deepEqual(wound.flags[ID].condition.modifiers,woundModifiers("ruptured-spleen","treated"));
    wound.flags[ID].criticalWound.recoveryDays=3;
    answer="fresh";await editWound(wound);
    assert.equal(wound.flags[ID].criticalWound.recoveryDays,null);
    assert.equal(f.effects.filter(effect=>effect.statuses.has("bleeding")).length,1);
    await editWound(wound);
    assert.equal(f.effects.filter(effect=>effect.statuses.has("bleeding")).length,1);
    answer=null;await editWound(wound);
    assert.equal(wound.flags[ID].criticalWound.state,"fresh");
    answer="invalid";await editWound(wound);
    assert.equal(wound.flags[ID].criticalWound.state,"fresh");
    const count=prompts;f.actor.isOwner=false;await editWound(wound);assert.equal(prompts,count);
    assert.deepEqual(rolls,[8],"Manual editing never rolls a die");
  } finally {foundry.applications=oldApplications;rolls.length=0;}
});

test("manual editing cannot stabilize decapitation or repeat a heart death save",async()=>{
  const f=actorFixture(),fatal=f.wound("decapitation","deadly"),heart=f.wound("heart-damage","deadly");
  assert.equal(canEditWound(fatal),false);
  await setWoundState(fatal,"stabilized");assert.equal(fatal.flags[ID].criticalWound.state,"fresh");
  rolls.push(1);
  await setWoundState(heart,"stabilized");await setWoundState(heart,"fresh");
  assert.deepEqual(rolls,[1]);rolls.length=0;
});

test("heart damage kills creatures without a save while characters still roll for survival", async () => {
  for (const [type, face, dead] of [["npc", 1, true], ["character", 1, false], ["character", 6, true]]) {
    const f = actorFixture();
    f.actor.type = type;
    rolls.length = 0;
    rolls.push(face);
    await onWoundCreated(f.wound("heart-damage", "deadly"), {}, "u");
    assert.equal(f.effects.some(effect => effect.statuses.has("dead")), dead);
    assert.equal(rolls.length, type === "npc" ? 1 : 0);
  }
  rolls.length = 0;
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

test("prostheses replace the penalties of a healed lost limb, per core p.160", async () => {
  const { setProsthesis, prosthesisAt } = await import("../scripts/combat/critical-wound-effects.mjs");
  const leg = (prosthesis, state = "treated") => stats(woundEffect("dismembered-leg", "deadly", { location: "leftLeg", state, prosthesis }));
  assert.equal(leg(null).effective.speed, 1, "A healed stump is still a lost leg");
  assert.equal(leg({ quality: "simple" }).effective.speed, 4, "¾ of 6");
  assert.deepEqual(leg({ quality: "simple" }).modifiers.filter(m => m.target === "skills.athletics").map(m => m.value), [-5]);
  assert.equal(leg({ quality: "quality" }).effective.speed, 6);
  assert.deepEqual(leg({ quality: "quality" }).modifiers.filter(m => m.target === "skills.dodgeEscape").map(m => m.value), [-3]);
  const armWith = quality => ({ system: { statistics: stats(woundEffect("dismembered-arm", "deadly", { location: "rightArm", state: "treated", prosthesis: { quality } })) } });
  assert.equal(usableHands(armWith("simple")), 1, "A simple arm holds no weapon");
  assert.equal(usableHands(armWith("quality")), 2);
  assert.deepEqual(armPenaltyParts(armWith("quality"), { system: { grip: 1 } }).map(part => part.value), [-5]);

  const f = actorFixture();
  const items = [{ id: "p", parent: f.actor, system: { ruleId: "gear.quality-prosthesis", quantity: 1, carried: true, equipped: false }, async update(c) { this.system.equipped = c["system.equipped"]; } }];
  f.actor.items = { get: id => items.find(item => item.id === id), filter: fn => items.filter(fn) };
  const wound = f.wound("dismembered-arm", "deadly", { location: "leftArm" });
  await assert.rejects(setProsthesis(wound, items[0]), /вылеченную/);
  wound.flags[ID].criticalWound.state = "treated";
  await setProsthesis(wound, items[0]);
  assert.equal(wound.flags[ID].criticalWound.prosthesis.quality, "quality");
  assert.equal(items[0].system.equipped, true);
  assert.equal(prosthesisAt(f.actor, "leftArm")?.item, items[0]);
  assert.equal(prosthesisAt(f.actor, "rightArm"), null);
  await assert.rejects(setProsthesis(f.wound("dismembered-arm", "deadly", { location: "rightArm", state: "treated" }), items[0]), /уже надет/);
  await setProsthesis(wound, null);
  assert.equal(wound.flags[ID].criticalWound.prosthesis, null);
  assert.equal(items[0].system.equipped, false);
  await setProsthesis(wound, items[0]);
  await setWoundState(wound, "fresh");
  assert.equal(wound.flags[ID].criticalWound.prosthesis, null, "Reopening the wound removes its fitted prosthesis");
  assert.equal(items[0].system.equipped, false);
  assert.ok(f.effects.some(effect => effect.statuses.has("bleeding")));
});

test("the inventory marks a prosthesis with the limb it replaces", async () => {
  const { inventoryContext } = await import("../scripts/sheets/inventory-context.mjs");
  const item = { id: "p", name: "Простой протез", type: "equipment", img: "", system: { ruleId: "gear.simple-prosthesis", kind: "gear", quantity: 1, carried: true, equipped: true, weight: 1 } };
  const effects = [{ flags: { [ID]: { criticalWound: { id: "dismembered-leg", locationName: "Правая нога", prosthesis: { itemId: "p", quality: "simple" } } } } }];
  const row = inventoryContext({ items: [item], effects, system: {} }).items.find(entry => entry.id === "p");
  assert.equal(row.fittedOn, "Правая нога");
  assert.equal(inventoryContext({ items: [item], effects: [], system: {} }).items.find(entry => entry.id === "p").fittedOn, "");
});
