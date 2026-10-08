import { isCrossbow, loadedBolt } from "../combat/crossbow-ammo.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { usableHands } from "../combat/critical-wound-effects.mjs";
import { dropItemToGround } from "../loot/loot.mjs";
import { layeringPlan, zoneStoppingPower, layeringDetails } from "../data/armor-layers.mjs";
import { isTransport, cargoSections, cargoSection } from "../data/transport.mjs";
import { gripOf } from "../combat/weapon-rules.mjs";
import { consumableContext, toxicityState } from "../data/consumables.mjs";
import { supportsVisor } from "../data/visor.mjs";
import { effectiveItem, activeOil } from "../data/workshop.mjs";
import { ARMOR_ZONES, armorZones, isPhysical, equippedItems, conditionKey, carriedWeight, itemWeight } from "../data/physical-items.mjs";
import { isContainer, containerParent, containerContents, isCarried } from "../data/containers.mjs";
import { browseEquipmentCatalog } from "./equipment-browser.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
export { inventoryWrite } from "../data/inventory-writes.mjs";
import { EQUIPMENT_CATEGORIES, equipmentCategory, equipmentEntry } from "../data/equipment-search.mjs";
import { sheetPreferences, updateSheetPreferences, reportPreferencesError } from "./sheet-preferences.mjs";
import { relicArmorLore } from "../data/relic-armor.mjs";

// Display groups reuse Item types/kinds. They are not a second item classification.
const GROUPS = [
  { id: "weapon", name: "Оружие и щиты", icon: "fa-swords", categories: ["weapon", "shield"] },
  { id: "armor", name: "Броня", icon: "fa-shield-halved", categories: ["armor"] },
  { id: "gear", name: "Снаряжение и инструменты", icon: "fa-sack", categories: ["gear", "tool", "tack"] },
  { id: "alchemy", name: "Алхимия и мутагены", icon: "fa-flask", categories: ["alchemy", "mutagen"] },
  { id: "ammunition", name: "Боеприпасы", icon: "fa-bullseye", categories: ["ammunition"] },
  { id: "material", name: "Материалы и улучшения", icon: "fa-hammer", categories: ["material", "upgrade"] },
  { id: "recipe", name: "Чертежи и формулы", icon: "fa-scroll", categories: ["recipe"] },
  { id: "companion", name: "Компаньоны", icon: "fa-paw", categories: ["companion"] },
  { id: "container", name: "Контейнеры", icon: "fa-box-open", categories: ["container"] }
];
const visorContext = item => ({ hasVisor: supportsVisor(item), visorDown: Boolean(item.system.visorDown) });
/** Armor with 0 SP or a weapon/shield with 0 reliability (max above 0): broken until repaired by crafting. */
export function isBroken(item) {
  const key = conditionKey(item), value = key ? effectiveItem(item)[key] : null;
  return Boolean(value && value.max > 0 && value.value <= 0);
}

const CLASS_LABELS = { light: "лёгкая", medium: "средняя", heavy: "тяжёлая" };
/** What wearing several layers costs: the EV each layered piece adds and the total armor EV it feeds. */
function layeringSummary(actor, items) {
  const pieces = layeringDetails(equippedItems(items));
  if (!pieces.length) return null;
  const extra = pieces.reduce((sum, piece) => sum + piece.extra, 0), ev = actor.system?.statistics?.encumbrance ?? null;
  return { extra, ev, pieces: pieces.map(piece => ({ ...piece, classLabel: CLASS_LABELS[piece.armorClass] ?? piece.armorClass })) };
}

/** Limbs a prosthesis replaces, read from the healed lost-limb wounds it is fitted to. */
function fittedLimbs(actor, itemId) {
  return Array.from(actor.effects ?? []).map(effect => effect.flags?.[SYSTEM_ID]?.criticalWound)
    .filter(wound => wound?.prosthesis?.itemId === itemId).map(wound => wound.locationName || "конечность");
}

