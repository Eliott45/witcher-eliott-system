import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_DEFINITIONS, conditionSource } from "../data/condition-definitions.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";

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
    const own = STATUS_DEFINITIONS[definition.id];
    if (!own) continue; // Other modules may add their own statuses before localization.
    const text = own.description;
    definition.description = `<p>${stripPageReferences(text.startsWith("WITCHER.") ? game.i18n.localize(text) : text)}</p>`;
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

// Core p.161: several identical effects cannot act at once. Every system condition is unique per actor.
export const UNIQUE_STATUSES = new Set(CONDITION_DEFINITIONS.map(entry => entry.id));
const activeWith = (actor, status, except = null) => Array.from(actor?.effects ?? []).filter(effect => effect !== except && !effect.disabled && effect.statuses?.has(status));
/** Duplicates to delete: keep the oldest active effect of each unique status. */
export function duplicateStatusEffects(actor) {
  const remove = new Set();
  for (const status of UNIQUE_STATUSES) {
    const list = activeWith(actor, status).sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0));
    for (const effect of list.slice(1)) remove.add(effect.id);
  }
  return [...remove];
}
const cleaning = new Map();
async function removeDuplicates(actor) {
  const ids = duplicateStatusEffects(actor).filter(id => actor.effects.has(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}
export function registerUniqueStatuses() {
  Hooks.on("preCreateActiveEffect", (effect, data) => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor") return;
    const statuses = Array.from(data.statuses ?? effect.statuses ?? []);
    if (data.disabled) return;
    if (statuses.some(status => UNIQUE_STATUSES.has(status) && activeWith(actor, status).length)) return false;
  });
  // An unconscious or dead body lies on the ground (core p.163: «Ничком»).
  Hooks.on("createActiveEffect", effect => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || !game.users.activeGM?.isSelf || ![UNCONSCIOUS, DEAD].some(status => effect.statuses.has(status))) return;
    if (activeWith(actor, "prone").length) return;
    setStatus(actor, "prone", true).catch(reportEffectError);
  });
  // Two clients may create the same status at once; the active GM keeps the first one.
  Hooks.on("createActiveEffect", effect => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || !game.users.activeGM?.isSelf || ![...effect.statuses].some(status => UNIQUE_STATUSES.has(status))) return;
    const job = (cleaning.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(() => removeDuplicates(actor));
    cleaning.set(actor.uuid, job);
    job.catch(reportEffectError).finally(() => { if (cleaning.get(actor.uuid) === job) cleaning.delete(actor.uuid); });
  });
}
/** Active GM at startup: clean duplicates left in the world. */
export async function removeExistingDuplicateStatuses() {
  if (!game.user.isActiveGM) return;
  const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  for (const actor of actors.values()) await removeDuplicates(actor);
}
