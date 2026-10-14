import { diceSyncEnabled } from "../chat/roll-display.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { SCHOOL_ARMOR_EFFECTS } from "../data/witcher-school-gear.mjs";
import { CRITICAL_LEVELS, criticalLevel } from "./damage-rules.mjs";

const flags = message => message?.flags?.[SYSTEM_ID] ?? {};
export const isWitcherWeapon = item => item?.type === "weapon" && /^(weapon\.school-(bear|cat|griffin|manticore|viper|wolf)-(steel|silver|crossbow|fang)|weapon\.witcher-(steel|silver)-sword|weapon\.manticore-shield)$/.test(item.system?.ruleId ?? "");
export const schoolArmor = actor => [...new Set(equippedItems(actor.items).filter(item => item.type === "armor")
  .map(item => item.system.ruleId?.match(/^armor\.school-(bear|cat|griffin|manticore|viper|wolf)$/)?.[1]).filter(Boolean))];
export function schoolGearSnapshot(actor, item) {
  const combat = globalThis.game?.combat;
  return { armors: schoolArmor(actor), witcherWeapon: isWitcherWeapon(item), manticoreShield: item?.system.ruleId === "weapon.manticore-shield",
    combat: combat?.started ? { id: combat.id, round: combat.round, turn: combat.turn } : null };
}
export function schoolCriticalLevel(margin, snapshot) {
  const level = criticalLevel(margin);
  if (!level || !snapshot?.witcherWeapon || !snapshot.armors?.includes("bear")) return level;
  return CRITICAL_LEVELS[Math.max(0, CRITICAL_LEVELS.indexOf(level) - 1)];
}
export const parryingWeaponBonus = weapon => /парирующ/iu.test(weapon?.properties ?? "") ? 2 : 0;

/** Opportunities are derived from resolved exchanges, never from an editable free-action toggle. */
export function schoolReactions(message) {
  const link = flags(message).exchange;
  if (!link || !["applied", "defense"].includes(link.kind)) return [];
  const source = globalThis.game?.messages?.get(link.attack), attack = flags(source).weaponAttack;
  if (!source || !attack) return [];
  let actor, schools, snapshot;
  if (link.kind === "applied") {
    if (!link.schoolCritical) return [];
    actor = source.speakerActor;
    snapshot = attack.schoolGear;
    schools = snapshot?.witcherWeapon ? snapshot.armors?.filter(school => ["cat", "griffin", "wolf"].includes(school)) : [];
  } else {
    const defense = flags(message).defense, total = source.rolls?.[link.index]?.total;
    if (link.none || !Number.isFinite(total) || !(message.rolls?.[0]?.total - total > 4)) return [];
    actor = message.speakerActor;
    snapshot = defense?.schoolGear;
    schools = snapshot?.armors?.filter(school => school === "manticore" ? snapshot.manticoreShield && ["block", "parry"].includes(defense.mode)
      : school === "viper" && snapshot.witcherWeapon && defense.mode === "parry");
  }
  return (schools ?? []).map(school => ({ school, actor, source, trigger: message, snapshot, title: SCHOOL_ARMOR_EFFECTS[school][0],
    attackerUuid: link.kind === "defense" ? attack.target : attack.attacker,
    targetUuid: link.kind === "defense" ? attack.attacker : attack.target,
    shieldId: link.kind === "defense" ? flags(message).defense?.itemId : null }));
}
export function schoolReactionUsed(triggerId, school) {
  return Array.from(globalThis.game?.messages?.contents ?? []).some(message => {
    const receipt = flags(message).schoolReaction;
    return receipt?.triggerId === triggerId && receipt.school === school;
  });
}
/** Only the Manticore shield strike is explicitly restricted to the original attacker. */
export function schoolReactionTarget(reaction, targetUuid) {
  if (reaction.school === "manticore") return reaction.targetUuid;
  const targets = Array.from(globalThis.game?.user?.targets ?? []);
  if (!targetUuid && targets.length > 1) throw new Error("Для атаки оставьте одну выбранную цель.");
  return targetUuid ?? targets[0]?.document?.uuid ?? targets[0]?.uuid ?? reaction.targetUuid;
}
export function schoolReactionAvailable(reaction) {
  if (!reaction?.actor?.isOwner || !reaction.trigger.isContentVisible || schoolReactionUsed(reaction.trigger.id, reaction.school)) return false;
  if (diceSyncEnabled() && [reaction.trigger, reaction.source].some(message => message?._dice3danimating && !message._witcherSettled && Date.now() - (message.timestamp ?? 0) < 12000)) return false;
  if (!schoolArmor(reaction.actor).includes(reaction.school)) return false;
  const then = reaction.snapshot.combat, now = globalThis.game?.combat;
  if (then && (!now?.started || then.id !== now.id || then.round !== now.round || then.turn !== now.turn)) return false;
  // The extra action must follow the trigger immediately, not be banked for a later action.
  const messages = globalThis.game?.messages?.contents ?? [], index = messages.findIndex(message => message.id === reaction.trigger.id);
  return !messages.slice(index + 1).some(message => message.speakerActor?.uuid === reaction.actor.uuid &&
    (flags(message).weaponAttack || flags(message).magicCast || !flags(message).defense && (flags(message).skillCheck || flags(message).professionCheck)));
}
export function validateSchoolReaction(actor, request, item, { mode = "fast", casting = false, unarmed = false } = {}) {
  if (!request) return null;
  const reaction = schoolReactions(globalThis.game?.messages?.get(request.triggerId)).find(entry => entry.school === request.school && entry.actor?.uuid === actor.uuid);
  if (!schoolReactionAvailable(reaction)) throw new Error("Эта возможность школьной брони уже использована или больше недоступна.");
  if (casting) {
    if (reaction.school !== "griffin" || item?.type !== "spell" || item.system.kind !== "sign") throw new Error("Критическая магия позволяет сотворить только знак.");
  } else if (unarmed) {
    if (reaction.school !== "cat" || !["disarm", "trip"].includes(mode)) throw new Error("Критический натиск даёт только подсечку или разоружение.");
  } else {
    if (item?.type !== "weapon" || !equippedItems(actor.items).some(entry => entry.id === item.id)) throw new Error("Выберите взятое в руки оружие.");
    if (reaction.school === "griffin") throw new Error("Выберите знак.");
    if (reaction.school === "cat" ? !["disarm", "trip"].includes(mode) : mode !== "fast") throw new Error("Школьная броня даёт один удар или указанный приём.");
    if (reaction.school === "manticore" && (item.id !== reaction.shieldId || item.system.ruleId !== "weapon.manticore-shield")) throw new Error("Нужно ударить тем же щитом Мантикоры.");
  }
  return reaction;
}
