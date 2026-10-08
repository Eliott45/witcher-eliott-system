import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { rollExchangeLocation, rollExchangeDamage, exchangeRowHTML, damagePreview, applyExchangeDamage, defendAttack, defenseChoices, applyCreatureBite } from "../scripts/combat/attack-exchange.mjs";

const exchange = message => message.flags[SYSTEM_ID].exchange;

function fixture(t, { location = "random", totals = [12], category = "humanoid", results = [1, 8] } = {}) {
  const previous = Object.fromEntries(["game", "canvas", "foundry", "Hooks"].map(key => [key, globalThis[key]]));
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  delete globalThis.Hooks;
  const items = Object.assign([], { get: () => undefined });
  const actor = { id: "attacker", name: "Атакующий", type: "character", isOwner: true, items };
  const target = { name: "Цель", type: "npc", isOwner: true, items, system: { creature: { category, naturalArmor: 0 } } };
  const attack = { itemId: "sword", name: "Меч", location, damage: "2d6+2", count: totals.length, target: "Scene.scene.Token.target" };
  const message = { id: "attack", isContentVisible: true, speakerActor: actor, blind: false, whisper: ["player"],
    rolls: totals.map(total => ({ total })), flags: { [SYSTEM_ID]: { weaponAttack: attack } } };
  const messages = [message, ...totals.map((_total, index) => ({ id: `defense-${index}`,
    flags: { [SYSTEM_ID]: { exchange: { attack: message.id, index, kind: "defense", none: true } } } }))];
  const evaluated = [], pending = [...results];
  class Roll {
    constructor(formula) { this.formula = formula; this.dice = formula === "0" ? [] : [{}]; }
    async evaluate(options) {
      evaluated.push({ formula: this.formula, options });
      this.total = this.formula === "0" ? 0 : pending.shift();
      assert.notEqual(this.total, undefined, `Unexpected extra roll: ${this.formula}`);
      return this;
    }
  }
  globalThis.game = { messages };
  globalThis.canvas = { scene: { tokens: [{ uuid: attack.target, actor: target }] } };
  globalThis.foundry = { dice: { Roll }, documents: { ChatMessage: {
    getSpeaker: ({ actor: speaker }) => ({ actor: speaker.id }),
    implementation: { async create(data) {
      const created = { ...data, id: `step-${messages.length}`, timestamp: Date.now() };
      messages.push(created); return created;
    } }
  } } };
  return { message, attack, actor, target, messages, evaluated, pending };
}

test("ablating and double equipment damage wear armor even when it stops the blow, applied once",async t=>{
  const f=fixture(t,{location:"torso",results:[8,2]});
  f.target.effects=[]; f.target.system.health={value:50,max:50}; f.target.system.creature.naturalArmor=10;
  f.target.update=async changes=>{for(const [path,value] of Object.entries(changes)){const keys=path.split('.');let owner=f.target;for(const key of keys.slice(0,-1))owner=owner[key]??={};owner[keys.at(-1)]=value;}};
  f.attack.hitTraits={ablating:true,wearMultiplier:2,poisoned:100};
  game.settings={get:()=>"public"}; game.users={};
  foundry.documents.ChatMessage.implementation.applyMode=data=>data;
  await rollExchangeDamage(f.message,0);
  const preview=damagePreview(f.message,0);assert.equal(preview.result.total,0);assert.equal(preview.result.wear,4);
  await Promise.all([applyExchangeDamage(f.message,0),applyExchangeDamage(f.message,0)]);
  assert.equal(f.target.system.creature.naturalArmor,6);assert.equal(f.target.system.health.value,50);
  assert.equal(f.messages.filter(message=>exchange(message)?.kind==="applied").length,1);
  assert.deepEqual(exchange(f.messages.at(-1)).effects,[],"poison does not pass through intact armor");
  assert.deepEqual(f.messages.at(-1).whisper, f.message.whisper);
});

test("defense retains the invisible katakan penalty after it has revealed, and forbidden parry is rejected",async t=>{
  const f=fixture(t,{results:[18]});f.messages.pop();
  f.attack.attackingInvisible=true;f.actor.system={creature:{invisible:false}};
  f.target.effects=[];Object.assign(f.target.system,{skills:{dodgeEscape:6},statistics:{effective:{reflex:8,speed:6},modifiers:[]},stamina:{value:30,max:30}});
  f.target.getFlag=()=>null;game.settings={get:()=>"public"};
  foundry.dice.Roll.prototype.toMessage=async function(data){return foundry.documents.ChatMessage.implementation.create({...data,rolls:[this]});};
  await defendAttack(f.message,0,"dodge");
  assert.equal(f.evaluated[0].formula,"1d10wc + 11");
  f.messages.pop();f.attack.hitTraits={noParry:true};
  await assert.rejects(defendAttack(f.message,0,"parry"),/нельзя парировать/);
});

