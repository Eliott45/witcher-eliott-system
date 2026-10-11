import { SYSTEM_ID } from "../../config.mjs";
import { attackRolls } from "../../combat/attack-exchange.mjs";
import { spellArea } from "../../magic/spell-areas.mjs";
import { heatedWeapon } from "../../magic/cadfan.mjs";
import { activeOil } from "../../data/workshop.mjs";
import {
  topLayer, groundLayer, particles, glow, tween, loop, wait, rand, ease, gridSize,
  nudge, thereAndBack, flashTint, fadeArtwork, afterimage, placedToken, speakerToken, seen, tokenRadius, geometry, goreEnabled, stainLifetime, texture, SPLATS
} from "./fx-core.mjs";

const ADD = () => PIXI.BLEND_MODES.ADD;
const flagsOf = message => message?.flags?.[SYSTEM_ID] ?? {};
export const ELEMENT_COLORS = {
  fire: [0xfff4c2, 0xffa53a, 0xe0461b, 0x4a2a24], water: [0xf0fcff, 0x8fe0ff, 0x2f86d6], air: [0xffffff, 0xdcefff, 0x9fc6ff],
  earth: [0xfff1c4, 0xe6b450, 0x8a6020], mixed: [0xf6ecff, 0xbf94ff, 0x6a3cc0]
};

/* -------------------------------------------- */
/*  Building blocks                             */
/* -------------------------------------------- */

const scaleOf = () => gridSize() / 100;

/** A sword stroke: a tapered crescent sweeping across the target, perpendicular to the blow. */
function slash(center, angle, radius, { color = 0xffffff, glowColor = 0xff4b3a, alpha = 1, claws = false, duration = 320, glowAlpha = 0.4 } = {}) {
  const layer = topLayer(), line = new PIXI.Graphics(), halo = new PIXI.Graphics();
  halo.blendMode = ADD();
  layer.addChild(halo, line);
  const side = Math.random() < 0.5 ? -1 : 1, sweep = 2.1, pivotX = center.x - Math.cos(angle) * radius * 0.9, pivotY = center.y - Math.sin(angle) * radius * 0.9;
  const R = radius * 1.4, start = angle - side * sweep / 2, end = angle + side * sweep / 2, width = Math.max(3, radius * 0.16);
  const offsets = claws ? [-0.16, 0, 0.16].map(k => k * radius) : [0];
  const N = 16;
  const draw = (tail, head, fade) => {
    line.clear(); halo.clear();
    for (const offset of offsets) for (let j = 0; j < N; j++) {
      const f0 = tail + (head - tail) * j / N, f1 = tail + (head - tail) * (j + 1) / N, a0 = start + (end - start) * f0, a1 = start + (end - start) * f1;
      const k = (j + 1) / N, r = R + offset, back = a1 < a0;
      halo.lineStyle(width * 3 * k, glowColor, glowAlpha * fade * k).moveTo(pivotX + Math.cos(a0) * r, pivotY + Math.sin(a0) * r).arc(pivotX, pivotY, r, a0, a1, back);
      line.lineStyle(width * k, color, alpha * fade * k).moveTo(pivotX + Math.cos(a0) * r, pivotY + Math.sin(a0) * r).arc(pivotX, pivotY, r, a0, a1, back);
    }
  };
  return tween(duration, (e, t) => {
    if (line.destroyed) return;
    const head = ease.out(Math.min(1, t / 0.45)), late = Math.max(0, (t - 0.45) / 0.55);
    draw(Math.max(0, head - 0.7) + late * 0.7, head, 1 - late);
  }).finally(() => { line.destroy(); halo.destroy(); });
}

/** A thrust: a bright spear of light through the target along the blow. */
function thrust(center, angle, radius, { color = 0xffffff, glowColor = 0xff4b3a, duration = 260 } = {}) {
  const layer = topLayer(), line = new PIXI.Graphics();
  line.blendMode = ADD();
  layer.addChild(line);
  const ux = Math.cos(angle), uy = Math.sin(angle), from = { x: center.x - ux * radius * 1.3, y: center.y - uy * radius * 1.3 }, length = radius * 2.3;
  return tween(duration, (e, t) => {
    if (line.destroyed) return;
    const head = ease.out(Math.min(1, t / 0.4)) * length, fade = 1 - Math.max(0, (t - 0.4) / 0.6), tail = Math.max(0, head - length * 0.6);
    line.clear();
    line.lineStyle(radius * 0.3, glowColor, 0.3 * fade).moveTo(from.x + ux * tail, from.y + uy * tail).lineTo(from.x + ux * head, from.y + uy * head);
    line.lineStyle(radius * 0.08, color, fade).moveTo(from.x + ux * tail, from.y + uy * tail).lineTo(from.x + ux * head, from.y + uy * head);
  }).finally(() => line.destroy());
}

/** An expanding ring: blunt impacts and shock waves. */
export function ring(x, y, { radius = 60, color = 0xffffff, width = 6, duration = 380, alpha = 0.8, layer = topLayer(), blend = ADD(), from = 0.2 } = {}) {
  const g = new PIXI.Graphics();
  g.blendMode = blend;
  layer.addChild(g);
  return tween(duration, (e, t) => {
    if (g.destroyed) return;
    g.clear().lineStyle(width * (1 - t * 0.7), color, alpha * (1 - t)).drawCircle(x, y, radius * (from + (1 - from) * e));
  }, ease.out).finally(() => g.destroy());
}

