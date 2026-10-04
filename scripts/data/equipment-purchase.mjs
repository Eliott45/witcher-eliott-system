import { isPhysical } from "./physical-items.mjs";
import { isContainer } from "./containers.mjs";
import { effectiveItem } from "./workshop.mjs";
import { inventoryWrite } from "./inventory-writes.mjs";
import { copyPhysical, inventoryTransaction } from "../workshop/transaction.mjs";

export function equipmentQuote(actor, item, quantity = 1) {
  const price = Number(effectiveItem(item).price);
  const purchaseQuantity = Number(item.system.purchaseQuantity ?? 1);
  const units = quantity * purchaseQuantity;
  const crowns = Number(actor?.system.crowns ?? 0);
  const cost = Math.round(price * units * 100) / 100;
  let addReason = "";
  if (!actor?.isOwner) addReason = "Нет доступа к инвентарю.";
  else if (!isPhysical(item) || !item.testUserPermission(game.user, "OBSERVER")) addReason = "Предмет недоступен.";
  else if (!Number.isSafeInteger(quantity) || quantity < 1) addReason = "Количество должно быть целым числом от 1.";
  else if (!Number.isSafeInteger(purchaseQuantity) || purchaseQuantity < 1 || !Number.isSafeInteger(units)) addReason = "Некорректное количество предметов в пачке.";
  else if (isContainer(item) && units !== 1) addReason = "Контейнеры добавляются по одному.";
  let buyReason = addReason;
  if (!buyReason && (!Number.isFinite(cost) || !Number.isFinite(price) || price < 0)) buyReason = "У предмета некорректная цена.";
  if (!buyReason && (!Number.isFinite(crowns) || Math.round(crowns * 100) < Math.round(cost * 100))) buyReason = `Недостаточно крон. Нужно ${cost}.`;
  return { cost, units, addReason, buyReason, canAdd: !addReason, canBuy: !buyReason };
}

/** Recheck the live balance inside the same queue used by crafting and materials. */
export function acquireEquipment(actor, item, { purchase = false, quantity = 1 } = {}) {
  if (!actor.isOwner) return Promise.reject(new Error("Нет доступа к инвентарю."));
  return inventoryWrite(actor, async () => {
    const quote = equipmentQuote(actor, item, quantity);
    const reason = purchase ? quote.buyReason : quote.addReason;
    if (reason) throw new Error(reason);
    return inventoryTransaction(actor, {
      creates: [copyPhysical(item, quote.units)],
      actorUpdate: purchase ? { "system.crowns": Math.round((actor.system.crowns - quote.cost) * 100) / 100 } : {}
    });
  }).then(created => {
    if (!created) throw new Error("Нет доступа к инвентарю.");
    return created;
  });
}
