import { SYSTEM_ID } from "../config.mjs";
import { creatureInvisible, creatureSeesInvisible } from "../data/creature-modes.mjs";
import { creatureHypnosisSource } from "./creature-actions-rules.mjs";
import { fogSightLimit } from "./creature-fog.mjs";

const registered = Symbol("witcherCreatureVision");
const documentOf = object => object?.document ?? object;
const tokenOf = source => documentOf(source?.object);
const sameToken = (object, uuid) => Boolean(uuid && documentOf(object)?.uuid === uuid);

/** Restrict an individual observer; another controlled, unaffected token keeps its own sight. */
export function creatureVisibilityAllowed(visionSource, object, { isGM = globalThis.game?.user?.isGM } = {}) {
  if (isGM) return true;
  const observer = tokenOf(visionSource)?.actor, target = documentOf(object), hypnosis = creatureHypnosisSource(observer);
  if (hypnosis && !sameToken(target, hypnosis.sourceToken)) return false;
  if (!target?.actor || !creatureInvisible(target.actor) || target.uuid === tokenOf(visionSource)?.uuid) return true;
  if (creatureSeesInvisible(observer)) return true;
  const key = encodeURIComponent(target.actor.uuid).replaceAll(".", "%2E");
  const detected = observer?.flags?.[SYSTEM_ID]?.detectedCreatures?.[key];
  return Boolean(detected && detected.epoch === target.actor.system.creature.invisibilityEpoch
    && (!detected.sourceToken || detected.sourceToken === target.uuid));
}

/** Foundry's public polygon constraint keeps the normal walls, vision angle and range. */
export function constrainHypnotizedVision(source, polygon, { isGM = globalThis.game?.user?.isGM } = {}) {
  if (isGM) return polygon;
  const observer = tokenOf(source), hypnosis = creatureHypnosisSource(observer?.actor);
  // Monster Hunter's Journal p.19: inside a foglet's fog nobody else sees further than 4 m from their edge.
  const fog = fogSightLimit(observer), grid = observer?.parent?.grid;
  if (fog && grid) polygon = polygon.applyConstraint(new PIXI.Circle(source.data.x, source.data.y, (fog + Math.max(observer.width ?? 1, observer.height ?? 1) * grid.distance / 2) / grid.distance * grid.size));
  if (!hypnosis) return polygon;
  const target = globalThis.fromUuidSync?.(hypnosis.sourceToken);
  if (!target || target.parent?.uuid !== observer.parent?.uuid) {
    return polygon.applyConstraint(new PIXI.Circle(source.data.x, source.data.y, 0));
  }
  const size = target.getSize();
  return polygon.applyConstraint(new PIXI.Rectangle(target.x, target.y, size.width, size.height));
}

/** Extend the configured class, including module subclasses, rather than replacing its behavior. */
export function creatureVisionSourceClass(Base) {
  return class WitcherCreatureVisionSource extends Base {
    _createRestrictedPolygon() { return constrainHypnotizedVision(this, super._createRestrictedPolygon()); }
    _createLightPolygon() { return constrainHypnotizedVision(this, super._createLightPolygon()); }
  };
}

export function creatureDetectionTest(original) {
  return function(visionSource, mode, options) {
    if (!creatureVisibilityAllowed(visionSource, options?.object)) return false;
    return original.call(this, visionSource, mode, options);
  };
}

let refreshPending = false;
export function refreshCreatureVision() {
  if (!globalThis.canvas?.ready || refreshPending) return;
  refreshPending = true;
  queueMicrotask(() => {
    refreshPending = false;
    if (!globalThis.canvas?.ready) return;
    // Both the observer's condition and the fiend's position affect its clipped polygon.
    for (const token of canvas.tokens.placeables) token.initializeVisionSource();
    canvas.perception.update({ refreshVision: true, refreshLighting: true });
  });
}

export function registerCreatureVision() {
  const config = CONFIG.Canvas, prototype = foundry.canvas.perception.DetectionMode.prototype;
  if (!config.visionSourceClass[registered]) {
    config.visionSourceClass = creatureVisionSourceClass(config.visionSourceClass);
    Object.defineProperty(config.visionSourceClass, registered, { value: true });
  }
  if (prototype.testVisibility[registered]) return;
  prototype.testVisibility = creatureDetectionTest(prototype.testVisibility);
  Object.defineProperty(prototype.testVisibility, registered, { value: true });
  for (const event of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor", "updateActorDelta",
    "createToken", "updateToken", "deleteToken", "createRegion", "updateRegion", "deleteRegion"])
    Hooks.on(event, refreshCreatureVision);
}
