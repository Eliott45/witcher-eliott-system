import { SYSTEM_ID } from "../config.mjs";
import { CORE_AMMUNITION } from "../data/core-ammunition.mjs";

export function registerEquipmentContentMigration() {
  game.settings.register(SYSTEM_ID, "equipmentContentVersion", { scope: "world", config: false, type: Number, default: 0 });
}

/** Append new canonical entries via Foundry, never open the live LevelDB externally. */
export async function migrateEquipmentContent() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "equipmentContentVersion") >= 1) return;
  const pack = game.packs.get(`${SYSTEM_ID}.equipment`);
  if (!pack) return;
  const index = await pack.getIndex({ fields: ["system.ruleId"] });
  const existing = new Set(Array.from(index.values(), entry => entry.system?.ruleId));
  const missing = CORE_AMMUNITION.filter(entry => !existing.has(entry.id));
  if (missing.length) {
    const load = async filename => {
      const response = await fetch(`systems/${SYSTEM_ID}/pack-sources/${filename}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Не удалось загрузить ${filename}: ${response.status}`);
      return response.json();
    };
    const [sources, folders] = await Promise.all([load("equipment.json"), load("equipment.folders.json")]);
    const documents = missing.map(entry => {
      const source = sources.find(document => document._id === entry.documentId && document.system.ruleId === entry.id);
      if (!source || index.has(entry.documentId)) throw new Error(`Проверьте запись боеприпаса ${entry.id}: источник отсутствует или ID занят.`);
      return source;
    });
    const folderIds = new Set(documents.map(document => document.folder));
    const requiredFolders = folders.filter(folder => folderIds.has(folder._id) && !pack.folders.has(folder._id));
    const locked = pack.locked;
    try {
      if (locked) await pack.configure({ locked: false });
      if (requiredFolders.length) await foundry.documents.Folder.implementation.createDocuments(requiredFolders, { pack: pack.collection, keepId: true });
      const created = await foundry.documents.Item.implementation.createDocuments(documents, { pack: pack.collection, keepId: true });
      if (created.length !== documents.length) throw new Error("Добавлены не все боеприпасы. Обновление будет повторено при следующем входе мастера.");
    } finally { if (locked) await pack.configure({ locked: true }); }
  }
  await game.settings.set(SYSTEM_ID, "equipmentContentVersion", 1);
}
