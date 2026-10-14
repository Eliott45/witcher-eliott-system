import { CORE_BESTIARY } from "./bestiary-core.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { creatureSuppression, hymShadow } from "../combat/creature-spirits.mjs";
import { tokenActorSource } from "./token-actor-source.mjs";
import { bookSource } from "./book-references.mjs";

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
    ?? CORE_BESTIARY.find(entry => entry.name === actor.name && bookSource(actor.system?.creature?.source) === (entry.book || "Базовая книга")) ?? null;
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
export const creatureInvisible = actor => Boolean(actor?.system?.creature?.invisible) && !creatureSuppression(actor).suppressed || hymShadow(actor);
/** A mage who found the hym by Magic Training halves its attack bonus until it moves (a move renews the epoch). */
/** Monster Hunter's Journal p.49: the botchling's claws exist only in its battle form. */
export const creatureWeaponBlocked = (actor, item) => creatureProfile(actor)?.id === "botchling" && item?.name === "Удар когтями" && !actor.system?.creature?.battleForm
  ? "Когти игоши доступны только в боевой форме" : "";
export const hymLocated = actor => { const located = actor?.flags?.[SYSTEM_ID]?.hymLocated; return located !== undefined && located === (actor.system?.creature?.invisibilityEpoch ?? ""); };
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
const BARGHEST_LEADERS = ["barghest-leader", "kai"];
/** Monster Hunter's Journal p.26: a leader is always emboldened; a barghest is while a living leader of its pack shares the scene. */
export function creatureLeaderPresence(actor) {
  const id = creatureProfile(actor)?.id;
  if (BARGHEST_LEADERS.includes(id)) return 3;
  if (id !== "barghest") return 0;
  const pack = actor.system?.creature?.packId?.trim() ?? "";
  const token = actor.isToken ? actor.token : actor.getActiveTokens?.(false, true)?.[0]?.document;
  const scene = token?.parent ?? globalThis.canvas?.scene;
  const actors = scene ? Array.from(scene.tokens ?? []).map(tokenActorSource) : [];
  return actors.some(other => other && !same(other, actor) && BARGHEST_LEADERS.includes(creatureProfile(other)?.id) && !statuses(other).has("dead")
    && (!pack || !other.system.creature?.packId?.trim() || other.system.creature.packId.trim() === pack)) ? 3 : 0;
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
  if (hymShadow(actor)) add("combat.attack", hymLocated(actor) ? 5 : 10, hymLocated(actor) ? "Тело из теней: найден магом" : "Тело из теней");
  else if (creatureInvisible(actor)) { add("skills.stealth", 10, "Невидимость"); add("combat.attack", 5, "Атака из невидимости"); }
  if (profile?.id === "arachas" && state.camouflage) add("skills.stealth", 10, "Неподвижный камуфляж");
  if (/archespore$/.test(profile?.id ?? "") && state.camouflage) add("skills.stealth", 10, "Камуфляж среди растений");
  if (profile?.id === "purple-archespore") { add("combat.attack", 2, "Пурпурная археспора"); add("combat.defense", 2, "Пурпурная археспора"); }
  if (profile?.id === "botchling" && state.battleForm && !state.chur) for (const [key, value] of Object.entries({ reflex: 2, dexterity: 2, speed: 2, body: 3 })) add(`attributes.${key}`, value, "Боевая форма игоши");
  add("skills.courage", creaturePackBonus(actor), "Живой вожак стаи");
  const presence = creatureLeaderPresence(actor);
  add("combat.attack", presence, "Присутствие вожака");
  add("combat.defense", presence, "Присутствие вожака");
  if (profile?.id === "noonwraith" && state.moonlight) {
    for (const key of Object.keys(actor.system.skills ?? {})) add(`skills.${key}`, -2, "Лунный свет");
    add("attributeCheck", -2, "Лунный свет");
  }
  return out;
}
/** A detected invisible katakan still imposes -3; an undetected one is handled by normal visibility/ambush. */
export const creatureAttackParts = (actor, target) => creatureInvisible(target) && !hymShadow(target) && !creatureSeesInvisible(actor) ? [{ label: `Невидимый: ${target.name}`, value: -3 }] : [];
export const creatureDefenseParts = (actor, attacker) => creatureInvisible(attacker) && !hymShadow(attacker) && !creatureSeesInvisible(actor) ? [{ label: `Невидимый: ${attacker.name}`, value: -3 }] : [];

