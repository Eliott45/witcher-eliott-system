import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "../scripts/data/workshop-recipes.mjs";
import { CORE_EQUIPMENT } from "../scripts/data/core-equipment.mjs";
import { MATERIALS, materialUuid } from "../scripts/data/workshop-materials.mjs";
import { UPGRADES } from "../scripts/data/workshop-upgrades.mjs";
import { equipmentUuid } from "../scripts/data/workshop.mjs";
import { recipeRelations } from "../scripts/data/recipe-links.mjs";
import { recipeDetailsContext } from "../scripts/sheets/recipe-details-context.mjs";

const diagram = id => RECIPES.find(item => item.id === `diagram.${id}`);
const document = entry => ({ ...entry, uuid: equipmentUuid(entry.documentId), documentName: "Item",
  system: { ...entry.system, ruleId: entry.id }, testUserPermission: () => true });
const catalog = [...CORE_EQUIPMENT, ...MATERIALS, ...UPGRADES, ...RECIPES].map(document);

// Row-by-row checklist from the supplied Russian PDF; identifiers resolve renamed/localized titles.
const weapons = ids => ids.split(" ").map(id => `weapon.${id}`);
const armor = (zone, numbers) => numbers.map(n => `armor.${zone}.${n}`);
const pages = {
  132: ["ammunition.armor-piercing", "ammunition.broadhead", ...weapons("battle-axe crossbow esboda hand-crossbow hooked-staff krigsverd long-bow mace poleaxe short-dagger staff stiletto")],
  133: weapons("berserker-axe crystal-staff hammer iron-staff jambiya kord monster-crossbow halberd torrwr vicovaro war-bow"),
  134: [...armor("head", [1, 2, 3, 4, 5, 6]), ...armor("torso", [1, 2, 3, 4, 6]), ...armor("legs", [1, 2, 3, 4, 6]), ...weapons("leather-shield buckler temerian-shield kaedwen-shield kite-shield")],
  135: [...armor("head", [7, 8, 9]), ...armor("torso", [5, 7, 8, 9]), ...armor("legs", [5, 7, 8, 9]), ...weapons("skellige-shield pavise nilfgaard-pavise")],
  136: weapons("dwarven-axe dwarven-cleaver dwarven-heavy-crossbow elven-glaive elven-messer elven-travel-bow gnomish-staff halfling-rondel mahakam-martell meteorite-sword vrihedd-blade"),
  137: [...weapons("dwarven-pole-hammer elven-travel-staff elven-zefar gnomish-black-axe gnomish-gwyhyr gnomish-hand-crossbow meteorite-flail tir-tochair-blade"), "ammunition.dwarven-impact", "ammunition.elven-burrowing"],
  138: ["armor.dwarven-cloak", ...weapons("elven-shield gnomish-buckler"), "armor.halfling-doublet", "armor.scoiatael-armor", "armor.gnomish-chain", "armor.gnomish-dragoon", "weapon.mahakam-pavise", "armor.mahakam-plate"],
  139: "cloth studded-leather mail hardened-leather steel elven dwarven".split(" ").map(id => `armor-upgrade.${id}`)
};

test("all 97 rows on pages 132–139 have an existing result, a diagram and component backlinks", () => {
  assert.deepEqual(Object.values(pages).map(rows => rows.length), [14, 11, 21, 14, 11, 10, 9, 7]);
  assert.equal(new Set(Object.values(pages).flat()).size, 97);
  for (const [page, ids] of Object.entries(pages)) for (const id of ids) {
    const result = catalog.find(item => item.system.ruleId === id);
    const recipe = diagram(id);
    assert.ok(result && recipe, `Page ${page}: ${id}`);
    assert.equal(recipe.system.recipe.resultUuid, result.uuid);
    assert.ok(recipeRelations(result, catalog).recipes.some(item => item.system.ruleId === recipe.id));
    for (const component of recipe.system.recipe.components) {
      const material = catalog.find(item => item.uuid === component.uuid);
      assert.ok(material, `${recipe.id}: ${component.uuid}`);
      assert.ok(recipeRelations(material, catalog).uses.some(row => row.document.system.ruleId === recipe.id));
    }
  }
});

