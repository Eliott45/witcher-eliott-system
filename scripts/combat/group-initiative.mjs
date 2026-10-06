import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Core p.154 «Инициатива группы»: the leader rolls one d10 for the whole group;
// each member adds their own initiative stat (REF and its modifiers) to that same die.

const initiativeBonus = combatant => combatant.actor?.system.statistics?.initiative ?? 0;

/** Pure: initiative per member from one shared die. */
export const groupInitiative = (die, members) => members.map(member => ({ ...member, initiative: die + member.bonus }));

export async function rollGroupInitiative(combat, memberIds, leaderId) {
  if (!game.user.isGM) throw new Error("Групповую инициативу назначает мастер.");
  const members = memberIds.map(id => combat.combatants.get(id)).filter(Boolean);
  const leader = combat.combatants.get(leaderId) ?? members[0];
  if (members.length < 2) throw new Error("Выберите хотя бы двух участников группы.");
  const roll = await new foundry.dice.Roll("1d10").evaluate();
  const rows = groupInitiative(roll.total, members.map(entry => ({ id: entry.id, name: entry.name, bonus: initiativeBonus(entry) })));
  await combat.updateEmbeddedDocuments("Combatant", rows.map(row => ({ _id: row.id, initiative: row.initiative })));
  const list = rows.sort((a, b) => b.initiative - a.initiative)
    .map(row => `<li><span>${esc(row.name)}</span><small>${roll.total} + ${row.bonus}</small><b>${row.initiative}</b></li>`).join("");
  return roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: leader.actor, token: leader.token }),
    flavor: `<section class="witcher-group-initiative"><h3>Групповая инициатива</h3><p>Лидер: <b>${esc(leader.name)}</b> · общий d10 для всех</p><ol>${list}</ol></section>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, groupInitiative: { combat: combat.id, leader: leader.id, members: rows.map(row => row.id) } } } });
}

export async function openGroupInitiative(combat) {
  const rows = Array.from(combat.combatants).filter(entry => entry.actor);
  if (rows.length < 2) throw new Error("В бою меньше двух участников.");
  // Suggest a side: the members sharing the disposition of the first combatant without initiative.
  const pending = rows.find(entry => !Number.isFinite(entry.initiative)) ?? rows[0];
  const side = pending.token?.disposition;
  const content = `<p class="witcher-group-initiative-hint">Лидер бросает один d10; каждый участник прибавляет свою инициативу (РЕА).</p>
    <div class="witcher-group-initiative-list">${rows.map(entry => `<label><input type="checkbox" name="member" value="${entry.id}" ${entry.token?.disposition === side ? "checked" : ""}>
      <img src="${esc(entry.img ?? entry.token?.texture?.src ?? "icons/svg/mystery-man.svg")}" alt=""><span>${esc(entry.name)}</span><small>+${initiativeBonus(entry)}</small>
      <input type="radio" name="leader" value="${entry.id}" ${entry === pending ? "checked" : ""} aria-label="Лидер: ${esc(entry.name)}" data-tooltip="Лидер группы"></label>`).join("")}</div>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Групповая инициатива", icon: "fa-solid fa-people-group" }, classes: ["witcher-group-initiative-dialog"], content,
    ok: { label: "Бросить за группу", icon: "fa-solid fa-dice-d10",
      callback: (_event, button) => ({ members: [...button.form.querySelectorAll("[name=member]:checked")].map(input => input.value),
        leader: button.form.querySelector("[name=leader]:checked")?.value }) },
    rejectClose: false
  });
  if (!result) return;
  const leader = result.members.includes(result.leader) ? result.leader : result.members[0];
  return rollGroupInitiative(combat, result.members, leader);
}

export function registerGroupInitiative() {
  Hooks.on("renderCombatTracker", (app, html) => {
    html.querySelector(".witcher-group-initiative-button")?.remove();
    const combat = app.viewed, anchor = html.querySelector('[data-action="rollNPC"]');
    if (!game.user.isGM || !combat || !anchor) return;
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
    anchor.after(button);
  });
}
