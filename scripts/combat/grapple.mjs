import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { actionQuote, actionUpdate, actionNote } from "./action-economy.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { attackerToken, selectedAttackTarget } from "./attack-target.mjs";
import { bodyDamage, combatModifierParts, signed } from "./weapon-rules.mjs";

// Core p.163 «Борьба»: a grapple is a Brawling check the target defends against. While held, the
// grappler may pin, choke or throw; the held one may try to break free (Dodge/Escape vs Brawling).
// House rule chosen for this table: a held creature is the only possible living shield (core p.155):
// it covers the grappler's torso with no extra check.

export const GRAPPLE_ACTIONS = {
  grapple: { name: "Захват", skill: "brawling", defenses: ["dodge", "reposition", "brawl"], icon: "fa-hand-back-fist",
    hint: "Борьба против защиты цели. При успехе цель в захвате: не может отойти, −2 к атаке и защите." },
  pin: { name: "Обездвижить", skill: "brawling", defenses: ["dodge"], icon: "fa-lock",
    hint: "Борьба против Уклонения/Изворотливости. При успехе цель обездвижена: не действует, атаки по ней +4." },
  choke: { name: "Душить", skill: "brawling", defenses: ["dodge"], icon: "fa-hands",
    hint: "Борьба против Уклонения/Изворотливости. При успехе цель задыхается (3 урона в раунд), пока не вырвется." },
  throw: { name: "Бросок", skill: "brawling", defenses: ["dodge"], icon: "fa-person-falling",
    hint: "Борьба против Уклонения/Изворотливости. При успехе захват заканчивается: цель сбита с ног, получает урон удара рукой и проходит испытание УСТ −1." },
  escape: { name: "Вырваться", skill: "dodgeEscape", defenses: ["brawl"], icon: "fa-person-running",
    hint: "Уклонение/Изворотливость против Борьбы захватчика. При успехе захват, обездвиживание и удушение снимаются." }
};

const flagsOf = document => document?.flags?.[SYSTEM_ID] ?? {};
const tokenActor = uuid => uuid ? fromUuidSync(uuid)?.actor ?? null : null;
const tokenName = uuid => uuid ? fromUuidSync(uuid)?.name ?? "" : "";
/** Punch damage (core p.48): 1d6 with the BODY modifier. */
export const punchFormula = actor => { const bonus = bodyDamage(actor.system.statistics?.effective?.body ?? null); return bonus ? `1d6${bonus > 0 ? "+" : ""}${bonus}` : "1d6"; };

/** Who this actor holds and who holds it, read from the paired effects. */
export function grappleState(actor) {
  const live = status => (actor?.effects ?? []).find(effect => activeEffect(effect) && effect.statuses.has(status));
  const holdingEffect = live("grappling"), heldEffect = live("grappled");
  const holding = holdingEffect ? { effect: holdingEffect, token: flagsOf(holdingEffect).grapple?.target ?? "" } : null;
  const heldBy = heldEffect ? { effect: heldEffect, token: flagsOf(heldEffect).grapple?.by ?? "" } : null;
  if (holding) Object.assign(holding, { actor: tokenActor(holding.token), name: tokenName(holding.token) || flagsOf(holdingEffect).grapple?.targetName || "" });
  if (heldBy) Object.assign(heldBy, { actor: tokenActor(heldBy.token), name: tokenName(heldBy.token) || flagsOf(heldEffect).grapple?.byName || "" });
  if (holding?.actor) Object.assign(holding, { pinned: holding.actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("pinned")),
    choking: holding.actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("suffocating") && flagsOf(effect).grapple?.by) });
  return { holding, heldBy };
}

/** Which grapple actions are open to the actor right now, and why the others are not. */
export function grappleOptions(actor) {
  const { holding, heldBy } = grappleState(actor), canAct = conditionRules(actor).canAct;
  return Object.entries(GRAPPLE_ACTIONS).map(([kind, data]) => {
    // A pinned creature can do nothing except try to break free (core p.163).
    const reason = !canAct && kind !== "escape" ? "Персонаж не может действовать."
      : kind === "grapple" ? (holding ? "Вы уже держите противника." : heldBy ? "Сначала вырвитесь из захвата." : "")
      : kind === "escape" ? (heldBy ? "" : "Вас никто не держит.")
      : holding ? (kind === "pin" && holding.pinned ? "Противник уже обездвижен." : kind === "choke" && holding.choking ? "Вы уже душите противника." : "") : "Сначала возьмите противника в захват.";
    const skill = skillValue(actor.system, data.skill);
    const total = skill?.total == null ? null : skill.total + combatModifierParts(actor, "combat.attack").reduce((sum, part) => sum + part.value, 0);
    return { kind, ...data, total, base: total == null ? "—" : signed(total), disabled: Boolean(reason) || total == null, reason: reason || (total == null ? "Заполните навык." : "") };
  });
}

