import assert from "node:assert/strict";
import { test } from "node:test";
import { CORE_ARMOR } from "../scripts/data/core-equipment.mjs";
import { supportsVisor, restrictedVision, ENHANCED_SENSES } from "../scripts/data/visor.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { abilitySuppressed, hasAbility } from "../scripts/data/abilities.mjs";
import { refreshActorVision, registerVisorVision } from "../scripts/canvas/visor-vision.mjs";

const helmet = (changes = {}) => ({id: "helmet", type: "armor", system: {
  ruleId: "armor.head.6", zone: "head", quantity: 1, carried: true, equipped: true, visorDown: true, ...changes
}});

test("only the four catalog helmets support visors; stable IDs and explicit homebrew traits survive renaming", () => {
  const helmets = CORE_ARMOR.filter(entry => supportsVisor({type: entry.type, system: {...entry.system, ruleId: entry.id}}));
  assert.deepEqual(helmets.map(entry => entry.id), [6, 7, 8, 9].map(n => `armor.head.${n}`));
  assert.equal(supportsVisor({...helmet(), name: "Custom name"}), true);
  for (const properties of ["Restricted Vision", "Ограниченный обзор", "Ограничение зрения при опущенном забрале"])
    assert.equal(supportsVisor(helmet({ruleId: "custom", properties})), true);
  assert.equal(supportsVisor(helmet({ruleId: "custom", properties: ""})), false);
  assert.equal(supportsVisor(helmet({zone: "torso"})), false);
  assert.equal(supportsVisor({...helmet(), type: "weapon"}), false);
});

test("restriction requires a lowered visor on a worn helmet, not a stowed, uncarried, empty or removed item", () => {
  assert.equal(restrictedVision([helmet()]), true);
  for (const changes of [{visorDown: false}, {equipped: false}, {carried: false}, {quantity: 0}])
    assert.equal(restrictedVision([helmet(changes)]), false);
  const bag = {id: "bag", type: "equipment", system: {kind: "container", quantity: 1}};
  assert.equal(restrictedVision([helmet({containerId: "bag"}), bag]), false);
  assert.equal(restrictedVision([]), false);
  assert.equal(restrictedVision([helmet({visorDown: false}), {...helmet(), id: "second"}]), true, "All worn layers count");
});

test("visor suspends only witcher senses, restoring the original bonus and scent-tracking ability without editing data", () => {
  const system = {attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 8])), health: {value: 40, max: 40}, details: {race: "witcher"}};
  const actor = {system, items: [helmet()]};
  const before = structuredClone(actor);
  const effect = {id: "awareness", name: "Other bonus", flags: {"witcher-eliott-system": {condition: {modifiers: [{target: "skills.awareness", value: 2}]}}}};
  const stats = () => deriveStatistics(system, {items: actor.items, effects: [effect], abilityIds: [ENHANCED_SENSES]});
  assert.equal(stats().skillBonuses.awareness, 2);
  assert.equal(stats().modifiers.some(modifier => modifier.source === ENHANCED_SENSES), false);
  assert.equal(abilitySuppressed(actor, ENHANCED_SENSES), true);
  assert.equal(hasAbility(actor, ENHANCED_SENSES), false);
  assert.equal(hasAbility(actor, "witcher.lightning-reflexes"), true);
  assert.deepEqual(actor, before);
  actor.items[0].system.visorDown = false;
  assert.equal(stats().skillBonuses.awareness, 3, "Racial bonus is restored exactly once even with an owned duplicate ability");
  assert.equal(hasAbility(actor, ENHANCED_SENSES), true);
  actor.items[0].system.visorDown = true;
  actor.items[0].system.equipped = false;
  assert.equal(stats().skillBonuses.awareness, 3);
  assert.equal(hasAbility(actor, ENHANCED_SENSES), true);
  actor.items[0].system.equipped = true;
  system.details.race = "human";
  actor.items.push({type: "ability", system: {ruleId: ENHANCED_SENSES}});
  assert.equal(restrictedVision(actor.items), true);
  assert.equal(abilitySuppressed(actor, ENHANCED_SENSES), false);
  assert.equal(hasAbility(actor, ENHANCED_SENSES), true);
  assert.equal(stats().skillBonuses.awareness, 3, "Other races have no extra sense penalty");
});

test("vision hooks immediately refresh matching linked and unlinked scene tokens on every client", () => {
  const calls = [], hooks = new Map();
  const linked = {uuid: "Actor.a", documentName: "Actor"};
  const unlinked = {uuid: "Scene.s.Token.t.Actor.a", documentName: "Actor"};
  const tokens = [linked, linked, unlinked].map((actor, id) => ({actor, initializeVisionSource: () => calls.push(id)}));
  globalThis.canvas = {ready: true, tokens: {placeables: tokens}};
  globalThis.Hooks = {on: (event, fn) => hooks.set(event, fn)};
  registerVisorVision();
  for (const event of ["createItem", "updateItem", "deleteItem"]) hooks.get(event)({parent: linked});
  assert.deepEqual(calls, [0, 1, 0, 1, 0, 1]);
  calls.length = 0;
  hooks.get("updateItem")({parent: unlinked});
  hooks.get("updateActorDelta")({parent: {actor: unlinked}});
  hooks.get("updateActor")(unlinked);
  assert.deepEqual(calls, [2, 2, 2]);
  calls.length = 0;
  refreshActorVision({uuid: "Item.world", documentName: "Item"});
  canvas.ready = false;
  refreshActorVision(linked);
  assert.deepEqual(calls, []);
});
