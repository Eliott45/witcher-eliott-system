import { SYSTEM_ID } from "../config.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { schoolReactions, schoolReactionAvailable } from "./school-gear-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export async function useSchoolReaction(reaction) {
  if (!schoolReactionAvailable(reaction)) throw new Error("Возможность школьной брони больше недоступна.");
  const { actor, school } = reaction, casting = school === "griffin";
  const items = casting ? Array.from(actor.items).filter(item => item.type === "spell" && item.system.kind === "sign")
    : equippedItems(actor.items).filter(item => item.type === "weapon" && !item.system.natural && (school !== "manticore" || item.id === reaction.shieldId)
      && (school !== "cat" || item.system.category === "melee"));
  if (!items.length && school !== "cat") throw new Error(casting ? "В книге персонажа нет знаков." : "Нет подходящего оружия в руках.");
  const choice = await foundry.applications.api.DialogV2.wait({ window: { title: reaction.title }, classes: ["witcher-picker"],
    content: `<p>Немедленное действие: без дополнительных −3 и 3 ВЫН.${casting ? " Стоимость знака сохраняется." : ""}</p>${!casting && school !== "manticore" ? "<p>Цель — выбранный токен (T), иначе противник из этого обмена.</p>" : ""}<label>${casting ? "Знак" : "Оружие"}<select name="item">${school === "cat" ? '<option value="">Борьба — без оружия</option>' : ""}${items.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("")}</select></label>`
      + (school === "cat" ? '<label>Приём<select name="mode"><option value="disarm">Разоружение</option><option value="trip">Подсечка</option></select></label>' : ""), rejectClose: false,
    buttons: [{ action: "use", label: "Продолжить", default: true, callback: (_event, button) => ({ id: button.form.elements.item.value, mode: button.form.elements.mode?.value ?? "fast" }) }, { action: "cancel", label: "Отмена", callback: () => null }] });
  if (!choice || typeof choice !== "object") return;
  const schoolReaction = { triggerId: reaction.trigger.id, school };
  if (school === "cat" && !choice.id) return (await import("./grapple.mjs")).rollGrappleAction(actor, choice.mode, {schoolReaction});
  if (casting) return (await import("../sheets/magic-context.mjs")).castDialog(actor, actor.items.get(choice.id), false, { schoolReaction });
  return (await import("./weapon-rolls.mjs")).rollWeaponAttack(actor, choice.id, { mode: choice.mode, schoolReaction });
}
export function registerSchoolGearChat() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.flags?.[SYSTEM_ID]?.weaponAttack) return;
    // Exchange receipts are folded out of the chat log; controls belong on the visible attack card.
    const reactions = (game.messages?.contents ?? []).filter(entry => entry.flags?.[SYSTEM_ID]?.exchange?.attack === message.id).flatMap(schoolReactions);
    for (const reaction of reactions) {
      if (!reaction.actor?.isOwner || !message.isContentVisible) continue;
      const section = document.createElement("section"); section.className = "witcher-attack-chat";
      const button = document.createElement("button"); button.type = "button";
      button.innerHTML = `<i class="fa-solid fa-bolt"></i> ${esc(reaction.title)}`;
      button.disabled = !schoolReactionAvailable(reaction);
      button.addEventListener("click", async () => { button.disabled = true; try { await useSchoolReaction(reaction); } catch (error) { ui.notifications.warn(error.message); } finally { button.disabled = !schoolReactionAvailable(reaction); } });
      section.append(button);
      const index = reaction.trigger.flags[SYSTEM_ID].exchange.index;
      const row = html.querySelectorAll(".witcher-exchange > ol > li")[index];
      (row ?? html.querySelector(".message-content") ?? html).append(section);
    }
  });
  const refresh = () => {
    const ids = new Set((game.messages?.contents ?? []).slice(-50).flatMap(message => schoolReactions(message).map(reaction => reaction.source.id)));
    for (const id of ids) ui.chat?.updateMessage(game.messages.get(id), { notify: false });
  };
  Hooks.on("createChatMessage", refresh);
  Hooks.on("updateChatMessage", refresh);
  Hooks.on("updateCombat", refresh);
  Hooks.on("diceSoNiceRollComplete", refresh);
}
