import { SYSTEM_ID } from "../config.mjs";
import { tokenGap } from "../combat/attack-target.mjs";
import { isPhysical } from "../data/physical-items.mjs";

// Core p.167 «Двимерит, погибель магов». Every unit of dimeritium within 5 m lowers a magic adept's Vigor by 1;
// touching it drops Vigor to 0 and calls for an Endurance check (DC 16) on the dimeritium table, repeated
// every half hour of contact. Witchers are not magic adepts (p.166 sidebar) and are not affected.
export const DIMERITIUM_RANGE = 5;
export const DIMERITIUM_CONTACT = "dimeritium-contact";
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
    if (other === token || !other.actor || other.actor === actor) continue;
    const metal = Array.from(other.actor.items ?? []).filter(item => isDimeritium(item) && carried(item));
    if (!metal.length) continue;
    const gap = tokenGap(token, other);
    if (gap != null && gap <= DIMERITIUM_RANGE) nearby += metal.reduce((sum, item) => sum + units(item), 0);
  }
  return nearby || touching ? { nearby, touching } : null;
}

/** Vigor modifiers for deriveStatistics. */
export function dimeritiumModifiers(state) {
  if (!state) return [];
  const label = { source: "dimeritium", category: "environment" };
  if (state.touching) return [{ target: "vigor", value: -1000, label: "Касание двимерита: Энергия 0", ...label }];
  return [{ target: "vigor", value: -state.nearby, label: `Двимерит в пределах 5 м (${state.nearby})`, ...label }];
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
