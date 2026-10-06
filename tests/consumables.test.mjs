import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { consumableContext, consumptionPlan, potionEffectSource, toxicityState, activeDoses, potionImmunity } from "../scripts/data/consumables.mjs";
import { ALCHEMY, MUTAGENS } from "../scripts/data/workshop-alchemy.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { consumeOwnedItem, useConsumable, reconcileToxicity, endToxicityPoison, registerConsumption } from "../scripts/workshop/consumption.mjs";
import { deriveStatistics, ATTRIBUTE_KEYS } from "../scripts/data/statistics.mjs";
import { specialEquipmentDescriptionUpdate } from "../scripts/migrations/special-equipment-descriptions.mjs";

class Collection extends Array {
  get(id) { return this.find(item => item.id === id); }
  has(id) { return this.some(item => item.id === id); }
}
const set = (object, path, value) => {
  const keys = path.split("."), key = keys.pop();
  for (const entry of keys) object = object[entry] ??= {};
  object[key] = structuredClone(value);
};
const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
let serial = 0, rolls, notices, total, rolled, createFail, dialogCount, response;
function environment() {
  rolls = []; notices = []; total = 18; rolled = 0; createFail = false; dialogCount = 0; response = { application: "self" };
  globalThis.game = { user: { id: "gm" }, i18n: { localize: text => text }, time: { worldTime: 100 }, settings: { get: () => "blind" } };
  globalThis.foundry = { utils: { deepClone: structuredClone, getProperty: get, randomID: () => String(++serial) },
    applications: { ux: { TextEditor: { implementation: { enrichHTML: async text => text } } }, api: { DialogV2: { prompt: async () => { dialogCount++; await Promise.resolve(); return response; } } } },
    documents: { ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }), create: async (data, options) => { notices.push({ data, options }); return data; } } },
    dice: { Roll: class {
      constructor(formula) { this.formula = formula; }
      async evaluate(options) { rolled++; this.total = total; this.options = options; return this; }
      async toMessage(data, options) { const message = { ...data, rolls: [this], async update(patch) { Object.assign(this, patch); } }; rolls.push({ message, options }); return message; }
    } }
  };
}
function actor(race = "witcher") {
  const value = { id: "a", uuid: "Actor.a", documentName: "Actor", isOwner: true, items: new Collection(), effects: new Collection(),
    system: { details: { race, profession: race === "witcher" ? "witcher" : "bard" }, skills: { endurance: 5 }, stamina: { value: 40, max: 40 }, health: { value: 40, max: 40 }, abilityState: {},
      attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 8])), statistics: { effective: { body: 8 }, modifiers: [], stun: 8 } },
    async updateEmbeddedDocuments(type, changes) { for (const change of changes) for (const [key, field] of Object.entries(change)) if (key !== "_id") set((type === "Item" ? this.items : this.effects).get(change._id), key, field); },
    async createEmbeddedDocuments(type, sources) {
      if (createFail) throw Error("offline");
      return sources.map(source => {
        const document = structuredClone(source); document.id = document._id ?? String(++serial); document._id = document.id;
        document.toObject = () => ({ ...structuredClone(source), _id: document.id });
        if (type === "ActiveEffect") { document.statuses = new Set(document.statuses); this.effects.push(document); }
        else this.items.push(document);
        return document;
      });
    },
    async deleteEmbeddedDocuments(type, ids) { const collection = type === "Item" ? this.items : this.effects; for (const id of ids) { const index = collection.findIndex(entry => entry.id === id); if (index >= 0) collection.splice(index, 1); } },
    async update(changes) { for (const [path, field] of Object.entries(changes)) set(this, path, field); }
  };
  return value;
}
function item(owner, ruleId, quantity = 1) {
  const entry = [...ALCHEMY, ...MUTAGENS, ...WITCHER_SPECIAL_EQUIPMENT].find(item => item.id === ruleId);
  const value = { type: "equipment", name: ruleId, img: "icons/svg/item-bag.svg", flags: {}, ...structuredClone(entry), id: String(++serial),
    system: { ruleId, kind: "gear", carried: true, ...structuredClone(entry?.system), quantity, consumption: { mode: "auto", usesPerItem: 0, spentUses: 0 } }, actor: owner };
  value.uuid = `Actor.a.Item.${value.id}`;
  owner.items.push(value);
  return value;
}
test("canonical consumables reuse kinds; custom overrides, quantity and 25-use bottles survive serialization", () => {
  environment(); const owner = actor();
  for (const entry of [...ALCHEMY, ...MUTAGENS]) assert(consumableContext(item(owner, entry.id)).enabled, entry.id);
  for (const id of ["gear.rations", "gear.beer", "bomb.grapeshot", "ammunition.standard"]) {
    const value = item(owner, id); if (id.startsWith("ammunition")) value.system.kind = "ammunition";
    assert(consumableContext(value).enabled);
  }
  const rope = item(owner, "gear.rope"); assert(!consumableContext(rope).enabled);
  rope.system.consumption.mode = "consume"; assert(consumableContext(rope).enabled);
  const salt = item(owner, "alchemy.smelling-salts", 2);
  assert.equal(consumableContext(salt).remaining, 50);
  salt.system.consumption.spentUses = 24;
  assert.equal(consumableContext({ type: salt.type, system: JSON.parse(JSON.stringify(salt.system)) }).remaining, 26);
  assert.deepEqual(consumptionPlan(salt).expenses, [{ itemId: salt.id, quantity: 1 }]);
  salt.system.quantity = 0; assert.throws(() => consumptionPlan(salt));
  salt.system.quantity = 1; salt.system.carried = false; assert.throws(() => consumptionPlan(salt));
});

