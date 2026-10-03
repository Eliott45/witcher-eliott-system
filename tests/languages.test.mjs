import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { LANGUAGES, getLanguage, languageForEntry, addLanguageFromItem, updateLanguages } from "../scripts/data/languages.mjs";
import { languageUuid } from "../scripts/data/compendiums.mjs";
import { compendiumData } from "../tools/compendium-data.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url)));
const localize = key => key.split(".").reduce((value, part) => value[part], translations);
const pack = compendiumData(translations).languages;
globalThis.game = { i18n: { localize } };
function character() {
  return { uuid: "Actor.languages", isOwner: true, system: { languages: [] },
    async update(changes) { await Promise.resolve(); this.system.languages = structuredClone(changes["system.languages"]); }
  };
}

test("three language references have stable UUIDs, independent skill names and double-cost descriptions", () => {
  assert.equal(pack.length, 3);
  for (const [index, entry] of pack.entries()) {
    assert.equal(entry.type, "language");
    assert.equal(entry.name, localize(LANGUAGES[index].label));
    assert.ok(entry.name.endsWith("(2)"));
    assert.ok(entry.system.description.includes("двойную стоимость"));
    assert.ok(entry.system.description.includes("ИНТ + уровень"));
    assert.equal(entry.effects.length, 0);
    assert.ok(languageUuid(entry.system.ruleId).endsWith(`.Item.${entry._id}`));
    assert.equal(getLanguage(entry._id).id, entry.system.ruleId);
  }
  assert.match(pack[1].system.description, /Скеллиге/);
  assert.match(pack[1].system.description, /кроме краснолюдов/);
  assert.equal(languageUuid("unknown"), null);
});

test("parallel drops add three separate skills, duplicate drops preserve levels and renamed canonical entries", async () => {
  const actor = character();
  await Promise.all(pack.map(item => addLanguageFromItem(actor, item)));
  assert.equal(actor.system.languages.length, 3);
  assert.deepEqual(actor.system.languages.map(entry => entry.level), [0, 0, 0]);
  const commonId = LANGUAGES[0].documentId;
  actor.system.languages[0].level = 8;
  actor.system.languages[0].name = "Мой диалект всеобщего";
  await Promise.all([addLanguageFromItem(actor, pack[0]), updateLanguages(actor, entries => entries.map(entry => entry.id === commonId ? { ...entry, level: 9 } : entry)), addLanguageFromItem(actor, pack[0])]);
  assert.equal(actor.system.languages.length, 3);
  assert.equal(actor.system.languages[0].level, 9);
  assert.equal(actor.system.languages[0].name, "Мой диалект всеобщего");
});

test("existing named language skills are recognized in both languages without renaming or resetting", async () => {
  for (const language of LANGUAGES) for (const name of [...language.aliases, localize(language.label)]) {
    const actor = character();
    actor.system.languages = [{ id: "legacy", name, level: 6 }];
    assert.equal(languageForEntry(actor.system.languages[0]).id, language.id);
    assert.equal(await addLanguageFromItem(actor, pack.find(item => item.system.ruleId === language.id)), null);
    assert.deepEqual(actor.system.languages, [{ id: "legacy", name, level: 6 }]);
  }
});

test("read-only actors and non-language drops do not change data; failed updates release the write queue", async () => {
  const actor = character();
  actor.isOwner = false;
  await addLanguageFromItem(actor, pack[0]);
  assert.deepEqual(actor.system.languages, []);
  actor.isOwner = true;
  await addLanguageFromItem(actor, { ...pack[0], type: "equipment" });
  assert.deepEqual(actor.system.languages, []);
  const update = actor.update;
  actor.update = async () => { throw new Error("Write failed"); };
  await assert.rejects(addLanguageFromItem(actor, pack[0]), /Write failed/);
  actor.update = update;
  await addLanguageFromItem(actor, pack[1]);
  assert.deepEqual(actor.system.languages.map(entry => entry.name), ["Старшая Речь"]);
});
