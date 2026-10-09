import test from "node:test";
import assert from "node:assert/strict";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { heatableItems, heatedWeaponSource, heatedWeapon, resolveHeat, isCadfan } from "../scripts/magic/cadfan.mjs";
import { strikeable } from "../scripts/magic/spell-strikes.mjs";

const cadfan = { id: "c", name: "Хватка Кадфана", uuid: "Actor.m.Item.c", system: CORE_MAGIC.find(entry => entry.id === "spell.cadfan-grasp").system };
function runtime(totals = []) {
  globalThis.game = { time: { worldTime: 0 }, combat: null };
  globalThis.foundry = { dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = totals.shift(); return this; } async toMessage() {} } },
    documents: { ActiveEffect: { getEffectStart: () => ({ time: 0 }) }, ChatMessage: { getSpeaker: () => ({}), implementation: { create: async data => data } } } };
}

test("Cadfan's Grasp has no defense and no hit location: it is not a weapon-like strike", () => {
  assert.equal(isCadfan(cadfan.system), true);
  const message = { flags: { "witcher-eliott-system": { magicCast: { spellId: "c", kind: "spell" } } }, speakerActor: { items: { get: () => cadfan } } };
  assert.equal(strikeable(message), null);
});

test("only held weapons and shields can be heated", () => {
  const actor = { items: [
    { id: "s", type: "weapon", system: { equipped: true } }, { id: "b", type: "weapon", system: { equipped: false } },
    { id: "c", type: "weapon", system: { equipped: true, natural: true } }, { id: "a", type: "armor", system: { equipped: true } }] };
  assert.deepEqual(heatableItems(actor).map(item => item.id), ["s"]);
});

test("an ally's heated weapon lasts the rolled rounds and is recognised in the attack", () => {
  runtime();
  const source = heatedWeaponSource({}, { id: "sword", name: "Меч" }, cadfan, 4);
  assert.equal(source.duration.value, 4); assert.match(source.description, /\+2d6/); assert.match(source.description, /50%/);
  const wielder = { effects: [{ ...source, disabled: false }] };
  assert.equal(heatedWeapon(wielder, "sword"), true); assert.equal(heatedWeapon(wielder, "axe"), false);
});

test("the holder drops the item or takes 2d6 to the arm, halved for the limb", async () => {
  runtime([9]);
  let health = 30, dropped = null;
  const item = { id: "sword", name: "Меч", system: { equipped: true }, async update(data) { dropped = data; } };
  const actor = { uuid: "Actor.b", name: "Бандит", isOwner: true, items: { get: () => item }, effects: [], system: { health: { value: health }, stamina: { value: 10 }, statistics: {} },
    async update(data) { if ("system.health.value" in data) health = data["system.health.value"]; } };
  globalThis.fromUuidSync = () => actor;
  const updates = [];
  const card = id => ({ id, flags: { "witcher-eliott-system": { cadfanHeat: { actor: "Actor.b", itemId: "sword", itemName: "Меч", choice: "" } } },
    async update(data) { updates.push(data); } });
  await resolveHeat(card("m1"), "hold");
  assert.equal(health, 26, "2d6 = 9 → ×½ = 4");
  assert.equal(updates[0]["flags.witcher-eliott-system.cadfanHeat.choice"], "hold");
  globalThis.canvas = undefined;
  await resolveHeat(card("m2"), "drop");
  assert.deepEqual(dropped, { "system.equipped": false }, "without a scene the item is simply let go");
});
