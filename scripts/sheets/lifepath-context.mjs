import { SYSTEM_ID } from "../config.mjs";
import { WITCHER_CREATION_FIELDS, DECADE_FIELDS, DECADE_GROUPS, formFields } from "../data/lifepath-fields.mjs";
import { WITCHER_RISKS, witcherTrialModifier } from "../data/witcher-lifepath.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";
import { generateDecade } from "../data/witcher-decades.mjs";

const valueAt = (data, key) => key.split(".").reduce((value, part) => value?.[part], data);
const visible = (group, data) => !group.when || valueAt(data, group.when[0]) === group.when[1];
export const summarizeFields = (fields, data) => formFields(fields, data).filter(field => visible(field, data) && field.value !== "" && field.value !== 0)
  .map(field => ({ label: field.label, value: field.isChoice ? game.i18n.localize(field.choices.find(option => option.selected)?.name ?? "—") : field.value, description: field.description }));
export function lifepathContext(actor) {
  const path = actor.system.lifepath.witcher;
  return { isWitcher: actor.system.details.race === "witcher", creation: summarizeFields(WITCHER_CREATION_FIELDS, path),
    trialModifier: witcherTrialModifier(path), decades: path.decades.map(entry => ({ id: entry.id,
      title: `${entry.age}–${entry.age + 9} · ${WITCHER_RISKS.find(risk => risk.id === entry.risk)?.name ?? "—"}`,
      summary: [...summarizeFields(DECADE_FIELDS.filter(field => field.key !== "age"), entry),
        ...DECADE_GROUPS.filter(group => visible(group, entry)).flatMap(group => summarizeFields(group.fields, entry[group.key]))] })) };
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
    age: (path.pathStartAge || 20) + path.decades.length * 10, risk: "normal", outcome: "nothing", danger: { kind: "none" }
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
  const choice = await editStructuredRecord("Риск десятилетия", DECADE_FIELDS.slice(0, 2), [], { age: (path.pathStartAge || 20) + path.decades.length * 10, risk: "normal" });
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
