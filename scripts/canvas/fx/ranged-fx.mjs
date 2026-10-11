import {
  topLayer, groundLayer, particles, glow, tween, loop, wait, rand, ease, gridSize, nudge, thereAndBack, tokenRadius, stainLifetime, texture
} from "./fx-core.mjs";
import { ring, sparks, dust, dropDecal, SCORCH_LAYER, STAIN_LAYER } from "./combat-fx.mjs";

// Bows, crossbows, thrown weapons and bombs. Everything here is drawn locally from chat events, like the rest of the FX.

const ADD = () => PIXI.BLEND_MODES.ADD;
const scaleOf = () => gridSize() / 100;
const TAU = Math.PI * 2;

/* -------------------------------------------- */
/*  Ammunition and weapon looks                 */
/* -------------------------------------------- */

/** How each arrow or bolt looks and what it leaves behind. */
const AMMO = {
  "ammunition.standard": { fletch: 0xe8e0d0, head: "leaf", trail: [0xfff4d6, 0xc9a66b] },
  "ammunition.blunt": { fletch: 0xd8c8a8, head: "blunt", trail: [0xfff4d6, 0xc9a66b], thud: true },
  "ammunition.broadhead": { fletch: 0xb8392f, head: "broad", trail: [0xffd8d0, 0xb8392f] },
  "ammunition.armor-piercing": { fletch: 0x7f8794, head: "bodkin", trail: [0xffffff, 0xaab4c4], sparks: true },
  "ammunition.elven-burrowing": { fletch: 0x9fd88a, head: "leaf", trail: [0xeaffd8, 0x6fc070], twist: true },
  "ammunition.dwarven-impact": { fletch: 0x5a4632, head: "bodkin", trail: [0xffe2b0, 0x8a6a40], shock: true },
  "ammunition.explosive": { fletch: 0x2a2420, head: "bulb", trail: [0xfff0b0, 0xff7a1a, 0x5a2a10], fuse: true },
  "ammunition.split": { fletch: 0xd8b070, head: "leaf", trail: [0xfff4d6, 0xe0b050], split: true },
  "ammunition.tracking": { fletch: 0x8a6ad0, head: "leaf", trail: [0xe8dcff, 0x8a6ad0], scent: true }
};
/** Relic bows colour their arrows. */
const WEAPON_AURA = { "weapon.moon-bow": { trail: [0xf0fcff, 0x8fe3f2, 0x3c9fb5], frost: true }, "weapon.red-death": { trail: [0xeaffd0, 0x8ad040, 0x2a5a10], venom: true } };

export function projectileLook({ kind, ammo = "", weapon = "" }) {
  const base = AMMO[ammo] ?? AMMO["ammunition.standard"], aura = WEAPON_AURA[weapon] ?? {};
  return { kind, ...base, ...aura, trail: aura.trail ?? base.trail, bolt: kind === "bolt" };
}

/** A thrown weapon's silhouette from its identity: knife, axe, star (orion), spear, or a tumbling blade. */
export function thrownShape(item = {}) {
  const id = String(item.system?.ruleId ?? ""), name = String(item.name ?? "").toLocaleLowerCase("ru");
  if (/orion|орион/u.test(id + name)) return "star";
  if (/axe|топор/u.test(id + name)) return "axe";
  if (/spear|javelin|копь|дротик/u.test(id + name) || item.system?.skill === "staffSpear") return "spear";
  return "knife";
}

function arrowBody(look) {
  const s = scaleOf(), g = new PIXI.Graphics(), length = (look.bolt ? 38 : 58) * s, shaft = (look.bolt ? 3.8 : 2.8) * s;
  g.lineStyle(shaft, look.bolt ? 0x4a3828 : 0x7a5434).moveTo(-length, 0).lineTo(0, 0);
  g.lineStyle(0);
  // Fletching: two vanes at the nock.
  g.beginFill(look.fletch).drawPolygon([-length, 0, -length + 11 * s, -5.5 * s, -length + 14 * s, 0, -length + 11 * s, 5.5 * s]).endFill();
  const steel = 0xc9ccd2;
  if (look.head === "broad") g.beginFill(steel).drawPolygon([-2 * s, -6 * s, 11 * s, 0, -2 * s, 6 * s, 1 * s, 0]).endFill();
  else if (look.head === "bodkin") g.beginFill(0x9aa2ae).drawPolygon([0, -2.5 * s, 14 * s, 0, 0, 2.5 * s]).endFill();
  else if (look.head === "blunt") g.beginFill(0x8a6a4a).drawCircle(2 * s, 0, 3.6 * s).endFill();
  else if (look.head === "bulb") { g.beginFill(0x7a2a18).drawCircle(3 * s, 0, 4.5 * s).endFill(); g.beginFill(0xffb04a).drawCircle(4 * s, -1.5 * s, 1.4 * s).endFill(); }
  else g.beginFill(steel).drawPolygon([0, -4 * s, 10 * s, 0, 0, 4 * s]).endFill();
  if (look.split) for (const side of [-1, 1]) g.beginFill(steel).drawPolygon([-4 * s, side * 3 * s, 4 * s, side * 6 * s, -4 * s, side * 7 * s]).endFill();
  return g;
}

