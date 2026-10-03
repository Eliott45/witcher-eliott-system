import { ACTOR_TYPES, SYSTEM_ID } from "../config.mjs";
import { WitcherActorData } from "../data/witcher-actor-data.mjs";
import { setStunned, reportEffectError } from "./status-effects.mjs";

/** Validate the entire proposed system update so changed maxima and current values agree. */
export function prepareResourceUpdate(actor, changes, options) {
  if (!ACTOR_TYPES.includes(actor.type)) return;
  const patch = foundry.utils.expandObject(changes);
  const source = foundry.utils.mergeObject(actor.system.toObject(), patch.system ?? {}, { inplace: false });
  const projected = new WitcherActorData(source);
  const enteredHealth = patch.system?.health?.value;
  projected.prepareDerivedData();
  for (const key of ["health", "stamina"]) {
    if (source[key].value !== projected[key].value) {
      foundry.utils.setProperty(changes, `system.${key}.value`, projected[key].value);
    }
  }
  // A cap decreasing is not an incoming hit. Only an explicit HP reduction breaks the stun.
  const damaged = enteredHealth !== undefined && Number(enteredHealth) < actor.system.health.value;
  const exhausted = actor.system.stamina.value > 0 && projected.stamina.value === 0;
  options[SYSTEM_ID] ??= {};
  options[SYSTEM_ID].resources ??= {};
  options[SYSTEM_ID].resources[actor.uuid] = { damaged, exhausted };
}

export function applyResourceUpdate(actor, _changes, options, userId) {
  if (game.user.id !== userId || !actor.isOwner) return;
  const transition = options[SYSTEM_ID]?.resources?.[actor.uuid];
  if (transition?.exhausted) return setStunned(actor, true).catch(reportEffectError);
  if (transition?.damaged) return setStunned(actor, false).catch(reportEffectError);
}

export function prepareInitialResources(actor) {
  if (!ACTOR_TYPES.includes(actor.type)) return;
  actor.updateSource({ "system.health.value": actor.system.health.value, "system.stamina.value": actor.system.stamina.value });
}

export function applyInitialExhaustion(actor, _options, userId) {
  if (game.user.id === userId && actor.isOwner && ACTOR_TYPES.includes(actor.type)
    && actor.system.stamina.max > 0 && actor.system.stamina.value === 0) {
    return setStunned(actor, true).catch(reportEffectError);
  }
}
