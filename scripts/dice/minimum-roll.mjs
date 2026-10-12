import { SYSTEM_ID } from "../config.mjs";

/** The original arithmetic stays available for Luck and the modifier breakdown. */
export function minimumRollSource(roll) {
  const term = roll.terms?.[0];
  return roll.options?.[SYSTEM_ID]?.minimumTotal && roll.terms.length === 1 && term.fn === "max"
    && term.rolls?.length === 2 && term.rolls[0].total === 0 ? term.rolls[1] : roll;
}

/** Keep native dice and their critical chains; only the complete result is bounded. */
export function withMinimumTotal(roll) {
  if (!Number.isFinite(roll.total) || roll.total >= 0) return roll;
  const zero = new foundry.dice.Roll("0").evaluateSync();
  const term = new foundry.dice.terms.FunctionTerm({ fn: "max", terms: ["0", roll.formula],
    rolls: [zero, roll], result: 0 });
  return foundry.dice.Roll.fromTerms([term], {
    ...roll.options, [SYSTEM_ID]: { ...roll.options?.[SYSTEM_ID], minimumTotal: true }
  });
}

/** System rolls must use the same total for comparisons, resource changes and chat. */
export async function evaluateRoll(formula, evaluation = {}, data = {}, options = {}) {
  return withMinimumTotal(await new foundry.dice.Roll(formula, data, options).evaluate(evaluation));
}

/** Also covers native /roll, macros and dice-tray messages, after selected Luck. */
export function prepareMinimumResults(message) {
  const rolls = message.rolls.map(withMinimumTotal);
  if (rolls.every((roll, index) => roll === message.rolls[index])) return;
  const original = message.rolls[0];
  message.updateSource({ rolls: rolls.map(roll => roll.toJSON()),
    ...(message.content === String(original?.total) ? { content: String(rolls[0].total) } : {}) });
}
