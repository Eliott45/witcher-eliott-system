import { SYSTEM_ID } from "../config.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "./witcher-special-equipment.mjs";
import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { materialUuid } from "./workshop-materials.mjs";
import { equipmentUuid } from "./workshop.mjs";

// Core pp.254–255. Names and exact materials are significant: no substance substitution.
const devices = [
  ["bomb.dancing-star", "Бомба «Танцующая звезда»", "С", 4, "5d6", "Горение (100%)", 162],
  ["bomb.dragon-dream", "Бомба «Сон дракона»", "С", 8, "", "Горючее облако на 3 хода; при контакте с пламенем: Урон 5d6; Горение (75%)", 177],
  ["trap.biter", "Ловушка «Кусач»", "К", 4, "7d6", "", 144],
  ["trap.claw", "Ловушка «Когтезуб»", "Р", 4, "5d6", "Кровотечение (60%)", 111],
  ["trap.conflagration", "Ловушка «Пожарище»", "С", 4, "5d6", "Горение (75%)", 121],
  ["trap.fury", "Ловушка «Бешенство»", "С", 8, "", "Стойкость СЛ 18; при провале атакует ближайшее существо до успешной проверки", 114],
  ["trap.marker", "Ловушка «Метка»", "С", 8, "", "Краска и запах на 1 день: +5 к выслеживанию и обнаружению цели", 57],
  ["trap.talgar-winter", "Ловушка «Талгарская зима»", "С", 4, "", "Замораживание на месте; Сила СЛ 18 или удар освобождают, иначе длится 8 раундов; атака наносит дополнительно 2d6", 126]
];
export const EXPERIMENTAL_DEVICES = devices.map(([id, name, damageType, radius, damage, effect, price], index) => ({
  id, documentId: `exdv${String(index + 1).padStart(12, "0")}`, type: "equipment", source: "alchemy", name,
  img: id.startsWith("bomb.") ? "icons/svg/explosion.svg" : "icons/svg/trap.svg",
  system: { kind: "gear", weight: id.startsWith("trap.") ? 2 : 1, price, damageType,
    properties: `${id.startsWith("trap.") ? "Ловушка" : "Бомба"}; Радиус ${radius} м${damage ? `; Урон ${damage}` : ""}${effect ? `; ${effect}` : ""}`,
    source: "Базовая книга, стр. 254–255",
    description: `<p>${effect || "Взрыв наносит урон всем частям тела каждого существа в радиусе."}.</p>${id === "bomb.dragon-dream" ? "<p>Облако перемещается в случайном направлении и рассеивается через три хода. При появлении любого источника пламени весь газ взрывается. Скорость смещения определяет ведущий: книга её не задаёт.</p>" : ""}${id === "trap.marker" ? "<p>Три полных раунда мытья в крупном водоёме снижают зрительный бонус до +2. Запах не смывается, но духи, одеколон или грязь снижают бонус выслеживания по запаху до +2.</p>" : ""}` }
}));
EXPERIMENTAL_DEVICES.push(
  { id: "ammunition.split", documentId: "exdv000000000009", type: "equipment", source: "ammunition", name: "Разделяющиеся боеприпасы", img: "icons/weapons/ammunition/arrow-simple.webp",
    system: { kind: "ammunition", weight: 0.1, price: 54, damageType: "К", properties: "Разделяющееся: до трёх попаданий по случайным частям тела",
      reliability: { value: 10, max: 10 }, source: "Базовая книга, стр. 255", description: "<p>За каждый пункт превышения защиты цели, максимум 3, нанесите полный урон оружия случайной части тела. В инвентаре учитывается один боеприпас.</p>" } },
  { id: "ammunition.tracking", documentId: "exdv000000000010", type: "equipment", source: "ammunition", name: "Выслеживающие боеприпасы", img: "icons/weapons/ammunition/arrow-simple.webp",
    system: { kind: "ammunition", weight: 0.1, price: 22, damageType: "К", properties: "Выслеживание по запаху без проверки, если следу менее половины суток",
      reliability: { value: 10, max: 10 }, source: "Базовая книга, стр. 255", description: "<p>Пока боеприпас остаётся в теле цели, выслеживание по запаху не требует проверки, если следу менее 12 часов. Извлечение боеприпаса прекращает эффект.</p>" } }
);

