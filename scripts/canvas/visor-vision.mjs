/** Item hooks run on every client after preparation, including synthetic token actors. */
export function refreshActorVision(actor) {
  if (actor?.documentName !== "Actor" || !globalThis.canvas?.ready) return;
  for (const token of canvas.tokens.placeables) {
    if (token.actor?.uuid === actor.uuid) token.refreshFacingVision();
  }
}

export function registerVisorVision() {
  for (const event of ["createItem", "updateItem", "deleteItem"]) Hooks.on(event, item => refreshActorVision(item.parent));
  Hooks.on("updateActor", refreshActorVision);
  Hooks.on("updateActorDelta", delta => refreshActorVision(delta.parent.actor));
}
