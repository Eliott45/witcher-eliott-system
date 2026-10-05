import { SYSTEM_ID } from "../config.mjs";
import { effectRules } from "../data/condition-definitions.mjs";
import { poisonDescription } from "../data/poison-rules.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";

export function poisonEffectUpdate(effect) {
  if (!Array.from(effect.statuses ?? []).includes("poisoned")) return {};
  const update = {}, description = poisonDescription(effect), rules = effectRules(effect);
  if (description !== effect.description) update.description = description;
  if (JSON.stringify(rules) !== JSON.stringify(effect.flags?.[SYSTEM_ID]?.condition)) update[`flags.${SYSTEM_ID}.condition`] = rules;
  return update;
}

/** Idempotent: preserve dose timers, spent actions and custom poison DCs. */
export async function migratePoisonEffects() {
  if (game.user !== game.users.activeGM) return;
  const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) if (token.actor) actors.set(token.actor.uuid, token.actor);
  for (const parent of [...actors.values(), ...game.items]) await inventoryWrite(parent, async () => {
    const updates = Array.from(parent.effects).flatMap(effect => {
      const update = poisonEffectUpdate(effect);
      return Object.keys(update).length ? [{_id:effect.id,...update}] : [];
    });
    if (updates.length) await parent.updateEmbeddedDocuments("ActiveEffect", updates);
  });
  const pack = game.packs.get(`${SYSTEM_ID}.effects`);
  if (!pack) return;
  const updates = (await pack.getDocuments()).flatMap(effect => {
    const update = poisonEffectUpdate(effect);
    return Object.keys(update).length ? [{_id:effect.id,...update}] : [];
  });
  if (!updates.length) return;
  const locked = pack.locked;
  try {
    if (locked) await pack.configure({locked:false});
    await foundry.documents.ActiveEffect.implementation.updateDocuments(updates, {pack:pack.collection,broadcast:false});
  } finally { if (locked) await pack.configure({locked:true}); }
}
