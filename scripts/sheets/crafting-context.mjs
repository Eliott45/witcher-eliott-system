import { recipeGroups, recipeMemory, recipeAccess, RECIPE_GRADES } from "../data/crafting.mjs";
import { craftingPreview, durationLabel, craftDialog } from "../workshop/crafting.mjs";
import { workshopBase } from "../workshop/check.mjs";
import { memorizeRecipe } from "../workshop/recipe-memory.mjs";
import { repairContext, disassembleItem, diagramIndex, diagramFor } from "../workshop/repair.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { workshopAction, selectCatalogItem } from "./workshop-item-context.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { acquireEquipment, equipmentQuote } from "../data/equipment-purchase.mjs";
import { SUBSTANCES, available } from "../data/workshop.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

const RECIPE_SECTIONS = category => [
  { id: "memory", label: category === "formula" ? "Запомненные формулы" : "Запомненные чертежи", icon: "fa-brain", recipes: [] },
  { id: "physical", label: category === "formula" ? "Формулы при себе" : "Чертежи при себе", icon: "fa-scroll", recipes: [] },
  { id: "unavailable", label: category === "formula" ? "Формулы не при себе" : "Чертежи не при себе", icon: "fa-box-archive", recipes: [] }
];
const hasTool = (actor, id) => actor.items.some(item => available(item) && item.system.ruleId === id);
const ALCHEMY_KINDS = { substance: "Алхимия", potion: "Эликсир", oil: "Масло", decoction: "Отвар", bomb: "Бомба" };

/** Substance units of a formula as signs; the first carried units are lit, the missing ones are hollow. */
function substanceSigns(preview) {
  return (preview?.plan.rows ?? []).filter(row => row.substance).flatMap(row => {
    const substance = SUBSTANCES.find(entry => entry.id === row.substance);
    return Array.from({ length: row.quantity }, (_unit, i) => ({ ...substance, missing: i >= row.quantity - row.missing }));
  });
}