test("Letho's bombs spend one of three without applying poison or frost to their owner; ritual pouch is reusable", async () => {
  environment(); const owner = actor();
  for (const [ruleId, price] of [["bomb.northern-wind",177],["bomb.devils-puffball",138]]) {
    const bomb = item(owner, ruleId, 3);
    assert.equal(bomb.system.weight, 1); assert.equal(bomb.system.price, price);
    assert.equal(consumableContext(bomb).remaining, 3);
    await useConsumable(bomb);
    assert.equal(bomb.system.quantity, 2);
    assert.equal(consumableContext(bomb).remaining, 2);
    assert.equal(owner.effects.length, 0);
    assert.ok(notices.at(-1).data.content.includes(bomb.system.description));
  }
  assert.equal(rolled, 0);
  assert.equal(consumableContext(item(owner, "gear.ritual-pouch")).enabled, false);
});
test("non-witcher success spends one dose and grants its effect; DC18 uses the shared roll and private audience", async () => {
  environment(); const owner = actor("human"), potion = item(owner, "potion.swallow", 2);
  const result = await consumeOwnedItem(potion);
  assert(result.success); assert.equal(potion.system.quantity, 1); assert.equal(rolled, 1);
  assert.equal(rolls[0].message.flags[SYSTEM_ID].workshop.dc, 18);
  assert.equal(rolls[0].message.rolls[0].formula, "1d10wc + 13 + 0");
  assert.equal(rolls[0].options.messageMode, "blind"); assert.equal(notices[0].options.messageMode, "blind");
  assert.equal(activeDoses(owner).length, 1); assert.equal(toxicityState(owner).value, 50);
  assert.equal(owner.effects[0].flags[SYSTEM_ID].condition.seconds, 60);
});
test("non-witcher failure consumes potion/decoction but grants only standard poison", async () => {
  for (const ruleId of ["potion.swallow", "decoction.troll", "potion.white-honey"]) {
    environment(); total = 17; const owner = actor("elf"), potion = item(owner, ruleId);
    assert.equal((await consumeOwnedItem(potion)).success, false);
    assert.equal(potion.system.quantity, 0); assert.equal(activeDoses(owner).length, 0);
    assert(owner.effects[0].statuses.has("poisoned")); assert.equal(owner.effects[0].flags[SYSTEM_ID].condition.save.dc, 15);
  }
});
test("a witcher needs no initial check; duplicate doses keep their toxicity/timers without stacking benefits", async () => {
  environment(); const owner = actor(), potion = item(owner, "potion.petri", 2);
  await consumeOwnedItem(potion); await consumeOwnedItem(potion);
  assert.equal(rolled, 0); assert.equal(activeDoses(owner).length, 2); assert.equal(toxicityState(owner).value, 150);
  const stats = deriveStatistics(owner.system, { effects: owner.effects });
  assert.equal(stats.skillBonuses.spellCasting, 2);
  assert.equal(stats.skillBonuses.hexWeaving, 2);
  const poison = owner.effects.find(effect => effect.flags[SYSTEM_ID].toxicity);
  assert(poison); assert.equal(poison.flags[SYSTEM_ID].condition.save.dc, 18);
  const last = activeDoses(owner).at(-1).id;
  await endToxicityPoison(owner, poison);
  assert(!owner.effects.has(last)); assert.equal(toxicityState(owner).value, 75);
  assert(!owner.effects.some(effect => effect.statuses.has("poisoned")));
});
test("toxicity limit includes Iron Stomach, removes only toxicity poison on expiry, and ignores disabled/expired doses", async () => {
  environment(); const owner = actor(), rank = item(owner, "profession.witcher.iron-stomach"); rank.type = "ability";
  for (const [level, expected] of [[0,100],[1,105],[2,105],[3,110],[8,120],[9,125],[10,150]]) { rank.system.level = level; assert.equal(toxicityState(owner).limit, expected); }
  rank.system.level = 0;
  await consumeOwnedItem(item(owner, "potion.petri")); await consumeOwnedItem(item(owner, "potion.swallow"));
  assert(owner.effects.some(effect => effect.flags[SYSTEM_ID].toxicity));
  const dose = activeDoses(owner)[0]; dose.duration.expired = true;
  await reconcileToxicity(owner);
  assert(!owner.effects.some(effect => effect.statuses.has("poisoned")));
  assert.equal(toxicityState(owner).value, 50);
  activeDoses(owner)[0].disabled = true; assert.equal(toxicityState(owner).value, 0);
});
test("White Honey removes active witcher doses and toxicity poison; Golden Oriole cures and blocks poison", async () => {
  environment(); const owner = actor();
  await consumeOwnedItem(item(owner, "potion.swallow")); await consumeOwnedItem(item(owner, "decoction.troll"));
  await consumeOwnedItem(item(owner, "potion.white-honey")); assert.equal(owner.effects.length, 0); assert.equal(toxicityState(owner).value, 0);
  await consumeOwnedItem(item(owner, "potion.golden-oriole")); assert(potionImmunity(owner, ["poisoned"]));
  await consumeOwnedItem(item(owner, "decoction.troll")); assert(!owner.effects.some(effect => effect.statuses.has("poisoned")));
});
test("effects and used bottle doses roll back on write failure; cancelled rolls and lack of ownership spend nothing", async () => {
  environment(); const owner = actor("human"), potion = item(owner, "potion.swallow");
  createFail = true; await assert.rejects(consumeOwnedItem(potion), /offline/);
  assert.equal(potion.system.quantity, 1); assert.equal(potion.system.consumption.spentUses, 0); assert.equal(owner.effects.length, 0);
  createFail = false; foundry.dice.Roll.prototype.evaluate = async () => { throw Error("cancelled"); };
  await assert.rejects(consumeOwnedItem(potion), /cancelled/); assert.equal(potion.system.quantity, 1);
  owner.isOwner = false; await consumeOwnedItem(potion); assert.equal(potion.system.quantity, 1);
});
test("salt consumes one of 25 uses; food consumes a unit; two immediate clicks share one use dialog", async () => {
  environment(); const owner = actor(), salt = item(owner, "alchemy.smelling-salts");
  await consumeOwnedItem(salt); assert.equal(salt.system.quantity, 1); assert.equal(consumableContext(salt).remaining, 24);
  const food = item(owner, "gear.rations", 2); await consumeOwnedItem(food); assert.equal(food.system.quantity, 1);
  const potion = item(owner, "potion.swallow", 2);
  const one = useConsumable(potion), two = useConsumable(potion); assert.equal(one, two); await one;
  assert.equal(dialogCount, 1); assert.equal(potion.system.quantity, 1);
  response = null; await useConsumable(potion); assert.equal(potion.system.quantity, 1);
});
test("harmful substances can be expended for another target without poisoning the user; own use checks resistance first", async () => {
  environment(); const owner = actor(), venom = item(owner, "alchemy.black-venom", 3);
  await consumeOwnedItem(venom, { apply: false }); assert.equal(owner.effects.length, 0); assert.equal(rolled, 0);
  total = 16; await consumeOwnedItem(venom, { effectKey: "black-venom" }); assert.equal(owner.effects.length, 0);
  total = 15; await consumeOwnedItem(venom, { effectKey: "black-venom" }); assert.equal(owner.effects.length, 1);
  assert.equal(owner.effects[0].flags[SYSTEM_ID].condition.save.dc, 16); assert.equal(venom.system.quantity, 0);
});
test("potion damage and recovery modifiers use shared statistics and stop with the effect", async () => {
  environment(); const owner = actor();
  await consumeOwnedItem(item(owner, "potion.tawny-owl")); await consumeOwnedItem(item(owner, "potion.thunderbolt"));
  const stats = deriveStatistics(owner.system, { effects: owner.effects });
  assert.equal(stats.recovery, 10); assert.equal(stats.physicalDamageBonus, 3);
  for (const effect of owner.effects) effect.disabled = true;
  const after = deriveStatistics(owner.system, { effects: owner.effects }); assert.equal(after.recovery, 8); assert.equal(after.physicalDamageBonus, 0);
  await consumeOwnedItem(item(owner, "decoction.fiend"));
  assert.equal(deriveStatistics(owner.system, { effects: owner.effects }).carryMax, 160);
});
test("a plain chloroform d10 never explodes or spends Luck; only the failed initial save applies unconsciousness", async () => {
  environment(); const owner = actor(), bottle = item(owner, "alchemy.chloroform");
  total = 5; await consumeOwnedItem(bottle, { effectKey: "chloroform" }); assert.equal(owner.effects.length, 0);
  total = 6; await consumeOwnedItem(bottle, { effectKey: "chloroform" }); assert.equal(owner.effects.length, 1);
  assert(rolls.every(({ message }) => message.rolls[0].formula === "1d10" && message.flags[SYSTEM_ID].skipLuck));
  assert.equal(consumableContext(bottle).remaining, 23);
});
test("White Honey does not cure unrelated poisoning or remove another magical condition", async () => {
  environment(); const owner = actor(); total = 2;
  await consumeOwnedItem(item(owner, "alchemy.black-venom"), { effectKey: "black-venom" });
  await consumeOwnedItem(item(owner, "potion.swallow")); await consumeOwnedItem(item(owner, "decoction.troll"));
  assert.equal(owner.effects.filter(effect => effect.statuses.has("poisoned")).length, 2);
  await consumeOwnedItem(item(owner, "potion.white-honey"));
  assert.equal(owner.effects.length, 1); assert.equal(owner.effects[0].flags[SYSTEM_ID].condition.key, "black-venom");
});
test("unsupported oil/mutagen direct consumption cannot bypass their installation rules", async () => {
  environment(); const owner = actor();
  for (const id of ["oil.necrophage", "mutagen.troll"]) {
    const value = item(owner, id);
    await assert.rejects(consumeOwnedItem(value), /применения мутагена/);
    assert.equal(value.system.quantity, 1);
  }
});
test("Perfume toxicity follows its timed effect; White Honey neutralizes toxicity without curing drunkenness", async () => {
  environment(); const owner = actor(); total = 3;
  await consumeOwnedItem(item(owner, "alchemy.perfume"), { effectKey: "perfume" });
  assert.equal(toxicityState(owner).value, 25);
  await consumeOwnedItem(item(owner, "potion.white-honey"));
  assert.equal(toxicityState(owner).value, 0);
  assert.equal(owner.effects.length, 1); assert(owner.effects[0].statuses.has("intoxicated"));
  await consumeOwnedItem(item(owner, "alchemy.wives-tears")); assert.equal(owner.effects.length, 0);
});
test("Fisstech below 10 applies five-round unconsciousness and rolls addiction separately", async () => {
  environment(); const owner = actor(); total = 9;
  await consumeOwnedItem(item(owner, "alchemy.fisstech"), { effectKey: "fisstech" });
  assert.equal(owner.effects.length, 2);
  assert.equal(owner.effects.find(effect => effect.statuses.has("fisstech-unconscious")).flags[SYSTEM_ID].condition.rounds, 5);
  assert.deepEqual(rolls.map(({message}) => message.flags[SYSTEM_ID].workshop.dc), [16,18]);
});
test("medallion cleanup removes only the shipped Geralt sentence, preserving custom prose", () => {
  const source = WITCHER_SPECIAL_EQUIPMENT.find(item => item.id === "gear.witcher-medallion");
  assert(!source.system.description.includes("Геральта"));
  const legacy = { system: { ruleId: source.id, description: "<p>Подвеска. У Геральта — медальон школы Волка.</p><p>Моя гравировка.</p>" } };
  assert.equal(specialEquipmentDescriptionUpdate(legacy)["system.description"], "<p>Подвеска.</p><p>Моя гравировка.</p>");
});

