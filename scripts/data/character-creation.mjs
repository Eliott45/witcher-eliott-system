import { FAMILY_STATUSES } from "./family-statuses.mjs";
import { INFLUENTIAL_FRIENDS } from "./influential-friends.mjs";
import { getOrigin } from "./origins.mjs";
import { getProfession, COMBAT_SKILLS } from "./professions.mjs";
import { SKILLS } from "./skills.mjs";
import { WITCHER_TABLES, witcherTrialModifier } from "./witcher-lifepath.mjs";
import { LANGUAGES } from "./languages.mjs";

// Character creation, core pp.20–49, 71 and 237–241 (Russian edition). Table texts are short paraphrases.
// Every table row is stored by its 1–10 index or by a stable id, so a draft survives translation changes.

export const CREATION_STEPS = [
  { id: "race", name: "Раса", icon: "fa-solid fa-people-group" },
  { id: "origin", name: "Родина и семья", icon: "fa-solid fa-house-chimney" },
  { id: "events", name: "Жизненный путь", icon: "fa-solid fa-route" },
  { id: "style", name: "Стиль", icon: "fa-solid fa-feather" },
  { id: "profession", name: "Профессия", icon: "fa-solid fa-briefcase" },
  { id: "attributes", name: "Параметры", icon: "fa-solid fa-person" },
  { id: "skills", name: "Навыки", icon: "fa-solid fa-graduation-cap" },
  { id: "gear", name: "Снаряжение", icon: "fa-solid fa-sack-dollar" },
  { id: "summary", name: "Итог", icon: "fa-solid fa-scroll" }
];

/* -------------------------------------------- */
/*  Homeland (p.25)                             */
/* -------------------------------------------- */

export const HOMELAND_ROWS = {
  north: ["redania", "kaedwen", "temeria", "aedirn", "lyria-rivia", "kovir-poviss", "skellige", "cidaris", "verden", "cintra"],
  vassal: ["vicovaro", "angren", "nazair", "metinna", "mag-turga", "geso", "ebbing", "maecht", "gemmera", "etolia"]
};
export const REGIONS = { north: "Королевства Севера", nilfgaard: "Нильфгаард", elder: "Земли Старших Народов" };
/** Humans (and witchers) roll odd/even for the North or Nilfgaard; nonhumans come from the Elder lands. */
export const regionForRoll = (race, roll) => ["elf", "dwarf"].includes(race) ? "elder" : roll % 2 ? "north" : "nilfgaard";
export function homelandForRoll(region, roll, vassalRoll = roll, race = "") {
  if (region === "elder") return race === "dwarf" ? "mahakam" : "dol-blathanna";
  if (region === "north") return HOMELAND_ROWS.north[roll - 1];
  return roll <= 3 ? "nilfgaard-heartland" : HOMELAND_ROWS.vassal[vassalRoll - 1];
}
export const regionOfOrigin = origin => getOrigin(origin)?.group ?? "";
/** Core p.49: the native tongue starts at 8 for free. */
export function nativeLanguage(origin) {
  if (origin === "mahakam") return "language.dwarven";
  if (["skellige", "dol-blathanna"].includes(origin) || regionOfOrigin(origin) === "nilfgaard") return "language.elder";
  return "language.common";
}
/** Family tables use the homeland's column; nonhumans always read the Elder column. */
export function familyGroup(race, origin) {
  if (["elf", "dwarf"].includes(race)) return "elder";
  return regionOfOrigin(origin) === "nilfgaard" ? "nilfgaard" : "north";
}

/* -------------------------------------------- */
/*  Family (pp.25–30)                           */
/* -------------------------------------------- */

