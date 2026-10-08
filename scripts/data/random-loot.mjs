import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { EQUIPMENT } from "./equipment.mjs";
import { MATERIALS } from "./workshop-materials.mjs";

// Core p.223 «Случайные личные вещи». Each column is a separate percentile table.
// The bestiary's formula determines how many possessions are rolled, not which row.
const rows = [
  ["Частично исписанный дневник", "Странная статуэтка", "Кукла для чёрной магии"],
  ["Завёрнутая в бумагу индюшачья ножка", "Состриженные ногти", "Странная маска"],
  ["Медальон с портретом", "Горшочек с пеплом", "Странный венец"],
  ["Ручное зеркальце", "Ошейник-удавка", "Ухо эльфа"],
  ["Музыкальный инструмент", "Чучело мыши", "Покрытый рунами деревянный кол"],
  ["Значок гильдии", "Локон волос", "Книга в кожаном переплёте"],
  ["Воровские инструменты", "Странное письмо", "Часть чудовища (на выбор ведущего)"],
  ["Чья-нибудь шкура", "Инструкции по ремеслу", "Единица светящейся руды"],
  ["Случайная книга", "Кусок камня", "Галлюциногенные грибы"],
  ["Бурдюк", "Полный карман гравия", "Законсервированный в банке орган"],
  ["Серебряное кольцо", "Записанные предсказания", "Склянка с кровью"],
  ["Наручники", "Комок глины", "Записи по чёрной магии"],
  ["Походная постель", "Какое-то народное средство", "Окровавленная рука"],
  ["Игральные кости", "Кусок механизма", "Мешок зубов"],
  ["Учётная книга", "Покрытая резьбой кость", "Череп чудовища"],
  ["Дешёвое вино", "Женское нижнее бельё", "Записки о персонажах игроков"],
  ["Карта местности", "Странное сушёное мясо", "Карта неизвестного места"],
  ["Фляга с крепким алкоголем", "Информация для шантажа", "Мёртвая птица"],
  ["Какой-нибудь счастливый амулет", "Интимные игрушки", "Беспорядочные рисунки"],
  ["Колода для гвинта", "Дневник с записью странных снов", "Безумные записи"],
  ["Палатка", "Рыбьи кости", "Нечитаемый свиток"],
  ["Чей-то портрет", "Бумажка с одним числом", "Начертанный кровью символ"],
  ["Мыло", "Зуб", "Странная нефритовая статуэтка"],
  ["Священный символ", "Стоптанный башмак", "Локон светлых волос"],
  ["Огниво", "Уздечка", "Странная пустая лампа"],
  ["Свисток", "Список людей", "Покрытая резьбой человеческая кость"],
  ["Солнечный камень", "Пять железных гвоздей", "Железные башмаки"],
  ["Список покупок", "Странные ракушки", "Человеческий череп"],
  ["1 единица перьев", "Странные стихи", "Курильница с запёкшейся кровью"],
  ["Сушёное мясо или солёная рыба", "Жутко плесневелый хлеб", "Татуированная кожа"],
  ["Мешочек с пряностями", "Ключ от чего-то", "Ритуальный кинжал"],
  ["Пустая склянка", "Бумага с отпечатками губной помады", "Кольцо для чёрной магии"],
  ["Мелок", "Наконечник для стрелы", "Отрезанный язык"]
];

// Only direct catalogue equivalents: a piece of stone is not necessarily a crafting
// unit, ordinary dice are not loaded dice, and a local map is not a continent map.
const references = {
  "Ручное зеркальце": "gear.mirror",
  "Музыкальный инструмент": "musical-instrument",
  "Воровские инструменты": "gear.thieves-tools",
  "Бурдюк": "gear.waterskin",
  "Серебряное кольцо": "silver-ring",
  "Наручники": "gear.handcuffs",
  "Походная постель": "gear.bedroll",
  "Колода для гвинта": "gear.gwent-deck",
  "Палатка": "gear.tent",
  "Мыло": "gear.soap",
  "Священный символ": "sacred-symbol",
  "Огниво": "gear.flint",
  "1 единица перьев": "material.feathers",
  "Мелок": "gear.chalk",
  "Кукла для чёрной магии": "black-magic-doll",
  "Единица светящейся руды": "material.glowing-ore"
};
const catalogue = [...CORE_EQUIPMENT, ...EQUIPMENT, ...MATERIALS];
const labels = { ordinary: "Обычные", strange: "Странные", occult: "Оккультные" };
export const RANDOM_LOOT_TABLES = Object.fromEntries(Object.entries(labels).map(([category, label], column) => [category,
  rows.map((row, index) => {
    const name = row[column], ruleId = references[name];
    const linked = ruleId ? catalogue.find(item => item.id === ruleId) : null;
    return {
      min: index * 3 + 1, max: index === rows.length - 1 ? 100 : index * 3 + 3,
      name, quantity: 1,
      description: `Базовая книга, стр. 223, «Случайные личные вещи»: ${label.toLowerCase()}. ${name}.`,
      ...(linked ? { ruleId: linked.id, documentId: linked.documentId } : {})
    };
  })
]));

const categories = {
  "Обычные предметы": "ordinary", "Обычные вещи": "ordinary",
  "Странные предметы": "strange", "Странные вещи": "strange",
  "Оккультные предметы": "occult", "Оккультные вещи": "occult"
};
// «Случайные предметы» does not specify a column; the GM must choose it.
export const randomLootCategory = name => categories[name] ?? null;

export function randomLootEntry(category, roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) return null;
  return RANDOM_LOOT_TABLES[category]?.find(entry => roll >= entry.min && roll <= entry.max) ?? null;
}
