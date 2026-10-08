/** Core p.256. Stable identities also resolve installations made before ruleId was stored. */
const RUNES = ["chernobog", "dazhbog", "devana", "morana", "perun", "stribog", "svarog", "triglav", "veles", "zoria"];
const GLYPHS = ["magic", "air", "earth", "fire", "water"];
const NAMES = ["Чернобог", "Даждьбог", "Девана", "Марена", "Перун", "Стрибог", "Сварог", "Триглав", "Велес", "Зоря"];
const GLYPH_NAMES = ["Магия", "Воздух", "Земля", "Огонь", "Вода"];
const IDS = new Map([...RUNES.map((id, i) => [`upgr${String(i + 1).padStart(12, "0")}`, `rune.${id}`]),
  ...GLYPHS.map((id, i) => [`upgr${String(i + 101).padStart(12, "0")}`, `glyph.${id}`])]);
const LEGACY_NAMES = new Map([...RUNES.map((id, i) => [`Руна ${NAMES[i]}`, `rune.${id}`]),
  ...GLYPHS.map((id, i) => [`Глиф: ${GLYPH_NAMES[i]}`, `glyph.${id}`])]);

export function runeGlyphRuleId(entry) {
  if (entry.ruleId) return entry.ruleId;
  const source = IDS.get(String(entry.sourceUuid ?? "").split(".").at(-1));
  if (source) return source;
  // Old world-item installations kept only the consumed item's UUID and printed name.
  const legacy = LEGACY_NAMES.get(entry.name);
  return legacy?.startsWith(`${entry.category}.`) ? legacy : "";
}
export const installedRune = (item, id) => item?.type === "weapon" && (item.system?.installations ?? [])
  .some(entry => entry.category === "rune" && runeGlyphRuleId(entry) === `rune.${id}`);

/** A glyph of magic concerns mixed magic, not all five elements. Repeated copies confer one effect. */
export function matchingGlyphs(items, spell) {
  const system = spell?.system ?? spell;
  const element = system?.element ?? "mixed", id = `glyph.${element === "mixed" ? "magic" : element}`;
  const result = [];
  for (const item of items) {
    if (item.type !== "armor") continue;
    for (const entry of item.system.installations ?? []) if (entry.category === "glyph" && runeGlyphRuleId(entry) === id)
      result.push({ ruleId: id, name: entry.name, itemId: item.id, itemName: item.name });
  }
  return result;
}

export function glyphBonus(glyphs, choice = "dc") {
  if (!glyphs.length) return { choice: "", dc: 0, damageDice: 0, sources: [] };
  if (!["dc", "damage"].includes(choice)) throw new Error("Выберите бонус глифа: +3 к СЛ или +1d6 урона.");
  return { choice, dc: choice === "dc" ? 3 : 0, damageDice: choice === "damage" ? 1 : 0, sources: glyphs };
}

/** Improved focusing increases spell-established DCs, not the casting/attack check (Sage #20). */
export function greaterFocusFor(properties, spell = null) {
  const element = (spell?.system ?? spell)?.element;
  const matches = Array.from(String(properties ?? "").matchAll(/Улучшенное\s+фокусирующее(?:\s*\(([^)]*)\))?/giu));
  return matches.some(match => !match[1] || !element || ({ air: /воздух/iu, earth: /земл/iu, fire: /ог[но]/iu,
    water: /вод/iu, mixed: /смешан|^магия$/iu })[element]?.test(match[1]));
}

export function spellDamageWithGlyph(formula, bonus = {}) {
  return formula && bonus.damageDice > 0 ? `(${formula}) + ${bonus.damageDice}d6` : formula || null;
}

/** Only DCs imposed by a spell's effect; the ritual casting DC and rolls remain untouched. */
export function spellDescriptionWithDC(description, bonus = 0) {
  if (!(bonus > 0)) return String(description ?? "");
  return String(description ?? "").replace(/(СЛ\s*:?\s*)(\d+)/gu, (_match, label, number) => `${label}${Number(number) + bonus}`);
}
