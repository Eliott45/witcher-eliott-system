import { SYSTEM_ID } from "../config.mjs";
import { bestiarySources } from "../data/bestiary.mjs";
export function registerBestiaryMigration(){game.settings.register(SYSTEM_ID,"bestiaryContentVersion",{scope:"world",config:false,type:Number,default:0});}

/** Repair the initial pack's missing embedded records through the live Foundry API. */
export async function migrateBestiaryContent() {
  if(game.user!==game.users.activeGM||game.settings.get(SYSTEM_ID,"bestiaryContentVersion")>=1)return;
  const pack=game.packs.get(`${SYSTEM_ID}.bestiary`);if(!pack)return;
  const documents=await pack.getDocuments(),locked=pack.locked;
  const repairs=bestiarySources().flatMap(source=>{
    const actor=documents.find(actor=>actor.id===source._id);
    // A nonempty collection may be user-edited; leave it intact.
    return actor&&!actor.items.size?[{actor,items:source.items}]:[];
  });
  try {
    if(locked&&repairs.length)await pack.configure({locked:false});
    for(const {actor,items} of repairs) {
      const created=await actor.createEmbeddedDocuments("Item",items,{keepId:true});
      if(created.length!==items.length)throw new Error(`Не удалось восстановить все предметы: ${actor.name}`);
    }
    await game.settings.set(SYSTEM_ID,"bestiaryContentVersion",1);
  } finally {if(locked&&repairs.length)await pack.configure({locked:true});}
}

/** Version 2 (core pp.270–313): append creatures the world pack does not have yet; existing ones stay as edited. */
export const migrateBestiaryCreatures = () => appendMissingCreatures(2);
/** Version 5 (Monster Hunter's Journal p.26): barghests, the barghest leader and Kai. */
export const migrateBestiaryJournalCreatures = () => appendMissingCreatures(5);

async function appendMissingCreatures(version) {
  if(game.user!==game.users.activeGM||game.settings.get(SYSTEM_ID,"bestiaryContentVersion")>=version)return;
  const pack=game.packs.get(`${SYSTEM_ID}.bestiary`);if(!pack)return;
  const index=await pack.getIndex(),locked=pack.locked;
  const missing=bestiarySources().filter(source=>!index.has(source._id));
  try {
    if(locked&&missing.length)await pack.configure({locked:false});
    if(missing.length) {
      const created=await Actor.implementation.createDocuments(missing.map(source=>foundry.utils.deepClone(source)),{pack:pack.collection,keepId:true});
      const createdIds=new Set(created.map(actor=>actor.id));
      if(missing.some(source=>!createdIds.has(source._id)))throw new Error("Не удалось добавить всех существ бестиария. Повторная загрузка продолжит миграцию.");
    }
    await game.settings.set(SYSTEM_ID,"bestiaryContentVersion",version);
    if(missing.length)ui.notifications.info(`Бестиарий: добавлено существ — ${missing.length}.`);
  } finally {if(locked&&missing.length)await pack.configure({locked:true});}
}
