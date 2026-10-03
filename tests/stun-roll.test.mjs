import assert from "node:assert/strict";
import { test } from "node:test";
import { rollStun } from "../scripts/combat/stun-roll.mjs";

test("Stun rolls use native dice, actor speaker and every current chat visibility mode", async () => {
  const actor = { isOwner: true, effects: [], system: { statistics: { stun: 10 } } };
  let mode, total, sent, evaluation, evaluated = 0;
  globalThis.game = {
    settings: { get: (scope, key) => { assert.equal(scope, "core"); assert.equal(key, "messageMode"); return mode; } },
    i18n: { localize: key => key, format: (_key, data) => JSON.stringify(data) }
  };
  globalThis.foundry = {
    dice: { Roll: class {
      constructor(formula) { assert.equal(formula, "1d10"); }
      async evaluate(options) { evaluated++; evaluation = options; this.total = total; return this; }
      async toMessage(data, options) { sent = { data, options }; return sent; }
    } },
    documents: { ChatMessage: { getSpeaker: ({ actor: speakerActor }) => {
      assert.equal(speakerActor, actor); return { actor: "owner-actor" };
    } } }
  };
  for (mode of ["public", "private", "blind", "self"]) {
    for (total of [9, 10]) {
      await rollStun(actor);
      assert.equal(sent.options.messageMode, mode);
      assert.equal(evaluation.allowInteractive, mode !== "blind");
      assert.deepEqual(sent.data.speaker, { actor: "owner-actor" });
      assert.equal(JSON.parse(sent.data.flavor).outcome, total === 9 ? "WITCHER.Statistics.Success" : "WITCHER.Statistics.Failure");
      assert.match(JSON.parse(sent.data.flavor).target, /data-tooltip=".*">10<\/strong>/);
    }
  }
  actor.isOwner = false;
  await rollStun(actor);
  assert.equal(evaluated, 8, "Observers cannot roll on another player's behalf");
  actor.isOwner = true;
  actor.system.statistics.stun = null;
  let warning;
  globalThis.ui = { notifications: { warn: text => { warning = text; } } };
  await rollStun(actor);
  assert.equal(evaluated, 8, "Unfilled attributes must not result in a misleading save");
  assert.equal(warning, "WITCHER.Statistics.UnfilledPhysical");
});