export function sparks(x, y, angle, { count = 16, spread = 1.1, speed = 520, colors = [0xffffff, 0xffd27a, 0xff7a2a], life = [200, 460] } = {}) {
  const s = scaleOf();
  glow(topLayer(), x, y, { color: colors[1], size: 70 * s, to: 1.8, duration: 200 });
  return particles(topLayer(), count, () => {
    const a = angle + rand(-spread, spread), v = rand(0.35, 1) * speed * s;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(...life), size: rand(5, 9) * s, texture: "streak", stretch: 0.0075,
      blend: ADD(), tints: colors, drag: 3.5 };
  });
}

export function dust(x, y, { count = 10, radius = 40, color = 0xa8977a, alpha = 0.35, angle = null } = {}) {
  const s = scaleOf();
  return particles(topLayer(), count, () => {
    const a = angle === null ? rand(0, Math.PI * 2) : angle + rand(-0.9, 0.9), v = rand(20, 70) * s;
    return { x: x + rand(-radius, radius) * 0.4, y: y + rand(-radius, radius) * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(500, 900),
      size: rand(0.5, 0.9) * radius, grow: 1.2, alpha, tint: color, drag: 1.5, fadeIn: 0.15 };
  });
}

/** Shards of a spell breaking on a resisting target. */
export function shatter(x, y, colors, radius) {
  const s = scaleOf();
  glow(topLayer(), x, y, { color: colors[1], size: radius * 2, to: 1.4, duration: 260 });
  ring(x, y, { radius: radius * 1.3, color: colors[1], width: 5 * s, duration: 360 });
  return particles(topLayer(), 18, () => {
    const a = rand(0, Math.PI * 2), v = rand(180, 420) * s;
    return { x: x + Math.cos(a) * radius * 0.5, y: y + Math.sin(a) * radius * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(350, 650),
      size: rand(7, 13) * s, texture: "shard", spin: rand(-12, 12), rotation: rand(0, 6), blend: ADD(), tints: colors, drag: 2.5 };
  });
}

/** A short trail of afterimages while the artwork is moving (timed by frames, so it follows the motion). */
function trail(token, count = 3, every = 45, tint = 0x9fc6ff) {
  let elapsed = 0, made = 0;
  return loop(dt => {
    elapsed += dt;
    while (made < count && elapsed >= made * every) { afterimage(token, { tint, alpha: 0.6 - made * 0.12, duration: 420 }); made++; }
    return made < count;
  });
}

function dodge(token, g) {
  const side = Math.random() < 0.5 ? -1 : 1, distance = gridSize() * 0.5, c = token.center;
  dust(c.x, c.y, { count: 6, radius: tokenRadius(token) * 0.6, angle: Math.atan2(-g.ux * side, g.uy * side) + Math.PI });
  nudge(token, 620, thereAndBack(-g.uy * side * distance, g.ux * side * distance, 0.3));
  return trail(token, 3, 40);
}
function reposition(token, g) {
  const distance = gridSize() * 0.55, c = token.center;
  dust(c.x, c.y, { count: 8, radius: tokenRadius(token) * 0.7 });
  nudge(token, 760, thereAndBack(g.ux * distance, g.uy * distance, 0.35));
  return trail(token, 2, 70, 0xd8c6a0);
}
const lunge = (token, g, distance = gridSize() * 0.3, duration = 300) => nudge(token, duration, thereAndBack(g.ux * distance, g.uy * distance, 0.4));
const recoil = (token, ux, uy, distance = gridSize() * 0.12, duration = 300) => nudge(token, duration, thereAndBack(ux * distance, uy * distance, 0.25));

/* -------------------------------------------- */
/*  Projectiles                                 */
/* -------------------------------------------- */

function arrowGraphic(kind) {
  const s = scaleOf(), g = new PIXI.Graphics(), length = (kind === "bolt" ? 30 : 44) * s, shaft = kind === "bolt" ? 3 * s : 2 * s;
  g.lineStyle(shaft, 0x6b4a2c).moveTo(-length, 0).lineTo(0, 0);
  g.lineStyle(0).beginFill(0xc9ccd2).drawPolygon([0, -4 * s, 9 * s, 0, 0, 4 * s]).endFill();
  g.beginFill(kind === "bolt" ? 0x2e2a28 : 0xe8e0d0).drawPolygon([-length, 0, -length + 9 * s, -5 * s, -length + 12 * s, 0, -length + 9 * s, 5 * s]).endFill();
  return g;
}
function bladeGraphic() {
  const s = scaleOf(), g = new PIXI.Graphics();
  g.beginFill(0xd8dce4).drawPolygon([0, -3 * s, 16 * s, 0, 0, 3 * s, -2 * s, 0]).endFill();
  g.beginFill(0x4a3426).drawRect(-9 * s, -2 * s, 8 * s, 4 * s).endFill();
  return g;
}

/**
 * Fly a projectile from `from` to `to`. `onNear` fires at 55% of the flight (a dodge starts before the bolt arrives).
 * Spell orbs leave element sparks behind; arrows keep a faint streak.
 */
