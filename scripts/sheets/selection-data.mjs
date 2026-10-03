import { RACES } from "../data/races.mjs";
import { ORIGINS, ORIGIN_GROUPS } from "../data/origins.mjs";
import { FAMILY_STATUSES, FAMILY_GROUPS } from "../data/family-statuses.mjs";
import { INFLUENTIAL_FRIENDS } from "../data/influential-friends.mjs";
import { getEquipment } from "../data/equipment.mjs";

export const normalizeSearch = text => text.toLocaleLowerCase().replaceAll("ё", "е").trim();

export function selectionEntries(kind, localize) {
  if (kind === "influentialFriend") return INFLUENTIAL_FRIENDS.map(entry => ({
    id: entry.id, label: localize(entry.label), group: entry.group,
    groupLabel: `${localize(FAMILY_GROUPS[entry.group])} · ${localize("WITCHER.Family.Roll")}: ${entry.roll}`,
    summary: `${localize("WITCHER.Friends.Equipment")}: ${entry.equipment.map(id => localize(getEquipment(id).label)).join(` ${localize("WITCHER.Friends.Or")} `)}`,
    details: [{ name: localize(entry.label), description: localize(entry.description) }]
  }));
  if (kind === "familyStatus") return FAMILY_STATUSES.map(entry => ({
    id: entry.id, label: localize(entry.label), group: entry.group,
    groupLabel: `${localize(FAMILY_GROUPS[entry.group])} · ${localize("WITCHER.Family.Roll")}: ${entry.roll}`,
    summary: localize(entry.reward),
    details: [{ name: localize(entry.label), description: localize(entry.description) }]
  }));
  if (kind === "origin") return ORIGINS.map(origin => ({
    id: origin.id, label: localize(origin.label), group: origin.group,
    groupLabel: localize(ORIGIN_GROUPS[origin.group]), summary: localize(origin.bonus), details: []
  }));
  if (kind !== "race") throw new Error(`Unknown selection kind: ${kind}`);
  return RACES.map(race => ({
    id: race.id, label: localize(race.label), group: race.id === "witcher" ? "mutants" : "peoples",
    groupLabel: localize(race.id === "witcher" ? "WITCHER.Picker.Mutants" : "WITCHER.Picker.Peoples"),
    summary: race.abilities.map(ability => localize(ability.label)).join(" · "),
    details: race.abilities.map(ability => ({ name: localize(ability.label), description: localize(ability.description) }))
  }));
}

export function filterEntries(entries, search = "", group = "") {
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    if (group && entry.group !== group) return false;
    const text = normalizeSearch([entry.label, entry.groupLabel, entry.summary,
      ...entry.details.map(detail => `${detail.name} ${detail.description}`)].join(" "));
    return terms.every(term => text.includes(term));
  });
}
