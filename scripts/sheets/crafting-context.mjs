import { recipeGroups, recipeMemory, recipeAccess } from "../data/crafting.mjs";
import { craftingPreview, durationLabel } from "../workshop/crafting.mjs";
import { workshopBase } from "../workshop/check.mjs";
import { memorizeRecipe } from "../workshop/recipe-memory.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { workshopAction, selectCatalogItem } from "./workshop-item-context.mjs";
import { acquireEquipment, equipmentQuote } from "../data/equipment-purchase.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

export async function craftingContext(actor) {
  const memory = recipeMemory(actor);
  const groups = [
    { id: "memory", label: "Запомненные рецепты", icon: "fa-brain", recipes: [] },
    { id: "physical", label: "Чертежи и формулы при себе", icon: "fa-scroll", recipes: [] },
    { id: "unavailable", label: "Рецепты не при себе", icon: "fa-box-archive", recipes: [] }
  ];
  const canAct = conditionRules(actor).canAct;
  const rows = await Promise.all(recipeGroups(actor).map(async ({ item, physical, memorized }) => {
    const recipe = item.system.recipe;
    let preview, error = "";
    try { preview = await craftingPreview(actor, item); } catch (reason) { error = reason.message; }
    const total = workshopBase(actor, recipe.category === "formula" ? "alchemy" : "crafting");
    const ready = preview?.plan.complete && total !== null && canAct;
    return {
      id: item.id, name: item.name, search: item.name.toLocaleLowerCase("ru"), physical, memorized, category: recipe.category,
      typeLabel: recipe.category === "formula" ? "Формула" : "Чертёж",
      dc: recipe.dc, time: durationLabel(recipe.time), quantity: recipe.quantity,
      bonus: physical ? 2 : 0, total: total === null ? "—" : `${total + (physical ? 2 : 0) >= 0 ? "+" : ""}${total + (physical ? 2 : 0)}`,
      materials: preview?.materials ?? [], facilities: preview?.tools ?? [], forge: recipe.forge,
      needsForge: preview?.needsForge,
      status: error || (total === null ? "Укажите РЕМ и навык" : !canAct ? "Персонаж не может действовать" : !preview.plan.complete ? "Не хватает материалов" : "Материалы собраны"),
      unavailable: !ready, error: Boolean(error), rememberDisabled: !memorized && memory.full,
      group: memorized ? "memory" : physical ? "physical" : "unavailable"
    };
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  for (const row of rows) groups.find(group => group.id === row.group).recipes.push(row);
  return { memory, groups: groups.filter(group => group.recipes.length), empty: !rows.length,
    crafting: workshopBase(actor, "crafting") ?? "—", alchemy: workshopBase(actor, "alchemy") ?? "—" };
}
export const craftingActions = {
  memorizeCatalogRecipe: workshopAction(async function() {
    if (!this.isEditable) return;
    const source = await selectCatalogItem("Запомнить рецепт", item => item.type === "recipe");
    if (source) await memorizeRecipe(this.actor, source);
  }),
  buyCraftingRecipe: workshopAction(async function() {
    if (!this.isEditable) return;
    const source = await selectCatalogItem("Купить чертёж или формулу", item => item.type === "recipe");
    if (!source) return;
    const quote = equipmentQuote(this.actor, source);
    if (!quote.canBuy) throw new Error(quote.buyReason);
    const consent = await foundry.applications.api.DialogV2.confirm({classes:["witcher-crafting-dialog"],window:{title:"Купить рецепт"},content:`<p><strong>${esc(source.name)}</strong></p><p>Цена: ${quote.cost} крон. У вас: ${this.actor.system.crowns} крон.</p>`,yes:{label:"Купить"},no:{label:"Отмена"},rejectClose:false});
    if (consent) await acquireEquipment(this.actor, source, { purchase: true, quantity: 1 });
  }),
  toggleRecipeMemory: workshopAction(async function(_event, target) {
    if (!this.isEditable) return;
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await memorizeRecipe(this.actor, item, !recipeAccess(this.actor, item).memorized);
  })
};
export function bindCrafting(sheet) {
  const page = sheet.element.querySelector("[data-tab=crafting].witcher-character-content");
  if (!page) return;
  const search = page.querySelector("[data-crafting-search]"), category = page.querySelector("[data-crafting-category]");
  const apply = () => {
    sheet.craftingQuery = search.value;
    sheet.craftingCategory = category.value;
    const query = search.value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
    let matches = 0;
    for (const group of page.querySelectorAll("[data-crafting-group]")) {
      let visible = 0;
      for (const card of group.querySelectorAll("[data-crafting-recipe]")) {
        card.hidden = !card.dataset.search.replaceAll("ё", "е").includes(query) || (category.value && card.dataset.category !== category.value);
        if (!card.hidden) visible++;
      }
      group.hidden = !visible;
      matches += visible;
    }
    page.querySelector("[data-crafting-no-results]").hidden = matches > 0 || !page.querySelector("[data-crafting-recipe]");
  };
  search.value = sheet.craftingQuery ?? "";
  category.value = sheet.craftingCategory ?? "";
  search.addEventListener("input", apply);
  category.addEventListener("change", event => { event.stopPropagation(); apply(); });
  apply();
}
