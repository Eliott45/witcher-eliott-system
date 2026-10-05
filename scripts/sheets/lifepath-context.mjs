import { SYSTEM_ID } from "../config.mjs";
import { WITCHER_CREATION_FIELDS, DECADE_FIELDS, DECADE_GROUPS, formFields } from "../data/lifepath-fields.mjs";
import { WITCHER_RISKS, witcherTrialModifier } from "../data/witcher-lifepath.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";
import { generateDecade } from "../data/witcher-decades.mjs";
import { LIFE_EVENT_FIELDS, LIFE_EVENT_GROUPS, validateLifeEvent } from "../data/life-event-fields.mjs";
import { LIFE_KINDS } from "../data/life-events.mjs";
import { generateLifeEvent } from "../data/life-event-generator.mjs";
import { addLanguageFromItem, getLanguage } from "../data/languages.mjs";

const valueAt = (data, key) => key.split(".").reduce((value, part) => value?.[part], data);
const visible = (group, data) => !group.when || [group.when[1]].flat().includes(valueAt(data, group.when[0]));
export const summarizeFields = (fields, data) => formFields(fields, data).filter(field => visible(field, data) && field.value !== "" && field.value !== 0)
  .map(field => ({ label: field.label, value: field.isChoice ? game.i18n.localize(field.choices.find(option => option.selected)?.name ?? "—") : field.value, description: field.description,
    wide: ["notes", "details", "detail", "circumstances"].includes(field.key) || Boolean(field.description) }));
const chronological = entries => entries.toSorted((a, b) => a.age - b.age);
export const nextRecordAge = (entries, firstAge = 10) => entries.reduce((age, entry) => Math.max(age, Number(entry.age) + 10), firstAge);
const choiceName = (fields, key, value) => fields.find(field => field.key === key)?.choices?.find(choice => choice.id === value)?.name ?? "";
const groupedFields = (groups, entry) => groups.filter(group => visible(group, entry)).map(group => ({
  key: group.key, title: group.title, fields: summarizeFields(group.fields, entry[group.key])
})).filter(group => group.fields.length);
const recordCard = (entry, kind, title, subtitle, groups, preferences) => ({
  id: entry.id, ageLabel: kind === "decade" ? `${entry.age}–${Number(entry.age) + 9}` : String(entry.age), title, subtitle,
  notes: entry.notes, groups: groups.map(group => ({ ...group, showTitle: groups.length > 1 || group.key === "danger" })),
  preferenceKey: `lifepath-${kind}-${entry.id}`, open: !preferences.collapsed?.[`lifepath-${kind}-${entry.id}`],
  editAction: kind === "decade" ? "editDecade" : "editLifeEvent", removeAction: kind === "decade" ? "removeDecade" : "removeLifeEvent"
});
function decadeCard(entry, preferences) {
  const groups = groupedFields(DECADE_GROUPS.filter(group => !["danger", "enemy"].includes(group.key)), entry);
  const danger = DECADE_GROUPS.find(group => group.key === "danger"), kind = entry.danger?.kind;
  const dangerFields = summarizeFields(danger.fields.filter(field => field.key !== "kind"), entry.danger);
  if (kind === "enemy") dangerFields.push(...summarizeFields(DECADE_GROUPS.find(group => group.key === "enemy").fields, entry.enemy));
  const dangerName = choiceName(danger.fields, "kind", kind);
  if (dangerFields.length || (kind && kind !== "none")) groups.push({key: "danger", title: `Опасность${dangerName ? ` · ${dangerName}` : ""}`, fields: dangerFields});
  const title = choiceName(DECADE_FIELDS, "outcome", entry.outcome) || "Десятилетие на Пути";
  const detail = entry.outcome === "hunt" ? entry.hunt?.monster || entry.hunt?.category : entry.outcome === "ally" ? entry.ally?.name : "";
  const risk = WITCHER_RISKS.find(risk => risk.id === entry.risk)?.name;
  return { ...recordCard(entry, "decade", [title, detail].filter(Boolean).join(" · "), risk ? `Образ жизни: ${risk}` : "", groups, preferences),
    quiet: kind === "none" ? "Без опасностей" : "" };
}
export function lifepathContext(actor, preferences = {}) {
  const path = actor.system.lifepath.witcher;
  return { isWitcher: actor.system.details.race === "witcher", eventCount: actor.system.lifepath.events.length,
    expectedEvents: Math.floor((Number(actor.system.details.age) || 0) / 10),
    events: chronological(actor.system.lifepath.events).map(entry => ({...recordCard(entry, "event",
      [LIFE_KINDS.find(kind => kind.id === entry.kind)?.name ?? "Событие", entry[entry.kind]?.name].filter(Boolean).join(" · "), "",
      groupedFields(LIFE_EVENT_GROUPS, entry), preferences), quiet: ""})),
    creation: summarizeFields(WITCHER_CREATION_FIELDS, path),
    trialModifier: witcherTrialModifier(path), decades: chronological(path.decades).map(entry => decadeCard(entry, preferences)) };
}

