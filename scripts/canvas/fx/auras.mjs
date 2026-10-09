import { SYSTEM_ID } from "../../config.mjs";
import { topLayer, particles, glow, loop, rand, ease, gridSize, tokenRadius, seen, canPlay, fxEnabled, flashTint, texture, nudge, goreEnabled } from "./fx-core.mjs";
import { ring, dust, shatter, dropDecal } from "./combat-fx.mjs";
import { FIRE, makeRoots, drawRoots, drawSigil, hexSigil } from "./spell-fx.mjs";
import { drawVeins } from "./table-fx.mjs";
import { toxicityState } from "../../data/consumables.mjs";

// Lasting effects that ride on a token while something real holds: a shield, a fire, roots, a hex, heat, a ritual.
// Every type reads the actor; a scan creates what appeared (with an entrance when someone watches) and ends what is gone.

const ADD = () => PIXI.BLEND_MODES.ADD;
const scaleOf = () => gridSize() / 100;
const flagsOf = document => document?.flags?.[SYSTEM_ID] ?? {};
const activeEffects = actor => Array.from(actor?.effects ?? []).filter(effect => !effect.disabled && !effect.duration?.expired);
const QUEN = 0xffc85a;

/** A container on the top layer that follows the artwork. */
function shell(...children) {
  const root = new PIXI.Container();
  root.addChild(...children);
  topLayer().addChild(root);
  return root;
}

