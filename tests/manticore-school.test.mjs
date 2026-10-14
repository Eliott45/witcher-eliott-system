import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MANTICORE_EQUIPMENT, MANTICORE_RECIPES, MANTICORE_FOLDER } from "../scripts/data/manticore-school.mjs";
import { blankCreation, creationUpdate, witcherRow } from "../scripts/data/character-creation.mjs";
import { creationContext } from "../scripts/sheets/creation-context.mjs";
import { defenseQuote } from "../scripts/combat/defense-rolls.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { freeShieldDraw, handActionError } from "../scripts/combat/shield-master.mjs";
import { weaponDamageTraits, resolveDamage } from "../scripts/combat/damage-rules.mjs";
import { bombThrowQuote } from "../scripts/combat/bombs.mjs";
import { recipeRelations } from "../scripts/data/recipe-links.mjs";
import { materialPlan, equipmentUuid } from "../scripts/data/workshop.mjs";
import { repairDC, disassemblyYield } from "../scripts/workshop/repair.mjs";

const owned = entry => ({ id: entry.documentId, name: entry.name, type: entry.type, system: { ...structuredClone(entry.system), ruleId: entry.id, equipped: true, carried: true, quantity: 1 } });
function fixture() {
  const shield = owned(MANTICORE_EQUIPMENT[0]), sword = { id: "sword", name: "Меч", type: "weapon", system: { category: "melee", skill: "swordsmanship", hands: 1, equipped: true, carried: true, quantity: 1 } };
  const items = [shield, sword]; items.get = id => items.find(item => item.id === id);
  const actor = { type: "character", isOwner: true, items, effects: [], system: { details: { race: "witcher" }, lifepath: { witcher: { school: "manticore" } },
    skills: { melee: 5, swordsmanship: 5, athletics: 4 }, stamina: { value: 20 }, statistics: { effective: { body: 7, reflex: 8, dexterity: 7 }, modifiers: [] } } };
  return { actor, shield, sword };
}

test("Manticore can be selected and saved in creation without changing core random-school bands", () => {
  const state = { ...blankCreation(), race: "witcher", profession: "witcher" }; state.witcher.school = "manticore";
  const school = creationContext(state).origin.witcherTables.find(row => row.key === "school");
  assert.equal(school.chosen, "Школа Мантикоры");
  assert.match(school.rows.find(row => row.chosen).text, /Мастер щита/);
  assert.equal(creationUpdate(state)["system.lifepath.witcher"].school, "manticore");
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => witcherRow("school", i + 1)), ["wolf", "wolf", "griffin", "griffin", "cat", "cat", "viper", "viper", "bear", "bear"]);
});

test("Shieldmaster removes only shield parry penalties, including thrown weapons, and preserves other restrictions", () => {
  const { actor, shield, sword } = fixture();
  const parry = incoming => defenseQuote(actor, { mode: "parry", itemId: shield.id, incoming });
  for (const incoming of ["melee", "thrown"]) { assert.equal(parry(incoming).penalty, 0); assert.equal(parry(incoming).total, 13); assert.equal(parry(incoming).blocked, ""); }
  assert.match(parry("melee").math, /Мастер щита/);
  assert.match(parry("ranged").blocked, /стрелы и болты/);
  assert.equal(defenseQuote(actor, { mode: "parry", itemId: sword.id }).penalty, -3);
  shield.system.equipped = false; assert.match(parry("melee").blocked, /руки/); shield.system.equipped = true;
  shield.system.reliability.value = 0; assert.match(parry("melee").blocked, /сломано/); shield.system.reliability.value = 20;
  actor.system.lifepath.witcher.school = "wolf";
  assert.equal(parry("melee").penalty, -3); assert.equal(parry("thrown").penalty, -5);
  actor.system.lifepath.witcher.school = "manticore"; actor.system.details.race = "human";
  assert.equal(parry("melee").penalty, -3);
});

