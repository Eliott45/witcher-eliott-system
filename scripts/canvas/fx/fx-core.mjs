import { SYSTEM_ID } from "../../config.mjs";

// Purely visual canvas effects. Nothing here touches documents: every client animates the same chat events
// locally, and a failed effect never interrupts the rules that triggered it.

const setting = key => { try { return game.settings.get(SYSTEM_ID, key) !== false; } catch { return true; } };
export const fxEnabled = () => setting("combatEffects");
export const goreEnabled = () => setting("combatBlood");
/** Milliseconds a stain stays before it fades; Infinity when the world keeps stains until the broom. */
export function stainLifetime() {
  let minutes = 0;
  try { minutes = Number(game.settings.get(SYSTEM_ID, "bloodLifetime")) || 0; } catch { /* settings not ready: keep */ }
  return minutes > 0 ? minutes * 60000 : Infinity;
}
export const canPlay = () => fxEnabled() && Boolean(globalThis.canvas?.ready) && !document.hidden;
export const gridSize = () => canvas.grid?.size ?? 100;

export const ease = {
  linear: t => t,
  out: t => 1 - (1 - t) ** 3,
  in: t => t ** 3,
  inOut: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  outBack: t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  pulse: t => Math.sin(Math.PI * t)
};
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export const rand = (min, max) => min + Math.random() * (max - min);
export const pick = list => list[Math.floor(Math.random() * list.length)];
export function lerpColor(a, b, t) {
  const ch = (c, s) => (c >> s) & 255, mix = s => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
/** Colour along evenly spaced stops, `k` in 0..1. */
export function gradient(stops, k) {
  if (stops.length === 1) return stops[0];
  const at = Math.min(stops.length - 1.0001, Math.max(0, k) * (stops.length - 1)), i = Math.floor(at);
  return lerpColor(stops[i], stops[i + 1], at - i);
}

/* -------------------------------------------- */
/*  Layers and frame loop                       */
/* -------------------------------------------- */

let stage = null;
const loops = new Set();

/** Effects drawn above tokens and below the scrolling text. */
export function topLayer() {
  if (!stage?.top || stage.top.destroyed) {
    const top = new PIXI.Container();
    top.eventMode = "none";
    top.interactiveChildren = false;
    top.zIndex = (CONFIG.Canvas.groups.interface?.zIndexScrollingText ?? 1000) - 1;
    canvas.interface.addChild(top);
    stage = { ...(stage ?? { grounds: new Map() }), top };
  }
  return stage.top;
}

/** A floor container in the primary group: blood and glyphs lie under tokens (sort layer 550), afterimages just below them (690). */
export function groundLayer(elevation = 0, sortLayer = 550) {
  topLayer();
  const key = `${elevation}:${sortLayer}`;
  let ground = stage.grounds.get(key);
  if (!ground || ground.destroyed) {
    ground = new PIXI.Container();
    ground.eventMode = "none";
    ground.interactiveChildren = false;
    Object.assign(ground, { elevation, sortLayer, sort: 0 });
    canvas.primary.addChild(ground);
    stage.grounds.set(key, ground);
  }
  return ground;
}

/** Call `step(deltaMS)` every frame until it returns false; resolves when done or when the canvas goes away. */
export function loop(step) {
  return new Promise(resolve => {
    const entry = { resolve };
    entry.tick = () => {
      let alive = false;
      try { alive = step(canvas.app.ticker.deltaMS); } catch (error) { console.error(`${SYSTEM_ID} | FX`, error); }
      if (!alive) finish(entry);
    };
    loops.add(entry);
    canvas.app.ticker.add(entry.tick);
  });
}
function finish(entry) {
  if (!loops.delete(entry)) return;
  canvas.app?.ticker?.remove(entry.tick);
  entry.resolve();
}
/** Run `update(easedT, rawT)` over `duration` ms. */
export function tween(duration, update, easing = ease.linear) {
  let elapsed = 0;
  return loop(dt => {
    elapsed += dt;
    const t = Math.min(1, elapsed / duration);
    update(easing(t), t);
    return t < 1;
  });
}

export function teardownStage() {
  for (const entry of [...loops]) finish(entry);
  for (const [token, entries] of nudges) { for (const entry of entries) entry.resolve(); nudges.delete(token); }
  if (stage) {
    for (const ground of stage.grounds.values()) if (!ground.destroyed) ground.destroy({ children: true });
    if (stage.top && !stage.top.destroyed) stage.top.destroy({ children: true });
  }
  stage = null;
}

/* -------------------------------------------- */
/*  Textures                                    */
/* -------------------------------------------- */

const textures = {};
function paint(width, height, draw) {
  const element = document.createElement("canvas");
  element.width = width; element.height = height;
  draw(element.getContext("2d"), width, height);
  return PIXI.Texture.from(element);
}
/**
 * A blood stain painted in greys, to be tinted: a darker dried rim, a lighter wet body with a gloss, lobes, satellite
 * droplets and teardrops thrown along +x. Tinting multiplies, so the greys become depth.
 */
function splat(g, size) {
  const c = size / 2, body = size * rand(0.13, 0.18), blobs = [[c, c, body]];
  for (let i = 0; i < 11; i++) { const a = rand(0, Math.PI * 2), d = body * rand(0.35, 1); blobs.push([c + Math.cos(a) * d, c + Math.sin(a) * d, body * rand(0.3, 0.65)]); }
  const drops = [];
  for (let i = 0; i < 22; i++) {
    const a = rand(-0.7, 0.7) + (Math.random() < 0.2 ? Math.PI + rand(-0.6, 0.6) : 0), d = body * rand(1.25, 3.1);
    drops.push([c + Math.cos(a) * d, c + Math.sin(a) * d, size * rand(0.004, 0.02), a]);
  }
  const fill = (shade, shrink = 1, blur = 0) => {
    g.filter = blur ? `blur(${blur}px)` : "none";
    g.fillStyle = shade;
    for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y, r * shrink, 0, Math.PI * 2); g.fill(); }
  };
  fill("#7a7a7a");
  fill("#bdbdbd", 0.86, size * 0.012);
  g.filter = "none";
  // Teardrops: a round head with a tail pointing back to the wound.
  for (const [x, y, r, a] of drops) {
    g.fillStyle = "#8c8c8c";
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (r > size * 0.008) {
      g.beginPath(); g.moveTo(x + Math.cos(a + Math.PI / 2) * r, y + Math.sin(a + Math.PI / 2) * r);
      g.lineTo(x - Math.cos(a) * r * rand(3, 6), y - Math.sin(a) * r * rand(3, 6));
      g.lineTo(x + Math.cos(a - Math.PI / 2) * r, y + Math.sin(a - Math.PI / 2) * r); g.closePath(); g.fill();
    }
  }
  // Wet gloss on the thickest part.
  g.filter = `blur(${size * 0.01}px)`;
  g.fillStyle = "rgba(255,255,255,.55)";
  g.beginPath(); g.ellipse(c - body * 0.3, c - body * 0.35, body * 0.32, body * 0.14, -0.5, 0, Math.PI * 2); g.fill();
  g.filter = "none";
}
/** One drop of liquid: crisp edge, darker rim, a pin of light. */
function drop(g, s) {
  const r = g.createRadialGradient(s * 0.42, s * 0.4, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "#ffffff"); r.addColorStop(0.18, "#d8d8d8"); r.addColorStop(0.8, "#9a9a9a"); r.addColorStop(1, "#6e6e6e");
  g.fillStyle = r; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); g.fill();
}
export const SPLATS = 6;
const TEXTURES = {
  soft: () => paint(64, 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  dot: () => paint(32, 32, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  streak: () => paint(64, 8, (g, w, h) => {
    const r = g.createLinearGradient(0, 0, w, 0);
    r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(0.75, "rgba(255,255,255,.95)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2 - 1, 0, 0, Math.PI * 2); g.fill();
  }),
  shard: () => paint(16, 16, g => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(8, 0); g.lineTo(13, 8); g.lineTo(8, 16); g.lineTo(4, 8); g.closePath(); g.fill(); }),
  drop: () => paint(32, 32, drop),
  ...Object.fromEntries(Array.from({ length: SPLATS }, (_, i) => [`splat${i}`, () => paint(256, 256, splat)]))
};
export const texture = name => textures[name] ??= TEXTURES[name]();

/* -------------------------------------------- */
/*  Particles                                   */
/* -------------------------------------------- */

/**
 * Spawn `count` sprites described by `make(i)` and simulate them until each one's life ends.
 * A particle: {x, y, vx, vy (px/s), life (ms), delay, size (px), grow, alpha, fadeIn (0..1 of life), tints [], blend,
 * drag (per second), gravity {x, y} (px/s²), stretch (length per px/s), spin, rotation, texture}.
 */
export function particles(container, count, make, defaults = {}) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const p = { texture: "soft", alpha: 1, fadeIn: 0.08, drag: 0, grow: 0, spin: 0, rotation: 0, ...defaults, ...make(i) };
    const sprite = new PIXI.Sprite(texture(p.texture));
    sprite.anchor.set(0.5);
    sprite.blendMode = p.blend ?? PIXI.BLEND_MODES.NORMAL;
    sprite.visible = false;
    container.addChild(sprite);
    list.push({ ...p, sprite, age: -(p.delay ?? 0) });
  }
  return loop(dt => {
    let alive = 0;
    const seconds = dt / 1000;
    for (const p of list) {
      if (p.done) continue;
      p.age += dt;
      if (p.age < 0) { alive++; continue; }
      const k = p.age / p.life;
      if (k >= 1 || p.sprite.destroyed) { p.done = true; if (!p.sprite.destroyed) p.sprite.destroy(); continue; }
      alive++;
      const damp = Math.max(0, 1 - p.drag * seconds);
      p.vx = p.vx * damp + (p.gravity?.x ?? 0) * seconds;
      p.vy = p.vy * damp + (p.gravity?.y ?? 0) * seconds;
      p.x += p.vx * seconds; p.y += p.vy * seconds;
      const s = p.sprite, size = p.size * (1 + p.grow * k), base = s.texture.width;
      s.visible = true;
      s.position.set(p.x, p.y);
      if (p.stretch) {
        const speed = Math.hypot(p.vx, p.vy);
        s.rotation = Math.atan2(p.vy, p.vx);
        s.scale.set(Math.max(size, size * speed * p.stretch) / base, size / s.texture.height * 0.6);
      } else {
        p.rotation += p.spin * seconds;
        s.rotation = p.rotation;
        s.scale.set(size / base);
      }
      s.alpha = p.alpha * Math.min(1, k / Math.max(0.001, p.fadeIn)) * (1 - k) ** (p.fadePower ?? 1);
      if (p.tints) s.tint = gradient(p.tints, k);
      else if (p.tint !== undefined) s.tint = p.tint;
    }
    return alive > 0;
  });
}

