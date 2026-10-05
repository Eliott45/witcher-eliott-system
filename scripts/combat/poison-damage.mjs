import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { reconcileToxicity } from "../workshop/consumption.mjs";
import { conditionWrite } from "./condition-saves.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export function poisonDamage(actor) {
  if (immuneToCondition(actor, ["poisoned"]) || actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead"))) return 0;
  if (!actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("poisoned"))) return 0;
  const resistant = equippedItems(actor.items).some(item => {
    if (item.type !== "armor") return false;
    const armor = effectiveItem(item);
    return (armor.resistances ?? "").split(/[;,\n]/).some(value => /^(яд|яды|poison)$/iu.test(value.trim()))
      || /сопротивление (яду|ядам)|poison resistance/iu.test(armor.properties ?? "");
  });
  // SP does not absorb poison; resistance halves the damage, rounded down.
  return resistant ? 1 : 3;
}

/** Native Combat calls this only on the elected GM. HP and the processed turn are one write. */
export function startTurnPoison(combat, combatant, context) {
  const actor = combatant?.actor;
  if (!actor?.isOwner || !COMBAT_ACTOR_TYPES.includes(actor.type) || game.user !== game.users.activeGM || !combat.started || context.skipped || context.round < 1) return;
  if (combat.previous?.round === context.round && combat.previous?.turn === context.turn) return;
  const poisonsAtStart = new Set(actor.effects.filter(effect => activeEffect(effect) && effect.statuses.has("poisoned")).map(effect => effect.id));
  return conditionWrite(actor, async () => {
    // Core normally refreshes turnStart durations after the system callback. Expire
    // this actor's doses first so a dose ending at this boundary cannot cause damage.
    await foundry.documents.ActiveEffect.registry.refresh("turnStart", {...context, combat, actors:new Set([actor])});
    return inventoryWrite(actor, async () => {
      await reconcileToxicity(actor);
      const old = actor.flags?.[SYSTEM_ID]?.poisonTurns;
      const rounds = old?.combat === combat.uuid ? {...old.rounds} : {};
      if ((rounds[combatant.id] ?? 0) >= context.round) return;
      rounds[combatant.id] = context.round;
      // A drink submitted while duration updates are in flight belongs to the normal
      // part of this turn, not to the poison snapshot at its beginning.
      const remainsPoisoned = actor.effects.some(effect => poisonsAtStart.has(effect.id) && activeEffect(effect));
      const damage = remainsPoisoned ? poisonDamage(actor) : 0, before = actor.system.health.value, after = before - damage;
      // Record even a healthy turn: applying poison later in that turn is not a new tick.
      await actor.update({[`flags.${SYSTEM_ID}.poisonTurns`]:{combat:combat.uuid,rounds},
        ...(damage ? {"system.health.value":after} : {})});
      if (!damage) return;
      const messageMode = combatant.hidden ? "gm" : game.settings.get("core", "messageMode");
      await foundry.documents.ChatMessage.create({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
        content:`<section class="witcher-poison-damage"><h3>Отравление · начало хода</h3><p><strong>${esc(actor.name)}</strong>: −${damage} ПЗ (${before} → ${after}).${damage < 3 ? " Сопротивление яду: половина урона с округлением вниз." : ""}</p></section>`,
        flags:{[SYSTEM_ID]:{skipLuck:true,poisonDamage:{combat:combat.uuid,combatant:combatant.id,round:context.round,damage,before,after}}}}, {messageMode});
    });
  });
}
