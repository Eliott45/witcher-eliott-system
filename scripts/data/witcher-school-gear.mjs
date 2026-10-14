import { SYSTEM_ID } from "../config.mjs";
import { journalComponentData } from "./journal-materials.mjs";
import { weaponRecord } from "./equipment-records.mjs";
import { equipmentUuid } from "./workshop.mjs";
import { materialUuid } from "./workshop-materials.mjs";
import { MANTICORE_EQUIPMENT, MANTICORE_RECIPES } from "./manticore-school.mjs";

export const SCHOOL_GEAR_SOURCE = "Снаряжение ведьмака";
export const SCHOOL_GEAR_FOLDER = { id: "gearWitcherDLC01", name: SCHOOL_GEAR_SOURCE };
const unpriced = { [SYSTEM_ID]: { priceUnavailable: true } };
export const SCHOOL_GEAR_NAMES = { bear: "Медведя", cat: "Кота", griffin: "Грифона", manticore: "Мантикоры", viper: "Змеи", wolf: "Волка" };
export const SCHOOL_ARMOR_EFFECTS = {
  bear: ["Критическая казнь", "Критическое ранение, нанесённое ведьмачьим оружием, становится на одну степень тяжелее, максимум до смертельного."],
  cat: ["Критический натиск", "Нанеся критическое ранение ведьмачьим оружием, можно немедленно провести разоружение или подсечку без штрафа и расхода Выносливости за дополнительное действие."],
  griffin: ["Критическая магия", "Нанеся критическое ранение ведьмачьим оружием, можно немедленно сотворить знак без штрафа и расхода Выносливости за дополнительное действие. Обычная стоимость знака и перегрузка сохраняются."],
  manticore: ["Критическое блокирование", "Если блок или парирование щитом Мантикоры превосходит атаку на 5 или более, можно немедленно ударить этим щитом без штрафа и расхода Выносливости за дополнительное действие. Попадание отбрасывает нападающего на 4 м и сбивает ничком."],
  viper: ["Критическое парирование", "Если парирование ведьмачьим оружием превосходит атаку на 5 или более, можно немедленно нанести один удар взятым оружием без штрафа и расхода Выносливости за дополнительное действие."],
  wolf: ["Критическое ускорение", "Нанеся критическое ранение ведьмачьим оружием, можно немедленно нанести один удар взятым оружием без штрафа и расхода Выносливости за дополнительное действие."]
};
const reputation = { bear: "жестокого и вспыльчивого варвара", cat: "жестокого психопата", griffin: "чудовище, скрывающееся под обликом рыцаря", manticore: "опасного скитальца с востока", viper: "коварного убийцу", wolf: "нелюдимого и вспыльчивого охотника" };
const recognition = school => `<p>Любой может пользоваться этим снаряжением и его свойствами. Если носить его на виду, окружающие принимают владельца за ведьмака и относятся к нему соответственно. Образование СЛ 16 позволяет узнать школу ${SCHOOL_GEAR_NAMES[school]}: её представителя обычно считают за ${reputation[school]}. Ценные ведьмачьи вещи привлекают воров и коллекционеров.</p>`;
// Stable indices: never reorder these rows when extending the catalogue.
const weapons = [
  ["bear", "steel", 0, "6d6+2", "Пробивающее броню; Метеоритное; Разрушающее"],
  ["bear", "silver", 0, "3d6+2", "Серебряное (3d6); Разрушающее"],
  ["bear", "crossbow", 1, "4d6+2", "Медленно перезаряжающееся"],
  ["cat", "steel", 2, "4d6+2", "Пробивающее броню; Метеоритное; Кровотечение (30%)"],
  ["cat", "silver", 2, "1d6+2", "Серебряное (3d6); Кровотечение (30%)"],
  ["cat", "crossbow", 1, "2d6+2", "Медленно перезаряжающееся; Сбалансированное"],
  ["griffin", "steel", 1, "5d6+2", "Пробивающее броню; Метеоритное; Фокусирующее (1)"],
  ["griffin", "silver", 1, "2d6+2", "Серебряное (3d6); Фокусирующее (1)"],
  ["griffin", "crossbow", 1, "2d6+2", "Медленно перезаряжающееся; Улучшенное пробивающее броню"],
  ["manticore", "steel", 1, "5d6+2", "Пробивающее броню; Метеоритное; Сбалансированное"],
  ["manticore", "silver", 1, "2d6+2", "Серебряное (3d6); Сбалансированное"],
  ["viper", "steel", 2, "4d6+2", "Пробивающее броню; Метеоритное; Отравление (30%)"],
  ["viper", "silver", 2, "1d6+2", "Серебряное (3d6); Отравление (30%)"],
  ["viper", "fang", 1, "2d6+2", "Парирующее"],
  ["wolf", "steel", 1, "5d6+2", "Улучшенное пробивающее броню; Метеоритное"],
  ["wolf", "silver", 1, "2d6+2", "Серебряное (3d6); Пробивающее броню"]
];
const armors = [["bear", "heavy", 20, 3, 24], ["cat", "light", 6, 0, 3], ["griffin", "medium", 16, 1, 18], ["manticore", "medium", 12, 1, 10], ["viper", "light", 8, 0, 5], ["wolf", "medium", 14, 1, 14]];
export const SCHOOL_GEAR = [
  ...weapons.map(([school, kind, accuracy, damage, properties], index) => {
    const crossbow = kind === "crossbow", fang = kind === "fang", steel = kind === "steel";
    const name = fang ? "Змеиный клык" : `${crossbow ? "Арбалет" : steel ? "Стальной меч" : "Серебряный меч"} школы ${SCHOOL_GEAR_NAMES[school]}`;
    const entry = weaponRecord(`schoolWeap${String(index + 1).padStart(6, "0")}`, [`school-${school}-${kind}`, name, crossbow ? "crossbow" : fang ? "smallBlades" : "swordsmanship", crossbow ? "К" : "Р/К", accuracy, "", damage, crossbow ? 5 : steel ? 15 : 10, 1, crossbow ? 50 : 0, 0, crossbow ? "large" : fang ? "small" : "none", crossbow || fang ? 1 : school === "wolf" ? 3 : 2, crossbow || fang ? .5 : steel ? 2.5 : 1.5, 0, properties, crossbow ? "ranged" : "melee"], SCHOOL_GEAR_SOURCE);
    return { ...entry, school, source: "schoolGear", flags: unpriced, system: { ...entry.system, rarity: "",
      description: `<p>${name}. ${properties}.</p>${fang ? "<p>Парирующее: штраф парирования меньше на 2 (−1 в ближнем бою, −3 против метательного оружия).</p>" : ""}${recognition(school)}` } };
  }),
  ...armors.map(([school, armorClass, sp, encumbrance, weight], index) => ({ id: `armor.school-${school}`, documentId: `schoolArmr${String(index + 1).padStart(6, "0")}`, type: "armor", name: `Броня школы ${SCHOOL_GEAR_NAMES[school]}`, source: "schoolGear", school, flags: unpriced,
    system: { source: SCHOOL_GEAR_SOURCE, zone: "torso-legs", armorClass, stoppingPower: { value: sp, max: sp }, enhancementSlots: 2, encumbrance, weight, price: 0,
      description: `<h3>${SCHOOL_ARMOR_EFFECTS[school][0]}</h3><p>${SCHOOL_ARMOR_EFFECTS[school][1]}</p><p>Защищает туловище, руки и ноги. Способность действует, пока броня надета.</p>${recognition(school)}` } }))
];

