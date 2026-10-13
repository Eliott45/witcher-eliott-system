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
    operators: await import(new URL("data/operators.mjs", core)),
    fields: await import(new URL("data/fields.mjs", core)),
    ...await import(new URL("data/data.mjs", core))
  },
  documents: await import(new URL("documents/_module.mjs", core))
};
globalThis.getDocumentClass = name => foundry.documents[`Base${name}`];
globalThis.CONFIG = { Token: {}, Actor: { dataModels: {} }, Item: { dataModels: {} }, ActiveEffect: {dataModels:{base:foundry.data.ActiveEffectTypeDataModel}} };
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
foundry.packages = { BasePackage: (await import(new URL("packages/base-package.mjs", core))).default };
game.system = new BaseSystem(await readJSON("../system.json"));
assert.equal(game.system.grid.distance, 2);
assert.equal(game.system.grid.units, "m");
const [packFolder] = game.system.packFolders;
assert.equal(packFolder.name, "Witcher");
assert.deepEqual(Array.from(packFolder.packs), ["effects", "races", "abilities", "origins", "family-statuses", "equipment", "influential-friends", "languages", "professions", "spells", "bestiary", "pregens", "macros"]);
game.model = { ...game.system.documentTypes, ActiveEffect:{base:{}}, Macro:Object.fromEntries(Object.values(CONST.MACRO_TYPES).map(type => [type,{}])), Folder: Object.fromEntries(CONST.FOLDER_DOCUMENT_TYPES.map(type => [type, {}])) };
game.packs = new Map(game.system.packs.map(pack => [`${game.system.id}.${pack.name}`, { documentName: pack.type, folders: new Map() }]));
game.user = { id: "testuser00000001", isGM: true, can:()=>true };
game.users = {activeGM:game.user};
let preferences = {};
const player = { id: "player0000000001", isGM: false, hasPermission: () => false, can:()=>false };
assert.equal(foundry.documents.BaseSetting.metadata.permissions.create(player, {
  _source: { key: `${game.system.id}.sheetPreferences`, user: player.id }
}, {}), true, "An ordinary player may store their personal sheet settings");

const { WitcherActorData } = await import("../scripts/data/witcher-actor-data.mjs");
const { WitcherServicesData } = await import("../scripts/data/witcher-services-data.mjs");
CONFIG.Actor.dataModels.services = WitcherServicesData;
const { WitcherPowerPlaceData } = await import("../scripts/data/witcher-power-place-data.mjs");
CONFIG.Actor.dataModels.powerPlace = WitcherPowerPlaceData;
const nativePowerPlace=new foundry.documents.BaseActor({name:"Круг камней",type:"powerPlace",system:{element:"fire",description:"У старого вулкана"}});
const reopenedPowerPlace=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(nativePowerPlace.toObject())));
assert.equal(reopenedPowerPlace.system.element,"fire");
assert.equal(reopenedPowerPlace.system.description,"У старого вулкана");
assert.equal(reopenedPowerPlace.system.health,undefined);
const servicesData = new WitcherServicesData();
assert.equal(servicesData.services.length,24);
assert.equal(servicesData.closed,false);
assert.equal(servicesData.health,undefined,"Establishments have no character resources");
assert.notEqual(servicesData.services,new WitcherServicesData().services);
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
restored.updateSource({ lifepath: { witcher: { school: "griffin", training: "best", trial: "normal", decades: [{ id: "testdecade000001", age: 30, risk: "normal", outcome: "hunt", hunt: { monster: "Грифон", category: "Гибриды" }, danger: { kind: "wound", wound: "breath" } }] } } });
const reopenedWitcher = new WitcherActorData(JSON.parse(JSON.stringify(restored.toObject())));
assert.equal(reopenedWitcher.lifepath.witcher.decades[0].hunt.monster, "Грифон");
assert.equal(reopenedWitcher.lifepath.witcher.decades[0].danger.wound, "breath");
assert.equal(reopenedWitcher.lifepath.witcher.school, "griffin");
const oldPath = reopenedWitcher.toObject().lifepath.witcher;
reopenedWitcher.updateSource({ "lifepath.events": [{ id: "enemytest0000001", age: 20, kind: "enemy", enemy: { name: "Тестовый враг", strength: 7, power: "Магия", cause: "Шантаж" } }] });
const reopenedEvents = new WitcherActorData(JSON.parse(JSON.stringify(reopenedWitcher.toObject())));
assert.deepEqual(reopenedEvents.toObject().lifepath.witcher, oldPath);
assert.equal(reopenedEvents.lifepath.events[0].enemy.strength, 7);
assert.equal(reopenedEvents.lifepath.events[0].enemy.power, "Магия");
assert.deepEqual(legacyActorData.lifepath.events, [], "Old actors receive an empty event list");
restored.updateSource({ "lifepath.witcher.school": "", "lifepath.witcher.training": "", "lifepath.witcher.trial": "", "lifepath.witcher.decades": [] });
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
assert.equal(CoreRoll.replaceFormulaData("1d10wc + @statistics.initiative", restored), "1d10wc + 3");

// Exercise real Foundry schema cleaning and the resource hook, including synthetic token actors.
const { prepareResourceUpdate, applyResourceUpdate, prepareInitialResources } = await import("../scripts/combat/resource-updates.mjs");
const { hasStunned, hasStatus, STUNNED, EXHAUSTED_STUN, UNCONSCIOUS } = await import("../scripts/combat/status-effects.mjs");
const { conditionRules } = await import("../scripts/combat/condition-rules.mjs");
const resourceActor = {
  uuid: "Scene.test.Token.test.Actor.test", type: "npc", isOwner: true, effects: [],
  system: new WitcherActorData({ attributes: { body: 10, will: 10 }, health: { value: 50, max: 0 }, stamina: { value: 50, max: 0 } }),
  async toggleStatusEffect(id) { this.effects.push({ id: `test-${id}`, statuses: new Set([id]), disabled: false }); },
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
await updateResources({ "system.health.value": 80, "system.stamina.value": 80 });
assert.equal(resourceActor.system.toObject().health.value, 50, "Flat updates retain both HP and injected fields");
assert.equal(resourceActor.system.toObject().stamina.value, 50);
await updateResources({ system: { attributes: { body: 6, will: 6 } } });
assert.equal(resourceActor.system.health.value, 30);
assert.equal(resourceActor.system.stamina.value, 30);
assert.equal(resourceActor.system.toObject().stamina.value, 30);
await updateResources({ system: { stamina: { value: -2 } } });
assert.equal(resourceActor.system.stamina.value, 0);
assert.equal(hasStunned(resourceActor), true);
assert.equal(hasStatus(resourceActor, EXHAUSTED_STUN), true);
assert.equal(hasStatus(resourceActor, UNCONSCIOUS), true);
assert.equal(hasStatus(resourceActor, STUNNED), false);
assert.ok(resourceActor.system.exhaustionEpisode);
assert.equal(conditionRules(resourceActor).canStunSave, false);
await updateResources({ system: { stamina: { value: 10 } } });
assert.equal(hasStunned(resourceActor), true, "Restoring Stamina alone does not recover from stun");
assert.equal(hasStatus(resourceActor, UNCONSCIOUS), false, "Any positive STA restores consciousness after exhaustion");
await updateResources({ system: { attributes: { body: 4, will: 4 } } });
assert.equal(resourceActor.system.health.value, 20);
assert.equal(hasStunned(resourceActor), true, "Clamping after a maximum change is not an incoming hit");
await updateResources({ system: { health: { value: 19 } } });
assert.equal(hasStunned(resourceActor), true, "Taking damage must not end exhaustion stun");
await resourceActor.toggleStatusEffect(STUNNED);
await updateResources({ system: { health: { value: 18 } } });
assert.equal(hasStatus(resourceActor, STUNNED), false, "Taking damage still ends ordinary stun");
await updateResources({ system: { stamina: { value: 0 } } }, "another-user");
assert.equal(hasStatus(resourceActor, UNCONSCIOUS), false, "Remote clients must not duplicate originating-client effect writes");
await updateResources({ system: { stamina: { value: 10 } } });
await updateResources({ system: { stamina: { value: 0 }, health: { value: 18 } } });
assert.equal(hasStunned(resourceActor), true, "New exhaustion applies even when a hit occurs in the same update");
// Here validate remote receipt of a negative HP update; death rolls use the native parser below.
await updateResources({ system: { health: { value: -5 }, luckSpent: [1, 5], attributes: { luck: 5 } } }, "another-user");
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
const { WitcherEffectItemData } = await import("../scripts/data/witcher-effect-item-data.mjs");
const { WitcherRaceData } = await import("../scripts/data/witcher-race-data.mjs");
const { WitcherOriginData } = await import("../scripts/data/witcher-origin-data.mjs");
const { WitcherFamilyStatusData } = await import("../scripts/data/witcher-family-status-data.mjs");
const { WitcherInfluenceData } = await import("../scripts/data/witcher-influence-data.mjs");
const { raceUuid, abilityUuid, originUuid, familyStatusUuid, equipmentUuid, influentialFriendUuid } = await import("../scripts/data/compendiums.mjs");
const { WitcherAbilityData } = await import("../scripts/data/witcher-ability-data.mjs");
const { WitcherEquipmentData } = await import("../scripts/data/witcher-equipment-data.mjs");
const { WitcherWeaponData } = await import("../scripts/data/witcher-weapon-data.mjs");
const { WitcherSpellData } = await import("../scripts/data/witcher-spell-data.mjs");
const { WitcherRecipeData } = await import("../scripts/data/witcher-recipe-data.mjs");
const { WitcherArmorData } = await import("../scripts/data/witcher-armor-data.mjs");
const oldGear = new WitcherEquipmentData({ ruleId: "old-custom", description: "<p>Старый предмет</p>" });
assert.equal(oldGear.quantity, 1); assert.equal(oldGear.weight, 0); assert.equal(oldGear.description, "<p>Старый предмет</p>");
CONFIG.Item.dataModels = { profession: WitcherReferenceData, race: WitcherRaceData, ability: WitcherAbilityData, origin: WitcherOriginData, familyStatus: WitcherFamilyStatusData, equipment: WitcherEquipmentData, weapon: WitcherWeaponData, armor: WitcherArmorData, recipe: WitcherRecipeData, spell: WitcherSpellData, influence: WitcherInfluenceData, language: WitcherReferenceData };
CONFIG.Item.dataModels.effect=WitcherEffectItemData;
const equipmentPack = `${game.system.id}.equipment`;
for (const source of await readJSON("../pack-sources/equipment.folders.json")) {
  const folder = new foundry.documents.BaseFolder(source, { pack: equipmentPack });
  assert.equal(folder.type, "Item");
  assert.equal(folder.name, source.name);
  game.packs.get(equipmentPack).folders.set(folder.id, folder);
}
CONFIG.Actor.dataModels.npc = WitcherActorData;
CONFIG.Actor.dataModels.character = WitcherActorData;
foundry.data.PrototypeTokenOverrides.overrides = { base: {} };
const assertSubset=(actual,expected)=>{for(const [key,value] of Object.entries(expected))if(value&&typeof value==="object")assertSubset(actual[key],value);else assert.deepEqual(actual[key],value);};
const documents = new Map();
for (const pack of game.system.packs) {
  for (const source of await readJSON(`../pack-sources/${pack.name}.json`)) {
    const document = new foundry.documents[`Base${pack.type}`](source, { pack: `${game.system.id}.${pack.name}` });
    await access(source.img.startsWith(`systems/${game.system.id}/`)
      ? new URL(`../${source.img.slice(`systems/${game.system.id}/`.length)}`, import.meta.url)
      : new URL(`public/${source.img}`, app));
    assert.equal(document.type, source.type);
    const modeled = document.system?.toObject?.() ?? document.system;
    if(pack.type === "Actor") assertSubset(modeled,source.system);
    else if (source.system) assert.deepEqual(Object.fromEntries(Object.keys(source.system).map(key => [key, modeled[key]])), source.system);
    if (pack.type === "Item") assert.equal(document.effects.size, 0, "Reference items must not contain automated effects");
    else if(pack.type === "ActiveEffect") assert.deepEqual(document.toObject().flags,source.flags,"Effect rules survive native serialization");
    const uuid = `Compendium.${game.system.id}.${pack.name}.${pack.type}.${document.id}`;
    documents.set(uuid, document);
  }
}
assert.equal(documents.size, Object.values((await import("./compendium-data.mjs")).compendiumData(await readJSON("../lang/ru.json"))).flat().length);
const geraltSource = documents.get(`Compendium.${game.system.id}.pregens.Actor.pregenGeralt0001`);
const pregenSources = await readJSON("../pack-sources/pregens.json");
assert.equal(pregenSources.length,8);
for(const source of pregenSources) {
  const initial=documents.get(`Compendium.${game.system.id}.pregens.Actor.${source._id}`);
  const restored=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(initial.toObject())));
  restored.system.prepareDerivedData();
  assert.equal(restored.items.size,source.items.length,source.name);
  assert.equal(restored.system.health.value,source.system.health.value,source.name);
  assert.equal(restored.system.health.max,source.system.health.max,source.name);
  assert.equal(restored.system.stamina.max,source.system.stamina.max,source.name);
  assert.equal(restored.prototypeToken.sight.angle,360);
  assert.deepEqual(restored.flags[game.system.id].pregen,source.flags[game.system.id].pregen);
  assert.deepEqual(restored.system.languages,source.system.languages);
  for(const item of restored.items) {
    assert.equal(item.flags.core.sourceId,source.items.find(entry=>entry._id===item.id).flags.core.sourceId);
    if(item.system.containerId)assert.ok(restored.items.has(item.system.containerId));
    if(item.system.transport?.mountId)assert.ok(restored.items.has(item.system.transport.mountId));
  }
}
for (const geralt of [geraltSource, new foundry.documents.BaseActor(JSON.parse(JSON.stringify(geraltSource.toObject())))]) {
  assert.equal(geralt.prototypeToken.sight.angle, 360);
  geralt.system.prepareDerivedData();
  assert.deepEqual(Object.values(geralt.system.statistics.effective), [6,14,10,8,9,3,5,8,3]);
  assert.equal(geralt.system.health.value, 55);
  assert.equal(geralt.system.health.max, 55);
  assert.equal(geralt.system.stamina.max, 40);
  assert.equal(geralt.items.size, 41);
  const patch = { "system.biography.sessionNotes": "Updated notes" };
  prepareResourceUpdate(geralt, patch, {});
  assert.equal(patch.system.health, undefined, "An unrelated edit must not discard Raven's +15 HP");
  const armor = geralt.items.find(item => item.system.ruleId === "armor.raven");
  assert.equal(armor.system.zone, "torso-legs");
  assert.equal(armor.system.wearerBonuses.length, 2);
  armor.updateSource({ "system.equipped": false });
  assert.equal(geralt.system.statistics.healthMax, 40);
}
CONFIG.Actor.dataModels.character = WitcherActorData;
const armored = new foundry.documents.BaseActor({ name: "Inventory round trip", type: "character", system: { attributes: { reflex: 5, dexterity: 4 }, health: { value: 20, max: 20 } }, items: [
  { name: "Бригантина", type: "armor", system: { weight: 7, equipped: true, zone: "torso", encumbrance: 1, stoppingPower: { value: 8, max: 12 } } },
  { name: "Кинжал", type: "weapon", system: { weight: 0.5, quantity: 2, reliability: { value: 7, max: 10 } } }
] });
armored.system.prepareDerivedData();
assert.equal(armored.system.carriedWeight, 8);
assert.equal(armored.system.statistics.effective.reflex, 4);
assert.equal(armored.system.statistics.effective.dexterity, 3);
const restoredInventory = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(armored.toObject())));
const providerActor = new foundry.documents.BaseActor({name:"Test inn",type:"services"});
providerActor.updateSource({"system.services":providerActor.system.services.map(entry=>({...entry,enabled:entry.id==="hot-bath",price:entry.id==="hot-bath"?23:entry.price})),"system.greeting":"Добро пожаловать"});
const reopenedProvider = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(providerActor.toObject())));
assert.equal(reopenedProvider.system.services.filter(entry=>entry.enabled).length,1);
assert.equal(reopenedProvider.system.services.find(entry=>entry.id==="hot-bath").price,23);
assert.equal(reopenedProvider.system.greeting,"Добро пожаловать");
assert.equal(reopenedProvider.system.health,undefined);
restoredInventory.system.prepareDerivedData();
assert.equal(restoredInventory.system.carriedWeight, 8);
assert.equal(restoredInventory.items.find(item => item.type === "armor").system.stoppingPower.value, 8);
// Permanent mutations, prepared doses, installed upgrades and recipes round-trip through real schemas.
const workshopActor = new foundry.documents.BaseActor({ name: "Workshop round trip", type: "character", system: {
  attributes:{body:10,will:10}, health:{value:50,max:50},
  mutations:[{id:"mutation",name:"Бес",sourceUuid:"Compendium.mutagen",category:"mutagen",bonuses:[{target:"attributes.body",value:1}]}],
  harvest:[{id:"loot",uuid:"Compendium.material",quantity:2,skill:"alchemy",dc:16,attempted:true}]
},items:[
  {name:"Prepared",type:"equipment",system:{kind:"mutagen",mutagen:{prepared:true,dc:18,bonuses:[{target:"meleeDamage",value:2}]}}},
  {name:"Enhanced",type:"armor",system:{stoppingPower:{value:8,max:5},installations:[{id:"kit",name:"Kit",category:"armor",bonuses:[{target:"stoppingPower",value:3}]}]}},
  {name:"Recipe",type:"recipe",system:{recipe:{resultUuid:"Compendium.result",dc:18,time:60,components:[{uuid:"Compendium.material",quantity:2}],memorized:true}}}
]});
const reopenedWorkshop=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(workshopActor.toObject())));
assert.equal(reopenedWorkshop.system.statistics.adjusted.body,11);
assert.equal(reopenedWorkshop.system.harvest[0].attempted,true);
assert.equal(reopenedWorkshop.items.find(i=>i.name==="Prepared").system.mutagen.prepared,true);
assert.equal(reopenedWorkshop.items.find(i=>i.name==="Recipe").system.recipe.components[0].quantity,2);
const {effectiveItem}=await import("../scripts/data/workshop.mjs");
assert.equal(effectiveItem(reopenedWorkshop.items.find(i=>i.name==="Enhanced")).stoppingPower.max,8);
const { addLanguageFromItem, LANGUAGES } = await import("../scripts/data/languages.mjs");
const { languageUuid } = await import("../scripts/data/compendiums.mjs");
const languageActor = { uuid: "Actor.languageImport", isOwner: true, system: new WitcherActorData(),
  async update(changes) { this.system.updateSource(foundry.utils.expandObject(changes).system); }
};
await Promise.all(LANGUAGES.map(language => addLanguageFromItem(languageActor, documents.get(languageUuid(language.id)))));
assert.equal(languageActor.system.languages.length, 3);
assert.ok(languageActor.system.languages.every(entry => entry.level === 0));
const savedLanguages = new WitcherActorData(JSON.parse(JSON.stringify(languageActor.system.toObject())));
assert.deepEqual(savedLanguages.toObject().languages, languageActor.system.toObject().languages);
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
  // Every lifepath item has prose: family text, rules text or a catalog description; never a bare page citation.
  assert.ok(document.system.description);
  assert.doesNotMatch(document.system.description, /Базовая книга/);
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
CONFIG.ActiveEffect = { dataModels: {base:foundry.data.ActiveEffectTypeDataModel} };
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
CONFIG.Actor.dataModels.character = WitcherActorData;
const { EFFECT_TEMPLATES, conditionSource } = await import("../scripts/data/condition-definitions.mjs");
foundry.data.PrototypeTokenOverrides.overrides = { base: {} };
const frozenActor = new foundry.documents.BaseActor({name:"Effects round trip",type:"character",
  system:{attributes:{speed:8,reflex:8,body:8,will:8},health:{value:40,max:40}},
  effects:[conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="frozen"))]});
