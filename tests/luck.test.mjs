import assert from "node:assert/strict";
import { test } from "node:test";
import { luckPoints, selectLuckPoints, selectedLuck } from "../scripts/data/luck.mjs";

test("selecting point 4 highlights 1–4 without spending them, and a second click cancels", () => {
  const pending = selectLuckPoints(10, [], 0, 4);
  assert.equal(pending, 4);
  const points = luckPoints(10, [], pending);
  assert.equal(points.length, 10);
  assert.deepEqual(points.filter(point => point.selected).map(point => point.number), [1, 2, 3, 4]);
  assert.equal(points.filter(point => !point.spent).length, 10);
  assert.equal(selectLuckPoints(10, [], pending, 4), 0);
  const spent = [1, 2, 3, 4];
  assert.equal(selectLuckPoints(10, spent, 0, 7), 3);
  assert.equal(selectLuckPoints(10, spent, 0, 4), null);
  assert.deepEqual(selectedLuck({ statistics: { effective: { luck: 10 } }, luckSpent: spent, luckPending: 3 }), [5, 6, 7]);
  assert.deepEqual(spent, [1, 2, 3, 4]);
});

test("Luck handles unfilled, zero, 100 and changed maxima", () => {
  assert.deepEqual(luckPoints(null, []), []);
  assert.deepEqual(luckPoints(0, [1]), []);
  assert.equal(luckPoints(100, [1, 100]).filter(point => !point.spent).length, 98);
  assert.equal(luckPoints(3, [1, 10]).filter(point => !point.spent).length, 2);
  assert.equal(luckPoints(101, [], 101).filter(point => point.selected).length, 101, "Lifepath bonuses may increase a base of 100");
  assert.equal(luckPoints(3, [1, 10], 5).filter(point => point.selected).length, 2);
  for (const number of [0, -1, 11, 1.5, NaN]) assert.equal(selectLuckPoints(10, [], 0, number), null);
});
