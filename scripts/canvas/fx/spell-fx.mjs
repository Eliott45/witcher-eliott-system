import {
  topLayer, particles, glow, tween, loop, rand, ease, gridSize, nudge, flashTint, tokenRadius, texture
} from "./fx-core.mjs";
import { ring, dust, dropDecal, SCORCH_LAYER } from "./combat-fx.mjs";

// Mage magic: each spell looks like what it does. Fire burns and leaves soot, earth bursts and binds, hexes creep.

const ADD = () => PIXI.BLEND_MODES.ADD;
const scaleOf = () => gridSize() / 100;
export const FIRE = [0xfff6d0, 0xffc04a, 0xff6a1a, 0xb02a10, 0x3a2622];
const EMBERS = [0xffffff, 0xffd27a, 0xff6a1a];
const WAVE = [0xffd27a, 0xff8a2a, 0xd8461b, 0x5a2a1a];
const SMOKE = 0x2e2826;
const CURSE = [0x8a5cc0, 0x4a2370, 0x1c0b2a];
const BARK = { dark: 0x24160c, body: 0x5a3a1e, light: 0x8f6a3c, leaf: 0x5a8a34 };

const soot = (x, y, size, elevation = 0) => dropDecal(x, y, size, rand(0, Math.PI * 2), 0x1a1410, { elevation, layer: SCORCH_LAYER, alpha: 0.5, grow: 700 });
const inside = (region, token) => { try { return token.document.testInsideRegion(region); } catch { return false; } };
const regionTokens = region => canvas.tokens.placeables.filter(token => token.actor && !token.document.hidden && inside(region, token));

/* -------------------------------------------- */
/*  Fire                                        */
/* -------------------------------------------- */

/** A ball of fire blowing apart: flash, shock ring, flames, embers raining back, smoke, soot. */
export function explosion(x, y, radius, { elevation = 0, scale = 1 } = {}) {
  const s = scaleOf() * scale, layer = topLayer();
  glow(layer, x, y, { color: 0xffffff, size: radius * 1.4, to: 1.6, duration: 220 });
  glow(layer, x, y, { color: 0xff8a2a, size: radius * 2.6, to: 1.5, duration: 700, alpha: 0.85 });
  ring(x, y, { radius: radius * 1.6, color: 0xffd08a, width: 14 * s, duration: 480, from: 0.15 });
  particles(layer, 60, () => {
    const a = rand(0, Math.PI * 2), v = rand(0.8, 2.2) * radius;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, life: rand(420, 760), size: rand(18, 32) * s, grow: 1.8, blend: ADD(), tints: FIRE, alpha: 0.9, fadeIn: 0.03 };
  });
  particles(layer, 45, () => {
    const a = rand(0, Math.PI * 2), v = rand(1.5, 3.2) * radius;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, gravity: { x: 0, y: 160 * s }, life: rand(800, 1500), size: rand(3, 6) * s,
      texture: "dot", blend: ADD(), tints: EMBERS };
  });
  particles(layer, 16, () => {
    const a = rand(0, Math.PI * 2), d = rand(0, 0.8) * radius;
    return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * rand(15, 50) * s, vy: Math.sin(a) * rand(15, 50) * s - 35 * s, life: rand(1400, 2400),
      size: radius * rand(0.6, 1.1), grow: 1.4, alpha: 0.42, tint: SMOKE, fadeIn: 0.2, delay: rand(150, 450) };
  });
  soot(x, y, radius * 3.2, elevation);
}

