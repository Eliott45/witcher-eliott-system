import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { rollExchangeLocation, rollExchangeDamage, exchangeRowHTML, damagePreview, applyExchangeDamage, defendAttack, defenseChoices, applyCreatureBite, applyShieldShare } from "../scripts/combat/attack-exchange.mjs";
import { thrownWeaponPlan } from "../scripts/combat/thrown-weapons.mjs";
import { experimentalFrozen } from "../scripts/combat/experimental-effects.mjs";

const exchange = message => message.flags[SYSTEM_ID].exchange;
const put = (object, path, value) => { const keys = path.split("."); for (const key of keys.slice(0, -1)) object = object[key] ??= {}; object[keys.at(-1)] = value; };

function mutableTarget(f, health = 50) {
  f.target.uuid ??= "Actor.target";
  f.target.effects = []; f.target.system.health = { value: health, max: health };
  f.target.update = async changes => { for (const [path, value] of Object.entries(changes)) put(f.target, path, value); };
  f.target.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "ActiveEffect"); f.target.effects.splice(0, f.target.effects.length, ...f.target.effects.filter(effect => !ids.includes(effect.id)));
  };
  game.settings = { get: () => "public" }; game.users = {};
  foundry.documents.ChatMessage.implementation.applyMode = data => data;
}

function livingShield(t, f, { body = 20, owner = true } = {}) {
  const previous = globalThis.fromUuidSync;
  t.after(() => { if (previous === undefined) delete globalThis.fromUuidSync; else globalThis.fromUuidSync = previous; });
  const actor = { id: "shield", uuid: "Actor.shield", name: "Живой щит", type: "npc", isOwner: owner,
    items: Object.assign([], { get: () => undefined }), system: { statistics: { effective: { body } }, creature: { category: "humanoid", naturalArmor: 0 } } };
  mutableTarget({ target: actor });
  const token = { uuid: "Scene.scene.Token.shield", name: actor.name, actor };
  globalThis.fromUuidSync = uuid => uuid === token.uuid ? token : previous?.(uuid);
  f.target.effects.push({ id: "hold", statuses: new Set(["grappling"]), flags: { [SYSTEM_ID]: { grapple: { target: token.uuid } } } });
  return actor;
}
const iceEffect = id => ({ id, statuses: new Set(["experimental-freeze"]), flags: { [SYSTEM_ID]: { experimental: { kind: "freeze" } } } });

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

test("an unaimed critical skips the 1d10 location: the wound names the part struck; blind rolls keep their audience", async t => {
  const f = fixture(t, { totals: [17], results: [8, 3, 2] });
  f.message.blind = true; f.message.whisper = ["gm"];
  assert.equal(await rollExchangeLocation(f.message, 0), undefined);
  assert.doesNotMatch(exchangeRowHTML(f.message, 0), /data-exchange-location/);
  assert.match(exchangeRowHTML(f.message, 0), /место попадания определит рана[\s\S]*data-exchange-damage/);
  const damage = await rollExchangeDamage(f.message, 0);
  assert.equal(exchange(damage).critical.aimed, false);
  // 2d6 = 3 on the light table is a sprained leg, so the blow lands in a leg; 1d2 = 2 picks the left one.
  assert.equal(exchange(damage).critical.wound.id, "sprained-leg");
  assert.deepEqual(exchange(damage).location, { id: "leftLeg", name: "Левая нога", multiplier: 0.5 });
  assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "2d6", "1d2"]);
  assert.equal(damage.blind, true); assert.deepEqual(damage.whisper, ["gm"]);
  assert.ok(f.evaluated.every(row => row.options.allowInteractive === false));
});