test("a shield hand is free only for Manticore signs, bombs and potions, with disabled arms and stowed shields respected", () => {
  const { actor, shield, sword } = fixture();
  assert.equal(freeShieldDraw(actor, shield), true); assert.equal(freeShieldDraw(actor, sword), false);
  const actions = ["sign", "bomb", "potion"];
  for (const action of actions) assert.equal(handActionError(actor, action), "");
  const bomb = { system: { quantity: 1 } };
  assert.equal(bombThrowQuote(actor, bomb, 5).blocked, "");
  actor.system.lifepath.witcher.school = "wolf";
  for (const action of actions) assert.match(handActionError(actor, action), /свободная рука/);
  assert.match(bombThrowQuote(actor, bomb, 5).blocked, /свободная рука/);
  assert.equal(freeShieldDraw(actor, shield), false);
  actor.system.lifepath.witcher.school = "manticore";
  actor.system.statistics.modifiers = [{ target: "hands", value: -1 }];
  assert.match(handActionError(actor, "sign"), /свободная рука/);
  sword.system.equipped = false; assert.equal(handActionError(actor, "sign"), "");
  actor.system.statistics.modifiers[0].value = -2; assert.match(handActionError(actor, "sign"), /свободная рука/);
  actor.system.statistics.modifiers = []; shield.system.equipped = false; sword.system.equipped = true; sword.system.hands = 2;
  assert.match(handActionError(actor, "sign"), /свободная рука/);
});

test("Manticore shield strikes use the chosen medium class and the existing silver/meteorite damage rules", () => {
  const { actor, shield } = fixture(), quote = weaponAttack(actor, shield);
  assert.equal(quote.blocked, ""); assert.equal(quote.damage, "(1d6 + 6)");
  const traits = weaponDamageTraits(shield.system), armor = { sp: 0, layers: [], resistances: [] };
  assert.equal(traits.silverDice, "3d6"); assert.equal(traits.meteorite, true); assert.deepEqual(traits.types, ["bludgeoning"]);
  const hit = monsterMaterial => resolveDamage({ base: 10, silver: 9, multiplier: 1, traits, armor, monsterMaterial }).total;
  assert.equal(hit("silver"), 19); assert.equal(hit("meteorite"), 10); assert.equal(hit(null), 10);
});

test("the DLC folder and diagram link to real items, spend exact ingredients and support repair/disassembly", async () => {
  const documents = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8")).map(item => ({ ...item, id: item._id, uuid: equipmentUuid(item._id) }));
  const shield = documents.find(item => item.system.ruleId === MANTICORE_EQUIPMENT[0].id), diagram = documents.find(item => item.system.ruleId === MANTICORE_RECIPES[0].id);
  for (const item of [shield, diagram]) { assert.equal(item.folder, MANTICORE_FOLDER.id); assert.match(item.system.source, /Школа Мантикоры/); }
  assert.equal(shield.system.reliability.max, 20); assert.equal(shield.system.weight, 2); assert.equal(shield.system.enhancementSlots, 1); assert.equal(shield.system.encumbrance, 0);
  assert.equal(diagram.system.price, 1304);
  const recipe = diagram.system.recipe;
  assert.equal(recipe.resultUuid, shield.uuid); assert.equal(recipe.time, 28800); assert.equal(recipe.dc, 20); assert.equal(recipe.investment, 652); assert.equal(recipe.grade, "master");
  assert.equal(recipeRelations(shield, documents).recipes[0].id, diagram.id);
  const references = new Map(documents.map(item => [item.uuid, item]));
  const ingredients = recipe.components.map(row => { const item = references.get(row.uuid); assert.ok(item); assert.ok(recipeRelations(item, documents).uses.some(use => use.document.id === diagram.id)); return { ...item, system: { ...item.system, quantity: row.quantity, carried: true } }; });
  assert.deepEqual(ingredients.map(item => [item.system.ruleId, item.system.quantity]), [["material.hardened-leather", 2], ["material.hardened-timber", 4], ["material.meteorite", 3], ["material.silver", 2], ["material.etching-acid", 2], ["material.ester-grease", 2], ["material.river-clay", 6]]);
  const plan = materialPlan(ingredients, recipe.components, references);
  assert.equal(plan.complete, true); assert.equal(plan.expenses.length, 7);
  assert.equal(repairDC(recipe, shield), 15);
  assert.deepEqual(disassemblyYield(recipe.components).map(row => row.quantity), [1, 2, 1, 1, 1, 1, 3]);
});
