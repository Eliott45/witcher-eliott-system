import { MACRO_SOURCES } from "../scripts/data/macros.mjs";
import { spellSources, spellFolders } from "../scripts/data/spells.mjs";
import { bestiarySources, bestiaryFolders } from "../scripts/data/bestiary.mjs";
import { pregenSources } from "../scripts/data/pregens.mjs";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { ALCHEMY, MUTAGENS } from "../scripts/data/workshop-alchemy.mjs";
import { UPGRADES } from "../scripts/data/workshop-upgrades.mjs";
import { RECIPES } from "../scripts/data/workshop-recipes.mjs";
import { PROFESSIONS, PROFESSION_ABILITIES } from "../scripts/data/professions.mjs";
import { RACES } from "../scripts/data/races.mjs";
import { ORIGINS, ORIGIN_GROUPS } from "../scripts/data/origins.mjs";
import { RACE_DOCUMENT_IDS, ABILITY_DOCUMENT_IDS, abilityUuid, equipmentUuid } from "../scripts/data/compendiums.mjs";
import { FAMILY_STATUSES, FAMILY_GROUPS } from "../scripts/data/family-statuses.mjs";
import { EQUIPMENT, EQUIPMENT_FOLDERS, getEquipment } from "../scripts/data/equipment.mjs";
import { INFLUENTIAL_FRIENDS } from "../scripts/data/influential-friends.mjs";
import { LANGUAGES } from "../scripts/data/languages.mjs";
import { CORE_EQUIPMENT, LEGACY_GEAR_STATS } from "../scripts/data/core-equipment.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { EXPERIMENTAL_DEVICES } from "../scripts/data/experimental-devices.mjs";
import { generalGearContent } from "../scripts/data/general-gear.mjs";
import { defaultItemIcon } from "../scripts/data/item-icons.mjs";
import { itemLore, stripPageReferences } from "../scripts/data/item-lore.mjs";
import { EFFECT_TEMPLATES, conditionSource } from "../scripts/data/condition-definitions.mjs";
import { CRITICAL_WOUND_SOURCES } from "../scripts/combat/critical-wound-effects.mjs";
import { RADOLF_UPGRADES, RADOLF_POTIONS } from "../scripts/data/radolf-additions.mjs";
import { RADOLF_EQUIPMENT, RADOLF_FOLDER } from "../scripts/data/radolf-equipment.mjs";
import { PEASANT_WEAPONS } from "../scripts/data/peasant-equipment.mjs";
import { peasantReference } from "../scripts/data/peasant-descriptions.mjs";

const coreFolders = { radolf: RADOLF_FOLDER, transport: {id:"gearTransport001",name:"Транспорт"}, tack: {id:"gearTack00000001",name:"Упряжь и седельные сумки"}, materials: {id:"gearMaterials001",name:"Материалы и ингредиенты"}, alchemy:{id:"gearAlchemy00001",name:"Алхимия"}, mutagens:{id:"gearMutagens0001",name:"Мутагены"}, upgrades:{id:"gearUpgrades0001",name:"Улучшения"}, recipes:{id:"gearRecipes00001",name:"Чертежи и формулы"}, weapons: { id: "gearFolderWeapon", name: "Оружие и щиты" }, ammunition: { id: "gearAmmo00000001", name: "Боеприпасы" }, armor: { id: "gearFolderArmors", name: "Броня" }, tools: { id: "gearFolderTools1", name: "Инструменты" }, core: { id: "gearFolderCore01", name: "Снаряжение" } };

