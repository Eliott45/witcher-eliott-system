import test from "node:test";
import assert from "node:assert/strict";
import { UNIQUE_STATUSES, duplicateStatusEffects, registerUniqueStatuses, removeExistingDuplicateStatuses } from "../scripts/combat/status-effects.mjs";

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

function fallFixture(status = "unconscious", extra = {}) {
  const hooks = new Map();
  globalThis.Hooks = { on: (name, fn) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) };
  const gm = { isSelf: true, isActiveGM: true };
  globalThis.game = { user: gm, users: { activeGM: gm }, actors: [], scenes: [] };
  registerUniqueStatuses();
  const toggled = [];
  const actor = { documentName: "Actor", isOwner: true, uuid: "Actor.b", effects: [],
    async toggleStatusEffect(id, { active }) { toggled.push([id, active]); actor.effects.push(effect("p", id, 9)); } };
  actor.effects.has = id => actor.effects.some(entry => entry.id === id);
  const cause = { ...effect("cause", status, 1), parent: actor, ...extra };
  actor.effects.push(cause);
  const emit = async name => {
    await Promise.all((hooks.get(name) ?? []).map(hook => hook(cause)));
    await new Promise(resolve => setImmediate(resolve));
  };
  delete globalThis.Hooks;
  return { actor, cause, toggled, emit, gm };
}

test("all unconsciousness causes and death make a creature prone once, while waking leaves it lying", async () => {
  for (const status of ["unconscious", "chloroform", "fisstech-unconscious", "dead"]) {
    const f = fallFixture(status);
    await f.emit("createActiveEffect");
    await f.emit("updateActiveEffect");
    assert.deepEqual(f.toggled, [["prone", true]], status);
    f.actor.effects.splice(f.actor.effects.indexOf(f.cause), 1);
    await f.emit("deleteActiveEffect");
    assert.ok(f.actor.effects.some(effect => effect.statuses.has("prone")), "Waking does not stand up");
  }
});

test("inactive causes never knock down; reactivating a cause restores an expired prone effect", async () => {
  for (const inactive of [{ disabled: true }, { isSuppressed: true }, { duration: { expired: true } }]) {
    const f = fallFixture("unconscious", inactive);
    await f.emit("createActiveEffect");
    assert.deepEqual(f.toggled, []);
    const prone = { ...effect("old-prone", "prone", 0), duration: { expired: true },
      async update(data) { Object.assign(this, data); } };
    f.actor.effects.push(prone);
    Object.assign(f.cause, { disabled: false, isSuppressed: false, duration: { expired: false } });
    await f.emit("updateActiveEffect");
    assert.deepEqual(f.toggled, [], "Reuse the existing prone effect");
    assert.equal(prone.duration.expired, false);
    assert.equal(prone.disabled, false);
  }
});

test("stun and pinning do not count as unconsciousness; only the active GM applies the fall", async () => {
  for (const status of ["stunned", "exhausted-stun", "fisstech", "pinned"]) {
    const f = fallFixture(status);
    await f.emit("createActiveEffect");
    assert.deepEqual(f.toggled, []);
  }
  const f = fallFixture(); f.gm.isSelf = false;
  await f.emit("createActiveEffect");
  await f.emit("updateActiveEffect");
  assert.deepEqual(f.toggled, []);
});

test("startup repairs existing unconscious world actors and unlinked tokens without duplicates", async () => {
  const world = fallFixture(), token = fallFixture("chloroform");
  token.actor.uuid = "Scene.test.Token.test.Actor.b";
  game.actors = [world.actor];
  game.scenes = [{ tokens: [{ actorLink: true, actor: world.actor }, { actorLink: false, actor: token.actor }] }];
  await removeExistingDuplicateStatuses();
  await removeExistingDuplicateStatuses();
  assert.equal(world.toggled.length, 1);
  assert.equal(token.toggled.length, 1);
});