function thrownBody(shape) {
  const s = scaleOf(), g = new PIXI.Graphics();
  if (shape === "axe") {
    g.lineStyle(3 * s, 0x6b4a2c).moveTo(-14 * s, 0).lineTo(10 * s, 0).lineStyle(0);
    g.beginFill(0xc9ccd2).moveTo(4 * s, -2 * s).bezierCurveTo(10 * s, -12 * s, 18 * s, -10 * s, 18 * s, -2 * s).lineTo(18 * s, 6 * s).bezierCurveTo(14 * s, 4 * s, 8 * s, 6 * s, 4 * s, 3 * s).closePath().endFill();
  } else if (shape === "star") {
    g.beginFill(0xdfe4ec);
    const points = [];
    for (let i = 0; i < 8; i++) { const r = (i % 2 ? 4 : 12) * s, a = i / 8 * TAU; points.push(Math.cos(a) * r, Math.sin(a) * r); }
    g.drawPolygon(points).endFill().beginFill(0x3a3f48).drawCircle(0, 0, 2.2 * s).endFill();
  } else if (shape === "spear") {
    g.lineStyle(3 * s, 0x7a5434).moveTo(-46 * s, 0).lineTo(0, 0).lineStyle(0);
    g.beginFill(0xc9ccd2).drawPolygon([0, -4 * s, 14 * s, 0, 0, 4 * s]).endFill();
  } else {
    g.beginFill(0xd8dce4).drawPolygon([0, -3 * s, 17 * s, 0, 0, 3 * s, -2 * s, 0]).endFill();
    g.beginFill(0x4a3426).drawRect(-10 * s, -2.2 * s, 9 * s, 4.4 * s).endFill();
  }
  return g;
}

function flaskBody(color = 0xb0c870) {
  const s = scaleOf(), g = new PIXI.Graphics();
  g.beginFill(0x2a2018).drawRect(-2.5 * s, -14 * s, 5 * s, 6 * s).endFill();
  g.beginFill(color, 0.9).drawCircle(0, 0, 9 * s).endFill();
  g.beginFill(0xffffff, 0.35).drawEllipse(-3 * s, -3 * s, 3 * s, 2 * s).endFill();
  g.lineStyle(1.2 * s, 0x1a1410, 0.8).drawCircle(0, 0, 9 * s);
  return g;
}

/* -------------------------------------------- */
/*  Flight along an arc                         */
/* -------------------------------------------- */

/** Quadratic arc from `a` to `b`, bulging up the screen by `height` px. */
function arcPath(a, b, height) {
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - height * 2 };
  const at = t => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  const slope = t => Math.atan2(2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y), 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x));
  return { at, slope };
}

/** A soft shadow on the ground under a flying object: the eye reads the arc as height. */
function shadowFollower(a, b) {
  const s = scaleOf(), sprite = new PIXI.Sprite(texture("soft"));
  sprite.anchor.set(0.5); sprite.tint = 0x000000; sprite.alpha = 0; sprite.scale.set(22 * s / 64, 9 * s / 64);
  groundLayer(0, 700).addChild(sprite);
  return { update: (t, lift) => { if (sprite.destroyed) return; sprite.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); sprite.alpha = 0.35 * (1 - lift * 0.7); },
    destroy: () => { if (!sprite.destroyed) sprite.destroy(); } };
}

/**
 * Fly `body` from `a` to `b` on an arc. `spin` turns the body (rad/s) instead of following the path;
 * `trail` sheds tinted streaks; `onNear` fires at 55% so a dodge starts before the shot arrives.
 */
async function flight(body, a, b, { height = 0, duration = 400, spin = 0, trail = null, fuse = false, onNear = null, shadow = true } = {}) {
  const layer = topLayer(), s = scaleOf(), path = arcPath(a, b, height), ground = shadow && height > 0 ? shadowFollower(a, b) : null;
  layer.addChild(body);
  let near = false, sinceTrail = 0, last = { ...a };
  await tween(duration, (e, t) => {
    if (body.destroyed) return;
    const p = path.at(e);
    body.position.set(p.x, p.y);
    body.rotation = spin ? body.rotation + spin * canvas.app.ticker.deltaMS / 1000 : path.slope(e);
    ground?.update(e, Math.sin(Math.PI * e));
    sinceTrail += canvas.app.ticker.deltaMS;
    if (trail && sinceTrail > 18) {
      sinceTrail = 0;
      const dx = p.x - last.x, dy = p.y - last.y;
      particles(layer, fuse ? 3 : 1, () => ({ x: p.x, y: p.y, vx: -dx * rand(2, 6) + rand(-20, 20) * s, vy: -dy * rand(2, 6) + rand(-20, 20) * s, life: rand(160, 320),
        size: (fuse ? rand(3, 5) : rand(4, 7)) * s, texture: fuse ? "dot" : "streak", stretch: fuse ? 0 : 0.01, blend: ADD(), tints: trail, alpha: 0.75, drag: 2 }));
    }
    last = p;
    if (!near && t >= 0.55) { near = true; onNear?.(); }
  }, height ? ease.linear : ease.out);
  if (!near) onNear?.();
  ground?.destroy();
  return path;
}

