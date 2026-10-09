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

/** Friend or foe as seen from the caster: the same disposition is an ally, neutral stays neutral. */
export function relationTo(caster, token) {
  if (token.disposition === caster.disposition) return "ally";
  return token.disposition === 0 ? "neutral" : "enemy";
}
const RELATION_LABELS = { ally: "союзник", enemy: "враг", neutral: "нейтральный" };
export const AREA_TARGET_PICKS = { all: () => true, enemies: relation => relation === "enemy", allies: relation => relation === "ally", none: () => false };

/**
 * The book makes everyone in the area defend (p.168). The caster still confirms who is affected: all of them,
 * only enemies or only allies, or any hand-picked set. Resolves to the chosen tokens, or null when cancelled.
 */
export async function chooseAreaTargets(item, caster, inside, { attack = false } = {}) {
  if (!inside.length) return [];
  const rows = inside.map(token => ({ token, relation: relationTo(caster, token) }));
  const content = `<div class="witcher-area-targets"><p>В области: ${rows.length}. По книге защищаются все, кто в зоне; снимите отметки с тех, кого магия не затронет.</p>`
    + `<div class="witcher-area-picks">${[["all", "Все"], ["enemies", "Только враги"], ["allies", "Только союзники"], ["none", "Никого"]]
      .map(([id, label]) => `<button type="button" data-pick="${id}">${label}</button>`).join("")}</div>`
    + `<ul>${rows.map(({ token, relation }) => `<li><label><input type="checkbox" name="target" value="${token.id}" data-relation="${relation}" checked>`
      + ` <b>${esc(token.name)}</b> <small class="witcher-area-${relation}">${RELATION_LABELS[relation]}</small></label></li>`).join("")}</ul></div>`;
  const chosen = await foundry.applications.api.DialogV2.prompt({ classes: ["witcher-area-target-dialog"],
    window: { title: `${item.name}: кто в области` }, position: { width: 420 }, content, rejectClose: false,
    ok: { label: attack ? "Атаковать выбранных" : "Назначить цели", callback: (_event, button) =>
      Array.from(button.form.querySelectorAll('[name="target"]:checked'), input => input.value) },
    render: (_event, dialog) => {
      for (const button of dialog.element.querySelectorAll("[data-pick]")) button.addEventListener("click", () => {
        const pick = AREA_TARGET_PICKS[button.dataset.pick];
        for (const input of dialog.element.querySelectorAll('[name="target"]')) input.checked = pick(input.dataset.relation);
      });
    } });
  return chosen ? rows.filter(({ token }) => chosen.includes(token.id)).map(({ token }) => token) : null;
}

/** Seconds an instant template stays on the map (world setting; 0 = until the turn passes or it is removed). */
const lifetime = () => { try { return Number(game.settings.get(SYSTEM_ID, "spellAreaLifetime")) || 0; } catch { return 60; } };
const timers = new Map();
/** Remove a template when its time is up. Every owner and the GM schedule it; whoever is first deletes it. */
export function scheduleAreaExpiry(region) {
  const expiresAt = region.flags?.[SYSTEM_ID]?.spellArea?.expiresAt;
  if (!expiresAt || timers.has(region.uuid) || !(region.isOwner || game.users.activeGM?.isSelf)) return;
  const remove = async () => {
    timers.delete(region.uuid);
    if (region.parent?.regions.has(region.id)) await region.delete().catch(() => {});
  };
  timers.set(region.uuid, setTimeout(remove, Math.max(0, expiresAt - Date.now())));
}

