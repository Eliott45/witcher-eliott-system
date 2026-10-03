import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_ID } from "../scripts/config.mjs";

let count = 0, inspectedOptions, documentUpdate;
globalThis.foundry = {
  utils: {
    randomID: () => `batch-${++count}`,
    mergeObject(original, extra, { inplace }) {
      assert.equal(inplace, false);
      return { ...original, flags: { ...original.flags, [SYSTEM_ID]: { initiativeBatch: extra[`flags.${SYSTEM_ID}.initiativeBatch`] } } };
    }
  },
  documents: { Combat: class {
    turn = 2;
    combatants = new Map([
      ["one", { id: "one", actorId: "actor", tokenId: "token-one", isOwner: true }],
      ["two", { id: "two", actorId: "actor", tokenId: "token-two", isOwner: true }],
      ["three", { id: "three", actorId: "stranger", tokenId: "token-three", isOwner: false }]
    ]);
    async rollInitiative(_ids, options) {
      inspectedOptions = options;
      const batch = options.messageOptions.flags[SYSTEM_ID].initiativeBatch;
      game.messages = [
        { flags: { [SYSTEM_ID]: { initiativeBatch: batch, luck: { bonus: 4 } } }, speaker: { actor: "actor", token: "token-one" }, rolls: [{ total: 21 }] },
        { flags: { [SYSTEM_ID]: { initiativeBatch: batch } }, speaker: { actor: "actor", token: "token-two" }, rolls: [{ total: 17 }] },
        { flags: { [SYSTEM_ID]: { initiativeBatch: "old", luck: { bonus: 4 } } }, speaker: { actor: "actor", token: "token-two" }, rolls: [{ total: 99 }] }
      ];
    }
    async updateEmbeddedDocuments(type, updates, options) { documentUpdate = { type, updates, options }; }
  } }
};
globalThis.game = { messages: [] };
const { WitcherCombat } = await import("../scripts/documents/witcher-combat.mjs");

test("initiative adopts the posted Luck total only for the correct token in the current batch", async () => {
  const combat = new WitcherCombat();
  const messageOptions = { flags: { other: { keep: true } }, sound: null };
  assert.equal(await combat.rollInitiative(["one", "two", "three"], { updateTurn: false, messageMode: "private", messageOptions }), combat);
  assert.equal(inspectedOptions.messageMode, "private");
  assert.deepEqual(inspectedOptions.messageOptions.flags.other, { keep: true });
  assert.equal(messageOptions.flags[SYSTEM_ID], undefined);
  assert.deepEqual(documentUpdate, { type: "Combatant", updates: [{ _id: "one", initiative: 21 }], options: { turnEvents: false, combatTurn: 2 } });
});
