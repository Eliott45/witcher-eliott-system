import { SYSTEM_ID } from "../config.mjs";
import { effectDurationLabel } from "../data/effect-duration.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";

// Effects of the single controlled token, shown in the free column left of the sidebar.
// Click or the pencil opens the effect; right-click deletes it (owners only).

let panel = null;
const controlledActor = () => {
  const tokens = globalThis.canvas?.tokens?.controlled ?? [];
  return tokens.length === 1 ? tokens[0].actor : null;
};
const visibleEffects = actor => (actor?.effects ?? []).filter(effect => !effect.isSuppressed && (effect.img || effect.statuses.size));

function ensurePanel() {
  if (panel?.isConnected) return panel;
  const column = document.getElementById("ui-right-column-1");
  if (!column) return null;
  panel = document.createElement("section");
  panel.id = "witcher-token-effects";
  panel.setAttribute("aria-label", "Эффекты выделенного токена");
  column.prepend(panel);
  panel.addEventListener("click", event => {
    const row = event.target.closest("[data-effect-id]"), effect = row && controlledActor()?.effects.get(row.dataset.effectId);
    if (effect) effect.sheet.render({ force: true });
  });
  // Right-click removes the effect from the token at once.
  panel.addEventListener("contextmenu", async event => {
    const row = event.target.closest("[data-effect-id]");
    if (!row) return;
    event.preventDefault();
    const effect = controlledActor()?.effects.get(row.dataset.effectId);
    if (!effect?.isOwner) return;
    row.classList.add("is-removing");
    try { await effect.delete(); } catch (error) { row.classList.remove("is-removing"); ui.notifications.error(error.message); }
  });
  return panel;
}

export function renderTokenEffects() {
  const root = ensurePanel();
  if (!root) return;
  const actor = controlledActor(), effects = visibleEffects(actor);
  root.hidden = !effects.length;
  if (!effects.length) { root.replaceChildren(); return; }
  const roundTime = CONFIG.time?.roundTime ?? 3;
  root.innerHTML = `<header>${esc(actor.name)}</header><ol>${effects.map(effect => {
    const timed = effect.duration?.value || Number.isFinite(effect.duration?.remaining) || Number.isFinite(effect.duration?.secondsRemaining);
    const duration = timed ? effectDurationLabel(effect, roundTime) : "";
    const critical = effect.flags?.[SYSTEM_ID]?.criticalWound;
    return `<li data-effect-id="${effect.id}" class="${effect.disabled ? "is-disabled" : ""}${critical ? " is-critical" : ""}" data-tooltip="${esc(`<strong>${esc(effect.name)}</strong>${effect.description ? `<div>${stripPageReferences(effect.description)}</div>` : ""}${effect.isOwner ? "<small>ПКМ — удалить</small>" : ""}`)}" data-tooltip-direction="LEFT">
      <img src="${esc(effect.img || "icons/svg/aura.svg")}" alt=""><span>${esc(effect.name)}${duration ? `<small>${esc(duration)}</small>` : ""}</span>
      ${effect.isOwner ? `<button type="button" class="witcher-token-effects-edit" aria-label="Редактировать: ${esc(effect.name)}"><i class="fa-solid fa-pen"></i></button>` : ""}</li>`;
  }).join("")}</ol>`;
}

export function registerTokenEffectsPanel() {
  const refresh = foundry.utils.debounce(renderTokenEffects, 50);
  Hooks.on("controlToken", refresh);
  Hooks.on("canvasReady", refresh);
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, effect => {
    if (effect.parent === controlledActor()) refresh();
  });
  Hooks.on("updateCombat", refresh); // round changes alter remaining durations
}
