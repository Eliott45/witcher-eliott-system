import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { scatterOffset } from "../canvas/scatter-overlay.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Items on the ground and in chests are "loot" actors. Players cannot create tokens or change actors they
// do not own, so taking and dropping go through a request flag on their own actor that the active GM runs.

export const LOOT_IMG = "icons/svg/item-bag.svg";
const REQUEST = "lootRequest";

/** The character receiving taken items: a controlled token the user owns, else their assigned character. */
export function receiverActor() {
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(token => token.actor).find(actor => actor?.isOwner && COMBAT_ACTOR_TYPES.includes(actor.type));
  return controlled ?? game.user.character ?? null;
}

const itemSource = (item, quantity) => {
  const data = item.toObject();
  delete data._id;
  Object.assign(data.system, { quantity, equipped: false, containerId: "", carried: true });
  return data;
};

/** One shared, unlinked base actor for dropped piles; players may observe it to open a pile. */
async function lootTemplate() {
  const existing = game.actors.find(actor => actor.type === "loot" && actor.flags?.[SYSTEM_ID]?.lootTemplate);
  if (existing) return existing;
  return foundry.documents.Actor.implementation.create({ name: "Добыча", type: "loot", img: LOOT_IMG,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }, system: { removeWhenEmpty: true },
    flags: { [SYSTEM_ID]: { lootTemplate: true } },
    prototypeToken: { name: "Добыча", actorLink: false, texture: { src: LOOT_IMG }, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
      sight: { enabled: false }, displayName: CONST.TOKEN_DISPLAY_MODES.HOVER, width: 0.5, height: 0.5 } });
}

/** GM: put items on the ground at a scene point, adding to a pile already lying in that grid cell. */
export async function placeOnGround(scene, point, items, name = "Добыча") {
  const size = scene.grid.size, x = Math.floor(point.x / size) * size, y = Math.floor(point.y / size) * size;
  const pile = scene.tokens.find(token => token.actor?.type === "loot" && token.actor.system.removeWhenEmpty
    && Math.floor(token.x / size) * size === x && Math.floor(token.y / size) * size === y);
  if (pile) {
    await pile.actor.createEmbeddedDocuments("Item", items);
    if (pile.name !== "Добыча" && !items.every(item => item.name === pile.name)) await pile.update({ name: "Добыча" });
    return pile;
  }
  const template = await lootTemplate();
  const data = (await template.getTokenDocument({ x: x + size / 4, y: y + size / 4, name })).toObject();
  const [token] = await scene.createEmbeddedDocuments("Token", [data]);
  await token.actor.createEmbeddedDocuments("Item", items);
  return token;
}

/** Point one grid step in front of a token: where its dropped item lands. */
export function frontOf(token) {
  const size = token.parent.grid.size, { width, height } = token.getSize(), offset = scatterOffset(3, token.rotation, size);
  return { x: token.x + width / 2 + offset.x, y: token.y + height / 2 + offset.y };
}

/** Send a take/drop request, or run it at once for the GM. */
export async function requestLoot(actor, request) {
  if (!actor?.isOwner) throw new Error("Нет прав на этого персонажа.");
  if (game.user.isGM) return processLootRequest(actor, request, game.user);
  if (!game.users.activeGM) throw new Error("Нужен подключённый мастер.");
  if (actor.flags?.[SYSTEM_ID]?.[REQUEST]) throw new Error("Предыдущий запрос ещё обрабатывается.");
  return actor.update({ [`flags.${SYSTEM_ID}.${REQUEST}`]: { ...request, id: foundry.utils.randomID(), requester: game.user.id } });
}

async function reduce(owner, item, quantity) {
  if ((item.system.quantity ?? 1) <= quantity) await item.delete();
  else await item.update({ "system.quantity": item.system.quantity - quantity });
}

