import { SYSTEM_ID } from "../config.mjs";

// Same safety ceiling as Foundry's recursive exploding dice. Never silently
// truncate a chain and present an incomplete result as a finished check.
const MAX_CONTINUATIONS = 1000;

/** Native Die modifier: one original d10 determines the sign of its entire chain. */
export async function witcherCritical(modifier) {
  if (modifier !== "wc") return false;
  if (this.faces !== 10) throw new Error("Witcher critical chains require a d10");
  if (this.options[SYSTEM_ID]?.criticalChains) return false;
  const chains = [];
  this.options[SYSTEM_ID] = { ...this.options[SYSTEM_ID], criticalChains: chains };
  // Only original dice can start a chain. A later 1 always ends the current one.
  const originals = this.results.filter(result => result.active);
  for (const first of originals) {
    if (first.result !== 1 && first.result !== 10) continue;
    const negative = first.result === 1;
    const chain = { kind: negative ? "fumble" : "critical", results: [first.result], total: negative ? 0 : 10 };
    if (negative) first.count = 0;
    let previous = first;
    for (let step = 0; ; step++) {
      if (step >= MAX_CONTINUATIONS) throw new Error("Maximum Witcher critical chain length exceeded");
      // DSN uses the native exploded marker to animate successive throws in order.
      previous.exploded = true;
      const next = await this.roll({ explode: true });
      if (negative) next.count = -next.result;
      chain.results.push(next.result);
      chain.total += negative ? -next.result : next.result;
      if (next.result !== 10) break;
      previous = next;
    }
    chains.push(chain);
  }
}

export function registerCriticalDice() {
  CONFIG.Dice.terms.d.MODIFIERS.wc = witcherCritical;
}
