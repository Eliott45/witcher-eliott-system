export const SYSTEM_ID = "witcher-eliott-system";
export const ROUND_SECONDS = 3;
export const INITIATIVE_FORMULA = "1d10 + @statistics.initiative";
export const VISION_ANGLE = 360;
export const PREVIEW_VISION_ANGLE = 180;
// Core p. 152 illustrates a quarter-circle; p. 79 specifies a forward cone without a numeric angle.
// TODO (RAW): adjust if an official clarification gives a different angle.
export const RESTRICTED_VISION_ANGLE = 90;
export const COMBAT_ACTOR_TYPES = ["character", "npc"];
export const ACTOR_TYPES = [...COMBAT_ACTOR_TYPES, "services", "powerPlace"];
export const ITEM_TYPES = ["race", "ability", "origin", "familyStatus", "equipment", "influence", "language", "profession", "weapon", "armor", "recipe", "spell", "effect"];