async function fly(kind, from, to, { colors = ELEMENT_COLORS.mixed, onNear = null, speed = 1500, stick = false } = {}) {
  const layer = topLayer(), s = scaleOf(), dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
  const duration = Math.max(160, Math.min(650, dist / (speed * s) * 1000));
  let body;
  if (kind === "orb") {
    body = new PIXI.Container();
    const halo = new PIXI.Sprite(texture("soft")), core = new PIXI.Sprite(texture("soft"));
    for (const sprite of [halo, core]) { sprite.anchor.set(0.5); sprite.blendMode = ADD(); }
    halo.tint = colors[1]; halo.scale.set(46 * s / 64); core.tint = colors[0]; core.scale.set(18 * s / 64);
    body.addChild(halo, core);
  } else body = kind === "thrown" ? bladeGraphic() : arrowGraphic(kind);
  body.position.set(from.x, from.y); body.rotation = angle;
  layer.addChild(body);
  let near = false, sinceTrail = 0;
  await tween(duration, (e, t) => {
    if (body.destroyed) return;
    body.position.set(from.x + dx * e, from.y + dy * e);
    if (kind === "thrown") body.rotation += 0.6;
    if (!near && t >= 0.55) { near = true; onNear?.(); }
    sinceTrail += canvas.app.ticker.deltaMS;
    if (kind === "orb" && sinceTrail > 16) {
      sinceTrail = 0;
      particles(layer, 2, () => ({ x: body.x + rand(-4, 4) * s, y: body.y + rand(-4, 4) * s, vx: rand(-30, 30) * s, vy: rand(-30, 30) * s, life: rand(220, 420),
        size: rand(8, 16) * s, blend: ADD(), tints: colors, alpha: 0.8 }));
    }
  });
  if (!near) onNear?.();
  if (stick && kind !== "orb") {
    tween(1400, (e, t) => { if (!body.destroyed) body.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3; }).finally(() => body.destroy());
  } else body.destroy();
}

/* -------------------------------------------- */
/*  The exchange                                */
/* -------------------------------------------- */

/** Oils glow in the colour of the monsters they are made for. */
const OIL_GLOW = { necrophage: 0x7ac87a, specter: 0x8fe3f2, cursed: 0xb07cff, hybrid: 0xe0b050, insectoid: 0xb6d63a, vampire: 0xe04060, relict: 0x9a8aff,
  ogroid: 0xc89060, draconid: 0xff8a3a, elemental: 0x9ab8d8, beast: 0xd8b070, humanoid: 0xe8d8b0 };
/** A blade heated by Cadfan's Grasp leaves fire behind it; an oiled one, a coloured shimmer. */
function weaponTrail(actor, attack, item) {
  if (!actor || !attack?.itemId) return null;
  if (heatedWeapon(actor, attack.itemId)) return { color: 0xfff0c0, glow: 0xff5a10, embers: [0xffffff, 0xffc04a, 0xff4a10], fire: true };
  const oil = item && !attack.weaponSnapshot ? activeOil(item, attack.attackTime ?? game.time?.worldTime ?? 0) : null;
  const tone = oil ? OIL_GLOW[oil.target] ?? 0xe0c070 : null;
  return tone ? { color: 0xffffff, glow: tone, embers: [0xffffff, tone] } : null;
}

/** Sparks or embers shed along a stroke. */
function trailEmbers(center, angle, radius, trail) {
  const s = scaleOf();
  particles(topLayer(), trail.fire ? 26 : 14, () => {
    const a = angle + rand(-1.1, 1.1), d = radius * rand(0.2, 1.1), v = rand(40, 160) * s;
    return { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d, vx: Math.cos(a + Math.PI / 2) * v * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * v - (trail.fire ? 50 : 10) * s,
      drag: 1.8, life: rand(400, 900), size: rand(3, 6) * s, texture: "dot", blend: ADD(), tints: trail.embers, delay: rand(0, 160) };
  });
  if (trail.fire) particles(topLayer(), 8, () => ({ x: center.x + rand(-radius, radius) * 0.5, y: center.y + rand(-radius, radius) * 0.5, vx: 0, vy: -rand(30, 60) * s, life: rand(500, 800),
    size: rand(16, 26) * s, grow: 1, blend: ADD(), tints: [0xffd27a, 0xff6a1a, 0x8a2a10], alpha: 0.6, delay: rand(0, 120) }));
}

function attackStyle(attack, message) {
  const types = String(attack.damageTypes ?? "");
  if (attack.spell) {
    const spell = attack.spellUuid ? fromUuidSync(attack.spellUuid) : null;
    const element = spell?.system?.element ?? "mixed", ruleId = attack.ruleId ?? spell?.system?.ruleId ?? "";
    return { kind: "spell", ruleId, element, colors: ELEMENT_COLORS[element] ?? ELEMENT_COLORS.mixed, area: Boolean(spell && spellArea(spell.system)) };
  }
  const item = attack.weaponSnapshot ?? message.speakerActor?.items.get(attack.itemId), system = item?.system ?? {};
  const blow = types.includes("реж") ? "slash" : types.includes("кол") ? "pierce" : types.includes("дроб") ? "blunt" : "slash";
  if (attack.unarmed || system.skill === "brawling" || attack.special === "brawl") return { kind: "fist", blow: "blunt" };
  if (attack.thrown) return { kind: "thrown", blow, item };
  if (attack.ranged) return { kind: system.skill === "crossbow" ? "bolt" : "arrow", blow: "pierce", ammo: attack.ammunition?.ruleId ?? "", weapon: system.ruleId ?? "",
    long: /long|war-bow|длинн|армейск/u.test(`${system.ruleId ?? ""} ${item?.name ?? ""}`.toLocaleLowerCase("ru")) };
  return { kind: "melee", blow, claws: Boolean(system.natural) && blow === "slash", trail: weaponTrail(message.speakerActor, attack, item) };
}