/** Reused by both Lifepaths; forms persist typed fields, never a display summary. */
export async function editStructuredRecord(title, fields, groups, data) {
  const flatFields = [...fields, ...groups.flatMap(group => group.fields.map(field => ({ ...field, key: `${group.key}.${field.key}`, ...(field.when ? { when: [`${group.key}.${field.when[0]}`, field.when[1]] } : {}) })))];
  const template = `systems/${SYSTEM_ID}/templates/structured-fields.hbs`;
  const render = fields => foundry.applications.handlebars.renderTemplate(template, { fields });
  let content = await render(formFields(fields, data));
  for (const group of groups) content += `<fieldset data-field-group="${group.key}"><legend>${escapeTooltip(group.title)}</legend>${await render(formFields(group.fields, data[group.key], `${group.key}.`))}</fieldset>`;
  return foundry.applications.api.DialogV2.prompt({ window: { title, resizable: true }, position: { width: 700 },
    classes: ["witcher-eliott", "witcher-record-editor"], content,
    ok: { label: "WITCHER.Lifepath.Save", callback: (_event, button) => {
      const flat = Object.fromEntries(new FormData(button.form));
      for (const field of flatFields) {
        if (field.type === "number") flat[field.key] = Math.max(field.min, Math.trunc(Number(flat[field.key]) || 0));
      }
      return foundry.utils.expandObject(flat);
    } }, rejectClose: false,
    render: (_event, dialog) => {
      const refresh = () => {
        const values = foundry.utils.expandObject(Object.fromEntries(new FormData(dialog.element.querySelector("form") ?? dialog.element)));
        for (const group of groups) dialog.element.querySelector(`[data-field-group="${group.key}"]`).hidden = !visible(group, values);
        for (const field of flatFields) {
          dialog.element.querySelector(`[data-record-field="${field.key}"]`).hidden = !visible(field, values);
          const hint = dialog.element.querySelector(`[data-field-description="${field.key}"]`);
          hint.textContent = field.choices?.find(option => option.id === valueAt(values, field.key))?.description ?? "";
        }
      };
      dialog.element.addEventListener("change", refresh);
      refresh();
    }
  });
}

const queues = new WeakMap();
export function updatePathRecords(actor, path, transform) {
  const work = (queues.get(actor) ?? Promise.resolve()).then(() => actor.isOwner
    ? actor.update({ [`system.${path}`]: transform(foundry.utils.deepClone(valueAt(actor.system, path))) }) : undefined);
  queues.set(actor, work.catch(() => {}));
  return work;
}
export async function editWitcherPath() {
  if (!this.isEditable || this.actor.system.details.race !== "witcher") return;
  const value = await editStructuredRecord("Жизненный путь ведьмака", WITCHER_CREATION_FIELDS, [], this.actor.system.lifepath.witcher);
  if (value && this.isEditable) await this.actor.update(Object.fromEntries(Object.entries(value).map(([key, value]) => [`system.lifepath.witcher.${key}`, value])));
}
export async function editDecade(_event, target) {
  if (!this.isEditable || this.actor.system.details.race !== "witcher") return;
  const path = this.actor.system.lifepath.witcher;
  const previous = path.decades.find(entry => entry.id === target.dataset.entryId);
  const id = previous?.id ?? foundry.utils.randomID();
  const value = await editStructuredRecord("Десятилетие на Пути", DECADE_FIELDS, DECADE_GROUPS, previous ?? {
    age: nextRecordAge(path.decades, path.pathStartAge || 20), risk: "normal", outcome: "nothing", danger: { kind: "none" }
  });
  if (!value || !this.isEditable) return;
  await updatePathRecords(this.actor, "lifepath.witcher.decades", entries => previous
    ? entries.map(entry => entry.id === id ? { ...value, id } : entry) : [...entries, { ...value, id }]);
}
export async function removeDecade(_event, target) {
  if (!this.isEditable) return;
  if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Удалить десятилетие?" }, content: "<p>Будет удалена только эта запись жизненного пути.</p>" }))
    await updatePathRecords(this.actor, "lifepath.witcher.decades", entries => entries.filter(entry => entry.id !== target.dataset.entryId));
}

