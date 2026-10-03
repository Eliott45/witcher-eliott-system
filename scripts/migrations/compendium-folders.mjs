import { SYSTEM_ID } from "../config.mjs";

export function registerCompendiumFolderMigration() {
  game.settings.register(SYSTEM_ID, "compendiumFoldersVersion", {
    scope: "world", config: false, type: Number, default: 0
  });
}

/** packFolders handles new worlds; existing worlds can already have explicit folder:null settings. */
export async function migrateCompendiumFolders() {
  const version = game.settings.get(SYSTEM_ID, "compendiumFoldersVersion");
  if (game.user !== game.users.activeGM || version >= 3) return;
  const names = [
    ...(version < 1 ? ["races", "abilities"] : []),
    ...(version < 2 ? ["origins"] : []),
    "family-statuses", "equipment"
  ];
  const packs = names.map(name => game.packs.get(`${SYSTEM_ID}.${name}`));
  if (packs.some(pack => !pack)) return;
  let folder = game.folders.find(entry => entry.type === "Compendium" && entry.name === "Witcher" && !entry.folder);
  folder ??= await foundry.documents.Folder.create({
    name: "Witcher", type: "Compendium", sorting: "a", color: "#947641"
  });
  for (const pack of packs) await pack.setFolder(folder);
  await game.settings.set(SYSTEM_ID, "compendiumFoldersVersion", 3);
}