/** Aenye (core p.104): a roaring ball of fire with a burning tail. Resolves when it bursts. */
async function fireball({ attacker, target, g, hit, mode, answer }) {
  const s = scaleOf(), layer = topLayer(), r = tokenRadius(target), from = { x: g.a.x + g.ux * tokenRadius(attacker) * 0.8, y: g.a.y + g.uy * tokenRadius(attacker) * 0.8 };
  const stops = hit || ["block", "parry", "resist", "counter"].includes(mode);
  const to = stops ? { x: g.b.x - g.ux * r * 0.5, y: g.b.y - g.uy * r * 0.5 } : { x: g.b.x + g.ux * gridSize() * 1.8, y: g.b.y + g.uy * gridSize() * 1.8 };
  const ball = new PIXI.Container(), halo = new PIXI.Sprite(texture("soft")), core = new PIXI.Sprite(texture("soft"));
  for (const sprite of [halo, core]) { sprite.anchor.set(0.5); sprite.blendMode = ADD(); }
  halo.tint = 0xff7a1a; core.tint = 0xfff2c0;
  ball.addChild(halo, core);
  layer.addChild(ball);
  glow(layer, from.x, from.y, { color: 0xff9a3a, size: gridSize() * 1.3, to: 1.4, duration: 420 });
  const dx = to.x - from.x, dy = to.y - from.y, duration = Math.max(280, Math.min(900, Math.hypot(dx, dy) / (850 * s) * 1000));
  let near = false, time = 0;
  await tween(duration, (e, t) => {
    if (ball.destroyed) return;
    time += canvas.app.ticker.deltaMS;
    const x = from.x + dx * e, y = from.y + dy * e, flicker = 1 + Math.sin(time / 30) * 0.08;
    ball.position.set(x, y);
    halo.scale.set(70 * s / 64 * flicker); core.scale.set(30 * s / 64 * flicker);
    particles(layer, 3, () => ({ x: x + rand(-6, 6) * s, y: y + rand(-6, 6) * s, vx: -g.ux * rand(40, 120) * s + rand(-30, 30) * s, vy: -g.uy * rand(40, 120) * s + rand(-30, 30) * s,
      life: rand(260, 480), size: rand(16, 26) * s, grow: 0.8, blend: ADD(), tints: FIRE, alpha: 0.85 }));
    if (Math.random() < 0.35) particles(layer, 1, () => ({ x, y, vx: -g.ux * 30 * s, vy: -g.uy * 30 * s - 20 * s, life: rand(700, 1100), size: rand(18, 30) * s, grow: 1.5,
      alpha: 0.3, tint: SMOKE, fadeIn: 0.2 }));
    if (!near && t >= 0.55) { near = true; if (!hit && ["dodge", "reposition", "slip"].includes(mode)) answer(); }
  }, ease.inOut);
  ball.destroy({ children: true });
  explosion(to.x, to.y, gridSize() * 0.55, { elevation: target.document.elevation });
  if (hit) { nudge(target, 340, t => ({ x: g.ux * gridSize() * 0.18 * ease.pulse(t), y: g.uy * gridSize() * 0.18 * ease.pulse(t) })); flashTint(target, 0xff7a2a, 600); }
  else if (stops) answer();
}

/** Fire Wave (core p.104): a rolling wall of flame running out across the cone, soot left behind. */
export function fireWave(shape, region) {
  const s = scaleOf(), layer = topLayer(), radius = shape.radius ?? gridSize() * 3;
  const cone = shape.type === "cone", dir = cone ? (shape.rotation ?? 0) * Math.PI / 180 : 0, half = cone ? (shape.angle ?? 90) * Math.PI / 360 : Math.PI;
  glow(layer, shape.x, shape.y, { color: 0xff9a3a, size: gridSize() * 1.4, to: 1.5, duration: 900, alpha: 0.8 });
  const reached = new Set(), targets = regionTokens(region);
  let elapsed = 0;
  const duration = 900;
  loop(dt => {
    elapsed += dt;
    const t = Math.min(1, elapsed / duration), front = radius * ease.out(t) * 1.02;
    const span = Math.max(1, Math.round(9 * (front / radius + 0.25)));
    particles(layer, span, () => {
      const a = dir + rand(-half, half) * 0.95, d = front - rand(0, gridSize() * 0.3);
      return { x: shape.x + Math.cos(a) * d, y: shape.y + Math.sin(a) * d, vx: Math.cos(a) * rand(40, 110) * s, vy: Math.sin(a) * rand(40, 110) * s - rand(20, 60) * s,
        drag: 1.2, life: rand(420, 720), size: rand(14, 24) * s, grow: 1.7, blend: ADD(), tints: WAVE, alpha: 0.55, fadeIn: 0.05 };
    });
    if (Math.random() < 0.6) particles(layer, 1, () => {
      const a = dir + rand(-half, half), d = front * rand(0.4, 0.85);
      return { x: shape.x + Math.cos(a) * d, y: shape.y + Math.sin(a) * d, vx: rand(-10, 10) * s, vy: rand(-50, -20) * s, life: rand(1200, 2000), size: rand(34, 60) * s,
        grow: 1.2, alpha: 0.3, tint: SMOKE, fadeIn: 0.25 };
    });
    for (const token of targets) {
      if (reached.has(token)) continue;
      const d = Math.hypot(token.center.x - shape.x, token.center.y - shape.y);
      if (d <= front) { reached.add(token); flashTint(token, 0xff7a2a, 700); }
    }
    return t < 1;
  });
  for (let i = 0; i < 5; i++) {
    const a = dir + rand(-half, half) * 0.8, d = radius * rand(0.3, 0.9);
    setTimeout(() => soot(shape.x + Math.cos(a) * d, shape.y + Math.sin(a) * d, radius * rand(0.5, 0.9)), rand(300, 800));
  }
}

