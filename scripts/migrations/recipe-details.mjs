import { RECIPES } from "../data/workshop-recipes.mjs";
import { materialUuid } from "../data/workshop-materials.mjs";

const diagrams = new Map(RECIPES.filter(item => item.system.recipe.category === "diagram").map(item => [item.id, item.system.recipe]));

/** Fill the previously unused supplement; preserve custom values and component lists. */
export function recipeDetailsUpdate(item) {
  if (item.type !== "recipe") return {};
  const expected = diagrams.get(item.system.ruleId), recipe = item.system.recipe;
  if (!expected || !recipe) return {};
  const update = {};
  if (!recipe.investment) update["system.recipe.investment"] = expected.investment;
  const legacy = recipe.components;
  if (item.system.ruleId === "diagram.material.hardened-leather" && legacy?.length === 2
    && legacy.some(row => row.uuid === materialUuid("timber") && row.quantity === 2 && !row.substance)
    && legacy.some(row => row.uuid === materialUuid("resin") && row.quantity === 4 && !row.substance)) {
    update["system.recipe.components"] = structuredClone(expected.components);
  }
  return update;
}
