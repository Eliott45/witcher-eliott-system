import { RACES } from "../scripts/data/races.mjs";
import { ORIGINS, ORIGIN_GROUPS } from "../scripts/data/origins.mjs";
import { RACE_DOCUMENT_IDS, ABILITY_DOCUMENT_IDS, abilityUuid, equipmentUuid } from "../scripts/data/compendiums.mjs";
import { FAMILY_STATUSES, FAMILY_GROUPS } from "../scripts/data/family-statuses.mjs";
import { EQUIPMENT, EQUIPMENT_FOLDERS, getEquipment } from "../scripts/data/equipment.mjs";
import { INFLUENTIAL_FRIENDS } from "../scripts/data/influential-friends.mjs";

const escapeHTML = text => text.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function compendiumData(translations) {
  const localize = key => key.split(".").reduce((value, part) => value[part], translations);
  const paragraph = key => key ? `<p>${escapeHTML(localize(key))}</p>` : "";
  const item = (id, type, entry, system) => ({
    _id: id,
    name: ["familyStatus", "influence"].includes(type) ? `${localize(entry.label)} — ${localize(FAMILY_GROUPS[entry.group])}` : localize(entry.label),
    type,
    img: ({ race: "icons/svg/mystery-man.svg", origin: "icons/svg/village.svg", familyStatus: "icons/svg/house.svg", equipment: "icons/svg/item-bag.svg", influence: "icons/svg/upgrade.svg" })[type] ?? "icons/svg/aura.svg",
    system: { ruleId: entry.id, ...system },
    effects: [],
    folder: type === "equipment" ? EQUIPMENT_FOLDERS[entry.source].id : null,
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
    ))),
    origins: ORIGINS.map(origin => item(origin.documentId, "origin", origin, {
      region: origin.group,
      description: paragraph(ORIGIN_GROUPS[origin.group]) + paragraph(origin.bonus) + paragraph("WITCHER.Origins.WitcherRule")
    })),
    "family-statuses": FAMILY_STATUSES.map(entry => item(entry.documentId, "familyStatus", entry, {
      region: entry.group, roll: entry.roll,
      description: paragraph(FAMILY_GROUPS[entry.group])
        + `<p>${escapeHTML(localize("WITCHER.Family.Roll"))}: ${entry.roll}</p>`
        + paragraph(entry.description)
        + `<h2>${escapeHTML(localize("WITCHER.Family.Rewards"))}</h2>` + paragraph(entry.reward)
        + (entry.equipment.length ? `<p>${escapeHTML(localize("WITCHER.Family.EquipmentLinks"))}: `
          + entry.equipment.map(id => `@UUID[${equipmentUuid(id)}]{${localize(getEquipment(id).label)}}`).join(", ") + "</p>" : "")
        + paragraph("WITCHER.Family.WitcherRule")
    })),
    equipment: EQUIPMENT.map(entry => item(entry.documentId, "equipment", entry, { description: paragraph(entry.description) })),
    "influential-friends": INFLUENTIAL_FRIENDS.map(entry => item(entry.documentId, "influence", entry, {
      region: entry.group, roll: entry.roll,
      description: paragraph(FAMILY_GROUPS[entry.group])
        + `<p>${escapeHTML(localize("WITCHER.Family.Roll"))}: ${entry.roll}</p>`
        + paragraph(entry.description)
        + `<h2>${escapeHTML(localize("WITCHER.Friends.Equipment"))}</h2><p>`
        + entry.equipment.map(id => `@UUID[${equipmentUuid(id)}]{${localize(getEquipment(id).label)}}`)
          .join(` ${escapeHTML(localize("WITCHER.Friends.Or"))} `) + "</p>"
    }))
  };
}

/** Folders inside a compendium, distinct from the world sidebar's Witcher pack folder. */
export function compendiumFolders(translations) {
  const localize = key => key.split(".").reduce((value, part) => value[part], translations);
  return { equipment: Object.values(EQUIPMENT_FOLDERS).map(folder => ({
    _id: folder.id, name: localize(folder.label), type: "Item", description: "",
    folder: null, sorting: "a", sort: 0, color: "#947641", flags: {}
  })) };
}