export const FAMILY_FATE = {
  north: ["Война разбросала семью: где большинство родных — неизвестно.", "Семью посадили по ложному обвинению; уцелели только вы.",
    "Дом проклят: неурожай или призраки, оставаться там опасно.", "Война разорила семью, и выжить можно было лишь преступлением.",
    "Семья увязла в долгах из-за игр и займов.", "Ваша семья враждует с другой; с чего началось, уже не помнят.",
    "Вашу семью ненавидят в родном городе.", "Разбойники вырезали семью; выжили только вы.",
    "У семьи есть зловещая тайна: раскроется — вам конец.", "Родные презирают друг друга; хорошо, если с кем-то из братьев вы ещё здороваетесь."],
  nilfgaard: ["Семью обратили в рабство за преступление или по навету; сбежали только вы.", "Семью сослали в пустыню Корат; юность прошла в борьбе за выживание.",
    "Мятежный маг убил семью; уцелели только вы.", "Однажды родных просто увели — куда, неизвестно.",
    "Семью казнили за измену; вас одного пощадили.", "Семью лишили титулов и выселили из дома.",
    "Родственник-маг позорит семью, выставляя магию напоказ, будто северянин.", "Вы опозорили семью перед Империей и навредили родным.",
    "У семьи есть зловещая тайна, которую вы обязаны хранить ценой жизни.", "Семью убили — видимо, они стояли у кого-то на пути."],
  elder: ["Семья сочувствует людям, и сородичи её недолюбливают.", "Родные стали изгоями за несогласие с большинством и с вами не говорят.",
    "Семья погибла в войне с Нильфгаардом — возможно, на его стороне.", "Ваша семья веками враждует с другой; причину уже не помнят.",
    "Семью лишили титулов и выселили; связи с ней оборваны.", "В вашем детстве семья ходила в набеги на людей — за едой или из мести.",
    "В доме семьи поселилось привидение; многие родные погибли от рук людей.", "Семья раскололась из-за брака сестры или брата с человеком.",
    "Родных убили люди, посчитав их скоя'таэлями, — без суда.", "Предок — известный предатель; сородичи вам не доверяют."]
};
export const PARENT_FATE = {
  north: ["Погибли на войне с Нильфгаардом — в бою или как её жертвы.", "Бросили вас в лесу — возможно, не могли прокормить.",
    "Прокляты магом или кем-то ещё; проклятие оказалось смертельным.", "Продали или обменяли вас на вещи или услуги.",
    "Вступили в банду; вы часто видели её членов.", "Погибли от чудовища — решите сами, какого.",
    "Казнены по ложному обвинению — козлы отпущения или просто не в том месте.", "Умерли от чумы; оставалось лишь облегчить их страдания.",
    "Дезертировали к нильфгаардцам, продав сведения или перейдя границу.", "Похищены аристократами — возможно, мать приглянулась местному князьку."],
  nilfgaard: ["Отец погиб в Северных войнах — вероятно, был военным или призван.", "Отравлены — возможно, кто-то хотел убрать их с пути.",
    "Тайная полиция увезла их на допрос; через неделю их нашли повешенными.", "Убиты мятежным магом — за что, неизвестно.",
    "Посажены за незаконную магию или иное преступление — может, по навету.", "Изгнаны в пустыню Корат за тяжкое преступление.",
    "Прокляты магом — скорее всего, из мести.", "Просто ушли и исчезли — причин вы не знаете.",
    "Обращены в рабство за преступление против Империи или по доносу.", "Отправлены на Север двойными агентами; вы знаете только, что они служат императору."],
  elder: ["Убиты бандой скоя'таэлей; сородичи косятся на вас.", "Предали свой народ и выдали своих людям; вам здесь не рады.",
    "Покончили с собой в отчаянии, утратив надежду на былое величие.", "Стали жертвами людской ненависти; их тела выставили напоказ.",
    "Одержимы возвращением былой славы и жертвуют ради неё всем.", "Изгнаны за преступление или несогласие с большинством.",
    "Прокляты — решите сами, чем, или оставьте это ведущему.", "Отдали вас в другую семью, чтобы вы выжили.",
    "Ушли в скоя'таэли, чтобы мстить людям за искалеченную жизнь.", "Погибли от «несчастного случая» — их убрал влиятельный враг."]
};
/** «Хотя бы кто-то жив» / «родители живы» on an even roll. */
export const evenAlive = roll => roll % 2 === 0;
export const whichParent = roll => roll <= 4 ? "Отец" : roll <= 8 ? "Мать" : "Оба родителя";

const inRange = (range, roll) => {
  const [low, high = low] = String(range).split(/[–-]/u).map(Number);
  return roll >= low && roll <= high;
};
export const familyStatusForRoll = (group, roll) => FAMILY_STATUSES.find(entry => entry.group === group && inRange(entry.roll, roll))?.id ?? "";
export const friendForRoll = (group, roll) => INFLUENTIAL_FRIENDS.find(entry => entry.group === group && inRange(entry.roll, roll))?.id ?? "";

/** p.30: the size of the family by column; elves rarely have more than two siblings; dwarves read the Nilfgaardian column. */
export function siblingCount(race, group, roll) {
  if (race === "elf") return roll <= 2 ? 1 : roll >= 9 ? 2 : 0;
  if (race === "dwarf" || group === "nilfgaard") return roll <= 5 ? roll : 0;
  return roll <= 8 ? roll : 0;
}
export const SIBLING_TABLE = {
  gender: ["Мужской", "Женский", "Мужской", "Женский", "Мужской", "Женский", "Мужской", "Женский", "Мужской", "Женский"],
  age: ["Младше вас", "Младше вас", "Младше вас", "Младше вас", "Младше вас", "Старше вас", "Старше вас", "Старше вас", "Старше вас", "Ваш близнец"],
  attitude: ["Желает вам смерти", "Ненавидит вас", "Завидует вам", "Ничего особенного", "Ничего особенного", "Ничего особенного", "Ничего особенного", "Любит вас", "Равняется на вас", "Ревнует вас"],
  personality: ["Скромность", "Агрессивность", "Доброта", "С причудами", "Вдумчивость", "Болтливость", "Романтичность", "Строгость", "Уныние", "Инфантильность"]
};
export const SIBLING_COLUMNS = [["gender", "Пол"], ["age", "Возраст"], ["attitude", "Как относится к вам"], ["personality", "Черта характера"]];

/* -------------------------------------------- */
/*  Style and values (p.36)                     */
/* -------------------------------------------- */

