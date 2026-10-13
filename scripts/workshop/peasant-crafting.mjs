import { SYSTEM_ID } from "../config.mjs";
import { PEASANT_RITUALS, PEASANT_STEWS, peasantRank } from "../data/peasant-rules.mjs";
import { SUBSTANCES, available } from "../data/workshop.mjs";
import { peasantMaterialPlan } from "./peasant-materials.mjs";
import { peasantProduct, peasantEffectSource } from "./peasant-products.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "./transaction.mjs";
import { workshopCheck, workshopNotice } from "./check.mjs";
import { actionQuote, actionUpdate } from "../combat/action-economy.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";

const prompt=(name,content)=>foundry.applications.api.DialogV2.prompt({window:{title:name},position:{width:520},content,rejectClose:false,ok:{label:"Продолжить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))}});
export async function craftPeasant(actor,slug) {
  const level=peasantRank(actor,slug);
  if(!actor.isOwner||!level||!conditionRules(actor).canAct)throw new Error("Нужен изученный навык крестьянина и возможность действовать.");
  let recipe,id=slug;
  if(slug==="wisdom"||slug==="stew"){
    const entries=slug==="wisdom"?PEASANT_RITUALS:PEASANT_STEWS;
    const choice=await prompt(slug==="wisdom"?"Фермерская мудрость":"Мамино рагу",`<label>Выберите <select name="id">${entries.map(row=>`<option value="${row.id}">${esc(row.name)}${row.dc?` · СЛ ${row.dc}`:""}</option>`).join("")}</select></label>`);
    if(!choice)return;recipe=entries.find(row=>row.id===choice.id);if(!recipe)return;id=recipe.id;
  } else if(slug==="panacea"){
    const choice=await prompt("Панацея: три разные субстанции",[0,1,2].map(i=>`<label>Субстанция ${i+1}<select name="s${i}">${SUBSTANCES.map((s,n)=>`<option value="${s.id}" ${n===i?"selected":""}>${s.name}</option>`).join("")}</select></label>`).join(""));
    if(!choice)return;const selected=[choice.s0,choice.s1,choice.s2];
    if(new Set(selected).size!==3||selected.some(id=>!SUBSTANCES.some(s=>s.id===id)))throw new Error("Нужны три разные субстанции.");
    recipe={name:"Панацея от всех бед",substances:Object.fromEntries(selected.map(id=>[id,1])),description:`Шанс ${level*5}% снять отравление, опьянение и тошноту. Портится через сутки.`};
  } else if(slug==="grog")recipe={name:"Грог",ingredients:1,alcohol:true,dc:14,description:`Стойкость СЛ ${12+level}, иначе опьянение${level>=5?" с удвоенными штрафами":""}.`};
  else return;
  const plan=peasantMaterialPlan(actor,recipe);
  if(!plan.complete)throw new Error(`Не хватает компонентов: ${plan.missing.join("; ")}.`);
  const cooking=slug==="stew",timed=cooking||slug==="panacea";
  if(cooking&&!Array.from(actor.items).some(item=>item.system.ruleId==="gear.cooking-tools"&&available(item)))throw new Error("Нужны принадлежности для готовки при себе.");
  const confirmed=await prompt(recipe.name,`<p>${esc(recipe.description)}</p>${recipe.dc?`<p>СЛ ${recipe.dc}.</p>`:""}<p>${cooking?"1 час · 6 порций · раз в день":slug==="panacea"?"10 минут · 1 порция":"Одно действие"}.</p>${plan.expenses.length?`<p>Будут израсходованы:</p><ul>${plan.expenses.map(row=>`<li>${esc(row.name)} ×${row.quantity}</li>`).join("")}</ul>`:""}${timed?'<label><input type="checkbox" name="time"> Время приготовления прошло</label>':""}`);
  if(!confirmed)return;if(timed&&!confirmed.time)throw new Error("Подтвердите прошедшее время приготовления.");
  // Choose the circle location before rolling or consuming components, so cancel is safe.
  const circle=id==="circle"?await (await import("../combat/peasant-circle.mjs")).choosePeasantCircle(actor):null;
  if(id==="circle"&&!circle)return;
  return inventoryWrite(actor,async()=>{
    if(peasantRank(actor,slug)!==level||!conditionRules(actor).canAct)throw new Error("Навык или состояние изменились; откройте действие заново.");
    const now=game.time.worldTime,last=actor.flags?.[SYSTEM_ID]?.peasantCookedDay;
    if(cooking&&last===Math.floor(now/86400))throw new Error("Сегодня Мамино рагу уже приготовлено.");
    const current=peasantMaterialPlan(actor,recipe);
    if(!current.complete||JSON.stringify(current.expenses)!==JSON.stringify(plan.expenses))throw new Error("Компоненты изменились; откройте приготовление заново.");
    const action=timed?null:actionQuote(actor);
    const check=recipe.dc||cooking&&id==="mothers"?await workshopCheck(actor,{name:recipe.name,skill:`profession.peasant.${slug}`,dc:recipe.dc??0,bonus:action?.penalty??0}):{success:true,total:0};
    const creates=[],effects=[];let region;
    if(check.success){
      if(cooking)creates.push(peasantProduct(`stew.${id}`,recipe.name,level,{quantity:6,dc:check.total,description:recipe.description}));
      else if(id==="circle")region=await (await import("../combat/peasant-circle.mjs")).createPeasantCircle(circle,check.total);
      else if(id==="nightmares")effects.push(peasantEffectSource("nightmares",recipe.name,level,{description:recipe.description}));
      else if(id!=="weather")creates.push(peasantProduct(id,recipe.name,level,{dc:slug==="grog"?12+level:check.total,description:recipe.description,expires:slug==="panacea"?now+86400:null}));
    }
    try{await inventoryTransaction(actor,{expenses:current.expenses,creates,effectCreates:effects,
      actorUpdate:{...(action?actionUpdate(actor,action):{}),...(cooking?{[`flags.${SYSTEM_ID}.peasantCookedDay`]:Math.floor(now/86400)}:{})}});}
    catch(error){if(region)await region.delete();throw error;}
    await workshopNotice(actor,`<p><strong>${esc(recipe.name)}</strong>: ${check.success?cooking?"приготовлено шесть порций":id==="weather"?"успех — ведущий сообщает погоду на сутки":id==="circle"?"создан круг радиусом 20 м":id==="nightmares"?"защита от кошмаров на эту ночь":"создано и добавлено в инвентарь":"неудача, компоненты израсходованы"}.</p>`);
  });
}
