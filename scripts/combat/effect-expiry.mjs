/** Foundry owns duration tracking, combat boundaries, and the single-GM expiry write. */
export function registerEffectExpiry() {
  CONFIG.ActiveEffect.expiryAction = "delete";
  Hooks.once("ready", () => removePreviouslyExpiredEffects().catch(console.error));
}

/** Clean up effects already marked expired before switching from core's update policy. */
export async function removePreviouslyExpiredEffects() {
  if (!game.users.activeGM?.isSelf) return;
  const actors = new Map();
  for (const actor of game.actors) actors.set(actor.uuid, actor);
  for (const scene of game.scenes) for (const token of scene.tokens) {
    if (token.actor) actors.set(token.actor.uuid, token.actor);
  }
  for (const actor of actors.values()) {
    const ids = actor.effects.filter(effect => effect.duration.expired).map(effect => effect.id);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }
}
