import { available, effectiveItem } from "../data/workshop.mjs";
import { conditionKey, isAmmunition } from "../data/physical-items.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { workshopNotice } from "./check.mjs";
import { SYSTEM_ID } from "../config.mjs";

// Core p. 140: only weapons and armor are repaired or taken apart; ammunition is not.
export const isWorkpiece = item => ["weapon", "armor"].includes(item.type) && !item.system.natural && !isAmmunition(item) && Boolean(conditionKey(item));
export const enhancementCount = item => (item.system.installations ?? []).filter(entry => entry.category !== "craftsman").length;

/** Repair DC: the diagram's crafting DC − 5, +2 per installed rune, glyph or armor enhancement. */
export const repairDC = (recipe, item) => Math.max(0, recipe.dc - 5 + 2 * enhancementCount(item));

/** Half of every component, at least one unit of each. A component listed twice is still one kind. */
export function disassemblyYield(components) {
  const totals = new Map();
  for (const { uuid, quantity, substance } of components) if (uuid && !substance) totals.set(uuid, (totals.get(uuid) ?? 0) + quantity);
  return [...totals].map(([uuid, quantity]) => ({ uuid, quantity: Math.max(1, Math.floor(quantity / 2)) }));
}

export function itemCondition(item) {
  const key = conditionKey(item);
  const condition = key ? effectiveItem(item)[key] : null;
  if (!condition) return null;
  return { key, label: key === "stoppingPower" ? "ПБ" : "Надёжность", value: condition.value, max: condition.max,
    broken: condition.max > 0 && condition.value <= 0, damaged: condition.value < condition.max,
    percent: condition.max > 0 ? Math.max(0, Math.min(100, Math.round(condition.value / condition.max * 100))) : 0 };
}

/**
 * Diagram index for lookups by result. The character's own diagrams win, so a custom variant is used before the catalog.
 * Uses compendium index fields only: rendering a sheet never loads every catalog document.
 */
export async function diagramIndex(actor) {
  const entries = [], ruleIds = new Map(), names = new Map();
  const note = (uuid, entry) => {
    if (entry.system?.ruleId) ruleIds.set(uuid, entry.system.ruleId);
    if (entry.name) names.set(uuid, entry.name);
    const recipe = entry.type === "recipe" ? entry.system?.recipe : null;
    if (recipe?.category === "diagram" && recipe.resultUuid) entries.push({ uuid, name: entry.name, recipe });
  };
  for (const item of actor?.items ?? []) note(item.uuid, item);
  for (const item of Array.from(game.items ?? [])) if (item.testUserPermission?.(game.user, "LIMITED")) note(item.uuid, item);
  const pack = game.packs?.get(`${SYSTEM_ID}.equipment`);
  if (pack && (pack.testUserPermission?.(game.user, "OBSERVER") ?? true)) {
    const index = await pack.getIndex({ fields: ["system.ruleId", "system.recipe"] });
    for (const entry of index.values()) note(`Compendium.${pack.collection}.Item.${entry._id}`, entry);
  }
  return { entries, ruleIds, names };
}
export function diagramFor(item, { entries, ruleIds }) {
  const source = item._stats?.compendiumSource;
  const ruleId = item.system.ruleId;
  return entries.find(entry => {
    const result = entry.recipe.resultUuid;
    return result === item.uuid || (source && result === source) || (ruleId && ruleIds.get(result) === ruleId);
  }) ?? null;
}
/** Carried units of a component, matched like crafting does: same document, catalog source or rule. */
export function ownedUnits(actor, uuid, ruleIds) {
  const ruleId = ruleIds.get(uuid);
  return actor.items.filter(item => available(item) && (item.uuid === uuid || item._stats?.compendiumSource === uuid || (ruleId && item.system.ruleId === ruleId)))
    .reduce((sum, item) => sum + item.system.quantity, 0);
}

export function disassemblyBlocker(item, recipe) {
  if (!isWorkpiece(item)) return "Разобрать можно только оружие, щит или часть брони.";
  if (!recipe) return "Нет чертежа: неизвестно, из чего сделан предмет.";
  if (!available(item)) return "Предмет должен быть при себе.";
  if (item.system.equipped) return "Сначала снимите или уберите предмет.";
  if ((item.system.installations ?? []).some(entry => entry.category === "armor")) return "Сначала снимите накладки брони.";
  const batch = Math.max(1, recipe.quantity ?? 1);
  if (item.system.quantity < batch) return `Чертёж даёт ${batch} шт. за раз: для разборки нужна вся партия в одной записи.`;
  if (!disassemblyYield(recipe.components).length) return "В чертеже нет компонентов.";
  return "";
}

async function resolveComponents(rows) {
  const references = new Map();
  for (const { uuid } of rows) {
    const item = await foundry.utils.fromUuid(uuid);
    if (!item || item.documentName !== "Item" || !item.testUserPermission(game.user, "LIMITED")) throw new Error("Компонент чертежа недоступен.");
    references.set(uuid, item);
  }
  return references;
}

