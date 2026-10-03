import assert from "node:assert/strict";
import { test } from "node:test";
import { DicePool } from "../scripts/chat/dice-pool.mjs";

test("different dice combine into one native roll command and reset after it is posted", async () => {
  const pool = new DicePool();
  pool.set(6, 2);
  pool.set(10, 1);
  pool.set(100, 3);
  assert.equal(pool.formula, "2d6 + 1d10 + 3d100");
  const commands = [];
  const message = { id: "roll-message" };
  assert.equal(await pool.roll(async command => {
    commands.push(command);
    return message;
  }), message);
  assert.equal(pool.busy, false);
  assert.equal(pool.formula, "");
  for (const faces of [4, 6, 10, 12, 20, 100]) assert.equal(pool.count(faces), 0);
  await pool.roll(async () => assert.fail("A completed roll must not leave dice selected"));
  assert.deepEqual(commands, ["/r 2d6 + 1d10 + 3d100"]);
  pool.set(6, 1);
  assert.equal(pool.formula, "1d6");
  pool.clear();
  await pool.roll(async () => assert.fail("Empty selections must not send chat messages"));
});

test("manual quantities produce valid whole dice within Foundry's limit", () => {
  const pool = new DicePool();
  for (const value of ["", -1, NaN, Infinity, "abc"]) {
    pool.set(4, value);
    assert.equal(pool.count(4), 0);
  }
  pool.set(4, 2.9);
  pool.set(12, 1000);
  pool.set(20, "5");
  pool.set(8, 10);
  assert.equal(pool.formula, "2d4 + 999d12 + 5d20");
});

test("a pending roll cannot be submitted twice or lose its selection on failure", async () => {
  const pool = new DicePool();
  pool.set(20, 2);
  let reject;
  const pending = pool.roll(() => new Promise((_resolve, fail) => { reject = fail; }));
  assert.equal(pool.busy, true);
  await pool.roll(() => assert.fail("Double click must not send a second roll"));
  pool.clear();
  pool.set(20, 5);
  assert.equal(pool.formula, "2d20");
  reject(new Error("Connection lost"));
  await assert.rejects(pending, /Connection lost/);
  assert.equal(pool.busy, false);
  assert.equal(pool.formula, "2d20");
  await pool.roll(async command => {
    assert.equal(command, "/r 2d20");
    return { id: "retry-message" };
  });
  assert.equal(pool.formula, "");
});

test("a roll cancelled by a chat hook keeps the selection", async () => {
  const pool = new DicePool();
  pool.set(10, 3);
  await pool.roll(async () => undefined);
  assert.equal(pool.busy, false);
  assert.equal(pool.formula, "3d10");
});
