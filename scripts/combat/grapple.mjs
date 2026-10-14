import { validateSchoolReaction, schoolReactionTarget } from "./school-gear-rules.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
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
import { equippedItems } from "../data/physical-items.mjs";
import { usableHands } from "./critical-wound-effects.mjs";
import { scatterItem } from "../loot/loot.mjs";
import { setStunned } from "./status-effects.mjs";
import { spiritState } from "./creature-spirits.mjs";
import { creatureHasInfiniteStamina } from "../data/creature-modes.mjs";

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
    hint: "Уклонение/Изворотливость против Борьбы захватчика. При успехе захват, обездвиживание и удушение снимаются." },
  // Core p.163: unarmed trip and disarm need no grapple.
  trip: { name: "Подсечка", skill: "brawling", defenses: null, icon: "fa-shoe-prints", free: true,
    hint: "Удар по ногам: Борьба против защиты цели. При успехе цель сбита с ног." },
  disarm: { name: "Выбить оружие", skill: "brawling", defenses: ["dodge"], icon: "fa-hand-holding", free: true,
    hint: "Борьба против Уклонения/Изворотливости. При успехе оружие цели отлетает на 1d6/2 м в случайную сторону." },
  "disarm-take": { name: "Отобрать оружие", skill: "brawling", defenses: ["dodge"], icon: "fa-hand-holding-hand", free: true, penalty: -3, hand: true,
    hint: "Борьба −3 против Уклонения/Изворотливости, нужна свободная рука. При успехе оружие цели оказывается у вас." },
  // Weapon special attacks (core p.164) are rolled from the weapon card; listed here for the chat exchange.
  "weapon-disarm": { name: "Разоружение", weapon: true, defenses: null, icon: "fa-hand-holding" },
  "weapon-trip": { name: "Подсечка оружием", weapon: true, defenses: null, icon: "fa-shoe-prints" }
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
  let holding = holdingEffect ? { effect: holdingEffect, token: flagsOf(holdingEffect).grapple?.target ?? "" } : null;
  const heldBy = heldEffect && !spiritState(actor).incorporeal ? { effect: heldEffect, token: flagsOf(heldEffect).grapple?.by ?? "" } : null;
  if (holding) Object.assign(holding, { actor: tokenActor(holding.token), name: tokenName(holding.token) || flagsOf(holdingEffect).grapple?.targetName || "" });
  if (holding?.actor && spiritState(holding.actor).incorporeal) holding = null;
  if (heldBy) Object.assign(heldBy, { actor: tokenActor(heldBy.token), name: tokenName(heldBy.token) || flagsOf(heldEffect).grapple?.byName || "" });
  if (holding?.actor) Object.assign(holding, { pinned: holding.actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("pinned")),
    choking: holding.actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("suffocating") && flagsOf(effect).grapple?.by) });
  return { holding, heldBy };
}

/** Which grapple actions are open to the actor right now, and why the others are not. */
export function grappleOptions(actor) {
  const { holding, heldBy } = grappleState(actor), canAct = conditionRules(actor).canAct;
  return Object.entries(GRAPPLE_ACTIONS).filter(([, data]) => !data.weapon).map(([kind, data]) => {
    // A pinned creature can do nothing except try to break free (core p.163).
    const freeHand = data.hand && equippedItems(actor.items ?? []).filter(item => item.type === "weapon" && !item.system.natural).reduce((sum, item) => sum + (item.system.grip || item.system.hands || 1), 0) >= usableHands(actor);
    const reason = !canAct && kind !== "escape" ? "Персонаж не может действовать."
      : data.free ? (freeHand ? "Нужна свободная рука." : "")
      : kind === "grapple" ? (holding ? "Вы уже держите противника." : heldBy ? "Сначала вырвитесь из захвата." : "")
      : kind === "escape" ? (heldBy ? "" : "Вас никто не держит.")
      : holding ? (kind === "pin" && holding.pinned ? "Противник уже обездвижен." : kind === "choke" && holding.choking ? "Вы уже душите противника." : "") : "Сначала возьмите противника в захват.";
    const skill = skillValue(actor.system, data.skill);
    const total = skill?.total == null ? null : skill.total + (data.penalty ?? 0) + combatModifierParts(actor, "combat.attack").reduce((sum, part) => sum + part.value, 0);
    return { kind, ...data, total, base: total == null ? "—" : signed(total), disabled: Boolean(reason) || total == null, reason: reason || (total == null ? "Заполните навык." : "") };
  });
}

