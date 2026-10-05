import { COMBAT_ACTOR_TYPES, SYSTEM_ID, VISION_ANGLE } from "../config.mjs";

export function registerVisionMigration() {
  game.settings.register(SYSTEM_ID, "visionDefaultsVersion", {
    scope: "world", config: false, type: Number, default: 0
  });
}

/** Retire old mandatory angles, including the first Geralt pregen and placed copies. */
export async function migrateVisionDefaults() {
  const version = game.settings.get(SYSTEM_ID, "visionDefaultsVersion");
  if (game.user !== game.users.activeGM || version >= 2) return;
  const geralt = actor => actor?.flags?.[SYSTEM_ID]?.pregen?.id === "geralt-of-rivia";
  const affected = actor => COMBAT_ACTOR_TYPES.includes(actor?.type) && (version < 1 || geralt(actor));

  const actors = game.actors.filter(actor => affected(actor) && actor.prototypeToken.sight.angle === 180);
  if (actors.length) await foundry.documents.Actor.updateDocuments(actors.map(actor => ({
    _id: actor.id, "prototypeToken.sight.angle": VISION_ANGLE
  })));

  for (const scene of game.scenes) {
    const tokens = scene.tokens.filter(token => affected(token.actor) && token.sight.angle === 180);
    if (tokens.length) await scene.updateEmbeddedDocuments("Token", tokens.map(token => ({
      _id: token.id, "sight.angle": VISION_ANGLE
    })));
  }
  const pack = game.packs?.get(`${SYSTEM_ID}.pregens`);
  if (pack) {
    const documents = await pack.getDocuments();
    const updates = documents.filter(actor => geralt(actor) && actor.prototypeToken.sight.angle === 180)
      .map(actor => ({ _id: actor.id, "prototypeToken.sight.angle": VISION_ANGLE }));
    if (updates.length) {
      const locked = pack.locked;
      try {
        if (locked) await pack.configure({ locked: false });
        await foundry.documents.Actor.updateDocuments(updates, { pack: pack.collection, broadcast: false });
      } finally { if (locked) await pack.configure({ locked: true }); }
    }
  }
  await game.settings.set(SYSTEM_ID, "visionDefaultsVersion", 2);
}
