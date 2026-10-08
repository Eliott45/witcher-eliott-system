import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { fumbleOutcome } from "../scripts/data/fumbles.mjs";
import { fumbleSteps, runFumbleStep } from "../scripts/combat/attack-exchange.mjs";

function fixture() {
  const ground = { uuid: "Actor.loot.Item.thorn", name: "Шип", type: "weapon", isOwner: false,
    system: { reliability: { value: 10, max: 10 }, installations: [] },
    async update(change) { this.system.reliability.value = change["system.reliability.value"]; } };
  const remaining = { ...ground, system: { reliability: { value: 10, max: 10 } } };
  const actor = { uuid: "Actor.hero", isOwner: true, items: { get: () => remaining } };
  const attack = { thrown: true, itemId: "thorn", groundWeaponUuid: ground.uuid, thrownDrop: { state: "pending" } };
  const message = { id: "throw", speakerActor: actor, blind: true, whisper: ["gm"], flags: { [SYS]: { weaponAttack: attack } } };
  const messages = [], rolls = [];
  globalThis.game = { messages, settings: { get: () => "public" } };
  globalThis.fromUuidSync = uuid => uuid === ground.uuid ? ground : null;
  globalThis.foundry = { dice: { Roll: class {
    constructor(formula) { this.formula = formula; this.total = 6; rolls.push(this); }
    async evaluate() { return this; }
    async toMessage() { return {}; }
  } }, documents: { ChatMessage: { getSpeaker: () => ({}), implementation: {
    applyMode: data => data, create: async data => { messages.push(data); return data; }
  } } } };
  const outcome = fumbleOutcome("ranged", 6), step = fumbleSteps(outcome, actor, "thorn", attack)[0];
  const run = () => runFumbleStep({ message, index: 0, role: "attack", actor, itemId: "thorn", outcome, step });
  return { ground, remaining, actor, attack, message, messages, rolls, step, run };
}

test("thrown break waits for transfer and GM ownership, damages only the dropped copy and preserves privacy", async () => {
  const f = fixture();
  assert.equal(f.step.id, "break");
  await f.run(); assert.equal(f.messages.length, 0);
  f.attack.thrownDrop.state = "complete";
  await f.run(); assert.equal(f.messages.length, 0);
  f.ground.isOwner = true;
  await f.run();
  assert.equal(f.ground.system.reliability.value, 0);
  assert.equal(f.remaining.system.reliability.value, 10);
  assert.deepEqual(f.messages[0].whisper, ["gm"]); assert.equal(f.messages[0].blind, true);
  assert.match(f.messages[0].content, /сломано/);
  await f.run(); assert.equal(f.messages.length, 1);
});

test("Chernobog can prevent a thrown weapon breaking; fired arrows do not break their bow", async () => {
  const f = fixture(); f.attack.thrownDrop.state = "complete"; f.ground.isOwner = true;
  f.ground.system.installations = [{ category: "rune", ruleId: "rune.chernobog" }];
  await f.run();
  assert.equal(f.ground.system.reliability.value, 10);
  assert.equal(f.rolls[0].formula, "1d6"); assert.match(f.messages[0].content, /Чернобог/);
  assert.deepEqual(fumbleSteps(fumbleOutcome("ranged", 6), f.actor, "bow", { ranged: true }), []);
});
