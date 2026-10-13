/** Translate Foundry's south-facing keyboard angles to the system's north-facing tokens. */
export class WitcherTokenLayer extends foundry.canvas.layers.TokenLayer {
  _prepareKeyboardRotationUpdates(objects, dx, dy, dz) {
    const prepared = super._prepareKeyboardRotationUpdates(objects, dx, dy, dz);
    if (!dx && !dy) return prepared;
    const facing = new Set(objects.filter(token => token.hasFacing).map(token => token.id));
    for (const update of prepared[0]) {
      if (facing.has(update._id)) update.rotation = (update.rotation + 180) % 360;
    }
    return prepared;
  }
}
