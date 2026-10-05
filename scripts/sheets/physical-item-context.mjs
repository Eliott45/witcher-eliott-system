import { isTransport, TRANSPORT_TYPES, TACK_SLOTS } from "../data/transport.mjs";
import { textField as text, numberField as number, choiceField as choice, formFields } from "../data/structured-fields.mjs";
import { isPhysical, isAmmunition, ARMOR_COVERAGE, RARITIES, EQUIPMENT_KINDS, CONCEALMENT } from "../data/physical-items.mjs";
import { SUBSTANCES, MONSTER_CATEGORIES } from "../data/workshop.mjs";
import { SHIELD_CLASSES } from "../data/shields.mjs";
import { supportsVisor } from "../data/visor.mjs";
const decimal = (key, label) => ({ ...number(key, label), step: "0.001" });
const bool = (key, label) => ({ key, label, type: "boolean" });
const COMMON = [number("quantity", "Количество"), decimal("weight", "Вес единицы, кг"), decimal("price", "Цена единицы, кроны"),
  choice("rarity", "Доступность", RARITIES), bool("carried", "При себе"), bool("equipped", "Экипировано"), text("source", "Источник / страница")];
const DAMAGE_TYPE = text("damageType", "Тип урона: Р / К / Д / С");
const RELIABILITY = [number("reliability.value", "Надёжность: текущая"), number("reliability.max", "Надёжность: базовый максимум")];
const CONCEALMENT_FIELD = choice("concealment", "Скрытность", CONCEALMENT);
const WEAPON = [choice("category", "Категория оружия", [{ id: "melee", name: "Ближний бой" }, { id: "ranged", name: "Стрелковое" }, { id: "thrown", name: "Метательное" }, { id: "shield", name: "Щит" }]),
  choice("skill", "Навык", ["swordsmanship", "smallBlades", "melee", "brawling", "staffSpear", "archery", "crossbow", "athletics"].map(id => ({ id, name: `WITCHER.Skills.Entries.${id}.Label` }))),
  text("damage", "Урон (формула)"), DAMAGE_TYPE, number("accuracy", "Точность (WA)", -100),
  ...RELIABILITY, number("hands", "Необходимое число рук", 1),
  choice("grip", "Текущий хват", [{id:0,name:"По требованиям оружия"},{id:1,name:"Одна рука"},{id:2,name:"Две руки"}]),
  number("attackRate", "Скорострельность (СА), для NPC", 1), bool("natural", "Естественное оружие"),
  bool("damageIncludesBody", "Урон уже включает Телосложение (бестиарий)"), bool("loaded", "Арбалет заряжен"),
  decimal("range", "Дальность, м"), decimal("rangeBodyMultiplier", "Либо дальность: ТЕЛ ×"),
  CONCEALMENT_FIELD,
  number("enhancementSlots", "Слоты усиления"), number("encumbrance", "Скованность (EV, для щита)")];
const ARMOR = [choice("zone", "Зона брони", ARMOR_COVERAGE), choice("armorClass", "Класс брони", [{ id: "light", name: "Лёгкая" }, { id: "medium", name: "Средняя" }, { id: "heavy", name: "Тяжёлая" }]),
  number("stoppingPower.value", "ПБ: текущая"), number("stoppingPower.max", "ПБ: базовый максимум"), number("encumbrance", "Скованность (EV)"),
  number("enhancementSlots", "Слоты усиления"), text("resistances", "Сопротивления")];
