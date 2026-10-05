import { weaponRecord } from "./equipment-records.mjs";
import { AMMUNITION_ICON } from "./core-ammunition.mjs";

const unpriced = { "witcher-eliott-system": { priceUnavailable: true } };
const relic = (id, row, page, description) => {
  const item = weaponRecord(id, row, `Базовая книга, стр. ${page}; официальная errata v4`);
  item.flags = structuredClone(unpriced);
  item.system.description = `<p>${description}</p>`;
  return item;
};

/** Core equipment needed by the page 12 pregen, using the existing physical Item types. */
export const WITCHER_SPECIAL_EQUIPMENT = [
  relic("relicWolf0000001", ["wolf", "Волк", "swordsmanship", "Р/К", 2, "u", "7d6", 15, 2, 0, 0, "none", 3, 4, 0,
    "Реликвия; Пробивающее броню; Кровопускающее (75%)"], 258,
    "Стальной полуторный меч с островов Скеллиге, связанный с легендой об Уффе Кровавобородом. Историю можно вспомнить Образованием СЛ 16. Игнорирует сопротивление брони типу урона; при нанесении урона вызывает кровотечение с вероятностью 75%."),
  relic("relicMoonBlade01", ["moon-blade", "Лунный клинок", "swordsmanship", "Р/К", 1, "u", "3d6", 10, 2, 0, 0, "none", 3, 4, 0,
    "Реликвия; Серебряное (7d6+4); Улучшенное фокусирующее"], 263,
    "Серебряный полуторный меч из легенды о ведьмаке Олеке и демоне из Элландера. История: Образование СЛ 18. По уязвимым к серебру чудовищам дополнительно наносит [[/r 7d6+4]] серебряного урона. Улучшенное фокусирующее повышает на 2 СЛ проверок против заклинаний, сотворённых с этим оружием (стр. 72). Серебряный урон применяется отдельно от обычного."),
  { id: "armor.raven", documentId: "relicRavenArmor1", name: "Доспехи Ворона", type: "armor", source: "armor", flags: unpriced,
    system: { zone: "torso-legs", armorClass: "light", stoppingPower: { value: 12, max: 12 }, enhancementSlots: 3,
      encumbrance: 0, weight: 12, price: 0, rarity: "unique", resistances: "Яд; Кровотечение",
      wearerBonuses: [{ target: "healthMax", value: 15 }, { target: "skills.courage", value: 3 }],
      properties: "Реликвия; +15 ПЗ; +3 к Храбрости; Сопротивление яду; Сопротивление кровотечению",
      source: "Базовая книга, стр. 264; официальная errata v4",
      description: "<p>Лёгкий комплект из легенды о ведьмаке Вороне и Чёрном Драконе. Историю можно вспомнить Образованием СЛ 14.</p><p>Защищает корпус, руки и ноги; голова остаётся открытой. Пока броня надета, максимум ПЗ увеличен на 15, а Храбрость получает +3.</p><p>Сопротивления яду и кровотечению уменьшают соответствующий урон вдвое с округлением вниз; не дают иммунитета.</p>" } },
  { id: "gear.witcher-medallion", documentId: "witchMedallion01", name: "Ведьмачий медальон", type: "equipment", source: "core", flags: unpriced,
    img: "icons/svg/sun.svg", system: { kind: "gear", weight: 0, price: 0, rarity: "unique", concealment: "tiny",
      properties: "Ведьмачье снаряжение; Чувствительность к магии — 20 м", source: "Базовая книга, стр. 247; вес и цена не указаны",
      description: "<p>Небольшая серебряная подвеска, которую ведьмак носит на шее. У Геральта — медальон школы Волка.</p><p>Начинает едва заметно вибрировать в пределах 20 м от чудовища, проклятия или творимого заклинания, предупреждая владельца. Не указывает точное направление, вид источника или его местоположение.</p>" } },
  { id: "bomb.grapeshot", documentId: "bombGrapeshot001", name: "Бомба «Картечь»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 159, damageType: "К", properties: "Бомба; Радиус 4 м; Урон 7d6; Горение (25%)",
      source: "Базовая книга, стр. 254–255", description: "<p>Осколочная бомба с поражающими элементами. Бросок — Атлетика; дальность ТЕЛ × 4 м. Взрыв поражает область радиусом 4 м и наносит [[/r 7d6]] колющего урона. Вероятность горения — 25%.</p>" } },
  { id: "bomb.samum", documentId: "bombSamum0000001", name: "Бомба «Самум»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 147, damageType: "Д", properties: "Бомба; Радиус 4 м; Испытание УСТ −2; Слепота — 6 раундов",
      source: "Базовая книга, стр. 254–255", description: "<p>Светошумовая бомба. Бросок — Атлетика; дальность ТЕЛ × 4 м. Все в радиусе 4 м проходят испытание УСТ со штрафом −2 и получают слепоту на 6 раундов (18 секунд). При провале испытания УСТ наступает дезориентация. Прямого урона нет.</p>" } },
  { id: "ammunition.explosive", documentId: "ammoExplosive001", name: "Взрывные боеприпасы", type: "equipment", source: "ammunition", img: AMMUNITION_ICON,
    system: { kind: "ammunition", quantity: 1, purchaseQuantity: 1, weight: .1, price: 108, damageType: "С",
      properties: "Взрыв; Радиус 2 м; Урон 4d6 по всем частям тела", source: "Базовая книга, стр. 254–255; параметры за один снаряд",
      description: "<p>Стрела или арбалетный болт с сосудом реактивной смеси. При ударе сосуд разбивается и взрывается: [[/r 4d6]] урона по всем частям тела каждого существа в пределах 2 м.</p>" } }
];
