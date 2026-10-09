import { SYSTEM_ID } from "../../config.mjs";
import {
  topLayer, groundLayer, particles, glow, tween, loop, rand, ease, gridSize, nudge, flashTint, tokenRadius, placedToken, speakerToken, seen, canPlay, fxEnabled, diceLanded
} from "./fx-core.mjs";
import { ring } from "./combat-fx.mjs";
import { banner, naturalOf } from "./screen-fx.mjs";

// The table around the fight: whose turn it is, the order of the tracker, a potion taking hold, a medallion trembling.

const ADD = () => PIXI.BLEND_MODES.ADD;
const scaleOf = () => gridSize() / 100;
const flagsOf = document => document?.flags?.[SYSTEM_ID] ?? {};
const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const GOLD = 0xf0c46f;

/* -------------------------------------------- */
/*  Whose turn: a turning ring of runes         */
/* -------------------------------------------- */

let turn = null;

function runeRing(radius, s) {
  const root = new PIXI.Container(), outer = new PIXI.Graphics(), inner = new PIXI.Graphics();
  outer.lineStyle(2.5 * s, GOLD, 0.95).drawCircle(0, 0, radius).lineStyle(10 * s, GOLD, 0.12).drawCircle(0, 0, radius);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, r0 = radius * 0.86, r1 = radius * 0.96, w = 0.05;
    outer.lineStyle(2 * s, 0xffe2a0, 0.85).moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1).lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0);
  }
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    inner.lineStyle(3 * s, GOLD, 0.9).arc(0, 0, radius * 0.78, a + 0.25, a + Math.PI / 2 - 0.25);
    inner.lineStyle(0).beginFill(0xffe2a0, 0.95).drawPolygon([Math.cos(a) * radius * 0.72, Math.sin(a) * radius * 0.72, Math.cos(a) * radius * 0.84 + Math.cos(a + Math.PI / 2) * 4 * s,
      Math.sin(a) * radius * 0.84 + Math.sin(a + Math.PI / 2) * 4 * s, Math.cos(a) * radius * 0.84 - Math.cos(a + Math.PI / 2) * 4 * s, Math.sin(a) * radius * 0.84 - Math.sin(a + Math.PI / 2) * 4 * s]).endFill();
  }
  outer.blendMode = inner.blendMode = ADD();
  root.addChild(outer, inner);
  return { root, outer, inner };
}

function clearTurn() {
  if (turn) turn.alive = false;
  turn = null;
}

/** Put the ring under the token whose turn it is; `fresh` plays the entrance and moves the camera for its owner. */
function syncTurn(fresh = false) {
  if (!canvas.ready || !fxEnabled()) return clearTurn();
  const combat = game.combat, combatant = combat?.started ? combat.combatant : null;
  const token = combatant?.token ? placedToken(combatant.token.uuid) : null;
  if (!token) return clearTurn();
  if (turn?.token === token && !fresh) return;
  clearTurn();
  const s = scaleOf(), { root, outer, inner } = runeRing(tokenRadius(token) * 1.3, s);
  groundLayer(token.document.elevation, 548).addChild(root);
  const state = turn = { token, alive: true };
  let time = fresh && canPlay() ? 0 : 1000;
  if (fresh && canPlay()) {
    const c = token.center;
    ring(c.x, c.y, { radius: tokenRadius(token) * 2.4, color: GOLD, width: 8 * s, duration: 700, from: 0.5 });
    glow(topLayer(), c.x, c.y, { color: GOLD, size: tokenRadius(token) * 3, to: 1.2, duration: 600, alpha: 0.45 });
  }
  loop(dt => {
    if (root.destroyed) return false;
    time += dt;
    if (!token.destroyed && token.mesh) root.position.copyFrom(token.mesh.position);
    root.visible = seen(token) && token.visible !== false;
    outer.rotation += dt / 1000 * 0.18;
    inner.rotation -= dt / 1000 * 0.35;
    const k = Math.min(1, time / 700);
    root.scale.set(1.6 - 0.6 * ease.out(k));
    root.alpha = state.alive ? k * (0.75 + 0.2 * Math.sin(time / 500)) : root.alpha - dt / 400;
    if (!state.alive && root.alpha <= 0) { root.destroy({ children: true }); return false; }
    return true;
  });
  // The owner of the combatant is pulled to it and told it is their turn.
  if (fresh && !game.user.isGM && combatant.actor?.isOwner && canPlay()) {
    canvas.animatePan({ x: token.center.x, y: token.center.y, duration: still() ? 0 : 900 });
    banner(`Ваш ход · ${combatant.name}`);
  }
}

