import { ACTOR_TYPES, SYSTEM_ID } from "../config.mjs";
import { WitcherActorData } from "../data/witcher-actor-data.mjs";
import { setStunned, reportEffectError } from "./status-effects.mjs";
import { prepareDeathTransition, applyDeathTransition, syncDeathStatus } from "./death-state.mjs";
import { applyExhaustion, syncExhaustion, regainConsciousness } from "./exhaustion.mjs";

/** Validate the entire proposed system update so changed maxima and current values agree. */
export function prepareResourceUpdate(actor, changes, options) {
  if (!ACTOR_TYPES.includes(actor.type)) return;
  foundry.utils.expandObjectInPlace(changes);
  const patch = changes;
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
  const awakened = actor.system.stamina.value <= 0 && projected.stamina.value > 0;
  if (exhausted) foundry.utils.setProperty(changes, "system.exhaustionEpisode", foundry.utils.randomID());
  options[SYSTEM_ID] ??= {};
  options[SYSTEM_ID].resources ??= {};
  const death = prepareDeathTransition(actor, projected, changes, enteredHealth, damaged);
  options[SYSTEM_ID].resources[actor.uuid] = { damaged, exhausted, awakened, death };
}

export async function applyResourceUpdate(actor, _changes, options, userId) {
  if (game.user.id !== userId || !actor.isOwner) return;
  const transition = options[SYSTEM_ID]?.resources?.[actor.uuid];
  if (transition?.exhausted) await applyExhaustion(actor).catch(reportEffectError);
  else if (transition?.damaged) await setStunned(actor, false).catch(reportEffectError);
  if (transition?.awakened) await regainConsciousness(actor).catch(reportEffectError);
  await applyDeathTransition(actor, transition?.death).catch(reportEffectError);
}

export function prepareInitialResources(actor) {
  if (!ACTOR_TYPES.includes(actor.type)) return;
  actor.updateSource({ "system.health.value": actor.system.health.value, "system.stamina.value": actor.system.stamina.value });
}

export async function applyInitialConditions(actor, _options, userId) {
  if (game.user.id !== userId || !actor.isOwner || !ACTOR_TYPES.includes(actor.type)) return;
  await syncExhaustion(actor).catch(reportEffectError);
  await syncDeathStatus(actor).catch(reportEffectError);
}
