import { SYSTEM_ID } from "../config.mjs";
import { attackerToken, tokenCenter } from "../combat/attack-target.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Core p.168 «Зона действия»: everyone inside an area defends against the same casting check. The book gives no
// cone angle; 90° matches the quarter-circle the system already uses for forward cones (p.152).
export const SPELL_CONE_ANGLE = 90;

// Areas placed at a distance, or with a size the Range field does not carry (all sizes in metres).
const PLACED = {
  "spell.tanio-ilchar": { type: "rectangle", width: 2, height: 2, reach: 8 },
  "spell.ice-slick": { type: "rectangle", width: 2, height: 2, reach: 10 },
  "spell.stammelford-tremor": { type: "circle", radius: 5, reach: 30 },
  "spell.flaming-vortex": { type: "circle", radius: 1, reach: 10 },
  "spell.alzur-thunder": { type: "line", length: 25 }
};
const AROUND = {
  "invocation.symbol-hidden": { type: "circle", radius: 1.5 },
  "ritual.consecration": { type: "circle", radius: 10 },
  "ritual.magic-barrier": { type: "circle", radius: 5 }
};

/**
 * The template of a piece of magic, or null. `origin: "caster"` is fixed on the caster (cones and lines turn
 * towards the cursor); `origin: "point"` follows the cursor within `reach` metres. Yrden keeps its own zone.
 */
export function spellArea(system = {}) {
  const id = system.ruleId ?? "", range = system.range ?? {};
  if (id === "sign.yrden") return null;
  const sustained = !["instant"].includes(system.duration?.kind);
  if (PLACED[id]) return { ...PLACED[id], origin: PLACED[id].type === "line" ? "caster" : "point" };
  // A consecrated circle, a barrier or a hiding place stays where it was made.
  if (AROUND[id]) return { ...AROUND[id], origin: "caster", attach: false };
  if (!(system.target ?? []).includes("area")) return null;
  if (range.kind === "cone" && range.value > 0) return { type: "cone", radius: range.value, origin: "caster" };
  if (range.kind === "radius" && range.value > 0) return { type: "circle", radius: range.value, origin: "caster", attach: sustained };
  return null;
}

export const areaLabel = area => ({ cone: `конус ${area.radius} м`, circle: `радиус ${area.radius} м`, line: `линия ${area.length} м`,
  rectangle: `${area.width}×${area.height} м` })[area.type] + (area.origin === "point" ? `, в пределах ${area.reach} м` : "");

/** Region shape in pixels; `center` is the caster's centre, `px` converts metres. */
export function areaShape(area, center, px, lineWidth) {
  if (area.type === "cone") return { type: "cone", x: center.x, y: center.y, radius: px(area.radius), angle: SPELL_CONE_ANGLE, rotation: 0, curvature: "round", gridBased: false };
  if (area.type === "line") return { type: "line", x: center.x, y: center.y, length: px(area.length), width: px(lineWidth), rotation: 0, gridBased: false };
  if (area.type === "rectangle") return { type: "rectangle", x: center.x, y: center.y, width: px(area.width), height: px(area.height), anchorX: 0.5, anchorY: 0.5, rotation: 0, gridBased: false };
  return { type: "circle", x: center.x, y: center.y, radius: px(area.radius), gridBased: false };
}

export const facing = (from, to) => Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;

/** Tokens inside the placed area, except the caster: each of them defends against the casting check. */
export function tokensInArea(region, caster) {
  return Array.from(region.parent?.tokens ?? []).filter(token => token.id !== caster.id && token.actor && !token.hidden
    && token.testInsideRegion(region));
}

const offensive = system => Boolean(system.damage) || (system.defense ?? []).some(kind => ["dodge", "block", "resistMagic", "willTriple", "spellCasting"].includes(kind));
const areaRegions = (scene, messageId) => Array.from(scene?.regions ?? []).filter(region => region.flags?.[SYSTEM_ID]?.spellArea?.message === messageId);

/**
 * PF2e-style placement with the core Region tool: the shape follows the cursor (or turns around the caster),
 * left click confirms, right click or Esc cancels. Tokens inside become targets; offensive magic then sends its
 * casting check to each of them like a weapon attack.
 */
