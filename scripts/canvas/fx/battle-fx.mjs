import { SYSTEM_ID } from "../../config.mjs";
import {
  topLayer, particles, glow, tween, wait, rand, ease, gridSize, nudge, flashTint, tokenRadius, seen, canPlay, fxEnabled
} from "./fx-core.mjs";
import { ring, sparks, dust, shatter, dimStains } from "./combat-fx.mjs";
import { banner } from "./screen-fx.mjs";

// Moments of a fight: where a blow lands, a weapon flying from a hand, gear breaking, a death, the end of the fight.

const ADD = () => PIXI.BLEND_MODES.ADD;
const scaleOf = () => gridSize() / 100;
const flagsOf = document => document?.flags?.[SYSTEM_ID] ?? {};

/* -------------------------------------------- */
/*  Where the blow lands                        */
/* -------------------------------------------- */

/** Body parts of a small figure, in units of its height (about 2.2 tall, centred on the chest). */
const PARTS = {
  head: g => g.drawCircle(0, -0.95, 0.24),
  torso: g => g.drawRoundedRect(-0.3, -0.68, 0.6, 0.8, 0.12),
  rightArm: g => g.drawRoundedRect(-0.54, -0.64, 0.18, 0.72, 0.08),
  leftArm: g => g.drawRoundedRect(0.36, -0.64, 0.18, 0.72, 0.08),
  rightLeg: g => g.drawRoundedRect(-0.27, 0.16, 0.22, 0.86, 0.08),
  leftLeg: g => g.drawRoundedRect(0.05, 0.16, 0.22, 0.86, 0.08),
  tail: g => g.moveTo(0.22, 0.1).bezierCurveTo(0.7, 0.2, 0.75, 0.7, 0.98, 0.62)
};
const CRACKS = { head: [[-0.1, -1.12], [0.02, -0.98], [-0.06, -0.9], [0.08, -0.78]], torso: [[-0.15, -0.6], [0.04, -0.4], [-0.08, -0.25], [0.12, 0.02]],
  rightArm: [[-0.45, -0.6], [-0.42, -0.35], [-0.48, -0.15], [-0.43, 0.05]], leftArm: [[0.45, -0.6], [0.42, -0.35], [0.48, -0.15], [0.43, 0.05]],
  rightLeg: [[-0.15, 0.2], [-0.2, 0.45], [-0.12, 0.65], [-0.18, 0.95]], leftLeg: [[0.15, 0.2], [0.2, 0.45], [0.12, 0.65], [0.18, 0.95]],
  tail: [[0.4, 0.2], [0.55, 0.4], [0.7, 0.5], [0.9, 0.6]] };

/**
 * A small figure above the target with the struck part lit: a called shot, a rolled hit location. With `crack`, the part
 * splits red: a critical wound landed there.
 */
export function bodySilhouette(target, location, { crack = false } = {}) {
  if (!PARTS[location] || !target?.mesh) return;
  const s = scaleOf(), r = tokenRadius(target), unit = r * 0.66, root = new PIXI.Container(), body = new PIXI.Graphics(), zone = new PIXI.Graphics(), lines = new PIXI.Graphics();
  zone.blendMode = ADD();
  root.addChild(body, zone, lines);
  topLayer().addChild(root);
  // The figure: dark glass with a gold outline.
  body.lineStyle(1.5 * s / unit, 0xe6c27a, 0.9).beginFill(0x120c0c, 0.72);
  for (const [id, part] of Object.entries(PARTS)) if (id !== "tail" && id !== location) part(body);
  body.endFill();
  if (location === "tail") body.lineStyle(5 * s / unit, 0x120c0c, 0.72);
  const color = crack ? 0xff3a2a : 0xffb040;
  const paint = alpha => {
    zone.clear();
    if (location === "tail") { zone.lineStyle(9 * s / unit, color, alpha); PARTS.tail(zone); return; }
    zone.lineStyle(2 * s / unit, 0xffffff, alpha).beginFill(color, alpha * 0.85);
    PARTS[location](zone);
    zone.endFill();
  };
  root.scale.set(unit);
  const duration = crack ? 2200 : 1700;
  return tween(duration, (e, t) => {
    if (root.destroyed) return;
    const c = target.mesh?.position ?? target.center;
    root.position.set(c.x, c.y - r * 2.45);
    const k = Math.min(1, t * duration / 260), out = t > 0.8 ? (1 - t) / 0.2 : 1;
    root.scale.set(unit * (0.3 + 0.7 * ease.outBack(k)));
    root.alpha = out;
    paint(0.65 + 0.35 * Math.sin(t * duration / 90));
    if (crack && t * duration > 280) {
      const grow = Math.min(1, (t * duration - 280) / 260), points = CRACKS[location];
      const n = Math.max(2, Math.ceil(points.length * grow));
      lines.clear().lineStyle(2.4 * s / unit, 0x2a0202, 0.95).moveTo(...points[0]);
      for (let i = 1; i < n; i++) lines.lineTo(...points[i]);
    }
  }).finally(() => root.destroy({ children: true }));
}

