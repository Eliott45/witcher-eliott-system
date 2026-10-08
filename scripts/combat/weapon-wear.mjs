import { SYSTEM_ID } from "../config.mjs";
import { installedRune } from "../data/rune-glyphs.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

/** One Chernobog save per damage event, not per lost reliability point. */
export async function quoteWeaponWear(item, amount, { roll = null, messageMode = game.settings.get("core", "messageMode") } = {}) {
  const from = Number(item.system.reliability?.value ?? 0), damage = Math.max(0, Number(amount) || 0);
  if (from > 0 && damage > 0 && installedRune(item, "chernobog"))
    roll ??= await new foundry.dice.Roll("1d6").evaluate({ allowInteractive: messageMode !== "blind" });
  const protectedByRune = Boolean(installedRune(item,"chernobog") && from>0 && damage>0 && roll && roll.total >= 4);
  return { from, to: Math.max(0, from - (protectedByRune ? 0 : damage)), damage, protectedByRune, roll };
}

/** Use for blocks, fumbles, fire, and crafting mishaps; a manual condition edit is not a damage event. */
export async function applyWeaponWear(item, amount, options = {}) {
  const result = await quoteWeaponWear(item, amount, options);
  if (result.roll) await result.roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: item.actor }),
    flavor: `<p>Чернобог · ${esc(item.name)}: ${result.protectedByRune ? "руна отменяет повреждение оружия" : "руна не защитила оружие"} (4–6 на d6).</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, weaponWear: { itemUuid: item.uuid, from: result.from, to: result.to } } } },
    { messageMode: options.messageMode ?? game.settings.get("core", "messageMode") });
  if (result.to !== result.from) await item.update({ "system.reliability.value": result.to });
  return result;
}
