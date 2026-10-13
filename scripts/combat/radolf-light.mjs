import { SYSTEM_ID } from "../config.mjs";
import { holdsLitTorch } from "../data/radolf-rules.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { activeCreatureGM } from "./creature-actions-common.mjs";

/** A torch raises darkness by one step; multiple torches do not turn night into daylight. */
export function torchLightLevel(light, scene, target) {
  if (!target || !["dark", "dim"].includes(light)) return light;
  const sources = Array.from(scene.tokens ?? []).filter(source => !source.hidden && holdsLitTorch(source.actor));
  if (!sources.length) return light;
  const point = tokenCenter(target);
  const lit = sources.some(source => {
    const origin = tokenCenter(source), vertical = (source.elevation ?? 0) - (target.elevation ?? 0);
    const distance = Math.hypot((origin.x - point.x) / scene.grid.size * scene.grid.distance,
      (origin.y - point.y) / scene.grid.size * scene.grid.distance, vertical);
    if (distance > 5) return false;
    if (origin.x === point.x && origin.y === point.y) return true;
    return !source.object?.checkCollision(point, { origin, type: "light", mode: "any" });
  });
  return lit ? light === "dark" ? "dim" : "day" : light;
}

/** Separate native lights preserve all existing token light settings, including cones and animations. */
export function torchLightSource(token) {
  const center = tokenCenter(token);
  return { x: center.x, y: center.y, elevation: token.elevation ?? 0, hidden: Boolean(token.hidden), walls: true, vision: false,
    config: { dim: 5, bright: 0, angle: 360, color: "#ffbe73", alpha: .2, animation: { type: "torch" } },
    flags: { [SYSTEM_ID]: { radolfTorch: token.id } } };
}

const writes = new Map();
export function syncTorchLights(scene) {
  if (!activeCreatureGM()) return Promise.resolve();
  const previous = writes.get(scene.id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const desired = new Map(Array.from(scene.tokens).filter(token => holdsLitTorch(token.actor)).map(token => [token.id, torchLightSource(token)]));
    const updates = [], remove = [];
    for (const light of scene.lights) {
      const tokenId = light.flags?.[SYSTEM_ID]?.radolfTorch;
      if (!tokenId) continue;
      const source = desired.get(tokenId);
      if (!source) remove.push(light.id);
      else {
        if (light.x !== source.x || light.y !== source.y || light.elevation !== source.elevation || light.hidden !== source.hidden)
          updates.push({ _id: light.id, x: source.x, y: source.y, elevation: source.elevation, hidden: source.hidden });
        desired.delete(tokenId);
      }
    }
    if (remove.length) await scene.deleteEmbeddedDocuments("AmbientLight", remove);
    if (updates.length) await scene.updateEmbeddedDocuments("AmbientLight", updates);
    if (desired.size) await scene.createEmbeddedDocuments("AmbientLight", [...desired.values()]);
  });
  writes.set(scene.id, next);
  const clear = () => { if (writes.get(scene.id) === next) writes.delete(scene.id); };
  next.then(clear, clear);
  return next;
}

function refresh(scene) {
  // Ordinary inventory edits and token movement should not reset an entire scene without torches.
  if (!scene.tokens.some(token => holdsLitTorch(token.actor)) && !scene.lights.some(light => light.flags?.[SYSTEM_ID]?.radolfTorch)) return;
  for (const token of scene.tokens) {
    token.actor?.reset?.();
    if (token.actor?.sheet?.rendered) token.actor.sheet.render();
  }
  syncTorchLights(scene).catch(error => ui.notifications.warn(error.message));
}

export function registerRadolfLight() {
  Hooks.once("ready", () => { for (const scene of game.scenes) refresh(scene); });
  for (const event of ["createItem", "updateItem", "deleteItem"]) Hooks.on(event, item => {
    if (item.parent?.documentName !== "Actor") return;
    for (const scene of game.scenes) if (scene.tokens.some(token => token.actor?.uuid === item.parent.uuid)) refresh(scene);
  });
  for (const event of ["createToken", "updateToken", "deleteToken"]) Hooks.on(event, token => refresh(token.parent));
  // Embedded Item updates inside Actor.update also need to refresh the carried light.
  Hooks.on("updateActor", (actor, changes) => {
    if (!changes.items) return;
    for (const scene of game.scenes) if (scene.tokens.some(token => token.actor?.uuid === actor.uuid)) refresh(scene);
  });
}