const escapeHTML = text => text.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function compendiumData(translations) {
  const localize = key => key.split(".").reduce((value, part) => value[part], translations);
  const paragraph = key => key ? `<p>${escapeHTML(localize(key))}</p>` : "";
  const item = (id, type, entry, system) => ({
    _id: id,
    name: ["familyStatus", "influence"].includes(type) ? `${localize(entry.label)} — ${localize(FAMILY_GROUPS[entry.group])}` : entry.label ? localize(entry.label) : entry.name,
    type,
    img: ({ race: "icons/svg/mystery-man.svg", origin: "icons/svg/village.svg", familyStatus: "icons/svg/house.svg", equipment: "icons/svg/item-bag.svg", influence: "icons/svg/upgrade.svg", language: "icons/svg/book.svg" })[type] ?? "icons/svg/aura.svg",
    system: { ruleId: entry.id, ...system },
    effects: [],
    folder: coreFolders[entry.source]?.id ?? (type === "equipment" ? EQUIPMENT_FOLDERS[entry.source]?.id ?? null : null),
    sort: 0,
    ownership: { default: 2 },
    flags: entry.flags ?? {}
  });
  const professionAbility = entry => ({...item(entry.documentId, "ability", entry, { description: '<p>' + escapeHTML(entry.description) + '</p>' + peasantReference(entry.id) + '<p>' + escapeHTML(entry.profession === 'peasant' ? entry.source : 'Базовая книга, дерево профессии.') + '</p>', level: 0, attribute: entry.attribute }), folder: getProfessionFolder(entry.profession)});
  const packs = {
    bestiary: bestiarySources(),
    effects: [...EFFECT_TEMPLATES.map(entry=>conditionSource(entry,text=>text.startsWith("WITCHER.")?localize(text):text)), ...structuredClone(CRITICAL_WOUND_SOURCES)],
    professions: PROFESSIONS.map(entry => item(entry.documentId, "profession", entry, { description: '<p>' + escapeHTML(entry.id === 'peasant' ? entry.source : 'Базовая книга.') + '</p>' + (entry.note ? '<p>' + escapeHTML(entry.note) + '</p>' : '') + '<p>Предел магии: ' + entry.vigor + '. ' + escapeHTML(entry.magic) + '</p><p>' + entry.skills.map(key => localize('WITCHER.Skills.Entries.' + key + '.Label')).join(', ') + '</p><p>Языков на выбор: ' + entry.languageChoices + '. Снаряжение — выберите ' + entry.equipmentChoices + ': ' + escapeHTML(entry.equipment) + '</p><p>' + entry.abilities.map(ability => '@UUID[Compendium.witcher-eliott-system.abilities.Item.' + ability.documentId + ']{' + ability.name + '}').join('<br>') + '</p>' })),
    languages: LANGUAGES.map(language => item(language.documentId, "language", language, {
      description: paragraph(language.description) + paragraph("WITCHER.Languages.Rules")
    })),
    races: RACES.map(race => item(RACE_DOCUMENT_IDS[race.id], "race", race, {
      description: paragraph(race.note),
      abilities: race.abilities.map(ability => abilityUuid(ability.id))
    })),
    abilities: [...PROFESSION_ABILITIES.map(professionAbility), ...RACES.flatMap(race => race.abilities.map(ability => item(
      ABILITY_DOCUMENT_IDS[ability.id], "ability", ability, { description: paragraph(ability.description), level: 0, attribute: "" }
    )))],
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
    spells: spellSources(),
    equipment: [...EQUIPMENT.map(entry => {
      const content = generalGearContent(entry.id);
      const gear = item(entry.documentId, "equipment", entry, { ...LEGACY_GEAR_STATS[entry.id], ...content, description: stripPageReferences(paragraph(entry.description) + (content?.description ?? "")) });
      gear.system.description ||= itemLore(gear);
      return gear;
    }),
      ...[...PEASANT_WEAPONS, ...RADOLF_UPGRADES, ...RADOLF_POTIONS, ...RADOLF_EQUIPMENT, ...CORE_EQUIPMENT, ...WITCHER_SPECIAL_EQUIPMENT, ...EXPERIMENTAL_DEVICES, ...MATERIALS, ...ALCHEMY, ...MUTAGENS, ...UPGRADES, ...RECIPES].map(entry => ({ ...item(entry.documentId, entry.type, entry, { ...entry.system, description: stripPageReferences(entry.system.description ?? "") || itemLore(entry) }),
        img: entry.img ?? defaultItemIcon(entry) }))],
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
  return { ...packs, macros:structuredClone(MACRO_SOURCES), pregens: pregenSources(packs) };
}

/** Folders inside a compendium, distinct from the world sidebar's Witcher pack folder. */
export function compendiumFolders(translations) {
  const localize = key => key.split(".").reduce((value, part) => value[part], translations);
  return { bestiary: bestiaryFolders(), spells: spellFolders(), abilities: PROFESSIONS.map(entry => ({ _id: getProfessionFolder(entry.id), name: entry.name, type: "Item", description: "", folder: null, sorting: "a", sort: 0, color: "#947641", flags: {} })), equipment: Object.values(EQUIPMENT_FOLDERS).map(folder => ({
    _id: folder.id, name: localize(folder.label), type: "Item", description: "",
    folder: null, sorting: "a", sort: 0, color: "#947641", flags: {}
  })).concat(Object.values(coreFolders).map(folder => ({ _id: folder.id, name: folder.name, type: "Item", description: "", folder: null, sorting: "a", sort: 0, color: "#947641", flags: {} }))) };
}

const getProfessionFolder = id => `prfd${String(PROFESSIONS.findIndex(entry => entry.id === id) + 1).padStart(12, "0")}`;
