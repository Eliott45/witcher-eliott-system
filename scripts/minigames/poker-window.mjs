import { SYSTEM_ID } from "../config.mjs";
import { POKER_HANDS, LOADED_DICE_DC, pokerHand, pokerScoring, pokerSeat, pokerClosed } from "./poker-rules.mjs";
import { pokerState, pokerTables, ownedPokerActors, seatReceipt, sendPoker } from "./poker-service.mjs";

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
const portrait = seat => game.actors.find(actor => actor.uuid === seat.actorUuid)?.img ?? game.users.get(seat.userId)?.avatar ?? "icons/svg/mystery-man.svg";
const rerolledText = count => count ? `Перебросил ${count} ${count === 1 ? "кость" : count < 5 ? "кости" : "костей"}` : "Оставил все кости";

export class PokerWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = { id: "witcher-poker-table", classes: ["witcher-poker-window"], position: { width: 640, height: "auto" },
    window: { title: "Покер на костях", icon: "fa-solid fa-dice", resizable: false }, actions: {
      challenge: PokerWindow.#challenge, stake: PokerWindow.#stake, accept: PokerWindow.#accept, decline: PokerWindow.#decline, cancel: PokerWindow.#cancel,
      roll: PokerWindow.#roll, die: PokerWindow.#die, reroll: PokerWindow.#reroll, palmValue: PokerWindow.#palmValue, palm: PokerWindow.#palm, fair: PokerWindow.#fair,
      concede: PokerWindow.#concede, abort: PokerWindow.#abort, recover: PokerWindow.#recover, lobby: PokerWindow.#lobby, openTable: PokerWindow.#open, rematch: PokerWindow.#rematch
    } };
  static PARTS = { content: { template: `systems/${SYSTEM_ID}/templates/poker-table.hbs` } };
  constructor(tableId = "", { actorUuid = "" } = {}) {
    super(); this.tableId = tableId; this.selected = new Set(); this.busy = false; this.notice = ""; this.opponentId = ""; this.stake = 0; this.rulesOpen = false;
    this.actorUuid = actorUuid || game.user.character?.uuid || ""; this.palm = { index: -1, value: 0 };
    this.hooks = ["createChatMessage", "updateChatMessage", "deleteChatMessage", "updateUser", "updateActor"].map(event => [event, Hooks.on(event, () => { if (!this.busy) this.render(); })]);
  }
  get table() { return game.messages.get(this.tableId); }
  reset() { this.selected = new Set(); this.palm = { index: -1, value: 0 }; this.notice = ""; }
  async _prepareContext() {
    const state = pokerState(this.table), me = state ? pokerSeat(state, game.user.id) : -1, own = state?.seats[me], user = game.user;
    const closed = pokerClosed(state), stake = Number(state?.stake ?? this.stake) || 0, palm = this.palm ?? { index: -1, value: 0 };
    const actors = ownedPokerActors(user).map(actor => ({ uuid: actor.uuid, name: actor.name, crowns: actor.system.crowns, selected: actor.uuid === this.actorUuid }));
    const view = { table: Boolean(state), lobby: !state, busy: this.busy, notice: this.notice || state?.issue || "", rulesOpen: this.rulesOpen, hasGM: Boolean(game.users.activeGM),
      actors, stake, pot: stake * 2, stakes: STAKES.map(value => ({ value, label: value ? `${value} кр.` : "Без ставок", selected: value === stake })),
      opponents: game.users.filter(other => other.active && other.id !== user.id).map(other => ({ id: other.id, name: other.name, isGM: other.isGM, selected: other.id === this.opponentId })),
      recent: pokerTables().filter(message => user.isGM || pokerState(message).seats.some(seat => seat.userId === user.id)).slice(-6).reverse().map(message => {
        const table = pokerState(message);
        return { id: message.id, names: table.seats.map(seat => seat.name).join(" против "), stake: table.stake, open: !pokerClosed(table),
          status: { finished: table.winner === null ? "Ничья" : `Победил ${table.seats[table.winner].name}`, cancelled: "Отменена", declined: "Вызов отклонён" }[table.phase] ?? "Идёт игра" };
      }),
      combinations: POKER_HANDS.map((name, rank) => ({ name, example: EXAMPLES[rank].map(value => faces[value]).join("") })).reverse(),
      dc: LOADED_DICE_DC, top: null, bottom: null, phase: state?.phase ?? "", stage: "", instruction: "", result: null,
      canAccept: false, canCancel: false, canRoll: false, canDraw: false, canPalm: false, canConcede: false, canAbort: false, canRecover: false, canRematch: false,
      selectedCount: this.selected.size, palmValues: [], palmReady: false, palmPreview: "", waiting: false };
    if (!state) return view;
    const phase = state.phase, opponent = state.seats[1 - me];
    const palming = phase === "palming" && Boolean(own?.palm) && !own.final;
    Object.assign(view, {
      canAccept: phase === "invited" && me === 1, canCancel: phase === "invited" && me === 0,
      canRoll: phase === "opening" && Boolean(own) && !own.opening, canDraw: phase === "drawing" && Boolean(own) && !own.draw, canPalm: palming,
      canConcede: me >= 0 && ["opening", "drawing", "palming"].includes(phase), canAbort: user.isGM && !closed && phase !== "settling",
      canRecover: user.isGM && ["funding", "settling"].includes(phase), canRematch: closed && me >= 0,
      stage: { invited: "Приглашение", funding: "Ставки в банк", opening: "Первый бросок", drawing: "Переброс", palming: "Вскрытие", settling: "Расчёт банка" }[phase] ?? "Итог партии"
    });
    view.waiting = me >= 0 && !closed && !view.canAccept && !view.canCancel && !view.canRoll && !view.canDraw && !view.canPalm;
    if (palming) {
      const hand = state.hands[me];
      view.palmValues = Array.from({ length: 6 }, (_, i) => ({ value: i + 1, selected: palm.value === i + 1, dots: pokerDots(i + 1) }));
      view.palmReady = palm.index >= 0 && palm.value > 0 && hand[palm.index] !== palm.value;
      if (view.palmReady) view.palmPreview = pokerHand(hand.map((value, index) => index === palm.index ? palm.value : value)).name;
    }
    const seatView = index => {
      const seat = state.seats[index], mine = index === me, revealed = closed || phase === "settling";
      let dice = state.hands[index], swapped = -1;
      if (revealed) swapped = state.swaps?.[index] ?? -1;
      else if (mine) {
        const id = seat.final || seat.draw || seat.opening;
        const receipt = id ? seatReceipt(id, this.tableId, user.id, ["roll", "reroll", "finish"]) : null;
        dice = receipt?.dice ?? []; swapped = receipt?.cheat?.index ?? -1;
      }
      const combination = dice?.length === 5 ? pokerHand(dice) : null;
      const selectable = mine && !this.busy && (view.canDraw || view.canPalm);
      const selected = mine && view.canPalm ? new Set(palm.index >= 0 ? [palm.index] : []) : mine && view.canDraw ? this.selected : new Set();
      const status = closed ? state.winner === index ? "Победитель" : state.caught?.includes(index) ? "Пойман на шулерстве" : ""
        : phase === "invited" ? index === 0 ? "Бросает вызов" : "Думает над вызовом" : phase === "funding" ? "Вносит ставку"
          : phase === "opening" ? seat.opening ? "Кости брошены" : "Трясёт стакан…"
            : phase === "drawing" ? seat.draw ? rerolledText(seat.rerolled?.length ?? 0) : "Выбирает кости"
              : phase === "palming" ? "Вскрытие…" : "Считает банк";
      return { name: seat.name, mine, label: mine ? "Ваши кости" : me < 0 ? `Игрок ${index + 1}` : "Соперник", img: portrait(seat), online: Boolean(game.users.get(seat.userId)?.active), status,
        winner: phase === "finished" && state.winner === index, loser: phase === "finished" && state.winner !== null && state.winner !== index,
        dice: pokerDiceView(dice, { selected, selectable, swapped, scoring: combination ? pokerScoring(dice) : [] }),
        combination: combination?.name ?? "Кости ещё не брошены", rank: combination?.rank ?? -1, sum: combination ? combination.sum : 0 };
    };
    const order = me === 0 ? [1, 0] : [0, 1];
    view.top = seatView(order[0]); view.bottom = seatView(order[1]);
    if (closed) {
      const winner = state.seats[state.winner], loser = state.winner === null ? null : state.seats[1 - state.winner];
      const hands = state.hands.every(hand => hand.length === 5) ? state.hands.map(pokerHand) : null;
      const title = phase === "declined" ? "Вызов отклонён" : phase === "cancelled" ? "Партия отменена"
        : state.reason === "caught" ? `${state.caught.map(index => state.seats[index].name).join(" и ")}: шулерские кости!`
          : state.reason === "conceded" ? `${loser.name} сдаётся` : winner ? `${winner.name} побеждает!` : "Ничья";
      const detail = phase !== "finished" ? "" : state.reason === "caught" ? winner ? `Подмену заметили. Победа присуждена: ${winner.name}.` : "Оба пойманы на подмене — победителя нет."
        : state.reason === "conceded" ? `Победа присуждена: ${winner.name}.` : hands ? winner ? `${hands[state.winner].name} против «${hands[1 - state.winner].name}»` : `${hands[0].name} у обоих` : "";
      const bank = !stake ? "" : phase === "finished" && winner ? `Банк ${stake * 2} кр. забирает ${winner.name}.` : state.reason === "cancelled" || phase === "finished" ? "Ставки возвращены владельцам." : "Ставки не списывались.";
      view.result = { title, detail, bank, win: phase === "finished" && state.winner === me && me >= 0, lose: phase === "finished" && state.winner !== null && state.winner !== me && me >= 0 };
    }
    view.instruction = view.canAccept ? `${state.seats[0].name} зовёт вас сыграть. ${stake ? `Ставка ${stake} кр. с каждого — спишется, когда вы примете вызов.` : "Игра без ставок."}`
      : view.canCancel ? `Ждём ответа: ${opponent.name}. Деньги пока не списаны.`
        : view.canRoll ? "Встряхните стакан и бросьте пять костей."
          : view.canDraw ? "Отметьте кости, которые хотите перебросить. Переброс один — после него кости откроются."
            : view.canPalm ? `Все кости на виду. Можно незаметно подменить одну свою кость: выберите её и новое значение. Соперник проверит Внимание (СЛ ${LOADED_DICE_DC}).`
              : phase === "funding" ? "Ставки вносятся в банк…"
                : phase === "opening" ? `Ждём бросок: ${opponent?.name ?? "участники"}.`
                  : phase === "drawing" ? `${opponent?.name ?? "Участники"} выбирает кости для переброса.`
                    : phase === "palming" || phase === "settling" ? "Кости вскрываются…" : "";
    return view;
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const hands = JSON.stringify([context.top, context.bottom].map(seat => seat?.dice.map(die => die.value) ?? []));
    if (this.handKey && hands !== this.handKey) {
      const previous = JSON.parse(this.handKey);
      this.element.querySelectorAll(".poker-seat").forEach((seat, row) => seat.querySelectorAll(".poker-die:not(.is-hidden)").forEach((die, index) => {
        if (previous[row]?.[index] === JSON.parse(hands)[row][index]) return;
        die.style.animationDelay = `${index * 60}ms`; die.classList.add("just-rolled");
      }));
    }
    this.handKey = hands;
    for (const name of ["actorUuid", "opponentId", "stake"]) this.element.querySelector(`[name="${name}"]`)?.addEventListener("change", event => { this[name] = event.target.value; });
    this.element.querySelector(".poker-rules")?.addEventListener("toggle", event => { this.rulesOpen = event.target.open; });
  }
  async run(action, data = {}) {
    if (this.busy) return;
    this.busy = true; this.notice = ""; await this.render();
    try { const table = await sendPoker(action, action === "challenge" ? null : this.table, data); this.tableId = table.id; this.reset(); }
    catch (error) { this.notice = error.message; }
    finally { this.busy = false; if (!this.dismissed) await this.render(); }
  }
  async close(options) { this.dismissed = true; for (const [event, id] of this.hooks) Hooks.off(event, id); window = null; return super.close(options); }
  static #challenge() {
    const field = name => this.element.querySelector(`[name="${name}"]`)?.value ?? "";
    Object.assign(this, { actorUuid: field("actorUuid"), opponentId: field("opponentId"), stake: field("stake") });
    if (!this.opponentId) { this.notice = "Выберите, кого позвать за стол."; return this.render(); }
    return this.run("challenge", { actorUuid: this.actorUuid, opponentId: this.opponentId, stake: this.stake });
  }
  static #stake(_event, target) { this.stake = Number(target.dataset.value); this.actorUuid = this.element.querySelector('[name="actorUuid"]')?.value ?? this.actorUuid; this.opponentId = this.element.querySelector('[name="opponentId"]')?.value ?? this.opponentId; return this.render(); }
  static #accept() { this.actorUuid = this.element.querySelector('[name="actorUuid"]')?.value ?? ""; return this.run("accept", { actorUuid: this.actorUuid }); }
  static #decline() { return this.run("decline"); }
  static #cancel() { return this.run("cancel"); }
  static #roll() { return this.run("roll"); }
  static #die(_event, target) {
    const index = Number(target.dataset.index);
    if (this.busy) return;
    const state = pokerState(this.table), own = state?.seats[pokerSeat(state, game.user.id)];
    if (state?.phase === "palming" && own?.palm && !own.final) this.palm.index = this.palm.index === index ? -1 : index;
    else if (this.selected.has(index)) this.selected.delete(index); else this.selected.add(index);
    return this.render();
  }
  static #reroll() { return this.run("reroll", { indices: [...this.selected] }); }
  static #palmValue(_event, target) { this.palm.value = Number(target.dataset.value); return this.render(); }
  static #palm() { return this.run("finish", { cheat: { index: this.palm.index, value: this.palm.value } }); }
  static #fair() { return this.run("finish"); }
  static async #concede() {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Сдаться?" }, content: "<p>Победа и весь банк достанутся сопернику.</p>", yes: { label: "Сдаться" }, no: { label: "Продолжить" }, rejectClose: false });
    if (yes) return this.run("concede");
  }
  static async #abort() {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Отменить партию?" }, content: "<p>Партия закончится без победителя. Списанные ставки вернутся владельцам.</p>", yes: { label: "Отменить и вернуть ставки" }, no: { label: "Продолжить" }, rejectClose: false });
    if (yes) return this.run("abort");
  }
  static #recover() { return this.run("recover"); }
  static #lobby() { this.tableId = ""; this.reset(); return this.render(); }
  static #open(_event, target) { this.tableId = target.dataset.table; this.reset(); return this.render(); }
  static #rematch() {
    const state = pokerState(this.table), index = pokerSeat(state, game.user.id);
    Object.assign(this, { actorUuid: state.seats[index].actorUuid, opponentId: state.seats[1 - index].userId, stake: state.stake, tableId: "" });
    this.reset(); return this.render();
  }
}
/** Without a table id the window resumes the player's unfinished game, or opens the lobby. */
export async function openPokerWindow(tableId = "", { actorUuid = "" } = {}) {
  if (tableId && !pokerTables().some(message => message.id === tableId)) throw new Error("Стол недоступен.");
  tableId ||= pokerTables().findLast(message => !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.userId === game.user.id))?.id ?? "";
  if (!window) window = new PokerWindow(tableId, { actorUuid });
  else {
    if (actorUuid) window.actorUuid = actorUuid;
    if (tableId && window.tableId !== tableId) { window.tableId = tableId; window.reset(); }
  }
  await window.render({ force: true }); window.bringToFront(); return window;
}
