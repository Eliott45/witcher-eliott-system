import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";

const additions = {
  "yennefer-of-vengerberg": ["gear.ritual-pouch"],
  "triss-merigold": ["gear.ritual-pouch"],
  "letho-of-gulet": ["bomb.northern-wind", "bomb.devils-puffball"]
};
const metadata = actor => actor.flags?.[SYSTEM_ID]?.pregen;

/** Only complete an explicitly recorded shortage; never restock a consumed or removed item. */
export function pendingPregenItems(actor, sources) {
  const pregen = metadata(actor), rules = additions[pregen?.id];
  if (!rules || !pregen.missing?.length) return [];
  const source = sources.find(source => metadata(source)?.id === pregen.id);
  if (!source) throw new Error(`Не найден источник снаряжения прегена «${actor.name}».`);
  return rules.flatMap(ruleId => {
    const item = source.items.find(item => item.system.ruleId === ruleId);
    if (!item) throw new Error(`Не найден предмет ${ruleId} для прегена «${actor.name}».`);
    return pregen.missing.some(row => row.name === item.name) ? [item] : [];
  });
}

export function completePregenLoadout(actor, sources) {
  return inventoryWrite(actor, async () => {
    const pending = pendingPregenItems(actor, sources);
    if (!pending.length) return;
    const owned = source => Array.from(actor.items).find(item => item.system.ruleId === source.system.ruleId
      || item.flags?.core?.sourceId === source.flags.core.sourceId || (item.type === source.type && item.name === source.name));
    const missing = pending.filter(source => !owned(source));
    if (missing.length) {
      const rows = structuredClone(missing);
      // Let Foundry assign IDs, including when a user item occupies the canonical source ID.
      for (const row of rows) delete row._id;
      const created = await actor.createEmbeddedDocuments("Item", rows);
      if (created.length !== rows.length) throw new Error(`Добавлены не все предметы прегена «${actor.name}». Обновление будет повторено.`);
    }
    const pouchSource = pending.find(item => item.system.ruleId === "gear.ritual-pouch");
    const pouch = pouchSource && owned(pouchSource);
    if (pouch?.system.kind === "container" && pouch.system.quantity > 0 && pouch.system.carried !== false) {
      const source = sources.find(source => metadata(source)?.id === metadata(actor).id);
      const ingredients = new Set(source.items.filter(item => item.system.containerId === pouchSource._id).map(item => item.system.ruleId));
      const changes = Array.from(actor.items).filter(item => ingredients.has(item.system.ruleId) && !item.system.containerId)
        .map(item => ({ _id: item.id, "system.containerId": pouch.id }));
      if (changes.length) await actor.updateEmbeddedDocuments("Item", changes);
    }
    const pregen = metadata(actor), resolved = new Set(pending.map(item => item.name));
    const remaining = pregen.missing.filter(item => !resolved.has(item.name));
    const missingNote = rows => rows.length ? `В каталоге пока отсутствуют и не добавлены в инвентарь: ${rows.map(item => `${item.name} ×${item.quantity}`).join("; ")}.` : "";
    const notes = actor.system.biography?.sessionNotes ?? "";
    const cleaned = notes.split("\n\n").map(paragraph => paragraph === missingNote(pregen.missing) ? missingNote(remaining) : paragraph).filter(Boolean).join("\n\n");
    await actor.update({ [`flags.${SYSTEM_ID}.pregen.missing`]: remaining,
      [`flags.${SYSTEM_ID}.pregen.revision`]: Math.max(2, pregen.revision ?? 1),
      ...(cleaned !== notes ? { "system.biography.sessionNotes": cleaned } : {}) });
  });
}
