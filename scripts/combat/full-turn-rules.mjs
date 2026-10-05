import { effectCounter, statusEffect } from "../data/effect-counters.mjs";

export const ACTIVE_DODGE = "active-dodge";
export const AIMING = "aiming";
export const aimingBonus = actor => {
  const effect = statusEffect(actor, AIMING);
  return effect ? effectCounter(effect)?.value ?? 0 : 0;
};

/** Expiry belongs to the affected actor's turn, even when a GM applies it off-turn. */
export function fullTurnStart(actor) {
  const start = foundry.documents.ActiveEffect.getEffectStart(), combat = game.combat;
  if (!combat?.started) return start;
  const combatant = combat.combatant?.actor?.uuid === actor.uuid ? combat.combatant
    : Array.from(combat.combatants).find(entry => entry.actor?.uuid === actor.uuid);
  return combatant ? { ...start, combatant: combatant.id, initiative: combatant.initiative, turn: combat.turns.indexOf(combatant) } : start;
}

/** The caller owns the action queue; do not enqueue again inside it. */
export async function consumeAiming(actor) {
  const effect = statusEffect(actor, AIMING);
  if (effect) await effect.delete();
}