const TYPES = {
  /* Quen and Active Shield (core p.114): a golden dome; it flares when struck and shatters when spent. */
  quen: {
    find: actor => { const effect = activeEffects(actor).find(entry => flagsOf(entry).magicShield?.hp > 0); return effect ? { hp: flagsOf(effect).magicShield.hp } : null; },
    create(token, intro) {
      const s = scaleOf(), body = new PIXI.Graphics(), plates = new PIXI.Graphics();
      body.blendMode = plates.blendMode = ADD();
      const r = tokenRadius(token) * 1.18;
      body.beginFill(QUEN, 0.1).lineStyle(16 * s, QUEN, 0.16).drawCircle(0, 0, r).endFill().lineStyle(3.5 * s, 0xffb030, 0.9).drawCircle(0, 0, r);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; plates.lineStyle(4 * s, 0xfff1c4, 0.75).arc(0, 0, r * 0.93, a + 0.12, a + Math.PI / 3 - 0.12); }
      const root = shell(body, plates);
      if (intro) {
        const c = token.center;
        particles(topLayer(), 30, () => {
          const a = rand(0, Math.PI * 2), v = rand(60, 160) * s;
          return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, vx: -Math.cos(a) * v, vy: -Math.sin(a) * v, life: rand(400, 700), size: rand(4, 7) * s,
            texture: "dot", blend: ADD(), tints: [0xffffff, QUEN], drag: 1 };
        });
      }
      return { root, time: intro ? 0 : 1000, flash: intro ? 1 : 0,
        changed(data, before) { if (before && data.hp < before.hp) this.flash = 1; },
        update(dt, c) {
          this.time += dt;
          root.position.set(c.x, c.y);
          const k = Math.min(1, this.time / 600);
          root.scale.set(0.3 + 0.7 * ease.outBack(k));
          plates.rotation += dt / 1000 * 0.4;
          this.flash = Math.max(0, this.flash - dt / 500);
          root.alpha = Math.min(1, (0.6 + 0.15 * Math.sin(this.time / 450)) * k + this.flash * 0.6);
        },
        end(c, broken) { if (broken) shatter(c.x, c.y, [0xffffff, QUEN, 0xb07a20], tokenRadius(token)); }
      };
    }
  },

  /* Burning: tongues of flame licking up the body. */
  burning: {
    find: actor => actor?.statuses?.has?.("burning") ? {} : null,
    create(token) {
      return { update(dt, c, show) {
        if (!show || Math.random() > dt / 22) return;
        const r = tokenRadius(token), s = scaleOf();
        particles(topLayer(), 1, () => ({ x: c.x + rand(-r, r) * 0.65, y: c.y + rand(-r * 0.2, r * 0.7), vx: rand(-12, 12) * s, vy: rand(-110, -60) * s, life: rand(450, 800),
          size: rand(20, 34) * s, grow: -0.55, blend: ADD(), tints: [0xffe08a, 0xff9a30, 0xe0461b, 0x7a2010], alpha: 0.95, fadeIn: 0.15 }));
      }, end(c, broken) { if (broken) dust(c.x, c.y, { count: 8, radius: tokenRadius(token) * 0.7, color: 0x4a4440, alpha: 0.4 }); } };
    }
  },

  /* Talfryn's Prison (core p.104): roots climb out of the floor and wrap the victim; they splinter when it breaks free. */
  roots: {
    find: actor => activeEffects(actor).some(effect => flagsOf(effect).spellMarker === "spell.talfryn-prison") ? {} : null,
    create(token, intro) {
      const s = scaleOf(), g = new PIXI.Graphics(), roots = makeRoots(8), root = shell(g);
      if (intro) dust(token.center.x, token.center.y, { count: 14, radius: tokenRadius(token), color: 0x6a5238, alpha: 0.5 });
      let time = intro ? 0 : 1200, sway = 0;
      return { root, update(dt, c) {
        time += dt; sway += dt / 900;
        root.position.set(c.x, c.y);
        const growth = ease.out(Math.min(1, time / 1100));
        if (growth < 1 || Math.round(sway * 10) % 3 === 0) drawRoots(g, roots, tokenRadius(token), growth, s, Math.sin(sway) * 0.4);
      }, end(c, broken) {
        if (!broken) return;
        particles(topLayer(), 26, () => {
          const a = rand(0, Math.PI * 2), v = rand(90, 240) * s;
          return { x: c.x + Math.cos(a) * tokenRadius(token) * 0.8, y: c.y + Math.sin(a) * tokenRadius(token) * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.6,
            life: rand(450, 800), size: rand(6, 12) * s, texture: "shard", spin: rand(-14, 14), tints: [0x8f6a3c, 0x3a2414] };
        });
      } };
    }
  },

  /* A hex (core pp.120–121): the curse's sigil lies faintly under the victim, dark motes crawl over it. Lifted: a clean light. */
  hex: {
    find: actor => activeEffects(actor).some(effect => flagsOf(effect).hexEffect) ? {} : null,
    create(token, intro) {
      const s = scaleOf(), g = new PIXI.Graphics(), root = shell(g);
      drawSigil(g, tokenRadius(token) * 1.05, s, 0x5a2a80);
      if (intro) hexSigil(token);
      let time = 0;
      return { root, update(dt, c, show) {
        time += dt;
        root.position.set(c.x, c.y);
        g.rotation += dt / 1000 * 0.15;
        root.alpha = (0.22 + 0.08 * Math.sin(time / 700)) * Math.min(1, time / 1200);
        if (!show) return;
        const r = tokenRadius(token);
        // The itch: tiny dark specks scurrying over the body, a wisp now and then.
        if (Math.random() < dt / 70) particles(topLayer(), 1, () => {
          const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r * 0.7;
          return { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, vx: rand(-60, 60) * s, vy: rand(-60, 60) * s, drag: 4, life: rand(300, 600), size: rand(3, 5) * s,
            texture: "dot", tints: [0x2a0f3a, 0x6a3a90] };
        });
        if (Math.random() < dt / 600) particles(topLayer(), 1, () => ({ x: c.x + rand(-r, r) * 0.5, y: c.y + rand(-r, r) * 0.3, vx: rand(-8, 8) * s, vy: -rand(25, 50) * s,
          life: rand(1100, 1700), size: r * rand(0.3, 0.5), grow: 1, alpha: 0.35, tint: 0x2a1238, fadeIn: 0.3 }));
      }, end(c, broken) {
        if (!broken) return;
        const r = tokenRadius(token);
        glow(topLayer(), c.x, c.y, { color: 0xfff4d0, size: r * 2.6, to: 1.4, duration: 700, alpha: 0.8 });
        ring(c.x, c.y, { radius: r * 1.6, color: 0xfff0c0, width: 6 * s, duration: 700 });
      } };
    }
  },

  /* Cadfan's Grasp on a weapon (core p.103): the metal glows red-hot and spits sparks while it lasts. */
  heat: {
    find: actor => activeEffects(actor).some(effect => flagsOf(effect).heatedWeapon) ? {} : null,
    create(token, intro) {
      const s = scaleOf(), root = new PIXI.Container(), heat = new PIXI.Sprite(texture("soft"));
      heat.anchor.set(0.5); heat.blendMode = ADD(); heat.tint = 0xff4a1a;
      root.addChild(heat); topLayer().addChild(root);
      if (intro) { glow(topLayer(), token.center.x, token.center.y, { color: 0xff6a2a, size: tokenRadius(token) * 3, to: 1.3, duration: 700 }); flashTint(token, 0xff6a2a, 900); }
      let time = 0;
      return { root, update(dt, c, show) {
        time += dt;
        root.position.set(c.x, c.y);
        const r = tokenRadius(token);
        heat.scale.set(r * 2.3 / 64);
        heat.alpha = 0.28 + 0.12 * Math.sin(time / 260) + 0.05 * Math.sin(time / 71);
        if (show && Math.random() < dt / 90) particles(topLayer(), 1, () => ({ x: c.x + rand(-r, r) * 0.6, y: c.y + rand(-r, r) * 0.5, vx: rand(-40, 40) * s, vy: -rand(60, 140) * s,
          drag: 1, life: rand(400, 800), size: rand(2.5, 4.5) * s, texture: "dot", blend: ADD(), tints: [0xffffff, 0xffc04a, 0xff4a10] }));
      }, end(c, broken) { if (broken) dust(c.x, c.y, { count: 8, radius: tokenRadius(token) * 0.6, color: 0xd8d0c8, alpha: 0.3 }); } };
    }
  },

  /* Pyromancy (core p.117): while the ritual is held, a ring of small fires burns around the mage. */
  pyromancy: {
    find: actor => actor?.items?.get?.(actor.system?.magic?.sustainedId)?.system?.ruleId === "ritual.pyromancy" ? {} : null,
    create(token, intro) {
      const s = scaleOf(), flames = 8, root = new PIXI.Container(), base = new PIXI.Sprite(texture("soft"));
      base.anchor.set(0.5); base.blendMode = ADD(); base.tint = 0xff8a2a;
      root.addChild(base); topLayer().addChild(root);
      let time = intro ? 0 : 5000;
      return { root, update(dt, c, show) {
        time += dt;
        const r = tokenRadius(token) * 1.35;
        root.position.set(c.x, c.y);
        base.scale.set(r * 2.6 / 64);
        base.alpha = 0.18 + 0.06 * Math.sin(time / 300);
        if (!show) return;
        for (let i = 0; i < flames; i++) {
          // Intro: the fires catch one after another around the circle.
          if (time < i * 140 || Math.random() > dt / 55) continue;
          const a = i / flames * Math.PI * 2 + time / 6000;
          particles(topLayer(), 1, () => ({ x: c.x + Math.cos(a) * r + rand(-3, 3) * s, y: c.y + Math.sin(a) * r, vx: rand(-8, 8) * s, vy: -rand(50, 90) * s, life: rand(380, 620),
            size: rand(12, 20) * s, grow: -0.5, blend: ADD(), tints: FIRE.slice(0, 4), alpha: 0.95, fadeIn: 0.12 }));
        }
        if (Math.random() < dt / 400) particles(topLayer(), 1, () => {
          const a = rand(0, Math.PI * 2);
          return { x: c.x + Math.cos(a) * r * 0.6, y: c.y + Math.sin(a) * r * 0.6, vx: -Math.sin(a) * 20 * s, vy: Math.cos(a) * 20 * s - 15 * s, life: rand(1600, 2400),
            size: r * rand(0.35, 0.6), grow: 1.1, alpha: 0.22, tint: 0x3a302c, fadeIn: 0.3 };
        });
      }, end(c, broken) { if (broken) dust(c.x, c.y, { count: 10, radius: tokenRadius(token) * 1.2, color: 0x4a4440, alpha: 0.4 }); } };
    }
  },

  /* Heavy toxicity (core p.249): dark veins stand out on a witcher full of potions, pulsing more as the limit nears. */
  toxic: {
    find: actor => { const state = actor?.system?.details?.race === "witcher" ? toxicityState(actor) : null; return state && state.percent >= 60 ? { percent: state.percent } : null; },
    create(token) {
      const s = scaleOf(), g = new PIXI.Graphics(), root = shell(g), seed = Math.floor(rand(1, 1000));
      let time = 0, percent = 60;
      return { root, changed(data) { percent = data.percent; }, update(dt, c) {
        time += dt;
        root.position.set(c.x, c.y);
        const strength = (0.25 + (percent - 60) / 40 * 0.35) * (0.75 + 0.25 * Math.sin(time / 420)) * Math.min(1, time / 1500);
        if (Math.round(time / 60) % 2 === 0) drawVeins(g, tokenRadius(token), s, seed, Math.min(0.75, strength));
      } };
    }
  },

  /* Stunned or staggered: little stars circle the head (fast and gold when stunned, a few pale ones when staggered). */
  stars: {
    find: actor => actor?.statuses?.has?.("stunned") ? { heavy: true } : actor?.statuses?.has?.("staggered") ? { heavy: false } : null,
    create(token) {
      const s = scaleOf(), g = new PIXI.Graphics(), root = shell(g);
      g.blendMode = ADD();
      let time = 0, heavy = true;
      const star = (x, y, size, alpha, color) => {
        const points = [];
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? size * 0.42 : size; points.push(x + Math.cos(a) * d, y + Math.sin(a) * d); }
        g.beginFill(color, alpha).drawPolygon(points).endFill();
      };
      return { root, changed(data) { heavy = data.heavy; }, update(dt, c) {
        time += dt;
        root.position.set(c.x, c.y);
        const r = tokenRadius(token), count = heavy ? 5 : 3, speed = heavy ? 2.6 : 1.6;
        g.clear();
        for (let i = 0; i < count; i++) {
          const a = time / 1000 * speed + i / count * Math.PI * 2, depth = (Math.sin(a) + 1) / 2;
          star(Math.cos(a) * r * 0.55, -r * 0.9 + Math.sin(a) * r * 0.16, (heavy ? 7 : 5.5) * s * (0.7 + depth * 0.5), 0.45 + depth * 0.55, heavy ? 0xffe08a : 0xdce8ff);
        }
        root.alpha = Math.min(1, time / 300);
      } };
    }
  },

  /* Knocked down: the token falls on its side with a puff of dust, and gets up when the status ends. */
  prone: {
    find: actor => actor?.statuses?.has?.("prone") ? {} : null,
    create(token, intro) {
      if (intro) dust(token.center.x, token.center.y, { count: 12, radius: tokenRadius(token) * 0.9, alpha: 0.45 });
      let time = intro ? 0 : 1000;
      return { update(dt) {
        time += dt;
        if (!token.mesh || token.destroyed) return;
        const base = token.document.lockRotation ? 0 : token.document.rotation, k = ease.outBack(Math.min(1, time / 450));
        token.mesh.angle = base + 90 * k;
      }, end(c, broken) {
        if (!token.destroyed) { token.renderFlags.set({ refreshRotation: true }); token.applyRenderFlags?.(); }
        if (broken) dust(c.x, c.y, { count: 6, radius: tokenRadius(token) * 0.6, alpha: 0.35 });
      } };
    }
  },

  /* Bleeding: drops fall from the body and spot the floor now and then. */
  bleeding: {
    find: actor => actor?.statuses?.has?.("bleeding") ? {} : null,
    create(token) {
      let sinceDrop = 0, sinceStain = 2500;
      return { update(dt, c, show) {
        if (!show) return;
        const s = scaleOf(), r = tokenRadius(token);
        sinceDrop += dt; sinceStain += dt;
        if (sinceDrop > 320) {
          sinceDrop = rand(0, 120);
          particles(topLayer(), 1, () => ({ x: c.x + rand(-r, r) * 0.45, y: c.y + rand(0, r) * 0.4, vx: rand(-6, 6) * s, vy: rand(20, 50) * s, gravity: { x: 0, y: 420 * s },
            life: rand(420, 620), size: rand(4, 6) * s, texture: "drop", stretch: 0.004, tints: [0x9a0d12, 0x5a0408], alpha: 1, fadePower: 4, fadeIn: 0.02 }));
        }
        if (sinceStain > 5000 && goreEnabled()) {
          sinceStain = 0;
          dropDecal(c.x + rand(-r, r) * 0.5, c.y + r * rand(0.3, 0.9), r * rand(0.35, 0.6), rand(0, Math.PI * 2), 0x7a0a0f, { elevation: token.document.elevation, alpha: 0.85 });
        }
      } };
    }
  },

  /* Blinded: a dark veil across the eyes. */
  blinded: {
    find: actor => actor?.statuses?.has?.("blinded") ? {} : null,
    create(token) {
      const veil = new PIXI.Sprite(texture("soft")), band = new PIXI.Graphics(), root = shell(veil, band);
      veil.anchor.set(0.5); veil.tint = 0x000000;
      let time = 0;
      return { root, update(dt, c) {
        time += dt;
        const r = tokenRadius(token);
        root.position.set(c.x, c.y - r * 0.32 + Math.sin(time / 900) * r * 0.03);
        veil.width = r * 2.3; veil.height = r * 0.95; veil.alpha = 0.85;
        band.clear().beginFill(0x0a0808, 0.55).drawEllipse(0, 0, r * 0.8, r * 0.13).endFill();
        root.alpha = Math.min(1, time / 500);
      } };
    }
  },

  /* Critical wounds: a bandage where each one struck; a wounded leg makes the token limp. */
  wounds: {
    find: actor => {
      const wounds = activeEffects(actor).map(effect => flagsOf(effect).criticalWound).filter(Boolean);
      return wounds.length ? { key: wounds.map(wound => `${wound.id}:${wound.location}:${wound.arm}:${wound.state}`).join("|"), wounds } : null;
    },
    create(token) {
      const s = scaleOf(), g = new PIXI.Graphics(), root = shell(g);
      const PLACE = { head: [0, -0.62], torso: [0.2, -0.04], rightArm: [-0.64, -0.08], leftArm: [0.64, -0.08], rightLeg: [-0.3, 0.62], leftLeg: [0.3, 0.62], tail: [0.58, 0.55] };
      let wounds = [], key = "", time = 0, nextLimp = 1500;
      const draw = () => {
        const r = tokenRadius(token), used = {};
        g.clear();
        for (const wound of wounds) {
          const place = PLACE[wound.arm] ? wound.arm : PLACE[wound.location] ? wound.location : "torso";
          const shift = (used[place] = (used[place] ?? -1) + 1);
          const [px, py] = PLACE[place], x = px * r + shift * 6 * s, y = py * r + shift * 5 * s, w = r * 0.36, h = r * 0.13;
          const angle = ((px * 7 + py * 13 + shift) % 1) - 0.5;
          const cos = Math.cos(angle), sin = Math.sin(angle), corner = (u, v) => [x + u * cos - v * sin, y + u * sin + v * cos];
          g.lineStyle(1 * s, 0x8a7a64, 0.9).beginFill(0xf1e8d6, 0.96).drawPolygon([...corner(-w / 2, -h / 2), ...corner(w / 2, -h / 2), ...corner(w / 2, h / 2), ...corner(-w / 2, h / 2)]).endFill();
          for (const u of [-w / 4, w / 4]) g.lineStyle(0.8 * s, 0xb8a888, 0.9).moveTo(...corner(u, -h / 2)).lineTo(...corner(u, h / 2));
          g.lineStyle(0).beginFill(0x8a0c10, wound.state === "fresh" ? 0.9 : 0.55).drawCircle(...corner(rand(-w, w) * 0.15, 0), h * (wound.state === "fresh" ? 0.42 : 0.3)).endFill();
        }
      };
      const limping = () => wounds.some(wound => /leg/.test(wound.id) || ["rightLeg", "leftLeg"].includes(wound.location));
      return { root, changed(data) { if (data.key !== key) { key = data.key; wounds = data.wounds; draw(); } }, update(dt, c, show) {
        time += dt;
        root.position.set(c.x, c.y);
        if (!wounds.length) return;
        nextLimp -= dt;
        if (show && nextLimp <= 0 && limping()) {
          nextLimp = 3200;
          nudge(token, 700, t => ({ x: Math.sin(t * Math.PI * 2) * 2 * s, y: Math.abs(Math.sin(t * Math.PI * 2)) * 3 * s }));
        }
      } };
    }
  },

  /* Dead: the token stays drained of colour. */
  dead: {
    find: actor => actor?.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") ? {} : null,
    create(token) {
      return { update() { if (token.mesh && !token.destroyed) token.mesh.tint = 0x8a8a8a; }, end() { if (!token.destroyed) { token.renderFlags.set({ refreshMesh: true }); token.applyRenderFlags?.(); } } };
    }
  },

  /* Puppet (core p.114): violet threads run up from the limbs to an unseen hand. */
  puppet: {
    find: actor => activeEffects(actor).some(effect => flagsOf(effect).spellMarker === "sign.puppet") ? {} : null,
    create(token, intro) {
      const s = scaleOf(), g = new PIXI.Graphics(), root = shell(g);
      g.blendMode = ADD();
      let time = intro ? 0 : 1000;
      return { root, update(dt, c) {
        time += dt;
        root.position.set(c.x, c.y);
        const r = tokenRadius(token), sway = Math.sin(time / 700) * r * 0.12, k = ease.out(Math.min(1, time / 800)), top = -r * (1.1 + 0.9 * k);
        g.clear();
        g.lineStyle(2 * s, 0xd08cff, 0.75).moveTo(-r * 0.5 + sway, top).lineTo(r * 0.5 + sway, top);
        for (const [x, y] of [[-r * 0.45, -r * 0.1], [r * 0.45, -r * 0.1], [-r * 0.25, r * 0.55], [r * 0.25, r * 0.55], [0, -r * 0.45]]) {
          g.lineStyle(1.4 * s, 0xe6c0ff, 0.6).moveTo(x, y).lineTo(x * 0.6 + sway, top);
          g.lineStyle(0).beginFill(0xf0d8ff, 0.9).drawCircle(x, y, 2.2 * s).endFill();
        }
        root.alpha = k;
      } };
    }
  }
};

