import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
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
assert.deepEqual(Array.from(packFolder.packs), ["races", "abilities", "origins", "family-statuses", "equipment", "influential-friends"]);
game.model = { ...game.system.documentTypes, Folder: Object.fromEntries(CONST.FOLDER_DOCUMENT_TYPES.map(type => [type, {}])) };
game.packs = new Map(game.system.packs.map(pack => [`${game.system.id}.${pack.name}`, { documentName: pack.type, folders: new Map() }]));
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
const { EQUIPMENT, EQUIPMENT_FOLDERS } = await import("../scripts/data/equipment.mjs");
const { INFLUENTIAL_FRIENDS } = await import("../scripts/data/influential-friends.mjs");
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
assert.equal(legacyActorData.details.influentialFriend, "");
legacyActorData.updateSource({ "details.influentialFriend": "north.mage" });
const savedFriend = new WitcherActorData(JSON.parse(JSON.stringify(legacyActorData.toObject())));
assert.equal(savedFriend.details.influentialFriend, "north.mage");
savedFriend.updateSource({ "details.influentialFriend": "" });
assert.equal(savedFriend.details.influentialFriend, "", "The optional influence can be cleared");
assert.throws(() => new WitcherActorData({ details: { influentialFriend: "missing-friend" } }));
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

// Derived limits must reach token bars without rewriting the saved current resources.
restored.prepareDerivedData();
assert.equal(restored.health.max, 30, "Unfilled base statistics retain legacy maxima");
assert.equal(restored.stamina.max, 20);
restored.updateSource({ "attributes.body": 10, "attributes.will": 10, "attributes.reflex": 9, "attributes.speed": 9 });
restored.prepareDerivedData();
assert.equal(restored.health.max, 50);
assert.equal(restored.stamina.max, 50);
assert.equal(restored.health.value, 21);
assert.equal(restored.stamina.value, 14);
assert.equal(restored.toObject().health.max, 30, "Preparation must not persist derived values into the source");
restored.updateSource({ "health.value": 10 });
restored.prepareDerivedData();
assert.equal(restored.statistics.initiative, 9);
restored.updateSource({ "health.value": 9 });
restored.prepareDerivedData();
assert.equal(restored.statistics.initiative, 4);
assert.equal(restored.health.max, 50);
assert.equal(restored.statistics.woundThreshold, 10);
restored.updateSource({ "health.value": -5, "attributes.luck": 100, carriedWeight: 38.5, vigor: 7 });
restored.prepareDerivedData();
assert.equal(restored.health.value, -5, "Health must allow death-state values");
const savedStatistics = new WitcherActorData(JSON.parse(JSON.stringify(restored.toObject())));
savedStatistics.prepareDerivedData();
assert.equal(savedStatistics.health.max, 50);
assert.equal(savedStatistics.attributes.luck, 100);
assert.equal(savedStatistics.carriedWeight, 0);
assert.equal(savedStatistics.vigor, 7);
savedStatistics.updateSource({ "attributes.luck": 101 });
assert.equal(savedStatistics.attributes.luck, 100);
savedStatistics.updateSource({ "attributes.luck": -1 });
assert.equal(savedStatistics.attributes.luck, 0);
savedStatistics.updateSource({ "attributes.body": "" });
savedStatistics.prepareDerivedData();
assert.equal(savedStatistics.attributes.body, null);
assert.equal(savedStatistics.health.max, 30, "Clearing a required stat restores the saved legacy limit");
const { default: CoreRoll } = await import(new URL("client/dice/roll.mjs", app));
assert.equal(CoreRoll.replaceFormulaData("1d10wc + @statistics.initiative", restored), "1d10wc + 4");

