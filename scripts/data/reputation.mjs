import { queueActorWrite } from "./actor-writes.mjs";

// Core p. 60: +3 only when the character's reputation is relevant to this conversation.
// TODO: the book/errata does not enumerate eligible skills. These are UI suggestions;
// the player chooses the applicable ones with the GM instead of granting a universal bonus.
export const REPUTATION_SKILLS = ["charisma", "persuasion", "intimidation", "leadership", "deceit", "seduction", "business", "socialEtiquette"];
export const reputationLevel = (base = 0, bonus = 0) => Math.max(0, Math.min(10, base + bonus));

export function reputationModifiers(reputation, level) {
  if (!reputation.bonusEnabled || level <= 0) return [];
  return [...new Set(reputation.skills ?? [])].filter(key => REPUTATION_SKILLS.includes(key)).map(key => ({
    source: "reputation", label: "WITCHER.Reputation.Bonus", category: "situational", target: `skills.${key}`, value: 3
  }));
}

export function setReputationValue(actor, value, expected, localize = key => key) {
  return queueActorWrite(actor, async () => {
    if (!actor.isOwner) throw new Error(localize("WITCHER.Advancement.NoPermission"));
    if (!Number.isSafeInteger(value) || value < 0 || value > 10) throw new Error(localize("WITCHER.Reputation.Invalid"));
    if ((actor.system.reputation?.value ?? 0) !== expected) throw new Error(localize("WITCHER.Reputation.Stale"));
    return actor.update({ "system.reputation.value": value });
  });
}

export function setReputationBonus(actor, enabled, skills) {
  return queueActorWrite(actor, async () => {
    if (!actor.isOwner) return;
    const selected = [...new Set(skills ?? actor.system.reputation.skills)].filter(key => REPUTATION_SKILLS.includes(key));
    return actor.update({ "system.reputation.bonusEnabled": Boolean(enabled && selected.length),
      ...(skills ? { "system.reputation.skills": selected } : {}) });
  });
}
