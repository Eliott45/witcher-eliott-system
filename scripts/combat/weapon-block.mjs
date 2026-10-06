import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { actionQuote, actionUpdate, actionNote } from "./action-economy.mjs";

/** Pulling a stuck weapon free costs the action (an extra action pays 3 STA as usual). */
export async function freeStuckWeapon(actor, effect) {
  const block = effect.flags?.[SYSTEM_ID]?.weaponBlock;
  if (!actor.isOwner || block?.reason !== "stuck") return;
  const action = actionQuote(actor), item = actor.items.get(block.itemId);
  await effect.delete();
  const update = actionUpdate(actor, action);
  if (Object.keys(update).length) await actor.update(update);
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    content: `<p>${esc(actor.name)} достаёт застрявшее оружие${item ? `: ${esc(item.name)}` : ""}. Действие потрачено.</p>${actionNote(action)}`,
    flags: { [SYSTEM_ID]: { skipLuck: true } } });
}