test("a cat sees an invisible katakan and defends without its invisibility penalty", async t => {
  const f = fixture(t, { results: [18] }); f.messages.pop();
  f.attack.attackingInvisible = true;
  f.target.items.push({ type: "ability", system: { ruleId: "creature.cat.magic-sense" } });
  f.target.effects = [];
  Object.assign(f.target.system, { skills: { dodgeEscape: 6 }, statistics: { effective: { reflex: 8, speed: 6 }, modifiers: [] }, stamina: { value: 30, max: 30 } });
  f.target.getFlag = () => null; game.settings = { get: () => "public" };
  foundry.dice.Roll.prototype.toMessage = async function(data) { return foundry.documents.ChatMessage.implementation.create({ ...data, rolls: [this] }); };
  await defendAttack(f.message, 0, "dodge");
  assert.equal(f.evaluated[0].formula, "1d10wc + 14");
});

test("a wraith can Slip instead of a restricted defense, but not against an indefensible attack", async t => {
  const f = fixture(t, { results: [18] }); f.messages.pop();
  f.target.items.push({ type: "ability", system: { ruleId: "creature.slip" } });
  f.target.effects = [];
  Object.assign(f.target.system, { skills: { spellCasting: 6 }, statistics: { effective: { will: 8, speed: 6 }, modifiers: [] }, stamina: { value: 30, max: 30 } });
  f.target.getFlag = () => null; game.settings = { get: () => "public" };
  foundry.dice.Roll.prototype.toMessage = async function(data) { return foundry.documents.ChatMessage.implementation.create({ ...data, rolls: [this] }); };
  f.target.createEmbeddedDocuments = async (_type, effects) => f.target.effects.push(...effects);
  foundry.documents.ActiveEffect = { getEffectStart: () => ({}) };
  assert.deepEqual(defenseChoices(f.target, "melee", 0, ["resist"]).map(row => row.mode), ["resist", "slip"]);
  assert.deepEqual(defenseChoices(f.target, "melee", 0, []), []);
  f.attack.defenses = [];
  await assert.rejects(defendAttack(f.message, 0, "slip"), /не подходит/);
  f.attack.defenses = ["resist"];
  await defendAttack(f.message, 0, "slip");
  assert.equal(f.evaluated[0].formula, "1d10wc + 14");
  assert.ok(f.target.effects.some(effect => effect.statuses.includes("creature-slip")));
});

test("the active GM transfers blood after player-applied damage, including a living shield, only once", async t => {
  const f = fixture(t);
  const bite = { id: "bite", name: "Укус", system: { natural: true } };
  f.actor.items = Object.assign([bite, { type: "ability", system: { ruleId: "creature.katakan.blood" } }], { get: id => id === "bite" ? bite : null });
  f.actor.effects = []; f.actor.system = { creature: {} };
  f.attack.itemId = "bite";
  f.target.effects = [{ name: "Опьянение", uuid: "Effect.drunk", statuses: new Set(["intoxicated"]), flags: {} }];
  game.messages.get = id => f.messages.find(message => message.id === id);
  game.users = { activeGM: { isSelf: false } }; game.settings = { get: () => "public" };
  foundry.documents.ChatMessage.create = foundry.documents.ChatMessage.implementation.create;
  foundry.documents.ChatMessage.applyMode = data => data;
  f.actor.createEmbeddedDocuments = async (_type, effects) => {
    assert.equal(game.users.activeGM.isSelf, true);
    f.actor.effects.push(...effects);
  };
  const link = { attack: f.message.id, index: 0, kind: "applied", total: 5, penetrated: true };
  const applied = { id: "receipt", flags: { [SYSTEM_ID]: { exchange: link } }, async update(patch) {
    if (patch[`flags.${SYSTEM_ID}.exchange.biteApplied`]) link.biteApplied = true;
  } };
  await applyCreatureBite(applied); assert.equal(f.actor.effects.length, 0);
  game.users.activeGM.isSelf = true;
  await Promise.all([applyCreatureBite(applied), applyCreatureBite(applied)]);
  assert.equal(f.actor.effects.length, 1); assert.equal(link.biteApplied, true);
  await applyCreatureBite(applied); assert.equal(f.actor.effects.length, 1);

  const before = globalThis.fromUuidSync; t.after(() => { if (before === undefined) delete globalThis.fromUuidSync; else globalThis.fromUuidSync = before; });
  const shield = { effects: [{ name: "Галлюцинации", uuid: "Effect.hallucinating", statuses: new Set(["hallucinating"]), flags: {} }] };
  globalThis.fromUuidSync = uuid => uuid === "Token.shield" ? { actor: shield } : null;
  applied.id = "shield-receipt"; delete link.biteApplied;
  link.total = 0; link.penetrated = false;
  link.shield = { token: "Token.shield", total: 4, penetrated: true, applied: false };
  await applyCreatureBite(applied); assert.equal(f.actor.effects.length, 1, "wait for the shield's own damage");
  link.shield.applied = true;
  await applyCreatureBite(applied); assert.equal(f.actor.effects.length, 2);
  assert.equal(f.actor.effects.at(-1).name, "Выпитая кровь: Галлюцинации");
});

