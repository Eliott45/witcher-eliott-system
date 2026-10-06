import { inventoryWrite } from "../data/inventory-writes.mjs";
import { recipeAccess, requireMemorySlot } from "../data/crafting.mjs";
import { copyPhysical, inventoryTransaction } from "./transaction.mjs";

/** All diagram/formula memory shares one INT limit, including recipes without a physical copy. */
export function memorizeRecipe(actor, source, memorize = true) {
  return inventoryWrite(actor, async () => {
    if (!actor.isOwner || source?.type !== "recipe") throw new Error("Рецепт недоступен.");
    if (!source.testUserPermission(game.user, "LIMITED")) throw new Error("Рецепт недоступен.");
    const access = recipeAccess(actor, source);
    if (memorize) requireMemorySlot(actor, source);
    if (access.copies.length) {
      const chosen = access.copies[0];
      await actor.updateEmbeddedDocuments("Item", access.copies.map(item => ({
        _id: item.id, "system.recipe.memorized": memorize && item.id === chosen.id
      })));
    } else if (memorize) {
      const data = copyPhysical(source, 0);
      data.system.carried = false;
      data.system.recipe.memorized = true;
      await inventoryTransaction(actor, { creates: [data] });
    }
  });
}
