import { RECIPES } from "../data/workshop-recipes.mjs";
import { materialUuid } from "../data/workshop-materials.mjs";

const diagrams = new Map(RECIPES.filter(item => item.system.recipe.category === "diagram").map(item => [item.id, item.system.recipe]));
const legacyComponents = {
  "diagram.material.hardened-leather": "timber:2 resin:4",
  "diagram.armor.head.9": "dark-steel:4 hardened-leather:1 darkening-oil:2 drake-oil:2 linen:1 ashes:10 oil:1"
};

/** Fill the previously unused supplement; preserve custom values and component lists. */
export function recipeDetailsUpdate(item) {
  if (item.type !== "recipe") return {};
  const expected = diagrams.get(item.system.ruleId), recipe = item.system.recipe;
  if (!expected || !recipe) return {};
  const update = {};
  if (!recipe.investment) update["system.recipe.investment"] = expected.investment;
  const legacy = recipe.components;
  const previous = legacyComponents[item.system.ruleId]?.split(" ").map(token => token.split(":"));
  if (previous && legacy?.length === previous.length && previous.every(([id, quantity]) =>
    legacy.some(row => row.uuid === materialUuid(id) && row.quantity === Number(quantity) && !row.substance))) {
    update["system.recipe.components"] = structuredClone(expected.components);
    if (item.system.ruleId === "diagram.armor.head.9" && item.system.source === "Базовая книга, стр. 130–135 / 139; errata v4")
      update["system.source"] = "Базовая книга, стр. 135";
  }
  return update;
}