/** Tanio Ilchar (core p.104): the ground cracks and glows, then a pillar of fire bursts out of the square. */
export async function tanioEruption(shape, region) {
  const s = scaleOf(), layer = topLayer(), rot = (shape.rotation ?? 0) * Math.PI / 180;
  const w = shape.width ?? gridSize() * 2, h = shape.height ?? w, x = shape.x, y = shape.y, half = Math.max(w, h) / 2;
  const point = () => { const u = rand(-0.5, 0.5) * w, v = rand(-0.5, 0.5) * h; return { x: x + Math.cos(rot) * u - Math.sin(rot) * v, y: y + Math.sin(rot) * u + Math.cos(rot) * v }; };
  // Cracks: jagged lines from the centre to the edges.
  const cracks = Array.from({ length: 8 }, (_, i) => {
    const a = i / 8 * Math.PI * 2 + rand(-0.25, 0.25), points = [[x, y]];
    for (let k = 1; k <= 4; k++) { const d = half * k / 4 * rand(0.85, 1.05), j = a + rand(-0.3, 0.3); points.push([x + Math.cos(j) * d, y + Math.sin(j) * d]); }
    return points;
  });
  const g = new PIXI.Graphics();
  g.blendMode = ADD();
  layer.addChild(g);
  const drawCracks = (k, fade) => {
    g.clear();
    for (const points of cracks) {
      const n = Math.max(2, Math.ceil(points.length * k));
      for (const [width, color, alpha] of [[12 * s, 0xff4a10, 0.35], [4 * s, 0xffb040, 0.9], [1.5 * s, 0xfff2c0, 1]]) {
        g.lineStyle(width, color, alpha * fade).moveTo(...points[0]);
        for (let i = 1; i < n; i++) g.lineTo(...points[i]);
      }
    }
  };
  const targets = regionTokens(region);
  for (const token of targets) nudge(token, 500, t => ({ x: Math.sin(t * 70) * 3 * s, y: Math.cos(t * 55) * 2 * s }));
  await tween(480, e => { if (!g.destroyed) drawCracks(e, 0.4 + 0.6 * e); }, ease.in);
  // The burst.
  glow(layer, x, y, { color: 0xffffff, size: half * 2.2, to: 1.4, duration: 260 });
  glow(layer, x, y, { color: 0xff7a1a, size: half * 3.6, to: 1.3, duration: 1100, alpha: 0.8 });
  ring(x, y, { radius: half * 1.8, color: 0xffc070, width: 16 * s, duration: 520, from: 0.2 });
  particles(layer, 110, () => {
    const p = point();
    return { ...p, vx: rand(-40, 40) * s, vy: -rand(220, 520) * s, drag: 1.3, life: rand(600, 1050), size: rand(18, 32) * s, grow: 1.7, blend: ADD(), tints: WAVE,
      alpha: 0.65, delay: rand(0, 320), fadeIn: 0.04 };
  });
  particles(layer, 40, () => {
    const a = rand(0, Math.PI * 2), v = rand(120, 320) * s;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.4, life: rand(400, 700), size: rand(16, 26) * s, grow: 1.6, blend: ADD(), tints: FIRE, alpha: 0.85 };
  });
  particles(layer, 60, () => {
    const p = point();
    return { ...p, vx: rand(-90, 90) * s, vy: -rand(200, 460) * s, gravity: { x: 0, y: 520 * s }, drag: 0.6, life: rand(1000, 1700), size: rand(3, 6) * s,
      texture: "dot", blend: ADD(), tints: EMBERS, delay: rand(0, 300) };
  });
  particles(layer, 20, () => {
    const p = point();
    return { ...p, vx: rand(-20, 20) * s, vy: -rand(40, 90) * s, life: rand(1600, 2600), size: half * rand(0.5, 0.9), grow: 1.5, alpha: 0.38, tint: SMOKE,
      fadeIn: 0.25, delay: rand(250, 700) };
  });
  for (const token of targets) flashTint(token, 0xff7a2a, 800);
  soot(x, y, half * 4.2);
  await tween(1300, e => { if (!g.destroyed) drawCracks(1, 1 - e); });
  g.destroy();
}

