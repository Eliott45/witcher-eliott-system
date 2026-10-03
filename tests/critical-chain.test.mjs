import assert from "node:assert/strict";
import { test } from "node:test";
import { witcherCritical, registerCriticalDice } from "../scripts/dice/critical-chain.mjs";
import { prepareCriticalResult } from "../scripts/chat/critical-result.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

const examples = [
  [[10, 4], 14], [[10, 10, 7], 27], [[10, 10, 10, 2], 32], [[10, 1], 11],
  [[1, 4], -4], [[1, 1], -1], [[1, 10, 3], -13], [[1, 10, 10, 6], -26], [[1, 10, 1], -11]
];

async function evaluate(values) {
  const remaining = values.slice(1);
  const die = { faces: 10, options: {}, results: [{ result: values[0], active: true }],
    async roll({ explode }) {
      assert.equal(explode, true);
      assert.ok(remaining.length, "The chain rolled past its last 1–9");
      const result = { result: remaining.shift(), active: true };
      this.results.push(result);
      return result;
    }
  };
  await witcherCritical.call(die, "wc");
  assert.equal(remaining.length, 0, "Every 10 must continue the chain");
  return die;
}

test("all nine requested positive and negative chains produce the exact totals", async () => {
  for (const [values, expected] of examples) {
    const die = await evaluate(values);
    assert.equal(die.results.reduce((sum, result) => sum + (result.count ?? result.result), 0), expected, values.join(" → "));
    assert.deepEqual(die.options[SYSTEM_ID].criticalChains, [{ kind: values[0] === 1 ? "fumble" : "critical", results: values, total: expected }]);
    assert.ok(die.results.every(result => result.active && !result.discarded && !result.hidden), "DSN must see every natural face, including the first 1");
    assert.ok(die.results.slice(0, -1).every(result => result.exploded), "DSN must receive the successive-throw markers");
    assert.equal(die.results.at(-1).exploded, undefined);
  }
});

test("ordinary 2–9 rolls do not continue; a chain cannot be applied twice", async () => {
  for (let value = 2; value < 10; value++) {
    const die = await evaluate([value]);
    assert.deepEqual(die.options[SYSTEM_ID].criticalChains, []);
    assert.equal(die.results[0].count, undefined);
  }
  const die = await evaluate([1, 10, 1]);
  const saved = structuredClone(die.results);
  assert.equal(await witcherCritical.call(die, "wc"), false);
  assert.deepEqual(die.results, saved);
});

test("separate initial dice determine independent signs; later 1s never start another chain", async () => {
  const remaining = [1, 10, 3];
  const die = { faces: 10, options: {}, results: [10, 1].map(result => ({ result, active: true })),
    async roll() { const result = { result: remaining.shift(), active: true }; this.results.push(result); return result; }
  };
  await witcherCritical.call(die, "wc");
  assert.deepEqual(die.options[SYSTEM_ID].criticalChains.map(chain => chain.results), [[10, 1], [1, 10, 3]]);
  assert.equal(die.results.reduce((sum, result) => sum + (result.count ?? result.result), 0), -2);
});

test("a runaway chain fails instead of publishing a silently truncated check", async () => {
  const die = { faces: 10, options: {}, results: [{ result: 10, active: true }],
    async roll() { const result = { result: 10, active: true }; this.results.push(result); return result; }
  };
  await assert.rejects(witcherCritical.call(die, "wc"), /Maximum Witcher critical chain/);
  assert.equal(die.results.length, 1001);
});

test("registration adds only the explicit wc modifier and preserves ordinary dice modifiers", () => {
  const explode = () => {};
  globalThis.CONFIG = { Dice: { terms: { d: { MODIFIERS: { x: explode } } } } };
  registerCriticalDice();
  assert.equal(CONFIG.Dice.terms.d.MODIFIERS.x, explode);
  assert.equal(CONFIG.Dice.terms.d.MODIFIERS.wc, witcherCritical);
});

test("chat shows the signed chain and full check; a positive bonus never hides a natural fumble", async () => {
  globalThis.game = { i18n: { localize: key => key } };
  const die = await evaluate([1, 10, 3]);
  const message = { flags: { [SYSTEM_ID]: { luck: { bonus: 4 } } }, flavor: "Skill check",
    rolls: [{ dice: [die], total: 11 }], // Base 20 − 13 + 4 = 11.
    updateSource(changes) { this.flavor = changes.flavor; this.flags[SYSTEM_ID].criticalResult = true; }
  };
  prepareCriticalResult(message);
  assert.match(message.flavor, /fumble/);
  assert.match(message.flavor, /FirstOne/);
  assert.match(message.flavor, />1<.*>10<.*>3</s);
  assert.match(message.flavor, /20 − 13 \+ 4 = 11/);
  const once = message.flavor;
  prepareCriticalResult(message);
  assert.equal(message.flavor, once, "Reposting a completed message must not duplicate its chain");
});
