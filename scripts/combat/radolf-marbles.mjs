import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { isCarried } from "../data/containers.mjs";
import { skillValue } from "../data/skills.mjs";
import { creatureProfile, creatureMovementMode } from "../data/creature-modes.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { attackerToken, tokenCenter } from "./attack-target.mjs";
import { actionQuote, actionUpdate } from "./action-economy.mjs";
import { creaturePost, activeCreatureGM, pickCreaturePoint } from "./creature-actions-common.mjs";
import { knockProne } from "./brawling.mjs";

const quadrupeds = new Set(["wolf", "warg", "cat", "dog", "horse", "war-horse", "ox", "mule", "griffin", "fiend", "barghest", "barghest-leader", "kai"]);
export const FOOTING_CHOICES = [{ id: "auto", name: "По профилю бестиария" }, { id: "ordinary", name: "Обычная · СЛ 14" },
  { id: "quadruped", name: "Четыре ноги · СЛ 12" }, { id: "legless", name: "Без ног · иммунитет" }];
export function marblesDC(actor) {
  const mode = actor.system?.creature?.footing ?? "auto", profile = creatureProfile(actor)?.id;
  const legs = mode !== "auto" ? mode : profile === "snake" ? "legless" : quadrupeds.has(profile) ? "quadruped" : "ordinary";
  if (legs === "legless" || creatureMovementMode(actor) === "flying" || immuneToCondition(actor, ["prone"])) return null;
  return legs === "quadruped" ? 12 : 14;
}
export const isMarbleRegion = region => Boolean(region.flags?.[SYSTEM_ID]?.marbles);

/** Includes movement within and all the way across a region, rather than just its final point. */
export function crossesMarbles(region, from, to, elevation = 0) {
  if (from.x === to.x && from.y === to.y) return false;
  if (Math.abs(elevation - (region.flags?.[SYSTEM_ID]?.marbles?.elevation ?? 0)) > .01) return false;
  const shape = region.shapes[0];
  if (!(shape?.radiusX > 0 && shape.radiusY > 0)) return false;
  const a = { x: (from.x - shape.x) / shape.radiusX, y: (from.y - shape.y) / shape.radiusY };
  const b = { x: (to.x - shape.x) / shape.radiusX, y: (to.y - shape.y) / shape.radiusY };
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length)) : 0;
  return (a.x + t * dx) ** 2 + (a.y + t * dy) ** 2 <= 1;
}

export async function scatterMarbles(actor, item, { point = null, diameter = null } = {}) {
  if (!actor?.isOwner || item?.system?.ruleId !== "radolf.marbles") return;
  if (!activeCreatureGM()) throw new Error("Область с шариками размещает активный ведущий.");
  const token = attackerToken(actor), scene = token.parent;
  if (diameter === null) diameter = await foundry.applications.api.DialogV2.prompt({ window: { title: "Рассыпать шарики" },
    content: '<p>Книга задаёт область 2 м без уточнения радиуса. По умолчанию это поперечник; ведущий может изменить размер.</p><label>Поперечник, м <input name="diameter" type="number" min="0.1" max="100" step="0.1" value="2"></label>',
    ok: { label: "Выбрать место", callback: (_event, button) => Number(new FormData(button.form).get("diameter")) }, rejectClose: false });
  if (diameter === null || diameter === false) return;
  if (!Number.isFinite(diameter) || diameter <= 0 || diameter > 100) throw new Error("Укажите поперечник от 0,1 до 100 м.");
  point = await pickCreaturePoint(token, { destination: point, max: Infinity, title: "Выберите центр области с шариками" });
  if (!point) return;
  return inventoryWrite(actor, async () => {
    const action = actionQuote(actor);
    if (!isCarried(item, actor.items) || item.system.quantity < 1) throw new Error("Мешочка с шариками нет при себе.");
    const radius = diameter / 2 / scene.grid.distance * scene.grid.size;
    const [region] = await scene.createEmbeddedDocuments("Region", [{ name: "Рассыпанные шарики · Атлетика", color: "#b6a275", visibility: 2,
      shapes: [{ type: "ellipse", x: point.x, y: point.y, radiusX: radius, radiusY: radius, rotation: 0, hole: false, gridBased: false }],
      flags: { [SYSTEM_ID]: { marbles: { elevation: token.elevation ?? 0 } } } }]);
    try { await actor.update({ ...actionUpdate(actor, action), items: [{ _id: item.id, "system.quantity": item.system.quantity - 1 }] }); }
    catch (error) { await region.delete(); throw error; }
    return region;
  });
}

export async function rollMarbles(actor) {
  const dc = marblesDC(actor);
  if (dc === null || actor.statuses?.has("prone") || actor.statuses?.has("dead")) return null;
  const skill = skillValue(actor.system, "athletics");
  if (skill?.total == null) throw new Error(`Заполните Ловкость: ${actor.name}.`);
  const roll = await evaluateRoll(`1d10wc + ${skill.total}`), success = roll.total >= dc;
  await creaturePost(actor, { title: "Шарики · удержаться на ногах", rolls: [roll],
    text: `Атлетика ${roll.total} против СЛ ${dc}: ${success ? "устоял" : "поскользнулся и упал ничком"}.` });
  if (!success) await knockProne(actor);
  return success;
}

export function registerRadolfMarbles() {
  const positions = new Map();
  // preUpdateToken only runs on the moving user's client. Cache on every client so a GM
  // also sees the start of a player's movement and can take over after another GM leaves.
  const remember = token => positions.set(token.uuid, tokenCenter(token));
  Hooks.once("ready", () => { for (const scene of game.scenes) for (const token of scene.tokens) remember(token); });
  Hooks.on("createToken", remember);
  Hooks.on("deleteToken", token => positions.delete(token.uuid));
  Hooks.on("updateToken", async (token, changes, options) => {
    const from = positions.get(token.uuid); remember(token);
    if (!activeCreatureGM() || !("x" in changes || "y" in changes)) return;
    if (!from || !COMBAT_ACTOR_TYPES.includes(token.actor?.type) || options?.teleport) return;
    if (!Array.from(token.parent.regions).some(region => isMarbleRegion(region) && crossesMarbles(region, from, tokenCenter(token), token.elevation))) return;
    try { await inventoryWrite(token.actor, () => rollMarbles(token.actor)); }
    catch (error) { ui.notifications.warn(error.message); }
  });
}