export async function placeSpellArea(actor, item, message) {
  const area = spellArea(item.system);
  if (!area) throw new Error("У этой магии нет шаблона области.");
  if (!globalThis.canvas?.ready) throw new Error("Откройте сцену, чтобы разместить область.");
  const caster = attackerToken(actor);
  if (caster.parent?.id !== canvas.scene?.id) throw new Error("Токен заклинателя находится на другой сцене.");
  const scene = caster.parent, px = metres => metres * canvas.dimensions.distancePixels, center = tokenCenter(caster);
  for (const old of areaRegions(scene, message.id)) if (old.isOwner) await old.delete();
  const shape = areaShape(area, center, px, scene.grid.distance);
  const instant = item.system.duration?.kind === "instant";
  const data = { name: `${item.name} · ${areaLabel(area)}`, color: game.user.color?.css ?? "#8d48bd", shapes: [shape],
    visibility: CONST.REGION_VISIBILITY.ALWAYS, displayMeasurements: true, highlightMode: "coverage",
    ownership: { default: 0, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [SYSTEM_ID]: { spellArea: { message: message.id, actor: actor.uuid, spellId: item.id, instant,
      sustained: item.system.duration?.kind === "sustained",
      combat: game.combat?.started ? { id: game.combat.id, round: game.combat.round, turn: game.combat.turn } : null } } } };
  // A lasting aura around the caster moves with the token.
  if (area.attach) Object.assign(data, { attachment: { token: caster.id }, levels: caster.level ? [caster.level] : [], hidden: caster.hidden });
  ui.notifications.info(area.origin === "point"
    ? `${item.name}: выберите место (до ${area.reach} м от заклинателя). Колесо мыши поворачивает, Esc — отмена.`
    : `${item.name}: ${["cone", "line"].includes(area.type) ? "наведите направление" : "подтвердите область"} кликом, Esc — отмена.`);
  const region = await canvas.regions.placeRegion(data, {
    allowRotation: area.type === "rectangle",
    onMove: ({ shape: placed, position }) => {
      if (area.origin !== "caster") return true;
      placed.updateSource({ x: center.x, y: center.y, ...(["cone", "line"].includes(area.type) ? { rotation: facing(center, position) } : {}) });
      return false;
    },
    preConfirm: ({ shape: placed }) => {
      if (area.origin !== "point") return true;
      const distance = Math.hypot(placed.x - center.x, placed.y - center.y) / canvas.dimensions.distancePixels;
      if (distance <= area.reach + scene.grid.distance / 2) return true;
      ui.notifications.warn(`Слишком далеко: ${Math.round(distance)} м при дистанции ${area.reach} м.`);
      return false;
    }
  });
  if (!region) return null;
  const inside = tokensInArea(region, caster);
  canvas.tokens.setTargets(inside.map(token => token.id));
  let strikes = null;
  if (inside.length && offensive(item.system) && !message.flags?.[SYSTEM_ID]?.weaponAttack && !["ritual", "hex"].includes(item.system.kind)) {
    const { createSpellStrikes } = await import("./spell-strikes.mjs");
    strikes = await createSpellStrikes(actor, item, message, { total: message.rolls[0]?.total ?? null });
  }
  ui.notifications.info(inside.length ? `${item.name}: в области ${inside.length} — ${inside.map(token => token.name).join(", ")}.` : `${item.name}: в области никого нет.`);
  return { region, targets: inside, strikes };
}

/** Templates of instant magic vanish when the turn passes; a concentration area ends with the concentration. */
export function expiredSpellAreas(scene, { combat = null, actors = new Map() } = {}) {
  return Array.from(scene?.regions ?? []).filter(region => {
    const flag = region.flags?.[SYSTEM_ID]?.spellArea;
    if (!flag) return false;
    if (flag.instant) return Boolean(flag.combat) && (!combat || flag.combat.id !== combat.id || !combat.started
      || flag.combat.round !== combat.round || flag.combat.turn !== combat.turn);
    if (flag.sustained) {
      const actor = actors.get(flag.actor);
      return Boolean(actor && actor.system?.magic?.sustainedId !== flag.spellId);
    }
    return false;
  });
}

const castItem = message => {
  const cast = message.flags?.[SYSTEM_ID]?.magicCast, actor = message.speakerActor;
  return cast && actor ? { cast, actor, item: actor.items.get(cast.spellId) } : {};
};

export function registerSpellAreas() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const { cast, actor, item } = castItem(message);
    if (!item || cast.maintenance || cast.fumble?.failed || (cast.kind === "ritual" && cast.succeeded === false) || !actor.isOwner) return;
    const area = spellArea(item.system);
    if (!area || message.isContentVisible === false) return;
    const placed = areaRegions(globalThis.canvas?.scene, message.id).length > 0;
    const box = document.createElement("div");
    box.className = "witcher-spell-target witcher-spell-area";
    box.innerHTML = `<button type="button" data-place><i class="fa-solid fa-draw-polygon"></i> ${placed ? "Переставить область" : "Разместить область"}</button>`
      + (placed ? `<button type="button" data-remove><i class="fa-solid fa-eraser"></i> Убрать область</button>` : "")
      + `<small>${esc(areaLabel(area))}. Все в области (кроме заклинателя) становятся целями${offensive(item.system) ? " и защищаются от этой проверки" : ""}.</small>`;
    box.querySelector("[data-place]").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try { await placeSpellArea(actor, item, message); }
      catch (error) { ui.notifications.warn(error.message); }
      finally { ui.chat?.updateMessage?.(message); }
    });
    box.querySelector("[data-remove]")?.addEventListener("click", async () => {
      for (const region of areaRegions(canvas.scene, message.id)) if (region.isOwner) await region.delete();
      ui.chat?.updateMessage?.(message);
    });
    (html.querySelector(".message-content") ?? html).append(box);
  });
  const sweep = async () => {
    if (!game.users.activeGM?.isSelf) return;
    const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
    for (const scene of game.scenes) {
      for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
      const ids = expiredSpellAreas(scene, { combat: game.combat, actors }).map(region => region.id);
      if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids).catch(error => console.error(`${SYSTEM_ID} | Spell areas`, error));
    }
  };
  Hooks.on("updateCombat", (_combat, changes) => { if ("turn" in changes || "round" in changes) sweep(); });
  Hooks.on("deleteCombat", sweep);
  Hooks.on("updateActor", (_actor, changes) => { if (foundry.utils.hasProperty(changes, "system.magic.sustainedId")) sweep(); });
}
