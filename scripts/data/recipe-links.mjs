import { recipeKey } from "./crafting.mjs";

/** Stable identity survives importing, renaming and copying an item to an actor. */
export function recipeRelations(item, documents) {
  const source = item._stats?.compendiumSource;
  const ruleId = item.system.ruleId || documents.find(entry => entry.uuid === source)?.system?.ruleId;
  const references = new Set([item.uuid, source].filter(Boolean));
  if (ruleId) for (const entry of documents) if (entry.system?.ruleId === ruleId) references.add(entry.uuid);
  const substance = item.system.material?.substance;
  const recipes = [], uses = [], seen = new Set();
  for (const document of documents) {
    if (document.type !== "recipe" || !document.system.recipe) continue;
    const recipe = document.system.recipe;
    // Prefer owned/world copies (input order), but retain edited variants of the same diagram.
    const signature = JSON.stringify([recipeKey(document), recipe.resultUuid, recipe.components,
      recipe.dc, recipe.time, recipe.quantity, recipe.investment, recipe.grade, recipe.forge, recipe.tools]);
    if (seen.has(signature)) continue;
    seen.add(signature);
    if (references.has(recipe.resultUuid)) recipes.push(document);
    const components = recipe.components ?? [];
    const exact = components.filter(row => !row.substance && references.has(row.uuid));
    const alternatives = substance ? components.filter(row => row.substance === substance) : [];
    if (exact.length || alternatives.length) uses.push({
      document, quantity: exact.reduce((sum, row) => sum + row.quantity, 0),
      substanceQuantity: alternatives.reduce((sum, row) => sum + row.quantity, 0), substance: alternatives.length ? substance : ""
    });
  }
  return { recipes, uses };
}