/**
 * PF2e-style placement with the core Region tool. A cone or a line has its apex at the cursor and turns away from
 * the caster until the mouse wheel turns it by hand; a zone at a distance follows the cursor within range; an area
 * around the caster stays on the caster. Left click places, right click or Esc cancels. The caster then confirms the
 * targets; offensive magic sends its casting check to each of them like a weapon attack.
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
  const instant = item.system.duration?.kind === "instant", seconds = instant ? lifetime() : 0;
  const directed = ["cone", "line"].includes(area.type), fixed = area.origin === "caster" && !directed;
  const data = { name: `${item.name} · ${areaLabel(area)}`, color: game.user.color?.css ?? "#8d48bd", shapes: [shape],
    visibility: CONST.REGION_VISIBILITY.ALWAYS, displayMeasurements: true, highlightMode: "coverage",
    ownership: { default: 0, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { [SYSTEM_ID]: { spellArea: { message: message.id, actor: actor.uuid, spellId: item.id, instant,
      sustained: item.system.duration?.kind === "sustained",
      combat: game.combat?.started ? { id: game.combat.id, round: game.combat.round, turn: game.combat.turn } : null } } } };
  // A lasting aura around the caster moves with the token.
  if (area.attach) Object.assign(data, { attachment: { token: caster.id }, levels: caster.level ? [caster.level] : [], hidden: caster.hidden });
  ui.notifications.info(directed ? `${item.name}: курсор — вершина ${area.type === "cone" ? "конуса" : "линии"}, она сама смотрит от заклинателя. Повернуть: Ctrl + колесо (по 5°) или Shift + колесо (по 15°). Клик — поставить, Esc — отмена.`
    : area.origin === "point" ? `${item.name}: выберите место (до ${area.reach} м от заклинателя). Повернуть: Ctrl или Shift + колесо. Клик — поставить, Esc — отмена.`
    : `${item.name}: область вокруг заклинателя — подтвердите кликом, Esc — отмена.`);
  let turnedByHand = false;
  const region = await canvas.regions.placeRegion(data, {
    allowRotation: !fixed,
    onMove: ({ shape: placed, position, snap }) => {
      if (fixed) { placed.updateSource({ x: center.x, y: center.y }); return false; }
      if (!directed) return true;
      placed.move(position, { snap });
      // Pointing outward from the caster is what a cone or a bolt almost always does.
      if (!turnedByHand && Math.hypot(placed.x - center.x, placed.y - center.y) > 1) placed.updateSource({ rotation: facing(center, placed) });
      return false;
    },
    onRotate: () => { turnedByHand = true; return true; },
    preConfirm: ({ shape: placed }) => {
      if (area.origin !== "point") return true;
      const distance = Math.hypot(placed.x - center.x, placed.y - center.y) / canvas.dimensions.distancePixels;
      if (distance <= area.reach + scene.grid.distance / 2) return true;
      ui.notifications.warn(`Слишком далеко: ${Math.round(distance)} м при дистанции ${area.reach} м.`);
      return false;
    }
  });
  if (!region) return null;
  const attack = offensive(item.system) && !message.flags?.[SYSTEM_ID]?.weaponAttack && !["ritual", "hex"].includes(item.system.kind);
  const chosen = await chooseAreaTargets(item, caster, tokensInArea(region, caster), { attack });
  // The countdown starts once the targets are chosen, so everyone sees the final template for the full time.
  if (seconds && region.parent?.regions.has(region.id)) {
    await region.setFlag(SYSTEM_ID, "spellArea.expiresAt", Date.now() + seconds * 1000);
    scheduleAreaExpiry(region);
  }
  if (chosen === null) return { region, targets: [], strikes: null };
  canvas.tokens.setTargets(chosen.map(token => token.id));
  let strikes = null;
  if (chosen.length && attack) {
    const { createSpellStrikes } = await import("./spell-strikes.mjs");
    strikes = await createSpellStrikes(actor, item, message, { total: message.rolls[0]?.total ?? null });
  }
  ui.notifications.info(chosen.length ? `${item.name}: цели — ${chosen.map(token => token.name).join(", ")}.` : `${item.name}: целей нет.`);
  return { region, targets: chosen, strikes };
}

/** Templates of instant magic vanish when the turn passes; a concentration area ends with the concentration. */
export function expiredSpellAreas(scene, { combat = null, actors = new Map(), now = Date.now() } = {}) {
  return Array.from(scene?.regions ?? []).filter(region => {
    const flag = region.flags?.[SYSTEM_ID]?.spellArea;
    if (!flag) return false;
    if (flag.expiresAt && flag.expiresAt <= now) return true;
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
      + `<small>${esc(areaLabel(area))}. Ctrl или Shift + колесо мыши поворачивают шаблон. После размещения выберите, кого затронет магия: всех, только врагов или только союзников.</small>`;
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
      const ids = expiredSpellAreas(scene, { combat: game.combat, actors }).map(region => region.id).filter(id => scene.regions.has(id));
      if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids).catch(error => console.error(`${SYSTEM_ID} | Spell areas`, error));
    }
  };
  Hooks.on("updateCombat", (_combat, changes) => { if ("turn" in changes || "round" in changes) sweep(); });
  Hooks.on("deleteCombat", sweep);
  Hooks.on("updateActor", (_actor, changes) => { if (foundry.utils.hasProperty(changes, "system.magic.sustainedId")) sweep(); });
  // The GM also keeps the timer of a template whose player left; a reload catches templates that expired meanwhile.
  Hooks.on("updateRegion", region => scheduleAreaExpiry(region));
  Hooks.once("ready", () => {
    sweep();
    for (const scene of game.scenes) for (const region of scene.regions) scheduleAreaExpiry(region);
  });
}