export const STYLE_TABLES = [
  { key: "clothing", name: "Одежда", rows: ["Военная форма", "Одежда для путешествий", "Роскошная одежда", "Потрёпанная одежда", "Практичная одежда", "Традиционная одежда", "Открытая одежда", "Тёплая одежда", "Странная одежда", "Вычурная одежда"] },
  { key: "personality", name: "Характер", rows: ["Скрытный", "Непокорный", "Вспыльчивый", "Идеалистичный", "Вдумчивый", "Суровый", "Коварный", "Дружелюбный", "Надменный", "Нервозный"] },
  { key: "hair", name: "Причёска", rows: ["Длинные распущенные волосы", "Коротко остриженные волосы", "Самостоятельно остриженные волосы", "Заплетённые в косу волосы", "Длинные растрёпанные волосы", "Лысая голова", "Военная стрижка", "Лохматые грязные волосы", "Сложная причёска", "Выбритые виски"] },
  { key: "adornment", name: "Украшения", rows: ["Трофеи", "Кольца и драгоценности", "Безделушки", "Татуировки", "Боевая раскраска", "Тёмный плащ", "Яркие банданы", "Повязка на глаз", "Меха", "Эмблемы и значки"] },
  { key: "valuedPerson", name: "Кого ценит", rows: ["Родителя", "Брата или сестру", "Возлюбленного", "Друга", "Себя", "Питомца", "Наставника", "Публичную личность", "Личного героя", "Никого"] },
  { key: "value", name: "Что ценит", rows: ["Деньги", "Честь", "Своё слово", "Земные удовольствия", "Знание", "Месть", "Силу", "Любовь", "Выживание", "Дружбу"] },
  { key: "others", name: "Об окружающих", rows: ["Все вокруг — инструменты, которыми можно воспользоваться", "Наш народ лучший, на остальных плевать", "Другим доверять нельзя", "Пускай другие сначала себя покажут", "Нейтральное отношение", "Нейтральное отношение", "Плохих людей не бывает", "Все заслуживают смерти", "Вокруг одни самовлюблённые свиньи", "Ценна любая жизнь"] }
];
export const NAME_SAMPLES = {
  north: ["Ольсен", "Дагрид", "Адальберт", "Ян", "Агнес", "Аплегатт", "Кардуин"],
  elder: ["Аэльвен", "Тальсесин", "Винн", "Йорат", "Бринмор", "Керис", "Дерин"],
  skellige: ["Сигурд", "Аксель", "Лайла", "Рагнар", "Брунгильда", "Олаф", "Хакон"],
  elf: ["Явеин", "Иорвет", "Аэлирэнн", "Филавандрель", "Гезлс", "Шиадаль", "Нитраль"],
  dwarf: ["Родольф", "Золтан", "Ярпен", "Барклай", "Брувер", "Голан", "Рундурин"]
};
export function nameSamples(race, origin) {
  if (race === "elf") return NAME_SAMPLES.elf;
  if (race === "dwarf") return NAME_SAMPLES.dwarf;
  if (origin === "skellige") return NAME_SAMPLES.skellige;
  return regionOfOrigin(origin) === "nilfgaard" ? NAME_SAMPLES.elder : NAME_SAMPLES.north;
}

/* -------------------------------------------- */
/*  Witcher path (pp.238–241)                   */
/* -------------------------------------------- */

const band = (roll, limits) => limits.findIndex(limit => roll <= limit);
/** d10 bands of the witcher creation tables; the Trial reads the die plus its modifier. */
export function witcherRow(table, roll, path = {}) {
  const rows = WITCHER_TABLES[table];
  if (table === "recruitment") return rows[band(roll, [2, 8, 10])].id;
  if (table === "school") return rows[band(roll, [2, 4, 6, 8, 10])].id;
  if (table === "trial") {
    const total = roll + witcherTrialModifier(path);
    return rows[total <= 1 ? 0 : total <= 3 ? 1 : total <= 9 ? 2 : 3].id;
  }
  if (table === "standing") return rows[band(roll, [1, 2, 8, 9, 10])].id;
  return rows[roll - 1]?.id ?? "";
}
export const WITCHER_ROLL_TABLES = [
  { key: "recruitment", name: "Когда вас забрали в школу" }, { key: "school", name: "Ведьмачья школа" },
  { key: "training", name: "Начальные тренировки" }, { key: "trial", name: "Испытание травами" },
  { key: "important", name: "Самое важное событие" }, { key: "standing", name: "Нынешнее положение" }
];

/* -------------------------------------------- */
/*  Attributes (pp.47–48)                       */
/* -------------------------------------------- */

