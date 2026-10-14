import { MANTICORE_TRAINING } from "./manticore-school.mjs";
// Russian core pp. 238–245. IDs, rather than translated prose, are persisted.
const table = rows => rows.map(([id, name, description = "", modifiers = []]) => ({ id, name, description, modifiers }));
export const WITCHER_TABLES = {
  recruitment: table([
    ["infancy", "Младенчество (1–2 года)", "1–2 на d10. −2 к Испытанию травами."],
    ["early", "Раннее детство (4–6 лет)", "3–8 на d10. Без модификатора Испытания травами."],
    ["late", "Позднее детство (8–11 лет)", "9–10 на d10. +2 к Испытанию травами."]
  ]),
  school: table([
    ["wolf", "Школа Волка", "Каэр Морхен. Нет штрафа к сильной атаке."],
    ["griffin", "Школа Грифона", "Каэр И Серен. +2 к пределу магии.", [["vigor", 2]]],
    ["cat", "Школа Кота", "Караван Дин Марв. Невосприимчивость к немагическим попыткам обольщения."],
    ["viper", "Школа Змеи", "Гортур Гвед. Нет штрафа за парное оружие."],
    ["bear", "Школа Медведя", "Хаэрн Кадух. Штраф от доспеха (EV) уменьшается на 2.", [["armorEncumbrance", -2]]],
    ["manticore", "Школа Мантикоры", `Бехельт Нар и Бельсуф Ассирия, Зеррикания. ${MANTICORE_TRAINING}`]
  ]),
  training: table([
    ["gauntlet", "Травма на Мучильне", "−1 к СКОРОСТИ.", [["attributes.speed", -1]]],
    ["knowledge", "Украденное знание", "Один ведьмачий чертёж на выбор."],
    ["rival", "Соперник", "Враг — другой ведьмак."],
    ["easy", "Лёгкие мутации", "+2 к Испытанию травами."],
    ["magic", "Последствия магии", "−1 к пределу магии.", [["vigor", -1]]],
    ["best", "Лучший в классе", "+1 к Владению мечом.", [["skills.swordsmanship", 1]]],
    ["reaction", "Плохая реакция на мутагены", "−2 к Испытанию травами."],
    ["friend", "Друг", "Друг — другой ведьмак."],
    ["pendulum", "Травма на маятнике", "−1 к РЕАКЦИИ.", [["attributes.reflex", -1]]],
    ["study", "Глубокое изучение", "+1 к Подготовке ведьмака.", [["profession.witcher.training", 1]]]
  ]),
  trial: table([
    ["near-death", "Почти смертельно", "Результат 1: дополнительно −1 ЭМП и −1 ТЕЛ.", [["attributes.empathy", -1], ["attributes.body", -1]]],
    ["trauma", "Тяжёлые последствия", "Результат 2–3: дополнительно −1 ЭМП.", [["attributes.empathy", -1]]],
    ["normal", "Приемлемые мутации", "Результат 4–9: без дополнительных модификаторов."],
    ["extra", "Дополнительные мутации", "Результат 10: дополнительно +1 ЭМП и +1 ЛВК.", [["attributes.empathy", 1], ["attributes.dexterity", 1]]]
  ]),
  important: table([
    ["surprise", "Дитя по Праву Неожиданности", "Судьба ребёнка и ваши отношения с ним — часть истории."],
    ["monster", "Нападение разумного чудовища"], ["knight", "Бой плечом к плечу с рыцарем"],
    ["experiment", "Плен у мага и эксперименты"], ["noble", "Работа на дворянина"],
    ["abroad", "Путешествие за пределы Континента"], ["love", "Серьёзные отношения"],
    ["siege", "Защита ведьмачьей крепости"], ["infamy", "Дурная слава"], ["hero", "Слава героя"]
  ]),
  standing: table([["personal", "Личный ведьмак"], ["work", "В поисках работы"], ["hermit", "Отшельник"], ["normal", "Нормальная жизнь"], ["criminal", "Опасный преступник"]]),
  benefit: table([
    ["surprise", "Право Неожиданности", "d10: ребёнок; собака; лошадь; плуг; кошка; бочка эля; драгоценность (1d6 × 10 крон); оружие до 500 крон; вол; мул."],
    ["romance", "Роман", "d10: 1–6 — недели, 7–8 — месяцы, 9–10 — продолжается."],
    ["money", "Неожиданная удача", "1d10 × 100 крон."], ["noble", "Долг дворянина", "Разумная ответная услуга по решению ведущего."],
    ["secret", "Ведьмачьи тайны", "Формула ведьмачьего эликсира, масла или отвара на выбор."],
    ["knighthood", "Рыцарство за храбрость", "+1 репутации в одной выбранной стране."],
    ["bandits", "Дружба с разбойниками", "Разумная помощь раз в месяц."],
    ["ruins", "Исследование руин", "d10: 1–2 эльфское усиление; 3–4 эльфский меч; 5–6 краснолюдское усиление; 7–8 гномий ручной арбалет; 9–10 краснолюдский плащ."],
    ["mage", "Долг мага", "Одна разумная услуга."], ["teacher", "Учитель", "+1 к знакомому навыку ИНТ или новый навык ИНТ на уровне 2."]
  ]),
  dangerEvent: table([
    ["debt", "Долг", "1d10 × 100 крон заведению или благородному дому."],
    ["monster", "Разумное чудовище сбежало", "Оно живо и затаило обиду."], ["addiction", "Зависимость", "Без дозы растёт штраф РЕА, ЛВК и ИНТ."],
    ["prison", "Заключение", "1d10 лет в тюрьме; запишите причину."],
    ["accusation", "Ложное обвинение", "d10: 1–3 воровство; 4–5 трусость/предательство; 6–8 убийство; 9 изнасилование; 10 незаконное колдовство."],
    ["betrayal", "Предательство", "d10: 1–3 шантаж; 4–7 раскрытая тайна; 8–10 нападение."],
    ["murder", "Убит друг или любимый", "d10: 1–3 чудовище; 4–6 казнь; 7–8 убийца; 9–10 яд."],
    ["outlaw", "Вне закона в королевстве", "Укажите страну и причину розыска."],
    ["neutrality", "Манипуляция", "Вас вынудили нарушить нейтралитет; знакомые с репутацией знают об этом."],
    ["curse", "Проклятие", "Согласуйте проклятие и способ снятия с ведущим."]
  ]),
  wound: table([
    ["knee", "Плохо сросшееся колено", "−1 СКОР.", [["attributes.speed", -1]]],
    ["eye", "Повреждённый глаз", "−1 к зрительному Вниманию."], ["arm", "Плохо сросшаяся рука", "−1 к ближнему бою этой рукой."],
    ["fingers", "Повреждённые пальцы", "Нельзя творить знаки этой рукой."], ["arrow", "Застрявшая стрела", "−1 к Силе.", [["skills.physique", -1]]],
    ["breath", "Одышка", "−5 к максимуму Выносливости.", [["staminaMax", -5]]],
    ["scar", "Огромный шрам", "−2 к Харизме и Соблазнению.", [["skills.charisma", -2], ["skills.seduction", -2]]],
    ["nose", "Повреждённый нос", "−2 к выслеживанию по запаху."],
    ["poison", "Повреждение от яда", "−5 к максимуму ПЗ.", [["healthMax", -5]]], ["hearing", "Тугоухость", "−1 к слуховому Вниманию."]
  ])
};

