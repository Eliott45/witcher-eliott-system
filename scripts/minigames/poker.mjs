import { SYSTEM_ID } from "../config.mjs";
import { pokerClosed } from "./poker-rules.mjs";
import { pokerState, pokerReceipt, pokerTables, pokerWrite, processPokerRequest, resumePoker } from "./poker-service.mjs";

export async function openPoker(tableId = "") {
  const { openPokerWindow } = await import("./poker-window.mjs");
  return openPokerWindow(tableId);
}
export function registerPoker() {
  game.system.api = { ...game.system.api, poker: openPoker };
  const report = error => { console.error("Dice poker", error); ui.notifications.warn(error.message); };
  Hooks.on("getSceneControlButtons", controls => {
    const tokens = controls.tokens ?? controls.token;
    if (tokens?.tools) tokens.tools.witcherPoker = { name: "witcherPoker", title: "Покер на костях", icon: "fa-solid fa-dice", order: 92, button: true,
      onChange: () => openPoker().catch(report) };
  });
  Hooks.on("createChatMessage", (message, _options, userId) => {
    if (message.flags?.[SYSTEM_ID]?.pokerRequest) pokerWrite(() => processPokerRequest(message, userId)).catch(report);
    const state = pokerState(message);
    if (message.author?.isGM && state?.seats.some(seat => seat.userId === game.user.id)) openPoker(message.id).catch(report);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (message.flags?.[SYSTEM_ID]?.pokerRequest || pokerReceipt(message)) { html.hidden = true; html.classList.add("witcher-poker-internal"); return; }
    if (pokerState(message) && message.author?.isGM && message.isContentVisible) html.querySelector("[data-poker-open]")?.addEventListener("click", () => openPoker(message.id).catch(report));
  });
  Hooks.once("ready", () => {
    pokerWrite(resumePoker).catch(report);
    const active = pokerTables().find(message => !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.userId === game.user.id));
    if (active) openPoker(active.id).catch(report);
  });
  Hooks.on("updateUser", () => pokerWrite(resumePoker).catch(report));
  // Do not let chat cleanup remove an escrow receipt while the corresponding game is running.
  Hooks.on("preDeleteChatMessage", message => {
    const table = pokerState(message) ? message : game.messages.get(pokerReceipt(message)?.tableId);
    if (table?.author?.isGM && pokerState(table)?.stake && !pokerClosed(pokerState(table))) {
      ui.notifications.warn("Сначала завершите партию в покер или отмените её с возвратом ставок."); return false;
    }
  });
  Hooks.on("preDeleteActor", actor => {
    if (pokerTables().some(message => pokerState(message).stake && !pokerClosed(pokerState(message)) && pokerState(message).seats.some(seat => seat.actorUuid === actor.uuid))) {
      ui.notifications.warn("У персонажа есть незавершённая партия в покер со ставкой. Сначала завершите или отмените её."); return false;
    }
  });
}
