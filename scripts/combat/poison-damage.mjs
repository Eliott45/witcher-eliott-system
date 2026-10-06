import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { reconcileToxicity } from "../workshop/consumption.mjs";
import { conditionWrite } from "./condition-saves.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { conditionResistant } from "./damage-rules.mjs";
import { burningDamage, burnEquipment, isBurning } from "./burning.mjs";
import { modifierTotal } from "../data/background-modifiers.mjs";
import { woundAcidDamage } from "./critical-wound-effects.mjs";

export function poisonDamage(actor) {
  if (immuneToCondition(actor, ["poisoned"]) || actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead"))) return 0;
  if (!actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("poisoned"))) return 0;
  // SP does not absorb poison; resistance halves the damage, rounded down.
  return conditionResistant(actor, "poison") ? 1 : 3;
}

/** Core p.161: bleeding deals 2 a turn, ignoring armor; resistance halves it; a clotting powder suspends it. */
export function bleedingDamage(actor) {
  if (actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead"))) return 0;
  if (!actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("bleeding"))) return 0;
  if (actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("clotting"))) return 0;
  // Treated Heart Damage (errata v4, p.160): +2 bleeding damage per round, permanently.
  const extra = modifierTotal(actor.system.statistics?.modifiers ?? [], "bleedingDamage");
  return conditionResistant(actor, "bleeding") ? Math.floor((2 + extra) / 2) : 2 + extra;
}

/** Native Combat calls this only on the elected GM. HP and the processed turn are one write. */
export function startTurnPoison(combat, combatant, context) {
  const actor = combatant?.actor;
  if (!actor?.isOwner || !COMBAT_ACTOR_TYPES.includes(actor.type) || game.user !== game.users.activeGM || !combat.started || context.skipped || context.round < 1) return;
  if (combat.previous?.round === context.round && combat.previous?.turn === context.turn) return;
  const poisonsAtStart = new Set(actor.effects.filter(effect => activeEffect(effect) && effect.statuses.has("poisoned")).map(effect => effect.id));
  const bleedsAtStart = actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("bleeding"));
  const burnsAtStart = isBurning(actor);
  const acidAtStart = actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead")) ? 0 : woundAcidDamage(actor);
  const choking = actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("suffocating")) && !actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead"));
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
      const poison = remainsPoisoned ? poisonDamage(actor) : 0, bleeding = bleedsAtStart ? bleedingDamage(actor) : 0;
      const burn = burnsAtStart ? burningDamage(actor) : null, burning = burn?.total ?? 0;
      const suffocation = choking ? 3 : 0;
      const acid = acidAtStart;
      const damage = poison + bleeding + burning + suffocation + acid, before = actor.system.health.value, after = before - damage;
      // Record even a healthy turn: applying poison later in that turn is not a new tick.
      await actor.update({[`flags.${SYSTEM_ID}.poisonTurns`]:{combat:combat.uuid,rounds},
        ...(damage ? {"system.health.value":after} : {})});
      // The fire scorches gear every turn even when the armor stopped all of its damage.
      const scorched = burn ? await burnEquipment(actor) : [];
      if (!damage && !burn) return;
      const messageMode = combatant.hidden ? "gm" : game.settings.get("core", "messageMode");
      await foundry.documents.ChatMessage.create({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
        content:`<section class="witcher-poison-damage"><h3>${[poison ? "Отравление" : "", bleeding ? "Кровотечение" : "", burn ? "Горение" : "", suffocation ? "Удушье" : "", acid ? "Рана в живот" : ""].filter(Boolean).join(", ")} · начало хода</h3><p><strong>${esc(actor.name)}</strong>: −${damage} ПЗ (${before} → ${after}).</p>${burn ? `<small>Горение: ${burning} (по ${5} в каждую часть тела, минус ПБ зоны${burn.vulnerable ? "; уязвимость к огню ×2" : ""}): ${burn.parts.map(part => `${esc(part.name)} ${part.total}${part.sp ? ` (ПБ ${part.sp})` : ""}`).join(", ")}.</small>${scorched.length ? `<small>Огонь портит снаряжение: ${esc(scorched.join("; "))}.</small>` : ""}<small>Потушить: потратить ход на обливание водой или на то, чтобы упасть и сбить пламя.</small>` : ""}${suffocation ? `<small>Удушье: ${suffocation}, броня не защищает.</small>` : ""}${acid ? `<small>Рана в живот: ${acid} урона кислотой, броня не защищает.</small>` : ""}${poison ? `<small>Отравление: ${poison}${poison < 3 ? " (сопротивление яду: половина урона)" : ""}.</small>` : ""}${bleeding ? `<small>Кровотечение: ${bleeding}${bleeding < 2 ? " (сопротивление кровотечению: половина урона)" : ""}. Броня не защищает.</small>` : ""}</section>`,
        flags:{[SYSTEM_ID]:{skipLuck:true,poisonDamage:{combat:combat.uuid,combatant:combatant.id,round:context.round,damage,poison,bleeding,burning,before,after}}}}, {messageMode});
    });
  });
}
