import { SYSTEM_ID } from "../config.mjs";
export function registerPeasantMigration(){game.settings.register(SYSTEM_ID,"peasantContentVersion",{scope:"world",config:false,type:Number,default:0});}
/** Append only; preserve edited core professions, abilities and pack locking. */
export async function migratePeasantContent(){
  if(game.user!==game.users.activeGM||game.settings.get(SYSTEM_ID,"peasantContentVersion")>=1)return;
  for(const name of ["abilities","professions"]){
    const pack=game.packs.get(`${SYSTEM_ID}.${name}`);if(!pack)return;
    const response=await fetch(`systems/${SYSTEM_ID}/pack-sources/${name}.json`,{cache:"no-store"});
    if(!response.ok)throw new Error(`Не удалось загрузить ${name}.`);
    const sources=(await response.json()).filter(item=>item.system.ruleId==="peasant"||item.system.ruleId?.startsWith("profession.peasant."));
    if(sources.length!==(name==="abilities"?10:1))throw new Error("Неполные данные профессии Крестьянин; обновление не завершено.");
    const index=await pack.getIndex({fields:["system.ruleId"]}),existing=new Set(Array.from(index.values(),item=>item.system?.ruleId));
    const missing=sources.filter(item=>!existing.has(item.system.ruleId)),locked=pack.locked;
    if(missing.some(item=>index.has(item._id)))throw new Error("ID новой профессии занят другим документом. Существующий документ сохранён.");
    try{
      if(locked&&missing.length)await pack.configure({locked:false});
      if(missing.length&&name==="abilities"){
        const folders=await fetch(`systems/${SYSTEM_ID}/pack-sources/abilities.folders.json`,{cache:"no-store"});
        if(!folders.ok)throw new Error("Не удалось загрузить папку профессии.");
        const needed=(await folders.json()).filter(folder=>missing.some(item=>item.folder===folder._id)&&!pack.folders.has(folder._id));
        if(needed.length)await foundry.documents.Folder.implementation.createDocuments(needed,{pack:pack.collection,keepId:true});
      }
      if(missing.length){const created=await foundry.documents.Item.implementation.createDocuments(missing,{pack:pack.collection,keepId:true});if(created.length!==missing.length)throw new Error("Не все способности крестьянина добавлены. Обновление продолжится после перезагрузки.");}
    }finally{if(locked&&!pack.locked)await pack.configure({locked:true});}
  }
  await game.settings.set(SYSTEM_ID,"peasantContentVersion",1);
}