function strikeMark(target, g, style) {
  const c = target.center, r = tokenRadius(target);
  if (style.kind === "spell") {
    glow(topLayer(), c.x, c.y, { color: style.colors[1], size: r * 2.2, to: 1.5, duration: 360 });
    ring(c.x, c.y, { radius: r * 1.2, color: style.colors[1], width: 6 * scaleOf(), duration: 420 });
    return particles(topLayer(), 22, () => {
      const a = rand(0, Math.PI * 2), v = rand(80, 260) * scaleOf();
      return { x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(300, 650), size: rand(10, 22) * scaleOf(), blend: ADD(), tints: style.colors, drag: 2 };
    });
  }
  if (style.blow === "blunt") {
    ring(c.x, c.y, { radius: r * 1.1, color: 0xfff1d6, width: 8 * scaleOf(), duration: 320 });
    return dust(c.x, c.y, { count: 7, radius: r * 0.6 });
  }
  if (style.blow === "pierce") return thrust(c, g.angle, r);
  if (style.trail) {
    trailEmbers(c, g.angle, r, style.trail);
    return slash(c, g.angle, r, { claws: style.claws, color: style.trail.color, glowColor: style.trail.glow, glowAlpha: 0.65 });
  }
  return slash(c, g.angle, r, { claws: style.claws });
}
function whiff(target, g, style) {
  if (style.kind !== "melee") return;
  const c = target.center, r = tokenRadius(target);
  return style.blow === "pierce" ? thrust(c, g.angle, r, { color: 0xd8d8d8, glowColor: 0x8899aa, duration: 220 })
    : (style.trail && trailEmbers(c, g.angle, r, style.trail), slash(c, g.angle, r, { color: style.trail?.color ?? 0xe6e6e6, glowColor: style.trail?.glow ?? 0x8899aa,
      alpha: style.trail ? 0.75 : 0.5, glowAlpha: style.trail ? 0.45 : 0.15, claws: style.claws, duration: 280 }));
}

/** The defender's answer when the blow does not land. */
function defend(target, attacker, g, mode, { limb = false, style }) {
  const r = tokenRadius(target), c = target.center, contact = { x: c.x - g.ux * r * 0.8, y: c.y - g.uy * r * 0.8 }, back = g.angle + Math.PI;
  switch (mode) {
    case "dodge": return dodge(target, g);
    case "reposition": return reposition(target, g);
    case "block":
      if (limb) { ring(contact.x, contact.y, { radius: r * 0.6, color: 0xfff1d6, duration: 260 }); dust(contact.x, contact.y, { count: 5, radius: r * 0.4 }); }
      else sparks(contact.x, contact.y, back, { count: style.kind === "arrow" || style.kind === "bolt" ? 10 : 18, colors: style.kind === "arrow" || style.kind === "bolt" ? [0xfff4d6, 0xc9a66b, 0x7a5a36] : undefined });
      recoil(target, g.ux, g.uy, gridSize() * 0.07);
      return;
    case "parry":
      sparks(contact.x, contact.y, back, { count: 26, spread: 1.5, speed: 650 });
      glow(topLayer(), contact.x, contact.y, { color: 0xffffff, size: r * 1.4, to: 1.3, duration: 180 });
      // Core p.164: a parry staggers the attacker.
      if (attacker && style.kind === "melee") recoil(attacker, -g.ux, -g.uy, gridSize() * 0.25, 450);
      return;
    case "slip":
      particles(topLayer(), 14, () => ({ x: c.x + rand(-r, r) * 0.6, y: c.y + rand(-r, r) * 0.6, vx: rand(-20, 20), vy: rand(-60, -20), life: rand(500, 900),
        size: rand(16, 30) * scaleOf(), blend: ADD(), tints: [0xe6fbff, 0x7fd0e0], alpha: 0.5 }));
      return fadeArtwork(target, 0.2, 800);
    case "resist": case "counter":
      return shatter(c.x, c.y, style.colors ?? ELEMENT_COLORS.mixed, r);
    default: return;
  }
}

/** A called shot that lands shows its body part over the target. */
function calledShot(target, attack) {
  if (!attack.location || attack.location === "random") return;
  setTimeout(() => import("./battle-fx.mjs").then(({ bodySilhouette }) => bodySilhouette(target, attack.location)), 260);
}

