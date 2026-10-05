import { available } from "../data/workshop.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { workshopCheck, workshopNotice } from "./check.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export async function prepareMutagen(item) {
  const actor=item.actor;if(!actor?.isOwner)return;
  if(item.system.kind!=="mutagen" || !available(item) || item.system.mutagen.prepared)throw new Error("Нужен неподготовленный мутаген при себе.");
  const helpers=game.actors.filter(entry=>entry.isOwner);
  const answer=await foundry.applications.api.DialogV2.prompt({window:{title:"Подготовка мутагена"},content:`<p>${esc(item.name)}. Алхимия СЛ ${item.system.mutagen.dc}; 1 час.</p><label>Проверку выполняет<select name="helper">${helpers.map(helper=>`<option value="${helper.id}" ${helper.id===actor.id?"selected":""}>${esc(helper.name)}</option>`).join("")}</select></label><label><input name="time" type="checkbox"> Час подготовки завершён; инструменты алхимика доступны</label><p>Обрабатывается одна порция. Неудачная подготовка расходует её.</p>`,ok:{label:"Подготовить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});
  if(!answer)return;if(!answer.time)throw new Error("Подтвердите подготовку и доступ к инструментам.");
  const helper=game.actors.get(answer.helper);if(!helper?.isOwner)return;
  return inventoryWrite(actor,async()=>{
    if(!available(item)||item.system.mutagen.prepared)throw new Error("Мутаген уже использован.");
    const check=await workshopCheck(helper,{name:`Подготовка: ${item.name}`,skill:"alchemy",dc:item.system.mutagen.dc});
    if(!available(item)||item.system.mutagen.prepared)throw new Error("Мутаген изменился во время проверки; порция не потрачена.");
    const data=copyPhysical(item,1);data.system.mutagen.prepared=true;
    await inventoryTransaction(actor,{expenses:[{itemId:item.id,quantity:1}],creates:check.success?[data]:[]});
  });
}
export async function applyMutagen(item) {
  const actor=item.actor;if(!actor?.isOwner)return;
  const eligible=()=>actor.system.details.race==="witcher" && item.system.kind==="mutagen" && item.system.mutagen.prepared && available(item) && actor.system.mutations.length<2;
  if(!eligible())throw new Error("Нужен ведьмак, подготовленная порция и свободный слот мутагена (максимум 2).");
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Постоянная мутация"},content:`<p>${esc(item.name)} будет израсходован. Бонус станет постоянным, удалить мутаген нельзя. Свободных слотов: ${2-actor.system.mutations.length}.</p><p>${esc(item.system.properties)}</p>`,rejectClose:false});
  if(!confirmed)return;
  return inventoryWrite(actor,async()=>{
    if(!eligible())throw new Error("Слоты или мутаген уже изменились.");
    const mutation={id:foundry.utils.randomID(),sourceUuid:item._stats.compendiumSource||item.uuid,name:item.name,monster:item.system.mutagen.monster,category:"mutagen",properties:item.system.properties,bonuses:foundry.utils.deepClone(item.system.mutagen.bonuses)};
    await inventoryTransaction(actor,{expenses:[{itemId:item.id,quantity:1}],actorUpdate:{"system.mutations":[...actor.system.mutations,mutation]}});
    await workshopNotice(actor,`<p>${esc(actor.name)}: применён ${esc(item.name)}. Эффект постоянный.</p>`);
  });
}
/** Loot is configured on an NPC; no implicit access to someone else's inventory or infinite harvesting. */
export async function harvestMaterial(npc,id) {
  if(!npc.isOwner)return;
  const entry=npc.system.harvest.find(row=>row.id===id);
  if(!entry||entry.attempted)throw new Error("Добыча уже собрана или попытка извлечения потрачена.");
  if(entry.formula&&!npc.system.creature.lootGenerated)throw new Error("Сначала определите случайную добычу в разделе «Сведения».");
  if(entry.quantity<=0)throw new Error("Этого материала в добыче нет.");
  const source=await foundry.utils.fromUuid(entry.uuid);if(!source)throw new Error("Исходный материал недоступен.");
  const actors=game.actors.filter(actor=>actor.isOwner&&actor.id!==npc.id);
  const targetId=await foundry.applications.api.DialogV2.prompt({window:{title:"Получатель добычи"},content:`<label>Персонаж<select name="actor">${actors.map(actor=>`<option value="${actor.id}">${esc(actor.name)}</option>`).join("")}</select></label><p>${esc(source.name)} ×${entry.quantity}. ${entry.skill?`СЛ ${entry.dc}`:"Проверка для этой добычи не задана"}.</p>`,ok:{label:"Извлечь",callback:(_e,b)=>new FormData(b.form).get("actor")},rejectClose:false});
  const actor=game.actors.get(targetId);if(!actor?.isOwner)return;
  return inventoryWrite(npc,async()=>{
    const current=npc.system.harvest.find(row=>row.id===id);if(!current||current.attempted)throw new Error("Попытка уже потрачена.");
    const check=entry.skill?await workshopCheck(actor,{name:`Извлечение: ${source.name}`,skill:entry.skill,dc:entry.dc}):{success:true};
    // Mark before transfer; restore the flag on a failed transfer, never award the same row twice.
    await npc.update({"system.harvest":npc.system.harvest.map(row=>row.id===id?{...row,attempted:true}:row)});
    try {
      if(check.success)await inventoryWrite(actor,()=>actor.createEmbeddedDocuments("Item",[copyPhysical(source,entry.quantity)]));
    } catch(error){await npc.update({"system.harvest":npc.system.harvest.map(row=>row.id===id?{...row,attempted:false}:row)});throw error;}
    await workshopNotice(actor,`<p>${esc(npc.name)}: ${check.success?`получено ${esc(source.name)} ×${entry.quantity}`:"извлечь материал не удалось"}.</p>`);
  });
}