/* -------------------------------------------- */
/*  The tracker deals its cards                 */
/* -------------------------------------------- */

/** The roller's token reacts to its own natural 10 or 1, once the dice have landed. */
async function natural(message) {
  if (!canPlay() || !message.visible || message.isContentVisible === false) return;
  const kind = naturalOf(message);
  if (!kind) return;
  const flags = flagsOf(message), uuid = flags.weaponAttack?.attacker;
  const token = (uuid ? placedToken(uuid) : null) ?? speakerToken(message);
  if (!token || !seen(token)) return;
  await diceLanded(message);
  if (canPlay()) naturalBurst(token, kind);
}

const dealt = new WeakMap();
function dealTracker(app, element) {
  if (!fxEnabled() || still()) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const rows = [...(root?.querySelectorAll("li.combatant") ?? [])];
  if (!rows.length) return;
  const combat = app.viewed ?? game.combat;
  const order = `${combat?.id}:${rows.map(row => row.dataset.combatantId).join(",")}:${rows.map(row => row.querySelector(".initiative, .token-initiative")?.textContent.trim()).join(",")}`;
  const active = rows.find(row => row.classList.contains("active"))?.dataset.combatantId;
  const before = dealt.get(app);
  dealt.set(app, { order, active });
  if (before?.order !== order) {
    // A new order: the combatants are dealt like a hand of cards, one after another.
    rows.forEach((row, index) => row.animate([
      { opacity: 0, transform: "translateX(-46px) rotate(-10deg) scale(.92)", transformOrigin: "0 50%" },
      { opacity: 1, transform: "translateX(4px) rotate(1deg) scale(1)", offset: 0.7 },
      { opacity: 1, transform: "none" }
    ], { duration: 520, delay: index * 75, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
    return;
  }
  if (before.active !== active) rows.find(row => row.dataset.combatantId === active)?.animate([
    { boxShadow: "inset 3px 0 0 #f0c46f, 0 0 0 1px #f0c46f, 0 0 24px #f0c46faa" }, { boxShadow: "inset 3px 0 0 #f0c46f, 0 0 0 0 transparent" }
  ], { duration: 900, easing: "ease-out" });
}

/* -------------------------------------------- */
/*  Potions                                     */
/* -------------------------------------------- */

const POTION_COLORS = { "potion.swallow": 0xd04a40, "potion.thunderbolt": 0xe8a030, "potion.cat": 0xa8d040, "potion.tawny-owl": 0x4a90e0, "potion.white-honey": 0xf4f0e0,
  "potion.blizzard": 0x80d8ff, "potion.full-moon": 0xdce4ff, "potion.black-blood": 0x7a1020, "potion.golden-oriole": 0xf0c840, "potion.killer-whale": 0x3a78c8,
  "potion.maribor": 0x6ab060, "potion.petri": 0xb47cff };
const potionColor = ruleId => POTION_COLORS[ruleId] ?? (String(ruleId).startsWith("decoction.") ? 0x6ac890 : 0xe0b050);

/** Dark veins branching from the heart of a token, `strength` 0..1. */
export function drawVeins(g, radius, s, seed, strength = 1) {
  g.clear();
  let x = seed * 9301 + 49297;
  const random = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  for (let i = 0; i < 7; i++) {
    const branch = (fromX, fromY, angle, length, width, depth) => {
      let px = fromX, py = fromY;
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const a = angle + (random() - 0.5) * 0.9, step = length / steps;
        const nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step;
        g.lineStyle(Math.max(0.8, width * (1 - k / steps)) * s, 0x150d18, 0.75 * strength).moveTo(px, py).lineTo(nx, ny);
        if (depth < 2 && random() < 0.35) branch(nx, ny, a + (random() < 0.5 ? -0.8 : 0.8), length * 0.45, width * 0.6, depth + 1);
        px = nx; py = ny;
      }
    };
    const a = i / 7 * Math.PI * 2 + random() * 0.5;
    branch(Math.cos(a) * radius * 0.15, Math.sin(a) * radius * 0.15, a, radius * 0.75, 3.2, 0);
  }
}

/** A witcher potion or decoction takes hold: a flash in its colour, rising bubbles, dark veins that fade. */
export function potionTakesHold(token, ruleId) {
  const s = scaleOf(), r = tokenRadius(token), c = token.center, color = potionColor(ruleId);
  glow(topLayer(), c.x, c.y, { color, size: r * 2.8, to: 1.3, duration: 900, alpha: 0.65 });
  ring(c.x, c.y, { radius: r * 1.4, color, width: 6 * s, duration: 700, from: 0.4 });
  particles(topLayer(), 22, () => ({ x: c.x + rand(-r, r) * 0.7, y: c.y + rand(-r * 0.2, r * 0.7), vx: rand(-15, 15) * s, vy: -rand(40, 110) * s, life: rand(700, 1300),
    size: rand(5, 11) * s, texture: "drop", tint: color, alpha: 0.85, delay: rand(0, 500), fadeIn: 0.15 }));
  flashTint(token, color, 1100);
  const g = new PIXI.Graphics();
  topLayer().addChild(g);
  const seed = Math.floor(rand(1, 1000));
  return tween(2600, (e, t) => {
    if (g.destroyed || token.destroyed) return;
    g.position.copyFrom(token.mesh?.position ?? c);
    const strength = t < 0.2 ? t / 0.2 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    drawVeins(g, r, s, seed, strength);
  }).finally(() => g.destroy());
}

/* -------------------------------------------- */
/*  Medallion                                   */
/* -------------------------------------------- */

/** Silver ripples run out from the wearer and the token shivers. */
export function medallionRipple(token) {
  const s = scaleOf(), r = tokenRadius(token), c = token.center;
  for (let i = 0; i < 3; i++) setTimeout(() => ring(c.x, c.y, { radius: r * 3.2, color: 0xdfe8f6, width: 5 * s, duration: 1100, from: 0.3, alpha: 0.7 }), i * 260);
  glow(topLayer(), c.x, c.y, { color: 0xcfd8e8, size: r * 1.6, to: 1.4, duration: 700, alpha: 0.6 });
  return nudge(token, 1200, t => ({ x: Math.sin(t * 90) * 2.6 * s * (1 - t), y: Math.cos(t * 77) * 1.6 * s * (1 - t) }));
}

/* -------------------------------------------- */
/*  Natural 10 and natural 1                    */
/* -------------------------------------------- */

/** A natural 10: a golden star bursts around the roller. A natural 1: the ground cracks red under it and it staggers. */
export function naturalBurst(token, kind) {
  const s = scaleOf(), r = tokenRadius(token), c = token.center;
  if (kind === "crit") {
    const rays = new PIXI.Graphics();
    rays.blendMode = ADD();
    rays.position.set(c.x, c.y);
    topLayer().addChild(rays);
    tween(900, (e, t) => {
      if (rays.destroyed) return;
      rays.clear();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + t * 0.6, inner = r * (0.7 + 0.2 * e), outer = r * (1.1 + 1.3 * e) * (i % 2 ? 0.7 : 1);
        rays.lineStyle((i % 2 ? 3 : 5) * s * (1 - t * 0.7), 0xffe08a, 0.9 * (1 - t)).moveTo(Math.cos(a) * inner, Math.sin(a) * inner).lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      }
    }, ease.out).finally(() => rays.destroy());
    glow(topLayer(), c.x, c.y, { color: 0xffd060, size: r * 3.2, to: 1.3, duration: 800, alpha: 0.75 });
    ring(c.x, c.y, { radius: r * 2.2, color: GOLD, width: 7 * s, duration: 700, from: 0.4 });
    particles(topLayer(), 30, () => {
      const a = rand(0, Math.PI * 2), v = rand(60, 200) * s;
      return { x: c.x + Math.cos(a) * r * 0.6, y: c.y + Math.sin(a) * r * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 * s, drag: 1.6, life: rand(700, 1300),
        size: rand(3, 6) * s, texture: "dot", blend: ADD(), tints: [0xffffff, 0xffe08a, 0xf0a020] };
    });
    return flashTint(token, 0xffe08a, 700);
  }
  const crack = new PIXI.Graphics();
  groundLayer(token.document.elevation, 545).addChild(crack);
  crack.position.set(c.x, c.y);
  const lines = Array.from({ length: 6 }, (_, i) => {
    let a = i / 6 * Math.PI * 2 + rand(-0.3, 0.3), d = r * 0.2;
    const points = [[Math.cos(a) * d, Math.sin(a) * d]];
    for (let k = 0; k < 4; k++) { a += rand(-0.4, 0.4); d += r * rand(0.25, 0.4); points.push([Math.cos(a) * d, Math.sin(a) * d]); }
    return points;
  });
  tween(2200, (e, t) => {
    if (crack.destroyed) return;
    const grow = Math.min(1, t / 0.15), fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    crack.clear();
    for (const points of lines) {
      const n = Math.max(2, Math.ceil(points.length * grow));
      for (const [width, color, alpha] of [[7 * s, 0x5a0606, 0.35], [2.5 * s, 0xc01818, 0.95]]) {
        crack.lineStyle(width, color, alpha * fade).moveTo(...points[0]);
        for (let i = 1; i < n; i++) crack.lineTo(...points[i]);
      }
    }
  }).finally(() => crack.destroy());
  particles(topLayer(), 12, () => {
    const a = rand(0, Math.PI * 2);
    return { x: c.x + Math.cos(a) * r * 0.5, y: c.y + Math.sin(a) * r * 0.5, vx: Math.cos(a) * rand(20, 60) * s, vy: Math.sin(a) * rand(20, 60) * s, life: rand(600, 1000),
      size: r * rand(0.4, 0.7), grow: 1, alpha: 0.35, tint: 0x6a5a48, fadeIn: 0.1 };
  });
  flashTint(token, 0xb02020, 600);
  return nudge(token, 700, t => ({ x: Math.sin(t * 28) * 7 * s * (1 - t), y: Math.abs(Math.sin(t * 14)) * 4 * s * (1 - t) }));
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

export function registerTableFx() {
  Hooks.on("combatTurnChange", () => syncTurn(true));
  // Any other change (a reset round, a removed combatant) only re-checks where the ring belongs.
  Hooks.on("updateCombat", (combat, changes) => syncTurn("active" in changes));
  for (const hook of ["deleteCombat", "createCombatant", "deleteCombatant", "updateCombatant"]) Hooks.on(hook, () => syncTurn());
  Hooks.on("canvasReady", () => { turn = null; setTimeout(() => syncTurn(), 400); });
  Hooks.on("drawToken", () => setTimeout(() => syncTurn(), 150));
  Hooks.on("renderCombatTracker", (app, element) => dealTracker(app, element));
  Hooks.on("createActiveEffect", effect => {
    const dose = flagsOf(effect).consumable, actor = effect.parent;
    if (!dose || !["potion", "decoction"].includes(dose.category) || !canPlay() || actor?.documentName !== "Actor") return;
    for (const token of actor.getActiveTokens?.() ?? []) if (seen(token)) potionTakesHold(token, dose.ruleId);
  });
  Hooks.on("createChatMessage", message => {
    const medallion = flagsOf(message).medallion, token = placedToken(medallion?.token);
    if (token && message.visible && canPlay()) medallionRipple(token);
    natural(message).catch(error => console.error(`${SYSTEM_ID} | FX`, error));
  });
}