const reopenedFrozen = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(frozenActor.toObject())));
for (const actor of [frozenActor,reopenedFrozen]) {
  assert.equal(actor.system.attributes.speed,8,"Base stats remain intact");
  assert.equal(actor.system.statistics.effective.speed,5);
  assert.equal(actor.system.statistics.effective.reflex,7);
  assert.equal(actor.effects.contents[0].flags[game.system.id].condition.save.dc,16);
}
const timedEffect = new foundry.documents.BaseActiveEffect({...conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="clotting")),
  duration:{value:7,units:"rounds",expiry:"turnEnd",expired:false}});
assert.deepEqual(new foundry.documents.BaseActiveEffect(timedEffect.toObject()).toObject().duration,
  {value:7,units:"rounds",expiry:"turnEnd",expired:false});
// Existing Actor/ActiveEffect models persist counters and native round boundaries without a new schema.
const {effectCounter}=await import("../scripts/data/effect-counters.mjs");
for(const type of ["character","npc"]){
  const counterSource=conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="aiming"));
  counterSource.flags[game.system.id].conditionState={counter:2,lastAimRound:"test:4"};
  counterSource.duration={value:1,units:"rounds",expiry:"turnEnd",expired:false};
  const dodgeSource=conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="active-dodge"));
  dodgeSource.duration={value:1,units:"rounds",expiry:"roundStart",expired:false};
  const actor=new foundry.documents.BaseActor({name:"Full-turn persistence",type,effects:[counterSource,dodgeSource]});
  const restored=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(actor.toObject())));
  const aim=restored.effects.find(effect=>effect.statuses.has("aiming"));
  assert.deepEqual(effectCounter(aim),{value:2,max:3});assert.equal(aim.flags[game.system.id].conditionState.lastAimRound,"test:4");
  assert.equal(restored.effects.find(effect=>effect.statuses.has("active-dodge")).duration.expiry,"roundStart");
}
// Real embedded Items feed ability rules; only the base skill level is persisted.
const skillsActor = new foundry.documents.BaseActor({ name: "Skill check", type: "character",
  system: { attributes: { intelligence: 8, dexterity: 8, empathy: 8 }, details: { race: "elf", origin: "redania", familyStatus: "elder.scribes" },
    skills: { education: 4, archery: 3 }, languages: [{ id: "common0000000001", name: "Всеобщий", level: 8 }],
    abilityState: { trustEnabled: true, stubbornnessUsed: 2 } },
  items: ["human.ingenuity", "human.trust", "witcher.lightning-reflexes", "elf.marksman"].map(id => documents.get(abilityUuid(id)).toObject())
});
const { skillValue } = await import("../scripts/data/skills.mjs");
assert.equal(skillValue(skillsActor.system, "education").total, 14);
assert.equal(skillValue(skillsActor.system, "archery").total, 14, "9 DEX + 3 level + 2 Marksman, even if the racial ability is also embedded");
assert.equal(skillValue(skillsActor.system, "deduction").total, 9);
assert.equal(skillValue(skillsActor.system, "charisma").total, 9);
const savedSkills = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(skillsActor.toObject())));
assert.equal(skillValue(savedSkills.system, "archery").total, 14);
assert.equal(savedSkills.system.abilityState.stubbornnessUsed, 2);
assert.equal(savedSkills.system.abilityState.trustEnabled, true);
assert.equal(skillValue(savedSkills.system, "language", "common0000000001").total, 16);
assert.equal(savedSkills.system.skills.archery, 3);
assert.equal(Object.keys(actorData.skills).length, 49, "Legacy characters receive zeroed skills");
assert.ok(Object.values(actorData.skills).every(value => value === 0));
assert.deepEqual(actorData.languages, []);
assert.equal(actorData.abilityState.trustEnabled, false);
for (const statusId of ["dying", "dead"]) {
  const definition = CONFIG.statusEffects[statusId];
  const actor = new foundry.documents.BaseActor({ name: "Condition check", type: "character",
    system: { attributes: { body: 10, will: 10, luck: 10 }, health: { value: 50, max: 50 } },
    effects: [{ _id: "testcondition001", name: game.i18n.localize(definition.name), img: definition.img,
      statuses: [statusId], description: definition.description }] });
  actor.system.prepareDerivedData();
  assert.equal(actor.system.statistics.effective.body, 3, "An actual embedded status drives the TypeDataModel penalty");
  assert.equal(actor.system.statistics.effective.luck, 10);
  assert.equal(actor.system.statistics.stun, 10);
  assert.equal(actor.system.statistics.dead, statusId === "dead");
  assert.equal(actor.system.statistics.dying, statusId === "dying");
  assert.equal(actor.system.health.max, 50);
}
handlebars.registerHelper("localize", key => foundry.utils.getProperty(translations, key) ?? key);
handlebars.registerHelper("not", value => !value);
handlebars.registerHelper("eq", (a,b) => a === b);
handlebars.registerHelper("or", (...values) => values.slice(0, -1).some(Boolean));
handlebars.registerHelper("checked", value => value ? "checked" : "");
handlebars.registerHelper("disabled", value => value ? "disabled" : "");
for (const name of ["combat-actions", "verbal-duel", "effects-list", "learning", "magic", "magic-filters", "magic-spells", "magic-requirements", "profession", "profession-tree", "profession-node", "advancement-controls", "lifepath", "lifepath-entry", "inventory", "inventory-row", "installed-upgrades", "transport", "structured-fields", "workshop-item", "item-reference", "recipe-details", "workshop-actor", "npc-loot", "crafting", "alchemy", "recipe-card"]) handlebars.registerPartial(`systems/witcher-eliott-system/templates/${name}.hbs`, await readFile(new URL(`../templates/${name}.hbs`, import.meta.url), "utf8"));
const template = handlebars.compile(await readFile(new URL("../templates/actor-sheet.hbs", import.meta.url), "utf8"), { strict: true });
// Use the real sheet context preparation; only the browser application host is stubbed.
foundry.applications = {
  api: { HandlebarsApplicationMixin: Base => Base, ApplicationV2: class {} },
  sheets: { ActorSheetV2: class {
    tabGroups = {};
    async _prepareContext() {
      // Supply ApplicationV2's tab context while keeping its DOM host out of this check.
      if(!this.constructor.TABS)return {editable:this.isEditable,rootId:"test-location"};
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
    tabGroups = {};
    async _onRender() {}
    _processFormData(_event,_form,formData){return foundry.utils.expandObject(formData.object);}
    async _prepareContext() { return foundry.applications.sheets.ActorSheetV2.prototype._prepareContext.call(this); }
  } },
  ux: { TextEditor: { implementation: { enrichHTML: async html => html } } }
};
const { WitcherActorSheet } = await import("../scripts/sheets/witcher-actor-sheet.mjs");
foundry.utils.fromUuid = async () => null;
const sheet = new WitcherActorSheet();
sheet.actor = { uuid: "Actor.test", name: "<script>test</script>", img: "icons/svg/mystery-man.svg", type: "character", system: actorData, prototypeToken: prototype, items: [], effects: [], isOwner: true };
sheet.token = null;
sheet.isEditable = true;
const html = template(await sheet._prepareContext({}));
// Crafting renders persisted recipes and material counts through real Foundry schemas.
const { craftingContext } = await import("../scripts/sheets/crafting-context.mjs");
const { recipeMemory } = await import("../scripts/data/crafting.mjs");
const craftingNative = new foundry.documents.BaseActor({name:"Crafting",type:"character",system:{attributes:{intelligence:6,craft:7},skills:{crafting:4}},items:[
  {name:"Железо",type:"equipment",system:{ruleId:"material.iron",kind:"material",quantity:3}},
  {name:"Рецепт <script>тест</script>",type:"recipe",system:{quantity:0,carried:false,recipe:{memorized:true,resultUuid:"Item.result",dc:14,time:5400,tools:["gear.crafting-tools"],components:[{uuid:"Item.iron",quantity:2}]}}}
]});
const craftingRestored = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(craftingNative.toObject())));
const nativeMaterial = craftingRestored.items.find(item=>item.system.ruleId==="material.iron");
nativeMaterial.testUserPermission=()=>true;
const nativeCraftResult=new foundry.documents.BaseItem({name:"Изделие",type:"weapon"});
nativeCraftResult.testUserPermission=()=>true;
const previousCraftLookup=foundry.utils.fromUuid;
foundry.utils.fromUuid=async uuid=>uuid==="Item.iron"?nativeMaterial:uuid==="Item.result"?nativeCraftResult:null;
const nativeCraftContext=await craftingContext({...sheet.actor,system:craftingRestored.system,items:craftingRestored.items});
foundry.utils.fromUuid=previousCraftLookup;
assert.deepEqual(recipeMemory({system:craftingRestored.system,items:craftingRestored.items}),{used:1,capacity:6,free:5,full:false});
assert.equal(nativeCraftContext.crafting,11);
assert.equal(nativeCraftContext.groups[0].recipes[0].total,"+11");
assert.equal(nativeCraftContext.groups[0].recipes[0].materials[0].supplied,2);
const craftingPartial=handlebars.compile(await readFile(new URL("../templates/crafting.hbs",import.meta.url),"utf8"),{strict:true});
const craftingHTML=craftingPartial({crafting:nativeCraftContext,editable:true,rootId:"sheet"});
assert.ok(craftingHTML.includes("1 ч. 30 мин."));assert.ok(craftingHTML.includes("Переработка после неудачи"));
assert.ok(!craftingHTML.includes("<script>тест</script>"));assert.ok(craftingHTML.includes("&lt;script&gt;тест&lt;/script&gt;"));
assert.match(craftingHTML,/data-action="craftInventory"[^>]*>/);
const observerCraftingHTML=craftingPartial({crafting:nativeCraftContext,editable:false,rootId:"sheet"});
assert.match(observerCraftingHTML,/data-action="craftInventory"[^>]*disabled/);
assert.match(observerCraftingHTML,/data-action="toggleRecipeMemory"[^>]*disabled/);
assert.ok(html.includes('data-tab="crafting"'));
// Repair (p. 140) and the alchemy tab (pp. 141–147) render through native schemas, strict templates and observer mode.
const { alchemyContext } = await import("../scripts/sheets/crafting-context.mjs");
const workshopNative = new foundry.documents.BaseActor({name:"Workshop",type:"character",system:{attributes:{intelligence:6,craft:7},skills:{crafting:4,alchemy:3}},items:[
  {name:"Сломанный меч",type:"weapon",_stats:{compendiumSource:"Item.sword00000000001"},system:{ruleId:"weapon.test",reliability:{value:0,max:10}}},
  {name:"Железо",type:"equipment",system:{ruleId:"material.iron",kind:"material",quantity:3}},
  {name:"Чертёж меча",type:"recipe",system:{quantity:1,recipe:{category:"diagram",resultUuid:"Item.sword00000000001",dc:14,time:600,tools:[],components:[{uuid:"Item.iron",quantity:3}]}}},
  {name:"Ячмень",type:"equipment",system:{ruleId:"material.barley",kind:"material",quantity:2,material:{substance:"vitriol"}}},
  {name:"Формула: Галлюциноген",type:"recipe",system:{quantity:1,recipe:{category:"formula",resultUuid:"Item.potion",dc:12,time:15,tools:["gear.alchemy-tools"],components:[{substance:"vitriol",quantity:1},{substance:"rebis",quantity:1}]}}}
]});
const workshopRestored = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(workshopNative.toObject())));
for (const item of workshopRestored.items) item.testUserPermission = () => true;
const nativeSword = new foundry.documents.BaseItem({name:"Меч",type:"weapon",system:{ruleId:"weapon.test"}}), nativePotion = new foundry.documents.BaseItem({name:"Галлюциноген",type:"equipment",system:{kind:"alchemy",alchemy:{category:"substance"}}});
for (const item of [nativeSword, nativePotion]) item.testUserPermission = () => true;
const workshopLookup = {"Item.iron":workshopRestored.items.find(item=>item.system.ruleId==="material.iron"),"Item.sword00000000001":nativeSword,"Item.potion":nativePotion};
const equipmentIndex = game.packs.get(equipmentPack);
equipmentIndex.getIndex = async () => new Map();
foundry.utils.fromUuid = async uuid => workshopLookup[uuid] ?? null;
const repairActor = {...sheet.actor,system:workshopRestored.system,items:workshopRestored.items};
const nativeRepairContext = await craftingContext(repairActor), nativeAlchemyContext = await alchemyContext(repairActor);
foundry.utils.fromUuid = previousCraftLookup;
delete equipmentIndex.getIndex;
assert.equal(nativeRepairContext.repair.rows.length, 1);
assert.equal(nativeRepairContext.repair.rows[0].dc, 9, "Repair DC is the diagram DC − 5");
assert.equal(nativeRepairContext.repair.rows[0].condition.broken, true);
assert.equal(nativeRepairContext.groups[0].recipes.length, 1, "Formulas are not listed on the crafting tab");
assert.equal(nativeAlchemyContext.groups[0].recipes[0].kind, "substance");
assert.deepEqual(nativeAlchemyContext.groups[0].recipes[0].signs.map(sign => [sign.id, sign.missing]), [["vitriol", false], ["rebis", true]]);
assert.equal(nativeAlchemyContext.substances.find(entry => entry.id === "vitriol").count, 2);
const repairHTML = craftingPartial({crafting:nativeRepairContext,editable:true,rootId:"sheet"});
assert.ok(repairHTML.includes("Починка и разборка") && repairHTML.includes("Сломано"));
assert.match(repairHTML, /data-action="repairWorkpiece"(?![^>]*disabled)[^>]*>/);
assert.match(craftingPartial({crafting:nativeRepairContext,editable:false,rootId:"sheet"}), /data-action="repairWorkpiece"[^>]*disabled/);
const alchemyPartial = handlebars.compile(await readFile(new URL("../templates/alchemy.hbs", import.meta.url), "utf8"), {strict:true});
const alchemyHTML = alchemyPartial({alchemy:nativeAlchemyContext,editable:true,rootId:"sheet"});
assert.ok(alchemyHTML.includes("assets/substances/vitriol.svg") && alchemyHTML.includes("Ячмень"));
assert.match(alchemyHTML, /class="is-missing" src="systems\/witcher-eliott-system\/assets\/substances\/rebis.svg"/);
assert.match(alchemyPartial({alchemy:nativeAlchemyContext,editable:false,rootId:"sheet"}), /data-action="craftInventory"[^>]*disabled/);
assert.ok(html.includes('data-tab="alchemy"'));
// Real old/new record schemas, chronological presentation, escaping and native disclosure preferences.
const {lifepathContext:timelineContext}=await import("../scripts/sheets/lifepath-context.mjs");
const timelineSource=new WitcherActorData({details:{race:"witcher",age:110},lifepath:{witcher:{decades:[
  {id:"d30",age:30,risk:"normal",outcome:"hunt",hunt:{category:"Вампиры"},danger:{kind:"none"}},
  {id:"d40",age:40,risk:"risky",outcome:"ally",ally:{name:"Настя"},danger:{kind:"enemy"},enemy:{name:"Другой человек"}},
  {id:"d20",age:20,risk:"cautious",outcome:"nothing",notes:"<script>user text</script>"},
  {id:"d100",age:100,risk:"normal",outcome:"nothing"}
]},events:[{id:"e40",age:40,kind:"ally",ally:{name:"Союзник"}},{id:"e20",age:20,kind:"fortune",fortune:{result:"money",amount:500}}]}});
const timelineRestored=new WitcherActorData(JSON.parse(JSON.stringify(timelineSource.toObject())));
const timelineActor={system:timelineRestored};
const timelineTemplate=handlebars.compile(await readFile(new URL("../templates/lifepath.hbs",import.meta.url),"utf8"),{strict:true});
const timelineHTML=timelineTemplate({lifepath:timelineContext(timelineActor,{collapsed:{"lifepath-decade-d20":true}}),editable:true});
assert.ok(timelineHTML.indexOf("20–29")<timelineHTML.indexOf("30–39"));
assert.ok(timelineHTML.indexOf("40–49")<timelineHTML.indexOf("100–109"));
assert.ok(timelineHTML.includes('data-action="editDecade" data-entry-id="d20"'));
assert.ok(timelineHTML.includes("Опасность · Враг"));assert.ok(timelineHTML.includes("Другой человек"));
assert.ok(!timelineHTML.includes("<script>user text</script>"));assert.ok(timelineHTML.includes("&lt;script&gt;user text&lt;/script&gt;"));
assert.match(timelineHTML,/data-biography-section="lifepath-decade-d20"\s*>/);
assert.deepEqual(timelineRestored.lifepath.witcher.decades.map(entry=>entry.id),["d30","d40","d20","d100"]);
timelineRestored.updateSource({"details.race":"human"});
const eventsHTML=timelineTemplate({lifepath:timelineContext(timelineActor),editable:false});
assert.ok(eventsHTML.indexOf('<b>20</b>')<eventsHTML.indexOf('<b>40</b>'));
assert.match(eventsHTML,/data-action="editLifeEvent" data-entry-id="e20"[^>]*disabled/);
assert.ok(!html.includes("witcher-sidebar-extra"),"Extra action is only offered inside Actions");
assert.ok(!html.includes("СТАЛЬ И РЕАКЦИЯ"));
assert.ok(html.includes("Перемещение"));
const {combatContext:fullTurnCombatContext}=await import("../scripts/sheets/combat-context.mjs");
const combatTemplate=handlebars.compile(await readFile(new URL("../templates/combat-actions.hbs",import.meta.url),"utf8"),{strict:true});
const dodgeForRender={...conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="active-dodge")),statuses:new Set(["active-dodge"])};
const aimForRender={...conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="aiming")),statuses:new Set(["aiming"])};
aimForRender.flags[game.system.id].conditionState={counter:2};
const fullTurnActor={...sheet.actor,items:[],effects:[dodgeForRender,aimForRender]};
const fullTurnCombat=fullTurnCombatContext(fullTurnActor,{repeat:true});
assert.equal(fullTurnCombat.repeat,false);assert.equal(fullTurnCombat.defenses[0].cost,0);
const fullTurnHTML=combatTemplate({combat:fullTurnCombat,editable:true});
assert.ok(fullTurnHTML.includes('data-combat-option="location"'));
assert.ok(!fullTurnHTML.includes('data-action="rollLocation"'));
assert.match(fullTurnHTML,/<h3>.*Атака<\/h3>/);
assert.match(fullTurnHTML,/data-combat-option="repeat"\s+disabled/);
assert.ok(fullTurnHTML.includes("+2 / +3"));assert.ok(fullTurnHTML.includes("Действия полного хода"));
assert.ok(combatTemplate({combat:fullTurnCombat,editable:false}).includes('data-full-turn="aiming" disabled'));
// A new optional magic state round-trips on old/new actors without touching old resources.
assert.equal(legacyActorData.magic.spent,0);
assert.equal(legacyActorData.magic.improvementPoints,0);
assert.deepEqual(legacyActorData.magic.powerVisits,[]);
const powerCharacter=new WitcherActorData({...legacyActorData.toObject(),magic:{improvementPoints:10,powerVisits:[{placeUuid:"Actor.power",draws:3,saves:1,lastDraw:700}]}});
const reopenedPowerCharacter=new WitcherActorData(JSON.parse(JSON.stringify(powerCharacter.toObject())));
assert.equal(reopenedPowerCharacter.magic.improvementPoints,10);
assert.equal(reopenedPowerCharacter.magic.powerVisits[0].saves,1);
assert.equal(legacyActorData.magic.study.sourceUuid,"");
powerCharacter.updateSource({"magic.study":{id:"studynative00001",sourceUuid:"Compendium.witcher-eliott-system.spells.Item.test",sourceName:"Зеркало Афана",teacher:"Книга из Аретузы",skill:"spellCasting",cost:10,baseDays:4,dc:14,required:2,days:2,successes:1,failures:1,regularSpent:4,magicSpent:6}});
const studyRestored=new WitcherActorData(JSON.parse(JSON.stringify(powerCharacter.toObject())));
assert.equal(studyRestored.magic.study.teacher,"Книга из Аретузы");assert.equal(studyRestored.magic.study.failures,1);assert.equal(studyRestored.magic.study.magicSpent,6);
const {learningContext}=await import("../scripts/sheets/learning-context.mjs");
const learningTemplate=handlebars.compile(await readFile(new URL("../templates/learning.hbs",import.meta.url),"utf8"),{strict:true});
assert.match(learningTemplate({learning:learningContext(sheet.actor),editable:true}),/Выбрать магию для изучения/);
const learningHTML=learningTemplate({learning:learningContext({...sheet.actor,system:studyRestored}),editable:true});
assert.match(learningHTML,/День занятий/);assert.match(learningHTML,/Книга из Аретузы/);
assert.match(learningHTML,/2 \/ 5/);
const learnedActor=new foundry.documents.BaseActor({name:"Ученица",type:"character",system:studyRestored.toObject()});
const {spellSources:studySpellSources}=await import("../scripts/data/spells.mjs");
learnedActor.updateSource({"system.magic.study.sourceUuid":"",items:[studySpellSources()[0]]});
const learnedRestored=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(learnedActor.toObject())));
assert.equal(learnedRestored.items.size,1);assert.equal(learnedRestored.system.magic.study.sourceUuid,"");
const magicRoundTrip = new WitcherActorData({...legacyActorData.toObject(),magic:{roundKey:"combat:2",spent:7,sustainedId:"spell00000000001",maintainedRound:"combat:2",sustainedCost:5}});
const magicRestored = new WitcherActorData(JSON.parse(JSON.stringify(magicRoundTrip.toObject())));
assert.equal(magicRestored.magic.spent,7);assert.equal(magicRestored.health.value,legacyActorData.health.value);
assert.equal(magicRestored.magic.sustainedId,"spell00000000001");
assert.equal(magicRestored.magic.sustainedCost,5);assert.equal(legacyActorData.magic.sustainedCost,0);
const {spellSources:magicSources}=await import("../scripts/data/spells.mjs");
const nativeSpell = new foundry.documents.BaseItem(magicSources()[0]);
const restoredSpell = new foundry.documents.BaseItem(JSON.parse(JSON.stringify(nativeSpell.toObject())));
assert.equal(restoredSpell.system.duration.maintenance,2);
assert.deepEqual(Array.from(restoredSpell.system.defense),["none"]);
assert.equal(restoredSpell.type,"spell");
const legacySpellSource=nativeSpell.toObject();delete legacySpellSource.system.tradition;delete legacySpellSource.system.kind;
assert.equal(new foundry.documents.BaseItem(legacySpellSource).system.tradition,"mage","Existing spells default to mage without a migration");
assert.equal(new foundry.documents.BaseItem(legacySpellSource).system.kind,"spell");
const nativeInvocation=new foundry.documents.BaseItem(magicSources().find(s=>s.system.ruleId==="invocation.healing-rest"));
const reopenedInvocation=new foundry.documents.BaseItem(JSON.parse(JSON.stringify(nativeInvocation.toObject())));
assert.equal(reopenedInvocation.system.deity,"Мелитэле");assert.equal(reopenedInvocation.system.duration.kind,"days");
assert.equal(reopenedInvocation.system.tradition,"priest");assert.equal(reopenedInvocation.system.grade,"archpriest");
const {magicContext,spellItemContext}=await import("../scripts/sheets/magic-context.mjs");
const magicOnlyTemplate=handlebars.compile(await readFile(new URL("../templates/magic.hbs",import.meta.url),"utf8"),{strict:true});
const magicActor={...sheet.actor,items:[nativeSpell]};
const magicHTML=magicOnlyTemplate({magic:await magicContext(magicActor),editable:true});
assert.match(magicHTML,/data-action="castSpell"/);assert.match(magicHTML,/Зеркало Афана/);
assert.equal(spellItemContext(nativeSpell,true).groups[0].fields.find(f=>f.key==="duration.maintenance").value,2);
const invocationHTML=magicOnlyTemplate({magic:await magicContext({...magicActor,items:[reopenedInvocation]}),editable:true});
assert.match(invocationHTML,/Целительный покой/);assert.match(invocationHTML,/Мелитэле/);assert.match(invocationHTML,/1 день/);
assert.match(invocationHTML,/data-magic-tradition/);
const expandedMagic=magicSources().filter(s=>s.system.kind).map(source=>new foundry.documents.BaseItem(JSON.parse(JSON.stringify(new foundry.documents.BaseItem(source).toObject()))));
assert.equal(expandedMagic.length,31);
for(const item of expandedMagic){
  const context=spellItemContext(item,true);assert.equal(context.isRitual,item.system.kind==="ritual");
  const rendered=magicOnlyTemplate({magic:await magicContext({...magicActor,items:[item]}),editable:true});
  assert.ok(rendered.includes(item.name));
  if(context.isRitual){assert.match(rendered,/Подготовка/);assert.ok(context.groups[0].fields.some(f=>f.key==="ritual.dc"));}
  if(context.isHex)assert.match(rendered,/Снятие порчи/);
}
const shield=expandedMagic.find(item=>item.system?.ruleId==="sign.active-shield");
assert.equal(shield.system.duration.maintenanceMode,"fullCost");
const communicator=expandedMagic.find(item=>item.system?.ruleId==="ritual.telecommunication");
assert.equal(communicator.system.ritual.components[0].consumed,false);
// Render both permission levels with real service schema; native browser host is stubbed above.
const { WitcherServicesSheet } = await import("../scripts/sheets/witcher-services-sheet.mjs");
const servicesTemplate=handlebars.compile(await readFile(new URL("../templates/services-sheet.hbs",import.meta.url),"utf8"),{strict:true});
const serviceSheet=new WitcherServicesSheet();
serviceSheet.actor=reopenedProvider;
Object.defineProperty(serviceSheet,"isEditable",{get:()=>game.user.isGM});
const serviceTestGlobals={actors:game.actors,messages:game.messages,users:game.users,user:game.user};
game.actors=[{id:"customer",uuid:"Actor.customer",type:"character",name:"Test visitor",system:{crowns:50},testUserPermission:()=>true}];
game.messages=[];game.users={activeGM:game.user};
const providerGMHtml=servicesTemplate(await serviceSheet._prepareContext({}));
assert.ok(providerGMHtml.includes("Сохранить ассортимент и цены"));
assert.ok(providerGMHtml.includes('value="23"'));
game.user=player;
const providerPlayerHtml=servicesTemplate(await serviceSheet._prepareContext({}));
assert.ok(!providerPlayerHtml.includes("data-provider-name"));
assert.ok(!providerPlayerHtml.includes('data-tab="manage"'));
assert.ok(providerPlayerHtml.includes('data-action="sendServiceOrder" data-player-control'));
assert.ok(providerPlayerHtml.includes("Test visitor"));
Object.assign(game,serviceTestGlobals);
const {WitcherPowerPlaceSheet}=await import("../scripts/sheets/witcher-power-place-sheet.mjs");
const powerSheet=new WitcherPowerPlaceSheet();powerSheet.actor=reopenedPowerPlace;
Object.defineProperty(powerSheet,"isEditable",{get:()=>game.user.isGM});
const powerTemplate=handlebars.compile(await readFile(new URL("../templates/power-place.hbs",import.meta.url),"utf8"),{strict:true});
const powerGlobals={actors:game.actors,time:game.time,user:game.user};
game.time={worldTime:800};game.actors=[{...sheet.actor,id:"visitor",isOwner:true}];
assert.match(powerTemplate(await powerSheet._prepareContext({})),/name="system.element"/);
game.user=player;
const powerPlayerHTML=powerTemplate(await powerSheet._prepareContext({}));
assert.match(powerPlayerHTML,/data-action="drawPower"/);assert.doesNotMatch(powerPlayerHTML,/name="system.element"/);
Object.assign(game,powerGlobals);
// Paid advancement uses the existing schema and an atomic parent update, including new embedded abilities.
const { advancementContext } = await import("../scripts/sheets/advancement-window.mjs");
const { advancementFingerprint } = await import("../scripts/data/advancement.mjs");
const { purchaseAdvancement } = await import("../scripts/data/advancement-purchase.mjs");
const advancementHTML = handlebars.compile(await readFile(new URL("../templates/advancement.hbs", import.meta.url), "utf8"), { strict: true });
assert.equal(legacyActorData.experience, 0, "Old actors gain a zero IP balance without migration");
assert.equal(new WitcherActorData().experience, 0);
assert.deepEqual(new WitcherActorData().toObject().reputation, { value: 0, bonusEnabled: false, skills: [] });
const reputationActor = new foundry.documents.BaseActor({ name: "Reputation round trip", type: "character", system: {
  attributes: { body: 8, will: 8 }, health: { value: 40, max: 40 }, details: { race: "human", familyStatus: "north.aristocracy" },
  reputation: { value: 4, bonusEnabled: true, skills: ["persuasion"] }
} });
const reopenedReputation = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(reputationActor.toObject())));
assert.equal(reopenedReputation.system.reputation.value, 4);
assert.equal(reopenedReputation.system.statistics.reputation, 6);
assert.equal(reopenedReputation.system.statistics.skillBonuses.persuasion, 3);
assert.deepEqual([...reopenedReputation.system.reputation.skills], ["persuasion"]);
const advancingActor = new foundry.documents.BaseActor({ name: "Advancement round trip", type: "character", system: {
  experience: 100, attributes: { body: 5, will: 5 }, health: { value: 21, max: 25 }, stamina: { value: 12, max: 25 },
  details: { profession: "bard" }, skills: { swordsmanship: 4 }, languages: [{ id: "customLanguage1", name: "Custom language", level: 1 }]
}, items: [{ _id: "keepweapon000001", name: "Old sword", type: "weapon", system: { weight: 1.5 } }] });
Object.defineProperty(advancingActor, "isOwner", { value: true });
let advancementWrites = 0;
advancingActor.update = async update => { advancingActor.updateSource(update); advancementWrites++; return advancingActor; };
const bardDefinition = (await import("../scripts/data/professions.mjs")).getProfession("bard").abilities[0];
await purchaseAdvancement(advancingActor, { "skill:swordsmanship": 7, "attribute:body": 6,
  "language:lang000000000002": 1, [`ability:${bardDefinition.id}`]: 1 }, advancementFingerprint(advancingActor), game.i18n.localize);