test("an unaimed critical on the head or torso rolls no side, and a monster's leg wound strikes a limb", async t => {
  const head = fixture(t, { totals: [17], results: [8, 11] });
  assert.equal(exchange(await rollExchangeDamage(head.message, 0)).location.id, "head");
  assert.deepEqual(head.evaluated.map(row => row.formula), ["2d6+2", "2d6"]);
  const monster = fixture(t, { totals: [17], category: "necrophage", results: [8, 2, 1] });
  const damage = exchange(await rollExchangeDamage(monster.message, 0));
  assert.equal(damage.critical.wound.id, "sprained-leg");
  assert.equal(damage.location.id, "rightArm");
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

test("alchemical freeze adds 2d6 before armor, breaks on application, and leaves ordinary freezing alone", async t => {
  const f = fixture(t, { location: "torso", totals: [12, 12], results: [8, 7, 8] }); mutableTarget(f);
  f.target.system.creature.naturalArmor = 10;
  const ordinary = { id: "ordinary-freeze", statuses: new Set(["frozen"]), flags: {} };
  f.target.effects.push(ordinary, { id: "alchemy-freeze", statuses: new Set(["experimental-freeze"]), flags: { [SYSTEM_ID]: { experimental: { kind: "freeze" } } } });
  const first = exchange(await rollExchangeDamage(f.message, 0));
  assert.deepEqual(first.extras, [{ label: "Алхимическое замораживание", value: 7, freeze: [{ actor: f.target.uuid, effectId: "alchemy-freeze" }] }]);
  assert.equal(experimentalFrozen(f.target), true, "rolling damage does not apply it yet");
  assert.equal(damagePreview(f.message, 0).result.total, 5);
  await applyExchangeDamage(f.message, 0); await applyExchangeDamage(f.message, 0);
  assert.equal(f.target.system.health.value, 45); assert.equal(f.target.system.creature.naturalArmor, 9);
  assert.equal(experimentalFrozen(f.target), false); assert.deepEqual(f.target.effects, [ordinary]);
  const second = exchange(await rollExchangeDamage(f.message, 1));
  assert.deepEqual(second.extras, []); assert.equal(damagePreview(f.message, 1).result.total, 0);
  await applyExchangeDamage(f.message, 1); assert.equal(f.target.system.health.value, 45);
  assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "2d6", "2d6+2"]);
});

test("two pending damage cards cannot both consume the same alchemical ice", async t => {
  const f = fixture(t, { location: "torso", totals: [12, 12], results: [8, 7, 8, 6] }); mutableTarget(f);
  f.target.effects.push({ id: "one-ice", statuses: new Set(["experimental-freeze"]), flags: { [SYSTEM_ID]: { experimental: { kind: "freeze" } } } });
  await rollExchangeDamage(f.message, 0); await rollExchangeDamage(f.message, 1);
  assert.equal(damagePreview(f.message, 0).result.total, 15);
  await applyExchangeDamage(f.message, 0); assert.equal(f.target.system.health.value, 35);
  assert.equal(damagePreview(f.message, 1).result.total, 8, "the earlier applied hit has already shattered this ice");
  await applyExchangeDamage(f.message, 1); assert.equal(f.target.system.health.value, 27);
});

test("a failed health write leaves the alchemical ice available for the same hit's retry", async t => {
  const f = fixture(t, { location: "torso", results: [8, 7] }); mutableTarget(f);
  f.target.effects.push(iceEffect("ice")); await rollExchangeDamage(f.message, 0);
  const update = f.target.update; let fail = true;
  f.target.update = async changes => { if (fail && "system.health.value" in changes) { fail = false; throw new Error("health failed"); } return update(changes); };
  await assert.rejects(applyExchangeDamage(f.message, 0), /health failed/);
  assert.equal(f.target.system.health.value, 50); assert.equal(experimentalFrozen(f.target), true);
  await applyExchangeDamage(f.message, 0); assert.equal(f.target.system.health.value, 35); assert.equal(experimentalFrozen(f.target), false);
  assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "2d6"]);
});

