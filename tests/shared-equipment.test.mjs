import test from "node:test";
import assert from "node:assert/strict";
import { sharedEquipmentUpdate } from "../scripts/migrations/shared-equipment.mjs";
import { circlePreview } from "../scripts/canvas/circle-preview.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";

test("shared items preserve owned quantities, custom notes and IDs while upgrading the torch", () => {
  globalThis.foundry = {data: {operators: {ForcedReplacement: class { constructor(value) { this.value = value; } }}}};
  const item = { id: "owned", type: "equipment", system: { ruleId: "gear.torch", quantity: 4, description: "Мои заметки", weight: .3 } };
  const update = sharedEquipmentUpdate(item);
  assert.equal(update.type, "weapon"); assert.equal(update.system.value.damage, "1d6");
  assert.equal(update.system.value.reliability.max, 5);
  assert.equal(update.system.value.description, "Мои заметки"); assert.equal(update.system.value.quantity, 4);
  for (const key of ["_id", "system.description", "system.weight", "system.quantity"]) assert.equal(update[key], undefined);
  assert.deepEqual(sharedEquipmentUpdate({ system: { ruleId: "radolf.rations", quantity: 6 } }), { "system.ruleId": "gear.rations" });
  const uuid = `Compendium.${SYS}.equipment.Item.rdlf000000000008`;
  assert.equal(sharedEquipmentUpdate({system: {description: `@UUID[${uuid}]`}})["system.description"], `@UUID[Compendium.${SYS}.equipment.Item.eqip000000000036]`);
});

test("marble preview follows world coordinates, uses scene scale and completely cleans up", () => {
  const calls = [], listeners = new Map();
  globalThis.PIXI = { Graphics: class {
    position = { set: (x,y) => calls.push(["position",x,y]) };
    lineStyle() { return this; } beginFill() { return this; } endFill() { return this; }
    drawCircle(x,y,r) { calls.push(["circle",x,y,r]); return this; }
    moveTo() { return this; } lineTo() { return this; }
    destroy() { calls.push("destroy"); }
  } };
  const stage = { addChild: shape => calls.push(["add",shape.eventMode]), removeChild: () => calls.push("remove"),
    on: (key,fn) => listeners.set(key,fn), off: key => listeners.delete(key) };
  globalThis.canvas = { stage };
  const clear = circlePreview({grid:{size:100,distance:2}}, {x:10,y:20}, 1);
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(["circle",0,0,50])));
  listeners.get("pointermove")({getLocalPosition: received => {assert.equal(received,stage);return {x:300,y:450};}});
  assert.deepEqual(calls.at(-1), ["position",300,450]); clear();
  assert.equal(listeners.size,0); assert.deepEqual(calls.slice(-2),["remove","destroy"]);
  delete globalThis.PIXI; delete globalThis.canvas;
});
