import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { tokenGap } from "../combat/attack-target.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { tokenActorSource } from "../data/token-actor-source.mjs";
import { spiritZonesAt } from "../combat/creature-spirits.mjs";
import { getProfessionAbility, professionAbilityState } from "../data/professions.mjs";

// Core p.167 «Двимерит, погибель магов». Every unit of dimeritium within 5 m lowers a magic adept's Vigor by 1;
// touching it drops Vigor to 0 and calls for an Endurance check (DC 16) on the dimeritium table, repeated
// every half hour of contact. Witchers are not magic adepts (p.166 sidebar) and are not affected.
export const DIMERITIUM_RANGE = 5;
export const DIMERITIUM_CONTACT = "dimeritium-contact";
// Core p.66 (mage, Archmage branch): WILL + «Устойчивость к двимериту» against DC 16 at any time dimeritium would
// affect the mage. Success keeps half of Vigor and the ability to cast, with only dizziness and discomfort.
// It lasts for that exposure (contact, metal within 5 m or a dimeritium bomb zone); a new exposure needs a new check.
export const DIMERITIUM_RESISTED = "dimeritium-resisted";
export const DIMERITIUM_RESISTANCE = "profession.mage.dimeritium";
export const DIMERITIUM_RESISTANCE_DC = 16;
export const isDimeritium = item => Boolean(item && isPhysical(item) && item.type !== "recipe"
  && (/dimeritium/u.test(item.system?.ruleId ?? "") || /двимерит/iu.test(item.name ?? "")));
const units = item => Math.max(0, item.system?.quantity ?? 1);
const carried = item => item.system?.carried !== false;

export const DIMERITIUM_TABLE = [
  { min: 18, text: "Кожа чешется: дискомфорт, но не более." },
  { min: 16, text: "Кожа чешется, слегка подташнивает, но в целом всё в порядке." },
  { min: 14, text: "Кожа чешется, подташнивает, тело периодически скручивают спазмы: каждые 1d6 ходов — Стойкость СЛ 15, иначе ошеломление.", status: "dimeritium-spasms" },
  { min: 12, text: "Кожа горит, желудок крутит: тошнота.", status: "nauseated" },
  { min: 10, text: "Кожа словно в огне, едва может сосредоточиться: испытание Устойчивости каждый раунд.", status: "dimeritium-agony" },
  { min: -Infinity, text: "Двимерит возжигает магию в теле: 1d6 урона каждый раунд, пока касается двимерита.", damage: "1d6", status: "dimeritium-burn" }
];
// Table rows that last only while the metal touches the adept. Nausea is the ordinary condition with its own end.
export const DIMERITIUM_TABLE_STATES = ["dimeritium-spasms", "dimeritium-agony", "dimeritium-burn"];
const TABLE_NAMES = { "dimeritium-spasms": "спазмы", "dimeritium-agony": "жжение, испытание Устойчивости каждый ход", "dimeritium-burn": "двимерит возжигает магию, 1d6 урона каждый ход" };
const activeStatus = (actor, id) => Array.from(actor?.effects ?? []).some(effect => !effect.disabled && !effect.isSuppressed && effect.statuses?.has?.(id));
export const dimeritiumResult = total => DIMERITIUM_TABLE.find(row => total >= row.min);

/** Units nearby and contact for one actor (null when the rule does not apply). */
export function dimeritiumState(actor, token = null) {
  if (!actor || actor.system?.details?.race === "witcher" || !["character", "npc"].includes(actor.type)) return null;
  const own = Array.from(actor.items ?? []).filter(isDimeritium);
  const touching = own.some(item => item.system?.equipped) || Boolean(actor.statuses?.has?.(DIMERITIUM_CONTACT));
  let nearby = own.filter(carried).reduce((sum, item) => sum + units(item), 0);
  const scene = token?.parent;
  if (scene?.grid) for (const other of scene.tokens) {
    if (other === token) continue;
    const neighbour = tokenActorSource(other);
    if (!neighbour || neighbour === actor) continue;
    const metal = Array.from(neighbour.items ?? []).filter(item => isDimeritium(item) && carried(item));
    if (!metal.length) continue;
    const gap = tokenGap(token, other);
    if (gap != null && gap <= DIMERITIUM_RANGE) nearby += metal.reduce((sum, item) => sum + units(item), 0);
  }
  const zone = spiritZonesAt(actor).some(entry => entry.kind === "dimeritium");
  const resisted = Boolean(actor.statuses?.has?.(DIMERITIUM_RESISTED));
  return nearby || touching || zone ? { nearby, touching, zone, resisted } : null;
}