export const ATTRIBUTE_ORDER = ["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"];
export const POINT_LEVELS = [
  { id: "average", name: "Середнячки", points: 60 }, { id: "skilled", name: "Опытные", points: 70 },
  { id: "heroic", name: "Герои", points: 75 }, { id: "legendary", name: "Легенды", points: 80 }
];
export const ATTRIBUTE_MAX = 10, ATTRIBUTE_MIN = 1;
/** Rolled values: nine d10, re-rolling 1 and 2. */
export const ATTRIBUTE_ROLL = "9d10rr<=2";
export function attributeState(attributes = {}) {
  const values = Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, Number(attributes.values?.[key]) || 0]));
  const spent = Object.values(values).reduce((sum, value) => sum + value, 0);
  const errors = [];
  if (attributes.mode === "roll") {
    const pool = attributes.pool ?? [];
    if (pool.length !== ATTRIBUTE_ORDER.length) errors.push("Бросьте девять d10 для параметров.");
    const assigned = Object.values(attributes.assigned ?? {});
    if (assigned.length !== ATTRIBUTE_ORDER.length || new Set(assigned).size !== assigned.length) errors.push("Распределите все выброшенные значения — по одному на параметр.");
    return { values, spent, budget: null, remaining: 0, errors };
  }
  const budget = POINT_LEVELS.find(level => level.id === attributes.level)?.points ?? 70;
  for (const key of ATTRIBUTE_ORDER) if (values[key] < ATTRIBUTE_MIN || values[key] > ATTRIBUTE_MAX) { errors.push(`Каждый параметр — от ${ATTRIBUTE_MIN} до ${ATTRIBUTE_MAX}.`); break; }
  if (spent !== budget) errors.push(spent > budget ? `Потрачено ${spent} из ${budget} очков — уберите лишние.` : `Осталось распределить ${budget - spent} очков.`);
  return { values, spent, budget, remaining: budget - spent, errors };
}
/** Values for the actor: points as entered, or the rolled pool by assignment. */
export function chosenAttributes(attributes = {}) {
  if (attributes.mode !== "roll") return attributeState(attributes).values;
  return Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, attributes.pool?.[attributes.assigned?.[key]] ?? 0]));
}
/** p.48: the physical table reads (BODY + WILL) / 2. */
export function derivedPreview(values) {
  const base = Math.floor(((values.body || 0) + (values.will || 0)) / 2);
  const run = (values.speed || 0) * 3;
  return { health: base * 5, stamina: base * 5, recovery: base, stun: Math.min(10, base), run, leap: Math.floor(run / 5), carry: (values.body || 0) * 10 };
}

/* -------------------------------------------- */
/*  Skills (p.49)                               */
/* -------------------------------------------- */

export const PROFESSION_POINTS = 44, CREATION_SKILL_MAX = 6, NATIVE_LANGUAGE_LEVEL = 8;
const complexSkill = key => SKILLS.find(skill => skill.key === key)?.complex ?? false;
/** Difficult skills (2) cost two points a rank, at creation as later. */
export const skillCost = (key, level) => (complexSkill(key) ? 2 : 1) * Math.max(0, level);
/** The eleven profession slots: the defining skill, its skills, chosen languages and, for the man-at-arms, five combat skills. */
export function professionSlots(professionId, skills = {}) {
  const profession = getProfession(professionId);
  if (!profession) return [];
  const slots = [{ id: "defining", key: "defining", defining: true, name: profession.abilities[0].name, complex: false }];
  for (const key of profession.skills) {
    if (key === "language") continue;
    slots.push({ id: key, key, complex: complexSkill(key) });
  }
  for (let i = 0; i < (profession.languageChoices ?? 0); i++) slots.push({ id: `language${i}`, key: "language", language: true, index: i, complex: true });
  if (profession.id === "man-at-arms") for (let i = 0; i < 5; i++) slots.push({ id: `combat${i}`, key: skills.combat?.[i] ?? "", combat: true, index: i, complex: complexSkill(skills.combat?.[i]) });
  return slots;
}
/**
 * Every profession slot starts at its minimum of 1, and language slots take the non-native tongues in order,
 * so the player only adds points. Returns the same draft, adjusted in place.
 */
export function withMinimumRanks(state) {
  if (!getProfession(state.profession)) return state;
  const skills = (state.skills ??= { ranks: {}, pickup: {}, combat: [], languages: [] });
  skills.ranks ??= {};
  const native = nativeLanguage(state.origin), slots = professionSlots(state.profession, skills);
  const languages = Object.values(skills.languages ?? {});
  for (const slot of slots.filter(entry => entry.language)) {
    const current = languages[slot.index];
    const taken = languages.filter((id, index) => index !== slot.index);
    if (!current || current === native || taken.includes(current))
      languages[slot.index] = LANGUAGES.map(language => language.id).find(id => id !== native && !taken.includes(id)) ?? "";
  }
  skills.languages = languages;
  for (const slot of slots) if (!(Number(skills.ranks[slot.id]) >= 1)) skills.ranks[slot.id] = 1;
  return state;
}

export function skillState(state) {
  const skills = state.skills ?? {}, ranks = skills.ranks ?? {}, pickup = skills.pickup ?? {};
  const slots = professionSlots(state.profession, skills), errors = [];
  let spent = 0;
  // Every slot is paid for, empty ones included: cost = ranks × (difficult ? 2 : 1).
  for (const slot of slots) spent += (slot.complex ? 2 : 1) * Math.max(0, Number(ranks[slot.id]) || 0);
  if (slots.some(slot => (Number(ranks[slot.id]) || 0) < 1)) errors.push("В каждый навык профессии нужно вложить хотя бы 1 очко.");
  if (slots.some(slot => (Number(ranks[slot.id]) || 0) > CREATION_SKILL_MAX) || Object.values(pickup).some(level => level > CREATION_SKILL_MAX))
    errors.push(`При создании навык не выше ${CREATION_SKILL_MAX}.`);
  if (spent > PROFESSION_POINTS) errors.push(`Очки профессии: потрачено ${spent} из ${PROFESSION_POINTS}.`);
  else if (spent < PROFESSION_POINTS) errors.push(`Распределите ещё ${PROFESSION_POINTS - spent} очков профессии.`);
  const combat = slots.filter(slot => slot.combat);
  if (combat.some(slot => !slot.key) || new Set(combat.map(slot => slot.key)).size !== combat.length) errors.push("Выберите пять разных боевых навыков воина.");
  const languages = slots.filter(slot => slot.language).map(slot => skills.languages?.[slot.index] ?? "");
  if (languages.some(id => !id) || new Set(languages).size !== languages.length) errors.push("Выберите языки профессии — разные.");
  if (languages.includes(nativeLanguage(state.origin))) errors.push("Родной язык уже на уровне 8 — выберите для профессии другой.");
  const values = chosenAttributes(state.attributes);
  const pickupBudget = (values.intelligence || 0) + (values.reflex || 0);
  const taken = new Set(slots.map(slot => slot.key));
  let pickupSpent = 0;
  for (const [key, level] of Object.entries(pickup)) {
    if (!level) continue;
    if (taken.has(key)) { errors.push("Освоенные навыки нельзя вкладывать в навыки профессии."); break; }
    pickupSpent += skillCost(key, level);
  }
  if (pickupSpent > pickupBudget) errors.push(`Освоенные навыки: потрачено ${pickupSpent} из ${pickupBudget} (ИНТ + РЕА).`);
  return { slots, spent, budget: PROFESSION_POINTS, remaining: PROFESSION_POINTS - spent, pickupSpent, pickupBudget, pickupRemaining: pickupBudget - pickupSpent, errors };
}

