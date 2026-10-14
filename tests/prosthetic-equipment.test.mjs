import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BASIC_PROSTHESIS, PROSTHETIC_EQUIPMENT, PROSTHETIC_RECIPES, PROSTHETIC_FOLDER } from "../scripts/data/prosthetic-equipment.mjs";
import { fittedProsthesis, chaosHandError, wheelchairPenalty, wheelchair } from "../scripts/data/prosthetic-rules.mjs";
import { woundEffectData, setProsthesis } from "../scripts/combat/critical-wound-effects.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { materialPlan, equipmentUuid } from "../scripts/data/workshop.mjs";
import { recipeRelations } from "../scripts/data/recipe-links.mjs";
import { unarmedAttack, chooseStrikeLimb } from "../scripts/combat/brawling.mjs";
import { weaponDamageTraits } from "../scripts/combat/damage-rules.mjs";
import { defenseQuote } from "../scripts/combat/defense-rolls.mjs";
import { focusOptions } from "../scripts/magic/rules.mjs";
import { handActionError } from "../scripts/combat/shield-master.mjs";
import { equipItem } from "../scripts/sheets/inventory-context.mjs";
import { mobilityEffectData } from "../scripts/sheets/mobility-editor.mjs";
import { prostheticWoundUpdate } from "../scripts/migrations/effect-content.mjs";
import { prostheticContentUpdate } from "../scripts/migrations/prosthetic-content.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";

const documents = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
const owned = entry => ({ id: entry.documentId, name: entry.name, type: entry.type, system: { ...structuredClone(entry.system), ruleId: entry.id, quantity: 1, carried: true, equipped: false } });
function write(document, updates) { for (const [path, value] of Object.entries(updates)) { const keys = path.split("."); let at = document; for (const key of keys.slice(0, -1)) at = at[key] ??= {}; at[keys.at(-1)] = value; } }
function fixture() {
  const items = []; items.get = id => items.find(item => item.id === id);
  const actor = { id: "qa", uuid: "Actor.qa", type: "character", documentName: "Actor", isOwner: true, items, effects: [],
    system: { attributes: { intelligence: 8, reflex: 8, dexterity: 8, body: 8, speed: 8, empathy: 8, craft: 8, will: 8, luck: 8 }, health: { value: 40, max: 40 }, stamina: { value: 40 },
      details: { profession: "mage", race: "human" }, skills: { brawling: 5, dodgeEscape: 5, athletics: 5, swordsmanship: 5, spellCasting: 6 }, abilityState: {} },
    async updateEmbeddedDocuments(_type, updates) { for (const update of updates) write(items.get(update._id), update); refresh(); } };
  const refresh = () => actor.system.statistics = deriveStatistics(actor.system, { items, effects: actor.effects });
  const add = entry => { const item = owned(entry); item.parent = actor; item.update = async changes => { write(item, changes); refresh(); }; items.push(item); refresh(); return item; };
  const wound = (limb, id = limb.endsWith("Arm") ? "dismembered-arm" : "dismembered-leg", state = "treated") => {
    const effect = { ...woundEffectData(id, "deadly", { location: limb, state }), id: `w${actor.effects.length}`, parent: actor, statuses: new Set() };
    effect.update = async changes => { write(effect, changes); refresh(); }; actor.effects.push(effect); refresh(); return effect;
  };
  refresh(); return { actor, add, wound, refresh };
}

