import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { CRITICAL_LEVELS } from "./damage-rules.mjs";
import { rollActionCheck } from "./action-economy.mjs";
import { workshopBase } from "../workshop/check.mjs";
import { findWound, setWoundState, stabilizeDC, WOUND_STATES } from "./critical-wound-effects.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Core pp.173–174 with errata v4: starting natural healing needs a DC 14 check; a doctor treats a critical wound
// by spending rounds and then rolling Healing Hands; the deadly column of the recovery table was removed.
export const HEALING_HANDS = "profession.doctor.healing-hands";
export const TREATMENT = { light: { rounds: 2, dc: 12 }, medium: { rounds: 4, dc: 14 }, severe: { rounds: 6, dc: 16 }, deadly: { rounds: 8, dc: 18 } };
const RECOVERY_DAYS = { light: [5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1], medium: [9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1], severe: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] };
export const START_HEALING_DC = 14;
const REQUEST = "healingRequest";

/** Days a treated wound takes to fade (core p.174); null when it does not fade (deadly wounds). */
export function recoveryDays(level, body) {
  const row = RECOVERY_DAYS[level];
  if (!row) return null;
  return row[Math.min(13, Math.max(3, Math.floor(body ?? 3))) - 3];
}

/** Healing Hands replaces First Aid when the doctor has it (core p.67). */
export function healerSkills(healer) {
  const firstAid = skillValue(healer.system, "firstAid")?.total ?? null;
  const hands = workshopBase(healer, HEALING_HANDS);
  const best = hands !== null && (firstAid === null || hands >= firstAid)
    ? { label: "Лечащее прикосновение", total: hands, hands: true } : { label: "Первая помощь", total: firstAid, hands: false };
  return { firstAid, hands, best };
}

/** The patient is the user's single target, otherwise the healer: self-treatment. */
export function healingPatient(healer) {
  const targets = Array.from(globalThis.game?.user?.targets ?? []).map(token => token.actor).filter(Boolean);
  const other = targets.length === 1 && targets[0].uuid !== healer.uuid && COMBAT_ACTOR_TYPES.includes(targets[0].type) ? targets[0] : null;
  return other ?? healer;
}

const wounds = actor => Array.from(actor?.effects ?? []).filter(effect => !effect.disabled && effect.flags?.[SYSTEM_ID]?.criticalWound);
/** Natural healing waits until the patient is stable: not dying and no untreated, unstabilised wound. */
export function healingBlocker(patient) {
  if (patient.system?.statistics?.dead) return "Пациент мёртв.";
  if (patient.system?.statistics?.dying) return "Сначала стабилизируйте пациента: он при смерти.";
  if (wounds(patient).some(effect => (effect.flags[SYSTEM_ID].criticalWound.state ?? "fresh") === "fresh"))
    return "Сначала стабилизируйте критические ранения.";
  return "";
}

export function healingContext(healer) {
  const patient = healingPatient(healer), self = patient === healer;
  const readable = self || patient.testUserPermission?.(game.user, "OBSERVER");
  const skills = healerSkills(healer), healing = patient.flags?.[SYSTEM_ID]?.healing ?? null;
  const recovery = patient.system?.statistics?.recovery ?? 0, hp = patient.system?.health ?? { value: 0, max: 0 };
  return {
    self, patientName: patient.name, readable, firstAid: skills.firstAid, hands: skills.hands, best: skills.best,
    hp, started: Boolean(healing?.active), handsBonus: Boolean(healing?.hands),
    // Core p.162: First Aid against how far HP is below 0 brings a dying character back to 1 HP.
    dying: readable && patient.system?.statistics?.dying && !patient.system.statistics.dead ? { dc: dyingDC(patient) } : null,
    canHeal: skills.best.total !== null, healingBlocked: readable ? healingBlocker(patient) : "",
    perDay: recovery + (healing?.hands ? 3 : 0), halfDay: Math.floor(recovery / 2) + (healing?.hands ? 3 : 0),
    canRest: self && healer.isOwner,
    wounds: readable ? wounds(patient).map(effect => {
      const data = effect.flags[SYSTEM_ID].criticalWound, wound = findWound(data.id), state = data.state ?? "fresh";
      const treatment = TREATMENT[data.level];
      return { id: effect.id, name: wound?.name ?? effect.name, place: data.locationName ?? "", state, stateLabel: WOUND_STATES[state],
        level: CRITICAL_LEVELS.find(entry => entry.id === data.level)?.name ?? "", fatal: data.id === "decapitation",
        stabilizeDC: stabilizeDC(data.level), treatRounds: treatment?.rounds, treatDC: treatment?.dc,
        canStabilize: state === "fresh" && data.id !== "decapitation" && skills.best.total !== null,
        canTreat: state !== "treated" && data.id !== "decapitation" && skills.hands !== null,
        days: state === "treated" ? data.recoveryDays ?? null : null };
    }) : []
  };
}

