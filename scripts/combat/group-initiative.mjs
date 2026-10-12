import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Core p.154 «Инициатива группы»: the leader rolls one d10 for the whole group;
// each member adds their own initiative stat (REF and its modifiers) to that same die.
// Players lead their own side: they roll, and the active GM applies the result after validating it.

const initiativeBonus = combatant => combatant.actor?.system.statistics?.initiative ?? 0;
const sideOf = combatant => combatant.token?.disposition ?? null;

/** Pure: initiative per member from one shared die. */
export const groupInitiative = (die, members) => members.map(member => ({ ...member, initiative: Math.max(0, die + member.bonus) }));

/** Who may join a group led by `leader` for `user`: GM — anyone; player — allies without initiative or their own combatants. */
export function eligibleMembers(combat, leader, user = game.user) {
  return Array.from(combat.combatants).filter(entry => entry.actor && (user.isGM
    || (sideOf(entry) === sideOf(leader) && (!Number.isFinite(entry.initiative) || entry.testUserPermission(user, "OWNER")))));
}

async function postGroupRoll(combat, leader, members) {
  const roll = await evaluateRoll("1d10");
  const rows = groupInitiative(roll.total, members.map(entry => ({ id: entry.id, name: entry.name, bonus: initiativeBonus(entry) })));
  const list = [...rows].sort((a, b) => b.initiative - a.initiative)
    .map(row => `<li><span>${esc(row.name)}</span><small>${roll.total} + ${row.bonus}</small><b>${row.initiative}</b></li>`).join("");
  const message = await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: leader.actor, token: leader.token }),
    flavor: `<section class="witcher-group-initiative"><h3>Групповая инициатива</h3><p>Лидер: <b>${esc(leader.name)}</b> · общий d10 для всех</p><ol>${list}</ol></section>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, groupInitiative: { combat: combat.id, leader: leader.id, members: rows.map(row => row.id), die: roll.total } } } });
  return { message, rows };
}

const applyRows = (combat, rows) => combat.updateEmbeddedDocuments("Combatant", rows.map(row => ({ _id: row.id, initiative: row.initiative })));

export async function rollGroupInitiative(combat, memberIds, leaderId) {
  const leader = combat.combatants.get(leaderId);
  if (!leader?.isOwner) throw new Error("Лидером может быть только ваш персонаж.");
  const allowed = new Set(eligibleMembers(combat, leader).map(entry => entry.id));
  const members = [...new Set([leaderId, ...memberIds])].map(id => combat.combatants.get(id)).filter(entry => entry && allowed.has(entry.id));
  if (members.length < 2) throw new Error("Выберите хотя бы двух участников группы.");
  const { message, rows } = await postGroupRoll(combat, leader, members);
  if (game.user.isGM) return applyRows(combat, rows);
  const { requestTactic } = await import("./combat-tactics.mjs");
  return requestTactic(leader, "group-initiative", { message: message.id });
}

/** Active GM side of a player's request: re-derive everything from the posted roll. */
export async function applyGroupInitiativeRequest(combat, leader, request) {
  const message = game.messages.get(request.message), data = message?.flags?.[SYSTEM_ID]?.groupInitiative;
  const user = game.users.get(request.requester);
  if (!data || data.combat !== combat.id || data.leader !== leader.id || message.author?.id !== user?.id || message.rolls[0]?.total !== data.die)
    throw new Error("Бросок групповой инициативы не найден. Бросьте ещё раз.");
  const allowed = new Set(eligibleMembers(combat, leader, user).map(entry => entry.id));
  const members = data.members.map(id => combat.combatants.get(id)).filter(entry => entry && allowed.has(entry.id));
  return applyRows(combat, groupInitiative(data.die, members.map(entry => ({ id: entry.id, bonus: initiativeBonus(entry) }))));
}

export async function openGroupInitiative(combat) {
  const owned = Array.from(combat.combatants).filter(entry => entry.actor && entry.isOwner);
  if (!owned.length) throw new Error("В бою нет ваших персонажей.");
  const pending = owned.find(entry => !Number.isFinite(entry.initiative)) ?? owned[0];
  const rows = game.user.isGM ? Array.from(combat.combatants).filter(entry => entry.actor) : eligibleMembers(combat, pending);
  if (rows.length < 2) throw new Error("Нет союзников, которых можно включить в группу.");
  const side = sideOf(pending);
  const content = `<p class="witcher-group-initiative-hint">Лидер бросает один d10; каждый участник прибавляет свою инициативу (РЕА).${game.user.isGM ? "" : " Можно выбрать своих персонажей и союзников без инициативы; лидер — ваш персонаж."}</p>
    <div class="witcher-group-initiative-list">${rows.map(entry => `<label><input type="checkbox" name="member" value="${entry.id}" ${sideOf(entry) === side && !Number.isFinite(entry.initiative) || entry === pending ? "checked" : ""}>
      <img src="${esc(entry.img ?? entry.token?.texture?.src ?? "icons/svg/mystery-man.svg")}" alt=""><span>${esc(entry.name)}${Number.isFinite(entry.initiative) ? ` <small>(уже ${entry.initiative})</small>` : ""}</span><small>+${initiativeBonus(entry)}</small>
      ${entry.isOwner ? `<input type="radio" name="leader" value="${entry.id}" ${entry === pending ? "checked" : ""} aria-label="Лидер: ${esc(entry.name)}" data-tooltip="Лидер группы">` : "<span></span>"}</label>`).join("")}</div>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Групповая инициатива", icon: "fa-solid fa-people-group" }, classes: ["witcher-group-initiative-dialog"], content,
    ok: { label: "Бросить за группу", icon: "fa-solid fa-dice-d10",
      callback: (_event, button) => ({ members: [...button.form.querySelectorAll("[name=member]:checked")].map(input => input.value),
        leader: button.form.querySelector("[name=leader]:checked")?.value }) },
    rejectClose: false
  });
  if (!result) return;
  return rollGroupInitiative(combat, result.members, result.leader ?? pending.id);
}

export function registerGroupInitiative() {
  Hooks.on("renderCombatTracker", (app, html) => {
    html.querySelector(".witcher-group-initiative-button")?.remove();
    const combat = app.viewed;
    if (!combat || !Array.from(combat.combatants).some(entry => entry.isOwner)) return;
    const anchor = html.querySelector('[data-action="rollNPC"]'), bar = html.querySelector(".encounter-controls .control-buttons.left");
    if (!anchor && !bar) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inline-control combat-control icon fa-solid fa-people-group witcher-group-initiative-button";
    button.dataset.tooltip = "Групповая инициатива: один d10 лидера + РЕА каждого";
    button.setAttribute("aria-label", button.dataset.tooltip);
    button.disabled = combat.combatants.size < 2;
    button.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      try { await openGroupInitiative(combat); } catch (error) { ui.notifications.warn(error.message); }
    });
    if (anchor) anchor.after(button);
    else { bar.querySelector(".spacer")?.remove(); bar.prepend(button); }
  });
}
