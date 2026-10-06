import { materialAcquisition } from "./material-descriptions.mjs";
import { COMBAT_ACTOR_TYPES } from "../config.mjs";

export function foragingFormula(value) {
  const formula = String(value ?? "").replace(/\s+/g, "").toLowerCase();
  if (/^[1-9]\d{0,3}$/.test(formula)) return formula;
  const match = /^(\d{1,2})d(\d{1,3})(?:\/(\d{1,3}))?$/.exec(formula);
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1 || (match[3] && Number(match[3]) < 1))
    throw new Error("Укажите целое количество или формулу, например 1d10, 2d6 или 1d6 / 2.");
  // Same whole-unit rounding as creature loot. Yield dice never explode.
  return match[3] ? `floor(${formula})` : formula;
}
export function validateForaging(actor, material, options) {
  if (!actor?.isOwner || !COMBAT_ACTOR_TYPES.includes(actor.type)) throw new Error("Выберите доступного персонажа или существо.");
  if (material?.type !== "equipment" || material.system.kind !== "material") throw new Error("Выберите материал для сбора.");
  if (materialAcquisition(material.system) === "trade") throw new Error("Этот материал приобретают или изготавливают; для него не задан сбор в природе.");
  if (!options.confirmed) throw new Error("Подтвердите доступ к источнику и завершение поиска.");
  if (!Number.isFinite(options.minutes) || options.minutes < 0) throw new Error("Укажите затраченное время в минутах.");
  if (options.check && (!Number.isInteger(options.dc) || options.dc <= 0)) throw new Error("Укажите положительную целую СЛ проверки.");
  return foragingFormula(options.formula);
}

export function foragingEntries(materials) {
  return materials.filter(item => item.type === "equipment" && item.system.kind === "material" && materialAcquisition(item.system) !== "trade")
    .map(item => {
      const { location, forageDC, quantityFormula } = item.system.material;
      const group = forageDC > 0 ? "forage" : "harvest";
      return { id: item.uuid, label: item.name, group, groupLabel: group === "forage" ? "Собирательство" : "Добыча из источника",
        summary: [location || "Источник определяет ведущий", forageDC > 0 ? `СЛ ${forageDC}` : "СЛ не задана", quantityFormula ? `${quantityFormula} ед.` : "Количество определяет ведущий"].join(" · "),
        details: [] };
    }).sort((a,b) => a.label.localeCompare(b.label,"ru"));
}
