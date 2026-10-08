import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { adrenalineState, adrenalineContext, awardAdrenaline, adrenalineSpendQuote, spendAdrenaline, adrenalineDamage,
  consumeAdrenalineDamage, absorbAdrenalineDamage, adrenalineAbsorptionPlan, endAdrenaline, registerAdrenaline } from "../scripts/combat/adrenaline.mjs";

function fixture() {
  const state = { enabled: true, die: 6, post: true }, messages = [], hooks = {}, registered = [];
  const actor = { uuid: "Actor.hero", id: "hero", name: "Герой", type: "character", isOwner: true, items: [], effects: [], flags: {},
    system: { attributes: { body: 4 }, statistics: { effective: { body: 4 } }, stamina: { value: 40 }, health: { value: 20 } },
    async update(patch) { for (const [key, value] of Object.entries(patch)) { const parts = key.split("."); let at = this; for (const part of parts.slice(0, -1)) at = at[part] ??= {}; at[parts.at(-1)] = value; } } };
  globalThis.game = { combat: { id: "fight", started: true }, user: { isActiveGM: true }, actors: [actor], scenes: [],
    settings: { get: (_scope, key) => key === "adrenalineRules" ? state.enabled : "private", register: (...args) => registered.push(args) } };
  globalThis.Hooks = { on: (name, callback) => hooks[name] = callback };
  globalThis.foundry = { dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = state.die; return this; }
    async toMessage(data) { if (!state.post) return null; messages.push(data); return data; } } },
    documents: { ChatMessage: { getSpeaker: () => ({}), applyMode: data => data, create: async data => { if (!state.post) return null; messages.push(data); return data; } } } };
  const perun = { type: "weapon", name: "Переименованный меч", system: { installations: [{ category: "rune", ruleId: "rune.perun" }] } };
  return { actor, state, messages, perun, hooks, registered };
}

test("adrenaline is an opt-in world rule; attacker awards are idempotent and capped by BODY", async () => {
  const { actor, state, perun, registered } = fixture(); registerAdrenaline();
  assert.equal(registered[0][2].default, false);
  state.enabled = false; assert.equal(await awardAdrenaline(actor, perun), 0); assert.deepEqual(actor.flags, {});
  state.enabled = true;
  assert.equal(await awardAdrenaline(actor, perun, { eventId: "hit.1" }), 2);
  assert.equal(await awardAdrenaline(actor, perun, { eventId: "hit.1" }), 0);
  actor.effects.push({ flags: { [SYS]: { consumable: { ruleId: "potion.maribor" } } }, statuses: new Set() });
  assert.equal(await awardAdrenaline(actor, perun, { eventId: "hit.2" }), 2);
  assert.equal(adrenalineContext(actor).dice, 4);
  assert.equal(await awardAdrenaline(actor, perun, { eventId: "hit.3" }), 0);
});

test("declared damage dice cost 10 STA each before the action and are consumed exactly once", async () => {
  const { actor, perun } = fixture(); await awardAdrenaline(actor, perun);
  await spendAdrenaline(actor, 2, "damage");
  assert.equal(actor.system.stamina.value, 20); assert.equal(adrenalineState(actor).dice, 0);
  assert.equal(adrenalineDamage(actor), 2);
  assert.equal(await consumeAdrenalineDamage(actor), 2); assert.equal(await consumeAdrenalineDamage(actor), 0);
  assert.equal(actor.system.stamina.value, 20);
});

test("invalid, unaffordable, cancelled messages and concurrent spending cannot create free bonuses", async () => {
  const { actor, state } = fixture(); await awardAdrenaline(actor);
  assert.throws(() => adrenalineSpendQuote(actor, 1.5, "health"), /Укажите/);
  actor.system.stamina.value = 9; await assert.rejects(spendAdrenaline(actor, 1, "health"), /Выносливости/);
  actor.system.stamina.value = 40; state.post = false;
  await assert.rejects(spendAdrenaline(actor, 1, "health"), /Сообщение/);
  assert.equal(actor.system.stamina.value, 40); assert.equal(adrenalineState(actor).dice, 1);
  state.post = true;
  const results = await Promise.allSettled([spendAdrenaline(actor, 1, "health"), spendAdrenaline(actor, 1, "health")]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(actor.system.stamina.value, 30); assert.equal(adrenalineState(actor).temporaryHP, 6);
});

test("temporary HP absorb damage independently of Full Moon and expire at combat end", async () => {
  const { actor } = fixture(); await awardAdrenaline(actor); await spendAdrenaline(actor, 1, "health");
  assert.equal(actor.system.health.value, 20);
  assert.deepEqual(await absorbAdrenalineDamage(actor, 4), { absorbed: 4, remaining: 0 });
  assert.equal(adrenalineState(actor).temporaryHP, 2);
  await endAdrenaline(actor, "fight"); assert.equal(adrenalineState(actor).temporaryHP, 0); assert.equal(actor.system.health.value, 20);
});
test("a damage plan is read-only until its receipt and HP update are committed", async () => {
  const {actor}=fixture();await awardAdrenaline(actor);await spendAdrenaline(actor,1,"health");
  const plan=adrenalineAbsorptionPlan(actor,8);
  assert.equal(plan.remaining,2);assert.equal(plan.absorbed,6);assert.equal(adrenalineState(actor).temporaryHP,6);
  await actor.update({...plan.actorUpdate,"system.health.value":actor.system.health.value-plan.remaining});
  assert.equal(actor.system.health.value,18);assert.equal(adrenalineState(actor).temporaryHP,0);
});

test("emergency use can leave Death State; only unspent temporary recovery is removed at combat end", async () => {
  const { actor } = fixture(); await awardAdrenaline(actor); actor.system.health.value = -3;
  await spendAdrenaline(actor, 1, "health");
  assert.equal(actor.system.health.value, 1); assert.equal(adrenalineState(actor).emergencyHP, 4); assert.equal(adrenalineState(actor).temporaryHP, 2);
  const damage = await absorbAdrenalineDamage(actor, 3); actor.system.health.value -= damage.remaining;
  assert.deepEqual(damage, { absorbed: 2, remaining: 1 }); assert.equal(adrenalineState(actor).emergencyHP, 3);
  await endAdrenaline(actor, "fight"); assert.equal(actor.system.health.value, -3);
});

test("leaving or replacing combat never carries pending dice into a new encounter", async () => {
  const { actor, perun } = fixture(); await awardAdrenaline(actor, perun); await spendAdrenaline(actor, 1, "damage");
  game.combat = { id: "other", started: true };
  assert.equal(adrenalineDamage(actor), 0); assert.equal(adrenalineContext(actor).dice, 0);
  await endAdrenaline(actor, "fight"); assert.equal(actor.flags[SYS].adrenaline.damageDice, 0);
});