export const WITCHER_RISKS = [
  { id: "cautious", name: "Осторожно", danger: 10, benefit: 1, ally: 2, hunt: 3 },
  { id: "normal", name: "Нормально", danger: 25, benefit: 1, ally: 2, hunt: 5 },
  { id: "moderate", name: "Средний риск", danger: 50, benefit: 2, ally: 7, hunt: 8 },
  { id: "risky", name: "Рискованно", danger: 75, benefit: 5, ally: 7, hunt: 9 }
];
export const witcherTrialModifier = witcher => ({ infancy: -2, early: 0, late: 2 }[witcher?.recruitment] ?? 0)
  + ({ easy: 2, reaction: -2 }[witcher?.training] ?? 0);
export function witcherOutcome(risk, roll) {
  const row = WITCHER_RISKS.find(entry => entry.id === risk) ?? WITCHER_RISKS[1];
  return roll <= row.benefit ? "benefit" : roll <= row.ally ? "ally" : roll <= row.hunt ? "hunt" : "nothing";
}
export function witcherModifiers(system) {
  if (system.details?.race !== "witcher") return [];
  const path = system.lifepath?.witcher;
  if (!path) return [];
  const modifiers = [];
  const add = (tableId, id, source) => {
    const entry = WITCHER_TABLES[tableId].find(entry => entry.id === id);
    for (const [target, value] of entry?.modifiers ?? []) modifiers.push({ source, label: entry.name, target, value, category: "lifepath" });
  };
  for (const field of ["school", "training", "trial"]) add(field, path[field], `witcher-path.${field}`);
  for (const decade of path.decades ?? []) {
    if (decade.danger?.kind === "wound") add("wound", decade.danger.wound, `decade.${decade.id}`);
    if (decade.outcome === "benefit" && decade.benefit?.result === "teacher" && decade.benefit.skill) modifiers.push({
      source: `decade.${decade.id}`, label: "Учитель на Пути", target: `skills.${decade.benefit.skill}`,
      value: Math.min(2, decade.benefit.skillBonus || 1), category: "lifepath"
    });
  }
  return modifiers;
}