export function inventoryContext(actor, preferences = {}) {
  const items = Array.from(actor.items ?? []).filter(isPhysical);
  const rows = items.map(item => ({ id: item.id, name: item.name, img: item.img, ...item.system, ...visorContext(item), sort: item.sort ?? 0,
    quantity: item.system.quantity ?? 1, consumption: consumableContext(item), carried: isCarried(item, items), expanded: false, presentation: null, cargoSections: [], onTransport: false,
    isContainer: isContainer(item), parentId: containerParent(item, items)?.id ?? "", children: [], containerOpen: true,
    isRecipe: item.type === "recipe", oil: activeOil(item, globalThis.game?.time?.worldTime ?? 0),
    isWeapon: item.type === "weapon" && !item.system.natural, grip: gripOf(item),
    category: equipmentCategory(item), search: equipmentEntry(item).search, canEquip: ["weapon", "armor"].includes(item.type),
    condition: conditionKey(item) ? effectiveItem(item)[conditionKey(item)] : null, conditionLabel: item.type === "armor" ? "ПБ" : "Н",
    crossbow: isCrossbow(item) ? { loaded: item.system.loaded !== false, bolt: loadedBolt(item)?.name ?? "" } : null,
    broken: isBroken(item), fittedOn: fittedLimbs(actor, item.id).join(", "),
    totalWeight: Math.round(itemWeight(item) * 1000) / 1000 }));
  for (const row of rows) {
    let ancestor=containerParent(items.find(item=>item.id===row.id),items);
    while(ancestor){if(isTransport(ancestor))row.onTransport=true;ancestor=containerParent(ancestor,items);}
    if (row.parentId) rows.find(parent => parent.id === row.parentId).children.push(row);
    if (row.isContainer) {
      row.contentsWeight = Math.round(containerContents(items.find(item => item.id === row.id), items).reduce((sum, item) => sum + itemWeight(item), 0) * 1000) / 1000;
      row.capacity = row.capacity ?? 0;
      row.loadPercent = row.capacity > 0 ? Math.min(100, row.contentsWeight / row.capacity * 100) : 0;
      row.overloaded = row.capacity > 0 && row.contentsWeight > row.capacity;
      row.totalWeight = Math.round((row.totalWeight + row.contentsWeight) * 1000) / 1000;
    }
  }
  for(const row of rows.filter(row=>row.isContainer)) {
    const item=items.find(item=>item.id===row.id);
    row.cargoSections=cargoSections(item).map(section=>{
      const children=row.children.filter(child=>cargoSection({system:child},item)===section.id);
      const weight=Math.round(children.reduce((sum,child)=>sum+child.totalWeight,0)*1000)/1000;
      const count=children.reduce((sum,child)=>sum+child.quantity,0);
      return {...section,children,weight,count,overloaded:section.slots?count>section.slots:weight>section.capacity};
    });
    if(row.cargoSections.length)row.overloaded=row.cargoSections.some(section=>section.overloaded);
  }
  const sortRows = rows => rows.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ru"));
  for (const row of rows) sortRows(row.children);
  const weight = carriedWeight(items), capacity = actor.system?.statistics?.carryMax;
  return { weight, toxicity: toxicityState(actor), showToxicity: actor.type === "npc", capacity: capacity ?? "—", overloaded: capacity != null && weight > capacity,
    loadPercent: capacity > 0 ? Math.min(100, weight / capacity * 100) : weight > 0 && capacity === 0 ? 100 : 0,
    categories: EQUIPMENT_CATEGORIES, items: rows,
    groups: GROUPS.map(group => ({ ...group, open: !preferences.collapsed?.[`inventory-${group.id}`],
      items: sortRows(rows.filter(item => !item.parentId && group.categories.includes(item.category))) })),
    layering: layeringSummary(actor, items),
    zones: ARMOR_ZONES.map(zone => {
      const worn = equippedItems(items).filter(item => item.type === "armor" && armorZones(item).includes(zone.id));
      return { ...zone, layered: worn.length > 1, total: zoneStoppingPower(worn),
        items: worn.map(item => ({ id: item.id, name: item.name, ...visorContext(item), condition: effectiveItem(item).stoppingPower, armorClass: item.system.armorClass, broken: isBroken(item) })) };
    }),
    workshopOpen: !preferences.collapsed?.["inventory-workshop"] };
}
export async function toggleVisor(_event, target) {
  if (!this.isEditable) return;
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!supportsVisor(item) || !equippedItems(this.actor.items).includes(item)) return;
    await item.update({ "system.visorDown": !item.system.visorDown });
  });
}
export async function dropToGround(_event, target) {
  if (!this.isEditable) return;
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  try { await dropItemToGround(this.actor, item); } catch (error) { ui.notifications.warn(error.message); }
}
export async function equipItem(_event, target) {
  if (!this.isEditable) return;
  const weapon=this.actor.items.get(target.dataset.itemId);
  if(weapon?.type==="weapon"&&!weapon.system.natural)return changeGrip.call(this,_event,target);
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !isPhysical(item) || item.system.quantity <= 0) return;
    const updates = [];
    if (!item.system.equipped && item.type === "armor") {
      // Up to three layers per zone, at most one medium and one heavy (core pp.154–155, errata).
      const plan = layeringPlan(item, equippedItems(this.actor.items));
      if (plan.blocked) return void ui.notifications.warn(plan.blocked);
      const duplicates = relicArmorLore(item) ? Array.from(this.actor.items).filter(other => other.id !== item.id && other.system.ruleId === item.system.ruleId && other.system.equipped).map(other => other.id) : [];
      for (const id of new Set([...plan.replace, ...duplicates])) updates.push({ _id: id, "system.equipped": false });
      if (plan.note) ui.notifications.info(plan.note);
    }
    updates.push({ _id: item.id, "system.equipped": !item.system.equipped, "system.carried": true, "system.containerId": "" });
    await this.actor.updateEmbeddedDocuments("Item", updates);
  });
}
export async function changeInventoryQuantity(_event, target) {
  if (!this.isEditable) return;
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !isPhysical(item) || isContainer(item)) return;
    const quantity = Math.max(0, (item.system.quantity ?? 1) + Number(target.dataset.delta));
    await item.update({ "system.quantity": quantity });
  });
}
export async function changeGrip(_event,target) {
  if(!this.isEditable)return;
  const item=this.actor.items.get(target.dataset.itemId);
  if(item?.type!=="weapon"||item.system.natural)return;
  const grip=await foundry.applications.api.DialogV2.wait({window:{title:`Хват: ${item.name}`},content:`<p>Нужно рук для атаки: ${item.system.hands}. Выберите текущий хват. При смене оружия лишнее оружие будет убрано.</p>`,
    buttons:[{action:"stow",label:"Убрать",callback:()=>0},{action:"one",label:"1 рукой",callback:()=>1},{action:"two",label:"2 руками",callback:()=>2}],rejectClose:false});
  if(![0,1,2].includes(grip))return;
  // A disabled arm (critical wound) leaves fewer hands to hold weapons.
  const hands=usableHands(this.actor);
  if(grip>hands){ui.notifications.warn(hands?"Одна рука выведена из строя: доступен только хват одной рукой.":"Обе руки выведены из строя.");return;}
  await inventoryWrite(this.actor,async()=>{
    const updates=[{_id:item.id,"system.grip":grip||gripOf(item),"system.equipped":grip>0,...(grip?{"system.carried":true,"system.containerId":""}:{})}];
    let occupied=grip;
    for(const other of equippedItems(this.actor.items).filter(other=>other.type==="weapon"&&other.id!==item.id&&!other.system.natural)) {
      if(grip&&occupied+gripOf(other)>hands)updates.push({_id:other.id,"system.equipped":false});
      else occupied+=gripOf(other);
    }
    await this.actor.updateEmbeddedDocuments("Item",updates);
  });
}
export async function toggleCarried(_event, target) {
  if (!this.isEditable) return;
  await inventoryWrite(this.actor, async () => {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !isPhysical(item)) return;
    const carried = !isCarried(item, this.actor.items);
    await item.update({ "system.carried": carried, "system.containerId": "", ...(!carried ? { "system.equipped": false } : {}) });
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
  const type = group ? (["weapon", "armor", "recipe"].includes(group.id) ? group.id : "equipment") : await foundry.applications.api.DialogV2.prompt({ window: { title: "Новый предмет" }, content: '<label>Тип <select name="type"><option value="equipment">Снаряжение</option><option value="container">Контейнер</option><option value="weapon">Оружие / щит</option><option value="armor">Броня</option><option value="recipe">Чертёж / формула</option></select></label>',
    ok: { label: "Создать", callback: (_event, button) => new FormData(button.form).get("type") }, rejectClose: false });
  if (!type || !this.isEditable) return;
  const itemType = type === "container" ? "equipment" : type;
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: type === "container" || group?.id === "container" ? "Новый контейнер" : "Новый предмет", type: itemType, system: type === "container" ? { kind: "container" } : itemType === "equipment" && group ? { kind: group.id } : {}, img: type === "weapon" ? "icons/svg/sword.svg" : type === "armor" ? "icons/svg/shield.svg" : "icons/svg/item-bag.svg" }]);
  item.sheet.render(true);
}
export async function browseEquipment() {
  await game.packs.get("witcher-eliott-system.equipment")?.render(true);
}
export async function addCatalogItem(_event, target) {
  if (!this.isEditable) return;
  const group = GROUPS.find(entry => entry.id === target?.dataset.inventoryGroupId);
  await browseEquipmentCatalog({ actor: this.actor, categories: group?.categories });
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
      for (const row of Array.from(group.querySelectorAll("[data-inventory-name]")).reverse()) {
        row.hidden = !row.dataset.itemSearch.includes(query) && !Array.from(row.querySelectorAll("[data-inventory-name]")).some(child => !child.hidden);
        if (!row.hidden) count++;
      }
      for (const body of group.querySelectorAll("[data-container-body]")) body.hidden = !query && body.dataset.collapsed === "true";
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
