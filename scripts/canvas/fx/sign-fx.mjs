import { SYSTEM_ID } from "../../config.mjs";
import {
  topLayer, groundLayer, particles, glow, tween, loop, rand, ease, gridSize, nudge, thereAndBack, flashTint, afterimage,
  speakerToken, seen, tokenRadius, canPlay, fxEnabled
} from "./fx-core.mjs";
import { ELEMENT_COLORS, ring, dust } from "./combat-fx.mjs";
import { syncAuras, clearAuras, resetAuras } from "./auras.mjs";
import { fireWave, tanioEruption } from "./spell-fx.mjs";

const ADD = () => PIXI.BLEND_MODES.ADD;
const scaleOf = () => gridSize() / 100;
const flagsOf = document => document?.flags?.[SYSTEM_ID] ?? {};
const FIRE = [0xfff6d0, 0xffc04a, 0xff6a1a, 0xb02a10, 0x3a2622];
const AARD = [0xffffff, 0xd6eaff, 0x8fb6e0];
const YRDEN = 0x9a5cff, TRAP = 0xe0304a;

/* -------------------------------------------- */
/*  Shapes                                      */
/* -------------------------------------------- */

/** A random point inside a region shape, and the outward direction from its origin. */
function sampler(shape) {
  const rot = (shape.rotation ?? 0) * Math.PI / 180;
  if (shape.type === "cone") {
    const half = (shape.angle ?? 90) * Math.PI / 360;
    return () => { const a = rot + rand(-half, half), d = Math.sqrt(Math.random()) * shape.radius; return { x: shape.x + Math.cos(a) * d, y: shape.y + Math.sin(a) * d, a }; };
  }
  if (shape.type === "line") return () => {
    const d = Math.random() * shape.length, w = rand(-0.5, 0.5) * shape.width;
    return { x: shape.x + Math.cos(rot) * d - Math.sin(rot) * w, y: shape.y + Math.sin(rot) * d + Math.cos(rot) * w, a: rot };
  };
  if (shape.type === "rectangle") return () => {
    const u = rand(-0.5, 0.5) * shape.width, v = rand(-0.5, 0.5) * shape.height;
    return { x: shape.x + Math.cos(rot) * u - Math.sin(rot) * v, y: shape.y + Math.sin(rot) * u + Math.cos(rot) * v, a: Math.atan2(v, u) + rot };
  };
  const rx = shape.radius ?? shape.radiusX ?? 0, ry = shape.radius ?? shape.radiusY ?? rx;
  return () => { const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()); return { x: shape.x + Math.cos(a) * rx * d, y: shape.y + Math.sin(a) * ry * d, a }; };
}
const shapeRadius = shape => shape.radius ?? shape.radiusX ?? shape.length ?? Math.max(shape.width ?? 0, shape.height ?? 0) / 2;
const regionTokens = (region, exclude = null) => canvas.tokens.placeables.filter(token => {
  if (token === exclude || !token.actor || token.document.hidden) return false;
  try { return token.document.testInsideRegion(region); } catch { return false; }
});

/* -------------------------------------------- */
/*  Aard                                        */
/* -------------------------------------------- */

/** A filled sector (or disc) of light swelling from the origin and fading: the blast itself. */
function blast(x, y, dir, half, radius, color, { duration = 420, alpha = 0.35 } = {}) {
  const g = new PIXI.Graphics();
  g.blendMode = ADD();
  topLayer().addChild(g);
  return tween(duration, (e, t) => {
    if (g.destroyed) return;
    const r = radius * (0.2 + 0.8 * e);
    g.clear().beginFill(color, alpha * (1 - t) ** 1.5);
    if (half >= Math.PI) g.drawCircle(x, y, r); else g.moveTo(x, y).arc(x, y, r, dir - half, dir + half).lineTo(x, y);
    g.endFill();
  }, ease.out).finally(() => g.destroy());
}

