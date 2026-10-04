import { queueActorWrite } from "./actor-writes.mjs";
// Stable compendium IDs also identify the corresponding entries on the actor.
export const LANGUAGES = [
  { id: "language.common", documentId: "lang000000000001", name: "WITCHER.Languages.Common.Name", label: "WITCHER.Languages.Common.Label",
    description: "WITCHER.Languages.Common.Description", aliases: ["Всеобщий", "Всеобщий язык", "Common Speech", "Common"] },
  { id: "language.elder", documentId: "lang000000000002", name: "WITCHER.Languages.Elder.Name", label: "WITCHER.Languages.Elder.Label",
    description: "WITCHER.Languages.Elder.Description", aliases: ["Старшая Речь", "Elder Speech"] },
  { id: "language.dwarven", documentId: "lang000000000003", name: "WITCHER.Languages.Dwarven.Name", label: "WITCHER.Languages.Dwarven.Label",
    description: "WITCHER.Languages.Dwarven.Description", aliases: ["Краснолюдский", "Краснолюдский язык", "Dwarven"] }
];

export function getLanguage(id) {
  return LANGUAGES.find(language => language.id === id || language.documentId === id) ?? null;
}

const normalizeName = name => name.toLocaleLowerCase().replaceAll("ё", "е").replace(/^(язык|language)\s*:\s*/, "")
  .replace(/\s*\(2\)\s*$/, "").trim();

export function languageForEntry(entry) {
  return getLanguage(entry.id) ?? LANGUAGES.find(language => language.aliases.some(name => normalizeName(name) === normalizeName(entry.name))) ?? null;
}

// Serialize all array writes so dropping several languages or editing during a drop preserves both changes.
export function updateLanguages(actor, transform) {
  if (!actor.isOwner) return Promise.resolve(null);
  return queueActorWrite(actor, async () => {
    if (!actor.isOwner) return null;
    const languages = transform(actor.system.languages.map(entry => ({ ...entry })));
    if (!languages) return null;
    await actor.update({ "system.languages": languages });
    return languages;
  });
}

export function addLanguageFromItem(actor, item) {
  if (item.type !== "language") return Promise.resolve(null);
  const language = getLanguage(item.system.ruleId);
  const name = language ? game.i18n.localize(language.name) : item.name.trim();
  return updateLanguages(actor, entries => {
    if (!name || entries.some(entry => (language && languageForEntry(entry)?.id === language.id)
      || normalizeName(entry.name) === normalizeName(name))) return null;
    return [...entries, { id: language?.documentId ?? foundry.utils.randomID(), name, level: 0 }];
  });
}
