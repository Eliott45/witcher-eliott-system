import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Use the user's installed core without copying or distributing Foundry source.
// This verifies data schemas and template compilation, not the canvas or browser UI.
assert.ok(process.argv[2], "Usage: node tools/check-foundry.mjs <Foundry resources/app directory>");
const app = pathToFileURL(`${resolve(process.argv[2])}/`);
const core = new URL("common/", app);
await import(new URL("primitives/_module.mjs", core));
globalThis.CONST = await import(new URL("constants.mjs", core));
globalThis.foundry = {
  abstract: await import(new URL("abstract/_module.mjs", core)),
  utils: { ...await import(new URL("utils/_module.mjs", core)) },
  data: {
    fields: await import(new URL("data/fields.mjs", core)),
    ...await import(new URL("data/data.mjs", core))
  },
  documents: await import(new URL("documents/_module.mjs", core))
};
globalThis.getDocumentClass = name => foundry.documents[`Base${name}`];
globalThis.CONFIG = { Token: {}, Actor: { dataModels: {} }, Item: { dataModels: {} } };
globalThis.game = { i18n: { localize: key => key } };
const installed = JSON.parse(await readFile(new URL("package.json", app), "utf8"));
game.release = {
  ...installed.release,
  version: `${installed.release.generation}.${installed.release.build}`,
  maxStableGeneration: installed.release.generation,
  maxGeneration: installed.release.generation
};

const readJSON = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const { default: BaseSystem } = await import(new URL("packages/base-system.mjs", core));
game.system = new BaseSystem(await readJSON("../system.json"));
assert.equal(game.system.grid.distance, 2);
assert.equal(game.system.grid.units, "m");
const [packFolder] = game.system.packFolders;
assert.equal(packFolder.name, "Witcher");
assert.deepEqual(Array.from(packFolder.packs), ["races", "abilities", "origins", "family-statuses", "equipment"]);
game.model = game.system.documentTypes;
game.packs = new Map(game.system.packs.map(pack => [`${game.system.id}.${pack.name}`, { documentName: pack.type }]));
game.user = { id: "testuser00000001", isGM: true };
let preferences = {};
const player = { id: "player0000000001", isGM: false, hasPermission: () => false };
assert.equal(foundry.documents.BaseSetting.metadata.permissions.create(player, {
  _source: { key: `${game.system.id}.sheetPreferences`, user: player.id }
}, {}), true, "An ordinary player may store their personal sheet settings");

const { WitcherActorData } = await import("../scripts/data/witcher-actor-data.mjs");
const { RACES } = await import("../scripts/data/races.mjs");
const { ORIGINS } = await import("../scripts/data/origins.mjs");
const { FAMILY_STATUSES } = await import("../scripts/data/family-statuses.mjs");
const { EQUIPMENT } = await import("../scripts/data/equipment.mjs");
const { updateSheetPreferences } = await import("../scripts/sheets/sheet-preferences.mjs");
const actorData = new WitcherActorData();
assert.equal(actorData.health.value, 0);
actorData.updateSource({ "health.value": 30, "health.max": 40 });
assert.equal(actorData.health.value, 30);
actorData.updateSource({ "health.max": -1 });
assert.equal(actorData.health.max, 0, "Foundry must clamp negative resource limits");

