import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { hasStatus, DYING, DEAD } from "../scripts/combat/status-effects.mjs";
import { prepareDeathTransition, applyDeathTransition, prepareDeathRound, applyDeathRound, rollDeath, syncExistingDeathStates } from "../scripts/combat/death-state.mjs";

let id = 0, faces = [], messages = [], cancel = false, fail = false, paused;
const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url), "utf8"));
const localize = key => key.split(".").reduce((node, part) => node[part], translations);
const setProperty = (object, key, value) => {
  const parts = key.split(".");
  const last = parts.pop();
  parts.reduce((node, part) => node[part] ??= {}, object)[last] = value;
};
class ChatHost {
  constructor(source) { Object.assign(this, { id: `Message.${++id}`, flags: {}, flavor: "" }, source); }
  async _preCreate() {}
  updateSource(changes) { for (const [key, value] of Object.entries(changes)) setProperty(this, key, value); }
  static async createDocuments(data, operation) {
    const created = [];
    for (const source of data) {
      const message = new this(source);
      await message._preCreate(source, operation, {});
      if (fail) throw new Error("Chat database failed");
      if (!cancel) { created.push(message); messages.push(message); }
    }
    return created;
  }
  static getSpeaker({ actor }) { return { actor }; }
}
globalThis.foundry = { utils: { randomID: () => `id${++id}`, setProperty }, documents: { ChatMessage: ChatHost }, dice: {} };
globalThis.game = { user: { id: "local", isGM: true }, settings: { get: () => "public" },
  i18n: { localize, format: (key, values) => localize(key).replace(/\{(\w+)\}/g, (_, part) => values[part]) } };
globalThis.ui = { notifications: { warn() {}, error(message) { throw new Error(message); } } };
const { WitcherChatMessage } = await import("../scripts/documents/witcher-chat-message.mjs");
foundry.dice.Roll = class {
  constructor(formula) { assert.equal(formula, "1d10", "Death saves never use critical chains"); }
  async evaluate() {
    this.total = faces.shift() ?? 1;
    this.dice = [{ results: [{ result: this.total }] }];
    if (paused) await paused;
    return this;
  }
  async toMessage(data) {
    return (await WitcherChatMessage.createDocuments([{ ...data, speakerActor: data.speaker.actor, rolls: [this] }]))[0];
  }
};

function actor() {
  const document = { uuid: `Actor.${++id}`, type: "character", isOwner: true, effects: [],
    async toggleStatusEffect(status) { this.effects.push({ id: `${status}-${++id}`, statuses: new Set([status]) }); },
    async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(effect => !ids.includes(effect.id)); },
    async update(changes) {
      const projected = { health: { ...this.system.health } };
      const entered = changes["system.health.value"];
      if (entered !== undefined) projected.health.value = entered;
      const damaged = entered !== undefined && entered < this.system.health.value;
      const event = prepareDeathTransition(this, projected, changes, entered, damaged);
      const apply = (target, updates) => {
        for (const [key, value] of Object.entries(updates)) {
          if (typeof value === "object" && !Array.isArray(value)) apply(target[key], value);
          else setProperty(target, key, value);
        }
      };
      apply(this, changes);
      await applyDeathTransition(this, event);
    }
  };
  document.system = {
    attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])), health: { value: 50, max: 50 },
    luckSpent: [], luckPending: 0, death: { penalty: 0, episode: "", lastCombat: "", lastRound: 0 },
    get statistics() { return deriveStatistics(this, { dying: hasStatus(document, DYING), dead: hasStatus(document, DEAD) }); }
  };
  return document;
}
function reset() {
  messages = []; faces = []; cancel = false; fail = false; paused = null; game.combat = null;
}
const latest = () => messages.at(-1).flags[SYSTEM_ID].deathSave;
const tick = () => new Promise(resolve => setImmediate(resolve));

