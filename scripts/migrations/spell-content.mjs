import { SYSTEM_ID } from "../config.mjs";
import { spellSources,spellFolders } from "../data/spells.mjs";

export function registerSpellContentMigration() {
  game.settings.register(SYSTEM_ID,"spellContentVersion",{scope:"world",config:false,type:Number,default:0});
}

/** Append only missing canonical records; preserve imported copies, custom writing and pack locks. */
export async function migrateSpellContent() {
  if(game.user!==game.users.activeGM||game.settings.get(SYSTEM_ID,"spellContentVersion")>=1)return;
  const pack=game.packs.get(`${SYSTEM_ID}.spells`);
  if(!pack)return;
  const index=await pack.getIndex({fields:["system.ruleId"]});
  const known=new Set(Array.from(index.values(),entry=>entry.system?.ruleId));
  const missing=spellSources().filter(source=>!known.has(source.system.ruleId));
  for(const source of missing)if(index.has(source._id))throw new Error(`ID магии ${source._id} занят: ${source.name}.`);
  if(missing.length) {
    const folders=spellFolders(),needed=new Set(missing.map(source=>source.folder));
    for(const folder of folders)if(needed.has(folder._id)&&folder.folder)needed.add(folder.folder);
    const createFolders=folders.filter(folder=>needed.has(folder._id)&&!pack.folders.has(folder._id));
    const locked=pack.locked;
    try {
      if(locked)await pack.configure({locked:false});
      // Parents must exist before their children; normal entries retain their existing folders.
      for(const folder of createFolders)await foundry.documents.Folder.implementation.createDocuments([folder],{pack:pack.collection,keepId:true});
      const created=await foundry.documents.Item.implementation.createDocuments(missing,{pack:pack.collection,keepId:true});
      if(created.length!==missing.length)throw new Error("Добавлены не все инвокации; обновление повторится при следующем входе мастера.");
    }finally {if(locked)await pack.configure({locked:true});}
  }
  await game.settings.set(SYSTEM_ID,"spellContentVersion",1);
}