// Old actors gain optional identity fields without losing their entered data.
const legacyActorData = new WitcherActorData({
  health: { value: 21, max: 30 }, stamina: { value: 14, max: 20 }, notes: "Existing combat notes"
});
assert.equal(legacyActorData.details.age, null);
assert.equal(legacyActorData.details.race, "");
assert.equal(legacyActorData.details.gender, "");
assert.equal(legacyActorData.details.origin, "");
assert.equal(legacyActorData.details.familyStatus, "");
const biography = {
  appearance: "Шрам на лице.\nСедые волосы.",
  personality: "Упрямый, но верный слову.",
  allies: "Трактирщик и старая подруга.",
  enemies: "Разбойник, которому мы сорвали сделку.",
  family: { history: "Ремесленники из Махакама.", parents: "Отец — кузнец.\nМать — торговка.", siblings: "Младшая сестра." },
  backstory: "</textarea><script>test</script>\nИстория персонажа.",
  sessionNotes: "Сессия 1: нашли контракт.\nСессия 2: вернулись в город."
};
assert.deepEqual(legacyActorData.toObject().biography, {
  ...Object.fromEntries(Object.keys(biography).map(key => [key, ""])), family: { history: "", parents: "", siblings: "" }
});
legacyActorData.updateSource({ biography });
legacyActorData.updateSource({ "details.age": 230, "details.race": "witcher", "details.gender": "Любой свой текст" });
const restored = new WitcherActorData(JSON.parse(JSON.stringify(legacyActorData.toObject())));
assert.deepEqual(restored.toObject().biography, biography, "Every biography section must survive saving and loading, including line breaks");
restored.updateSource({ "biography.appearance": "" });
assert.equal(restored.biography.appearance, "");
assert.equal(restored.biography.sessionNotes, biography.sessionNotes);
assert.equal(restored.details.age, 230);
assert.equal(restored.details.race, "witcher");
assert.equal(restored.details.gender, "Любой свой текст");
restored.updateSource({ "details.gender": "" });
assert.equal(restored.details.gender, "");
assert.deepEqual(restored.health.toObject?.() ?? restored.health, { value: 21, max: 30 });
assert.equal(restored.stamina.value, 14);
assert.equal(restored.notes, "Existing combat notes");
restored.updateSource({ "details.age": 0 });
assert.equal(restored.details.age, 0);
restored.updateSource({ "details.age": "", "details.race": "" });
assert.equal(restored.details.age, null, "Clearing age must not turn an unknown age into zero");
assert.throws(() => new WitcherActorData({ details: { race: "unknown-race" } }));
assert.throws(() => new WitcherActorData({ details: { origin: "unknown-region" } }));
restored.updateSource({ "details.origin": "redania", "details.race": "human" });
assert.equal(restored.originBonusEligible, true);
restored.updateSource({ "details.familyStatus": "north.mage-ward", "details.race": "human" });
assert.equal(restored.familyRewardEligible, true);
restored.updateSource({ "details.race": "witcher" });
assert.equal(restored.familyRewardEligible, false);
assert.equal(restored.details.familyStatus, "north.mage-ward", "Race changes must preserve background data while suppressing rewards");
assert.throws(() => new WitcherActorData({ details: { familyStatus: "unknown-family" } }));
restored.updateSource({ "details.race": "witcher" });
assert.equal(restored.originBonusEligible, false);
assert.equal(restored.details.origin, "redania", "A witcher retains their biographical region");
const restoredOrigin = new WitcherActorData(JSON.parse(JSON.stringify(restored.toObject())));
assert.equal(restoredOrigin.details.origin, "redania");
assert.equal(restoredOrigin.originBonusEligible, false);
restored.updateSource({ "details.race": "elf" });
assert.equal(restored.originBonusEligible, true);

const { applyActorTokenDefaults } = await import("../scripts/combat/token-defaults.mjs");
const prototype = new foundry.data.PrototypeToken();
applyActorTokenDefaults({
  type: "character",
  updateSource: changes => prototype.updateSource(foundry.utils.expandObject(changes).prototypeToken)
}, {});
assert.equal(prototype.sight.enabled, true);
assert.equal(prototype.sight.angle, 360);
assert.equal(prototype.actorLink, true);
assert.equal(prototype.sight.range, 0);
assert.equal(prototype.bar1.attribute, "health");
assert.equal(prototype.bar2.attribute, "stamina");
assert.equal(prototype.light.bright, 0);

