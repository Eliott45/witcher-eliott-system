import { equippedItems } from "./physical-items.mjs";

// Existing catalog IDs survive renaming and copies imported before visor support.
const VISOR_HELMETS = new Set(["armor.head.6", "armor.head.7", "armor.head.8", "armor.head.9"]);
export const ENHANCED_SENSES = "witcher.enhanced-senses";

export function supportsVisor(item) {
  return item?.type === "armor" && ["head", "all"].includes(item.system.zone)
    && (VISOR_HELMETS.has(item.system.ruleId)
      || /ограничени[ея] зрения|ограниченный обзор|restricted vision/iu.test(item.system.properties ?? ""));
}

export const restrictedVision = items => equippedItems(items).some(item => supportsVisor(item) && item.system.visorDown);
export const witcherSensesSuppressed = (details, items) => details.race === "witcher" && restrictedVision(items);
