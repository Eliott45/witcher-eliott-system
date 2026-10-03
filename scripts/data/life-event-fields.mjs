import { textField as text, numberField as number, choiceField as choice } from "./structured-fields.mjs";
import { LIFE_EVENTS, LIFE_KINDS, ALLY_OCCUPATIONS, ALLY_MEETINGS, ALLY_CLOSENESS, ALLY_REGIONS, ENEMY_OCCUPATIONS, ENEMY_CAUSES, ENEMY_PURSUIT, ENEMY_POWER } from "./life-events.mjs";
import { SKILLS } from "./skills.mjs";
import { LANGUAGES } from "./languages.mjs";

const when = (field, key, value) => ({ ...field, when: [key, value] });
const result = id => choice("result", "Результат", LIFE_EVENTS[id]);
const person = [text("name", "Имя"), text("gender", "Пол"), text("details", "Подробности о человеке")];
export const LIFE_EVENT_FIELDS = [number("age", "Возраст события"), choice("kind", "Тип события", LIFE_KINDS), text("notes", "История события")];
export const LIFE_EVENT_GROUPS = [
  { key: "fortune", title: "Удача", when: ["kind", "fortune"], fields: [result("fortune"),
    when(number("amount", "Кроны"), "result", "money"), text("person", "Кто помог / кто должен услугу"),
    when(choice("skill", "Навык обучения", [...SKILLS.filter(skill => skill.key !== "language").map(skill => ({ id: skill.key, name: skill.label })), ...LANGUAGES.map(language => ({ id: language.id, name: language.label }))]), "result", ["teacher", "instructor"]),
    when(number("skillBonus", "Прибавка: 1, либо 2 для нового навыка"), "result", ["teacher", "instructor"]),
    when(text("animal", "Животное"), "result", "animal"), when(text("faith", "Вера"), "result", "blessing"),
    when(text("kingdom", "Королевство"), "result", "knighthood"), text("details", "Услуга / дополнительные условия")] },
  { key: "misfortune", title: "Неудача", when: ["kind", "misfortune"], fields: [result("misfortune"),
    when(number("amount", "Долг в кронах"), "result", "debt"),
    number("months", "Длительность в месяцах"), text("person", "Связанный человек / организация"),
    when(text("addiction", "Предмет зависимости"), "result", "addiction"),
    ...["loss", "accusation", "wanted", "betrayal", "accident", "trauma"].map(id => when(choice(id, LIFE_EVENTS.misfortune.find(entry => entry.id === id).name, LIFE_EVENTS[id]), "result", id)),
    when(text("curse", "Проклятие"), "result", "curse"), text("location", "Место / область"), text("details", "Последствия и обстоятельства")] },
  { key: "ally", title: "Союзник", when: ["kind", "ally"], fields: [...person,
    choice("occupation", "Кто союзник", ALLY_OCCUPATIONS), choice("meeting", "Как познакомились", ALLY_MEETINGS),
    choice("closeness", "Насколько близки", ALLY_CLOSENESS), choice("region", "Часть света", ALLY_REGIONS), text("location", "Где живёт")] },
  { key: "enemy", title: "Враг", when: ["kind", "enemy"], fields: [...person,
    choice("occupation", "Кто враг", ENEMY_OCCUPATIONS), choice("cause", "Причина вражды", ENEMY_CAUSES),
    choice("injured", "Пострадавшая сторона", ["Персонаж", "Враг"]), number("strength", "Сила врага (1–10)", 1),
    choice("pursuit", "Как далеко готов зайти", ENEMY_PURSUIT), choice("power", "Источник силы", ENEMY_POWER)] },
  { key: "romance", title: "Романтика", when: ["kind", "romance"], fields: [result("romance"), ...person,
    when(choice("tragedy", "Трагедия", LIFE_EVENTS.tragic), "result", "tragic"),
    when(choice("difficulty", "Сложность", LIFE_EVENTS.difficult), "result", "difficult"),
    choice("status", "Состояние отношений", ["Продолжаются", "Закончились", "Неизвестно"]),
    text("children", "Дети, если есть"), text("circumstances", "Обстоятельства отношений")] }
];

/** Prevent mismatched rewards after editing the category; hidden fields remain harmless history. */
export function validateLifeEvent(event) {
  if (!LIFE_KINDS.some(kind => kind.id === event.kind)) return "Выберите тип события.";
  if (event.kind === "fortune" && ["teacher", "instructor"].includes(event.fortune?.result)) {
    const language = LANGUAGES.find(language => language.id === event.fortune.skill);
    const skill = language ? { key: language.id, attribute: "intelligence" } : SKILLS.find(skill => skill.key === event.fortune.skill);
    if (!skill) return "Выберите навык обучения.";
    if (event.fortune.result === "teacher" && skill.attribute !== "intelligence") return "Учитель обучает навыку Интеллекта.";
    const combat = ["archery", "crossbow", "melee", "brawling", "smallBlades", "staffSpear", "swordsmanship", "dodgeEscape"];
    if (event.fortune.result === "instructor" && !combat.includes(skill.key)) return "Боевой инструктор обучает боевому навыку.";
    if (![1, 2].includes(event.fortune.skillBonus)) return "Прибавка к навыку должна быть 1 или 2.";
  }
  if (event.kind === "enemy" && event.enemy.strength > 10) return "Сила врага: от 1 до 10.";
  return "";
}