/** Cards of one recipe category: the same memory, physical copy and material plan for diagrams and formulas. */
export async function recipeCards(actor, category) {
  const groups = RECIPE_SECTIONS(category);
  const canAct = conditionRules(actor).canAct;
  const skill = category === "formula" ? "alchemy" : "crafting";
  const total = workshopBase(actor, skill);
  // Older forgotten memory records have zero copies; they are not recipes stored elsewhere.
  const recipes = recipeGroups(actor).filter(group => group.item.system.recipe.category === category
    && (group.memorized || group.copies.some(item => item.system.quantity > 0)));
  const rows = await Promise.all(recipes.map(async ({ item, physical, memorized }) => {
    const recipe = item.system.recipe;
    let preview, error = "", result = null;
    try { preview = await craftingPreview(actor, item); } catch (reason) { error = reason.message; }
    if (category === "formula") result = await foundry.utils.fromUuid(recipe.resultUuid).catch(() => null);
    const bonus = physical ? 2 : 0;
    const ready = preview?.plan.complete && total !== null && canAct && !preview.needsTools;
    const formula = category === "formula";
    // Formulas filter by what they brew, diagrams by grade; both reuse one card and one filter.
    const kind = formula ? result?.system?.ruleId?.startsWith("bomb.") ? "bomb" : result?.system?.alchemy?.category ?? "" : recipe.grade ?? "";
    const typeLabel = formula ? ALCHEMY_KINDS[kind] ?? "Формула" : "Чертёж";
    return {
      id: item.id, name: item.name.replace(/^(Формула|Чертёж):\s*/, ""), search: item.name.toLocaleLowerCase("ru"), physical, memorized, category, kind,
      subtitle: [typeLabel, RECIPE_GRADES[recipe.grade], physical && "при себе"].filter(Boolean).join(" · "),
      bonusLabel: formula ? "формула +2" : "чертёж +2", actionLabel: formula ? "Приготовить" : "Изготовить", actionIcon: formula ? "fa-flask" : "fa-hammer",
      dc: recipe.dc, time: durationLabel(recipe.time), quantity: recipe.quantity,
      bonus, total: total === null ? "—" : `${total + bonus >= 0 ? "+" : ""}${total + bonus}`,
      materials: preview?.materials ?? [], facilities: preview?.tools ?? [], forge: recipe.forge, needsForge: preview?.needsForge,
      signs: substanceSigns(preview), extras: (preview?.materials ?? []).filter((_row, i) => !preview.plan.rows[i].substance).map(row => ({ ...row, many: row.quantity > 1 })),
      status: error || (total === null ? "Укажите РЕМ и навык" : !canAct ? "Персонаж не может действовать" : !preview.plan.complete
          ? (category === "formula" && recipe.components.every(row=>row.substance) ? "Не хватает субстанций" : "Не хватает материалов")
        : preview.needsTools ? "Материалы собраны · нужны инструменты" : (category === "formula" ? "Ингредиенты собраны" : "Материалы собраны")),
      unavailable: !(preview?.plan.complete && total !== null && canAct), toolsOnly: Boolean(preview?.plan.complete && preview.needsTools), ready,
      error: Boolean(error), rememberDisabled: !memorized && recipeMemory(actor).full,
      group: memorized ? "memory" : physical ? "physical" : "unavailable"
    };
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  for (const row of rows) groups.find(group => group.id === row.group).recipes.push(row);
  return { groups: groups.filter(group => group.recipes.length), empty: !rows.length, count: rows.length };
}

export async function craftingContext(actor) {
  const cards = await recipeCards(actor, "diagram");
  const repair = await repairContext(actor);
  // Stacks of the same material are shown once, like substances on the alchemy tab.
  const materials = new Map();
  for (const item of actor.items) {
    if (!available(item) || item.system.kind !== "material" || item.system.material?.substance) continue;
    const key = item.system.ruleId || item.name;
    const entry = materials.get(key) ?? { id: item.id, name: item.name, img: item.img, quantity: 0 };
    entry.quantity += item.system.quantity;
    materials.set(key, entry);
  }
  return { ...cards, memory: recipeMemory(actor), repair, crafting: workshopBase(actor, "crafting") ?? "—",
    tools: hasTool(actor, "gear.crafting-tools"), materials: [...materials.values()].sort((a, b) => a.name.localeCompare(b.name, "ru")) };
}

export async function alchemyContext(actor) {
  const cards = await recipeCards(actor, "formula");
  const substances = SUBSTANCES.map(substance => {
    const ingredients = actor.items.filter(item => available(item) && item.system.material?.substance === substance.id)
      .map(item => ({ id: item.id, name: item.name, img: item.img, quantity: item.system.quantity, pure: item.system.ruleId?.startsWith("substance.") }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return { ...substance, ingredients, count: ingredients.reduce((sum, item) => sum + item.quantity, 0) };
  });
  return { ...cards, memory: recipeMemory(actor), substances, total: substances.reduce((sum, entry) => sum + entry.count, 0),
    alchemy: workshopBase(actor, "alchemy") ?? "—", tools: hasTool(actor, "gear.alchemy-tools") };
}

const recipeFilter = category => item => item.type === "recipe" && (!category || item.system.recipe?.category === category);
export const craftingActions = {
  memorizeCatalogRecipe: workshopAction(async function(_event, target) {
    if (!this.isEditable) return;
    const category = target?.dataset.category ?? "";
    const source = await selectCatalogItem(category === "formula" ? "Запомнить формулу" : category === "diagram" ? "Запомнить чертёж" : "Запомнить рецепт", recipeFilter(category));
    if (source) await memorizeRecipe(this.actor, source);
  }),
  buyCraftingRecipe: workshopAction(async function(_event, target) {
    if (!this.isEditable) return;
    const category = target?.dataset.category ?? "";
    const source = await selectCatalogItem(category === "formula" ? "Купить формулу" : category === "diagram" ? "Купить чертёж" : "Купить чертёж или формулу", recipeFilter(category));
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
  }),
  repairWorkpiece: workshopAction(async function(_event, target) {
    if (!this.isEditable) return;
    const item = this.actor.items.get(target.dataset.itemId);
    const diagram = item && diagramFor(item, await diagramIndex(this.actor));
    const recipe = diagram && await foundry.utils.fromUuid(diagram.uuid);
    if (!recipe) throw new Error("Для починки нужен чертёж этого предмета.");
    await craftDialog(this.actor, recipe, item);
  }),
  disassembleWorkpiece: workshopAction(async function(_event, target) {
    if (!this.isEditable) return;
    let id = target.dataset.itemId;
    if (!id) {
      const { candidates } = await repairContext(this.actor);
      if (!candidates.length) throw new Error("Нечего разбирать: нужны оружие или броня при себе, не надетые, с известным чертежом.");
      id = await chooseReference("workshop", "", { title: "Разобрать предмет", hint: "Возвращается половина компонентов чертежа, минимум 1 каждого. Проверка не нужна.",
        groups: {}, entries: candidates.map(entry => ({ id: entry.id, label: entry.name, summary: entry.summary, details: [] })) });
    }
    const item = id && this.actor.items.get(id);
    if (item) await disassembleItem(this.actor, item);
  }),
  buyIngredient: workshopAction(async function() {
    if (!this.isEditable) return;
    const item = await selectCatalogItem("Купить ингредиенты", entry => entry.system.kind === "material" && Boolean(entry.system.material?.substance));
    if (!item) return;
    const quote = equipmentQuote(this.actor, item);
    if (!quote.canBuy) throw new Error(quote.buyReason);
    const quantity = await foundry.applications.api.DialogV2.prompt({classes:["witcher-crafting-dialog"],window:{title:"Покупка ингредиентов"},content:`<p>${esc(item.name)}: ${item.system.price} крон за единицу.</p><label>Количество<input name="quantity" type="number" min="1" step="1" value="1"></label>`,ok:{label:"Купить и списать кроны",callback:(_e,b)=>Number(new FormData(b.form).get("quantity"))},rejectClose:false});
    if (Number.isInteger(quantity) && quantity >= 1) await acquireEquipment(this.actor, item, { purchase: true, quantity });
  })
};

/** Search and kind filters stay client-side and survive re-renders through the sheet instance. */
function bindRecipeFilters(sheet, tab, key) {
  const page = sheet.element.querySelector(`[data-tab=${tab}].witcher-character-content`);
  if (!page) return;
  const search = page.querySelector("[data-recipe-search]"), kind = page.querySelector("[data-recipe-kind]");
  if (!search) return;
  const apply = () => {
    sheet[`${key}Query`] = search.value;
    if (kind) sheet[`${key}Kind`] = kind.value;
    const query = search.value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
    let matches = 0;
    for (const group of page.querySelectorAll("[data-recipe-group]")) {
      let visible = 0;
      for (const card of group.querySelectorAll("[data-recipe-card]")) {
        card.hidden = !card.dataset.search.replaceAll("ё", "е").includes(query) || Boolean(kind?.value && card.dataset.kind !== kind.value);
        if (!card.hidden) visible++;
      }
      group.hidden = !visible;
      matches += visible;
    }
    const empty = page.querySelector("[data-recipe-no-results]");
    if (empty) empty.hidden = matches > 0 || !page.querySelector("[data-recipe-card]");
  };
  search.value = sheet[`${key}Query`] ?? "";
  if (kind) kind.value = sheet[`${key}Kind`] ?? "";
  search.addEventListener("input", apply);
  kind?.addEventListener("change", event => { event.stopPropagation(); apply(); });
  apply();
}
export function bindCrafting(sheet) {
  bindRecipeFilters(sheet, "crafting", "crafting");
  bindRecipeFilters(sheet, "alchemy", "alchemy");
}