/** Rolls the special attack as an exchange card: the opponent defends in chat like against a strike. */
export async function rollGrappleAction(actor, kind) {
  const data = GRAPPLE_ACTIONS[kind], option = grappleOptions(actor).find(entry => entry.kind === kind);
  if (!data || !actor.isOwner) return;
  if (option.disabled) throw new Error(option.reason);
  const { holding, heldBy } = grappleState(actor), attacker = attackerToken(actor);
  const targetUuid = kind === "grapple" ? selectedAttackTarget(actor, { attackerUuid: attacker.uuid })?.target.uuid : kind === "escape" ? heldBy.token : holding.token;
  if (!targetUuid) throw new Error("Выберите цель захвата.");
  const action = kind === "escape" && !conditionRules(actor).canAct ? { extra: false, penalty: 0, stamina: 0, roundKey: "" } : actionQuote(actor);
  const skill = skillValue(actor.system, data.skill);
  const parts = [{ label: game.i18n.localize(skill.label), value: skill.total }, { label: "Дополнительное действие", value: action.penalty }, ...combatModifierParts(actor, "combat.attack")];
  const total = parts.reduce((sum, part) => sum + part.value, 0), combat = game.combat;
  const display = trackRollDisplay(), messageMode = game.settings.get("core", "messageMode");
  try {
    const roll = await new foundry.dice.Roll(`1d10wc + ${total}`).evaluate({ allowInteractive: messageMode !== "blind" });
    const math = parts.filter(part => part.value).map(part => `${part.label}: ${signed(part.value)}`).join("; ");
    const message = await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: `<section class="witcher-attack-chat witcher-grapple-chat"><h3><i class="fa-solid ${data.icon}"></i> ${esc(data.name)}</h3><p data-tooltip="${esc(math)}">База проверки <b>${signed(total)}</b> · цель: <b>${esc(tokenName(targetUuid))}</b></p><p>${esc(data.hint)}</p>${actionNote(action)}</section>`,
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], action, weaponAttack: { name: data.name, special: kind, target: targetUuid, attacker: attacker.uuid, count: 1, ranged: false, thrown: false,
        location: "random", itemId: null, damage: kind === "throw" ? punchFormula(actor) : null, base: total, parts,
        combat: combat?.started ? { id: combat.id, round: combat.round } : null } } } }, { messageMode });
    if (!message) return;
    await display.wait(message);
    const update = actionUpdate(actor, action);
    if (Object.keys(update).length) await actor.update(update);
    return message;
  } finally { display.close(); }
}

async function addStatus(actor, status, grapple) {
  if (!actor || actor.effects.some(effect => effect.statuses.has(status) && flagsOf(effect).grapple)) return;
  const source = conditionSource(CONDITION_BY_ID[status]); delete source._id;
  await actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, flags: { [SYSTEM_ID]: { ...source.flags[SYSTEM_ID], grapple } } }]);
}
async function removeStatuses(actor, statuses, filter = () => true) {
  const ids = (actor?.effects ?? []).filter(effect => statuses.some(status => effect.statuses.has(status)) && flagsOf(effect).grapple && filter(effect)).map(effect => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { witcherGrappleCleanup: true });
}
/** Ends a grapple on both sides. */
export async function releaseGrapple(grapplerToken, heldToken) {
  await removeStatuses(tokenActor(grapplerToken), ["grappling"]);
  await removeStatuses(tokenActor(heldToken), ["grappled", "pinned", "suffocating"], effect => flagsOf(effect).grapple?.by === grapplerToken);
}

/** Active GM side: apply a successful special attack once (core p.163). */
export async function applyGrappleSuccess(message) {
  const attack = flagsOf(message).weaponAttack;
  if (!attack?.special || flagsOf(message).grappleApplied) return;
  await message.update({ [`flags.${SYSTEM_ID}.grappleApplied`]: true });
  const grappler = attack.special === "escape" ? attack.target : attack.attacker, held = attack.special === "escape" ? attack.attacker : attack.target;
  const grapplerActor = tokenActor(grappler), heldActor = tokenActor(held), notes = [];
  if (attack.special === "grapple") {
    await addStatus(heldActor, "grappled", { by: grappler, byName: tokenName(grappler) });
    await addStatus(grapplerActor, "grappling", { target: held, targetName: tokenName(held) });
    notes.push(`${tokenName(held)} в захвате у ${tokenName(grappler)}.`);
  } else if (attack.special === "pin") { await addStatus(heldActor, "pinned", { by: grappler }); notes.push(`${tokenName(held)} обездвижен.`); }
  else if (attack.special === "choke") { await addStatus(heldActor, "suffocating", { by: grappler }); notes.push(`${tokenName(held)} задыхается: 3 урона в раунд.`); }
  else if (attack.special === "escape") { await releaseGrapple(grappler, held); notes.push(`${tokenName(held)} вырвался из захвата.`); }
  else if (attack.special === "throw") {
    await releaseGrapple(grappler, held);
    const source = conditionSource(CONDITION_BY_ID.prone); delete source._id;
    if (heldActor && !heldActor.effects.some(effect => effect.statuses.has("prone"))) await heldActor.createEmbeddedDocuments("ActiveEffect", [source]);
    const roll = await new foundry.dice.Roll(attack.damage || "1d6").evaluate(), damage = Math.max(0, roll.total);
    if (heldActor && damage) await heldActor.update({ "system.health.value": heldActor.system.health.value - damage });
    notes.push(`${tokenName(held)} брошен и сбит с ног: −${damage} ПЗ (удар рукой ${attack.damage}). Испытание Устойчивости −1.`);
    return foundry.documents.ChatMessage.create({ speaker: message.speaker, rolls: [roll], content: `<p>${esc(notes.join(" "))}</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index: 0, kind: "special", notes } } } });
  }
  return foundry.documents.ChatMessage.create({ speaker: message.speaker, content: `<p>${esc(notes.join(" "))}</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index: 0, kind: "special", notes } } } });
}

export function registerGrapple() {
  // Removing either side of a grapple (sheet, effects panel, expiry) ends it on the other side too.
  Hooks.on("deleteActiveEffect", (effect, options) => {
    if (options.witcherGrappleCleanup || !game.users.activeGM?.isSelf) return;
    const data = flagsOf(effect).grapple, actorToken = effect.parent?.token?.uuid ?? effect.parent?.getActiveTokens?.()[0]?.document?.uuid;
    if (effect.statuses.has("grappling") && data?.target) releaseGrapple(actorToken, data.target).catch(console.error);
    if (effect.statuses.has("grappled") && data?.by) releaseGrapple(data.by, actorToken).catch(console.error);
  });
}
