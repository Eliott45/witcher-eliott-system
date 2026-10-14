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

// Monster Hunter's Journal: a creature's own weather. The foglet's fog (pp.18–19) and the wendigo's snowstorm (p.51)
// both limit sight inside to 4 m, last a day, drift per action, die with their maker and resist dimeritium only at birth.
export const FOG = { radius: 30, sight: 4, move: 10, seconds: 86400, dispelDc: 18, dispelStamina: 5, copyDc: 16, illusionDc: 18 };
export const WEATHER = {
  fog: { ...FOG, name: "Туман", color: "#b8c4c8", owner: "туманник" },
  storm: { radius: 50, sight: 4, move: 20, seconds: 86400, dispelDc: 20, dispelStamina: 10, name: "Снежная буря", color: "#dfeaf2", owner: "вендиго",
    behaviors: [{ type: "environment", name: "Лёд и снег", system: { light: "", terrain: "snow", heat: "" } }] }
};
const KIND_OF = { fog: "fog", "fog-move": "fog", "fog-clear": "fog", storm: "storm", "storm-move": "storm", "storm-clear": "storm" };

export const isFoglet = actor => creatureProfile(actor)?.id === "foglet";
export const weatherKind = actor => ({ foglet: "fog", wendigo: "storm" })[creatureProfile(actor)?.id] ?? null;
export const fogState = region => region?.flags?.[SYSTEM_ID]?.creatureFog ?? null;
export const regionKind = region => fogState(region)?.kind ?? "fog";
const expired = state => (globalThis.game?.time?.worldTime ?? 0) >= state.endTime;
/** Living weather regions on a scene; `kind` keeps the foglet's tricks to its own fog. */
export const fogRegions = (scene, kind = null) => Array.from(scene?.regions ?? []).filter(region => fogState(region) && !expired(fogState(region)) && (!kind || regionKind(region) === kind));
export const pointInFog = (scene, point, kind = "fog") => fogRegions(scene, kind).some(region => Array.from(region.shapes ?? []).some(shape => shape.radiusX > 0 && shape.radiusY > 0
  && ((point.x - shape.x) / shape.radiusX) ** 2 + ((point.y - shape.y) / shape.radiusY) ** 2 <= 1 + 1e-7));
export const fogsAt = (token, kind = "fog") => token?.parent ? fogRegions(token.parent, kind).filter(region => tokenInsideRegion(token, region)) : [];
export const ownFog = (actor, scene, kind = weatherKind(actor) ?? "fog") => fogRegions(scene, kind).find(region => fogState(region).owner === actor?.uuid) ?? null;
const actorToken = actor => actor?.isToken ? actor.token : actor?.getActiveTokens?.(false, true)?.[0]?.document
  ?? Array.from(globalThis.canvas?.scene?.tokens ?? []).find(token => token.actor === actor) ?? null;
const snowProof = actor => Array.from(actor?.items ?? []).some(item => item.type === "ability" && item.system?.ruleId === "creature.snow-immunity");

