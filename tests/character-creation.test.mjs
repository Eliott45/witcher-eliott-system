import test from "node:test";
import assert from "node:assert/strict";
import {
  blankCreation, regionForRoll, homelandForRoll, nativeLanguage, familyGroup, familyStatusForRoll, friendForRoll, siblingCount, whichParent, evenAlive,
  witcherRow, attributeState, chosenAttributes, derivedPreview, skillState, professionSlots, professionAllowed, creationItems, creationUpdate, creationErrors,
  stepErrors, lifeEventCount, magicRuleIds, formulaIds, biographyText, PROFESSION_GEAR, STARTING_CROWNS, crownsFormula
} from "../scripts/data/character-creation.mjs";
import { creationContext } from "../scripts/sheets/creation-context.mjs";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { PROFESSIONS } from "../scripts/data/professions.mjs";

const points = values => ({ mode: "points", level: "skilled", values });
const even = { intelligence: 8, reflex: 8, dexterity: 8, body: 8, speed: 8, empathy: 8, craft: 8, will: 7, luck: 7 };

test("homeland follows the region tables; nonhumans and the native tongue (pp.25, 49)", () => {
  assert.equal(regionForRoll("human", 3), "north");
  assert.equal(regionForRoll("witcher", 4), "nilfgaard");
  assert.equal(regionForRoll("elf", 3), "elder");
  assert.equal(homelandForRoll("north", 7), "skellige");
  assert.equal(homelandForRoll("nilfgaard", 2, 9), "nilfgaard-heartland");
  assert.equal(homelandForRoll("nilfgaard", 6, 2), "angren");
  assert.equal(homelandForRoll("elder", 1, 1, "dwarf"), "mahakam");
  assert.deepEqual(["redania", "skellige", "geso", "dol-blathanna", "mahakam"].map(nativeLanguage),
    ["language.common", "language.elder", "language.elder", "language.elder", "language.dwarven"]);
  assert.deepEqual([familyGroup("human", "temeria"), familyGroup("human", "vicovaro"), familyGroup("dwarf", "redania")], ["north", "nilfgaard", "elder"]);
});

test("family tables read the printed d10 bands of each column (pp.25–30)", () => {
  assert.equal(evenAlive(4), true); assert.equal(evenAlive(7), false);
  assert.deepEqual([1, 4, 5, 8, 9, 10].map(whichParent), ["Отец", "Отец", "Мать", "Мать", "Оба родителя", "Оба родителя"]);
  assert.equal(familyStatusForRoll("north", 6), "north.performers");
  assert.equal(familyStatusForRoll("north", 10), "north.peasants");
  assert.equal(familyStatusForRoll("nilfgaard", 7), "nilfgaard.slavery");
  assert.equal(familyStatusForRoll("elder", 2), "elder.noble-warrior");
  assert.equal(friendForRoll("nilfgaard", 6), "nilfgaard.mage-hunter");
  // Northerners: 1–8 siblings; Nilfgaard and dwarves: 1–5; elves rarely more than two.
  assert.deepEqual([8, 9].map(roll => siblingCount("human", "north", roll)), [8, 0]);
  assert.deepEqual([5, 6].map(roll => siblingCount("human", "nilfgaard", roll)), [5, 0]);
  assert.deepEqual([4, 6].map(roll => siblingCount("dwarf", "elder", roll)), [4, 0]);
  assert.deepEqual([2, 5, 9].map(roll => siblingCount("elf", "elder", roll)), [1, 0, 2]);
});