/* -------------------------------------------- */
/*  Arrows stuck in tokens and in the ground    */
/* -------------------------------------------- */

const pinned = new Map();
let pinLoop = false;
const PINS_PER_TOKEN = 6;
/** An arrow left in a token: it rides along with the artwork until the broom or the stain lifetime. */
function pinToToken(token, body, angle) {
  const key = token.document.uuid, entry = pinned.get(key) ?? { token, pins: [] }, r = tokenRadius(token);
  entry.token = token;
  const reach = r * rand(0.15, 0.45), side = rand(-0.6, 0.6);
  body.position.set(0, 0);
  topLayer().addChild(body);
  entry.pins.push({ body, dx: -Math.cos(angle + side) * reach, dy: -Math.sin(angle + side) * reach, rotation: angle + rand(-0.25, 0.25), life: stainLifetime(), age: 0 });
  while (entry.pins.length > PINS_PER_TOKEN) entry.pins.shift().body.destroy();
  pinned.set(key, entry);
  if (pinLoop) return;
  pinLoop = true;
  loop(dt => {
    for (const [id, item] of pinned) {
      if (item.token.destroyed) { const fresh = fromUuidSync(id)?.object; if (fresh && !fresh.destroyed) item.token = fresh; }
      const mesh = item.token.mesh, alive = !item.token.destroyed && mesh && !mesh.destroyed;
      for (const pin of item.pins) {
        pin.age += dt;
        if (!alive || pin.body.destroyed || pin.age > pin.life + 1500) { pin.done = true; if (!pin.body.destroyed) pin.body.destroy(); continue; }
        pin.body.visible = item.token.visible !== false;
        // Only the rear part shows: the head is in the target.
        pin.body.position.set(mesh.position.x + pin.dx, mesh.position.y + pin.dy);
        pin.body.rotation = pin.rotation;
        pin.body.alpha = pin.age > pin.life ? 1 - (pin.age - pin.life) / 1500 : 1;
      }
      item.pins = item.pins.filter(pin => !pin.done);
      if (!item.pins.length) pinned.delete(id);
    }
    return pinned.size > 0;
  }).finally(() => { pinLoop = false; });
}
const groundPins = [];
/** A missed arrow stays in the ground, slanted, and fades with the stains. */
function pinToGround(body, point, angle) {
  body.position.set(point.x, point.y);
  body.rotation = angle;
  body.scale.set(1, 0.6);
  groundLayer(0, 545).addChild(body);
  groundPins.push(body);
  while (groundPins.length > 40) { const old = groundPins.shift(); if (!old.destroyed) old.destroy(); }
  const life = stainLifetime();
  if (Number.isFinite(life)) setTimeout(() => tween(1500, e => { if (!body.destroyed) body.alpha = 1 - e; }).finally(() => { if (!body.destroyed) body.destroy(); }), life);
}
/** The broom: every stuck arrow goes. */
export function clearPins() {
  for (const item of pinned.values()) for (const pin of item.pins) if (!pin.body.destroyed) pin.body.destroy();
  pinned.clear();
  for (const body of groundPins.splice(0)) if (!body.destroyed) body.destroy();
}

/* -------------------------------------------- */
/*  Bows and crossbows                          */
/* -------------------------------------------- */