test("a hit asks for its location first, then damage uses the saved zone without another d10", async t => {
  const f = fixture(t);
  assert.match(exchangeRowHTML(f.message, 0), /data-exchange-location/);
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /data-exchange-damage/);
  assert.equal(await rollExchangeDamage(f.message, 0), undefined);
  assert.equal(f.evaluated.length, 0, "damage cannot bypass the location step");

  const location = await rollExchangeLocation(f.message, 0);
  assert.deepEqual(exchange(location), { attack: "attack", index: 0, kind: "location", result: 1, bodyPlan: "humanoid",
    location: { id: "head", name: "Голова", multiplier: 3 } });
  assert.equal(location.flags[SYSTEM_ID].skipLuck, true);
  assert.deepEqual(location.whisper, f.message.whisper);
  assert.match(exchangeRowHTML(f.message, 0), /1d10: <b>1<\/b> → <b>Голова<\/b>/);
  assert.match(exchangeRowHTML(f.message, 0), /data-exchange-damage/);
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /data-exchange-location/);

  const damage = await rollExchangeDamage(f.message, 0);
  assert.deepEqual(exchange(damage).location, exchange(location).location);
  assert.deepEqual(damage.whisper, f.message.whisper);
  assert.deepEqual(f.evaluated.map(row => row.formula), ["1d10", "2d6+2"]);
  assert.equal(damagePreview(f.message, 0).result.total, 24, "saved head multiplier is used after armor");
  await rollExchangeLocation(f.message, 0); await rollExchangeDamage(f.message, 0);
  assert.equal(f.evaluated.length, 2, "completed steps cannot be repeated");
});

test("each NPC strike has an independent location using the target's body plan", async t => {
  const f = fixture(t, { totals: [12, 13], category: "necrophage", results: [5, 10, 8, 8] });
  f.actor.type = "npc";
  f.target.system.creature.hasTailOrWings = true;
  const first = await rollExchangeLocation(f.message, 0);
  const second = await rollExchangeLocation(f.message, 1);
  assert.equal(exchange(first).location.id, "torso", "5 is torso on the monster table");
  assert.equal(exchange(second).location.id, "tail");
  assert.equal(exchange(second).bodyPlan, "monster");
  assert.equal(exchange(await rollExchangeDamage(f.message, 0)).location.id, "torso");
  assert.equal(exchange(await rollExchangeDamage(f.message, 1)).location.id, "tail");
});

test("a monster without tail or wings takes a ten in its left limb, persisted through damage", async t => {
  const f = fixture(t, { category: "necrophage", results: [10, 8] });
  const location = await rollExchangeLocation(f.message, 0);
  assert.equal(exchange(location).location.id, "leftArm");
  assert.equal(exchange(location).location.multiplier, 0.5);
  assert.match(exchangeRowHTML(f.message, 0), /Левая рука \/ конечность/);
  f.target.system.creature.hasTailOrWings = true;
  const damage = await rollExchangeDamage(f.message, 0);
  assert.equal(exchange(damage).location.id, "leftArm", "anatomy edits cannot change an already rolled location");
  assert.equal(damagePreview(f.message, 0).armor.zone, "torso");
  assert.equal(damagePreview(f.message, 0).result.total, 2, "steel is halved against this monster, then halved for the limb");
});

test("aimed attacks skip the random location step and keep their critical table", async t => {
  const f = fixture(t, { location: "head", totals: [17], results: [8, 4] });
  assert.equal(await rollExchangeLocation(f.message, 0), undefined);
  assert.match(exchangeRowHTML(f.message, 0), /data-exchange-damage/);
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /data-exchange-location/);
  const damage = await rollExchangeDamage(f.message, 0);
  assert.equal(exchange(damage).location.id, "head");
  assert.equal(exchange(damage).critical.aimed, true);
  assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "1d6"]);
});