/** Vigor modifiers for deriveStatistics; `vigor` is the value before dimeritium. A bomb zone forbids casting instead. */
export function dimeritiumModifiers(state, vigor = 0) {
  if (!state) return [];
  const label = { source: "dimeritium", category: "environment" };
  if (state.resisted) {
    const loss = Math.min(state.touching || state.zone ? Infinity : state.nearby, vigor - Math.floor(vigor / 2));
    return loss > 0 ? [{ target: "vigor", value: -loss, label: "Устойчивость к двимериту: сохранена половина Энергии", ...label }] : [];
  }
  if (state.touching) return [{ target: "vigor", value: -1000, label: "Касание двимерита: Энергия 0", ...label }];
  if (!state.nearby) return [];
  return [{ target: "vigor", value: -state.nearby, label: `Двимерит в пределах 5 м (${state.nearby})`, ...label }];
}

/** The mage's ability, or null when the actor lacks it. */
export function dimeritiumResistance(actor) {
  const definition = getProfessionAbility(DIMERITIUM_RESISTANCE);
  if (actor?.system?.details?.profession !== "mage") return null;
  const state = professionAbilityState(actor, definition);
  return state.level > 0 && state.attribute !== null ? { ...state, base: state.attribute + state.level + state.bonus } : null;
}

/** WILL + ability vs DC 16. Success marks the exposure as resisted; failure leaves the normal effect. */
export async function rollDimeritiumResistance(actor, state) {
  const ability = dimeritiumResistance(actor);
  if (!ability) throw new Error("Нужна способность мага «Устойчивость к двимериту».");
  if (!state) throw new Error("Сейчас двимерит на персонажа не действует.");
  const roll = await evaluateRoll(`1d10wc + ${ability.base}`);
  const success = roll.total >= DIMERITIUM_RESISTANCE_DC;
  const outcome = success
    ? "Успех: кружится голова и мучает дискомфорт, но маг сохраняет половину Энергии и может сотворять заклинания, пока длится это воздействие."
    : `Провал: двимерит действует как обычно.${state.touching ? " Пройдите Стойкость СЛ 16 по таблице двимерита." : ""}`;
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<section class="witcher-magic-chat"><h3>Устойчивость к двимериту · СЛ ${DIMERITIUM_RESISTANCE_DC}</h3><p>ВОЛЯ ${ability.attribute} + уровень ${ability.level}${ability.bonus ? ` + ${ability.bonus}` : ""}</p><p><strong>${roll.total}</strong>: ${outcome}</p></section>` });
  if (success) {
    const { setStatus } = await import("../combat/status-effects.mjs");
    await setStatus(actor, DIMERITIUM_RESISTED, true);
    // Resisting replaces the table: only dizziness and discomfort remain.
    for (const id of DIMERITIUM_TABLE_STATES) await setStatus(actor, id, false);
  }
  return success;
}

const TRACKED = [DIMERITIUM_RESISTED, ...DIMERITIUM_TABLE_STATES];
const tracked = actor => TRACKED.some(id => actor?.statuses?.has?.(id));

/** Active GM: an exposure ended, so the next one needs a fresh check (core p.66); table rows end with the contact. */
export async function clearEndedDimeritiumEffects(actors, tokenOf) {
  const { setStatus } = await import("../combat/status-effects.mjs");
  for (const actor of actors) {
    if (!tracked(actor)) continue;
    const state = dimeritiumState(actor, tokenOf(actor));
    if (!state && actor.statuses.has(DIMERITIUM_RESISTED)) await setStatus(actor, DIMERITIUM_RESISTED, false);
    if (!state?.touching || state.resisted) for (const id of DIMERITIUM_TABLE_STATES) if (actor.statuses.has(id)) await setStatus(actor, id, false);
  }
}

/** Endurance DC 16 against the dimeritium table. The rolled row replaces the row of an earlier half-hour check. */
export async function rollDimeritium(actor) {
  const { skillValue } = await import("../data/skills.mjs");
  const endurance = skillValue(actor.system, "endurance");
  const roll = await evaluateRoll(`1d10wc + ${endurance?.total ?? 0}`);
  const row = dimeritiumResult(roll.total);
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<section class="witcher-magic-chat"><h3>Двимерит · Стойкость СЛ 16</h3><p>Энергия снижена до 0, пока длится касание. Проверка повторяется каждые полчаса контакта.</p><p><strong>${roll.total}</strong>: ${row.text}</p></section>` });
  const { setStatus } = await import("../combat/status-effects.mjs");
  for (const id of DIMERITIUM_TABLE_STATES) if (id !== row.status) await setStatus(actor, id, false);
  if (row.status) await setStatus(actor, row.status, true);
  return row;
}

