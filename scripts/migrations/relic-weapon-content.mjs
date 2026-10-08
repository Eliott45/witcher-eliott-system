import { RELIC_WEAPONS } from "../data/relic-weapons.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";

const old = {
  "weapon.wolf": "<p>Стальной полуторный меч с островов Скеллиге, связанный с легендой об Уффе Кровавобородом. Историю можно вспомнить Образованием СЛ 16. Игнорирует сопротивление брони типу урона; при нанесении урона вызывает кровотечение с вероятностью 75%.</p>",
  "weapon.moon-blade": "<p>Серебряный полуторный меч из легенды о ведьмаке Олеке и демоне из Элландера. История: Образование СЛ 18. По уязвимым к серебру чудовищам дополнительно наносит [[/r 7d6+4]] серебряного урона. Улучшенное фокусирующее повышает на 2 СЛ проверок против заклинаний, сотворённых с этим оружием (стр. 72). Серебряный урон применяется отдельно от обычного.</p>"
};

/** Extend only exact shipped descriptions. Renames, notes, damage, runes, oils and condition are preserved. */
export function relicWeaponContentUpdate(item) {
  const id = item.system?.ruleId, previous = old[id];
  if (!previous) return {};
  const canonical = stripPageReferences(RELIC_WEAPONS.find(entry => entry.id === id).system.description);
  const before = String(item.system.description ?? "");
  let after = before.replace(previous, canonical);
  if (after === before) after = before.replace(stripPageReferences(previous), canonical);
  return before === after ? {} : { "system.description": after };
}
