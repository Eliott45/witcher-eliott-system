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