assert.equal(advancementWrites, 1, "Points, stats, languages and embedded Items share one update");
const reopenedAdvancement = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(advancingActor.toObject())));
reopenedAdvancement.system.prepareDerivedData();
assert.equal(reopenedAdvancement.system.experience, 32);
assert.equal(reopenedAdvancement.system.skills.swordsmanship, 7);
assert.equal(reopenedAdvancement.system.attributes.body, 6);
assert.equal(reopenedAdvancement.system.health.value, 21, "Increasing an attribute does not heal");
assert.equal(reopenedAdvancement.system.stamina.value, 12);
assert.equal(reopenedAdvancement.system.languages.length, 2);
assert.equal(reopenedAdvancement.items.size, 2, "The old sword survives the embedded ability insert");
assert.equal([...reopenedAdvancement.items].find(item => item.type === "ability").system.level, 1);
await purchaseAdvancement(advancingActor, { [`ability:${bardDefinition.id}`]: 2 }, advancementFingerprint(advancingActor));
assert.equal(advancingActor.items.size, 2, "A second purchase updates the same ability Item");
for (const category of ["skills", "languages", "attributes", "profession"]) {
  assert.ok(advancementHTML({ ...advancementContext(advancingActor, {}, category), query: "", notice: "" }).includes("witcher-advancement-buy"));
}
assert.ok(advancementHTML({ ...advancementContext(advancingActor, { "skill:swordsmanship": 8 }), query: "", notice: "" }).includes("7 → 8"));
const professionDefinition = (await import("../scripts/data/professions.mjs")).getProfession("bard");
const rootKey = `ability:${bardDefinition.id}`;
const branchKey = `ability:${professionDefinition.abilities[1].id}`;
const treeBefore = advancementContext(advancingActor, {}, "profession");
assert.equal(treeBefore.profession.branches.length, 3);
assert.ok(treeBefore.profession.branches.every(branch => branch.entries.length === 3));
assert.ok(treeBefore.profession.branches.every(branch => branch.entries[0].cannotIncrease));
const treePlan = advancementContext(advancingActor, { [rootKey]: 5, [branchKey]: 5 }, "profession");
assert.equal(treePlan.profession.defining.displayLevel, 2);
assert.equal(treePlan.profession.defining.displayTarget, 5);
assert.equal(treePlan.profession.defining.progress.filter(pip => pip.filled).length, 2);
assert.equal(treePlan.profession.defining.progress.filter(pip => pip.planned).length, 3);
assert.equal(treePlan.profession.branches[0].entries[1].cannotIncrease, false, "Planned rank five opens the next node");
assert.equal(treePlan.profession.branches[1].entries[1].cannotIncrease, true, "Other branches retain their own prerequisite");
const plannedTreeHTML = advancementHTML({ ...treePlan, query: "", notice: "" });
assert.equal([...plannedTreeHTML.matchAll(/data-node-id=/g)].length, 10);
assert.ok(!plannedTreeHTML.includes('data-action="rollProfessionAbility"'), "Purchasing cannot accidentally roll a node");
assert.ok(plannedTreeHTML.includes('data-action="viewSheetItem"'));
assert.equal(advancingActor.items.getName(bardDefinition.name).system.level, 2, "Planning never mutates the actor");
// Render saved inventory through the same strict template used by old and new actors.
const { inventoryContext } = await import("../scripts/sheets/inventory-context.mjs");
const { workshopActorContext } = await import("../scripts/sheets/workshop-actor-context.mjs");
const inventoryHTML = handlebars.compile(await readFile(new URL("../templates/inventory.hbs", import.meta.url), "utf8"), { strict: true });
// Old catalog imports default to a raised visor; PC/NPC save/reopen uses one native Boolean.
const { abilitiesContext } = await import("../scripts/sheets/abilities-context.mjs");
const { physicalItemContext } = await import("../scripts/sheets/physical-item-context.mjs");
const legacyVisorSource = await readJSON("../pack-sources/equipment.json").then(entries => entries.find(entry => entry.system?.ruleId === "armor.head.6"));
for (const type of ["character", "npc"]) {
  const wearer = new foundry.documents.BaseActor({name: "Visor round trip", type, system: {details: {race: "witcher"}, notes: "Existing notes"},
    items: [{...legacyVisorSource, system: {...legacyVisorSource.system, equipped: true}}]});
  const helm = wearer.items.contents[0];
  assert.equal(helm.system.visorDown, false);
  assert.equal(wearer.system.statistics.skillBonuses.awareness, 1);
  helm.updateSource({"system.visorDown": true});
  const reopened = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(wearer.toObject())));
  const savedHelm = reopened.items.contents[0];
  assert.equal(savedHelm.system.visorDown, true);
  assert.equal(reopened.system.notes, "Existing notes");
  assert.equal(reopened.system.statistics.skillBonuses.awareness ?? 0, 0);
  const visorHTML = inventoryHTML({rootId: "visor", editable: true, system: reopened.system, inventory: inventoryContext(reopened), workshop: await workshopActorContext(reopened)});
  assert.match(visorHTML, /data-action="toggleVisor"[^>]*aria-pressed="true"/);
  assert.ok(visorHTML.includes("Забрало опущено"));
  const observerHTML = inventoryHTML({rootId: "visor", editable: false, system: reopened.system, inventory: inventoryContext(reopened), workshop: await workshopActorContext(reopened)});
  assert.match(observerHTML, /data-action="toggleVisor"[^>]*disabled/);
  assert.ok(physicalItemContext(savedHelm, true).some(group => group.fields.some(field => field.name === "system.visorDown" && field.value)));
  assert.equal((await abilitiesContext(reopened)).entries.filter(entry => entry.suppressed).length, 1);
  savedHelm.updateSource({"system.visorDown": false});
  assert.equal(reopened.system.statistics.skillBonuses.awareness, 1);
  assert.equal((await abilitiesContext(reopened)).entries.filter(entry => entry.suppressed).length, 0);
}
const bagActor = new foundry.documents.BaseActor({ name: "Containers round trip", type: "character", items: [
  { _id: "bag0000000000001", name: "Bag", type: "equipment", system: { kind: "container", capacity: 5, weight: 1 } },
  { _id: "bag0000000000002", name: "Pouch", type: "equipment", system: { kind: "container", capacity: 1, weight: 0.2, containerId: "bag0000000000001" } },
  { _id: "ore0000000000001", name: "Ore", type: "equipment", system: { kind: "material", weight: 0.4, quantity: 2, containerId: "bag0000000000002" } }
] });
const reopenedBags = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(bagActor.toObject())));
const bagContext = inventoryContext(reopenedBags);
assert.equal(bagContext.weight, 2);
assert.equal(bagContext.groups.find(group => group.id === "container").items[0].children[0].children[0].name, "Ore");
const bagHTML = inventoryHTML({ rootId: "nested-inventory", editable: true, system: reopenedBags.system, inventory: bagContext, workshop: await workshopActorContext(reopenedBags) });
assert.ok(bagHTML.includes("1 / 5 кг")); assert.ok(bagHTML.includes("0.8 / 1 кг"));
assert.equal([...bagHTML.matchAll(/data-inventory-name=/g)].length, 3);
const legacyBag = new foundry.documents.BaseItem({ name: "Legacy bag", type: "equipment", system: { ruleId: "gear.bag" } });
assert.equal(legacyBag.system.kind, "container"); assert.equal(legacyBag.system.capacity, 20);
const customBag = new foundry.documents.BaseItem({ name: "Customized bag", type: "equipment", system: { ruleId: "gear.bag", kind: "gear", capacity: 0, quantity: 3 } });
assert.equal(customBag.system.kind, "gear"); assert.equal(customBag.system.quantity, 3);
const savedInventoryContext = inventoryContext(restoredInventory);
const savedInventoryHTML = inventoryHTML({ rootId: "saved-inventory", editable: true, system: restoredInventory.system, inventory: savedInventoryContext, workshop: await workshopActorContext(restoredInventory) });
const { equipmentEntry, equipmentFacets } = await import("../scripts/data/equipment-search.mjs");
const browserEntries = [...documents.values()].filter(item => ["weapon", "armor", "equipment", "recipe"].includes(item.type)).map(equipmentEntry);
const browserTemplate = handlebars.compile(await readFile(new URL("../templates/equipment-browser.hbs", import.meta.url), "utf8"), { strict: true });
const browserContext = { entries: browserEntries, facets: equipmentFacets(browserEntries), hintKey: "Каталог", hasActor: true, actorName: "Покупатель" };
const browserHTML = browserTemplate(browserContext);
assert.ok(browserHTML.includes('value="shield"')); assert.ok(browserHTML.includes('data-equipment-filter="priceMax"'));
assert.equal([...browserHTML.matchAll(/data-catalog-action="view"/g)].length, browserEntries.length);
assert.equal([...browserHTML.matchAll(/data-catalog-action="buy"/g)].length, browserEntries.length);
assert.ok(!browserHTML.includes('name="reference-choice"'));
assert.ok(!browserTemplate({ ...browserContext, hasActor: false }).includes('data-catalog-action="buy"'));
assert.ok(browserHTML.includes('Игнорирует сопротивление брони'));
assert.equal(savedInventoryContext.groups.flatMap(group => group.items).length, 2);
assert.equal([...savedInventoryHTML.matchAll(/data-inventory-quantity /g)].length, 2);
assert.ok(savedInventoryHTML.includes("ПБ 8 / 12"));
assert.ok(savedInventoryHTML.includes("Бригантина"));
assert.ok(savedInventoryHTML.includes('data-action="toggleCarried"'));
assert.ok(!html.includes("<script>test</script>"), "Actor names must be escaped");
assert.ok(html.includes('data-action="showPortraitArtwork"'));
assert.ok(html.includes('data-action="editPortrait"'));
assert.ok(html.includes('name="system.details.age"'));
assert.ok(html.includes('name="system.details.gender"'));
assert.ok(html.includes('data-kind="race"'));
assert.ok(html.includes('data-kind="origin"'));
assert.ok(!html.includes('<select name="system.details.'), "Race and origin must use the browser, not dropdowns");
assert.ok(!html.includes('data-action="viewRace"'), "An unset race has no broken preview button");
assert.ok(!html.includes('name="system.notes"'));
assert.ok(!html.includes("witcher-vision"));
assert.ok(!html.includes("witcher-footnote"));
assert.equal([...html.matchAll(/data-action="tab"/g)].length, 13);
assert.equal([...html.matchAll(/name="system.attributes\./g)].length, 0, "Base attributes are locked by default");
sheet.submit = async () => {};
sheet.render = async () => {};
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
const editableStatisticsHTML = template(await sheet._prepareContext({}));
assert.equal([...editableStatisticsHTML.matchAll(/name="system.attributes\./g)].length, 9);
assert.match(editableStatisticsHTML, /role="switch" aria-checked="true"/);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
assert.equal((await sheet._prepareContext({})).editingAttributes, false);
assert.equal((await sheet._prepareContext({})).editingExperience, false);
assert.equal((await sheet._prepareContext({})).editingReputation, false);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleReputation.call(sheet);
const reputationEditingHTML = template(await sheet._prepareContext({}));
assert.ok(reputationEditingHTML.includes('data-header-counter="reputation"'));
assert.ok(reputationEditingHTML.includes('data-action="rollReputation"'));
assert.ok(reputationEditingHTML.includes('data-action="toggleReputationBonus"'));
assert.ok(!reputationEditingHTML.includes('name="system.reputation.value"'));
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleReputation.call(sheet);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleExperience.call(sheet);
const experienceEditingHTML = template(await sheet._prepareContext({}));
assert.ok(experienceEditingHTML.includes("data-sheet-experience"));
assert.ok(!experienceEditingHTML.includes('name="system.experience"'), "XP editing goes through the shared guarded writer");
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleExperience.call(sheet);
assert.equal((await sheet._prepareContext({})).editingExperience, false);
assert.equal([...html.matchAll(/data-action="rollSkill" data-skill="(?!language")/g)].length, 49);
assert.equal([...html.matchAll(/data-action="rollSkill" data-skill="language"/g)].length, 3);
assert.equal([...html.matchAll(/name="system.skills\./g)].length, 0, "Skills are locked until editing is enabled");
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleSkills.call(sheet);
assert.equal([...template(await sheet._prepareContext({})).matchAll(/name="system.skills\./g)].length, 49);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleSkills.call(sheet);
assert.ok(html.includes('data-action="rollStun"'));
assert.ok(!html.includes('name="system.carriedWeight"'));
assert.ok(!html.includes('data-tab="parameters"'));
assert.equal([...html.matchAll(/data-action="rollAttribute"/g)].length, 9);
assert.ok(!html.includes('data-action="addStunned"'));
assert.ok(html.indexOf('witcher-parameters') > html.indexOf('id="test-actor-main"'));
assert.ok(html.indexOf('witcher-parameters') < html.indexOf('id="test-actor-biography"'));
assert.ok(!html.match(/<(?:div|fieldset)[^>]+data-tooltip=/), "Tooltips must not cover entire cards or resource rows");
assert.ok(html.indexOf("Порог ранения") < html.indexOf('class="witcher-resource stamina"'));
assert.ok(html.indexOf("Отдых") < html.indexOf('class="witcher-derived"'));
assert.ok(html.includes('name="system.vigor"'));
assert.ok(!html.includes("undefined"));
assert.ok(html.includes('data-action="configureTabs"'));
assert.equal([...html.matchAll(/data-biography-section=/g)].length, 11);
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
assert.equal(sheet.tabGroups.character, "skills", "Hiding the active tab must select a visible one");
assert.deepEqual(customized.visibleTabs.map(tab => tab.id), ["skills", "profession", "actions", "magic", "inventory", "crafting", "alchemy", "transport", "biography", "family", "lifepath", "effects"]);
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
    assert.ok(rendered.includes(foundry.utils.getProperty(translations, ability.description)),
      "The skills tab includes descriptions of the current racial abilities");
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
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleExperience.call(sheet);
assert.equal((await sheet._prepareContext({})).editingExperience, false, "Observers cannot unlock the XP balance");
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleReputation.call(sheet);
assert.equal((await sheet._prepareContext({})).editingReputation, false, "Observers cannot unlock reputation");
const originalData = sheet.actor.system;
sheet.actor.system = restored;
sheet.tabGroups.character = "main";
const statisticsHTML = template(await sheet._prepareContext({}));
assert.match(statisticsHTML, /id="test-actor-main" class="witcher-character-content tab active"/);
assert.ok(statisticsHTML.includes('<output id="test-actor-health-max">50</output>'));
assert.ok(!statisticsHTML.includes('name="system.health.max"'), "Calculated maxima must not be resubmitted as manual values");
assert.match(statisticsHTML, /<output id="test-actor-attribute-reflex"[^>]*>3<\/output>/);
assert.match(statisticsHTML, /<button[^>]*data-action="rollStun"[^>]*disabled/);
assert.ok(statisticsHTML.includes('id="test-actor-weight">0 / 30 кг</output>'));
assert.ok(statisticsHTML.includes('data-action="rollDeath"'));
assert.match(statisticsHTML, /id="test-actor-death-penalty"[^>]*value="0"[^>]*disabled/);
assert.equal([...statisticsHTML.matchAll(/data-action="toggleLuck"/g)].length, 100);
sheet.isEditable = true;
sheet.actor.effects = [{ id: "exhaustion", statuses: new Set(["exhausted-stun"]) }];
restored.stamina.value = 19;
const exhaustedHTML = template(await sheet._prepareContext({}));
assert.match(exhaustedHTML, /data-action="rollStun"[^>]*disabled/);
assert.ok(exhaustedHTML.includes("19 / 20 STA"));
assert.equal([...exhaustedHTML.matchAll(/data-action="rollAttribute"[^>]*disabled/g)].length, 9);
assert.match(exhaustedHTML, /data-action="rollDeath"[^>]*>/);
assert.ok(!exhaustedHTML.match(/data-action="rollDeath"[^>]*disabled/), "Incapacitation does not block mandatory death saves");
restored.stamina.value = 20;
const recoveredHTML = template(await sheet._prepareContext({}));
assert.ok(!recoveredHTML.match(/data-action="rollStun"[^>]*disabled/));
assert.ok(recoveredHTML.includes("Можно пройти испытание УСТ"));
sheet.actor.effects = [];
sheet.isEditable = false;
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
const witcherOriginHTML = template(await sheet._prepareContext({}));
assert.ok(!witcherOriginHTML.includes("witcher-origin-excluded"));
assert.match(witcherOriginHTML, /data-action="viewOrigin"[^>]*>\s*<span>[^<]+<\/span>/);
actorData.updateSource({ "details.race": "dwarf" });
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
    ...document.toObject(), uuid, documentName: document.documentName, isOwner: true, system: document.system,
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
for (const [collection, pack] of game.packs) {
  pack.collection = collection;
  pack.testUserPermission = () => true;
  pack.getIndex = async () => new Map([...documents].filter(([uuid]) => uuid.startsWith(`Compendium.${collection}.`))
    .map(([uuid, item]) => [item.id, { ...item.toObject(), uuid }]));
}
const referenceSheet = new WitcherItemSheet();
referenceSheet.isEditable = false;
const itemTemplate = handlebars.compile(await readFile(new URL("../templates/item-sheet.hbs", import.meta.url), "utf8"), { strict: true });
const spellChoicePreviews = {};
{
  referenceSheet.item = [...documents.values()].find(item => item.system?.ruleId === "sign.aard");
  referenceSheet.tabGroups.item = "details";
  for (const editable of [true, false]) {
    referenceSheet.isEditable = editable;
    const context = await referenceSheet._prepareContext({}), html = itemTemplate(context);
    spellChoicePreviews[editable ? "editable" : "readonly"] = html;
    for (const field of ["target", "defense"]) {
      const select = html.match(new RegExp(`<select name="system.${field}"[^>]*>[\\s\\S]*?</select>`))?.[0];
      assert.ok(select); assert.match(select, /multiple size="8"/);
      assert.equal(select.includes("disabled"), !editable);
      assert.ok((select.match(/<option/g) ?? []).length >= 7);
      assert.ok(select.includes('selected'));
    }
    assert.match(html, /name="system.source"[^>]*value="Базовая книга"/);
    assert.doesNotMatch(html, /стр\.\s*\d/);
  }
  const { bookReferenceUpdate } = await import('../scripts/migrations/book-references.mjs');
  const oldSpell = new foundry.documents.BaseItem({ name:'Старый Аард', type:'spell', system:{
    source:'Базовая книга, стр. 114; официальная errata', description:'<p>Урон [[/r 2d6+4]] (стр. 114).</p>', target:['area'], defense:['dodge'] } });
  oldSpell.updateSource(bookReferenceUpdate(oldSpell));
  assert.equal(oldSpell.validationFailures.fields, null);
  assert.equal(oldSpell.system.source, 'Базовая книга');
  assert.equal(oldSpell.system.description, '<p>Урон [[/r 2d6+4]].</p>');
  assert.deepEqual(oldSpell.system.target, ['area']); assert.deepEqual(oldSpell.system.defense, ['dodge']);
  referenceSheet.tabGroups.item = 'description';
  console.log('Spell editor: full multiple selections, read-only permissions and native source cleanup OK');
}
for (const [ruleId, dc, sp, zones] of [["armor.raven", 14, 12, "torso-legs"], ["armor.mountain-folk", 16, 24, "all"], ["armor.draug", 18, 36, "all"]]) {
  const relic = [...documents.values()].find(item => item.system?.ruleId === ruleId);
  assert.ok(relic, `${ruleId}: missing catalog armor`);
  assert.equal(relic.system.stoppingPower.max, sp);
  assert.equal(relic.system.zone, zones);
  assert.equal(relic.system.enhancementSlots, 3);
  referenceSheet.item = relic;
  const context = await referenceSheet._prepareContext({});
  assert.equal(context.relicLore.dc, dc);
  const html = itemTemplate(context);
  assert.match(html, /data-action="rollRelicLore"/);
  assert.ok(html.includes(`Образование СЛ ${dc}`));
  assert.doesNotMatch(html.match(/<button[^>]*data-action="rollRelicLore"[^>]*>/)?.[0] ?? "", /disabled/);
}
const nativeLinenDiagram = [...documents.values()].find(item => item.system?.ruleId === "diagram.material.linen");
const { RELIC_WEAPON_LORE } = await import('../scripts/data/relic-weapons.mjs');
assert.equal(Object.keys(RELIC_WEAPON_LORE).length,14);
for(const [ruleId,lore] of Object.entries(RELIC_WEAPON_LORE)) {
  const relic=[...documents.values()].find(item=>item.system?.ruleId===ruleId);
  assert.ok(relic,`${ruleId}: missing relic weapon`);referenceSheet.item=relic;
  const context=await referenceSheet._prepareContext({}),html=itemTemplate(context);
  assert.equal(context.relicLore.dc,lore.dc);assert.match(html,/data-action="rollRelicLore"/);
  assert.ok(html.includes(`Образование СЛ ${lore.dc}`));assert.equal(relic.flags[game.system.id].priceUnavailable,true);
}
const { EXPERIMENTAL_RECIPES } = await import('../scripts/data/experimental-devices.mjs');
for(const definition of EXPERIMENTAL_RECIPES) {
  const recipe=[...documents.values()].find(item=>item.system?.ruleId===definition.id);
  assert.ok(recipe,`${definition.id}: missing experimental recipe`);referenceSheet.item=recipe;
  const context=await referenceSheet._prepareContext({}),html=itemTemplate(context);
  assert.equal(recipe.system.recipe.time,1800);assert.match(html,/30 мин\./);
  assert.equal(recipe.flags[game.system.id].priceUnavailable,true);assert.equal(recipe.system.price,0);
  assert.equal(context.recipeDetails.investment,definition.system.recipe.investment);
  for(const uuid of [recipe.system.recipe.resultUuid,...recipe.system.recipe.components.map(component=>component.uuid)]) {
    assert.ok(documents.has(uuid),`${definition.id}: unresolved ${uuid}`);
    assert.ok(html.includes(`data-uuid="${uuid}"`),`${definition.id}: missing clickable component/result`);
  }
}
console.log('Relics and experiments: 14 weapon legends and 17 exact linked recipes render in strict item templates');
referenceSheet.item = await foundry.utils.fromUuid(nativeLinenDiagram.uuid);
const nativeRecipeContext = await referenceSheet._prepareContext({});
const nativeRecipeHTML = itemTemplate(nativeRecipeContext);
assert.equal(nativeRecipeContext.recipeDetails.investment, 6);
assert.match(nativeRecipeHTML, /15 мин\./);
assert.match(nativeRecipeHTML, /Доплата/);
assert.ok(nativeRecipeHTML.includes(`data-uuid="${nativeLinenDiagram.system.recipe.resultUuid}"`));
assert.ok(nativeRecipeHTML.includes(`data-uuid="${nativeLinenDiagram.system.recipe.components[0].uuid}"`));
const recipeLinkTags = [...nativeRecipeHTML.matchAll(/<a\b[^>]*class="content-link witcher-recipe-link"[^>]*>/g)].map(match => match[0]);
assert.ok(recipeLinkTags.length >= 3);
for (const tag of recipeLinkTags) {
  assert.doesNotMatch(tag, /\bhref=/, "Foundry opens every a[href] in an external browser window");
  assert.match(tag, /\bdata-link\b/);
  assert.match(tag, /role="link"/);
  assert.match(tag, /tabindex="0"/);
}
assert.match(nativeRecipeHTML, /witcher-recipe-rarity/);
assert.match(nativeRecipeHTML, /is-common">Обычное/);
let keyboardLinkClicks = 0, preventedLinkSubmit = false;
const keyboardLink = { click: () => keyboardLinkClicks++ };
referenceSheet.element = { querySelectorAll: () => [keyboardLink] };
await referenceSheet._onRender({}, {});
await referenceSheet._onRender({}, {});
keyboardLink.onkeydown({ key: "Tab" });
assert.equal(keyboardLinkClicks, 0);
keyboardLink.onkeydown({ key: "Enter", preventDefault: () => { preventedLinkSubmit = true; }, stopPropagation() {} });
assert.equal(keyboardLinkClicks, 1, "Enter activates exactly one native UUID link even after rerendering");
assert.equal(preventedLinkSubmit, true);
assert.match(nativeRecipeHTML, /name="system.recipe.investment"[^>]*value="6"[^>]*disabled/);
const nativeThread = [...documents.values()].find(item => item.system?.ruleId === "material.thread");
referenceSheet.item = nativeThread;
const nativeThreadContext = await referenceSheet._prepareContext({});
assert.ok(nativeThreadContext.recipeDetails.recipes.some(item => item.name === "Чертёж: Нитки"));
assert.ok(nativeThreadContext.recipeDetails.uses.some(item => item.uuid === nativeLinenDiagram.uuid && item.quantity === 2));
assert.match(itemTemplate(nativeThreadContext), /Используется в/);
referenceSheet.item = await foundry.utils.fromUuid(nativeLinenDiagram.uuid);
referenceSheet.isEditable = true;
assert.match(itemTemplate(await referenceSheet._prepareContext({})), /name="system.recipe.investment"[^>]*value="6"/);
referenceSheet.isEditable = false;
const materialSource=(await import('../scripts/data/workshop-materials.mjs')).MATERIALS.find(item=>item.id==='material.timber');
const nativeMaterialItem=new foundry.documents.BaseItem({name:materialSource.name,type:'equipment',system:{...materialSource.system,ruleId:materialSource.id}});
referenceSheet.item=new foundry.documents.BaseItem(JSON.parse(JSON.stringify(nativeMaterialItem.toObject())));
const materialItemHTML=itemTemplate(await referenceSheet._prepareContext({}));
assert.ok(materialItemHTML.includes('Поиск и сбор'));assert.ok(materialItemHTML.includes('СЛ 8'));assert.ok(materialItemHTML.includes('2d6 ед.'));
referenceSheet.item.updateSource({'system.material.forageDC':17,'system.material.location':'Тайный лес'});
const editedMaterialHTML=itemTemplate(await referenceSheet._prepareContext({}));
assert.ok(editedMaterialHTML.includes('СЛ 17'));assert.ok(editedMaterialHTML.includes('Тайный лес'));
const forageTemplate=handlebars.compile(await readFile(new URL('../templates/foraging.hbs',import.meta.url),'utf8'),{strict:true});
const forageHTML=forageTemplate({name:'Смола <script>x</script>',actors:[{id:'Actor.test',name:'Геральт',base:12,selected:true}],details:'',check:true,dc:10,formula:'1d6'});
assert.ok(!forageHTML.includes('name="confirmed"'));assert.ok(!forageHTML.includes('name="minutes"'));
assert.ok(forageHTML.includes('name="actor" required'));assert.ok(forageHTML.includes('Смола &lt;script&gt;'));
assert.match(forageHTML,/name="check" checked/);
const {effectItemSource}=await import('../scripts/data/effect-items.mjs');
const {effectDurationUpdate}=await import('../scripts/data/effect-duration.mjs');
const effectItemData=effectItemSource({...conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==='frozen')),duration:{value:60,units:'seconds',expiry:null,expired:false},changes:[{key:'system.attributes.body',mode:2,value:'1'}]});
effectItemData.effects[0]._id='effectNative0001';
const effectItem=new foundry.documents.BaseItem({_id:'effectItemTest01',...effectItemData});
const reopenedEffectItem=new foundry.documents.BaseItem(JSON.parse(JSON.stringify(effectItem.toObject())));
assert.equal(reopenedEffectItem.effects.size,1);assert.deepEqual(reopenedEffectItem.system.toObject(),{});
assert.equal(reopenedEffectItem.effects.contents[0].duration.value,60);
assert.equal(reopenedEffectItem.effects.contents[0].system.changes[0].value,1);
referenceSheet.item=reopenedEffectItem;referenceSheet.isEditable=true;
const effectItemContext=await referenceSheet._prepareContext({});
assert.ok(itemTemplate(effectItemContext).includes('data-action="editItemEffectDuration"'));
const descriptionChange=referenceSheet._processFormData(null,null,{object:{'effectDescriptions.effectNative0001':'<p>Новое описание</p>'}});
reopenedEffectItem.updateSource(descriptionChange);
assert.equal(reopenedEffectItem.effects.contents[0].description,'<p>Новое описание</p>');
assert.equal(reopenedEffectItem.effects.contents[0].duration.value,60,'Description editing preserves effect duration and mechanics');
const durationChange=effectDurationUpdate(2,'minutes',{time:100});
reopenedEffectItem.effects.contents[0].updateSource(durationChange);
assert.equal(reopenedEffectItem.effects.contents[0].duration.value,120);
assert.equal(reopenedEffectItem.effects.contents[0].flags[game.system.id].condition.save.dc,16);
const effectActor=new foundry.documents.BaseActor({name:'Effect drop test',type:'character',system:{}});
const effectDropSource={type:'effect',name:reopenedEffectItem.name,img:reopenedEffectItem.img,uuid:'Item.effectItemTest01',effects:reopenedEffectItem.effects,testUserPermission:()=>true};
let effectDropCount=0;
const effectDropActor={isOwner:true,async createEmbeddedDocuments(type,sources){
  assert.equal(type,'ActiveEffect');effectDropCount++;
  return sources.map(source=>new foundry.documents.BaseActiveEffect(source,{parent:effectActor}));
}};
for(const Sheet of [WitcherActorSheet,(await import('../scripts/sheets/witcher-npc-sheet.mjs')).WitcherNPCSheet]){
  const target=new Sheet();target.actor=effectDropActor;target.isEditable=true;
  const [applied]=await target._onDropItem(null,effectDropSource);
  assert.equal(applied.duration.value,120);assert.equal(applied.origin,'Item.effectItemTest01');
  assert.equal(applied.flags[game.system.id].condition.save.dc,16);
  assert.equal(effectActor.items.size,0,'An effect Item becomes an ActiveEffect, never carried inventory');
  const reopened=new foundry.documents.BaseActiveEffect(JSON.parse(JSON.stringify(applied.toObject())),{parent:effectActor});
  assert.equal(reopened.description,'<p>Новое описание</p>');
  target.isEditable=false;assert.equal(await target._onDropItem(null,effectDropSource),null);
}
assert.equal(effectDropCount,2);
referenceSheet.isEditable=false;
const originalSheetActor = sheet.actor;
const originalEditable = sheet.isEditable;
const { PROFESSIONS } = await import("../scripts/data/professions.mjs");
for (const definition of PROFESSIONS) {
  const source = { name: "Profession persistence", type: "character", system: { details: { profession: definition.id } },
    items: [{ name: definition.abilities[0].name, type: "ability", system: { ruleId: definition.abilities[0].id, level: 5, attribute: definition.abilities[0].attribute } }] };
  const created = new foundry.documents.BaseActor(source);
  const reopened = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(created.toObject())));
  reopened.system.prepareDerivedData();
  sheet.actor = { ...originalSheetActor, system: reopened.system, items: reopened.items, effects: [] };
  const context = await sheet._prepareContext({});
  assert.equal(context.profession.defining.level, 5);
  assert.equal(context.profession.branches[0].entries[0].unlocked, true);
  assert.equal(context.abilities.entries.filter(entry => entry.ruleId?.startsWith("profession.")).length, 0);
  assert.ok(!template(context).includes('data-profession-level='), "Profession ranks start locked");
  assert.equal([...template(context).matchAll(/class="witcher-profession-node /g)].length, 10);
  assert.equal([...template({ ...context, editingProfession: true }).matchAll(/data-profession-level=/g)].length, 10, "All three branches use the independent profession edit mode");
}
let professionDrop;
sheet.isEditable = true;
sheet.actor = { ...originalSheetActor, update: async data => { professionDrop = data; } };
await sheet._onDropItem(null, { type: "profession", system: { ruleId: "mage" } });
assert.equal(professionDrop["system.details.profession"], "mage");
sheet.actor = { ...originalSheetActor, system: savedSkills.system, items: savedSkills.items, effects: [] };
sheet.isEditable = true;
sheet.tabGroups.character = "skills";
let skillsContext = await sheet._prepareContext({});
assert.equal(skillsContext.abilities.entries.length, 6, "Own-race duplicate is one card; three foreign abilities remain editable");
assert.equal(skillsContext.abilities.hasTrust, true);
assert.ok(skillsContext.abilities.entries.some(ability => ability.id && !ability.fromRace && ability.description.includes("Дедукции")));
assert.match(template(skillsContext), /data-action="toggleTrust"[^>]*aria-checked="true"/);
assert.match(template(skillsContext), /data-skill="language" data-language-id="common0000000001"/);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleSkills.call(sheet);
assert.match(template(await sheet._prepareContext({})), /data-language-field="level"[^>]*value="8"/);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleSkills.call(sheet);
sheet.isEditable = false;
const observerSkills = template(await sheet._prepareContext({}));
assert.match(observerSkills, /data-action="toggleTrust"[^>]*disabled/);
assert.match(observerSkills, /data-action="createAbility"[^>]*disabled/);
assert.ok(!observerSkills.includes('data-action="removeSheetItem"'));
sheet.actor = originalSheetActor;
sheet.isEditable = originalEditable;
sheet.tabGroups.character = "main";
for (const uuid of documents.keys()) {
  referenceSheet.item = await foundry.utils.fromUuid(uuid);
  if (documents.get(uuid).documentName === "Macro") continue;
  const context = await referenceSheet._prepareContext({});
  const rendered = itemTemplate(context);
  if (referenceSheet.item.system.ruleId === "potion.swallow") {
    assert.match(rendered, /Длительность:<\/strong> 20 раундов/);
    assert.match(rendered, /Токсичность:<\/strong> 50%/);
    assert.doesNotMatch(rendered, /в параметрах состава|цена не указана/);
  }
  assert.equal(context.itemTabs[0].id, "description", "Every Item opens with its description");
  assert.equal(context.itemTabs[0].active, true);
  assert.match(rendered, /<nav class="witcher-item-tabs tabs"/, "Native ApplicationV2 tab switching requires a tabs navigation");
  assert.ok(rendered.includes(handlebars.escapeExpression(referenceSheet.item.name)));
  for (const ability of context.abilities) {
    assert.ok(rendered.includes(ability.link));
    assert.ok(rendered.includes(ability.description));
  }
  assert.ok(!rendered.includes("prose-mirror"), "Locked references must show descriptions, not editors");
}
const { selectionEntries } = await import("../scripts/sheets/selection-data.mjs");
// Tool rules resolve from the existing canonical ID after native Actor/Item persistence.
const { getToolRules } = await import("../scripts/data/tool-rules.mjs");
const toolSource = [...documents.values()].find(item=>item.system?.ruleId==="gear.fishing-tools");
const toolActor = new foundry.documents.BaseActor({name:"Tool persistence",type:"character",items:[toolSource.toObject ? toolSource.toObject() : toolSource]});
const reopenedTools = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(toolActor.toObject())));
reopenedTools.system.prepareDerivedData();
const persistedTool = reopenedTools.items.contents[0];
assert.match(persistedTool.system.description,/только при ловле рыбы/);
assert.equal(getToolRules(persistedTool).modifiers[0].condition,"fishing");
assert.ok(!reopenedTools.system.statistics.modifiers.some(modifier=>modifier.source==="gear.fishing-tools"),"Carrying fishing gear alone grants no passive Survival bonus");
const { getGeneralGearRules } = await import("../scripts/data/general-gear.mjs");
const generalSource = id => {
  const item = [...documents.values()].find(entry => entry.system?.ruleId === id);
  return item.toObject ? item.toObject() : structuredClone(item);
};
const generalBasket = generalSource("gear.basket"), generalDice = generalSource("gear.loaded-dice"), generalCoat = generalSource("gear.warm-clothing");
generalDice.system.containerId = generalBasket._id;
const generalActor = new foundry.documents.BaseActor({name:"General gear persistence",type:"character",items:[generalBasket,generalDice,generalCoat]});
const reopenedGeneral = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(generalActor.toObject())));
reopenedGeneral.system.prepareDerivedData();
assert.equal(reopenedGeneral.items.get(generalBasket._id).system.capacity, 15);
assert.equal(reopenedGeneral.items.get(generalDice._id).system.containerId, generalBasket._id);
assert.equal(getGeneralGearRules(reopenedGeneral.items.get(generalDice._id)).modifiers[0].value, 3);
assert.match(reopenedGeneral.items.get(generalCoat._id).system.description, /\+5 к Стойкости против холода/);
assert.ok(!reopenedGeneral.system.statistics.modifiers.some(modifier => ["gear.loaded-dice","gear.warm-clothing"].includes(modifier.source)), "Situational equipment bonuses are not passive carrying bonuses");
const pickerTemplate = handlebars.compile(await readFile(new URL("../templates/reference-picker.hbs", import.meta.url), "utf8"), { strict: true });
for (const kind of ["race", "origin", "familyStatus", "influentialFriend"]) {
  const entries = selectionEntries(kind, key => foundry.utils.getProperty(translations, key));
  const rendered = pickerTemplate({ entries: entries.map(entry => ({ ...entry, selected: false })), groups: [], excluded: kind === "origin",
    hintKey: kind === "influentialFriend" ? "WITCHER.Friends.Hint" : "WITCHER.Picker.ReferenceOnly" });
  assert.equal([...rendered.matchAll(/data-entry-id=/g)].length, entries.length);
  assert.ok(!rendered.includes("undefined"));
}
const tabsTemplate = handlebars.compile(await readFile(new URL("../templates/sheet-tabs.hbs", import.meta.url), "utf8"), { strict: true });
assert.equal([...tabsTemplate({ tabs: Object.values((await sheet._prepareContext({})).tabs).map(tab => ({ ...tab, visible: true })) }).matchAll(/data-sheet-tab/g)].length, 13);
// New transport Items survive native schema round trips without changing old Actor shapes.
const { CORE_TRANSPORT, CORE_TACK } = await import("../scripts/data/core-transport.mjs");
const { transportContext } = await import("../scripts/sheets/transport-context.mjs");
const transportSource=(entry,id)=>({_id:id,type:entry.type,name:entry.name,img:entry.img,system:{...structuredClone(entry.system),ruleId:entry.id}});
const horseSource=transportSource(CORE_TRANSPORT.find(x=>x.id==="transport.horse"),"qaHorse000000001");
const bagSource=transportSource(CORE_TACK.find(x=>x.id==="tack.saddlebags"),"qaBag00000000001");
bagSource.system.containerId=horseSource._id;bagSource.system.equipped=true;
const qaCaravan=new foundry.documents.BaseActor({name:"Transport QA",type:"character",items:[horseSource,bagSource,{_id:"qaCargo000000001",name:"Сухой паёк",type:"equipment",system:{containerId:bagSource._id,containerSection:"right",quantity:8,weight:1}}]});
const reopenedCaravan=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(qaCaravan.toObject())));
reopenedCaravan.system.prepareDerivedData();
assert.equal(reopenedCaravan.system.carriedWeight,0);
assert.equal(reopenedCaravan.items.get(bagSource._id).system.tack.compartments,2);
const caravanInventory=inventoryContext(reopenedCaravan);
const caravanView=transportContext(reopenedCaravan,caravanInventory,horseSource._id);
assert.equal(caravanView.selected.contentsWeight,9.5);
assert.equal(caravanInventory.items.find(x=>x.id===bagSource._id).cargoSections[1].weight,8);
const transportHTML=handlebars.compile(await readFile(new URL("../templates/transport.hbs",import.meta.url),"utf8"),{strict:true})({transport:caravanView,editable:true,rootId:"qa"});
assert(transportHTML.includes("Правая сумка"));assert(transportHTML.includes("9.5 / 100"));
assert(!transportHTML.includes("undefined"));
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
CONFIG.Dice = { parser: RollParser, rolls: [CoreRoll], termTypes: diceTerms, functions: {},
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
const { magicFumble } = await import("../scripts/magic/rules.mjs");
const { evaluateRoll, minimumRollSource, prepareMinimumResults, withMinimumTotal } = await import("../scripts/dice/minimum-roll.mjs");
const { rollBreakdown } = await import("../scripts/chat/roll-breakdown.mjs");
registerCriticalDice();
// Clamp only the complete result, preserving data, options and native serialization.
for (const [formula, faces, face, expected] of [
  ["1d10 - 20", 10, 4, -16], ["1d6 - 8", 6, 2, -6], ["1d10 - 4", 10, 4, 0],
  ["1d10 + @bonus", 10, 4, 7], ["10 - (1d6 - 10)", 6, 4, 16]
]) {
  let draws = 0;
  CONFIG.Dice.randomUniform = () => { draws++; return 1 - (face - 0.5) / faces; };
  const roll = await evaluateRoll(formula, { allowInteractive: false }, { bonus: 3 }, { flavor: "Minimum check" });
  assert.equal(draws, 1, "Applying the minimum must never roll dice again");
  assert.equal(roll.total, Math.max(0, expected));
  assert.equal(roll.options.flavor, "Minimum check");
  assert.equal(withMinimumTotal(roll), roll, "Already bounded rolls stay unchanged");
  const restored = CoreRoll.fromData(JSON.parse(JSON.stringify(roll)));
  assert.equal(restored.total, Math.max(0, expected));
  assert.equal(minimumRollSource(restored).total, expected);
  assert.deepEqual(restored.dice[0].results.map(result => result.result), [face]);
}
// Native chat commands can contain multiple rolls or custom content, without an actor.
for (const content of ["-16", "<p>Custom roll message</p>"]) {
  CONFIG.Dice.randomUniform = () => 1 - (4 - 0.5) / 10;
  const negative = await new CoreRoll("1d10 - 20").evaluate({ allowInteractive: false });
  const positive = await new CoreRoll("1d10 + 3").evaluate({ allowInteractive: false });
  const source = new foundry.documents.BaseChatMessage({ author: game.user.id, content,
    rolls: [negative.toJSON(), positive.toJSON()] });
  let writes = 0;
  const message = { content, rolls: [negative, positive], updateSource(changes) {
    writes++;
    source.updateSource(changes);
    Object.assign(this, { content: source.content, rolls: source.rolls.map(data => CoreRoll.fromData(data)) });
  } };
  prepareMinimumResults(message);
  prepareMinimumResults(message);
  assert.equal(writes, 1);
  assert.deepEqual(message.rolls.map(roll => roll.total), [0, 7]);
  assert.equal(message.content, content === "-16" ? "0" : content);
  const breakdown = rollBreakdown(message, message.rolls[0]);
  assert.equal(breakdown.parts.find(part => part.label === "Модификатор").value, -20);
  assert.equal(breakdown.parts.find(part => part.kind === "minimum").value, 16);
  assert.equal(breakdown.total, 0);
}
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
  const roll = await evaluateRoll("1d10wc + 10",{ allowInteractive: false });
  assert.equal(queue.length, 0);
  assert.equal(roll.total, Math.max(0, 10 + expected));
  assert.equal(minimumRollSource(roll).total, 10 + expected);
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
  prepareMinimumResults(message);
  prepareCriticalResult(message);
  assert.equal(message.rolls[0].total, Math.max(0, 14 + expected), "Luck is added to the full check before its zero minimum");
  assert.equal(magicFumble(message.rolls[0]).severity,expected<0?-expected:0,"Magic reads the signed natural chain even after Luck and native serialization");
  assert.deepEqual(message.rolls[0].dice[0].results.map(result => result.result), sequence);
  assert.match(message.flavor, sequence[0] === 1 ? /Критический провал/ : /Критический успех/);
  assert.match(message.flavor, /\+4 от Удачи/);
  const sign = expected < 0 ? "−" : "+";
  assert.ok(message.flavor.includes(`10 ${sign} ${Math.abs(expected)} + 4 = ${Math.max(0, 14 + expected)}`));
  const breakdown = rollBreakdown(message, message.rolls[0]);
  assert.equal(breakdown.dice[0].value, expected);
  assert.equal(breakdown.parts.filter(part => part.kind !== "minimum").reduce((sum, part) => sum + part.value, 0), 14);
  assert.equal(breakdown.parts.find(part => part.kind === "minimum")?.value ?? 0, Math.max(0, -(14 + expected)));
  assert.equal(message.flavor.includes("(минимум 0)"), 14 + expected < 0);
  criticalNativeRolls.push({ data: message.rolls[0].toJSON(), sequence });
  await settleMessageLuck([message], "critical-check");
  releaseMessageLuck("critical-check");
  assert.deepEqual(Array.from(luckActor.system.luckSpent), [1, 2, 3, 4]);
}
// A Stubbornness reroll rebuilds a fresh wc chain while keeping the previous Luck
// term. The new selected Luck must survive for the player's next separate check.
const { rerollStubbornness } = await import("../scripts/chat/stubbornness.mjs");
const stubbornActor = { uuid: "Actor.nativeStubborn", isOwner: true, items: [],
  system: { details: { race: "human" }, abilityState: { stubbornnessUsed: 0 }, luckPending: 2 },
  async update(changes) { this.system.abilityState.stubbornnessUsed = changes["system.abilityState.stubbornnessUsed"]; }
};
const originalDiceRollClass = foundry.dice.Roll;
let stubbornExpected = 25;
foundry.dice.Roll = class extends CoreRoll {
  async toMessage(data, options) {
    const document = new foundry.documents.BaseChatMessage({ ...data, author: game.user.id, rolls: [this.toJSON()] });
    const message = { id: "native-reroll", speakerActor: stubbornActor, flags: document.flags,
      rolls: [this], flavor: document.flavor, options, updateSource(changes) {
        document.updateSource(changes); Object.assign(this, { flags: document.flags, flavor: document.flavor });
      }
    };
    await prepareMessageLuck(message, "stubborn-check");
    prepareCriticalResult(message);
    assert.equal(message.rolls[0].total, stubbornExpected);
    assert.ok(message.flavor.includes(stubbornExpected ? "10 + 11 + 4 = 25" : "10 − 16 + 4 = 0 (минимум 0)"));
    return message;
  }
};
for (const { data } of criticalNativeRolls) for (const sequence of [[10, 1], [1, 10, 6]]) {
  const queue = [...sequence];
  stubbornExpected = sequence[0] === 10 ? 25 : 0;
  CONFIG.Dice.randomUniform = () => 1 - (queue.shift() - 0.5) / 10;
  stubbornActor.system.abilityState.stubbornnessUsed = 0;
  const original = CoreRoll.fromData(JSON.parse(JSON.stringify(data)));
  const message = { id: "original-check", isOwner: true, isContentVisible: true, speakerActor: stubbornActor,
    speaker: { actor: "stubborn00000001" }, whisper: [game.user.id], blind: true, rolls: [original],
    flags: { [game.system.id]: { skillCheck: { key: "courage" }, luck: { bonus: 4, rollIndex: 0 } } },
    async update(changes) { this.flags[game.system.id].stubbornness = changes[`flags.${game.system.id}.stubbornness`]; }
  };
  await rerollStubbornness(message);
  assert.equal(queue.length, 0, "Every previous positive/negative chain creates a new independent chain");
  assert.equal(message.flags[game.system.id].stubbornness.kept, Math.max(original.total, stubbornExpected));
  assert.equal(stubbornActor.system.abilityState.stubbornnessUsed, 1);
  assert.equal(stubbornActor.system.luckPending, 2);
}
foundry.dice.Roll = originalDiceRollClass;
console.log("Roll minimum: native penalties, damage, Luck, critical chains, rerolls and chat totals stay at or above zero");
// STUN, initiative and the ordinary dice tray retain their plain-d10 formulas.
const {INITIATIVE_FORMULA,ROUND_SECONDS}=await import('../scripts/config.mjs');
assert.equal(ROUND_SECONDS,3);
for (const face of [1, 10]) {
  let draws = 0;
  CONFIG.Dice.randomUniform = () => { draws++; return 1 - (face - 0.5) / 10; };
  const plain = await new CoreRoll("1d10").evaluate({ allowInteractive: false });
  assert.equal(plain.total, face);
  assert.equal(draws, 1);
  assert.equal(plain.dice[0].options[game.system.id], undefined);
  draws=0;
  const initiative=await new CoreRoll(INITIATIVE_FORMULA,{statistics:{initiative:7}}).evaluate({allowInteractive:false});
  assert.equal(initiative.total,7+face);assert.equal(draws,1,"Natural 1 and 10 never explode on initiative");
}
// Death saves persist a plain d10 and a Luck-adjusted threshold using Foundry's actual chat schema.
const { prepareDeathResult } = await import("../scripts/chat/death-result.mjs");
for (const [face, penalty, luck, target, succeeded] of [
  [10, 0, 4, 14, true], [10, 0, 0, 10, false], [9, 1, 0, 9, false], [1, 10, 0, 0, false]
]) {
  CONFIG.Dice.randomUniform = () => 1 - (face - 0.5) / 10;
  luckActor.system.updateSource({ luckSpent: [], luckPending: luck });
  const roll = await new CoreRoll("1d10").evaluate({ allowInteractive: false });
  const source = new foundry.documents.BaseChatMessage({ author: game.user.id, content: String(roll.total), rolls: [roll.toJSON()],
    flags: { [game.system.id]: { deathSave: { base: 10, penalty, body: 10, will: 10, physical: 10, cause: "manual" } } } });
  const message = { speakerActor: luckActor, flags: source.flags, rolls: [roll], content: source.content, flavor: source.flavor,
    updateSource(changes) {
      source.updateSource(changes);
      Object.assign(this, { flags: source.flags, flavor: source.flavor, content: source.content,
        rolls: source.rolls.map(data => CoreRoll.fromData(data)) });
    }
  };
  await prepareMessageLuck(message, "death-check");
  prepareDeathResult(message);
  const result = message.flags[game.system.id].deathSave;
  assert.equal(result.target, target);
  assert.equal(result.succeeded, succeeded);
  assert.equal(message.rolls[0].total, face);
  assert.equal(message.rolls[0].dice[0].results.length, 1);
  assert.ok(message.flavor.includes(`10 − ${penalty} + ${luck} = ${target}`));
  const restoredMessage = new foundry.documents.BaseChatMessage(JSON.parse(JSON.stringify(source.toObject())));
  assert.equal(restoredMessage.flags[game.system.id].deathSave.target, target);
  await settleMessageLuck([message], "death-check");
  releaseMessageLuck("death-check");
  assert.equal(luckActor.system.luckSpent.length, luck);
}
for (const icon of ["blood", "skull"]) await access(new URL(`public/icons/svg/${icon}.svg`, app));
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
    const shown=CoreRoll.fromData(data);
    for(const die of shown.dice)for(const result of die.results)result.hidden=true;
    const manualNotation=new DiceNotation(shown);
    assert.equal(manualNotation.throws.flatMap(entry=>entry.dice).length,0,"Already animated manual faces must not replay with the final message");
    assert.equal(shown.total,CoreRoll.fromData(data).total,"DSN visibility must not alter the check");
    assert.equal(shown.dice[0].getTooltipData().rolls.length,sequence.length,"Manual faces remain in the native chat tooltip");
  }
  console.log("Installed Dice So Nice: all nine critical chains produce the correct successive d10 throws");
}

// Creature presets use native NPC schemas and the same embedded Items as characters.
const {bestiarySources}=await import('../scripts/data/bestiary.mjs');
const {WitcherNPCSheet}=await import('../scripts/sheets/witcher-npc-sheet.mjs');
const {MONSTER_CATEGORIES}=await import('../scripts/data/monster-categories.mjs');
const {weaponAttack}=await import('../scripts/combat/weapon-rules.mjs');
const {castingQuote}=await import('../scripts/magic/casting.mjs');
const {focusOptions}=await import('../scripts/magic/rules.mjs');
const npcTemplate=handlebars.compile(await readFile(new URL('../templates/npc-sheet.hbs',import.meta.url),'utf8'),{strict:true});
const creatureTestGlobals={user:game.user,users:game.users,fromUuid:foundry.utils.fromUuid};
game.user={id:'gmCreature',isGM:true,can:()=>true};game.users={activeGM:game.user};foundry.utils.fromUuid=async uuid=>documents.get(uuid);
const creatureViews=[];
for(const source of bestiarySources()) {
  const initial=new foundry.documents.BaseActor(source);
  const actor=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(initial.toObject())));
  Object.defineProperty(actor,'isOwner',{value:true});actor.system.prepareDerivedData();
  assert.equal(actor.system.health.value,source.system.health.value);assert.equal(actor.system.stamina.max,source.system.stamina.max);
  for(const item of actor.items.filter(item=>item.type==='weapon'&&item.system.equipped)) {
    const attack=weaponAttack(actor,item,{mode:'npc'});
    assert.equal(attack.blocked,'',`${actor.name}: ${item.name} must be ready to attack`);
    assert.ok(Number.isFinite(attack.total),`${actor.name}: ${item.name} needs a numeric attack base`);
    assert.ok(CoreRoll.validate(attack.damage),`${actor.name}: ${item.name} needs a valid damage formula`);
  }
  if(source.name==='Птица') {
    assert.equal(actor.system.statistics.run,10);assert.equal(actor.system.statistics.leap,2);
    assert.equal(actor.system.creature.hasTailOrWings,true);
  }
  if(source.name==='Бес')assert.equal(actor.system.statistics.recovery,11);
  for(const item of actor.items)assert.equal(item.system.ruleId,initial.items.get(item.id).system.ruleId);
  const npcSheet=new WitcherNPCSheet();npcSheet.actor=actor;npcSheet.isEditable=true;
  for(const editing of [false,true]) {
    npcSheet.editing=editing;
    const view=await npcSheet._prepareContext({});const rendered=npcTemplate(view);
    assert.ok(rendered.includes('data-combat-option="location"'));
    assert.match(rendered,/<section class="tab witcher-magic-page[^\"]*" data-group="creature" data-tab="magic"/);
    assert.equal(view.magic.count,actor.items.filter(item=>item.type==='spell').length);
    assert.ok(!rendered.includes('data-action="rollLocation"'));
    assert.equal(rendered.includes('name="system.creature.hasTailOrWings"'),editing);
    assert.equal((rendered.match(/name="system\.creature\.category"/g)??[]).length,editing?1:0);
    assert.equal(rendered.includes('name="system.creature.runBase"'),editing);
    assert.equal(rendered.includes('name="system.creature.recoveryBase"'),editing);
    assert.ok(rendered.includes(view.creatureClass.description));
    assert.ok(rendered.includes(handlebars.escapeExpression(source.name)));assert.ok(rendered.includes('data-action="attackWeapon"'));assert.ok(!rendered.includes('data-mode="strong"'));
    assert.equal((rendered.match(/aria-label="Добыча существа"/g)??[]).length,1,'NPC loot has one home in inventory');
    const inventoryTab=rendered.search(/<section class="tab[^\"]*" data-group="creature" data-tab="inventory">/);
    const loreTab=rendered.search(/<section class="tab[^\"]*" data-group="creature" data-tab="lore">/);
    const lootPanel=rendered.indexOf('aria-label="Добыча существа"');
    assert.ok(inventoryTab>=0&&inventoryTab<lootPanel&&lootPanel<loreTab,'Loot controls render inside inventory, not lore');
    const hasRegeneration=source.name==='Гуль'||source.items.some(item=>item.flags?.[game.system.id]?.regeneration>0);
    assert.equal(rendered.includes('aria-label="Режим регенерации"'),hasRegeneration);
    if(hasRegeneration) {
      assert.equal(actor.system.creature.regenerationMode,'normal');
      assert.ok(rendered.includes('Подавлена: 0 ПЗ'));
      assert.equal(rendered.includes('На солнце: 3 ПЗ'),source.name==='Катакан');
    }
    assert.match(rendered,/<nav class="[^\"]*\btabs\b[^\"]*"/,"Foundry changeTab requires a .tabs navigation container");
    if(!editing)creatureViews.push({actor,sheet:npcSheet,view,html:rendered});
  }
  if(source.name==='Утопец') {
    assert.equal(skillValue(actor.system,'awareness').total,15);assert.equal(skillValue(actor.system,'wildernessSurvival').total,13);
    assert.equal(skillValue(actor.system,'education').total,1);assert.equal(actor.system.harvest.length,3);
    const claws=actor.items.find(i=>i.type==='weapon');assert.equal(weaponAttack(actor,claws,{mode:'npc'}).total,13);
    assert.equal(weaponAttack(actor,claws,{mode:'npc'}).damage,'(3d6)');
  } else if(source.name==='Бандит') {
    assert.equal(skillValue(actor.system,'swordsmanship').total,12);
    assert.equal(actor.items.find(i=>i.system.ruleId==='weapon.hand-crossbow').system.accuracy,1);
  }
}
await (await import('./native-radolf-npc.mjs')).checkNativeRadolfNPC(creatureViews,npcTemplate);
// Stateful creature modes must survive the installed schema and render with strict Handlebars.
const nativeModes=[
  ['Сирена',{'system.creature.movementMode':'flying','system.creature.illusion':true}],
  ['Птица',{'system.creature.movementMode':'flying','system.creature.flightHeight':8}],
  ['Катакан',{'system.creature.invisible':true}],
  ['Волколак',{'system.creature.transformed':false}],
  ['Гуль',{'system.health.value':9}],
  ['Полуденница',{'system.creature.moonlight':true,'system.creature.spiritMode':'suppressed'}],
  ['Главоглаз',{'system.creature.camouflage':true,'system.creature.weakSpot':true}],
  ['Скальный тролль',{'system.creature.weakSpot':true}],
  ['Варг',{'system.creature.packId':'Лесная стая'}],
  ['Голем',{}]
];
for(const [name,patch] of nativeModes) {
  const actor=new foundry.documents.BaseActor(bestiarySources().find(source=>source.name===name));
  Object.defineProperty(actor,'isOwner',{value:true});actor.updateSource(patch);actor.system.prepareDerivedData();
  const sheet=new WitcherNPCSheet();sheet.actor=actor;sheet.isEditable=true;
  const context=await sheet._prepareContext({}),html=npcTemplate(context);
  assert.equal(actor.validate({strict:true}),true,`${name}: native mode schema`);
  assert.ok(context.creatureModes.available,`${name}: mode controls available`);
  if(name==='Сирена') {assert.equal(actor.system.statistics.effective.reflex,7);assert.ok(html.includes('data-action="creatureDispelIllusion"'));}
  if(name==='Птица') {assert.equal(actor.system.statistics.effective.speed,7);assert.equal(actor.system.statistics.run,21);}
  if(name==='Катакан') {assert.ok(html.includes('data-action="creatureDetect"'));assert.equal(actor.system.statistics.modifiers.find(mod=>mod.target==='combat.attack').value,5);}
  if(name==='Волколак') {assert.equal(actor.system.statistics.effective.body,4);assert.equal(context.regeneration.total,0);}
  if(name==='Гуль')assert.equal(context.regeneration.total,3);
  assert.equal(context.combat.infiniteStamina,name==='Голем');
  if(name==='Голем') {
    assert.ok(html.includes('Бесконечная Выносливость'));assert.ok(!html.includes('name="system.stamina.value"'));
    assert.ok(html.includes('Повторная · 0 ВЫН'));assert.ok(!html.includes('data-action="fullTurnRecovery"'));
    assert.ok(!html.includes('Для последующих включите «Повторная»'));
  }
  if(['Главоглаз','Скальный тролль'].includes(name))assert.ok(html.includes('data-creature-mode="weakSpot"'));
  for(const action of context.creatureSpecialActions)assert.ok(html.includes(`data-creature-action="${action.id}"`));
  sheet.isEditable=false;
  const observer=npcTemplate(await sheet._prepareContext({}));
  assert.equal((observer.match(/data-creature-mode="[^"]+"(?:(?!>).)*>/g)??[]).every(control=>control.includes('disabled')),true,`${name}: read-only modes are disabled`);
}
const {createSpiritZone}=await import('../scripts/combat/creature-spirits.mjs');
CONFIG.RegionBehavior={dataModels:{}};
const nativeRegionScene={regions:[],grid:{size:100,distance:2},createEmbeddedDocuments:async(type,sources)=>{
  assert.equal(type,'Region');
  const region=new foundry.documents.BaseRegion(sources[0],{strict:true});
  assert.equal(region.validate({strict:true}),true);
  assert.equal(region.shapes[0].radiusX,150);assert.equal(region.shapes[0].radiusY,150);
  return [{uuid:'Scene.native.Region.yrden'}];
}};
const regionGM=game.users.activeGM;game.users.activeGM=null;
await createSpiritZone(nativeRegionScene,{x:50,y:50},{kind:'yrden',radius:3,rounds:5,penalty:4});
game.users.activeGM=regionGM;
const mageView=creatureViews.find(entry=>entry.actor.name==='Маг');
assert.equal(mageView.view.magic.count,9);
assert.deepEqual(mageView.view.magic.groups.map(group=>[group.id,group.spells.length]),[['spell',5],['ritual',2],['hex',2]]);
assert.equal(mageView.view.magic.vigor,10);
assert.equal(mageView.view.magic.casting,15);
assert.equal(mageView.view.magic.ritualCasting,13);
assert.equal(mageView.view.magic.hexCasting,14);
assert.equal((mageView.html.match(/data-action="castSpell"/g)??[]).length,9);
const spellBrowserTemplate=handlebars.compile(await readFile(new URL('../templates/spell-browser.hbs',import.meta.url),'utf8'),{strict:true});
const mageCatalogHTML=spellBrowserTemplate({...mageView.view.magic,study:false,isNPC:true,actorName:mageView.actor.name});
assert.match(mageCatalogHTML,/в книгу существа/);
assert.ok(!mageCatalogHTML.includes('для обучения откройте «Действия»'));
const mageFocus=focusOptions(mageView.actor).find(focus=>focus.rating===2);
assert.ok(mageFocus,'The bestiary mage can select the equipped staff as a focus');
const mageSpell=mageView.actor.items.find(item=>item.name==='Энье');
assert.equal(castingQuote(mageView.actor,mageSpell,{focusId:mageFocus.id}).stamina,3);
mageView.sheet.isEditable=false;
const observerMagic=await mageView.sheet._prepareContext({});
assert.equal(observerMagic.magic.canCast,false);
assert.equal(observerMagic.magic.canMaintain,false);
const observerHTML=npcTemplate(observerMagic);
assert.equal((observerHTML.match(/data-action="castSpell"[^>]*disabled/g)??[]).length,9,'Read-only NPC sheets cannot cast');
mageView.sheet.isEditable=true;
const emptyCreature=new foundry.documents.BaseActor({name:'New creature',type:'npc'});
const emptySheet=new WitcherNPCSheet();emptySheet.actor=emptyCreature;emptySheet.isEditable=true;
assert.match(npcTemplate(await emptySheet._prepareContext({})),/Бандит/);
assert.equal(emptyCreature.system.statistics.dead,false,'A blank creature sheet is not dead');
for(const hp of [0,-5]) {
  const fallen=new foundry.documents.BaseActor({name:'Fallen creature',type:'npc',
    system:{attributes:{body:6,will:6},health:{value:hp,max:30}},
    effects:[{_id:'legacyDying00001',name:'При смерти',statuses:['dying']}]});
  fallen.system.prepareDerivedData();
  const sheet=new WitcherNPCSheet();sheet.actor=fallen;sheet.isEditable=true;
  const view=await sheet._prepareContext({}),html=npcTemplate(view);
  assert.equal(view.stats.dying,false);
  assert.equal(view.stats.dead,true);
  assert.ok(html.includes('Мёртв'));
  assert.ok(!html.includes('data-action="creatureDeath"'));
  assert.ok(!html.includes('name="system.death.penalty"'));
  assert.ok(!html.includes('data-action="rollEffectSave"'),'Legacy dying effects do not offer creature saves');
}
for(const category of MONSTER_CATEGORIES) {
  emptyCreature.updateSource({'system.creature.category':category.id});
  emptySheet.actor=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(emptyCreature.toObject())));
  for(const editable of [true,false]) {
    emptySheet.isEditable=editable;emptySheet.editing=true;
    const view=await emptySheet._prepareContext({}),html=npcTemplate(view);
    assert.equal(emptySheet.actor.system.creature.category,category.id);
    assert.equal(view.creatureClass.name,category.name);
    assert.ok(html.includes(category.description));
    assert.equal(html.includes('name="system.creature.category"'),editable);
    if(editable)assert.ok(html.includes(`value="${category.id}" selected`));
  }
}
assert.equal(new WitcherActorData(legacyActorData.toObject()).creature.category,'humanoid');
const tailData=new WitcherActorData(legacyActorData.toObject());
assert.equal(tailData.creature.hasTailOrWings,false);
tailData.updateSource({'creature.hasTailOrWings':true});
assert.equal(new WitcherActorData(JSON.parse(JSON.stringify(tailData.toObject()))).creature.hasTailOrWings,true);
// Exercise NPC drop through native Item/Actor schemas; pointer delivery is outside this harness.
const priorWorldItems=game.items;
game.items={fromCompendium:item=>item.toObject()};
const dropActor=new foundry.documents.BaseActor(bestiarySources()[1]);
Object.defineProperty(dropActor,'isOwner',{value:true});
let npcDropSerial=0;
dropActor.createEmbeddedDocuments=async(type,sources)=>{
  assert.equal(type,'Item');
  const rows=sources.map(source=>({...source,_id:`npcDrop${String(++npcDropSerial).padStart(9,'0')}`}));
  dropActor.updateSource({items:[...dropActor.items.map(item=>item.toObject()),...rows]});
  return rows.map(row=>dropActor.items.get(row._id));
};
const dropSheet=new WitcherNPCSheet();dropSheet.actor=dropActor;dropSheet.isEditable=true;
const incomingWeapon=creatureViews[0].actor.items.find(item=>item.type==='weapon');
const dropped=await dropSheet._onDropItem({target:{closest:()=>null}},incomingWeapon);
assert.equal(dropped.type,'weapon');assert.equal(dropped.system.equipped,false);assert.equal(dropped.system.containerId,'');
const reopenedDrop=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(dropActor.toObject())));
assert.equal(reopenedDrop.items.get(dropped.id).system.damage,incomingWeapon.system.damage);
assert.ok(reopenedDrop.items.size>1,'Dropping an Item must preserve the creature’s other Items');
const beforeSpellDrop=dropActor.items.size;
await dropSheet._onDropItem({},mageSpell);
await dropSheet._onDropItem({},mageSpell);
assert.equal(dropActor.items.size,beforeSpellDrop+1,'Repeated NPC spell drops do not duplicate known magic');
const droppedSpell=dropActor.items.find(item=>item.system.ruleId===mageSpell.system.ruleId);
assert.equal(droppedSpell.flags.core.sourceId,mageSpell.uuid);
const reopenedMagic=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(dropActor.toObject())));
assert.equal(reopenedMagic.items.get(droppedSpell.id).system.cost,mageSpell.system.cost);
dropSheet.isEditable=false;
await dropSheet._onDropItem({},mageView.actor.items.find(item=>item.name==='Рьеви'));
assert.equal(dropActor.items.size,beforeSpellDrop+1,'Observers cannot add NPC spells');
game.items=priorWorldItems;
game.user=creatureTestGlobals.user;game.users=creatureTestGlobals.users;foundry.utils.fromUuid=creatureTestGlobals.fromUuid;