test("100% is safe on intake; established toxicity poisoning persists until below the limit", async () => {
  environment(); const owner = actor(), swallow = item(owner, "potion.swallow", 2);
  await consumeOwnedItem(swallow); await consumeOwnedItem(swallow);
  assert.equal(toxicityState(owner).value, 100); assert.equal(toxicityState(owner).poisoned, false);
  await consumeOwnedItem(item(owner, "potion.cat"));
  assert.equal(toxicityState(owner).poisoned, true);
  const cat = activeDoses(owner).find(effect => effect.flags[SYSTEM_ID].consumable.ruleId === "potion.cat");
  cat.disabled = true; await reconcileToxicity(owner);
  assert.equal(toxicityState(owner).value, 100); assert.equal(toxicityState(owner).poisoned, true);
  activeDoses(owner)[0].duration.expired = true; await reconcileToxicity(owner);
  assert.equal(toxicityState(owner).value, 50); assert.equal(toxicityState(owner).poisoned, false);
});

function consumptionHooks() {
  const hooks = new Map();
  globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
  game.users = { activeGM: game.user };
  registerConsumption();
  return hooks;
}

test("dose creation and reactivation reconcile toxicity; editing a timer cannot undo a successful save", async () => {
  environment(); const hooks = consumptionHooks(), owner = actor();
  const potion = item(owner, "potion.petri");
  const doses = await owner.createEmbeddedDocuments("ActiveEffect", [1,2,3].map(sort => ({...potionEffectSource(potion),sort})));
  doses.forEach(effect => { effect.parent = owner; });
  await hooks.get("createActiveEffect")(doses[2], {});
  assert.equal(toxicityState(owner).poisoned, true);
  await endToxicityPoison(owner, owner.effects.find(effect => effect.flags[SYSTEM_ID].toxicity));
  await hooks.get("deleteActiveEffect")(doses[2]);
  assert.equal(toxicityState(owner).value, 150); assert.equal(toxicityState(owner).poisoned, false);
  await hooks.get("updateActiveEffect")(doses[0], {duration:{value:60}});
  assert.equal(toxicityState(owner).poisoned, false);
  doses[0].disabled = true; await hooks.get("updateActiveEffect")(doses[0], {disabled:true});
  assert.equal(toxicityState(owner).value, 75);
  doses[0].disabled = false; await hooks.get("updateActiveEffect")(doses[0], {disabled:false});
  assert.equal(toxicityState(owner).poisoned, true);
  doses[0].duration.expired = true; await hooks.get("updateActiveEffect")(doses[0], {duration:{expired:true}});
  assert.equal(toxicityState(owner).poisoned, false);
});

test("changing Iron Stomach updates poison as well as the displayed limit; other clients do not write", async () => {
  environment(); const hooks = consumptionHooks(), owner = actor();
  await consumeOwnedItem(item(owner, "potion.petri", 1)); await consumeOwnedItem(item(owner, "potion.swallow", 1));
  const ability = item(owner, "profession.witcher.iron-stomach"); ability.type = "ability"; ability.parent = owner;
  ability.system.level = 10;
  await hooks.get("updateItem")(ability, {"system.level":10});
  assert.equal(toxicityState(owner).limit, 150); assert.equal(toxicityState(owner).poisoned, false);
  ability.system.level = 0;
  game.user = {id:"other"};
  await hooks.get("updateItem")(ability, {"system.level":0}); assert.equal(toxicityState(owner).poisoned, false);
  game.user = game.users.activeGM;
  await hooks.get("updateItem")(ability, {name:"Мой желудок"}); assert.equal(toxicityState(owner).poisoned, false);
  await hooks.get("deleteItem")(ability); assert.equal(toxicityState(owner).poisoned, true);
});
