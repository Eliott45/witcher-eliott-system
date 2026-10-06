import { SYSTEM_ID } from "../config.mjs";

// What a player may see of someone else's rolls. The GM and the roller's owners always see everything.
const setting = key => { try { return Boolean(game.settings.get(SYSTEM_ID, key)); } catch { return false; } };

/** A targeted attack stays hidden from those who do not own the attacker until the defense is chosen. */
export const attackConcealed = message => setting("concealAttackRolls") && !game.user.isGM && !message?.speakerActor?.isOwner;

/** A creature's numbers (base, modifiers, armor, resistances) stay hidden from players who do not own it. */
export const creatureDetailsHidden = actor => setting("concealCreatureDetails") && !game.user.isGM && actor?.type === "npc" && !actor.isOwner;

/** Dice So Nice: ghost dice (no faces) for viewers who must not see this attack yet. */
export function registerConcealedDice() {
  Hooks.on("diceSoNiceRollStart", (messageId, context) => {
    const message = game.messages.get(messageId), attack = message?.flags?.[SYSTEM_ID]?.weaponAttack;
    if (!attack?.target || !attackConcealed(message) || !context?.roll) return;
    const ghost = foundry.dice.Roll.fromData(context.roll.toJSON());
    ghost.ghost = true;
    context.dsnRoll = ghost;
  });
}
