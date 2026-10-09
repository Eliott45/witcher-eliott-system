import { materialProse, legacyMaterialProse, MATERIAL_LOCATION_CORRECTIONS } from "../data/material-descriptions.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";

const GENERIC_MATERIAL = "<p>Материал для изготовления ремесленных изделий.</p>";

export function materialDescriptionUpdate(item) {
  if (item.type !== "equipment" || item.system?.kind !== "material" || !item.system.ruleId?.startsWith("material.")) return {};
  const update = {}, description = item.system.description?.trim() ?? "";
  const expected = materialProse(item);
  // The generic line was shipped before a material got its own prose (dimeritium, core p.167).
  // The oldest worlds stored only the page citation («Базовая книга, стр. 128–129»).
  const citationOnly = description && !stripPageReferences(description).replace(/<[^>]*>/g, "").trim();
  if ((!description || citationOnly || description === legacyMaterialProse(item.system) || description === GENERIC_MATERIAL) && description !== expected) update["system.description"] = expected;
  const location = MATERIAL_LOCATION_CORRECTIONS[item.system.ruleId];
  // Supplied Russian core p. 144 prints У (unique), not Р (rare).
  if (item.system.ruleId === "material.water-essence" && item.system.rarity === "rare") update["system.rarity"] = "unique";
  if (location && item.system.material?.location === "Покупается или изготавливается") update["system.material.location"] = location;
  return update;
}
