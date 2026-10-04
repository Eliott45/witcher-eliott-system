/** Compensate inventory writes if the next document operation fails. Do not silently lose materials. */
export async function inventoryTransaction(actor, { expenses = [], updates = [], creates = [], actorUpdate = {} }) {
  if (!actor.isOwner) throw new Error("Нет доступа к инвентарю.");
  const changes = new Map(updates.map(update => [update._id, { ...update }]));
  for (const { itemId, quantity } of expenses) {
    const item = actor.items.get(itemId);
    if (!item || item.system.quantity < quantity || !Number.isInteger(quantity) || quantity < 0) throw new Error("Запасы изменились. Откройте действие заново.");
    changes.set(itemId, { ...changes.get(itemId), _id: itemId, "system.quantity": item.system.quantity - quantity });
  }
  const before = [...changes.values()].map(change => {
    const item = actor.items.get(change._id);
    if (!item) throw new Error("Предмет больше не находится в инвентаре.");
    return Object.fromEntries(Object.keys(change).map(key => [key, key === "_id" ? item.id : foundry.utils.deepClone(foundry.utils.getProperty(item, key))]));
  });
  let changed = false, created = [];
  try {
    if (changes.size) { await actor.updateEmbeddedDocuments("Item", [...changes.values()]); changed = true; }
    if (creates.length) created = await actor.createEmbeddedDocuments("Item", creates);
    if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);
    return created;
  } catch (error) {
    try {
      if (created.length) await actor.deleteEmbeddedDocuments("Item", created.map(item => item.id));
      if (changed) await actor.updateEmbeddedDocuments("Item", before);
    } catch (rollbackError) {
      console.error("witcher-eliott-system | Inventory rollback failed", rollbackError);
      ui.notifications.error("Не удалось вернуть материалы после ошибки записи. Проверьте инвентарь; подробности в консоли.");
    }
    throw error;
  }
}
export function copyPhysical(source, quantity = 1) {
  const data = game.items.fromCompendium(source, { clearFolder: true, keepId: false });
  delete data._id;
  data.system.quantity = quantity; data.system.carried = true; data.system.equipped = false;
  data.system.containerId = "";
  return data;
}