test("witcher tables: bands, and the Trial reads the die plus its modifier (pp.238–240)", () => {
  assert.deepEqual([2, 3, 9].map(roll => witcherRow("recruitment", roll)), ["infancy", "early", "late"]);
  assert.deepEqual([1, 4, 6, 8, 10].map(roll => witcherRow("school", roll)), ["wolf", "griffin", "cat", "viper", "bear"]);
  assert.deepEqual([1, 2, 5, 9, 10].map(roll => witcherRow("standing", roll)), ["personal", "work", "hermit", "normal", "criminal"]);
  assert.equal(witcherRow("training", 6), "best");
  assert.equal(witcherRow("trial", 3), "trauma");
  assert.equal(witcherRow("trial", 3, { recruitment: "late" }), "normal", "+2 for a late recruit");
  assert.equal(witcherRow("trial", 3, { recruitment: "infancy", training: "reaction" }), "near-death", "−4 in total");
  assert.equal(witcherRow("trial", 9, { recruitment: "late", training: "easy" }), "extra");
});

test("parameters: the point budget of the game level, 1–10 each; or nine rolled d10 assigned once (pp.47–48)", () => {
  assert.deepEqual(attributeState(points(even)).errors, []);
  assert.match(attributeState(points({ ...even, luck: 8 })).errors[0], /71 из 70/u);
  assert.match(attributeState(points({ ...even, intelligence: 11, luck: 4 })).errors[0], /от 1 до 10/u);
  assert.equal(attributeState({ ...points(even), level: "legendary" }).remaining, 10);
  const rolled = { mode: "roll", pool: [5, 10, 10, 4, 3, 4, 3, 4, 6], assigned: {} };
  assert.ok(attributeState(rolled).errors.length);
  rolled.assigned = { intelligence: 0, reflex: 1, dexterity: 2, body: 3, speed: 4, empathy: 5, craft: 6, will: 7, luck: 8 };
  assert.deepEqual(attributeState(rolled).errors, []);
  assert.equal(chosenAttributes(rolled).reflex, 10);
  assert.deepEqual(derivedPreview({ body: 8, will: 7, speed: 6 }), { health: 35, stamina: 35, recovery: 7, stun: 7, run: 18, leap: 3, carry: 80 });
});

test("skills: 44 profession points over eleven slots, difficult skills cost double, pickup = INT + REF (p.49)", () => {
  const state = { ...blankCreation(), profession: "witcher", origin: "kaedwen", attributes: points(even) };
  const slots = professionSlots("witcher");
  assert.equal(slots.length, 11);
  assert.equal(slots[0].defining, true);
  assert.ok(slots.find(slot => slot.key === "alchemy").complex);
  state.skills.ranks = Object.fromEntries(slots.map(slot => [slot.id, 4]));
  // 11 slots × 4 = 44, but Spell Casting and Alchemy are (2): 52 points.
  assert.equal(skillState(state).spent, 52);
  Object.assign(state.skills.ranks, { awareness: 1, deduction: 1, riding: 1, athletics: 3 });
  assert.equal(skillState(state).spent, 42);
  state.skills.ranks.stealth = 6;
  assert.deepEqual(skillState(state).errors, []);
  state.skills.ranks.stealth = 7; state.skills.ranks.riding = 0;
  assert.ok(skillState(state).errors.some(error => /не выше 6/u.test(error)));
  assert.ok(skillState(state).errors.some(error => /хотя бы 1/u.test(error)));
  Object.assign(state.skills.ranks, { stealth: 6, riding: 1 });
  state.skills.pickup = { swordsmanship: 1 };
  assert.ok(skillState(state).errors.some(error => /профессии/u.test(error)), "a profession skill cannot take pickup points");
  state.skills.pickup = { monsterLore: 6, education: 4 };
  assert.equal(skillState(state).pickupSpent, 16);
  assert.equal(skillState(state).pickupBudget, 16);
  assert.deepEqual(skillState(state).errors, []);
});

