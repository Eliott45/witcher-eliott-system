import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { BESTIARY_V4_PREVIOUS, BESTIARY_V4_ITEM_FIELDS, ARCHER_V4_HARVEST } from "../scripts/migrations/bestiary-automation-values.mjs";
import { bestiaryAutomationPatch, migrateBestiaryAutomation } from "../scripts/migrations/bestiary-automation.mjs";

const set = (target, path, value) => {
  const keys = path.split("."), key = keys.pop(), parent = keys.reduce((object, key) => object[key] ??= {}, target);
  if (value === undefined) delete parent[key]; else parent[key] = structuredClone(value);
};
const current = bestiarySources();
function fixture() {
  const state = { version: 3, packActors: [], writes: [], locks: [], fail: "", cancel: "", limit: Infinity };
  function actor(name, uuid = `Actor.${name}`) {
    const source = structuredClone(current.find(source => source.name === name)), before = BESTIARY_V4_PREVIOUS[source._id];
    for (const [path, value] of before?.fields ?? []) set(source, path, value ?? undefined);
    for (const [id, [, index]] of Object.entries(before?.items ?? {})) {
      const item = source.items.find(item => item._id === id);
      for (const [path, value] of BESTIARY_V4_ITEM_FIELDS[index]) set(item, path, value ?? undefined);
    }
    if (name === "Лучник скоя'таэлей") {
      source.items = source.items.filter(item => item.type !== "armor");
      source.system.creature.naturalArmor = 5; source.system.harvest = structuredClone(ARCHER_V4_HARVEST);
    }
    const document = { ...source, id: source._id, uuid,
      async update(patch) {
        state.writes.push([uuid, "actor", structuredClone(patch)]);
        if (state.fail === uuid) throw new Error("Database failure");
        if (state.cancel === uuid) return;
        for (const [path, value] of Object.entries(patch)) set(this, path, value);
      },
      async updateEmbeddedDocuments(type, patches) {
        assert.equal(type, "Item"); state.writes.push([uuid, "items", structuredClone(patches)]);
        if (state.fail === `${uuid}.items`) throw new Error("Database failure");
        if (state.cancel === `${uuid}.items`) return;
        for (const patch of patches) for (const [path, value] of Object.entries(patch)) if (path !== "_id") set(this.items.find(item => item._id === patch._id), path, value);
      },
      async createEmbeddedDocuments(type, sources, options) {
        assert.equal(type, "Item"); assert.equal(options.keepId, true); state.writes.push([uuid, "create", sources]);
        const created = structuredClone(sources.slice(0, state.limit)); this.items.push(...created); return created;
      }
    };
    return document;
  }
  const gm = {}, pack = { collection: `${SYSTEM_ID}.bestiary`, locked: true,
    getDocuments: async () => state.packActors,
    configure: async ({ locked }) => { state.locks.push(locked); pack.locked = locked; } };
  globalThis.game = { user: gm, users: { activeGM: gm }, actors: [], scenes: [], packs: new Map([[pack.collection, pack]]),
    settings: { get: () => state.version, set: async (_scope, _key, value) => { state.version = value; } } };
  return { actor, state, pack };
}