test("original DLC has four prostheses, two chairs, Aether herb and six linked diagrams in one folder", () => {
  const rows = [...PROSTHETIC_EQUIPMENT, BASIC_PROSTHESIS, ...PROSTHETIC_RECIPES];
  assert.equal(rows.length, 13);
  for (const entry of rows) {
    const matches = documents.filter(item => item.system.ruleId === entry.id); assert.equal(matches.length, 1);
    assert.equal(matches[0].folder, PROSTHETIC_FOLDER.id); assert.equal(matches[0].system.source, "Протезы и инвалидные коляски");
    assert.doesNotMatch(matches[0].system.description, /стр\.|Надёжность \d/);
  }
  assert.deepEqual([BASIC_PROSTHESIS.system.weight, ...PROSTHETIC_EQUIPMENT.slice(0, 5).map(item => item.system.weight)], [2, 1, 2, 3, 6, 3]);
  assert.deepEqual(PROSTHETIC_RECIPES.map(item => [item.system.recipe.dc, item.system.recipe.time / 3600, item.system.recipe.investment, item.system.price]),
    [[13,5,38,76],[10,8,375,750],[22,9,600,1200],[24,10,750,1500],[13,5,38,76],[16,8,150,300]]);
  const herb = PROSTHETIC_EQUIPMENT.at(-1).system;
  assert.deepEqual(herb.material, { substance: "aether", forageDC: 12, quantityFormula: "1d10", location: "Поля и болота" });
  assert.deepEqual([herb.weight, herb.price, herb.rarity], [.1, 18, "common"]);
});

test("every diagram resolves both directions, reserves printed materials and catches a shortage", () => {
  const docs = documents.map(item => ({ ...item, id: item._id, uuid: equipmentUuid(item._id) })), refs = new Map(docs.map(item => [item.uuid, item]));
  for (const entry of PROSTHETIC_RECIPES) {
    const recipe = entry.system.recipe, result = refs.get(recipe.resultUuid); assert.ok(result);
    assert.ok(recipeRelations(result, docs).recipes.some(row => row.id === entry.documentId));
    const stock = recipe.components.map(component => { const item = refs.get(component.uuid); assert.ok(item, component.uuid);
      assert.ok(recipeRelations(item, docs).uses.some(row => row.document.system.ruleId === entry.id));
      return { ...item, system: { ...item.system, quantity: component.quantity, carried: true } }; });
    assert.equal(materialPlan(stock, recipe.components, refs).complete, true);
    stock[0].system.quantity--; assert.equal(materialPlan(stock, recipe.components, refs).complete, false);
  }
  assert.equal(materialPlan([owned(PROSTHETIC_EQUIPMENT.at(-1))], [{ substance: "aether", quantity: 1 }]).complete, true);
});

test("fitting requires a treated wound and available stock, restores hands/speed, and removal restores amputation", async () => {
  const f = fixture(), arm = f.wound("rightArm", "dismembered-arm", "fresh"), item = f.add(BASIC_PROSTHESIS);
  await assert.rejects(setProsthesis(arm, item), /вылеченную/);
  arm.flags[SYS].criticalWound.state = "treated"; await setProsthesis(arm, item);
  assert.equal(fittedProsthesis(f.actor, "rightArm").item, item);
  assert.equal(unarmedAttack(f.actor, "punch", { limb: "rightArm" }).total, 10);
  assert.equal(unarmedAttack(f.actor, "punch", { limb: "leftArm" }).total, 13);
  const leg = f.wound("leftLeg"), other = f.add({ ...BASIC_PROSTHESIS, documentId: "other" }); await setProsthesis(leg, other);
  assert.equal(f.actor.system.statistics.effective.speed, 8); assert.equal(skillValue(f.actor.system, "dodgeEscape").total, 12); assert.equal(skillValue(f.actor.system, "athletics").total, 13);
  await assert.rejects(setProsthesis(f.wound("rightLeg"), other), /уже надет/);
  await setProsthesis(leg, null); assert.equal(f.actor.system.statistics.effective.speed, 0); // two missing legs each quarter SPD
  assert.equal(other.system.equipped, false);
});

