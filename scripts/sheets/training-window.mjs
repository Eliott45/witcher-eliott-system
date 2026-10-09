import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { applyTraining, trainingEntries, trainingQuote } from "../data/mentoring.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";

const localize = key => game.i18n.localize(key);
const esc = text => escapeTooltip(String(text ?? ""));

/** World characters/NPCs and unlinked tokens on the current scene. */
function trainingActors() {
  const choices = new Map(game.actors.filter(actor => COMBAT_ACTOR_TYPES.includes(actor.type)).map(actor => [actor.uuid, { actor, name: actor.name }]));
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (token.actor && !token.document.actorLink && COMBAT_ACTOR_TYPES.includes(token.actor.type)) choices.set(token.actor.uuid, { actor: token.actor, name: `${token.name} · токен` });
  }
  return [...choices.entries()].map(([id, { actor, name }]) => ({ id, actor, name }));
}

export function trainingPreview(quote, teacher) {
  if (!quote.row) return `<p class="witcher-training-error">${esc(quote.error)}</p>`;
  const lines = [];
  if (teacher) lines.push(`Наставник: ${esc(quote.row.name)} ${quote.teacherLevel ?? "—"}, Передача знаний ${quote.teaching ?? "—"} → предел ${quote.limit ?? "—"}.`);
  else lines.push(`Без наставника: предел ${quote.limit ?? 2}.`);
  if (quote.error) return `<p>${lines.join(" ")}</p><p class="witcher-training-error">${esc(quote.error)}</p>`;
  lines.push(quote.to > quote.from ? `<b>${esc(quote.row.name)}: ${quote.from} → ${quote.to}</b> (${quote.steps.join(" + ")} О.У.).` : `<b>${esc(quote.row.name)}: остаётся ${quote.from}</b>.`);
  if (quote.to < quote.limit) lines.push(`До уровня ${quote.to + 1} вложено ${quote.progress} из ${quote.nextCost} О.У.`);
  if (quote.wasted) lines.push(`Ещё ${quote.wasted} О.У. сверх предела этого наставника не вкладываются.`);
  return lines.map(line => `<p>${line}</p>`).join("");
}

export function trainingCard(student, teacher, quote) {
  const who = teacher ? `${esc(teacher.name)} обучает ${esc(student.name)}` : `${esc(student.name)} учится самостоятельно`;
  const spent = teacher ? `${quote.points} О.У. за урок` : `${quote.points} дн. изучения (${quote.points} О.У.)`;
  return `<section class="witcher-foraging-card witcher-training-card"><h3><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> Обучение</h3>`
    + `<p>${who}: <b>${esc(quote.row.name)}</b>, ${spent}.</p>${trainingPreview(quote, teacher)}</section>`;
}

/** GM tool (core p.59): choose who teaches whom, the skill and the lesson IP or study days. */
export async function openTrainingWindow({ student = null } = {}) {
  if (!game.user.isGM) throw new Error("Обучение назначает ведущий.");
  const actors = trainingActors();
  if (!actors.length) throw new Error("Сначала создайте персонажа.");
  const preselected = student?.uuid ?? globalThis.canvas?.tokens?.controlled?.[0]?.actor?.uuid ?? game.user.character?.uuid;
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/training.hbs`, {
    actors: actors.map(entry => ({ id: entry.id, name: entry.name, student: entry.id === preselected }))
  });
  const actorOf = id => actors.find(entry => entry.id === id)?.actor ?? null;
  const read = form => ({ student: actorOf(form.student.value), teacher: actorOf(form.teacher.value),
    entryId: form.entry.value, points: Number(form.points.value) });
  const answer = await foundry.applications.api.DialogV2.prompt({ classes: ["witcher-foraging-dialog", "witcher-training-dialog"],
    window: { title: "Обучение", resizable: true }, position: { width: 620 }, content, rejectClose: false,
    ok: { label: "Провести обучение", callback: (_event, button) => read(button.form) },
    render: (_event, dialog) => {
      const form = dialog.element.querySelector("form"), select = form.querySelector("[data-training-entries]");
      const submit = dialog.element.querySelector('[data-action="ok"]');
      const fillEntries = () => {
        const actor = actorOf(form.student.value), previous = select.value;
        select.replaceChildren(...(actor ? trainingEntries(actor, localize) : []).map(row => {
          const option = document.createElement("option");
          option.value = row.id; option.textContent = `${row.name} · ${row.level}${row.progress ? ` (+${row.progress} О.У.)` : ""}`;
          option.selected = row.id === previous; return option;
        }));
      };
      const refresh = () => {
        const request = read(form);
        form.querySelector("[data-training-points-label]").textContent = request.teacher ? "О.У. за урок" : "Дней изучения";
        const quote = request.student ? trainingQuote(request.student, request, localize) : { error: "Выберите ученика." };
        form.querySelector("[data-training-preview]").innerHTML = trainingPreview(quote, request.teacher);
        if (submit) submit.disabled = Boolean(quote.error);
      };
      form.student.addEventListener("change", () => { fillEntries(); refresh(); });
      for (const name of ["teacher", "entry", "points"]) form[name].addEventListener(name === "points" ? "input" : "change", refresh);
      fillEntries(); refresh();
    } });
  if (!answer?.student) return null;
  const quote = await applyTraining(answer.student, answer, localize);
  await foundry.documents.ChatMessage.implementation.create({ content: trainingCard(answer.student, answer.teacher, quote),
    speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor: answer.teacher ?? answer.student }) });
  return quote;
}

export function registerTraining() {
  game.system.api = { ...game.system.api, train: async options => {
    try { return await openTrainingWindow(options); }
    catch (error) { console.error(error); ui.notifications.warn(error.message); }
  } };
}