/* -------------------------------------------- */
/*  A weapon flying from a hand                 */
/* -------------------------------------------- */

/**
 * An item lands on the ground: it tumbles in an arc from whoever lost it to the pile, which shows up when it lands.
 * Covers disarming fumbles, Cadfan's Grasp dropped from a burnt hand and plain dropping.
 */
export async function tossToGround(item) {
  const transfer = flagsOf(item).lootTransfer;
  if (!transfer || transfer.attack || !canPlay()) return;
  const owner = fromUuidSync(transfer.sourceActor), from = owner?.token?.object ?? owner?.getActiveTokens?.()[0];
  await wait(60);
  const pile = item.parent?.token?.object;
  if (!from || !pile || !(seen(from) || seen(pile))) return;
  const s = scaleOf(), a = from.center, b = pile.center, dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  const sprite = new PIXI.Sprite(PIXI.Texture.from(item.img || "icons/svg/item-bag.svg"));
  sprite.anchor.set(0.5);
  const size = gridSize() * 0.42;
  topLayer().addChild(sprite);
  if (pile.mesh) pile.mesh.alpha = 0;
  sparks(a.x, a.y, Math.atan2(dy, dx), { count: 8, spread: 0.8, speed: 300 });
  const lift = Math.max(gridSize() * 0.6, distance * 0.35), spin = (Math.random() < 0.5 ? -1 : 1) * rand(9, 14);
  await tween(Math.max(450, Math.min(1100, distance * 1.4)), e => {
    if (sprite.destroyed) return;
    // A thrown arc seen from above: the item grows as it rises and shrinks as it falls.
    const height = Math.sin(Math.PI * e);
    sprite.position.set(a.x + dx * e, a.y + dy * e - height * lift * 0.35);
    sprite.rotation = e * spin;
    const scale = size * (1 + height * 0.45);
    sprite.width = scale; sprite.height = scale;
  }, ease.linear);
  sprite.destroy();
  if (!pile.destroyed) pile.renderFlags.set({ refreshMesh: true });
  dust(b.x, b.y, { count: 8, radius: gridSize() * 0.3, alpha: 0.4 });
  ring(b.x, b.y, { radius: gridSize() * 0.45, color: 0xd8c8a0, width: 4 * s, duration: 380, blend: PIXI.BLEND_MODES.NORMAL, alpha: 0.6 });
}

/* -------------------------------------------- */
/*  Broken gear                                 */
/* -------------------------------------------- */

