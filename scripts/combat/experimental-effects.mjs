import { SYSTEM_ID } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { skillValue } from "../data/skills.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { actionQuote, actionUpdate, rollActionCheck } from "./action-economy.mjs";
import { attackerToken, tokenGap } from "./attack-target.mjs";
import { creaturePost, esc } from "./creature-actions-common.mjs";

const experimental = (actor, kind) => Array.from(actor?.effects ?? []).find(effect => activeEffect(effect) && effect.flags?.[SYSTEM_ID]?.experimental?.kind === kind);
export const experimentalFrozen = actor => Boolean(experimental(actor, "freeze"));
export async function clearExperimentalFreeze(actor) {
  const effects = Array.from(actor?.effects ?? []).filter(effect => activeEffect(effect) && effect.flags?.[SYSTEM_ID]?.experimental?.kind === "freeze");
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
}
export function experimentalEffect(actor, kind) {
  const source = { name: { freeze: "Алхимическое замораживание", fury: "Бешенство", marker: "Метка: краска и запах" }[kind], type: "base",
    img: `icons/svg/${{ freeze: "ice-aura", fury: "terror", marker: "target" }[kind]}.svg`, statuses: [`experimental-${kind}`],
    start: fullTurnStart(actor), flags: { [SYSTEM_ID]: { experimental: { kind }, condition: {} } } };
  if (kind === "freeze") {
    source.description = "<p>Нельзя перемещаться. Сила СЛ 18 за действие освобождает. При попадании атака наносит дополнительно 2d6 и разбивает лёд. Через 8 раундов лёд исчезает.</p>";
    source.duration = { value: 8, units: "rounds", expiry: "turnEnd", expired: false };
    source.flags[SYSTEM_ID].condition = { immobilized: true, autoSave: false, manualOnly: true,
      save: { kind: "skill", skill: "physique", dc: 18, action: "Разбить лёд — действие", ends: true },
      modifiers: [{ target: "attributes.speed", factor: 0, value: 0 }] };
  } else if (kind === "fury") {
    source.description = "<p>Атакуйте ближайшее живое существо, пока не пройдёте Стойкость СЛ 18. Равные по расстоянию цели выбирает игрок.</p>";
    source.flags[SYSTEM_ID].condition = { autoSave: true, save: { kind: "skill", skill: "endurance", dc: 18, action: "Успокоиться — действие", ends: true } };
  } else {
    source.description = "<p>На сутки: +5 к обнаружению и выслеживанию цели. Три полных хода мытья в крупном водоёме снижают зрительный бонус до +2; духи или грязь снижают бонус по запаху до +2.</p>";
    source.duration = { value: 86400, units: "seconds", expiry: null, expired: false };
    source.flags[SYSTEM_ID].experimental = { kind, washed: 0, scentMasked: false, washTurn: "" };
  }
  return source;
}
export function furyTargetError(actor, target) {
  if (!experimental(actor, "fury") || !target) return "";
  let source; try { source = attackerToken(actor); } catch { return ""; }
  const tokens = Array.from(source.parent?.tokens ?? []).filter(token => token.actor && token.uuid !== source.uuid
    && !Array.from(token.actor.effects ?? []).some(effect => activeEffect(effect) && effect.statuses?.has("dead")));
  const nearest = Math.min(...tokens.map(token => tokenGap(source, token)));
  return tokenGap(source, target) > nearest + 0.01 ? "Бешенство: атакуйте ближайшее живое существо." : "";
}
export function markerBonus(actor, sense = "sight") {
  const effect = experimental(actor, "marker"); if (!effect) return 0;
  const state = effect.flags[SYSTEM_ID].experimental;
  return sense === "scent" ? state.scentMasked ? 2 : 5 : state.washed >= 3 ? 2 : 5;
}
export const experimentalEffectContext = actor => ({ marked: Boolean(experimental(actor, "marker")), fury: Boolean(experimental(actor, "fury")),
  frozen: experimentalFrozen(actor), sight: markerBonus(actor), scent: markerBonus(actor, "scent"), washed: experimental(actor, "marker")?.flags[SYSTEM_ID].experimental.washed ?? 0 });
export async function mitigateMarker(actor, kind) {
  const effect = experimental(actor, "marker"); if (!actor?.isOwner || !effect) return;
  const state = { ...effect.flags[SYSTEM_ID].experimental }, action = actionQuote(actor, { ignoreExtra: true });
  if (kind === "wash") {
    const combat = game.combat, turn = combat?.started ? `${combat.id}:${combat.round}` : "";
    if (turn && state.washTurn === turn) throw new Error("Мытьё занимает полный ход; следующий этап — в следующем раунде.");
    if (state.washed >= 3) return;
    state.washed = Math.min(3, state.washed + 1); state.washTurn = turn;
    // The generic full-turn lock is shared by all special creature/device actions.
    const { markCreatureFullTurn } = await import("./creature-actions-common.mjs");
    await markCreatureFullTurn(actor, "Смыть метку", `marker:${turn}`);
  } else if (kind === "scent") state.scentMasked = true;
  else throw new Error("Неизвестный способ скрыть метку.");
  await actor.update(actionUpdate(actor, action));
  await effect.update({ [`flags.${SYSTEM_ID}.experimental`]: state });
  await creaturePost(actor, { title: "Метка", text: kind === "wash" ? `Мытьё: ${state.washed}/3 полных хода. Требуется крупный водоём; запах сохраняется.` : "Запах перебит духами, одеколоном или грязью: бонус по запаху +2." });
}
export async function rollMarkedTarget(target, sense = "sight", observer = null) {
  observer ??= Array.from(game.user.targets ?? [])[0]?.actor;
  if (!observer?.isOwner) throw new Error("Выберите наблюдателя на сцене (T).");
  const key = sense === "scent" ? "wildernessSurvival" : "awareness", bonus = markerBonus(target, sense), skill = skillValue(observer.system, key);
  if (!bonus) throw new Error("Метка уже не действует.");
  return rollActionCheck(observer, { formula: `1d10wc + ${skill.total + bonus}`, flavor: `<p>${sense === "scent" ? "Выслеживание по запаху" : "Обнаружение"}: ${esc(target.name)} · метка +${bonus}.</p>`,
    flags: { [SYSTEM_ID]: { skillCheck: { key, base: skill.total + bonus, level: skill.level, attribute: skill.attributeValue, bonus: skill.bonus + bonus } } } });
}
