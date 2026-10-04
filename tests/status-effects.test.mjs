import assert from "node:assert/strict";
import { test } from "node:test";
import { registerStatusEffects, localizeStatusEffects, hasStunned, setStunned } from "../scripts/combat/status-effects.mjs";
import { rollStun } from "../scripts/combat/stun-roll.mjs";
import { CONDITION_DEFINITIONS } from "../scripts/data/condition-definitions.mjs";

const actorWithEffects = () => ({
  uuid: "Actor.test", isOwner: true, effects: [], creations: 0,
  async toggleStatusEffect(status, { active }) {
    assert.equal(active, true);
    this.creations++;
    this.effects.push({ id: "stun", statuses: new Set([status]), disabled: false, isSuppressed: false });
  },
  async deleteEmbeddedDocuments(type, ids) {
    assert.equal(type, "ActiveEffect");
    this.effects = this.effects.filter(effect => !ids.includes(effect.id));
  }
});

test("only Witcher conditions remain in the status picker", () => {
  globalThis.CONFIG = { statusEffects: { deaf: {}, sick: {} }, specialStatusEffects: { BLIND: "blind", DEFEATED: "dead" } };
  globalThis.game = { i18n: { localize: key => `translated:${key}` } };
  registerStatusEffects();
  localizeStatusEffects();
  assert.deepEqual(Object.keys(CONFIG.statusEffects), CONDITION_DEFINITIONS.map(entry=>entry.id));
  assert.equal(CONFIG.statusEffects.deaf,undefined);
  assert.equal(CONFIG.statusEffects.poisoned.flags["witcher-eliott-system"].condition.save.dc,15);
  assert.ok(CONFIG.statusEffects.dying.description.includes("translated:"));
  assert.ok(CONFIG.statusEffects.dead.description.includes("translated:"));
  assert.ok(CONFIG.statusEffects.stunned.description.includes("translated:"));
  assert.ok(Object.values(CONFIG.specialStatusEffects).every(value => value === ""));
});

test("concurrent effect writes do not duplicate stun; removal leaves other effects alone", async () => {
  const actor = actorWithEffects();
  actor.effects.push({ id: "custom", statuses: new Set(), disabled: false });
  await Promise.all([setStunned(actor, true), setStunned(actor, true), setStunned(actor, true)]);
  assert.equal(actor.creations, 1);
  assert.equal(hasStunned(actor), true);
  await setStunned(actor, false);
  assert.equal(hasStunned(actor), false);
  assert.equal(actor.effects[0].id, "custom");
  actor.isOwner = false;
  await setStunned(actor, true);
  assert.equal(actor.creations, 1);
});

test("a disabled or expired stun is reactivated rather than duplicated", async () => {
  const actor = actorWithEffects();
  actor.effects.push({ id: "old", statuses: new Set(["stunned"]), disabled: true, isSuppressed: true,
    async update(changes) { this.disabled = changes.disabled; this.isSuppressed = changes.duration.expired; } });
  await setStunned(actor, true);
  assert.equal(actor.creations, 0);
  assert.equal(hasStunned(actor), true);
});

test("successful, posted Stun saves remove stun; failed or cancelled rolls keep it", async () => {
  const actor = actorWithEffects();
  actor.system = { statistics: { stun: 10 } };
  let total = 10, posted = true;
  globalThis.game = { settings: { get: () => "public" }, i18n: { localize: key => key, format: key => key } };
  globalThis.foundry = { dice: { Roll: class {
    async evaluate() { this.total = total; return this; }
    async toMessage() { return posted ? {} : null; }
  } }, documents: { ChatMessage: { getSpeaker: () => ({}) } } };
  await setStunned(actor, true);
  await rollStun(actor);
  assert.equal(hasStunned(actor), true);
  total = 9;
  posted = false;
  await rollStun(actor);
  assert.equal(hasStunned(actor), true);
  posted = true;
  await rollStun(actor);
  assert.equal(hasStunned(actor), false);
});
