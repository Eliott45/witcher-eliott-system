import { SYSTEM_ID } from "../config.mjs";
import { POKER_HANDS, pokerHand, pokerSeat, pokerClosed } from "./poker-rules.mjs";
import { pokerState, pokerTables, pokerReceipt, ownedPokerActors, hasLoadedDice, seatReceipt, sendPoker } from "./poker-service.mjs";

let window;
const dots = [[], [5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];
export function pokerDiceView(dice, selected = new Set(), selectable = false) {
  return Array.from({ length: 5 }, (_, index) => ({ index, number: index + 1, value: dice?.[index] ?? 0, hidden: !dice?.[index], selected: selected.has(index), selectable,
    dots: (dots[dice?.[index] ?? 0] ?? []).map(position => ({ position })) }));
}
export class PokerWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = { id: "witcher-poker-table", classes: ["witcher-poker-window"], position: { width: 820, height: 790 },
    window: { title: "Покер на костях", icon: "fa-solid fa-dice", resizable: true }, actions: {
      challenge: PokerWindow.#challenge, accept: PokerWindow.#accept, decline: PokerWindow.#decline, cancel: PokerWindow.#cancel,
      roll: PokerWindow.#roll, die: PokerWindow.#die, reroll: PokerWindow.#reroll, keep: PokerWindow.#keep, finish: PokerWindow.#finish,
      concede: PokerWindow.#concede, abort: PokerWindow.#abort, recover: PokerWindow.#recover, lobby: PokerWindow.#lobby, openTable: PokerWindow.#open, rematch: PokerWindow.#rematch
    } };
  static PARTS = { content: { template: `systems/${SYSTEM_ID}/templates/poker-table.hbs`, scrollable: [".poker-scroll"] } };
  constructor(tableId = "") {
    super(); this.tableId = tableId; this.selected = new Set(); this.busy = false; this.notice = ""; this.actorUuid = game.user.character?.uuid ?? ""; this.opponentId = ""; this.stake = 0; this.rulesOpen = false;
    this.cheat = { enabled: false, index: 0, value: 1 };
    this.hooks = ["createChatMessage", "updateChatMessage", "deleteChatMessage", "updateUser", "updateActor"].map(event => [event, Hooks.on(event, () => { if (!this.busy) this.render({ force: true }); })]);
  }
  get table() { return game.messages.get(this.tableId); }
  async _prepareContext() {
    const state = pokerState(this.table), me = state ? pokerSeat(state, game.user.id) : -1, own = state?.seats[me];
    const closed = pokerClosed(state), active = state && !closed, user = game.user;
    const actors = ownedPokerActors(user).map(actor => ({ uuid: actor.uuid, name: actor.name, crowns: actor.system.crowns, selected: actor.uuid === this.actorUuid }));
    const view = { table: Boolean(state), lobby: !state, busy: this.busy, notice: this.notice || state?.issue, rulesOpen: this.rulesOpen,
      actors, actorOptional: !(state?.stake ?? this.stake), stake: state?.stake ?? this.stake, pot: (state?.stake ?? this.stake) * 2, hasGM: Boolean(game.users.activeGM),
      opponents: game.users.filter(other => other.active && other.id !== user.id).map(other => ({ id: other.id, name: other.name, isGM: other.isGM, selected: other.id === this.opponentId })),
      recent: pokerTables().filter(message => pokerState(message).seats.some(seat => seat.userId === user.id) || user.isGM).slice(-8).reverse().map(message => ({ id: message.id, names: pokerState(message).seats.map(seat => seat.name).join(" · "), stake: pokerState(message).stake,
        status: { finished: "Завершена", cancelled: "Отменена", declined: "Вызов отклонён" }[pokerState(message).phase] ?? "За столом" })),
      combinations: POKER_HANDS.map((name, rank) => ({ name, rank, example: ["1 · 2 · 3 · 4 · 6", "2 · 2 · 3 · 4 · 6", "2 · 2 · 4 · 4 · 6", "3 · 3 · 3 · 4 · 6", "1 · 2 · 3 · 4 · 5", "2 · 3 · 4 · 5 · 6", "3 · 3 · 3 · 5 · 5", "4 · 4 · 4 · 4 · 6", "6 · 6 · 6 · 6 · 6"][rank] })).reverse() };
    if (!state) return view;
    Object.assign(view, { invited: state.phase === "invited", canAccept: state.phase === "invited" && me === 1, canCancel: state.phase === "invited" && me === 0,
      closed, canConcede: me >= 0 && ["opening", "drawing"].includes(state.phase), canAbort: user.isGM && active && state.phase !== "settling", canRecover: user.isGM && ["funding", "settling"].includes(state.phase),
      canRoll: state.phase === "opening" && own && !own.opening, canDraw: state.phase === "drawing" && own && !own.draw,
      canFinish: state.phase === "drawing" && own?.draw && !own.final, selectedCount: this.selected.size, canRematch: closed && me >= 0,
      phase: state.phase, stage: state.phase === "invited" ? "Приглашение" : state.phase === "opening" ? "Первый бросок" : state.phase === "drawing" ? "Один переброс" : closed ? "Итог партии" : "Банк стола",
      result: state.phase === "finished" ? state.winner === null ? "Ничья" : `${state.seats[state.winner].name} побеждает!` : state.phase === "declined" ? "Вызов отклонён" : state.phase === "cancelled" ? "Партия отменена" : "",
      resultNote: closed && state.stake ? state.phase === "finished" && state.winner !== null ? `Банк ${state.stake * 2} кр. выплачен победителю.` : state.reason === "cancelled" || state.phase === "finished" ? "Списанные ставки возвращены владельцам." : "Ставки не списывались." : "",
      cheatEnabled: this.cheat?.enabled ?? false,
      cheatIndices: Array.from({ length: 5 }, (_, index) => ({ index, name: index + 1, selected: index === (this.cheat?.index ?? 0) })),
      cheatValues: Array.from({ length: 6 }, (_, index) => ({ value: index + 1, selected: index + 1 === (this.cheat?.value ?? 1) })),
      canCheat: state.phase === "drawing" && own?.draw && !own.final && hasLoadedDice(game.actors.find(actor => actor.uuid === own.actorUuid)) });
    view.seats = state.seats.map((seat, index) => {
      const mine = index === me;
      let dice = state.hands[index];
      if (mine && !closed && state.phase !== "settling") {
        const id = seat.final || seat.draw || seat.opening, kind = seat.final ? "finish" : seat.draw ? "reroll" : "roll";
        if (id) dice = seatReceipt(id, this.tableId, user.id, kind).dice;
      }
      const known = dice.length === 5, combination = known ? pokerHand(dice) : null;
      const status = closed ? state.winner === index ? "Победитель" : state.winner === null ? "" : "" : seat.final ? "Готов к вскрытию" : seat.draw ? mine ? "Подтвердите результат" : "Выбирает итог" : state.phase === "drawing" ? "Выбирает кости" : seat.opening ? "Кости брошены" : "Ждёт броска";
      return { name: seat.name, mine, online: Boolean(game.users.get(seat.userId)?.active), status, winner: state.phase === "finished" && state.winner === index,
        dice: pokerDiceView(dice, mine ? this.selected : new Set(), mine && view.canDraw && !this.busy), combination: combination?.name ?? "Пять костей ждут броска", sum: combination?.sum ?? null };
    });
    if (me === 0) view.seats.reverse(); // Your hand always sits nearest to you.
    view.instruction = view.canAccept ? `Вас пригласили за стол. ${state.stake ? `С каждого участника будет списано ${state.stake} кр.` : "Игра без ставок."}`
      : view.canCancel ? "Соперник решает, принять ли вызов. Деньги пока не списаны."
        : view.canRoll ? "Бросьте свои пять костей. Когда оба будут готовы, откроются начальные комбинации."
          : view.canDraw ? "Нажмите на кости, которые хотите перебросить. Остальные останутся на столе."
            : view.canFinish ? "Это ваш окончательный бросок. Подтвердите его для вскрытия."
              : closed ? (state.reason === "conceded" ? "Один из участников сдался." : "Можно предложить реванш или пригласить нового соперника.")
                : own?.final ? "Вы готовы. Ждём соперника; его итоговые кости пока скрыты." : "Ждём второго участника.";
    return view;
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const hands = JSON.stringify(context.seats?.map(seat => seat.dice.map(die => die.value)) ?? []);
    if (this.handKey && hands !== this.handKey) this.element.querySelectorAll(".poker-die:not(.is-hidden)").forEach((die, index) => {
      die.style.animationDelay = `${(index % 5) * 35}ms`; die.classList.add("just-rolled");
    });
    this.handKey = hands;
    for (const [name, property] of [["actorUuid", "actorUuid"], ["opponentId", "opponentId"], ["stake", "stake"]]) {
      this.element.querySelector(`[name="${name}"]`)?.addEventListener("input", event => { this[property] = event.target.value; });
    }
    this.element.querySelector('[name="cheat"]')?.addEventListener("change", event => { this.cheat.enabled = event.target.checked; });
    this.element.querySelector('[name="cheatIndex"]')?.addEventListener("change", event => { this.cheat.index = Number(event.target.value); });
    this.element.querySelector('[name="cheatValue"]')?.addEventListener("change", event => { this.cheat.value = Number(event.target.value); });
    this.element.querySelector(".poker-rules")?.addEventListener("toggle", event => { this.rulesOpen = event.target.open; });
  }
  async run(action, data = {}) {
    if (this.busy) return;
    this.busy = true; this.notice = ""; await this.render({ force: true });
    try { const table = await sendPoker(action, action === "challenge" ? null : this.table, data); this.tableId = table.id; this.selected.clear(); this.cheat = { enabled: false, index: 0, value: 1 }; }
    catch (error) { this.notice = error.message; }
    finally { this.busy = false; if (!this.dismissed) await this.render({ force: true }); }
  }
  async close(options) { this.dismissed = true; for (const [event, id] of this.hooks) Hooks.off(event, id); window = null; return super.close(options); }
  static #challenge() {
    const data = { actorUuid: this.element.querySelector('[name="actorUuid"]').value, opponentId: this.element.querySelector('[name="opponentId"]').value, stake: this.element.querySelector('[name="stake"]').value };
    this.actorUuid = data.actorUuid; this.opponentId = data.opponentId; this.stake = data.stake;
    return this.run("challenge", data);
  }
  static #accept() { this.actorUuid = this.element.querySelector('[name="actorUuid"]').value; return this.run("accept", { actorUuid: this.actorUuid }); }
  static #decline() { return this.run("decline"); }
  static #cancel() { return this.run("cancel"); }
  static #roll() { return this.run("roll"); }
  static #die(_event, target) { const i = Number(target.dataset.index); if (this.busy) return; if (this.selected.has(i)) this.selected.delete(i); else this.selected.add(i); return this.render({ force: true }); }
  static #reroll() { return this.run("reroll", { indices: [...this.selected] }); }
  static #keep() { return this.run("reroll", { indices: [] }); }
  static #finish() {
    const use = this.element.querySelector('[name="cheat"]')?.checked;
    return this.run("finish", use ? { cheat: { index: Number(this.element.querySelector('[name="cheatIndex"]').value), value: Number(this.element.querySelector('[name="cheatValue"]').value) } } : {});
  }
  static async #concede() {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Сдаться?" }, content: "<p>Победа и весь банк достанутся сопернику.</p>", yes: { label: "Сдаться" }, no: { label: "Продолжить" }, rejectClose: false });
    if (yes) return this.run("concede");
  }
  static async #abort() {
    const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: "Отменить партию?" }, content: "<p>Партия закончится без победителя. Списанные ставки вернутся владельцам.</p>", yes: { label: "Отменить и вернуть ставки" }, no: { label: "Продолжить" }, rejectClose: false });
    if (yes) return this.run("abort");
  }
  static #recover() { return this.run("recover"); }
  static #lobby() { this.tableId = ""; this.notice = ""; this.selected.clear(); return this.render({ force: true }); }
  static #open(_event, target) { this.tableId = target.dataset.table; this.notice = ""; this.selected.clear(); return this.render({ force: true }); }
  static #rematch() {
    const state = pokerState(this.table), index = pokerSeat(state, game.user.id);
    this.actorUuid = state.seats[index].actorUuid; this.opponentId = state.seats[1 - index].userId; this.stake = state.stake;
    this.tableId = ""; this.notice = ""; return this.render({ force: true });
  }
}
export async function openPokerWindow(tableId = "") {
  if (tableId && !pokerTables().some(message => message.id === tableId)) throw new Error("Стол недоступен.");
  if (!window) window = new PokerWindow(tableId);
  else if (tableId && window.tableId !== tableId) { window.tableId = tableId; window.selected.clear(); window.notice = ""; }
  await window.render({ force: true }); window.bringToFront(); return window;
}
