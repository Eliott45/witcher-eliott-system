import { SYSTEM_ID } from "../config.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { chooseReference } from "./reference-picker.mjs";

export async function selectCatalogItem(title, predicate = ()=>true, { hint = "Можно выбрать предмет из каталога или созданный предмет мира." } = {}) {
  const documents=[...(await game.packs.get(`${SYSTEM_ID}.equipment`).getDocuments()),...game.items].filter(item=>isPhysical(item)&&predicate(item));
  const id=await chooseReference("workshop","",{title,hint,entries:documents.map(item=>({id:item.uuid,label:item.name,img:item.img,group:item.type,groupLabel:game.i18n.localize(`TYPES.Item.${item.type}`),summary:item.system.properties??"",details:[]})),groups:Object.fromEntries([...new Set(documents.map(item=>item.type))].map(type=>[type,game.i18n.localize(`TYPES.Item.${type}`)]))});
  return documents.find(item=>item.uuid===id);
}
