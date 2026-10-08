import test from "node:test";
import assert from "node:assert/strict";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { deriveStatistics, ATTRIBUTE_KEYS } from "../scripts/data/statistics.mjs";
import { equippedItems } from "../scripts/data/physical-items.mjs";
import { layeringPlan } from "../scripts/data/armor-layers.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { armorAt, resolveDamage, weaponDamageTraits } from "../scripts/combat/damage-rules.mjs";
import { sufferDamage } from "../scripts/combat/attack-exchange.mjs";
import { burningDamage } from "../scripts/combat/burning.mjs";
import { poisonDamage, bleedingDamage, startTurnPoison } from "../scripts/combat/poison-damage.mjs";
import { immuneToCondition } from "../scripts/data/creatures.mjs";
import { castingQuote } from "../scripts/magic/casting.mjs";
import { spellTraits } from "../scripts/magic/spell-strikes.mjs";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { equipItem } from "../scripts/sheets/inventory-context.mjs";
import { moveItemToContainer } from "../scripts/sheets/container-actions.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

function patch(target, changes) {
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split("."), last = keys.pop();
    keys.reduce((object, key) => object[key] ??= {}, target)[last] = value;
  }
}
function fixture(rule) {
  const source = WITCHER_SPECIAL_EQUIPMENT.find(item => item.id === rule), messages = [];
  assert.ok(source, rule);
  const actor = { id: "hero", uuid: "Actor.hero", name: "Воин", type: "character", isOwner: true, flags: {}, effects: [], items: [],
    system: { attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 8])), health: { value: 40, max: 65 }, stamina: { value: 40, max: 40 }, vigor: 20,
      skills: { courage: 5, resistMagic: 5, spellCasting: 5 }, abilityState: {}, details: { race: "human", profession: "mage" },
      magic: { roundKey: "", spent: 0, sustainedId: "", maintainedRound: "", sustainedCost: 0 } },
    async update(changes) { patch(this, changes); },
    async updateEmbeddedDocuments(_type, changes) { for (const change of changes) await this.items.get(change._id).update(change); },
    async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(effect => !ids.includes(effect.id)); }
  };
  const add = (data, id) => {
    const item = { ...structuredClone(data), id, uuid: `${actor.uuid}.Item.${id}`, parent: actor,
      system: { quantity: 1, carried: true, equipped: false, containerId: "", installations: [], ...structuredClone(data.system) },
      async update(changes) { patch(this, changes); } };
    actor.items.push(item); return item;
  };
  const armor = add({ ...source, system: { ...source.system, ruleId: rule } }, "armor");
  actor.items.get = id => actor.items.find(item => item.id === id);
  Object.defineProperty(actor.system, "statistics", { get: () => deriveStatistics(actor.system, { items: actor.items, effects: actor.effects }) });
  const gm = { id: "gm", isGM: true };
  globalThis.game = { user: gm, users: { activeGM: gm }, settings: { get: () => "public" }, time: { worldTime: 0 } };
  globalThis.ui = { notifications: { warn() {}, info() {} } };
  globalThis.foundry = { documents: {
    ActiveEffect: { registry: { refresh: async () => {} } },
    ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }), create: async data => { messages.push(data); return data; } }
  } };
  const equip = item => equipItem.call({ actor, isEditable: true }, null, { dataset: { itemId: item.id } });
  return { actor, armor, equip, add, messages };
}
const status = id => ({ id, statuses: new Set([id]), flags: {} });
const hit = (actor, base, damageType = "Р", properties = "", location = "torso") => resolveDamage({ base, location, multiplier: 1,
  traits: weaponDamageTraits({ damageType, properties }), armor: armorAt(actor, location) });

