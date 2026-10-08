import { WITCHER_SPECIAL_EQUIPMENT } from "../data/witcher-special-equipment.mjs";

const oldRavenLegend = "<p>Лёгкий комплект из легенды о ведьмаке Вороне и Чёрном Драконе. Историю можно вспомнить Образованием СЛ 14.</p>";
const ravenLegend = WITCHER_SPECIAL_EQUIPMENT.find(item => item.id === "armor.raven").system.description.match(/^<p>.*?<\/p>/u)[0];

/** Replace only the exact shipped legend; retain custom prose, condition, bonuses and embedded IDs. */
export function relicArmorContentUpdate(item) {
  if (item.system?.ruleId !== "armor.raven") return {};
  const before = String(item.system.description ?? ""), after = before.replace(oldRavenLegend, ravenLegend);
  return after === before ? {} : { "system.description": after };
}
