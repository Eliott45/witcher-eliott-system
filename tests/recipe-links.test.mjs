import test from "node:test";
import assert from "node:assert/strict";
import { RECIPES } from "../scripts/data/workshop-recipes.mjs";
import { MATERIALS, materialUuid } from "../scripts/data/workshop-materials.mjs";
import { DIAGRAM_INVESTMENTS } from "../scripts/data/diagram-investments.mjs";
import { equipmentUuid } from "../scripts/data/workshop.mjs";
import { recipeRelations } from "../scripts/data/recipe-links.mjs";
import { recipeDetailsUpdate } from "../scripts/migrations/recipe-details.mjs";
import { recipeDetailsContext } from "../scripts/sheets/recipe-details-context.mjs";

const document = entry => ({ ...structuredClone(entry), _id: entry.documentId, uuid: equipmentUuid(entry.documentId),
  documentName: "Item", system: { ...structuredClone(entry.system), ruleId: entry.id }, testUserPermission: () => true });
const materials = MATERIALS.map(document), recipes = RECIPES.map(document);
const get = id => [...materials, ...recipes].find(item => item.system.ruleId === id);

test("printed supplements are complete, independent of diagram prices, with leather/wax on p. 130", () => {
  const diagrams = recipes.filter(item => item.system.recipe.category === "diagram");
  assert.equal(diagrams.length, Object.keys(DIAGRAM_INVESTMENTS).length);
  assert.ok(diagrams.every(item => Number.isFinite(item.system.recipe.investment) && item.system.recipe.investment > 0));
  assert.equal(get("diagram.material.hardened-timber").system.recipe.investment, 11);
  assert.equal(get("diagram.weapon.dagger").system.recipe.investment, 33);
  assert.equal(get("diagram.weapon.long-bow").system.recipe.investment, 252);
  assert.equal(get("diagram.armor-upgrade.cloth").system.recipe.investment, 28);
  assert.deepEqual(get("diagram.material.hardened-leather").system.recipe.components,
    [{ uuid: materialUuid("leather"), quantity: 1, substance: "" }, { uuid: materialUuid("wax"), quantity: 2, substance: "" }]);
});

test("links match UUIDs and rule IDs after rename/import; same-name items do not match", () => {
  const cotton = get("material.cotton"), thread = get("material.thread");
  const docs = [...materials, ...recipes];
  const imported = { ...thread, uuid: "Actor.hero.Item.thread", name: "Мои нитки" };
  const result = recipeRelations(imported, docs);
  assert.equal(result.recipes.length, 1);
  assert.equal(result.recipes[0].system.ruleId, "diagram.material.thread");
  assert.ok(result.uses.some(row => row.document.system.ruleId === "diagram.material.double-linen" && row.quantity === 2));
  const bySource = { ...imported, system: { ...imported.system, ruleId: "" }, _stats: { compendiumSource: thread.uuid } };
  assert.deepEqual(recipeRelations(bySource, docs), result);
  assert.deepEqual(recipeRelations({ ...cotton, uuid: "Item.unrelated", system: { ruleId: "" } }, docs), { recipes: [], uses: [] });
});

test("owned and world recipes support exact/custom components, duplicate copies and edited variants", () => {
  const material = { uuid: "Item.custom", name: "Кость", type: "equipment", system: {} };
  const recipe = { uuid: "Item.recipe", name: "Чертёж", type: "recipe", system: { ruleId: "custom-diagram", recipe: {
    resultUuid: "Item.result", components: [{ uuid: material.uuid, quantity: 2 }, { uuid: material.uuid, quantity: 3 }], dc: 10
  } } };
  const duplicate = { ...recipe, uuid: "Actor.hero.Item.recipe" };
  const variant = { ...recipe, uuid: "Item.variant", system: { ...recipe.system, recipe: { ...recipe.system.recipe, dc: 12 } } };
  const result = recipeRelations(material, [duplicate, recipe, variant]);
  assert.equal(result.uses.length, 2);
  assert.equal(result.uses[0].document.uuid, duplicate.uuid);
  assert.equal(result.uses[0].quantity, 5);
});