export async function rollDecade() {
  if (!this.isEditable || this.actor.system.details.race !== "witcher") return;
  const path = this.actor.system.lifepath.witcher;
  const choice = await editStructuredRecord("Риск десятилетия", DECADE_FIELDS.slice(0, 2), [], { age: nextRecordAge(path.decades, path.pathStartAge || 20), risk: "normal" });
  if (!choice) return;
  const rolls = [];
  const entry = await generateDecade(choice.age, choice.risk, async faces => {
    const roll = await new foundry.dice.Roll(`1d${faces}`).evaluate({ allowInteractive: false });
    rolls.push(roll); return roll.total;
  });
  await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this.actor }),
    flavor: "Жизненный путь: десятилетие ведьмака", rolls, flags: { [SYSTEM_ID]: { skipLuck: true } } }, { messageMode: game.settings.get("core", "messageMode") });
  const result = await editStructuredRecord("Результат десятилетия", DECADE_FIELDS, DECADE_GROUPS, entry);
  if (result && this.isEditable) await updatePathRecords(this.actor, "lifepath.witcher.decades", entries => [...entries, { ...result, id: foundry.utils.randomID() }]);
}

async function saveLifeEvent(sheet, previous, initial) {
  let data = initial;
  while (sheet.isEditable) {
    data = await editStructuredRecord("Жизненное событие", LIFE_EVENT_FIELDS, LIFE_EVENT_GROUPS, data);
    if (!data) return;
    const error = validateLifeEvent(data);
    if (error) { ui.notifications.warn(error); continue; }
    const id = previous?.id ?? foundry.utils.randomID();
    await updatePathRecords(sheet.actor, "lifepath.events", entries => previous
      ? entries.map(entry => entry.id === id ? { ...data, id } : entry) : [...entries, { ...data, id }]);
    const language = data.kind === "fortune" && data.fortune.result === "teacher" && getLanguage(data.fortune.skill);
    if (language) await addLanguageFromItem(sheet.actor, { type: "language", name: game.i18n.localize(language.name), system: { ruleId: language.id } });
    return;
  }
}
export async function editLifeEvent(_event, target) {
  if (!this.isEditable || this.actor.system.details.race === "witcher") return;
  const events = this.actor.system.lifepath.events;
  const previous = events.find(entry => entry.id === target.dataset.entryId);
  await saveLifeEvent(this, previous, previous ?? { age: nextRecordAge(events), kind: "fortune" });
}
export async function removeLifeEvent(_event, target) {
  if (!this.isEditable) return;
  if (await foundry.applications.api.DialogV2.confirm({ window: { title: "Удалить событие?" }, content: "<p>Будет удалена только эта запись жизненного пути.</p>" }))
    await updatePathRecords(this.actor, "lifepath.events", entries => entries.filter(entry => entry.id !== target.dataset.entryId));
}
export async function rollLifeEvent() {
  if (!this.isEditable || this.actor.system.details.race === "witcher") return;
  const rolls = [];
  const data = await generateLifeEvent(nextRecordAge(this.actor.system.lifepath.events), async faces => {
    const roll = await new foundry.dice.Roll(`1d${faces}`).evaluate({ allowInteractive: false });
    rolls.push(roll); return roll.total;
  });
  await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this.actor }),
    flavor: "Жизненное событие", rolls, flags: { [SYSTEM_ID]: { skipLuck: true } } }, { messageMode: game.settings.get("core", "messageMode") });
  await saveLifeEvent(this, null, data);
}