/* -------------------------------------------- */
/*  Starting gear and money (pp.38–46, 71)      */
/* -------------------------------------------- */

export const STARTING_CROWNS = { bard: 120, witcher: 50, "man-at-arms": 150, priest: 75, mage: 200, doctor: 150, criminal: 100, craftsman: 120, merchant: 180 };
export const crownsFormula = profession => `${STARTING_CROWNS[profession] ?? 100} * 2d6`;

const item = (ruleId, quantity = 1, extra = {}) => ({ ruleId, quantity, ...extra });
const option = (name, items, crowns = 0) => ({ name, items, crowns });
/** Each option names catalogue entries by rule id; «ингредиенты на N крон» are paid out as money for buying them. */
export const PROFESSION_GEAR = {
  bard: [option("Доска для покера на костях", [item("gear.dice-poker-board")]), option("Колода для гвинта", [item("gear.gwent-deck")]),
    option("Ручное зеркальце", [item("gear.mirror")]), option("Музыкальный инструмент", [item("musical-instrument")]),
    option("Фляга с выпивкой", [item("gear.spirits")]), option("Кинжал", [item("weapon.dagger")]), option("Духи / одеколон", [item("gear.perfume")]),
    option("Поясная сумка", [item("gear.belt-pouch")]), option("Набедренные ножны", [item("gear.thigh-sheath")]),
    option("Дневник с замком", [item("gear.ledger"), item("gear.lock")])],
  witcher: [option("Инструменты алхимика", [item("gear.alchemy-tools")]), option("Лошадь с седлом", [item("transport.horse"), item("tack.saddle", 1, { mount: true })]),
    option("Метательные ножи ×5", [item("weapon.throwing-knife", 5)]), option("Ручной арбалет", [item("weapon.hand-crossbow")]),
    option("Двуслойный гамбезон", [item("armor.torso.3")])],
  "man-at-arms": [option("Корд", [item("weapon.kord")]), option("Копьё", [item("weapon.spear")]), option("Боевой топор", [item("weapon.battle-axe")]),
    option("Метательные ножи ×5", [item("weapon.throwing-knife", 5)]), option("Наплечная сумка", [item("shoulder-bag")]),
    option("Кольчужный капюшон", [item("armor.head.4")]), option("Бригантина", [item("armor.torso.4")]), option("Усиленные штаны", [item("armor.legs.4")]),
    option("Арбалет и 20 болтов", [item("weapon.crossbow"), item("ammunition.standard", 20, { name: "Арбалетные болты" })]), option("Стальной баклер", [item("weapon.buckler")])],
  priest: [option("Священный символ", [item("sacred-symbol")]), option("Обеззараживающая жидкость ×5", [item("alchemy.sterilizing", 5)]),
    option("Инструменты алхимика", [item("gear.alchemy-tools")]), option("Хирургические инструменты", [item("gear.surgical-tools")]),
    option("Песочные часы (час)", [item("gear.hourglass-hour")]), option("Кинжал", [item("weapon.dagger")]), option("Посох", [item("weapon.staff")]),
    option("Кровоостанавливающий порошок ×5", [item("alchemy.clotting", 5)]), option("Обезболивающие травы ×5", [item("alchemy.numbing", 5)]),
    option("Ингредиенты на 100 крон", [], 100)],
  mage: [option("Песочные часы (час)", [item("gear.hourglass-hour")]), option("Набор для макияжа", [item("gear.makeup-kit")]), option("Поясная сумка", [item("gear.belt-pouch")]),
    option("Письменные принадлежности", [item("gear.writing-kit")]), option("Ручное зеркальце", [item("gear.mirror")]), option("Кинжал", [item("weapon.dagger")]),
    option("Посох", [item("weapon.staff")]), option("Набедренные ножны", [item("gear.thigh-sheath")]), option("Дневник", [item("gear.ledger")]),
    option("Ингредиенты на 100 крон", [], 100)],
  doctor: [option("Кровоостанавливающий порошок ×10", [item("alchemy.clotting", 10)]), option("Обеззараживающая жидкость ×10", [item("alchemy.sterilizing", 10)]),
    option("Обезболивающие травы ×10", [item("alchemy.numbing", 10)]), option("Хирургические инструменты", [item("gear.surgical-tools")]),
    option("Письменные принадлежности", [item("gear.writing-kit")]), option("Песочные часы (час)", [item("gear.hourglass-hour")]),
    option("Свечи ×10", [item("gear.candles", 2)]), option("Одеяло", [item("", 1, { name: "Одеяло", custom: true })]), option("Большая палатка", [item("gear.large-tent")]),
    option("Кинжал", [item("weapon.dagger")])],
  criminal: [option("Шулерские кости", [item("gear.loaded-dice")]), option("Фонарь «бычий глаз»", [item("gear.bullseye-lantern")]), option("Потайной карман", [item("gear.hidden-pocket")]),
    option("Воровские инструменты", [item("gear.thieves-tools")]), option("Наручные ножны", [item("gear.wrist-sheath")]), option("Стилет", [item("weapon.stiletto")]),
    option("Кастет", [item("weapon.brass-knuckles")]), option("Метательные ножи ×5", [item("weapon.throwing-knife", 5)]), option("Хлороформ", [item("alchemy.chloroform")]),
    option("Наплечная сумка", [item("shoulder-bag")])],
  craftsman: [option("Походная кузница", [item("gear.forge")]), option("Инструменты торговца", [item("gear.merchant-tools")]), option("Железный полуторный меч", [item("weapon.iron-longsword")]),
    option("Инструменты ремесленника", [item("gear.crafting-tools")]), option("Инструменты алхимика", [item("gear.alchemy-tools")]), option("Песочные часы (час)", [item("gear.hourglass-hour")]),
    option("Деревянный сундук", [item("gear.wooden-chest")]), option("Булава", [item("weapon.mace")]), option("Компоненты на 50 крон", [], 50), option("Замок", [item("gear.lock")])],
  merchant: [option("Письменные принадлежности", [item("gear.writing-kit")]), option("Инструменты торговца", [item("gear.merchant-tools")]), option("Большая палатка", [item("gear.large-tent")]),
    option("Дневник", [item("gear.ledger")]), option("Арбалет и 20 болтов", [item("weapon.crossbow"), item("ammunition.standard", 20, { name: "Арбалетные болты" })]), option("Кинжал", [item("weapon.dagger")])]
};
/** Always granted: the witcher's special kit (p.39) and the merchant's cart (p.46). */
export const PROFESSION_FIXED_GEAR = {
  witcher: [item("gear.witcher-medallion", 1, { equipped: true }), item("weapon.witcher-steel-sword"), item("weapon.witcher-silver-sword")],
  merchant: [item("transport.mule"), item("transport.cart", 1, { cart: true })]
};
export const PROFESSION_FIXED_NOTES = { merchant: "Повозка полна обычных и повседневных товаров на 1000 крон (стр. 46)." };
/** The witcher also chooses formulas: two elixirs, two oils and a decoction. */
export const WITCHER_FORMULAS = [
  { key: "elixir", name: "Формулы эликсиров", count: 2, prefix: "formula.potion." },
  { key: "oil", name: "Формулы масел", count: 2, prefix: "formula.oil." },
  { key: "decoction", name: "Формула отвара", count: 1, prefix: "formula.decoction." }
];
export const gearChoiceCount = profession => getProfession(profession)?.equipmentChoices ?? 0;
/** Chosen formula ids of one group; form fields may store the slots as an object. */
export const formulaIds = (state, key) => Object.values(state.gear?.formulas?.[key] ?? {}).filter(Boolean);

