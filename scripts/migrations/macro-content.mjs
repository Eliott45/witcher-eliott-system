import { SYSTEM_ID } from "../config.mjs";
import { MACRO_SOURCES } from "../data/macros.mjs";

export async function migrateMacroContent() {
  if (!game.users.activeGM?.isSelf) return;
  const pack = game.packs.get(`${SYSTEM_ID}.macros`);
  if (!pack) return;
  await pack.getIndex();
  const missing = MACRO_SOURCES.filter(source => !pack.index.has(source._id));
  if (!missing.length) return;
  const locked = pack.locked;
  try {
    if (locked) await pack.configure({locked:false});
    await foundry.documents.Macro.createDocuments(missing,{pack:pack.collection,keepId:true});
  } finally { if (locked) await pack.configure({locked:true}); }
}
