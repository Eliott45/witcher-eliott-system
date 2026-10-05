import { WITCHER_SPECIAL_EQUIPMENT } from "../data/witcher-special-equipment.mjs";

const RULE_IDS = new Set(WITCHER_SPECIAL_EQUIPMENT.map(item => item.id));
const errataLink = '<a href="https://rtalsoriangames.com/wp-content/uploads/2022/03/RTG-WI-WitcherCoreErratav4.pdf">Официальная errata</a>';
const removedParagraphs = [
  "Реликвия: рыночная цена не установлена.",
  `${errataLink}: тип оружия уточнён издателем.`,
  `${errataLink}: лёгкая броня; сопротивление кровотечению.`,
  "Срабатывание сообщает ведущий: обнаружение скрытых существ и магии на сцене не автоматизировано. Цена и масса в книге не приведены; нулевая масса в листе означает отсутствие указанного значения.",
  "После броска уменьшите количество на 1. Область, урон целям и горение ведущий применяет вручную.",
  "После броска уменьшите количество на 1. Испытания и состояния целей ведущий применяет вручную.",
  "Цена 108 крон и масса 0,1 кг — за один снаряд. После выстрела уменьшите количество на 1; взрыв и урон по зонам учитываются вручную. Надёжность в таблице экспериментальных боеприпасов не указана."
];
const replacements = [
  ...removedParagraphs.map(text => [`<p>${text}</p>`, ""]),
  [" Периодический урон учитывается вручную. Рыночная цена не установлена.", ""],
  ["Защищает корпус, руки и ноги: ПБ 12, скованность 0, три слота усилений на комплект. Голова остаётся открытой.", "Защищает корпус, руки и ноги; голова остаётся открытой."],
  ["Правило не даёт точного направления, вида источника или его местоположения.", "Не указывает точное направление, вид источника или его местоположение."]
];

/** Remove only shipped editorial text; preserve other writing and all inventory state. */
export function specialEquipmentDescriptionUpdate(item) {
  if (!RULE_IDS.has(item.system?.ruleId)) return {};
  const original = String(item.system.description ?? "");
  const description = replacements.reduce((text, [before, after]) => text.replaceAll(before, after), original);
  return description === original ? {} : { "system.description": description };
}