const { WitcherReferenceData } = await import("../scripts/data/witcher-reference-data.mjs");
const { WitcherRaceData } = await import("../scripts/data/witcher-race-data.mjs");
const { WitcherOriginData } = await import("../scripts/data/witcher-origin-data.mjs");
const { WitcherFamilyStatusData } = await import("../scripts/data/witcher-family-status-data.mjs");
const { raceUuid, abilityUuid, originUuid, familyStatusUuid, equipmentUuid } = await import("../scripts/data/compendiums.mjs");
CONFIG.Item.dataModels = { race: WitcherRaceData, ability: WitcherReferenceData, origin: WitcherOriginData, familyStatus: WitcherFamilyStatusData, equipment: WitcherReferenceData };
const documents = new Map();
for (const pack of game.system.packs) {
  for (const source of await readJSON(`../pack-sources/${pack.name}.json`)) {
    const document = new foundry.documents.BaseItem(source);
    await access(new URL(`public/${source.img}`, app));
    assert.equal(document.type, source.type);
    assert.deepEqual(document.system.toObject(), source.system);
    assert.equal(document.effects.size, 0, "Reference items must not contain automated effects");
    const uuid = `Compendium.${game.system.id}.${pack.name}.Item.${document.id}`;
    documents.set(uuid, document);
  }
}
assert.equal(documents.size, 71);
for (const entry of FAMILY_STATUSES) {
  const document = documents.get(familyStatusUuid(entry.id));
  assert.equal(document.type, "familyStatus");
  assert.equal(document.system.region, entry.group);
  assert.equal(document.system.roll, entry.roll);
  for (const id of entry.equipment) {
    assert.equal(documents.get(equipmentUuid(id)).type, "equipment");
    assert.ok(document.system.description.includes(equipmentUuid(id)));
  }
}
for (const entry of EQUIPMENT) assert.equal(documents.get(equipmentUuid(entry.id)).system.description, "");
for (const origin of ORIGINS) {
  const document = documents.get(originUuid(origin.id));
  assert.equal(document.type, "origin");
  assert.equal(document.system.region, origin.group);
  assert.equal(document.system.ruleId, origin.id);
}
for (const race of RACES) {
  const document = documents.get(raceUuid(race.id));
  assert.equal(document.system.ruleId, race.id);
  assert.deepEqual(document.system.abilities, race.abilities.map(ability => abilityUuid(ability.id)));
  for (const uuid of document.system.abilities) assert.equal(documents.get(uuid).type, "ability");
}

const handlebars = createRequire(new URL("package.json", app))("handlebars");
game.settings = {
  get: () => preferences,
  set: async (_system, _key, value) => { preferences = value; }
};
const translations = await readJSON("../lang/ru.json");
handlebars.registerHelper("localize", key => foundry.utils.getProperty(translations, key) ?? key);
handlebars.registerHelper("not", value => !value);
handlebars.registerHelper("disabled", value => value ? "disabled" : "");
const template = handlebars.compile(await readFile(new URL("../templates/actor-sheet.hbs", import.meta.url), "utf8"), { strict: true });
// Use the real sheet context preparation; only the browser application host is stubbed.
foundry.applications = {
  api: { HandlebarsApplicationMixin: Base => Base },
  sheets: { ActorSheetV2: class {
    tabGroups = {};
    async _prepareContext() {
      // Supply ApplicationV2's tab context while keeping its DOM host out of this check.
      const [group, { initial, tabs }] = Object.entries(this.constructor.TABS)[0];
      this.tabGroups[group] ??= initial;
      return {
        editable: this.isEditable, rootId: "test-actor",
        tabs: Object.fromEntries(tabs.map(tab => {
          const active = this.tabGroups[group] === tab.id;
          return [tab.id, { ...tab, group, active, cssClass: active ? "active" : "" }];
        }))
      };
    }
  }, ItemSheetV2: class {
    async _prepareContext() { return { editable: this.isEditable, rootId: "test-item" }; }
  } },
  ux: { TextEditor: { implementation: { enrichHTML: async html => html } } }
};
const { WitcherActorSheet } = await import("../scripts/sheets/witcher-actor-sheet.mjs");
const sheet = new WitcherActorSheet();
sheet.actor = { uuid: "Actor.test", name: "<script>test</script>", img: "icons/svg/mystery-man.svg", type: "character", system: actorData, prototypeToken: prototype };
sheet.token = null;
sheet.isEditable = true;
const html = template(await sheet._prepareContext({}));
assert.ok(!html.includes("<script>test</script>"), "Actor names must be escaped");
assert.ok(html.includes('data-action="showPortraitArtwork"'));
assert.ok(html.includes('data-action="editPortrait"'));
assert.ok(html.includes('name="system.details.age"'));
assert.ok(html.includes('name="system.details.gender"'));
assert.ok(html.includes('data-kind="race"'));
assert.ok(html.includes('data-kind="origin"'));
assert.ok(!html.includes("<select"), "Race and origin must use the browser, not dropdowns");
assert.ok(!html.includes('data-action="viewRace"'), "An unset race has no broken preview button");
assert.ok(!html.includes('name="system.notes"'));
assert.ok(!html.includes("witcher-vision"));
assert.ok(!html.includes("witcher-footnote"));
assert.equal([...html.matchAll(/data-action="tab"/g)].length, 3);
assert.ok(html.includes('data-action="configureTabs"'));
assert.equal([...html.matchAll(/data-biography-section=/g)].length, 9);
assert.match(html, /id="test-actor-main" class="witcher-character-content tab active"/);
assert.match(html, /data-action="chooseReference" data-kind="race"[^>]*>\s*<i class="fa-solid fa-magnifying-glass"/);
assert.match(html, /data-action="chooseReference" data-kind="origin"[^>]*>\s*<i class="fa-solid fa-magnifying-glass"/);
actorData.updateSource({ biography });
sheet.tabGroups.character = "biography";
const biographyHTML = template(await sheet._prepareContext({}));
assert.match(biographyHTML, /id="test-actor-biography" class="witcher-character-content witcher-biography tab active"/);
for (const [key, value] of Object.entries(biography)) {
  if (key === "family") continue;
  assert.ok(biographyHTML.includes(`name="system.biography.${key}"`));
  assert.ok(biographyHTML.includes(handlebars.escapeExpression(value)));
}
for (const [key, value] of Object.entries(biography.family)) {
  assert.ok(biographyHTML.includes(`name="system.biography.family.${key}"`));
  assert.ok(biographyHTML.includes(handlebars.escapeExpression(value)));
}
assert.ok(!biographyHTML.includes("<script>test</script>"), "Biography text must not escape its textarea");
sheet.tabGroups.character = "main";
await updateSheetPreferences(sheet.actor.uuid, { hiddenTabs: ["main"], collapsed: { parents: true, appearance: true } });
const customized = await sheet._prepareContext({});
assert.equal(sheet.tabGroups.character, "biography", "Hiding the active tab must select a visible one");
assert.deepEqual(customized.visibleTabs.map(tab => tab.id), ["biography", "family"]);
assert.equal(customized.familySections.find(section => section.id === "parents").open, false);
assert.equal(customized.biographySections.find(section => section.id === "appearance").open, false);
assert.ok(!template(customized).includes('data-action="tab" data-group="character" data-tab="main"'));
assert.ok(template(customized).includes('data-action="configureTabs"'), "The tab menu must remain accessible");
await updateSheetPreferences(sheet.actor.uuid, { hiddenTabs: [], collapsed: { parents: false, appearance: false } });
sheet.tabGroups.character = "main";