/** The bow drawn in front of the archer: the string pulls back, holds a breath, snaps forward. */
async function drawBow(attacker, angle, { crossbow = false, long = false } = {}) {
  const s = scaleOf(), r = tokenRadius(attacker), c = attacker.center, g = new PIXI.Graphics();
  const reach = r * 0.85, span = (crossbow ? 15 : long ? 30 : 23) * s, bend = (crossbow ? 4 : 8) * s;
  g.position.set(c.x + Math.cos(angle) * reach, c.y + Math.sin(angle) * reach);
  g.rotation = angle;
  topLayer().addChild(g);
  const draw = pull => {
    g.clear();
    if (crossbow) g.lineStyle(5 * s, 0x4a3426).moveTo(-20 * s, 0).lineTo(4 * s, 0);
    // The stave: a curve whose tips come back as the string pulls.
    g.lineStyle((crossbow ? 3.5 : 3) * s, crossbow ? 0x5a5f68 : 0x6b4a2c).moveTo(-bend * pull * 0.5, -span).quadraticCurveTo(bend + 4 * s, 0, -bend * pull * 0.5, span);
    g.lineStyle(1.1 * s, 0xf2ead8, 0.9).moveTo(-bend * pull * 0.5, -span).lineTo(-bend - pull * (crossbow ? 6 : 18) * s, 0).lineTo(-bend * pull * 0.5, span);
  };
  draw(0);
  if (!crossbow) nudge(attacker, 520, thereAndBack(-Math.cos(angle) * gridSize() * 0.05, -Math.sin(angle) * gridSize() * 0.05, 0.6));
  await tween(crossbow ? 90 : 300, e => draw(e), ease.out);
  if (!crossbow) await wait(90);
  // Release: the string snaps back with a little shiver.
  tween(260, (e, t) => draw(Math.sin(t * Math.PI * 4) * (1 - t) * 0.35), ease.linear).then(() => tween(500, (e) => { if (!g.destroyed) g.alpha = 1 - e; })).finally(() => g.destroy());
  particles(topLayer(), 5, () => ({ x: g.x, y: g.y, vx: rand(-30, 30) * s, vy: rand(-30, 30) * s, life: rand(200, 360), size: rand(5, 9) * s, alpha: 0.25, tint: 0xd8cfb8, grow: 1 }));
  return { x: g.x + Math.cos(angle) * 6 * s, y: g.y + Math.sin(angle) * 6 * s };
}

/** What happens where an arrow lands, by ammunition. */
function arrowImpact(look, point, angle, { hit, target }) {
  const s = scaleOf(), back = angle + Math.PI;
  if (look.sparks) sparks(point.x, point.y, back, { count: 12, colors: [0xffffff, 0xdfe6f0, 0x8a96a8] });
  if (look.thud || !hit) dust(point.x, point.y, { count: 6, radius: 18 * s, angle: back });
  if (look.shock && hit) { ring(point.x, point.y, { radius: 46 * s, color: 0xffe2b0, width: 6 * s, duration: 320 }); dust(point.x, point.y, { count: 8, radius: 26 * s }); }
  if (look.twist && hit) particles(topLayer(), 14, i => { const a = i / 14 * TAU; return { x: point.x, y: point.y, vx: Math.cos(a) * 90 * s, vy: Math.sin(a) * 90 * s, life: 420, size: 5 * s, texture: "dot", blend: ADD(), tints: look.trail, drag: 3, spin: 8 }; });
  if (look.frost) {
    ring(point.x, point.y, { radius: 40 * s, color: 0xbfefff, width: 5 * s, duration: 420 });
    particles(topLayer(), 10, () => ({ x: point.x, y: point.y, vx: rand(-120, 120) * s, vy: rand(-120, 120) * s, life: rand(400, 700), size: rand(6, 10) * s, texture: "shard", spin: rand(-8, 8), blend: ADD(), tints: [0xffffff, 0x8fe3f2], drag: 3 }));
  }
  if (look.venom && hit) particles(topLayer(), 10, () => ({ x: point.x + rand(-8, 8) * s, y: point.y + rand(-8, 8) * s, vx: rand(-20, 20) * s, vy: -rand(10, 40) * s, life: rand(700, 1100), size: rand(14, 22) * s, grow: 1, alpha: 0.35, tints: [0xb6e070, 0x3a6a18] }));
  if (look.fuse) { glow(topLayer(), point.x, point.y, { color: 0xffb04a, size: 50 * s, to: 1.8, duration: 260 }); }
  if (look.scent && hit) particles(topLayer(), 8, () => ({ x: point.x, y: point.y, vx: rand(-15, 15) * s, vy: -rand(15, 35) * s, life: rand(900, 1400), size: rand(10, 16) * s, grow: 1.2, alpha: 0.3, tint: 0xa08ae0, blend: ADD() }));
  if (target && hit && !look.fuse) pinToToken(target, arrowBody(look), angle);
}

/**
 * A bow or crossbow shot at `target`: draw, release, an arrow on an arc, and what it does on arrival.
 * `stops` — it reaches the target (hit, block or parry); `deflect` — a shield or blade turns it aside.
 */