test("a frozen grappler's ice does not increase damage to their unfrozen living shield", async t => {
  const f = fixture(t, { location: "torso", results: [8, 7] }); mutableTarget(f);
  const shield = livingShield(t, f); f.target.effects.push(iceEffect("target-ice"));
  await rollExchangeDamage(f.message, 0);
  const preview = damagePreview(f.message, 0);
  assert.equal(preview.result.total, 15); assert.equal(preview.shield.result.total, 8); assert.equal(preview.shield.through.total, 0);
  await applyExchangeDamage(f.message, 0, { useShield: true });
  assert.equal(shield.system.health.value, 42); assert.equal(f.target.system.health.value, 50);
  assert.equal(experimentalFrozen(f.target), true, "the shield stopped the blow before it touched the grappler's ice");
});

test("each actual frozen recipient gets the ice bonus once and only base damage overflows the shield", async t => {
  const f = fixture(t, { location: "torso", totals: [12, 12], results: [8, 7, 8, 6] }); mutableTarget(f);
  const shield = livingShield(t, f, { body: 3 }); f.target.effects.push(iceEffect("target-ice")); shield.effects.push(iceEffect("shield-ice"));
  await rollExchangeDamage(f.message, 0); await rollExchangeDamage(f.message, 1);
  const first = damagePreview(f.message, 0);
  assert.equal(first.shield.result.total, 15); assert.equal(first.shield.overflow, 5); assert.equal(first.shield.through.total, 12);
  await applyExchangeDamage(f.message, 0, { useShield: true });
  assert.equal(f.target.system.health.value, 38); assert.equal(shield.system.health.value, 35);
  assert.equal(experimentalFrozen(f.target), false); assert.equal(experimentalFrozen(shield), false);
  const second = damagePreview(f.message, 1);
  assert.equal(second.shield.result.total, 8); assert.equal(second.shield.through.total, 5);
  await applyExchangeDamage(f.message, 1, { useShield: true });
  assert.equal(f.target.system.health.value, 33); assert.equal(shield.system.health.value, 27);
});

test("the GM rechecks a deferred living shield's ice and never applies an obsolete or repeated bonus", async t => {
  const f = fixture(t, { location: "torso", results: [8, 7] }); mutableTarget(f);
  const shield = livingShield(t, f, { owner: false }); shield.effects.push(iceEffect("shield-ice"));
  await rollExchangeDamage(f.message, 0);
  const receipt = await applyExchangeDamage(f.message, 0, { useShield: true });
  assert.equal(exchange(receipt).shield.total, 15); assert.equal(exchange(receipt).shield.applied, undefined);
  assert.equal(shield.system.health.value, 50);
  receipt.update = async changes => { for (const [path, value] of Object.entries(changes)) put(receipt, path, value); };
  await shield.deleteEmbeddedDocuments("ActiveEffect", ["shield-ice"]);
  shield.isOwner = true; game.users = { activeGM: { isSelf: true } };
  await Promise.all([applyShieldShare(receipt), applyShieldShare(receipt)]);
  assert.equal(shield.system.health.value, 42); assert.equal(exchange(receipt).shield.total, 8); assert.equal(exchange(receipt).shield.applied, true);
  await applyShieldShare(receipt); assert.equal(shield.system.health.value, 42);
});

test("paid adrenaline adds dice to strike zero only, even when the second strike's damage is resolved first", async t => {
  const f = fixture(t, { location: "torso", totals: [12, 12], results: [8, 8, 11] }); mutableTarget(f);
  f.attack.adrenalineDice = 2;
  const second = exchange(await rollExchangeDamage(f.message, 1)); assert.deepEqual(second.extras, []);
  const first = exchange(await rollExchangeDamage(f.message, 0)); assert.deepEqual(first.extras, [{ label: "Адреналин", value: 11 }]);
  await rollExchangeDamage(f.message, 0); await rollExchangeDamage(f.message, 1);
  assert.equal(damagePreview(f.message, 0).result.total, 19); assert.equal(damagePreview(f.message, 1).result.total, 8);
  await applyExchangeDamage(f.message, 0); await applyExchangeDamage(f.message, 1); await applyExchangeDamage(f.message, 0);
  assert.equal(f.target.system.health.value, 23); assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "2d6+2", "2d6"]);
});