test("witcher silver belongs only to the chosen fitted limb; ordinary and detached limbs gain nothing", async () => {
  const f = fixture(), item = f.add(PROSTHETIC_EQUIPMENT[1]), wound = f.wound("leftArm"); await setProsthesis(wound, item);
  assert.equal(weaponDamageTraits(unarmedAttack(f.actor, "punch", { limb: "leftArm" }).weapon).silverDice, "1d6");
  assert.equal(weaponDamageTraits(unarmedAttack(f.actor, "punch", { limb: "rightArm" }).weapon).silverDice, "");
  assert.equal(weaponDamageTraits(unarmedAttack(f.actor, "kick").weapon).silverDice, "");
  await setProsthesis(wound, null); assert.match(unarmedAttack(f.actor, "punch", { limb: "leftArm" }).blocked, /недоступна/);
});

test("bare-handed defense uses the selected prosthetic arm and can use the remaining real arm", async () => {
  const f = fixture(), effect = f.wound("leftArm"); await setProsthesis(effect, f.add(BASIC_PROSTHESIS));
  assert.equal(defenseQuote(f.actor, { mode: "block", defendingLimb: "leftArm" }).total, 10);
  assert.equal(defenseQuote(f.actor, { mode: "block", defendingLimb: "rightArm" }).total, 13);
  await setProsthesis(effect, null);
  const quote = defenseQuote(f.actor, { mode: "block" });
  assert.equal(quote.blocked, ""); assert.equal(quote.defendingLimb, "rightArm");
  assert.match(defenseQuote(f.actor, { mode: "block", defendingLimb: "leftArm" }).blocked, /недоступна/);
});

test("magical prosthesis has no penalties, but cannot channel; Manticore shield and high-level gestures keep their exceptions", async () => {
  const f = fixture(); await setProsthesis(f.wound("leftArm"), f.add(PROSTHETIC_EQUIPMENT[0]));
  assert.equal(unarmedAttack(f.actor, "punch", { limb: "leftArm" }).total, 13); assert.equal(chaosHandError(f.actor), "");
  const sword = f.add({ id: "weapon.dagger", documentId: "sword", name: "Кинжал", type: "weapon", system: { hands: 1, grip: 1, category: "melee" } }); sword.system.equipped = true;
  assert.match(handActionError(f.actor, "sign"), /Хаоса/);
  await setProsthesis(f.wound("rightArm"), f.add({ ...PROSTHETIC_EQUIPMENT[0], documentId: "second" }));
  assert.match(chaosHandError(f.actor), /Хаоса/); f.actor.system.skills.spellCasting = 9; assert.equal(chaosHandError(f.actor), "");
  assert.match(handActionError(f.actor, "sign"), /Хаоса/);
  const g = fixture(); g.actor.system.details = { race: "witcher", profession: "witcher" }; g.actor.system.lifepath = { witcher: { school: "manticore" } };
  const shield = g.add({ id: "shield", documentId: "shield", name: "Щит", type: "weapon", system: { category: "shield", hands: 1 } }); shield.system.equipped = true;
  await setProsthesis(g.wound("leftArm"), g.add(PROSTHETIC_EQUIPMENT[0])); assert.equal(handActionError(g.actor, "sign"), "");
});

test("conduit focus needs a fitted active limb; grants Focus 2/Greater Focus and conducts Chaos", async () => {
  const f = fixture(), item = f.add(PROSTHETIC_EQUIPMENT[2]); item.system.equipped = true;
  assert.deepEqual(focusOptions(f.actor), []);
  const effect = f.wound("leftArm"); await setProsthesis(effect, item);
  assert.deepEqual(focusOptions(f.actor), [{ id: item.id, name: item.name, rating: 2, greater: true }]);
  f.wound("rightArm"); assert.equal(chaosHandError(f.actor), "");
  effect.disabled = true; assert.deepEqual(focusOptions(f.actor), []); effect.disabled = false;
  item.system.containerId = "bag"; assert.deepEqual(focusOptions(f.actor), []);
});