export async function shoot({ attacker, target, look, long = false, hit, stops, deflect = false, onNear }) {
  const s = scaleOf(), a0 = attacker.center, b0 = target.center, angle0 = Math.atan2(b0.y - a0.y, b0.x - a0.x), r = tokenRadius(target);
  const from = await drawBow(attacker, angle0, { crossbow: look.bolt, long });
  const dist = Math.hypot(b0.x - from.x, b0.y - from.y);
  const contact = { x: b0.x - Math.cos(angle0) * r * 0.45, y: b0.y - Math.sin(angle0) * r * 0.45 };
  const beyond = { x: b0.x + Math.cos(angle0) * gridSize() * rand(1.2, 2.2) + rand(-0.4, 0.4) * gridSize(), y: b0.y + Math.sin(angle0) * gridSize() * rand(1.2, 2.2) + rand(-0.4, 0.4) * gridSize() };
  const to = stops ? contact : beyond;
  const height = look.bolt ? Math.min(dist * 0.04, gridSize() * 0.3) : Math.min(dist * 0.16, gridSize() * 1.8);
  const speed = (look.bolt ? 2300 : 1700) * s, duration = Math.max(220, Math.min(900, Math.hypot(to.x - from.x, to.y - from.y) / speed * 1000 * (look.bolt ? 1 : 1.15)));
  const shots = look.split && hit ? 3 : 1, body = arrowBody(look);
  const path = await flight(body, from, to, { height, duration, trail: look.trail, fuse: look.fuse, onNear });
  const angle = path.slope(1);
  body.destroy();
  if (deflect) {
    // Turned aside: the arrow spins off and drops.
    sparks(to.x, to.y, angle + Math.PI, { count: 10, colors: [0xffffff, 0xe8dcc0, 0x9a8a6a] });
    const bounce = arrowBody(look), away = angle + Math.PI + rand(-1.2, 1.2), land = { x: to.x + Math.cos(away) * gridSize() * 0.8, y: to.y + Math.sin(away) * gridSize() * 0.8 };
    await flight(bounce, to, land, { height: gridSize() * 0.25, duration: 380, spin: rand(-14, 14) });
    pinToGround(bounce, land, away);
    return;
  }
  arrowImpact(look, to, angle, { hit, target: hit ? target : null });
  if (shots > 1) for (let i = 1; i < shots; i++) arrowImpact(look, { x: to.x + rand(-r, r) * 0.4, y: to.y + rand(-r, r) * 0.4 }, angle + rand(-0.4, 0.4), { hit, target });
  if (!stops) pinToGround(arrowBody(look), to, angle);
}

/** A thrown knife, axe, star or spear: tumbling (or flying point first) on a low arc. */
export async function toss({ attacker, target, shape, hit, stops, onNear }) {
  const s = scaleOf(), a0 = attacker.center, b0 = target.center, angle = Math.atan2(b0.y - a0.y, b0.x - a0.x), r = tokenRadius(target);
  nudge(attacker, 300, thereAndBack(Math.cos(angle) * gridSize() * 0.18, Math.sin(angle) * gridSize() * 0.18, 0.35));
  await wait(110);
  const from = { x: a0.x + Math.cos(angle) * tokenRadius(attacker) * 0.7, y: a0.y + Math.sin(angle) * tokenRadius(attacker) * 0.7 };
  const to = stops ? { x: b0.x - Math.cos(angle) * r * 0.45, y: b0.y - Math.sin(angle) * r * 0.45 }
    : { x: b0.x + Math.cos(angle) * gridSize() * 1.4, y: b0.y + Math.sin(angle) * gridSize() * 1.4 };
  const dist = Math.hypot(to.x - from.x, to.y - from.y), spear = shape === "spear";
  const spin = spear ? 0 : shape === "star" ? 26 : shape === "axe" ? 13 : 19;
  const body = thrownBody(shape);
  if (!spin) body.rotation = angle;
  const glint = shape === "star" ? [0xffffff, 0xcfe0ff] : null;
  await flight(body, from, to, { height: Math.min(dist * (spear ? 0.12 : 0.08), gridSize()), duration: Math.max(220, Math.min(700, dist / (1300 * s) * 1000)), spin, trail: glint, onNear });
  if (hit) {
    sparks(to.x, to.y, angle + Math.PI, { count: shape === "axe" ? 8 : 6, colors: [0xffffff, 0xffd27a] });
    body.destroy();
    return;
  }
  // A miss skids along the ground and comes to rest.
  const rest = { x: to.x + Math.cos(angle) * gridSize() * 0.6, y: to.y + Math.sin(angle) * gridSize() * 0.6 };
  dust(to.x, to.y, { count: 5, radius: 16 * s, angle });
  await tween(320, (e) => { if (body.destroyed) return; body.position.set(to.x + (rest.x - to.x) * e, to.y + (rest.y - to.y) * e); body.rotation += spin ? 0.12 * (1 - e) : 0; }, ease.out);
  await wait(500);
  await tween(500, e => { if (!body.destroyed) body.alpha = 1 - e; });
  body.destroy();
}

/* -------------------------------------------- */
/*  Bombs                                       */
/* -------------------------------------------- */

