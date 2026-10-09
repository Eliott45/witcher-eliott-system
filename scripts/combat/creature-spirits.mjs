import { SYSTEM_ID, ROUND_SECONDS } from "../config.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";

const active = effect => !effect.disabled && !effect.isSuppressed && !effect.duration?.expired;
const traits = actor => Array.from(actor?.items ?? []).filter(item => item.type === "ability").map(item => item.system?.ruleId ?? "");
const has = (actor, id) => traits(actor).includes(id);
const legacy = (actor, id) => traits(actor).some(ruleId => ruleId.startsWith(`creature.${id}.`));
export const SPIRIT_SLIP = "creature-slip";

/** Actual effects, plus a deliberate GM override. Moon Dust follows the victim; Yrden is spatial. */
export function creatureSuppression(actor) {
  const effects = Array.from(actor?.effects ?? []).filter(active);
  const moonDust = effects.some(effect => effect.flags?.[SYSTEM_ID]?.creatureSuppression?.kind === "moon-dust");
  const zones = spiritZonesAt(actor);
  const yrden = zones.some(zone => zone.kind === "yrden") || effects.some(effect => {
    const rule = effect.flags?.[SYSTEM_ID]?.creatureSuppression;
    return rule?.kind === "yrden" && !rule.zoneUuid;
  });
  const dimeritium = zones.some(zone => zone.kind === "dimeritium");
  const manual = actor?.system?.creature?.spiritMode === "suppressed";
  const reasons = [moonDust ? "Лунная пыль" : "", yrden ? "Ирден" : "", manual ? "Подавление ведущим" : ""].filter(Boolean);
  return { moonDust, yrden, dimeritium, manual, suppressed: moonDust || yrden || manual, reasons };
}

export function spiritState(actor) {
  const permanent = has(actor, "creature.incorporeal") || legacy(actor, "noonwraith");
  const slip = has(actor, "creature.slip") || legacy(actor, "wraith");
  const teleport = has(actor, "creature.teleport") || legacy(actor, "wraith");
  const suppression = creatureSuppression(actor);
  const temporary = Array.from(actor?.effects ?? []).some(effect => active(effect) && effect.statuses?.has?.(SPIRIT_SLIP));
  const incorporeal = (permanent || temporary) && !suppression.suppressed;
  const lunar = has(actor, "creature.lunar-weakness") || legacy(actor, "noonwraith");
  return { ...suppression, incorporeal, permanent, temporary, canSlip: slip && !suppression.suppressed,
    canTeleport: teleport && !suppression.suppressed, lunarPenalty: lunar && actor?.system?.creature?.moonlight ? -2 : 0,
    reason: suppression.reasons.join(", ") || (incorporeal ? "Бесплотность" : "") };
}

/** Poison and bleeding cannot affect an incorporeal body; suppression restores ordinary susceptibility. */
export function spiritConditionImmune(actor, statuses) {
  return spiritState(actor).incorporeal && Array.from(statuses).some(status => ["poisoned", "bleeding"].includes(status));
}

/** Immunity to mind magic is independent from courage or a saving-throw bonus. */
export function creatureMentalImmunity(actor, { mental = false, fear = false } = {}) {
  if (mental && (has(actor, "creature.mindless") || has(actor, "creature.construct"))) return "Иммунитет к магии мыслей и эмоций";
  if (fear && has(actor, "creature.fearless")) return "Бесстрашие: существо нельзя запугать";
  return "";
}

export const MENTAL_SPELLS = new Set(["spell.mind-manipulation", "spell.telepathy", "spell.eilhart-technique", "spell.mental-command", "sign.axii", "sign.puppet",
  "invocation.blood-boil", "invocation.animal-friend", "invocation.web-lies", "invocation.light-truth"]);
export const spellMentalImmunity = (actor, system) => creatureMentalImmunity(actor, { mental: MENTAL_SPELLS.has(system?.ruleId) });

/** Effect writers tag the cause, so a magical light's blindness is not mistaken for physical dust. */
export function creatureEffectImmunity(actor, effect) {
  const rules = effect.flags?.[SYSTEM_ID]?.condition ?? {};
  const mental = creatureMentalImmunity(actor, { mental: Boolean(rules.mental), fear: Boolean(rules.fear) });
  return mental || (rules.physical && spiritState(actor).incorporeal ? "Бесплотность: физическое воздействие не действует" : "");
}

