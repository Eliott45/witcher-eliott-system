import { SYSTEM_ID } from "../config.mjs";

// What a player may see of someone else's rolls. The GM and the roller's owners always see everything.
const setting = key => { try { return Boolean(game.settings.get(SYSTEM_ID, key)); } catch { return false; } };

export const concealSetting = () => setting("concealAttackRolls");

/** Only enemies are secretive: a hostile or secret token without a player owner. The GM rolling for an ally or a
 * player's character hides nothing. Unknown disposition (no token) counts as an enemy. */
export function isEnemy(actor, token = null) {
  if (!actor || actor.hasPlayerOwner) return false;
  const document = token?.document ?? token ?? actor.token ?? actor.getActiveTokens?.()[0]?.document;
  const disposition = document?.disposition ?? actor.prototypeToken?.disposition;
  const { FRIENDLY, NEUTRAL } = globalThis.CONST?.TOKEN_DISPOSITIONS ?? { FRIENDLY: 1, NEUTRAL: 0 };
  return disposition !== FRIENDLY && disposition !== NEUTRAL;
}
const attackerOf = message => {
  const uuid = message?.flags?.[SYSTEM_ID]?.weaponAttack?.attacker, token = uuid && globalThis.fromUuidSync ? fromUuidSync(uuid) : null;
  return { actor: token?.actor ?? message?.speakerActor, token };
};
/** Is this an enemy attack that players should not see before defending? (setting on) */
export const enemyAttackHidden = message => { const { actor, token } = attackerOf(message); return setting("concealAttackRolls") && isEnemy(actor, token); };

/** A targeted enemy attack stays hidden from players until the defense is chosen. */
export const attackConcealed = message => enemyAttackHidden(message) && !game.user.isGM && !message?.speakerActor?.isOwner;

/** An enemy creature's numbers (base, modifiers, armor, resistances) stay hidden from players. */
export const creatureDetailsHidden = actor => setting("concealCreatureDetails") && !game.user.isGM && actor?.type === "npc" && !actor.isOwner && isEnemy(actor);

/** For the GM view: an enemy creature's numbers that players would not see. */
export const creatureDetailsSecret = actor => setting("concealCreatureDetails") && game.user.isGM && actor?.type === "npc" && isEnemy(actor);

/** A GM rolling for an enemy (or with nothing selected); players' and allies' rolls stay public. */
export function enemyRoller() {
  if (!game.user.isGM || !setting("concealAttackRolls")) return false;
  const token = globalThis.canvas?.tokens?.controlled?.[0];
  return token ? isEnemy(token.actor, token) : true;
}

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
