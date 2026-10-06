import { SYSTEM_ID } from "../config.mjs";
import { effectDurationLabel } from "../data/effect-duration.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Effects of the single controlled token, shown in the free column left of the sidebar.
// Click or the pencil opens the effect; right-click offers edit/delete to its owners.

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
  panel.addEventListener("contextmenu", event => {
    const row = event.target.closest("[data-effect-id]");
    if (!row) return;
    event.preventDefault();
    openMenu(row, event);
  });
  return panel;
}

function openMenu(row, event) {
  const actor = controlledActor(), effect = actor?.effects.get(row.dataset.effectId);
  if (!effect?.isOwner) return;
  panel.querySelector(".witcher-token-effects-menu")?.remove();
  const menu = document.createElement("menu");
  menu.className = "witcher-token-effects-menu";
  menu.innerHTML = `<li><button type="button" data-menu="edit"><i class="fa-solid fa-pen"></i> Редактировать</button></li>
    <li><button type="button" data-menu="delete"><i class="fa-solid fa-trash"></i> Удалить с токена</button></li>`;
  menu.style.top = `${row.offsetTop + row.offsetHeight}px`;
  panel.append(menu);
  const close = () => { menu.remove(); document.removeEventListener("pointerdown", outside, true); };
  const outside = pointer => { if (!menu.contains(pointer.target)) close(); };
  document.addEventListener("pointerdown", outside, true);
  menu.addEventListener("click", async click => {
    click.stopPropagation();
    const action = click.target.closest("[data-menu]")?.dataset.menu;
    close();
    try {
      if (action === "edit") await effect.sheet.render({ force: true });
      if (action === "delete") await effect.delete();
    } catch (error) { ui.notifications.error(error.message); }
  });
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
    return `<li data-effect-id="${effect.id}" class="${effect.disabled ? "is-disabled" : ""}${critical ? " is-critical" : ""}" data-tooltip="${esc(`<strong>${esc(effect.name)}</strong>${effect.description ? `<div>${effect.description}</div>` : ""}`)}" data-tooltip-direction="LEFT">
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