test("profession choices: languages for the bard, five combat skills for the man-at-arms, never the native tongue", () => {
  const bard = { ...blankCreation(), profession: "bard", origin: "redania", attributes: points(even) };
  assert.equal(professionSlots("bard").filter(slot => slot.language).length, 1);
  assert.equal(professionSlots("merchant").filter(slot => slot.language).length, 2);
  bard.skills.ranks = Object.fromEntries(professionSlots("bard").map(slot => [slot.id, 4]));
  bard.skills.languages = ["language.common"];
  assert.ok(skillState(bard).errors.some(error => /Родной язык/u.test(error)));
  bard.skills.languages = ["language.elder"];
  assert.ok(!skillState(bard).errors.some(error => /язык/iu.test(error)));
  const warrior = { ...blankCreation(), profession: "man-at-arms", origin: "redania", attributes: points(even) };
  assert.equal(professionSlots("man-at-arms").filter(slot => slot.combat).length, 5);
  warrior.skills.combat = ["swordsmanship", "melee", "melee", "archery", "riding"];
  assert.ok(skillState(warrior).errors.some(error => /пять разных/u.test(error)));
});

test("race and profession: witchers are witchers; mages and priests are humans or elves (p.37)", () => {
  assert.equal(professionAllowed("witcher", "witcher"), true);
  assert.equal(professionAllowed("witcher", "bard"), false);
  assert.equal(professionAllowed("human", "witcher"), false);
  assert.equal(professionAllowed("dwarf", "mage"), false);
  assert.equal(professionAllowed("elf", "priest"), true);
});

test("every profession has its starting kit and money; gear options resolve to catalogue rule ids", () => {
  for (const profession of PROFESSIONS) {
    assert.ok(STARTING_CROWNS[profession.id] > 0, profession.id);
    assert.ok(PROFESSION_GEAR[profession.id].length >= profession.equipmentChoices, profession.id);
  }
  assert.equal(crownsFormula("witcher"), "50 * 2d6");
  const state = { ...blankCreation(), race: "witcher", profession: "witcher" };
  state.gear.picks = [1, 4];
  state.gear.formulas = { elixir: { 0: "formula.potion.swallow", 1: "formula.potion.cat" }, oil: ["formula.oil.specter", ""], decoction: ["formula.decoction.griffin"] };
  assert.deepEqual(formulaIds(state, "elixir"), ["formula.potion.swallow", "formula.potion.cat"], "slots stored as an object still count");
  assert.equal(stepErrors({ ...state, crowns: 300 }, "gear").join(), "Формулы масел: выберите 2.");
  const ids = creationItems(state).map(entry => entry.ruleId);
  for (const id of ["transport.horse", "tack.saddle", "armor.torso.3", "gear.witcher-medallion", "weapon.witcher-steel-sword", "weapon.witcher-silver-sword", "formula.potion.cat"]) assert.ok(ids.includes(id), id);
  assert.ok(creationItems(state).find(entry => entry.ruleId === "tack.saddle").mount);
  // Witchers take only the five basic signs; mages pick novice spells.
  const signs = magicRuleIds(state, CORE_MAGIC.map(entry => ({ ...entry, ruleId: entry.system.ruleId })));
  assert.deepEqual(signs.toSorted(), ["sign.aard", "sign.axii", "sign.igni", "sign.quen", "sign.yrden"]);
});

test("the draft becomes an actor update: keepsakes, native language, money from gear and the lifepath", () => {
  const state = { ...blankCreation(), name: " Ольсен ", race: "human", origin: "skellige", profession: "priest", age: 34, attributes: points(even), crowns: 450 };
  Object.assign(state.family, { alive: false, fate: 3, parentsAlive: false, parentFate: 6, whichParent: "Мать", status: "north.peasants", friend: "north.church", siblingCount: 1,
    siblings: [{ gender: 2, age: 10, attitude: 8, personality: 3, name: "Агнес" }] });
  state.style = { clothing: 2, personality: 8, value: 2 };
  state.events = [{ age: 10, kind: "fortune", fortune: { result: "money", amount: 300 } }];
  state.gear.picks = [0, 4, 6, 8, 9];
  const update = creationUpdate(state, id => `name:${id}`);
  assert.equal(update.name, "Ольсен");
  assert.deepEqual(update["system.languages"], [{ id: "language.elder", name: "name:language.elder", level: 8 }]);
  assert.equal(update["system.crowns"], 450 + 100 + 300, "rolled money, ingredients worth 100 crowns and a windfall");
  assert.equal(update["system.vigor"], 2);
  assert.equal(update["system.details"].familyStatus, "north.peasants");
  assert.match(update["system.biography.family.history"], /Дом проклят/u);
  assert.match(update["system.biography.family.parents"], /^Мать: погибли от чудовища/u);
  assert.match(update["system.biography.family.siblings"], /Агнес · Женский · Ваш близнец · Любит вас · Доброта/u);
  assert.match(update["system.biography.appearance"], /Одежда для путешествий/u);
  assert.match(update["system.biography.personality"], /Дружелюбный.*Честь/u);
  const keepsakes = creationItems(state).filter(entry => entry.keepsake).map(entry => entry.ruleId);
  assert.deepEqual(keepsakes, ["lucky-charm", "sacred-text"]);
  assert.equal(biographyText({ ...state, family: { ...state.family, siblingCount: 0, siblings: [] } }).siblings, "Единственный ребёнок в семье.");
});

