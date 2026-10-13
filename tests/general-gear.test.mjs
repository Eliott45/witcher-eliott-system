import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GENERAL_GEAR_RULES, CORE_GENERAL_ADDITIONS, generalGearContent, getGeneralGearRules } from "../scripts/data/general-gear.mjs";
import { CORE_GEAR } from "../scripts/data/core-equipment.mjs";
import { CORE_CONTAINERS } from "../scripts/data/core-containers.mjs";
import { compendiumData } from "../tools/compendium-data.mjs";
import { generalGearDescriptionUpdate } from "../scripts/migrations/general-gear-descriptions.mjs";
import { equipmentEntry } from "../scripts/data/equipment-search.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { itemPresentation } from "../scripts/sheets/item-presentation.mjs";
import { inventoryContext } from "../scripts/sheets/inventory-context.mjs";

const ru = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const all = compendiumData(ru).equipment;
const apply = (item, update) => { for (const [key, value] of Object.entries(update)) item.system[key.slice(7)] = value; };

test("all sixty p93 physical items have descriptions, twenty-six additions have distinct stable IDs", () => {
  const ids = Object.keys(GENERAL_GEAR_RULES);
  assert.equal(ids.length, 60); assert.equal(CORE_GENERAL_ADDITIONS.length, 26);
  assert.equal(new Set(all.map(item => item._id)).size, all.length);
  assert.equal(new Set(all.map(item => item.system.ruleId)).size, all.length);
  for (const id of ids) {
    const matches = all.filter(item => item.system.ruleId === id);
    assert.equal(matches.length, 1, id);
    if (id !== "gear.torch") assert.ok(matches[0].system.description.includes(GENERAL_GEAR_RULES[id].description), id);
    assert.doesNotMatch(matches[0].system.description, /Базовая книга|стр\. \d/);
  }
  // These identities are also linked by family and friend compendiums.
  assert.equal(all.find(item => item.system.ruleId === "musical-instrument")._id, "gear000000000006");
  assert.equal(all.find(item => item.system.ruleId === "sacred-symbol")._id, "gear000000000008");
  assert.equal(all.find(item => item.system.ruleId === "shoulder-bag")._id, "gear000000000035");
  assert.match(all.find(item => item.system.ruleId === "sacred-symbol").system.description, /Великого Солнца/);
  assert.equal(all.find(item => item.system.ruleId === "sacred-symbol").folder, "gearFolderFamily");
  assert.deepEqual(CORE_GENERAL_ADDITIONS.map(item => [item.system.weight, item.system.price]), [[.5,25],[.1,5],[1,38],[.1,18],[1,39],[.1,12],[.1,22],[1,50],[1.5,100],[2,50],[.1,4],[.5,10],[.1,11],[1.5,24],[.1,11],[.1,13],[1,18],[10,30],[1,10],[2.5,30],[5,100],[1,8],[1,5],[2,70],[.5,50],[1.5,50]]);
  assert.equal(all.filter(item => item.system.ruleId === "alchemy.perfume").length, 1, "Perfume gear must not replace the alchemical compound");
});

test("conditional rules use existing skills; illumination and escape checks retain book thresholds", () => {
  for (const entry of Object.values(GENERAL_GEAR_RULES)) for (const modifier of entry.mechanics.modifiers ?? []) {
    assert.ok(SKILL_KEYS.includes(modifier.target.slice(7))); assert.ok(modifier.condition);
  }
  const rules = id => getGeneralGearRules({ system: { ruleId: `gear.${id}` } });
  assert.equal(rules("dice-poker-board").includedDice, 10);
  assert.deepEqual(rules("map").modifiers, [{target:"skills.wildernessSurvival",value:3,condition:"navigatingWithMap"}]);
  assert.equal(rules("warm-clothing").modifiers[0].value, 5);
  assert.deepEqual(rules("bullseye-lantern").light, {levels:3,shape:"cone",meters:5,shutter:true});
  assert.deepEqual(rules("handcuffs"), { opening:{skill:"pickLock",dc:16},breaking:{skill:"physique",dc:18} });
  assert.deepEqual(rules("shackles").attributeCaps, {speed:3});
  assert.equal(rules("shackles").opening.dc, 20); assert.equal(rules("shackles").breaking.dc, 22);
  assert.equal(rules("alcahest").ingestion.save.dc, 16);
  assert.equal(getGeneralGearRules({system:{ruleId:"sacred-symbol"}}).modifiers, undefined, "Lifepath courage belongs to the family result, not the symbol itself");
  assert.equal(getGeneralGearRules({system:{ruleId:"custom"}}), null);
});