/** Play one attack roll against its defense: lunge or shot, then the hit or the defender's answer. */
export async function playExchange(defenseMessage) {
  const link = flagsOf(defenseMessage).exchange, attackMessage = game.messages.get(link?.attack), attack = flagsOf(attackMessage).weaponAttack;
  if (!attack?.target) return;
  const target = placedToken(attack.target), attacker = placedToken(attack.attacker) ?? speakerToken(attackMessage);
  if (!target || !attacker || attacker === target || !(seen(target) || seen(attacker))) return;
  const roll = attackRolls(attackMessage)[link.index], defenseTotal = link.none ? link.dc ?? 10 : defenseMessage.rolls[0]?.total;
  if (!roll || defenseTotal == null) return;
  const hit = roll.total > defenseTotal, quote = flagsOf(defenseMessage).defense, mode = link.none ? "none" : quote?.mode ?? "dodge";
  const style = attackStyle(attack, attackMessage), g = geometry(attacker, target), r = tokenRadius(target);
  const answer = () => hit ? null : defend(target, attacker, g, mode, { limb: Boolean(quote?.limb), style });

  if (style.kind === "melee" || style.kind === "fist") {
    lunge(attacker, g);
    await wait(120);
    if (hit) {
      strikeMark(target, g, style);
      recoil(target, g.ux, g.uy);
      flashTint(target, 0xff5a4a);
      calledShot(target, attack);
      return;
    }
    answer();
    if (mode !== "block" && mode !== "parry") whiff(target, g, style);
    return;
  }

  // Area magic already showed its wave on the template; only the outcome plays per target.
  if (style.kind === "spell" && style.area) {
    if (hit) { strikeMark(target, g, style); flashTint(target, style.colors[1]); } else answer();
    return;
  }
  if (style.kind === "spell") {
    const { spellShot } = await import("./spell-fx.mjs");
    const shot = spellShot(style.ruleId);
    if (shot) return shot({ attacker, target, g, hit, mode, answer, style });
  }
  if (style.kind === "spell" && ["sign.axii", "sign.puppet"].includes(style.ruleId)) {
    const { mindBeam } = await import("./sign-fx.mjs");
    await mindBeam(attacker, target, style.ruleId);
    if (hit) { const { mindSwirl } = await import("./sign-fx.mjs"); mindSwirl(target, style.ruleId); } else answer();
    return;
  }
  if (style.kind === "spell" && style.ruleId === "sign.firestream") {
    const { fireStream } = await import("./sign-fx.mjs");
    const stream = fireStream(attacker, target);
    await wait(380);
    if (hit) flashTint(target, 0xff8a3a, 600); else answer();
    return stream;
  }

  const stops = hit || mode === "block" || mode === "parry" || mode === "resist" || mode === "counter";
  // Bows, crossbows and thrown weapons have their own flight, look and leftovers.
  if (["arrow", "bolt", "thrown"].includes(style.kind)) {
    const { shoot, toss, projectileLook, thrownShape } = await import("./ranged-fx.mjs");
    const onNear = () => { if (!hit && ["dodge", "reposition", "slip"].includes(mode)) answer(); };
    if (style.kind === "thrown") await toss({ attacker, target, shape: thrownShape(style.item), hit, stops, onNear });
    else await shoot({ attacker, target, look: projectileLook(style), long: style.long, hit, stops, deflect: !hit && (mode === "block" || mode === "parry"), onNear });
    if (hit) { calledShot(target, attack); recoil(target, g.ux, g.uy); flashTint(target, 0xff5a4a); }
    else if (!["dodge", "reposition", "slip"].includes(mode)) answer();
    return;
  }
  const from = { x: g.a.x + g.ux * tokenRadius(attacker) * 0.7, y: g.a.y + g.uy * tokenRadius(attacker) * 0.7 };
  const to = stops ? { x: g.b.x - g.ux * r * 0.55, y: g.b.y - g.uy * r * 0.55 } : { x: g.b.x + g.ux * gridSize() * 1.6, y: g.b.y + g.uy * gridSize() * 1.6 };
  recoil(attacker, -g.ux, -g.uy, gridSize() * 0.06, 220);
  await fly(style.kind === "spell" ? "orb" : style.kind, from, to, { colors: style.colors, stick: hit && style.kind !== "thrown",
    onNear: () => { if (!hit && ["dodge", "reposition", "slip"].includes(mode)) answer(); } });
  if (hit) {
    calledShot(target, attack);
    if (style.kind === "spell") strikeMark(target, g, style);
    else { glow(topLayer(), to.x, to.y, { color: 0xffe2c0, size: r * 0.9, to: 1.4, duration: 180 }); }
    recoil(target, g.ux, g.uy);
    flashTint(target, style.kind === "spell" ? style.colors[1] : 0xff5a4a);
  } else if (!["dodge", "reposition", "slip"].includes(mode)) answer();
}

/* -------------------------------------------- */
/*  Damage                                      */
/* -------------------------------------------- */

const PALETTES = {
  blood: { colors: [0x9a0d12, 0x640609, 0x340204], mist: 0x4a0407, decal: 0x7a0a0f, texture: "drop", stains: true },
  ichor: { colors: [0xb6d63a, 0x6f9a1c, 0x34500c], mist: 0x3e5a10, decal: 0x5c7a18, texture: "drop", stains: true },
  ecto: { colors: [0xeafcff, 0x8fe3f2, 0x3c9fb5], mist: 0x8fe3f2, decal: null, texture: "soft", blend: true },
  debris: { colors: [0xd8cdb8, 0x9a8d78, 0x5a5046], mist: 0x8a7d68, decal: null, texture: "shard" }
};
function paletteOf(actor) {
  const category = actor?.type === "npc" ? actor.system?.creature?.category : "humanoid";
  return category === "specter" ? PALETTES.ecto : category === "elemental" ? PALETTES.debris : category === "insectoid" ? PALETTES.ichor : PALETTES.blood;
}

