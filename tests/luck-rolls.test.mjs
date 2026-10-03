import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_ID } from "../scripts/config.mjs";

let sequence = 0;
class NumericTerm {
  constructor(data) { Object.assign(this, data); }
  async evaluate() { this._evaluated = true; return this; }
}
class OperatorTerm { constructor(data) { Object.assign(this, data); this._evaluated = true; } }
const rolled = (total = 7) => ({ total, dice: [{ results: [{ result: total }] }], terms: [{ total, _evaluated: true }], options: { test: true }, toJSON() { return this; } });
class ChatHost {
  constructor(data) { Object.assign(this, { flags: {}, rolls: [], flavor: "", content: "7" }, data); }
  async _preCreate() {}
  updateSource(changes) {
    for (const [key, value] of Object.entries(changes)) {
      const parts = key.split(".");
      const last = parts.pop();
      const target = parts.reduce((node, part) => node[part] ??= {}, this);
      target[last] = value;
    }
  }
  static async createDocuments(data, operation) {
    const messages = [];
    for (const source of data) {
      const message = new this(source);
      if (await message._preCreate(source, operation, {}) === false) continue;
      operation.inspect?.(message);
      if (operation.fail) throw new Error("Database unavailable");
      if (!operation.cancel) messages.push(message);
    }
    return messages;
  }
}
globalThis.foundry = {
  utils: { randomID: () => `id${++sequence}` }, documents: { ChatMessage: ChatHost },
  dice: { terms: { NumericTerm, OperatorTerm }, Roll: {
    fromTerms(terms, options) {
      assert.ok(terms.every(term => term._evaluated));
      return { total: terms[0].total + terms.at(-1).number, terms, options, dice: [{ results: [{ result: terms[0].total }] }], toJSON() { return this; } };
    }
  } }
};
globalThis.game = { i18n: { localize: key => key, format: (_key, { value }) => `+${value} от Удачи` } };
const { WitcherChatMessage } = await import("../scripts/documents/witcher-chat-message.mjs");
const actor = () => ({ uuid: `Actor.${++sequence}`, isOwner: true,
  system: { statistics: { effective: { luck: 10 } }, luckSpent: [], luckPending: 4 },
  async update(changes) {
    this.system.luckSpent = changes["system.luckSpent"];
    this.system.luckPending = changes["system.luckPending"];
  }
});
const source = (owner, rolls = [rolled()]) => ({ speakerActor: owner, rolls, flags: {} });

test("native chat lifecycle applies Luck once, keeps dice results, and spends only after creation", async () => {
  const owner = actor(), original = rolled();
  const [message] = await WitcherChatMessage.createDocuments([source(owner, [original, rolled(3)])], {
    inspect() { assert.deepEqual(owner.system.luckSpent, []); assert.equal(owner.system.luckPending, 4); }
  });
  assert.equal(message.rolls[0].total, 11);
  assert.equal(message.rolls[1].total, 3, "A multi-roll message spends the selection once");
  assert.deepEqual(message.rolls[0].dice, original.dice);
  assert.equal(message.rolls[0].terms[0], original.terms[0], "Never re-evaluate existing dice");
  assert.equal(message.content, "11");
  assert.match(message.flavor, /\+4 от Удачи/);
  assert.deepEqual(owner.system.luckSpent, [1, 2, 3, 4]);
  assert.equal(owner.system.luckPending, 0);
  const [next] = await WitcherChatMessage.createDocuments([source(owner)]);
  assert.equal(next.rolls[0].total, 7);
});

test("cancelled and failed messages leave Luck available and release their reservation", async () => {
  for (const operation of [{ cancel: true }, { fail: true }]) {
    const owner = actor();
    if (operation.fail) await assert.rejects(WitcherChatMessage.createDocuments([source(owner)], operation), /Database/);
    else assert.deepEqual(await WitcherChatMessage.createDocuments([source(owner)], operation), []);
    assert.equal(owner.system.luckPending, 4);
    assert.deepEqual(owner.system.luckSpent, []);
    const [message] = await WitcherChatMessage.createDocuments([source(owner)]);
    assert.equal(message.rolls[0].total, 11);
  }
});

test("simultaneous local rolls cannot spend the same Luck twice", async () => {
  const owner = actor();
  const messages = (await Promise.all([
    WitcherChatMessage.createDocuments([source(owner)]), WitcherChatMessage.createDocuments([source(owner)])
  ])).flat();
  assert.deepEqual(messages.map(message => message.rolls[0].total).sort((a, b) => a - b), [7, 11]);
  assert.deepEqual(owner.system.luckSpent, [1, 2, 3, 4]);
});

test("Stun, non-dice messages, read-only actors and reposted rolls do not spend selected Luck", async () => {
  const owner = actor();
  const sources = [source(owner), source(owner, []), source({ ...owner, isOwner: false }), source(owner)];
  sources[0].flags[SYSTEM_ID] = { skipLuck: true };
  sources[3].flags[SYSTEM_ID] = { luck: { bonus: 4 } };
  const messages = await WitcherChatMessage.createDocuments(sources);
  assert.equal(messages[0].rolls[0].total, 7);
  assert.equal(owner.system.luckPending, 4);
  assert.deepEqual(owner.system.luckSpent, []);
});
