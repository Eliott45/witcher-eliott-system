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
assert.deepEqual(Array.from(packFolder.packs), ["races", "abilities", "origins", "family-statuses", "equipment", "influential-friends", "languages", "professions"]);
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
const { WitcherRaceData } = await import("../scripts/data/witcher-race-data.mjs");
const { WitcherOriginData } = await import("../scripts/data/witcher-origin-data.mjs");
const { WitcherFamilyStatusData } = await import("../scripts/data/witcher-family-status-data.mjs");
const { WitcherInfluenceData } = await import("../scripts/data/witcher-influence-data.mjs");
const { raceUuid, abilityUuid, originUuid, familyStatusUuid, equipmentUuid, influentialFriendUuid } = await import("../scripts/data/compendiums.mjs");
const { WitcherAbilityData } = await import("../scripts/data/witcher-ability-data.mjs");
const { WitcherEquipmentData } = await import("../scripts/data/witcher-equipment-data.mjs");
const { WitcherWeaponData } = await import("../scripts/data/witcher-weapon-data.mjs");
const { WitcherRecipeData } = await import("../scripts/data/witcher-recipe-data.mjs");
const { WitcherArmorData } = await import("../scripts/data/witcher-armor-data.mjs");
const oldGear = new WitcherEquipmentData({ ruleId: "old-custom", description: "<p>Старый предмет</p>" });
assert.equal(oldGear.quantity, 1); assert.equal(oldGear.weight, 0); assert.equal(oldGear.description, "<p>Старый предмет</p>");
CONFIG.Item.dataModels = { profession: WitcherReferenceData, race: WitcherRaceData, ability: WitcherAbilityData, origin: WitcherOriginData, familyStatus: WitcherFamilyStatusData, equipment: WitcherEquipmentData, weapon: WitcherWeaponData, armor: WitcherArmorData, recipe: WitcherRecipeData, influence: WitcherInfluenceData, language: WitcherReferenceData };
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
    const modeled = document.system.toObject();
    assert.deepEqual(Object.fromEntries(Object.keys(source.system).map(key => [key, modeled[key]])), source.system);
    assert.equal(document.effects.size, 0, "Reference items must not contain automated effects");
    const uuid = `Compendium.${game.system.id}.${pack.name}.Item.${document.id}`;
    documents.set(uuid, document);
  }
}
assert.equal(documents.size, Object.values((await import("./compendium-data.mjs")).compendiumData(await readJSON("../lang/ru.json"))).flat().length);
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
CONFIG.Actor.dataModels.character = WitcherActorData;
foundry.data.PrototypeTokenOverrides.overrides = { base: {} };
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
handlebars.registerHelper("checked", value => value ? "checked" : "");
handlebars.registerHelper("disabled", value => value ? "disabled" : "");
for (const name of ["profession", "profession-node", "lifepath", "inventory", "structured-fields", "workshop-item", "workshop-actor"]) handlebars.registerPartial(`systems/witcher-eliott-system/templates/${name}.hbs`, await readFile(new URL(`../templates/${name}.hbs`, import.meta.url), "utf8"));
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
foundry.utils.fromUuid = async () => null;
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
assert.ok(!html.includes('<select name="system.details.'), "Race and origin must use the browser, not dropdowns");
assert.ok(!html.includes('data-action="viewRace"'), "An unset race has no broken preview button");
assert.ok(!html.includes('name="system.notes"'));
assert.ok(!html.includes("witcher-vision"));
assert.ok(!html.includes("witcher-footnote"));
assert.equal([...html.matchAll(/data-action="tab"/g)].length, 9);
assert.equal([...html.matchAll(/name="system.attributes\./g)].length, 0, "Base attributes are locked by default");
sheet.submit = async () => {};
sheet.render = async () => {};
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
const editableStatisticsHTML = template(await sheet._prepareContext({}));
assert.equal([...editableStatisticsHTML.matchAll(/name="system.attributes\./g)].length, 9);
assert.match(editableStatisticsHTML, /role="switch" aria-checked="true"/);
await WitcherActorSheet.DEFAULT_OPTIONS.actions.toggleAttributes.call(sheet);
assert.equal((await sheet._prepareContext({})).editingAttributes, false);
assert.equal([...html.matchAll(/data-action="rollSkill"/g)].length, 49);
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
assert.deepEqual(customized.visibleTabs.map(tab => tab.id), ["skills", "profession", "inventory", "actions", "biography", "family", "lifepath", "effects"]);
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
assert.equal([...tabsTemplate({ tabs: Object.values((await sheet._prepareContext({})).tabs).map(tab => ({ ...tab, visible: true })) }).matchAll(/data-sheet-tab/g)].length, 9);
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
// A Stubbornness reroll rebuilds a fresh wc chain while keeping the previous Luck
// term. The new selected Luck must survive for the player's next separate check.
const { rerollStubbornness } = await import("../scripts/chat/stubbornness.mjs");
const stubbornActor = { uuid: "Actor.nativeStubborn", isOwner: true, items: [],
  system: { details: { race: "human" }, abilityState: { stubbornnessUsed: 0 }, luckPending: 2 },
  async update(changes) { this.system.abilityState.stubbornnessUsed = changes["system.abilityState.stubbornnessUsed"]; }
};
const originalDiceRollClass = foundry.dice.Roll;
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
    assert.equal(message.rolls[0].total, 25);
    assert.ok(message.flavor.includes("10 + 11 + 4 = 25"));
    return message;
  }
};
for (const { data } of criticalNativeRolls) {
  const queue = [10, 1];
  CONFIG.Dice.randomUniform = () => 1 - (queue.shift() - 0.5) / 10;
  stubbornActor.system.abilityState.stubbornnessUsed = 0;
  const original = CoreRoll.fromData(JSON.parse(JSON.stringify(data)));
  const message = { id: "original-check", isOwner: true, isContentVisible: true, speakerActor: stubbornActor,
    speaker: { actor: "stubborn00000001" }, whisper: [game.user.id], blind: true, rolls: [original],
    flags: { [game.system.id]: { skillCheck: { key: "courage" }, luck: { bonus: 4, rollIndex: 0 } } },
    async update(changes) { this.flags[game.system.id].stubbornness = changes[`flags.${game.system.id}.stubbornness`]; }
  };
  await rerollStubbornness(message);
  assert.equal(queue.length, 0, "Every previous positive/negative chain creates a new independent 10 → 1");
  assert.equal(message.flags[game.system.id].stubbornness.kept, Math.max(original.total, 25));
  assert.equal(stubbornActor.system.abilityState.stubbornnessUsed, 1);
  assert.equal(stubbornActor.system.luckPending, 2);
}
foundry.dice.Roll = originalDiceRollClass;
// STUN and the ordinary dice tray retain their plain-d10 formulas.
for (const face of [1, 10]) {
  let draws = 0;
  CONFIG.Dice.randomUniform = () => { draws++; return 1 - (face - 0.5) / 10; };
  const plain = await new CoreRoll("1d10").evaluate({ allowInteractive: false });
  assert.equal(plain.total, face);
  assert.equal(draws, 1);
  assert.equal(plain.dice[0].options[game.system.id], undefined);
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
  }
  console.log("Installed Dice So Nice: all nine critical chains produce the correct successive d10 throws");
}
console.log(`Installed Foundry core: data, ${documents.size} Items, templates, native Luck, death saves and all nine critical chains OK`);