/** Wavefronts of a cone (or a full ring when `half` is π) running out from the origin. */
function waves(x, y, dir, half, radius, { colors = AARD, count = 3, every = 110, duration = 560 } = {}) {
  const layer = topLayer(), s = scaleOf();
  for (let i = 0; i < count; i++) setTimeout(() => {
    const g = new PIXI.Graphics();
    g.blendMode = ADD();
    layer.addChild(g);
    tween(duration, (e, t) => {
      if (g.destroyed) return;
      const r = radius * (0.08 + 0.92 * e), fade = 1 - t;
      g.clear();
      g.lineStyle(38 * s * (1 - t * 0.5), colors[2], 0.3 * fade).arc(x, y, r, dir - half, dir + half);
      g.lineStyle(12 * s * (1 - t * 0.5), colors[1], 0.55 * fade).moveTo(x + Math.cos(dir - half) * r, y + Math.sin(dir - half) * r).arc(x, y, r, dir - half, dir + half);
      g.lineStyle(4 * s, colors[0], 0.95 * fade).moveTo(x + Math.cos(dir - half) * r, y + Math.sin(dir - half) * r).arc(x, y, r, dir - half, dir + half);
    }, ease.out).finally(() => g.destroy());
  }, i * every);
}

function aard(shape, region, caster) {
  const s = scaleOf(), radius = shapeRadius(shape), cone = shape.type === "cone";
  const dir = cone ? (shape.rotation ?? 0) * Math.PI / 180 : 0, half = cone ? (shape.angle ?? 90) * Math.PI / 360 : Math.PI;
  glow(topLayer(), shape.x, shape.y, { color: AARD[1], size: gridSize() * 1.2, to: 1.6, duration: 320 });
  blast(shape.x, shape.y, dir, half, radius, AARD[1]);
  waves(shape.x, shape.y, dir, half, radius);
  particles(topLayer(), 80, () => {
    const a = dir + rand(-half, half) * 0.95, v = radius * rand(1.8, 3);
    return { x: shape.x + Math.cos(a) * radius * rand(0, 0.2), y: shape.y + Math.sin(a) * radius * rand(0, 0.2), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: rand(340, 620), size: rand(7, 12) * s, texture: "streak", stretch: 0.005, blend: ADD(), tints: AARD, drag: 2.2, delay: rand(0, 200) };
  });
  const point = sampler(shape);
  particles(topLayer(), 24, () => {
    const p = point(), v = rand(60, 160) * s;
    return { x: p.x, y: p.y, vx: Math.cos(p.a) * v, vy: Math.sin(p.a) * v, life: rand(600, 1000), size: rand(28, 50) * s, grow: 1.2,
      tint: 0xb5a58a, drag: 1.4, delay: rand(60, 260), fadeIn: 0.2, alpha: 0.38 };
  });
  // Aard knocks people back (core p.114): their artwork is thrown away from the origin and recovers.
  for (const token of regionTokens(region, caster)) {
    const c = token.center, d = Math.hypot(c.x - shape.x, c.y - shape.y) || 1, ux = (c.x - shape.x) / d, uy = (c.y - shape.y) / d;
    setTimeout(() => {
      afterimage(token, { tint: 0xdcefff, alpha: 0.35 });
      nudge(token, 640, thereAndBack(ux * gridSize() * 0.45, uy * gridSize() * 0.45, 0.25));
    }, Math.min(400, d / radius * 300));
  }
}

/* -------------------------------------------- */
/*  Igni and Firestream                         */
/* -------------------------------------------- */

function flames(x, y, dir, half, reach, { count = 150, duration = 650, size = 14 } = {}) {
  const s = scaleOf(), layer = topLayer();
  glow(layer, x, y, { color: 0xffa040, size: gridSize() * 1.1, to: 1.5, duration: duration + 200, alpha: 0.8 });
  particles(layer, count, () => {
    const a = dir + rand(-half, half) * 0.85, v = reach / rand(0.3, 0.42);
    return { x: x + rand(-6, 6) * s, y: y + rand(-6, 6) * s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.8, life: rand(520, 760),
      size: rand(0.7, 1.3) * size * s, grow: 2.6, blend: ADD(), tints: FIRE, alpha: 0.85, delay: rand(0, duration), fadeIn: 0.05 };
  });
  particles(layer, Math.round(count / 6), () => {
    const a = dir + rand(-half, half) * 0.8, d = reach * rand(0.4, 1);
    return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * rand(10, 40) * s, vy: Math.sin(a) * rand(10, 40) * s - 20 * s, life: rand(900, 1500),
      size: rand(30, 55) * s, grow: 1.4, alpha: 0.25, tint: 0x3b3430, delay: rand(250, duration + 250), fadeIn: 0.25 };
  });
  return particles(layer, Math.round(count / 4), () => {
    const a = dir + rand(-half, half), v = reach * rand(0.6, 1.4);
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.8, life: rand(800, 1400), size: rand(3, 5) * s, texture: "dot", blend: ADD(),
      tints: [0xffffff, 0xffc04a, 0xff4a10], delay: rand(0, duration) };
  });
}

