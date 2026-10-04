import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_DEFINITIONS, conditionSource } from "../data/condition-definitions.mjs";

export const STUNNED = "stunned";
export const STUNNED_ICON = "icons/svg/daze.svg";
export const EXHAUSTED_STUN = "exhausted-stun";
export const UNCONSCIOUS = "unconscious";
export const DYING = "dying";
export const DEAD = "dead";
export const STATUS_DEFINITIONS = Object.fromEntries(CONDITION_DEFINITIONS.map(entry=>[entry.id,{id:entry.id,name:entry.name,img:entry.img,description:entry.description}]));

export function registerStatusEffects() {
  CONFIG.statusEffects = Object.fromEntries(CONDITION_DEFINITIONS.map(entry=> {
    const { _id, statuses, ...source } = conditionSource(entry);
    return [entry.id, { ...source, id:entry.id }];
  }));
  // The removed core states must no longer change vision, movement or combatant status.
  for (const key of Object.keys(CONFIG.specialStatusEffects)) CONFIG.specialStatusEffects[key] = "";
}

export function localizeStatusEffects() {
  for (const definition of Object.values(CONFIG.statusEffects)) {
    const text = STATUS_DEFINITIONS[definition.id].description;
    definition.description = `<p>${text.startsWith("WITCHER.") ? game.i18n.localize(text) : text}</p>`;
  }
}

export function hasStatus(actor, status) {
  return actor.effects.some(effect => effect.statuses.has(status) && !effect.disabled && !effect.isSuppressed);
}
export const hasStunned = actor => hasStatus(actor, STUNNED) || hasStatus(actor, EXHAUSTED_STUN);
export const setStunned = (actor, active) => setStatus(actor, STUNNED, active);

// A single originating client handles an update. Queue its effect writes per actor, including synthetic actors.
const pending = new Map();
export function setStatus(actor, status, active) {
  if (!actor.isOwner) return Promise.resolve();
  const previous = pending.get(actor.uuid) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const effects = actor.effects.filter(effect => effect.statuses.has(status));
    if (!active) {
      if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
      return;
    }
    if (hasStatus(actor, status)) return;
    const inactive = effects[0];
    if (inactive) await inactive.update({ disabled: false, start: null,
      duration: { value: null, units: "seconds", expiry: null, expired: false } });
    else await actor.toggleStatusEffect(status, { active: true });
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