test("the lifepath counts one event per decade, a witcher's decades from the start of the Path; it may be skipped", () => {
  assert.equal(lifeEventCount({ race: "human", age: 34 }), 3);
  assert.equal(lifeEventCount({ race: "witcher", age: 72, witcher: { pathStartAge: 20 } }), 5);
  assert.deepEqual(stepErrors({ ...blankCreation(), age: 40 }, "events"), []);
  const errors = creationErrors(blankCreation()).map(error => error.step);
  assert.ok(errors.includes("race") && errors.includes("summary") && !errors.includes("events"));
});

test("the wizard context renders every step without the Foundry runtime", () => {
  const state = { ...blankCreation(), race: "human", origin: "redania", profession: "man-at-arms", attributes: points(even) };
  state.family.status = "north.peasants";
  for (const step of ["race", "origin", "events", "style", "profession", "attributes", "skills", "gear", "summary"]) {
    const context = creationContext({ ...state, step }, { magic: [], formulas: [], names: {} });
    assert.equal(context.stepId, step);
    assert.equal(context.is[step], true);
  }
  const context = creationContext(state, {});
  assert.equal(context.skills.slots.length, 11);
  assert.equal(context.professions.find(entry => entry.id === "mage").allowed, true);
  assert.equal(context.origin.family.countChoices.length, 9);
});

test("every starting item exists in the equipment compendium sources", async () => {
  const { readFile } = await import("node:fs/promises");
  const { PROFESSION_FIXED_GEAR } = await import("../scripts/data/character-creation.mjs");
  const { FAMILY_STATUSES } = await import("../scripts/data/family-statuses.mjs");
  const { INFLUENTIAL_FRIENDS } = await import("../scripts/data/influential-friends.mjs");
  const pack = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
  const known = new Set(pack.map(entry => entry.system?.ruleId));
  const wanted = [...Object.values(PROFESSION_GEAR).flat().flatMap(option => option.items), ...Object.values(PROFESSION_FIXED_GEAR).flat()]
    .filter(entry => !entry.custom).map(entry => entry.ruleId);
  wanted.push(...FAMILY_STATUSES.flatMap(entry => entry.equipment), ...INFLUENTIAL_FRIENDS.flatMap(entry => entry.equipment));
  assert.deepEqual([...new Set(wanted)].filter(id => !known.has(id)), []);
});

test("each decade is its own slot: the ages that open them, and which are still empty", async () => {
  const { decadeAges, pendingAges } = await import("../scripts/data/character-creation.mjs");
  assert.deepEqual(decadeAges({ race: "human", age: 34 }), [10, 20, 30]);
  assert.deepEqual(decadeAges({ race: "witcher", age: 62, witcher: { pathStartAge: 20 } }), [20, 30, 40, 50]);
  assert.deepEqual(pendingAges({ race: "witcher", age: 62, witcher: { pathStartAge: 20 }, decades: [{ age: 30 }] }), [20, 40, 50]);
  assert.deepEqual(pendingAges({ race: "elf", age: 25, events: [{ age: 10 }, { age: 20 }] }), []);
});
