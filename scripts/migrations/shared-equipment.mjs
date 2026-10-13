import { SYSTEM_ID } from "../config.mjs";
import { CORE_GEAR } from "../data/core-equipment.mjs";
import { RADOLF_FIRST_PAGE, SHARED_TORCH } from "../data/radolf-equipment.mjs";
import { generalGearContent } from "../data/general-gear.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";

const aliases = { "radolf.rations": "gear.rations", "radolf.waterskin": "gear.waterskin", "radolf.torch": "gear.torch" };
const key = "sharedEquipmentVersion";
const canonical = id => CORE_GEAR.find(entry => entry.id === id);
const stock = id => RADOLF_FIRST_PAGE.find(entry => entry.id === id);
function references(value) {
  if (typeof value === "string") for (const [old, id] of Object.entries(aliases))
    value = value.replaceAll(`Compendium.${SYSTEM_ID}.equipment.Item.${stock(old).documentId}`, `Compendium.${SYSTEM_ID}.equipment.Item.${canonical(id).documentId}`);
  else if (Array.isArray(value)) return value.map(references);
  else if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, references(entry)]));
  return value;
}

/** Normalize identity without deleting paid inventory units, changing IDs, or overwriting custom notes. */
export function sharedEquipmentUpdate(item) {
  const s = item.system ?? {}, id = aliases[s.ruleId] ?? s.ruleId, result = {};
  for (const [key, value] of Object.entries(s.toObject?.() ?? s)) {
    const normalized = references(value);
    if (JSON.stringify(value) !== JSON.stringify(normalized)) result[`system.${key}`] = normalized;
  }
  if (aliases[s.ruleId]) result["system.ruleId"] = id;
  if (id !== "gear.torch") return result;
  if (item.type !== "weapon") {
    result.type = "weapon";
    for (const field of ["skill", "category", "damageType", "accuracy", "damage", "hands", "range", "rangeBodyMultiplier", "concealment", "enhancementSlots"])
      result[`system.${field}`] = SHARED_TORCH.system[field];
    if (!(s.reliability?.max > 0)) result["system.reliability"] = { value: 5, max: 5 };
  }
  const old = generalGearContent("gear.torch");
  if (!s.properties || s.properties === old.properties) result["system.properties"] = SHARED_TORCH.system.properties;
  if (!s.description || s.description === old.description) result["system.description"] = SHARED_TORCH.system.description;
  if (!s.source || s.source === "Базовая книга") result["system.source"] = SHARED_TORCH.system.source;
  if (result.type) {
    const data = structuredClone(s.toObject?.() ?? s);
    for (const key of Object.keys(result).filter(key => key.startsWith("system."))) {
      data[key.slice(7)] = result[key]; delete result[key];
    }
    result.system = new foundry.data.operators.ForcedReplacement(data);
  }
  return result;
}
const updateList = items => Array.from(items).flatMap(item => {
  const update = sharedEquipmentUpdate(item);
  return Object.keys(update).length ? [{ _id: item.id ?? item._id, ...update }] : [];
});
function uneditedDuplicate(item) {
  const entry = stock(item.system?.ruleId);
  return entry && aliases[entry.id] && (item.id ?? item._id) === entry.documentId && item.name === entry.name && item.type === entry.type
    && ["weight", "price", "description", "properties"].every(field => (item.system[field] ?? "") === (entry.system[field] ?? ""));
}

export function registerSharedEquipmentMigration() {
  game.settings.register(SYSTEM_ID, key, { scope: "world", config: false, type: Number, default: 0 });
}

export async function migrateSharedEquipment() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, key) >= 1) return;
  const pack = game.packs.get(`${SYSTEM_ID}.equipment`);
  if (!pack) return;
  const docs = await pack.getDocuments(), remove = docs.filter(uneditedDuplicate);
  const missing = Object.values(aliases).filter(id => !docs.some(item => item.system.ruleId === id));
  const updates = updateList(docs.filter(item => !remove.includes(item)));
  if (missing.length || updates.length || remove.length) {
    const locked = pack.locked;
    try {
      if (locked) await pack.configure({ locked: false });
      if (missing.length) {
        const response = await fetch(`systems/${SYSTEM_ID}/pack-sources/equipment.json`, { cache: "no-store" });
        if (!response.ok) throw new Error("Не удалось загрузить общие предметы.");
        const sources = await response.json();
        const creates = missing.map(id => sources.find(source => source._id === canonical(id).documentId));
        if (creates.some(source => !source)) throw new Error("В каталоге отсутствует общий предмет.");
        await foundry.documents.Item.implementation.createDocuments(creates, { pack: pack.collection, keepId: true });
      }
      if (updates.length) await foundry.documents.Item.implementation.updateDocuments(updates, { pack: pack.collection, broadcast: false });
      // Only unchanged shipped duplicates are removed, after the canonical replacements exist.
      if (remove.length) await foundry.documents.Item.implementation.deleteDocuments(remove.map(item => item.id), { pack: pack.collection });
    } finally { if (locked) await pack.configure({ locked: true }); }
  }
  const world = updateList(game.items);
  if (world.length) await foundry.documents.Item.implementation.updateDocuments(world);
  const actors = new Map(Array.from(game.actors, actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  for (const actor of actors.values()) await inventoryWrite(actor, async () => {
    const updates = updateList(actor.items);
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  });
  await game.settings.set(SYSTEM_ID, key, 1);
}
