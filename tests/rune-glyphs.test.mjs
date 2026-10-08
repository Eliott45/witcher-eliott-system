import test from "node:test";
import assert from "node:assert/strict";
import { UPGRADES } from "../scripts/data/workshop-upgrades.mjs";
import { runeGlyphRuleId, installedRune, matchingGlyphs, glyphBonus, greaterFocusFor, spellDamageWithGlyph, spellDescriptionWithDC } from "../scripts/data/rune-glyphs.mjs";
import { focusOptions, carriedFocuses } from "../scripts/magic/rules.mjs";
import { quoteWeaponWear, applyWeaponWear } from "../scripts/combat/weapon-wear.mjs";
import { strikeAttack } from "../scripts/magic/spell-strikes.mjs";

const installation = ruleId => ({ ruleId, category: ruleId.split(".")[0], name: ruleId, bonuses: [] });
const weapon = ruleId => ({ id: "sword", type: "weapon", name: "Именной клинок", system: { quantity: 1, carried: true, equipped: true, reliability: { value: 12, max: 12 }, properties: "", installations: [installation(ruleId)] } });

test("all printed ten runes and five glyphs preserve their identities, prices and single-use slot targets", () => {
  const rows = UPGRADES.filter(row => /^(rune|glyph)\./u.test(row.id));
  assert.equal(rows.length, 15);
  for (const row of rows) {
    assert.equal(row.system.weight, .5);
    assert.equal(row.system.upgrade.target, row.id.startsWith("rune.") ? "weapon" : "armor");
    assert.equal(runeGlyphRuleId({ sourceUuid: `Compendium.witcher-eliott-system.equipment.Item.${row.documentId}` }), row.id);
  }
  assert.deepEqual(rows.filter(row => row.id.startsWith("rune.")).map(row => row.system.price), [575, 600, 575, 575, 575, 500, 600, 575, 600, 550]);
  assert.ok(rows.filter(row => row.id.startsWith("glyph.")).every(row => row.system.price === 575));
});

test("rune identity survives renaming and old world installations, without reinterpreting a custom explicit ruleId", () => {
  const sword = weapon("rune.chernobog");
  assert.equal(installedRune(sword, "chernobog"), true);
  assert.equal(runeGlyphRuleId({ category: "rune", name: "Руна Велес", sourceUuid: "Actor.owner.Item.consumed" }), "rune.veles");
  assert.equal(runeGlyphRuleId({ ruleId: "custom.other", name: "Руна Велес", category: "rune" }), "custom.other");
  assert.equal(runeGlyphRuleId({ name: "Руна Велес", category: "craftsman" }), "");
});

test("Chernobog prevents the entire wear event on 4–6, not one point per success", async () => {
  globalThis.game = { settings: { get: () => "public" } };
  const sword = weapon("rune.chernobog"), updates = [], messages = [];
  sword.update = async patch => { updates.push(patch); sword.system.reliability.value = patch["system.reliability.value"]; };
  globalThis.foundry = { documents: { ChatMessage: { getSpeaker: () => ({}) } } };
  for (const value of [3, 4, 6]) {
    const roll = { total: value, toMessage: async data => { messages.push(data); return data; } };
    const result = await applyWeaponWear(sword, 7, { roll });
    assert.equal(result.protectedByRune, value >= 4);
    assert.equal(result.to, 5);
  }
  assert.equal(updates.length, 1); assert.equal(messages.length, 3);
  assert.equal((await quoteWeaponWear(weapon("rune.perun"), 3)).to, 9);
});

test("glyphs select the exact element, and repeated glyphs give one bonus chosen independently per cast", () => {
  const armor = { type: "armor", name: "Куртка", system: { installations: [installation("glyph.air"), installation("glyph.air"), installation("glyph.magic")] } };
  const air = matchingGlyphs([armor], { element: "air" });
  assert.equal(air.length, 2);
  assert.deepEqual([glyphBonus(air, "dc").dc, glyphBonus(air, "damage").damageDice], [3, 1]);
  assert.equal(matchingGlyphs([armor], { element: "fire" }).length, 0);
  assert.equal(matchingGlyphs([armor], { element: "mixed" }).length, 1);
  assert.equal(glyphBonus([], "damage").damageDice, 0);
  assert.throws(() => glyphBonus(air, "both"), /Выберите/);
});

test("greater-only and element-restricted foci work without inventing a stamina discount", () => {
  const sword = weapon("rune.veles"); sword.system.installations[0].properties = "Улучшенное фокусирующее";
  const actor = { items: [sword], system: { details: { profession: "witcher" } } };
  assert.deepEqual(focusOptions(actor, { element: "fire" }), [{ id: "sword", name: sword.name, rating: 0, greater: true }]);
  assert.deepEqual(carriedFocuses(actor),[sword]);
  sword.system.properties = "Улучшенное фокусирующее (Воздух)"; sword.system.installations = [];
  assert.equal(focusOptions(actor, { element: "water" }).length, 0);
  assert.equal(focusOptions(actor, { element: "air" }).length, 1);
  for (const element of ["earth", "water"]) assert.equal(greaterFocusFor("Улучшенное фокусирующее (земля и вода)", { element }), true);
  assert.equal(greaterFocusFor("Улучшенное фокусирующее (земля и вода)", { element: "fire" }), false);
  assert.equal(greaterFocusFor("Улучшенное фокусирующее (магия воздуха)", { element: "mixed" }), false);
  assert.equal(greaterFocusFor("Улучшенное фокусирующее (магия воды)", { element: "mixed" }), false);
  sword.system.properties="Фокусирующее (2); Улучшенное фокусирующее (магия огня)";
  actor.system.details.profession="mage";
  for(const element of ["air","mixed"])assert.deepEqual(focusOptions(actor,{element}).map(row=>[row.rating,row.greater]),[[2,false]]);
  assert.deepEqual(focusOptions(actor,{element:"fire"}).map(row=>[row.rating,row.greater]),[[2,true]]);
  sword.system.reliability.value = 0; assert.deepEqual(focusOptions(actor, { element: "air" }), []);
});

test("spell attacks retain glyph damage in their snapshot; DC bonuses do not alter the casting roll", () => {
  globalThis.game = { combat: null };
  const item = { id: "spell", name: "Ветер", system: { element: "air", ruleId: "spell.zephyr", damage: "1d6", defense: ["dodge"] } };
  const attack = strikeAttack(item, { uuid: "caster" }, { uuid: "target" }, { total: 17, glyph: { damageDice: 1 }, effectDC: 2, adrenalineDice: 2 });
  assert.equal(attack.base, 17); assert.equal(attack.effectDC, 2);
  assert.equal(attack.damage, "(1d6) + 1d6");assert.equal(attack.adrenalineDice,2);
  item.system.damage = "20d6"; assert.equal(attack.damage, "(1d6) + 1d6");
  assert.equal(spellDamageWithGlyph("", { damageDice: 1 }), null);
  assert.equal(spellDescriptionWithDC("<p>Стойкость СЛ 16. Длительность 10 раундов; СЛ: 20.</p>", 5), "<p>Стойкость СЛ 21. Длительность 10 раундов; СЛ: 25.</p>");
});