/** A soft glow that swells and fades. */
export function glow(container, x, y, { color = 0xffffff, size = 100, to = 1.6, duration = 300, alpha = 0.9, blend = PIXI.BLEND_MODES.ADD } = {}) {
  const sprite = new PIXI.Sprite(texture("soft"));
  sprite.anchor.set(0.5); sprite.position.set(x, y); sprite.tint = color; sprite.blendMode = blend;
  container.addChild(sprite);
  return tween(duration, (e, t) => {
    if (sprite.destroyed) return;
    sprite.scale.set(size * (1 + (to - 1) * e) / 64);
    sprite.alpha = alpha * (1 - t) ** 1.5;
  }, ease.out).finally(() => sprite.destroy());
}

/* -------------------------------------------- */
/*  Token artwork motion                        */
/* -------------------------------------------- */

const nudges = new Map();
let nudgeTick = null;

/**
 * Offset a token's artwork (not the document) along `path(t) → {x, y}` for `duration` ms. Offsets of overlapping
 * nudges add up; the artwork snaps back to the document position afterwards. A token in mid-move is left alone.
 */
export function nudge(token, duration, path) {
  if (!token?.mesh || token.destroyed) return Promise.resolve();
  return new Promise(resolve => {
    const entries = nudges.get(token) ?? new Set();
    entries.add({ elapsed: 0, duration, path, resolve });
    nudges.set(token, entries);
    if (!nudgeTick) { nudgeTick = stepNudges; canvas.app.ticker.add(nudgeTick); }
  });
}
function stepNudges() {
  const dt = canvas.app.ticker.deltaMS;
  for (const [token, entries] of nudges) {
    if (token.destroyed || !token.mesh || token.mesh.destroyed) { for (const entry of entries) entry.resolve(); nudges.delete(token); continue; }
    let x = 0, y = 0;
    for (const entry of entries) {
      entry.elapsed += dt;
      const t = Math.min(1, entry.elapsed / entry.duration), offset = entry.path(t);
      x += offset.x; y += offset.y;
      if (t >= 1) { entries.delete(entry); entry.resolve(); }
    }
    const moving = token.animationContexts?.size > 0;
    if (!moving) { const center = token.center; token.mesh.position.set(center.x + x, center.y + y); }
    if (!entries.size) { nudges.delete(token); token.renderFlags.set({ refreshPosition: true }); }
  }
  if (!nudges.size) { canvas.app.ticker.remove(nudgeTick); nudgeTick = null; }
}

