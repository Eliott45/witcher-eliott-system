import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { validateForaging } from "../data/foraging.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export const foragingState = message => message?.author?.isGM ? message.flags[SYSTEM_ID]?.foraging : null;
export function foragingContent(state) {
  const status = {waiting:"Ожидает проверки",rolling:"Игрок бросает кубик…",resolving:"Определяется результат…",complete:"Сбор завершён. Результат — в чате."}[state.status];
  return `<section class="witcher-foraging-card"><h3><i class="fa-solid fa-leaf"></i> Собирательство</h3><strong>${esc(state.name)}</strong><p>${esc(state.actorName)}</p><p>${state.options.check ? `Выживание · СЛ ${state.options.dc}` : "Добыча из источника"}</p><small>${status}</small></section>`;
}
export const saveForaging = (message, state) => message.update({content:foragingContent(state),[`flags.${SYSTEM_ID}.foraging`]:state});

/** The GM publishes a request only. No dice or inventory changes happen until its owner responds. */
export async function forage(actor, material, options) {
  if (!game.user.isGM) throw new Error("Собирательство запускает ведущий.");
  validateForaging(actor,material,options);
  if (!material.testUserPermission(game.user,"LIMITED")) throw new Error("Нет доступа к материалу.");
  const state = {actor:actor.uuid,actorName:actor.name,material:material.uuid,name:material.name,
    sourceState:JSON.stringify(material.system.material),options:{check:!!options.check,dc:options.check ? options.dc : 0,formula:options.formula},status:"waiting",claim:null};
  return foundry.documents.ChatMessage.create({content:foragingContent(state),flags:{[SYSTEM_ID]:{skipLuck:true,foraging:state}}});
}

/** Called only inside the active GM's request queue, after the owner's completed roll. */
export async function resolveForaging(card, checkMessage) {
  if (!game.users.activeGM?.isSelf || game.messages.get(card.id) !== card) return;
  let state = foragingState(card);
  if (!state || !["rolling","resolving"].includes(state.status)) return;
  const actor = await fromUuid(state.actor), user = checkMessage?.author, check = checkMessage?.flags[SYSTEM_ID]?.foragingRoll;
  if (!actor || !user || !actor.testUserPermission(user,"OWNER") || check?.card !== card.id || !check.ready
    || check.nonce !== state.claim?.id || state.claim.user !== user.id || checkMessage.speakerActor?.uuid !== actor.uuid) return;
  if (state.options.check && (checkMessage.rolls.length !== 1 || !Number.isFinite(checkMessage.rolls[0].total)
    || checkMessage.flags[SYSTEM_ID]?.workshop?.skill !== "wildernessSurvival" || checkMessage.flags[SYSTEM_ID]?.workshop?.dc !== state.options.dc)) return;
  if (!state.options.check && checkMessage.rolls.length) return;
  if (state.roll && state.roll !== checkMessage.id) return;
  const material = await fromUuid(state.material);
  const formula = validateForaging(actor,material,state.options);
  if (!material.testUserPermission(game.user,"LIMITED") || JSON.stringify(material.system.material) !== state.sourceState)
    throw new Error("Материал изменился или недоступен. Создайте новый запрос на сбор.");
  const visibility = {whisper:[...checkMessage.whisper],blind:checkMessage.blind};
  const messageMode = visibility.blind ? "blind" : visibility.whisper.length ? "gm" : "public";
  return inventoryWrite(actor,async () => {
    state = {...state,status:"resolving",roll:checkMessage.id,success:!state.options.check || checkMessage.rolls[0].total >= state.options.dc};
    await saveForaging(card,state);
    if (state.quantity === undefined) {
      let quantity = state.success ? Number(formula) : 0;
      if (!Number.isFinite(quantity)) {
        // Reuse a posted yield after a reload or failed document update.
        let message = game.messages.find(entry => entry.author?.isGM && entry.flags[SYSTEM_ID]?.foragingYield === card.id);
        if (!message) {
          const display = trackRollDisplay();
          try {
            const roll = await evaluateRoll(formula,{allowInteractive:!visibility.blind});
            message = await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),...visibility,
              flavor:`<strong>Сбор: ${esc(state.name)}</strong><p>Количество найденных единиц</p>`,
              flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:true,foragingYield:card.id}}},{messageMode});
            if (!message) throw new Error("Бросок количества отменён.");
            await display.wait(message);
          } finally { display.close(); }
        }
        quantity = Math.max(0,Math.floor(message.rolls[0].total));
      }
      if (!Number.isSafeInteger(quantity)) throw new Error("Некорректное количество материала.");
      state = {...state,quantity};
      await saveForaging(card,state);
    }
    if (state.quantity && !actor.items.some(item => item.flags?.[SYSTEM_ID]?.foragingAward === card.id)) {
      if (game.messages.get(card.id) !== card || !game.users.activeGM?.isSelf) return;
      validateForaging(actor,material,state.options);
      if (JSON.stringify(material.system.material) !== state.sourceState) throw new Error("Материал изменился; создайте новый запрос на сбор.");
      const data = copyPhysical(material,state.quantity);
      data.flags ??= {}; data.flags[SYSTEM_ID] = {...data.flags[SYSTEM_ID],foragingAward:card.id};
      await inventoryTransaction(actor,{creates:[data]});
    }
    if (!game.messages.some(entry => entry.author?.isGM && entry.flags[SYSTEM_ID]?.foragingResult === card.id)) {
      await foundry.documents.ChatMessage.create({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),...visibility,
        content:`<p><strong>${esc(state.name)}</strong>: ${!state.success ? "поиск не удался" : state.quantity ? `собрано ${state.quantity} ед. и добавлено в инвентарь` : "пригодных единиц материала не найдено"}.</p>`,
        flags:{[SYSTEM_ID]:{skipLuck:true,foragingResult:card.id}}});
    }
    await saveForaging(card,{...state,status:"complete"});
    return {success:state.success,quantity:state.quantity};
  });
}