/** The < 10 row: 1d6 a turn while touching, unless resisted. Read by the start-turn damage step. */
export function dimeritiumBurnActive(actor, token = null) {
  if (!activeStatus(actor, "dimeritium-burn") || activeStatus(actor, "dead")) return false;
  const state = dimeritiumState(actor, token);
  return Boolean(state?.touching && !state.resisted);
}

/** Start of the adept's turn (active GM): spasms every 1d6 turns (Endurance DC 15 or staggered); agony each round. */
export async function dimeritiumTurn(combat, combatant, context) {
  const actor = combatant?.actor;
  if (!actor || game.user !== game.users.activeGM || !combat.started || context.skipped || context.round < 1 || activeStatus(actor, "dead")) return;
  const state = dimeritiumState(actor, combatant.token ?? null);
  if (!state?.touching || state.resisted) return;
  const messageMode = combatant.hidden ? "gm" : game.settings.get("core", "messageMode");
  const spasms = Array.from(actor.effects).find(effect => !effect.disabled && !effect.isSuppressed && effect.statuses?.has?.("dimeritium-spasms"));
  if (spasms) {
    const stored = spasms.flags?.[SYSTEM_ID]?.dimeritiumSpasms, next = stored?.combat === combat.uuid ? stored.round : null;
    if (next === null || context.round >= next) {
      const interval = (await evaluateRoll("1d6")).total;
      await spasms.update({ [`flags.${SYSTEM_ID}.dimeritiumSpasms`]: { combat: combat.uuid, round: context.round + interval } });
      // The first check comes after a full interval, like other periodic conditions.
      if (next !== null) {
        const { skillValue } = await import("../data/skills.mjs");
        const roll = await evaluateRoll(`1d10wc + ${skillValue(actor.system, "endurance")?.total ?? 0}`);
        const failed = roll.total < 15;
        await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
          flavor: `<section class="witcher-magic-chat"><h3>Двимерит: спазмы · Стойкость СЛ 15</h3><p><strong>${roll.total}</strong>: ${failed ? "спазм скручивает тело — персонаж ошеломлён." : "удалось перетерпеть."}</p></section>` }, { messageMode });
        if (failed) {
          const { applyWeaponConditions } = await import("../combat/weapon-hit-effects.mjs");
          await applyWeaponConditions(actor, [{ id: "staggered", applied: true }]);
        }
      }
    }
  }
  if (activeStatus(actor, "dimeritium-agony")) {
    const { rollStun } = await import("../combat/stun-roll.mjs");
    await rollStun(actor, { test: true, messageMode });
  }
}

/** Sweep after anything that can end an exposure: movement, dropping or unequipping metal, the zone expiring. */
export function registerDimeritiumResistance() {
  let timer = null;
  const sweep = () => {
    if (!game.users?.activeGM?.isSelf) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const actors = new Set(game.actors.filter(tracked));
      for (const scene of game.scenes) for (const token of scene.tokens)
        if (!token.actorLink && tracked(token.actor)) actors.add(token.actor);
      if (!actors.size) return;
      const { actorToken } = await import("../combat/environment.mjs");
      await clearEndedDimeritiumEffects(actors, actorToken).catch(error => console.error(`${SYSTEM_ID} | Dimeritium`, error));
    }, 300);
  };
  for (const hook of ["updateToken", "createToken", "deleteToken", "createItem", "updateItem", "deleteItem", "createActiveEffect", "deleteActiveEffect",
    "updateRegion", "deleteRegion", "updateCombat", "updateWorldTime"]) Hooks.on(hook, sweep);
}

/** What the magic tab shows: the exposure, why buttons are (not) there, and the active table row. */
export function dimeritiumBanner(actor, state) {
  if (!state) return null;
  const resistance = dimeritiumResistance(actor);
  const contactStatus = Boolean(actor.statuses?.has?.(DIMERITIUM_CONTACT));
  const worn = Array.from(actor.items ?? []).filter(item => isDimeritium(item) && item.system?.equipped).map(item => item.name);
  const row = DIMERITIUM_TABLE_STATES.find(id => activeStatus(actor, id));
  return { ...state, contactStatus, byItem: worn.join(", "), canTouch: !state.touching,
    tableRow: row ? TABLE_NAMES[row] : (activeStatus(actor, "nauseated") && state.touching ? "Тошнота" : ""),
    canResist: Boolean(resistance) && !state.resisted, resistBase: resistance?.base ?? 0,
    resistHint: !resistance && actor.system?.details?.profession === "mage" && !state.resisted
      ? "«Устойчивость к двимериту» (ветка Архимага) не изучена — проверка сопротивления недоступна." : "" };
}