/** The look of a blast, from the bomb's rule id or, for traps and devices, from what it does. */
export function blastStyle(ruleId = "", profile = {}) {
  const id = String(ruleId);
  if (/samum/u.test(id) || profile.blind) return "flash";
  if (/northern-wind|talgar/u.test(id) || profile.freeze) return "frost";
  if (/devils-puffball/u.test(id) || profile.poison) return "poison";
  if (/dragon-dream/u.test(id) || profile.gas) return "gas";
  if (/moon-dust/u.test(id) || profile.moonDust) return "moon";
  if (/dimeritium/u.test(id) || profile.dimeritium) return "dimeritium";
  if (profile.marker) return "paint";
  if (profile.fury) return "fury";
  if (/dancing-star|conflagration/u.test(id) || (profile.burning ?? 0) >= 75) return "fire";
  if (profile.bleeding) return "jaws";
  return "shrapnel";
}
const FLASK = { flash: 0xfff6d8, frost: 0x9fdcff, poison: 0x8ac040, gas: 0xd8d070, moon: 0xdfe8ff, dimeritium: 0x5a6a8a, fire: 0xff8a3a, shrapnel: 0x9a8a6a };

/** A short tremor for heavy blasts; the view returns where it was, unless the player panned meanwhile. */
let quaking = false;
function quake(power, duration = 420) {
  if (quaking) return Promise.resolve();
  quaking = true;
  const stage = canvas.stage, origin = { x: stage.pivot.x, y: stage.pivot.y };
  let last = { ...origin }, moved = false;
  return tween(duration, (e, t) => {
    if (moved || stage.pivot.x !== last.x || stage.pivot.y !== last.y) { moved = true; return; }
    const k = power * (1 - t);
    last = { x: origin.x + rand(-k, k), y: origin.y + rand(-k, k) };
    stage.pivot.set(last.x, last.y);
  }).finally(() => { if (!moved) stage.pivot.set(origin.x, origin.y); quaking = false; });
}

/** Throw a flask from the thrower to the aim point; a miss hops on to where it really lands. */
export async function bombThrow({ thrower, aim, point, style }) {
  const s = scaleOf(), a0 = thrower.center, angle = Math.atan2(aim.y - a0.y, aim.x - a0.x);
  nudge(thrower, 360, thereAndBack(Math.cos(angle) * gridSize() * 0.15, Math.sin(angle) * gridSize() * 0.15, 0.4));
  await wait(140);
  const from = { x: a0.x + Math.cos(angle) * tokenRadius(thrower) * 0.6, y: a0.y + Math.sin(angle) * tokenRadius(thrower) * 0.6 };
  const dist = Math.hypot(aim.x - from.x, aim.y - from.y), body = flaskBody(FLASK[style] ?? 0xb0c870);
  await flight(body, from, aim, { height: Math.min(dist * 0.32, gridSize() * 3), duration: Math.max(380, Math.min(1100, dist / (900 * s) * 1000)),
    spin: rand(7, 11) * (Math.random() < 0.5 ? -1 : 1), trail: [0xfff0b0, 0xff9a3a], fuse: true });
  const off = Math.hypot(point.x - aim.x, point.y - aim.y);
  if (off > 4) {
    // Missed: it clinks on the ground and rolls on.
    dust(aim.x, aim.y, { count: 6, radius: 18 * s });
    await flight(body, aim, point, { height: Math.min(off * 0.25, gridSize() * 0.8), duration: Math.max(240, Math.min(600, off / (700 * s) * 1000)), spin: rand(-12, 12), trail: [0xfff0b0, 0xff9a3a], fuse: true });
  }
  body.destroy();
}

