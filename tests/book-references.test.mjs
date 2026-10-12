import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bookSource, withoutBookPages } from "../scripts/data/book-references.mjs";
import { bookReferenceUpdate, migrateBookReferences, BOOK_REFERENCES_VERSION } from "../scripts/migrations/book-references.mjs";
import { compendiumData } from "../tools/compendium-data.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

test("source fields keep book names without pages or core editorial annotations", () => {
  for (const source of ["Базовая книга", "Базовая книга, стр. 114; официальная errata", "Базовая книга, стр. 128–129 / 143–145; цена не указана"])
    assert.equal(bookSource(source), "Базовая книга");
  assert.equal(bookSource("Дневник охотника на чудовищ, стр. 26"), "Дневник охотника на чудовищ");
  assert.equal(bookSource("Моя книга"), "Моя книга");
});

test("page cleanup preserves prose, mechanical numbers, HTML links and rolls", () => {
  const links = '<a href="book.pdf#page=114" title="стр. 114">Книга</a> @UUID[Item.abc123]{Предмет} [[/r 7d6+4]]';
  const before = `<p>СЛ 18 (стр. 72); урон ×2. Базовая книга, стр. 128–129, 143–145 / 147.</p>${links}`;
  assert.equal(withoutBookPages(before), `<p>СЛ 18; урон ×2. Базовая книга.</p>${links}`);
  assert.equal(withoutBookPages("Не ведьмак (стр. 251, «Мутирование»)."), "Не ведьмак («Мутирование»).");
  assert.equal(withoutBookPages("<p>Базовая книга: стр. 37, дерево: стр. 62.</p>"), "<p>Базовая книга.</p>");
  assert.equal(withoutBookPages("В книге 300 страниц; стрела стоит 3 кроны."), "В книге 300 страниц; стрела стоит 3 кроны.");
});

test("migration updates only narrative fields and replaces nested arrays as a whole", () => {
  const before = { _id: "actor1", system: { health: { value: 114 }, ruleId: "стр. 114", source: "Базовая книга, стр. 114",
    creature: { lore: [{ name: "Мои записи", dc: 18, text: "Штраф −2 (стр. 152)." }] }, notes: "Моя запись. Находка №114." },
    flags: { custom: { source: "стр. 114" }, [SYSTEM_ID]: { pregen: { source: "Базовая книга, стр. 12" } } } };
  const snapshot = structuredClone(before), updates = bookReferenceUpdate(before);
  assert.deepEqual(updates, { "system.source": "Базовая книга", "system.creature.lore": [{ name: "Мои записи", dc: 18, text: "Штраф −2." }], [`flags.${SYSTEM_ID}.pregen.source`]: "Базовая книга" });
  assert.deepEqual(before, snapshot);
  assert.deepEqual(bookReferenceUpdate({ system: { source: "Базовая книга", description: "Урон 2d6+4." } }), {});
});

test("all generated catalogs are free of page citations, including embedded items and pregens", async () => {
  const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
  const packs = compendiumData(translations);
  for (const [name, documents] of Object.entries(packs)) {
    assert.doesNotMatch(JSON.stringify(documents), /стр\.\s*\d/i, name);
    for (const document of documents) assert.deepEqual(bookReferenceUpdate(document), {}, `${name}: ${document.name}`);
  }
});

function setup({ fail = false } = {}) {
  const calls = [], gm = {}, state = { version: 0 }, packName = `${SYSTEM_ID}.spells`;
  const effect = { id: "effect", description: "Штраф −2 (стр. 152)." };
  const item = { id: "item", system: { source: "Базовая книга, стр. 114" }, effects: [effect],
    async updateEmbeddedDocuments(type, updates, options) { calls.push(["itemEffects", type, updates, options]); } };
  const actor = { id: "actor", uuid: "Actor.actor", isOwner: true, items: [item], effects: [effect], system: { creature: { source: "Базовая книга, стр. 271" } },
    async updateEmbeddedDocuments(type, updates, options) { calls.push(["children", this.uuid, type, updates, options]); } };
  const token = { ...actor, id: "synthetic", uuid: "Scene.test.Token.test.Actor.synthetic", async update(update) { calls.push(["synthetic", update]); } };
  const pack = { collection: packName, documentName: "Item", locked: true, async getDocuments() { return [item]; },
    async configure({ locked }) { this.locked = locked; calls.push(["lock", locked]); } };
  const worldPack = { ...pack, collection: "world.heroes", documentName: "Actor", async getDocuments() { return [actor]; } };
  const effectPack = { ...pack, collection: `${SYSTEM_ID}.effects`, documentName: "ActiveEffect", async getDocuments() { return [effect]; } };
  const unrelatedPack = { collection: "other-module.items", documentName: "Item", async getDocuments() { throw new Error("unrelated pack accessed"); } };
  globalThis.game = { user: gm, users: { activeGM: gm }, items: [item], actors: [actor], scenes: [{ tokens: [{ actorLink: false, actor: token }, { actorLink: true, actor }] }], packs: new Map([pack, worldPack, effectPack, unrelatedPack].map(p => [p.collection, p])),
    settings: { get: () => state.version, async set(_system, _key, value) { state.version = value; } } };
  globalThis.foundry = { documents: Object.fromEntries(["Item", "Actor", "ActiveEffect"].map(type => [type, { implementation: {
    async updateDocuments(updates, options) { calls.push(["batch", type, updates, options]); if (fail && options.pack) throw new Error("write failed"); }
  } }])) };
  return { calls, state, pack };
}

test("migration covers world, embedded effects, synthetic actors and locked system packs", async () => {
  const { calls, state, pack } = setup();
  await migrateBookReferences();
  assert.equal(state.version, BOOK_REFERENCES_VERSION);
  assert.equal(pack.locked, true);
  assert.ok(calls.some(call => call[0] === "synthetic"));
  assert.ok(calls.some(call => call[0] === "itemEffects"));
  assert.ok(calls.some(call => call[0] === "children" && call[1].includes("Scene.") && call[2] === "Item"));
  assert.ok(calls.some(call => call[0] === "batch" && call[3].pack === pack.collection && call[3].broadcast === false));
  assert.ok(calls.some(call => call[0] === "batch" && call[1] === "ActiveEffect"));
  assert.ok(calls.some(call => call[0] === "batch" && call[3].pack === "world.heroes"));
  assert.ok(calls.filter(call => call[0] === "batch" && call[1] === "Actor").every(call => call[2].every(update => update._id !== "synthetic")));
  const count = calls.length;
  await migrateBookReferences();
  assert.equal(calls.length, count);
});

test("migration restores pack locks on failure, remains retryable and only runs on active GM", async () => {
  const { state, pack } = setup({ fail: true });
  await assert.rejects(migrateBookReferences(), /write failed/);
  assert.equal(pack.locked, true);
  assert.equal(state.version, 0);
  const { calls } = setup();
  game.user = {};
  await migrateBookReferences();
  assert.deepEqual(calls, []);
});