console.log(`Installed Foundry core: data, ${documents.size} compendium documents, templates, native Luck, death saves and all nine critical chains OK`);
const {faceRoll}=await import('../scripts/chat/manual-critical.mjs');
for(const face of [1,4,10]) {
  const display=faceRoll(face);
  assert.equal(display.total,face);assert.equal(display.dice[0].results[0].result,face);
  assert.equal(CoreRoll.fromData(display.toJSON()).total,face);
}

// Consumables: native schema defaults, lifecycle and strict templates, without a running UI.
const { consumableContext, potionEffectSource, toxicityState } = await import('../scripts/data/consumables.mjs');
const savedEffectDocuments = foundry.documents;
foundry.documents = {...foundry.documents, ActiveEffect: class extends foundry.documents.BaseActiveEffect {
  async _preCreate() {}
  static getEffectStart() { return {time:100}; }
}};
const { WitcherActiveEffect } = await import('../scripts/documents/witcher-active-effect.mjs');
const doseActor = new foundry.documents.BaseActor({name:'Consumables',type:'character',system:{details:{race:'witcher',profession:'witcher'},attributes:{body:8,will:8},health:{value:40,max:40}}});
const nativePetriSource = Array.from(documents.values()).find(doc=>doc.system?.ruleId==='potion.petri').toObject();
nativePetriSource._id = 'nativePetri00001';
doseActor.updateSource({items:[nativePetriSource]});
Object.defineProperty(doseActor,'isOwner',{value:true});
const nativePetri = doseActor.items.get('nativePetri00001');
Object.defineProperty(nativePetri,'actor',{value:doseActor});
assert.equal(nativePetri.system.consumption.mode,'auto');
assert.ok(consumableContext(nativePetri).enabled);
const nativeDose = new WitcherActiveEffect({...potionEffectSource(nativePetri),_id:'nativeDose000001'},{parent:doseActor});
await nativeDose._preCreate(nativeDose.toObject(),{},game.user);
assert.equal(nativeDose.duration.value,45);
assert.equal(nativeDose.duration.units,'seconds');
assert.equal(nativeDose.start.time,100);
doseActor.updateSource({effects:[nativeDose.toObject()]});
const persistedDoseActor = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(doseActor.toObject())));
assert.equal(toxicityState(persistedDoseActor).value,75);
assert.equal(persistedDoseActor.system.statistics.skillBonuses.spellCasting,2);
assert.equal(persistedDoseActor.effects.get(nativeDose.id).duration.value,45);
nativePetri.updateSource({'system.consumption.usesPerItem':25,'system.consumption.spentUses':4});
assert.equal(consumableContext(new foundry.documents.BaseItem(JSON.parse(JSON.stringify(nativePetri.toObject())))).remaining,21);
const restoredDose = new WitcherActiveEffect({...nativeDose.toObject(),start:{time:20}},{parent:doseActor});
await restoredDose._preCreate(restoredDose.toObject(),{witcherRestoreEffects:true},game.user);
assert.equal(restoredDose.start.time,20,'Transaction rollback must preserve elapsed effect time');
referenceSheet.item=nativePetri;referenceSheet.isEditable=true;
const consumptionItemHTML=itemTemplate(await referenceSheet._prepareContext({}));
assert.ok(consumptionItemHTML.includes('data-action="useConsumable"'));
assert.ok(consumptionItemHTML.includes('system.consumption.mode'));
const inventoryPartial=handlebars.compile(await readFile(new URL('../templates/inventory.hbs',import.meta.url),'utf8'),{strict:true});
const { inventoryContext: consumableInventory } = await import('../scripts/sheets/inventory-context.mjs');
const { workshopActorContext: consumableWorkshop } = await import('../scripts/sheets/workshop-actor-context.mjs');
const consumptionInventoryHTML=inventoryPartial({rootId:'consumption',system:doseActor.system,editable:true,inventory:consumableInventory(doseActor),workshop:await consumableWorkshop(doseActor)});
assert.ok(!consumptionInventoryHTML.includes('witcher-toxicity '),'Character inventory must not duplicate sidebar toxicity');
assert.ok(consumptionInventoryHTML.includes('data-action="useConsumable"'));
const doseSheet = new WitcherActorSheet();
doseSheet.actor = doseActor; doseSheet.isEditable = true;
const doseSheetHTML = template(await doseSheet._prepareContext({}));
assert.ok(!doseSheetHTML.includes('THE WITCHER'));
assert.match(doseSheetHTML, /<output>75<small>%<\/small><\/output>/);
assert.match(doseSheetHTML, /Предел 100%/);
assert.match(doseSheetHTML, /witcher-effect-toxicity[\s\S]*?\+75%/);
const doseSidebar = doseSheetHTML.split('</aside>')[0];
assert.ok(doseSidebar.includes('witcher-sidebar-toxicity'));
assert.ok(doseSidebar.indexOf('witcher-sidebar-toxicity') > doseSidebar.indexOf('data-action="rollStun"'));
assert.ok(!html.includes('THE WITCHER'));
assert.ok(!html.includes('witcher-sidebar-toxicity'),'Non-witchers do not see the toxicity meter');
const npcDoseActor=new foundry.documents.BaseActor({...doseActor.toObject(),type:'npc'});
const npcToxicityHTML=inventoryPartial({rootId:'npc-consumption',system:npcDoseActor.system,editable:true,inventory:consumableInventory(npcDoseActor),workshop:await consumableWorkshop(npcDoseActor)});
assert.ok(npcToxicityHTML.includes('witcher-toxicity '),'NPC inventory retains its toxicity meter');
doseActor.updateSource({'system.details.race':'human'});
const humanDoseHTML = template(await doseSheet._prepareContext({}));
assert.ok(humanDoseHTML.includes('witcher-sidebar-toxicity'),'Active doses also show toxicity for non-witchers');
assert.ok(humanDoseHTML.includes('witcher-effect-toxicity'));
const legacyToxicPoison=conditionSource(EFFECT_TEMPLATES.find(effect=>effect.key==='poisoned'));
legacyToxicPoison._id='toxicityPoison01';legacyToxicPoison.flags[game.system.id].toxicity=true;
legacyToxicPoison.flags[game.system.id].condition.autoSave=true;
doseActor.updateSource({'system.details.race':'witcher',effects:[nativeDose.toObject(),legacyToxicPoison]});
const toxicSheetHTML=template(await doseSheet._prepareContext({}));
assert.match(toxicSheetHTML.split('</aside>')[0],/data-action="rollEffectSave" data-effect-id="toxicityPoison01"/);
assert.ok(toxicSheetHTML.includes('Стойкость СЛ 18 · обычное действие'));
assert.ok(!toxicSheetHTML.includes('data-action="toggleEffectSave"'),'Legacy toxicity must not offer an automatic save toggle');
assert.ok(toxicSheetHTML.includes('В начале своего хода получаете 3 урона'));
foundry.documents=savedEffectDocuments;
console.log('Consumables: native timed effects, dose persistence, Item fields and inventory controls OK');

