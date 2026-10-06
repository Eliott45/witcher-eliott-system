import { isPhysical } from "../data/physical-items.mjs";
import { recipeRelations } from "../data/recipe-links.mjs";
import { craftingDuration } from "../data/crafting.mjs";
import { SUBSTANCES } from "../data/workshop.mjs";

const substanceName = id => SUBSTANCES.find(entry => entry.id === id)?.name ?? id;
const readable = item => item.testUserPermission(game.user, "OBSERVER");
const reference = (item, fallback = "Предмет недоступен") => ({
  uuid: item?.uuid ?? "", name: item?.name ?? fallback, img: item?.img ?? "icons/svg/item-bag.svg", available: Boolean(item)
});
const byName = (a, b) => a.name.localeCompare(b.name, "ru");

/** Index fields are cached by Foundry; opening a sheet never loads every catalogue document. */
async function referenceCatalog(item) {
  const packs = Array.from(game.packs.values()).filter(pack => pack.documentName === "Item" && pack.testUserPermission(game.user, "OBSERVER"));
  const results = await Promise.allSettled(packs.map(async pack => {
    const index = await pack.getIndex({ fields: ["system.ruleId", "system.recipe", "system.material.substance"] });
    return Array.from(index.values(), entry => ({ ...entry, uuid: `Compendium.${pack.collection}.Item.${entry._id}` }));
  }));
  const indexed = results.flatMap((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`Witcher | Could not index recipes in ${packs[i].collection}`, result.reason);
    return [];
  });
  const local = [...(item.actor?.items ?? []), ...(game.items ?? [])].filter(readable);
  // The current document takes precedence over a cached index entry while editing.
  const seen = new Set();
  const documents = [item, ...local, ...indexed].filter(entry => {
    if (seen.has(entry.uuid)) return false;
    seen.add(entry.uuid);
    return true;
  });
  return { documents, incomplete: results.some(result => result.status === "rejected") };
}

export async function recipeDetailsContext(item) {
  if (!isPhysical(item)) return null;
  const { documents, incomplete } = await referenceCatalog(item);
  const byUuid = new Map(documents.map(entry => [entry.uuid, entry]));
  const resolved = new Map();
  const resolve = uuid => {
    if (!uuid) return Promise.resolve(null);
    if (!resolved.has(uuid)) resolved.set(uuid, (async () => {
      try {
        const document = await foundry.utils.fromUuid(uuid);
        return document?.documentName === "Item" && readable(document) ? document : null;
      } catch { return null; }
    })());
    return resolved.get(uuid);
  };
  const recipe = item.type === "recipe" ? item.system.recipe : null;
  const components = recipe ? await Promise.all(recipe.components.map(async (entry, index) => ({
    ...reference(entry.substance ? null : await resolve(entry.uuid), entry.substance ? substanceName(entry.substance) : "Компонент недоступен"),
    index, quantity: entry.quantity, substance: entry.substance,
    alternatives: entry.substance ? documents.filter(document => document.type === "equipment" && document.system?.material?.substance === entry.substance)
      .filter((document, i, list) => list.findIndex(other => (other.system.ruleId || other.uuid) === (document.system.ruleId || document.uuid)) === i)
      .map(document => reference(document)).sort(byName) : []
  }))) : [];
  const relations = recipeRelations(item, documents);
  const recipes = relations.recipes.map(document => ({ ...reference(document),
    time: craftingDuration(document.system.recipe.time), dc: document.system.recipe.dc
  })).sort(byName);
  const uses = relations.uses.map(entry => ({ ...reference(entry.document), quantity: entry.quantity,
    substanceQuantity: entry.substanceQuantity, substance: entry.substance ? substanceName(entry.substance) : "",
    result: reference(byUuid.get(entry.document.system.recipe.resultUuid), "Результат недоступен")
  })).sort(byName);
  return {
    isRecipe: Boolean(recipe), isDiagram: recipe?.category === "diagram", title: recipe?.category === "formula" ? "Алхимическая формула" : "Ремесленный чертёж",
    grade: ({ novice: "Новичок", journeyman: "Подмастерье", master: "Мастер" })[recipe?.grade] ?? "",
    result: reference(recipe ? await resolve(recipe.resultUuid) : null, "Выберите результат"),
    quantity: recipe?.quantity ?? 1, time: craftingDuration(recipe?.time), dc: recipe?.dc ?? 0,
    investment: recipe?.investment ?? 0, components, recipes, uses, incomplete,
    showUses: item.type !== "recipe" && (item.system.kind === "material" || uses.length > 0)
  };
}
