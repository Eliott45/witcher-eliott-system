import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { actionQuote, actionUpdate, actionNote, actionRoundKey } from "./action-economy.mjs";
import { attackerToken, selectedAttackTarget } from "./attack-target.mjs";
import { ATTACK_LOCATIONS, RANGED_BANDS, bodyDamage, combatModifierParts, signed } from "./weapon-rules.mjs";
import { usableHands } from "./critical-wound-effects.mjs";

// Core p.163 «Борьба и рукопашный бой»: every unarmed attack is an action replacing a fast or strong attack and
// deals non-lethal damage. Damage from the p.48 table: a kick is the punch +4.
export const punchDamage = body => { const bonus = bodyDamage(body); return bonus ? `1d6${bonus > 0 ? "+" : ""}${bonus}` : "1d6"; };
export const kickDamage = body => { const bonus = bodyDamage(body) + 4; return bonus ? `1d6${bonus > 0 ? "+" : ""}${bonus}` : "1d6"; };

export const UNARMED_STRIKES = {
  punch: { name: "Удар рукой", hands: 1 },
  kick: { name: "Удар ногой", hands: 0 }
};
/** Modes of unarmed attacks. Push kick: a strong kick that always lands in the torso, half damage, knocks back BODY/3 m. */
export const UNARMED_MODES = [
  { id: "fast", strike: "punch", name: "Быстрый", count: 1, penalty: 0, multiplier: 1, pair: true },
  { id: "strong", strike: "punch", name: "Сильный", count: 1, penalty: -3, multiplier: 2 },
  { id: "fast", strike: "kick", name: "Быстрый", count: 1, penalty: 0, multiplier: 1, pair: true },
  { id: "strong", strike: "kick", name: "Сильный", count: 1, penalty: -3, multiplier: 2 },
  { id: "push", strike: "kick", name: "Толчок ногой", count: 1, penalty: -3, multiplier: 1, push: true,
    hint: "Сильный удар ногой без нацеливания: всегда в туловище, половина урона, цель отлетает на ТЕЛ/3 м." },
  { id: "charge", strike: "punch", name: "С разбега", count: 1, penalty: -3, multiplier: 2, charge: true,
    hint: "Полный ход: переместитесь на расстояние Бега и нанесите сильный удар. Если удар заблокирован — Сила против Силы, чтобы сбить с ног." },
  { id: "charge", strike: "kick", name: "С разбега", count: 1, penalty: -3, multiplier: 2, charge: true,
    hint: "Полный ход: переместитесь на расстояние Бега и нанесите сильный удар. Если удар заблокирован — Сила против Силы, чтобы сбить с ног." }
];
const TORSO = ATTACK_LOCATIONS.find(entry => entry.id === "torso");

/** The same quote shape as a weapon attack, so the chat exchange handles defenses, location and damage alike. */
export function unarmedAttack(actor, strike, { mode = "fast", extraPenalty = 0, location = "random", modifier = 0, targetContext = null, ambushBonus = 0 } = {}) {
  const data = UNARMED_STRIKES[strike], attack = UNARMED_MODES.find(entry => entry.strike === strike && entry.id === mode);
  if (!data || !attack) throw new Error("Неизвестный удар.");
  const skill = skillValue(actor.system, "brawling");
  const aim = attack.push ? { ...TORSO, name: "Туловище (толчок)", penalty: 0 } : ATTACK_LOCATIONS.find(entry => entry.id === location);
  if (!aim || !Number.isFinite(Number(modifier))) throw new Error("Неверный модификатор атаки.");
  const parts = [{ label: "Основа навыка", value: skill?.total ?? null }, { label: attack.name, value: attack.penalty }, { label: "Дополнительное действие", value: extraPenalty },
    { label: aim.name, value: aim.penalty }, { label: "Ситуация", value: Number(modifier) }, ...(targetContext?.parts ?? []),
    ...(ambushBonus ? [{ label: "Засада", value: ambushBonus }] : []), ...combatModifierParts(actor, "combat.attack"),
    ...(targetContext?.target?.actor ? combatModifierParts(targetContext.target.actor, "combat.targeted") : [])];
  const total = skill?.total == null ? null : parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  const body = actor.system.statistics?.effective?.body ?? null;
  const bonus = (actor.system.statistics?.meleeDamageBonus ?? 0) + (actor.system.statistics?.physicalDamageBonus ?? 0);
  const base = strike === "kick" ? kickDamage(body) : punchDamage(body);
  const raw = `(${base}${bonus ? ` + ${bonus}` : ""})${attack.multiplier === 2 ? " * 2" : ""}`;
  // Push kick: a strong kick (×2) dealing half damage, i.e. the plain kick.
  const damage = attack.push ? `(${base}${bonus ? ` + ${bonus}` : ""})` : raw;
  const blocked = !conditionRules(actor).canAct ? "Нельзя действовать" : total === null ? "Заполните навык «Борьба»"
    : data.hands > usableHands(actor) ? "Руки выведены из строя" : "";
  return { name: `${data.name}${attack.push || attack.charge ? ` · ${attack.name}` : ""}`, weapon: { damageType: "", category: "melee", skill: "brawling" },
    attack: { ...attack, name: attack.push || attack.charge ? attack.name : `${data.name} · ${attack.name.toLocaleLowerCase("ru")}` },
    skill, parts, total, damage, body: 0, bonus, aim, band: RANGED_BANDS[0], ranged: false, blocked, nonLethal: true, strike };
}

