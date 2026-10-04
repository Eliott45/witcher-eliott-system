import { SYSTEM_ID } from "../config.mjs";
import { CORE_AMMUNITION } from "../data/core-ammunition.mjs";
import { ELDER_EQUIPMENT } from "../data/elder-equipment.mjs";
import { ammunitionUpdate } from "./ammunition-data.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { equipmentIconUpdate } from "../data/item-icons.mjs";
export const EQUIPMENT_CONTENT_VERSION = 4;

const updatesFor = items => Array.from(items).flatMap(item => {
  const update = { ...ammunitionUpdate(item), ...equipmentIconUpdate(item) };
  return Object.keys(update).length ? [{ _id: item.id ?? item._id, ...update }] : [];
});

export function registerEquipmentContentMigration() {
  game.settings.register(SYSTEM_ID, "equipmentContentVersion", { scope: "world", config: false, type: Number, default: 0 });
}

/** Append new canonical entries via Foundry, never open the live LevelDB externally. */
export async function migrateEquipmentContent() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "equipmentContentVersion") >= EQUIPMENT_CONTENT_VERSION) return;
  const pack = game.packs.get(`${SYSTEM_ID}.equipment`);
  if (!pack) return;
  const index = await pack.getIndex({ fields: ["system.ruleId"] });
  const existing = new Set(Array.from(index.values(), entry => entry.system?.ruleId));
  const missing = [...CORE_AMMUNITION, ...ELDER_EQUIPMENT].filter(entry => !existing.has(entry.id));
  const oldDocuments = await Promise.all(Array.from(index.values()).filter(entry =>
    entry.system?.ruleId?.startsWith("ammunition.") || ["armor", "weapon"].includes(entry.type)).map(entry => pack.getDocument(entry._id)));
  const updates = updatesFor(oldDocuments);
  let documents = [], requiredFolders = [];
  if (missing.length) {
    const load = async filename => {
      const response = await fetch(`systems/${SYSTEM_ID}/pack-sources/${filename}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Не удалось загрузить ${filename}: ${response.status}`);
      return response.json();
    };
    const [sources, folders] = await Promise.all([load("equipment.json"), load("equipment.folders.json")]);
    documents = missing.map(entry => {
      const source = sources.find(document => document._id === entry.documentId && document.system.ruleId === entry.id);
      if (!source || index.has(entry.documentId)) throw new Error(`Проверьте запись предмета ${entry.id}: источник отсутствует или ID занят.`);
      return source;
    });
    const folderIds = new Set(documents.map(document => document.folder));
    requiredFolders = folders.filter(folder => folderIds.has(folder._id) && !pack.folders.has(folder._id));
  }
  if (documents.length || updates.length) {
    const locked = pack.locked;
    try {
      if (locked) await pack.configure({ locked: false });
      if (requiredFolders.length) await foundry.documents.Folder.implementation.createDocuments(requiredFolders, { pack: pack.collection, keepId: true });
      if (documents.length) {
        const created = await foundry.documents.Item.implementation.createDocuments(documents, { pack: pack.collection, keepId: true });
        if (created.length !== documents.length) throw new Error("Добавлены не все предметы. Обновление будет повторено при следующем входе мастера.");
      }
      if (updates.length) await foundry.documents.Item.implementation.updateDocuments(updates, { pack: pack.collection });
    } finally { if (locked) await pack.configure({ locked: true }); }
  }
  const worldUpdates = updatesFor(game.items);
  if (worldUpdates.length) await foundry.documents.Item.implementation.updateDocuments(worldUpdates);
  const actors = new Map(Array.from(game.actors, actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) {
    if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  }
  for (const actor of actors.values()) await inventoryWrite(actor, async () => {
    const updates = updatesFor(actor.items);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  });
  await game.settings.set(SYSTEM_ID, "equipmentContentVersion", EQUIPMENT_CONTENT_VERSION);
}
