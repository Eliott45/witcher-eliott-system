import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { inventoryWrite } from "../scripts/data/inventory-writes.mjs";
import { orderedCombatWeapons, moveCombatWeapon } from "../scripts/sheets/combat-weapon-order.mjs";

const flagPath = `flags.${SYSTEM_ID}.combatWeaponOrder`;
const ids = actor => orderedCombatWeapons(actor).map(item => item.id);
const weapon = (id, sort = 0) => ({ id, type: "weapon", name: id, sort, system: { equipped: false, quantity: 1 } });
function fixture(saved) {
  const writes = [], actor = { isOwner: true, flags: { [SYSTEM_ID]: saved === undefined ? {} : { combatWeaponOrder: saved } },
    items: [weapon("sword", 300), { id: "armor", type: "armor", sort: 200, system: { equipped: true } }, weapon("bow", 100), weapon("dagger", 400)],
    async update(changes) {
      // A network write yields: an implementation that reads before queuing would lose rapid clicks.
      await Promise.resolve();
      if (actor.failWrite) { actor.failWrite = false; throw new Error("write failed"); }
      assert.deepEqual(Object.keys(changes), [flagPath], "only the dedicated Actor flag may change");
      writes.push(structuredClone(changes)); actor.flags[SYSTEM_ID].combatWeaponOrder = structuredClone(changes[flagPath]);
    }
  };
  return { actor, writes };
}

test("the default follows weapon cards, ignores other types and leaves inventory sort and equipment untouched", async () => {
  const { actor, writes } = fixture(), inventory = structuredClone(actor.items);
  assert.deepEqual(ids(actor), ["sword", "bow", "dagger"]);
  assert.equal(orderedCombatWeapons(actor)[0], actor.items[0], "returns the actual Item documents");
  assert.equal(writes.length, 0);
  assert.equal(await moveCombatWeapon(actor, "bow", "up"), true);
  assert.deepEqual(ids(actor), ["bow", "sword", "dagger"]);
  assert.deepEqual(actor.items, inventory);
  assert.deepEqual(writes, [{ [flagPath]: ["bow", "sword", "dagger"] }]);
});

test("saved order survives reopening, ignores removed and duplicate IDs, and appends new weapons", async () => {
  const { actor } = fixture(["dagger", "deleted", "armor", "sword", "dagger"]);
  assert.deepEqual(ids(actor), ["dagger", "sword", "bow"]);
  actor.items.push(weapon("axe"));
  assert.deepEqual(ids(actor), ["dagger", "sword", "bow", "axe"]);
  await moveCombatWeapon(actor, "axe", "up");
  const reopened = { ...actor, flags: structuredClone(actor.flags), items: [...actor.items].reverse() };
  assert.deepEqual(ids(reopened), ["dagger", "sword", "axe", "bow"], "saved order is independent of collection order after reopening");
  reopened.items = reopened.items.filter(item => item.id !== "sword"); reopened.items.push(weapon("staff"));
  assert.deepEqual(ids(reopened), ["dagger", "axe", "bow", "staff"]);
  assert.deepEqual(actor.flags[SYSTEM_ID].combatWeaponOrder, ["dagger", "sword", "axe", "bow"], "a read never rewrites the saved flag");
});

test("rapid moves are serialized and each uses the result of the previous click", async () => {
  const { actor, writes } = fixture();
  assert.deepEqual(await Promise.all([
    moveCombatWeapon(actor, "dagger", "up"), moveCombatWeapon(actor, "dagger", "up"), moveCombatWeapon(actor, "dagger", "up")
  ]), [true, true, false]);
  assert.deepEqual(ids(actor), ["dagger", "sword", "bow"]); assert.equal(writes.length, 2);
  assert.deepEqual(await Promise.all([moveCombatWeapon(actor, "dagger", "down"), moveCombatWeapon(actor, "bow", "up")]), [true, true]);
  assert.deepEqual(ids(actor), ["sword", "bow", "dagger"]);
});

test("edges, missing IDs, non-weapons and invalid directions do not write", async () => {
  const { actor, writes } = fixture();
  for (const [id, direction] of [["sword", "up"], ["dagger", "down"], ["missing", "up"], ["armor", "down"], ["bow", "sideways"], [null, "up"]])
    assert.equal(await moveCombatWeapon(actor, id, direction), false);
  assert.equal(writes.length, 0); assert.deepEqual(ids(actor), ["sword", "bow", "dagger"]);
});

test("read-only viewers can see the saved order but cannot move weapons, including ownership revoked while queued", async () => {
  const { actor, writes } = fixture(["bow", "dagger", "sword"]); actor.isOwner = false;
  assert.deepEqual(ids(actor), ["bow", "dagger", "sword"]); assert.equal(await moveCombatWeapon(actor, "sword", "up"), false);
  actor.isOwner = true;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const prior = inventoryWrite(actor, () => gate);
  await Promise.resolve();
  const pending = moveCombatWeapon(actor, "sword", "up"); actor.isOwner = false; release();
  await prior; assert.equal(await pending, false); assert.equal(writes.length, 0);
});

test("failed persistence does not reorder locally and a queued retry still succeeds", async () => {
  const { actor, writes } = fixture(); actor.failWrite = true;
  const first = moveCombatWeapon(actor, "dagger", "up"), retry = moveCombatWeapon(actor, "dagger", "up");
  await assert.rejects(first, /write failed/); assert.equal(await retry, true);
  assert.deepEqual(ids(actor), ["sword", "dagger", "bow"]); assert.equal(writes.length, 1);
});

test("a malformed legacy flag falls back to current weapons and an empty inventory is a no-op", async () => {
  const { actor, writes } = fixture("sword"); assert.deepEqual(ids(actor), ["sword", "bow", "dagger"]);
  actor.items = []; assert.deepEqual(ids(actor), []); assert.equal(await moveCombatWeapon(actor, "sword", "down"), false);
  assert.equal(writes.length, 0);
});