/** Unarmed buttons for the Actions tab. */
export function unarmedContext(actor, options = {}, { extra = false, fastPending = false } = {}) {
  return Object.entries(UNARMED_STRIKES).map(([strike, data]) => ({ strike, name: data.name, modes: UNARMED_MODES.filter(mode => mode.strike === strike).map(mode => {
    const quote = unarmedAttack(actor, strike, { ...options, mode: mode.id, extraPenalty: extra ? -3 : 0 });
    const second = mode.pair && fastPending;
    return { ...mode, label: mode.pair ? `${mode.name}${second ? " · 2/2" : ""}` : mode.name, base: quote.total === null ? "—" : signed(quote.total), damage: quote.damage, disabled: Boolean(quote.blocked),
      hint: quote.blocked || `${mode.hint ? `${mode.hint} ` : ""}Несмертельный урон. ${quote.parts.filter(part => part.value).map(part => `${part.label}: ${signed(part.value)}`).join("; ")}` };
  }) }));
}

const flagsOf = document => document?.flags?.[SYSTEM_ID] ?? {};
const FEINT = "feint";
/** Core p.164, Feint: Deceit instead of the first strike of a fast attack; a failed Awareness lets the second strike get +3. */
export async function rollFeint(actor) {
  if (!actor.isOwner) return;
  if (!conditionRules(actor).canAct) throw new Error("Персонаж сейчас не может действовать.");
  const attacker = attackerToken(actor), context = selectedAttackTarget(actor, { attackerUuid: attacker?.uuid });
  const target = context?.target?.actor;
  if (!target) throw new Error("Выберите цель финта.");
  const deceit = skillValue(actor.system, "deceit"), awareness = skillValue(target.system, "awareness");
  if (deceit?.total == null) throw new Error("Заполните навык «Обман».");
  const action = actionQuote(actor);
  const own = await new foundry.dice.Roll(`1d10wc + ${deceit.total + action.penalty}`).evaluate();
  const their = await new foundry.dice.Roll(`1d10wc + ${awareness?.total ?? 0}`).evaluate();
  const success = own.total > their.total;
  await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), rolls: [own, their], flags: { [SYSTEM_ID]: { skipLuck: true } },
    content: `<section class="witcher-attack-chat"><h3><i class="fa-solid fa-mask"></i> Финт</h3><p>Обман <b>${own.total}</b> против Внимания ${esc(target.name)} <b>${their.total}</b>: <strong>${success ? "противник обманут — второй удар быстрой атаки получает +3" : "противник не поддался"}</strong>.</p>${actionNote(action)}</section>` });
  const key = actionRoundKey(actor) || "free";
  // The feint is the first strike of the fast attack: the next fast strike is 2/2 of the same action.
  await actor.update({ ...actionUpdate(actor, action), [`flags.${SYSTEM_ID}.fastStrike`]: { round: key, extra: action.extra, itemId: "" } });
  if (!success) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", actor.effects.filter(effect => flagsOf(effect)[FEINT]).map(effect => effect.id));
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Финт удался", img: "icons/svg/mystery-man.svg", type: "base", system: {},
    description: "<p>+3 к следующему удару быстрой атаки (стр. 164). Снимается после атаки.</p>",
    flags: { [SYSTEM_ID]: { [FEINT]: true, condition: { key: FEINT, modifiers: [{ target: "combat.attack", value: 3 }] } } } }]);
  return true;
}
export async function consumeFeint(actor) {
  const ids = actor.effects.filter(effect => flagsOf(effect)[FEINT]).map(effect => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

/** Two one-handed weapons in hand can make a joint attack (errata p.163). */
export function dualWeapons(actor, equipped) {
  const hands = equipped.filter(item => item.type === "weapon" && !item.system.natural && (item.system.grip || item.system.hands || 1) === 1);
  return hands.length >= 2 ? hands.slice(0, 2) : [];
}
/** The defender needs two weapons, or a weapon and a shield, to block or parry a joint attack. */
export function canAnswerDual(actor, equipped) {
  const held = equipped.filter(item => item.type === "weapon" && !item.system.natural && ["melee", "shield"].includes(item.system.category));
  return held.length >= 2;
}

/** Core p.163: a blocked charge — the attacker's Physique against the defender's; success knocks the defender prone. */
export async function rollChargeContest(attacker, defender, sourceId) {
  const own = skillValue(attacker.system, "physique"), their = skillValue(defender.system, "physique");
  if (own?.total == null) throw new Error("Заполните навык «Сила».");
  const a = await new foundry.dice.Roll(`1d10wc + ${own.total}`).evaluate(), d = await new foundry.dice.Roll(`1d10wc + ${their?.total ?? 0}`).evaluate();
  const success = a.total > d.total;
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: attacker }), rolls: [a, d],
    content: `<p><b>С разбега:</b> Сила ${a.total} против Силы ${esc(defender.name)} ${d.total} — ${success ? "противник сбит с ног" : "устоял"}.</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, chargeContest: { source: sourceId, defender: defender.uuid, success } } } });
}
export async function knockProne(actor) {
  if (!actor || actor.effects.some(effect => effect.statuses.has("prone"))) return;
  const source = conditionSource(CONDITION_BY_ID.prone); delete source._id;
  await actor.createEmbeddedDocuments("ActiveEffect", [source]);
}
export function registerBrawling() {
  Hooks.on("createChatMessage", message => {
    const contest = flagsOf(message).chargeContest;
    if (!contest?.success || !game.users.activeGM?.isSelf) return;
    foundry.utils.fromUuid(contest.defender).then(knockProne).catch(error => console.error(`${SYSTEM_ID} | Charge`, error));
  });
}
