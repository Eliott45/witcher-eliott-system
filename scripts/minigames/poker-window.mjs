import { SYSTEM_ID } from "../config.mjs";
import { POKER_HANDS, LOADED_DICE_DC, TAVERN_GAMES, gameOf, pokerHand, pokerScoring, pokerClosed, controlledSeats, GATHERING_GAMES } from "./poker-rules.mjs";
import { hoardView } from "./hoard-view.mjs";
import { armView, drinkView, filletView, brawlView } from "./tavern-games-view.mjs";
import { actorOf } from "./tavern-common.mjs";
import { SNAKE_BITE } from "./hoard-rules.mjs";
import { pokerState, pokerTables, ownedPokerActors, seatReceipt, sendPoker, gwentDecks } from "./poker-service.mjs";
import { gwentRules, gwentSkills, gwentSeat, gwentRoundLine } from "./gwent-view.mjs";

let window;
const dots = [[], [5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];
const faces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const EXAMPLES = [[1, 2, 3, 4, 6], [2, 2, 3, 4, 6], [2, 2, 4, 4, 6], [3, 3, 3, 4, 6], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [3, 3, 3, 5, 5], [4, 4, 4, 4, 6], [6, 6, 6, 6, 6]];
const STAKES = [0, 5, 10, 25, 50];
export const pokerDots = value => (dots[value] ?? []).map(position => ({ position }));
export function pokerDiceView(dice, { selected = new Set(), selectable = false, scoring = [], swapped = -1 } = {}) {
  return Array.from({ length: 5 }, (_, index) => {
    const value = dice?.[index] ?? 0;
    return { index, number: index + 1, value, hidden: !value, selected: selected.has(index), selectable, scoring: Boolean(value) && scoring.includes(index), swapped: swapped === index, dots: pokerDots(value) };
  });
}
const actorBy = uuid => uuid ? game.actors.find(actor => actor.uuid === uuid) ?? null : null;
const portrait = seat => actorBy(seat.actorUuid)?.img ?? game.users.get(seat.userId)?.avatar ?? "icons/svg/mystery-man.svg";
const rerolledText = count => count ? `Перебросил ${count} ${count === 1 ? "кость" : count < 5 ? "кости" : "костей"}` : "Оставил все кости";
const deckLabel = deck => `${deck.name}${deck.quality ? ` · редкость +${deck.quality}` : ""}${deck.forgeries.count ? ` · поддельных ${deck.forgeries.count}` : ""}`;

const GAME_VIEWS = { arm: armView, drink: drinkView, fillet: filletView, brawl: brawlView };
const LOBBY_NOTES = {
  drink: "От 2 до 6 участников пьют наперегонки; остальные подсаживаются из чата или списка столов.",
  fillet: "Вы — исполнитель. Ваши Азартные игры определят, сколько зрители поставят против вас; они подсаживаются и делают ставки за столом.",
  brawl: "От 2 до 4 бойцов. Нужны персонажи с жетонами на текущей сцене: бой пойдёт в обычном трекере. Без брони и оружия."
};
const names = (state, list) => list.map(index => state.seats[index].name).join(" и ");
function gameInstruction(kind, state, view, me, spectator) {
  const phase = state.phase, host = state.seats[0]?.name ?? "Хозяин";
  if (phase === "invited") return view.canAccept ? `${host} предлагает помериться силой. ${state.stake ? `Ставка ${state.stake} кр.` : "Без ставок."}` : view.canCancel ? "Ждём ответа соперника." : `${host} бросает вызов.`;
  if (phase === "gathering") {
    if (kind === "fillet") return me === 0 ? `Зрители готовы поставить против вас до ${view.fillet.limit} кр. Когда ставки сделаны — начинайте.` : view.canBet ? "Ставьте против исполнителя: промахнётся — получите вдвое." : view.canJoin ? "Садитесь к столу и ставьте против исполнителя." : `${host} разминает пальцы.`;
    return view.canStart ? `Участников: ${state.seats.length}. Когда все собрались — начинайте.` : view.canJoin ? "Присоединяйтесь к столу." : `${host} собирает участников.`;
  }
  if (phase === "funding") return "Ставки ложатся на стол…";
  if (kind === "arm") return view.canPress ? "Давите! Два выигранных раунда подряд — победа. Каждый раунд стоит обоим 5 Выносливости." : spectator ? "Соперники давят друг на друга." : "Соперник собирается с силами…";
  if (kind === "drink") return view.canDrink ? `Порция ${state.round}: Стойкость против СЛ ${view.drink.dc}. Первый провал — опьянение, второй — тошнота и выход.` : spectator ? "Участники осушают кружки." : "Ждём, пока остальные допьют…";
  if (kind === "fillet") {
    if (phase === "playing") return view.canStab ? `Скорость ${state.stage}: Владение лёгкими клинками против СЛ ${view.fillet.dc}.` : `${host} заносит нож… (СЛ ${view.fillet.dc})`;
    if (phase === "decide") return view.canDecide ? `Ни царапины! Заберите ${view.fillet.total * 2} кр. или ускорьтесь: СЛ ${view.fillet.nextDC}, лимит ставок вдвое.` : `${host} решает: забрать ставки или ускориться.`;
    if (phase === "betting") return view.canResume ? `Скорость ${state.stage}: зрители могут поднять ставки до ${view.fillet.limit} кр. Продолжайте, когда готовы.` : view.canBet ? `Лимит вырос до ${view.fillet.limit} кр. — можно поднять ставку.` : "Зрители поднимают ставки.";
  }
  if (kind === "brawl") return view.brawl.combat ? "Бой идёт в трекере боя по обычным правилам. Побеждает последний, кто остался в сознании и не сдался." : "Поставьте жетоны бойцов на сцену и деритесь по обычным правилам. Побеждает последний в сознании.";
  return phase === "settling" ? "Подсчёт…" : "";
}
function gameResult(kind, state, me, stake) {
  const phase = state.phase, winners = state.winners ?? (state.winner === null || state.winner === undefined ? [] : [state.winner]);
  if (phase === "declined") return { title: "Вызов отклонён", detail: "", bank: "", win: false, lose: false };
  if (phase === "cancelled") return { title: "Игра отменена", detail: "", bank: stake || kind === "fillet" ? "Ставки возвращены владельцам." : "", win: false, lose: false };
  const win = winners.includes(me), lose = me >= 0 && winners.length > 0 && !win;
  if (kind === "fillet") {
    const total = state.seats.slice(1).reduce((sum, seat) => sum + (seat.bets ?? []).reduce((a, b) => a + b, 0), 0);
    return state.reason === "collected" ? { title: `${state.seats[0].name} забирает ставки!`, detail: `Ни один палец не задет на скорости ${state.stage}.`, bank: total ? `${total * 2} кр. уходят исполнителю.` : "", win: me === 0, lose: me > 0 }
      : { title: "Лезвие в пальце!", detail: `${state.seats[0].name} промахнулся на скорости ${state.stage}.`, bank: total ? "Каждый поставивший получает вдвое." : "", win: me > 0, lose: me === 0 };
  }
  const reason = state.reason === "caught" ? `${names(state, state.caught ?? [])}: приём заметили.` : state.reason === "exhausted" ? "Соперник выбился из сил." : state.reason === "conceded" ? "Соперник сдался." : "";
  const title = winners.length ? kind === "drink" && winners.length > 1 ? `Ничья: ${names(state, winners)}` : `${names(state, winners)} ${kind === "drink" ? "перепил всех!" : "побеждает!"}` : "Ничья";
  return { title, detail: reason, bank: stake ? winners.length ? `Банк забирает ${names(state, winners)}.` : "Ставки возвращены владельцам." : "", win, lose };
}
export class PokerWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = { id: "witcher-poker-table", classes: ["witcher-poker-window"], position: { width: 640, height: "auto" },
    window: { title: "Развлечения в таверне", icon: "fa-solid fa-beer-mug-empty", resizable: false }, actions: {
      game: PokerWindow.#game, challenge: PokerWindow.#challenge, stake: PokerWindow.#stake, accept: PokerWindow.#accept, decline: PokerWindow.#decline, cancel: PokerWindow.#cancel,
      roll: PokerWindow.#roll, die: PokerWindow.#die, reroll: PokerWindow.#reroll, palmValue: PokerWindow.#palmValue, palm: PokerWindow.#palm, fair: PokerWindow.#fair,
      skill: PokerWindow.#skill, play: PokerWindow.#play, seat: PokerWindow.#seat, join: PokerWindow.#join, addNpc: PokerWindow.#addNpc, kick: PokerWindow.#kick,
      start: PokerWindow.#start, reach: PokerWindow.#reach, leave: PokerWindow.#leave, press: PokerWindow.#press, drink: PokerWindow.#drink, surprise: PokerWindow.#surprise,
      stab: PokerWindow.#stab, stop: PokerWindow.#stop, speed: PokerWindow.#speed, resume: PokerWindow.#resume, bet: PokerWindow.#bet, yield: PokerWindow.#yield, award: PokerWindow.#award,
      concede: PokerWindow.#concede, abort: PokerWindow.#abort, endAll: PokerWindow.#endAll, recover: PokerWindow.#recover, lobby: PokerWindow.#lobby, openTable: PokerWindow.#open, rematch: PokerWindow.#rematch
    } };
  static PARTS = { content: { template: `systems/${SYSTEM_ID}/templates/poker-table.hbs` } };
  constructor(tableId = "", { actorUuid = "", game: kind = "poker" } = {}) {
    super(); this.tableId = tableId; this.selected = new Set(); this.busy = false; this.notice = ""; this.opponentId = ""; this.stake = 0; this.open = true; this.rulesOpen = false;
    this.actorUuid = actorUuid || game.user.character?.uuid || ""; this.palm = { index: -1, value: 0 };
    this.game = TAVERN_GAMES[kind] ? kind : "poker"; this.deckId = ""; this.fakes = false; this.skill = ""; this.seatIndex = -1; this.npcUuid = "";
    this.hooks = ["createChatMessage", "updateChatMessage", "deleteChatMessage", "updateUser", "updateActor"].map(event => [event, Hooks.on(event, () => { if (!this.busy) this.render(); })]);
  }
  get table() { return game.messages.get(this.tableId); }
  reset() { this.selected = new Set(); this.palm = { index: -1, value: 0 }; this.notice = ""; this.skill = ""; }
  /** Decks of the chosen character, for the lobby and for accepting a gwent challenge. */
  deckChoices() {
    const decks = gwentDecks(actorBy(this.actorUuid));
    if (!decks.some(deck => deck.id === this.deckId)) this.deckId = decks[0]?.id ?? "";
    const chosen = decks.find(deck => deck.id === this.deckId);
    return { decks: [{ id: "", name: "Колода таверны — без бонусов", selected: !chosen }, ...decks.map(deck => ({ id: deck.id, name: deckLabel(deck), selected: deck.id === this.deckId }))],
      forgeries: chosen?.forgeries.count ?? 0, forgeryDc: chosen?.forgeries.dc ?? 0, fakes: Boolean(this.fakes && chosen?.forgeries.count) };
  }
  async _prepareContext() {
    const state = pokerState(this.table), user = game.user, kind = state ? gameOf(state) : this.game ?? "poker", gwent = kind === "gwent", hoard = kind === "hoard";
    // A GM may play several seats (NPCs); the window follows whichever of them has a move to make.
    const controlled = controlledSeats(state, user), needs = index => {
      const seat = state.seats[index];
      const kindNow = gameOf(state);
      return { invited: index === 1, gathering: index === 0, opening: !seat.opening, drawing: !seat.draw, palming: Boolean(seat.palm) && !seat.final,
        decide: kindNow === "fillet" && index === 0, betting: kindNow === "fillet" && index === 0,
        playing: ["gwent", "arm"].includes(kindNow) ? !state.rounds?.[state.round - 1]?.plays[index] : hoard ? seat.active && !seat.acted && Boolean(state.snake)
          : kindNow === "drink" ? seat.active && !seat.acted : kindNow === "fillet" ? index === 0 : false }[state.phase] ?? false;
    };
    let me = controlled.includes(this.seatIndex) ? this.seatIndex : -1;
    if (me < 0 || (!needs(me) && controlled.some(needs))) me = controlled.find(needs) ?? controlled[0] ?? -1;
    if (this.seatIndex >= 0 && me !== this.seatIndex) { this.selected = new Set(); this.palm = { index: -1, value: 0 }; this.skill = ""; }
    this.seatIndex = me;
    const own = state?.seats[me], closed = pokerClosed(state), stake = Number(state?.stake ?? this.stake) || 0, palm = this.palm ?? { index: -1, value: 0 };
    const actors = ownedPokerActors(user).map(actor => ({ uuid: actor.uuid, name: actor.name, crowns: actor.system.crowns, selected: actor.uuid === this.actorUuid }));
    const view = { table: Boolean(state), lobby: !state, busy: this.busy, notice: this.notice || state?.issue || "", rulesOpen: this.rulesOpen, hasGM: Boolean(game.users.activeGM),
      game: kind, gameName: TAVERN_GAMES[kind].name, gameIcon: TAVERN_GAMES[kind].icon, isGwent: gwent, isHoard: hoard, isPoker: kind === "poker", isGM: user.isGM,
      isArm: kind === "arm", isDrink: kind === "drink", isFillet: kind === "fillet", isBrawl: kind === "brawl", isGathering: GATHERING_GAMES.includes(kind),
      lobbyNote: LOBBY_NOTES[kind] ?? "", arm: null, drink: null, fillet: null, brawl: null, canPress: false, canDrink: false, canOil: false, canStab: false, canDecide: false,
      canResume: false, canBet: false, canYield: false,
      games: Object.entries(TAVERN_GAMES).map(([id, entry]) => ({ id, ...entry, selected: id === kind })),
      actors, stake, pot: stake * 2, stakes: STAKES.map(value => ({ value, label: value ? `${value} кр.` : "Без ставок", selected: value === stake })),
      opponents: game.users.filter(other => other.active && other.id !== user.id).map(other => ({ id: other.id, name: other.name, isGM: other.isGM, selected: other.id === this.opponentId })),
      // GMs may seat any character or NPC of the world and play it themselves.
      npcs: user.isGM ? game.actors.filter(actor => ["character", "npc"].includes(actor.type) && !state?.seats.some(seat => seat.actorUuid === actor.uuid))
        .map(actor => ({ id: `actor:${actor.uuid}`, uuid: actor.uuid, name: actor.name, selected: `actor:${actor.uuid}` === this.opponentId || actor.uuid === this.npcUuid })) : [],
      openTables: user.isGM ? pokerTables().filter(message => !pokerClosed(pokerState(message)) && pokerState(message).phase !== "settling").length : 0,
      seatPicker: [], hoard: null, canStart: false, canJoin: false, canAddNpc: false, canReach: false, canLeave: false,
      openGame: this.open !== false, deck: { decks: [], forgeries: 0, forgeryDc: 0, fakes: false },
      // Own tables plus every unfinished game this user may watch (public cards reach every client).
      recent: pokerTables().filter(message => pokerState(message).seats.some(seat => seat.userId === user.id) || !pokerClosed(pokerState(message)) || user.isGM).slice(-8).reverse().map(message => {
        const table = pokerState(message), seated = table.seats.some(seat => seat.userId === user.id);
        return { id: message.id, icon: TAVERN_GAMES[gameOf(table)].icon, names: table.seats.map(seat => seat.name).join(gameOf(table) === "hoard" ? ", " : " против "), stake: table.stake, open: !pokerClosed(table), watch: !seated && !pokerClosed(table),
          status: { finished: gameOf(table) === "hoard" ? "Клад разобран" : table.winner === null ? "Ничья" : `Победил ${table.seats[table.winner].name}`, cancelled: "Отменена", declined: "Вызов отклонён", gathering: "Набор игроков" }[table.phase] ?? "Идёт игра" };
      }),
      combinations: POKER_HANDS.map((name, rank) => ({ name, example: EXAMPLES[rank].map(value => faces[value]).join("") })).reverse(), gwentRules,
      dc: LOADED_DICE_DC, spectator: false, top: null, bottom: null, phase: state?.phase ?? "", stage: "", instruction: "", result: null, roundLine: "",
      canAccept: false, canCancel: false, canRoll: false, canDraw: false, canPalm: false, canPlay: false, canConcede: false, canAbort: false, canRecover: false, canRematch: false,
      selectedCount: this.selected.size, palmValues: [], palmReady: false, palmPreview: "", skills: [], round: state?.round ?? 0, waiting: false };
    if (gwent && (!state || (state.phase === "invited" && me === 1))) view.deck = this.deckChoices();
    if (!state) return view;
    const phase = state.phase, opponent = state.seats[1 - me], spectator = me < 0;
    if (controlled.length > 1) view.seatPicker = controlled.map(index => ({ index, name: state.seats[index].name, img: portrait(state.seats[index]), selected: index === me, needs: needs(index) && !closed }));
    if (hoard) return this.hoardContext(view, state, me, { spectator, closed, stake, user });
    if (GAME_VIEWS[kind]) return this.gameContext(view, state, me, { spectator, closed, stake, user, kind });
    const palming = phase === "palming" && Boolean(own?.palm) && !own.final;
    Object.assign(view, { spectator,
      canAccept: phase === "invited" && me === 1, canCancel: phase === "invited" && me === 0,
      canRoll: phase === "opening" && Boolean(own) && !own.opening, canDraw: phase === "drawing" && Boolean(own) && !own.draw, canPalm: palming,
      canPlay: gwent && phase === "playing" && Boolean(own) && !state.rounds[state.round - 1]?.plays[me],
      canConcede: me >= 0 && ["opening", "drawing", "palming", "playing"].includes(phase), canAbort: user.isGM && !closed && phase !== "settling",
      canRecover: user.isGM && ["funding", "settling"].includes(phase), canRematch: closed && me >= 0,
      stage: { invited: "Приглашение", funding: "Ставки в банк", opening: "Первый бросок", drawing: "Переброс", palming: "Вскрытие", playing: `Раунд ${state.round} из 3`, settling: "Расчёт банка" }[phase] ?? "Итог партии"
    });
    view.waiting = me >= 0 && !closed && !view.canAccept && !view.canCancel && !view.canRoll && !view.canDraw && !view.canPalm && !view.canPlay;
    if (view.canPlay) view.skills = gwentSkills(actorBy(own.actorUuid), this.skill);
    if (palming) {
      const hand = state.hands[me];
      view.palmValues = Array.from({ length: 6 }, (_, i) => ({ value: i + 1, selected: palm.value === i + 1, dots: pokerDots(i + 1) }));
      view.palmReady = palm.index >= 0 && palm.value > 0 && hand[palm.index] !== palm.value;
      if (view.palmReady) view.palmPreview = pokerHand(hand.map((value, index) => index === palm.index ? palm.value : value)).name;
    }
    const seatView = index => {
      const seat = state.seats[index], mine = index === me, revealed = closed || phase === "settling";
      const base = { name: seat.name, mine, label: mine ? gwent ? "Вы" : "Ваши кости" : spectator ? "Игрок" : "Соперник", img: portrait(seat), online: Boolean(game.users.get(seat.userId)?.active),
        winner: phase === "finished" && state.winner === index, loser: phase === "finished" && state.winner !== null && state.winner !== index, gems: [] };
      const caughtStatus = closed ? state.winner === index ? "Победитель" : state.caught?.includes(index) ? "Пойман на шулерстве" : "" : "";
      const opening = phase === "invited" ? index === 0 ? "Бросает вызов" : "Думает над вызовом" : phase === "funding" ? "Вносит ставку" : "";
      if (gwent) {
        const table = gwentSeat(state, index);
        const status = closed ? caughtStatus : opening || (phase === "playing" ? table.played ? "Сыграл раунд" : mine ? "Ваш ход" : "Выбирает карты" : "Считает банк");
        // Only the player sees how much of the deck bonus is forged; everyone else sees a single deck bonus.
        const deck = seat.deck ?? {}, deckNote = deck.name ? `${deck.name}${mine && deck.fakes ? ` · поддельных ${deck.fakes}` : ""}` : "Колода таверны";
        return { ...base, ...table, status, deckNote, animKey: table.play?.faded ? "" : table.play?.key ?? "" };
      }
      let dice = state.hands[index], swapped = -1;
      if (revealed) swapped = state.swaps?.[index] ?? -1;
      else if (mine) {
        const id = seat.final || seat.draw || seat.opening;
        const receipt = id ? seatReceipt(id, this.tableId, seat.userId, ["roll", "reroll", "finish"]) : null;
        dice = receipt?.dice ?? []; swapped = receipt?.cheat?.index ?? -1;
      }
      const combination = dice?.length === 5 ? pokerHand(dice) : null;
      const selectable = mine && !this.busy && (view.canDraw || view.canPalm);
      const selected = mine && view.canPalm ? new Set(palm.index >= 0 ? [palm.index] : []) : mine && view.canDraw ? this.selected : new Set();
      const status = closed ? caughtStatus : opening || (phase === "opening" ? seat.opening ? "Кости брошены" : "Трясёт стакан…"
        : phase === "drawing" ? seat.draw ? rerolledText(seat.rerolled?.length ?? 0) : "Выбирает кости" : phase === "palming" ? "Вскрытие…" : "Считает банк");
      return { ...base, status, dice: pokerDiceView(dice, { selected, selectable, swapped, scoring: combination ? pokerScoring(dice) : [] }),
        combination: combination?.name ?? "Кости ещё не брошены", rank: combination?.rank ?? -1, sum: combination ? combination.sum : 0, animKey: "" };
    };
    const order = me === 0 ? [1, 0] : [0, 1];
    view.top = seatView(order[0]); view.bottom = seatView(order[1]);
    if (gwent) view.roundLine = gwentRoundLine(state);
    if (closed) {
      const winner = state.seats[state.winner], loser = state.winner === null ? null : state.seats[1 - state.winner];
      const hands = !gwent && state.hands.every(hand => hand.length === 5) ? state.hands.map(pokerHand) : null;
      const trick = gwent ? "поддельные карты" : "шулерские кости";
      const title = phase === "declined" ? "Вызов отклонён" : phase === "cancelled" ? "Партия отменена"
        : state.reason === "caught" ? `${state.caught.map(index => state.seats[index].name).join(" и ")}: ${trick}!`
          : state.reason === "conceded" ? `${loser.name} сдаётся` : winner ? `${winner.name} побеждает!` : "Ничья";
      const detail = phase !== "finished" ? "" : state.reason === "caught" ? winner ? `Обман заметили. Победа присуждена: ${winner.name}.` : "Оба пойманы на обмане — победителя нет."
        : state.reason === "conceded" ? `Победа присуждена: ${winner.name}.` : gwent ? `Счёт раундов ${state.score.join(" : ")}`
          : hands ? winner ? `${hands[state.winner].name} против «${hands[1 - state.winner].name}»` : `${hands[0].name} у обоих` : "";
      const bank = !stake ? "" : phase === "finished" && winner ? `Банк ${stake * 2} кр. забирает ${winner.name}.` : state.reason === "cancelled" || phase === "finished" ? "Ставки возвращены владельцам." : "Ставки не списывались.";
      view.result = { title, detail, bank, win: phase === "finished" && state.winner === me && me >= 0, lose: phase === "finished" && state.winner !== null && state.winner !== me && me >= 0 };
    }
    const [first, second] = state.seats.map(seat => seat.name);
    if (spectator) view.instruction = { invited: `${first} вызывает ${second} на партию.`, funding: "Ставки вносятся в банк…", opening: "Игроки бросают кости.",
      drawing: "Игроки выбирают кости для переброса.", palming: "Кости вскрываются…", playing: "Игроки разыгрывают раунд.", settling: "Подводим итог…" }[phase] ?? "";
    else view.instruction = view.canAccept ? `${state.seats[0].name} зовёт вас сыграть${gwent ? " в гвинт" : ""}. ${stake ? `Ставка ${stake} кр. с каждого — спишется, когда вы примете вызов.` : "Игра без ставок."}`
      : view.canCancel ? `Ждём ответа: ${opponent.name}. Деньги пока не списаны.`
        : view.canRoll ? "Встряхните стакан и бросьте пять костей."
          : view.canDraw ? "Отметьте кости, которые хотите перебросить. Переброс один — после него кости откроются."
            : view.canPalm ? `Все кости на виду. Можно незаметно подменить одну свою кость: выберите её и новое значение. Соперник проверит Внимание (СЛ ${LOADED_DICE_DC}).`
              : view.canPlay ? "Выберите навык и разыграйте раунд: карта из колоды даст модификатор к проверке. Два выигранных раунда — победа."
                : phase === "funding" ? "Ставки вносятся в банк…"
                  : phase === "opening" ? `Ждём бросок: ${opponent?.name ?? "участники"}.`
                    : phase === "drawing" ? `${opponent?.name ?? "Участники"} выбирает кости для переброса.`
                      : phase === "playing" ? `${opponent?.name ?? "Соперник"} разыгрывает раунд.`
                        : phase === "palming" || phase === "settling" ? "Подводим итог…" : "";
    return view;
  }
  /** Arm wrestling, drinking, fillet and fistfight share the duel/gathering flags; each brings its own table view. */
  gameContext(view, state, me, { spectator, closed, stake, user, kind }) {
    const phase = state.phase, helpers = { portrait, online: seat => Boolean(game.users.get(seat.userId)?.active), actorOf };
    Object.assign(view, GAME_VIEWS[kind](state, user, me, helpers), { spectator,
      canAccept: phase === "invited" && me === 1, canCancel: ["invited", "gathering"].includes(phase) && me === 0,
      canConcede: kind === "arm" && me >= 0 && phase === "playing", canAbort: user.isGM && !closed && phase !== "settling",
      canRecover: user.isGM && ["funding", "settling"].includes(phase), canRematch: closed && me >= 0,
      stage: { invited: "Приглашение", gathering: "Набор участников", funding: "Ставки на стол", playing: kind === "arm" ? `Раунд ${state.round}` : kind === "drink" ? `Порция ${state.round}` : `Скорость ${state.stage}`,
        decide: "Удар удался", betting: "Новые ставки", fighting: "Бой идёт", settling: "Подсчёт" }[phase] ?? "Итог" });
    view.pot = kind === "fillet" ? view.fillet.total : stake * state.seats.length;
    view.waiting = me >= 0 && !closed && !view.canAccept && !view.canStart && !view.canPress && !view.canDrink && !view.canStab && !view.canDecide && !view.canResume && !view.canYield && phase !== "gathering";
    view.instruction = gameInstruction(kind, state, view, me, spectator);
    if (closed) view.result = gameResult(kind, state, me, stake);
    return view;
  }
  hoardContext(view, state, me, { spectator, closed, stake, user }) {
    const phase = state.phase, host = state.seats[0]?.name ?? "Хозяин";
    Object.assign(view, hoardView(state, user, me, { portrait, online: seat => Boolean(game.users.get(seat.userId)?.active) }), { spectator,
      canCancel: phase === "gathering" && me === 0, canAbort: user.isGM && !closed && phase !== "settling", canRecover: user.isGM && ["funding", "settling"].includes(phase),
      canRematch: closed && me >= 0, pot: state.pot ?? 0, stage: { gathering: "Набор игроков", funding: "Монеты на стол", playing: `Раунд ${state.round}`, settling: "Подсчёт добычи" }[phase] ?? "Итог игры" });
    view.waiting = me >= 0 && !closed && !view.canStart && !view.canReach && phase !== "gathering";
    view.instruction = phase === "gathering" ? view.canStart ? `Игроков: ${state.seats.length} из 4. Когда все сели — начинайте.` : view.canJoin ? "Садитесь к корзине: нужно от 2 до 4 игроков." : `${host} собирает игроков вокруг корзины.`
      : phase === "funding" ? "Монеты раскладываются вокруг корзины…"
        : phase === "playing" ? view.canReach ? `Змея настороже: ${state.snake.total}. Ловкость рук должна быть выше — иначе Уклонение против укуса (база ${SNAKE_BITE}). Можно и забрать добычу, пока цел.`
          : spectator ? "Игроки по очереди тянутся к корзине." : "Ждём остальных — потом змея снова насторожится."
          : phase === "settling" ? "Подсчёт добычи…" : "";
    if (closed) {
      const empty = (state.pot ?? 0) <= 0;
      view.result = { title: phase === "cancelled" ? "Игра отменена" : state.reason === "ended" ? "Мастер остановил игру" : empty ? "Клад разобран!" : "Игра окончена",
        detail: phase === "cancelled" ? "" : view.hoard.leader ? `Больше всех унёс ${view.hoard.leader}.` : "Никто не ушёл вперёд.",
        bank: phase === "cancelled" ? stake ? "Ставки возвращены владельцам." : "" : `${empty ? "" : "Оставшиеся монеты делятся поровну. "}${stake ? "Каждый забирает свою добычу в кошелёк." : ""}`, win: false, lose: false };
    }
    return view;
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const title = this.element.querySelector(".window-title");
    if (title) title.textContent = context.gameName;
    const hands = JSON.stringify([context.top, context.bottom].map(seat => [seat?.dice?.map(die => die.value) ?? [], seat?.animKey ?? ""]));
    if (this.handKey && hands !== this.handKey) {
      const previous = JSON.parse(this.handKey), next = JSON.parse(hands);
      this.element.querySelectorAll(".poker-seat").forEach((seat, row) => {
        seat.querySelectorAll(".poker-die:not(.is-hidden)").forEach((die, index) => {
          if (previous[row]?.[0]?.[index] === next[row][0][index]) return;
          die.style.animationDelay = `${index * 60}ms`; die.classList.add("just-rolled");
        });
        if (next[row][1] && previous[row]?.[1] !== next[row][1]) seat.querySelector(".gwent-card")?.classList.add("just-played");
      });
    }
    this.handKey = hands;
    for (const name of ["opponentId", "stake"]) this.element.querySelector(`[name="${name}"]`)?.addEventListener("change", event => { this[name] = event.target.value; });
    // A different character has different gwent decks, so the lobby redraws.
    this.element.querySelector('[name="actorUuid"]')?.addEventListener("change", event => { this.actorUuid = event.target.value; if (context.isGwent) this.render(); });
    this.element.querySelector('[name="deckId"]')?.addEventListener("change", event => { this.deckId = event.target.value; this.render(); });
    this.element.querySelector('[name="fakes"]')?.addEventListener("change", event => { this.fakes = event.target.checked; });
    this.element.querySelector('[name="open"]')?.addEventListener("change", event => { this.open = event.target.checked; });
    this.element.querySelector('[name="npcUuid"]')?.addEventListener("change", event => { this.npcUuid = event.target.value; });
    this.element.querySelector(".poker-rules")?.addEventListener("toggle", event => { this.rulesOpen = event.target.open; });
  }
  async run(action, data = {}) {
    if (this.busy) return;
    this.busy = true; this.notice = ""; await this.render();
    try { const table = await sendPoker(action, action === "challenge" ? null : this.table, data, this.seatIndex >= 0 ? this.seatIndex : null); this.tableId = table.id; this.reset(); }
    catch (error) { this.notice = error.message; }
    finally { this.busy = false; if (!this.dismissed) await this.render(); }
  }
  async close(options) { this.dismissed = true; for (const [event, id] of this.hooks) Hooks.off(event, id); window = null; return super.close(options); }
  deckData() { return this.game === "gwent" ? { deckId: this.deckId, fakes: Boolean(this.fakes && this.deckId) } : {}; }
  static #game(_event, target) { this.game = target.dataset.game; this.rulesOpen = false; return this.render(); }
  static #challenge() {
    const field = name => this.element.querySelector(`[name="${name}"]`)?.value ?? "";
    Object.assign(this, { actorUuid: field("actorUuid"), opponentId: field("opponentId"), stake: field("stake"), open: this.element.querySelector('[name="open"]')?.checked ?? true });
    if (!this.opponentId && !GATHERING_GAMES.includes(this.game)) { this.notice = "Выберите, кого позвать за стол."; return this.render(); }
    return this.run("challenge", { game: this.game, actorUuid: this.actorUuid, opponentId: this.opponentId, stake: this.stake, open: this.open, ...this.deckData() });
  }
  static #stake(_event, target) { this.stake = Number(target.dataset.value); this.actorUuid = this.element.querySelector('[name="actorUuid"]')?.value ?? this.actorUuid; this.opponentId = this.element.querySelector('[name="opponentId"]')?.value ?? this.opponentId; return this.render(); }
  static #accept() {
    this.actorUuid = this.element.querySelector('[name="actorUuid"]')?.value ?? "";
    this.game = gameOf(pokerState(this.table));
    return this.run("accept", { actorUuid: this.actorUuid, ...this.deckData() });
  }
  static #decline() { return this.run("decline"); }
  static #cancel() { return this.run("cancel"); }
  static #roll() { return this.run("roll"); }
  static #press() { return this.run("press", { trick: Boolean(this.element.querySelector('[name="trick"]')?.checked) }); }
  static #drink() { return this.run("drink", { oil: Boolean(this.element.querySelector('[name="oil"]')?.checked) }); }
  static async #surprise(_event, target) {
    const name = pokerState(this.table)?.seats[Number(target.dataset.seat)]?.name ?? "участник";
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Внезапная проверка" }, content: `<p>${name}: проверка Стойкости СЛ 10. Провал — тошнота и выход из соревнования.</p>`, yes: { label: "Проверить" }, no: { label: "Отмена" }, rejectClose: false });
    if (yes) return this.run("surprise", { seat: Number(target.dataset.seat) });
  }
  static #stab() { return this.run("stab"); }
  static #stop() { return this.run("stop"); }
  static #speed() { return this.run("speed"); }
  static #resume() { return this.run("resume"); }
  static #bet() { return this.run("bet", { amount: Number(this.element.querySelector('[name="bet"]')?.value) || 0 }); }
  static async #yield() {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Сдаться?" }, content: "<p>Вы выходите из круга. Если против вас останется один боец, он заберёт банк.</p>", yes: { label: "Сдаться" }, no: { label: "Драться дальше" }, rejectClose: false });
    if (yes) return this.run("yield");
  }
  static async #award(_event, target) {
    const name = pokerState(this.table)?.seats[Number(target.dataset.seat)]?.name ?? "боец";
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Присудить победу?" }, content: `<p>${name} побеждает в кулачном бою, остальные выбывают.</p>`, yes: { label: "Присудить" }, no: { label: "Отмена" }, rejectClose: false });
    if (yes) return this.run("award", { seat: Number(target.dataset.seat) });
  }
  static #seat(_event, target) { this.seatIndex = Number(target.dataset.seat); this.reset(); return this.render(); }
  static #join() { this.actorUuid = this.element.querySelector('[name="actorUuid"]')?.value ?? ""; return this.run("join", { actorUuid: this.actorUuid, bet: Number(this.element.querySelector('[name="bet"]')?.value) || 0 }); }
  static #addNpc() {
    this.npcUuid = this.element.querySelector('[name="npcUuid"]')?.value ?? "";
    if (!this.npcUuid) { this.notice = "Выберите персонажа или НПС."; return this.render(); }
    return this.run("addNpc", { actorUuid: this.npcUuid });
  }
  static #kick(_event, target) { return this.run("kick", { seat: Number(target.dataset.seat) }); }
  static #start() { return this.run("start"); }
  static #reach() { return this.run("reach"); }
  static async #leave() {
    const state = pokerState(this.table);
    if (state?.phase === "playing" && gameOf(state) === "drink") {
      const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Сдаться?" }, content: "<p>Вы отставляете кружку и выбываете из соревнования.</p>", yes: { label: "Сдаться" }, no: { label: "Пить дальше" }, rejectClose: false });
      if (!yes) return;
    } else if (state?.phase === "playing") {
      const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Отойти от корзины?" }, content: "<p>Вы сохраните уже добытые монеты, но больше не будете тянуться к корзине.</p>", yes: { label: "Забрать добычу" }, no: { label: "Остаться" }, rejectClose: false });
      if (!yes) return;
    }
    return this.run("leave");
  }
  static #die(_event, target) {
    const index = Number(target.dataset.index);
    if (this.busy) return;
    const state = pokerState(this.table), own = state?.seats[this.seatIndex];
    if (state?.phase === "palming" && own?.palm && !own.final) this.palm.index = this.palm.index === index ? -1 : index;
    else if (this.selected.has(index)) this.selected.delete(index); else this.selected.add(index);
    return this.render();
  }
  static #reroll() { return this.run("reroll", { indices: [...this.selected] }); }
  static #palmValue(_event, target) { this.palm.value = Number(target.dataset.value); return this.render(); }
  static #palm() { return this.run("finish", { cheat: { index: this.palm.index, value: this.palm.value } }); }
  static #fair() { return this.run("finish"); }
  static #skill(_event, target) { this.skill = target.dataset.skill; return this.render(); }
  static #play() { return this.run("play", { skill: this.element.querySelector(".gwent-skill.is-selected")?.dataset.skill ?? this.skill }); }
  static async #concede() {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Сдаться?" }, content: "<p>Победа и весь банк достанутся сопернику.</p>", yes: { label: "Сдаться" }, no: { label: "Продолжить" }, rejectClose: false });
    if (yes) return this.run("concede");
  }
  static async #abort() {
    const hoard = gameOf(pokerState(this.table)) === "hoard" && pokerState(this.table).phase === "playing";
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Завершить досрочно?" },
      content: hoard ? "<p>Игроки заберут то, что уже вытащили из корзины; оставшиеся монеты поделятся поровну.</p>" : "<p>Партия закончится без победителя. Списанные ставки вернутся владельцам.</p>",
      yes: { label: "Завершить" }, no: { label: "Продолжить" }, rejectClose: false });
    if (yes) return this.run("end");
  }
  /** GM: stop every unfinished table at once, each by its own early-end rule. */
  static async #endAll() {
    const open = pokerTables().filter(message => !pokerClosed(pokerState(message)) && pokerState(message).phase !== "settling");
    if (!open.length || this.busy) return;
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Завершить все игры?" },
      content: `<p>Незавершённых столов: ${open.length}. Дуэли без результата вернут ставки, в «Драконьем кладе» каждый заберёт уже добытое.</p>`,
      yes: { label: "Завершить все" }, no: { label: "Отмена" }, rejectClose: false });
    if (!yes) return;
    this.busy = true; this.notice = ""; await this.render();
    const failed = [];
    for (const message of open) {
      try { await sendPoker("end", message); } catch (error) { failed.push(`${pokerState(message).seats.map(seat => seat.name).join(", ")}: ${error.message}`); }
    }
    this.busy = false; this.notice = failed.join(" · ");
    if (!failed.length) ui.notifications.info(`Завершено столов: ${open.length}.`);
    if (!this.dismissed) await this.render();
  }
  static #recover() { return this.run("recover"); }
  static #lobby() { this.game = gameOf(pokerState(this.table) ?? { game: this.game }); this.tableId = ""; this.reset(); return this.render(); }
  static #open(_event, target) { this.tableId = target.dataset.table; this.reset(); return this.render(); }
  static #rematch() {
    const state = pokerState(this.table), index = this.seatIndex, other = state.seats[1 - index];
    Object.assign(this, { game: gameOf(state), actorUuid: state.seats[index].actorUuid, opponentId: GATHERING_GAMES.includes(gameOf(state)) || !other ? "" : other.npc ? `actor:${other.actorUuid}` : other.userId,
      stake: state.stake, open: state.open !== false, tableId: "" });
    this.reset(); return this.render();
  }
}
/** Without a table id the window resumes the player's unfinished game, or opens the lobby on the requested game. */
export async function openPokerWindow(tableId = "", { actorUuid = "", game: kind = "" } = {}) {
  if (tableId && !pokerTables().some(message => message.id === tableId)) throw new Error("Стол недоступен.");
  tableId ||= pokerTables().findLast(message => !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.userId === game.user.id))?.id ?? "";
  if (!window) window = new PokerWindow(tableId, { actorUuid, game: kind || "poker" });
  else {
    if (actorUuid) window.actorUuid = actorUuid;
    if (kind && TAVERN_GAMES[kind]) window.game = kind;
    if (tableId && window.tableId !== tableId) { window.tableId = tableId; window.reset(); }
  }
  await window.render({ force: true }); window.bringToFront(); return window;
}