/** Rolls the special attack as an exchange card: the opponent defends in chat like against a strike. */
export async function rollGrappleAction(actor, kind, options = {}) {
  if (options.schoolReaction && !options.schoolQueued) return inventoryWrite(actor, () => rollGrappleAction(actor, kind, {...options, schoolQueued:true}));
  const reaction = validateSchoolReaction(actor, options.schoolReaction, null, {mode:kind,unarmed:true});
  const data = GRAPPLE_ACTIONS[kind], option = grappleOptions(actor).find(entry => entry.kind === kind);
  if (!data || !actor.isOwner) return;
  if (option.disabled) throw new Error(option.reason);
  const { holding, heldBy } = grappleState(actor), attacker = reaction ? fromUuidSync(reaction.attackerUuid) : attackerToken(actor);
  const reactionTarget = reaction ? selectedAttackTarget(actor, {attackerUuid:reaction.attackerUuid,targetUuid:schoolReactionTarget(reaction,options.targetUuid)}) : null;
  if (reaction && (!reactionTarget || reactionTarget.distance > 1)) throw new Error("Противник вне досягаемости для приёма.");
  const targetUuid = reactionTarget?.target.uuid ?? (kind === "grapple" || data.free ? selectedAttackTarget(actor, { attackerUuid: attacker.uuid })?.target.uuid : kind === "escape" ? heldBy.token : holding.token);
  if (!targetUuid) throw new Error("Выберите цель (T).");
  if (kind !== "escape" && spiritState(tokenActor(targetUuid)).incorporeal) throw new Error("Бесплотная цель невосприимчива к физической борьбе.");
  const action = kind === "escape" && !conditionRules(actor).canAct ? { extra: false, penalty: 0, stamina: 0, roundKey: "" } : actionQuote(actor, {ignoreExtra:Boolean(reaction)});
  const skill = skillValue(actor.system, data.skill);
  const parts = [{ label: game.i18n.localize(skill.label), value: skill.total }, ...(data.penalty ? [{ label: data.name, value: data.penalty }] : []), { label: "Дополнительное действие", value: action.penalty }, ...combatModifierParts(actor, "combat.attack")];
  const total = parts.reduce((sum, part) => sum + part.value, 0), combat = game.combat;
  const display = trackRollDisplay(), messageMode = game.settings.get("core", "messageMode");
  try {
    const roll = await evaluateRoll(`1d10wc + ${total}`,{ allowInteractive: messageMode !== "blind" });
    const math = parts.filter(part => part.value).map(part => `${part.label}: ${signed(part.value)}`).join("; ");
    const message = await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: `<section class="witcher-attack-chat witcher-grapple-chat"><h3><i class="fa-solid ${data.icon}"></i> ${esc(data.name)}</h3><p data-tooltip="${esc(math)}">База проверки <b>${signed(total)}</b> · цель: <b>${esc(tokenName(targetUuid))}</b></p><p>${esc(data.hint)}</p>${actionNote(action)}</section>`,
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], action, ...(reaction?{schoolReaction:{...options.schoolReaction}}:{}), weaponAttack: { name: data.name, special: kind, target: targetUuid, attacker: attacker.uuid, count: 1, ranged: false, thrown: false,
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
  await actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, flags: { [SYSTEM_ID]: { ...source.flags[SYSTEM_ID],
    condition: { ...source.flags[SYSTEM_ID].condition, physical: true }, grapple } } }]);
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

/** A materialized spirit escapes its old hold as soon as incorporeality returns. */
export async function releaseIncorporealGrapple(actor) {
  if (!actor || !spiritState(actor).incorporeal) return;
  const effects = actor.effects.filter(effect => ["grappled", "pinned", "suffocating"].some(status => effect.statuses.has(status)) && flagsOf(effect).grapple?.by);
  for (const by of new Set(effects.map(effect => flagsOf(effect).grapple.by))) {
    const grappler = tokenActor(by);
    // Remove only the matching hold; the grappler may already have caught someone else.
    await removeStatuses(grappler, ["grappling"], effect => tokenActor(flagsOf(effect).grapple?.target) === actor);
  }
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id), { witcherGrappleCleanup: true });
}

