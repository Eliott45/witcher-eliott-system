import { SYSTEM_ID } from "../config.mjs";
import { isCarried } from "../data/containers.mjs";
import { skillValue } from "../data/skills.mjs";
import { GWENT_MAX_FORGERIES, clamp } from "./gwent-rules.mjs";

const isDeck = item => item?.system?.ruleId === "gear.gwent-deck";
const forgeriesOf = item => (item.flags?.[SYSTEM_ID]?.gwent?.forgeries ?? []).map(Number).filter(Number.isFinite);
/** Sheet context for a gwent deck: rarity (set by the GM) and the forged cards hidden in it. */
export function gwentDeckContext(item) {
  if (!isDeck(item)) return null;
  const quality = clamp(item.flags?.[SYSTEM_ID]?.gwent?.quality, 0, 3), forgeries = forgeriesOf(item);
  return { quality, isGM: game.user.isGM, qualities: [0, 1, 2, 3].map(value => ({ value, label: value ? `+${value} — редкие карты` : "Обычная колода", selected: value === quality })),
    forgeries: forgeries.length, forgeryDcs: forgeries.join(", "), canForge: Boolean(item.actor) && forgeries.length < GWENT_MAX_FORGERIES, max: GWENT_MAX_FORGERIES };
}
/** «Поддельная карта»: writing kit, three hours and a Forgery check; its result is the DC to spot it. */
export async function forgeGwentCard(item) {
  const actor = item?.actor;
  if (!isDeck(item) || !actor?.isOwner) throw new Error("Нужна колода для гвинта у вашего персонажа.");
  if (!isCarried(item)) throw new Error("Колода должна быть при себе.");
  if (!actor.items.some(entry => entry.system.ruleId === "gear.writing-kit" && entry.system.quantity > 0 && isCarried(entry))) throw new Error("Нужны письменные принадлежности при себе.");
  const forgeries = forgeriesOf(item);
  if (forgeries.length >= GWENT_MAX_FORGERIES) throw new Error(`В колоде уже ${GWENT_MAX_FORGERIES} поддельные карты — больше бонуса они не дадут.`);
  const skill = skillValue(actor.system, "forgery");
  if (skill?.total == null) throw new Error("Заполните характеристики персонажа.");
  const roll = await new Roll(`1d10wc + ${skill.total}`).evaluate();
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<h3>Поддельная карта гвинта · ${item.name}</h3><p>Три часа с письменными принадлежностями. Карта даёт +1 к гвинту (не больше +${GWENT_MAX_FORGERIES}). Чтобы её заметить, нужна проверка Внимания СЛ ${roll.total}.</p>` }, { rollMode: "gmroll" });
  await item.update({ [`flags.${SYSTEM_ID}.gwent.forgeries`]: [...forgeries, roll.total] });
}
export async function discardGwentForgeries(item) {
  if (!isDeck(item) || !item.isOwner) return;
  await item.update({ [`flags.${SYSTEM_ID}.gwent.forgeries`]: [] });
}
