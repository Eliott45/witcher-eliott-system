import { CORE_BESTIARY } from "./bestiary-core.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { creatureSuppression } from "../combat/creature-spirits.mjs";
import { tokenActorSource } from "./token-actor-source.mjs";

const profiles = new Map(CORE_BESTIARY.map((entry, index) => [`bstr${String(index + 1).padStart(12, "0")}`, entry]));
const active = effect => !effect.disabled && !effect.isSuppressed && !effect.duration?.expired;
const statuses = actor => new Set(Array.from(actor?.effects ?? []).filter(active).flatMap(effect => Array.from(effect.statuses ?? [])));
export const creatureHasTrait = (actor, rule) => Array.from(actor?.items ?? []).some(item => item.type === "ability" && item.system?.ruleId === `creature.${rule}`);

/** Preserve identity when a GM renames a compendium copy or places an unlinked token. */
export function creatureProfile(actor) {
  if (!actor) return null;
  const origin = actor._stats?.compendiumSource || actor.flags?.core?.sourceId || "";
  const prefix = `Compendium.${SYSTEM_ID}.bestiary.Actor.`;
  const byId = profiles.get(origin.startsWith(prefix) ? origin.slice(prefix.length) : actor.id ?? actor._id);
  if (byId) return byId;
  const rules = Array.from(actor.items ?? []).filter(item => item.type === "ability").map(item => item.system?.ruleId ?? "");
  return CORE_BESTIARY.find(entry => rules.some(rule => rule.startsWith(`creature.${entry.id}.`)))
    ?? CORE_BESTIARY.find(entry => entry.name === actor.name && actor.system?.creature?.source === `Базовая книга, стр. ${entry.page}–${entry.page + 1}`) ?? null;
}
export const creatureHasInfiniteStamina = actor => creatureProfile(actor)?.id === "golem" || creatureHasTrait(actor, "infinite-stamina");
export const creatureIsMassive = actor => creatureHasTrait(actor, "massive");
export const creatureIsAmphibian = actor => creatureHasTrait(actor, "amphibian") || creatureProfile(actor)?.id === "siren";
export const creatureCanSwim = actor => creatureIsAmphibian(actor) || creatureProfile(actor)?.id === "snake";
export const creatureCanFly = actor => creatureHasTrait(actor, "flying");
export function creatureMovementMode(actor, environment = null) {
  const mode = actor?.system?.creature?.movementMode ?? "auto";
  if (mode !== "auto") return mode;
  return ["water", "underwater"].includes(environment?.terrain?.id) ? "swimming" : "ground";
}
export const creatureRaging = actor => creatureProfile(actor)?.id === "ghoul" && actor.system.health.value < 10 && !statuses(actor).has("dead");
export const creatureHumanForm = actor => creatureProfile(actor)?.id === "werewolf" && actor.system.creature?.transformed === false;
export const creatureSuppressionFlags = creatureSuppression;
export const creatureInvisible = actor => Boolean(actor?.system?.creature?.invisible) && !creatureSuppression(actor).suppressed;
export const creatureSeesInvisible = actor => creatureProfile(actor)?.id === "cat";
export const creatureGolemSlowed = actor => creatureProfile(actor)?.id === "golem" && creatureSuppression(actor).dimeritium;
const same = (a, b) => a === b || a?.uuid && a.uuid === b?.uuid;
export function creaturePackBonus(actor) {
  const pack = actor?.system?.creature?.packId?.trim();
  if (!pack) return 0;
  const id = creatureProfile(actor)?.id, leader = ["wolf", "warg"].includes(id) ? "warg" : ["nekker", "nekker-chief"].includes(id) ? "nekker-chief" : "";
  if (!leader) return 0;
  const token = actor.isToken ? actor.token : actor.getActiveTokens?.(false, true)?.[0]?.document;
  const scene = token?.parent ?? globalThis.canvas?.scene;
  const actors = scene ? Array.from(scene.tokens ?? []).map(tokenActorSource) : Array.from(globalThis.game?.actors ?? []);
  return actors.some(other => other && !same(other, actor) && creatureProfile(other)?.id === leader
    && other.system.creature?.packId?.trim() === pack && !statuses(other).has("dead")) ? 4 : 0;
}
/** Passive modifiers join the ordinary statistic pipeline, so skills and attack rolls use the same numbers. */
export function creatureModeModifiers(actor, environment = null) {
  const profile = creatureProfile(actor), out = [], add = (target, value, label) => { if (value) out.push({ target, value, source: "creature.mode", category: "creature", label }); };
  const state = actor?.system?.creature ?? {}, attrs = actor?.system?.attributes ?? {};
  const movement = creatureMovementMode(actor, environment);
  if (profile?.id === "siren" && movement === "ground")
    for (const key of ["reflex", "dexterity", "speed"]) add(`attributes.${key}`, 2 - (attrs[key] ?? 2), "Сирена на суше");
  if (profile?.id === "bird" && movement === "flying") add("attributes.speed", 7 - (attrs.speed ?? 2), "Полёт птицы");
  if (creatureHumanForm(actor)) for (const [key, value] of Object.entries({ reflex: -2, body: -3, speed: -4, empathy: 5 })) add(`attributes.${key}`, value, "Человеческий облик волколака");
  if (creatureGolemSlowed(actor)) for (const key of Object.keys(attrs)) add(`attributes.${key}`, -2, "Двимеритовая бомба");
  if (creatureInvisible(actor)) { add("skills.stealth", 10, "Невидимость"); add("combat.attack", 5, "Атака из невидимости"); }
  if (profile?.id === "arachas" && state.camouflage) add("skills.stealth", 10, "Неподвижный камуфляж");
  add("skills.courage", creaturePackBonus(actor), "Живой вожак стаи");
  if (profile?.id === "noonwraith" && state.moonlight) {
    for (const key of Object.keys(actor.system.skills ?? {})) add(`skills.${key}`, -2, "Лунный свет");
    add("attributeCheck", -2, "Лунный свет");
  }
  return out;
}
/** A detected invisible katakan still imposes -3; an undetected one is handled by normal visibility/ambush. */
export const creatureAttackParts = (actor, target) => creatureInvisible(target) && !creatureSeesInvisible(actor) ? [{ label: "Невидимый катакан", value: -3 }] : [];
export const creatureDefenseParts = (actor, attacker) => creatureInvisible(attacker) && !creatureSeesInvisible(actor) ? [{ label: "Невидимый катакан", value: -3 }] : [];