/** Writes on a patient the healer does not own go through the active GM, like loot requests. */
async function applyToPatient(healer, patient, change) {
  if (patient.isOwner) return performHealing(patient, change);
  if (!game.users.activeGM) throw new Error("Чтобы лечить чужого персонажа, нужен подключённый мастер.");
  await healer.update({ [`flags.${SYSTEM_ID}.${REQUEST}`]: { ...change, patient: patient.uuid, id: foundry.utils.randomID(), requester: game.user.id } });
}
async function performHealing(patient, change) {
  if (change.kind === "revive") {
    if (patient.system.health.value <= 0 && !patient.system.statistics?.dead) await patient.update({ "system.health.value": 1 });
    return;
  }
  if (change.kind === "start") return patient.update({ [`flags.${SYSTEM_ID}.healing`]: { active: true, hands: Boolean(change.hands) } });
  const effect = patient.effects.get(change.effectId);
  if (!effect?.flags?.[SYSTEM_ID]?.criticalWound) return;
  if (change.kind === "stabilize" && (effect.flags[SYSTEM_ID].criticalWound.state ?? "fresh") === "fresh") return setWoundState(effect, "stabilized");
  if (change.kind === "treat") {
    await setWoundState(effect, "treated");
    await effect.update({ [`flags.${SYSTEM_ID}.criticalWound.recoveryDays`]: change.days ?? null });
  }
}
export function registerHealingRequests() {
  Hooks.on("updateActor", (healer, changes) => {
    const request = foundry.utils.getProperty(changes, `flags.${SYSTEM_ID}.${REQUEST}`);
    if (!request || !game.users.activeGM?.isSelf) return;
    const requester = game.users.get(request.requester);
    (async () => {
      if (!requester || !healer.testUserPermission(requester, "OWNER")) throw new Error("Нет прав на лекаря.");
      const patient = await foundry.utils.fromUuid(request.patient);
      if (!patient) throw new Error("Пациент недоступен.");
      await performHealing(patient, request);
    })().catch(error => { console.error(`${SYSTEM_ID} | Healing`, error); ui.notifications.error(error.message); })
      .finally(() => healer.update({ [`flags.${SYSTEM_ID}.${REQUEST}`]: null }));
  });
  // The panel shows the patient: follow the user's target and any change to the patient (HP, dying, wounds).
  const panels = () => Array.from(foundry.applications.instances.values()).filter(app => app.actor && app.rendered && app.element?.querySelector(".witcher-healing-panel"));
  const pending = new Set();
  const refresh = foundry.utils.debounce(() => { for (const app of pending) if (app.rendered) app.render(); pending.clear(); }, 150);
  const patientChanged = actor => {
    if (!actor) return;
    for (const app of panels()) if (app.actor !== actor && healingPatient(app.actor)?.uuid === actor.uuid) pending.add(app);
    if (pending.size) refresh();
  };
  Hooks.on("targetToken", user => { if (user === game.user) { for (const app of panels()) pending.add(app); refresh(); } });
  Hooks.on("updateActor", actor => patientChanged(actor));
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, effect => patientChanged(effect.parent?.documentName === "Actor" ? effect.parent : null));
}

