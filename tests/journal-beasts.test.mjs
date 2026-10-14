import test from "node:test";
import assert from "node:assert/strict";
import { bestiarySources, harvestItemName } from "../scripts/data/bestiary.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { immuneToCondition } from "../scripts/data/creatures.mjs";
import { creatureModeModifiers, creatureWeaponBlocked } from "../scripts/data/creature-modes.mjs";
import { spiritState, creatureMentalImmunity } from "../scripts/combat/creature-spirits.mjs";
import { actorEnvironment } from "../scripts/combat/environment.mjs";
import { weaponHitTraits } from "../scripts/combat/weapon-hit-effects.mjs";
import { chargeProfile } from "../scripts/combat/creature-actions-rules.mjs";
import { JOURNAL_MATERIALS } from "../scripts/data/journal-materials.mjs";
import { SCHOOL_MATERIALS } from "../scripts/data/witcher-school-gear.mjs";

const SYSTEM_ID = "witcher-eliott-system";
function creature(name) {
  const source = structuredClone(bestiarySources().find(actor => actor.name === name));
  assert.ok(source, name);
  source.effects = []; source.flags ??= {};
  source.items = source.items.map(item => ({ ...item, id: item._id }));
  source.system.parent = source;
  source.system.statistics = deriveStatistics(source.system, { items: source.items });
  return source;
}
const base = (actor, key) => skillValue(actor.system, key).total;
const weapon = (actor, name) => actor.items.find(item => item.type === "weapon" && item.name === name)?.system;

test("beasts and cursed ones reproduce the printed bases, defenses and derived statistics", () => {
  const printed = {
    "Медведь": [{ athletics: 10, brawling: 13, awareness: 10, wildernessSurvival: 12, intimidation: 14, physique: 20, stealth: 8, resistMagic: 13, endurance: 16, courage: 14, dodgeEscape: 13, melee: 15 }, [8, 21, 4, 40, 80, 8]],
    "Вепрь": [{ athletics: 8, brawling: 6, awareness: 7, wildernessSurvival: 9, intimidation: 10, physique: 12, stealth: 10, resistMagic: 8, endurance: 13, courage: 16, dodgeEscape: 10, melee: 11 }, [7, 15, 3, 35, 35, 7]],
    "Пантера": [{ athletics: 16, brawling: 12, awareness: 15, wildernessSurvival: 14, intimidation: 12, physique: 13, stealth: 17, resistMagic: 10, endurance: 12, courage: 14, dodgeEscape: 12, melee: 15 }, [5, 24, 4, 25, 25, 5]],
    "Археспора": [{ athletics: 8, brawling: 9, awareness: 9, wildernessSurvival: 8, intimidation: 9, physique: 8, stealth: 10, resistMagic: 10, endurance: 10, courage: 10, dodgeEscape: 12, melee: 12 }, [5, 18, 3, 25, 25, 5]],
    "Игоша": [{ athletics: 17, brawling: 15, awareness: 14, wildernessSurvival: 10, intimidation: 14, physique: 15, stealth: 16, resistMagic: 15, endurance: 14, courage: 16, dodgeEscape: 16, melee: 16 }, [6, 21, 4, 30, 60, 6]],
    "Вендиго": [{ athletics: 19, brawling: 16, awareness: 16, wildernessSurvival: 18, intimidation: 17, hexWeaving: 17, physique: 18, stealth: 19, resistMagic: 18, endurance: 19, courage: 18, dodgeEscape: 16, melee: 20 }, [10, 27, 5, 50, 100, 10]]
  };
  for (const [name, [skills, derived]] of Object.entries(printed)) {
    const actor = creature(name), stats = actor.system.statistics;
    for (const [key, value] of Object.entries(skills)) assert.equal(base(actor, key), value, `${name}: ${key}`);
    assert.deepEqual([stats.stun, stats.run, stats.leap, actor.system.stamina.max, actor.system.health.max, stats.recovery], derived, name);
  }
  assert.deepEqual(["Медведь", "Вепрь", "Пантера", "Археспора", "Игоша", "Вендиго"].map(name => creature(name).system.creature.naturalArmor), [10, 5, 0, 0, 0, 10]);
  assert.equal(creature("Медведь").system.creature.resistances, "Д");
});

test("sidebar variants keep their parent's statblock and change only what the book lists", () => {
  const giant = creature("Гигантский медведь"), war = creature("Боевой вепрь"), big = creature("Большая кошка");
  assert.deepEqual([giant.system.creature.naturalArmor, giant.system.creature.resistances, base(giant, "melee")], [14, "К, Р, Д", 17]);
  assert.deepEqual([war.system.creature.naturalArmor, weapon(war, "Удар клыками").damage, base(war, "melee")], [10, "4d6", 15]);
  assert.deepEqual([chargeProfile("boar").modifier, chargeProfile("war-boar").modifier, chargeProfile("boar").damage], [-2, 0, "5d6"]);
  assert.deepEqual([big.system.creature.naturalArmor, weapon(big, "Укус").damage, weapon(big, "Удар когтями").damage, base(big, "melee")], [5, "5d6+4", "3d6+2", 17]);
  assert.match(weapon(big, "Удар когтями").properties, /Сбалансированное/u);
  assert.equal(weaponHitTraits(weapon(big, "Укус")).bleeding, 50);
  assert.equal(weaponHitTraits(weapon(creature("Зелёная археспора"), "Укус")).poisoned, 50);
  const purple = creatureModeModifiers(creature("Пурпурная археспора")).filter(modifier => modifier.label === "Пурпурная археспора");
  assert.deepEqual(purple.map(modifier => [modifier.target, modifier.value]), [["combat.attack", 2], ["combat.defense", 2]]);
});

