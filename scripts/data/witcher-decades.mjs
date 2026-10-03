import { WITCHER_RISKS, WITCHER_TABLES, witcherOutcome } from "./witcher-lifepath.mjs";
import { DECADE_GROUPS } from "./lifepath-fields.mjs";

/** Each random choice consumes its own die. The result remains editable before saving. */
export async function generateDecade(age, risk, roll) {
  const entry = { age, risk, danger: { kind: "none" } };
  const pick = async values => values[(await roll(10)) - 1];
  const byTable = async key => (await pick(WITCHER_TABLES[key])).id;
  const riskRow = WITCHER_RISKS.find(row => row.id === risk) ?? WITCHER_RISKS[1];
  const danger = await roll(100) <= riskRow.danger;
  entry.outcome = witcherOutcome(risk, await roll(10));
  if (danger) {
    const kind = await roll(10);
    entry.danger.kind = kind <= 3 ? "event" : kind <= 6 ? "wound" : "enemy";
    if (entry.danger.kind === "wound") entry.danger.wound = await byTable("wound");
    if (entry.danger.kind === "event") {
      entry.danger.event = await byTable("dangerEvent");
      if (entry.danger.event === "debt") entry.danger.amount = await roll(10) * 100;
      if (entry.danger.event === "prison") entry.danger.years = await roll(10);
      const details = {
        accusation: ["Воровство", "Воровство", "Воровство", "Трусость / предательство", "Трусость / предательство", "Убийство", "Убийство", "Убийство", "Изнасилование", "Незаконное колдовство"],
        betrayal: ["Шантаж", "Шантаж", "Шантаж", "Раскрыта тайна", "Раскрыта тайна", "Раскрыта тайна", "Раскрыта тайна", "Нападение", "Нападение", "Нападение"],
        murder: ["Чудовище", "Чудовище", "Чудовище", "Казнь", "Казнь", "Казнь", "Убийца", "Убийца", "Яд", "Яд"]
      };
      if (details[entry.danger.event]) entry.danger.detail = await pick(details[entry.danger.event]);
    }
    if (entry.danger.kind === "enemy") {
      const pair = async values => values[Math.floor(((await roll(10)) - 1) / 2)];
      entry.enemy = { gender: await pair(["Мужской", "Женский", "Мужской", "Женский", "Мужской"]),
        occupation: await pair(["Дворянин", "Наёмник", "Воин", "Торговец", "Преступник"]),
        cause: await pair(["Он вас оклеветал", "Вы помешали его плану", "Он вас предал", "Вы убили его родича", "Он вас обманул"]),
        power: await pair(["Социальное положение", "Знание", "Физическая сила", "Подручные", "Магия"]),
        result: await pair(["Почти забыто", "Удар в спину", "Открытая вражда", "Травля в отместку", "Жажда крови"]) };
      await fate(entry.enemy, roll, true);
    }
  }
  if (entry.outcome === "benefit") {
    entry.benefit = { result: await byTable("benefit") };
    if (entry.benefit.result === "money") entry.benefit.amount = await roll(10) * 100;
    if (entry.benefit.result === "surprise") {
      entry.benefit.reward = await pick(["Ребёнок", "Собака", "Лошадь", "Плуг", "Кошка", "Бочка эля", "Драгоценность", "Оружие до 500 крон", "Вол", "Мул"]);
      if (entry.benefit.reward === "Драгоценность") entry.benefit.amount = await roll(6) * 10;
    }
    if (entry.benefit.result === "romance") { const result = await roll(10); entry.benefit.duration = result <= 6 ? "Несколько недель" : result <= 8 ? "Несколько месяцев" : "Продолжается"; }
    if (entry.benefit.result === "ruins") entry.benefit.reward = await pick(["Эльфское усиление", "Эльфское усиление", "Эльфский меч", "Эльфский меч", "Краснолюдское усиление", "Краснолюдское усиление", "Гномий ручной арбалет", "Гномий ручной арбалет", "Краснолюдский плащ", "Краснолюдский плащ"]);
  }
  if (entry.outcome === "ally") {
    entry.ally = { gender: await roll(10) <= 5 ? "Мужской" : "Женский",
      occupation: await pick(["Охотник за головами", "Маг", "Наставник / учитель", "Друг детства", "Ремесленник", "Бывший враг", "Князь / княгиня", "Жрец / жрица", "Солдат", "Бард"]),
      meeting: await pick(["Вы его спасли", "Таверна", "Он вас спас", "Он вас нанял", "Вместе попали в ловушку", "Пришлось работать вместе", "Вы его наняли", "Познакомились пьяными", "Встретились в путешествии", "Вместе сражались"]) };
    const closeness = await roll(10);
    entry.ally.closeness = closeness <= 6 ? "Знакомые" : closeness <= 9 ? "Друзья" : "Неразлейвода";
    await fate(entry.ally, roll, false);
  }
  if (entry.outcome === "hunt") {
    const fields = DECADE_GROUPS.find(group => group.key === "hunt").fields;
    const choices = key => fields.find(field => field.key === key).choices.map(option => option.id);
    const endings = choices("ending");
    entry.hunt = { category: await pick(choices("category")), location: await pick(choices("location")), ending: endings[Math.floor(((await roll(10)) - 1) / 2)], twist: "Без поворота" };
    if (await roll(10) <= 4) entry.hunt.twist = await pick(choices("twist").slice(1));
  }
  return entry;
}
async function fate(person, roll, enemy) {
  person.alive = await roll(100) <= 30 ? "Мёртв" : "Жив";
  if (person.alive === "Жив") return;
  person.deathAfterDecades = await roll(10);
  const cause = await roll(10);
  person.deathCause = cause === 10 ? "Мирная смерть" : cause <= 3 ? (enemy ? "Война" : "Разбойники") : cause <= 6 ? (enemy ? "Смертная казнь" : "Чудовище") : (enemy ? "Чудовище" : "Война");
}
