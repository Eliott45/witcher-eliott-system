/** Add a client-only sight preview to the token's right-click controls. */
export function renderTokenVisionToggle(hud, element) {
  const token = hud.object;
  if (!token?.hasFacing || !token.isOwner) return;
  const column = element.querySelector(".col.right");
  if (!column) return;
  element.querySelector(".witcher-vision-toggle")?.remove();

  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon witcher-vision-toggle";
  button.innerHTML = '<i class="fa-solid fa-street-view" inert></i>';

  const refresh = () => {
    const active = token.visionPreviewActive;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    const label = active ? game.i18n.localize("WITCHER.Token.RestoreVision")
      : game.i18n.format("WITCHER.Token.PreviewVision", { angle: token.facingVisionAngle });
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    button.disabled = !token.hasSight || !canvas.visibility.tokenVision;
  };
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    token.toggleVisionPreview();
    refresh();
  });
  refresh();
  column.append(button);
}

/** Toggle the scatter diagram (core «Разброс») around a token; client-only. */
export function renderScatterToggle(hud, element) {
  const token = hud.object;
  if (!token?.hasFacing || typeof token.toggleScatter !== "function") return;
  const column = element.querySelector(".col.right");
  if (!column) return;
  element.querySelector(".witcher-scatter-toggle")?.remove();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon witcher-scatter-toggle";
  button.innerHTML = '<i class="fa-solid fa-bullseye" inert></i>';
  const refresh = () => {
    const active = token.constructor.scatterTokens?.has(token.id);
    button.classList.toggle("active", Boolean(active));
    button.setAttribute("aria-pressed", String(Boolean(active)));
    button.dataset.tooltip = active ? "Скрыть разброс" : "Показать разброс: куда полетит снаряд (1d10) — поворачивается с токеном";
    button.setAttribute("aria-label", button.dataset.tooltip);
  };
  button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); token.toggleScatter(); refresh(); });
  refresh();
  column.append(button);
}
