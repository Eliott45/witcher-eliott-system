import { EXPERIMENTAL_DEVICES, EXPERIMENTAL_RECIPES } from "../data/experimental-devices.mjs";
import { UPGRADES } from "../data/workshop-upgrades.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";

// Shipped text before core pp.254–256 items explained their effect in prose.
const LEGACY_RECIPE = "<p>Время изготовления — полчаса. Компоненты указаны точно: замена на другие вещества не допускается. Цена самого рецепта в книге не указана.</p>";
const LEGACY = {
  "bomb.dancing-star": "<p>Горение (100%).</p>",
  "bomb.dragon-dream": "<p>Горючее облако на 3 хода; при контакте с пламенем: Урон 5d6; Горение (75%).</p><p>Облако перемещается в случайном направлении и рассеивается через три хода. При появлении любого источника пламени весь газ взрывается. Скорость смещения определяет ведущий: книга её не задаёт.</p>",
  "trap.biter": "<p>Взрыв наносит урон всем частям тела каждого существа в радиусе..</p>",
  "trap.claw": "<p>Кровотечение (60%).</p>",
  "trap.conflagration": "<p>Горение (75%).</p>",
  "trap.fury": "<p>Стойкость СЛ 18; при провале атакует ближайшее существо до успешной проверки.</p>",
  "trap.marker": "<p>Краска и запах на 1 день: +5 к выслеживанию и обнаружению цели.</p><p>Три полных раунда мытья в крупном водоёме снижают зрительный бонус до +2. Запах не смывается, но духи, одеколон или грязь снижают бонус выслеживания по запаху до +2.</p>",
  "trap.talgar-winter": "<p>Замораживание на месте; Сила СЛ 18 или удар освобождают, иначе длится 8 раундов; атака наносит дополнительно 2d6.</p>",
  "ammunition.split": "<p>За каждый пункт превышения защиты цели, максимум 3, нанесите полный урон оружия случайной части тела. В инвентаре учитывается один боеприпас.</p>",
  "ammunition.tracking": "<p>Пока боеприпас остаётся в теле цели, выслеживание по запаху не требует проверки, если следу менее 12 часов. Извлечение боеприпаса прекращает эффект.</p>",
  "rune.chernobog": "<p>Тёмный камень со знаком Чернобога, вплавленный в клинок. Хранит оружие от поломки.</p>",
  "rune.dazhbog": "<p>Руна солнечного бога, тёплая на ощупь. Оружие с ней может воспламенить цель.</p>",
  "rune.devana": "<p>Руна богини охоты. Оружие с ней оставляет глубокие кровоточащие раны.</p>",
  "rune.morana": "<p>Руна богини смерти и зимы. Оружие с ней может отравить противника.</p>",
  "rune.perun": "<p>Руна громовержца, в которой будто дрожит молния. Подпитывает боевой азарт владельца.</p>",
  "rune.stribog": "<p>Руна бога ветров. Удар оружием с ней может ошеломить врага.</p>",
  "rune.svarog": "<p>Руна небесного кузнеца. Помогает клинку пробивать броню.</p>",
  "rune.triglav": "<p>Руна трёхликого бога. Удар оружием с ней сбивает противника с толку.</p>",
  "rune.veles": "<p>Руна бога-покровителя чародеев. Усиливает фокусирующие свойства оружия.</p>",
  "rune.zoria": "<p>Руна утренней зари, холодная как иней. Оружие с ней может заморозить цель.</p>",
  "glyph.magic": "<p>Магический знак, нанесённый на броню. Усиливает чары владельца.</p>",
  "glyph.air": "<p>Знак стихии воздуха, вплетённый в броню. Усиливает заклинания воздуха.</p>",
  "glyph.earth": "<p>Знак стихии земли, вплетённый в броню. Усиливает заклинания земли.</p>",
  "glyph.fire": "<p>Знак стихии огня, вплетённый в броню. Усиливает заклинания огня.</p>",
  "glyph.water": "<p>Знак стихии воды, вплетённый в броню. Усиливает заклинания воды.</p>"
};
const plain = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/s+/g, " ").trim();
const CURRENT = new Map([...EXPERIMENTAL_DEVICES, ...EXPERIMENTAL_RECIPES, ...UPGRADES]
  .filter(entry => entry.type === "recipe" || LEGACY[entry.id]).map(entry => [entry.id, stripPageReferences(entry.system.description)]));

/** Replace only the stock paragraph(s); player notes around them, names and inventory state are kept. */
export function experimentalDescriptionUpdate(item) {
  const id = item.system?.ruleId, canonical = CURRENT.get(id);
  if (!canonical) return {};
  const legacy = id.startsWith("formula.") || id.startsWith("diagram.") ? LEGACY_RECIPE : LEGACY[id];
  const before = String(item.system.description ?? "");
  // The new prose of split/tracking ammunition still contains its old paragraph.
  if (before.includes(canonical)) return {};
  // The oldest worlds stored only the page citation («Базовая книга, стр. 256»).
  const after = !plain(stripPageReferences(before)) || plain(before) === plain(legacy) ? canonical : before.replace(legacy, canonical);
  return after === before ? {} : { "system.description": after };
}