// Tactical effects round-trip through installed Foundry 14, including the active ambush template branch.
const {tacticalEffect}=await import('../scripts/combat/tactics-rules.mjs');
for(const kind of ['delay','ambush']) {
  const source=tacticalEffect(kind,{id:'combatTactics001',round:1},{id:'combatantTest001'},'Описание');
  await access(new URL(`public/${source.img}`,app));
  const effect=new foundry.documents.BaseActiveEffect(source);
  assert.equal(effect.validationFailures.fields,null);
  const restored=new foundry.documents.BaseActiveEffect(JSON.parse(JSON.stringify(effect.toObject())));
  assert.equal(restored.flags[game.system.id].tactic.kind,kind);
  assert.equal(restored.showIcon,CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS);
}
const tacticsTemplate=handlebars.compile(await readFile(new URL('../templates/combat-actions.hbs',import.meta.url),'utf8'),{strict:true});
const {combatContext:prepareTacticsContext}=await import('../scripts/sheets/combat-context.mjs');
const tacticsView=prepareTacticsContext(doseActor);
tacticsView.ambush={active:true,pending:false,canPrepare:true,count:1,targets:[{uuid:'Scene.scene.Token.enemy',name:'Цель <1>'}]};
const tacticsHTML=tacticsTemplate({combat:tacticsView,editable:true});
assert.match(tacticsHTML,/data-action="openAmbush"[^>]*>/);
assert.ok(!tacticsHTML.match(/data-action="openAmbush"[^>]*disabled/));
assert.ok(tacticsHTML.includes('Бонус действует до конца первого раунда'));
assert.ok(!tacticsHTML.includes('Первая атака'));
console.log('Combat tactics: native effects, core icons and active ambush controls OK');
await (await import('./native-experimental.mjs')).checkNativeExperimental(tacticsTemplate,alchemyPartial,documents);
await (await import('./native-radolf.mjs')).checkNativeRadolf(itemTemplate,documents);
await (await import('./native-radolf-additions.mjs')).checkNativeRadolfAdditions(itemTemplate,tacticsTemplate,alchemyPartial,inventoryPartial,documents);
const combatMenuPreviews=await (await import('./native-combat-menu.mjs')).checkNativeCombatMenu(tacticsTemplate);