test("p93 containers reuse nesting and count contents once; unspecific kg limits remain unset", () => {
  assert.deepEqual(Object.values(CORE_CONTAINERS).map(item => item.capacity), [20,5,25,30,15,5,0,0,0,30,50]);
  const basket = all.find(item => item.system.ruleId === "gear.basket");
  const contents = all.find(item => item.system.ruleId === "gear.loaded-dice");
  const items = [{...basket,id:"basket",system:{...basket.system,quantity:1,carried:true}}, {...contents,id:"dice",system:{...contents.system,quantity:2,containerId:"basket",carried:true}}];
  const view = inventoryContext({items,system:{}});
  assert.equal(view.weight, .7);
  const row = view.groups.find(group => group.id === "container").items[0];
  assert.equal(row.capacity, 15); assert.equal(row.children[0].id, "dice");
  assert.equal(row.contentsWeight, .2);
});

test("legacy stock enrichment is idempotent and leaves custom descriptions, prices and inventory unchanged", () => {
  const old = {type:"equipment",name:"Личный фонарь",img:"my.webp",system:{ruleId:"gear.lantern",description:"<p>Базовая книга, стр. 92–93</p>",properties:"",source:"Базовая книга, стр. 92–93",price:999,weight:2,quantity:3,containerId:"bag"}};
  apply(old, generalGearDescriptionUpdate(old));
  assert.match(old.system.description, /радиусе 3 м/);
  assert.deepEqual(generalGearDescriptionUpdate(old), {});
  assert.equal(old.system.price, 999); assert.equal(old.system.quantity, 3); assert.equal(old.system.containerId, "bag"); assert.equal(old.img, "my.webp");
  const custom = {...old,system:{...old.system,description:"<p>Заметки игрока</p>",properties:"Домашнее правило",source:"Мой мир"}};
  assert.deepEqual(generalGearDescriptionUpdate(custom), {});
  const symbol = {type:"equipment",system:{ruleId:"sacred-symbol",description:`<p>${ru.WITCHER.Equipment.SacredSymbolDescription}</p>`}};
  apply(symbol, generalGearDescriptionUpdate(symbol));
  assert.match(symbol.system.description, /Великого Солнца/);
  assert.match(symbol.system.description, /Знак веры/);
  assert.deepEqual(generalGearDescriptionUpdate(symbol), {});
  const bag = {type:"equipment",system:{ruleId:"gear.bag",capacity:25,properties:"Для небольших предметов"}};
  apply(bag, generalGearDescriptionUpdate(bag));
  assert.equal(bag.system.properties, "Для маленьких предметов"); assert.equal(bag.system.capacity, 25);
});

test("properties have explanatory tooltips, no duplicate rules in inventory, old five-item packs keep their economics", async () => {
  globalThis.foundry = {applications:{ux:{TextEditor:{implementation:{enrichHTML:async html => html}}}}};
  const item = all.find(item => item.system.ruleId === "gear.loaded-dice");
  assert.match(equipmentEntry(item).traitDetails.find(trait => trait.label.startsWith("+3")).description, /СЛ 16/);
  assert.equal((await itemPresentation(item)).properties, "");
  const custom = await itemPresentation({...item,system:{...item.system,properties:"+7 от мастера"}});
  assert.equal(custom.properties, "");
  assert.ok(custom.traits.includes("+7 от мастера"));
  globalThis.game = {user:{}};
  for (const [id,price] of [["gear.candles",5],["gear.stakes",10]]) {
    const source = CORE_GEAR.find(item => item.id === id);
    const quote = equipmentQuote({isOwner:true,system:{crowns:100}}, {...source,testUserPermission:()=>true}, 2);
    assert.equal(quote.cost, price * 2); assert.equal(quote.units, 2);
    assert.equal(getGeneralGearRules({system:{ruleId:id}}).packSize, 5);
  }
  assert.equal(generalGearContent("custom"), null);
});

test("importing old stock gear runs the same enrichment used by the live migration", async () => {
  globalThis.foundry = {documents:{Item:class {async _preCreate(){} updateSource(update){for(const [key,value] of Object.entries(update)){if(key.startsWith("system."))this.system[key.slice(7)]=value;else this[key]=value;}}}}};
  const { WitcherItem } = await import("../scripts/documents/witcher-item.mjs");
  const item = Object.assign(new WitcherItem(), {type:"equipment",img:"custom.webp",system:{ruleId:"gear.warm-clothing",kind:"gear",quantity:2,description:"<p>Базовая книга, стр. 92–93</p>"}});
  await item._preCreate({img:item.img}, {}, {});
  assert.match(item.system.description, /\+5 к Стойкости против холода/);
  assert.equal(item.system.quantity, 2); assert.equal(item.img, "custom.webp");
});
