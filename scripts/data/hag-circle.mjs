import { SYSTEM_ID } from "../config.mjs";

export const isGraveHag = actor => Array.from(actor.items ?? []).some(item => item.type === "ability" && item.system.ruleId?.startsWith("creature.grave-hag."));
export function hagCircleActive(actor) {
  const circle = actor.flags?.[SYSTEM_ID]?.hagCircle;
  if (!circle || !isGraveHag(actor)) return false;
  const token = actor.token ?? actor.getActiveTokens?.()[0]?.document;
  if (!token?.parent || token.parent.id !== circle.scene) return false;
  const grid = token.parent.grid, x = token.x + (token.width ?? 1) * grid.size / 2, y = token.y + (token.height ?? 1) * grid.size / 2;
  return Math.hypot(x - circle.x, y - circle.y) / grid.size * grid.distance <= 100;
}
export function hagModifiers(actor) {
  if (!hagCircleActive(actor)) return [];
  return [...Object.keys(actor.system.skills ?? {}).map(key => ({ target: `skills.${key}`, value: 3 })), { target: "attributeCheck", value: 3 }]
    .map(modifier => ({...modifier, source:"creature.skull-circle", label:"Круг из черепов", category:"creature"}));
}
