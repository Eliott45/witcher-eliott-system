import { textField as text, numberField as number, choiceField as choice, formFields } from "../data/structured-fields.mjs";
import { isPhysical, ARMOR_ZONES, RARITIES, EQUIPMENT_KINDS } from "../data/physical-items.mjs";
const decimal = (key, label) => ({ ...number(key, label), step: "0.001" });
const bool = (key, label) => ({ key, label, type: "boolean" });
const COMMON = [number("quantity", "Количество"), decimal("weight", "Вес единицы, кг"), decimal("price", "Цена единицы, кроны"),
  choice("rarity", "Доступность", RARITIES), bool("carried", "При себе"), bool("equipped", "Экипировано"), text("source", "Источник / страница")];
const WEAPON = [choice("category", "Категория оружия", [{ id: "melee", name: "Ближний бой" }, { id: "ranged", name: "Стрелковое" }, { id: "thrown", name: "Метательное" }, { id: "shield", name: "Щит" }]),
  choice("skill", "Навык", ["swordsmanship", "smallBlades", "melee", "brawling", "staffSpear", "archery", "crossbow", "athletics"].map(id => ({ id, name: `WITCHER.Skills.Entries.${id}.Label` }))),
  text("damage", "Урон (формула)"), text("damageType", "Тип урона: Р / К / Д / С"), number("accuracy", "Точность (WA)", -100),
  number("reliability.value", "Надёжность: текущая"), number("reliability.max", "Надёжность: максимум"), number("hands", "Хват (рук)", 1),
  decimal("range", "Дальность, м"), decimal("rangeBodyMultiplier", "Либо дальность: ТЕЛ ×"),
  choice("concealment", "Скрытность", [{ id: "tiny", name: "Маленькое — в кармане" }, { id: "small", name: "Небольшое — под курткой" }, { id: "large", name: "Крупное — под плащом" }, { id: "none", name: "Не спрятать" }]),
  number("enhancementSlots", "Слоты усиления"), number("encumbrance", "Скованность (EV, для щита)")];
const ARMOR = [choice("zone", "Зона брони", ARMOR_ZONES), choice("armorClass", "Класс брони", [{ id: "light", name: "Лёгкая" }, { id: "medium", name: "Средняя" }, { id: "heavy", name: "Тяжёлая" }]),
  number("stoppingPower.value", "ПБ: текущая"), number("stoppingPower.max", "ПБ: максимум"), number("encumbrance", "Скованность (EV)"),
  number("enhancementSlots", "Слоты усиления"), text("resistances", "Сопротивления")];
export function physicalItemContext(item, editable) {
  if (!isPhysical(item)) return [];
  const groups = [{ title: "Предмет", fields: COMMON }, { title: item.type === "weapon" ? "Оружие" : item.type === "armor" ? "Броня" : "Снаряжение",
    fields: item.type === "weapon" ? WEAPON : item.type === "armor" ? ARMOR : [choice("kind", "Категория", EQUIPMENT_KINDS)] },
  { title: "Особенности", fields: [text("properties", "Эффекты и условия")] }];
  return groups.map(group => ({ ...group, fields: formFields(group.fields, Object.fromEntries(group.fields.map(field => [field.key, foundry.utils.getProperty(item.system, field.key)])), "system.")
    .map(field => ({ ...field, readOnly: !editable, isBoolean: field.type === "boolean" })) }));
}
