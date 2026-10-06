import test from "node:test";
import assert from "node:assert/strict";
import { punchDamage, kickDamage, unarmedAttack, dualWeapons, canAnswerDual } from "../scripts/combat/brawling.mjs";
import { attackModes, weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { CONDITION_BY_ID } from "../scripts/data/condition-definitions.mjs";
import { GRAPPLE_ACTIONS } from "../scripts/combat/grapple.mjs";

globalThis.game ??= {};
const actor = (extra = {}) => ({ type: "character", isOwner: true, effects: [], items: [], system: { skills: { brawling: 4, physique: 3, melee: 5 }, attributes: {}, abilityState: {}, languages: [],
  stamina: { value: 30, max: 30 }, statistics: { effective: { reflex: 6, body: 7 }, modifiers: [], meleeDamageBonus: 0, physicalDamageBonus: 0 } }, ...extra });

test("punch and kick follow the p.48 table, a kick is the punch +4", () => {
  assert.deepEqual([1, 3, 5, 7, 9, 11, 13].map(punchDamage), ["1d6-4", "1d6-2", "1d6", "1d6+2", "1d6+4", "1d6+6", "1d6+8"]);
  assert.deepEqual([1, 3, 5, 7, 13].map(kickDamage), ["1d6", "1d6+2", "1d6+4", "1d6+6", "1d6+12"]);
});

test("unarmed strikes are Brawling attacks with non-lethal damage; strong doubles, push hits the torso for kick damage", () => {
  const a = actor();
  const fast = unarmedAttack(a, "punch", { mode: "fast" });
  assert.equal(fast.total, 10, "REF 6 + Brawling 4");
  assert.equal(fast.nonLethal, true);
  assert.equal(fast.damage, "(1d6+2)");
  assert.equal(unarmedAttack(a, "kick", { mode: "strong" }).damage, "(1d6+6) * 2");
  assert.equal(unarmedAttack(a, "kick", { mode: "strong" }).total, 7);
  const push = unarmedAttack(a, "kick", { mode: "push", location: "head" });
  assert.equal(push.aim.id, "torso", "A push kick always lands in the torso");
  assert.equal(push.aim.penalty, 0);
  assert.equal(push.damage, "(1d6+6)", "Half of a strong kick");
  assert.equal(unarmedAttack(a, "punch", { mode: "charge" }).attack.charge, true);
});

test("melee weapons offer charge, pommel strike, disarm, trip; pommel halves and is non-lethal, specials deal no damage", () => {
  const sword = { id: "s", type: "weapon", name: "Меч", system: { skill: "melee", category: "melee", damage: "2d6", hands: 1, grip: 1, accuracy: 0, equipped: true, carried: true, quantity: 1, installations: [] } };
  const a = actor({ items: Object.assign([sword], { get: () => sword }) });
  const ids = attackModes(a, sword).map(mode => mode.id);
  assert.deepEqual(ids, ["fast", "strong", "charge", "pommel", "disarm", "trip"]);
  const pommel = weaponAttack(a, sword, { mode: "pommel" });
  assert.match(pommel.damage, /^floor\(.*\/ 2\)$/);
  assert.equal(pommel.nonLethal, true);
  assert.equal(weaponAttack(a, sword, { mode: "disarm" }).damage, null);
  assert.equal(weaponAttack(a, sword, { mode: "charge" }).attack.multiplier, 2);
  assert.ok(GRAPPLE_ACTIONS["weapon-disarm"] && GRAPPLE_ACTIONS["weapon-trip"]);
});

test("a joint attack needs two one-handed weapons; blocking it needs two weapons or a weapon and a shield", () => {
  const weapon = (id, extra = {}) => ({ id, type: "weapon", system: { category: "melee", grip: 1, hands: 1, ...extra } });
  assert.equal(dualWeapons(null, [weapon("a"), weapon("b")]).length, 2);
  assert.equal(dualWeapons(null, [weapon("a"), weapon("b", { grip: 2 })]).length, 0);
  assert.equal(canAnswerDual(null, [weapon("a")]), false);
  assert.equal(canAnswerDual(null, [weapon("a"), weapon("s", { category: "shield" })]), true);
});

test("brawling disarm and trip need no grapple; prone stands up by spending movement", () => {
  assert.equal(GRAPPLE_ACTIONS.trip.free, true);
  assert.equal(GRAPPLE_ACTIONS["disarm-take"].penalty, -3);
  assert.match(CONDITION_BY_ID.prone.rules.action, /Встать/);
});