/** Starting magic (pp.39–42): picked from the novice catalogue. */
export const PROFESSION_MAGIC = {
  witcher: [{ key: "signs", name: "Базовые знаки", count: 5, filter: { kind: "sign", grade: "novice" }, all: true }],
  mage: [{ key: "spells", name: "Заклинания новичка", count: 5, filter: { kind: "spell", grade: "novice", tradition: "mage" } },
    { key: "rituals", name: "Ритуал новичка", count: 1, filter: { kind: "ritual", grade: "novice" } },
    { key: "hexes", name: "Порча низкой опасности", count: 1, filter: { kind: "hex", danger: "low" } }],
  priest: [{ key: "invocations", name: "Инвокации новичка", count: 2, filter: { kind: "spell", grade: "novice", tradition: ["priest", "druid"] } },
    { key: "rituals", name: "Ритуалы новичка", count: 2, filter: { kind: "ritual", grade: "novice" } },
    { key: "hexes", name: "Порчи низкой опасности", count: 2, filter: { kind: "hex", danger: "low" } }]
};
export function magicMatches(entry, filter) {
  const system = entry.system ?? {}, kind = system.kind || "spell";
  if (filter.kind && kind !== filter.kind) return false;
  if (filter.grade && system.grade !== filter.grade) return false;
  if (filter.danger && system.hex?.danger !== filter.danger) return false;
  if (filter.tradition && ![filter.tradition].flat().includes(system.tradition)) return false;
  return true;
}

/* -------------------------------------------- */
/*  Races and professions (pp.21–24, 37)        */
/* -------------------------------------------- */

