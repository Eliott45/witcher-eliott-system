import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

const fields = [["attributes.speed", "Скорость"], ["skills.dodgeEscape", "Уклонение/Изворотливость"], ["skills.athletics", "Атлетика"]];
export function mobilityEffectData(name, values) {
  const modifiers = fields.map(([target], i) => {
    const value = Number(values[i]?.value), factor = Number(values[i]?.factor);
    if (!Number.isFinite(value) || value > 0 || !Number.isFinite(factor) || factor < 0 || factor > 1) throw new Error("Укажите штраф не выше 0 и множитель от 0 до 1.");
    return { target, value, factor };
  });
  return { name: name.trim() || "Ограничение подвижности", img: "icons/svg/downgrade.svg", description: `<p>Постоянное ограничение подвижности. При использовании инвалидной коляски эти штрафы снимаются.</p><p>${fields.map(([, label], i) => `${label}: ${modifiers[i].value}, ×${modifiers[i].factor}`).join("; ")}</p>`,
    flags: { [SYSTEM_ID]: { condition: { key: "mobility-disability", disability: true, modifiers } } } };
}
export async function editMobility(actor, effect = null) {
  if (!actor.isOwner) return;
  if (effect && !effect.flags?.[SYSTEM_ID]?.condition?.disability) return;
  const modifiers = effect?.flags?.[SYSTEM_ID]?.condition?.modifiers ?? [];
  const answer = await foundry.applications.api.DialogV2.prompt({ window: { title: "Ограничение подвижности" }, position: { width: 540 }, rejectClose: false,
    content: `<p>Для особенностей персонажа, не связанных с критическим ранением. Укажите согласованные с ведущим штрафы: коляска будет автоматически снимать их.</p><label>Название<input name="name" value="${esc(effect?.name ?? "Ограничение подвижности")}"></label>${fields.map(([target, label], i) => {
      const mod = modifiers.find(mod => mod.target === target);
      return `<fieldset><legend>${label}</legend><label>Штраф<input type="number" name="value${i}" max="0" value="${mod?.value ?? 0}"></label><label>Множитель<input type="number" name="factor${i}" min="0" max="1" step="0.01" value="${mod?.factor ?? 1}"></label></fieldset>`;
    }).join("")}<p>Например, −2 или ×0.5. Без штрафа: 0 и ×1.</p>`,
    ok: { label: "Сохранить", callback: (_event, button) => mobilityEffectData(button.form.elements.name.value, fields.map((_, i) => ({ value: button.form.elements[`value${i}`].value, factor: button.form.elements[`factor${i}`].value }))) } });
  if (!answer || typeof answer !== "object") return;
  if (effect) return effect.update(answer);
  return actor.createEmbeddedDocuments("ActiveEffect", [answer]);
}
