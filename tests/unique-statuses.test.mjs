import test from "node:test";
import assert from "node:assert/strict";
import { UNIQUE_STATUSES, duplicateStatusEffects, registerUniqueStatuses } from "../scripts/combat/status-effects.mjs";

const effect = (id, status, created, disabled = false) => ({ id, statuses: new Set([status]), disabled, _stats: { createdTime: created } });

test("core p.161: identical effects never stack — the oldest active one stays", () => {
  assert.ok(["stunned", "unconscious", "prone", "bleeding", "poisoned", "dead"].every(status => UNIQUE_STATUSES.has(status)));
  const actor = { effects: [effect("b", "stunned", 2), effect("a", "stunned", 1), effect("c", "unconscious", 3), effect("d", "unconscious", 4), effect("e", "prone", 5), effect("f", "prone", 6, true)] };
  assert.deepEqual(duplicateStatusEffects(actor).sort(), ["b", "d"]);
});

test("a second identical status is refused before creation; disabled copies and other effects pass", () => {
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
  registerUniqueStatuses();
  const actor = { documentName: "Actor", effects: [effect("a", "stunned", 1)] };
  const pre = data => hooks.preCreateActiveEffect({ parent: actor, statuses: new Set(data.statuses ?? []) }, data);
  assert.equal(pre({ statuses: ["stunned"] }), false);
  assert.equal(pre({ statuses: ["prone"] }), undefined);
  assert.equal(pre({ statuses: [] }), undefined, "Critical wounds and doses have no status");
  actor.effects[0].disabled = true;
  assert.equal(pre({ statuses: ["stunned"] }), undefined, "A disabled copy is re-enabled elsewhere, not blocking");
  delete globalThis.Hooks;
});

test("an unconscious or dead creature is put on the ground once («Ничком»)", async () => {
  const { CONDITION_BY_ID } = await import("../scripts/data/condition-definitions.mjs");
  assert.equal(CONDITION_BY_ID.prone.name, "Ничком");
  const hooks = [];
  globalThis.Hooks = { on: (name, fn) => { if (name === "createActiveEffect") hooks.push(fn); } };
  const gm = { isSelf: true };
  globalThis.game = { users: { activeGM: gm } };
  registerUniqueStatuses();
  const toggled = [];
  const actor = { documentName: "Actor", isOwner: true, uuid: "Actor.b", effects: [], toggleStatusEffect: async (id, { active }) => { toggled.push([id, active]); actor.effects.push(effect("p", id, 9)); } };
  actor.effects.has = id => actor.effects.some(entry => entry.id === id);
  for (const hook of hooks) hook({ parent: actor, statuses: new Set(["unconscious"]) });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(toggled, [["prone", true]]);
  for (const hook of hooks) hook({ parent: actor, statuses: new Set(["dead"]) });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(toggled.length, 1, "Already lying");
  delete globalThis.Hooks;
});
