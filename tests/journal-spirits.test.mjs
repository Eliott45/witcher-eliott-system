import test from "node:test";
import assert from "node:assert/strict";
import { bestiarySources, harvestItemName } from "../scripts/data/bestiary.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue, SKILL_KEYS } from "../scripts/data/skills.mjs";
import { immuneToCondition } from "../scripts/data/creatures.mjs";
import { ALL_SKILL_KEYS, CONDITION_BY_ID } from "../scripts/data/condition-definitions.mjs";
import { creatureInvisible, creatureModeModifiers } from "../scripts/data/creature-modes.mjs";
import { spiritState, hymShadow } from "../scripts/combat/creature-spirits.mjs";
import { armorAt, resolveDamage } from "../scripts/combat/damage-rules.mjs";
import { weaponHitTraits } from "../scripts/combat/weapon-hit-effects.mjs";
import { JOURNAL_MATERIALS } from "../scripts/data/journal-materials.mjs";
import { SUBSTANCES } from "../scripts/data/workshop.mjs";
import { journalMaterialUpdate } from "../scripts/migrations/equipment-content.mjs";
import { journalCreatureRefresh } from "../scripts/migrations/bestiary-content.mjs";

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

test("hym, pesta and the plague rat swarm reproduce the printed bases and derived statistics", () => {
  const printed = {
    "Хим": { athletics: 17, brawling: 16, awareness: 17, wildernessSurvival: 14, intimidation: 17, physique: 15, stealth: 18, resistMagic: 17, resistCoercion: 18, persuasion: 17, courage: 18, dodgeEscape: 16 },
    "Песта": { athletics: 14, brawling: 10, awareness: 9, wildernessSurvival: 8, intimidation: 14, physique: 10, stealth: 11, resistMagic: 15, dodgeEscape: 18, melee: 16 },
    "Стая чумных крыс": { melee: 14, dodgeEscape: 16 }
  };
  for (const [name, skills] of Object.entries(printed)) {
    const actor = creature(name);
    for (const [key, value] of Object.entries(skills)) assert.equal(base(actor, key), value, `${name}: ${key}`);
  }
  const derived = actor => { const stats = actor.system.statistics; return [stats.stun, stats.run, stats.leap, actor.system.stamina.max, actor.system.health.max, stats.recovery]; };
  assert.deepEqual(derived(creature("Хим")), [9, 15, 3, 45, 90, 9]);
  assert.deepEqual(derived(creature("Песта")), [8, 21, 4, 40, 80, 8]);
  const rats = creature("Стая чумных крыс");
  assert.deepEqual([rats.system.health.max, rats.system.statistics.effective.speed], [10, 5]);
  const hym = creature("Хим").items.find(item => item.type === "weapon").system, pesta = creature("Песта").items.find(item => item.type === "weapon").system;
  assert.deepEqual([hym.damage, hym.attackRate, weaponHitTraits(hym).shadowDrain], ["5d6", 2, "2d6"]);
  assert.match(hym.properties, /Длинное/u);
  assert.deepEqual([pesta.damage, pesta.attackRate, weaponHitTraits(pesta).diseased], ["4d6", 2, 50]);
});

test("the basic barghest gains its printed reward, size, habitat, group and senses", () => {
  const barghest = creature("Баргест"), creatureData = barghest.system.creature;
  assert.deepEqual([creatureData.difficulty, creatureData.reward, creatureData.size, creatureData.weight, creatureData.habitat, creatureData.intellect, creatureData.group],
    ["Простые / незаурядные", 30, "1 м", "40 кг", "Возле поселений", "Дикий", "Группы из 3–5 особей"]);
  assert.ok(barghest.items.some(item => item.system.ruleId === "creature.night-vision"));
  assert.ok(barghest.items.some(item => item.name === "Выслеживание по запаху"));
  assert.equal(creature("Кай").system.creature.reward, 0, "Kai's own statblock is untouched");
});

test("disease gives −2 to every action and a quarter less STA; immune creatures and witchers never catch it", () => {
  assert.deepEqual(ALL_SKILL_KEYS, SKILL_KEYS);
  const rules = CONDITION_BY_ID.diseased.rules.modifiers;
  assert.ok(SKILL_KEYS.every(key => rules.some(modifier => modifier.target === `skills.${key}` && modifier.value === -2)));
  assert.ok(rules.some(modifier => modifier.target === "staminaMax" && modifier.factor === 0.75));
  for (const name of ["Баргест", "Хим", "Песта"]) assert.equal(immuneToCondition(creature(name), ["diseased"]), true, name);
  assert.equal(immuneToCondition(creature("Волк"), ["diseased"]), false);
  const character = race => ({ type: "character", items: [], effects: [], system: { details: { race }, abilityState: {} } });
  assert.equal(immuneToCondition(character("witcher"), ["diseased"]), true);
  assert.equal(immuneToCondition(character("human"), ["diseased"]), false);
  const hym = creature("Хим");
  assert.deepEqual(["frozen", "prone", "bleeding", "poisoned"].map(id => immuneToCondition(hym, [id])), [true, true, true, true]);
});