const {ambushWindowContext,groupCardContext}=await import('../scripts/sheets/ambush-context.mjs');
const ambushTemplate=handlebars.compile(await readFile(new URL('../templates/ambush-window.hbs',import.meta.url),'utf8'),{strict:true});

const ambushGlobals={canvas:globalThis.canvas,combat:game.combat,combats:game.combats,user:game.user,users:game.users};
const nativeAmbusher=creatureViews[0].actor;
const ambushToken=(id,name,x)=>({id,uuid:`Scene.ambush.Token.${id}`,parent:{id:'ambush'},actor:nativeAmbusher,name,x,y:0,rotation:90,disposition:-1,getSize:()=>({width:100,height:100}),texture:{src:'icons/svg/mystery-man.svg'}});
const ambushTokens=[ambushToken('attacker','Засадчик',0),ambushToken('enemyOne','Противник <1>',100),ambushToken('enemyTwo','Противник <2>',200)];
const nativeCollection=rows=>Object.assign(rows,{get(id){return this.find(row=>row.id===id);}});
globalThis.canvas={scene:{id:'ambush',tokens:nativeCollection(ambushTokens)}};
game.user={isGM:true,targets:new Set()};game.users={activeGM:game.user};game.combats=[];
const cardTemplate=handlebars.compile(await readFile(new URL('../templates/ambush-card.hbs',import.meta.url),'utf8'),{strict:true});
handlebars.registerPartial('systems/'+game.system.id+'/templates/ambush-card.hbs',cardTemplate);
const setupView=ambushWindowContext(canvas.scene,{roles:new Map([['attacker','stealth'],['enemyOne','awareness'],['enemyTwo','participant']])});
const setupHTML=ambushTemplate({...setupView,query:'',notice:''});
assert.ok(setupHTML.includes('Противник &lt;1&gt;'));assert.ok(setupHTML.includes('Без проверки'));
assert.ok(!setupHTML.match(/data-action="publishAmbush"[^>]*disabled/));
game.combat={id:'ambushCombat',scene:canvas.scene,round:0,started:false,flags:{[game.system.id]:{groupAmbush:{id:'group',status:'ready',entries:ambushTokens.map((token,i)=>({id:token.id,token:token.uuid,role:i?'awareness':'stealth',total:[18,14,18][i],claim:null,message:null}))}}},
 combatants:nativeCollection(ambushTokens.map((token,i)=>({id:token.id,tokenId:token.id,token,actor:nativeAmbusher,name:token.name,sceneId:'ambush',testUserPermission:()=>true,flags:{[game.system.id]:i?{}:{ambush:{group:'group',targets:[ambushTokens[1].uuid],opening:false}}}})))};
