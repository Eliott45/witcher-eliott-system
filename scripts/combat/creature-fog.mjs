import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";
import { skillValue } from "../data/skills.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { actionQuote, actionUpdate } from "./action-economy.mjs";
import { creatureSuppression, tokenInsideRegion } from "./creature-spirits.mjs";
import { activeCreatureGM, requireCreatureGM, creatureFlags, creatureTargets, creatureRoll, creaturePost, pickCreaturePoint, centerDistance, esc } from "./creature-actions-common.mjs";
import { createFogCopies, dismissCopies } from "./creature-actions-dance.mjs";

// Monster Hunter's Journal pp.18–19, foglet: a 30 m fog that limits everyone else's sight to 4 m, lasts a day,
// drifts 10 m per action and dies with its maker; invisibility, illusory copies and illusions work only inside it.
export const FOG = { radius: 30, sight: 4, move: 10, seconds: 86400, dispelDc: 18, dispelStamina: 5, copyDc: 16, illusionDc: 18 };

export const isFoglet = actor => creatureProfile(actor)?.id === "foglet";
export const fogState = region => region?.flags?.[SYSTEM_ID]?.creatureFog ?? null;
const expired = state => (globalThis.game?.time?.worldTime ?? 0) >= state.endTime;
export const fogRegions = scene => Array.from(scene?.regions ?? []).filter(region => fogState(region) && !expired(fogState(region)));
export const pointInFog = (scene, point) => fogRegions(scene).some(region => Array.from(region.shapes ?? []).some(shape => shape.radiusX > 0 && shape.radiusY > 0
  && ((point.x - shape.x) / shape.radiusX) ** 2 + ((point.y - shape.y) / shape.radiusY) ** 2 <= 1 + 1e-7));
export const fogsAt = token => token?.parent ? fogRegions(token.parent).filter(region => tokenInsideRegion(token, region)) : [];
export const ownFog = (actor, scene) => fogRegions(scene).find(region => fogState(region).owner === actor?.uuid) ?? null;
const actorToken = actor => actor?.isToken ? actor.token : actor?.getActiveTokens?.(false, true)?.[0]?.document
  ?? Array.from(globalThis.canvas?.scene?.tokens ?? []).find(token => token.actor === actor) ?? null;

/** Everyone in the fog but a foglet sees no further than 4 m (metres from the observer's edge). */
export function fogSightLimit(token) {
  if (!token?.actor || isFoglet(token.actor) || !fogsAt(token).length) return null;
  return FOG.sight;
}

/** The attack reveals the foglet until its next turn; outside combat nothing keeps it visible. */
export function fogRevealLocked(actor, combat = globalThis.game?.combat) {
  const reveal = creatureFlags(actor).fogReveal;
  if (!reveal || !combat?.started || reveal.combatId !== combat.id) return false;
  const own = combat.combatant?.actor === actor || combat.combatant?.actor?.uuid === actor.uuid;
  return !(own && (combat.round > reveal.round || combat.round === reveal.round && (combat.turn ?? 0) > reveal.turn));
}

export function fogVanishBlocked(actor, token = actorToken(actor)) {
  if (!token || !fogsAt(token).length) return "Невидимость доступна только в тумане.";
  if (creatureSuppression(actor).suppressed) return "Ирден или Лунная пыль не дают туманнику исчезнуть.";
  if (fogRevealLocked(actor)) return "После атаки туманник видим до своего следующего хода.";
  return "";
}

/** Leaving the fog, or Yrden and Moon Dust, make it visible; it must spend an action to vanish again. */
export async function revealFogletIfExposed(actor) {
  if (!isFoglet(actor) || !actor?.system?.creature?.invisible || !actor.isOwner) return false;
  const token = actorToken(actor);
  if (token && fogsAt(token).length && !creatureSuppression(actor).suppressed) return false;
  await actor.update({ "system.creature.invisible": false });
  return true;
}

async function summonFog(actor, source) {
  if (creatureSuppression(actor).dimeritium) throw new Error("Двимеритовая бомба не даёт туманнику вызвать туман.");
  const scene = source.parent, previous = ownFog(actor, scene);
  if (previous) await previous.delete();
  const center = tokenCenter(source), pixels = FOG.radius / scene.grid.distance * scene.grid.size;
  await scene.createEmbeddedDocuments("Region", [{ name: `Туман: ${source.name ?? actor.name}`, color: "#b8c4c8", visibility: 2,
    shapes: [{ type: "ellipse", x: center.x, y: center.y, radiusX: pixels, radiusY: pixels, rotation: 0, gridBased: false, hole: false }],
    flags: { [SYSTEM_ID]: { creatureFog: { owner: actor.uuid, token: source.uuid, endTime: (game.time?.worldTime ?? 0) + FOG.seconds } } } }]);
  return creaturePost(actor, { title: "Призыв тумана", text: `Туман радиусом ${FOG.radius} м на сутки. Все в нём, кроме туманника, видят не дальше ${FOG.sight} м.` });
}

async function moveFog(actor, source, options) {
  if (creatureSuppression(actor).dimeritium) throw new Error("Двимеритовая бомба не даёт туманнику управлять туманом.");
  const fog = ownFog(actor, source.parent);
  if (!fog) throw new Error("У туманника нет своего тумана на этой сцене.");
  const point = options.destination ?? await pickCreaturePoint(source, { throughWalls: true, title: "Куда сдвинуть центр тумана" });
  if (!point) return null;
  const shape = fog.shapes[0], center = { x: shape.x, y: shape.y };
  if (centerDistance(center, point, source.parent) > FOG.move + 0.001) throw new Error(`Туман сдвигается не дальше чем на ${FOG.move} м.`);
  await fog.update({ shapes: Array.from(fog.shapes).map(entry => ({ ...(entry.toObject?.() ?? entry), x: point.x, y: point.y })) });
  return creaturePost(actor, { title: "Туман сдвинут", text: `Центр тумана перемещён на ${Math.round(centerDistance(center, point, source.parent) * 10) / 10} м.` });
}