// Exercise real Foundry schema cleaning and the resource hook, including synthetic token actors.
const { prepareResourceUpdate, applyResourceUpdate, prepareInitialResources } = await import("../scripts/combat/resource-updates.mjs");
const { hasStunned } = await import("../scripts/combat/status-effects.mjs");
const resourceActor = {
  uuid: "Scene.test.Token.test.Actor.test", type: "npc", isOwner: true, effects: [],
  system: new WitcherActorData({ attributes: { body: 10, will: 10 }, health: { value: 50, max: 0 }, stamina: { value: 50, max: 0 } }),
  async toggleStatusEffect(id) { this.effects.push({ id: "test-stun", statuses: new Set([id]), disabled: false }); },
  async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(effect => !ids.includes(effect.id)); },
  updateSource(changes) { this.system.updateSource(foundry.utils.expandObject(changes).system); }
};
resourceActor.system.prepareDerivedData();
const updateResources = async (changes, userId = game.user.id) => {
  const options = {};
  prepareResourceUpdate(resourceActor, changes, options);
  resourceActor.system.updateSource(changes.system);
  resourceActor.system.prepareDerivedData();
  await applyResourceUpdate(resourceActor, changes, options, userId);
  return changes;
};
await updateResources({ system: { health: { value: 90 }, stamina: { value: 90 } } });
assert.equal(resourceActor.system.health.value, 50);
assert.equal(resourceActor.system.stamina.value, 50);
assert.equal(resourceActor.system.toObject().health.value, 50, "Clamp persists to source, not just display");
await updateResources({ system: { attributes: { body: 6, will: 6 } } });
assert.equal(resourceActor.system.health.value, 30);
assert.equal(resourceActor.system.stamina.value, 30);
assert.equal(resourceActor.system.toObject().stamina.value, 30);
await updateResources({ system: { stamina: { value: -2 } } });
assert.equal(resourceActor.system.stamina.value, 0);
assert.equal(hasStunned(resourceActor), true);
await updateResources({ system: { stamina: { value: 10 } } });
assert.equal(hasStunned(resourceActor), true, "Restoring Stamina alone does not recover from stun");
await updateResources({ system: { attributes: { body: 4, will: 4 } } });
assert.equal(resourceActor.system.health.value, 20);
assert.equal(hasStunned(resourceActor), true, "Clamping after a maximum change is not an incoming hit");
await updateResources({ system: { health: { value: 19 } } });
assert.equal(hasStunned(resourceActor), false, "Taking damage ends stun");
await updateResources({ system: { stamina: { value: 0 } } }, "another-user");
assert.equal(hasStunned(resourceActor), false, "Remote clients must not duplicate originating-client effect writes");
await updateResources({ system: { stamina: { value: 10 } } });
await updateResources({ system: { stamina: { value: 0 }, health: { value: 18 } } });
assert.equal(hasStunned(resourceActor), true, "New exhaustion applies even when a hit occurs in the same update");
await updateResources({ system: { health: { value: -5 }, luckSpent: [1, 5], attributes: { luck: 5 } } });
assert.equal(resourceActor.system.health.value, -5);
assert.deepEqual(new WitcherActorData(resourceActor.system.toObject()).luckSpent, [1, 5]);
resourceActor.system = new WitcherActorData({ health: { value: 60, max: 20 }, stamina: { value: 40, max: 15 } });
resourceActor.system.prepareDerivedData();
assert.equal(resourceActor.system.health.value, 20, "Old actors with excess HP are clamped during preparation");
prepareInitialResources(resourceActor);
assert.equal(resourceActor.system.toObject().health.value, 20);
assert.equal(resourceActor.system.toObject().stamina.value, 15);

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
const { WitcherInfluenceData } = await import("../scripts/data/witcher-influence-data.mjs");
const { raceUuid, abilityUuid, originUuid, familyStatusUuid, equipmentUuid, influentialFriendUuid } = await import("../scripts/data/compendiums.mjs");
CONFIG.Item.dataModels = { race: WitcherRaceData, ability: WitcherReferenceData, origin: WitcherOriginData, familyStatus: WitcherFamilyStatusData, equipment: WitcherReferenceData, influence: WitcherInfluenceData };
const equipmentPack = `${game.system.id}.equipment`;
for (const source of await readJSON("../pack-sources/equipment.folders.json")) {
  const folder = new foundry.documents.BaseFolder(source, { pack: equipmentPack });
  assert.equal(folder.type, "Item");
  assert.equal(folder.name, source.name);
  game.packs.get(equipmentPack).folders.set(folder.id, folder);
}
const documents = new Map();
for (const pack of game.system.packs) {
  for (const source of await readJSON(`../pack-sources/${pack.name}.json`)) {
    const document = new foundry.documents.BaseItem(source, { pack: `${game.system.id}.${pack.name}` });
    await access(new URL(`public/${source.img}`, app));
    assert.equal(document.type, source.type);
    assert.deepEqual(document.system.toObject(), source.system);
    assert.equal(document.effects.size, 0, "Reference items must not contain automated effects");
    const uuid = `Compendium.${game.system.id}.${pack.name}.Item.${document.id}`;
    documents.set(uuid, document);
  }
}
assert.equal(documents.size, 129);
for (const entry of INFLUENTIAL_FRIENDS) {
  const document = documents.get(influentialFriendUuid(entry.id));
  assert.equal(document.type, "influence");
  assert.equal(document.system.region, entry.group);
  assert.equal(document.system.roll, entry.roll);
  for (const id of entry.equipment) assert.ok(document.system.description.includes(equipmentUuid(id)));
}
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
for (const entry of EQUIPMENT) {
  const document = documents.get(equipmentUuid(entry.id));
  // Common models retain foreign IDs in this server-side harness.
  assert.equal(document.folder, EQUIPMENT_FOLDERS[entry.source].id);
  assert.ok(game.packs.get(equipmentPack).folders.has(document.folder));
  assert.equal(Boolean(document.system.description), entry.source === "family");
}
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
game.i18n.localize = key => foundry.utils.getProperty(translations, key) ?? key;
game.i18n.format = (key, data) => game.i18n.localize(key).replace(/\{(\w+)\}/g, (_, part) => data[part]);
const { registerStatusEffects, localizeStatusEffects } = await import("../scripts/combat/status-effects.mjs");
CONFIG.specialStatusEffects = { DEFEATED: "dead", BLIND: "blind" };
CONFIG.ActiveEffect = { dataModels: {} };
game.model.ActiveEffect = { base: {} };
registerStatusEffects();
localizeStatusEffects();
const status = CONFIG.statusEffects.stunned;
await access(new URL(`public/${status.img}`, app));
const coreEffect = new foundry.documents.BaseActiveEffect({ name: game.i18n.localize(status.name),
  img: status.img, description: status.description, statuses: [status.id], showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS });
