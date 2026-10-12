import { SYSTEM_ID } from "../config.mjs";
import { selectedLuck } from "../data/luck.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";
import { minimumRollSource } from "../dice/minimum-roll.mjs";

// Reservations last only for a chat creation operation. A rejected message must
// neither spend Luck nor leave it reserved; simultaneous local rolls cannot reuse it.
const reservations = new Map();

export async function prepareMessageLuck(message, operationId) {
  if (!operationId || message.flags[SYSTEM_ID]?.skipLuck || message.flags[SYSTEM_ID]?.luck) return;
  const actor = message.speakerActor;
  if (!actor?.isOwner || reservations.has(actor.uuid)) return;
  const points = selectedLuck(actor.system);
  const index = message.rolls.findIndex(roll => roll.dice.length > 0);
  if (!points.length || index < 0) return;
  const claim = { id: foundry.utils.randomID(), operationId, actor, points };
  reservations.set(actor.uuid, claim);
  const luck = { claim: claim.id, actor: actor.uuid, points, bonus: points.length, rollIndex: index };
  // A death save rolls under a threshold. Luck increases that threshold, never the die.
  if (message.flags[SYSTEM_ID]?.deathSave) {
    message.updateSource({ [`flags.${SYSTEM_ID}.luck`]: { ...luck, target: "death" } });
    return;
  }
  const roll = message.rolls[index];
  const original = minimumRollSource(roll);
  const bonus = new foundry.dice.terms.NumericTerm({ number: points.length,
    options: { flavor: game.i18n.localize("WITCHER.Attributes.luck.Label") } });
  await bonus.evaluate();
  // Reuse evaluated dice instead of evaluating their formula a second time.
  const adjusted = foundry.dice.Roll.fromTerms([
    ...original.terms, new foundry.dice.terms.OperatorTerm({ operator: "+" }), bonus
  ], { ...original.options });
  const rolls = [...message.rolls];
  rolls[index] = adjusted;
  message.updateSource({
    rolls: rolls.map(entry => entry.toJSON()),
    ...(message.content === String(roll.total) ? { content: String(adjusted.total) } : {}),
    flavor: `${message.flavor ?? ""}<span class="witcher-luck-bonus">${escapeTooltip(game.i18n.format("WITCHER.Luck.RollBonus", { value: points.length }))}</span>`,
    [`flags.${SYSTEM_ID}.luck`]: luck
  });
}

export async function settleMessageLuck(messages, operationId) {
  for (const message of messages) {
    const luck = message.flags[SYSTEM_ID]?.luck;
    const reservation = luck && reservations.get(luck.actor);
    if (!reservation || reservation.operationId !== operationId || reservation.id !== luck.claim) continue;
    const { actor, points } = reservation;
    try {
      await actor.update({
        "system.luckSpent": [...new Set([...actor.system.luckSpent, ...points])].sort((a, b) => a - b),
        "system.luckPending": 0
      });
    } catch (error) {
      // The dice message already exists. Do not report the roll as failed/retry it.
      console.error(`${SYSTEM_ID} | Could not deduct Luck for message ${message.id}`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Luck.SpendError"));
    }
  }
}

export function releaseMessageLuck(operationId) {
  for (const [actor, reservation] of reservations) {
    if (reservation.operationId === operationId) reservations.delete(actor);
  }
}
