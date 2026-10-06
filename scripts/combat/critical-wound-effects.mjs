import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { CRITICAL_WOUNDS } from "../data/critical-wounds.mjs";
import { CRITICAL_LEVELS } from "./damage-rules.mjs";
import { rollActionCheck } from "./action-economy.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Core pp.158–160: penalties for each wound before stabilisation, after it, and after treatment.
// Only effects expressible as numbers become modifiers; the rest stays in the description.
const MAGIC = ["spellCasting", "ritualCrafting", "hexWeaving"];
const VERBAL = ["charisma", "persuasion", "seduction", "leadership", "deceit", "socialEtiquette", "intimidation"];
const EMPATHIC = ["charisma", "persuasion", "seduction", "leadership", "deceit"];
const skills = (keys, value) => keys.map(key => ({ target: `skills.${key}`, value }));
const attrs = (keys, value) => keys.map(key => ({ target: `attributes.${key}`, value }));
const mobility = value => [...attrs(["speed"], value), ...skills(["dodgeEscape", "athletics"], value)];
const allActions = value => [{ target: "combat.attack", value }, { target: "combat.defense", value }];

const MODIFIERS = {
  "cracked-jaw": [[...skills(MAGIC, -2), ...skills(VERBAL, -2)], [...skills(MAGIC, -1), ...skills(VERBAL, -1)], skills(MAGIC, -1)],
  "disfiguring-scar": [skills(EMPATHIC, -3), skills(EMPATHIC, -1), skills(["seduction"], -1)],
  "cracked-ribs": [attrs(["body"], -2), attrs(["body"], -1), []],
  "sprained-leg": [mobility(-2), mobility(-1), attrs(["speed"], -1)],
  "minor-head-wound": [attrs(["intelligence", "will"], -1), attrs(["intelligence", "will"], -1), attrs(["will"], -1)],
  "lost-teeth": [[...skills(MAGIC, -3), ...skills(VERBAL, -3)], [...skills(MAGIC, -2), ...skills(VERBAL, -2)], [...skills(MAGIC, -1), ...skills(VERBAL, -1)]],
  "ruptured-spleen": [[], [], []],
  "broken-ribs": [[...attrs(["body"], -2), ...attrs(["reflex", "dexterity"], -1)], attrs(["body", "reflex"], -1), attrs(["body"], -1)],
  "fractured-leg": [mobility(-3), mobility(-2), mobility(-1)],
  "cracked-skull": [attrs(["intelligence", "dexterity"], -1), attrs(["intelligence", "dexterity"], -1), []],
  "concussion": [attrs(["intelligence", "reflex", "dexterity"], -2), attrs(["intelligence", "reflex", "dexterity"], -1), attrs(["intelligence", "dexterity"], -1)],
  "torn-stomach": [allActions(-2), allActions(-2), allActions(-1)],
  "sucking-chest-wound": [attrs(["body", "speed"], -3), attrs(["body", "speed"], -2), attrs(["body", "speed"], -1)],
  "compound-leg-fracture": [[], [], mobility(-2)],
  "damaged-eye": [[...skills(["awareness"], -5), ...attrs(["dexterity"], -4)], [...skills(["awareness"], -3), ...attrs(["dexterity"], -2)], [...skills(["awareness"], -1), ...attrs(["dexterity"], -1)]],
  "septic-shock": [attrs(["intelligence", "will", "reflex", "dexterity"], -3), attrs(["intelligence", "will", "reflex", "dexterity"], -1), []]
};
export const WOUND_STATES = { fresh: "Не обработано", stabilized: "Стабилизировано", treated: "Вылечено" };
const STATE_INDEX = { fresh: 0, stabilized: 1, treated: 2 };

const findWound = id => Object.entries(CRITICAL_WOUNDS).flatMap(([level, list]) => list.map(entry => ({ ...entry, level }))).find(entry => entry.id === id);
export const woundModifiers = (id, state) => structuredClone(MODIFIERS[id]?.[STATE_INDEX[state] ?? 0] ?? []);
export const stabilizeDC = level => CRITICAL_LEVELS.find(entry => entry.id === level)?.stabilize ?? 12;

function woundDescription(wound, level, locationName, state) {
  const levelName = CRITICAL_LEVELS.find(entry => entry.id === level)?.name ?? "";
  const line = (key, label, text) => `<p class="${state === key ? "is-current" : ""}"><b>${label}:</b> ${esc(text)}</p>`;
  return `<p><b>${esc(levelName)} ранение${locationName ? ` · ${esc(locationName)}` : ""}</b></p>`
    + line("fresh", "Сейчас", wound.effect) + line("stabilized", "После стабилизации", wound.stabilized) + line("treated", "После лечения", wound.treated)
    + `<p><small>Стабилизация: Первая помощь СЛ ${stabilizeDC(level)}. Лечение: медик, Лечащее прикосновение.</small></p>`;
}

/** ActiveEffect source for a wound; its modifiers follow the wound state. */
export function woundEffectData(woundId, level, { location = "", locationName = "", state = "fresh" } = {}) {
  const wound = findWound(woundId);
  if (!wound) throw new Error("Неизвестное критическое ранение.");
  return { name: `Крит: ${wound.name}`, img: "icons/svg/blood.svg", description: woundDescription(wound, level, locationName, state),
    flags: { [SYSTEM_ID]: { criticalWound: { id: woundId, level, location, locationName, state },
      condition: { key: "critical-wound", modifiers: woundModifiers(woundId, state) } } } };
}

export async function setWoundState(effect, state) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data || !WOUND_STATES[state]) return;
  const source = woundEffectData(data.id, data.level, { ...data, state });
  await effect.update({ description: source.description, [`flags.${SYSTEM_ID}.criticalWound.state`]: state,
    [`flags.${SYSTEM_ID}.condition.modifiers`]: source.flags[SYSTEM_ID].condition.modifiers });
}

/** First Aid against the wound's DC (core p.162). The controlled token heals when it is someone else. */
export async function stabilizeWound(actor, effect) {
  const data = effect.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data || data.state !== "fresh") return;
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(token => token.actor).find(other => other?.isOwner && other.uuid !== actor.uuid);
  const healer = controlled ?? actor, skill = skillValue(healer.system, "firstAid"), dc = stabilizeDC(data.level);
  if (skill?.total === null) throw new Error("Заполните навык «Первая помощь».");
  const wound = findWound(data.id);
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
  return { state: data.state ?? "fresh", stateLabel: WOUND_STATES[data.state ?? "fresh"], dc: stabilizeDC(data.level),
    canStabilize: editable && (data.state ?? "fresh") === "fresh", canTreat: editable && data.state !== "treated" };
}