/** Called only after a successful Slip defense; native turnStart expiry uses the defender's own turn. */
export async function setSlipIncorporeal(actor) {
  if (!spiritState(actor).canSlip) return false;
  const existing = Array.from(actor.effects ?? []).find(effect => active(effect) && effect.statuses?.has?.(SPIRIT_SLIP));
  const source = { name: "Ускользание: бесплотность", img: "icons/svg/ghost.svg", type: "base", statuses: [SPIRIT_SLIP],
    description: "Физические атаки и воздействия не действуют до начала следующего хода призрака. Ирден и Лунная пыль подавляют бесплотность.",
    start: fullTurnStart(actor), duration: { value: 1, units: "rounds", expiry: "turnStart", expired: false },
    flags: { [SYSTEM_ID]: { condition: { rounds: 1, expiry: "turnStart" } } } };
  if (existing) await existing.update(source);
  else await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  return true;
}

const escapeText = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
/** What the state does, who made it and a link to the sign, so the effect explains itself on the sheet. */
export function spiritSuppressionDescription(kind, { penalty = 0, zone = null } = {}) {
  const who = zone?.casterName ? ` Сотворил: ${escapeText(zone.casterName)}.` : "";
  const link = zone?.spellUuid ? `<p>Источник: @UUID[${zone.spellUuid}]{${escapeText(zone.spellName || "Ирден")}}</p>` : "";
  if (kind === "yrden") return `<p>Ведьмачий знак Ирден — магический круг на земле.${who} Пока персонаж внутри круга: −${penalty} к РЕА и СКОР; бестелесные существа становятся материальными. Эффект пропадает, как только персонаж выходит из круга, и возвращается при входе. Сам заклинатель на свой круг не реагирует. Круг держится 5 раундов.</p>${link}`;
  if (kind === "dimeritium") return "<p>Облако двимеритовой бомбы: внутри нельзя сотворять заклинания (маг, прошедший «Устойчивость к двимериту», может). Голем в облаке замедлен. Эффект пропадает при выходе из зоны.</p>";
  return "<p>Лунная пыль: невидимые и бесплотные существа становятся видимыми и осязаемыми, чудовища не могут регенерировать и превращаться. Действует 20 раундов, даже если существо покинуло облако.</p>";
}

export function spiritSuppressionSource(actor, { kind, rounds = kind === "moon-dust" ? 20 : 5, zoneUuid = "", penalty = 0, zone = null } = {}) {
  if (!["moon-dust", "yrden", "dimeritium"].includes(kind)) throw new Error("Неизвестный источник подавления.");
  const name = { "moon-dust": "Лунная пыль", yrden: "Ирден", dimeritium: "Двимеритовая бомба" }[kind];
  const modifiers = kind === "yrden" && penalty ? [{ target: "attributes.reflex", value: -penalty }, { target: "attributes.speed", value: -penalty }]
    : [];
  return { name, type: "base", img: kind === "moon-dust" ? "icons/svg/sun.svg" : "icons/svg/aura.svg", statuses: [`creature-${kind}`],
    description: spiritSuppressionDescription(kind, { penalty, zone }), ...(zone?.spellUuid ? { origin: zone.spellUuid } : {}),
    start: fullTurnStart(actor), duration: { value: zoneUuid ? null : rounds, units: "rounds", expiry: zoneUuid ? null : "turnEnd", expired: false },
    flags: { [SYSTEM_ID]: { creatureSuppression: { kind, zoneUuid }, condition: { ...(zoneUuid ? {} : { rounds, expiry: "turnEnd" }), modifiers } } } };
}

