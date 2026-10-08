import test from "node:test";
import assert from "node:assert/strict";
import { criticalTableRoll, balancedCriticalBonus, specterDamageBonus } from "../scripts/combat/relic-weapon-rules.mjs";
import { RELIC_WEAPONS, RELIC_WEAPON_LORE } from "../scripts/data/relic-weapons.mjs";
import { relicLore } from "../scripts/data/relic-lore.mjs";
import { weaponHitTraits } from "../scripts/combat/weapon-hit-effects.mjs";
import { deriveStatistics, ATTRIBUTE_KEYS } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { relicWeaponContentUpdate } from "../scripts/migrations/relic-weapon-content.mjs";

test("Balanced moves the wound table and clamps without changing the critical level", () => {
  const weapon = { properties: "Сбалансированное" };
  assert.equal(criticalTableRoll(8, { weapon }), 10);
  assert.equal(criticalTableRoll(11, { weapon, extra: 3 }), 12);
  assert.equal(criticalTableRoll(4, { weapon, aimed: true, location: "head" }), 5);
  assert.equal(criticalTableRoll(0, { weapon, aimed: true, location: "leftArm" }), 0);
  const headtaker = RELIC_WEAPONS.find(entry => entry.id === "weapon.headtaker").system;
  assert.equal(balancedCriticalBonus(headtaker), 5);
  assert.equal(criticalTableRoll(10, { weapon: headtaker }), 12);
  assert.equal(balancedCriticalBonus(headtaker, true), 1);
});

test("relic wielder bonuses enter normal derived HP and skill checks only while the weapon is equipped", () => {
  const system = { attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 8])), health: { value: 27 },
    skills: { seduction: 5, hexWeaving: 4, resistMagic: 3 } };
  for (const [id, skill, bonus] of [["weapon.caroline", null, 25], ["weapon.succubus-staff", "seduction", 2], ["weapon.red-death", "hexWeaving", 3], ["weapon.red-death", "resistMagic", 3]]) {
    const source = RELIC_WEAPONS.find(entry => entry.id === id);
    const item = { ...source, system: { ...source.system, ruleId: id, quantity: 1, carried: true, equipped: false } };
    system.statistics = deriveStatistics(system, { items: [item] });
    const initial = skill ? skillValue(system, skill).total : system.statistics.healthMax;
    item.system.equipped = true; system.statistics = deriveStatistics(system, { items: [item] });
    assert.equal(skill ? skillValue(system, skill).total : system.statistics.healthMax, initial + bonus, id);
    assert.equal(system.health.value, 27, "equipping never heals");
    item.system.carried = false; system.statistics = deriveStatistics(system, { items: [item] });
    assert.equal(skill ? skillValue(system, skill).total : system.statistics.healthMax, initial);
  }
});

test("old relic legends migrate without replacing private notes, condition or custom text", () => {
  const old = "<p>Стальной полуторный меч с островов Скеллиге, связанный с легендой об Уффе Кровавобородом. Историю можно вспомнить Образованием СЛ 16. Игнорирует сопротивление брони типу урона; при нанесении урона вызывает кровотечение с вероятностью 75%.</p>";
  const item = { name: "Переименовано", system: { ruleId: "weapon.wolf", reliability: { value: 2, max: 15 }, description: old + "<p>Запись игрока.</p>" } };
  const update = relicWeaponContentUpdate(item);
  assert.deepEqual(Object.keys(update), ["system.description"]);
  assert.match(update["system.description"], /Надим/); assert.match(update["system.description"], /Запись игрока/);
  item.system.description = update["system.description"]; assert.deepEqual(relicWeaponContentUpdate(item), {});
  item.system.description = "<p>Собственная история.</p>"; assert.deepEqual(relicWeaponContentUpdate(item), {});
  assert.equal(item.system.reliability.value, 2);
});

test("Moon Bow bonus follows the target's specter class and all weapon legends survive renaming", () => {
  const bow = RELIC_WEAPONS.find(entry => entry.id === "weapon.moon-bow");
  const traits = weaponHitTraits(bow.system);
  assert.equal(specterDamageBonus(traits, { type: "npc", system: { creature: { category: "specter" } } }), 3);
  assert.equal(specterDamageBonus(traits, { type: "npc", system: { creature: { category: "necrophage" } } }), 0);
  for (const entry of RELIC_WEAPONS) {
    const item = { type: entry.type, name: "Переименовано", system: { ...entry.system, ruleId: entry.id } };
    assert.deepEqual(relicLore(item), RELIC_WEAPON_LORE[entry.id]);
    assert.equal(relicLore({ ...item, type: "equipment" }), null);
  }
});