const check = (healer, { label, total, dc, title, patient }) => rollActionCheck(healer, { formula: `1d10wc + ${total}`,
  flavor: `<h3>${esc(title)}</h3><p>${healer === patient ? "Самолечение" : `${esc(healer.name)} → ${esc(patient.name)}`} · ${esc(label)} против СЛ ${dc}</p>`,
  flags: { [SYSTEM_ID]: { skillCheck: { key: "firstAid", base: total } } } });

/** First Aid (or Healing Hands) against the wound's DC (core p.158 sidebar). */
export async function stabilizePatientWound(healer, patient, effectId) {
  const effect = patient.effects.get(effectId), data = effect?.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data || (data.state ?? "fresh") !== "fresh") return;
  if (data.id === "decapitation") throw new Error("Это ранение нельзя стабилизировать.");
  const { best } = healerSkills(healer), dc = stabilizeDC(data.level);
  if (best.total === null) throw new Error("Заполните навык «Первая помощь».");
  const message = await check(healer, { ...best, dc, patient, title: `Стабилизация · ${findWound(data.id)?.name ?? effect.name}` });
  if (!message) return;
  const success = message.rolls[0].total >= dc;
  if (success) await applyToPatient(healer, patient, { kind: "stabilize", effectId });
  ui.notifications[success ? "info" : "warn"](success ? "Ранение стабилизировано." : `Стабилизация не удалась (${message.rolls[0].total} < ${dc}).`);
  return success;
}

export const dyingDC = patient => Math.max(1, -(patient.system?.health?.value ?? 0));
/** Core p.162: stabilising a dying character — First Aid against how far HP is below 0 (at least 1, since dying starts at 0 here); success sets HP to 1. */
export async function stabilizeDying(healer, patient) {
  if (!patient.system?.statistics?.dying || patient.system.statistics.dead) return;
  const { best } = healerSkills(healer), dc = dyingDC(patient);
  if (best.total === null) throw new Error("Заполните навык «Первая помощь».");
  const message = await check(healer, { ...best, dc, patient, title: "Стабилизация умирающего" });
  if (!message) return;
  const success = message.rolls[0].total >= dc;
  if (success) await applyToPatient(healer, patient, { kind: "revive" });
  ui.notifications[success ? "info" : "warn"](success ? `${patient.name}: стабилизирован, ПЗ 1.` : `Стабилизация не удалась (${message.rolls[0].total} < ${dc}); пациент остаётся при смерти.`);
  return success;
}

/** A doctor spends rounds on the wound, then rolls Healing Hands against its DC (core p.173, errata v4). */
export async function treatPatientWound(healer, patient, effectId) {
  const effect = patient.effects.get(effectId), data = effect?.flags?.[SYSTEM_ID]?.criticalWound;
  if (!data || data.state === "treated") return;
  if (data.id === "decapitation") throw new Error("Это ранение нельзя вылечить.");
  const hands = workshopBase(healer, HEALING_HANDS), treatment = TREATMENT[data.level];
  if (hands === null) throw new Error("Лечить критические ранения может только медик с навыком «Лечащее прикосновение».");
  const wound = findWound(data.id);
  const spent = await foundry.applications.api.DialogV2.confirm({ window: { title: `Лечение · ${wound?.name ?? effect.name}` },
    content: `<p>Медик должен заниматься раной <b>${treatment.rounds} раунд(ов)</b>, затем проверка Лечащего прикосновения против СЛ ${treatment.dc}.</p><p>Время лечения прошло?</p>`, rejectClose: false });
  if (!spent) return;
  const message = await check(healer, { label: "Лечащее прикосновение", total: hands, dc: treatment.dc, patient, title: `Лечение · ${wound?.name ?? effect.name}` });
  if (!message) return;
  const success = message.rolls[0].total >= treatment.dc;
  const days = recoveryDays(data.level, patient.system?.statistics?.effective?.body);
  if (success) await applyToPatient(healer, patient, { kind: "treat", effectId, days });
  ui.notifications[success ? "info" : "warn"](success
    ? `${wound?.name}: вылечено.${days ? ` Остаточные штрафы пройдут через ${days} дн.` : " Последствия смертельного ранения остаются."}`
    : `Лечение не удалось (${message.rolls[0].total} < ${treatment.dc}).`);
  return success;
}