const clock = () => ({ worldTime: globalThis.game?.time?.worldTime ?? 0, combat: globalThis.game?.combat });
export function spiritZoneExpired(zone, now = clock()) {
  if (zone.combatId && now.combat?.started && now.combat.id === zone.combatId)
    return now.combat.round > zone.endRound || now.combat.round === zone.endRound && (now.combat.turn ?? 0) >= zone.endTurn;
  return now.worldTime >= zone.endTime;
}
const actorTokens = actor => actor?.isToken ? [actor.token] : Array.from(actor?.getActiveTokens?.(false, true) ?? []).map(token => token.document ?? token);
// Core v14 animates a moving token's prepared x/y: right after a move they still hold the old cell. Region tests
// must read the source position, which is what TokenDocument#testInsideRegion does.
function insideZone(token, region) {
  if (typeof token.testInsideRegion === "function" && region.parent && token.parent === region.parent) return token.testInsideRegion(region);
  const size = token.parent?.grid?.size ?? 100, source = token._source ?? token;
  const x = source.x + (source.width ?? 1) * size / 2, y = source.y + (source.height ?? 1) * size / 2;
  return region.shapes.some(shape => shape.type === "ellipse" && shape.radiusX > 0 && shape.radiusY > 0
    && ((x - shape.x) / shape.radiusX) ** 2 + ((y - shape.y) / shape.radiusY) ** 2 <= 1 + 1e-7);
}
/** Circles made before the caster was stored still name it through their casting message. */
const yrdenCaster = zone => zone.caster || (zone.sourceUuid && globalThis.fromUuidSync?.(zone.sourceUuid, { strict: false })?.speakerActor?.uuid) || "";
export function spiritZonesAt(actor) {
  const out = [];
  for (const token of actorTokens(actor)) {
    const scene = token.parent, owner = actor?.uuid ?? token.actor?.uuid;
    for (const region of scene?.regions ?? []) {
      const zone = region.flags?.[SYSTEM_ID]?.creatureZone;
      if (!zone || spiritZoneExpired(zone)) continue;
      // The witcher's own Yrden does not slow the witcher.
      if (zone.kind === "yrden" && yrdenCaster(zone) === owner) continue;
      if (insideZone(token, region)) out.push({ ...zone, uuid: region.uuid });
    }
  }
  return out;
}

/** A visible, timed circle on the scene; immediate lookups prevent stale defenses while effects refresh. */
export async function createSpiritZone(scene, point, { kind, radius, rounds, penalty = 0, sourceUuid = "", caster = "", casterName = "", spellUuid = "", spellName = "" }) {
  const existing = sourceUuid && Array.from(scene.regions ?? []).find(region => {
    const zone = region.flags?.[SYSTEM_ID]?.creatureZone;
    return zone?.sourceUuid === sourceUuid && zone.kind === kind;
  });
  if (existing) return existing;
  const { worldTime, combat } = clock();
  const creatureZone = { kind, penalty, sourceUuid, ...(caster ? { caster, casterName, spellUuid, spellName } : {}), endTime: worldTime + rounds * ROUND_SECONDS,
    ...(combat?.started ? { combatId: combat.id, endRound: combat.round + rounds, endTurn: combat.turn ?? 0 } : {}) };
  const pixels = radius / scene.grid.distance * scene.grid.size;
  const [zone] = await scene.createEmbeddedDocuments("Region", [{ name: kind === "yrden" ? "Ирден" : "Двимеритовая бомба",
    color: kind === "yrden" ? "#8d48bd" : "#83a495", visibility: 2,
    shapes: [{ type: "ellipse", x: point.x, y: point.y, radiusX: pixels, radiusY: pixels, rotation: 0, gridBased: false, hole: false }],
    flags: { [SYSTEM_ID]: { creatureZone } } }]);
  await refreshSpiritZones(scene);
  return zone;
}

/** Players request this one fixed sign through their casting message; only the GM creates its Region. */
export async function createYrdenZone(actor, caster, source, power) {
  if (globalThis.game?.user?.isGM) {
    const size = caster.parent.grid.size;
    const position = caster._source ?? caster, spell = actor.items?.get?.(source.flags?.[SYSTEM_ID]?.magicCast?.spellId);
    const zone = await createSpiritZone(caster.parent, { x: position.x + position.width * size / 2, y: position.y + position.height * size / 2 },
      { kind: "yrden", radius: 3, rounds: 5, penalty: Math.min(4, 1 + Math.floor((power - 1) / 2)), sourceUuid: source.uuid,
        caster: actor.uuid, casterName: caster.name ?? actor.name, spellUuid: spell?.uuid ?? "", spellName: spell?.name ?? "Ирден" });
    if (source.update) await source.update({ [`flags.${SYSTEM_ID}.yrdenRegion`]: zone.uuid });
    return zone;
  }
  if (!game.users.activeGM) throw new Error("Для размещения Ирдена нужен подключённый ведущий.");
  await source.update({ [`flags.${SYSTEM_ID}.yrdenRequest`]: { tokenUuid: caster.uuid, requester: game.user.id } });
  return null;
}