function igni(shape, region, caster) {
  const radius = shapeRadius(shape), cone = shape.type === "cone";
  const dir = cone ? (shape.rotation ?? 0) * Math.PI / 180 : 0, half = cone ? (shape.angle ?? 90) * Math.PI / 360 : Math.PI;
  flames(shape.x, shape.y, dir, half, radius);
  for (const token of regionTokens(region, caster)) setTimeout(() => flashTint(token, 0xff8a3a, 700), 280);
}

/** Firestream (core p.114): a jet of fire from the caster to one target. */
export function fireStream(caster, target) {
  const c = caster.center, t = target.center, d = Math.hypot(t.x - c.x, t.y - c.y) || 1, dir = Math.atan2(t.y - c.y, t.x - c.x);
  const r = tokenRadius(caster);
  return flames(c.x + Math.cos(dir) * r * 0.7, c.y + Math.sin(dir) * r * 0.7, dir, 0.12, d - r * 0.5, { count: 180, duration: 1000, size: 12 });
}

/* -------------------------------------------- */
/*  Axii and Puppet                             */
/* -------------------------------------------- */

const MIND = { "sign.axii": [0xe8fff8, 0x6fe8c8, 0x1f8a78], "sign.puppet": [0xfbeaff, 0xd08cff, 0x5a2a90] };

/** Two twisting ribbons of light from the caster to the target's head. */
export function mindBeam(caster, target, ruleId) {
  const colors = MIND[ruleId] ?? MIND["sign.axii"], s = scaleOf(), layer = topLayer();
  const a = caster.center, rt = tokenRadius(target), b = { x: target.center.x, y: target.center.y - rt * 0.35 };
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, px = -dy / length, py = dx / length;
  glow(layer, a.x, a.y, { color: colors[1], size: gridSize(), to: 1.4, duration: 500 });
  return tween(650, (e, t) => {
    for (const phase of [0, Math.PI]) {
      const amplitude = 14 * s * Math.sin(Math.PI * e), wave = Math.sin(e * Math.PI * 6 + phase) * amplitude;
      particles(layer, 2, () => ({ x: a.x + dx * e + px * wave, y: a.y + dy * e + py * wave, vx: rand(-12, 12) * s, vy: rand(-12, 12) * s, life: rand(320, 520),
        size: rand(14, 22) * s, blend: ADD(), tints: colors, alpha: 1 }));
    }
  }, ease.inOut);
}

/** Hypnotic rings closing in over the target's head, the target swaying. */
export function mindSwirl(target, ruleId) {
  const colors = MIND[ruleId] ?? MIND["sign.axii"], s = scaleOf(), r = tokenRadius(target), layer = topLayer();
  const g = new PIXI.Graphics();
  g.blendMode = ADD();
  layer.addChild(g);
  nudge(target, 1500, t => ({ x: Math.sin(t * Math.PI * 4) * 5 * s * (1 - t), y: 0 }));
  return tween(1600, (e, t) => {
    if (g.destroyed) return;
    const c = { x: target.center.x, y: target.center.y - r * 0.35 }, fade = t < 0.8 ? 1 : (1 - t) / 0.2;
    g.clear();
    for (let i = 0; i < 3; i++) {
      const k = ((t * 1.6 + i / 3) % 1), radius = r * (1.1 - k * 0.9), spin = t * 8 + i * 2;
      g.lineStyle(4 * s, colors[1], 0.75 * fade * Math.sin(Math.PI * k)).arc(c.x, c.y, radius, spin, spin + Math.PI * 1.3);
    }
  }).finally(() => g.destroy());
}

/* -------------------------------------------- */
/*  Glyphs that last: Yrden, Magic Trap, dimeritium                 */
/* -------------------------------------------- */