/* Floor stains: blood under the glyphs (540), scorch marks under the blood (535). The broom wipes both. */
const decals = [];
export const STAIN_LAYER = 540, SCORCH_LAYER = 535;
// Stains that never fade pile up; past the limit the oldest one goes.
const DECAL_LIMIT = 300;
export function dropDecal(x, y, size, rotation, tint, { elevation = 0, layer = STAIN_LAYER, alpha = 0.92, grow = 140, life = stainLifetime() } = {}) {
  const sprite = new PIXI.Sprite(texture(`splat${Math.floor(Math.random() * SPLATS)}`));
  sprite.anchor.set(0.5); sprite.position.set(x, y); sprite.rotation = rotation; sprite.tint = tint; sprite.alpha = alpha;
  groundLayer(elevation, layer).addChild(sprite);
  decals.push(sprite);
  while (decals.length > DECAL_LIMIT) forget(decals[0]);
  tween(grow, e => { if (!sprite.destroyed) sprite.scale.set(size / 256 * (0.5 + 0.5 * e)); }, ease.out);
  if (Number.isFinite(life)) setTimeout(() => {
    if (sprite.destroyed) return;
    tween(4000, e => { if (!sprite.destroyed) sprite.alpha = alpha * (1 - e); }).finally(() => forget(sprite));
  }, life);
  return sprite;
}
function forget(sprite) {
  if (!sprite.destroyed) sprite.destroy();
  const index = decals.indexOf(sprite);
  if (index >= 0) decals.splice(index, 1);
}

/* Stains on the tokens themselves: they ride along with the artwork and dry off after a while. */
const marked = new Map();
const MARKS_PER_TOKEN = 14;
let markLoop = false;
let markLayer = null;
function markContainer() {
  if (!markLayer || markLayer.destroyed) { markLayer = new PIXI.Container(); topLayer().addChildAt(markLayer, 0); }
  return markLayer;
}
/** Splash `count` stains on a token, landing around `angle` from its centre. */
export function stainToken(token, count, angle, tint, { spread = 0.8, size = 0.6, reach = 0.65 } = {}) {
  if (!token || token.destroyed || !count || !goreEnabled()) return;
  const key = token.document.uuid, entry = marked.get(key) ?? { token, marks: [] }, r = tokenRadius(token);
  entry.token = token;
  marked.set(key, entry);
  for (let i = 0; i < count; i++) {
    const a = angle + rand(-spread, spread), d = Math.sqrt(Math.random()) * reach * r;
    const sprite = new PIXI.Sprite(texture(`splat${Math.floor(Math.random() * SPLATS)}`));
    sprite.anchor.set(0.5); sprite.tint = tint; sprite.alpha = 0; sprite.visible = false; sprite.rotation = a + rand(-0.5, 0.5);
    markContainer().addChild(sprite);
    entry.marks.push({ sprite, dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: r * rand(0.5, 1.1) * size, age: -rand(60, 260), life: stainLifetime() * rand(0.8, 1.2) });
  }
  while (entry.marks.length > MARKS_PER_TOKEN) entry.marks.shift().sprite.destroy();
  if (markLoop) return;
  markLoop = true;
  loop(dt => {
    for (const [id, item] of marked) {
      // Foundry redraws a token on some updates: follow the new placeable instead of losing the stains.
      if (item.token.destroyed) { const fresh = fromUuidSync(id)?.object; if (fresh && !fresh.destroyed) item.token = fresh; }
      const mesh = item.token.mesh, alive = !item.token.destroyed && mesh && !mesh.destroyed;
      for (const mark of item.marks) {
        mark.age += dt;
        if (!alive || mark.age > mark.life + 3000 || mark.sprite.destroyed) { mark.done = true; if (!mark.sprite.destroyed) mark.sprite.destroy(); continue; }
        const sprite = mark.sprite;
        sprite.visible = mark.age > 0 && item.token.visible !== false;
        if (!sprite.visible) continue;
        sprite.position.set(mesh.position.x + mark.dx, mesh.position.y + mark.dy);
        sprite.scale.set(mark.size / 256 * (0.6 + 0.4 * ease.out(Math.min(1, mark.age / 140))));
        sprite.alpha = 0.95 * (mark.age > mark.life ? 1 - (mark.age - mark.life) / 3000 : 1);
      }
      item.marks = item.marks.filter(mark => !mark.done);
      if (!item.marks.length) marked.delete(id);
    }
    return marked.size > 0;
  }).finally(() => { markLoop = false; });
}

/** The blood dries and darkens: every stain fades to `factor` of its strength (the end of a fight). */
export function dimStains(factor = 0.55) {
  for (const sprite of decals) {
    if (sprite.destroyed) continue;
    const from = sprite.alpha;
    tween(2000, e => { if (!sprite.destroyed) sprite.alpha = from * (1 - (1 - factor) * e); });
  }
}

/** Wipe every stain off the floor and off the tokens at once. */
export function clearStains() {
  for (const sprite of decals.splice(0)) if (!sprite.destroyed) sprite.destroy();
  for (const item of marked.values()) for (const mark of item.marks) if (!mark.sprite.destroyed) mark.sprite.destroy();
  marked.clear();
}