test("printed attacks: crushing bear blows, the archespore's acid and the diseased wendigo", () => {
  const bear = creature("Медведь"), bite = weaponHitTraits(weapon(bear, "Укус"));
  assert.deepEqual([bite.noParry, bite.wearMultiplier, bite.bleeding], [true, 2, 75]);
  assert.deepEqual([weapon(bear, "Укус").damage, weapon(bear, "Удар когтями").damage, weapon(bear, "Удар когтями").attackRate], ["8d6", "4d6+5", 2]);
  const spit = weapon(creature("Археспора"), "Плевок кислотой"), acid = weaponHitTraits(spit);
  assert.equal(base(creature("Археспора"), spit.skill) + spit.accuracy, 10);
  assert.deepEqual([spit.range, acid.ablating, acid.ablationDice, acid.blockWear], [8, true, null, "floor(1d6 / 2)"]);
  const wendigo = creature("Вендиго");
  assert.deepEqual([weaponHitTraits(weapon(wendigo, "Укус")).diseased, weaponHitTraits(weapon(wendigo, "Удар когтями")).diseased, weaponHitTraits(weapon(wendigo, "Удар когтями")).bleeding], [60, 25, 50]);
  const botchling = weapon(creature("Игоша"), "Укус");
  assert.match(botchling.properties, /Улучшенное пробивающее броню/u);
});

test("archespores are rooted and fire-vulnerable; the wendigo ignores snow, mind magic, frost and disease", () => {
  const plant = creature("Археспора");
  assert.ok(plant.items.some(item => item.system.ruleId === "creature.rooted"));
  assert.ok(plant.items.some(item => item.system.ruleId === "creature.fire-vulnerable"));
  assert.equal(immuneToCondition(plant, ["poisoned"]), true);
  const wendigo = creature("Вендиго"), bear = creature("Медведь");
  const scene = { flags: { [SYSTEM_ID]: { environment: { light: "day", terrain: "snow" } } }, environment: { darknessLevel: 0 } }, token = { regions: [] };
  assert.equal(actorEnvironment(wendigo, scene, token).terrain.id, "normal");
  assert.equal(actorEnvironment(bear, scene, token).terrain.id, "snow");
  assert.ok(creatureMentalImmunity(wendigo, { mental: true }));
  assert.deepEqual(["frozen", "diseased"].map(id => immuneToCondition(wendigo, [id])), [true, true]);
});

test("the botchling's battle form adds +2 REF/DEX/SPD and +3 BODY and unlocks its claws; a chur is incorporeal", () => {
  const botchling = creature("Игоша"), claws = botchling.items.find(item => item.name === "Удар когтями");
  assert.match(creatureWeaponBlocked(botchling, claws), /боевой форме/u);
  botchling.system.creature.battleForm = true;
  assert.equal(creatureWeaponBlocked(botchling, claws), "");
  const form = creatureModeModifiers(botchling).filter(modifier => modifier.label === "Боевая форма игоши");
  assert.deepEqual(form.map(modifier => [modifier.target, modifier.value]), [["attributes.reflex", 2], ["attributes.dexterity", 2], ["attributes.speed", 2], ["attributes.body", 3]]);
  assert.equal(spiritState(botchling).incorporeal, false);
  botchling.system.creature.chur = true;
  assert.equal(spiritState(botchling).incorporeal, true);
});

test("beast and cursed loot resolves to the printed components", () => {
  const harvest = name => bestiarySources().find(actor => actor.name === name).system.harvest.map(row => harvestItemName(row.uuid));
  assert.deepEqual(harvest("Медведь"), ["Кости животных", "Медвежий жир", "Медвежья шкура", "Сырое мясо"]);
  assert.deepEqual(harvest("Вепрь"), ["Клыки вепря", "Сырое мясо", "Шкура вепря"]);
  assert.deepEqual(harvest("Пантера"), ["Кости животных", "Сырое мясо", "Шкура пантеры"]);
  assert.deepEqual(harvest("Археспора"), ["Сок археспоры", "Усики археспоры"]);
  assert.deepEqual(harvest("Игоша"), ["Кости игоши", "Кровь игоши", "Мозг игоши", "Ухо игоши"]);
  assert.deepEqual(harvest("Вендиго"), ["Кристаллическая эссенция", "Мех вендиго", "Сердце вендиго"]);
  const hide = SCHOOL_MATERIALS.find(entry => entry.id === "material.bear-hide").system;
  assert.deepEqual([hide.weight, hide.price, hide.material.substance], [6, 30, ""]);
  assert.deepEqual(JOURNAL_MATERIALS.filter(entry => /вендиго/u.test(entry.name)).map(entry => [entry.name, entry.system.material.substance, entry.system.price]),
    [["Мех вендиго", "fulgur", 76], ["Сердце вендиго", "aether", 167]]);
});