function drawGlyph(color, radius, s) {
  const root = new PIXI.Container(), halo = new PIXI.Graphics(), runes = new PIXI.Graphics(), star = new PIXI.Graphics();
  halo.lineStyle(radius * 0.09, color, 0.16).drawCircle(0, 0, radius * 0.95);
  runes.lineStyle(3 * s, color, 0.9).drawCircle(0, 0, radius).drawCircle(0, 0, radius * 0.86);
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, r0 = radius * 0.88, r1 = radius * 0.98, w = 0.06;
    const at = (r, da) => [Math.cos(a + da) * r, Math.sin(a + da) * r];
    runes.lineStyle(2.5 * s, color, 0.85).moveTo(...at(r0, -w)).lineTo(...at(r1, 0)).lineTo(...at(r0, w));
    if (i % 3 === 0) runes.moveTo(...at(r0, 0)).lineTo(...at(r1, 0));
  }
  const tri = r => [0, 1, 2].map(k => [Math.cos(-Math.PI / 2 + k * 2 * Math.PI / 3) * r, Math.sin(-Math.PI / 2 + k * 2 * Math.PI / 3) * r]);
  const outer = tri(radius * 0.8);
  star.lineStyle(3 * s, color, 0.8).moveTo(...outer[0]).lineTo(...outer[1]).lineTo(...outer[2]).closePath();
  for (const [x, y] of outer) star.drawCircle(x, y, radius * 0.07);
  const inner = tri(-radius * 0.38);
  star.moveTo(...inner[0]).lineTo(...inner[1]).lineTo(...inner[2]).closePath();
  root.addChild(halo, runes, star);
  return { root, runes, star };
}

const glyphs = new Map();
function zoneKind(region) {
  const flags = flagsOf(region);
  if (flags.creatureZone?.kind) return flags.creatureZone.kind === "yrden" ? "yrden" : "dimeritium";
  const area = flags.spellArea, item = area ? fromUuidSync(area.actor)?.items?.get(area.spellId) : null;
  return item?.system?.ruleId === "sign.magic-trap" ? "trap" : null;
}
const zoneShown = region => game.user.isGM || region.visibility === CONST.REGION_VISIBILITY.ALWAYS;

export function startGlyph(region, kind, intro) {
  const shape = region.shapes?.[0];
  if (!shape) return;
  const s = scaleOf(), radius = shape.radius ?? shape.radiusX ?? gridSize() * 3, color = kind === "trap" ? TRAP : kind === "yrden" ? YRDEN : 0x9fb8a8;
  const state = { region, kind, alive: true, root: null };
  glyphs.set(region.id, state);
  if (kind === "dimeritium") {
    // A dull haze where magic goes quiet: grey-green motes, no glyph.
    loop(() => {
      if (!state.alive) return false;
      if (Math.random() < 0.25) particles(topLayer(), 1, () => {
        const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * radius;
        return { x: shape.x + Math.cos(a) * d, y: shape.y + Math.sin(a) * d, vx: rand(-8, 8) * s, vy: rand(-14, -4) * s, life: rand(1500, 2600), size: rand(30, 60) * s,
          alpha: 0.18, tint: 0x8fa898, fadeIn: 0.3, grow: 0.6 };
      });
      return true;
    });
    return;
  }
  const { root, runes, star } = drawGlyph(color, radius, s);
  root.position.set(shape.x, shape.y);
  groundLayer(0, 550).addChild(root);
  state.root = root;
  if (intro) {
    ring(shape.x, shape.y, { radius: radius * 1.25, color, width: 10 * s, duration: 700, from: 0.3 });
    glow(topLayer(), shape.x, shape.y, { color, size: radius * 1.4, to: 1.3, duration: 600, alpha: 0.5 });
  }
  let time = intro ? 0 : 1000;
  loop(dt => {
    if (root.destroyed) return false;
    time += dt;
    const k = Math.min(1, time / 700);
    root.scale.set(0.4 + 0.6 * ease.outBack(k));
    runes.rotation += dt / 1000 * 0.12;
    star.rotation -= dt / 1000 * 0.05;
    const pulse = 0.62 + 0.18 * Math.sin(time / 600);
    root.alpha = state.alive ? pulse * Math.min(1, time / 400) : root.alpha - dt / 600;
    if (state.alive && Math.random() < dt / 140) particles(topLayer(), 1, () => {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * radius * 0.9;
      return { x: shape.x + Math.cos(a) * d, y: shape.y + Math.sin(a) * d, vx: 0, vy: rand(-30, -12) * s, life: rand(900, 1500), size: rand(5, 9) * s,
        texture: "dot", blend: ADD(), tint: color, alpha: 0.8 };
    });
    if (!state.alive && root.alpha <= 0) { root.destroy({ children: true }); return false; }
    return true;
  });
}
function stopGlyph(id) {
  const state = glyphs.get(id);
  if (!state) return;
  state.alive = false;
  glyphs.delete(id);
}

/* -------------------------------------------- */
/*  Casting                                     */
/* -------------------------------------------- */