/** Active GM (or a GM acting directly): validate and perform one request. */
export async function processLootRequest(actor, request, user) {
  if (!actor.testUserPermission(user, "OWNER")) throw new Error("Нет прав на этого персонажа.");
  if (request.action === "drop") {
    const item = actor.items.get(request.itemId), scene = game.scenes.get(request.scene), quantity = Math.max(1, Math.floor(request.quantity ?? 1));
    if (!item || !isPhysical(item) || !scene) throw new Error("Предмет или сцена недоступны.");
    if (actor.items.some(other => other.system?.containerId === item.id)) throw new Error("Сначала выложите вещи из контейнера.");
    const amount = Math.min(quantity, item.system.quantity ?? 1);
    await placeOnGround(scene, request.point, [itemSource(item, amount)], item.name);
    await reduce(actor, item, amount);
    return chat(actor, `${actor.name} бросает на землю: ${item.name}${amount > 1 ? ` ×${amount}` : ""}.`, request.silent);
  }
  if (request.action === "take" || request.action === "crowns") {
    // A pile is a token (synthetic actor); a GM's chest may also be a world actor.
    const document = fromUuidSync(request.loot), loot = document?.actor ?? document, token = document?.actor ? document : null;
    if (loot?.type !== "loot") throw new Error("Добыча больше недоступна.");
    if (request.action === "crowns") {
      const crowns = loot.system.crowns ?? 0;
      if (!crowns) return;
      await loot.update({ "system.crowns": 0 });
      await actor.update({ "system.crowns": (actor.system.crowns ?? 0) + crowns });
      await chat(actor, `${actor.name} забирает ${crowns} крон.`);
    } else {
      const item = loot.items.get(request.itemId);
      if (!item) throw new Error("Этого предмета уже нет.");
      const amount = Math.min(Math.max(1, Math.floor(request.quantity ?? 1)), item.system.quantity ?? 1);
      await actor.createEmbeddedDocuments("Item", [itemSource(item, amount)]);
      await reduce(loot, item, amount);
      await chat(actor, `${actor.name} забирает: ${item.name}${amount > 1 ? ` ×${amount}` : ""}.`);
    }
    if (loot.system.removeWhenEmpty && !(loot.items.size ?? loot.items.length) && !(loot.system.crowns > 0) && token?.parent) await token.delete();
  }
}

const chat = (actor, text, silent = false) => silent ? null : foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
  content: `<p class="witcher-loot-note"><i class="fa-solid fa-sack"></i> ${esc(text)}</p>`, flags: { [SYSTEM_ID]: { skipLuck: true } } });

/** Drop an owned item in front of the actor's token (inventory button). */
export async function dropItemToGround(actor, item, { quantity = null, point = null, silent = false } = {}) {
  const token = actor.token ?? actor.getActiveTokens?.()[0]?.document;
  const scene = token?.parent ?? globalThis.canvas?.scene;
  if (!scene) throw new Error("Откройте сцену, чтобы бросить предмет.");
  let amount = quantity ?? 1;
  if (quantity == null && (item.system.quantity ?? 1) > 1) {
    amount = await foundry.applications.api.DialogV2.prompt({ window: { title: `На землю: ${item.name}` },
      content: `<label>Сколько бросить (из ${item.system.quantity})<input type="number" name="quantity" min="1" max="${item.system.quantity}" value="${item.system.quantity}" autofocus></label>`,
      ok: { label: "Бросить", callback: (_event, button) => Number(button.form.elements.quantity.value) }, rejectClose: false });
    if (!amount) return;
  }
  const where = point ?? (token ? frontOf(token) : { x: scene.dimensions.width / 2, y: scene.dimensions.height / 2 });
  return requestLoot(actor, { action: "drop", itemId: item.id, quantity: amount, scene: scene.id, point: where, silent });
}

export function registerLoot() {
  Hooks.on("updateActor", (actor, changes) => {
    const request = foundry.utils.getProperty(changes, `flags.${SYSTEM_ID}.${REQUEST}`);
    if (!request || !game.users.activeGM?.isSelf) return;
    const user = game.users.get(request.requester);
    processLootRequest(actor, request, user).catch(async error => {
      console.error(`${SYSTEM_ID} | Loot`, error);
      await foundry.documents.ChatMessage.create({ content: `<p>${esc(error.message)}</p>`, whisper: [request.requester], flags: { [SYSTEM_ID]: { skipLuck: true } } });
    }).finally(() => actor.update({ [`flags.${SYSTEM_ID}.${REQUEST}`]: null }));
  });
  // Drag an item from an inventory onto the map: it lands where it was dropped.
  Hooks.on("dropCanvasData", (canvasRef, data) => {
    if (data.type !== "Item" || !data.uuid) return;
    const item = fromUuidSync(data.uuid), actor = item?.parent;
    if (!actor || actor.type === "loot" || !isPhysical(item) || !actor.isOwner) return;
    dropItemToGround(actor, item, { point: { x: data.x, y: data.y } }).catch(error => ui.notifications.warn(error.message));
    return false;
  });
}
