import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { statusEffect } from "../data/effect-counters.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";

// Core p.153 «Быстрое выхватывание»: +3 initiative this round, −3 to the attack, no aiming bonuses.
// The effect lasts to the end of the round; the initiative bonus is undone when the effect goes away.
export const QUICK_DRAW = "quick-draw";
const BONUS = 3;

const combatantOf = actor => Array.from(game.combat?.combatants ?? []).find(entry => entry.actor?.uuid === actor.uuid);

export async function toggleQuickDraw(actor) {
  if (!actor.isOwner) return;
  const current = statusEffect(actor, QUICK_DRAW);
  if (current) return current.delete();
  const combat = game.combat, combatant = combatantOf(actor);
  if (!combat?.started || !combatant) throw new Error("Быстрое выхватывание заявляется в начатом бою.");
  const source = conditionSource(CONDITION_BY_ID[QUICK_DRAW]); delete source._id;
  await actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, start: fullTurnStart(actor),
    duration: { value: 1, units: "rounds", expiry: "roundEnd", expired: false },
    flags: { [SYSTEM_ID]: { ...source.flags[SYSTEM_ID], quickDraw: { combat: combat.id, combatant: combatant.id, bonus: BONUS } } } }]);
  if (Number.isFinite(combatant.initiative)) await combatant.update({ initiative: combatant.initiative + BONUS });
}

export function registerQuickDraw() {
  // Whoever removes the effect (the owner's toggle or the GM's round-end expiry) restores the initiative once.
  Hooks.on("deleteActiveEffect", (effect, _options, userId) => {
    const data = effect.flags?.[SYSTEM_ID]?.quickDraw;
    if (!data || userId !== game.user.id) return;
    const combatant = game.combats.get(data.combat)?.combatants.get(data.combatant);
    if (combatant && Number.isFinite(combatant.initiative)) combatant.update({ initiative: combatant.initiative - data.bonus }).catch(console.error);
  });
}