/** Inside fog (except foglets) or a snowstorm (except the snow-proof wendigo) nobody sees further than 4 m from their edge. */
export function fogSightLimit(token) {
  if (!token?.actor) return null;
  const blinding = fogsAt(token, null).filter(region => regionKind(region) === "storm" ? !snowProof(token.actor) : !isFoglet(token.actor));
  return blinding.length ? Math.min(...blinding.map(region => WEATHER[regionKind(region)].sight)) : null;
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

async function summonFog(actor, source, kind) {
  const rule = WEATHER[kind];
  if (creatureSuppression(actor).dimeritium) throw new Error(`Двимеритовая бомба не даёт вызвать: ${rule.name.toLocaleLowerCase("ru")}.`);
  const scene = source.parent, previous = ownFog(actor, scene, kind);
  if (previous) await previous.delete();
  const center = tokenCenter(source), pixels = rule.radius / scene.grid.distance * scene.grid.size;
  await scene.createEmbeddedDocuments("Region", [{ name: `${rule.name}: ${source.name ?? actor.name}`, color: rule.color, visibility: 2,
    shapes: [{ type: "ellipse", x: center.x, y: center.y, radiusX: pixels, radiusY: pixels, rotation: 0, gridBased: false, hole: false }],
    ...(rule.behaviors ? { behaviors: structuredClone(rule.behaviors) } : {}),
    flags: { [SYSTEM_ID]: { creatureFog: { kind, owner: actor.uuid, token: source.uuid, endTime: (game.time?.worldTime ?? 0) + rule.seconds } } } }]);
  return creaturePost(actor, { title: kind === "storm" ? "Призыв снежной бури" : "Призыв тумана", text: kind === "storm"
    ? `Буря радиусом ${rule.radius} м на сутки: лёд и снег под ногами, все в ней видят не дальше ${rule.sight} м.`
    : `Туман радиусом ${rule.radius} м на сутки. Все в нём, кроме туманника, видят не дальше ${rule.sight} м.` });
}

async function moveFog(actor, source, options, kind) {
  const rule = WEATHER[kind];
  if (creatureSuppression(actor).dimeritium) throw new Error(`Двимеритовая бомба не даёт управлять: ${rule.name.toLocaleLowerCase("ru")}.`);
  const fog = ownFog(actor, source.parent, kind);
  if (!fog) throw new Error(`Нет своей области «${rule.name}» на этой сцене.`);
  const point = options.destination ?? await pickCreaturePoint(source, { throughWalls: true, title: `Куда сдвинуть центр: ${rule.name}` });
  if (!point) return null;
  const shape = fog.shapes[0], center = { x: shape.x, y: shape.y };
  if (centerDistance(center, point, source.parent) > rule.move + 0.001) throw new Error(`${rule.name} сдвигается не дальше чем на ${rule.move} м.`);
  await fog.update({ shapes: Array.from(fog.shapes).map(entry => ({ ...(entry.toObject?.() ?? entry), x: point.x, y: point.y })) });
  return creaturePost(actor, { title: `${rule.name}: сдвиг`, text: `Центр перемещён на ${Math.round(centerDistance(center, point, source.parent) * 10) / 10} м.` });
}

async function clearFog(actor, source, kind) {
  const rule = WEATHER[kind], fog = ownFog(actor, source.parent, kind);
  if (!fog) throw new Error(`Нет своей области «${rule.name}» на этой сцене.`);
  await fog.delete();
  return creaturePost(actor, { title: `${rule.name} рассеяна`, text: `${esc(actor.name)} развеивает: ${rule.name.toLocaleLowerCase("ru")}.` });
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

/** Special actions of the foglet and the wendigo's storm; the caller pays the action. */
export async function useFogAction(actor, id, options = {}) {
  const { source } = creatureTargets(actor, { ...options, targets: [] }), kind = KIND_OF[id];
  if (id === "fog" || id === "storm") return summonFog(actor, source, kind);
  if (id === "fog-move" || id === "storm-move") return moveFog(actor, source, options, kind);
  if (id === "fog-clear" || id === "storm-clear") return clearFog(actor, source, kind);
  if (id === "fog-invisible") return vanish(actor, source);
  if (id === "fog-illusion") return illusion(actor, source);
  if (id === "fog-copies") {
    if (!fogsAt(source).length) throw new Error("Иллюзорные копии туманник создаёт только в тумане.");
    return createFogCopies(actor, { ...options, sourceToken: source, inFog: point => pointInFog(source.parent, point), dc: FOG.copyDc });
  }
  throw new Error("Неизвестное действие.");
}

/** A mage or priest pays STA and an action: Spell Casting disperses the fog (5 STA, DC 18) or the storm (10 STA, DC 20). */
export function dispelFog(maker, options = {}) {
  requireCreatureGM(maker);
  const kind = weatherKind(maker) ?? "fog", rule = WEATHER[kind];
  const { source, targets } = creatureTargets(maker, options);
  const fog = ownFog(maker, source.parent, kind);
  if (!fog) throw new Error(`Нет области «${rule.name}» на этой сцене.`);
  if (targets.length !== 1) throw new Error("Выберите токен мага или жреца, который разгоняет её.");
  const caster = targets[0].actor;
  if (!((caster.system.statistics?.vigor ?? 0) > 0)) throw new Error("Разогнать может только маг или жрец (Энергия больше 0).");
  return inventoryWrite(caster, async () => {
    const quote = actionQuote(caster, { cost: rule.dispelStamina }), skill = skillValue(caster.system, "spellCasting").total ?? 0;
    const roll = await creatureRoll(`1d10wc + ${skill + quote.penalty}`), success = roll.total >= rule.dispelDc;
    const message = await creaturePost(caster, { title: `Разогнать: ${rule.name.toLocaleLowerCase("ru")}`, rolls: [roll], text: `${rule.dispelStamina} ВЫН и действие. Сотворение заклинаний ${roll.total} против СЛ ${rule.dispelDc}: ${success ? "рассеяна" : "держится"}.` });
    if (!message) return null;
    await caster.update(actionUpdate(caster, quote, rule.dispelStamina));
    if (success) await fog.delete();
    return message;
  });
}

/** The weather dies with its maker; a foglet's illusory copies go with it. */
export async function dismissFoglet(actor) {
  if (!activeCreatureGM() || !weatherKind(actor)) return;
  for (const scene of globalThis.game?.scenes ?? []) for (const region of fogRegions(scene).filter(region => fogState(region).owner === actor.uuid)) await region.delete();
  if (isFoglet(actor)) await dismissCopies(actor, "fog");
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
    if (!activeCreatureGM() || !weatherKind(actor) || !activeEffect(effect)) return;
    if (effect.statuses?.has("dead")) return dismissFoglet(actor).catch(fail);
    if (creatureFlags(effect).creatureSuppression) revealFogletIfExposed(actor).catch(fail);
  });
  Hooks.on("updateWorldTime", () => removeExpiredFogs().catch(fail));
  Hooks.on("canvasReady", () => removeExpiredFogs().catch(fail));
}
