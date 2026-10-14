import { SYSTEM_ID } from "../config.mjs";
import { pokerClosed } from "./poker-rules.mjs";
import { pokerState, pokerReceipt, pokerTables, pokerWrite, processPokerRequest, resumePoker, watchBrawls } from "./poker-service.mjs";
import { setStatus } from "../combat/status-effects.mjs";
import { betsTotal } from "./tavern-games.mjs";
import { forgeGwentCard, discardGwentForgeries } from "./gwent-forgery.mjs";

export async function openPoker(tableId = "", options = {}) {
  const { openPokerWindow } = await import("./poker-window.mjs");
  return openPokerWindow(tableId, options);
}
/** Macro entries: `game.system.api.poker({ actor })` and `game.system.api.gwent({ actor })` sit down as that character. */
const tavernApi = game => ({ actor = null, tableId = "" } = {}) => openPoker(tableId, { actorUuid: actor?.uuid ?? "", game });
const sheetItem = (sheet, target) => sheet.item ?? sheet.actor?.items.get(target.dataset.itemId);
export const pokerActions = {
  async playPoker(_event, target) {
    const item = sheetItem(this, target);
    if (!item?.actor?.isOwner) return;
    try { await openPoker("", { actorUuid: item.actor.uuid, game: target.dataset.game || "poker" }); } catch (error) { ui.notifications.warn(error.message); }
  },
  async forgeGwentCard(_event, target) {
    if (!this.isEditable) return;
    try { await forgeGwentCard(sheetItem(this, target)); } catch (error) { ui.notifications.warn(error.message); }
  },
  async discardGwentForgeries(_event, target) {
    if (this.isEditable) await discardGwentForgeries(sheetItem(this, target));
  }
};
/** Money on the table: an equal stake, or the bets against a fillet performer. */
const atStake = state => Boolean(state?.stake || (state?.game === "fillet" && betsTotal(state)));
export function registerPoker() {
  game.system.api = { ...game.system.api, tavern: tavernApi(""), poker: tavernApi("poker"), gwent: tavernApi("gwent"), hoard: tavernApi("hoard"),
    armWrestling: tavernApi("arm"), drinking: tavernApi("drink"), fillet: tavernApi("fillet"), brawl: tavernApi("brawl") };
  const report = error => { console.error("Dice poker", error); ui.notifications.warn(error.message); };
  Hooks.on("getSceneControlButtons", controls => {
    const tokens = controls.tokens ?? controls.token;
    if (tokens?.tools) tokens.tools.witcherPoker = { name: "witcherPoker", title: "Развлечения в таверне", icon: "fa-solid fa-beer-mug-empty", order: 92, button: true,
      onChange: () => openPoker().catch(report) };
  });
  Hooks.on("createChatMessage", (message, _options, userId) => {
    if (message.flags?.[SYSTEM_ID]?.pokerRequest) pokerWrite(() => processPokerRequest(message, userId)).catch(report);
    const state = pokerState(message);
    if (message.author?.isGM && state?.seats.some(seat => seat.userId === game.user.id)) openPoker(message.id).catch(report);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (message.flags?.[SYSTEM_ID]?.pokerRequest || pokerReceipt(message)) { html.hidden = true; html.classList.add("witcher-poker-internal"); return; }
    const button = pokerState(message) && message.author?.isGM && message.isContentVisible ? html.querySelector("[data-poker-open]") : null;
    if (!button) return;
    if (!pokerState(message).seats.some(seat => seat.userId === game.user.id)) button.innerHTML = '<i class="fa-solid fa-eye"></i> Смотреть игру';
    button.addEventListener("click", () => openPoker(message.id).catch(report));
  });
  Hooks.once("ready", () => {
    pokerWrite(resumePoker).catch(report);
    const active = pokerTables().find(message => !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.userId === game.user.id));
    if (active) openPoker(active.id).catch(report);
  });
  Hooks.on("updateUser", () => pokerWrite(resumePoker).catch(report));
  // A fistfight ends when a fighter drops in the real combat: watch actors and their conditions.
  const brawls = () => { if (game.users.activeGM?.isSelf) pokerWrite(watchBrawls).catch(report); };
  for (const hook of ["updateActor", "createActiveEffect", "updateActiveEffect"]) Hooks.on(hook, brawls);
  // «Дьявольский мускус»: when the five minutes are over (or the effect is removed), nausea follows.
  Hooks.on("deleteActiveEffect", effect => {
    const status = effect.flags?.[SYSTEM_ID]?.condition?.thenStatus, actor = effect.parent;
    if (status && actor?.documentName === "Actor" && game.users.activeGM?.isSelf) setStatus(actor, status, true).catch(report);
  });
  // Do not let chat cleanup remove an escrow receipt while the corresponding game is running.
  Hooks.on("preDeleteChatMessage", message => {
    const table = pokerState(message) ? message : game.messages.get(pokerReceipt(message)?.tableId);
    if (table?.author?.isGM && atStake(pokerState(table)) && !pokerClosed(pokerState(table))) {
      ui.notifications.warn("Сначала завершите партию в покер или отмените её с возвратом ставок."); return false;
    }
  });
  Hooks.on("preDeleteActor", actor => {
    if (pokerTables().some(message => atStake(pokerState(message)) && !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.actorUuid === actor.uuid))) {
      ui.notifications.warn("У персонажа есть незавершённая партия в покер со ставкой. Сначала завершите или отмените её."); return false;
    }
  });
}
