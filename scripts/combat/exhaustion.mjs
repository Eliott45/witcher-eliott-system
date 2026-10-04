import { COMBAT_ACTOR_TYPES } from "../config.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { hasStatus, setStatus, setStunned, EXHAUSTED_STUN, UNCONSCIOUS, DEAD } from "./status-effects.mjs";

export async function applyExhaustion(actor) {
  if (!actor.isOwner || hasStatus(actor, DEAD)) return;
  await setStatus(actor, EXHAUSTED_STUN, true);
  await setStunned(actor, false);
  // STA may have been restored while the effect writes were in flight.
  await setStatus(actor, UNCONSCIOUS, actor.system.stamina.value <= 0);
}

export async function regainConsciousness(actor) {
  if (actor.system.stamina.value > 0 && hasStatus(actor, EXHAUSTED_STUN)) {
    await setStatus(actor, UNCONSCIOUS, false);
  }
}

export async function syncExhaustion(actor) {
  if (!actor.isOwner || !COMBAT_ACTOR_TYPES.includes(actor.type) || hasStatus(actor, DEAD)) return;
  if (actor.system.stamina.max > 0 && actor.system.stamina.value <= 0) await applyExhaustion(actor);
}

export async function syncExistingExhaustion() {
  if (!game.user.isActiveGM) return;
  const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) {
    if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  }
  for (const actor of actors.values()) await syncExhaustion(actor);
}

// Coalesce double clicks so a single Recovery action cannot refill twice during a re-render.
const recovering = new Map();
export function recoverStamina(actor) {
  if (!actor.isOwner) return Promise.resolve();
  if (recovering.has(actor.uuid)) return recovering.get(actor.uuid);
  const work = Promise.resolve().then(async () => {
    if (!conditionRules(actor).canRecover) {
      ui.notifications.warn(game.i18n.localize("WITCHER.Conditions.CannotRecover"));
      return;
    }
    const recovery = actor.system.statistics.recovery;
    if (recovery === null) {
      ui.notifications.warn(game.i18n.localize("WITCHER.Statistics.UnfilledPhysical"));
      return;
    }
    const { value, max } = actor.system.stamina;
    const restored = Math.min(max, value + recovery);
    if (restored > value) await actor.update({ "system.stamina.value": restored });
  });
  recovering.set(actor.uuid, work);
  const clear = () => { if (recovering.get(actor.uuid) === work) recovering.delete(actor.uuid); };
  work.then(clear, clear);
  return work;
}
