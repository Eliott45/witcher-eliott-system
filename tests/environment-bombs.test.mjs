import test from "node:test";
import assert from "node:assert/strict";
import { actorEnvironment, environmentModifiers, environmentSummary, worksUnderwater } from "../scripts/combat/environment.mjs";
import { bombProfile, blastDamage, bombThrowQuote, tokensInBlast } from "../scripts/combat/bombs.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

globalThis.game ??= {};
const scene = (environment = {}, darknessLevel = 0) => ({ flags: { [SYSTEM_ID]: { environment } }, environment: { darknessLevel } });
const who = (...statuses) => ({ statuses: new Set(statuses) });
const targets = list => list.map(modifier => `${modifier.target}${modifier.value ?? ""}${modifier.factor ? `×${modifier.factor.toFixed(2)}` : ""}`);

test("scene light follows the darkness level unless set; tokens carry exceptions (core p.165)", () => {
  assert.equal(actorEnvironment(who(), scene({}, 0.1)).light.id, "day");
  assert.equal(actorEnvironment(who(), scene({}, 0.5)).light.id, "dim");
  assert.equal(actorEnvironment(who(), scene({}, 0.9)).light.id, "dark");
  assert.equal(actorEnvironment(who("env-lit"), scene({ light: "dark" })).light.id, "day");
  assert.deepEqual(targets(environmentModifiers(actorEnvironment(who(), scene({ light: "dark" })))), ["skills.awareness-4", "combat.attack-2", "combat.defense-2"]);
  assert.equal(actorEnvironment(who("env-dry-ground"), scene({ terrain: "swamp" })).terrain.id, "normal");
  assert.equal(actorEnvironment(who("env-underwater"), scene({ terrain: "swamp" })).underwater, true);
  assert.deepEqual(targets(environmentModifiers(actorEnvironment(who(), scene({ terrain: "water" })))), ["combat.attack-2", "combat.blockParry-2", "skills.awareness-3"]);
  assert.equal(actorEnvironment(who(), null), null);
  assert.match(environmentSummary(actorEnvironment(who(), scene({ light: "dim", terrain: "snow", heat: true }))).label, /Слабый свет · Лёд и снег · Экстремальная жара/);
});

test("witcher senses ignore dim light; the Cat potion ignores darkness; heat cuts stamina by a third or half in heavier armor", () => {
  const dim = actorEnvironment(who(), scene({ light: "dim" })), dark = actorEnvironment(who(), scene({ light: "dark" }));
  assert.equal(environmentModifiers(dim, { senses: true }).length, 0);
  assert.equal(environmentModifiers(dark, { senses: true }).length, 3);
  const cat = [{ disabled: false, statuses: new Set(["potion.cat"]) }];
  assert.equal(environmentModifiers(dark, { effects: cat }).length, 0);
  const hot = actorEnvironment(who(), scene({ heat: true }));
  assert.deepEqual(targets(environmentModifiers(hot)), ["staminaMax×0.67"]);
  assert.deepEqual(targets(environmentModifiers(hot, { items: [{ type: "armor", system: { equipped: true, armorClass: "medium" } }] })), ["staminaMax×0.50"]);
  const attributes = { intelligence: 5, reflex: 5, dexterity: 5, body: 6, speed: 5, empathy: 5, craft: 5, will: 6, luck: 5 };
  assert.equal(deriveStatistics({ attributes, health: { value: 30, max: 30 } }, { environment: hot }).staminaMax, 20);
  assert.equal(worksUnderwater({ category: "thrown", skill: "athletics", name: "Метательный нож" }), false);
  assert.equal(worksUnderwater({ category: "thrown", skill: "staffSpear", name: "Копьё" }), true);
});

const bomb = (properties, extra = {}) => ({ type: "equipment", system: { ruleId: "bomb.x", properties, damageType: "К", description: "", quantity: 2, ...extra } });