test("relic wearer bonuses follow actual equip, unequip, carrying and container moves", async () => {
  for (const [rule, hp] of [["armor.raven", 15], ["armor.mountain-folk", 0], ["armor.draug", 25]]) {
    const { actor, armor, equip, add } = fixture(rule);
    assert.equal(actor.system.statistics.healthMax, 40);
    await equip(armor);
    assert.equal(actor.system.statistics.healthMax, 40 + hp);
    assert.ok(armorAt(actor, "torso").sp > 0);
    actor.effects = [status("poisoned"), status("bleeding")];
    assert.equal(poisonDamage(actor), 1);
    assert.equal(bleedingDamage(actor), rule === "armor.mountain-folk" ? 2 : 1);
    await equip(armor);
    assert.equal(actor.system.statistics.healthMax, 40);
    assert.equal(armorAt(actor, "torso").sp, 0);
    assert.equal(poisonDamage(actor), 3); assert.equal(bleedingDamage(actor), 2);
    await equip(armor);
    await armor.update({ "system.carried": false });
    assert.equal(actor.system.statistics.healthMax, 40);
    assert.equal(armorAt(actor, "torso").sp, 0);
    await armor.update({ "system.carried": true });
    const bag = add({ type: "equipment", name: "Сумка", system: { kind: "container" } }, "bag");
    await moveItemToContainer(actor, armor.id, bag.id);
    assert.equal(armor.system.equipped, false);
    assert.equal(actor.system.statistics.healthMax, 40);
    // Invalid imported equipped=true must not make packed armor active either.
    armor.system.equipped = true;
    assert.equal(armorAt(actor, "torso").sp, 0);
    assert.equal(actor.system.statistics.healthMax, 40);
  }
});

test("identical relic copies never double armor or bonuses, and re-equipping cleans up imported duplicates", async () => {
  for (const rule of ["armor.raven", "armor.mountain-folk", "armor.draug"]) {
    const { actor, armor, equip, add } = fixture(rule);
    await equip(armor);
    const expected = actor.system.statistics.healthMax;
    const copy = add({ type: "armor", name: armor.name, system: structuredClone(armor.system) }, "copy");
    assert.equal(equippedItems(actor.items).length, 1);
    assert.equal(armorAt(actor, "torso").sp, armor.system.stoppingPower.value);
    assert.equal(actor.system.statistics.healthMax, expected);
    const third = add({ type: "armor", name: armor.name, system: { ...structuredClone(armor.system), equipped: false } }, "third");
    await equip(third);
    assert.equal(armor.system.equipped, false); assert.equal(copy.system.equipped, false);
    assert.equal(third.system.equipped, true);
    assert.equal(actor.system.statistics.healthMax, expected);
    await equip(third);
    assert.equal(equippedItems(actor.items).length, 0);
  }
});

test("different relics and ordinary armor still layer with each suit's bonuses counted once", async () => {
  const { actor, armor, equip, add } = fixture("armor.raven");
  await equip(armor);
  const draugSource = WITCHER_SPECIAL_EQUIPMENT.find(item => item.id === "armor.draug");
  const draug = add({ ...draugSource, system: { ...draugSource.system, ruleId: draugSource.id } }, "draug");
  assert.deepEqual(layeringPlan(draug, equippedItems(actor.items)).replace, []);
  await equip(draug);
  assert.equal(actor.system.statistics.healthMax, 80);
  assert.equal(actor.system.statistics.skillBonuses.courage, 3);
  assert.equal(actor.system.statistics.encumbrance, 5, "Draug EV3 plus heavy layering EV2, once for its whole suit");
  assert.equal(armorAt(actor, "torso").sp, 36);
  const ordinary = add({ type: "armor", name: "Гамбезон", system: { zone: "torso", armorClass: "light", stoppingPower: { value: 3, max: 3 } } }, "gambeson");
  assert.equal(layeringPlan(ordinary, equippedItems(actor.items)).blocked, "");
  await equip(ordinary);
  assert.equal(actor.system.statistics.healthMax, 80);
  assert.equal(equippedItems(actor.items).length, 3);
});

