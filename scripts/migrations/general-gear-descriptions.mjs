import { generalGearContent } from "../data/general-gear.mjs";
import { CORE_CONTAINERS } from "../data/core-containers.mjs";

const STOCK_SOURCES = ["Базовая книга, стр. 92–93", "Базовая книга, стр. 93, 95"];
// Exact original shipped prose, in both supported languages; never match arbitrary player notes.
const LEGACY_PROSE = {
  "musical-instrument": ["Инструмент, доставшийся персонажу благодаря жизни среди артистов. Конкретный вид выбирает игрок.", "An instrument inherited from a life among performers. The player chooses its specific kind."],
  "sacred-symbol": ["Символ веры Великого Солнца, полученный благодаря воспитанию среди высшего духовенства.", "A symbol of the Great Sun faith, received through an upbringing among the high clergy."]
};

/** Only stock content is enriched. Inventory state, prices, IDs and custom writing are untouched. */
export function generalGearDescriptionUpdate(item) {
  if (item.type !== "equipment") return {};
  const id = item.system?.ruleId, content = generalGearContent(id);
  if (!content) return {};
  const update = {}, description = String(item.system.description ?? "");
  const plain = description.replace(/<[^>]*>/g, "").trim();
  if (!plain || STOCK_SOURCES.includes(plain)) update["system.description"] = content.description;
  else if (LEGACY_PROSE[id]?.includes(plain)) update["system.description"] = description + content.description;
  const oldProperties = id === "gear.bag" ? "Для небольших предметов" : CORE_CONTAINERS[id]?.properties;
  if ((!item.system.properties || item.system.properties === oldProperties) && item.system.properties !== content.properties) update["system.properties"] = content.properties;
  if ((!item.system.source || STOCK_SOURCES.includes(item.system.source)) && item.system.source !== content.source) update["system.source"] = content.source;
  return update;
}