test("first HP crossing rolls with zero penalty; further hits increment; saves never self-stabilize", async () => {
  reset();
  const owner = actor();
  await owner.update({ "system.health.value": 0 });
  assert.equal(hasStatus(owner, DYING), true);
  assert.equal(latest().penalty, 0);
  assert.equal(latest().cause, "entry");
  assert.equal(latest().succeeded, true);
  assert.equal(owner.system.statistics.effective.body, 3);
  const episode = owner.system.death.episode;
  await owner.update({ "system.health.value": -4 });
  assert.equal(latest().cause, "damage");
  assert.equal(latest().penalty, 1);
  assert.equal(latest().base, 10, "Death saves use unreduced STUN");
  assert.equal(latest().target, 9);
  assert.equal(owner.system.death.episode, episode);
  await owner.update({ "system.health.value": -2 });
  await owner.update({ "system.luckPending": 0 });
  assert.equal(messages.length, 2, "Partial healing and unrelated updates do not cause saves");
  await rollDeath(owner);
  assert.equal(latest().penalty, 1, "The manual button does not increment the penalty");
  assert.equal(hasStatus(owner, DYING), true);
  await owner.update({ "system.health.value": 1 });
  assert.equal(hasStatus(owner, DYING), false);
  assert.equal(owner.system.death.penalty, 0);
  assert.equal(owner.system.death.episode, "");
  await owner.update({ "system.health.value": -1 });
  assert.equal(latest().penalty, 0);
  assert.notEqual(owner.system.death.episode, episode);
});

test("failure and equality cause death; dead actors do not save again or revive on an HP edit", async () => {
  for (const face of [9, 10]) {
    reset();
    const owner = actor();
    await owner.update({ "system.health.value": 0 });
    faces = [face];
    await owner.update({ "system.health.value": -1 });
    assert.equal(latest().target, 9);
    assert.equal(latest().succeeded, false);
    assert.equal(hasStatus(owner, DEAD), true);
    assert.equal(hasStatus(owner, DYING), false);
    assert.equal(owner.system.statistics.dead, true);
    await rollDeath(owner);
    await owner.update({ "system.health.value": -2 });
    await owner.update({ "system.health.value": 50 });
    assert.equal(messages.length, 2);
    assert.equal(hasStatus(owner, DEAD), true);
  }
});

test("selected Luck raises the death threshold, spends on posting, and cannot alter the natural d10", async () => {
  reset();
  const owner = actor();
  owner.system.luckPending = 4;
  faces = [10];
  await owner.update({ "system.health.value": 0 });
  assert.equal(messages[0].rolls[0].total, 10);
  assert.equal(latest().target, 14);
  assert.equal(latest().succeeded, true, "Natural 10 does not explode or automatically fail a death save");
  assert.deepEqual(owner.system.luckSpent, [1, 2, 3, 4]);
  assert.equal(owner.system.luckPending, 0);
  assert.match(messages[0].flavor, /10 − 0 \+ 4 = 14/);
  assert.match(messages[0].flavor, /\+4 от Удачи к порогу/);
  owner.system.death.penalty = 10;
  faces = [1];
  await rollDeath(owner);
  assert.equal(latest().target, 0);
  assert.equal(latest().succeeded, false, "Natural 1 is not an automatic success against a nonpositive threshold");
});

test("cancelled or failed saves keep the state, penalty and selected Luck for a manual retry", async () => {
  for (const failure of [false, true]) {
    reset();
    const owner = actor();
    owner.system.health.value = -1;
    owner.system.death.penalty = 2;
    owner.system.luckPending = 4;
    cancel = !failure; fail = failure;
    if (failure) await assert.rejects(rollDeath(owner), /Chat database/);
    else await rollDeath(owner);
    assert.equal(owner.system.death.penalty, 2);
    assert.equal(hasStatus(owner, DYING), true);
    assert.equal(hasStatus(owner, DEAD), false);
    assert.deepEqual(owner.system.luckSpent, []);
    assert.equal(owner.system.luckPending, 4);
    cancel = fail = false;
    await rollDeath(owner);
    assert.equal(latest().target, 12);
    assert.deepEqual(owner.system.luckSpent, [1, 2, 3, 4]);
  }
});