game.combats=[game.combat];
const ambushView=ambushWindowContext(canvas.scene);
const ambushHTML=ambushTemplate({...ambushView,query:'',notice:''});
assert.equal(ambushView.card.rows.length,3);assert.equal(ambushView.canStart,true);
assert.ok(ambushHTML.includes('Противник &lt;1&gt;'));assert.ok(ambushHTML.includes('Противник &lt;2&gt;'));
assert.ok(!ambushHTML.includes('data-action="openingAttack"'));assert.ok(!ambushHTML.includes('Первая атака'));
assert.ok(!ambushHTML.match(/data-action="startBattle"[^>]*disabled/));
assert.ok(ambushHTML.includes('is-unseen'));assert.ok(ambushHTML.includes('is-seen'));
game.combat.flags[game.system.id].groupAmbush.status='checks';
game.combat.flags[game.system.id].groupAmbush.entries[0].total=null;
const waiting=cardTemplate(groupCardContext(game.combat,'group'));
assert.ok(waiting.includes('data-ambush-roll="attacker"'));
assert.ok(cardTemplate(groupCardContext(null,'deleted')).includes('завершена'));
const macroSource=(await import('../scripts/data/macros.mjs')).MACRO_SOURCES[0];
const nativeMacro=new foundry.documents.BaseMacro(macroSource);
assert.equal(nativeMacro.validationFailures.fields,null);
assert.equal(nativeMacro.command,'await game.system.api.ambush();');
const nativeForageMacro=new foundry.documents.BaseMacro((await import('../scripts/data/macros.mjs')).MACRO_SOURCES.find(macro=>macro.name==='Собирательство (ГМ)'));
assert.equal(nativeForageMacro.validationFailures.fields,null);assert.equal(nativeForageMacro.ownership.default,0);
assert.equal(nativeForageMacro.command,'await game.system.api.forage();');
const {foragingFormula}=await import('../scripts/data/foraging.mjs');
CONFIG.Dice.functions ??= {};
assert.equal((await new CoreRoll(foragingFormula('1d6 / 2')).evaluate({maximize:true,allowInteractive:false})).total,3);
assert.equal((await new CoreRoll(foragingFormula('1d6 / 2')).evaluate({minimize:true,allowInteractive:false})).total,0);
assert.equal((await new CoreRoll(foragingFormula('1d10')).evaluate({maximize:true,allowInteractive:false})).total,10);
globalThis.canvas=ambushGlobals.canvas;game.combat=ambushGlobals.combat;game.combats=ambushGlobals.combats;game.user=ambushGlobals.user;game.users=ambushGlobals.users;
console.log('Group ambush: native Macro, role selection, shared roll matrix and manual combat start OK');

