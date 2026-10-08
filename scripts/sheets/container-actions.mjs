import { canContain, containerParent, isContainer } from "../data/containers.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { isTransport, cargoSections } from "../data/transport.mjs";
import { inventoryWrite } from "./inventory-context.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";

export async function moveItemToContainer(actor, itemId, containerId = "", section = "") {
  if(!actor.isOwner) return null;
  return inventoryWrite(actor, async () => {
    const item = actor.items.get(itemId), parent = actor.items.get(containerId);
    if (!item || !isPhysical(item) || (containerId && !parent) || !canContain(item, parent, actor.items)) {
      ui.notifications.warn("Нельзя поместить контейнер в себя или его содержимое.");
      return null;
    }
    await item.update({ "system.containerId": containerId, "system.containerSection": section, "system.carried": true, "system.equipped": false });
    return item;
  });
}
export async function chooseContainer(_event, target) {
  if (!this.isEditable) return;
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  const current = containerParent(item, this.actor.items)?.id ?? "";
  const choices = [{ id: "", name: "При себе / вне контейнеров" }, ...this.actor.items.filter(parent => isContainer(parent) && canContain(item, parent, this.actor.items)).flatMap(parent=>{
    const sections=cargoSections(parent);return sections.length?sections.map(section=>({id:`${parent.id}:${section.id}`,name:`${parent.name} — ${section.name}`})):[parent];
  })];
  const options = choices.map(parent => `<option value="${escapeTooltip(parent.id)}" ${current === parent.id ? "selected" : ""}>${escapeTooltip(parent.name)}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({ window: { title: `Переместить: ${item.name}` },
    content: `<label>Куда положить <select name="containerId">${options}</select></label>`,
    ok: { label: "Переместить", callback: (_event, button) => new FormData(button.form).get("containerId") }, rejectClose: false });
  if (id != null && this.isEditable) {const [parentId,section]=id.split(":");await moveItemToContainer(this.actor, item.id, parentId,section);}
}
export async function toggleContainer(_event, target) {
  this.collapsedContainers ??= new Set();
  const id = target.dataset.itemId;
  if (this.collapsedContainers.has(id)) this.collapsedContainers.delete(id);
  else this.collapsedContainers.add(id);
  await this.render();
}

export async function dropPhysicalItem(sheet, event, item) {
  if(!sheet.isEditable)return;
  if (item.system?.natural && item.parent && item.parent.uuid !== sheet.actor.uuid) {
    ui.notifications.warn("Естественное или призрачное оружие нельзя перенести другому существу.");
    return;
  }
  const target = sheet.actor.items.get(event.target.closest("[data-item-id]")?.dataset.itemId);
  const parentId = isTransport(item) ? "" : isContainer(target) ? target.id : containerParent(target ?? { system: {} }, sheet.actor.items)?.id ?? "";
  const section=event.target.closest("[data-cargo-section]")?.dataset.cargoSection??"";
  if (sheet.actor.uuid === item.parent?.uuid) {
    if (item.id === target?.id) return item;
    const moved = await moveItemToContainer(sheet.actor, item.id, parentId,section);
    if (moved && target && !isContainer(target)) await sheet._onSortItem(event, item);
    return moved;
  }
  // Copying a bag copies that Item only; sibling references belong to its source actor.
  const data = game.items.fromCompendium(item, { clearFolder: true, keepId: false });
  delete data._id;
  data.system.containerId = parentId; data.system.containerSection = section; data.system.carried = true; data.system.equipped = false;
  if(data.system.transport)data.system.transport.mountId="";
  const [created] = await sheet.actor.createEmbeddedDocuments("Item", [data]);
  return created;
}
