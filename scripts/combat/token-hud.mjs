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
  button.dataset.tooltip = "";
  button.innerHTML = '<i class="fa-solid fa-street-view" inert></i>';

  const refresh = () => {
    const active = token.visionPreviewActive;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", game.i18n.localize(
      active ? "WITCHER.Token.RestoreVision" : "WITCHER.Token.PreviewVision"
    ));
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
