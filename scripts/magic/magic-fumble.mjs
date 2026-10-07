import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { attackerToken, tokenCenter } from "../combat/attack-target.mjs";
import { setStatus } from "../combat/status-effects.mjs";
import { carriedFocuses } from "./rules.mjs";

// Core pp.166–167 «Последствия магического провала» and «Стихийный эффект критического провала».
// Damage (1 per point) and the earth/fire/water states are applied by the cast itself; this panel shows the
// result like a weapon fumble and resolves what needs a choice or the map: air knock-back, the GM's pick for
// mixed magic, and focus items exploding like a bomb (1d10, 2 m).
export const ELEMENT_STATUS = { earth: "stunned", fire: "burning", water: "frozen" };
export const ELEMENT_NAMES = { mixed: "Смешанная", earth: "Земля", air: "Воздух", fire: "Огонь", water: "Вода" };
const ELEMENT_EFFECT = { earth: "дезориентация", air: "отбрасывает на 2 м", fire: "горение", water: "заморозка" };

/** Table row for a fumble of `severity` (core p.166). */
export function fumbleRow(severity) {
  if (severity <= 0) return null;
  if (severity <= 6) return { id: "crackle", text: "Магия трещит и полыхает вокруг заклинателя: урон по 1 за пункт, но заклинание всё равно срабатывает." };
  if (severity <= 9) return { id: "backfire", text: "Магия загорается внутри заклинателя: заклинание не сработало, урон по 1 за пункт и стихийный эффект." };
  return { id: "explosion", text: "Магия взрывается с жутким шумом: урон по 1 за пункт, стихийный эффект, фокусирующие предметы при себе взрываются (1d10 в радиусе 2 м)." };
}

const flags = message => message.flags?.[SYSTEM_ID] ?? {};
const steps = message => flags(message).magicFumbleSteps ?? {};

async function knockBack(actor) {
  const token = attackerToken(actor), scene = token.parent, rad = (token.rotation ?? 0) * Math.PI / 180;
  const pixels = 2 / scene.grid.distance * scene.grid.size;
  // Backwards from where the caster faces (north = 0°, clockwise).
  await token.update({ x: Math.round(token.x - Math.sin(rad) * pixels), y: Math.round(token.y + Math.cos(rad) * pixels) });
}

async function applyElement(message, element) {
  const actor = message.speakerActor;
  if (element === "air") await knockBack(actor);
  else if (ELEMENT_STATUS[element]) await setStatus(actor, ELEMENT_STATUS[element], true);
  await message.setFlag(SYSTEM_ID, "magicFumbleSteps", { ...steps(message), element });
}

async function explodeFocus(message) {
  const actor = message.speakerActor, token = attackerToken(actor);
  const focuses = carriedFocuses(actor);
  if (!focuses.length) throw new Error("Фокусирующих предметов при себе нет — взрыва нет.");
  const { postBlast } = await import("../combat/bombs.mjs");
  await postBlast(actor, token.parent, tokenCenter(token), { name: "Взрыв фокусирующих предметов", radius: 2, damage: "1d10",
    intro: `<p>Магический провал ${esc(actor.name)}: взрываются ${esc(focuses.map(item => item.name).join(", "))}.</p>` });
  // The exploded focus is gone; it stays in the inventory with quantity 0 so the GM can restore it.
  await actor.updateEmbeddedDocuments("Item", focuses.map(item => ({ _id: item.id, "system.quantity": 0, "system.equipped": false })));
  await message.setFlag(SYSTEM_ID, "magicFumbleSteps", { ...steps(message), explosion: true });
}

export function renderMagicFumble(message, html) {
  const cast = flags(message).magicCast;
  if (!cast || cast.maintenance || ["ritual", "hex"].includes(cast.kind)) return;
  const severity = cast.fumble?.severity ?? 0, row = fumbleRow(severity), elemental = cast.elemental ?? (cast.fumble?.elemental || cast.overload > 0);
  if (!row && !elemental) return;
  const element = cast.element ?? message.speakerActor?.items.get(cast.spellId)?.system.element ?? "mixed";
  const owner = message.speakerActor?.isOwner || game.user.isGM, done = steps(message);
  const applied = [cast.fumbleDamage ? `−${cast.fumbleDamage} ПЗ` : "", cast.overload ? `перегрузка −${cast.overload} ПЗ` : "",
    elemental && ELEMENT_STATUS[element] ? ELEMENT_EFFECT[element] : ""].filter(Boolean);
  const buttons = [];
  if (elemental && element === "air") buttons.push(done.element ? '<span class="is-done"><i class="fa-solid fa-check"></i> Отброшен на 2 м</span>'
    : `<button type="button" data-magic-element="air" ${owner ? "" : "disabled"}><i class="fa-solid fa-wind"></i> Отбросить на 2 м назад</button>`);
  if (elemental && element === "mixed") buttons.push(done.element ? `<span class="is-done"><i class="fa-solid fa-check"></i> Выбрано: ${ELEMENT_NAMES[done.element]} (${ELEMENT_EFFECT[done.element]})</span>`
    : `<span>Смешанная магия — ведущий выбирает эффект:</span>${["earth", "air", "fire", "water"].map(id => `<button type="button" data-magic-element="${id}" ${game.user.isGM ? "" : "disabled"} data-tooltip="${ELEMENT_EFFECT[id]}">${ELEMENT_NAMES[id]}</button>`).join("")}`);
  const focuses = cast.fumble?.explosion && message.speakerActor ? carriedFocuses(message.speakerActor) : [];
  if (cast.fumble?.explosion) buttons.push(done.explosion ? '<span class="is-done"><i class="fa-solid fa-check"></i> Фокус взорвался</span>'
    : focuses.length ? `<button type="button" data-magic-explosion ${owner ? "" : "disabled"}><i class="fa-solid fa-burst"></i> Взрыв фокуса (${esc(focuses.map(item => item.name).join(", "))}): 1d10 в радиусе 2 м</button>`
    : '<span>Фокусирующих предметов при себе нет — взрыва нет.</span>');
  const box = document.createElement("div");
  box.className = "witcher-exchange witcher-magic-fumble";
  box.innerHTML = `<div class="witcher-exchange-fumble"><b>${row ? `Магический провал −${severity}` : "Перегрузка"}</b> · ${esc(row?.text ?? "стихийный эффект перегрузки.")}`
    + (elemental ? `<p>Стихия: <b>${ELEMENT_NAMES[element] ?? element}</b>${ELEMENT_EFFECT[element] ? ` — ${ELEMENT_EFFECT[element]}` : ""}.</p>` : "")
    + (applied.length ? `<p class="is-done"><i class="fa-solid fa-check"></i> Применено: ${esc(applied.join("; "))}.</p>` : "")
    + (buttons.length ? `<div class="witcher-exchange-actions">${buttons.join("")}</div>` : "") + `</div>`;
  const run = work => async event => { event.currentTarget.disabled = true; try { await work(); } catch (error) { ui.notifications.warn(error.message); } };
  box.querySelectorAll("[data-magic-element]").forEach(button => button.addEventListener("click", run(() => applyElement(message, button.dataset.magicElement))));
  box.querySelector("[data-magic-explosion]")?.addEventListener("click", run(() => explodeFocus(message)));
  (html.querySelector(".message-content") ?? html).append(box);
}

export const registerMagicFumble = () => Hooks.on("renderChatMessageHTML", renderMagicFumble);