/* -------------------------------------------- */
/*  Earth: Talfryn's Prison                     */
/* -------------------------------------------- */

/** Roots curling in from outside a circle of `radius`, grown to `growth` (0..1). */
export function makeRoots(count = 7) {
  return Array.from({ length: count }, (_, i) => ({ angle: i / count * Math.PI * 2 + rand(-0.3, 0.3), turn: (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 1.9),
    seed: rand(0, 10), width: rand(0.85, 1.25), reach: rand(0.4, 0.6), leaves: [rand(0.3, 0.45), rand(0.6, 0.75)] }));
}
export function drawRoots(g, roots, radius, growth, s, sway = 0) {
  g.clear();
  const at = (root, t) => {
    const rho = radius * (1.15 - root.reach * t), phi = root.angle + root.turn * t + Math.sin(t * 6 + root.seed + sway) * 0.1;
    return [Math.cos(phi) * rho, Math.sin(phi) * rho];
  };
  for (const root of roots) {
    const steps = Math.max(2, Math.round(18 * growth));
    for (const [extra, color, alpha] of [[3.2, BARK.dark, 0.95], [0, BARK.body, 1], [-0.55, BARK.light, 0.8]]) {
      for (let i = 0; i < steps - 1; i++) {
        const t0 = i / 17, t1 = (i + 1) / 17, width = Math.max(1, (9 * root.width * (1 - t0 * 0.75) + extra) * s);
        if (extra < 0) g.lineStyle(width * 0.35, color, alpha); else g.lineStyle(width, color, alpha);
        g.moveTo(...at(root, t0)).lineTo(...at(root, t1));
      }
    }
    // Thorns and leaves along the grown part.
    for (const k of root.leaves) {
      if (k > growth * 0.95) continue;
      const [lx, ly] = at(root, k), [nx, ny] = at(root, k + 0.04), a = Math.atan2(ny - ly, nx - lx) + Math.PI / 2;
      g.lineStyle(0).beginFill(BARK.leaf, 0.95).drawEllipse(lx + Math.cos(a) * 5 * s, ly + Math.sin(a) * 5 * s, 6 * s, 3 * s).endFill();
    }
  }
}
/** Roots break through the floor at a point, grasp, and sink back (a missed Talfryn's Prison). */
export function rootsGrasp(x, y, radius, { hold = 500 } = {}) {
  const s = scaleOf(), g = new PIXI.Graphics(), roots = makeRoots(6);
  g.position.set(x, y);
  topLayer().addChild(g);
  dust(x, y, { count: 10, radius: radius * 0.8, color: 0x6a5238, alpha: 0.45 });
  return tween(700 + hold + 600, (e, t) => {
    if (g.destroyed) return;
    const total = 700 + hold + 600, ms = t * total;
    const growth = ms < 700 ? ease.out(ms / 700) : ms < 700 + hold ? 1 : 1 - ease.in((ms - 700 - hold) / 600);
    drawRoots(g, roots, radius, Math.max(0.05, growth), s, ms / 300);
    g.alpha = growth;
  }).finally(() => g.destroy());
}
function earthBurst(x, y, radius) {
  const s = scaleOf();
  ring(x, y, { radius: radius * 1.3, color: 0xb59a6a, width: 10 * s, duration: 420, blend: PIXI.BLEND_MODES.NORMAL, alpha: 0.6 });
  dust(x, y, { count: 14, radius: radius * 0.9, color: 0x7a6040, alpha: 0.5 });
  return particles(topLayer(), 22, () => {
    const a = rand(0, Math.PI * 2), v = rand(90, 260) * s;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3, life: rand(400, 700), size: rand(5, 10) * s, texture: "shard", spin: rand(-12, 12),
      tints: [0x8a6a44, 0x4a3420] };
  });
}