/** Stop every artwork motion and put each token back exactly where its document says, with its own tint. */
export function settleTokens() {
  for (const [token, entries] of nudges) { for (const entry of entries) entry.resolve(); nudges.delete(token); }
  if (!globalThis.canvas?.ready) return;
  for (const ground of stage?.grounds?.values() ?? []) if (ground.sortLayer === 690 && !ground.destroyed) ground.removeChildren().forEach(child => child.destroy());
  for (const token of canvas.tokens.placeables) token.renderFlags.set({ refreshPosition: true, refreshMesh: true });
}

/** Out along a vector and back: `out` share of the time going, the rest returning. */
export const thereAndBack = (dx, dy, out = 0.35) => t => {
  const k = t < out ? ease.out(t / out) : 1 - ease.inOut((t - out) / (1 - out));
  return { x: dx * k, y: dy * k };
};

/** Tint the artwork with `color` and let it fade back to normal. */
export function flashTint(token, color, duration = 380) {
  if (!token?.mesh) return Promise.resolve();
  return tween(duration, (e, t) => { if (!token.destroyed && token.mesh) token.mesh.tint = lerpColor(color, 0xffffff, ease.in(t)); })
    .finally(() => { if (!token.destroyed) token.renderFlags.set({ refreshMesh: true }); });
}