assert.ok(coreEffect.statuses.has("stunned"));
assert.ok(coreEffect.description.includes("СЛ 10"));
assert.equal(coreEffect.showIcon, CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS);
assert.ok(new foundry.documents.BaseActiveEffect(coreEffect.toObject()).statuses.has("stunned"));
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
sheet.actor = { uuid: "Actor.test", name: "<script>test</script>", img: "icons/svg/mystery-man.svg", type: "character", system: actorData, prototypeToken: prototype, effects: [], isOwner: true };
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
assert.equal([...html.matchAll(/data-action="tab"/g)].length, 4);
assert.equal([...html.matchAll(/name="system.attributes\./g)].length, 0, "Base attributes are locked by default");
sheet.submit = async () => {};
sheet.render = async () => {};
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
const editableStatisticsHTML = template(await sheet._prepareContext({}));
assert.equal([...editableStatisticsHTML.matchAll(/name="system.attributes\./g)].length, 9);
assert.match(editableStatisticsHTML, /role="switch" aria-checked="true"/);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
assert.equal((await sheet._prepareContext({})).editingAttributes, false);
assert.ok(html.includes('data-action="rollStun"'));
assert.ok(!html.includes('name="system.carriedWeight"'));
assert.ok(!html.includes('data-tab="parameters"'));
assert.equal([...html.matchAll(/data-action="rollAttribute"/g)].length, 9);
assert.ok(html.includes('data-action="addStunned"'));
assert.ok(html.indexOf('witcher-parameters') > html.indexOf('id="test-actor-main"'));
assert.ok(html.indexOf('witcher-parameters') < html.indexOf('id="test-actor-biography"'));
assert.ok(!html.match(/<(?:div|fieldset)[^>]+data-tooltip=/), "Tooltips must not cover entire cards or resource rows");
assert.ok(html.indexOf("Порог ранения") < html.indexOf('class="witcher-resource stamina"'));
assert.ok(html.indexOf("Отдых") < html.indexOf('class="witcher-derived"'));
assert.ok(html.includes('name="system.vigor"'));
assert.ok(!html.includes("undefined"));
assert.ok(html.includes('data-action="configureTabs"'));
assert.equal([...html.matchAll(/data-biography-section=/g)].length, 10);
assert.ok(html.includes('data-kind="influentialFriend"'));
assert.ok(!html.includes('data-action="viewFriend"'), "An unset friend must not have a broken description button");
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
assert.deepEqual(customized.visibleTabs.map(tab => tab.id), ["biography", "family", "effects"]);
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
assert.deepEqual(actorData.toObject().health, before.health, "Race bonuses must not overwrite saved base resources");
assert.deepEqual(actorData.toObject().stamina, before.stamina);
assert.equal(actorData.toObject().notes, before.notes);
sheet.isEditable = false;
const readOnlyHTML = template(await sheet._prepareContext({}));
assert.match(readOnlyHTML, /<button[^>]*data-kind="race"[^>]*disabled/);
assert.ok(!readOnlyHTML.includes('data-action="editPortrait"'));
assert.ok(readOnlyHTML.includes('data-action="showPortraitArtwork"'));
assert.match(readOnlyHTML, /<textarea[^>]*name="system.biography.sessionNotes"[^>]*disabled/);
assert.ok(!readOnlyHTML.includes('name="system.attributes.reflex"'));
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
assert.equal((await sheet._prepareContext({})).editingAttributes, false, "Observers cannot unlock parameters");
const originalData = sheet.actor.system;
sheet.actor.system = restored;
sheet.tabGroups.character = "main";
const statisticsHTML = template(await sheet._prepareContext({}));
assert.match(statisticsHTML, /id="test-actor-main" class="witcher-character-content tab active"/);
assert.ok(statisticsHTML.includes('<output id="test-actor-health-max">50</output>'));
assert.ok(!statisticsHTML.includes('name="system.health.max"'), "Calculated maxima must not be resubmitted as manual values");
assert.match(statisticsHTML, /<output id="test-actor-attribute-reflex"[^>]*>4<\/output>/);
assert.match(statisticsHTML, /<button[^>]*data-action="rollStun"[^>]*disabled/);
assert.ok(statisticsHTML.includes('id="test-actor-weight">0 / 100 кг</output>'));
assert.equal([...statisticsHTML.matchAll(/data-action="toggleLuck"/g)].length, 100);
sheet.actor.system = originalData;
sheet.tabGroups.character = "main";

sheet.actor.effects = [{ id: "stun", name: "Old core label", statuses: new Set(["stunned"]), disabled: false, isSuppressed: false }];
sheet.tabGroups.character = "effects";
const effectsHTML = template(await sheet._prepareContext({}));
assert.match(effectsHTML, /witcher-effects tab active/);
assert.ok(effectsHTML.includes("Дезориентация"));
assert.ok(effectsHTML.includes("СЛ 10"));
assert.ok(effectsHTML.includes('data-action="removeEffect" data-effect-id="stun"'));
assert.ok(!effectsHTML.includes("Old core label"));
sheet.actor.effects = [];
sheet.tabGroups.character = "main";
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
actorData.updateSource({ "details.influentialFriend": "nilfgaard.sentient-monster" });
const witcherHTML = template(await sheet._prepareContext({}));
assert.ok(!witcherHTML.includes('data-kind="familyStatus"'));
assert.ok(!witcherHTML.includes('data-action="viewFamilyStatus"'));
assert.ok(witcherHTML.includes('name="system.biography.family.parents"'), "Witchers can still describe their families");
assert.ok(witcherHTML.includes('data-kind="influentialFriend"'), "Unlike family status, a descriptive friend remains available to witchers");
assert.ok(witcherHTML.includes('data-action="viewFriend"'));
assert.equal((await sheet._prepareContext({})).selectedFriend.id, "nilfgaard.sentient-monster");
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
await WitcherActorSheet.DEFAULT_OPTIONS.actions.viewFriend.call(sheet, null, { dataset: { action: "viewFriend" } });
assert.equal(openedUuid, influentialFriendUuid(actorData.details.influentialFriend));
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
for (const kind of ["race", "origin", "familyStatus", "influentialFriend"]) {
  const entries = selectionEntries(kind, key => foundry.utils.getProperty(translations, key));
  const rendered = pickerTemplate({ entries: entries.map(entry => ({ ...entry, selected: false })), groups: [], excluded: kind === "origin",
    hintKey: kind === "influentialFriend" ? "WITCHER.Friends.Hint" : "WITCHER.Picker.ReferenceOnly" });
  assert.equal([...rendered.matchAll(/data-entry-id=/g)].length, entries.length);
  assert.ok(!rendered.includes("undefined"));
}
const tabsTemplate = handlebars.compile(await readFile(new URL("../templates/sheet-tabs.hbs", import.meta.url), "utf8"), { strict: true });
assert.equal([...tabsTemplate({ tabs: Object.values((await sheet._prepareContext({})).tabs).map(tab => ({ ...tab, visible: true })) }).matchAll(/data-sheet-tab/g)].length, 4);
// Exercise Luck against the installed parser, real evaluated dice, and chat schema.
const aliasHook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith("@common/") ? new URL(specifier.slice(8), core).href : specifier, context);
} });
const diceTerms = await import(new URL("client/dice/terms/_module.mjs", app));
const { default: RollParser } = await import(new URL("client/dice/parser.mjs", app));
aliasHook.deregister();
const peggy = createRequire(new URL("package.json", app))("peggy");
foundry.dice = { Roll: CoreRoll, terms: diceTerms,
  RollGrammar: peggy.generate(await readFile(new URL("client/dice/grammar.pegjs", app), "utf8")) };
CONFIG.debug = {};
CONFIG.Dice = { parser: RollParser, rolls: [CoreRoll], termTypes: diceTerms,
  terms: { d: diceTerms.Die, c: diceTerms.Coin, f: diceTerms.FateDie },
  fulfillment: { methods: {} }, randomUniform: Math.random };
const { prepareMessageLuck, settleMessageLuck, releaseMessageLuck } = await import("../scripts/chat/luck-rolls.mjs");
game.model.ChatMessage = { base: {} };
CONFIG.ChatMessage = { dataModels: {} };
foundry.packages = { BasePackage: (await import(new URL("packages/base-package.mjs", core))).default };
const luckActor = { uuid: "Actor.realDice", isOwner: true, system: new WitcherActorData({
  attributes: { luck: 10 }, luckPending: 4, details: { race: "human", familyStatus: "north.peasants" }
}), async update(changes) { this.system.updateSource(Object.fromEntries(Object.entries(changes).map(([key, value]) => [key.slice(7), value]))); } };
assert.equal(luckActor.system.statistics.effective.luck, 11);
for (const formula of ["1d10 + 10", "2d6 + 1d4", "(1d6 + 2) * 3", "{2d6, 1d10}kh", "1d20 - 5"]) {
  luckActor.system.updateSource({ luckSpent: [], luckPending: 4 });
  const roll = await new CoreRoll(formula).evaluate({ maximize: true, allowInteractive: false });
  const beforeDice = JSON.stringify(roll.dice.map(die => die.results));
  const source = new foundry.documents.BaseChatMessage({ author: game.user.id, content: String(roll.total), rolls: [roll.toJSON()] });
  const message = { speakerActor: luckActor, flags: source.flags, rolls: [roll], content: source.content, flavor: source.flavor,
    updateSource(changes) {
      source.updateSource(changes);
      this.flags = source.flags;
      this.rolls = source.rolls.map(data => CoreRoll.fromData(data));
    }
  };
  await prepareMessageLuck(message, "native-check");
  assert.equal(message.rolls[0].total, roll.total + 4, formula);
  assert.equal(JSON.stringify(message.rolls[0].dice.map(die => die.results)), beforeDice, "Luck must preserve original dice, including pools and parentheses");
  assert.match(source.flavor, /\+4 от Удачи/);
  await settleMessageLuck([message], "native-check");
  releaseMessageLuck("native-check");
  assert.deepEqual(Array.from(luckActor.system.luckSpent), [1, 2, 3, 4]);
  assert.equal(luckActor.system.luckPending, 0);
}
const { registerCriticalDice } = await import("../scripts/dice/critical-chain.mjs");
const { prepareCriticalResult } = await import("../scripts/chat/critical-result.mjs");
registerCriticalDice();
const sequences = [
  [[10, 4], 14], [[10, 10, 7], 27], [[10, 10, 10, 2], 32], [[10, 1], 11],
  [[1, 4], -4], [[1, 1], -1], [[1, 10, 3], -13], [[1, 10, 10, 6], -26], [[1, 10, 1], -11]
];
const criticalNativeRolls = [];
for (const [sequence, expected] of sequences) {
  const queue = [...sequence];
  CONFIG.Dice.randomUniform = () => {
    assert.ok(queue.length, "An ending 1–9 must not roll again");
    return 1 - (queue.shift() - 0.5) / 10;
  };
  luckActor.system.updateSource({ luckSpent: [], luckPending: 4 });
  const roll = await new CoreRoll("1d10wc + 10").evaluate({ allowInteractive: false });
  assert.equal(queue.length, 0);
  assert.equal(roll.total, 10 + expected);
  const serialized = CoreRoll.fromData(JSON.parse(JSON.stringify(roll)));
  assert.equal(serialized.total, roll.total);
  assert.deepEqual(serialized.dice[0].results.map(result => result.result), sequence);
  const source = new foundry.documents.BaseChatMessage({ author: game.user.id, content: String(roll.total), rolls: [serialized.toJSON()] });
  const message = { speakerActor: luckActor, flags: source.flags, rolls: [serialized], content: source.content, flavor: source.flavor,
    updateSource(changes) {
      source.updateSource(changes);
      Object.assign(this, { flags: source.flags, content: source.content, flavor: source.flavor, rolls: source.rolls.map(data => CoreRoll.fromData(data)) });
    }
  };
  await prepareMessageLuck(message, "critical-check");
  prepareCriticalResult(message);
  assert.equal(message.rolls[0].total, 14 + expected, "Luck is added after the signed chain");
  assert.deepEqual(message.rolls[0].dice[0].results.map(result => result.result), sequence);
  assert.match(message.flavor, sequence[0] === 1 ? /Критический провал/ : /Критический успех/);
  assert.match(message.flavor, /\+4 от Удачи/);
  const sign = expected < 0 ? "−" : "+";
  assert.ok(message.flavor.includes(`10 ${sign} ${Math.abs(expected)} + 4 = ${14 + expected}`));
  criticalNativeRolls.push({ data: message.rolls[0].toJSON(), sequence });
  await settleMessageLuck([message], "critical-check");
  releaseMessageLuck("critical-check");
  assert.deepEqual(Array.from(luckActor.system.luckSpent), [1, 2, 3, 4]);
}
// STUN and the ordinary dice tray retain their plain-d10 formulas.
for (const face of [1, 10]) {
  let draws = 0;
  CONFIG.Dice.randomUniform = () => { draws++; return 1 - (face - 0.5) / 10; };
  const plain = await new CoreRoll("1d10").evaluate({ allowInteractive: false });
  assert.equal(plain.total, face);
  assert.equal(draws, 1);
  assert.equal(plain.dice[0].options[game.system.id], undefined);
}
if (process.argv[3]) {
  // Read the installed module's notation adapter without copying its source into
  // the repository. Physics/rendering are not started by this check.
  const { runInThisContext } = await import("node:vm");
  const map = JSON.parse(await readFile(resolve(process.argv[3], "main.js.map"), "utf8"));
  const notationSource = map.sourcesContent[map.sources.findIndex(name => name.endsWith("/DiceNotation.js"))];
  assert.ok(notationSource, "Installed DSN source map must contain DiceNotation");
  const loadNotation = runInThisContext(`(function(foundry, game, SFXFormulaMatcher, DiceSFXManager, DiceLibrary) {
    ${notationSource.replace(/^import .+;$/gm, "").replace(/^export /gm, "")}\nreturn DiceNotation; })`);
  const DiceNotation = loadNotation(foundry, { ...game, settings: { get: () => 10000 } },
    { isRealReroll: result => Boolean(result.rerolled) }, {}, {});
  for (const { data, sequence } of criticalNativeRolls) {
    const notation = new DiceNotation(CoreRoll.fromData(data));
    assert.deepEqual(Array.from(notation.throws, entry => Array.from(entry.dice, die => die.result)), sequence.map(result => [result]),
      "DSN must receive the complete chain as successive throws of the original natural faces");
    assert.ok(notation.throws.every(entry => entry.dice.every(die => die.type === "d10")));
  }
  console.log("Installed Dice So Nice: all nine critical chains produce the correct successive d10 throws");
}
console.log("Installed Foundry core: data, 129 Items, templates, native Luck and all nine critical chains OK");