// Real bestiary actors keep one critical limb and side through the native effect schema.
{
  const {woundEffectData,onWoundCreated}=await import('../scripts/combat/critical-wound-effects.mjs');
  const {effectsContext}=await import('../scripts/sheets/effects-context.mjs');
  const effectsTemplate=handlebars.compile(await readFile(new URL('../templates/effects-list.hbs',import.meta.url),'utf8'),{strict:true});
  const random=CONFIG.Dice.randomUniform;
  CONFIG.Dice.randomUniform=()=>assert.fail('The critical attack already chose a side; effect creation must not roll again');
  try {
    for(const [id,level] of [['sprained-leg','light'],['fractured-leg','medium'],['compound-leg-fracture','severe'],['dismembered-leg','deadly']]) {
      for(const [location,name] of [['rightArm','Правая конечность'],['leftArm','Левая конечность']]) {
        const actor=new foundry.documents.BaseActor({...bestiarySources().find(source=>source.name==='Волк'),
          effects:[{...woundEffectData(id,level,{location,locationName:'Рука / конечность'}),_id:'wolfWound0000001'},
            {_id:'wolfBleeding0001',name:'Кровотечение',statuses:['bleeding']}]});
        Object.defineProperty(actor,'isOwner',{value:true});
        const effect=actor.effects.get('wolfWound0000001');effect.update=async changes=>effect.updateSource(changes);
        await onWoundCreated(effect,{},game.user.id);
        const data=effect.flags[game.system.id].criticalWound;
        assert.equal(data.location,location);assert.equal(data.locationName,name);assert.equal(data.bodyPlan,'monster');
        if(id==='dismembered-leg')assert.equal(data.arm,location);
        const html=effectsTemplate({editable:true,effects:await effectsContext({actor,isEditable:true})});
        assert.ok(html.includes(name));assert.ok(!html.includes('Рука / конечность'));
        const restored=new foundry.documents.BaseActor(JSON.parse(JSON.stringify(actor.toObject())));
        assert.equal(restored.effects.get(effect.id).flags[game.system.id].criticalWound.locationName,name);
        assert.equal(effect.validationFailures.fields,null);
      }
    }
  } finally {CONFIG.Dice.randomUniform=random;}
  console.log('Critical limbs: native wolf effects preserve both sides, render creature labels and never reroll the struck limb');
}

const manualEditingPreviews={};
{
  const {woundEffectData}=await import('../scripts/combat/critical-wound-effects.mjs');
  const {editWound}=await import('../scripts/sheets/wound-editor.mjs');
  const {effectsContext}=await import('../scripts/sheets/effects-context.mjs');
  const {installCatalogUpgrade}=await import('../scripts/workshop/upgrades.mjs');
  const {workshopItemContext}=await import('../scripts/sheets/workshop-item-context.mjs');
  const saved={dialog:foundry.applications.api.DialogV2,documents:foundry.documents};
  const actor=new foundry.documents.BaseActor({name:'Ручное редактирование',type:'character',
    effects:[{...woundEffectData('sprained-arm','light',{location:'rightArm',locationName:'Правая рука'}),_id:'manualWound00001'}],
    items:[{_id:'manualWeapon0001',name:'Рыцарский меч',type:'weapon',system:{enhancementSlots:1,reliability:{value:10,max:10}}}]});
  Object.defineProperty(actor,'isOwner',{value:true});
  const effect=actor.effects.get('manualWound00001');effect.update=async changes=>effect.updateSource(changes);
  const effectsTemplate=handlebars.compile(await readFile(new URL('../templates/effects-list.hbs',import.meta.url),'utf8'),{strict:true});
  const itemTemplate=handlebars.compile(await readFile(new URL('../templates/workshop-item.hbs',import.meta.url),'utf8'),{strict:true});
  const renderEffects=async editable=>effectsTemplate({editable,effects:await effectsContext({actor,isEditable:editable})});
  manualEditingPreviews.wound=await renderEffects(true);
  assert.match(manualEditingPreviews.wound,/data-action="editWound"[^>]*aria-label="Редактировать ранение"[^>]*>/);
  assert.ok(!manualEditingPreviews.wound.match(/data-action="editWound"[^>]*disabled/));
  assert.match(await renderEffects(false),/data-action="editWound"[^>]*disabled/);
  try {
    foundry.applications.api.DialogV2={prompt:async options=>{manualEditingPreviews.editor=options.content;return 'stabilized';}};
    await editWound(effect);
    assert.equal(effect.flags[game.system.id].criticalWound.state,'stabilized');
    assert.equal(effect.flags[game.system.id].condition.modifiers[0].value,-1);
    manualEditingPreviews.stabilized=await renderEffects(true);
    assert.ok(manualEditingPreviews.stabilized.includes('Стабилизировано'));
    const source=new foundry.documents.BaseItem(JSON.parse(await readFile(new URL('../pack-sources/equipment.json',import.meta.url),'utf8')).find(item=>item.system.ruleId==='rune.dazhbog'));
    const target=actor.items.get('manualWeapon0001');Object.defineProperty(target,'actor',{value:actor});
    actor.updateEmbeddedDocuments=async(_type,changes)=>changes.map(change=>actor.items.get(change._id).updateSource(change));
    foundry.documents={...foundry.documents,ChatMessage:{getSpeaker:()=>({}),create:async()=>{}}};
    await installCatalogUpgrade(target,source);
    assert.equal(actor.items.size,1);
    assert.equal(target.system.installations[0].ruleId,'rune.dazhbog');
    assert.equal(target.validationFailures.fields,null);
    manualEditingPreviews.item=itemTemplate({item:target,editable:true,workshop:await workshopItemContext(target,null)});
    assert.ok(manualEditingPreviews.item.includes('Руна Даждьбог'));
    assert.ok(manualEditingPreviews.item.includes('Горение (30%)'));
  } finally {foundry.applications.api.DialogV2=saved.dialog;foundry.documents=saved.documents;}
  console.log('Manual editing: native wound controls, direct stabilization and catalogue-only rune installation OK');
}