export function creatureModeContext(actor) {
  const profile = creatureProfile(actor), state = actor.system.creature ?? {}, fields = [];
  const select = (key, label, choices, fallback) => fields.push({ key, label, select: true, choices: choices.map(([id, name]) => ({ id, name, selected: (state[key] ?? fallback) === id })) });
  const check = (key, label, fallback = false) => fields.push({ key, label, checkbox: true, checked: state[key] ?? fallback });
  if (creatureCanFly(actor) || creatureCanSwim(actor)) select("movementMode", "Передвижение", [["auto", "По среде сцены"], ["ground", "На суше"], ...(creatureCanFly(actor) ? [["flying", "В полёте"]] : []), ...(creatureCanSwim(actor) ? [["swimming", "В воде"]] : [])], "auto");
  if (creatureCanFly(actor)) fields.push({ key: "flightHeight", label: "Высота полёта, м", number: true, value: state.flightHeight ?? 0 });
  if (profile?.id === "katakan") check("invisible", "Невидимость");
  if (profile?.id === "siren") check("illusion", "Иллюзия прекрасной женщины");
  if (profile?.id === "arachas") { check("camouflage", "Неподвижен в привычной среде"); check("weakSpot", "Атакуют сзади: ПБ 10"); }
  if (profile?.id === "rock-troll") check("weakSpot", "Открытый живот: ПБ 5 для торса");
  if (profile?.id === "werewolf") check("transformed", "Облик волколака", true);
  if (["wraith", "noonwraith", "katakan", "werewolf"].includes(profile?.id)) select("spiritMode", "Подавление способностей", [["normal", "По эффектам Ирдена и Лунной пыли"], ["suppressed", "Подавлено ведущим"]], "normal");
  if (profile?.id === "noonwraith") check("moonlight", "Под лунным светом");
  if (["wolf", "warg", "nekker", "nekker-chief"].includes(profile?.id)) fields.push({ key: "packId", label: "Название стаи", text: true, value: state.packId ?? "" });
  const notes = [creatureRaging(actor) ? "Ярость: +3 ПЗ в начале хода; необходимо двигаться и атаковать." : "", creatureHasInfiniteStamina(actor) ? "Конструкция: Выносливость не расходуется." : "", creaturePackBonus(actor) ? "Живой вожак в этой стае: +4 к Храбрости." : "", creatureInvisible(actor) ? "Невидим: +10 Скрытности, +5 к атаке; после атаки станет видим." : ""].filter(Boolean);
  return { fields, notes, available: fields.length > 0 || notes.length > 0 || profile?.id === "cat", infiniteStamina: creatureHasInfiniteStamina(actor), lycanthropy: profile?.id === "werewolf", detectMagic: profile?.id === "katakan", senseMagic: profile?.id === "cat", sirenIllusion: profile?.id === "siren" && state.illusion, falling: (state.fallRemaining ?? 0) > 0, fallRemaining: state.fallRemaining ?? 0 };
}
