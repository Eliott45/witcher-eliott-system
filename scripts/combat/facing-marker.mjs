import { PREVIEW_VISION_ANGLE } from "../config.mjs";

/** Draw in token-local coordinates: zero rotation faces north (screen up). */
export function drawFacingMarker(graphics, width, height, visionAngle = PREVIEW_VISION_ANGLE) {
  const radius = Math.max(width, height) / 2;
  const gap = Math.max(2, radius * 0.05);
  const inner = radius + gap;
  const outer = inner + radius * 0.35;
  const blindZone = [];
  const start = (-90 + visionAngle / 2) * Math.PI / 180;
  const blindArc = (360 - visionAngle) * Math.PI / 180;
  const steps = Math.max(1, Math.ceil(blindArc / (Math.PI / 32)));
  for (let i = 0; i <= steps; i++) {
    const angle = start + blindArc * i / steps;
    blindZone.push(Math.cos(angle) * outer, Math.sin(angle) * outer);
  }
  for (let i = steps; i >= 0; i--) {
    const angle = start + blindArc * i / steps;
    blindZone.push(Math.cos(angle) * inner, Math.sin(angle) * inner);
  }

  graphics.clear();
  graphics.lineStyle(Math.max(1, radius * 0.025), 0x363a38, 0.8);
  graphics.beginFill(0x858b87, 0.35);
  graphics.drawPolygon(blindZone);
  graphics.endFill();

  const tip = -inner - radius * 0.38;
  const shoulder = -inner - radius * 0.12;
  const wing = radius * 0.22;
  const stem = radius * 0.075;
  graphics.lineStyle(Math.max(1.5, radius * 0.035), 0x252825, 1);
  graphics.beginFill(0xc5534c, 1);
  graphics.drawPolygon([
    0, tip, wing, shoulder, stem, shoulder,
    stem, -inner, -stem, -inner, -stem, shoulder, -wing, shoulder
  ]);
  graphics.endFill();
}