/** Core p. 140: no check is needed; part of the components is ruined, so half of each comes back. */
export async function disassembleItem(actor, item) {
  if (!actor?.isOwner || item?.parent !== actor) return;
  const index = await diagramIndex(actor);
  const diagram = diagramFor(item, index);
  const recipe = diagram ? structuredClone(diagram.recipe) : null;
  const blocker = disassemblyBlocker(item, recipe);
  if (blocker) throw new Error(blocker);
  const batch = Math.max(1, recipe.quantity ?? 1);
  const returned = disassemblyYield(recipe.components);
  const references = await resolveComponents(returned);
  const lost = [
    ...(item.system.installations ?? []).map(entry => entry.name),
    ...(item.system.oil?.sourceUuid ? [item.system.oil.name] : [])
  ];
  const consent = await foundry.applications.api.DialogV2.confirm({ classes: ["witcher-crafting-dialog"], position: { width: 520 },
    window: { title: "Разборка", icon: "fa-solid fa-screwdriver-wrench" },
    content: `<div class="witcher-workshop-dialog"><h3>${esc(item.name)}${batch > 1 ? ` ×${batch}` : ""}</h3>
      <p>Предмет будет уничтожен. Часть компонентов повреждается: возвращается половина каждого компонента по чертежу «${esc(diagram.name)}», минимум 1 единица.</p>
      <table><thead><tr><th>Компонент</th><th>Получите</th></tr></thead><tbody>${returned.map(row => `<tr><td>${esc(references.get(row.uuid).name)}</td><td>×${row.quantity}</td></tr>`).join("")}</tbody></table>
      ${lost.length ? `<p class="is-missing"><strong>Будет утрачено:</strong> ${lost.map(esc).join(", ")}.</p>` : ""}</div>`,
    yes: { label: "Разобрать", icon: "fa-solid fa-screwdriver-wrench" }, no: { label: "Отмена" }, rejectClose: false });
  if (!consent) return;
  return inventoryWrite(actor, async () => {
    const current = actor.items.get(item.id);
    const again = current && diagramFor(current, await diagramIndex(actor));
    if (!current || again?.uuid !== diagram.uuid || disassemblyBlocker(current, again.recipe)) throw new Error("Предмет или чертёж изменились; откройте разборку заново.");
    const whole = current.system.quantity === batch;
    await inventoryTransaction(actor, {
      expenses: whole ? [] : [{ itemId: current.id, quantity: batch }],
      deletes: whole ? [current.id] : [],
      creates: returned.map(row => copyPhysical(references.get(row.uuid), row.quantity))
    });
    await workshopNotice(actor, `<p><strong>${esc(current.name)}</strong>${batch > 1 ? ` ×${batch}` : ""} разобрано.</p><p>Получено: ${returned.map(row => `${esc(references.get(row.uuid).name)} ×${row.quantity}`).join(", ")}.</p>`);
  });
}

/** The repair panel lists items that need work; the rest stay reachable through the disassembly picker. */
export async function repairContext(actor) {
  const workpieces = actor.items.filter(item => isWorkpiece(item) && item.system.quantity > 0);
  if (!workpieces.length) return { rows: [], candidates: [], broken: 0 };
  const index = await diagramIndex(actor);
  const describe = item => {
    const diagram = diagramFor(item, index), condition = itemCondition(item);
    const recipe = diagram?.recipe;
    return { item, diagram, condition, recipe };
  };
  const all = workpieces.map(describe);
  const rows = all.filter(entry => entry.condition?.damaged).map(({ item, diagram, condition, recipe }) => ({
    id: item.id, name: item.name, img: item.img, condition, enhancements: enhancementCount(item),
    diagramName: diagram?.name ?? "", hasDiagram: Boolean(diagram), dc: recipe ? repairDC(recipe, item) : null, baseDC: recipe?.dc ?? null,
    forge: Boolean(recipe?.forge),
    components: recipe ? disassemblyYield(recipe.components).map(({ uuid }) => {
      const owned = ownedUnits(actor, uuid, index.ruleIds);
      return { name: index.names.get(uuid) ?? "Компонент", owned, missing: owned < 1 };
    }) : [],
    disassemble: recipe ? !disassemblyBlocker(item, recipe) : false
  })).map(row => ({ ...row, ready: row.hasDiagram && row.components.every(component => !component.missing) }))
    .sort((a, b) => Number(b.condition.broken) - Number(a.condition.broken) || a.name.localeCompare(b.name, "ru"));
  const candidates = all.filter(({ item, recipe }) => recipe && !disassemblyBlocker(item, recipe)).map(({ item, recipe }) => ({
    id: item.id, name: item.name,
    summary: disassemblyYield(recipe.components).map(row => `${index.names.get(row.uuid) ?? "Компонент"} ×${row.quantity}`).join(", ")
  }));
  return { rows, candidates, broken: rows.filter(row => row.condition.broken).length };
}
