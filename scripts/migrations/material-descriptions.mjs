import { materialProse, legacyMaterialProse, MATERIAL_LOCATION_CORRECTIONS } from "../data/material-descriptions.mjs";

export function materialDescriptionUpdate(item) {
  if (item.type !== "equipment" || item.system?.kind !== "material" || !item.system.ruleId?.startsWith("material.")) return {};
  const update = {}, description = item.system.description?.trim() ?? "";
  const expected = materialProse(item);
  if ((!description || description === legacyMaterialProse(item.system)) && description !== expected) update["system.description"] = expected;
  const location = MATERIAL_LOCATION_CORRECTIONS[item.system.ruleId];
  if (location && item.system.material?.location === "Покупается или изготавливается") update["system.material.location"] = location;
  return update;
}