test("v4 updates old stock metadata on renamed pack/world/synthetic copies without changing wounds or resources", async () => {
  const { actor, state, pack } = fixture();
  const ghoul = actor("Гуль", "Compendium.ghoul"), noon = actor("Полуденница", "Actor.noon"), wraith = actor("Призрак", "Scene.s.Token.wraith.Actor.wraith");
  noon.id = noon._id = "worldNoon"; noon.name = "Моя полуденница";
  noon.flags = { core: { sourceId: `Compendium.${SYSTEM_ID}.bestiary.Actor.bstr000000000006` } };
  noon.system.health.value = 12; noon.system.stamina.value = 7; noon.effects = [{ name: "Рана" }];
  state.packActors = [ghoul]; game.actors = [noon, noon]; game.scenes = [{ tokens: [{ actorLink: false, actor: wraith }, { actorLink: true, actor: noon }] }];
  await migrateBestiaryAutomation();
  assert.equal(state.version, 4); assert.equal(pack.locked, true); assert.deepEqual(state.locks, [false, true]);
  assert.equal(ghoul.items[0].system.damageType, "Р"); assert.match(ghoul.items[0].system.ruleId, /creature\.weapon/);
  assert.equal(noon.system.creature.resistances, ""); assert.match(noon.system.creature.lore[1].text, /90%/);
  assert.equal(noon.system.health.value, 12); assert.equal(noon.system.stamina.value, 7); assert.deepEqual(noon.effects, [{ name: "Рана" }]);
  assert.ok(wraith.items.some(item => item.system.ruleId === "creature.slip"));
  const count = state.writes.length; await migrateBestiaryAutomation(); assert.equal(state.writes.length, count);
});

test("v4 preserves edited item values, missing items, other lore rows and unrelated actors", () => {
  const { actor } = fixture();
  const ghoul = actor("Гуль"); ghoul.items[0].system.damageType = "С"; ghoul.items[0].system.ruleId = "my.claws";
  assert.ok(!bestiaryAutomationPatch(ghoul).items.some(patch => patch._id === ghoul.items[0]._id));
  ghoul.items.splice(1, 1); assert.ok(!bestiaryAutomationPatch(ghoul).items.some(patch => patch._id === "bst003i000000002"));
  const noon = actor("Полуденница"); noon.system.creature.lore[0].text = "Заметки ведущего";
  const lore = bestiaryAutomationPatch(noon).actor["system.creature.lore"];
  assert.equal(lore[0].text, "Заметки ведущего"); assert.match(lore[1].text, /90%/);
  noon.system.creature.lore[1].text = "Призывается всегда";
  assert.equal(bestiaryAutomationPatch(noon).actor["system.creature.lore"], undefined);
  ghoul.id = ghoul._id = "unrelated"; ghoul.name = "Другое существо";
  assert.deepEqual(bestiaryAutomationPatch(ghoul), { actor: {}, items: [], armor: null });
});

test("Foundry's empty string defaults are eligible, and legacy Warg source is recognized", async () => {
  const { actor } = fixture();
  const ghoul = actor("Гуль"); ghoul.items[0].system.ruleId = ""; ghoul.items[0].system.damageType = "";
  assert.match(bestiaryAutomationPatch(ghoul).items.find(row => row._id === ghoul.items[0]._id)["system.ruleId"], /creature\.weapon/);
  const warg = actor("Варг"); warg.id = warg._id = "legacyCopy"; game.actors = [warg];
  await migrateBestiaryAutomation();
  assert.equal(warg.system.creature.source, "Базовая книга, стр. 287"); assert.equal(warg.items[0].system.source, "Базовая книга, стр. 287");
});

test("archer armor conversion carries old SP wear to all three real worn pieces and removes only matching harvest", async () => {
  const { actor, state } = fixture();
  const archer = actor("Лучник скоя'таэлей"); archer.system.creature.naturalArmor = 2;
  archer.system.harvest.push({ id: "custom", uuid: "Item.custom", quantity: 4 });
  archer.system.health.value = 9; archer.system.creature.lootGenerated = true; game.actors = [archer];
  const arrows = structuredClone(archer.items.filter(item => item.system.kind === "ammunition"));
  await migrateBestiaryAutomation();
  assert.equal(state.version, 4); assert.equal(archer.system.creature.naturalArmor, 0); assert.equal(archer.system.health.value, 9);
  const armor = archer.items.filter(item => item.type === "armor");
  assert.equal(armor.length, 3); assert.ok(armor.every(item => item.system.equipped && item.system.stoppingPower.value === 2 && item.system.stoppingPower.max === 5));
  assert.deepEqual(archer.system.harvest, [{ id: "custom", uuid: "Item.custom", quantity: 4 }]);
  assert.deepEqual(archer.items.filter(item => item.system.kind === "ammunition"), arrows);
});

