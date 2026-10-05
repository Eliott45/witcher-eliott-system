import { SYSTEM_ID } from "../config.mjs";
import { effectRules } from "./condition-definitions.mjs";
import { inventoryWrite } from "./inventory-writes.mjs";

export const activeEffect = effect => !effect.disabled && !effect.isSuppressed && !effect.duration?.expired;
export const statusEffect = (actor, status) => actor?.effects.find(effect => activeEffect(effect) && effect.statuses.has(status));

/** Counter configuration belongs to the template; its current value belongs to one embedded effect. */
export function effectCounter(effect) {
  const config = effectRules(effect).counter;
  if (!Number.isInteger(config?.max) || config.max < 1) return null;
  const stored = effect.flags?.[SYSTEM_ID]?.conditionState?.counter ?? config.initial ?? 1;
  return { value: Math.min(config.max, Math.max(1, Math.floor(Number(stored) || 1))), max: config.max };
}

export function changeEffectCounter(actor, effectId, delta) {
  if (![-1, 1].includes(delta)) return Promise.resolve();
  return inventoryWrite(actor, async () => {
    const effect = actor.effects.get(effectId);
    if (!effect || !activeEffect(effect)) return;
    const counter = effectCounter(effect);
    if (!counter) return;
    const value = Math.min(counter.max, counter.value + delta);
    if (value < 1) return effect.delete();
    if (value !== counter.value) await effect.update({ [`flags.${SYSTEM_ID}.conditionState.counter`]: value });
  });
}