const before = actorData.toObject();
for (const race of RACES) {
  actorData.updateSource({ "details.race": race.id });
  const context = await sheet._prepareContext({});
  assert.equal(context.selectedRace.id, race.id);
  const rendered = template(context);
  assert.ok(rendered.includes('data-action="viewRace"'));
  assert.match(rendered, /data-action="viewRace"[^>]*>\s*<span>[^<]+<\/span>\s*<i class="fa-solid fa-ellipsis-vertical"/);
  for (const ability of race.abilities) {
    assert.ok(!rendered.includes(handlebars.escapeExpression(foundry.utils.getProperty(translations, ability.description))),
      "Racial bonuses must appear in the reference document, not on the actor sheet");
  }
}
assert.deepEqual(actorData.toObject().health, before.health, "Race selection must not apply mechanics");
assert.deepEqual(actorData.toObject().stamina, before.stamina);
assert.equal(actorData.toObject().notes, before.notes);
sheet.isEditable = false;
const readOnlyHTML = template(await sheet._prepareContext({}));
assert.match(readOnlyHTML, /<button[^>]*data-kind="race"[^>]*disabled/);
assert.ok(!readOnlyHTML.includes('data-action="editPortrait"'));
assert.ok(readOnlyHTML.includes('data-action="showPortraitArtwork"'));
assert.match(readOnlyHTML, /<textarea[^>]*name="system.biography.sessionNotes"[^>]*disabled/);
actorData.updateSource({ "details.origin": "mahakam", "details.race": "witcher" });
assert.equal((await sheet._prepareContext({})).originExcluded, true);
assert.ok(template(await sheet._prepareContext({})).includes("witcher-origin-excluded"));
actorData.updateSource({ "details.race": "dwarf" });
assert.equal((await sheet._prepareContext({})).originExcluded, false);
assert.match(template(await sheet._prepareContext({})), /data-action="viewOrigin"[^>]*>\s*<span>[^<]+<\/span>\s*<i class="fa-solid fa-ellipsis-vertical"/);
actorData.updateSource({ "details.familyStatus": "elder.artisans" });
assert.equal((await sheet._prepareContext({})).showFamilyStatus, true);
assert.ok(template(await sheet._prepareContext({})).includes('data-action="viewFamilyStatus"'));
actorData.updateSource({ "details.race": "witcher" });
const witcherHTML = template(await sheet._prepareContext({}));
assert.ok(!witcherHTML.includes('data-kind="familyStatus"'));
assert.ok(!witcherHTML.includes('data-action="viewFamilyStatus"'));
assert.ok(witcherHTML.includes('name="system.biography.family.parents"'), "Witchers can still describe their families");
actorData.updateSource({ "details.race": "dwarf" });

