import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { critText } from "./tavern-dice.mjs";

/** Helpers shared by every tavern game's GM-side logic. */
export { esc };
export const gmIds = () => game.users.filter(user => user.isGM).map(user => user.id);
export const documentClass = () => foundry.documents.ChatMessage.implementation;
export const messageSource = flags => ({ author: game.user.id, style: CONST.CHAT_MESSAGE_STYLES.OTHER, flags: { [SYSTEM_ID]: { skipLuck: true, ...flags } } });
export const actorOf = seat => seat?.actorUuid ? game.actors.find(actor => actor.uuid === seat.actorUuid) ?? null : null;
export const skillTotal = (actor, key) => { try { const total = actor ? skillValue(actor.system, key)?.total : null; return Number.isFinite(total) ? total : null; } catch { return null; } };
export const crit = check => check?.faces?.length > 1 ? ` (${critText(check.faces)})` : "";
/** A note only the GMs see: hidden checks and cheating details. */
export function gmNote(title, body) {
  return documentClass().create({ ...messageSource({ pokerNote: true }), whisper: gmIds(), blind: true,
    content: `<section class="witcher-poker-card is-note"><h3><i class="fa-solid fa-mask"></i> ${title}</h3>${body}</section>` });
}