async function clearFog(actor, source) {
  const fog = ownFog(actor, source.parent);
  if (!fog) throw new Error("У туманника нет своего тумана на этой сцене.");
  await fog.delete();
  return creaturePost(actor, { title: "Туман рассеян", text: "Туманник рассеивает свой туман." });
}

async function vanish(actor, source) {
  const reason = fogVanishBlocked(actor, source);
  if (reason) throw new Error(reason);
  await actor.update({ "system.creature.invisible": true, "system.creature.invisibilityEpoch": globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto.randomUUID() });
  return creaturePost(actor, { title: "Невидимость", text: "Туманник растворяется в тумане: +10 к Скрытности и +5 к атаке; заметившие его получают −3 к атакам и защите против него. После атаки станет видим." });
}

async function illusion(actor, source) {
  if (!fogsAt(source).length) throw new Error("Иллюзии туманник создаёт только в тумане.");
  return creaturePost(actor, { title: "Сотворение иллюзий", text: `Туманник создаёт беззвучную неосязаемую иллюзию в пределах тумана. Кто её видит, проходит Внимание СЛ ${FOG.illusionDc}, чтобы распознать обман; внезапное появление перед глазами или касание выдаёт иллюзию сразу.` });
}

/** Special actions of the foglet; the caller pays the action (and marks the full turn for an illusion). */
export async function useFogAction(actor, id, options = {}) {
  const { source } = creatureTargets(actor, { ...options, targets: [] });
  if (id === "fog") return summonFog(actor, source);
  if (id === "fog-move") return moveFog(actor, source, options);
  if (id === "fog-clear") return clearFog(actor, source);
  if (id === "fog-invisible") return vanish(actor, source);
  if (id === "fog-illusion") return illusion(actor, source);
  if (id === "fog-copies") {
    if (!fogsAt(source).length) throw new Error("Иллюзорные копии туманник создаёт только в тумане.");
    return createFogCopies(actor, { ...options, sourceToken: source, inFog: point => pointInFog(source.parent, point), dc: FOG.copyDc });
  }
  throw new Error("Неизвестное действие туманника.");
}

/** A mage or priest pays 5 STA and an action: Spell Casting DC 18 disperses the foglet's fog. */
export function dispelFog(foglet, options = {}) {
  requireCreatureGM(foglet);
  const { source, targets } = creatureTargets(foglet, options);
  const fog = ownFog(foglet, source.parent);
  if (!fog) throw new Error("У туманника нет тумана на этой сцене.");
  if (targets.length !== 1) throw new Error("Выберите токен мага или жреца, который разгоняет туман.");
  const caster = targets[0].actor;
  if (!((caster.system.statistics?.vigor ?? 0) > 0)) throw new Error("Разогнать туман может только маг или жрец (Энергия больше 0).");
  return inventoryWrite(caster, async () => {
    const quote = actionQuote(caster, { cost: FOG.dispelStamina }), skill = skillValue(caster.system, "spellCasting").total ?? 0;
    const roll = await creatureRoll(`1d10wc + ${skill + quote.penalty}`), success = roll.total >= FOG.dispelDc;
    const message = await creaturePost(caster, { title: "Разогнать туман", rolls: [roll], text: `${FOG.dispelStamina} ВЫН и действие. Сотворение заклинаний ${roll.total} против СЛ ${FOG.dispelDc}: ${success ? "туман рассеян" : "туман держится"}.` });
    if (!message) return null;
    await caster.update(actionUpdate(caster, quote, FOG.dispelStamina));
    if (success) await fog.delete();
    return message;
  });
}

/** The fog dies with the foglet; its illusory copies go with it. */
export async function dismissFoglet(actor) {
  if (!activeCreatureGM() || !isFoglet(actor)) return;
  for (const scene of globalThis.game?.scenes ?? []) for (const region of fogRegions(scene).filter(region => fogState(region).owner === actor.uuid)) await region.delete();
  await dismissCopies(actor, "fog");
}

export async function removeExpiredFogs() {
  if (!activeCreatureGM()) return;
  for (const scene of globalThis.game?.scenes ?? []) {
    const ids = Array.from(scene.regions ?? []).filter(region => fogState(region) && expired(fogState(region))).map(region => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  }
}

export function registerCreatureFog() {
  const fail = error => ui.notifications.error(error.message);
  const recheck = scene => { if (!activeCreatureGM()) return;
    for (const token of scene?.tokens ?? []) if (isFoglet(token.actor)) revealFogletIfExposed(token.actor).catch(fail); };
  Hooks.on("updateToken", (token, changes) => { if (activeCreatureGM() && isFoglet(token.actor) && ("x" in changes || "y" in changes)) revealFogletIfExposed(token.actor).catch(fail); });
  for (const hook of ["updateRegion", "deleteRegion"]) Hooks.on(hook, region => { if (fogState(region)) recheck(region.parent); });
  Hooks.on("createActiveEffect", effect => {
    const actor = effect.parent;
    if (!activeCreatureGM() || !isFoglet(actor) || !activeEffect(effect)) return;
    if (effect.statuses?.has("dead")) return dismissFoglet(actor).catch(fail);
    if (creatureFlags(effect).creatureSuppression) revealFogletIfExposed(actor).catch(fail);
  });
  Hooks.on("updateWorldTime", () => removeExpiredFogs().catch(fail));
  Hooks.on("canvasReady", () => removeExpiredFogs().catch(fail));
}