/** Witchers are witchers by profession and race; mages and priests are humans or elves (p.37). */
export function professionAllowed(race, profession) {
  if (!race || !profession) return true;
  if ((race === "witcher") !== (profession === "witcher")) return false;
  if (["mage", "priest"].includes(profession)) return ["human", "elf"].includes(race);
  return true;
}

/* -------------------------------------------- */
/*  Draft and validation                        */
/* -------------------------------------------- */

export function blankCreation() {
  return { version: 1, step: "race", race: "", origin: "", region: "", name: "", gender: "", age: 25,
    family: { alive: null, fate: 0, parentsAlive: null, parentFate: 0, whichParent: "", status: "", friend: "", siblingRoll: 0, siblingCount: null, siblings: [] },
    witcher: { recruitment: "", school: "", training: "", trial: "", trialRoll: 0, important: "", standing: "", pathStartAge: 20 },
    events: [], decades: [], style: {}, profession: "",
    attributes: { mode: "points", level: "skilled", values: Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, 0])), pool: [], assigned: {} },
    skills: { ranks: {}, pickup: {}, combat: [], languages: [] },
    gear: { picks: [], formulas: {}, magic: {} }, crowns: null, log: [] };
}

export function lifeEventCount(state) {
  if (state.race === "witcher") return Math.max(0, Math.floor(((Number(state.age) || 0) - (Number(state.witcher?.pathStartAge) || 20)) / 10));
  return Math.floor((Number(state.age) || 0) / 10);
}
/** The age that opens each decade: 10, 20… for an event; the start of the Path, +10… for a witcher. */
export function decadeAges(state) {
  const first = state.race === "witcher" ? Number(state.witcher?.pathStartAge) || 20 : 10;
  return Array.from({ length: lifeEventCount(state) }, (_, index) => first + index * 10);
}
/** Decades that have no record yet. */
export function pendingAges(state) {
  const list = (state.race === "witcher" ? state.decades : state.events) ?? [];
  return decadeAges(state).filter(age => !list.some(entry => Number(entry.age) === age));
}

export function stepErrors(state, step) {
  const errors = [];
  if (step === "race" && !state.race) errors.push("Выберите расу.");
  if (step === "origin") {
    if (state.race === "witcher") {
      for (const table of WITCHER_ROLL_TABLES) if (!state.witcher?.[table.key]) { errors.push(`Ведьмак: определите «${table.name}».`); break; }
    } else {
      if (!state.origin) errors.push("Определите родину.");
      if (!state.family?.status) errors.push("Определите положение семьи.");
    }
  }
  // The lifepath may be skipped (p.20); only the age is required.
  if (step === "events" && !(Number(state.age) > 0)) errors.push("Укажите возраст.");
  if (step === "profession") {
    if (!state.profession) errors.push("Выберите профессию.");
    else if (!professionAllowed(state.race, state.profession)) errors.push("Эта раса не может выбрать такую профессию.");
  }
  if (step === "attributes") errors.push(...attributeState(state.attributes).errors);
  if (step === "skills") errors.push(...(state.profession ? skillState(state).errors : ["Сначала выберите профессию."]));
  if (step === "gear") {
    const need = gearChoiceCount(state.profession), picks = state.gear?.picks ?? [];
    if (picks.length !== need) errors.push(`Выберите ${need} предметов снаряжения (выбрано ${picks.length}).`);
    if (state.profession === "witcher") for (const group of WITCHER_FORMULAS)
      if (formulaIds(state, group.key).length !== group.count) { errors.push(`${group.name}: выберите ${group.count}.`); break; }
    for (const group of PROFESSION_MAGIC[state.profession] ?? []) if (!group.all && (state.gear?.magic?.[group.key] ?? []).length !== group.count) { errors.push(`${group.name}: выберите ${group.count}.`); break; }
    if (!Number.isInteger(state.crowns)) errors.push("Бросьте стартовый капитал.");
  }
  if (step === "summary" && !String(state.name ?? "").trim()) errors.push("Дайте персонажу имя.");
  return errors;
}
export const creationErrors = state => CREATION_STEPS.flatMap(step => stepErrors(state, step.id).map(message => ({ step: step.id, message })));

/* -------------------------------------------- */
/*  Applying the draft                          */
/* -------------------------------------------- */

const row = (rows, index) => index >= 1 ? rows[index - 1] ?? "" : "";
/** Text written into the biography: family, siblings and style, all as plain prose. */
export function biographyText(state) {
  const group = familyGroup(state.race, state.origin), family = state.family ?? {};
  const history = [], parents = [];
  if (family.alive === false && family.fate) history.push(row(FAMILY_FATE[group], family.fate));
  else if (family.alive) history.push("Хотя бы кто-то из семьи жив.");
  if (family.parentsAlive === false && family.parentFate) parents.push(`${family.whichParent || "Родители"}: ${row(PARENT_FATE[group], family.parentFate).replace(/^./u, c => c.toLocaleLowerCase("ru"))}`);
  else if (family.parentsAlive) parents.push("Родители живы.");
  const siblings = (family.siblings ?? []).map((sibling, index) => `${index + 1}. ${[sibling.name, row(SIBLING_TABLE.gender, sibling.gender), row(SIBLING_TABLE.age, sibling.age),
    row(SIBLING_TABLE.attitude, sibling.attitude), row(SIBLING_TABLE.personality, sibling.personality)].filter(Boolean).join(" · ")}`);
  const style = Object.fromEntries(STYLE_TABLES.map(table => [table.key, row(table.rows, state.style?.[table.key])]));
  const appearance = [style.clothing, style.hair, style.adornment].filter(Boolean).join("; ");
  const personality = [style.personality && `Характер: ${style.personality}`, style.valuedPerson && `Больше всего ценит: ${style.valuedPerson}`,
    style.value && `Важнее всего: ${style.value}`, style.others && `Об окружающих: ${style.others}`].filter(Boolean).join(". ");
  return { history: history.join(" "), parents: parents.join(" "), siblings: siblings.length ? siblings.join("\n") : family.siblingCount === 0 ? "Единственный ребёнок в семье." : "",
    appearance, personality };
}

