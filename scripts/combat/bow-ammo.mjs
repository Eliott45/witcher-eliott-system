import { isAmmunition } from "../data/physical-items.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export const isBow = item => item?.type === "weapon" && item.system.skill === "archery" && !item.system.natural;
export const arrowChoices = actor => Array.from(actor.items ?? []).filter(item => isAmmunition(item) && item.system.quantity > 0 && item.system.carried !== false);
export const ammunitionWeapon = (weapon, ammo) => !ammo ? weapon : { ...weapon,
  damageType: ammo.damageType || weapon.damageType,
  properties: [weapon.properties, ammo.properties].filter(Boolean).join("; ") };

export async function chooseArrow(actor, item, count, ammoId) {
  if (!isBow(item)) return null;
  const choices = arrowChoices(actor).filter(ammo => ammo.system.quantity >= count);
  if (!choices.length) throw new Error(`Недостаточно стрел: нужно ${count}.`);
  let chosen = ammoId;
  if (!chosen && choices.length === 1) chosen = choices[0].id;
  if (!chosen) chosen = await foundry.applications.api.DialogV2.prompt({ window: { title: "Стрелы для выстрела" },
    content: `<label>Боеприпасы<select name="ammo">${choices.map(ammo => `<option value="${esc(ammo.id)}">${esc(ammo.name)} · ${ammo.system.quantity} шт.${ammo.system.properties ? ` · ${esc(ammo.system.properties)}` : ""}</option>`).join("")}</select></label>`,
    ok: { label: `Выстрелить · ${count} шт.`, callback: (_event, button) => button.form.elements.ammo.value }, rejectClose: false });
  if (!chosen) return false;
  const ammo = choices.find(entry => entry.id === chosen);
  if (!ammo) throw new Error("Выбранные стрелы недоступны.");
  return { item: ammo, count, name: ammo.name, ruleId: ammo.system.ruleId ?? "", properties: ammo.system.properties ?? "", damageType: ammo.system.damageType ?? "К" };
}
