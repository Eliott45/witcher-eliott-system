import { RACES } from "../scripts/data/races.mjs";
import { RACE_DOCUMENT_IDS, ABILITY_DOCUMENT_IDS, abilityUuid } from "../scripts/data/compendiums.mjs";

const escapeHTML = text => text.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function compendiumData(translations) {
  const localize = key => key.split(".").reduce((value, part) => value[part], translations);
  const paragraph = key => key ? `<p>${escapeHTML(localize(key))}</p>` : "";
  const item = (id, type, entry, system) => ({
    _id: id,
    name: localize(entry.label),
    type,
    img: type === "race" ? "icons/svg/mystery-man.svg" : "icons/svg/aura.svg",
    system: { ruleId: entry.id, ...system },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 2 },
    flags: {}
  });
  return {
    races: RACES.map(race => item(RACE_DOCUMENT_IDS[race.id], "race", race, {
      description: paragraph(race.note),
      abilities: race.abilities.map(ability => abilityUuid(ability.id))
    })),
    abilities: RACES.flatMap(race => race.abilities.map(ability => item(
      ABILITY_DOCUMENT_IDS[ability.id], "ability", ability, { description: paragraph(ability.description) }
    )))
  };
}