export function creatureModeContext(actor) {
  const profile = creatureProfile(actor), state = actor.system.creature ?? {}, fields = [];
  const select = (key, label, choices, fallback) => fields.push({ key, label, select: true, choices: choices.map(([id, name]) => ({ id, name, selected: (state[key] ?? fallback) === id })) });
  const check = (key, label, fallback = false) => fields.push({ key, label, checkbox: true, checked: state[key] ?? fallback });
  if (creatureCanFly(actor) || creatureCanSwim(actor)) select("movementMode", "Передвижение", [["auto", "По среде сцены"], ["ground", "На суше"], ...(creatureCanFly(actor) ? [["flying", "В полёте"]] : []), ...(creatureCanSwim(actor) ? [["swimming", "В воде"]] : [])], "auto");
  if (creatureCanFly(actor)) fields.push({ key: "flightHeight", label: "Высота полёта, м", number: true, value: state.flightHeight ?? 0 });
  if (["katakan", "foglet"].includes(profile?.id)) check("invisible", "Невидимость");
  if (profile?.id === "siren") check("illusion", "Иллюзия прекрасной женщины");
  if (profile?.id === "arachas") { check("camouflage", "Неподвижен в привычной среде"); check("weakSpot", "Атакуют сзади: ПБ 10"); }
  if (profile?.id === "rock-troll") check("weakSpot", "Открытый живот: ПБ 5 для торса");
  if (/archespore$/.test(profile?.id ?? "")) check("camouflage", "Среди растений");
  if (profile?.id === "botchling") { check("battleForm", "Боевая форма"); check("spikes", "Шипы"); check("chur", "Чур: дух-хранитель"); }
  if (profile?.id === "werewolf") check("transformed", "Облик волколака", true);
  if (profile?.id === "hym") select("shadowMode", "Тело из теней", [["auto", "По освещению: в темноте"], ["active", "Хим в тени"], ["off", "Хим на свету"]], "auto");
  if (["wraith", "noonwraith", "katakan", "werewolf", "pesta"].includes(profile?.id)) select("spiritMode", "Подавление способностей", [["normal", "По эффектам Ирдена и Лунной пыли"], ["suppressed", "Подавлено ведущим"]], "normal");
  if (profile?.id === "noonwraith") check("moonlight", "Под лунным светом");
  if (["wolf", "warg", "nekker", "nekker-chief", "barghest", ...BARGHEST_LEADERS].includes(profile?.id)) fields.push({ key: "packId", label: "Название стаи", text: true, value: state.packId ?? "" });
  // Monster Hunter's Journal p.21: read the decay effect directly; combat/rotfiend.mjs depends on this module.
  const rotfiend = profile?.id === "rotfiend" && !actor.flags?.[SYSTEM_ID]?.rotfiendExploded
    ? { decaying: Array.from(actor.effects ?? []).some(effect => active(effect) && effect.flags?.[SYSTEM_ID]?.rotfiendDecay) } : null;
  const notes = [hymShadow(actor) ? `Тело из теней: бесплотен и невидим, +${hymLocated(actor) ? 5 : 10} к атаке.` : "",
    profile?.id === "pesta" ? (actor.flags?.[SYSTEM_ID]?.pestaFliesGone ? "Облако мух рассеяно." : "Облако мух: −2 ко всем действиям рядом с ней, болезнь 25% в начале хода.") : "",
    rotfiend?.decaying ? "Разлагается: взорвётся в начале своего следующего хода." : "", creatureRaging(actor) ? "Ярость: +3 ПЗ в начале хода; необходимо двигаться и атаковать." : "", creatureHasInfiniteStamina(actor) ? "Конструкция: Выносливость не расходуется." : "", creaturePackBonus(actor) ? "Живой вожак в этой стае: +4 к Храбрости." : "", creatureLeaderPresence(actor) ? "Присутствие вожака: +3 к атаке и защите." : "", creatureInvisible(actor) ? "Невидим: +10 Скрытности, +5 к атаке; после атаки станет видим." : ""].filter(Boolean);
  return { fields, notes, rotfiend, available: fields.length > 0 || notes.length > 0 || ["cat", "foglet"].includes(profile?.id) || Boolean(rotfiend), infiniteStamina: creatureHasInfiniteStamina(actor), lycanthropy: profile?.id === "werewolf", detectMagic: ["katakan", "hym"].includes(profile?.id), detectSight: ["katakan", "foglet"].includes(profile?.id), weather: ["foglet", "wendigo"].includes(profile?.id), botchling: profile?.id === "botchling" && state.battleForm, senseMagic: profile?.id === "cat", sirenIllusion: profile?.id === "siren" && state.illusion, falling: (state.fallRemaining ?? 0) > 0, fallRemaining: state.fallRemaining ?? 0 };
}
