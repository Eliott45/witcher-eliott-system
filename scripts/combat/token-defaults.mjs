import { ACTOR_TYPES, VISION_ANGLE } from "../config.mjs";

/** Configure new actors once; placed tokens inherit the actor's prototype. */
export function applyActorTokenDefaults(actor, data) {
  if (!ACTOR_TYPES.includes(actor.type)) return;

  const defaults = {
    "prototypeToken.actorLink": actor.type === "character",
    "prototypeToken.sight.enabled": true,
    "prototypeToken.sight.angle": VISION_ANGLE,
    "prototypeToken.lockRotation": false,
    "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
  };

  // Keep deliberate overrides when importing or duplicating an actor.
  const changes = Object.fromEntries(
    Object.entries(defaults).filter(([path]) => !foundry.utils.hasProperty(data, path))
  );
  actor.updateSource(changes);
}
