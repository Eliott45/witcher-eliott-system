import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { skillValue } from "../data/skills.mjs";
import { activeCreatureGM, creatureFlags, creatureRoll, creaturePost, creatureEffect, addCreatureEffect, creaturesInRadius, esc } from "./creature-actions-common.mjs";

// Monster Hunter's Journal pp.20–21, rotfiend «Взрывная смерть»: a rotfiend that dies, or is left with 5 HP or
// less by anything but fire, decomposes and bursts at the start of its next turn over everyone in melee range.
export const ROTFIEND_BLAST = { radius: 1, damage: "2d6", dc: 15, endurance: 14, threshold: 5 };

export const isRotfiend = actor => creatureProfile(actor)?.id === "rotfiend";
export const rotfiendDecay = actor => Array.from(actor?.effects ?? []).find(effect => activeEffect(effect) && creatureFlags(effect).rotfiendDecay) ?? null;

const pending = new Map();
function once(key, work) {
  if (pending.has(key)) return pending.get(key);
  const result = Promise.resolve().then(work); pending.set(key, result);
  const clean = () => { if (pending.get(key) === result) pending.delete(key); }; result.then(clean, clean); return result;
}

function decaySource(actor) {
  const combat = globalThis.game?.combat;
  return { name: "Стремительное разложение", img: "icons/svg/acid.svg", type: "base", system: {}, statuses: [],
    description: "<p>Тело гнильца стремительно разлагается: в начале своего следующего хода он взорвётся (2d6 урона по каждой части тела всем на дистанции ближнего боя).</p>",
    flags: { [SYSTEM_ID]: { rotfiendDecay: combat?.started ? { combatId: combat.id, round: combat.round, turn: combat.turn ?? 0 } : {} } } };
}

/** Start decomposing once; `force` lets the GM start it by hand (HP set directly, scenes out of combat). */
export function startRotfiendDecay(actor, { fire = false, force = false } = {}) {
  if (!isRotfiend(actor) || !actor?.isOwner) return Promise.resolve(false);
  return once(`decay:${actor.uuid}`, async () => {
    if (rotfiendDecay(actor) || creatureFlags(actor).rotfiendExploded) return false;
    if (!force && (fire || actor.system.health.value > ROTFIEND_BLAST.threshold)) return false;
    await actor.createEmbeddedDocuments("ActiveEffect", [decaySource(actor)]);
    await creaturePost(actor, { title: "Взрывная смерть", text: `${esc(actor.name)} начинает стремительно разлагаться и взорвётся в начале своего следующего хода.` });
    return true;
  });
}

const tokenOf = actor => actor?.isToken ? actor.token : actor?.getActiveTokens?.(false, true)?.[0]?.document
  ?? Array.from(globalThis.game?.combat?.scene?.tokens ?? globalThis.canvas?.scene?.tokens ?? []).find(token => token.actor === actor) ?? null;

/** The burst: the rotfiend is destroyed and everyone within melee range gets a fixed-DC defense card. */
export function explodeRotfiend(actor) {
  return once(`explode:${actor.uuid}`, async () => {
    if (!activeCreatureGM() || !isRotfiend(actor) || creatureFlags(actor).rotfiendExploded) return null;
    const decay = rotfiendDecay(actor), token = tokenOf(actor);
    await actor.update({ [`flags.${SYSTEM_ID}.rotfiendExploded`]: true, ...(actor.system.health.value > 0 ? { "system.health.value": 0 } : {}) });
    if (!Array.from(actor.effects ?? []).some(effect => activeEffect(effect) && effect.statuses?.has("dead")))
      await addCreatureEffect(actor, creatureEffect(actor, "dead"), `rotfiend:${actor.uuid}`);
    if (decay) await decay.delete();
    const victims = token ? creaturesInRadius(token, ROTFIEND_BLAST.radius) : [];
    if (!victims.length) return creaturePost(actor, { title: "Взрывная смерть", text: `${esc(actor.name)} взрывается. Рядом никого нет.` });
    return creaturePost(actor, { title: "Взрывная смерть", text: `${esc(actor.name)} взрывается: 2d6 урона по каждой части тела. Блок щитом или Смена позиции СЛ ${ROTFIEND_BLAST.dc}; задетые получают «Жуткий запах» и проходят Стойкость СЛ ${ROTFIEND_BLAST.endurance}.`,
      flags: { creatureArea: { id: "rotfiend-blast", source: token.uuid, dc: ROTFIEND_BLAST.dc, targets: victims.map(target => ({ uuid: target.uuid, name: target.name, done: false })) } } });
  });
}

/**
 * Called at every turn start: a rotfiend bursts at the start of its own next turn. A dead rotfiend's turn may be skipped
 * by the tracker, so it also bursts as soon as the combat has passed its place in the order.
 */
export function rotfiendDue(combat, entry, state, current) {
  if (entry === current || entry.id && entry.id === current?.id) return true;
  if (!state?.combatId || state.combatId !== combat.id) return false;
  const slot = Array.from(combat.turns ?? []).indexOf(entry);
  if (slot < 0) return false;
  const [round, turn] = slot > state.turn ? [state.round, slot] : [state.round + 1, slot];
  return combat.round > round || combat.round === round && (combat.turn ?? 0) > turn;
}

export async function rotfiendTurn(combat, combatant, context = {}) {
  if (!activeCreatureGM() || !combat?.started || context.skipped) return;
  for (const entry of Array.from(combat.turns ?? [])) {
    const actor = entry.actor, decay = rotfiendDecay(actor);
    if (decay && rotfiendDue(combat, entry, creatureFlags(decay).rotfiendDecay, combatant)) await explodeRotfiend(actor);
  }
}

/** Rotting gore on a victim: smelt from afar until washed off; the GM removes it. */
export const rotfiendSmell = () => ({ name: "Жуткий запах", img: "icons/svg/acid.svg", type: "base", system: {}, statuses: [],
  description: "<p>Облеплен ошмётками гнильца: существо с обонянием чует его за 20 м, с выслеживанием по запаху — за 40 м. Снимите эффект, когда персонаж смоет ошмётки.</p>",
  flags: { [SYSTEM_ID]: { rotfiendSmell: true } } });

/** Damage per body part and the Endurance check of one victim who failed the DC 15 defense. */
export async function rotfiendBlastHit(target) {
  const { blastDamage } = await import("./bombs.mjs"), { burningParts } = await import("./burning.mjs");
  const rolls = {}, dice = [];
  for (const id of burningParts(target)) { const roll = await creatureRoll(ROTFIEND_BLAST.damage); dice.push(roll); rolls[id] = roll.total; }
  const damage = blastDamage(target, rolls, { types: [], piercing: "none", silver: false, silverDice: "" });
  const endurance = await creatureRoll(`1d10wc + ${skillValue(target.system, "endurance").total ?? 0}`);
  return { damage, dice, endurance: endurance.total, nauseated: endurance.total < ROTFIEND_BLAST.endurance, rolls: [...dice, endurance] };
}

export function rotfiendBlastEffects(target, result) {
  const effects = [];
  if (!Array.from(target.effects ?? []).some(effect => activeEffect(effect) && creatureFlags(effect).rotfiendSmell)) effects.push(rotfiendSmell());
  if (result.nauseated) effects.push(creatureEffect(target, "nauseated", { name: "Тошнота: ошмётки гнильца" }));
  return effects;
}
