import { SYSTEM_ID } from "../config.mjs";
import { groupAmbush, requestAmbush, rollGroupParticipant, releaseAmbushRoll, acceptAmbushRoll, applyGroupAmbush, startGroupCombat, restoreGroupPreparation } from "../combat/group-ambush.mjs";
import { tacticsWrite } from "../combat/combat-tactics.mjs";
import { tacticsFlags } from "../combat/tactics-rules.mjs";
import { groupCardContext } from "../sheets/ambush-context.mjs";

export async function ambushMacro() {
  try {
    if (game.user.isGM) {
      const {openAmbushWindow} = await import("../sheets/ambush-window.mjs");
      return openAmbushWindow();
    }
    const actor = canvas.tokens.controlled.find(token => token.actor?.isOwner)?.actor ?? game.user.character;
    return requestAmbush(actor);
  } catch (error) { ui.notifications.warn(error.message); }
}

export function bindGroupCard(html, combat, sessionId) {
  for (const button of html.querySelectorAll("[data-ambush-roll], [data-ambush-unlock]")) {
    button.addEventListener("click",async event => {
      event.stopPropagation();button.disabled = true;
      try {
        if (button.dataset.ambushUnlock && game.user.isGM) {
          await tacticsWrite(combat,() => releaseAmbushRoll(combat,sessionId,button.dataset.ambushUnlock));
        } else if (button.dataset.ambushRoll) {
          const participant = combat.combatants.get(button.dataset.ambushRoll);
          if (participant?.isOwner) await rollGroupParticipant(participant,sessionId);
        }
      } catch (error) { ui.notifications.warn(error.message); }
      finally { refreshCards(combat); }
    });
  }
}

/** Checks are shown inside their ambush card, so the separate dice messages stay out of the log. */
export function foldedIntoCard(message) {
  const check = tacticsFlags(message).groupAmbushRoll;
  return !!check && game.messages.some(entry => tacticsFlags(entry).groupAmbushCard?.session === check.session);
}

export async function renderGroupAmbush(message, html) {
  const flags = tacticsFlags(message), request = flags.ambushRequest, card = flags.groupAmbushCard;
  if (foldedIntoCard(message)) { html.classList.add("witcher-ambush-folded"); html.hidden = true; return; }
  if (!request && !card) return;
  const root = html.querySelector(".witcher-group-ambush");
  if (!root) return;
  let combat;
  if (card) {
    combat = game.combats.get(card.combat);
    const context = groupCardContext(combat,card.session);
    root.innerHTML = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/ambush-card.hbs`,context);
    bindGroupCard(root,combat,card.session);
  }
  if (game.user.isGM && (request || groupAmbush(combat)?.id === card.session)) {
    const button = document.createElement("button"); button.type = "button"; button.className = "witcher-group-manage";
    button.innerHTML = '<i class="fa-solid fa-sliders"></i> Настроить засаду';
    button.addEventListener("click",async () => {
      try {
        const {openAmbushWindow} = await import("../sheets/ambush-window.mjs");
        await openAmbushWindow(request?.scene ?? combat.scene.id);
      } catch (error) {ui.notifications.warn(error.message);}
    });
    root.append(button);
  }
}

function refreshCards(combat) {
  if (!ui.chat) return;
  for (const message of game.messages) if (tacticsFlags(message).groupAmbushCard?.combat === combat?.id) ui.chat.updateMessage(message,{notify:false});
}
export function registerGroupAmbush() {
  game.system.api = {...game.system.api,ambush:ambushMacro};
  Hooks.on("renderChatMessageHTML",renderGroupAmbush);
  Hooks.on("updateCombat",refreshCards);
  Hooks.on("updateCombatant",entry => refreshCards(entry.parent));
  Hooks.on("deleteCombat",refreshCards);
  const accept = message => {
    const check = tacticsFlags(message).groupAmbushRoll, combat = check && game.combats.get(check.combat);
    if (combat && game.users.activeGM?.isSelf) tacticsWrite(combat,() => acceptAmbushRoll(message)).catch(console.error);
  };
  Hooks.on("createChatMessage",accept);
  Hooks.once("ready",() => {
    if (!game.users.activeGM?.isSelf) return;
    for (const combat of game.combats) {
      if (!groupAmbush(combat)) continue;
      tacticsWrite(combat,async () => {
        for (const row of groupAmbush(combat).entries) {
          const message = game.messages.find(message => {
            const check = tacticsFlags(message).groupAmbushRoll;
            return check?.session === groupAmbush(combat).id && check.combatant === row.id && check.nonce === row.claim?.id;
          });
          if (message) await acceptAmbushRoll(message);
        }
        await applyGroupAmbush(combat);
        const session = groupAmbush(combat);
        if (session.status === "initiative") await startGroupCombat(combat);
        else await restoreGroupPreparation(combat);
      }).catch(console.error);
    }
  });
}
