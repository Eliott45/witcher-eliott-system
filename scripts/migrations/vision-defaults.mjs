import { ACTOR_TYPES, SYSTEM_ID, VISION_ANGLE } from "../config.mjs";

export function registerVisionMigration() {
  game.settings.register(SYSTEM_ID, "visionDefaultsVersion", {
    scope: "world", config: false, type: Number, default: 0
  });
}

/** Retire the mandatory 180° default from v0.1, including tokens already on maps. */
export async function migrateVisionDefaults() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "visionDefaultsVersion") >= 1) return;

  const actors = game.actors.filter(actor => ACTOR_TYPES.includes(actor.type) && actor.prototypeToken.sight.angle === 180);
  if (actors.length) await foundry.documents.Actor.updateDocuments(actors.map(actor => ({
    _id: actor.id, "prototypeToken.sight.angle": VISION_ANGLE
  })));

  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(token => ACTOR_TYPES.includes(token.actor?.type) && token.sight.angle === 180);
    if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens.map(token => ({
      _id: token.id, "sight.angle": VISION_ANGLE
    })));
  }
  await game.settings.set(SYSTEM_ID, "visionDefaultsVersion", 1);
}