function bleed(target, attacker, angle, { amount, critical, blow, palette, kill }) {
  const s = scaleOf(), c = target.center, r = tokenRadius(target), ux = Math.cos(angle), uy = Math.sin(angle);
  const spread = blow === "pierce" ? 0.3 : blow === "blunt" ? 1.4 : 0.75, power = critical ? 1.35 : 1;
  const blend = palette.blend ? ADD() : PIXI.BLEND_MODES.NORMAL;
  const origin = () => ({ x: c.x + ux * r * 0.2 + rand(-r, r) * 0.15, y: c.y + uy * r * 0.2 + rand(-r, r) * 0.15 });
  // Fine spray: many small fast drops stretched by their speed.
  particles(topLayer(), Math.round((16 + 46 * amount) * power), () => {
    const a = angle + rand(-spread, spread) * (Math.random() < 0.85 ? 1 : 1.8), v = rand(160, 680) * s * power, o = origin();
    return { ...o, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3.6, life: rand(300, 620), size: rand(2.5, 6) * s, texture: palette.texture,
      stretch: palette.texture === "drop" ? 0.006 : 0, spin: rand(-10, 10), tints: palette.colors, alpha: 1, fadePower: 3, fadeIn: 0.02, blend };
  });
  // Heavy globs: fewer, bigger, slower.
  particles(topLayer(), Math.round((4 + 8 * amount) * power), () => {
    const a = angle + rand(-spread, spread) * 0.8, v = rand(70, 280) * s * power, o = origin();
    return { ...o, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.6, life: rand(450, 800), size: rand(7, 13) * s * power, texture: palette.texture,
      stretch: palette.texture === "drop" ? 0.003 : 0, tints: palette.colors.slice(1), alpha: 1, fadePower: 4, fadeIn: 0.02, blend };
  });
  // A dark mist hanging for a moment.
  particles(topLayer(), 7, () => {
    const o = origin();
    return { ...o, vx: ux * rand(20, 70) * s, vy: uy * rand(20, 70) * s, life: rand(450, 750), size: r * rand(0.45, 0.8), grow: 1.1, alpha: 0.32, tint: palette.mist, blend };
  });
  if (!palette.decal || !goreEnabled()) return;
  const elevation = target.document.elevation, splats = Math.min(8, 2 + Math.round(amount * 5 + (critical ? 2 : 0)));
  for (let i = 0; i < splats; i++) {
    const along = rand(0.1, 1.9) * r, aside = rand(-0.5, 0.5) * r * (blow === "blunt" ? 2 : 1), size = r * rand(1.6, 2.8) * (critical ? 1.2 : 1) * (1 - along / r * 0.22);
    setTimeout(() => dropDecal(c.x + ux * along - uy * aside, c.y + uy * along + ux * aside, size, angle + rand(-0.35, 0.35), palette.decal, { elevation }), rand(140, 360));
  }
  // A trail of small drops further along the spray.
  for (let i = 0; i < 6 + Math.round(amount * 10); i++) {
    const along = rand(1.2, 3.4) * r, aside = rand(-0.6, 0.6) * r * (along / r) * spread;
    setTimeout(() => dropDecal(c.x + ux * along - uy * aside, c.y + uy * along + ux * aside, r * rand(0.35, 0.8), angle + rand(-0.3, 0.3), palette.decal, { elevation }), rand(220, 480));
  }
  if (kill) setTimeout(() => dropDecal(c.x + rand(-r, r) * 0.15, c.y + rand(-r, r) * 0.15, r * 6, rand(0, Math.PI * 2), palette.decal,
    { elevation, alpha: 0.95, grow: 2600, life: stainLifetime() * 2 }), 300);
  if (!palette.stains) return;
  // The wound itself, the side of the body the blood flies to, and whoever stands close in the spray.
  stainToken(target, 1 + Math.round(amount * 3 + (critical ? 2 : 0)), angle, palette.decal, { spread: 1.1, size: 0.7, reach: 0.55 });
  if (attacker && attacker !== target && Math.hypot(attacker.center.x - c.x, attacker.center.y - c.y) < gridSize() * 1.6 && Math.random() < 0.35 + amount * 0.6)
    stainToken(attacker, 1 + Math.round(amount * 2), angle + Math.PI, palette.decal, { spread: 0.7, size: 0.45, reach: 0.6 });
  for (const other of canvas.tokens.placeables) {
    if (other === target || other === attacker || other.document.hidden) continue;
    const dx = other.center.x - c.x, dy = other.center.y - c.y, d = Math.hypot(dx, dy);
    const facing = (dx * ux + dy * uy) / (d || 1);
    if (d < gridSize() * 1.9 && facing > Math.cos(spread + 0.2) && Math.random() < 0.3 + amount * 0.5)
      stainToken(other, 1 + Math.round(amount * 2), Math.atan2(dy, dx) + Math.PI, palette.decal, { spread: 0.6, size: 0.45, reach: 0.65 });
  }
}

/** Fire does not bleed: the hit chars, smokes and throws embers, and leaves soot on the floor. */
function scorch(target, { amount, critical }) {
  const s = scaleOf(), c = target.center, r = tokenRadius(target);
  glow(topLayer(), c.x, c.y, { color: 0xff8a2a, size: r * 2.6, to: 1.3, duration: 520, alpha: 0.7 });
  particles(topLayer(), Math.round(18 + 30 * amount), () => {
    const a = rand(0, Math.PI * 2), v = rand(60, 260) * s;
    return { x: c.x + rand(-r, r) * 0.4, y: c.y + rand(-r, r) * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * s, drag: 1.6, life: rand(600, 1200),
      size: rand(3, 6) * s, texture: "dot", blend: ADD(), tints: [0xffffff, 0xffc04a, 0xff4a10] };
  });
  particles(topLayer(), 10, () => ({ x: c.x + rand(-r, r) * 0.5, y: c.y + rand(-r, r) * 0.5, vx: rand(-15, 15) * s, vy: rand(-60, -25) * s, life: rand(1200, 2000),
    size: r * rand(0.5, 0.9), grow: 1.3, alpha: 0.35, tint: 0x2e2622, fadeIn: 0.25, delay: rand(0, 300) }));
  for (let i = 0; i < 2 + Math.round(amount * 3 + (critical ? 1 : 0)); i++)
    dropDecal(c.x + rand(-r, r) * 0.7, c.y + rand(-r, r) * 0.7, r * rand(1.6, 2.6), rand(0, Math.PI * 2), 0x1e1814,
      { elevation: target.document.elevation, layer: SCORCH_LAYER, alpha: 0.55, grow: 600 });
}

