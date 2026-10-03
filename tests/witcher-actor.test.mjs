import assert from "node:assert/strict";
import { test } from "node:test";

test("disabling the core defeated overlay keeps the combat tracker's defeated control usable", async () => {
  const calls = [];
  globalThis.foundry = { documents: { Actor: class {
    async toggleStatusEffect(id, options) { calls.push({ id, options }); return true; }
  } } };
  const { WitcherActor } = await import("../scripts/documents/witcher-actor.mjs");
  const actor = new WitcherActor();
  await actor.toggleStatusEffect("", { active: true, overlay: true });
  assert.equal(calls.length, 0);
  assert.equal(await actor.toggleStatusEffect("stunned", { active: true }), true);
  assert.deepEqual(calls, [{ id: "stunned", options: { active: true } }]);
  globalThis.game = { user: { isGM: false }, i18n: { localize: key => key } };
  let warnings = 0;
  globalThis.ui = { notifications: { warn() { warnings++; } } };
  actor.effects = [{ statuses: new Set(["dying", "dead"]) }];
  await actor.toggleStatusEffect("dying");
  await actor.toggleStatusEffect("dead", { active: false });
  assert.equal(warnings, 2);
  assert.equal(calls.length, 1, "Players cannot use the token HUD to self-stabilize or revive");
  game.user.isGM = true;
  await actor.toggleStatusEffect("dead", { active: false });
  assert.equal(calls.at(-1).id, "dead");
});