/** Active GM side: apply a successful special attack once (core p.163). */
export async function applyGrappleSuccess(message) {
  const attack = flagsOf(message).weaponAttack;
  if (!attack?.special || flagsOf(message).grappleApplied) return;
  await message.update({ [`flags.${SYSTEM_ID}.grappleApplied`]: true });
  const grappler = attack.special === "escape" ? attack.target : attack.attacker, held = attack.special === "escape" ? attack.attacker : attack.target;
  const grapplerActor = tokenActor(grappler), heldActor = tokenActor(held), notes = [];
  if (attack.special !== "escape" && spiritState(heldActor).incorporeal) {
    await releaseIncorporealGrapple(heldActor);
    notes.push(`${tokenName(held)} бесплотен: физическая борьба не действует.`);
  } else if (attack.special === "grapple") {
    await addStatus(heldActor, "grappled", { by: grappler, byName: tokenName(grappler) });
    await addStatus(grapplerActor, "grappling", { target: held, targetName: tokenName(held) });
    notes.push(`${tokenName(held)} в захвате у ${tokenName(grappler)}.`);
  } else if (attack.special === "pin") { await addStatus(heldActor, "pinned", { by: grappler }); notes.push(`${tokenName(held)} обездвижен.`); }
  else if (attack.special === "choke") { await addStatus(heldActor, "suffocating", { by: grappler }); notes.push(`${tokenName(held)} задыхается: 3 урона в раунд.`); }
  else if (attack.special === "escape") { await releaseGrapple(grappler, held); notes.push(`${tokenName(held)} вырвался из захвата.`); }
  else if (["trip", "weapon-trip"].includes(attack.special)) {
    const source = conditionSource(CONDITION_BY_ID.prone); delete source._id;
    if (heldActor && !heldActor.effects.some(effect => effect.statuses.has("prone"))) await heldActor.createEmbeddedDocuments("ActiveEffect", [source]);
    notes.push(`${tokenName(held)} сбит с ног.`);
  } else if (["disarm", "disarm-take", "weapon-disarm"].includes(attack.special)) {
    // The weapon in hand: the first equipped one that is not part of the body.
    const weapon = heldActor ? equippedItems(heldActor.items).find(item => item.type === "weapon" && !item.system.natural) : null;
    if (!weapon) notes.push(`У ${tokenName(held)} нет оружия в руках.`);
    else if (attack.special === "disarm-take" && grapplerActor) {
      const data = weapon.toObject(); delete data._id;
      Object.assign(data.system, { quantity: 1, equipped: false, carried: true, containerId: "" });
      await grapplerActor.createEmbeddedDocuments("Item", [data]);
      if ((weapon.system.quantity ?? 1) > 1) await weapon.update({ "system.quantity": weapon.system.quantity - 1, "system.equipped": false });
      else await weapon.delete();
      notes.push(`${tokenName(grappler)} отбирает у ${tokenName(held)}: ${weapon.name}.`);
    } else {
      const rolls = [await evaluateRoll("1d10"), await evaluateRoll(attack.special === "disarm" ? "1d6" : "1d6")];
      const meters = attack.special === "disarm" ? Math.max(1, Math.floor(rolls[1].total / 2)) : rolls[1].total;
      const dropped = await scatterItem(heldActor, weapon, meters, rolls[0].total);
      notes.push(`${weapon.name} выбито у ${tokenName(held)}: отлетает на ${meters} м (направление ${rolls[0].total} по таблице разброса)${dropped ? "" : " — поднимите его, чтобы снова взять в руки"}.`);
      return foundry.documents.ChatMessage.create({ speaker: message.speaker, rolls, content: `<p>${esc(notes.join(" "))}</p>`,
        flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index: 0, kind: "special", notes } } } });
    }
  }
  else if (attack.special === "throw") {
    await releaseGrapple(grappler, held);
    const source = conditionSource(CONDITION_BY_ID.prone); delete source._id;
    if (heldActor && !heldActor.effects.some(effect => effect.statuses.has("prone"))) await heldActor.createEmbeddedDocuments("ActiveEffect", [source]);
    // Brawling deals non-lethal damage (core p.163): the throw lands as Stamina loss, then a Stun save at −1.
    const roll = await evaluateRoll(attack.damage || "1d6"), damage = Math.max(0, roll.total), rolls = [roll];
    const infinite = heldActor && creatureHasInfiniteStamina(heldActor);
    if (heldActor && damage && !infinite) await heldActor.update({ "system.stamina.value": heldActor.system.stamina.value - damage });
    let stunned = "";
    const stun = heldActor?.system.statistics?.stun;
    if (heldActor && stun != null && conditionRules(heldActor).canStunSave) {
      const save = await evaluateRoll("1d10"); rolls.push(save);
      const failed = save.total >= stun - 1;
      if (failed) await setStunned(heldActor, true);
      stunned = ` Испытание Устойчивости −1: ${save.total} против ${stun - 1} — ${failed ? "дезориентирован" : "устоял"}.`;
    }
    notes.push(`${tokenName(held)} брошен и сбит с ног: ${infinite ? "бесконечная ВЫН не расходуется" : `−${damage} ВЫН (несмертельный урон удара рукой ${attack.damage})`}.${stunned}`);
    return foundry.documents.ChatMessage.create({ speaker: message.speaker, rolls, content: `<p>${esc(notes.join(" "))}</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index: 0, kind: "special", notes } } } });
  }
  return foundry.documents.ChatMessage.create({ speaker: message.speaker, content: `<p>${esc(notes.join(" "))}</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index: 0, kind: "special", notes } } } });
}

export function registerGrapple() {
  const releaseSpirit = actor => {
    if (game.users.activeGM?.isSelf && actor?.isOwner) releaseIncorporealGrapple(actor).catch(console.error);
  };
  Hooks.on("updateActor", releaseSpirit);
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, effect => releaseSpirit(effect.parent));
  Hooks.on("updateToken", token => releaseSpirit(token.actor));
  // Removing either side of a grapple (sheet, effects panel, expiry) ends it on the other side too.
  Hooks.on("deleteActiveEffect", (effect, options) => {
    if (options.witcherGrappleCleanup || !game.users.activeGM?.isSelf) return;
    const data = flagsOf(effect).grapple, actorToken = effect.parent?.token?.uuid ?? effect.parent?.getActiveTokens?.()[0]?.document?.uuid;
    if (effect.statuses.has("grappling") && data?.target) releaseGrapple(actorToken, data.target).catch(console.error);
    if (effect.statuses.has("grappled") && data?.by) releaseGrapple(data.by, actorToken).catch(console.error);
  });
}