/** Errata p.173: natural healing starts with a DC 14 Healing Hands or First Aid check by anyone. */
export async function startNaturalHealing(healer, patient) {
  const blocked = healingBlocker(patient);
  if (blocked) throw new Error(blocked);
  const { best } = healerSkills(healer);
  if (best.total === null) throw new Error("Заполните навык «Первая помощь».");
  const message = await check(healer, { ...best, dc: START_HEALING_DC, patient, title: "Начало исцеления" });
  if (!message) return;
  const success = message.rolls[0].total >= START_HEALING_DC;
  if (success) await applyToPatient(healer, patient, { kind: "start", hands: best.hands });
  ui.notifications[success ? "info" : "warn"](success ? `Исцеление начато${best.hands ? ": +3 ПЗ в день от Лечащего прикосновения" : ""}.` : "Не удалось начать исцеление.");
  return success;
}

/**
 * One day of rest (core p.173–174): Recovery in HP once healing has begun (half if the patient exerted themselves,
 * +3 with Healing Hands), and a day off every treated wound's remaining penalties.
 */
export async function restDay(actor, { active = false } = {}) {
  if (!actor.isOwner) throw new Error("Нет прав на этого персонажа.");
  const healing = actor.flags?.[SYSTEM_ID]?.healing, lines = [];
  const { value, max } = actor.system.health, recovery = actor.system.statistics?.recovery ?? 0;
  const blocked = healingBlocker(actor);
  if (blocked && value < max) lines.push(`ПЗ не восстанавливаются. ${blocked}`);
  else if (healing?.active && value < max) {
    const gain = Math.min(max - value, (active ? Math.floor(recovery / 2) : recovery) + (healing.hands ? 3 : 0));
    await actor.update({ "system.health.value": value + gain, ...(value + gain >= max ? { [`flags.${SYSTEM_ID}.healing`]: null } : {}) });
    lines.push(`Восстановлено ${gain} ПЗ (${value} → ${value + gain})${active ? ", половина Отдыха: персонаж был активен" : ""}${healing.hands ? ", +3 от Лечащего прикосновения" : ""}.`);
  } else if (value < max) lines.push(`ПЗ не восстанавливаются: исцеление не начато (Первая помощь или Лечащее прикосновение, СЛ ${START_HEALING_DC}).`);
  const healed = [], updates = [];
  for (const effect of wounds(actor)) {
    const data = effect.flags[SYSTEM_ID].criticalWound;
    if (data.state !== "treated" || !(data.recoveryDays > 0)) continue;
    if (data.recoveryDays <= 1) healed.push(effect);
    else updates.push({ _id: effect.id, [`flags.${SYSTEM_ID}.criticalWound.recoveryDays`]: data.recoveryDays - 1 });
  }
  if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
  if (healed.length) await actor.deleteEmbeddedDocuments("ActiveEffect", healed.map(effect => effect.id));
  if (healed.length) lines.push(`Полностью зажило: ${healed.map(effect => findWound(effect.flags[SYSTEM_ID].criticalWound.id)?.name ?? effect.name).join(", ")}.`);
  if (updates.length) lines.push(`Заживает дальше: ${updates.length} ран.`);
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    content: `<h3>День отдыха</h3>${(lines.length ? lines : ["Восстанавливать нечего."]).map(line => `<p>${esc(line)}</p>`).join("")}` });
}
