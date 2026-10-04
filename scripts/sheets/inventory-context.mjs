import { effectiveItem, activeOil } from "../data/workshop.mjs";
import { ARMOR_ZONES, EQUIPMENT_KINDS, isPhysical, equippedItems, conditionKey, carriedWeight } from "../data/physical-items.mjs";
import { chooseReference } from "./reference-picker.mjs";
export function inventoryContext(actor) {
  const items = Array.from(actor.items ?? []).filter(isPhysical);
  return { weight: carriedWeight(items), categories: [{ id: "weapon", name: "Оружие / щиты" }, { id: "armor", name: "Броня" }, ...EQUIPMENT_KINDS, {id:"recipe",name:"Чертежи / формулы"}],
    zones: ARMOR_ZONES.map(zone => ({ ...zone, items: equippedItems(items).filter(item => item.type === "armor" && item.system.zone === zone.id).map(item => ({ id: item.id, name: item.name, condition: effectiveItem(item).stoppingPower })) })),
    items: items.map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system, isRecipe:item.type==="recipe", oil:activeOil(item,globalThis.game?.time?.worldTime??0),
      category: item.type === "equipment" ? item.system.kind : item.type, canEquip: ["weapon","armor"].includes(item.type),
      condition: conditionKey(item) ? effectiveItem(item)[conditionKey(item)] : null, conditionLabel: item.type === "armor" ? "ПБ" : "Н",
      totalWeight: Math.round(effectiveItem(item).weight * item.system.quantity * 1000) / 1000 })) };
}
const queues = new WeakMap();
export function inventoryWrite(actor, operation) {
  const work = (queues.get(actor) ?? Promise.resolve()).then(() => actor.isOwner ? operation() : undefined);
  queues.set(actor, work.catch(() => {})); return work;
}
export async function equipItem(_event, target) {
  if (!this.isEditable) return;
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !isPhysical(item) || item.system.quantity <= 0) return;
    const updates = [];
    if (!item.system.equipped && item.type === "armor") {
      // Same layer only. Future layering can expose additional layers without migrating actor data.
      for (const other of equippedItems(this.actor.items)) if (other.type === "armor" && other.system.zone === item.system.zone && other.system.layer === item.system.layer && other.id !== item.id)
        updates.push({ _id: other.id, "system.equipped": false });
    }
    updates.push({ _id: item.id, "system.equipped": !item.system.equipped, "system.carried": true });
    await this.actor.updateEmbeddedDocuments("Item", updates);
  });
}
export async function createInventoryItem() {
  if (!this.isEditable) return;
  const type = await foundry.applications.api.DialogV2.prompt({ window: { title: "Новый предмет" }, content: '<label>Тип <select name="type"><option value="equipment">Снаряжение</option><option value="weapon">Оружие / щит</option><option value="armor">Броня</option><option value="recipe">Чертёж / формула</option></select></label>',
    ok: { label: "Создать", callback: (_event, button) => new FormData(button.form).get("type") }, rejectClose: false });
  if (!type || !this.isEditable) return;
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Новый предмет", type, img: type === "weapon" ? "icons/svg/sword.svg" : type === "armor" ? "icons/svg/shield.svg" : "icons/svg/item-bag.svg" }]);
  item.sheet.render(true);
}
export async function browseEquipment() {
  await game.packs.get("witcher-eliott-system.equipment")?.render(true);
}
export async function addCatalogItem() {
  if (!this.isEditable) return;
  const pack = game.packs.get("witcher-eliott-system.equipment");
  const documents = (await pack.getDocuments()).filter(isPhysical);
  const groups = Object.fromEntries([{ id: "weapon", name: "Оружие / щиты" }, { id: "armor", name: "Броня" }, ...EQUIPMENT_KINDS, {id:"recipe",name:"Чертежи / формулы"}].map(entry => [entry.id, entry.name]));
  const selected = await chooseReference("inventory", "", { title: "Добавить из каталога", groups,
    hint: "Выбранный предмет добавится в инвентарь. Кроны не списываются.", entries: documents.map(item => ({ id: item.id, label: item.name,
      group: item.type === "equipment" ? item.system.kind : item.type, groupLabel: groups[item.type === "equipment" ? item.system.kind : item.type],
      summary: `${item.system.weight} кг · ${item.system.price} крон · ${item.system.properties}`, details: [] })) });
  if (!selected || !this.isEditable) return;
  const data = game.items.fromCompendium(documents.find(item => item.id === selected), { clearFolder: true, keepId: false });
  data.system.equipped = false;
  await this.actor.createEmbeddedDocuments("Item", [data]);
}
export function bindInventory(sheet) {
  const root = sheet.element;
  const search = root.querySelector("[data-inventory-search]");
  const filter = root.querySelector("[data-inventory-filter]");
  search.value = sheet.inventoryQuery ?? ""; filter.value = sheet.inventoryCategory ?? "";
  const refresh = () => {
    sheet.inventoryQuery = search.value; sheet.inventoryCategory = filter.value;
    for (const row of root.querySelectorAll("[data-inventory-name]")) row.hidden = !row.dataset.inventoryName.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()) || Boolean(filter.value && row.dataset.category !== filter.value);
  };
  search.addEventListener("input", refresh); filter.addEventListener("change", refresh); refresh();
  for (const input of root.querySelectorAll("[data-inventory-quantity]")) input.addEventListener("change", () => {
    if (!sheet.isEditable) return;
    inventoryWrite(sheet.actor, () => sheet.actor.items.get(input.dataset.itemId)?.update({ "system.quantity": Math.max(0, Math.trunc(Number(input.value) || 0)) }));
  });
}