test("new rounds affect each actor once, not each linked token, remote client, turn, or repeated update", async () => {
  reset();
  const owner = actor();
  const combat = { uuid: "Combat.test", round: 1, combatants: [{ actor: owner }, { actor: owner }] };
  game.combat = combat;
  await owner.update({ "system.health.value": 0 });
  const options = {};
  prepareDeathRound(combat, { round: 2 }, options);
  combat.round = 2;
  await applyDeathRound(combat, {}, options, "remote");
  assert.equal(messages.length, 1);
  await Promise.all([applyDeathRound(combat, {}, options, "local"), applyDeathRound(combat, {}, options, "local")]);
  assert.equal(messages.length, 2);
  assert.equal(latest().cause, "round");
  assert.equal(latest().penalty, 1);
  assert.equal(owner.system.death.lastRound, 2);
  for (const changes of [{ turn: 1 }, { round: 2, turn: 2 }, { round: 1 }, { round: 0 }]) {
    const ignored = {};
    prepareDeathRound(combat, changes, ignored);
    await applyDeathRound(combat, changes, ignored, "local");
  }
  assert.equal(messages.length, 2);
  const jump = {};
  prepareDeathRound(combat, { round: 4 }, jump);
  combat.round = 4;
  await applyDeathRound(combat, {}, jump, "local");
  assert.equal(messages.length, 4);
  assert.equal(latest().penalty, 3);
  faces = [10];
  const fatal = {};
  prepareDeathRound(combat, { round: 7 }, fatal);
  combat.round = 7;
  await applyDeathRound(combat, {}, fatal, "local");
  assert.equal(messages.length, 5, "Stop automatic saves immediately after death");
  assert.equal(hasStatus(owner, DEAD), true);
});

test("rapid manual clicks coalesce; queued hits remain distinct and external healing invalidates a pending death", async () => {
  reset();
  const owner = actor();
  owner.system.health.value = 0;
  let resume;
  paused = new Promise(resolve => { resume = resolve; });
  faces = [10];
  const first = rollDeath(owner);
  const second = rollDeath(owner);
  assert.equal(first, second);
  await tick();
  const healing = owner.update({ "system.health.value": 15 });
  resume();
  await Promise.all([first, second, healing]);
  assert.equal(messages.length, 1);
  assert.equal(hasStatus(owner, DEAD), false);
  assert.equal(hasStatus(owner, DYING), false);
  paused = null;
  await owner.update({ "system.health.value": 0 });
  await Promise.all([owner.update({ "system.health.value": -1 }), owner.update({ "system.health.value": -2 })]);
  assert.deepEqual(messages.slice(-2).map(message => message.flags[SYSTEM_ID].deathSave.penalty), [1, 2]);
});

test("healing and a new lethal hit during an older roll start a fresh episode with penalty zero", async () => {
  reset();
  const owner = actor();
  owner.system.health.value = 0;
  let resume;
  paused = new Promise(resolve => { resume = resolve; });
  faces = [10, 1];
  const oldSave = rollDeath(owner);
  await tick();
  const healing = owner.update({ "system.health.value": 20 });
  const hit = owner.update({ "system.health.value": -5 });
  resume();
  await Promise.all([oldSave, healing, hit]);
  assert.equal(messages.length, 2);
  assert.equal(latest().cause, "entry");
  assert.equal(latest().penalty, 0);
  assert.equal(hasStatus(owner, DEAD), false);
  assert.equal(hasStatus(owner, DYING), true);
});

test("startup adds statuses to existing dying actors and unlinked tokens without rolling retrospectively", async () => {
  reset();
  const world = actor(), synthetic = actor(), blank = actor();
  world.system.health.value = 0;
  synthetic.system.health.value = -2;
  synthetic.uuid = "Scene.test.Token.test.Actor.test";
  blank.system.attributes.body = blank.system.attributes.will = null;
  blank.system.health = { value: 0, max: 0 };
  game.actors = [world, blank];
  game.scenes = [{ tokens: [{ actorLink: false, actor: synthetic }, { actorLink: true, actor: world }] }];
  game.user.isActiveGM = false;
  await syncExistingDeathStates();
  assert.equal(world.effects.length, 0);
  game.user.isActiveGM = true;
  await syncExistingDeathStates();
  await syncExistingDeathStates();
  assert.equal(world.effects.length, 1);
  assert.equal(synthetic.effects.length, 1);
  assert.equal(blank.effects.length, 0);
  assert.equal(messages.length, 0);
});