test("in shadow the hym is incorporeal and invisible with +10 to attack, +5 once found; fire and the GM switch it off", () => {
  const hym = creature("Хим");
  assert.equal(hymShadow(hym), false, "no scene: not in darkness");
  hym.system.creature.shadowMode = "active";
  assert.deepEqual([hymShadow(hym), spiritState(hym).incorporeal, creatureInvisible(hym)], [true, true, true]);
  const attack = () => creatureModeModifiers(hym).filter(modifier => modifier.target === "combat.attack").map(modifier => modifier.value);
  assert.deepEqual(attack(), [10]);
  hym.flags[SYSTEM_ID] = { hymLocated: "" };
  assert.deepEqual(attack(), [5]);
  hym.system.creature.invisibilityEpoch = "moved";
  assert.deepEqual(attack(), [10], "moving makes the mage search again");
  const blow = resolveDamage({ base: 30, location: "torso", multiplier: 1, traits: { types: ["slashing"], piercing: "none", silver: false }, armor: armorAt(hym, "torso"), monster: true });
  assert.deepEqual([blow.total, blow.immune], [0, true]);
  hym.effects.push({ statuses: new Set(["creature-yrden"]), flags: { [SYSTEM_ID]: { creatureSuppression: { kind: "yrden" } } } });
  assert.equal(spiritState(hym).incorporeal, true, "Yrden does not cancel the shadow body");
  globalThis.game = { combat: { id: "combat", started: true, round: 3 }, time: { worldTime: 0 } };
  hym.flags[SYSTEM_ID].hymIgnited = { combatId: "combat", round: 3 };
  assert.equal(hymShadow(hym), false, "a fire attack this round lights it up");
  game.combat.round = 4; assert.equal(hymShadow(hym), true);
  delete globalThis.game;
  hym.system.creature.shadowMode = "off"; assert.equal(hymShadow(hym), false);
});

test("journal components carry the printed substance, weight and price and bestiary loot points at them", () => {
  const ids = new Set(SUBSTANCES.map(substance => substance.id));
  for (const material of JOURNAL_MATERIALS) assert.ok(ids.has(material.system.material.substance) || /шкура/iu.test(material.name), material.name);
  assert.deepEqual(JOURNAL_MATERIALS.slice(0, 5).map(entry => [entry.name, entry.system.price]), [["Зубы туманника", 40], ["Эссенция туманника", 43], ["Печень гнильца", 42], ["Эссенция баргеста", 36], ["Кристаллическая эссенция", 292]]);
  const harvest = name => bestiarySources().find(actor => actor.name === name).system.harvest.map(row => harvestItemName(row.uuid));
  assert.deepEqual(harvest("Утковол"), ["Глаза утковола", "Кровь утковола", "Мозг утковола", "Полотно"]);
  assert.deepEqual(harvest("Хим"), ["Изумрудная пыль", "Кристаллическая эссенция", "Призрачная пыль", "Руна Велес", "Эссенция призрака"]);
  assert.deepEqual(harvest("Песта"), ["Кристаллическая эссенция", "Призрачная пыль", "Эссенция призрака"]);
  const placeholder = { system: { ruleId: "material.rotfiend-blood", price: 0, weight: 0 } };
  assert.deepEqual(journalMaterialUpdate(placeholder)["system.price"], 30);
  assert.deepEqual(journalMaterialUpdate({ system: { ruleId: "material.rotfiend-blood", price: 55, weight: 0 } }), {}, "a GM price is kept");
  assert.deepEqual(journalMaterialUpdate({ system: { ruleId: "material.emerald-dust", price: 0, weight: 0 } }), {}, "unpriced in the book");
});

test("bestiary v8 turns an old journal creature's text loot into harvest rows and fills only blank fields", () => {
  const source = bestiarySources().find(actor => actor.name === "Баргест"), old = structuredClone(source);
  old.system.creature.loot = source.system.harvest.map(row => ({ name: harvestItemName(row.uuid), formula: row.formula || String(row.quantity), currency: false }));
  old.system.harvest = [];
  Object.assign(old.system.creature, { difficulty: "", reward: 0, size: "", weight: "", habitat: "", intellect: "", group: "Стая" });
  old.items = old.items.slice(0, 11).map(item => ({ ...item, id: item._id }));
  const plan = journalCreatureRefresh(old, source);
  assert.deepEqual(plan.update["system.harvest"].map(row => row.uuid), source.system.harvest.map(row => row.uuid));
  assert.deepEqual(plan.update["system.creature.loot"], []);
  assert.deepEqual([plan.update["system.creature.reward"], plan.update["system.creature.group"], plan.update["system.creature.habitat"]], [30, "Группы из 3–5 особей", "Возле поселений"]);
  assert.deepEqual(plan.items.map(item => item.name), ["Ночное зрение", "Выслеживание по запаху"]);
  old.system.creature.reward = 99; old.system.creature.group = "Своя стая";
  const edited = journalCreatureRefresh(old, source);
  assert.equal(edited.update["system.creature.reward"], undefined); assert.equal(edited.update["system.creature.group"], undefined);
  assert.equal(journalCreatureRefresh(structuredClone(source), source), null, "a current actor needs nothing");
  assert.equal(journalCreatureRefresh(old, bestiarySources().find(actor => actor.name === "Волк")), null, "core creatures are not touched");
});
