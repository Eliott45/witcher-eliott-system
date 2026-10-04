import { COMBAT_ACTOR_TYPES, SYSTEM_ID } from "../config.mjs";
import { dyingHealth } from "../data/death.mjs";
import { hasStatus, setStatus, DYING, DEAD, reportEffectError } from "./status-effects.mjs";
import { rollDeathSave } from "./death-roll.mjs";

// Damage, manual rolls and round changes share one queue, including unlinked tokens.
const pending = new Map();
function enqueue(actor, action) {
  if (!actor.isOwner) return Promise.resolve();
  const work = (pending.get(actor.uuid) ?? Promise.resolve()).catch(() => {}).then(action);
  pending.set(actor.uuid, work);
  const clear = () => { if (pending.get(actor.uuid) === work) pending.delete(actor.uuid); };
  work.then(clear, clear);
  return work;
}

function combatPosition(actor) {
  const combat = game.combat;
  return combat?.combatants.some(combatant => combatant.actor?.uuid === actor.uuid)
    ? { lastCombat: combat.uuid, lastRound: combat.round ?? 0 } : { lastCombat: "", lastRound: 0 };
}

/** Persist a new episode with the HP change so healing invalidates in-flight rolls immediately. */
export function prepareDeathTransition(actor, projected, changes, enteredHealth, damaged) {
  if (hasStatus(actor, DEAD)) return null;
  const wasDying = actor.system.statistics.dying;
  const nowDying = dyingHealth(projected.health);
  let kind;
  if (nowDying && (!wasDying || actor.system.health.value > 0)) kind = "enter";
  else if (nowDying && damaged) kind = "damage";
  else if (!nowDying && enteredHealth !== undefined && projected.health.value > 0 && wasDying) kind = "recover";
  else return null;
  let episode = actor.system.death.episode;
  if (kind === "recover") episode = "";
  else if (kind === "enter" || !episode) episode = foundry.utils.randomID();
  foundry.utils.setProperty(changes, "system.death.episode", episode);
  if (kind !== "damage") {
    foundry.utils.setProperty(changes, "system.death.penalty", 0);
    const position = kind === "enter" ? combatPosition(actor) : { lastCombat: "", lastRound: 0 };
    for (const [key, value] of Object.entries(position)) foundry.utils.setProperty(changes, `system.death.${key}`, value);
  }
  return { kind, episode, roll: enteredHealth !== undefined };
}

export function applyDeathTransition(actor, event) {
  if (!event) return Promise.resolve();
  return enqueue(actor, async () => {
    if (actor.system.death.episode !== event.episode || hasStatus(actor, DEAD)) return;
    if (event.kind === "recover") {
      await setStatus(actor, DYING, false);
      return;
    }
    if (!actor.system.statistics.dying) return;
    await setStatus(actor, DYING, true);
    if (event.kind === "damage") await actor.update({ "system.death.penalty": actor.system.death.penalty + 1 });
    if (event.roll) return rollDeathSave(actor, event.kind === "enter" ? "entry" : "damage");
  });
}

async function ensureEpisode(actor) {
  if (!actor.system.death.episode) {
    const position = combatPosition(actor);
    await actor.update({ "system.death.episode": foundry.utils.randomID(),
      "system.death.lastCombat": position.lastCombat, "system.death.lastRound": position.lastRound });
  }
  await setStatus(actor, DYING, true);
}

// Coalesce repeated clicks while a manual save is being displayed; never lose automatic damage events.
const manual = new Map();
export function rollDeath(actor) {
  if (manual.has(actor.uuid)) return manual.get(actor.uuid);
  const work = enqueue(actor, async () => {
    if (hasStatus(actor, DEAD) || !actor.system.statistics.dying) return;
    await ensureEpisode(actor);
    // An unavailable save must not increase the counter.
    if (actor.system.statistics.stun === null) return rollDeathSave(actor);
    const { episode, penalty } = actor.system.death;
    await actor.update({ "system.death.penalty": penalty + 1 });
    let posted = false;
    try {
      return await rollDeathSave(actor, "manual", { onPosted: () => { posted = true; } });
    } finally {
      // A cancelled/rejected chat message is not an attempted save. Preserve any
      // intervening manual correction or new episode instead of overwriting it.
      if (!posted && actor.system.death.episode === episode && actor.system.death.penalty === penalty + 1) {
        await actor.update({ "system.death.penalty": penalty });
      }
    }
  });
  manual.set(actor.uuid, work);
  const clear = () => { if (manual.get(actor.uuid) === work) manual.delete(actor.uuid); };
  work.then(clear, clear);
  return work;
}

/** Existing/imported dying actors get the visible status without retrospective saves. */
export function syncDeathStatus(actor) {
  if (!actor.isOwner || !COMBAT_ACTOR_TYPES.includes(actor.type)) return Promise.resolve();
  if (hasStatus(actor, DEAD)) return setStatus(actor, DYING, false);
  if (actor.system.statistics.dying) return setStatus(actor, DYING, true);
  return Promise.resolve();
}

export async function syncExistingDeathStates() {
  if (!game.user.isActiveGM) return;
  const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) {
    if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  }
  for (const actor of actors.values()) await syncDeathStatus(actor);
}

export function prepareDeathRound(combat, changes, options) {
  const round = changes.round;
  // Starting combat, changing turns and rewinding do not count as the next round.
  if (!Number.isInteger(round) || combat.round < 1 || round <= combat.round) return;
  options[SYSTEM_ID] ??= {};
  options[SYSTEM_ID].deathRound = { from: combat.round, to: round };
}

export async function applyDeathRound(combat, _changes, options, userId) {
  const rounds = options[SYSTEM_ID]?.deathRound;
  if (game.user.id !== userId || !rounds) return;
  const actors = new Map();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (actor?.isOwner && actor.system.statistics?.dying && !hasStatus(actor, DEAD)) actors.set(actor.uuid, actor);
  }
  await Promise.all([...actors.values()].map(actor => enqueue(actor, async () => {
    if (!actor.system.statistics.dying || hasStatus(actor, DEAD)) return;
    // Legacy/manual states start an episode without treating this new round as already processed.
    if (!actor.system.death.episode) await actor.update({ "system.death.episode": foundry.utils.randomID() });
    const episode = actor.system.death.episode;
    await setStatus(actor, DYING, true);
    for (let round = rounds.from + 1; round <= rounds.to; round++) {
      if (actor.system.death.episode !== episode || !actor.system.statistics.dying || hasStatus(actor, DEAD)) break;
      const death = actor.system.death;
      if (death.lastCombat === combat.uuid && death.lastRound >= round) continue;
      await actor.update({ "system.death.penalty": death.penalty + 1,
        "system.death.lastCombat": combat.uuid, "system.death.lastRound": round });
      await rollDeathSave(actor, "round");
    }
  }).catch(reportEffectError)));
}
