import { hasStatus, STUNNED, EXHAUSTED_STUN, UNCONSCIOUS, DEAD } from "./status-effects.mjs";

/** Shared action availability for the sheet and future attacks/spells/defenses. */
export function conditionRules(actor) {
  const ordinaryStun = hasStatus(actor, STUNNED);
  const exhausted = hasStatus(actor, EXHAUSTED_STUN);
  const unconscious = hasStatus(actor, UNCONSCIOUS);
  const dead = hasStatus(actor, DEAD);
  const { value = 0, max = 0 } = actor.system.stamina ?? {};
  const required = Math.min(20, max);
  const ready = exhausted && required > 0 && value >= required;
  const blocked = ordinaryStun || exhausted || unconscious || dead;
  return {
    ordinaryStun, exhausted, unconscious, dead, required, ready,
    remaining: Math.max(0, required - value),
    canMove: !blocked, canAct: !blocked, canDefend: !blocked,
    canRecover: !dead && (exhausted || (!ordinaryStun && !unconscious)),
    canStunSave: !dead && !unconscious && (!exhausted || ready)
  };
}

export function preventIncapacitatedMovement(token) {
  if (game.user.isGM || !token.actor || conditionRules(token.actor).canMove) return;
  ui.notifications.warn(game.i18n.localize("WITCHER.Conditions.CannotMove"));
  return false;
}

/** Also cover direct token updates and rotations which bypass planned movement. */
export function preventIncapacitatedPositionUpdate(token, changes) {
  if (!["x", "y", "elevation", "rotation"].some(key => key in changes && changes[key] !== token[key])) return;
  return preventIncapacitatedMovement(token);
}
