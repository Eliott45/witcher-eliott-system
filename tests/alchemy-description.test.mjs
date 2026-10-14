import test from "node:test";
import assert from "node:assert/strict";
import { ALCHEMY, MUTAGENS } from "../scripts/data/workshop-alchemy.mjs";
import { RECIPES } from "../scripts/data/workshop-recipes.mjs";
import { alchemyDescriptionDetails } from "../scripts/data/alchemy-descriptions.mjs";
import { alchemyDescriptionUpdate } from "../scripts/migrations/alchemy-descriptions.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { equipmentEntry } from "../scripts/data/equipment-search.mjs";
import { itemPresentation } from "../scripts/sheets/item-presentation.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

const item = entry => ({ ...structuredClone(entry), system: { ...structuredClone(entry.system), ruleId: entry.id } });
const find = id => item([...ALCHEMY, ...MUTAGENS, ...RECIPES].find(entry => entry.id === id));
function apply(item, update) {
  for (const [path, value] of Object.entries(update)) {
    const parts = path.split("."); let target = item;
    for (const key of parts.slice(0, -1)) target = target[key] ??= {};
    target[parts.at(-1)] = value;
  }
}

test("all potion, oil and decoction descriptions show their current duration and applicable toxicity", async () => {
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { enrichHTML: async text => text } } } } };
  const timed = ALCHEMY.filter(entry => ["potion", "oil", "decoction"].includes(entry.system.alchemy.category));
  assert.equal(timed.length, 34);
  for (const entry of timed) {
    const view = await itemPresentation(item(entry));
    assert.match(view.description, /Длительность:/, entry.name);
    assert.equal(view.description.includes("Токсичность:"), entry.system.alchemy.category !== "oil", entry.name);
    assert.doesNotMatch(view.description, /цена не указана|в параметрах состава|<small>/i);
    assert.equal(view.properties, "", "Effect text is not repeated below the chips");
  }
  for (const [id, duration, toxicity] of [["potion.swallow", "20 раундов", "50%"], ["potion.cat", "2 ч.", "25%"], ["decoction.wyvern", "30 мин.", "75%"], ["potion.white-honey", "Мгновенно", "0%"]]) {
    const details = alchemyDescriptionDetails(find(id).system);
    assert.ok(details.includes(duration), id); assert.ok(details.includes(toxicity), id);
  }
  const oil = await itemPresentation(find("oil.humanoid"));
  assert.equal(oil.description.match(/30 мин\./g).length, 1);
});

test("changing numeric alchemy details updates the description without overwriting custom prose", async () => {
  globalThis.foundry = { applications: { ux: { TextEditor: { implementation: { enrichHTML: async text => text } } } } };
  const potion = find("potion.swallow");
  potion.system.description = "<p>Мой вариант эликсира.</p>";
  potion.system.alchemy.duration = 7200; potion.system.alchemy.toxicity = 25;
  const view = await itemPresentation(potion);
  assert.match(view.description, /2 ч\./); assert.match(view.description, /25%/);
  assert.doesNotMatch(view.description, /20 раундов|50%/);
  assert.equal(potion.system.description, "<p>Мой вариант эликсира.</p>");
  assert.equal(alchemyDescriptionDetails({ kind: "alchemy", alchemy: { category: "substance" } }), "", "Unspecified ordinary duration is not infinite or instantaneous");
  potion.system.alchemy.duration = 86400;
  assert.match(alchemyDescriptionDetails(potion.system), /1 дн\./);
});

test("legacy alchemy cleanup removes shipped notes, retains custom content and is idempotent", () => {
  const potion = find("potion.swallow"); delete potion.flags;
  const source = potion.system.source, note = "<p>Подарок травницы.</p>";
  potion.system.description = potion.system.description.replace("Ведьмачий эликсир.", "Ведьмачий эликсир. Длительность и токсичность указаны в параметрах состава.")
    + `<p><small>${source}; цена не указана</small></p>` + note;
  potion.system.source += "; цена не указана";
  potion.system.price = 123; potion.system.alchemy.duration = 120;
  apply(potion, alchemyDescriptionUpdate(potion));
  assert.equal(potion.system.description, find("potion.swallow").system.description + note);
  assert.equal(potion.system.source, source);
  assert.equal(potion.system.price, 123); assert.equal(potion.system.alchemy.duration, 120);
  assert.equal(potion.flags[SYSTEM_ID].priceUnavailable, true);
  assert.deepEqual(alchemyDescriptionUpdate(potion), {});
  const oil = find("oil.humanoid");
  oil.system.description = oil.system.description.replace("Наносится на конкретное оружие.", "Действует на конкретном оружии 30 минут.") + note;
  oil.system.properties = oil.system.properties.replace("Наносится на конкретное оружие.", "Действует на конкретном оружии 30 минут.");
  apply(oil, alchemyDescriptionUpdate(oil));
  assert.equal(oil.system.description, find("oil.humanoid").system.description + note);
  assert.deepEqual(alchemyDescriptionUpdate(oil), {});
  assert.deepEqual(alchemyDescriptionUpdate({ system: { ruleId: "custom", description: "Мои заметки; цена не указана" } }), {});
});

test("unpriced witcher products, mutagens and formulas are not free purchases; assigned prices still work", () => {
  globalThis.game = { user: {} };
  const unpriced = [...ALCHEMY, ...MUTAGENS, ...RECIPES].filter(entry => entry.flags?.[SYSTEM_ID]?.priceUnavailable);
  assert.equal(unpriced.length, 126, "80 witcher alchemy entries + 25 witcher diagrams + 17 experimental recipes + 3 Radolf formulas + Devil's Musk formula");
  for (const entry of unpriced) {
    const source = { ...item(entry), testUserPermission: () => true };
    const actor = { isOwner: true, system: { crowns: 1000 } };
    assert.equal(equipmentQuote(actor, source).canAdd, true);
    assert.equal(equipmentQuote(actor, source).canBuy, false, entry.id);
    assert.doesNotMatch(equipmentEntry(source).summary, /\b0 крон/);
    source.system.price = 20;
    assert.equal(equipmentQuote(actor, source).cost, 20);
    assert.equal(equipmentQuote(actor, source).canBuy, true);
    assert.equal(alchemyDescriptionUpdate(source)["system.price"], undefined);
  }
  assert.equal(equipmentQuote({ isOwner: true, system: { crowns: 100 } }, { ...find("alchemy.acid"), testUserPermission: () => true }).cost, 56);
  const oldMutagen = find("mutagen.griffin"); delete oldMutagen.flags;
  oldMutagen.system.description = `<p>${oldMutagen.system.source}; цена не указана</p>`;
  apply(oldMutagen, alchemyDescriptionUpdate(oldMutagen));
  assert.match(oldMutagen.system.description, /Постоянно:/);
  assert.match(oldMutagen.system.description, /Редкие перья/);
});