/** A blast victim: thrown back from the centre, blood or a burn by the damage taken, and the number. */
export function blastWound(target, center, { total = 0, before = null, fire = false } = {}) {
  if (!target || target.destroyed || !seen(target)) return;
  const c = target.center, r = tokenRadius(target), s = scaleOf(), angle = Math.atan2(c.y - center.y, c.x - center.x);
  const push = gridSize() * 0.22;
  nudge(target, 420, thereAndBack(Math.cos(angle) * push, Math.sin(angle) * push, 0.25));
  const text = (content, fill, size = 30) => canvas.interface.createScrollingText({ x: c.x, y: c.y - r * 0.5 }, content, {
    anchor: CONST.TEXT_ANCHOR_POINTS.TOP, direction: CONST.TEXT_ANCHOR_POINTS.TOP, jitter: 0.3, duration: 2000, distance: r * 1.1,
    fontSize: size * s, fill, stroke: 0x140808, strokeThickness: 5 * s, fontFamily: "Palatino Linotype, Book Antiqua, Georgia, serif", fontWeight: "bold" });
  if (!(total > 0)) { text("0", 0xd8e0ea, 24); return; }
  const max = Math.max(1, target.actor?.system?.health?.max ?? 30), amount = Math.min(1, total / (max * 0.5));
  const kill = Number.isFinite(before) && before > 0 && before - total <= 0;
  if (fire) scorch(target, { amount, critical: false });
  bleed(target, null, angle, { amount: fire ? amount * 0.5 : amount, critical: false, blow: "blunt", palette: paletteOf(target.actor), kill });
  flashTint(target, fire ? 0xff7a2a : 0xd02a20, 450);
  text(`−${total}`, 0xff5a4a, 32);
}

/** HP actually lost: blood (or ichor, ectoplasm, stone chips) thrown away from the attacker, and a falling number. */
export async function playDamage(appliedMessage) {
  const link = flagsOf(appliedMessage).exchange, attackMessage = game.messages.get(link?.attack), attack = flagsOf(attackMessage).weaponAttack;
  const target = placedToken(attack?.target);
  if (!target || !seen(target)) return;
  const attacker = placedToken(attack.attacker) ?? speakerToken(attackMessage);
  const angle = attacker && attacker !== target ? geometry(attacker, target).angle : rand(0, Math.PI * 2);
  const c = target.center, r = tokenRadius(target), s = scaleOf(), total = Number(link.total) || 0;
  const style = attackStyle(attack, attackMessage);
  const text = (content, fill, size = 30, lift = 0.6, jitter = 0.3) => canvas.interface.createScrollingText({ x: c.x, y: c.y - r * lift }, content, {
    anchor: CONST.TEXT_ANCHOR_POINTS.TOP, direction: CONST.TEXT_ANCHOR_POINTS.TOP, jitter, duration: 2000, distance: r * 1.1,
    fontSize: size * s, fill, stroke: 0x140808, strokeThickness: 5 * s, fontFamily: "Palatino Linotype, Book Antiqua, Georgia, serif", fontWeight: "bold" });

  if (link.immune || total <= 0) {
    const back = angle + Math.PI;
    if (link.armorHeld) sparks(c.x - Math.cos(angle) * r * 0.6, c.y - Math.sin(angle) * r * 0.6, back, { count: 14, colors: [0xffffff, 0xd8e0ea, 0x8aa0b8] });
    text(link.immune ? "Иммунитет" : link.armorHeld ? "Броня" : "0", 0xd8e0ea, 24);
    return;
  }
  if (link.nonLethal) {
    ring(c.x, c.y, { radius: r, color: 0xffe8a0, width: 6 * s, duration: 380 });
    text(`−${total} ВЫН`, 0xffe08a);
    return;
  }
  const health = target.actor?.system?.health, max = Math.max(1, health?.max ?? 30), amount = Math.min(1, total / (max * 0.5));
  const kill = Number.isFinite(link.from) && link.from > 0 && link.from - total <= 0;
  // Fire chars the ground and still opens wounds, only less blood than a blade.
  const fire = style.kind === "spell" && style.element === "fire";
  if (fire) scorch(target, { amount, critical: Boolean(link.critical) });
  bleed(target, attacker, angle, { amount: fire ? amount * 0.5 : amount, critical: Boolean(link.critical), blow: style.blow ?? (style.kind === "spell" ? "blunt" : "slash"),
    palette: paletteOf(target.actor), kill });
  flashTint(target, style.element === "fire" ? 0xff7a2a : 0xd02a20, 450);
  if (link.critical) {
    nudge(target, 380, t => ({ x: Math.sin(t * 40) * 4 * s * (1 - t), y: Math.cos(t * 33) * 3 * s * (1 - t) }));
    text("Крит!", 0xffc24a, 22, 1.25, 0);
    await wait(150);
  }
  text(`−${total}`, 0xff5a4a, link.critical ? 40 : 32, 0.5, link.critical ? 0 : 0.3);
}