test("ammo matches the printed DC, duration, supplement, price, batch size and material quantities", () => {
  const rows = [
    ["armor-piercing", 132, 16, 60, 110, 224, 10, "journeyman", { "hardened-timber": 1, steel: 1, feathers: 1, "sharpening-grit": 1, "ogre-wax": 1 }],
    ["broadhead", 132, 15, 60, 69, 125, 10, "journeyman", { timber: 1, iron: 1, feathers: 1, "sharpening-grit": 1 }],
    ["dwarven-impact", 137, 20, 30, 184, 100, 5, "master", { "mahakaman-steel": 1, "hardened-timber": 1, feathers: 1, "ogre-wax": 2, iron: 1 }],
    ["elven-burrowing", 137, 20, 30, 185, 100, 5, "master", { "dark-steel": 1, resin: 1, "hardened-timber": 1, feathers: 2, "sharpening-grit": 2, "ogre-wax": 1, thread: 1 }]
  ];
  for (const [id, page, dc, minutes, investment, price, quantity, grade, materials] of rows) {
    const item = diagram(`ammunition.${id}`), recipe = item.system.recipe;
    assert.deepEqual([recipe.dc, recipe.time, recipe.investment, item.system.price, recipe.quantity, recipe.grade], [dc, minutes * 60, investment, price, quantity, grade], id);
    assert.equal(item.system.source, "Базовая книга");
    assert.deepEqual(Object.fromEntries(recipe.components.map(row => [row.uuid, row.quantity])), Object.fromEntries(Object.entries(materials).map(([id, quantity]) => [materialUuid(id), quantity])));
    assert.ok(recipe.components.every(row => row.substance === ""));
    assert.equal(recipe.forge, true);
  }
});

test("Elder Folk master/grandmaster rows retain printed hours and prices, including unusual values", () => {
  // page, result, DC, hours, supplement, diagram price (not the finished equipment price).
  const rows = [
    [136, "weapon.dwarven-axe", 24, 12, 555, 1110], [136, "weapon.dwarven-cleaver", 19, 10, 374, 750],
    [136, "weapon.dwarven-heavy-crossbow", 24, 12, 632, 1274], [136, "weapon.elven-glaive", 19, 10, 692, 1386],
    [136, "weapon.elven-messer", 19, 10, 446, 892], [136, "weapon.elven-travel-bow", 22, 11, 432, 862],
    [136, "weapon.gnomish-staff", 22, 11, 682, 1364], [136, "weapon.halfling-rondel", 19, 10, 364, 726],
    [136, "weapon.mahakam-martell", 22, 11, 675, 1350], [136, "weapon.meteorite-sword", 20, 10, 650, 1312],
    [136, "weapon.vrihedd-blade", 24, 12, 558, 1117],
    [137, "weapon.dwarven-pole-hammer", 25, 13, 624, 1248], [137, "weapon.elven-travel-staff", 25, 13, 735, 1470],
    [137, "weapon.elven-zefar", 25, 13, 830, 1660], [137, "weapon.gnomish-black-axe", 25, 13, 688, 1376],
    [137, "weapon.gnomish-gwyhyr", 25, 13, 818, 1628], [137, "weapon.gnomish-hand-crossbow", 25, 13, 317, 634],
    [137, "weapon.meteorite-flail", 25, 13, 676, 1352], [137, "weapon.tir-tochair-blade", 26, 13, 888, 1776],
    [138, "armor.dwarven-cloak", 18, 9, 1050, 2100], [138, "weapon.elven-shield", 20, 5, 528, 1050],
    [138, "weapon.gnomish-buckler", 22, 6, 335, 674], [138, "armor.halfling-doublet", 18, 9, 281, 562],
    [138, "armor.scoiatael-armor", 20, 20, 1738, 3486], [138, "armor.gnomish-chain", 24, 24, 736, 1462],
    [138, "armor.gnomish-dragoon", 25, 25, 2131, 4274], [138, "weapon.mahakam-pavise", 26, 7, 788, 1574],
    [138, "armor.mahakam-plate", 28, 28, 2645, 5286]
  ];
  for (const [page, id, dc, hours, investment, price] of rows) {
    const item = diagram(id), recipe = item.system.recipe;
    assert.deepEqual([recipe.dc, recipe.time, recipe.investment, item.system.price, recipe.quantity], [dc, hours * 3600, investment, price, 1], id);
    assert.equal(item.system.source, "Базовая книга");
    assert.equal(recipe.grade, page === 137 || (page === 138 && dc >= 24) ? "grandmaster" : "master");
  }
  assert.equal(diagram("armor.halfling-doublet").system.recipe.forge, false);
  const helmet = diagram("armor.head.9").system.recipe;
  assert.deepEqual(Object.fromEntries(helmet.components.map(row => [row.uuid, row.quantity])), Object.fromEntries(Object.entries({ "dark-steel": 5, oil: 5, "hardened-leather": 1, "darkening-oil": 1, "drake-oil": 1, ashes: 10 }).map(([id, q]) => [materialUuid(id), q])));
});

test("grandmaster sheets show the grade, full duration and linked output", async () => {
  globalThis.game = { user: {}, packs: new Map(), items: catalog };
  globalThis.foundry = { utils: { fromUuid: async uuid => catalog.find(item => item.uuid === uuid) } };
  const item = catalog.find(item => item.system.ruleId === "diagram.armor.mahakam-plate");
  const context = await recipeDetailsContext(item);
  assert.equal(context.grade, "Великий мастер");
  assert.equal(context.time, "1 дн. 4 ч.");
  assert.equal(context.result.name, "Махакамские латы");
  assert.ok(context.components.every(row => row.available));
});
