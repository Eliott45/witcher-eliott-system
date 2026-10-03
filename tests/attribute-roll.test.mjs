import assert from "node:assert/strict";
import { test } from "node:test";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { rollAttribute } from "../scripts/combat/attribute-roll.mjs";

test("every attribute rolls a critical-chain d10 plus its effective value, with actor and chat privacy", async () => {
  const system = { attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])), health: { value: 9, max: 50 } };
  system.statistics = deriveStatistics(system);
  const actor = { isOwner: true, system, effects: [] };
  let mode, sent, evaluated = 0, formula;
  globalThis.game = {
    settings: { get: () => mode },
    i18n: { localize: key => key, format: (_key, data) => JSON.stringify(data) }
  };
  globalThis.foundry = {
    dice: { Roll: class {
      constructor(value) { formula = value; }
      async evaluate(options) { evaluated++; assert.equal(options.allowInteractive, mode !== "blind"); return this; }
      async toMessage(data, options) { sent = { data, options }; return sent; }
    } },
    documents: { ChatMessage: { getSpeaker: ({ actor: speaker }) => { assert.equal(speaker, actor); return { actor: "character" }; } } }
  };
  for (mode of ["public", "private", "blind", "self"]) {
    for (const key of ATTRIBUTE_KEYS) {
      await rollAttribute(actor, key);
      assert.equal(formula, `1d10wc + ${system.statistics.effective[key]}`);
      assert.equal(sent.options.messageMode, mode);
      assert.equal(JSON.parse(sent.data.flavor).value, system.statistics.effective[key]);
    }
  }
  assert.equal(evaluated, 36);
  await rollAttribute(actor, "health");
  actor.isOwner = false;
  await rollAttribute(actor, "intelligence");
  assert.equal(evaluated, 36);
  actor.isOwner = true;
  system.statistics.effective.luck = null;
  globalThis.ui = { notifications: { warn: () => {} } };
  await rollAttribute(actor, "luck");
  assert.equal(evaluated, 36);
});
