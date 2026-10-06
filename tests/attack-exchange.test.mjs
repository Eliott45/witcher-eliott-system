import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { rollExchangeLocation, rollExchangeDamage, exchangeRowHTML, damagePreview } from "../scripts/combat/attack-exchange.mjs";

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
  const first = await rollExchangeLocation(f.message, 0);
  const second = await rollExchangeLocation(f.message, 1);
  assert.equal(exchange(first).location.id, "torso", "5 is torso on the monster table");
  assert.equal(exchange(second).location.id, "tail");
  assert.equal(exchange(second).bodyPlan, "monster");
  assert.equal(exchange(await rollExchangeDamage(f.message, 0)).location.id, "torso");
  assert.equal(exchange(await rollExchangeDamage(f.message, 1)).location.id, "tail");
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
