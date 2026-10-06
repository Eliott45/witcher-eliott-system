import { SYSTEM_ID } from "../config.mjs";

// Core p.157 with errata v4 (row labels and the unarmed column). The row is chosen by how much
// the fumble chain subtracted from the base, so no extra roll is needed.
// `apply` lists automatable consequences: conditions, reliability dice, a Stun save, damage to self.
const row = (min, max, text, apply = {}) => ({ min, max, text, apply });
export const FUMBLE_TABLES = {
  melee: { name: "Атака ближнего боя", rows: [
    row(6, 6, "Оружие проходит вскользь — персонаж ошеломлён.", { status: "staggered" }),
    row(7, 7, "Оружие застревает в ближайшем предмете: нужен 1 раунд, чтобы его достать."),
    row(8, 8, "Оружие сильно повреждено: 1d10 урона надёжности.", { reliability: "1d10" }),
    row(9, 9, "Персонаж случайно ранил себя: бросьте место попадания.", { selfHit: true }),
    row(10, Infinity, "Персонаж ранил ближайшего союзника: место попадания определяется броском.")
  ] },
  armedDefense: { name: "Защита оружием", rows: [
    row(6, 6, "Оружие получает 1d6 урона надёжности.", { reliability: "1d6" }),
    row(7, 7, "Оружие выбито из рук и отлетает на 1d6 м в случайную сторону (таблица разброса)."),
    row(8, 8, "Персонаж сбит с ног и проходит испытание Устойчивости.", { status: "prone", stun: true }),
    row(9, 9, "Оружие получает 2d6 урона надёжности.", { reliability: "2d6" }),
    row(10, Infinity, "Оружие рикошетит в самого персонажа: бросьте место попадания.", { selfHit: true })
  ] },
  ranged: { name: "Дистанционная атака", rows: [
    row(6, 7, "Снаряд или брошенное оружие врезается во что-то и ломается."),
    row(8, 9, "Слетает тетива, арбалет заклинивает или оружие выпадает: 1 раунд на исправление."),
    row(10, Infinity, "Снаряд рикошетит в случайного союзника в пределах дистанции.")
  ] },
  unarmed: { name: "Атака или защита без оружия", rows: [
    row(6, 6, "Персонаж теряет равновесие — ошеломлён.", { status: "staggered" }),
    row(7, 7, "Персонаж спотыкается и падает — сбит с ног.", { status: "prone" }),
    row(8, 8, "Персонаж падает — сбит с ног — и проходит испытание Устойчивости.", { status: "prone", stun: true }),
    row(9, 9, "Падает и бьётся головой: сбит с ног, 1d6 несмертельного урона в голову, испытание Устойчивости.", { status: "prone", stun: true, headDamage: "1d6", nonLethal: true }),
    row(10, Infinity, "Падает: сбит с ног, 1d6 смертельного урона в голову, испытание Устойчивости.", { status: "prone", stun: true, headDamage: "1d6" })
  ] }
};

/** How much a fumble subtracted from one roll, or 0 when the roll was not a fumble. */
export function fumbleMagnitude(roll) {
  const chain = (roll?.dice ?? []).flatMap(die => die.options?.[SYSTEM_ID]?.criticalChains ?? []).find(entry => entry.kind === "fumble");
  return chain ? Math.abs(chain.total) : 0;
}

export function fumbleOutcome(table, magnitude) {
  const definition = FUMBLE_TABLES[table];
  if (!definition || magnitude <= 0) return null;
  const entry = definition.rows.find(item => magnitude >= item.min && magnitude <= item.max);
  return { table, tableName: definition.name, magnitude, text: entry?.text ?? "Без особых последствий.", apply: entry?.apply ?? {}, harmless: !entry };
}