// Components introduced by this supplement. It supplies neither unit prices, weights nor alchemical substances.
export const SCHOOL_MATERIALS = [
  ["cockatrice-stomach", "Желудок куролиска"], ["bear-hide", "Медвежья шкура"], ["rotfiend-blood", "Кровь гнильца"],
  ["ruby-dust", "Рубиновая пыль"], ["knocker-hair", "Волосы стучака"], ["archespores-tendrils", "Усики археспоры"],
  ["bullvore-blood", "Кровь утковола"], ["bullvore-brain", "Мозг утковола"], ["bullvore-eyes", "Глаза утковола"], ["emerald-dust", "Изумрудная пыль"]
].map(([id, name], index) => {
  // Monster Hunter's Journal pp.142–143 prices some of them; the rest stay unpriced.
  const journal = journalComponentData(id);
  return { id: `material.${id}`, documentId: `schoolMatr${String(index + 1).padStart(6, "0")}`, type: "equipment", source: "schoolGear", name, ...(journal ? {} : { flags: unpriced }),
    system: { source: SCHOOL_GEAR_SOURCE, kind: "material", weight: 0, price: 0, ...journal, description: `<p>${name}: компонент чертежей ведьмачьего снаряжения${journal ? `; алхимический компонент, добывается: ${journal.material.location}` : ""}.</p>` } };
});
const componentUuid = id => { const extra = SCHOOL_MATERIALS.find(entry => entry.id === `material.${id}`); return extra ? equipmentUuid(extra.documentId) : materialUuid(id); };
const steelBase = { "hardened-timber": 2, leather: 2, meteorite: 2, steel: 3, "sharpening-grit": 2, "etching-acid": 2, "ester-grease": 1, thread: 1 };
const silverBase = { "hardened-timber": 2, leather: 2, silver: 4, steel: 1, "sharpening-grit": 2, "etching-acid": 1, "ester-grease": 1 };
const crossbowBase = { "hardened-timber": 2, wax: 2, resin: 2, "hardened-leather": 1, "dark-steel": 1, "ester-grease": 2, "ogre-wax": 2, "dark-iron": 1, "beast-bones": 2 };
const diagramRows = [
  ["bear", "steel", 18, 9, 656, { ...steelBase, "hag-tongue": 1, "werewolf-saliva": 1, "dog-tallow": 1 }],
  ["bear", "silver", 19, 10, 597, { ...silverBase, "cockatrice-stomach": 1, mistletoe: 1 }],
  ["bear", "crossbow", 17, 8, 347, { ...crossbowBase, "siren-vocal-cords": 1 }],
  // Dark Steel appears twice (2 + 2) in both the Russian and the official English table.
  ["bear", "armor", 22, 25, 1813, { "hardened-leather": 7, "dark-steel": 4, "double-linen": 6, "beast-bones": 4, meteorite: 2, thread: 8, "bear-hide": 1, "rotfiend-blood": 1, silver: 2, leather: 6, "vampire-saliva": 2, silk: 2, "troll-liver": 1, "ogre-wax": 6 }],
  ["cat", "steel", 18, 9, 656, { ...steelBase, "wyvern-eyes": 2 }],
  ["cat", "silver", 19, 10, 597, { ...silverBase, "ruby-dust": 1 }],
  ["cat", "crossbow", 17, 8, 346, { ...crossbowBase, "knocker-hair": 2 }],
  ["cat", "armor", 18, 18, 713, { linen: 2, "hardened-leather": 3, "dark-steel": 1, "dark-iron": 1, "hardened-timber": 1, "monster-eyes": 1, "ghoul-marrow": 1, thread: 4, leather: 3, silk: 1, "drowner-brain": 1 }],
  ["griffin", "steel", 18, 9, 656, { ...steelBase, "griffin-egg": 1 }],
  ["griffin", "silver", 19, 10, 597, { ...silverBase, "etching-acid": 2, "ester-grease": 2, feathers: 2, "fifth-essence": 1 }],
  ["griffin", "crossbow", 17, 8, 342, { ...crossbowBase, "beast-bones": 0, "ogre-wax": 1, "archespores-tendrils": 2 }],
  ["griffin", "armor", 20, 24, 1571, { linen: 3, "hardened-leather": 5, silver: 1, meteorite: 3, leather: 4, "wyvern-eyes": 2, "dark-steel": 4, thread: 5, "light-essence": 1, "ghoul-marrow": 2, silk: 2, "rotfiend-blood": 1 }],
  ["manticore", "steel", 18, 9, 656, { ...steelBase, meteorite: 1, dimeritium: 1, "beast-bones": 1 }],
  ["manticore", "silver", 19, 10, 597, { ...silverBase, silver: 3, steel: 0, "sharpening-grit": 1, dimeritium: 1, "calcium-equum": 1 }],
  ["manticore", "armor", 20, 22, 1052, { linen: 3, "draconid-leather": 5, "nekker-claw": 1, "hag-ear": 1, "monster-eyes": 1, meteorite: 1, "bullvore-blood": 1, dimeritium: 2, "knocker-hair": 1 }],
  ["viper", "steel", 18, 9, 656, { ...steelBase, "venom-extract": 3, cortinarius: 2 }],
  ["viper", "silver", 19, 10, 597, { ...silverBase, "emerald-dust": 2 }],
  ["viper", "fang", 16, 4, 218, { "hardened-timber": 1, "draconid-leather": 1, "dark-steel": 1, "sharpening-grit": 1, "nekker-teeth": 1 }],
  ["viper", "armor", 18, 20, 842, { linen: 4, "hardened-leather": 2, leather: 3, thread: 6, "draconid-leather": 4, "dark-steel": 5, "darkening-oil": 2 }],
  ["wolf", "steel", 18, 9, 656, { ...steelBase, "bullvore-brain": 1 }],
  ["wolf", "silver", 19, 10, 597, { ...silverBase, "fifth-essence": 1, wolfsbane: 2 }],
  ["wolf", "armor", 20, 23, 1302, { "hardened-leather": 2, meteorite: 2, leather: 10, steel: 2, "bullvore-eyes": 2, thread: 5, "bullvore-blood": 1, "wraith-essence": 1, "ghoul-marrow": 1, silk: 2 }]
];
export const SCHOOL_DIAGRAMS = diagramRows.map(([school, kind, dc, hours, investment, components], index) => {
  const result = SCHOOL_GEAR.find(entry => entry.id === (kind === "armor" ? `armor.school-${school}` : `weapon.school-${school}-${kind}`));
  return { id: `diagram.${result.id}`, documentId: `schoolDiag${String(index + 1).padStart(6, "0")}`, type: "recipe", source: "schoolGear", school, name: `Чертёж: ${result.name}`, flags: unpriced,
    system: { source: SCHOOL_GEAR_SOURCE, rarity: "rare", price: 0, recipe: { category: "diagram", grade: "master", dc, time: hours * 3600, investment, quantity: 1, forge: true, tools: ["gear.crafting-tools"], resultUuid: equipmentUuid(result.documentId),
      components: Object.entries(components).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ uuid: componentUuid(id), substance: "", quantity })) } } };
});
export const schoolStartingGear = school => {
  if (!SCHOOL_GEAR_NAMES[school]) return [];
  const entries = [...SCHOOL_GEAR, ...SCHOOL_DIAGRAMS].filter(entry => entry.school === school);
  if (school === "manticore") entries.push(...MANTICORE_EQUIPMENT, ...MANTICORE_RECIPES);
  return entries.map(entry => ({ ruleId: entry.id, name: entry.name, quantity: entry.id === "weapon.school-viper-fang" ? 2 : 1, source: SCHOOL_GEAR_SOURCE }));
};