/* -------------------------------------------- */
/*  Scan and frame loop                         */
/* -------------------------------------------- */

const live = new Map();
let settled = false, running = false;

/** Match the auras to the tokens. Auras that appear after the first scan of a scene get their entrance. */
export function syncAuras() {
  if (!canvas.ready) return;
  if (!fxEnabled()) return clearAuras();
  const present = new Set();
  for (const token of canvas.tokens.placeables) {
    if (!token.actor) continue;
    for (const [type, spec] of Object.entries(TYPES)) {
      let data = null;
      try { data = spec.find(token.actor); } catch { data = null; }
      if (!data) continue;
      const key = `${token.document.uuid}:${type}`;
      present.add(key);
      const entry = live.get(key);
      if (!entry) {
        try {
          const aura = spec.create(token, settled && canPlay());
          aura.changed?.(data, null);
          live.set(key, { token, data, aura });
        } catch (error) { console.error(`${SYSTEM_ID} | FX aura`, error); }
        continue;
      }
      entry.aura.changed?.(data, entry.data);
      entry.data = data; entry.token = token;
    }
  }
  for (const [key, entry] of live) if (!present.has(key)) end(key, entry, settled && canPlay() && !entry.token.destroyed);
  settled = true;
  if (live.size && !running) run();
}
function end(key, entry, broken) {
  live.delete(key);
  try { if (!entry.token.destroyed) entry.aura.end?.(entry.token.mesh?.position ?? entry.token.center, broken); } catch (error) { console.error(`${SYSTEM_ID} | FX aura`, error); }
  if (entry.aura.root && !entry.aura.root.destroyed) entry.aura.root.destroy({ children: true });
}
export function clearAuras() {
  for (const [key, entry] of live) end(key, entry, false);
}
/** A new scene starts without entrances for what is already there. */
export function resetAuras() {
  live.clear();
  settled = false;
  running = false;
}

function run() {
  running = true;
  loop(dt => {
    if (!canvas.ready || !live.size) return false;
    for (const [key, entry] of live) try {
      const token = entry.token;
      if (token.destroyed || !token.mesh || token.mesh.destroyed) continue;
      const show = seen(token) && token.visible !== false && canPlay();
      if (entry.aura.root) entry.aura.root.visible = show;
      entry.aura.update(dt, token.mesh.position, show);
    } catch (error) { console.error(`${SYSTEM_ID} | FX aura`, error); end(key, entry, false); }
    return true;
  }).finally(() => { running = false; });
}
