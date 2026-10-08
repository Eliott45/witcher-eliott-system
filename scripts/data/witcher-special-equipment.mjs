import { weaponRecord } from "./equipment-records.mjs";
import { AMMUNITION_ICON } from "./core-ammunition.mjs";
import { RELIC_WEAPONS } from "./relic-weapons.mjs";

const unpriced = { "witcher-eliott-system": { priceUnavailable: true } };
const specialWeapon = (id, row, page, description) => {
  const item = weaponRecord(id, row, `Базовая книга, стр. ${page}; официальная errata v4`);
  item.flags = structuredClone(unpriced);
  item.system.description = `<p>${description}</p>`;
  return item;
};

/** Witcher equipment and pregen relics, using the existing physical Item types. */
export const WITCHER_SPECIAL_EQUIPMENT = [
  specialWeapon("witchSteelSword1", ["witcher-steel-sword", "Стальной ведьмачий меч", "swordsmanship", "К/Р", 0, "u", "4d6+2", 15, 1, 0, 0, "none", 2, 2.5, 0,
    "Пробивающее броню; Метеоритное"], 247,
    "Одноручный меч из метеоритной стали — один из двух клинков ведьмака. Пробивает сопротивление брони режущему и колющему урону; ПБ по-прежнему защищает от удара."),
  specialWeapon("witchSilvSword01", ["witcher-silver-sword", "Серебряный ведьмачий меч", "swordsmanship", "К/Р", 0, "u", "1d6+2", 10, 1, 0, 0, "none", 2, 1.5, 0,
    "Серебряное (3d6)"], 247,
    "Серебряный клинок для охоты на чудовищ. Мягкий металл наносит меньше обычного урона, но по существам, уязвимым к серебру, дополнительно наносит [[/r 3d6]] серебряного урона."),
  ...RELIC_WEAPONS,
  { id: "armor.raven", documentId: "relicRavenArmor1", name: "Доспехи Ворона", type: "armor", source: "armor", flags: unpriced,
    system: { zone: "torso-legs", armorClass: "light", stoppingPower: { value: 12, max: 12 }, enhancementSlots: 3,
      encumbrance: 0, weight: 12, price: 0, rarity: "unique", resistances: "Яд; Кровотечение",
      wearerBonuses: [{ target: "healthMax", value: 15 }, { target: "skills.courage", value: 3 }],
      properties: "Реликвия; +15 ПЗ; +3 к Храбрости; Сопротивление яду; Сопротивление кровотечению",
      source: "Базовая книга, стр. 264; официальная errata v4",
      description: "<p>Чёрные доспехи ведьмака Ворона из школы Грифона выкованы махакамскими мастерами для охоты на легендарного Чёрного Дракона. Эльфский кузнец двадцать дней зачаровывал броню, нанося глифы и напевая песни силы. Согласно преданию, Ворон победил чудовище, принёс его голову заказчикам и вновь ушёл на Путь. Историю можно вспомнить Образованием СЛ 14.</p><p>Защищает корпус, руки и ноги; голова остаётся открытой. Пока броня надета, максимум ПЗ увеличен на 15, а Храбрость получает +3.</p><p>Сопротивления яду и кровотечению уменьшают соответствующий урон вдвое с округлением вниз; не дают иммунитета.</p>" } },
  { id: "armor.mountain-folk", documentId: "relicMountain001", name: "Доспехи Горного народа", type: "armor", source: "armor", flags: unpriced,
    system: { zone: "all", armorClass: "medium", stoppingPower: { value: 24, max: 24 }, enhancementSlots: 3,
      encumbrance: 0, weight: 15, price: 0, rarity: "unique", resistances: "Р/К/Д; Яд",
      properties: "Реликвия; Сопротивление колющему урону; Сопротивление дробящему урону; Сопротивление режущему урону; Сопротивление яду",
      source: "Базовая книга, стр. 265; официальная errata v4",
      description: "<p>Древний комплект из кожи и метеоритной стали принадлежал вождю боболаков, оборонявших шахты Пустульских гор от людей. Когда защитники были разбиты, он обрушил штольни, чтобы не отдать захватчикам рудники. Спустя месяцы под завалами нашли его тело, но броня выдержала удары камней. По легенде, она до сих пор хранит силу своего владельца. Историю можно вспомнить Образованием СЛ 16.</p><p>Средняя броня защищает голову, корпус, руки и ноги. ПБ 24, скованность 0; три слота усилений на весь комплект.</p><p>Сопротивления колющему, дробящему и режущему урону уменьшают прошедший через ПБ урон вдвое с округлением вниз, затем применяется множитель места попадания. Сопротивление яду вдвое уменьшает его урон и не даёт иммунитета к отравлению.</p>" } },
  { id: "armor.draug", documentId: "relicDraugArmor1", name: "Доспехи драуга", type: "armor", source: "armor", flags: unpriced,
    system: { zone: "all", armorClass: "heavy", stoppingPower: { value: 36, max: 36 }, enhancementSlots: 3,
      encumbrance: 3, weight: 37, price: 0, rarity: "unique", resistances: "Огонь; Кровотечение; Яд",
      wearerBonuses: [{ target: "healthMax", value: 25 }, { target: "skills.resistMagic", value: 2 }, { target: "skills.spellCasting", value: 2 }],
      properties: "Реликвия; +25 ПЗ; +2 к Сопротивлению магии; +2 к Сотворению заклинаний; Сопротивление огню; Сопротивление кровотечению; Сопротивление яду",
      source: "Базовая книга, стр. 265; официальная errata v4",
      description: "<p>Эти латы перекованы из брони каэдвенского полководца Вандергрифта, погибшего под огненным дождём Сабрины Глевиссиг. Проклятие заставило павших вновь сражаться в Долине Понтара, а самого Вандергрифта превратило в драуга. Геральт снял проклятие, победил призрака и из его старых лат выковал новый, необычайно крепкий, но осквернённый комплект. Историю можно вспомнить Образованием СЛ 18.</p><p>Тяжёлая броня защищает голову, корпус, руки и ноги. ПБ 36, скованность 3; три слота усилений на весь комплект. Пока броня надета, максимум ПЗ увеличен на 25, Сопротивление магии и Сотворение заклинаний получают +2.</p><p>Сопротивление огню вдвое уменьшает огненный урон, прошедший через ПБ. Сопротивления кровотечению и яду также вдвое уменьшают соответствующий урон с округлением вниз; не дают иммунитета к состояниям.</p>" } },
  { id: "gear.witcher-medallion", documentId: "witchMedallion01", name: "Ведьмачий медальон", type: "equipment", source: "core", flags: unpriced,
    img: "icons/svg/sun.svg", system: { kind: "gear", weight: 0, price: 0, rarity: "unique", concealment: "tiny",
      properties: "Ведьмачье снаряжение; Чувствительность к магии — 20 м", source: "Базовая книга, стр. 247; вес и цена не указаны",
      description: "<p>Небольшая серебряная подвеска, которую ведьмак носит на шее.</p><p>Начинает едва заметно вибрировать в пределах 20 м от чудовища, проклятия или творимого заклинания, предупреждая владельца. Не указывает точное направление, вид источника или его местоположение.</p>" } },
  { id: "bomb.grapeshot", documentId: "bombGrapeshot001", name: "Бомба «Картечь»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 159, damageType: "К", properties: "Бомба; Радиус 4 м; Урон 7d6; Горение (25%)",
      source: "Базовая книга, стр. 254–255", description: "<p>Осколочная бомба с поражающими элементами. Бросок — Атлетика; дальность ТЕЛ × 4 м. Взрыв поражает область радиусом 4 м и наносит [[/r 7d6]] колющего урона. Вероятность горения — 25%.</p>" } },
  { id: "bomb.moon-dust", documentId: "bombMoonDust0001", name: "Бомба «Лунная пыль»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 199, damageType: "С", properties: "Бомба; Радиус 8 м; Подавление невидимости, бесплотности, регенерации и превращений — 20 раундов",
      source: "Базовая книга, стр. 254", description: "<p>Бросок — Атлетика; дальность ТЕЛ × 4 м. Все невидимые или неосязаемые существа в радиусе 8 м становятся видимыми и осязаемыми на 20 раундов. Попавшие под действие чудовища не могут регенерировать или превращаться до окончания эффекта, даже покинув место взрыва. Прямого урона нет.</p>" } },
  { id: "bomb.dimeritium", documentId: "bombDimeritium01", name: "Двимеритовая бомба", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 264, damageType: "С", properties: "Бомба; Радиус 8 м; Зона без магии — 20 раундов",
      source: "Базовая книга, стр. 254", description: "<p>Бросок — Атлетика; дальность ТЕЛ × 4 м. В радиусе 8 м от взрыва нельзя использовать магию в течение 20 раундов. Запрет действует только внутри зоны; прямого урона нет.</p>" } },
  { id: "bomb.samum", documentId: "bombSamum0000001", name: "Бомба «Самум»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 147, damageType: "Д", properties: "Бомба; Радиус 4 м; Испытание УСТ −2; Слепота — 6 раундов",
      source: "Базовая книга, стр. 254–255", description: "<p>Светошумовая бомба. Бросок — Атлетика; дальность ТЕЛ × 4 м. Все в радиусе 4 м проходят испытание УСТ со штрафом −2 и получают слепоту на 6 раундов (18 секунд). При провале испытания УСТ наступает дезориентация. Прямого урона нет.</p>" } },
  { id: "bomb.northern-wind", documentId: "bombNorthernW001", name: "Бомба «Северный ветер»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 177, damageType: "С", properties: "Бомба; Радиус 4 м; Замораживание на месте",
      source: "Базовая книга, стр. 254", description: "<p>Бомба с замораживающим составом. Бросок — Атлетика; дальность ТЕЛ × 4 м.</p><p>Все существа в радиусе 4 м замерзают на месте. Эффект длится 8 раундов (24 секунды) и заканчивается раньше, если цель успешно проходит проверку Силы СЛ 18 или по ней наносят удар. Атака по замороженной цели наносит дополнительно [[/r 2d6]] урона. Сам взрыв прямого урона не наносит.</p>" } },
  { id: "bomb.devils-puffball", documentId: "bombDevilsPuf001", name: "Бомба «Чёртов гриб»", type: "equipment", source: "alchemy", img: "icons/svg/explosion.svg",
    system: { kind: "gear", weight: 1, price: 138, damageType: "С", properties: "Бомба; Радиус 4 м; Отравление (100%); Двойной урон яда",
      source: "Базовая книга, стр. 161, 254", description: "<p>Бомба, выпускающая ядовитую смесь. Бросок — Атлетика; дальность ТЕЛ × 4 м.</p><p>Существа в радиусе 4 м получают отравление с вероятностью 100%. Яд наносит двойной обычный урон: 6 ПЗ в начале хода, игнорируя броню. Чтобы прекратить отравление, нужно потратить обычное действие и пройти проверку Стойкости СЛ 15. Фиксированной длительности нет: яд действует до избавления от отравления. Сам взрыв прямого урона не наносит.</p>" } },
  // Ritual pouch has no separate stat block. Model its container as a belt pouch;
  // the pregen's explicitly listed ingredients remain separate, finite Items.
  { id: "gear.ritual-pouch", documentId: "gearRitualBag001", name: "Сумка с ингредиентами для ритуалов", type: "equipment", source: "core", flags: unpriced,
    img: "icons/svg/item-bag.svg", system: { kind: "container", weight: .1, capacity: 5, price: 0, concealment: "tiny",
      properties: "Для маленьких предметов", source: "Базовая книга, стр. 13, 16, 93, 95, 117; параметры контейнера приняты как у поясной сумки",
      description: "<p>Сумка для хранения ритуальных ингредиентов: порошков, трав и мелких принадлежностей. Реагенты хранятся в ней отдельными предметами.</p><p>Для ритуала нужны компоненты из его описания. Они расходуются и при успехе, и при провале; исключение — мегаскоп. Сама сумка сохраняется после использования ингредиентов.</p>" } },
  { id: "ammunition.explosive", documentId: "ammoExplosive001", name: "Взрывные боеприпасы", type: "equipment", source: "ammunition", img: AMMUNITION_ICON,
    system: { kind: "ammunition", quantity: 1, purchaseQuantity: 1, weight: .1, price: 108, damageType: "С",
      properties: "Взрыв; Радиус 2 м; Урон 4d6 по всем частям тела", source: "Базовая книга, стр. 254–255; параметры за один снаряд",
      description: "<p>Стрела или арбалетный болт с сосудом реактивной смеси. При ударе сосуд разбивается и взрывается: [[/r 4d6]] урона по всем частям тела каждого существа в пределах 2 м.</p>" } }
];