test("substance alternatives stay distinct from mandatory exact ingredients", () => {
  const material = { uuid: "Item.herb", system: { material: { substance: "vitriol" } } };
  const recipe = { type: "recipe", uuid: "Item.formula", system: { recipe: { components: [
    { substance: "vitriol", quantity: 2 }, { uuid: material.uuid, quantity: 1 }
  ] } } };
  const { uses } = recipeRelations(material, [recipe]);
  assert.equal(uses[0].quantity, 1);
  assert.equal(uses[0].substanceQuantity, 2);
  assert.equal(uses[0].substance, "vitriol");
});

test("legacy migration is idempotent and preserves custom recipe data", () => {
  const legacy = document(RECIPES.find(item => item.id === "diagram.material.hardened-leather"));
  legacy.system.recipe.investment = 0;
  legacy.system.recipe.components = [{ uuid: materialUuid("timber"), quantity: 2 }, { uuid: materialUuid("resin"), quantity: 4 }];
  const update = recipeDetailsUpdate(legacy);
  assert.equal(update["system.recipe.investment"], 32);
  assert.deepEqual(update["system.recipe.components"], get("diagram.material.hardened-leather").system.recipe.components);
  legacy.system.recipe.investment = update["system.recipe.investment"];
  legacy.system.recipe.components = update["system.recipe.components"];
  assert.deepEqual(recipeDetailsUpdate(legacy), {});
  legacy.system.recipe.investment = 123;
  legacy.system.recipe.components = [{ uuid: "Item.custom", quantity: 9 }];
  assert.deepEqual(recipeDetailsUpdate(legacy), {});
  legacy.system.ruleId = "custom-diagram";
  legacy.system.recipe.investment = 0;
  assert.deepEqual(recipeDetailsUpdate(legacy), {});
});

test("sheet context uses indexes, respects permissions, handles missing links and refreshes changed recipes", async () => {
  const thread = document(MATERIALS.find(item => item.id === "thread" || item.id === "material.thread"));
  const recipe = document(RECIPES.find(item => item.id === "diagram.material.linen"));
  const hidden = { ...recipe, uuid: "Item.secret", name: "Секретный рецепт", testUserPermission: () => false };
  let reads = 0;
  const pack = { collection: "witcher-eliott-system.equipment", documentName: "Item", testUserPermission: () => true,
    getIndex: async ({ fields }) => { reads++; assert.ok(fields.includes("system.recipe")); return new Map([thread, recipe].map(item => [item._id, item])); } };
  const secretPack = { ...pack, collection: "world.secret", testUserPermission: () => false, getIndex: () => assert.fail("Hidden pack indexed") };
  globalThis.game = { user: {}, packs: new Map([[pack.collection, pack], [secretPack.collection, secretPack]]), items: [hidden] };
  const documents = new Map([thread, recipe].map(item => [item.uuid, item]));
  globalThis.foundry = { utils: { fromUuid: async uuid => documents.get(uuid) } };
  let context = await recipeDetailsContext(thread);
  assert.equal(context.uses.length, 1);
  assert.equal(context.uses[0].name, recipe.name);
  assert.equal(context.uses[0].quantity, 2);
  recipe.system.recipe.components[0].quantity = 7;
  context = await recipeDetailsContext(thread);
  assert.equal(context.uses[0].quantity, 7);
  context = await recipeDetailsContext(recipe);
  assert.equal(context.components[0].uuid, thread.uuid);
  assert.equal(context.components[0].available, true);
  assert.equal(context.result.available, false);
  documents.delete(thread.uuid);
  context = await recipeDetailsContext(recipe);
  assert.equal(context.components[0].available, false);
  documents.set(thread.uuid, { ...thread, testUserPermission: () => false });
  assert.equal((await recipeDetailsContext(recipe)).components[0].available, false);
  assert.equal(reads, 5);
});
