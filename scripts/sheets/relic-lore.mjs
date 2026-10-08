import { COMBAT_ACTOR_TYPES, SYSTEM_ID } from "../config.mjs";
import { relicLore } from "../data/relic-lore.mjs";
import { skillValue } from "../data/skills.mjs";
import { rollActionCheck } from "../combat/action-economy.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

const eligible = actor => actor?.isOwner && COMBAT_ACTOR_TYPES.includes(actor.type);
const pending = new WeakMap();

/** An owned item uses its wearer; a catalog item can be studied by a selected or assigned character. */
export async function chooseRelicScholar(item) {
  if (eligible(item.actor)) return item.actor;
  const selected = [...new Set((globalThis.canvas?.tokens?.controlled ?? []).map(token => token.actor).filter(eligible))];
  if (selected.length === 1) return selected[0];
  if (!selected.length && eligible(game.user.character)) return game.user.character;
  const actors = new Map([...Array.from(game.actors ?? []), ...(globalThis.canvas?.tokens?.placeables ?? []).map(token => token.actor)]
    .filter(eligible).map(actor => [actor.uuid, actor]));
  if (!actors.size) throw new Error("Нужен персонаж или существо под вашим управлением для проверки Образования.");
  if (actors.size === 1) return actors.values().next().value;
  const id = await foundry.applications.api.DialogV2.prompt({ window: { title: "Кто вспоминает легенду?" }, rejectClose: false,
    content: `<label>Персонаж<select name="actor">${[...actors].map(([id, actor]) => `<option value="${esc(id)}">${esc(actor.name)}</option>`).join("")}</select></label>`,
    ok: { label: "Бросить Образование", callback: (_event, button) => new FormData(button.form).get("actor") } });
  if (!id) return null;
  const actor = actors.get(id);
  if (!eligible(actor)) throw new Error("Выбранный персонаж больше недоступен.");
  return actor;
}

export function rollRelicLore(item, { actor = null } = {}) {
  if (pending.has(item)) return pending.get(item);
  const work = (async () => {
    const lore = relicLore(item);
    if (!lore || item.testUserPermission && !item.testUserPermission(game.user, "LIMITED")) return;
    actor ??= await chooseRelicScholar(item);
    if (!actor) return;
    if (!eligible(actor)) throw new Error("Нет права бросать за выбранного персонажа.");
    const skill = skillValue(actor.system, "education");
    if (skill.total === null) throw new Error("Заполните Интеллект персонажа.");
    return rollActionCheck(actor, { formula: `1d10wc + ${skill.total}`,
      flavor: `<h3>Легенда: ${esc(item.name)}</h3><p>Образование · СЛ ${lore.dc}</p>`,
      flags: { [SYSTEM_ID]: { relicLore: { itemUuid: item.uuid, ruleId: item.system.ruleId, dc: lore.dc },
        skillCheck: { key: "education", base: skill.total, level: skill.level, attribute: skill.attributeValue, bonus: skill.bonus } } } });
  })();
  pending.set(item, work);
  const clear = () => { if (pending.get(item) === work) pending.delete(item); };
  work.then(clear, clear);
  return work;
}

/** Recomputed on every render, including a later Luck adjustment. No permanent identification is invented. */
export function relicLoreResult(message) {
  const lore = message.flags?.[SYSTEM_ID]?.relicLore, total = message.rolls?.[0]?.total;
  if (!lore || !Number.isFinite(lore.dc) || message.isContentVisible === false || !Number.isFinite(total)) return "";
  return `<p class="witcher-relic-lore-result"><strong>${total >= lore.dc ? "Легенда вспомнилась" : "Не удалось вспомнить легенду"}: ${total} против СЛ ${lore.dc}.</strong></p>`;
}

export function registerRelicLore() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const result = relicLoreResult(message);
    if (!result) return;
    html.querySelector(".witcher-relic-lore-result")?.remove();
    // Keep the result with the dice, so Dice So Nice reveals both together.
    (html.querySelector(".dice-roll") ?? html.querySelector(".message-content") ?? html).insertAdjacentHTML("beforeend", result);
  });
}