const rows = [
  ["bomb.dancing-star",20,108,"river-clay:2 wax:1 zerrikanian-powder:1 sulphur:2 hellebore:2"],
  ["bomb.devils-puffball",16,92,"river-clay:2 wax:1 zerrikanian-powder:1 ginatia:2 green-mold:2"],
  ["bomb.dimeritium",20,176,"river-clay:2 wax:1 zerrikanian-powder:1 optima-mater:1 ginatia:2"],
  ["bomb.dragon-dream",16,118,"river-clay:2 wax:1 zerrikanian-powder:1 allspice:2 phosphorus:2"],
  ["bomb.grapeshot",20,106,"river-clay:2 wax:1 zerrikanian-powder:1 iron:1 crows-eye:2"],
  ["bomb.moon-dust",16,133,"river-clay:2 wax:1 zerrikanian-powder:1 quicksilver:1 sulphur:1"],
  ["bomb.northern-wind",20,118,"river-clay:2 wax:1 zerrikanian-powder:1 aqua-regia:2 verbena:2"],
  ["bomb.samum",18,98,"river-clay:2 wax:1 zerrikanian-powder:1 celandine:2 phosphorus:2"],
  ["trap.biter",16,96,"timber:7 thread:5 iron:1 zerrikanian-powder:2"],
  ["trap.claw",16,74,"timber:3 thread:3 stone:2 linen:1 venom-extract:1 coal:1"],
  ["trap.conflagration",18,81,"timber:2 thread:2 river-clay:2 wax:2 endrega-embryo:1"],
  ["trap.fury",16,76,"timber:3 thread:5 river-clay:2 oil:4 nekker-heart:1"],
  ["trap.marker",14,38,"timber:1 thread:1 sulphur:1 ginatia:1 ashes:1"],
  ["trap.talgar-winter",18,84,"timber:3 thread:4 water-essence:1 sewant:1"],
  ["ammunition.explosive",20,362,"dark-steel:2 feathers:1 hardened-timber:1 oil:1 river-clay:3 ogre-wax:4 zerrikanian-powder:4",5],
  ["ammunition.split",18,181,"hardened-timber:2 steel:2 feathers:3 thread:3 double-linen:1 river-clay:2",5],
  ["ammunition.tracking",14,76,"hardened-timber:1 steel:1 feathers:1 resin:1 tanning-herbs:2",5]
];
const catalog = [...CORE_EQUIPMENT, ...WITCHER_SPECIAL_EQUIPMENT, ...EXPERIMENTAL_DEVICES];
export const EXPERIMENTAL_RECIPES = rows.map(([id, dc, investment, components, quantity = 1], index) => {
  const result = catalog.find(item => item.id === id);
  if (!result) throw new Error(`Missing experimental result ${id}`);
  const formula = id.startsWith("bomb.");
  return { id: `${formula ? "formula" : "diagram"}.${id}`, documentId: `exrc${String(index + 1).padStart(12, "0")}`, type: "recipe", source: "recipes",
    name: `${formula ? "Формула" : "Чертёж"}: ${result.name}${quantity > 1 ? ` ×${quantity}` : ""}`,
    flags: { [SYSTEM_ID]: { priceUnavailable: true, exactComponents: true } },
    system: { price: 0, source: "Базовая книга, стр. 255", description: "<p>Время изготовления — полчаса. Компоненты указаны точно: замена на другие вещества не допускается. Цена самого рецепта в книге не указана.</p>",
      recipe: { category: formula ? "formula" : "diagram", resultUuid: equipmentUuid(result.documentId), quantity, dc, time: 1800, investment, grade: "novice", forge: false,
        tools: [formula ? "gear.alchemy-tools" : "gear.crafting-tools"], components: components.split(" ").map(token => { const [id, count] = token.split(":"); return { uuid: materialUuid(id), substance: "", quantity: Number(count) }; }) } }
  };
});
