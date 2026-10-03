import { WITCHER_TABLES, WITCHER_RISKS } from "./witcher-lifepath.mjs";
import { SKILLS } from "./skills.mjs";
import { LIFE_EVENT_FIELDS, LIFE_EVENT_GROUPS } from "./life-event-fields.mjs";

import { textField, numberField, choiceField, schemaFromFields } from "./structured-fields.mjs";
export { textField, numberField, choiceField, formFields } from "./structured-fields.mjs";
const choice = choiceField;
const text = textField;
const number = numberField;
export const PERSON_FIELDS = [
  text("name", "Имя"), text("gender", "Пол"), text("occupation", "Кто этот человек"), text("meeting", "Как познакомились"),
  text("closeness", "Близость / отношение"), choice("alive", "Судьба", ["Жив", "Мёртв", "Неизвестно"]),
  number("deathAfterDecades", "Десятилетий до смерти"), text("deathCause", "Причина смерти"), text("notes", "Подробности")
];
export const WITCHER_CREATION_FIELDS = [
  choice("recruitment", "Когда забрали в школу", WITCHER_TABLES.recruitment),
  choice("school", "Ведьмачья школа", WITCHER_TABLES.school),
  choice("training", "Начальные тренировки", WITCHER_TABLES.training),
  choice("trial", "Исход Испытания травами", WITCHER_TABLES.trial),
  choice("important", "Самое важное событие", WITCHER_TABLES.important),
  choice("standing", "Нынешнее положение", WITCHER_TABLES.standing),
  number("pathStartAge", "Возраст начала Пути (20–29 лет)"),
  text("trainingPerson", "Друг / соперник по школе"), text("stolenDiagram", "Украденный чертёж"),
  text("importantDetails", "Подробности важного события"), text("notes", "Ведьмачья история")
];
export const DECADE_FIELDS = [number("age", "Возраст в начале десятилетия"), choice("risk", "Образ жизни", WITCHER_RISKS),
  choice("outcome", "Исход", [{ id: "benefit", name: "Выгода" }, { id: "ally", name: "Союзник" }, { id: "hunt", name: "Охота" }, { id: "nothing", name: "Ничего особенного" }]),
  text("notes", "История десятилетия")];
export const DECADE_GROUPS = [
  { key: "benefit", title: "Выгода", when: ["outcome", "benefit"], fields: [choice("result", "Результат", WITCHER_TABLES.benefit),
    text("reward", "Предмет / услуга / формула"), number("amount", "Кроны"), text("country", "Страна репутации"),
    choice("skill", "Навык учителя", SKILLS.filter(skill => skill.attribute === "intelligence" && skill.key !== "language").map(skill => ({ id: skill.key, name: skill.label }))), number("skillBonus", "Прибавка: 1, либо 2 для нового навыка"), text("person", "Человек / любимый"), text("duration", "Длительность романа"), text("notes", "Подробности")] },
  { key: "ally", title: "Союзник", when: ["outcome", "ally"], fields: PERSON_FIELDS },
  { key: "hunt", title: "Охота", when: ["outcome", "hunt"], fields: [
    choice("category", "Класс чудовища", ["Духи", "Проклятые", "Гибриды", "Инсектоиды", "Духи стихий", "Реликты", "Огры", "Дракониды", "Трупоеды", "Вампиры"]),
    text("monster", "Вид чудовища (+2 к Подготовке ведьмака о нём)"),
    choice("location", "Место", ["Лес", "Здание", "Заброшенное здание", "Морское побережье", "Горы", "Город", "Кладбище", "Деревня", "У реки", "Пещера"]),
    choice("ending", "Чем закончилось", ["Получил деньги и ушёл", "Наниматель отказался платить", "Оплата товарами", "Тяжёлый бой", "Лёгкий бой"]),
    choice("twist", "Внезапный поворот", ["Без поворота", "Чудовище ненастоящее", "Всё из-за проклятия", "Чудовище уже мертво", "Всё оказалось иначе", "Наниматель хотел поймать чудовище", "Виноват наниматель", "Чудовище безвредно", "Ловушка на ведьмака", "Всё гораздо хуже", "За этим стоял маг"]), text("notes", "Подробности")] },
  { key: "danger", title: "Опасность (отдельно от исхода)", fields: [
    choice("kind", "Опасность", [{ id: "none", name: "Не случилась" }, { id: "event", name: "Событие" }, { id: "wound", name: "Рана" }, { id: "enemy", name: "Враг" }]),
    choice("event", "Событие", WITCHER_TABLES.dangerEvent), choice("wound", "Рана", WITCHER_TABLES.wound),
    number("amount", "Сумма долга"), number("years", "Лет заключения"), text("country", "Страна"),
    text("addiction", "Зависимость"), text("curse", "Проклятие"), text("detail", "Обвинение / предательство / причина гибели"),
    text("bodyPart", "Повреждённая рука / сторона"), text("notes", "Подробности")] },
  { key: "enemy", title: "Враг", when: ["danger.kind", "enemy"], fields: [...PERSON_FIELDS,
    text("cause", "Причина вражды"), text("power", "Сила врага"), text("result", "Итог вражды")] }
];

// Conditional form fields share the same metadata as saved summaries.
for (const group of DECADE_GROUPS) for (const field of group.fields) {
  if (group.key === 'danger') {
    if (field.key === 'event') field.when = ['kind', 'event'];
    if (['wound', 'bodyPart'].includes(field.key)) field.when = ['kind', 'wound'];
    const event = { amount: 'debt', years: 'prison', addiction: 'addiction', curse: 'curse', country: 'outlaw' }[field.key];
    if (event) field.when = ['event', event];
  }
  if (['ally', 'enemy'].includes(group.key) && ['deathAfterDecades', 'deathCause'].includes(field.key)) field.when = ['alive', 'Мёртв'];
  if (group.key === 'benefit') {
    const result = { country: 'knighthood', skill: 'teacher', skillBonus: 'teacher', duration: 'romance' }[field.key];
    if (result) field.when = ['result', result];
  }
}

export function lifepathSchema() {
  const { ArrayField, SchemaField, StringField } = foundry.data.fields;
  return new SchemaField({ events: new ArrayField(new SchemaField({
    id: new StringField({ required: true, nullable: false, blank: false }),
    ...schemaFromFields(LIFE_EVENT_FIELDS),
    ...Object.fromEntries(LIFE_EVENT_GROUPS.map(group => [group.key, new SchemaField(schemaFromFields(group.fields))]))
  })), witcher: new SchemaField({
    ...schemaFromFields(WITCHER_CREATION_FIELDS),
    decades: new ArrayField(new SchemaField({ id: new StringField({ required: true, nullable: false, blank: false }),
      ...schemaFromFields(DECADE_FIELDS),
      ...Object.fromEntries(DECADE_GROUPS.map(group => [group.key, new SchemaField(schemaFromFields(group.fields))]))
    }))
  }) });
}

