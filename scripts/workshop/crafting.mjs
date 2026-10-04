import { materialPlan, repairRecipe, available, sameItem, SUBSTANCES, effectiveItem } from "../data/workshop.mjs";
import { conditionKey } from "../data/physical-items.mjs";
import { inventoryWrite } from "../sheets/inventory-context.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { workshopCheck, workshopBase, workshopNotice } from "./check.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";

export async function resolveRequirements(recipe) {
  const refs = new Map();
  for (const component of recipe.components) if (component.uuid && !refs.has(component.uuid)) {
    const item = await foundry.utils.fromUuid(component.uuid);
    if (!item || item.documentName !== "Item" || !item.testUserPermission(game.user, "LIMITED")) throw new Error("Не найден или недоступен компонент рецепта.");
    refs.set(component.uuid, item);
  }
  return refs;
}
export const durationLabel = seconds => seconds < 60 ? `${seconds / 3} раунд.` : seconds < 3600 ? `${seconds / 60} мин.` : `${seconds / 3600} ч.`;
export async function findRepairDiagram(item) {
  const recipes = [...item.actor.items.filter(entry => entry.type === "recipe"), ...(await game.packs.get("witcher-eliott-system.equipment").getDocuments()).filter(entry => entry.type === "recipe")];
  for (const recipe of recipes) {
    if (recipe.system.recipe.category !== "diagram") continue;
    const source = await foundry.utils.fromUuid(recipe.system.recipe.resultUuid);
    if (source && sameItem(item, source)) return recipe;
  }
  throw new Error("Для ремонта нужен чертёж этого предмета с компонентами и СЛ. Создайте свой чертёж с ссылкой на исходный предмет.");
}
function requireRecipe(actor, item, repair) {
  const recipe = item.system.recipe;
  if (!repair && !(available(item) || recipe.memorized)) throw new Error("Нужен физический или запомненный рецепт.");
  if (!repair && recipe.category === "diagram" && recipe.grade === "master" && workshopBase(actor, "profession.craftsman.master-crafting") === null)
    throw new Error("Для чертежа мастера нужна изученная способность «Мастерская работа».");
  if (!recipe.resultUuid || !recipe.components.length || recipe.dc <= 0 || recipe.time <= 0) throw new Error("Заполните результат, компоненты, сложность и время рецепта.");
}
/** Dialog is a preview; requirements are resolved and checked again inside the actor's write queue. */
export async function craftDialog(actor, recipeItem, target = null) {
  if (!actor?.isOwner) return;
  requireRecipe(actor, recipeItem, target);
  const original = recipeItem.system.recipe.toObject ? recipeItem.system.recipe.toObject() : structuredClone(recipeItem.system.recipe);
  const recipe = target ? repairRecipe(original, target) : original;
  const result = await foundry.utils.fromUuid(recipe.resultUuid);
  if (!result || !result.testUserPermission(game.user, "LIMITED")) throw new Error("Результат рецепта недоступен.");
  if (target && (!conditionKey(target) || target.system[conditionKey(target)].value >= effectiveItem(target)[conditionKey(target)].max)) throw new Error("Предмет не нуждается в ремонте.");
  const references = await resolveRequirements(recipe);
  const plan = materialPlan(actor.items, recipe.components, references);
  const tools = recipe.tools.map(id => ({id, present:actor.items.some(item=>available(item) && item.system.ruleId===id)}));
  const needsTools = tools.some(tool=>!tool.present), needsForge = recipe.forge && !actor.items.some(item=>available(item)&&item.system.ruleId==="gear.forge");
  const bonus = !target && available(recipeItem) ? 2 : 0;
  const names = {"gear.crafting-tools":"Инструменты ремесленника","gear.alchemy-tools":"Инструменты алхимика"};
  const content = `<div class="witcher-workshop-dialog"><h3>${esc(target ? target.name : result.name)}</h3>
    <p>СЛ <b>${recipe.dc}</b> · ${target ? "Длительность ремонта определяет ведущий" : durationLabel(recipe.time)} · ${recipe.category==="formula"?"Алхимия":"Изготовление"} + РЕМ + 1d10</p>
    <p>${target ? "Полное восстановление; СЛ чертежа − 5 + 2 за установленное усиление/руну/глиф." : `Бонус физического рецепта: +${bonus}. Результат: ${recipe.quantity} шт.`}</p>
    <table><thead><tr><th>Компонент</th><th>Нужно / выделено</th><th>Будет потрачено</th></tr></thead><tbody>${plan.rows.map(row=>`<tr><td>${esc(row.substance ? SUBSTANCES.find(s=>s.id===row.substance)?.name??row.substance : references.get(row.uuid).name)}</td><td>${row.quantity} / ${row.quantity-row.missing}${row.missing?` · не хватает ${row.missing}`:""}</td><td>${row.used.map(entry=>`${esc(entry.name)} ×${entry.quantity}`).join(", ")||"—"}</td></tr>`).join("")}</tbody></table>
    <p>${tools.map(tool=>`${esc(names[tool.id]??tool.id)}: ${tool.present?"есть":"нет"}`).join(" · ")}${recipe.forge ? ` · Кузница: ${needsForge?"нужна":"есть"}`:""}</p>
    ${needsTools?'<label><input type="checkbox" name="borrowTools"> Нужные инструменты доступны в мастерской</label>':""}
    ${needsForge?'<label><input type="checkbox" name="forge"> Есть доступ к стационарной кузнице</label>':""}
    <label><input type="checkbox" name="time"> ${target ? "Работа завершена" : "Необходимое время отработано"}</label><p>Материалы расходуются и при неудаче. Время мира автоматически не перематывается.</p>
    ${plan.complete?"":"<p><strong>Недостаточно материалов — проверка недоступна.</strong></p>"}</div>`;
  if (!plan.complete) { await foundry.applications.api.DialogV2.prompt({window:{title:target?"Ремонт":"Создание предмета"},content,ok:{label:"Закрыть"},rejectClose:false});return; }
  const answer = await foundry.applications.api.DialogV2.prompt({window:{title:target?"Ремонт":"Создание предмета"},position:{width:640},content,
    ok:{label:"Проверка и расход материалов",callback:(_event,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false});
  if(!answer) return;
  if(!answer.time || (needsTools&&!answer.borrowTools) || (needsForge&&!answer.forge)) throw new Error("Подтвердите доступ к инструментам/кузнице и затраченное время.");
  return inventoryWrite(actor,async()=>{
    requireRecipe(actor, recipeItem, target);
    const fresh = materialPlan(actor.items,recipe.components,references);
    if(!fresh.complete) throw new Error("Материалы изменились; откройте рецепт заново.");
    const signature = JSON.stringify(target?.system.toObject?.()??target?.system);
    const check = await workshopCheck(actor,{name:`${target?"Ремонт":"Изготовление"}: ${target?.name??result.name}`,skill:recipe.category==="formula"?"alchemy":"crafting",dc:recipe.dc,bonus,details:target?"СЛ чертежа − 5 + 2 за усиление. Полное восстановление.":"Физический рецепт даёт +2."});
    if(target && signature!==JSON.stringify(target.system.toObject?.()??target.system)) throw new Error("Состояние предмета изменилось во время броска; материалы сохранены.");
    const currentPlan = materialPlan(actor.items,recipe.components,references);
    if(JSON.stringify(currentPlan.expenses)!==JSON.stringify(fresh.expenses)) throw new Error("Запасы изменились во время броска; материалы сохранены.");
    const updates = target&&check.success ? [{_id:target.id,[`system.${conditionKey(target)}.value`]:effectiveItem(target)[conditionKey(target)].max}] : [];
    await inventoryTransaction(actor,{expenses:fresh.expenses,updates,creates:!target&&check.success?[copyPhysical(result,recipe.quantity)]:[]});
    await workshopNotice(actor,`<p>${esc(target?.name??result.name)}: ${check.success?(target?"восстановлено до полного состояния":"создано и добавлено в инвентарь"):"попытка не удалась"}. Материалы из списка потрачены.</p>`);
    if(!check.success) await salvage(actor,recipe,fresh, references);
  });
}
async function salvage(actor,recipe,plan,references) {
  const alchemy=recipe.category==="formula";
  const consent=await foundry.applications.api.DialogV2.confirm({window:{title:"Спасти компоненты?"},content:`<p>Немедленная повторная проверка, СЛ ${recipe.dc}. ${alchemy?"При успехе можно вернуть одну использованную субстанцию в чистом виде.":"При успехе возвращается половина каждого потраченного компонента, округляя вверх."}</p>`,rejectClose:false});
  if(!consent) return;
  const check=await workshopCheck(actor,{name:"Спасение компонентов",skill:alchemy?"alchemy":"crafting",dc:recipe.dc});
  if(!check.success)return;
  if(alchemy){
    const substances=[...new Set(recipe.components.filter(c=>c.substance).map(c=>c.substance))];
    if(!substances.length)return;
    const substance=await foundry.applications.api.DialogV2.prompt({window:{title:"Сохранённая субстанция"},content:`<label>Субстанция<select name="substance">${substances.map(s=>`<option value="${s}">${esc(SUBSTANCES.find(x=>x.id===s)?.name??s)}</option>`).join("")}</select></label>`,ok:{label:"Сохранить",callback:(_e,b)=>new FormData(b.form).get("substance")},rejectClose:false});
    if(!substance)return;
    // Core does not specify a pure substance's market price or weight. Keep unknown defaults, no invented price.
    await actor.createEmbeddedDocuments("Item",[{name:`Чистая субстанция: ${SUBSTANCES.find(s=>s.id===substance).name}`,type:"equipment",system:{ruleId:`substance.${substance}`,kind:"material",quantity:1,material:{substance},source:"Спасение компонентов, стр. 142; вес и цена не указаны"}}]);
  } else {
    const creates=plan.rows.map(row=>copyPhysical(references.get(row.uuid),Math.ceil(row.quantity/2)));
    await actor.createEmbeddedDocuments("Item",creates);
  }
}
