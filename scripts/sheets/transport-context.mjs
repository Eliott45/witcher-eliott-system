import { isTransport, isMount, canHitch, transportSpeed, TRANSPORT_TYPES, TACK_SLOTS } from "../data/transport.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { browseEquipmentCatalog } from "./equipment-browser.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { moveItemToContainer } from "./container-actions.mjs";
import { reportPreferencesError } from "./sheet-preferences.mjs";

export function transportContext(actor, inventory, selectedId) {
  const carriers=Array.from(actor.items??[]).filter(isTransport);
  const selected=carriers.find(item=>item.id===selectedId)??carriers[0];
  const fleet=carriers.map(item=>({id:item.id,name:item.name,img:item.img,capacity:item.system.capacity,selected:item.id===selected?.id}));
  if(!selected)return {fleet,selected:null};
  const row=inventory.items.find(row=>row.id===selected.id), data=selected.system.transport;
  const mount=carriers.find(item=>item.id===data.mountId&&isMount(item));
  const wagon=carriers.find(item=>item.system.transport.mountId===selected.id);
  const speed=transportSpeed(selected,actor.items);
  return {fleet,selected:{...row,typeLabel:TRANSPORT_TYPES.find(type=>type.id===data.type)?.name??"Транспорт",isMount:isMount(selected),isWagon:data.type==="wagon",
    speed:speed??"—",speedHint:data.type==="wagon"?`СКОР животного ${data.speedModifier>=0?"+":""}${data.speedModifier}; груз повозки учитывается отдельно.`:"СКОР с учётом установленного седла.",
    health:data.health,athletics:data.athletics,handling:`${data.handling>=0?"+":""}${data.handling}`,mountName:mount?.name??"Не запряжена",wagonName:wagon?.name??"Без повозки",
    slots:TACK_SLOTS.map(slot=>{
      const item=Array.from(actor.items).find(item=>item.system.containerId===selected.id&&item.system.equipped&&item.system.tack?.slot===slot.id);
      return {...slot,itemId:item?.id??"",itemName:item?.name??"Не установлено",img:item?.img??"",condition:item?.system.tack?.stoppingPower?.max?item.system.tack.stoppingPower:null};
    })}};
}
const choose=async(title,items,empty="")=>chooseReference("transport","",{title,hint:"",groups:{},entries:[...(empty?[{id:"none",label:empty,summary:"",details:[]}]:[]),...items.map(item=>({id:item.id,label:item.name,img:item.img,summary:item.system.properties??"",details:[]}))]});

export async function fitTack(actor,mountId,itemId,slot) {
  if(!actor.isOwner)return;
  return inventoryWrite(actor,async()=>{
    const mount=actor.items.get(mountId),item=actor.items.get(itemId);
    if(!isMount(mount)||!TACK_SLOTS.some(entry=>entry.id===slot)||itemId&&(!item||item.system.tack?.slot!==slot||item.system.quantity!==1))throw new Error("Нужны животное и один подходящий предмет упряжи.");
    const changes=Array.from(actor.items).filter(gear=>gear.system.containerId===mountId&&gear.system.equipped&&gear.system.tack?.slot===slot).map(gear=>({_id:gear.id,"system.equipped":false}));
    if(item)changes.push({_id:item.id,"system.containerId":mountId,"system.containerSection":"","system.carried":true,"system.equipped":true});
    if(changes.length)await actor.updateEmbeddedDocuments("Item",changes);
  });
}
export async function hitchTransport(actor,vehicleId,mountId) {
  if(!actor.isOwner)return;
  return inventoryWrite(actor,async()=>{
    const vehicle=actor.items.get(vehicleId),mount=actor.items.get(mountId);
    if(mountId&&!mount||!canHitch(vehicle,mount,actor.items))throw new Error("Животное уже запряжено или не подходит.");
    await vehicle.update({"system.transport.mountId":mountId});
  });
}
const guarded=fn=>async function(event,target){if(!this.isEditable)return;try{await fn.call(this,event,target);}catch(error){reportPreferencesError(error);}};
export const transportActions={
  selectTransport:async function(_event,target){this.selectedTransportId=target.dataset.itemId;await this.render();},
  addTransport:guarded(async function(){await browseEquipmentCatalog({actor:this.actor,categories:["transport"],title:"Скакуны и транспорт"});}),
  addTack:guarded(async function(){const documents=[...await game.packs.get("witcher-eliott-system.equipment").getDocuments(),...game.items].filter(item=>item.system.tack?.slot&&item.testUserPermission(game.user,"OBSERVER"));await browseEquipmentCatalog({actor:this.actor,documents,title:"Упряжь и седельные сумки"});}),
  transportCatalog:guarded(async function(_event,target){await browseEquipmentCatalog({actor:this.actor,containerId:target.dataset.itemId,title:"Добавить груз"});}),
  loadTransport:guarded(async function(_event,target){const items=Array.from(this.actor.items).filter(item=>isPhysical(item)&&!isTransport(item)&&item.system.containerId!==target.dataset.itemId);const id=await choose("Переложить из инвентаря",items);if(id)await moveItemToContainer(this.actor,id,target.dataset.itemId);}),
  fitTack:guarded(async function(_event,target){const items=Array.from(this.actor.items).filter(item=>item.system.tack?.slot===target.dataset.slot&&item.system.quantity===1);const id=await choose(`Установить: ${TACK_SLOTS.find(slot=>slot.id===target.dataset.slot).name}`,items,"Снять — оставить в грузе животного");if(id)await fitTack(this.actor,target.dataset.itemId,id==="none"?"":id,target.dataset.slot);}),
  hitchTransport:guarded(async function(_event,target){const vehicle=this.actor.items.get(target.dataset.itemId);const id=await choose("Запрячь животное",Array.from(this.actor.items).filter(item=>isMount(item)&&canHitch(vehicle,item,this.actor.items)),"Отцепить");if(id)await hitchTransport(this.actor,vehicle.id,id==="none"?"":id);})
};
export function bindTransport(sheet) {
  for(const input of sheet.element.querySelectorAll("[data-transport-health]"))input.addEventListener("change",()=>{
    if(!sheet.isEditable)return;
    inventoryWrite(sheet.actor,()=>sheet.actor.items.get(input.dataset.itemId)?.update({"system.transport.health.value":Number(input.value)||0})).catch(reportPreferencesError);
  });
}
