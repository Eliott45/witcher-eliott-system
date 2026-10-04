import { effectiveItem, activeOil } from "../data/workshop.mjs";
import { ARMOR_ZONES, EQUIPMENT_KINDS, isPhysical, equippedItems, conditionKey, carriedWeight } from "../data/physical-items.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { sheetPreferences, updateSheetPreferences, reportPreferencesError } from "./sheet-preferences.mjs";

const CATEGORIES = [{ id: "weapon", name: "Оружие / щиты" }, { id: "armor", name: "Броня" }, ...EQUIPMENT_KINDS, { id: "recipe", name: "Чертежи / формулы" }];
// Display groups reuse Item types/kinds. They are not a second item classification.
const GROUPS = [
  { id: "weapon", name: "Оружие и щиты", icon: "fa-swords", categories: ["weapon"] },
  { id: "armor", name: "Броня", icon: "fa-shield-halved", categories: ["armor"] },
  { id: "gear", name: "Снаряжение и инструменты", icon: "fa-sack", categories: ["gear", "tool"] },
  { id: "alchemy", name: "Алхимия и мутагены", icon: "fa-flask", categories: ["alchemy", "mutagen"] },
  { id: "ammunition", name: "Боеприпасы", icon: "fa-bullseye", categories: ["ammunition"] },
  { id: "material", name: "Материалы и улучшения", icon: "fa-hammer", categories: ["material", "upgrade"] },
  { id: "recipe", name: "Чертежи и формулы", icon: "fa-scroll", categories: ["recipe"] },
  { id: "companion", name: "Компаньоны", icon: "fa-paw", categories: ["companion"] }
];
const categoryOf = item => item.type === "equipment" ? (item.system.kind || "gear") : item.type;
export function inventoryContext(actor, preferences = {}) {
  const items = Array.from(actor.items ?? []).filter(isPhysical);
  const rows = items.map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system, sort: item.sort ?? 0,
    quantity: item.system.quantity ?? 1, carried: item.system.carried !== false,
    isRecipe: item.type === "recipe", oil: activeOil(item, globalThis.game?.time?.worldTime ?? 0),
    category: categoryOf(item), canEquip: ["weapon", "armor"].includes(item.type),
    condition: conditionKey(item) ? effectiveItem(item)[conditionKey(item)] : null, conditionLabel: item.type === "armor" ? "ПБ" : "Н",
    totalWeight: Math.round((effectiveItem(item).weight ?? 0) * (item.system.quantity ?? 1) * 1000) / 1000 }));
  const weight = carriedWeight(items), capacity = actor.system?.statistics?.carryMax;
  return { weight, capacity: capacity ?? "—", overloaded: capacity != null && weight > capacity,
    loadPercent: capacity > 0 ? Math.min(100, weight / capacity * 100) : weight > 0 && capacity === 0 ? 100 : 0,
    categories: CATEGORIES, items: rows,
    groups: GROUPS.map(group => ({ ...group, open: !preferences.collapsed?.[`inventory-${group.id}`],
      items: rows.filter(item => group.categories.includes(item.category)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ru")) })),
    zones: ARMOR_ZONES.map(zone => ({ ...zone, items: equippedItems(items).filter(item => item.type === "armor" && item.system.zone === zone.id).map(item => ({ id: item.id, name: item.name, condition: effectiveItem(item).stoppingPower })) })),
    workshopOpen: !preferences.collapsed?.["inventory-workshop"] };
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
export async function changeInventoryQuantity(_event, target) {
  if (!this.isEditable) return;
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !isPhysical(item)) return;
    const quantity = Math.max(0, (item.system.quantity ?? 1) + Number(target.dataset.delta));
    await item.update({ "system.quantity": quantity });
  });
}
export async function toggleCarried(_event, target) {
  if (!this.isEditable) return;
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !isPhysical(item)) return;
    const carried = item.system.carried === false;
    await item.update({ "system.carried": carried, ...(!carried ? { "system.equipped": false } : {}) });
  });
}
export async function toggleInventoryGroup(_event, target) {
  if (this.inventoryQuery?.trim()) {
    // Search expands matches without overwriting the user's normal collapsed groups.
    this.inventorySearchCollapsed ??= new Set();
    const id = target.dataset.inventoryGroupId;
    if (this.inventorySearchCollapsed.has(id)) this.inventorySearchCollapsed.delete(id);
    else this.inventorySearchCollapsed.add(id);
    this.render();
    return;
  }
  const key = `inventory-${target.dataset.inventoryGroupId}`;
  await updateSheetPreferences(this.actor.uuid, { collapsed: { [key]: !sheetPreferences(this.actor.uuid).collapsed?.[key] } });
  this.render();
}
export async function createInventoryItem(_event, target) {
  if (!this.isEditable) return;
  const group = GROUPS.find(entry => entry.id === target?.dataset.inventoryGroupId);
  const type = group ? (["weapon", "armor", "recipe"].includes(group.id) ? group.id : "equipment") : await foundry.applications.api.DialogV2.prompt({ window: { title: "Новый предмет" }, content: '<label>Тип <select name="type"><option value="equipment">Снаряжение</option><option value="weapon">Оружие / щит</option><option value="armor">Броня</option><option value="recipe">Чертёж / формула</option></select></label>',
    ok: { label: "Создать", callback: (_event, button) => new FormData(button.form).get("type") }, rejectClose: false });
  if (!type || !this.isEditable) return;
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Новый предмет", type, system: type === "equipment" && group ? { kind: group.id } : {}, img: type === "weapon" ? "icons/svg/sword.svg" : type === "armor" ? "icons/svg/shield.svg" : "icons/svg/item-bag.svg" }]);
  item.sheet.render(true);
}
export async function browseEquipment() {
  await game.packs.get("witcher-eliott-system.equipment")?.render(true);
}
export async function addCatalogItem(_event, target) {
  if (!this.isEditable) return;
  const pack = game.packs.get("witcher-eliott-system.equipment");
  const group = GROUPS.find(entry => entry.id === target?.dataset.inventoryGroupId);
  const documents = (await pack.getDocuments()).filter(item => isPhysical(item) && (!group || group.categories.includes(categoryOf(item))));
  const groups = Object.fromEntries(CATEGORIES.filter(entry => !group || group.categories.includes(entry.id)).map(entry => [entry.id, entry.name]));
  const selected = await chooseReference("inventory", "", { title: "Добавить из каталога", groups,
    hint: "Выбранный предмет добавится в инвентарь. Кроны не списываются.", entries: documents.map(item => ({ id: item.id, label: item.name,
      group: categoryOf(item), groupLabel: groups[categoryOf(item)],
      summary: `${item.system.weight} кг · ${item.system.price} крон · ${item.system.properties}`, details: [] })) });
  if (!selected || !this.isEditable) return;
  const data = game.items.fromCompendium(documents.find(item => item.id === selected), { clearFolder: true, keepId: false });
  data.system.equipped = false;
  await this.actor.createEmbeddedDocuments("Item", [data]);
}
export function bindInventory(sheet) {
  const root = sheet.element;
  const search = root.querySelector("[data-inventory-search]");
  search.value = sheet.inventoryQuery ?? "";
  sheet.inventorySearchCollapsed ??= new Set();
  const refresh = () => {
    if (sheet.inventoryQuery !== search.value) sheet.inventorySearchCollapsed.clear();
    sheet.inventoryQuery = search.value;
    const query = search.value.trim().toLocaleLowerCase();
    let matches = 0;
    for (const group of root.querySelectorAll("[data-inventory-group]")) {
      let count = 0;
      for (const row of group.querySelectorAll("[data-inventory-name]")) {
        row.hidden = !row.dataset.inventoryName.toLocaleLowerCase().includes(query);
        if (!row.hidden) count++;
      }
      matches += count;
      group.hidden = Boolean(query && !count);
      const open = query ? !sheet.inventorySearchCollapsed.has(group.dataset.inventoryGroup) : group.dataset.collapsed !== "true";
      group.querySelector("[data-inventory-group-body]").hidden = !open;
      group.querySelector('[data-action="toggleInventoryGroup"]').setAttribute("aria-expanded", String(open));
    }
    root.querySelector("[data-inventory-no-results]").hidden = !query || matches > 0;
  };
  search.addEventListener("input", refresh); refresh();
  for (const input of root.querySelectorAll("[data-inventory-quantity]")) input.addEventListener("change", () => {
    if (!sheet.isEditable) return;
    const quantity = Math.max(0, Math.trunc(Number(input.value) || 0));
    inventoryWrite(sheet.actor, () => sheet.actor.items.get(input.dataset.itemId)?.update({ "system.quantity": quantity })).catch(reportPreferencesError);
  });
}
