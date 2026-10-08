import { materialPlan, repairRecipe, available, SUBSTANCES, effectiveItem, equipmentUuid } from "../data/workshop.mjs";
import { conditionKey, isPhysical } from "../data/physical-items.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { recipeAccess, salvagedComponents, craftingDuration } from "../data/crafting.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { workshopCheck, workshopBase, workshopNotice } from "./check.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { diagramIndex, diagramFor, isRepairable } from "./repair.mjs";
import { PURE_SUBSTANCES } from "../data/workshop-materials.mjs";
import { SYSTEM_ID } from "../config.mjs";

export async function resolveRequirements(recipe) {
  const refs = new Map();
  for (const component of recipe.components) if (component.uuid && !refs.has(component.uuid)) {
    const item = await foundry.utils.fromUuid(component.uuid);
    if (!item || item.documentName !== "Item" || !item.testUserPermission(game.user, "LIMITED")) throw new Error("Не найден или недоступен компонент рецепта.");
    refs.set(component.uuid, item);
  }
  return refs;
}
export const durationLabel = craftingDuration;
export async function findRepairDiagram(item) {
  const diagram = diagramFor(item, await diagramIndex(item.actor));
  const recipe = diagram && await foundry.utils.fromUuid(diagram.uuid);
  if (recipe?.type === "recipe") return recipe;
  throw new Error("Для ремонта нужен чертёж этого предмета с компонентами и СЛ. Создайте свой чертёж с ссылкой на исходный предмет.");
}
function requireRecipe(actor, item, repair) {
  const recipe = item.system.recipe;
  const access = recipeAccess(actor, item);
  if (!repair && (!actor.items.get(item.id) || !(access.physical || access.memorized))) throw new Error("Нужен физический или запомненный рецепт в инвентаре персонажа.");
  if (!repair && recipe.category === "diagram" && ["master", "grandmaster"].includes(recipe.grade) && workshopBase(actor, "profession.craftsman.master-crafting") === null)
    throw new Error("Для чертежа мастера или великого мастера нужна изученная способность «Мастерская работа».");
  if (!recipe.resultUuid || !recipe.components.length || recipe.dc <= 0 || recipe.time <= 0) throw new Error("Заполните результат, компоненты, сложность и время рецепта.");
  if ((recipe.category === "diagram" || item.flags?.[SYSTEM_ID]?.exactComponents) && recipe.components.some(row => !row.uuid || row.substance)) throw new Error("Для этого рецепта нужны указанные материалы; замена алхимическими субстанциями недоступна.");
}
const toolNames = {"gear.crafting-tools":"Инструменты ремесленника","gear.alchemy-tools":"Инструменты алхимика"};
export function craftingFacilities(actor, recipe) {
  const present = id => actor.items.some(item => available(item) && item.system.ruleId === id);
  const tools = recipe.tools.map(id => ({ id, name: toolNames[id] ?? id, present: present(id) }));
  return { tools, needsTools: tools.some(tool => !tool.present), needsForge: recipe.forge && !present("gear.forge") };
}
export async function craftingPreview(actor, item) {
  requireRecipe(actor, item, false);
  const recipe = item.system.recipe;
  const result = await foundry.utils.fromUuid(recipe.resultUuid);
  if (!result || !isPhysical(result) || result.type === "recipe" || !result.testUserPermission(game.user, "LIMITED")) throw new Error("Результат рецепта недоступен.");
  const references = await resolveRequirements(recipe);
  const plan = materialPlan(actor.items, recipe.components, references);
  return { plan, materials: plan.rows.map(row => ({
    name: row.substance ? SUBSTANCES.find(s => s.id === row.substance)?.name ?? row.substance : references.get(row.uuid).name,
    quantity: row.quantity, supplied: row.quantity - row.missing, missing: row.missing
  })), ...craftingFacilities(actor, recipe) };
}
const activeCrafts = new Set();
/** Dialog is a preview; requirements are resolved and checked again inside the actor's write queue. */
export async function craftDialog(actor, recipeItem, target = null) {
  if (!actor?.isOwner) return;
  if (activeCrafts.has(actor.uuid)) throw new Error("Сначала завершите открытую проверку изготовления.");
  activeCrafts.add(actor.uuid);
  try { return await executeCraftDialog(actor, recipeItem, target); }
  finally { activeCrafts.delete(actor.uuid); }
}
async function executeCraftDialog(actor, recipeItem, target) {
  requireRecipe(actor, recipeItem, target);
  const original = recipeItem.system.recipe.toObject ? recipeItem.system.recipe.toObject() : structuredClone(recipeItem.system.recipe);
  const recipe = target ? repairRecipe(original, target) : original;
  const result = await foundry.utils.fromUuid(recipe.resultUuid);
  if (!result || !isPhysical(result) || result.type === "recipe" || !result.testUserPermission(game.user, "LIMITED")) throw new Error("Результат рецепта недоступен.");
  const validateTarget = () => {
    if (target && (actor.items.get(target.id) !== target || !isRepairable(target)))
      throw new Error("Починить можно только сломанное оружие или броню при себе: ПБ или надёжность должны быть 0.");
  };
  validateTarget();
  const references = await resolveRequirements(recipe);
  const plan = materialPlan(actor.items, recipe.components, references);
  const { tools, needsTools, needsForge } = craftingFacilities(actor, recipe);
  const bonus = !target && recipeAccess(actor, recipeItem).physical ? 2 : 0;
  const workLabel = target ? "Починка" : recipe.category === "formula" ? "Алхимия" : "Изготовление";
  const content = `<div class="witcher-workshop-dialog"><h3>${esc(target ? target.name : result.name)}</h3>
    <p>СЛ <b>${recipe.dc}</b> · ${target ? "Длительность починки определяет ведущий" : durationLabel(recipe.time)} · ${recipe.category==="formula"?"Алхимия":"Изготовление"} + РЕМ + 1d10</p>
    <p>${target ? "Полное восстановление; СЛ чертежа − 5 + 2 за установленное усиление/руну/глиф." : `Бонус физического рецепта: +${bonus}. Результат: ${recipe.quantity} шт.`}</p>
    <table><thead><tr><th>Компонент</th><th>Нужно / выделено</th><th>Будет потрачено</th></tr></thead><tbody>${plan.rows.map(row=>`<tr><td>${esc(row.substance ? SUBSTANCES.find(s=>s.id===row.substance)?.name??row.substance : references.get(row.uuid).name)}</td><td>${row.quantity} / ${row.quantity-row.missing}${row.missing?` · не хватает ${row.missing}`:""}</td><td>${row.used.map(entry=>`${esc(entry.name)} ×${entry.quantity}`).join(", ")||"—"}</td></tr>`).join("")}</tbody></table>
    <p>${tools.map(tool=>`${esc(tool.name)}: ${tool.present?"есть":"нет"}`).join(" · ")}${recipe.forge ? ` · Кузница: ${needsForge?"нужна":"есть"}`:""}</p>
    ${needsTools?'<label><input type="checkbox" name="borrowTools"> Нужные инструменты доступны в мастерской</label>':""}
    ${needsForge?'<label><input type="checkbox" name="forge"> Есть доступ к стационарной кузнице</label>':""}
    <label><input type="checkbox" name="time"> ${target ? "Работа завершена" : `Работа завершена: затрачено ${durationLabel(recipe.time)}`}</label><p>Материалы расходуются и при неудаче. Сразу после провала можно попытаться ${recipe.category === "formula" ? "спасти субстанцию" : "переработать материалы"}.</p>
    ${plan.complete?"":"<p><strong>Недостаточно материалов — проверка недоступна.</strong></p>"}</div>`;
  if (!plan.complete) { await foundry.applications.api.DialogV2.prompt({classes:["witcher-crafting-dialog"],window:{title:workLabel},content,ok:{label:"Закрыть"},rejectClose:false});return; }
  const answer = await foundry.applications.api.DialogV2.prompt({classes:["witcher-crafting-dialog"],window:{title:workLabel},position:{width:640},content,
    ok:{label:"Проверка и расход материалов",callback:(_event,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false});
  if(!answer) return;
  if(!answer.time || (needsTools&&!answer.borrowTools) || (needsForge&&!answer.forge)) throw new Error("Подтвердите доступ к инструментам/кузнице и затраченное время.");
  return inventoryWrite(actor,async()=>{
    const validate = () => {
      validateTarget();
      requireRecipe(actor, recipeItem, target);
      const current = recipeItem.system.recipe.toObject?.() ?? recipeItem.system.recipe;
      const facilities = craftingFacilities(actor, recipe);
      if (JSON.stringify(current) !== JSON.stringify(original) || (!target && bonus !== (recipeAccess(actor, recipeItem).physical ? 2 : 0))) throw new Error("Рецепт изменился; откройте изготовление заново.");
      if ((facilities.needsTools && !answer.borrowTools) || (facilities.needsForge && !answer.forge)) throw new Error("Инструменты или кузница больше недоступны.");
    };
    validate();
    const fresh = materialPlan(actor.items,recipe.components,references);
    if(!fresh.complete) throw new Error("Материалы изменились; откройте рецепт заново.");
    const signature = JSON.stringify(target?.system.toObject?.()??target?.system);
    const check = await workshopCheck(actor,{name:`${workLabel}: ${target?.name??result.name}`,skill:recipe.category==="formula"?"alchemy":"crafting",dc:recipe.dc,bonus,details:target?"СЛ чертежа − 5 + 2 за усиление. Полное восстановление.":bonus?"Физический рецепт: +2.":"По памяти, без бонуса физического рецепта."});
    validate();
    if(target && signature!==JSON.stringify(target.system.toObject?.()??target.system)) throw new Error("Состояние предмета изменилось во время броска; материалы сохранены.");
    const currentPlan = materialPlan(actor.items,recipe.components,references);
    if(JSON.stringify(currentPlan.expenses)!==JSON.stringify(fresh.expenses)) throw new Error("Запасы изменились во время броска; материалы сохранены.");
    const updates = target&&check.success ? [{_id:target.id,[`system.${conditionKey(target)}.value`]:effectiveItem(target)[conditionKey(target)].max}] : [];
    await inventoryTransaction(actor,{expenses:fresh.expenses,updates,creates:!target&&check.success?[copyPhysical(result,recipe.quantity)]:[]});
    await workshopNotice(actor,`<p><strong>${esc(target?.name??result.name)}</strong>: ${check.success?(target?"восстановлено до полного состояния":`создано ×${recipe.quantity} и добавлено в инвентарь`):"попытка не удалась"}.</p><p>Потрачено: ${fresh.rows.flatMap(row=>row.used).map(row=>`${esc(row.name)} ×${row.quantity}`).join(", ")}.</p>`);
    if(!check.success) await salvage(actor,recipe,fresh, references);
  });
}
async function salvage(actor,recipe,plan,references) {
  const alchemy=recipe.category==="formula";
  const returned = alchemy ? [] : salvagedComponents(plan.rows);
  const substances = SUBSTANCES.filter(substance => plan.rows.some(row => row.substance === substance.id && row.used.some(entry => entry.quantity > 0)));
  if (alchemy && !substances.length) return;
  const content = `<div class="witcher-workshop-dialog"><h3>Неудачную работу ещё можно спасти</h3><p>Одна немедленная повторная проверка, СЛ ${recipe.dc}. ${alchemy?"При успехе одна выбранная субстанция сразу вернётся в инвентарь в чистом виде.":"При успехе возвращается половина каждого потраченного компонента, округляя вверх."}</p>${returned.length?`<ul>${returned.map(row=>`<li>${esc(references.get(row.uuid).name)} ×${row.quantity}</li>`).join("")}</ul>`:""}${alchemy?`<label>Спасти субстанцию<select name="substance">${substances.map(substance=>`<option value="${substance.id}">${esc(substance.name)}</option>`).join("")}</select></label>`:""}</div>`;
  // Choose before rolling: closing a second dialog after success must not discard the reward.
  const options = {classes:["witcher-crafting-dialog"],window:{title:alchemy?"Спасти компоненты?":"Переработка материалов"},content,rejectClose:false};
  const consent = alchemy
    ? await foundry.applications.api.DialogV2.prompt({...options,ok:{label:"Спасти субстанцию",callback:(_e,b)=>new FormData(b.form).get("substance")}})
    : await foundry.applications.api.DialogV2.confirm({...options,yes:{label:"Переработать"},no:{label:"Отказаться"}});
  if(!consent) return;
  if (alchemy && !substances.some(substance => substance.id === consent)) throw new Error("Выберите одну из затраченных субстанций.");
  const check=await workshopCheck(actor,{name:alchemy?"Спасение компонентов":"Переработка материалов",skill:alchemy?"alchemy":"crafting",dc:recipe.dc});
  if(!check.success){await workshopNotice(actor,"<p>Переработка не удалась. Материалы утрачены.</p>");return;}
  if(alchemy){
    const substance = consent;
    const entry=PURE_SUBSTANCES.find(row=>row.id===`substance.${substance}`);
    const source=await foundry.utils.fromUuid(equipmentUuid(entry.documentId)).catch(()=>null);
    const accessible = source?.type === "equipment" && source.system.material?.substance === substance && source.testUserPermission(game.user,"LIMITED");
    const fallback = {name:entry.name,type:entry.type,img:entry.img,flags:structuredClone(entry.flags),system:{...structuredClone(entry.system),ruleId:entry.id,quantity:1,carried:true}};
    await inventoryTransaction(actor,{creates:[accessible?copyPhysical(source,1):fallback]});
    await workshopNotice(actor,`<p>Сохранена субстанция: ${esc(SUBSTANCES.find(s=>s.id===substance).name)} ×1.</p>`);
  } else {
    const creates=returned.map(row=>copyPhysical(references.get(row.uuid),row.quantity));
    await inventoryTransaction(actor,{creates});
    await workshopNotice(actor,`<p>Переработка удалась. Возвращено в инвентарь: ${returned.map(row=>`${esc(references.get(row.uuid).name)} ×${row.quantity}`).join(", ")}.</p>`);
  }
}
