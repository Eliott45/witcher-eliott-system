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