test("bomb properties give radius, damage and effects", () => {
  assert.deepEqual((({ radius, damage, burning }) => ({ radius, damage, burning }))(bombProfile(bomb("Бомба; Радиус 4 м; Урон 7d6; Горение (25%)"))), { radius: 4, damage: "7d6", burning: 25 });
  const samum = bombProfile(bomb("Бомба; Радиус 4 м; Испытание УСТ −2; Слепота — 6 раундов"));
  assert.equal(samum.stunSave, -2); assert.equal(samum.blind, 6); assert.equal(samum.damage, "");
  const puff = bombProfile(bomb("Бомба; Радиус 4 м; Отравление (100%); Двойной урон яда"));
  assert.equal(puff.poison, 100); assert.equal(puff.doublePoison, true);
  assert.equal(bombProfile(bomb("Бомба; Радиус 4 м; Замораживание на месте", { description: "Эффект длится 8 раундов" })).freeze, 8);
});

test("a throw uses Athletics against the distance DC; range is BODY × 4 m", () => {
  const actor = { system: { skills: { athletics: 4 }, attributes: {}, abilityState: {}, statistics: { effective: { body: 5, dexterity: 6 }, modifiers: [] } }, effects: [], items: [] };
  globalThis.game.combat = null;
  const near = bombThrowQuote(actor, bomb(""), 3);
  assert.equal(near.range, 20); assert.equal(near.band.id, "short"); assert.equal(near.dc, 15);
  assert.equal(bombThrowQuote(actor, bomb(""), 0.3).dc, 10);
  assert.match(bombThrowQuote(actor, bomb(""), 41).blocked, /Слишком далеко/);
  assert.match(bombThrowQuote(actor, bomb("", { quantity: 0 }), 3).blocked, /закончились/);
});

test("the blast hits every body part against its own armor and finds tokens in the radius", () => {
  const target = { type: "character", items: [], effects: [], system: { creature: {}, statistics: { modifiers: [] } } };
  const rolls = { head: 10, torso: 10, rightArm: 10, leftArm: 10, rightLeg: 10, leftLeg: 10 };
  const blast = blastDamage(target, rolls, { types: ["piercing"], piercing: "none", silver: false });
  assert.equal(blast.parts.length, 6); assert.equal(blast.total, 30 + 10 + 4 * 5, "head ×3, torso ×1, limbs ×½");
  const scene = { grid: { size: 100, distance: 2 }, tokens: [{ actor: {}, x: 0, y: 0, width: 1, height: 1, getSize: () => ({ width: 100, height: 100 }) },
    { actor: {}, x: 400, y: 0, width: 1, height: 1, getSize: () => ({ width: 100, height: 100 }) }] };
  assert.equal(tokensInBlast(scene, { x: 50, y: 50 }, 4).length, 1);
  assert.equal(tokensInBlast(scene, { x: 250, y: 50 }, 4).length, 2);
});

test("a «Среда Ведьмака» region overrides the scene for tokens inside it; blank fields keep the scene", () => {
  const behavior = (system, extra = {}) => ({ type: "environment", disabled: false, system, ...extra });
  const token = { parent: scene({ light: "day", terrain: "normal" }), regions: new Set([{ behaviors: [behavior({ light: "", terrain: "snow", heat: "" }), behavior({ light: "dark", terrain: "", heat: "on" }, { disabled: true })] }]) };
  const state = actorEnvironment(who(), undefined, token);
  assert.equal(state.terrain.id, "snow"); assert.equal(state.light.id, "day"); assert.equal(state.heat, false);
  token.regions = new Set([{ behaviors: [behavior({ light: "dark", terrain: "", heat: "on" })] }]);
  const hot = actorEnvironment(who(), undefined, token);
  assert.equal(hot.light.id, "dark"); assert.equal(hot.terrain.id, "normal"); assert.equal(hot.heat, true);
  assert.equal(actorEnvironment(who("env-dry-ground"), undefined, { ...token, regions: new Set([{ behaviors: [behavior({ terrain: "snow" })] }]) }).terrain.id, "normal");
});