/** A weapon's reliability or an armour's stopping power hits zero: shards fly off the owner, its row flashes in the sheet. */
export function gearBreaks(item) {
  const actor = item.actor;
  for (const sheet of [actor?.sheet, ...(actor?.token ? [actor.token.actor?.sheet] : [])]) {
    const row = sheet?.rendered ? sheet.element.querySelector(`.witcher-inventory-row[data-item-id="${CSS.escape(item.id)}"]`) : null;
    if (!row) continue;
    row.classList.remove("witcher-row-broke");
    void row.offsetWidth;
    row.classList.add("witcher-row-broke");
  }
  if (!canPlay()) return;
  const token = actor?.token?.object ?? actor?.getActiveTokens?.()[0];
  if (!token || !seen(token)) return;
  const s = scaleOf(), c = token.center, r = tokenRadius(token);
  glow(topLayer(), c.x, c.y, { color: 0xffe0b0, size: r * 1.6, to: 1.5, duration: 260 });
  particles(topLayer(), 22, () => {
    const a = rand(0, Math.PI * 2), v = rand(140, 360) * s;
    return { x: c.x + Math.cos(a) * r * 0.3, y: c.y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.8, life: rand(500, 900),
      size: rand(7, 13) * s, texture: "shard", spin: rand(-14, 14), rotation: rand(0, 6), tints: [0xe8ecf2, 0x9aa4b4, 0x5a6270] };
  });
  sparks(c.x, c.y, -Math.PI / 2, { count: 10, spread: Math.PI, speed: 380 });
  canvas.interface.createScrollingText({ x: c.x, y: c.y - r * 0.4 }, `Сломано: ${item.name}`, {
    anchor: CONST.TEXT_ANCHOR_POINTS.TOP, direction: CONST.TEXT_ANCHOR_POINTS.TOP, duration: 2200, distance: r,
    fontSize: 20 * s, fill: 0xd8e0ea, stroke: 0x101418, strokeThickness: 4 * s, fontFamily: "Palatino Linotype, Book Antiqua, Georgia, serif", fontWeight: "bold" });
}

/* -------------------------------------------- */
/*  Death and the end of the fight              */
/* -------------------------------------------- */

/** A creature dies: it pales and the life leaves it: dark mist, ectoplasm for a spirit, dust for an elemental. */
export function death(token) {
  if (!canPlay() || !seen(token)) return;
  const s = scaleOf(), c = token.center, r = tokenRadius(token), category = token.actor?.type === "npc" ? token.actor.system?.creature?.category : "humanoid";
  if (category === "specter") shatter(c.x, c.y, [0xf0fcff, 0x8fe3f2, 0x3c9fb5], r);
  else if (category === "elemental") dust(c.x, c.y, { count: 22, radius: r * 1.4, color: 0x8a8070, alpha: 0.55 });
  const mist = category === "specter" ? [0xbff6ff, 0x4fb7c8] : [0x2a2228, 0x0e0a0c];
  particles(topLayer(), 26, () => ({ x: c.x + rand(-r, r) * 0.6, y: c.y + rand(-r, r) * 0.4, vx: rand(-12, 12) * s, vy: -rand(30, 70) * s, life: rand(1600, 2600),
    size: r * rand(0.4, 0.8), grow: 1.4, alpha: 0.38, tints: mist, fadeIn: 0.25, delay: rand(0, 900), blend: category === "specter" ? ADD() : PIXI.BLEND_MODES.NORMAL }));
  flashTint(token, 0x5a5a5a, 2400);
  return nudge(token, 1600, t => ({ x: 0, y: ease.out(t) * 5 * s * (1 - Math.max(0, t - 0.8) * 5) }));
}

/** The fight is over: a banner, and the blood on the floor fades a little. */
export function combatOver() {
  banner("Бой окончен", { tone: "grey", duration: 2600 });
  dimStains(0.55);
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

const deadStatus = () => CONFIG.specialStatusEffects?.DEFEATED ?? "dead";

export function registerBattleFx() {
  Hooks.on("createItem", item => { if (flagsOf(item).lootTransfer) tossToGround(item).catch(error => console.error(`${SYSTEM_ID} | FX`, error)); });
  Hooks.on("updateItem", (item, changes) => {
    const reliability = foundry.utils.getProperty(changes, "system.reliability.value"), stopping = foundry.utils.getProperty(changes, "system.stoppingPower.value");
    if ((reliability === 0 && item.system.reliability?.max > 0) || (stopping === 0 && item.system.stoppingPower?.max > 0)) gearBreaks(item);
  });
  Hooks.on("createActiveEffect", effect => {
    if (!effect.statuses?.has?.(deadStatus()) || effect.parent?.documentName !== "Actor") return;
    for (const token of effect.parent.getActiveTokens?.() ?? []) death(token);
  });
  Hooks.on("deleteCombat", combat => { if (fxEnabled() && combat.round > 0) combatOver(); });
}