test("a randomly rolled head retains an unaimed critical; blind rolls keep their audience", async t => {
  const f = fixture(t, { totals: [17], results: [1, 8, 7] });
  f.message.blind = true; f.message.whisper = ["gm"];
  const location = await rollExchangeLocation(f.message, 0);
  const damage = await rollExchangeDamage(f.message, 0);
  assert.equal(exchange(damage).critical.aimed, false);
  assert.deepEqual(f.evaluated.map(row => row.formula), ["1d10", "2d6+2", "2d6"]);
  for (const step of [location, damage]) {
    assert.equal(step.blind, true); assert.deepEqual(step.whisper, ["gm"]);
  }
  assert.ok(f.evaluated.every(row => row.options.allowInteractive === false));
});

test("misses, unresolved defenses, invisible attacks and non-owners cannot roll follow-up steps", async t => {
  const f = fixture(t, { totals: [10] });
  const cannotRoll = async () => {
    assert.equal(await rollExchangeLocation(f.message, 0), undefined);
    assert.equal(await rollExchangeDamage(f.message, 0), undefined);
    assert.equal(f.evaluated.length, 0);
  };
  await cannotRoll();
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /data-exchange-(location|damage)/);
  f.message.rolls[0].total = 12;
  f.actor.isOwner = false; await cannotRoll();
  assert.match(exchangeRowHTML(f.message, 0), /Ждём бросок места попадания/);
  f.actor.isOwner = true; f.message.isContentVisible = false; await cannotRoll();
  f.message.isContentVisible = true; f.messages.pop(); await cannotRoll();
});

test("location animation hides its result and delays damage until the dice have settled", async t => {
  const f = fixture(t);
  const location = await rollExchangeLocation(f.message, 0);
  location._dice3danimating = true;
  assert.match(exchangeRowHTML(f.message, 0), /Бросается место попадания/);
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /Голова|data-exchange-damage/);
  assert.equal(await rollExchangeDamage(f.message, 0), undefined);
  location._witcherSettled = true;
  assert.match(exchangeRowHTML(f.message, 0), /data-exchange-damage/);
  assert.ok(await rollExchangeDamage(f.message, 0));
});

test("double clicks roll only once and failed creation allows retry", async t => {
  const f = fixture(t, { results: [1, 8, 5] });
  const locations = await Promise.all([rollExchangeLocation(f.message, 0), rollExchangeLocation(f.message, 0)]);
  assert.equal(locations.filter(Boolean).length, 1);
  const create = foundry.documents.ChatMessage.implementation.create;
  foundry.documents.ChatMessage.implementation.create = async () => { throw new Error("offline"); };
  await assert.rejects(rollExchangeDamage(f.message, 0), /offline/);
  foundry.documents.ChatMessage.implementation.create = create;
  const damage = await Promise.all([rollExchangeDamage(f.message, 0), rollExchangeDamage(f.message, 0)]);
  assert.equal(damage.filter(Boolean).length, 1);
  assert.equal(exchange(damage.find(Boolean)).location.id, "head");
});

test("older chat damage and pre-rolled location snapshots remain usable", async t => {
  const f = fixture(t, { location: "head", totals: [17], results: [8, 7] });
  f.attack.locationRoll = 1;
  const damage = await rollExchangeDamage(f.message, 0);
  assert.equal(exchange(damage).critical.aimed, false, "an older random roll was not an aimed attack");
  f.attack.location = "random";
  assert.match(exchangeRowHTML(f.message, 0), /witcher-exchange-damage/);
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /data-exchange-location/);
  assert.equal(await rollExchangeLocation(f.message, 0), undefined);
});

test("a hit on a fitted prosthesis deals no damage to its owner", async t => {
  const f = fixture(t, { category: "necrophage", results: [10, 8] });
  await rollExchangeLocation(f.message, 0);
  await rollExchangeDamage(f.message, 0);
  assert.ok(damagePreview(f.message, 0).result.total > 0);
  const prosthesis = { id: "leg", name: "Качественный протез", system: { ruleId: "gear.quality-prosthesis", quantity: 1, equipped: true } };
  f.target.items = Object.assign([prosthesis], { get: id => id === "leg" ? prosthesis : undefined });
  f.target.effects = [{ id: "wound", disabled: false, flags: { [SYSTEM_ID]: { criticalWound: { id: "dismembered-arm", arm: "leftArm", prosthesis: { itemId: "leg", quality: "quality" } } } } }];
  const preview = damagePreview(f.message, 0);
  assert.equal(preview.result.total, 0);
  assert.deepEqual(preview.prosthesis, { effectId: "wound", itemId: "leg", name: "Качественный протез" });
  assert.match(preview.result.steps.at(-1).label, /протез/);
});
