import { SYSTEM_ID } from "../config.mjs";
import { validateForaging } from "../data/foraging.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { workshopCheck, workshopNotice } from "./check.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

const pending = new Set();
/** A GM starts each completed search explicitly; the book assigns its time and source availability to the GM. */
export async function forage(actor, material, options) {
  if (!game.user.isGM) throw new Error("Собирательство запускает ведущий.");
  const formula = validateForaging(actor, material, options);
  if (pending.has(actor.uuid)) throw new Error("Поиск этого персонажа уже выполняется.");
  const sourceState = JSON.stringify(material.system.material);
  const validate = () => {
    if (!game.user.isGM || !material.testUserPermission(game.user,"LIMITED")) throw new Error("Нет доступа к сбору материала.");
    validateForaging(actor, material, options);
    if (JSON.stringify(material.system.material) !== sourceState) throw new Error("Условия материала изменились; откройте сбор заново.");
  };
  pending.add(actor.uuid);
  try {
    return await inventoryWrite(actor, async () => {
      validate();
      const details = `${material.system.material.location || "Источник выбран ведущим"}. Затрачено: ${options.minutes} мин.`;
      const check = options.check ? await workshopCheck(actor,{name:`Собирательство: ${material.name}`,skill:"wildernessSurvival",dc:options.dc,details}) : {success:true};
      validate();
      if (!check.success) {
        await workshopNotice(actor,`<p><strong>${esc(material.name)}</strong>: поиск не удался.</p><p>${esc(details)}</p>`);
        return {success:false,quantity:0};
      }
      let quantity = Number(formula);
      if (!Number.isFinite(quantity)) {
        const display = trackRollDisplay();
        try {
          const mode = game.settings.get("core","messageMode");
          const roll = await new foundry.dice.Roll(formula).evaluate({allowInteractive:mode!=="blind"});
          const message = await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
            flavor:`<strong>Сбор: ${esc(material.name)}</strong><p>Количество найденных единиц</p>`,
            flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:true}}},{messageMode:mode});
          if (!message) throw new Error("Бросок количества отменён; материал не выдан.");
          await display.wait(message);
          quantity = Math.max(0,Math.floor(message.rolls[0].total));
        } finally { display.close(); }
      }
      if (!Number.isSafeInteger(quantity)) throw new Error("Некорректное количество материала.");
      validate();
      if (quantity) await inventoryTransaction(actor,{creates:[copyPhysical(material,quantity)]});
      await workshopNotice(actor,`<p><strong>${esc(material.name)}</strong>: ${quantity ? `собрано ${quantity} ед. и добавлено в инвентарь` : "пригодных единиц материала не найдено"}.</p><p>${esc(details)}</p>`);
      return {success:true,quantity};
    });
  } finally { pending.delete(actor.uuid); }
}

export function registerForaging() {
  game.system.api = {...game.system.api, forage: async () => {
    try {
      if (!game.user.isGM) throw new Error("Макрос собирательства доступен ведущему.");
      const {openForagingWindow} = await import("../sheets/foraging-window.mjs");
      return await openForagingWindow();
    } catch(error) { console.error(error); ui.notifications.warn(error.message); }
  }};
}
