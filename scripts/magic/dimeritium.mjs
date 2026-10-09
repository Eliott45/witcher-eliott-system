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
  { min: 14, text: "Кожа чешется, подташнивает, тело периодически скручивают спазмы: каждые 1d6 ходов — Стойкость СЛ 15, иначе ошеломление." },
  { min: 12, text: "Кожа горит, желудок крутит: тошнота.", status: "nausea" },
  { min: 10, text: "Кожа словно в огне, едва может сосредоточиться: испытание Устойчивости каждый раунд." },
  { min: -Infinity, text: "Двимерит возжигает магию в теле: 1d6 урона каждый раунд, пока касается двимерита.", damage: "1d6" }
];
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
  const roll = await new foundry.dice.Roll(`1d10wc + ${ability.base}`).evaluate();
  const success = roll.total >= DIMERITIUM_RESISTANCE_DC;
  const outcome = success
    ? "Успех: кружится голова и мучает дискомфорт, но маг сохраняет половину Энергии и может сотворять заклинания, пока длится это воздействие."
    : `Провал: двимерит действует как обычно.${state.touching ? " Пройдите Стойкость СЛ 16 по таблице двимерита." : ""}`;
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<section class="witcher-magic-chat"><h3>Устойчивость к двимериту · СЛ ${DIMERITIUM_RESISTANCE_DC}</h3><p>ВОЛЯ ${ability.attribute} + уровень ${ability.level}${ability.bonus ? ` + ${ability.bonus}` : ""}</p><p><strong>${roll.total}</strong>: ${outcome}</p></section>` });
  if (success) {
    const { setStatus } = await import("../combat/status-effects.mjs");
    await setStatus(actor, DIMERITIUM_RESISTED, true);
  }
  return success;
}

/** Active GM: an exposure ended, so the next one needs a fresh check (core p.66). */
export async function clearEndedDimeritiumResistance(actors, tokenOf) {
  const { setStatus } = await import("../combat/status-effects.mjs");
  for (const actor of actors) {
    if (actor?.statuses?.has?.(DIMERITIUM_RESISTED) && !dimeritiumState(actor, tokenOf(actor))) await setStatus(actor, DIMERITIUM_RESISTED, false);
  }
}

/** Endurance DC 16 against the dimeritium table; nausea is applied, the rest is described. */
export async function rollDimeritium(actor) {
  const { skillValue } = await import("../data/skills.mjs");
  const endurance = skillValue(actor.system, "endurance");
  const roll = await new foundry.dice.Roll(`1d10wc + ${endurance?.total ?? 0}`).evaluate();
  const row = dimeritiumResult(roll.total);
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<section class="witcher-magic-chat"><h3>Двимерит · Стойкость СЛ 16</h3><p>Энергия снижена до 0, пока длится касание. Проверка повторяется каждые полчаса контакта.</p><p><strong>${roll.total}</strong>: ${row.text}</p></section>` });
  if (row.status) {
    const { setStatus } = await import("../combat/status-effects.mjs");
    await setStatus(actor, row.status, true);
  }
  return row;
}

/** Sweep after anything that can end an exposure: movement, dropping or unequipping metal, the zone expiring. */
export function registerDimeritiumResistance() {
  let timer = null;
  const sweep = () => {
    if (!game.users?.activeGM?.isSelf) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const actors = new Set(game.actors.filter(actor => actor.statuses?.has?.(DIMERITIUM_RESISTED)));
      for (const scene of game.scenes) for (const token of scene.tokens)
        if (!token.actorLink && token.actor?.statuses?.has?.(DIMERITIUM_RESISTED)) actors.add(token.actor);
      if (!actors.size) return;
      const { actorToken } = await import("../combat/environment.mjs");
      await clearEndedDimeritiumResistance(actors, actorToken).catch(error => console.error(`${SYSTEM_ID} | Dimeritium resistance`, error));
    }, 300);
  };
  for (const hook of ["updateToken", "createToken", "deleteToken", "createItem", "updateItem", "deleteItem", "deleteActiveEffect",
    "updateRegion", "deleteRegion", "updateCombat", "updateWorldTime"]) Hooks.on(hook, sweep);
}
