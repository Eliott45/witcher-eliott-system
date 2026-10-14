import { SYSTEM_ID } from "../config.mjs";
import { MACRO_SOURCES, LEGACY_MACRO_IMAGES } from "../data/macros.mjs";

export async function migrateMacroContent() {
  if (!game.users.activeGM?.isSelf) return;
  const pack = game.packs.get(`${SYSTEM_ID}.macros`);
  if (!pack) return;
  await pack.getIndex();
  const missing = MACRO_SOURCES.filter(source => !pack.index.has(source._id));
  const outdated = MACRO_SOURCES.filter(source => LEGACY_MACRO_IMAGES[source._id] && pack.index.get(source._id)?.img === LEGACY_MACRO_IMAGES[source._id]);
  // World copies dragged to the hotbar keep their own image, so the old placeholder is replaced there too.
  const copies = (game.macros ?? []).filter(macro => Object.entries(LEGACY_MACRO_IMAGES).some(([id, img]) => macro.img === img && macro._stats?.compendiumSource?.endsWith(`.Macro.${id}`)));
  for (const macro of copies) await macro.update({img:MACRO_SOURCES.find(source => macro._stats.compendiumSource.endsWith(`.Macro.${source._id}`)).img});
  if (!missing.length && !outdated.length) return;
  const locked = pack.locked;
  try {
    if (locked) await pack.configure({locked:false});
    if (missing.length) await foundry.documents.Macro.createDocuments(missing,{pack:pack.collection,keepId:true});
    if (outdated.length) await foundry.documents.Macro.updateDocuments(outdated.map(source => ({_id:source._id,img:source.img})),{pack:pack.collection});
  } finally { if (locked) await pack.configure({locked:true}); }
}
