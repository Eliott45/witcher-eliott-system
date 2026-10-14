import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { tokenGap } from "./attack-target.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { isHym, creatureMentalImmunity } from "./creature-spirits.mjs";
import { activeCreatureGM, creatureTargets, creatureRoll, creaturePost, esc } from "./creature-actions-common.mjs";

// Monster Hunter's Journal p.29, hym «Убеждение жертвы»: three ways to torment one target within 10 m.
export const HYM_RANGE = 10;

function oneVictim(actor, options) {
  const { source, targets } = creatureTargets(actor, options);
  if (targets.length !== 1) throw new Error("Выберите одну жертву клавишей T.");
  const target = targets[0], distance = tokenGap(source, target);
  if (!(distance <= HYM_RANGE)) throw new Error(`Жертва должна быть не дальше ${HYM_RANGE} м.`);
  return { source, target, victim: target.actor };
}

/** Opposed roll of the hym against the victim's Resist Coercion; immune minds are never swayed. */
async function opposed(actor, victim, skill, penalty = 0) {
  const immune = creatureMentalImmunity(victim, { mental: true });
  if (immune) return { success: false, immune, rolls: [] };
  const [attack, resist] = await Promise.all([creatureRoll(`1d10wc + ${(skillValue(actor.system, skill).total ?? 0) + penalty}`),
    creatureRoll(`1d10wc + ${skillValue(victim.system, "resistCoercion").total ?? 0}`)]);
  return { success: attack.total > resist.total, attack: attack.total, resist: resist.total, rolls: [attack, resist] };
}

export function hallucinationEffect(victim, hym) {
  return { name: "Паника: галлюцинации хима", img: "icons/svg/terror.svg", type: "base", system: {}, statuses: [],
    description: "<p>Галлюцинации о проступке: персонаж в панике. −3 к Сопротивлению убеждению против хима в течение часа.</p>",
    start: fullTurnStart(victim), duration: { value: 3600, units: "seconds", expiry: null, expired: false },
    flags: { [SYSTEM_ID]: { condition: { seconds: 3600, mental: true, modifiers: [{ target: "skills.resistCoercion", value: -3 }] }, hymPanic: { source: hym.uuid } } } };
}

/** Each night of nightmares halves the current maximum STA again, never below 5. */
export function nightmareEffect(victim) {
  const current = victim.system.statistics?.staminaMax ?? victim.system.stamina?.max ?? 0, reduced = Math.max(5, Math.floor(current / 2));
  return { name: "Кошмары хима", img: "icons/svg/sleep.svg", type: "base", system: {}, statuses: [],
    description: `<p>Во сне персонаж не восстанавливает ПЗ и ВЫН. Максимум ВЫН снижен с ${current} до ${Math.min(current, reduced)}, пока он не выспится нормально; тогда снимите эффект.</p>`,
    flags: { [SYSTEM_ID]: { condition: { mental: true, modifiers: [{ target: "staminaMax", value: Math.min(0, reduced - current) }] }, hymNightmare: true } } };
}

/** The caller pays the action (a full turn for nightmares). */
export async function useHymAction(actor, id, options = {}, quote = { penalty: 0 }) {
  const { victim } = oneVictim(actor, options);
  if (id === "hym-whisper") {
    const result = await opposed(actor, victim, "persuasion", quote.penalty);
    const hours = result.success ? await creatureRoll("1d10") : null;
    return creaturePost(actor, { title: "Нашёптывание хима", rolls: [...result.rolls, ...(hours ? [hours] : [])],
      text: result.immune ? `${esc(victim.name)}: ${esc(result.immune)}.` : `Убеждение ${result.attack} против Сопротивления убеждению ${result.resist}: ${result.success
        ? `${esc(victim.name)} поддаётся. Хим выбирает: один удар себе ближайшим оружием, один удар ближайшим оружием по кому-то рядом или уединение на ${hours.total} ч — жертва остаётся одна до запертых дверей, бегства и угроз.`
        : `${esc(victim.name)} не поддаётся.`}` });
  }
  if (id === "hym-hallucination") {
    const result = await opposed(actor, victim, "spellCasting", quote.penalty);
    if (result.success) await victim.createEmbeddedDocuments("ActiveEffect", [hallucinationEffect(victim, actor)]);
    return creaturePost(actor, { title: "Галлюцинации хима", rolls: result.rolls,
      text: result.immune ? `${esc(victim.name)}: ${esc(result.immune)}.` : `Сотворение заклинаний ${result.attack} против Сопротивления убеждению ${result.resist}: ${result.success ? `${esc(victim.name)} в панике, −3 к Сопротивлению убеждению против хима на час` : `${esc(victim.name)} не поддаётся`}.` });
  }
  if (id === "hym-nightmare") {
    if (creatureMentalImmunity(victim, { mental: true })) throw new Error(`${victim.name}: невосприимчив к магии разума.`);
    const effect = nightmareEffect(victim);
    await victim.createEmbeddedDocuments("ActiveEffect", [effect]);
    return creaturePost(actor, { title: "Кошмары хима", text: `${esc(victim.name)} видит кошмары: сон не восстанавливает ПЗ и ВЫН, максимум ВЫН снижен вдвое (не ниже 5) до нормального сна.` });
  }
  throw new Error("Неизвестное действие хима.");
}

/** A fire attack (or a burning weapon) aimed at the hym switches its shadow body off for this round. */
export async function igniteHym(message) {
  const attack = message?.flags?.[SYSTEM_ID]?.weaponAttack;
  if (!activeCreatureGM() || !attack?.target) return false;
  const target = globalThis.fromUuidSync?.(attack.target)?.actor;
  const fire = attack.traits?.types?.includes("elemental") || (attack.hitTraits?.burning ?? 0) > 0;
  if (!isHym(target) || !fire) return false;
  const combat = game.combat, mark = combat?.started ? { combatId: combat.id, round: combat.round } : { combatId: "", time: game.time?.worldTime ?? 0 };
  await target.update({ [`flags.${SYSTEM_ID}.hymIgnited`]: mark });
  await creaturePost(target, { title: "Поджигание", text: "Огонь высвечивает хима: Тело из теней не действует до конца раунда." });
  return true;
}

export function registerHym() {
  const fail = error => ui.notifications.error(error.message);
  Hooks.on("createChatMessage", message => { igniteHym(message).catch(fail); });
  // Moving takes the hym out of a mage's sight: the location found by Magic Training no longer counts.
  Hooks.on("updateToken", (token, changes) => {
    if (!activeCreatureGM() || !isHym(token.actor) || !("x" in changes || "y" in changes)) return;
    token.actor.update({ "system.creature.invisibilityEpoch": foundry.utils.randomID() }).catch(fail);
  });
}
