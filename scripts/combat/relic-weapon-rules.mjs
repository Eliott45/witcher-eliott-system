/** Core p.72, errata v4: Balanced changes the wound-table roll, never the attack margin. */
export function balancedCriticalBonus(weapon, aimed = false) {
  const match = String(weapon?.properties ?? "").match(/сбалансированное(?:\s*\(\+(\d+)\))?/iu);
  if (!match) return 0;
  // Headtaker's printed +5 replaces the usual +2 to the 2d6 location roll.
  // The aimed rule remains the explicitly printed 1d6+1 from p.72.
  return aimed ? 1 : Number(match[1] ?? 2);
}

export function criticalTableRoll(raw, { weapon, aimed = false, location, extra = 0 } = {}) {
  if (aimed && !["head", "torso"].includes(location)) return raw;
  return Math.min(aimed ? 6 : 12, raw + balancedCriticalBonus(weapon, aimed) + extra);
}

export const specterDamageBonus = (hitTraits, target) => target?.type === "npc" && target.system?.creature?.category === "specter"
  ? Number(hitTraits?.specterDamage ?? 0) : 0;