test("Draug +2 reaches real casting checks and Resist Magic, while its EV3 remains a separate penalty", async () => {
  const { actor, armor, equip, add } = fixture("armor.draug");
  const entry = CORE_MAGIC.find(spell => spell.id === "spell.aenye");
  const spell = add({ type: "spell", name: entry.name, system: entry.system }, "spell");
  const naked = castingQuote(actor, spell).skill.total;
  await equip(armor);
  assert.equal(castingQuote(actor, spell).skill.total, naked + 2 - 3);
  assert.equal(skillValue(actor.system, "resistMagic").total, 8 + 5 + 2);
  armor.system.wearerBonuses = armor.system.wearerBonuses.filter(bonus => bonus.target !== "skills.spellCasting");
  assert.equal(castingQuote(actor, spell).skill.total, naked - 3);
});

test("Mountain Folk resistance halves penetration, piercing bypasses resistance and wear hits the single suit once", async () => {
  const { actor, armor, equip } = fixture("armor.mountain-folk");
  await equip(armor);
  for (const damageType of ["Р", "К", "Д", "Р/К/Д"]) assert.equal(hit(actor, 35, damageType).total, 5);
  assert.equal(hit(actor, 35, "К", "Пробивающее броню").total, 11);
  assert.equal(hit(actor, 35, "К", "Улучшенное пробивающее броню").total, 23);
  const blocked = hit(actor, 24);
  assert.deepEqual(blocked.ablate, []);
  await sufferDamage(actor, blocked);
  assert.equal(armor.system.stoppingPower.value, 24);
  const result = hit(actor, 35, "Р", "", "leftArm");
  assert.deepEqual(result.ablate, [armor.id]);
  await sufferDamage(actor, result);
  assert.equal(actor.system.health.value, 35);
  assert.equal(armor.system.stoppingPower.value, 23);
  for (const part of ["head", "torso", "leftArm", "rightLeg"]) assert.equal(armorAt(actor, part).sp, 23);
});

test("Draug fire resistance halves fire only, including generic fire, without immunity or other elemental resistance", async () => {
  const { actor, armor, equip } = fixture("armor.draug");
  await equip(armor);
  assert.equal(hit(actor, 47, "С").total, 5);
  for (const [element, rule, expected] of [["fire", "spell.aenye", 5], ["air", "spell.alzur-thunder", 11], ["earth", "spell.rock-barrage", 11], ["water", "spell.ice", 11], ["air", "spell.zephyr", 11], ["mixed", "spell.pure", 11]]) {
    const result = resolveDamage({ base: 47, location: "torso", multiplier: 1, traits: spellTraits(element, rule), armor: armorAt(actor, "torso") });
    assert.equal(result.total, expected, `${element}: ${rule}`);
  }
  assert.equal(immuneToCondition(actor, ["burning", "poisoned", "bleeding"]), false);
  armor.system.stoppingPower.value = 2;
  actor.effects = [status("burning")];
  assert.equal(burningDamage(actor).total, 6, "each part takes floor((5 − 2) / 2), with no location multiplier");
});

test("start of turn applies resisted poison, bleeding and fire, then burns one armor suit once", async () => {
  const { actor, armor, equip, messages } = fixture("armor.draug");
  await equip(armor);
  armor.system.stoppingPower.value = 2;
  actor.effects = [status("poisoned"), status("bleeding"), status("burning")];
  assert.equal(poisonDamage(actor), 1); assert.equal(bleedingDamage(actor), 1);
  const combat = { uuid: "Combat.relic", started: true, round: 2, turn: 0, previous: { round: 1, turn: 0 } };
  await startTurnPoison(combat, { id: "hero", actor }, { round: 2, turn: 0 });
  assert.equal(actor.system.health.value, 32);
  assert.equal(armor.system.stoppingPower.value, 1);
  assert.equal(messages.length, 1);
  assert.deepEqual([messages[0].flags[SYSTEM_ID].poisonDamage.poison, messages[0].flags[SYSTEM_ID].poisonDamage.bleeding, messages[0].flags[SYSTEM_ID].poisonDamage.burning], [1, 1, 6]);
  await startTurnPoison(combat, { id: "hero", actor }, { round: 2, turn: 0 });
  assert.equal(actor.system.health.value, 32);
  assert.equal(armor.system.stoppingPower.value, 1);
});