/** Fade the artwork to `alpha` and back (a spirit slipping out of reach). */
export function fadeArtwork(token, alpha, duration = 700) {
  if (!token?.mesh) return Promise.resolve();
  const base = token.mesh.alpha;
  return tween(duration, (e, t) => { if (!token.destroyed && token.mesh) token.mesh.alpha = base + (alpha - base) * ease.pulse(t); })
    .finally(() => { if (!token.destroyed) token.renderFlags.set({ refreshMesh: true }); });
}

/** A fading copy of the artwork where it stands now: afterimages of a dodge. */
export function afterimage(token, { tint = 0x9fc6ff, alpha = 0.45, duration = 380 } = {}) {
  const mesh = token?.mesh;
  if (!mesh?.texture || mesh.destroyed) return Promise.resolve();
  const sprite = new PIXI.Sprite(mesh.texture);
  sprite.anchor.copyFrom(mesh.anchor); sprite.scale.copyFrom(mesh.scale); sprite.rotation = mesh.rotation;
  sprite.position.copyFrom(mesh.position); sprite.tint = tint; sprite.alpha = alpha;
  groundLayer(token.document.elevation, 690).addChild(sprite);
  return tween(duration, e => { if (!sprite.destroyed) sprite.alpha = alpha * (1 - e); }, ease.out).finally(() => sprite.destroy());
}

/* -------------------------------------------- */
/*  Tokens and chat                             */
/* -------------------------------------------- */

/** The placeable of a token UUID when it is drawn on the viewed scene. */
export function placedToken(uuid) {
  if (!uuid) return null;
  const doc = fromUuidSync(uuid);
  return doc?.parent?.id === canvas.scene?.id ? doc.object ?? null : null;
}
export function speakerToken(message) {
  const { scene, token, actor } = message?.speaker ?? {};
  if (token && scene === canvas.scene?.id) return canvas.tokens.get(token) ?? null;
  return game.actors.get(actor)?.getActiveTokens?.()[0] ?? null;
}
export const seen = token => Boolean(token && !token.destroyed && (token.visible || game.user.isGM));
export const tokenRadius = token => Math.max(token.w, token.h) / 2;
export function geometry(from, to) {
  const a = from.center, b = to.center, dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
  return { a, b, dist, ux: dx / dist, uy: dy / dist, angle: Math.atan2(dy, dx) };
}

/** Resolve once Dice So Nice has finished this message's dice (or right away without them). */
export async function diceLanded(message) {
  if (!game.dice3d || !message?.rolls?.length) return;
  await wait(40);
  if (!message._dice3danimating) return;
  await new Promise(resolve => {
    const done = () => { Hooks.off("diceSoNiceRollComplete", hook); clearTimeout(timer); resolve(); };
    const hook = Hooks.on("diceSoNiceRollComplete", (id, companions = []) => { if ([id, ...companions].includes(message.id)) done(); });
    const timer = setTimeout(done, 12000);
  });
}