export async function processYrdenRequest(message, userId) {
  if (game.user !== game.users.activeGM) return false;
  const flags = message.flags?.[SYSTEM_ID], request = flags?.yrdenRequest, cast = flags?.magicCast;
  if (!request || request.requester !== userId || flags.yrdenRegion) return false;
  const caster = fromUuidSync(request.tokenUuid), actor = caster?.actor, user = game.users.get(userId), spell = actor?.items?.get(cast?.spellId);
  if (!user || !actor?.testUserPermission(user, "OWNER") || spell?.system.ruleId !== "sign.yrden" || cast.fumble?.failed || cast.maintenance) return false;
  const power = cast.powerCost ?? spell.system.cost;
  if (!Number.isInteger(power) || power < 1 || power > 7) return false;
  const zone = await createYrdenZone(actor, caster, message, power);
  await message.update({ [`flags.${SYSTEM_ID}.yrdenRegion`]: zone.uuid, [`flags.${SYSTEM_ID}.-=yrdenRequest`]: null });
  return true;
}

const pendingScenes = new WeakMap();
/** Only the active GM writes effects; overlapping circles use the strongest slowing penalty, never stack. */
export function refreshSpiritZones(scene) {
  if (!scene || globalThis.game?.user !== globalThis.game?.users?.activeGM) return Promise.resolve();
  const previous = pendingScenes.get(scene) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    for (const token of scene.tokens ?? []) {
      const actor = token.actor;
      if (!actor) continue;
      const zones = spiritZonesAt({ isToken: true, token });
      for (const kind of ["yrden", "dimeritium"]) {
        const zone = zones.filter(entry => entry.kind === kind).sort((a, b) => b.penalty - a.penalty)[0];
        const existing = Array.from(actor.effects ?? []).filter(effect => effect.flags?.[SYSTEM_ID]?.creatureSuppression?.kind === kind && effect.flags[SYSTEM_ID].creatureSuppression.zoneUuid);
        if (!zone) { if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(effect => effect.id)); continue; }
        const source = spiritSuppressionSource(actor, { kind, zoneUuid: zone.uuid, penalty: zone.penalty, zone });
        // Keep one copy for this zone; extra copies (e.g. written by a second GM tab) are removed.
        const keep = existing.find(effect => effect.flags[SYSTEM_ID].creatureSuppression.zoneUuid === zone.uuid);
        const extra = existing.filter(effect => effect !== keep).map(effect => effect.id);
        if (extra.length) await actor.deleteEmbeddedDocuments("ActiveEffect", extra).catch(() => {});
        if (!keep) await actor.createEmbeddedDocuments("ActiveEffect", [source]);
      }
      actor.reset?.();
      if (actor.sheet?.rendered) actor.sheet.render();
    }
    const expired = Array.from(scene.regions ?? []).filter(region => {
      const zone = region.flags?.[SYSTEM_ID]?.creatureZone;
      return zone && spiritZoneExpired(zone);
    });
    if (expired.length) await scene.deleteEmbeddedDocuments("Region", expired.map(region => region.id));
  });
  pendingScenes.set(scene, task);
  const clear = () => { if (pendingScenes.get(scene) === task) pendingScenes.delete(scene); };
  task.then(clear, clear);
  return task;
}

export function registerCreatureSpirits() {
  const refresh = scene => refreshSpiritZones(scene).catch(error => ui.notifications.error(error.message));
  for (const hook of ["createRegion", "updateRegion", "deleteRegion"]) Hooks.on(hook, region => {
    if (region.flags?.[SYSTEM_ID]?.creatureZone) refresh(region.parent);
  });
  Hooks.on("updateToken", (token, changes) => { if (["x", "y", "elevation"].some(key => key in changes)) refresh(token.parent); });
  // A zone effect created twice at once (two GM tabs) is cleaned up on the next pass.
  Hooks.on("createActiveEffect", effect => {
    const scene = effect.parent?.token?.parent ?? effect.parent?.getActiveTokens?.(false, true)?.[0]?.document?.parent ?? effect.parent?.getActiveTokens?.()?.[0]?.parent;
    if (effect.flags?.[SYSTEM_ID]?.creatureSuppression?.zoneUuid && scene) refresh(scene);
  });
  for (const hook of ["updateCombat", "updateWorldTime", "canvasReady"]) Hooks.on(hook, () => {
    for (const scene of globalThis.game?.scenes ?? []) if (Array.from(scene.regions ?? []).some(region => region.flags?.[SYSTEM_ID]?.creatureZone)) refresh(scene);
  });
  Hooks.on("updateChatMessage", (message, changes, _options, userId) => {
    if (changes.flags?.[SYSTEM_ID]?.yrdenRequest || changes[`flags.${SYSTEM_ID}.yrdenRequest`])
      processYrdenRequest(message, userId).catch(error => ui.notifications.error(error.message));
  });
}
