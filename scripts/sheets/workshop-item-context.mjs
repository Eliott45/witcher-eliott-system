import { SUBSTANCES, MONSTER_CATEGORIES, WORKSHOP_BONUS_LABELS, available, effectiveItem, freeSlots, activeOil } from "../data/workshop.mjs";
import { conditionKey, isPhysical } from "../data/physical-items.mjs";
import { durationLabel, craftDialog, findRepairDiagram } from "../workshop/crafting.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";
export async function workshopItemContext(item) {
  if(!isPhysical(item)) return null;
  const recipe=item.system.recipe;
  const components=recipe ? await Promise.all(recipe.components.map(async(entry,index)=>({index,quantity:entry.quantity,name:entry.substance?SUBSTANCES.find(s=>s.id===entry.substance)?.name??entry.substance:(await foundry.utils.fromUuid(entry.uuid))?.name??"Недоступный компонент"}))) : [];
  const oil = activeOil(item,game.time?.worldTime??0);
  const condition=conditionKey(item), effective=effectiveItem(item);
  return { recipe:Boolean(recipe), owned:Boolean(item.actor), repairable:Boolean(item.actor&&conditionKey(item)),
    condition:condition?{...effective[condition],label:condition==="stoppingPower"?"ПБ":"Надёжность"}:null,
    components, resultName:recipe?(await foundry.utils.fromUuid(recipe.resultUuid))?.name??"Выберите результат":"", time:recipe?durationLabel(recipe.time):"",
    tools:recipe?recipe.tools.join(", "):"", upgradeable:Boolean(item.actor&&conditionKey(item)), slots:freeSlots(item),
    installations:item.system.installations.map(entry=>({...entry,zoneLabel:({head:"Голова",torso:"Корпус / руки",legs:"Ноги"})[entry.zone],removable:entry.category==="armor"})), oil:oil?{...oil,targetLabel:MONSTER_CATEGORIES.find(c=>c.id===oil.target)?.name??oil.target}:null, effective,
    bonusPath:bonusPath(item),
    bonusHeading:["mutagen","upgrade"].includes(item.system.kind)?"Бонусы":"Бонусы владельцу, пока предмет экипирован",
    bonuses:(foundry.utils.getProperty(item.system,bonusPath(item))??[]).map((b,index)=>({...b,index,label:WORKSHOP_BONUS_LABELS[b.target]??b.target})),
    canOil:Boolean(item.actor&&item.type==="weapon"&&item.system.category!=="shield"),
    canPrepare:Boolean(item.actor&&available(item)&&!item.system.mutagen.prepared),
    canApply:Boolean(item.actor?.system.details.race==="witcher"&&available(item)&&item.system.mutagen.prepared&&item.actor.system.mutations.length<2),
    isMutagen:item.system.kind==="mutagen", isOil:item.system.alchemy?.category==="oil", isUpgrade:item.system.kind==="upgrade" };
}
export async function selectCatalogItem(title, predicate = ()=>true) {
  const documents=[...(await game.packs.get("witcher-eliott-system.equipment").getDocuments()),...game.items].filter(item=>isPhysical(item)&&predicate(item));
  const id=await chooseReference("workshop","",{title,hint:"Можно выбрать предмет из каталога или созданный предмет мира.",entries:documents.map(item=>({id:item.uuid,label:item.name,group:item.type,groupLabel:game.i18n.localize(`TYPES.Item.${item.type}`),summary:item.system.properties??"",details:[]})),groups:Object.fromEntries([...new Set(documents.map(item=>item.type))].map(type=>[type,game.i18n.localize(`TYPES.Item.${type}`)]))});
  return documents.find(item=>item.uuid===id);
}
const safe = fn => async function(...args) { try { return await fn.apply(this,args); } catch(error) { console.error(error); ui.notifications.error(error.message); } };
const bonusPath = item => ["mutagen","upgrade"].includes(item.system.kind)?`${item.system.kind}.bonuses`:item.type!=="recipe"?"wearerBonuses":"";
export const workshopItemActions = {
 addWorkshopBonus:safe(async function(){
   if(!this.isEditable||!isPhysical(this.item)||!bonusPath(this.item))return;
   const kind=this.item.system.kind;
   const choices=kind==="mutagen"?{"meleeDamage":"Урон в ближнем бою","attributes.body":"Телосложение","attributes.reflex":"Реакция","healthMax":"Максимум ПЗ","vigor":"Предел магии"}:kind==="upgrade"?{reliability:"Надёжность",stoppingPower:"ПБ",accuracy:"Точность",weight:"Вес","skills.stealth":"Скрытность"}:{healthMax:"Максимум ПЗ",staminaMax:"Максимум Выносливости",vigor:"Предел магии",meleeDamage:"Урон в ближнем бою","skills.courage":"Храбрость","skills.stealth":"Скрытность"};
   const answer=await foundry.applications.api.DialogV2.prompt({window:{title:"Бонус предмета"},content:`<label>Показатель<select name="target">${Object.entries(choices).map(([id,name])=>`<option value="${id}">${name}</option>`).join("")}</select></label><label>Значение<input type="number" name="value" step="0.1" value="1"></label>`,ok:{label:"Добавить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});
   if(answer&&Object.hasOwn(choices,answer.target))await this.item.update({[`system.${bonusPath(this.item)}`]:[...(foundry.utils.getProperty(this.item.system,bonusPath(this.item))??[]),{target:answer.target,value:Number(answer.value)||0}]});
 }),
 removeWorkshopBonus:safe(async function(_event,target){const path=bonusPath(this.item);if(this.isEditable&&isPhysical(this.item)&&path)await this.item.update({[`system.${path}`]:(foundry.utils.getProperty(this.item.system,path)??[]).filter((_entry,i)=>i!==Number(target.dataset.index))});}),
 craftRecipe:safe(async function(){if(this.isEditable)await craftDialog(this.item.actor,this.item);}),
 repairItem:safe(async function(){if(this.isEditable&&this.item.actor)await craftDialog(this.item.actor,await findRepairDiagram(this.item),this.item);}),
 chooseRecipeResult:safe(async function(){if(!this.isEditable)return;const selected=await selectCatalogItem("Результат рецепта",item=>item.type!=="recipe");if(selected)await this.item.update({"system.recipe.resultUuid":selected.uuid});}),
 addRecipeComponent:safe(async function(){
   if(!this.isEditable)return;
   const choice=await foundry.applications.api.DialogV2.prompt({window:{title:"Компонент рецепта"},content:`<label>Количество<input name="quantity" type="number" min="1" step="1" value="1"></label><label>Источник<select name="substance"><option value="">Конкретный предмет</option>${SUBSTANCES.map(s=>`<option value="${s.id}">${s.name} — любой ингредиент</option>`).join("")}</select></label>`,ok:{label:"Далее",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});
   if(!choice)return;const quantity=Math.max(1,Math.trunc(Number(choice.quantity)||1));
   const selected=choice.substance?null:await selectCatalogItem("Выберите компонент",item=>item.type!=="recipe");if(!choice.substance&&!selected)return;
   await this.item.update({"system.recipe.components":[...this.item.system.recipe.components,{uuid:selected?.uuid??"",substance:choice.substance,quantity}]});
 }),
 removeRecipeComponent:safe(async function(_event,target){if(this.isEditable)await this.item.update({"system.recipe.components":this.item.system.recipe.components.filter((_entry,i)=>i!==Number(target.dataset.index))});}),
 configureRecipeTools:safe(async function(){
   if(!this.isEditable)return;
   const current=this.item.system.recipe.tools;
   const choice=await foundry.applications.api.DialogV2.prompt({window:{title:"Инструменты рецепта"},content:`<label><input type="checkbox" name="crafting" ${current.includes("gear.crafting-tools")?"checked":""}> Инструменты ремесленника</label><label><input type="checkbox" name="alchemy" ${current.includes("gear.alchemy-tools")?"checked":""}> Инструменты алхимика</label>`,ok:{label:"Сохранить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});
   if(choice)await this.item.update({"system.recipe.tools":[...(choice.crafting?["gear.crafting-tools"]:[]),...(choice.alchemy?["gear.alchemy-tools"]:[])]});
 })
};
export { safe as workshopAction, esc };
