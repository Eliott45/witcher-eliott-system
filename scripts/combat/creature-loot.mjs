import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { randomLootCategory } from "../data/random-loot.mjs";
import { rollPersonalBelongings } from "../loot/personal-belongings.mjs";
import { inventoryTransaction, copyPhysical } from "../workshop/transaction.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { UPGRADES } from "../data/workshop-upgrades.mjs";

const pendingHarvest = actor => (actor.system.harvest ?? []).filter(row => !row.attempted);
const LEGACY_DESCRIPTION = "<p>Добыча. Конкретные обычные предметы выбирает ведущий.</p>";
export function pendingLegacyLoot(actor) {
  if (actor?.type !== "npc" || !actor.system.creature.lootGenerated) return [];
  return Array.from(actor.items).filter(item => item.type === "equipment" && !item.system.ruleId && item.system.quantity > 0
    && item.system.description === LEGACY_DESCRIPTION && randomLootCategory(item.name));
}
export function canGenerateCreatureLoot(actor) {
  if (actor?.type !== "npc") return false;
  if (!actor.system.creature.lootGenerated) return Boolean(actor.system.creature.loot.length || pendingHarvest(actor).length);
  return pendingHarvest(actor).some(row => !row.skill && row.quantity > 0) || pendingLegacyLoot(actor).length > 0;
}
const configuration = actor => JSON.stringify([actor.system.creature.lootGenerated, actor.system.creature.loot, actor.system.harvest,
  pendingLegacyLoot(actor).map(item => [item.id, item.name, item.system.toObject?.() ?? item.system, item.flags])]);
const requireActiveGM = () => {
  if (game.user !== game.users.activeGM) throw new Error("Добычу определяет активный ведущий. Попросите его нажать эту кнопку.");
};

/** Roll once, then materialize ordinary loot on the NPC; skilled extraction remains a separate action. */
export function generateCreatureLoot(actor) {
  if (actor?.type !== "npc" || !actor.isOwner || !game.user.isGM) return;
  return inventoryWrite(actor, async () => {
    requireActiveGM();
    if (!canGenerateCreatureLoot(actor)) return;
    const before = configuration(actor), generated = actor.system.creature.lootGenerated;
    const legacy = pendingLegacyLoot(actor).map(item => ({ id: item.id, name: item.name, quantity: item.system.quantity }));
    const harvest = actor.system.harvest.map(row => ({ ...row }));
    const references = new Map();
    // Resolve before rolling. An unavailable canonical item must leave the whole operation retryable.
    for (const row of harvest.filter(row => !row.attempted && (row.quantity > 0 || !generated && row.formula))) {
      const source = await foundry.utils.fromUuid(row.uuid);
      if (!row.skill && (!source || !isPhysical(source))) throw new Error(`Предмет добычи недоступен: ${row.uuid}. Добыча не изменена.`);
      references.set(row.id, source);
    }
    const display = trackRollDisplay(), mode = game.settings.get("core", "messageMode");
    try {
      const rolls = [], creates = [], report = [];
      let crowns = 0;
      const quantityRoll = async formula => {
        const roll = await new foundry.dice.Roll(formula || "1").evaluate({ allowInteractive: mode !== "blind" });
        if (!Number.isFinite(roll.total)) throw new Error("Некорректная формула количества добычи.");
        rolls.push(roll);
        return Math.max(0, Math.floor(roll.total));
      };
      const personalBelongings = async (category, quantity) => {
        const { items } = await rollPersonalBelongings(category, quantity, () => quantityRoll("1d100"));
        for (const item of items) { creates.push(item); report.push(`${item.name}: ${item.system.quantity}`); }
      };
      if (!generated) for (const row of actor.system.creature.loot) {
        const quantity = await quantityRoll(row.formula);
        report.push(`${row.name}: ${quantity}`);
        if (row.currency) { crowns += quantity; continue; }
        if (/^случайн\S* рун/iu.test(row.name)) {
          const runes = UPGRADES.filter(entry => entry.id.startsWith("rune."));
          for (let i = 0; i < quantity; i++) {
            const entry = runes[(await quantityRoll(`1d${runes.length}`)) - 1];
            const source = await foundry.utils.fromUuid(`Compendium.${SYSTEM_ID}.equipment.Item.${entry.documentId}`);
            if (!source) throw new Error(`Руна недоступна: ${entry.name}. Добыча не изменена.`);
            creates.push(copyPhysical(source, 1)); report.push(entry.name);
          }
          continue;
        }
        let category = randomLootCategory(row.name);
        if (!category && quantity && /^случайн\S* предмет/iu.test(row.name)) {
          category = await foundry.applications.api.DialogV2.prompt({window:{title:"Случайные предметы"},
            content:'<p>Блок существа не задаёт категорию личных вещей. Выберите таблицу для бросков.</p><select name="category"><option value="ordinary">Обычные</option><option value="strange">Странные</option><option value="occult">Оккультные</option></select>',
            ok:{label:"Бросить",callback:(_event,button)=>button.form.elements.category.value},rejectClose:false});
          if (!category) return;
        }
        if (category) { await personalBelongings(category, quantity); continue; }
        if (quantity) creates.push({ name: row.name, type: "equipment", img: "icons/svg/item-bag.svg",
          system: { description: "<p>Добыча. Конкретные предметы выбирает ведущий.</p>", quantity } });
      }
      // Old generation already rolled these counts and crowns; only choose their concrete contents now.
      for (const item of legacy) {
        report.push(`${item.name}: ${item.quantity} (уточнение содержимого)`);
        await personalBelongings(randomLootCategory(item.name), item.quantity);
      }
      for (const row of harvest.filter(row => !row.attempted)) {
        if (!generated && row.formula) row.quantity = await quantityRoll(row.formula);
        const source = references.get(row.id);
        report.push(`${source?.name ?? "Предмет"}: ${row.quantity}${row.skill ? " (требуется извлечение)" : ""}`);
        if (row.skill) continue;
        if (row.quantity > 0) creates.push(copyPhysical(source, row.quantity));
        row.attempted = true;
      }
      const message = await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
        rolls: rolls.filter(roll => roll.dice.length), content: `<h3>Добыча: ${esc(actor.name)}</h3><ul>${report.map(line => `<li>${esc(line)}</li>`).join("")}</ul>`,
        flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true } } }, mode));
      if (!message) return;
      await display.wait(message);
      requireActiveGM();
      if (configuration(actor) !== before) throw new Error("Список добычи изменился во время броска. Откройте действие заново.");
      await inventoryTransaction(actor, { creates, deletes: legacy.map(item => item.id), actorUpdate: { "system.crowns": actor.system.crowns + crowns,
        "system.creature.lootGenerated": true, "system.harvest": harvest } });
    } finally { display.close(); }
  });
}