test("damage after throwing keeps the captured relic, oil and silver although the original item is gone or changed", async t => {
  const f = fixture(t, { location: "torso", totals: [17], category: "specter", results: [8, 11, 4] });
  const previous = globalThis.fromUuidSync; t.after(() => { if (previous === undefined) delete globalThis.fromUuidSync; else globalThis.fromUuidSync = previous; });
  game.user = { isGM: true }; game.time = { worldTime: 10 }; canvas.scene.id = "scene";
  const item = { id: "sword", type: "weapon", name: "Реликтовое копьё", actor: f.actor,
    system: { quantity: 1, category: "thrown", damageType: "К", properties: "Серебряное (3d6); Сбалансированное; Замораживающее (75%)",
      oil: { name: "Масло против призраков", sourceUuid: "Item.oil", target: "specter", bonus: 5, expiresAt: 20 } } };
  f.actor.items = Object.assign([item], { get(id) { return this.find(entry => entry.id === id); } });
  const quote = { weapon: structuredClone(item.system), attack: { count: 1 } };
  Object.assign(f.attack, thrownWeaponPlan(f.actor, item, quote, { point: { x: 500, y: 50 } }));
  // The transfer itself is covered in thrown-weapons.test.mjs; damage now sees only the ground copy.
  f.actor.items.splice(0); item.system.properties = ""; item.system.oil = null; quote.weapon.properties = "";
  f.attack.groundWeaponUuid = "Actor.pile.Item.weapon"; globalThis.fromUuidSync = uuid => uuid === f.attack.groundWeaponUuid ? item : null;
  game.time.worldTime = 100;
  const damage = exchange(await rollExchangeDamage(f.message, 0));
  assert.equal(f.actor.items.length, 0); assert.equal(damage.silver, 11); assert.equal(damage.traits.silver, true);
  assert.equal(damage.hitTraits.frozen, 75); assert.deepEqual(damage.oil, { name: "Масло против призраков", bonus: 5 });
  assert.equal(damage.critical.roll, 9, "captured Balanced turns aimed d6=4 into the greater torso wound");
  assert.equal(damage.critical.level, "light"); assert.equal(damagePreview(f.message, 0).result.total, 27);
  assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "3d6", "1d6"]);
});

test("Balanced changes the actual critical wound table without changing its severity", async t => {
  for (const [properties, expectedRoll, wound] of [["Сбалансированное", 9, "cracked-ribs"], ["Сбалансированное (+5)", 12, "cracked-jaw"]]) {
    await t.test(properties, async t => {
      const f = fixture(t, { totals: [17], results: [8, 7] }); f.attack.weaponProperties = properties;
      const damage = exchange(await rollExchangeDamage(f.message, 0));
      assert.equal(damage.critical.level, "light"); assert.equal(damage.critical.bonus, 3);
      assert.equal(damage.critical.roll, expectedRoll); assert.equal(damage.critical.wound.id, wound);
      assert.equal(damage.location.id, expectedRoll === 12 ? "head" : "torso", "the shifted wound also moves the blow");
      assert.deepEqual(f.evaluated.map(row => row.formula), ["2d6+2", "2d6"]);
    });
  }
});

test("Moon Bow's three bonus damage enters the real specter damage calculation and is absent against beasts", async t => {
  const f = fixture(t, { location: "torso", totals: [12, 12], category: "specter", results: [8, 8] }); mutableTarget(f);
  f.attack.hitTraits = { specterDamage: 3 };
  const specter = exchange(await rollExchangeDamage(f.message, 0));
  assert.deepEqual(specter.extras, [{ label: "Лунный лук: против призрака", value: 3 }]);
  assert.equal(damagePreview(f.message, 0).result.total, 5, "non-silver 8+3 damage is halved against a monster");
  await applyExchangeDamage(f.message, 0); assert.equal(f.target.system.health.value, 45);
  f.target.system.creature.category = "beast";
  const beast = exchange(await rollExchangeDamage(f.message, 1)); assert.deepEqual(beast.extras, []);
  await applyExchangeDamage(f.message, 1); assert.equal(f.target.system.health.value, 37);
});
