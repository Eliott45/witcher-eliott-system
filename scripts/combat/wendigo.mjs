import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { skillValue } from "../data/skills.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { ALL_SKILL_KEYS } from "../data/condition-definitions.mjs";
import { actionQuote, actionUpdate } from "./action-economy.mjs";
import { creatureMentalImmunity } from "./creature-spirits.mjs";
import { activeCreatureGM, requireCreatureGM, creatureFlags, creatureTargets, creatureRoll, creaturePost, esc } from "./creature-actions-common.mjs";

// Monster Hunter's Journal p.51, wendigo: spoiled food and a three-day curse of hunger that ends in servitude.
export const WENDIGO = { spoilDc: 18, cureStamina: 10 };
export const isWendigo = actor => creatureProfile(actor)?.id === "wendigo";
const allActions = value => [...ALL_SKILL_KEYS.map(key => ({ target: `skills.${key}`, value })), { target: "attributeCheck", value }];
export const wendigoCurse = actor => Array.from(actor?.effects ?? []).find(effect => activeEffect(effect) && creatureFlags(effect).wendigoCurse) ?? null;

const STAGES = {
  1: { text: "День первый: изнывает от жажды сырого мяса. Не съев его к утру, получит −1 ко всем действиям и вдвое меньше ВЫН.", modifiers: [] },
  2: { text: "День второй: урчащий живот и неутолимая жажда свежего мяса. При любой возможности — 1d10 ниже Воли, чтобы не поддаться. Не съев сырого мяса к утру, получит −3 ко всем действиям и вчетверо меньше ВЫН.",
    modifiers: [...allActions(-1), { target: "staminaMax", factor: 0.5, value: 0 }] },
  3: { text: "День третий: жуткий голод и тяга к людоедству. На закате — 1d10 ниже Воли, иначе персонаж становится спутником вендиго.",
    modifiers: [...allActions(-3), { target: "staminaMax", factor: 0.25, value: 0 }] }
};
export function curseSource(victim, { stage = 1, dc, source, will = 0 } = {}) {
  const companion = stage === "companion", modifiers = companion ? [{ target: "attributes.intelligence", value: 2 - (victim.system.attributes?.intelligence ?? 2) }]
    : will ? [...STAGES[3].modifiers, { target: "attributes.will", factor: 0.5 ** will, value: 0 }] : STAGES[stage].modifiers;
  const text = companion ? "Спутник вендиго: Инт 2, невосприимчив к убеждению и магическому воздействию, полностью подчиняется вендиго. Спасти его можно, убив вендиго или сняв проклятие вне гор."
    : will ? `Сохраняет самообладание, но его Воля уменьшилась вдвое уже ${will} раз (не ниже 1).` : STAGES[stage].text;
  return { name: companion ? "Спутник вендиго" : "Проклятие вендиго", img: "icons/svg/skull.svg", type: "base", system: {}, statuses: [],
    description: `<p>${text}</p><p>Снять проклятие: смерть вендиго или маг либо жрец вне гор — 10 ВЫН, действие и Сотворение заклинаний выше ${dc}.</p>`,
    flags: { [SYSTEM_ID]: { wendigoCurse: { stage, dc, source, will }, condition: { modifiers } } } };
}

/** The caller pays the action. Dimeritium is checked by the action's own block. */
export async function useWendigoAction(actor, id, options = {}, quote = { penalty: 0 }) {
  if (id === "wendigo-spoil") return creaturePost(actor, { title: "Порча еды",
    text: `Вендиго портит до 1 м² еды и питья в пределах 10 м. Кто её съест, проходит Стойкость СЛ ${WENDIGO.spoilDc}, иначе его тошнит.` });
  if (id !== "wendigo-curse") throw new Error("Неизвестное действие вендиго.");
  const { targets } = creatureTargets(actor, options);
  if (targets.length !== 1) throw new Error("Выберите цель, которой вендиго смотрит в глаза (T).");
  const victim = targets[0].actor;
  if (wendigoCurse(victim)) throw new Error(`${victim.name} уже проклят вендиго.`);
  const immune = creatureMentalImmunity(victim, { mental: true });
  if (immune) return creaturePost(actor, { title: "Проклятие вендиго", text: `${esc(victim.name)}: ${esc(immune)}.` });
  const [hex, resist] = await Promise.all([creatureRoll(`1d10wc + ${(skillValue(actor.system, "hexWeaving").total ?? 0) + quote.penalty}`),
    creatureRoll(`1d10wc + ${skillValue(victim.system, "resistMagic").total ?? 0}`)]);
  const success = hex.total > resist.total;
  if (success) await victim.createEmbeddedDocuments("ActiveEffect", [curseSource(victim, { stage: 1, dc: hex.total, source: actor.uuid })]);
  return creaturePost(actor, { title: "Проклятие вендиго", rolls: [hex, resist],
    text: `Наведение порчи ${hex.total} против Сопротивления магии ${resist.total}: ${success ? `${esc(victim.name)} проклят — утром проснётся с жаждой сырого мяса.` : `${esc(victim.name)} устоял.`}`,
    flags: success ? { wendigoCurseCard: { victim: victim.uuid } } : {} });
}