test("wheelchair cancels direct and inherited wound mobility penalties but preserves armor and unrelated effects", () => {
  const f = fixture(); f.wound("leftLeg"); f.wound("torso", "concussion", "fresh"); f.wound("torso", "torn-stomach", "fresh");
  f.actor.effects.push({ id: "poison", statuses: new Set(), name: "Другое состояние", flags: { [SYS]: { condition: { modifiers: [{ target: "attributes.speed", value: -1 }, { target: "skills.athletics", value: -2 }] } } } });
  const armor = f.add({ id: "armor", documentId: "armor", type: "armor", system: { zone: "torso", encumbrance: 2 } }); armor.system.equipped = true;
  const chair = f.add(PROSTHETIC_EQUIPMENT[3]); chair.system.equipped = true; f.refresh();
  assert.equal(f.actor.system.statistics.effective.speed, 7);
  assert.equal(f.actor.system.statistics.effective.reflex, 4);
  assert.equal(skillValue(f.actor.system, "dodgeEscape").total, 11); assert.equal(skillValue(f.actor.system, "athletics").total, 9);
  assert.equal(defenseQuote(f.actor, { mode: "dodge" }).total, 11);
  assert.equal(wheelchairPenalty(f.actor, "swimming"), -3); assert.equal(wheelchairPenalty(f.actor, "ordinary"), 0);
  chair.system.equipped = false; f.refresh(); assert.equal(f.actor.system.statistics.effective.speed, 1); assert.equal(skillValue(f.actor.system, "athletics").total, 1);
});

test("wheelchair handles configured permanent mobility penalties, excludes disabled effects and never stacks chairs", async () => {
  const f = fixture(), data = mobilityEffectData("Особенность", [{ value: -2, factor: .5 }, { value: -3, factor: 1 }, { value: -4, factor: 1 }]);
  f.actor.effects.push({ id: "disability", ...data }); f.refresh(); assert.equal(f.actor.system.statistics.effective.speed, 3);
  const basic = f.add(PROSTHETIC_EQUIPMENT[3]), quality = f.add(PROSTHETIC_EQUIPMENT[4]); basic.system.equipped = true; f.refresh();
  assert.equal(skillValue(f.actor.system, "athletics").total, 13);
  await equipItem.call({ actor: f.actor, isEditable: true }, null, { dataset: { itemId: quality.id } });
  assert.equal(basic.system.equipped, false); assert.equal(wheelchair(f.actor), quality); assert.equal(wheelchairPenalty(f.actor, "climbing"), -1);
  quality.system.carried = false; f.refresh(); assert.equal(f.actor.system.statistics.effective.speed, 3);
  f.actor.effects[0].disabled = true; f.refresh(); assert.equal(f.actor.system.statistics.effective.speed, 8);
  assert.throws(() => mobilityEffectData("", [{ value: 2, factor: 1 }]), /штраф/);
});

test("DLC migration updates old basic prosthetic wound modifiers without erasing custom item content", () => {
  const effect = woundEffectData("dismembered-arm", "deadly", { location: "leftArm", state: "treated", prosthesis: { quality: "simple", itemId: "old" } });
  effect.flags[SYS].condition.modifiers = [{ target: "hands", value: -1 }];
  assert.deepEqual(prostheticWoundUpdate(effect)[`flags.${SYS}.condition.modifiers`], [{ target: "combat.arm", value: -3, arm: "leftArm" }]);
  const item = { system: { ruleId: BASIC_PROSTHESIS.id, weight: 1, price: 777, description: "Мои заметки", properties: "Мои свойства", source: "Мой источник" } };
  assert.deepEqual(prostheticContentUpdate(item), { "system.weight": 2, "system.rarity": "everywhere" });
});

test("closing the limb chooser cancels without choosing a different limb", async t => {
  const f = fixture(); await setProsthesis(f.wound("leftLeg"), f.add(PROSTHETIC_EQUIPMENT[1]));
  const previous = globalThis.foundry; t.after(() => globalThis.foundry = previous);
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async () => null } } } };
  assert.equal(await chooseStrikeLimb(f.actor, "kick"), null);
});
