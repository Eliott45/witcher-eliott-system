import assert from "node:assert/strict";
import { test } from "node:test";
import { rollStun } from "../scripts/combat/stun-roll.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

function hookHost() {
  const hooks = new Map();
  return {
    on(event, fn) { if (!hooks.has(event)) hooks.set(event, new Set()); hooks.get(event).add(fn); return fn; },
    off(event, fn) { hooks.get(event)?.delete(fn); },
    callAll(event, ...args) { for (const fn of hooks.get(event) ?? []) fn(...args); },
    get size() { return [...hooks.values()].reduce((total, callbacks) => total + callbacks.size, 0); }
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("Stun recovery waits for both visible chat and DSN completion, including immediate-chat mode", async () => {
  for (const dice of [false, true]) for (const chatFirst of [false, true]) {
    globalThis.Hooks = hookHost();
    globalThis.requestAnimationFrame = fn => setImmediate(fn);
    globalThis.ui = { chat: { rendered: true } };
    globalThis.game = { settings: { get: () => "public" }, dice3d: dice ? {} : null,
      i18n: { localize: key => key, format: (_key, data) => JSON.stringify(data) } };
    const actor = { uuid: "Actor.stun", isOwner: true,
      effects: [{ id: "stun", statuses: new Set(["stunned"]) }],
      system: { statistics: { stun: 10, adjusted: { body: 8, will: 10 }, recovery: 9 }, luckPending: 4 },
      async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(effect => !ids.includes(effect.id)); }
    };
    let message;
    globalThis.foundry = { utils: { randomID: () => "display-id" }, documents: { ChatMessage: { getSpeaker: () => ({}) } },
      dice: { Roll: class {
        async evaluate() { this.total = 3; return this; }
        async toMessage(data) { message = { id: "roll-id", flags: data.flags, visible: true, _dice3danimating: dice }; return message; }
      } }
    };
    const work = rollStun(actor);
    await tick();
    assert.equal(actor.effects.length, 1);
    assert.equal(message.flags[SYSTEM_ID].skipLuck, true);
    const render = () => Hooks.callAll("renderChatMessageHTML", message);
    const finishDice = () => Hooks.callAll("diceSoNiceRollComplete", message.id);
    if (chatFirst) {
      render();
      await tick();
      if (dice) assert.equal(actor.effects.length, 1, "Visible chat alone must not remove the effect while dice are rolling");
      finishDice();
    } else {
      finishDice();
      await tick();
      assert.equal(actor.effects.length, 1, "Dice completion alone is not a rendered result");
      render();
    }
    await work;
    assert.equal(actor.effects.length, 0);
    assert.equal(actor.system.luckPending, 4);
    assert.equal(Hooks.size, 0, "Release temporary listeners after each save");
  }
  delete globalThis.Hooks;
});
