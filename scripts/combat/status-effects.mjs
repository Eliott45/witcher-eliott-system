import { SYSTEM_ID } from "../config.mjs";

export const STUNNED = "stunned";
export const STUNNED_ICON = "icons/svg/daze.svg";

export function registerStatusEffects() {
  CONFIG.statusEffects = {
    [STUNNED]: { id: STUNNED, name: "WITCHER.Effects.Stunned", img: STUNNED_ICON }
  };
  // The removed core states must no longer change vision, movement or combatant status.
  for (const key of Object.keys(CONFIG.specialStatusEffects)) CONFIG.specialStatusEffects[key] = "";
}

export function localizeStatusEffects() {
  CONFIG.statusEffects[STUNNED].description = game.i18n.localize("WITCHER.Effects.StunnedDescription");
}

export function hasStunned(actor) {
  return actor.effects.some(effect => effect.statuses.has(STUNNED) && !effect.disabled && !effect.isSuppressed);
}

// A single originating client handles an update. Queue its effect writes per actor, including synthetic actors.
const pending = new Map();
export function setStunned(actor, active) {
  if (!actor.isOwner) return Promise.resolve();
  const previous = pending.get(actor.uuid) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const effects = actor.effects.filter(effect => effect.statuses.has(STUNNED));
    if (!active) {
      if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
      return;
    }
    if (hasStunned(actor)) return;
    const inactive = effects[0];
    if (inactive) await inactive.update({ disabled: false, start: null,
      duration: { value: null, units: "seconds", expiry: null, expired: false } });
    else await actor.toggleStatusEffect(STUNNED, { active: true });
  });
  pending.set(actor.uuid, work);
  const clear = () => { if (pending.get(actor.uuid) === work) pending.delete(actor.uuid); };
  work.then(clear, clear);
  return work;
}

export function reportEffectError(error) {
  console.error(`${SYSTEM_ID} | Status effect update failed`, error);
  ui.notifications.error(game.i18n.localize("WITCHER.Effects.UpdateError"));
}
