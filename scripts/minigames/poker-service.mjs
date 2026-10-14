import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { isCarried } from "../data/containers.mjs";
import { skillValue } from "../data/skills.mjs";
import { setStatus, hasStatus } from "../combat/status-effects.mjs";
import { pokerClosed, requirePokerAction, rerollIndices, revealPoker, wagerAmount, pokerHand, gameOf, controlsSeat, LOADED_DICE_DC } from "./poker-rules.mjs";
import { HOARD_MAX, HOARD_MIN, SNAKE_AWARENESS, SNAKE_BITE, DOPING_BONUS, DOPING_DC, DOPING_STATUSES, hoardCoins, hoardSeat, applyReach, leaveHoard, hoardPayouts, hoardLeader } from "./hoard-rules.mjs";
import { tavernCheck, critText } from "./tavern-dice.mjs";
import { GWENT_SKILLS, drawGwentCard, gwentDeckBonus, gwentForgeries, gwentStart, settleGwentRound, clamp } from "./gwent-rules.mjs";

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
export const isGwentDeck = item => item?.system?.ruleId === "gear.gwent-deck";
/** Deck rarity (+1…+3, set by the GM) and forged cards live on the deck item. */
export function gwentDeckData(item) {
  const flags = item?.flags?.[SYSTEM_ID]?.gwent ?? {};
  return { quality: clamp(flags.quality, 0, 3), forgeries: gwentForgeries(flags.forgeries) };
}
export const gwentDecks = actor => (actor?.items.filter(item => isGwentDeck(item) && item.system.quantity > 0 && isCarried(item)) ?? [])
  .map(item => ({ id: item.id, name: item.name, ...gwentDeckData(item) }));
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
/** `npc` seats belong to the GMs: any GM may play them, several at once. */
function participant(user, actor, extra = {}) {
  return { userId: user.id, name: actor?.name ?? user.name, actorUuid: actor?.uuid ?? "", npc: false, revision: 0, opening: "", draw: "", rerolled: [], palm: "", final: "", ...extra };
}
/** The GM may seat any character or NPC of the world, not only owned ones. */
function npcActor(uuid) {
  const actor = game.actors.find(entry => entry.uuid === uuid);
  if (!actor || !["character", "npc"].includes(actor.type)) throw new Error("Выберите персонажа или НПС для места за столом.");
  return actor;
}
/** Without a chosen deck the players borrow the tavern's: no rarity bonus, no forged cards. */
function deckFor(actor, data) {
  if (!data.deckId) return { name: "", quality: 0, fakes: 0, fakeDc: 0 };
  const item = actor?.items.get(data.deckId);
  if (!isGwentDeck(item) || !isCarried(item) || !(item.system.quantity > 0)) throw new Error("Колода для гвинта должна быть при себе у выбранного персонажа.");
  const { quality, forgeries } = gwentDeckData(item), fakes = data.fakes ? forgeries.count : 0;
  return { name: item.name, quality, fakes, fakeDc: fakes ? forgeries.dc : 0 };
}
function gwentCard(state) {
  const phase = { invited: "Приглашение за стол", funding: "Сбор ставок", playing: `Раунд ${state.round} из 3`, settling: "Расчёт банка", finished: "Партия завершена", declined: "Приглашение отклонено", cancelled: "Партия отменена" }[state.phase];
  const result = state.phase === "finished" ? state.winner === null ? "Ничья" : `Победитель: ${state.seats[state.winner].name}` : phase;
  const caught = state.phase === "finished" && state.reason === "caught" ? `<p class="witcher-poker-caught"><i class="fa-solid fa-mask"></i> ${state.caught.map(index => esc(state.seats[index].name)).join(" и ")}: пойман на поддельных картах</p>` : "";
  const score = ["playing", "settling", "finished"].includes(state.phase) ? `<p>Счёт раундов: ${state.score.join(" : ")}</p>` : "";
  const audience = state.open === false ? "Закрытая партия" : "Зрители могут смотреть";
  return `<section class="witcher-poker-card is-gwent"><h3><i class="fa-solid fa-layer-group"></i> Гвинт</h3><p>${state.seats.map(seat => esc(seat.name)).join(" против ")}</p><strong>${esc(result)}</strong>${caught}${score}<p>${state.stake ? `Ставка: ${state.stake} кр. с каждого · Банк: ${state.stake * 2} кр.` : "Игра без ставок"} · ${audience}</p><button type="button" data-poker-open><i class="fa-solid fa-layer-group"></i> Открыть стол</button></section>`;
}
function hoardCard(state) {
  const phase = { gathering: "Набор участников", funding: "Монеты на стол", playing: `Раунд ${state.round}`, settling: "Подсчёт добычи", finished: "Клад разобран", cancelled: "Игра отменена" }[state.phase];
  const coins = state.stake ? "кр." : "монет";
  const loot = ["playing", "settling", "finished"].includes(state.phase) ? `<p>${state.seats.map(seat => `${esc(seat.name)}: ${seat.collected}${seat.bites ? ` · укусов ${seat.bites}` : ""}${seat.caught ? " · пойман" : ""}`).join("<br>")}</p><p>В корзине: ${state.pot} ${coins}</p>` : `<p>${state.seats.map(seat => esc(seat.name)).join(", ")}</p>`;
  const audience = state.open === false ? "Закрытая игра" : "Зрители могут смотреть";
  return `<section class="witcher-poker-card is-hoard"><h3><i class="fa-solid fa-staff-snake"></i> Драконий клад</h3><strong>${esc(phase)}</strong>${loot}<p>${state.stake ? `По ${state.stake} кр. с каждого` : "По 10 монет с каждого, без крон"} · ${audience}</p><button type="button" data-poker-open><i class="fa-solid fa-staff-snake"></i> Открыть стол</button></section>`;
}
export function pokerCard(state) {
  if (gameOf(state) === "hoard") return hoardCard(state);
  if (gameOf(state) === "gwent") return gwentCard(state);
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
const skillTotal = (actor, key) => { try { const total = actor ? skillValue(actor.system, key)?.total : null; return Number.isFinite(total) ? total : null; } catch { return null; } };
const crit = check => check.faces.length > 1 ? ` (${critText(check.faces)})` : "";
/** The opponent's character gets a hidden Awareness check; only the GM sees the trick and the roll. */
async function spotCheat(state, index, dc, title, text) {
  const watcher = actorOf(state.seats[1 - index]), awareness = skillTotal(watcher, "awareness");
  const roll = awareness == null ? null : await tavernCheck(awareness);
  const spotted = Boolean(roll && roll.total >= dc);
  const check = roll ? `<p>Внимание: ${esc(watcher.name)} — ${roll.total}${crit(roll)} против СЛ ${dc}. <strong>${spotted ? "Обман замечен: шулер проигрывает." : "Обман не заметили."}</strong></p>`
    : `<p>У соперника нет персонажа — при желании проведите проверку Внимания СЛ ${dc} вручную.</p>`;
  await documentClass().create({ ...messageSource({ pokerNote: true }), whisper: gmIds(), blind: true,
    content: `<section class="witcher-poker-card is-note"><h3><i class="fa-solid fa-mask"></i> ${title}</h3><p>${esc(state.seats[index].name)} ${text}</p>${check}</section>` });
  return { spotted, check: roll?.total ?? null };
}
/** At the start of each round the snake checks Awareness (base 12); everyone sees the number before reaching. */
async function snakeTick(state) {
  if (gameOf(state) !== "hoard" || state.phase !== "playing" || state.snake) return state;
  const roll = await tavernCheck(SNAKE_AWARENESS);
  return { ...state, snake: { total: roll.total, faces: roll.faces, round: state.round } };
}
/** «Дыхание суккуба» is easy to smell: every other player with a character gets one hidden Awareness check. */
async function spotDoping(state, index) {
  const lines = [];
  let caught = false;
  for (const [other, seat] of state.seats.entries()) {
    if (other === index || !seat.active) continue;
    const watcher = actorOf(seat), awareness = skillTotal(watcher, "awareness");
    if (awareness == null) continue;
    const roll = await tavernCheck(awareness), spotted = roll.total >= DOPING_DC;
    caught ||= spotted; lines.push(`${esc(watcher.name)}: ${roll.total}${crit(roll)}${spotted ? " — заметил!" : ""}`);
  }
  await documentClass().create({ ...messageSource({ pokerNote: true }), whisper: gmIds(), blind: true,
    content: `<section class="witcher-poker-card is-note"><h3><i class="fa-solid fa-mask"></i> Дыхание суккуба</h3><p>${esc(state.seats[index].name)} тянется к корзине под действием состава (+${DOPING_BONUS} к Ловкости рук).</p><p>Внимание против СЛ ${DOPING_DC}: ${lines.join(", ") || "некому проверить"}.</p><p><strong>${caught ? "Обман замечен: игрок выбывает, его монеты возвращаются в корзину." : "Никто не заметил."}</strong></p></section>` });
  return { caught };
}
/** One reach into the basket: Sleight of Hand must beat the snake; a miss means Dodge/Escape against a base 10 bite. */
async function reachHoard(state, index) {
  const seat = state.seats[index], actor = actorOf(seat), sleight = skillTotal(actor, "sleightOfHand") ?? 0;
  const doping = Boolean(actor?.effects && DOPING_STATUSES.some(status => hasStatus(actor, status)));
  const play = { snake: state.snake.total, sleight, doping };
  if (doping && !seat.checked) Object.assign(play, await spotDoping(state, index));
  if (play.caught) return play;
  const grab = await tavernCheck(sleight + (doping ? DOPING_BONUS : 0));
  Object.assign(play, { grab: grab.total, grabFaces: grab.faces, success: grab.total > play.snake });
  if (!play.success) {
    const dodge = await tavernCheck(skillTotal(actor, "dodgeEscape") ?? 0), bite = await tavernCheck(SNAKE_BITE);
    Object.assign(play, { dodge: dodge.total, dodgeFaces: dodge.faces, bite: bite.total, biteFaces: bite.faces, bitten: bite.total > dodge.total });
    // The supplement's snake is venomous: a bite poisons the character (the GM rules on anything harsher).
    if (play.bitten && actor?.effects) await setStatus(actor, "poisoned", true);
  }
  return play;
}
const spotSwap = (state, index, cheat) => spotCheat(state, index, LOADED_DICE_DC, "Шулерские кости", `подменяет кость ${cheat.index + 1}: ${cheat.from} → ${cheat.value}.`);
/** One gwent round for one player: a d10 card from the table, then 1d10 + Gambling or Tactics with every modifier. */
async function playGwent(state, index, data) {
  const seat = state.seats[index], skill = GWENT_SKILLS[data.skill] ? data.skill : "gambling", value = skillTotal(actorOf(seat), skill) ?? 0;
  const card = await drawGwentCard(async () => (await new Roll("1d10").evaluate()).total, state.round);
  const deck = gwentDeckBonus(seat.deck), carry = state.carry?.[index] ?? 0, base = value + card.mod + deck + carry;
  const roll = await tavernCheck(base);
  const play = { skill, skillValue: value, card, deck, carry, die: roll.die, faces: roll.faces, total: roll.total };
  // Forged cards are in the deck from the first hand; the opponent gets one chance to notice them.
  if (state.round === 1 && seat.deck?.fakes) Object.assign(play, await spotCheat(state, index, seat.deck.fakeDc, "Поддельные карты гвинта", `играет колодой с поддельными картами (+${seat.deck.fakes}).`));
  return play;
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
          const deposits = actors.map(actor => ledger(actor, message.id).deposit ? state.stake : 0), pot = deposits.reduce((a, b) => a + b, 0);
          // Hoard players keep what they grabbed; the duel games pay the whole bank to the winner.
          const amounts = state.reason === "cancelled" ? deposits : gameOf(state) === "hoard" ? deposits.every(Boolean) ? hoardPayouts(state) : deposits
            : state.winner === null ? deposits : actors.map((_, index) => index === state.winner ? pot : 0);
          for (const [index, actor] of actors.entries()) await transfer(actor, message.id, amounts[index], "paid");
        }
      });
    }
    const started = gameOf(state) === "poker" ? "opening" : "playing";
    await saveTable(message, await snakeTick({ ...state, issue: "", phase: state.phase === "funding" ? started : state.reason === "cancelled" ? "cancelled" : "finished" }));
  } catch (error) {
    if (activeGM()) await saveTable(message, { ...state, issue: error.message });
    throw error;
  }
}
let jobs = Promise.resolve();
export function pokerWrite(work) {
  const job = jobs.catch(() => {}).then(work); jobs = job; return job;
}
const seatedElsewhere = userId => pokerTables().some(message => !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.userId === userId && !seat.npc));
async function challenge(request, user, data) {
  const existing = pokerTables().find(message => pokerState(message).invitation === request.id);
  if (existing) return existing;
  const stake = wagerAmount(data.stake), kind = ["gwent", "hoard"].includes(data.game) ? data.game : "poker", gwent = kind === "gwent";
  // GMs run any number of tables and NPC seats; a player sits at one table at a time.
  if (!user.isGM && seatedElsewhere(user.id)) throw new Error("Вы уже за столом. Завершите или отмените свою партию.");
  const own = user.isGM && data.actorUuid ? npcActor(data.actorUuid) : actorFor(data.actorUuid, user, stake > 0 || Boolean(data.deckId));
  if (own && stake && balance(own) < stake) throw new Error("Не хватает крон для ставки.");
  const open = data.open !== false, host = participant(user, own, { npc: Boolean(user.isGM && own), ...(gwent ? { deck: deckFor(own, data) } : {}), ...(kind === "hoard" ? hoardSeat() : {}) });
  const base = { version: 1, invitation: request.id, stake, tieMode: "faces", issue: "", hands: [[], []], winner: null, reason: "", processed: [request.id], created: Date.now(), open };
  let state;
  if (kind === "hoard") state = { ...base, game: "hoard", phase: "gathering", seats: [host], pot: 0, round: 0, snake: null, log: [], ...hoardCoins(stake) };
  else if (String(data.opponentId).startsWith("actor:")) {
    // Against an NPC the GM plays both sides of the table, so there is nobody to invite.
    if (!user.isGM) throw new Error("Сажать НПС за стол может только мастер.");
    const npc = npcActor(data.opponentId.slice(6));
    if (npc.uuid === own?.uuid) throw new Error("За столом должны быть разные персонажи.");
    if (stake && balance(npc) < stake) throw new Error(`У ${npc.name} не хватает крон для ставки.`);
    state = { ...base, phase: "funding", seats: [host, participant(user, npc, { npc: true, ...(gwent ? { deck: deckFor(null, {}) } : {}) })], ...(gwent ? { game: "gwent", ...gwentStart() } : {}) };
  } else {
    const opponent = game.users.get(data.opponentId);
    if (!opponent?.active || opponent.id === user.id) throw new Error("Выберите другого подключённого игрока или мастера.");
    if (!opponent.isGM && seatedElsewhere(opponent.id)) throw new Error("Соперник уже за другим столом.");
    state = { ...base, phase: "invited", seats: [host, participant(opponent, null, gwent ? { deck: deckFor(null, {}) } : {})], ...(gwent ? { game: "gwent", ...gwentStart() } : {}) };
  }
  const opponent = kind === "hoard" ? null : game.users.get(state.seats[1].userId);
  // The table holds no secrets (dice are public, swaps live in private receipts), so an open game is a public card anyone can watch.
  return documentClass().create({ ...messageSource({ pokerTable: state }), whisper: open ? [] : [...new Set([user.id, ...(opponent ? [opponent.id] : []), ...gmIds()])], content: pokerCard(state) });
}
/** Table-level hoard moves: anyone may join until the host starts; the GM adds NPCs and may remove seats. */
function hoardTable(state, user, command) {
  const data = command.data ?? {}, host = controlsSeat(state.seats[0], user) || user.isGM;
  if (gameOf(state) !== "hoard" || state.phase !== "gathering") throw new Error("Набор за этот стол уже закрыт.");
  const seats = [...state.seats];
  const seatActor = actor => { if (actor && seats.some(seat => seat.actorUuid === actor.uuid)) throw new Error("Этот персонаж уже за столом."); return actor; };
  if (command.action === "join" || command.action === "addNpc") {
    if (seats.length >= HOARD_MAX) throw new Error(`За корзиной помещаются не больше ${HOARD_MAX} игроков.`);
    if (command.action === "addNpc") {
      if (!user.isGM) throw new Error("Добавлять НПС может только мастер.");
      const actor = seatActor(npcActor(data.actorUuid));
      if (state.stake && balance(actor) < state.stake) throw new Error(`У ${actor.name} не хватает крон для ставки.`);
      seats.push(participant(user, actor, { npc: true, ...hoardSeat() }));
    } else {
      if (seats.some(seat => seat.userId === user.id && !seat.npc)) throw new Error("Вы уже за этим столом.");
      if (!user.isGM && seatedElsewhere(user.id)) throw new Error("Вы уже за другим столом.");
      const actor = seatActor(actorFor(data.actorUuid, user, state.stake > 0));
      if (actor && balance(actor) < state.stake) throw new Error("Не хватает крон для ставки.");
      seats.push(participant(user, actor, hoardSeat()));
    }
    return { ...state, seats };
  }
  if (!host) throw new Error("Это решает хозяин стола или мастер.");
  if (command.action === "kick") {
    const index = Number(data.seat);
    if (!Number.isInteger(index) || index < 1 || index >= seats.length) throw new Error("Такого места нет.");
    seats.splice(index, 1); return { ...state, seats };
  }
  if (seats.length < HOARD_MIN) throw new Error(`Нужно хотя бы ${HOARD_MIN} игрока.`);
  return { ...state, phase: "funding", round: 1, pot: state.per * seats.length };
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
    if (command.action === "challenge") {
      table = await challenge(request, user, command.data ?? {});
      if (pokerState(table)?.phase === "funding") await recoverPokerBank(table);
    }
    else {
      table = game.messages.get(command.tableId);
      if (!gmDocument(table) || !pokerState(table)) throw new Error("Стол больше недоступен.");
      let state = copy(pokerState(table));
      if (!state.processed.includes(request.id)) {
        const staged = game.messages.find(message => gmDocument(message) && pokerReceipt(message)?.tableId === table.id
          && pokerReceipt(message).userId === user.id && !pokerReceipt(message).done && message.id !== receipt?.id && (pokerReceipt(message).dice || pokerReceipt(message).play));
        if (staged) {
          const original = game.messages.get(pokerReceipt(staged).requestId);
          if (original) await processPokerRequest(original);
          if (!pokerReceipt(staged).done) throw new Error("Предыдущий бросок уже сохранён. Попросите мастера восстановить соединение.");
          state = copy(pokerState(table));
        }
        if (["abort", "end", "recover"].includes(command.action)) {
          if (!user.isGM || pokerClosed(state)) throw new Error("Это действие доступно ведущему для незавершённой партии.");
          if (command.action !== "recover" && state.phase === "settling") throw new Error("Результат уже зафиксирован. Завершите расчёт банка; изменить победителя нельзя.");
          // Ending early: hoard players keep what they already grabbed; a duel without a result returns the stakes.
          if (command.action === "end" && gameOf(state) === "hoard" && state.phase === "playing") state = { ...state, phase: "settling", winner: null, reason: "ended" };
          else if (command.action !== "recover") state = { ...state, phase: ["invited", "gathering"].includes(state.phase) ? "cancelled" : "settling", winner: null, reason: "cancelled" };
          else if (!["funding", "settling"].includes(state.phase)) throw new Error("Расчёт банка не требуется.");
        } else if (["join", "addNpc", "kick", "start"].includes(command.action)) state = hoardTable(state, user, command);
        else {
          const index = requirePokerAction(state, user, command.action, command.revision, command.seat), seat = state.seats[index], data = command.data ?? {};
          // Receipts belong to the seat, so an NPC's private dice stay readable by whichever GM plays it.
          const owner = game.users.get(seat.userId) ?? user;
          if (command.action === "accept") {
            const actor = actorFor(data.actorUuid, user, state.stake > 0 || Boolean(data.deckId));
            if (actor && actor.uuid === state.seats[0].actorUuid) throw new Error("За столом должны быть разные персонажи.");
            if (actor && balance(actor) < state.stake) throw new Error("Не хватает крон, чтобы принять ставку.");
            state.seats[index] = participant(user, actor, gameOf(state) === "gwent" ? deckFor(actor, data) : null); state.phase = "funding";
          } else if (["decline", "cancel"].includes(command.action)) state.phase = command.action === "decline" ? "declined" : "cancelled";
          else if (command.action === "concede") { state.phase = "settling"; state.winner = 1 - index; state.reason = "conceded"; }
          else if (command.action === "leave") {
            if (state.phase === "gathering") state = { ...state, seats: state.seats.filter((_, i) => i !== index) };
            else state = await snakeTick(leaveHoard(state, index));
          } else if (command.action === "reach") {
            let play = pokerReceipt(receipt)?.play;
            if (!play) {
              play = await reachHoard(state, index);
              receipt = await createReceipt(request, owner, { tableId: table.id, kind: "reach", play });
            }
            state = await snakeTick(applyReach(state, index, play));
          } else if (command.action === "play") {
            // The receipt keeps the drawn card and roll, so a retry after a failed save never redraws.
            let play = pokerReceipt(receipt)?.play;
            if (!play) {
              play = await playGwent(state, index, data);
              receipt = await createReceipt(request, owner, { tableId: table.id, kind: "play", play });
            }
            state.rounds[state.round - 1].plays[index] = play;
            state = settleGwentRound(state);
          } else {
            const kind = command.action;
            let dice = pokerReceipt(receipt)?.dice, cheat = null;
            if (!dice) {
              if (kind === "roll") dice = await rollDice(5);
              else if (kind === "reroll") {
                const indices = rerollIndices(data.indices), rolled = await rollDice(indices.length);
                dice = [...state.hands[index]]; indices.forEach((position, i) => dice[position] = rolled[i]);
              } else {
                dice = [...seatReceipt(seat.draw, table.id, seat.userId, "reroll").dice];
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
              receipt = await createReceipt(request, owner, { tableId: table.id, kind, dice, ...(cheat ? { cheat } : {}), ...(kind === "reroll" ? { indices: rerollIndices(data.indices) } : {}) });
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
          if (state.seats[index] && command.action !== "leave") state.seats[index].revision++;
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
      ui.notifications.warn(`Таверна: ${error.message}`); return;
    }
    receipt ??= await createReceipt(request, user, { tableId: command.tableId ?? "", kind: command.action });
    await saveReceipt(receipt, { ...pokerReceipt(receipt), done: true, ok: false, error: error.message });
  }
}
const sending = new Map();
export function sendPoker(action, table = null, data = {}, seat = null) {
  const key = table?.id ?? "challenge";
  if (sending.has(key)) return sending.get(key);
  const work = (async () => {
    if (!game.users.activeGM) throw new Error("Для синхронизации стола нужен подключённый мастер.");
    const seats = pokerState(table)?.seats ?? [], index = Number.isInteger(seat) ? seat : seats.findIndex(row => row.userId === game.user.id);
    const request = await documentClass().create({ ...messageSource({ pokerRequest: { action, tableId: table?.id ?? "", revision: seats[index]?.revision ?? 0, ...(index >= 0 ? { seat: index } : {}), data } }),
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