/** GM steps: a morning without raw meat, the third sunset's Will roll, another day of eroding Will. */
export async function advanceWendigoCurse(victim, step) {
  if (!activeCreatureGM()) throw new Error("Стадии проклятия ведёт активный ведущий.");
  const effect = wendigoCurse(victim);
  if (!effect) throw new Error("Проклятие уже снято.");
  const state = creatureFlags(effect).wendigoCurse, replace = async next => { await effect.delete(); await victim.createEmbeddedDocuments("ActiveEffect", [next]); };
  if (step === "morning") {
    if (typeof state.stage !== "number" || state.stage >= 3 || state.will) throw new Error("Утренние стадии уже пройдены.");
    await replace(curseSource(victim, { ...state, stage: state.stage + 1 }));
    return creaturePost(victim, { title: "Проклятие вендиго", text: `${esc(victim.name)} не ел сырого мяса: ${state.stage + 1 === 2 ? "−1 ко всем действиям, ВЫН вдвое меньше" : "−3 ко всем действиям, ВЫН вчетверо меньше"}.` });
  }
  if (step === "sunset") {
    if (state.stage !== 3 || state.will) throw new Error("Бросок на закате — только на третий день.");
    const will = victim.system.statistics?.effective?.will ?? victim.system.attributes?.will ?? 0, roll = await creatureRoll("1d10"), held = roll.total < will;
    await replace(curseSource(victim, held ? { ...state, will: 1 } : { ...state, stage: "companion" }));
    return creaturePost(victim, { title: "Закат третьего дня", rolls: [roll], text: `1d10 = ${roll.total} против Воли ${will}: ${held ? "сохраняет самообладание, но Воля уменьшилась вдвое" : "становится спутником вендиго"}.` });
  }
  if (step === "day") {
    if (!state.will) throw new Error("Воля тает только у устоявшего на закате.");
    await replace(curseSource(victim, { ...state, will: state.will + 1 }));
    return creaturePost(victim, { title: "Проклятие вендиго", text: `${esc(victim.name)}: ещё день — Воля снова вдвое меньше.` });
  }
  throw new Error("Неизвестная стадия проклятия.");
}

/** Outside the mountains a mage or priest spends 10 STA and an action; Spell Casting must beat the original hex. */
export function cureWendigoCurse(victim, caster) {
  const effect = wendigoCurse(victim);
  if (!effect) throw new Error("Проклятия нет.");
  if (!((caster?.system?.statistics?.vigor ?? 0) > 0)) throw new Error("Снять проклятие может маг или жрец (Энергия больше 0).");
  return inventoryWrite(caster, async () => {
    const quote = actionQuote(caster, { cost: WENDIGO.cureStamina }), dc = creatureFlags(effect).wendigoCurse.dc;
    const roll = await creatureRoll(`1d10wc + ${(skillValue(caster.system, "spellCasting").total ?? 0) + quote.penalty}`), success = roll.total > dc;
    const message = await creaturePost(caster, { title: "Снять проклятие вендиго", rolls: [roll], text: `${WENDIGO.cureStamina} ВЫН и действие. Сотворение заклинаний ${roll.total} против ${dc}: ${success ? "проклятие снято" : "не удалось"}.` });
    if (!message) return null;
    await caster.update(actionUpdate(caster, quote, WENDIGO.cureStamina));
    if (success) await effect.delete();
    return message;
  });
}

/** The wendigo's death frees everyone it cursed. */
export async function releaseWendigoVictims(wendigo) {
  if (!activeCreatureGM()) return;
  const actors = new Map(Array.from(game.actors ?? [], actor => [actor.uuid, actor]));
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  for (const actor of actors.values()) {
    const effect = wendigoCurse(actor);
    if (effect && creatureFlags(effect).wendigoCurse.source === wendigo.uuid) await effect.delete();
  }
}

export function registerWendigo() {
  const fail = error => ui.notifications.error(error.message);
  Hooks.on("createActiveEffect", effect => {
    if (activeCreatureGM() && isWendigo(effect.parent) && activeEffect(effect) && effect.statuses?.has("dead")) releaseWendigoVictims(effect.parent).catch(fail);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = creatureFlags(message).wendigoCurseCard;
    if (!card) return;
    const victim = globalThis.fromUuidSync?.(card.victim);
    if (!victim || !wendigoCurse(victim)) return;
    const box = document.createElement("div"); box.className = "witcher-creature-specials";
    const steps = [["morning", "Утро без сырого мяса"], ["sunset", "Закат третьего дня: Воля"], ["day", "Ещё день: Воля вдвое"], ["cure", "Снять · выбранный маг (T)"]];
    box.innerHTML = steps.map(([id, label]) => `<button type="button" data-wendigo-step="${id}" ${activeCreatureGM() ? "" : "disabled"}>${label}</button>`).join("");
    for (const button of box.querySelectorAll("[data-wendigo-step]")) button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (button.dataset.wendigoStep !== "cure") await advanceWendigoCurse(victim, button.dataset.wendigoStep);
        else { const caster = Array.from(game.user.targets ?? [])[0]?.actor; requireCreatureGM(victim); await cureWendigoCurse(victim, caster); }
      } catch (error) { ui.notifications.warn(error.message); }
      finally { button.disabled = false; ui.chat?.updateMessage(message, { notify: false }); }
    });
    (html.querySelector(".message-content") ?? html).append(box);
  });
}
