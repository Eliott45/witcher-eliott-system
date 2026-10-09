import { SYSTEM_ID } from "../config.mjs";
import { spellSources,spellFolders } from "../data/spells.mjs";
import { SPELL_TARGET_BY_ID } from "../data/spell-targets.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";

// 2: append missing magic. 3: fill the new «Цель» field of stock entries that do not have one yet.
export const SPELL_CONTENT_VERSION=3;

/** Only empty targets are filled: a target chosen by hand is kept. */
export function spellTargetUpdate(item) {
  const target=SPELL_TARGET_BY_ID[item.system?.ruleId];
  if(item.type!=="spell"||!target||(item.system.target??[]).length)return {};
  return {"system.target":[...target]};
}
const updatesFor=items=>Array.from(items).flatMap(item=>{const update=spellTargetUpdate(item);return Object.keys(update).length?[{_id:item.id??item._id,...update}]:[];});
async function withUnlocked(pack,work) {
  const locked=pack.locked;
  try {if(locked)await pack.configure({locked:false});return await work();}
  finally {if(locked)await pack.configure({locked:true});}
}

export function registerSpellContentMigration() {
  game.settings.register(SYSTEM_ID,"spellContentVersion",{scope:"world",config:false,type:Number,default:0});
}

/** Append only missing canonical records; preserve imported copies, custom writing and pack locks. */
export async function migrateSpellContent() {
  const version=game.settings.get(SYSTEM_ID,"spellContentVersion");
  if(game.user!==game.users.activeGM||version>=SPELL_CONTENT_VERSION)return;
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
      if(created.length!==missing.length)throw new Error("Добавлена не вся магия; обновление повторится при следующем входе мастера.");
    }finally {if(locked)await pack.configure({locked:true});}
  }
  const stock=updatesFor(await pack.getDocuments());
  if(stock.length)await withUnlocked(pack,()=>foundry.documents.Item.implementation.updateDocuments(stock,{pack:pack.collection,broadcast:false}));
  const world=updatesFor(game.items);
  if(world.length)await foundry.documents.Item.implementation.updateDocuments(world);
  const actors=new Map(Array.from(game.actors,actor=>[actor.uuid,actor]));
  for(const scene of game.scenes)for(const token of scene.tokens)if(!token.actorLink&&token.actor)actors.set(token.actor.uuid,token.actor);
  for(const actor of actors.values()){const updates=updatesFor(actor.items);if(updates.length)await inventoryWrite(actor,()=>actor.updateEmbeddedDocuments("Item",updates));}
  // Bestiary mages and pregenerated casters carry their own copies.
  for(const name of ["bestiary","pregens"]) {
    const actorPack=game.packs.get(`${SYSTEM_ID}.${name}`);
    if(!actorPack)continue;
    const repairs=(await actorPack.getDocuments()).map(actor=>({actor,updates:updatesFor(actor.items)})).filter(entry=>entry.updates.length);
    if(repairs.length)await withUnlocked(actorPack,async()=>{for(const {actor,updates} of repairs)await actor.updateEmbeddedDocuments("Item",updates,{broadcast:false});});
  }
  await game.settings.set(SYSTEM_ID,"spellContentVersion",SPELL_CONTENT_VERSION);
}
