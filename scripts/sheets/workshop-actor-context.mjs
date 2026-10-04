import { available } from "../data/workshop.mjs";
import { workshopAction, selectCatalogItem, esc } from "./workshop-item-context.mjs";
import { craftDialog } from "../workshop/crafting.mjs";
import { applyMutagen, harvestMaterial } from "../workshop/mutagens.mjs";
import { copyPhysical, inventoryTransaction } from "../workshop/transaction.mjs";
import { inventoryWrite } from "./inventory-context.mjs";
export async function workshopActorContext(actor) {
  const mutations=actor.system.mutations??[];
  const items=Array.from(actor.items??[]);
  return { witcher:actor.system.details.race==="witcher",npc:actor.type==="npc",mutations,free:Math.max(0,2-mutations.length),
    ready:items.filter(item=>item.system.kind==="mutagen"&&available(item)&&item.system.mutagen.prepared&&mutations.length<2).map(item=>({id:item.id,name:item.name})),
    recipes:items.filter(item=>item.type==="recipe").map(item=>({id:item.id,name:item.name,dc:item.system.recipe.dc})),
    harvest:await Promise.all((actor.system.harvest??[]).map(async row=>({...row,name:(await foundry.utils.fromUuid(row.uuid))?.name??"Недоступный предмет"}))) };
}
export const workshopActorActions={
 craftInventory:workshopAction(async function(_event,target){if(this.isEditable)await craftDialog(this.actor,this.actor.items.get(target.dataset.itemId));}),
 applySheetMutagen:workshopAction(async function(_event,target){if(this.isEditable)await applyMutagen(this.actor.items.get(target.dataset.itemId));}),
 buyMaterial:workshopAction(async function(){
   if(!this.isEditable)return;
   const item=await selectCatalogItem("Купить материалы",entry=>entry.system.kind==="material");if(!item)return;
   const quantity=await foundry.applications.api.DialogV2.prompt({window:{title:"Покупка материалов"},content:`<p>${esc(item.name)}: ${item.system.price} крон за единицу.</p><label>Количество<input name="quantity" type="number" min="1" step="1" value="1"></label>`,ok:{label:"Купить и списать кроны",callback:(_e,b)=>Number(new FormData(b.form).get("quantity"))},rejectClose:false});
   if(!Number.isInteger(quantity)||quantity<1)return;
   await inventoryWrite(this.actor,async()=>{const cost=quantity*item.system.price;if(this.actor.system.crowns<cost)throw new Error("Недостаточно крон.");await inventoryTransaction(this.actor,{creates:[copyPhysical(item,quantity)],actorUpdate:{"system.crowns":this.actor.system.crowns-cost}});});
 }),
 addHarvest:workshopAction(async function(){
   if(!this.isEditable||this.actor.type!=="npc")return;
   const item=await selectCatalogItem("Доступная добыча",entry=>["material","mutagen"].includes(entry.system.kind));if(!item)return;
   const mutagen=item.system.kind==="mutagen";
   const values=await foundry.applications.api.DialogV2.prompt({window:{title:"Добыча чудовища"},content:`<p>${esc(item.name)}</p><label>Количество<input name="quantity" type="number" min="1" step="1" value="1"></label><label>Проверка<select name="skill"><option value="">Без проверки</option><option value="profession.witcher.training" ${mutagen?"selected":""}>Подготовка ведьмака</option><option value="wildernessSurvival">Выживание</option><option value="alchemy">Алхимия</option></select></label><label>Сложность<input name="dc" type="number" min="0" step="1" value="${mutagen?16:0}"></label><p>Количество берётся из добычи NPC. Для обычных компонентов книга не задаёт общей СЛ разделки.</p>`,ok:{label:"Добавить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});
   if(!values)return;
   await this.actor.update({"system.harvest":[...this.actor.system.harvest,{id:foundry.utils.randomID(),uuid:item.uuid,quantity:Math.max(1,Math.trunc(Number(values.quantity)||1)),skill:values.skill,dc:Math.max(0,Math.trunc(Number(values.dc)||0)),attempted:false}]});
 }),
 harvestMaterial:workshopAction(async function(_event,target){if(this.isEditable)await harvestMaterial(this.actor,target.dataset.harvestId);}),
 removeHarvest:workshopAction(async function(_event,target){if(this.isEditable)await this.actor.update({"system.harvest":this.actor.system.harvest.filter(row=>row.id!==target.dataset.harvestId)});})
};
