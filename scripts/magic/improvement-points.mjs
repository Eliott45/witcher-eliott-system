/** Restricted points pay only the eligible part of a purchase, before ordinary IP. */
export function magicPayment(actor,cost,eligibleCost=cost) {
  const points=actor.system.experience??0,magicPoints=actor.system.magic?.improvementPoints??0;
  const magicSpent=Math.min(magicPoints,eligibleCost),regularSpent=cost-magicSpent;
  return {points,magicPoints,magicSpent,regularSpent,remaining:points-regularSpent,magicRemaining:magicPoints-magicSpent};
}
// TODO(core p.122): "magical abilities" is not an exhaustive list. Automatically
// cover the three casting skills; profession skills remain ordinary IP until clarified.
export const magicAdvancement=row=>row.kind==="skills"&&["spellCasting","ritualCrafting","hexWeaving"].includes(row.key);