/** A seed of green light that wobbles to the target; the roots of the effect itself grow when it takes hold. */
async function talfrynSeed({ attacker, target, g, hit, mode, answer }) {
  const s = scaleOf(), layer = topLayer(), r = tokenRadius(target);
  const from = { x: g.a.x + g.ux * tokenRadius(attacker) * 0.7, y: g.a.y + g.uy * tokenRadius(attacker) * 0.7 };
  const miss = !hit && ["dodge", "reposition", "slip"].includes(mode);
  const to = miss ? { x: g.b.x + g.uy * r * 0.9 * (Math.random() < 0.5 ? -1 : 1), y: g.b.y - g.ux * r * 0.9 } : { x: g.b.x, y: g.b.y };
  const seed = new PIXI.Sprite(texture("soft"));
  seed.anchor.set(0.5); seed.blendMode = ADD(); seed.tint = 0x9fe070; seed.scale.set(30 * s / 64);
  layer.addChild(seed);
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1, px = -dy / length, py = dx / length;
  let near = false;
  await tween(Math.max(350, Math.min(900, length / (700 * s) * 1000)), (e, t) => {
    if (seed.destroyed) return;
    const wave = Math.sin(e * Math.PI * 3) * 12 * s * (1 - e), x = from.x + dx * e + px * wave, y = from.y + dy * e + py * wave;
    seed.position.set(x, y);
    if (Math.random() < 0.7) particles(layer, 1, () => ({ x, y, vx: rand(-25, 25) * s, vy: rand(-25, 25) * s, life: rand(400, 700), size: rand(5, 9) * s, texture: "shard",
      spin: rand(-8, 8), rotation: rand(0, 6), tints: [0xb8f08a, 0x4f8a2e], alpha: 0.9 }));
    if (!near && t > 0.6) { near = true; if (miss) answer(); }
  }, ease.inOut);
  seed.destroy();
  earthBurst(to.x, to.y, r * 0.8);
  if (miss) return rootsGrasp(to.x, to.y, r * 0.9, { hold: 400 });
  if (hit) { flashTint(target, 0x9a7a4a, 600); nudge(target, 400, t => ({ x: Math.sin(t * 50) * 3 * s * (1 - t), y: 0 })); }
  else answer();
}

/* -------------------------------------------- */
/*  Hexes                                       */
/* -------------------------------------------- */

/** A sigil of the curse: a ring, an inverted triangle and an open eye, drawn in dark violet. */
export function drawSigil(g, radius, s, color = CURSE[0]) {
  g.clear();
  g.lineStyle(3 * s, color, 0.95).drawCircle(0, 0, radius).lineStyle(1.5 * s, color, 0.7).drawCircle(0, 0, radius * 0.86);
  const tri = [0, 1, 2].map(k => [Math.cos(Math.PI / 2 + k * 2 * Math.PI / 3) * radius * 0.84, Math.sin(Math.PI / 2 + k * 2 * Math.PI / 3) * radius * 0.84]);
  g.lineStyle(2.5 * s, color, 0.9).moveTo(...tri[0]).lineTo(...tri[1]).lineTo(...tri[2]).closePath();
  g.lineStyle(2.5 * s, color, 0.95).moveTo(-radius * 0.38, 0).quadraticCurveTo(0, -radius * 0.3, radius * 0.38, 0).quadraticCurveTo(0, radius * 0.3, -radius * 0.38, 0);
  g.lineStyle(0).beginFill(color, 1).drawCircle(0, 0, radius * 0.1).endFill();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.lineStyle(2 * s, color, 0.8).moveTo(Math.cos(a) * radius * 0.88, Math.sin(a) * radius * 0.88).lineTo(Math.cos(a + 0.1) * radius * 0.97, Math.sin(a + 0.1) * radius * 0.97);
  }
}
/** The sigil flares over the victim and sinks into it. */
export function hexSigil(target) {
  const s = scaleOf(), r = tokenRadius(target), g = new PIXI.Graphics(), halo = new PIXI.Graphics();
  halo.blendMode = ADD();
  topLayer().addChild(halo, g);
  drawSigil(g, r * 0.9, s);
  drawSigil(halo, r * 0.9, s * 2.4, 0xb07cff);
  const c = target.center;
  particles(topLayer(), 18, () => {
    const a = rand(0, Math.PI * 2), v = rand(30, 90) * s;
    return { x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(700, 1200), size: r * rand(0.4, 0.7), grow: 1.2, alpha: 0.4, tint: CURSE[2], fadeIn: 0.2 };
  });
  return tween(1500, (e, t) => {
    if (g.destroyed) return;
    const m = target.mesh?.position ?? c, scale = t < 0.3 ? ease.outBack(t / 0.3) : 1 - ease.in((t - 0.3) / 0.7) * 0.6;
    for (const item of [g, halo]) { item.position.set(m.x, m.y - r * 0.15); item.scale.set(scale); item.rotation = t * 1.2; }
    g.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    halo.alpha = g.alpha * 0.35;
  }).finally(() => { g.destroy(); halo.destroy(); });
}
/** A writhing stream of dark smoke and sickly sparks from the caster to the victim. */
async function curseBeam({ attacker, target, hit, answer }) {
  const s = scaleOf(), layer = topLayer(), a = attacker.center, b = target.center;
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, px = -dy / length, py = dx / length;
  await tween(800, (e) => {
    for (const phase of [0, 2.1, 4.2]) {
      const wave = Math.sin(e * Math.PI * 5 + phase) * 16 * s * Math.sin(Math.PI * e);
      particles(layer, 1, () => ({ x: a.x + dx * e + px * wave, y: a.y + dy * e + py * wave, vx: rand(-15, 15) * s, vy: rand(-25, 5) * s, life: rand(450, 800),
        size: rand(16, 26) * s, grow: 0.8, alpha: 0.75, tints: CURSE, fadeIn: 0.1 }));
    }
    if (Math.random() < 0.6) particles(layer, 1, () => ({ x: a.x + dx * e, y: a.y + dy * e, vx: rand(-40, 40) * s, vy: rand(-40, 40) * s, life: rand(300, 500),
      size: rand(3, 5) * s, texture: "dot", blend: ADD(), tints: [0xd8ff9a, 0x7acc3a] }));
  }, ease.inOut);
  if (hit) hexSigil(target); else answer();
}

