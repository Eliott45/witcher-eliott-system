import { COMBAT_ACTOR_TYPES, VISION_ANGLE, SYSTEM_ID } from "../config.mjs";

/** Configure new actors once; placed tokens inherit the actor's prototype. */
export function applyActorTokenDefaults(actor, data) {
  if (!COMBAT_ACTOR_TYPES.includes(actor.type) && actor.type !== "services") return;

  const icon = `systems/${SYSTEM_ID}/assets/icons/services.svg`;
  const defaults = actor.type === "services" ? {
    img: icon,
    "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
    "prototypeToken.texture.src": icon,
    "prototypeToken.actorLink": true,
    "prototypeToken.sight.enabled": false,
    "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.NONE,
    "prototypeToken.bar1.attribute": null,
    "prototypeToken.bar2.attribute": null
  } : {
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