/** The blast itself: a ring that shows the area, then the bomb's own colour of destruction. */
export async function explode(point, { style = "shrapnel", radius = 4, elevation = 0 } = {}) {
  const s = scaleOf(), layer = topLayer(), px = radius / (canvas.dimensions?.distance ?? 2) * gridSize(), { x, y } = point;
  const ringColor = { flash: 0xffffff, frost: 0xbfefff, poison: 0x9ad050, gas: 0xe0d870, moon: 0xdfe8ff, dimeritium: 0x8aa0d0, paint: 0xc070ff, fury: 0xff4a3a, fire: 0xffa040, jaws: 0xd8d8d8, shrapnel: 0xffd8a0 }[style];
  ring(x, y, { radius: px, color: ringColor, width: 4 * s, duration: 700, from: 0.15, alpha: 0.6 });
  if (style === "fire") {
    glow(layer, x, y, { color: 0xfff4c2, size: px * 1.2, to: 1.6, duration: 260 });
    quake(10 * s);
    // A dense fireball that reads on light maps too, with an additive core over it.
    particles(layer, 22, () => { const a = rand(0, TAU), v = rand(50, 200) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 * s, life: rand(450, 800), size: rand(0.3, 0.55) * px, grow: 1.3, alpha: 0.9, tints: [0xffe08a, 0xff8a1a, 0xc8321a, 0x3a2420], drag: 2.2, fadePower: 1.5 }; });
    particles(layer, 26, () => { const a = rand(0, TAU), v = rand(60, 220) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 * s, life: rand(500, 900), size: rand(0.25, 0.5) * px, grow: 1.4, blend: ADD(), tints: [0xfff4c2, 0xffa53a, 0xe0461b, 0x3a2420], drag: 2 }; });
    particles(layer, 40, () => { const a = rand(0, TAU), v = rand(80, 340) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * s, gravity: { x: 0, y: 160 * s }, life: rand(700, 1400), size: rand(3, 6) * s, texture: "dot", blend: ADD(), tints: [0xffffff, 0xffc04a, 0xff4a10], drag: 1.2 }; });
    particles(layer, 12, () => ({ x: x + rand(-px, px) * 0.5, y: y + rand(-px, px) * 0.5, vx: rand(-10, 10) * s, vy: -rand(30, 60) * s, life: rand(1500, 2400), size: rand(0.3, 0.5) * px, grow: 1.3, alpha: 0.4, tint: 0x2e2622, delay: rand(200, 600) }));
    // Flames keep licking at the ground for a moment.
    particles(layer, 30, () => ({ x: x + rand(-px, px) * 0.7, y: y + rand(-px, px) * 0.7, vx: 0, vy: -rand(30, 70) * s, life: rand(500, 900), size: rand(14, 26) * s, grow: 0.6, blend: ADD(), tints: [0xffd27a, 0xff6a1a, 0x8a2a10], alpha: 0.7, delay: rand(200, 2200) }));
    for (let i = 0; i < 4; i++) dropDecal(x + rand(-px, px) * 0.4, y + rand(-px, px) * 0.4, px * rand(0.7, 1.1), rand(0, TAU), 0x1a1410, { elevation, layer: SCORCH_LAYER, alpha: 0.55, grow: 500 });
    return;
  }
  if (style === "shrapnel" || style === "jaws") {
    glow(layer, x, y, { color: 0xffffff, size: px * 0.9, to: 1.5, duration: 200 });
    if (style === "shrapnel") quake(8 * s);
    ring(x, y, { radius: px * 0.9, color: 0xffffff, width: 10 * s, duration: 300 });
    particles(layer, style === "jaws" ? 18 : 46, () => { const a = rand(0, TAU), v = rand(360, 900) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(180, 380), size: rand(3, 6) * s, texture: "streak", stretch: 0.012, blend: ADD(), tints: [0xffffff, 0xffd27a, 0x8a6a40], drag: 3 }; });
    particles(layer, 16, () => { const a = rand(0, TAU), v = rand(40, 140) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(900, 1600), size: rand(0.25, 0.45) * px, grow: 1.4, alpha: 0.35, tint: 0x6a6258, drag: 1.5 }; });
    if (style === "shrapnel") for (let i = 0; i < 3; i++) dropDecal(x + rand(-px, px) * 0.3, y + rand(-px, px) * 0.3, px * rand(0.6, 0.9), rand(0, TAU), 0x1e1814, { elevation, layer: SCORCH_LAYER, alpha: 0.45, grow: 300 });
    return;
  }
  if (style === "flash") {
    // Samum: a white sun for an instant; nobody near keeps their sight.
    glow(layer, x, y, { color: 0xffffff, size: px * 2.4, to: 2.2, duration: 900, alpha: 1 });
    glow(layer, x, y, { color: 0xfff2c0, size: px * 1.2, to: 3, duration: 1400, alpha: 0.8 });
    particles(layer, 24, i => { const a = i / 24 * TAU; return { x, y, vx: Math.cos(a) * 900 * s, vy: Math.sin(a) * 900 * s, life: 420, size: 8 * s, texture: "streak", stretch: 0.02, blend: ADD(), tint: 0xffffff, drag: 4 }; });
    return;
  }
  if (style === "frost") {
    glow(layer, x, y, { color: 0xdff6ff, size: px * 1.2, to: 1.6, duration: 360 });
    ring(x, y, { radius: px, color: 0xffffff, width: 8 * s, duration: 520, from: 0.05 });
    particles(layer, 36, () => { const a = rand(0, TAU), v = rand(120, 420) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(500, 1000), size: rand(7, 14) * s, texture: "shard", spin: rand(-6, 6), rotation: rand(0, 6), blend: ADD(), tints: [0xffffff, 0x9fdcff, 0x3c9fb5], drag: 2.6 }; });
    particles(layer, 20, () => ({ x: x + rand(-px, px) * 0.6, y: y + rand(-px, px) * 0.6, vx: rand(-15, 15) * s, vy: rand(-10, 10) * s, life: rand(1400, 2400), size: rand(0.3, 0.5) * px, grow: 0.8, alpha: 0.3, tint: 0xdff6ff, blend: ADD(), delay: rand(0, 400) }));
    for (let i = 0; i < 3; i++) dropDecal(x + rand(-px, px) * 0.3, y + rand(-px, px) * 0.3, px * rand(0.8, 1.2), rand(0, TAU), 0xcfeeff, { elevation, layer: STAIN_LAYER, alpha: 0.35, grow: 600 });
    return;
  }
  if (style === "poison" || style === "gas") {
    const tints = style === "poison" ? [0xd8f080, 0x7ab030, 0x2e4a12] : [0xf0eaa0, 0xc8c060, 0x6a6430];
    glow(layer, x, y, { color: tints[0], size: px * 0.8, to: 1.4, duration: 260 });
    // A cloud that billows out, hangs, and thins.
    particles(layer, 34, () => { const a = rand(0, TAU), d = rand(0, 1) * px * 0.4, v = rand(20, 70) * s; return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 8 * s,
      life: rand(2600, 4200), size: rand(0.35, 0.6) * px, grow: 1.5, alpha: 0.42, tints, drag: 0.6, spin: rand(-0.4, 0.4), fadeIn: 0.12, delay: rand(0, 500) }; });
    if (style === "poison") particles(layer, 26, () => ({ x: x + rand(-px, px) * 0.6, y: y + rand(-px, px) * 0.6, vx: rand(-10, 10) * s, vy: -rand(10, 30) * s, life: rand(1500, 2600), size: rand(3, 5) * s, texture: "dot", blend: ADD(), tint: 0xe8ff9a, delay: rand(0, 1500) }));
    return;
  }
  if (style === "moon") {
    glow(layer, x, y, { color: 0xe8f0ff, size: px * 1.2, to: 1.5, duration: 420 });
    particles(layer, 70, () => ({ x: x + rand(-px, px), y: y + rand(-px, px) - rand(20, 60) * s, vx: rand(-10, 10) * s, vy: rand(20, 50) * s, life: rand(1400, 2600), size: rand(2, 4) * s, texture: "dot", blend: ADD(), tints: [0xffffff, 0xcfe0ff, 0x8fa8d8], delay: rand(0, 900) }));
    particles(layer, 14, () => ({ x: x + rand(-px, px) * 0.6, y: y + rand(-px, px) * 0.6, vx: rand(-15, 15) * s, vy: rand(-10, 10) * s, life: rand(1800, 2800), size: rand(0.3, 0.5) * px, grow: 1, alpha: 0.25, tint: 0xdfe8ff, blend: ADD() }));
    return;
  }
  if (style === "dimeritium") {
    // Magic is sucked in, then the dust bursts out grey and blue.
    particles(layer, 30, () => { const a = rand(0, TAU), d = px * rand(0.8, 1.2); return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 2.2, life: 420, size: rand(3, 6) * s, texture: "dot", blend: ADD(), tints: [0xbf94ff, 0x6a3cc0] }; });
    await wait(400);
    glow(layer, x, y, { color: 0x8aa0d0, size: px, to: 1.6, duration: 320 });
    particles(layer, 40, () => { const a = rand(0, TAU), v = rand(90, 300) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(900, 1600), size: rand(0.2, 0.4) * px, grow: 1.3, alpha: 0.4, tints: [0xb8c4d8, 0x4a5468], drag: 2 }; });
    return;
  }
  if (style === "paint") {
    for (let i = 0; i < 6; i++) dropDecal(x + rand(-px, px) * 0.6, y + rand(-px, px) * 0.6, px * rand(0.3, 0.6), rand(0, TAU), 0x9a4ae0, { elevation, layer: STAIN_LAYER, alpha: 0.6, grow: 260 });
    particles(layer, 30, () => { const a = rand(0, TAU), v = rand(200, 500) * s; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(300, 600), size: rand(4, 8) * s, texture: "drop", stretch: 0.008, tints: [0xd09aff, 0x7a2ac0], drag: 3 }; });
    return;
  }
  if (style === "fury") {
    particles(layer, 30, () => { const a = rand(0, TAU), d = rand(0, px * 0.5), v = rand(20, 60) * s; return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(1600, 2600), size: rand(0.3, 0.55) * px, grow: 1.4, alpha: 0.38, tints: [0xff8a7a, 0xb8201a, 0x3a0a08], drag: 0.6 }; });
  }
}

/** A blast hitting someone: a jolt away from the centre. */
export function blastJolt(token, center) {
  const angle = Math.atan2(token.center.y - center.y, token.center.x - center.x), push = gridSize() * 0.22;
  return nudge(token, 420, thereAndBack(Math.cos(angle) * push, Math.sin(angle) * push, 0.25));
}
