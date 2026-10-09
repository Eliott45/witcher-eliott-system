import { test } from "node:test";
import assert from "node:assert/strict";
import { naturalOf } from "../scripts/canvas/fx/screen-fx.mjs";

const message = (...results) => ({ rolls: [{ dice: [{ faces: 10, modifiers: ["wc"], results: results.map(result => ({ result, active: true })) }] }] });

test("the first d10 of a check tells a critical from a fumble", () => {
  assert.equal(naturalOf(message(10, 4)), "crit");
  assert.equal(naturalOf(message(1, 6)), "fumble");
  assert.equal(naturalOf(message(7)), null);
  // Damage dice and messages without rolls flare nothing.
  assert.equal(naturalOf({ rolls: [{ dice: [{ faces: 6, results: [{ result: 6 }] }] }] }), null);
  assert.equal(naturalOf({ rolls: [] }), null);
  assert.equal(naturalOf(undefined), null);
  // A hit location or a Stun save is a plain d10: a 10 there is no critical.
  assert.equal(naturalOf({ rolls: [{ dice: [{ faces: 10, modifiers: [], results: [{ result: 10 }] }] }] }), null);
});