/** A flourish at the caster on every successful cast; a spluttering puff on a failed one. */
export function castFlourish(message) {
  const cast = flagsOf(message).magicCast, caster = speakerToken(message);
  if (!cast || cast.maintenance || !caster || !seen(caster)) return;
  const c = caster.center, r = tokenRadius(caster), s = scaleOf();
  if (cast.fumble?.failed) return dust(c.x, c.y, { count: 10, radius: r * 0.8, color: 0x4a4440, alpha: 0.45 });
  const colors = ELEMENT_COLORS[cast.element] ?? ELEMENT_COLORS.mixed;
  glow(topLayer(), c.x, c.y, { color: colors[1], size: r * 2.4, to: 1.3, duration: 500, alpha: 0.6 });
  ring(c.x, c.y, { radius: r * 1.3, color: colors[1], width: 5 * s, duration: 520, from: 0.6 });
  particles(topLayer(), 22, () => {
    const a = rand(0, Math.PI * 2);
    return { x: c.x + Math.cos(a) * r * 0.9, y: c.y + Math.sin(a) * r * 0.9, vx: rand(-15, 15) * s, vy: rand(-70, -30) * s, life: rand(500, 900),
      size: rand(4, 7) * s, texture: "dot", blend: ADD(), tints: colors, delay: rand(0, 200) };
  });
}

/** A spell area was placed: Aard, Igni and the rest get their wave at the template. */
export function areaPlaced(region) {
  const area = flagsOf(region).spellArea, shape = region.shapes?.[0];
  if (!area || !shape || !zoneShown(region)) return;
  const actor = fromUuidSync(area.actor), item = actor?.items?.get(area.spellId), ruleId = item?.system?.ruleId ?? "";
  const caster = actor?.getActiveTokens?.()[0] ?? null;
  if (ruleId.startsWith("sign.aard")) return aard(shape, region, caster);
  if (ruleId === "sign.igni") return igni(shape, region, caster);
  if (ruleId === "sign.magic-trap") return;
  if (ruleId === "spell.fire-stream") return fireWave(shape, region);
  if (ruleId === "spell.tanio-ilchar") return tanioEruption(shape, region);
  // Any other area magic: a burst in its element over the whole template.
  const colors = ELEMENT_COLORS[item?.system?.element] ?? ELEMENT_COLORS.mixed, point = sampler(shape), s = scaleOf();
  particles(topLayer(), 70, () => {
    const p = point();
    return { x: p.x, y: p.y, vx: Math.cos(p.a) * rand(10, 50) * s, vy: Math.sin(p.a) * rand(10, 50) * s - 20 * s, life: rand(500, 1000), size: rand(14, 30) * s,
      blend: ADD(), tints: colors, alpha: 0.75, delay: rand(0, 400) };
  });
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

let scanTimer = null;
function scan() {
  if (!canvas.ready) return;
  const regions = Array.from(canvas.scene?.regions ?? []);
  const live = new Set();
  for (const region of regions) {
    const kind = zoneKind(region);
    if (!kind || !zoneShown(region)) continue;
    live.add(region.id);
    if (!glyphs.has(region.id) && fxEnabled()) startGlyph(region, kind, false);
  }
  for (const id of [...glyphs.keys()]) if (!live.has(id) || !fxEnabled()) stopGlyph(id);
  if (fxEnabled()) syncAuras(); else clearAuras();
}
function scheduleScan(delay = 60) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => { try { scan(); } catch (error) { console.error(`${SYSTEM_ID} | FX`, error); } }, delay);
}

export function registerSignFx() {
  Hooks.on("canvasReady", () => { glyphs.clear(); resetAuras(); scheduleScan(300); });
  Hooks.on("createRegion", region => {
    if (region.parent?.id !== canvas.scene?.id || !canvas.ready || !fxEnabled()) return;
    // A lasting glyph appears even in a background window; the one-off wave plays only for someone watching.
    const kind = zoneKind(region);
    if (kind && zoneShown(region)) { if (!glyphs.has(region.id)) startGlyph(region, kind, canPlay()); return; }
    if (canPlay()) try { areaPlaced(region); } catch (error) { console.error(`${SYSTEM_ID} | FX`, error); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleScan(); });
  Hooks.on("deleteRegion", region => { stopGlyph(region.id); });
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, () => scheduleScan());
  for (const hook of ["createToken", "deleteToken", "updateActor"]) Hooks.on(hook, () => scheduleScan());
  // A token redrawn by the canvas gets a new placeable: re-bind auras to it.
  Hooks.on("drawToken", () => scheduleScan(120));
  Hooks.on("updateSetting", setting => { if (setting.key === `${SYSTEM_ID}.combatEffects`) scheduleScan(); });
}
