// Core «Разброс» (p.152/163): 1d10 picks where a projectile or a dropped weapon lands around the token,
// 1d6 how many metres it falls short or goes long. Positions are in the token's own frame
// (forward = where it faces, right = its right hand), so the pattern turns with the token.
// [right steps, forward steps] per result, read from the book diagram (token facing the «3»).
export const SCATTER_CELLS = {
  1: [0, 2], 2: [1, 1], 3: [0, 1], 4: [-1, 1], 5: [1, 0],
  6: [-1, 0], 7: [1, -1], 8: [0, -1], 9: [-1, -1], 10: [0, -2]
};

/** Scene offset of a scatter result for a token facing `rotation` (0 = north, clockwise), one step = `step` px. */
export function scatterOffset(result, rotation, step) {
  const [right, forward] = SCATTER_CELLS[result] ?? [0, 0], rad = rotation * Math.PI / 180;
  const fx = Math.sin(rad), fy = -Math.cos(rad), rx = Math.cos(rad), ry = Math.sin(rad);
  return { x: (right * rx + forward * fx) * step, y: (right * ry + forward * fy) * step };
}

/** Draws the ten targets in token-local coordinates (north-facing; the caller rotates the graphics). */
export function drawScatter(graphics, size, highlight = null) {
  graphics.removeChildren().forEach(child => child.destroy());
  graphics.clear();
  const step = size, radius = size * 0.32;
  for (const [result, [right, forward]] of Object.entries(SCATTER_CELLS)) {
    const x = right * step, y = -forward * step, hit = Number(result) === highlight;
    graphics.lineStyle(Math.max(2, size * 0.04), hit ? 0xf3c34a : 0xa3302a, hit ? 1 : 0.85);
    graphics.beginFill(hit ? 0xa3302a : 0xfaf6ee, hit ? 0.85 : 0.35);
    graphics.drawCircle(x, y, radius);
    graphics.endFill();
    graphics.lineStyle(Math.max(1, size * 0.02), hit ? 0xf3c34a : 0xa3302a, 0.7);
    graphics.moveTo(x - radius * 1.25, y).lineTo(x + radius * 1.25, y);
    graphics.moveTo(x, y - radius * 1.25).lineTo(x, y + radius * 1.25);
    const label = new PIXI.Text(result, { fontFamily: "Georgia", fontSize: Math.round(size * 0.3), fontWeight: "bold",
      fill: hit ? 0xffffff : 0x7a2f29, stroke: hit ? 0x3a0f0c : 0xfaf6ee, strokeThickness: Math.max(2, size * 0.05) });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.witcherUpright = true;
    graphics.addChild(label);
  }
}
