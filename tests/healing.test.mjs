import test from "node:test";
import assert from "node:assert/strict";
import { recoveryDays, restDay, healingPatient, TREATMENT } from "../scripts/combat/healing.mjs";
import { CONDITION_BY_ID, EFFECT_TEMPLATES } from "../scripts/data/condition-definitions.mjs";
import { woundEffectData } from "../scripts/combat/critical-wound-effects.mjs";
import { nauseaTurn } from "../scripts/combat/nausea.mjs";

const ID = "witcher-eliott-system";
const set = (object, path, value) => { const keys = path.split("."), last = keys.pop(); keys.reduce((o, k) => o[k] ??= {}, object)[last] = value; };
const messages = [];
const rolls = [];
globalThis.foundry = { documents: { ChatMessage: { getSpeaker: () => ({}), create: async data => { messages.push(data); return data; } } },
  dice: { Roll: class { async evaluate() { this.total = rolls.shift(); return this; } async toMessage(data) { messages.push(data); } } } };

test("healing tables follow core p.174 and the errata", () => {
  assert.deepEqual([recoveryDays("light", 3), recoveryDays("medium", 6), recoveryDays("severe", 13), recoveryDays("severe", 20), recoveryDays("light", 1)], [5, 6, 2, 2, 5]);
  assert.equal(recoveryDays("deadly", 8), null, "The deadly column was removed by the errata");
  assert.deepEqual(Object.values(TREATMENT).map(row => [row.rounds, row.dc]), [[2, 12], [4, 14], [6, 16], [8, 18]]);
});

function patient({ healing = null, hp = 20, max = 40, recovery = 7 } = {}) {
  const effects = [];
  const actor = { isOwner: true, name: "Пациент", effects, flags: { [ID]: { healing } }, system: { health: { value: hp, max }, statistics: { recovery } },
    async update(changes) { for (const [key, value] of Object.entries(changes)) set(actor, key, value); },
    async updateEmbeddedDocuments(_type, updates) { for (const { _id, ...changes } of updates) for (const [key, value] of Object.entries(changes)) set(effects.find(effect => effect.id === _id), key, value); },
    async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) effects.splice(effects.findIndex(effect => effect.id === id), 1); } };
  effects.get = id => effects.find(effect => effect.id === id);
  return actor;
}
const wound = (id, level, days) => { const data = woundEffectData(id, level, { state: "treated" }); data.flags[ID].criticalWound.recoveryDays = days; return { ...data, id: `${id}-w`, disabled: false }; };

test("a rest day restores Recovery once healing has begun, half when active, +3 with Healing Hands", async () => {
  let actor = patient();
  await restDay(actor);
  assert.equal(actor.system.health.value, 20, "No healing without the DC 14 check");
  assert.match(messages.at(-1).content, /не начато/);
  actor = patient({ healing: { active: true, hands: true } });
  await restDay(actor);
  assert.equal(actor.system.health.value, 30);
  await restDay(actor, { active: true });
  assert.equal(actor.system.health.value, 36);
  actor = patient({ healing: { active: true }, hp: 38 });
  await restDay(actor);
  assert.equal(actor.system.health.value, 40);
  assert.equal(actor.flags[ID].healing, null, "Full health ends the healing process");
});

test("treated wounds fade day by day; deadly ones stay", async () => {
  const actor = patient();
  actor.effects.push(wound("cracked-jaw", "light", 2), wound("damaged-eye", "deadly", null));
  await restDay(actor);
  assert.equal(actor.effects.find(effect => effect.id === "cracked-jaw-w").flags[ID].criticalWound.recoveryDays, 1);
  await restDay(actor);
  assert.deepEqual(actor.effects.map(effect => effect.id), ["damaged-eye-w"]);
  assert.match(messages.at(-1).content, /Полностью зажило: Треснувшая челюсть/);
});

test("the patient is the single target, otherwise the healer", () => {
  const healer = { uuid: "Actor.h" }, other = { uuid: "Actor.p", type: "character" };
  globalThis.game = { user: { targets: new Set() } };
  assert.equal(healingPatient(healer), healer);
  game.user.targets = new Set([{ actor: other }]);
  assert.equal(healingPatient(healer), other);
  game.user.targets = new Set([{ actor: other }, { actor: { uuid: "Actor.q", type: "npc" } }]);
  assert.equal(healingPatient(healer), healer, "Several targets are ambiguous");
});

test("p.161 conditions carry their mechanics", () => {
  const intoxicated = CONDITION_BY_ID.intoxicated.rules.modifiers;
  assert.equal(intoxicated.filter(modifier => modifier.target.startsWith("skills.") && modifier.value === -3).length, 7);
  assert.ok(CONDITION_BY_ID.blinded.rules.modifiers.some(modifier => modifier.target === "skills.awareness" && modifier.value === -5));
  assert.ok(CONDITION_BY_ID.blinded.rules.action);
  assert.equal(CONDITION_BY_ID.vomiting.rules.incapacitated, true);
  assert.equal(EFFECT_TEMPLATES.find(entry => entry.key === "vomiting").documentId, "efct000000000035", "Appended after the existing IDs");
  assert.equal(EFFECT_TEMPLATES.find(entry => entry.key === "pinned").documentId, "efct000000000034");
});

test("nausea rolls every 3 rounds against BODY and makes the character vomit on a failure", async () => {
  const gm = {};
  globalThis.game = { user: gm, users: { activeGM: gm }, settings: { get: () => "public" } };
  const created = [];
  const effect = { disabled: false, statuses: new Set(["nauseated"]), flags: { [ID]: { condition: { nausea: { every: 3 } } } },
    async update(changes) { for (const [key, value] of Object.entries(changes)) set(effect, key, value); } };
  const actor = { effects: [effect], system: { statistics: { effective: { body: 6 } } },
    async createEmbeddedDocuments(_type, data) { created.push(...data); actor.effects.push(...data.map(entry => ({ ...entry, statuses: new Set(entry.statuses) }))); } };
  globalThis.foundry.documents.ActiveEffect = { getEffectStart: () => ({}) };
  const combat = { uuid: "Combat.c", started: true, combatants: [], turns: [] };
  const turn = round => nauseaTurn(combat, { actor, hidden: false }, { round, skipped: false });
  await turn(1);
  assert.equal(created.length, 0, "The first roll comes after a full interval");
  await turn(2);
  rolls.push(4);
  await turn(4);
  assert.equal(created.length, 0, "4 is under BODY 6");
  rolls.push(6);
  await turn(7);
  assert.deepEqual(created.map(entry => entry.statuses), [["vomiting"]]);
});

test("a dying patient is stabilised against how far HP is below 0", async () => {
  const { dyingDC, healingContext } = await import("../scripts/combat/healing.mjs");
  assert.deepEqual([dyingDC({ system: { health: { value: -7 } } }), dyingDC({ system: { health: { value: -0 } } })], [7, 1]);
  globalThis.game = { user: { targets: new Set() } };
  const healer = { uuid: "Actor.h", name: "Лекарь", isOwner: true, effects: [], flags: {}, items: [],
    system: { health: { value: -4, max: 30 }, details: {}, skills: { firstAid: 3 }, languages: [], abilityState: {},
      statistics: { dying: true, dead: false, recovery: 5, effective: { intelligence: 2 }, modifiers: [] } } };
  const view = healingContext(healer);
  assert.equal(view.self, true, "Self-treatment is allowed (core p.162 sidebar)");
  assert.deepEqual(view.dying, { dc: 4 });
  healer.system.statistics.dead = true;
  assert.equal(healingContext(healer).dying, null);
});
