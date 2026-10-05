import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { effectCounter, statusEffect } from "../data/effect-counters.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { actionRoundKey } from "./action-economy.mjs";
import { ACTIVE_DODGE, AIMING, aimingBonus, fullTurnStart, consumeAiming } from "./full-turn-rules.mjs";

export function fullTurnContext(actor) {
  const effect = statusEffect(actor, AIMING), round = actionRoundKey(actor), rules = conditionRules(actor);
  const activeDodge = Boolean(statusEffect(actor, ACTIVE_DODGE));
  return { activeDodge, canToggleDodge: rules.canAct || activeDodge, aiming: aimingBonus(actor),
    aimUsed: Boolean(round && effect?.flags?.[SYSTEM_ID]?.conditionState?.lastAimRound === round),
    canAct: rules.canAct, canRecover: rules.canRecover && actor.system.statistics.recovery > 0 && actor.system.stamina.value < actor.system.stamina.max,
    run: actor.system.statistics.run ?? "—", recovery: actor.system.statistics.recovery ?? "—" };
}

// Coalesce rapid clicks, then serialize with attacks so aiming cannot be changed mid-roll.
const pending = new WeakMap();
export function performFullTurnAction(actor, action) {
  if (pending.has(actor)) return pending.get(actor);
  const work = inventoryWrite(actor, async () => {
    if (![ACTIVE_DODGE, AIMING, "clear-aiming"].includes(action)) throw new Error("Неизвестное действие полного хода.");
    const status = action === "clear-aiming" ? AIMING : action;
    const effect = statusEffect(actor, status);
    if (action === "clear-aiming" || (action === ACTIVE_DODGE && effect)) {
      if (effect) await effect.delete();
      return;
    }
    if (!conditionRules(actor).canAct) throw new Error("Персонаж сейчас не может действовать.");
    const round = actionRoundKey(actor);
    if (action === AIMING && round && effect?.flags?.[SYSTEM_ID]?.conditionState?.lastAimRound === round) return;
    const start = fullTurnStart(actor);
    // Native roundStart expiry removes dodge before any actor acts in the next round.
    // Aim lasts through the next turn to allow shooting or another consecutive Aim action.
    const rules = CONDITION_BY_ID[status].rules;
    const duration = { value: rules.rounds, units: "rounds", expiry: rules.expiry, expired: false };
    if (action === AIMING && effect) {
      const counter = effectCounter(effect);
      await effect.update({ start, duration,
        [`flags.${SYSTEM_ID}.conditionState.counter`]: Math.min(counter.max, counter.value + 1),
        [`flags.${SYSTEM_ID}.conditionState.lastAimRound`]: round });
    } else {
      const source = conditionSource(CONDITION_BY_ID[status], text => game.i18n.localize(text));
      delete source._id;
      const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, start, duration }]);
      if (created && action === AIMING) await created.update({ [`flags.${SYSTEM_ID}.conditionState.lastAimRound`]: round });
      if (created && action === ACTIVE_DODGE) await consumeAiming(actor);
    }
  });
  pending.set(actor, work);
  const clear = () => { if (pending.get(actor) === work) pending.delete(actor); };
  work.then(clear, clear);
  return work;
}

