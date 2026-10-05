import assert from "node:assert/strict";
import { test } from "node:test";
import { registerEffectExpiry, removePreviouslyExpiredEffects } from "../scripts/combat/effect-expiry.mjs";

test("expiry uses the native delete policy and a ready cleanup", () => {
  globalThis.CONFIG = {ActiveEffect: {expiryAction: "update"}};
  const hooks = [];
  globalThis.Hooks = {once: (event, callback) => hooks.push([event, callback])};
  registerEffectExpiry();
  assert.equal(CONFIG.ActiveEffect.expiryAction, "delete");
  assert.equal(hooks[0][0], "ready");
});

test("cleanup removes only expired actor effects, once per linked or synthetic actor and only on active GM", async () => {
  const writes = [];
  const actor = uuid => ({uuid, effects: [
    {id: "expired", duration: {expired: true}},
    {id: "disabled", disabled: true, duration: {expired: false}},
    {id: "suppressed", isSuppressed: true, duration: {expired: false}},
    {id: "active", duration: {expired: false}}
  ], deleteEmbeddedDocuments: async (type, ids) => writes.push({uuid, type, ids})});
  const linked = actor("Actor.a"), synthetic = actor("Scene.s.Token.t.Actor.a");
  globalThis.game = {users: {activeGM: {isSelf: false}}, actors: [linked],
    scenes: [{tokens: [{actor: linked}, {actor: synthetic}, {actor: null}]}]};
  await removePreviouslyExpiredEffects();
  assert.equal(writes.length, 0);
  game.users.activeGM.isSelf = true;
  await removePreviouslyExpiredEffects();
  assert.deepEqual(writes, [linked, synthetic].map(({uuid}) => ({uuid, type: "ActiveEffect", ids: ["expired"]})));
});
