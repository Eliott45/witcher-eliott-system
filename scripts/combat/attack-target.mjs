import { COMBAT_ACTOR_TYPES, PREVIEW_VISION_ANGLE, RESTRICTED_VISION_ANGLE } from "../config.mjs";
import { restrictedVision } from "../data/visor.mjs";

export const tokenDocument = token => token?.document ?? token;
export function tokenCenter(token) {
  const doc = tokenDocument(token), size = doc.getSize();
  return {x:doc.x + size.width / 2, y:doc.y + size.height / 2};
}

/** Metres between token edges (core p.164 distance bands): touching tokens are 0 m apart. */
export function tokenGap(a, b) {
  const from = tokenDocument(a), to = tokenDocument(b), scene = from.parent, grid = scene?.grid;
  if (!grid) return null;
  const p = tokenCenter(from), q = tokenCenter(to);
  const measured = grid.measurePath?.([p, q])?.distance ?? Math.hypot(q.x - p.x, q.y - p.y) / grid.size * grid.distance;
  const half = doc => Math.max(doc.width ?? 1, doc.height ?? 1) / 2 * grid.distance;
  return Math.max(0, Math.round((measured - half(from) - half(to)) * 10) / 10);
}

/** System facing is north at 0°, clockwise. It is independent of the local vision preview. */
export function withinFacing(observer, subject) {
  const doc = tokenDocument(observer), from = tokenCenter(observer), to = tokenCenter(subject);
  if (from.x === to.x && from.y === to.y) return true;
  const bearing = Math.atan2(to.x - from.x, from.y - to.y) * 180 / Math.PI;
  const delta = Math.abs(((bearing - doc.rotation) % 360 + 540) % 360 - 180);
  const angle = Math.min(doc.sight?.angle ?? 360, restrictedVision(doc.actor?.items ?? []) ? RESTRICTED_VISION_ANGLE : PREVIEW_VISION_ANGLE);
  return delta <= angle / 2 + 1e-7;
}

export function facingModifiers(attacker, target) {
  if (!attacker || !target) return {parts:[], blind:false};
  const blind = !withinFacing(attacker, target), rear = !withinFacing(target, attacker);
  return {blind, parts:[
    ...(blind ? [{label:"Цель вне вашего конуса зрения", value:-3}] : []),
    ...(rear ? [{label:"Вы вне конуса зрения цели", value:3}] : [])
  ]};
}

export function attackerToken(actor) {
  if (actor.isToken) return actor.token;
  const owned = (globalThis.canvas?.tokens?.controlled ?? []).filter(token => token.actor?.uuid === actor.uuid);
  if (owned.length === 1) return tokenDocument(owned[0]);
  const tokens = Array.from(globalThis.canvas?.scene?.tokens ?? []).filter(token => token.actor?.uuid === actor.uuid);
  if (tokens.length === 1) return tokens[0];
  throw new Error("Выделите один токен атакующего на сцене.");
}

export function selectedAttackTarget(actor, {attackerUuid, targetUuid} = {}) {
  const explicitTarget = targetUuid ? globalThis.canvas?.scene?.tokens.find(token=>token.uuid===targetUuid) : null;
  if(targetUuid&&!explicitTarget)throw new Error("Цель больше не находится на открытой сцене.");
  if(explicitTarget&&!game.user.isGM&&(explicitTarget.hidden||!explicitTarget.object?.isVisible))throw new Error("Этот токен сейчас не виден.");
  const targets = explicitTarget ? [explicitTarget] : Array.from(globalThis.game?.user?.targets ?? []);
  if (!targets.length) return null;
  if (targets.length > 1) throw new Error("Для атаки оставьте одну выбранную цель.");
  const attacker = attackerUuid ? globalThis.canvas?.scene?.tokens.find(token=>token.uuid===attackerUuid) : attackerToken(actor), target = tokenDocument(targets[0]);
  if(!attacker||attacker.actor?.uuid!==actor.uuid)throw new Error("Токен атакующего больше не доступен.");
  if (!COMBAT_ACTOR_TYPES.includes(target.actor?.type) || target.uuid === attacker.uuid || attacker.parent?.id !== target.parent?.id) throw new Error("Выберите другое существо на той же сцене.");
  return {attacker, target, distance: tokenGap(attacker, target), ...facingModifiers(attacker, target)};
}