export function physicalItemContext(item, editable) {
  if (!isPhysical(item)) return [];
  const groups = [{ title: "Предмет", fields: isTransport(item) ? COMMON.filter(field=>!["weight","quantity","carried","equipped"].includes(field.key)) : COMMON }, { title: item.type === "weapon" ? "Оружие" : item.type === "armor" ? "Броня" : "Снаряжение",
    fields: item.type === "weapon" ? WEAPON : item.type === "armor" ? ARMOR : [choice("kind", "Категория", EQUIPMENT_KINDS)] },
  { title: "Особенности", fields: [text("properties", "Эффекты и условия")] }];
  if (supportsVisor(item)) groups[1].fields = [...groups[1].fields, bool("visorDown", game.i18n.localize("WITCHER.Visor.Down"))];
  if (isTransport(item)) groups.push({title:"Транспорт",fields:[choice("transport.type","Вид транспорта",TRANSPORT_TYPES),decimal("capacity","Грузоподъёмность, кг"),number("transport.health.value","ПЗ сейчас"),number("transport.health.max","Максимум ПЗ"),number("transport.speed","Скорость"),number("transport.speedModifier","Для повозки: поправка к скорости животного",-100),number("transport.athletics","Атлетика + ЛВК (для животного)"),number("transport.handling","Модификатор управления",-100)]});
  if(item.type==="equipment"&&["tack","container"].includes(item.system.kind)) groups.push({title:"Упряжь",fields:[choice("tack.slot","Место крепления",[{id:"",name:"Не упряжь"},...TACK_SLOTS]),number("tack.speedBonus","Бонус скорости от седла"),number("tack.stoppingPower.value","Конский доспех: ПБ сейчас"),number("tack.stoppingPower.max","Конский доспех: максимум ПБ"),choice("tack.compartments","Отделения сумок",[{id:0,name:"Один общий контейнер"},{id:2,name:"Две седельные сумки"}]),number("tack.externalSlots","Наружных креплений")]});
  if (isAmmunition(item)) groups.splice(2, 0, { title: "Боеприпасы", fields: [number("purchaseQuantity", "Штук в пачке при покупке / добавлении", 1), DAMAGE_TYPE, ...RELIABILITY, CONCEALMENT_FIELD] });
  if (item.type === "weapon" && item.system.category === "shield") groups.splice(2,0,{title:"Щит",fields:[choice("shieldClass","Класс щита для удара (урон 0 — по таблице)",SHIELD_CLASSES)]});
  if(item.type === "equipment" && item.system.kind === "tool") groups.push({title:"Набор инструментов",fields:[CONCEALMENT_FIELD]});
  if(item.type === "equipment" && item.system.kind === "container") groups.push({ title: "Контейнер", fields: [decimal("capacity", "Вместимость, кг (0 — не задана)")] });
  if(item.type==="recipe") groups.push({title:"Чертёж / формула",fields:[
    choice("recipe.category","Вид",[{id:"diagram",name:"Чертёж"},{id:"formula",name:"Формула"}]),
    number("recipe.dc","Сложность (СЛ)"),number("recipe.time","Время, секунды"),number("recipe.quantity","Результат, штук",1),
    choice("recipe.grade","Уровень",[{id:"novice",name:"Новичок"},{id:"journeyman",name:"Подмастерье"},{id:"master",name:"Мастер"}]),
    bool("recipe.memorized","Запомнен (не требует физической копии)"),bool("recipe.forge","Нужна кузница"),text("recipe.resultUuid","UUID результата")
  ]});
  if(item.system.kind==="material") groups.push({title:"Материал / ингредиент",fields:[choice("material.substance","Субстанция",SUBSTANCES),text("material.location","Где найти"),number("material.forageDC","СЛ сбора (0 — не указана)"),text("material.quantityFormula","Количество при сборе, формула")]});
  if(item.system.kind==="alchemy") groups.push({title:"Алхимический состав",fields:[choice("alchemy.category","Категория",[{id:"substance",name:"Обычная алхимия"},{id:"potion",name:"Эликсир"},{id:"decoction",name:"Отвар"},{id:"oil",name:"Масло"}]),number("alchemy.duration","Длительность, секунды"),number("alchemy.toxicity","Токсичность, %"),choice("alchemy.target","Масло: категория целей",MONSTER_CATEGORIES),number("alchemy.bonus","Масло: бонус урона")]});
  if(item.system.kind==="upgrade") groups.push({title:"Улучшение",fields:[choice("upgrade.category","Вид улучшения",[{id:"rune",name:"Руна — навсегда"},{id:"glyph",name:"Глиф — навсегда"},{id:"armor",name:"Накладки брони"}]),choice("upgrade.target","Для предметов",[{id:"weapon",name:"Оружие"},{id:"armor",name:"Броня"}])]});
  if(item.system.kind==="mutagen") groups.push({title:"Мутаген",fields:[text("mutagen.monster","Чудовище"),number("mutagen.dc","СЛ подготовки (Алхимия)"),text("mutagen.color","Цвет"),bool("mutagen.prepared","Подготовлен"),text("mutagen.mutation","Малая мутация (для мутации магом)")]});
  return groups.map(group => ({ ...group, fields: formFields(group.fields, Object.fromEntries(group.fields.map(field => [field.key, foundry.utils.getProperty(item.system, field.key)])), "system.")
    .map(field => ({ ...field, readOnly: !editable, isBoolean: field.type === "boolean" })) }));
}