test("partial embedded armor creation is retryable without duplicating pieces or losing wear", async () => {
  const { actor, state, pack } = fixture();
  const archer = actor("Лучник скоя'таэлей"); archer.system.creature.naturalArmor = 1; state.packActors = [archer]; state.limit = 1;
  await assert.rejects(migrateBestiaryAutomation(), /все доспехи/);
  assert.equal(state.version, 3); assert.equal(pack.locked, true); assert.equal(archer.items.filter(item => item.type === "armor").length, 1);
  assert.equal(archer.system.creature.naturalArmor, 1); assert.equal(archer.system.harvest.length, 3);
  state.limit = Infinity; await migrateBestiaryAutomation();
  assert.equal(state.version, 4); assert.equal(archer.items.filter(item => item.type === "armor").length, 3);
  assert.ok(archer.items.filter(item => item.type === "armor").every(item => item.system.stoppingPower.value === 1));
  assert.deepEqual(state.writes.filter(row => row[1] === "create").map(row => row[2].length), [3, 2]);
});

test("taken or customized archer armor is not duplicated or silently overwritten", async () => {
  const { actor } = fixture();
  for (const alter of [a => { a.system.harvest[0].attempted = true; }, a => { a.system.creature.naturalArmor = 7; },
    a => { a.system.harvest[0].quantity = 2; }, a => { a.items.push({ _id: "customArmor", type: "armor", system: { equipped: true } }); }]) {
    const archer = actor("Лучник скоя'таэлей"); alter(archer); assert.equal(bestiaryAutomationPatch(archer).armor, null);
  }
});

test("cancelled or failed embedded writes keep v4 retryable and restore pack lock", async () => {
  const { actor, state, pack } = fixture();
  const ghoul = actor("Гуль", "Compendium.ghoul"); state.packActors = [ghoul]; state.cancel = `${ghoul.uuid}.items`;
  await assert.rejects(migrateBestiaryAutomation(), /Не удалось обновить/);
  assert.equal(state.version, 3); assert.equal(pack.locked, true);
  state.cancel = ""; state.fail = `${ghoul.uuid}.items`;
  await assert.rejects(migrateBestiaryAutomation(), /Database failure/); assert.equal(state.version, 3); assert.equal(pack.locked, true);
  state.fail = ""; await migrateBestiaryAutomation(); assert.equal(state.version, 4);
});

test("stock values are rechecked between actors and synthetic copies sharing IDs are both migrated", async () => {
  const { actor, state } = fixture();
  const first = actor("Гуль", "Compendium.first"), second = actor("Гуль", "Scene.s.Token.second.Actor.same"), third = actor("Гуль", "Scene.s.Token.third.Actor.same");
  state.packActors = [first]; game.scenes = [{ tokens: [{ actorLink: false, actor: second }, { actorLink: false, actor: third }] }];
  const update = first.updateEmbeddedDocuments.bind(first);
  first.updateEmbeddedDocuments = async (...args) => { await update(...args); second.items[0].system.damageType = "С"; };
  await migrateBestiaryAutomation();
  assert.equal(second.items[0].system.damageType, "С"); assert.match(second.items[0].system.ruleId, /creature\.weapon/);
  assert.equal(third.items[0].system.damageType, "Р");
});

test("v4 waits for active GM and its pack; a current pack is never unlocked", async () => {
  const { actor, state } = fixture();
  state.packActors = [actor("Гуль")]; game.user = {};
  await migrateBestiaryAutomation(); assert.equal(state.version, 3); assert.deepEqual(state.writes, []);
  game.user = game.users.activeGM; game.packs.clear(); await migrateBestiaryAutomation(); assert.equal(state.version, 3);
  const fresh = fixture(); fresh.state.packActors = current.map(source => ({ ...structuredClone(source), id: source._id }));
  await migrateBestiaryAutomation(); assert.equal(fresh.state.version, 4); assert.deepEqual(fresh.state.locks, []);
});
