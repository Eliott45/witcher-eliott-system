import { SYSTEM_ID } from "../config.mjs";
import { RANDOM_LOOT_LABELS } from "../data/random-loot.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "../workshop/transaction.mjs";
import { rollPersonalBelongings } from "../loot/personal-belongings.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

const RECIPIENT_TYPES = ["character", "npc", "loot"];

/** World characters, NPCs and loot containers, plus unlinked tokens on the current scene. */
function recipients() {
  const choices = new Map(game.actors.filter(actor => RECIPIENT_TYPES.includes(actor.type)).map(actor => [actor.uuid, { actor, name: actor.name }]));
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (token.actor && !token.document.actorLink && RECIPIENT_TYPES.includes(token.actor.type)) choices.set(token.actor.uuid, { actor: token.actor, name: `${token.name} · токен` });
  }
  return [...choices.entries()].map(([id, { actor, name }]) => ({ id, actor, name }));
}

export function belongingsCard(category, results, items, recipient) {
  const rows = results.map(({ roll, name }) => `<li><b>${roll}</b> — ${esc(name)}</li>`).join("");
  const summary = items.map(item => `${esc(item.name)}${item.system.quantity > 1 ? ` ×${item.system.quantity}` : ""}`).join(", ");
  return `<section class="witcher-foraging-card witcher-belongings-card"><h3><i class="fa-solid fa-sack-xmark" aria-hidden="true"></i> Случайные личные вещи · ${esc(RANDOM_LOOT_LABELS[category].toLowerCase())}</h3>`
    + `<ul>${rows || "<li>Ни одной вещи.</li>"}</ul>${items.length ? `<p>${recipient ? `Получает <b>${esc(recipient.name)}</b>` : "Итог"}: ${summary}.</p>` : ""}</section>`;
}

/** GM tool (core p.223): roll the chosen column any number of times and optionally hand the result to an actor. */
export async function openPersonalBelongings() {
  if (!game.user.isGM) throw new Error("Бросок по таблице личных вещей делает ведущий.");
  const actors = recipients();
  const selected = globalThis.canvas?.tokens?.controlled?.[0]?.actor?.uuid;
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/personal-belongings.hbs`, {
    categories: Object.entries(RANDOM_LOOT_LABELS).map(([id, label]) => ({ id, label })),
    actors: actors.map(entry => ({ id: entry.id, name: entry.name, selected: entry.id === selected }))
  });
  const answer = await foundry.applications.api.DialogV2.prompt({ classes: ["witcher-foraging-dialog"], window: { title: "Случайные личные вещи", resizable: true },
    position: { width: 560 }, content, rejectClose: false,
    ok: { label: "Бросить", callback: (_event, button) => Object.fromEntries(new FormData(button.form)) } });
  if (!answer) return null;
  if (!RANDOM_LOOT_LABELS[answer.category]) throw new Error("Выберите таблицу.");
  const recipient = actors.find(entry => entry.id === answer.recipient)?.actor ?? null;
  const mode = game.settings.get("core", "messageMode"), rolls = [];
  const roll = async formula => {
    const result = await new foundry.dice.Roll(formula).evaluate({ allowInteractive: mode !== "blind" });
    if (!Number.isFinite(result.total)) throw new Error("Некорректная формула количества.");
    rolls.push(result);
    return Math.floor(result.total);
  };
  const quantity = await roll(String(answer.formula || "1").trim() || "1");
  if (quantity < 0 || quantity > 100) throw new Error("Количество вещей должно быть от 0 до 100.");
  const { items, results } = await rollPersonalBelongings(answer.category, quantity, () => roll("1d100"));
  const display = trackRollDisplay();
  try {
    const message = await foundry.documents.ChatMessage.implementation.create(foundry.documents.ChatMessage.implementation.applyMode({
      speaker: recipient ? foundry.documents.ChatMessage.implementation.getSpeaker({ actor: recipient }) : { alias: "Случайные личные вещи" },
      rolls: rolls.filter(entry => entry.dice.length), content: belongingsCard(answer.category, results, items, recipient),
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true } } }, mode));
    if (message) await display.wait(message);
  } finally { display.close(); }
  if (recipient && items.length) await inventoryWrite(recipient, () => inventoryTransaction(recipient, { creates: items }));
  return { items, results, recipient };
}

export function registerPersonalBelongings() {
  game.system.api = { ...game.system.api, personalBelongings: async () => {
    try { return await openPersonalBelongings(); }
    catch (error) { console.error(error); ui.notifications.warn(error.message); }
  } };
}