// Exercise the actual race action and item sheet context without a browser host.
let openedUuid;
foundry.utils.fromUuid = async uuid => {
  const document = documents.get(uuid);
  if (!document) return null;
  return {
    ...document.toObject(), uuid, isOwner: true, system: document.system,
    testUserPermission: () => true,
    toAnchor: () => ({ outerHTML: `<a data-uuid="${uuid}">${handlebars.escapeExpression(document.name)}</a>` }),
    sheet: { render: async () => { openedUuid = uuid; } }
  };
};
await WitcherActorSheet.DEFAULT_OPTIONS.actions.viewRace.call(sheet);
assert.equal(openedUuid, raceUuid(actorData.details.race));
await WitcherActorSheet.DEFAULT_OPTIONS.actions.viewOrigin.call(sheet, null, { dataset: { action: "viewOrigin" } });
assert.equal(openedUuid, originUuid(actorData.details.origin));
await WitcherActorSheet.DEFAULT_OPTIONS.actions.viewFamilyStatus.call(sheet, null, { dataset: { action: "viewFamilyStatus" } });
assert.equal(openedUuid, familyStatusUuid(actorData.details.familyStatus));
const { WitcherItemSheet } = await import("../scripts/sheets/witcher-item-sheet.mjs");
const referenceSheet = new WitcherItemSheet();
referenceSheet.isEditable = false;
const itemTemplate = handlebars.compile(await readFile(new URL("../templates/item-sheet.hbs", import.meta.url), "utf8"), { strict: true });
for (const uuid of documents.keys()) {
  referenceSheet.item = await foundry.utils.fromUuid(uuid);
  const context = await referenceSheet._prepareContext({});
  const rendered = itemTemplate(context);
  assert.ok(rendered.includes(handlebars.escapeExpression(referenceSheet.item.name)));
  for (const ability of context.abilities) {
    assert.ok(rendered.includes(ability.link));
    assert.ok(rendered.includes(ability.description));
  }
  assert.ok(!rendered.includes("prose-mirror"), "Locked references must show descriptions, not editors");
}
const { selectionEntries } = await import("../scripts/sheets/selection-data.mjs");
const pickerTemplate = handlebars.compile(await readFile(new URL("../templates/reference-picker.hbs", import.meta.url), "utf8"), { strict: true });
for (const kind of ["race", "origin", "familyStatus"]) {
  const entries = selectionEntries(kind, key => foundry.utils.getProperty(translations, key));
  const rendered = pickerTemplate({ entries: entries.map(entry => ({ ...entry, selected: false })), groups: [], excluded: kind === "origin" });
  assert.equal([...rendered.matchAll(/data-entry-id=/g)].length, entries.length);
  assert.ok(!rendered.includes("undefined"));
}
const tabsTemplate = handlebars.compile(await readFile(new URL("../templates/sheet-tabs.hbs", import.meta.url), "utf8"), { strict: true });
assert.equal([...tabsTemplate({ tabs: Object.values((await sheet._prepareContext({})).tabs).map(tab => ({ ...tab, visible: true })) }).matchAll(/data-sheet-tab/g)].length, 3);
console.log("Installed Foundry core: family/biography save/load, 71 typed Items, witcher exclusions, personal tabs, reference actions and templates OK");
