import { available } from "../data/workshop.mjs";
import { workshopAction, selectCatalogItem, esc } from "./workshop-item-context.mjs";
import { craftDialog } from "../workshop/crafting.mjs";
import { consumeMutagen, harvestMaterial, harvestMutagen, mutagenFor } from "../workshop/mutagens.mjs";
import { acquireEquipment } from "../data/equipment-purchase.mjs";
import { canGenerateCreatureLoot, pendingLegacyLoot } from "../combat/creature-loot.mjs";
export async function workshopActorContext(actor, {editing=false}={}) {
  const mutations=actor.system.mutations??[];
  const items=Array.from(actor.items??[]);
  const generated=Boolean(actor.system.creature?.lootGenerated), lootRows=actor.system.creature?.loot??[];
  const harvest=await Promise.all((actor.system.harvest??[]).map(async row=>{
    const pendingRoll=Boolean(row.formula&&!generated&&!row.attempted);
    return {...row,name:(await foundry.utils.fromUuid(row.uuid))?.name??"Недоступный предмет",pendingRoll,
      amount:pendingRoll?row.formula:row.quantity,requiresCheck:Boolean(row.skill),
      canExtract:!row.attempted&&!pendingRoll&&row.quantity>0&&Boolean(row.skill)};
  }));
  const pendingMaterials=harvest.some(row=>!row.attempted&&!row.skill&&(row.pendingRoll||row.quantity>0));
  return { witcher:actor.system.details.race==="witcher",npc:actor.type==="npc",mutations,free:Math.max(0,2-mutations.length),
    ready:items.filter(item=>item.system.kind==="mutagen"&&available(item)&&mutations.length<2).map(item=>({id:item.id,name:item.name,dc:item.system.mutagen.dc,prepared:item.system.mutagen.prepared})),
    mutagenSource:actor.type==="npc"&&mutagenFor(actor)?{name:mutagenFor(actor).name,harvested:Boolean(actor.flags?.["witcher-eliott-system"]?.mutagenHarvested)}:null,
    recipes:items.filter(item=>item.type==="recipe").map(item=>({id:item.id,name:item.name,dc:item.system.recipe.dc})),
    harvest,loot:{editing,rows:lootRows.map(row=>({...row,manual:["Случайные предметы","Случайная руна"].includes(row.name)})),generated,hasRows:lootRows.length>0,
      hasHarvest:harvest.length>0,hasPending:canGenerateCreatureLoot(actor),
      isGM:Boolean(game.user.isGM),canGenerate:Boolean(game.user.isGM&&actor.isOwner&&game.user===game.users.activeGM),
      legacy:pendingLegacyLoot(actor).length>0,materialsOnly:generated&&pendingMaterials} };
}
export const workshopActorActions={
 craftInventory:workshopAction(async function(_event,target){if(this.isEditable)await craftDialog(this.actor,this.actor.items.get(target.dataset.itemId));}),
 applySheetMutagen:workshopAction(async function(_event,target){if(this.isEditable)await consumeMutagen(this.actor.items.get(target.dataset.itemId));}),
 harvestMutagen:workshopAction(async function(){if(this.isEditable)await harvestMutagen(this.actor);}),
 buyMaterial:workshopAction(async function(){
   if(!this.isEditable)return;
   const item=await selectCatalogItem("Купить материалы",entry=>entry.system.kind==="material");if(!item)return;
   const quantity=await foundry.applications.api.DialogV2.prompt({window:{title:"Покупка материалов"},content:`<p>${esc(item.name)}: ${item.system.price} крон за единицу.</p><label>Количество<input name="quantity" type="number" min="1" step="1" value="1"></label>`,ok:{label:"Купить и списать кроны",callback:(_e,b)=>Number(new FormData(b.form).get("quantity"))},rejectClose:false});
   if(!Number.isInteger(quantity)||quantity<1)return;
   await acquireEquipment(this.actor,item,{purchase:true,quantity});
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
