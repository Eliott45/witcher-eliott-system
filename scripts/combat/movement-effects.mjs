import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";

// Core p.152: attacks against a target that moved this round and has REF > 10 take −3.
// Ordinary token movement during a started combat marks it; the mark ends at its next turn start.
export const MOVING = "moving";
export const movesFast = actor => (actor?.system.statistics?.effective?.reflex ?? 0) > 10;

export async function markMoving(actor) {
  const duration = { value: 1, units: "rounds", expiry: "turnStart", expired: false }, start = fullTurnStart(actor);
  const current = actor.effects.find(effect => effect.statuses.has(MOVING));
  if (current) return current.update({ start, duration });
  const source = conditionSource(CONDITION_BY_ID[MOVING]); delete source._id;
  return actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, start, duration }]);
}

export function registerMovementEffects() {
  Hooks.on("updateToken", (token, changes, options) => {
    if (!("x" in changes || "y" in changes) || options.teleport || !game.users.activeGM?.isSelf) return;
    const combat = game.combat, actor = token.actor;
    if (!combat?.started || !actor || !combat.combatants.some(entry => entry.tokenId === token.id) || !movesFast(actor)) return;
    markMoving(actor).catch(console.error);
  });
}