/** Skill ranks, languages and the defining skill level for the actor. */
export function skillRanks(state) {
  const { slots } = skillState(state), ranks = state.skills?.ranks ?? {};
  const skills = {}, languages = [{ id: nativeLanguage(state.origin), level: NATIVE_LANGUAGE_LEVEL }];
  let defining = 0;
  for (const slot of slots) {
    const level = Number(ranks[slot.id]) || 0;
    if (slot.defining) defining = level;
    else if (slot.language) languages.push({ id: state.skills.languages[slot.index], level });
    else if (slot.key) skills[slot.key] = level;
  }
  for (const [key, level] of Object.entries(state.skills?.pickup ?? {})) if (level > 0) skills[key] = level;
  return { skills, languages, defining };
}

/** Money from the lifepath: windfalls and a witcher's lucky decade. */
export const lifepathCrowns = state => [...(state.events ?? []).map(event => event.kind === "fortune" && event.fortune?.result === "money" ? Number(event.fortune.amount) || 0 : 0),
  ...(state.decades ?? []).map(decade => decade.outcome === "benefit" && decade.benefit?.result === "money" ? Number(decade.benefit.amount) || 0 : 0)].reduce((sum, value) => sum + value, 0);

/** Every catalogue item the draft grants, by rule id: profession picks and fixed kit, formulas and family/friend keepsakes. */
export function creationItems(state) {
  const list = [], gear = PROFESSION_GEAR[state.profession] ?? [];
  for (const index of state.gear?.picks ?? []) for (const entry of gear[index]?.items ?? []) list.push({ ...entry, source: gear[index].name });
  for (const entry of PROFESSION_FIXED_GEAR[state.profession] ?? []) list.push({ ...entry, source: "Профессия" });
  if (state.profession === "witcher") for (const group of WITCHER_FORMULAS) for (const id of formulaIds(state, group.key)) list.push(item(id, 1, { source: group.name }));
  if (state.race !== "witcher") {
    for (const id of FAMILY_STATUSES.find(entry => entry.id === state.family?.status)?.equipment ?? []) list.push(item(id, 1, { source: "Положение семьи", keepsake: true }));
    for (const id of INFLUENTIAL_FRIENDS.find(entry => entry.id === state.family?.friend)?.equipment ?? []) list.push(item(id, 1, { source: "Друг", keepsake: true }));
  }
  return list;
}
export const gearCrowns = state => (state.gear?.picks ?? []).reduce((sum, index) => sum + (PROFESSION_GEAR[state.profession]?.[index]?.crowns ?? 0), 0);
export const magicRuleIds = (state, catalog = []) => (PROFESSION_MAGIC[state.profession] ?? []).flatMap(group => group.all
  ? catalog.filter(entry => magicMatches(entry, group.filter)).slice(0, group.count).map(entry => entry.system?.ruleId ?? entry.id)
  : state.gear?.magic?.[group.key] ?? []);

/** The actor update for everything but embedded items; `languageName` turns a language id into its display name. */
export function creationUpdate(state, languageName = id => id) {
  const profession = getProfession(state.profession), bio = biographyText(state), { skills, languages } = skillRanks(state);
  const witcher = state.race === "witcher";
  return {
    name: String(state.name).trim(),
    "system.details": { race: state.race, origin: witcher ? state.origin || "" : state.origin, familyStatus: witcher ? "" : state.family.status,
      influentialFriend: witcher ? "" : state.family.friend, profession: state.profession, age: Number(state.age) || null, gender: state.gender ?? "" },
    "system.attributes": chosenAttributes(state.attributes),
    "system.skills": Object.fromEntries(SKILLS.filter(skill => skill.key !== "language").map(skill => [skill.key, skills[skill.key] ?? 0])),
    "system.languages": languages.map(entry => ({ id: entry.id, name: languageName(entry.id), level: entry.level })),
    "system.vigor": profession?.vigor ?? 0,
    "system.crowns": (Number(state.crowns) || 0) + gearCrowns(state) + lifepathCrowns(state),
    "system.biography.appearance": bio.appearance,
    "system.biography.personality": bio.personality,
    "system.biography.family.history": bio.history,
    "system.biography.family.parents": bio.parents,
    "system.biography.family.siblings": bio.siblings,
    "system.lifepath.events": witcher ? [] : state.events,
    "system.lifepath.witcher": witcher ? { ...Object.fromEntries(Object.entries(state.witcher).filter(([key]) => key !== "trialRoll")), decades: state.decades } : { decades: [] }
  };
}
