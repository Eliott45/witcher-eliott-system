import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";

export async function professionItemData(definition, level) {
  const source = await foundry.utils.fromUuid(`Compendium.${SYSTEM_ID}.abilities.Item.${definition.documentId}`);
  const data = source ? source.toObject() : { name: definition.name, type: "ability", img: "icons/svg/book.svg",
    system: { ruleId: definition.id, description: `<p>${escapeTooltip(definition.description)}</p>`, attribute: definition.attribute } };
  delete data._id;
  delete data.folder;
  data.system.level = level;
  return data;
}
