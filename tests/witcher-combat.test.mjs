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
    _sortCombatants(a,b){return ((b.initiative??-Infinity)-(a.initiative??-Infinity))||(a.id>b.id?1:-1);}
    turn = 2;
    combatants = new Map([
      ["one", { id: "one", actorId: "actor", tokenId: "token-one", isOwner: true, initiative: 17 }],
      ["two", { id: "two", actorId: "actor", tokenId: "token-two", isOwner: true, initiative: 17 }],
      ["three", { id: "three", actorId: "stranger", tokenId: "token-three", isOwner: false }]
    ]);
    async rollInitiative(_ids, options) {
      inspectedOptions = options;
      const batch = options.messageOptions.flags[SYSTEM_ID].initiativeBatch;
      game.messages = [
        { flags: { [SYSTEM_ID]: { initiativeBatch: batch, luck: { bonus: 4 } } }, speaker: { actor: "actor", token: "token-one" }, rolls: [{ total: 21 }] },
        { flags: { [SYSTEM_ID]: { initiativeBatch: batch } }, speaker: { actor: "actor", token: "token-two" }, rolls: [{ total: Math.max(0, this.combatants.get("two").initiative) }] },
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

test("initiative adopts the zero minimum without Luck and preserves the current turn", async () => {
  const combat = new WitcherCombat();
  combat.combatants.get("two").initiative = -8;
  await combat.rollInitiative("two", { updateTurn: false });
  assert.deepEqual(documentUpdate, { type: "Combatant", updates: [{ _id: "two", initiative: 0 }],
    options: { turnEvents: false, combatTurn: 2 } });
});

test("native unbound sort honors delayed order, survives tied initiatives, and handles newcomers",()=>{
  const combat=new WitcherCombat();
  const a={id:"a",initiative:20,flags:{[SYSTEM_ID]:{turnOrder:1}}},b={id:"B",initiative:20,flags:{[SYSTEM_ID]:{turnOrder:3}}},c={id:"c",initiative:10,flags:{[SYSTEM_ID]:{turnOrder:2}}};
  assert.deepEqual([a,b,c].sort(combat._sortCombatants).map(c=>c.id),["B","c","a"]);
  const newcomer={id:"new",initiative:null};
  assert.deepEqual([newcomer,a,c,b].sort(combat._sortCombatants).map(c=>c.id),["B","c","a","new"]);
  for(const entry of [a,b,c])entry.flags[SYSTEM_ID].turnOrder=null;
  assert.deepEqual([a,b,c].sort(combat._sortCombatants).map(c=>c.id),["B","a","c"]);
});
