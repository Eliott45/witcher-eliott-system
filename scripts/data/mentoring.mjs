import { advancementCost, advancementEntries } from "./advancement.mjs";
import { queueActorWrite } from "./actor-writes.mjs";

// Core p.59 «Помощь наставника»: a teacher with a higher rank invests lesson IP (usually 1–5 per lesson)
// straight into one skill of the student. The teacher can raise it up to the average of the taught skill
// and Teaching, never above the teacher's own rank (book examples: 10/2 → 6, 8/10 → 8). The book does not
// say how to round an odd average; the Witcher rounds down.
// «Изучение и практика»: without a mentor, 1 IP per day of study, and only from 0 up to 2.
export const SELF_STUDY_LIMIT = 2;
const trainable = row => ["skills", "languages"].includes(row.kind) && row.base !== null;
const sameSkill = (a, b) => a.kind === b.kind && (a.kind === "skills" ? a.key === b.key : Boolean(a.languageRuleId) && a.languageRuleId === b.languageRuleId);

export const trainingEntries = (actor, localize) => advancementEntries(actor, localize).filter(trainable);
export const mentorLimit = (skill, teaching) => Math.min(skill, Math.floor((skill + teaching) / 2));

/** What a lesson (teacher) or study days (no teacher) would do. Pure: nothing is written. */
export function trainingQuote(student, { entryId, teacher = null, points }, localize) {
  const row = trainingEntries(student, localize).find(entry => entry.id === entryId);
  if (!row) return { error: "Выберите навык ученика." };
  const base = { row, points, from: row.level, to: row.level, steps: [], progress: row.progress, wasted: 0, teacherLevel: null, teaching: null };
  if (!Number.isSafeInteger(points) || points < 1 || points > 100) return { ...base, error: teacher ? "Укажите О.У. за урок: целое число от 1." : "Укажите число дней: целое число от 1." };
  let limit = SELF_STUDY_LIMIT;
  if (teacher) {
    if (teacher === student || (teacher.uuid && teacher.uuid === student.uuid)) return { ...base, error: "Персонаж не может быть наставником самому себе." };
    const own = trainingEntries(teacher, localize);
    const teacherLevel = own.find(entry => sameSkill(entry, row))?.level ?? 0;
    const teaching = own.find(entry => entry.id === "skill:teaching")?.level ?? 0;
    Object.assign(base, { teacherLevel, teaching });
    if (teacherLevel <= row.level) return { ...base, error: `Наставник должен владеть навыком лучше ученика: у него ${teacherLevel}, у ученика ${row.level}.` };
    limit = mentorLimit(teacherLevel, teaching);
  }
  base.limit = limit;
  if (row.level >= limit) return { ...base, error: teacher
    ? `Этот наставник доводит навык только до ${limit} (среднее ${base.teacherLevel} и Передачи знаний ${base.teaching}); ученик уже достиг этого.`
    : `Без наставника навык поднимается только до ${SELF_STUDY_LIMIT}.` };
  let level = row.level, pool = row.progress + points;
  const steps = [];
  while (level < limit) {
    const cost = advancementCost(level, level + 1, row.multiplier)[0];
    if (pool < cost) break;
    pool -= cost; steps.push(cost); level++;
  }
  // Points beyond the limit cannot be invested under this teacher: they are reported, not banked.
  const capped = level >= limit;
  return { ...base, to: level, steps, progress: capped ? 0 : pool, wasted: capped ? pool : 0,
    nextCost: capped ? 0 : advancementCost(level, level + 1, row.multiplier)[0], error: "" };
}

/** One actor update: new rank (skill or language) and the remaining invested points. */
export function trainingUpdate(student, quote) {
  const { row } = quote, update = { [`system.training.${row.id}`]: quote.progress };
  const target = quote.to - row.ranks;
  if (quote.to !== row.level) {
    if (row.kind === "skills") update[`system.skills.${row.key}`] = target;
    else {
      const languages = student.system.languages.map(entry => ({ ...entry }));
      const entry = languages.find(language => language.id === row.key);
      if (entry) entry.level = target; else languages.push({ id: row.key, name: row.name, level: target });
      update["system.languages"] = languages;
    }
  }
  return update;
}

export function applyTraining(student, request, localize) {
  return queueActorWrite(student, async () => {
    const quote = trainingQuote(student, request, localize);
    if (quote.error) throw new Error(quote.error);
    if (!(await student.update(trainingUpdate(student, quote)))) throw new Error("Не удалось сохранить обучение.");
    return quote;
  });
}
