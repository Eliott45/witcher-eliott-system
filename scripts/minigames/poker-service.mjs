import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { isCarried } from "../data/containers.mjs";
import { skillValue } from "../data/skills.mjs";
import { pokerClosed, requirePokerAction, rerollIndices, revealPoker, wagerAmount, pokerHand, LOADED_DICE_DC } from "./poker-rules.mjs";

export const pokerState = message => message?.flags?.[SYSTEM_ID]?.pokerTable;
export const pokerReceipt = message => message?.flags?.[SYSTEM_ID]?.pokerReceipt;
const requestOf = message => message?.flags?.[SYSTEM_ID]?.pokerRequest;
const gmDocument = message => Boolean(message?.author?.isGM);
export const pokerTables = () => game.messages.filter(message => gmDocument(message) && pokerState(message)?.version === 1);
const activeGM = () => game.users.activeGM?.id === game.user.id;
const gmIds = () => game.users.filter(user => user.isGM).map(user => user.id);
const copy = value => foundry.utils.deepClone(value);
const documentClass = () => foundry.documents.ChatMessage.implementation;
const messageSource = flags => ({ author: game.user.id, style: CONST.CHAT_MESSAGE_STYLES.OTHER, flags: { [SYSTEM_ID]: { skipLuck: true, ...flags } } });
export const ownedPokerActors = user => game.actors.filter(actor => ["character", "npc"].includes(actor.type) && actor.testUserPermission(user, "OWNER"));
export const hasLoadedDice = actor => Boolean(actor?.items.some(item => item.system.ruleId === "gear.loaded-dice" && item.system.quantity > 0 && isCarried(item)));
const receiptFor = requestId => game.messages.find(message => gmDocument(message) && pokerReceipt(message)?.requestId === requestId);
export function seatReceipt(id, tableId, userId, kind) {
  const message = game.messages.get(id), data = pokerReceipt(message);
  if (!gmDocument(message) || data?.tableId !== tableId || data.userId !== userId || ![kind].flat().includes(data.kind)) throw new Error("Результат броска недоступен. Попросите мастера восстановить стол.");
  return data;
}
function actorFor(uuid, user, required = false) {
  const actor = game.actors.find(entry => entry.uuid === uuid);
  if (!uuid && !required) return null;
  if (!actor || !["character", "npc"].includes(actor.type) || !actor.testUserPermission(user, "OWNER")) throw new Error("Выберите своего персонажа для этой партии.");
  return actor;
}
function participant(user, actor) {
  return { userId: user.id, name: actor?.name ?? user.name, actorUuid: actor?.uuid ?? "", revision: 0, opening: "", draw: "", rerolled: [], palm: "", final: "" };
}
export function pokerCard(state) {
  const phase = { invited: "Приглашение за стол", funding: "Сбор ставок", opening: "Первый бросок", drawing: "Переброс костей", palming: "Вскрытие", settling: "Расчёт банка", finished: "Партия завершена", declined: "Приглашение отклонено", cancelled: "Партия отменена" }[state.phase];
  const result = state.phase === "finished" ? state.winner === null ? "Ничья" : `Победитель: ${state.seats[state.winner].name}` : phase;
  const caught = state.phase === "finished" && state.reason === "caught" ? `<p class="witcher-poker-caught"><i class="fa-solid fa-mask"></i> ${state.caught.map(index => esc(state.seats[index].name)).join(" и ")}: пойман на шулерских костях</p>` : "";
  const hands = state.phase === "finished" && state.hands.every(hand => hand.length === 5) ? `<p>${state.seats.map((seat, index) => `${esc(seat.name)}: ${pokerHand(state.hands[index]).name}`).join(" · ")}</p>` : "";
  const audience = state.open === false ? "Закрытая партия" : "Зрители могут смотреть";
  return `<section class="witcher-poker-card"><h3><i class="fa-solid fa-dice"></i> Покер на костях</h3><p>${state.seats.map(seat => esc(seat.name)).join(" против ")}</p><strong>${esc(result)}</strong>${caught}${hands}<p>${state.stake ? `Ставка: ${state.stake} кр. с каждого · Банк: ${state.stake * 2} кр.` : "Игра без ставок"} · ${audience}</p><button type="button" data-poker-open><i class="fa-solid fa-dice-five"></i> Открыть стол</button></section>`;
}
async function saveTable(message, state) {
  if (!activeGM()) throw new Error("Мастер сменился. Повторите действие после подключения ведущего.");
  const saved = await message.update({ [`flags.${SYSTEM_ID}.pokerTable`]: state, content: pokerCard(state) });
  if (!saved) throw new Error("Не удалось сохранить партию.");
}
async function saveReceipt(message, data) {
  const saved = await message.update({ [`flags.${SYSTEM_ID}.pokerReceipt`]: data });
  if (!saved) throw new Error("Не удалось сохранить результат хода.");
}
async function createReceipt(request, user, fields) {
  return documentClass().create({ ...messageSource({ pokerReceipt: { requestId: request.id, userId: user.id, done: false, ...fields } }),
    whisper: [...new Set([user.id, ...gmIds()])], content: "<p>Ход за столом покера.</p>" });
}
const actorOf = seat => seat.actorUuid ? game.actors.find(actor => actor.uuid === seat.actorUuid) ?? null : null;
/** The opponent's character gets a hidden Awareness check; only the GM sees the swap and the roll. */
async function spotSwap(state, index, cheat) {
  const cheater = state.seats[index], watcher = actorOf(state.seats[1 - index]);
  let skill = null;
  try { skill = watcher ? skillValue(watcher.system, "awareness") : null; } catch { skill = null; }
  const roll = skill?.total == null ? null : await new Roll(`1d10wc + ${skill.total}`).evaluate();
  const spotted = Boolean(roll && roll.total >= LOADED_DICE_DC);
  const check = roll ? `<p>Внимание: ${esc(watcher.name)} — ${roll.total} против СЛ ${LOADED_DICE_DC}. <strong>${spotted ? "Подмена замечена: шулер проигрывает." : "Подмену не заметили."}</strong></p>`
    : `<p>У соперника нет персонажа — при желании проведите проверку Внимания СЛ ${LOADED_DICE_DC} вручную.</p>`;
  await documentClass().create({ ...messageSource({ pokerNote: true }), whisper: gmIds(), blind: true, rolls: roll ? [roll] : [],
    content: `<section class="witcher-poker-card is-note"><h3><i class="fa-solid fa-mask"></i> Шулерские кости</h3><p>${esc(cheater.name)} подменяет кость ${cheat.index + 1}: ${cheat.from} → ${cheat.value}.</p>${check}</section>` });
  return { spotted, check: roll?.total ?? null };
}
function revealTable(state, table) {
  const finals = state.seats.map(row => seatReceipt(row.final, table.id, row.userId, ["reroll", "finish"]));
  const caught = finals.flatMap((receipt, index) => receipt.cheat?.spotted ? [index] : []);
  return { ...revealPoker(state, finals.map(receipt => receipt.dice), caught), swaps: finals.map(receipt => receipt.cheat?.spotted ? receipt.cheat.index : -1) };
}
/** Once both have rerolled: reveal at once, unless someone carries loaded dice and may still palm one die. */
function afterDraws(state, table) {
  if (state.phase !== "drawing" || !state.seats.every(row => row.draw)) return state;
  // Every die is already on the table, which is exactly when the rule lets the cheater swap one.
  for (const row of state.seats) if (!row.final) {
    if (hasLoadedDice(actorOf(row))) row.palm = true;
    else row.final = row.draw;
  }
  return state.seats.some(row => !row.final) ? { ...state, phase: "palming" } : revealTable(state, table);
}
async function rollDice(count) {
  if (!count) return [];
  // Plain d6: neither Witcher critical chains, Luck nor a second chat roll change these dice.
  const roll = await new Roll(`${count}d6`).evaluate();
  return roll.dice.flatMap(die => die.results.filter(result => result.active !== false).map(result => result.result));
}
const ledger = (actor, tableId) => actor.flags?.[SYSTEM_ID]?.pokerBank?.[tableId] ?? {};
const balance = actor => Number(actor.system.crowns);
async function withWallets(actors, work) {
  const sorted = [...new Set(actors)].sort((a, b) => a.uuid.localeCompare(b.uuid));
  const next = index => index === sorted.length ? work() : inventoryWrite(sorted[index], () => next(index + 1));
  return next(0);
}
/** Balance and receipt share one Actor update; a reconnect may safely repeat either transfer. */
async function transfer(actor, tableId, amount, field) {
  if (!activeGM()) throw new Error("Сменился активный мастер.");
  const record = ledger(actor, tableId);
  if (record[field]) return;
  const crowns = Math.round((balance(actor) + amount) * 100) / 100;
  if (!Number.isFinite(crowns) || crowns < 0) throw new Error(`У ${actor.name} недостаточно крон.`);
  const saved = await actor.update({ "system.crowns": crowns, [`flags.${SYSTEM_ID}.pokerBank.${tableId}`]: { ...record, [field]: true } });
  if (!saved) throw new Error("Не удалось сохранить изменение кошелька.");
}
/** Durable funding/settlement phases also recover after a GM disconnects between the two wallets. */
export async function recoverPokerBank(message) {
  const state = copy(pokerState(message));
  if (!activeGM() || !["funding", "settling"].includes(state?.phase)) return;
  try {
    if (state.stake) {
      const actors = state.seats.map(seat => actorFor(seat.actorUuid, game.users.get(seat.userId), true));
      await withWallets(actors, async () => {
        if (state.phase === "funding") {
          for (const actor of actors) if (!ledger(actor, message.id).deposit && balance(actor) < state.stake) throw new Error(`У ${actor.name} больше не хватает крон. Пополните кошелёк или отмените партию с возвратом.`);
          for (const actor of actors) await transfer(actor, message.id, -state.stake, "deposit");
        } else {
          for (const [index, actor] of actors.entries()) {
            const deposited = ledger(actor, message.id).deposit;
            const amount = state.winner === null ? (deposited ? state.stake : 0) : index === state.winner ? actors.reduce((sum, payer) => sum + (ledger(payer, message.id).deposit ? state.stake : 0), 0) : 0;
            await transfer(actor, message.id, amount, "paid");
          }
        }
      });
    }
    await saveTable(message, { ...state, issue: "", phase: state.phase === "funding" ? "opening" : state.reason === "cancelled" ? "cancelled" : "finished" });
  } catch (error) {
    if (activeGM()) await saveTable(message, { ...state, issue: error.message });
    throw error;
  }
}
let jobs = Promise.resolve();
export function pokerWrite(work) {
  const job = jobs.catch(() => {}).then(work); jobs = job; return job;
}
async function challenge(request, user, data) {
  const existing = pokerTables().find(message => pokerState(message).invitation === request.id);
  if (existing) return existing;
  const opponent = game.users.get(data.opponentId), stake = wagerAmount(data.stake);
  if (!opponent?.active || opponent.id === user.id) throw new Error("Выберите другого подключённого игрока или мастера.");
  if (pokerTables().some(message => !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.userId === user.id || seat.userId === opponent.id))) throw new Error("Один из участников уже за столом. Завершите или отмените его партию.");
  const actor = actorFor(data.actorUuid, user, stake > 0);
  if (actor && balance(actor) < stake) throw new Error("Не хватает крон для ставки.");
  const open = data.open !== false;
  const state = { version: 1, invitation: request.id, phase: "invited", stake, tieMode: "faces", issue: "", hands: [[], []], winner: null, reason: "", processed: [request.id],
    seats: [participant(user, actor), participant(opponent, null)], created: Date.now(), open };
  // The table holds no secrets (dice are public, swaps live in private receipts), so an open game is a public card anyone can watch.
  return documentClass().create({ ...messageSource({ pokerTable: state }), whisper: open ? [] : [...new Set([user.id, opponent.id, ...gmIds()])], content: pokerCard(state) });
}
/** Requests are native ChatMessages: the server records their author. Only GM-authored receipts are trusted. */
export async function processPokerRequest(request, creatorId) {
  if (!activeGM() || !requestOf(request) || (creatorId && creatorId !== request.author?.id)) return;
  const user = game.users.get(request.author?.id);
  if (!user) return;
  const command = copy(requestOf(request)), prior = receiptFor(request.id);
  if (pokerReceipt(prior)?.done) return;
  let receipt = prior;
  try {
    let table;
    if (command.action === "challenge") table = await challenge(request, user, command.data ?? {});
    else {
      table = game.messages.get(command.tableId);
      if (!gmDocument(table) || !pokerState(table)) throw new Error("Стол больше недоступен.");
      let state = copy(pokerState(table));
      if (!state.processed.includes(request.id)) {
        const staged = game.messages.find(message => gmDocument(message) && pokerReceipt(message)?.tableId === table.id
          && pokerReceipt(message).userId === user.id && !pokerReceipt(message).done && message.id !== receipt?.id && pokerReceipt(message).dice);
        if (staged) {
          const original = game.messages.get(pokerReceipt(staged).requestId);
          if (original) await processPokerRequest(original);
          if (!pokerReceipt(staged).done) throw new Error("Предыдущий бросок уже сохранён. Попросите мастера восстановить соединение.");
          state = copy(pokerState(table));
        }
        if (command.action === "abort" || command.action === "recover") {
          if (!user.isGM || pokerClosed(state)) throw new Error("Это действие доступно ведущему для незавершённой партии.");
          if (command.action === "abort" && state.phase === "settling") throw new Error("Результат уже зафиксирован. Завершите расчёт банка; изменить победителя нельзя.");
          if (command.action === "abort") state = { ...state, phase: state.phase === "invited" ? "cancelled" : "settling", winner: null, reason: "cancelled" };
          else if (!["funding", "settling"].includes(state.phase)) throw new Error("Расчёт банка не требуется.");
        } else {
          const index = requirePokerAction(state, user.id, command.action, command.revision), seat = state.seats[index], data = command.data ?? {};
          if (command.action === "accept") {
            const actor = actorFor(data.actorUuid, user, state.stake > 0);
            if (actor && actor.uuid === state.seats[0].actorUuid) throw new Error("За столом должны быть разные персонажи.");
            if (actor && balance(actor) < state.stake) throw new Error("Не хватает крон, чтобы принять ставку.");
            state.seats[index] = participant(user, actor); state.phase = "funding";
          } else if (["decline", "cancel"].includes(command.action)) state.phase = command.action === "decline" ? "declined" : "cancelled";
          else if (command.action === "concede") { state.phase = "settling"; state.winner = 1 - index; state.reason = "conceded"; }
          else {
            const kind = command.action;
            let dice = pokerReceipt(receipt)?.dice, cheat = null;
            if (!dice) {
              if (kind === "roll") dice = await rollDice(5);
              else if (kind === "reroll") {
                const indices = rerollIndices(data.indices), rolled = await rollDice(indices.length);
                dice = [...state.hands[index]]; indices.forEach((position, i) => dice[position] = rolled[i]);
              } else {
                dice = [...seatReceipt(seat.draw, table.id, user.id, "reroll").dice];
                if (data.cheat) {
                  const { index: position, value } = data.cheat;
                  rerollIndices([position]); if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error("На кости может быть от 1 до 6.");
                  if (dice[position] !== value) {
                    if (!hasLoadedDice(actorFor(seat.actorUuid, user))) throw new Error("Шулерские кости должны быть при себе.");
                    cheat = { index: position, from: dice[position], value };
                    dice[position] = value;
                    Object.assign(cheat, await spotSwap(state, index, cheat));
                  }
                }
              }
              pokerHand(dice);
              receipt = await createReceipt(request, user, { tableId: table.id, kind, dice, ...(cheat ? { cheat } : {}), ...(kind === "reroll" ? { indices: rerollIndices(data.indices) } : {}) });
            }
            if (kind === "roll") {
              seat.opening = receipt.id; state.hands[index] = [...pokerReceipt(receipt).dice];
              if (state.seats.every(row => row.opening)) {
                state.hands = state.seats.map(row => seatReceipt(row.opening, table.id, row.userId, "roll").dice); state.phase = "drawing";
              }
            } else if (kind === "reroll") {
              // Rerolled dice are open to both players at once, as at a real table.
              seat.draw = receipt.id; seat.rerolled = pokerReceipt(receipt).indices ?? []; state.hands[index] = [...pokerReceipt(receipt).dice];
              state = afterDraws(state, table);
            } else {
              seat.final = receipt.id;
              if (state.seats.every(row => row.final)) state = revealTable(state, table);
            }
          }
          state.seats[index].revision++;
        }
        state.processed.push(request.id);
        await saveTable(table, state);
      }
      await recoverPokerBank(table);
    }
    receipt ??= await createReceipt(request, user, { tableId: table.id, kind: command.action });
    await saveReceipt(receipt, { ...pokerReceipt(receipt), done: true, ok: true, tableId: table.id });
  } catch (error) {
    // A persisted die must not turn into a fresh reroll if a later write fails. Keep it for retry.
    if (receipt && !pokerReceipt(receipt).done) {
      ui.notifications.warn(`Покер: ${error.message}`); return;
    }
    receipt ??= await createReceipt(request, user, { tableId: command.tableId ?? "", kind: command.action });
    await saveReceipt(receipt, { ...pokerReceipt(receipt), done: true, ok: false, error: error.message });
  }
}
const sending = new Map();
export function sendPoker(action, table = null, data = {}) {
  const key = table?.id ?? "challenge";
  if (sending.has(key)) return sending.get(key);
  const work = (async () => {
    if (!game.users.activeGM) throw new Error("Для синхронизации стола нужен подключённый мастер.");
    const row = pokerState(table)?.seats.find(seat => seat.userId === game.user.id);
    const request = await documentClass().create({ ...messageSource({ pokerRequest: { action, tableId: table?.id ?? "", revision: row?.revision ?? 0, data } }),
      whisper: [...new Set([game.user.id, ...gmIds()])], content: "<p>Действие за столом покера.</p>" });
    if (!request) throw new Error("Не удалось отправить ход.");
    if (activeGM()) await pokerWrite(() => processPokerRequest(request, game.user.id));
    return new Promise((resolve, reject) => {
      let createHook, updateHook, timer;
      const finish = () => {
        const message = receiptFor(request.id), reply = pokerReceipt(message);
        if (!reply?.done) return;
        clearTimeout(timer); Hooks.off("createChatMessage", createHook); Hooks.off("updateChatMessage", updateHook);
        if (reply.ok) resolve(game.messages.get(reply.tableId)); else reject(new Error(reply.error));
      };
      createHook = Hooks.on("createChatMessage", finish); updateHook = Hooks.on("updateChatMessage", finish);
      timer = setTimeout(() => { Hooks.off("createChatMessage", createHook); Hooks.off("updateChatMessage", updateHook); reject(new Error("Мастер пока не ответил. Ход сохранён; откройте стол после его подключения.")); }, 15000);
      finish();
    });
  })();
  sending.set(key, work); const clear = () => sending.delete(key); work.then(clear, clear); return work;
}
export async function resumePoker() {
  if (!activeGM()) return;
  for (const table of pokerTables()) if (["funding", "settling"].includes(pokerState(table).phase)) {
    try { await recoverPokerBank(table); } catch (error) { console.warn("Poker bank recovery", error); }
  }
  for (const message of game.messages) if (requestOf(message) && !pokerReceipt(receiptFor(message.id))?.done) await processPokerRequest(message);
}
