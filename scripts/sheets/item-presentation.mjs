import { SYSTEM_ID } from "../config.mjs";
import { equipmentEntry } from "../data/equipment-search.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { browseEquipmentCatalog } from "./equipment-browser.mjs";

export async function itemPresentation(item, { secrets = false } = {}) {
  return { ...equipmentEntry(item), name: item.name,
    properties: item.system.properties ?? "",
    description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description ?? "", { secrets, relativeTo: item }) };
}
export async function toggleItemDescription(_event, target) {
  this.expandedInventoryItems ??= new Set();
  const id = target.dataset.itemId;
  if (this.expandedInventoryItems.has(id)) this.expandedInventoryItems.delete(id);
  else this.expandedInventoryItems.add(id);
  await this.render();
}
export async function postItem(_event, target) {
  const item = this.item ?? this.actor.items.get(target.dataset.itemId);
  if (!item?.isOwner || !isPhysical(item)) return;
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/item-chat.hbs`, await itemPresentation(item));
  const Message = foundry.documents.ChatMessage.implementation;
  const data = { content, speaker: foundry.documents.ChatMessage.getSpeaker({ actor: item.actor ?? this.actor }), style: CONST.CHAT_MESSAGE_STYLES.OTHER };
  Message.applyMode(data, game.settings.get("core", "messageMode"));
  return Message.create(data);
}
export async function searchItemTrait(_event, target) {
  await browseEquipmentCatalog({ actor: this.actor ?? this.item?.actor, trait: target.dataset.trait });
}
