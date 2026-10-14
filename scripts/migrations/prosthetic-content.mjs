import { BASIC_PROSTHESIS, PROSTHETIC_FOLDER } from "../data/prosthetic-equipment.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";
const PREVIOUS = {
  "description": "<p>Простая замена утраченной руки или ноги с ограниченной подвижностью: деревянная кисть для простого удержания вещей или опора для ходьбы.</p><h3>Применение и правила</h3><ul><li>Рука позволяет простые действия без точности (открыть дверь, схватить кого-то), но не держать оружие. Нога позволяет передвигаться с 3/4 Скорости, со штрафом −5 к Уклонению/Изворотливости и Атлетике.</li><li>Надевается во вкладке эффектов на вылеченную рану «Потеря руки» или «Потеря ноги» и заменяет её штрафы. Удар в протез не наносит владельцу урона, но протез отваливается и падает рядом.</li></ul>",
  "properties": "Рука: простые действия, оружие держать нельзя; Нога: СКОР ×¾, −5 к Уклонению/Изворотливости и Атлетике",
  "source": "Базовая книга",
  "weight": 1,
  "rarity": ""
};
/** Refresh only shipped values; retain custom descriptions, prices and inventory state. */
export function prostheticContentUpdate(item) {
  if (item.system?.ruleId !== BASIC_PROSTHESIS.id) return {};
  const update = {};
  for (const key of ["description", "properties", "source", "weight", "rarity"]) {
    const value = key === "description" ? stripPageReferences(item.system[key]) : item.system[key];
    if (value === PREVIOUS[key] || value == null || value === "") update[`system.${key}`] = BASIC_PROSTHESIS.system[key];
  }
  if (item.pack && (typeof item.folder === "string" ? item.folder : item.folder?.id) === "gearFolderCore01") update.folder = PROSTHETIC_FOLDER.id;
  return update;
}
