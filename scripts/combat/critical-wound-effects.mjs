import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { CRITICAL_WOUNDS } from "../data/critical-wounds.mjs";
import { EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { stunSucceeded } from "../data/statistics.mjs";
import { CRITICAL_LEVELS } from "./damage-rules.mjs";
import { rollActionCheck } from "./action-economy.mjs";
import { rollStun } from "./stun-roll.mjs";
import { setStatus, DEAD } from "./status-effects.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Core pp.158–160 (errata v4: bonus damage ignores armor; Heart Damage treated effect).
// Every wound lists its rules before stabilisation, after it, and after treatment.
const MAGIC = ["spellCasting", "ritualCrafting", "hexWeaving"];
const VERBAL = ["charisma", "persuasion", "seduction", "leadership", "deceit", "socialEtiquette", "intimidation"];
const EMPATHIC = ["charisma", "persuasion", "seduction", "leadership", "deceit", "socialEtiquette"];
const skills = (keys, value) => keys.map(key => ({ target: `skills.${key}`, value }));
const attrs = (keys, value, extra = {}) => keys.map(key => ({ target: `attributes.${key}`, value, ...extra }));
const factor = (target, value, extra = {}) => ({ target, factor: value, value: 0, ...extra });
const mobility = value => [...attrs(["speed"], value), ...skills(["dodgeEscape", "athletics"], value)];
const mobilityFactor = value => ["attributes.speed", "skills.dodgeEscape", "skills.athletics"].map(target => factor(target, value));
const allActions = value => [{ target: "combat.attack", value }, { target: "combat.defense", value }];
// "Actions with this arm": the arm is resolved when the wound is applied (see armPenaltyParts).
const arm = value => [{ target: "combat.arm", value }];
const disabledArm = [{ target: "hands", value: -1 }];
const headTimesFour = [{ target: "damage.headMultiplier", value: 1 }];

/**
 * mods: [fresh, stabilized, treated]. conditions: linked status effects created with the wound and removed when it
 * leaves that state. stunEvery: periodic Stun save interval in rounds (formula). acid: damage at the start of each turn.
 */
export const WOUND_RULES = {
  "cracked-jaw": { mods: [[...skills(MAGIC, -2), ...skills(VERBAL, -2)], [...skills(MAGIC, -1), ...skills(VERBAL, -1)], skills(MAGIC, -1)] },
  "disfiguring-scar": { mods: [skills(EMPATHIC, -3), skills(EMPATHIC, -1), skills(["seduction"], -1)] },
  "cracked-ribs": { mods: [attrs(["body"], -2, { resourceNeutral: true }), attrs(["body"], -1, { resourceNeutral: true }), [{ target: "carryMax", value: -10 }]] },
  "foreign-object": { mods: [[factor("recovery", 0.25)], [factor("recovery", 0.5)], [{ target: "recovery", value: -2 }]] },
  "sprained-arm": { arm: true, mods: [arm(-2), arm(-1), skills(["physique"], -1)] },
  "sprained-leg": { mods: [mobility(-2), mobility(-1), attrs(["speed"], -1)] },
  "minor-head-wound": { mods: [[...attrs(["intelligence", "will"], -1), { target: "stun", value: -1 }], attrs(["intelligence", "will"], -1), attrs(["will"], -1)] },
  "lost-teeth": { teeth: true, mods: [[...skills(MAGIC, -3), ...skills(VERBAL, -3)], [...skills(MAGIC, -2), ...skills(VERBAL, -2)], [...skills(MAGIC, -1), ...skills(VERBAL, -1)]] },
  "ruptured-spleen": { conditions: { fresh: ["bleeding"] }, stunEvery: { fresh: "5", stabilized: "10" }, mods: [[], [], [{ target: "stun", value: -2 }]] },
  "broken-ribs": { mods: [[...attrs(["body"], -2), ...attrs(["reflex", "dexterity"], -1)], attrs(["body", "reflex"], -1), attrs(["body"], -1)] },
  "fractured-arm": { arm: true, mods: [arm(-3), arm(-2), arm(-1)] },
  "fractured-leg": { mods: [mobility(-3), mobility(-2), mobility(-1)] },
  "cracked-skull": { conditions: { fresh: ["bleeding"] }, mods: [[...attrs(["intelligence", "dexterity"], -1), ...headTimesFour], [...attrs(["intelligence", "dexterity"], -1), ...headTimesFour], headTimesFour] },
  "concussion": { stunEvery: { fresh: "1d6" }, mods: [attrs(["intelligence", "reflex", "dexterity"], -2), attrs(["intelligence", "reflex", "dexterity"], -1), attrs(["intelligence", "dexterity"], -1)] },
  "torn-stomach": { acid: { fresh: 4 }, mods: [allActions(-2), allActions(-2), allActions(-1)] },
  "sucking-chest-wound": { conditions: { fresh: ["suffocating"] }, mods: [attrs(["body", "speed"], -3), attrs(["body", "speed"], -2), attrs(["body", "speed"], -1)] },
  "compound-arm-fracture": { arm: true, conditions: { fresh: ["bleeding"] }, mods: [disabledArm, disabledArm, []] },
  "compound-leg-fracture": { conditions: { fresh: ["bleeding"] }, mods: [mobilityFactor(0.25), mobilityFactor(0.5), mobility(-2)] },
  "decapitation": { dead: true, mods: [[], [], []] },
  "damaged-eye": { conditions: { fresh: ["bleeding"] }, mods: [[...skills(["awareness"], -5), ...attrs(["dexterity"], -4)], [...skills(["awareness"], -3), ...attrs(["dexterity"], -2)], [...skills(["awareness"], -1), ...attrs(["dexterity"], -1)]] },
  "heart-damage": { deathSave: true, conditions: { fresh: ["bleeding"] },
    mods: [[factor("staminaMax", 0.25), factor("attributes.speed", 0.25), factor("attributes.body", 0.25, { resourceNeutral: true })], [factor("staminaMax", 0.5), factor("attributes.speed", 0.5), factor("attributes.body", 0.5, { resourceNeutral: true })], [{ target: "bleedingDamage", value: 2 }]] },
  "septic-shock": { conditions: { fresh: ["poisoned"] },
    mods: [[factor("staminaMax", 0.25), ...attrs(["intelligence", "will", "reflex", "dexterity"], -3)], [factor("staminaMax", 0.5), ...attrs(["intelligence", "will", "reflex", "dexterity"], -1)], [{ target: "staminaMax", value: -5 }]] },
  // A healed stump is still a lost limb until a prosthesis replaces it (core p.160).
  "dismembered-arm": { arm: true, limb: "arm", conditions: { fresh: ["bleeding"] }, mods: [disabledArm, disabledArm, disabledArm] },
  "dismembered-leg": { leg: true, limb: "leg", conditions: { fresh: ["bleeding"] }, mods: [mobilityFactor(0.25), mobilityFactor(0.25), mobilityFactor(0.25)] }
};
// Core p.160 «Протезы». A simple arm does simple tasks but holds no weapon; a quality arm holds one at −5.
// A simple leg moves at ¾ SPD with −5 to Dodge/Escape and Athletics; a quality leg keeps SPD with −3.
export const PROSTHESES = { "gear.simple-prosthesis": "simple", "gear.quality-prosthesis": "quality" };
const PROSTHESIS_MODS = {
  arm: { simple: () => disabledArm, quality: () => arm(-5) },
  leg: { simple: () => [factor("attributes.speed", 0.75), ...skills(["dodgeEscape", "athletics"], -5)], quality: () => skills(["dodgeEscape", "athletics"], -3) }
};
export const PROSTHESIS_NAMES = { simple: "простой", quality: "качественный" };
export const WOUND_STATES = { fresh: "Не обработано", stabilized: "Стабилизировано", treated: "Вылечено" };
const STATE_INDEX = { fresh: 0, stabilized: 1, treated: 2 };
const ARMS = { rightArm: "Правая рука", leftArm: "Левая рука" };
const LEGS = { rightLeg: "Правая нога", leftLeg: "Левая нога" };
const CONDITION_NAMES = { bleeding: "кровотечение", suffocating: "удушье", poisoned: "отравление" };

export const findWound = id => Object.entries(CRITICAL_WOUNDS).flatMap(([level, list]) => list.map(entry => ({ ...entry, level }))).find(entry => entry.id === id);
export function woundModifiers(id, state, { arm: side = "", prosthesis = null } = {}) {
  const limb = WOUND_RULES[id]?.limb, fitted = limb && prosthesis?.quality ? PROSTHESIS_MODS[limb][prosthesis.quality] : null;
  const list = structuredClone(fitted ? fitted() : WOUND_RULES[id]?.mods[STATE_INDEX[state] ?? 0] ?? []);
  return list.map(modifier => modifier.target === "combat.arm" ? { ...modifier, arm: side || "rightArm" } : modifier);
}
export const stabilizeDC = level => CRITICAL_LEVELS.find(entry => entry.id === level)?.stabilize ?? 12;
export const linkedConditions = (id, state) => WOUND_RULES[id]?.conditions?.[state] ?? [];

/** Mechanics in plain words, so the sheet and the compendium say exactly what is automated. */
function automationNotes(id, state, prosthesis = null) {
  const rules = WOUND_RULES[id] ?? {}, notes = [];
  if (prosthesis?.quality) notes.push(`Протез (${PROSTHESIS_NAMES[prosthesis.quality]}) заменяет утраченную конечность. Удар в неё не наносит урона, но протез отваливается.`);
  else if (rules.limb && state === "treated") notes.push("Можно надеть протез из инвентаря.");
  const conditions = linkedConditions(id, state);
  if (conditions.length) notes.push(`Накладывает: ${conditions.map(key => CONDITION_NAMES[key]).join(", ")}; снимается вместе со стабилизацией.`);
  if (rules.stunEvery?.[state]) notes.push(`Испытание Устойчивости в начале хода каждые ${rules.stunEvery[state] === "1d6" ? "1d6" : rules.stunEvery[state]} раундов.`);
  if (rules.acid?.[state]) notes.push(`${rules.acid[state]} урона кислотой в начале каждого хода, броня не защищает.`);
  if (state === "fresh" && rules.dead) notes.push("Персонаж погибает.");
  if (state === "fresh" && rules.deathSave) notes.push("Сразу — испытание против смерти; провал означает гибель.");
  if (rules.arm && woundModifiers(id, state, { prosthesis }).some(modifier => modifier.target === "combat.arm"))
    notes.push("Штраф руки: к атакам и защите оружием, если оно в этой руке (правая — основная; левая — при хвате двумя руками или двух оружиях).");
  if (woundModifiers(id, state, { prosthesis }).some(modifier => modifier.target === "hands")) notes.push("Рукой нельзя пользоваться: доступна одна рука, двуручный хват невозможен.");
  return notes;
}

function woundDescription(wound, level, locationName, state, note = "", prosthesis = null) {
  const levelName = CRITICAL_LEVELS.find(entry => entry.id === level)?.name ?? "";
  const line = (key, label, text) => `<p class="${state === key ? "is-current" : ""}"><b>${label}:</b> ${esc(text)}</p>`;
  const notes = automationNotes(wound.id, state, prosthesis);
  return `<p><b>${esc(levelName)} ранение${locationName ? ` · ${esc(locationName)}` : ""}</b></p>`
    + line("fresh", "Сейчас", wound.effect) + line("stabilized", "После стабилизации", wound.stabilized) + line("treated", "После лечения", wound.treated)
    + (note ? `<p>${esc(note)}</p>` : "")
    + (notes.length ? `<p><small><b>Автоматически:</b> ${notes.map(esc).join(" ")}</small></p>` : "")
    + `<p><small>Стабилизация: Первая помощь СЛ ${stabilizeDC(level)}. Лечение: медик, Лечащее прикосновение.</small></p>`;
}

/** ActiveEffect source for a wound; its modifiers follow the wound state. */
export function woundEffectData(woundId, level, { location = "", locationName = "", state = "fresh", arm = "", note = "", prosthesis = null } = {}) {
  const wound = findWound(woundId);
  if (!wound) throw new Error("Неизвестное критическое ранение.");
  const rules = WOUND_RULES[woundId] ?? {}, limbs = rules.arm ? ARMS : rules.leg ? LEGS : null;
  // `arm` stores the struck limb's side: an arm, or a leg for a lost leg.
  const side = limbs ? arm || (limbs[location] ? location : "") : "";
  const place = side && !limbs[location] ? limbs[side] : locationName;
  const fitted = rules.limb && prosthesis?.quality ? { itemId: prosthesis.itemId ?? "", quality: prosthesis.quality } : null;
  return { name: `Крит: ${wound.name}`, img: "icons/svg/blood.svg", description: woundDescription(wound, level, place, state, note, fitted),
    flags: { [SYSTEM_ID]: { criticalWound: { id: woundId, level, location, locationName: place, state, arm: side, note, prosthesis: fitted },
      condition: { key: "critical-wound", modifiers: woundModifiers(woundId, state, { arm: side, prosthesis: fitted }) } } } };
}

const conditionData = (key, source) => {
  const template = EFFECT_TEMPLATES.find(entry => entry.key === key);
  const data = conditionSource(template);
  delete data._id;
  data.flags[SYSTEM_ID].criticalWoundSource = source.id;
  return data;
};
/** Statuses do not stack (core p.161): an existing bleed stays independent of this wound. */
async function linkConditions(actor, effect, state) {
  const created = [];
  for (const key of linkedConditions(effect.flags[SYSTEM_ID].criticalWound.id, state)) {
    if (actor.effects.some(entry => entry.statuses.has(key) && !entry.disabled)) continue;
    created.push(...await actor.createEmbeddedDocuments("ActiveEffect", [conditionData(key, effect)]));
  }
  return created.map(entry => entry.id);
}
/** A condition outlives this wound while another untreated wound still causes it (two bleeding wounds, one bleed). */
async function unlinkConditions(actor, effect) {
  const remove = [], hand = [];
  for (const entry of actor.effects.filter(other => other.flags?.[SYSTEM_ID]?.criticalWoundSource === effect.id)) {
    const heir = actor.effects.find(other => other.id !== effect.id && !other.disabled && other.flags?.[SYSTEM_ID]?.criticalWound
      && linkedConditions(other.flags[SYSTEM_ID].criticalWound.id, other.flags[SYSTEM_ID].criticalWound.state ?? "fresh").some(key => entry.statuses.has(key)));
    if (heir) hand.push({ _id: entry.id, [`flags.${SYSTEM_ID}.criticalWoundSource`]: heir.id });
    else remove.push(entry.id);
  }
  if (hand.length) await actor.updateEmbeddedDocuments("ActiveEffect", hand);
  if (remove.length) await actor.deleteEmbeddedDocuments("ActiveEffect", remove);
}

/** Core p.160, Heart Damage: an immediate death save — 1d10 under the Stun value or the character dies. */
async function heartDeathSave(actor, wound) {
  const stun = actor.system.statistics?.stun;
  if (stun === null || stun === undefined) return;
  const roll = await new foundry.dice.Roll("1d10").evaluate();
  const survived = stunSucceeded(roll.total, stun);
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<h3>Испытание против смерти · ${esc(wound.name)}</h3><p>Нужно меньше ${stun}: <strong>${survived ? "персонаж выжил" : "персонаж погиб"}</strong>.</p>` });
  if (!survived) await setStatus(actor, DEAD, true);
}

/**
 * Side effects of a new wound, whether it came from an attack or was dragged from the compendium:
 * the arm it struck, knocked-out teeth, linked conditions, death. Runs once, on the creating client.
 */
export async function onWoundCreated(effect, _options, userId) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound, actor = effect.parent;
  if (!data || data.applied || userId !== game.user.id || actor?.documentName !== "Actor" || !actor.isOwner) return;
  const rules = WOUND_RULES[data.id] ?? {}, wound = findWound(data.id);
  let { arm: side = "", note = "" } = data;
  if ((rules.arm || rules.leg) && !side) {
    const first = (await new foundry.dice.Roll("1d2").evaluate()).total === 1;
    side = rules.arm ? (first ? "rightArm" : "leftArm") : (first ? "rightLeg" : "leftLeg");
  }
  if (rules.teeth && !note) note = `Выбито зубов: ${(await new foundry.dice.Roll("1d10").evaluate()).total}.`;
  const source = woundEffectData(data.id, data.level, { ...data, arm: side, note });
  const linked = data.state === "fresh" ? await linkConditions(actor, effect, "fresh") : [];
  await effect.update({ description: source.description, [`flags.${SYSTEM_ID}.criticalWound`]: { ...source.flags[SYSTEM_ID].criticalWound, applied: true, linked },
    [`flags.${SYSTEM_ID}.condition.modifiers`]: source.flags[SYSTEM_ID].condition.modifiers });
  if (data.state !== "fresh") return;
  if (rules.dead) await setStatus(actor, DEAD, true);
  else if (rules.deathSave) await heartDeathSave(actor, wound);
}
export async function onWoundDeleted(effect, _options, userId) {
  if (!effect.flags?.[SYSTEM_ID]?.criticalWound || userId !== game.user.id || effect.parent?.documentName !== "Actor") return;
  await unlinkConditions(effect.parent, effect);
}
// Wounds created in one batch would otherwise all see "no bleeding yet" and stack the condition.
const queues = new Map();
function queued(effect, work) {
  const key = effect.parent?.uuid ?? "";
  const job = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(key, job);
  job.finally(() => { if (queues.get(key) === job) queues.delete(key); }).catch(() => {});
  return job;
}
export function registerCriticalWoundHooks() {
  const report = error => console.error(`${SYSTEM_ID} | Critical wound`, error);
  Hooks.on("createActiveEffect", (...args) => { if (args[0].flags?.[SYSTEM_ID]?.criticalWound) queued(args[0], () => onWoundCreated(...args)).catch(report); });
  Hooks.on("deleteActiveEffect", (...args) => { if (args[0].flags?.[SYSTEM_ID]?.criticalWound) queued(args[0], () => onWoundDeleted(...args)).catch(report); });
  const prosthesisChanged = (item, userId) => { if (PROSTHESES[item.system?.ruleId]) queued(item, () => releaseProsthesis(item, userId)).catch(report); };
  Hooks.on("updateItem", (item, _changes, _options, userId) => prosthesisChanged(item, userId));
  Hooks.on("deleteItem", (item, _options, userId) => prosthesisChanged(item, userId));
}

export async function setWoundState(effect, state) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data || !WOUND_STATES[state]) return;
  const source = woundEffectData(data.id, data.level, { ...data, state });
  // Stabilising stops the bleeding and other conditions this wound caused.
  if (effect.parent?.documentName === "Actor" && state !== "fresh") await unlinkConditions(effect.parent, effect);
  await effect.update({ description: source.description, [`flags.${SYSTEM_ID}.criticalWound.state`]: state,
    [`flags.${SYSTEM_ID}.criticalWound.nextStun`]: null,
    [`flags.${SYSTEM_ID}.condition.modifiers`]: source.flags[SYSTEM_ID].condition.modifiers });
}

/** Fit or take off a prosthesis on a healed lost limb; the wound's penalties follow the prosthesis. */
export async function setProsthesis(effect, item = null) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound, actor = effect.parent;
  if (!data || !WOUND_RULES[data.id]?.limb || actor?.documentName !== "Actor") return;
  const previous = data.prosthesis?.itemId ? actor.items.get(data.prosthesis.itemId) : null;
  let prosthesis = null;
  if (item) {
    const quality = PROSTHESES[item.system?.ruleId];
    if (!quality || item.parent !== actor) throw new Error("Выберите протез из инвентаря этого персонажа.");
    if ((data.state ?? "fresh") !== "treated") throw new Error("Протез надевают на вылеченную рану: сначала отметьте лечение.");
    if (!(item.system.quantity > 0) || item.system.containerId || item.system.carried === false) throw new Error("Протез должен быть при персонаже.");
    const used = actor.effects.filter(other => other.id !== effect.id && other.flags?.[SYSTEM_ID]?.criticalWound?.prosthesis?.itemId === item.id).length;
    if (used >= item.system.quantity) throw new Error("Этот протез уже надет на другую конечность.");
    prosthesis = { itemId: item.id, quality };
  }
  const source = woundEffectData(data.id, data.level, { ...data, prosthesis });
  await effect.update({ description: source.description, [`flags.${SYSTEM_ID}.criticalWound.prosthesis`]: prosthesis,
    [`flags.${SYSTEM_ID}.condition.modifiers`]: source.flags[SYSTEM_ID].condition.modifiers });
  if (item && !item.system.equipped) await item.update({ "system.equipped": true });
  if (previous && previous.id !== item?.id && previous.system.equipped
    && !actor.effects.some(other => other.flags?.[SYSTEM_ID]?.criticalWound?.prosthesis?.itemId === previous.id)) await previous.update({ "system.equipped": false });
}
/** The wound whose prosthesis replaces the limb at this hit location, if any. */
export function prosthesisAt(actor, location) {
  for (const effect of actor?.effects ?? []) {
    const data = effect.flags?.[SYSTEM_ID]?.criticalWound;
    if (effect.disabled || !data?.prosthesis?.itemId || data.arm !== location) continue;
    const item = actor.items.get(data.prosthesis.itemId);
    if (item) return { effect, item };
  }
  return null;
}
/** A prosthesis taken off the body (unequipped, dropped, deleted) no longer replaces the limb. */
async function releaseProsthesis(item, userId) {
  const actor = item.parent;
  if (userId !== game.user.id || actor?.documentName !== "Actor") return;
  const worn = actor.items.get(item.id)?.system.equipped && actor.items.get(item.id).system.quantity > 0;
  for (const effect of actor.effects.filter(other => other.flags?.[SYSTEM_ID]?.criticalWound?.prosthesis?.itemId === item.id))
    if (!worn) await setProsthesis(effect, null);
}

const activeWounds = actor => actor.effects.filter(effect => !effect.disabled && !effect.isSuppressed && effect.flags?.[SYSTEM_ID]?.criticalWound);
/** Torn Stomach: 4 acid damage at the start of every turn while untreated (core p.159). */
export const woundAcidDamage = actor => activeWounds(actor).reduce((sum, effect) => {
  const data = effect.flags[SYSTEM_ID].criticalWound;
  return sum + (WOUND_RULES[data.id]?.acid?.[data.state ?? "fresh"] ?? 0);
}, 0);

/** Periodic Stun saves (Ruptured Spleen, Concussion). The first one comes after a full interval. Active GM only. */
export async function criticalWoundTurn(combat, combatant, context) {
  const actor = combatant?.actor;
  if (!actor || game.user !== game.users.activeGM || !combat.started || context.skipped || context.round < 1) return;
  for (const effect of activeWounds(actor)) {
    const data = effect.flags[SYSTEM_ID].criticalWound, every = WOUND_RULES[data.id]?.stunEvery?.[data.state ?? "fresh"];
    if (!every) continue;
    const next = data.nextStun?.combat === combat.uuid ? data.nextStun.round : null;
    if (next !== null && context.round < next) continue;
    const interval = (await new foundry.dice.Roll(every).evaluate()).total;
    await effect.update({ [`flags.${SYSTEM_ID}.criticalWound.nextStun`]: { combat: combat.uuid, round: context.round + interval } });
    if (next !== null) await rollStun(actor);
  }
}

/** Arm penalties apply to weapon actions with the injured arm; the right arm is the weapon arm by convention. */
export function armPenaltyParts(actor, item) {
  const weapon = item?.system;
  if (!weapon || weapon.natural) return [];
  const twoHanded = (weapon.grip || weapon.hands || 1) >= 2;
  return (actor.system?.statistics?.modifiers ?? []).filter(modifier => modifier.target === "combat.arm" && modifier.value
    && (twoHanded || modifier.arm !== "leftArm")).map(modifier => ({ label: modifier.label, value: modifier.value }));
}
/** Hands left to hold weapons: two, minus every arm that cannot be used. */
export const usableHands = actor => Math.max(0, 2 + (actor.system?.statistics?.modifiers ?? []).filter(modifier => modifier.target === "hands").reduce((sum, modifier) => sum + modifier.value, 0));

/** First Aid against the wound's DC (core p.162). The controlled token heals when it is someone else. */
export async function stabilizeWound(actor, effect) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data || data.state !== "fresh") return;
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(token => token.actor).find(other => other?.isOwner && other.uuid !== actor.uuid);
  const healer = controlled ?? actor, skill = skillValue(healer.system, "firstAid"), dc = stabilizeDC(data.level);
  if (skill?.total === null) throw new Error("Заполните навык «Первая помощь».");
  const wound = findWound(data.id);
  if (data.id === "decapitation") throw new Error("Это ранение нельзя стабилизировать.");
  const message = await rollActionCheck(healer, { formula: `1d10wc + ${skill.total}`,
    flavor: `<h3>Стабилизация · ${esc(wound.name)}</h3><p>${healer === actor ? "Самопомощь" : `${esc(healer.name)} → ${esc(actor.name)}`} · Первая помощь против СЛ ${dc}</p>`,
    flags: { [SYSTEM_ID]: { skillCheck: { key: "firstAid", base: skill.total } } } });
  if (!message) return;
  const success = message.rolls[0].total >= dc;
  if (success) await setWoundState(effect, "stabilized");
  ui.notifications[success ? "info" : "warn"](success ? `${wound.name}: стабилизировано.` : `${wound.name}: стабилизация не удалась (${message.rolls[0].total} < ${dc}).`);
  return success;
}

/** Context for the shared effects list. */
export function woundContext(effect, editable) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data) return null;
  const fatal = data.id === "decapitation", limb = WOUND_RULES[data.id]?.limb;
  return { state: data.state ?? "fresh", stateLabel: WOUND_STATES[data.state ?? "fresh"], dc: stabilizeDC(data.level),
    canStabilize: editable && !fatal && (data.state ?? "fresh") === "fresh", canTreat: editable && !fatal && data.state !== "treated",
    prosthesis: data.prosthesis?.quality ? PROSTHESIS_NAMES[data.prosthesis.quality] : "",
    canFitProsthesis: editable && Boolean(limb) && data.state === "treated" && !data.prosthesis?.quality,
    canRemoveProsthesis: editable && Boolean(data.prosthesis?.quality) };
}

/** Compendium entries: one per wound, untreated, with the arm resolved when it is applied to a character. */
export const CRITICAL_WOUND_SOURCES = Object.entries(CRITICAL_WOUNDS).flatMap(([level, list]) => list.map(wound => ({ wound, level })))
  .map(({ wound, level }, i) => {
    const data = woundEffectData(wound.id, level);
    const levelName = CRITICAL_LEVELS.find(entry => entry.id === level)?.name ?? "";
    return { _id: `efct${String(201 + i).padStart(12, "0")}`, name: `${data.name} (${levelName.toLocaleLowerCase("ru")})`, img: data.img, type: "base", system: {},
      description: data.description, disabled: false, transfer: false, statuses: [], showIcon: 2, start: null,
      duration: { value: null, units: "seconds", expiry: null, expired: false }, folder: null, sort: 0, flags: data.flags };
  });