/* -------------------------------------------- */
/*  Cadfan's Grasp                              */
/* -------------------------------------------- */

/** A shimmering wave of heat to the holder, whose metal glows red and hisses. */
export async function heatRay(caster, target) {
  const s = scaleOf(), layer = topLayer(), r = tokenRadius(target);
  if (caster && caster !== target) {
    const a = caster.center, b = target.center, dx = b.x - a.x, dy = b.y - a.y;
    await tween(520, e => {
      particles(layer, 2, () => ({ x: a.x + dx * e + rand(-6, 6) * s, y: a.y + dy * e + rand(-6, 6) * s, vx: 0, vy: -rand(10, 30) * s, life: rand(300, 500),
        size: rand(12, 20) * s, blend: ADD(), tints: [0xffe0a0, 0xff6a2a, 0x8a1a0a], alpha: 0.75 }));
    }, ease.inOut);
  }
  const c = target.center;
  for (let i = 0; i < 3; i++) setTimeout(() => glow(layer, c.x, c.y, { color: 0xff4a1a, size: r * 2, to: 1.2, duration: 600, alpha: 0.6 }), i * 450);
  flashTint(target, 0xff5a2a, 1600);
  particles(layer, 26, () => ({ x: c.x + rand(-r, r) * 0.5, y: c.y + rand(-r, r) * 0.5, vx: rand(-60, 60) * s, vy: -rand(40, 140) * s, life: rand(400, 900),
    size: rand(3, 5) * s, texture: "dot", blend: ADD(), tints: EMBERS, delay: rand(0, 900) }));
  return particles(layer, 10, () => ({ x: c.x + rand(-r, r) * 0.5, y: c.y + rand(-r, r) * 0.4, vx: rand(-10, 10) * s, vy: -rand(30, 60) * s, life: rand(900, 1500),
    size: r * rand(0.4, 0.7), grow: 1.3, alpha: 0.28, tint: 0xd8d0c8, fadeIn: 0.2, delay: rand(200, 1200) }));
}

/** Spells with a flight of their own, by rule id; hexes share one. */
export const SPELL_SHOTS = { "spell.aenye": fireball, "spell.talfryn-prison": talfrynSeed, hex: curseBeam };
export const spellShot = ruleId => SPELL_SHOTS[ruleId] ?? (String(ruleId).startsWith("hex.") ? SPELL_SHOTS.hex : null);
