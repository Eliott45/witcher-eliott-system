import { test } from "node:test";
import assert from "node:assert/strict";
import { serialQueue } from "../scripts/data/serial-queue.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("jobs of one key run in order; other keys do not wait", async () => {
  const queue = serialQueue(1000), order = [];
  const a = queue("card", async () => { await sleep(30); order.push("a"); });
  const b = queue("card", async () => { order.push("b"); });
  const c = queue("other", async () => { order.push("c"); });
  await Promise.all([a, b, c]);
  assert.deepEqual(order, ["c", "a", "b"]);
});

test("a failed job does not block the next one", async () => {
  const queue = serialQueue(1000);
  await assert.rejects(queue("card", async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await queue("card", async () => "next"), "next");
});

test("a job that never settles stops holding the queue after the stall time", async () => {
  const queue = serialQueue(40);
  queue("card", () => new Promise(() => {}));
  const started = Date.now();
  assert.equal(await queue("card", async () => "through"), "through");
  assert.ok(Date.now() - started >= 35, "it still waited for the stall time");
});
