import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ATTRIBUTE_KEYS, deriveStatistics, stunSucceeded } from "../scripts/data/statistics.mjs";
import { statisticsContext } from "../scripts/sheets/statistics-context.mjs";

const actor = (attributes = {}, health = { value: 50, max: 50 }) => ({
  attributes: { ...Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, null])), ...attributes },
  health, carriedWeight: 0, vigor: 0, luckSpent: [],
  get statistics() { return deriveStatistics(this); }
});

test("derived statistics reproduce the requested 50 HP, 27m run example", () => {
  const data = actor({ body: 10, will: 10, reflex: 10, speed: 9 });
  const stats = data.statistics;
  for (const [key, expected] of Object.entries({ healthMax: 50, staminaMax: 50, recovery: 10,
    stun: 10, woundThreshold: 10, initiative: 10, run: 27, leap: 5, carryMax: 100 })) {
    assert.equal(stats[key], expected, key);
  }
});

test("physical average rounds down before multiplying; Stun alone caps at 10", () => {
  const stats = actor({ body: 4, will: 7, speed: 8 }).statistics;
  assert.equal(stats.healthMax, 25);
  assert.equal(stats.recovery, 5);
  assert.equal(stats.leap, 4);
  const high = actor({ body: 100, will: 100, speed: 100 }, { value: 500, max: 500 }).statistics;
  assert.equal(high.stun, 10);
  assert.equal(high.recovery, 100);
  assert.equal(high.healthMax, 500);
  assert.equal(high.carryMax, 1000);
  assert.equal(high.leap, 60);
});

test("wounds apply strictly below the threshold and do not change resource limits or base stats", () => {
  const data = actor({ body: 10, will: 10, reflex: 9, intelligence: 7, dexterity: 8, speed: 9 }, { value: 10, max: 50 });
  assert.equal(data.statistics.wounded, false);
  assert.equal(data.statistics.initiative, 9);
  data.health.value = 9;
  const stats = data.statistics;
  assert.equal(stats.wounded, true);
  assert.equal(stats.effective.intelligence, 3);
  assert.equal(stats.effective.reflex, 4);
  assert.equal(stats.effective.dexterity, 4);
  assert.equal(stats.effective.will, 5);
  assert.equal(stats.effective.body, 10);
  assert.equal(stats.initiative, 4);
  assert.equal(stats.healthMax, 50);
  assert.equal(stats.staminaMax, 50);
  assert.equal(stats.woundThreshold, 10);
  assert.equal(stats.recovery, 10);
  assert.equal(data.attributes.reflex, 9);
  data.health.value = 10;
  assert.equal(data.statistics.initiative, 9, "Healing removes the derived penalty");
});

test("unknown statistics differ from zero, preserving legacy limits until both physical stats exist", () => {
  const data = actor({}, { value: 21, max: 30 });
  assert.equal(data.statistics.healthMax, null);
  assert.equal(data.statistics.run, null);
  assert.equal(data.statistics.woundThreshold, 6);
  data.attributes.body = 0;
  assert.equal(data.statistics.healthMax, null);
  data.attributes.will = 0;
  data.attributes.speed = 0;
  assert.equal(data.statistics.healthMax, 0);
  assert.equal(data.statistics.stun, 0);
  assert.equal(data.statistics.leap, 0);
});

test("Stun saves succeed strictly below the target, including the endpoints", () => {
  assert.equal(stunSucceeded(9, 10), true);
  assert.equal(stunSucceeded(10, 10), false);
  assert.equal(stunSucceeded(4, 5), true);
  assert.equal(stunSucceeded(5, 5), false);
  assert.equal(stunSucceeded(1, 0), false);
});

test("dying divides eight adjusted stats by three, preserves Luck and base STUN, and replaces wounds", () => {
  const data = actor(Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])), { value: 0, max: 50 });
  data.details = { race: "human", familyStatus: "north.peasants" };
  for (const hp of [0, -20]) {
    data.health.value = hp;
    const stats = data.statistics;
    assert.equal(stats.dying, true);
    for (const key of ATTRIBUTE_KEYS.filter(key => key !== "luck")) assert.equal(stats.effective[key], 3, key);
    assert.equal(stats.effective.luck, 11);
    assert.equal(stats.healthMax, 50);
    assert.equal(stats.staminaMax, 50);
    assert.equal(stats.stun, 10);
    assert.equal(stats.recovery, 10);
    assert.equal(stats.run, 9);
    assert.equal(stats.leap, 1);
    assert.equal(stats.carryMax, 30);
  }
  data.health.value = 1;
  assert.equal(data.statistics.dying, false);
  assert.equal(data.statistics.effective.reflex, 5);
  assert.equal(data.statistics.effective.body, 10);
  assert.equal(deriveStatistics(data, { dying: true }).effective.body, 3, "A manually applied dying effect uses the same penalty");
  assert.equal(deriveStatistics(data, { dead: true }).dead, true);
  assert.equal(deriveStatistics(data, { dead: true }).dying, false);
  assert.equal(actor({}, { value: 0, max: 0 }).statistics.dying, false, "A blank sheet is not dying");
});

test("localized tooltips contain resolved formulas and distinguish resource names", async () => {
  for (const language of ["ru", "en"]) {
    const translations = JSON.parse(await readFile(new URL(`../lang/${language}.json`, import.meta.url), "utf8"));
    const localize = key => key.split(".").reduce((node, part) => node[part], translations);
    const format = (key, data) => localize(key).replace(/\{(\w+)\}/g, (_, part) => data[part]);
    const data = actor({ body: 10, will: 10, reflex: 10, speed: 9 });
    data.carriedWeight = 100.5;
    const context = statisticsContext(data, { localize, format });
    assert.equal(context.attributes.length, 8);
    for (const stat of context.attributes) {
      assert.ok(localize(stat.label));
      assert.ok(localize(stat.short));
      assert.ok(stat.tooltip.length > 40);
    }
    assert.match(context.healthTooltip, /10.*10.*50/);
    assert.match(context.movementRows[2].tooltip, /27.*5/);
    assert.equal(context.carriedWeight, 100.5, "Sheet displays the derived inventory weight");
    assert.ok(!JSON.stringify(context).includes("undefined"));
    data.vigor = 2;
    data.details = { race: "witcher" };
    data.lifepath = { witcher: { school: "griffin" } };
    const vigor = statisticsContext(data, { localize, format });
    assert.equal(vigor.vigorTotal, 4);
    assert.ok(vigor.vigorTooltip.includes(format("WITCHER.Statistics.BaseValue", { value: 2 })));
    assert.ok(vigor.vigorTooltip.includes(format("WITCHER.Statistics.TotalValue", { value: 4 })));
    assert.match(vigor.vigorTooltip, /\+2/);
    assert.ok(!JSON.stringify(context).match(/\{(?:body|will|reflex|maximum|physical|threshold|run|leap)\}/));
    data.attributes.luck = 10;
    data.details = { race: "human", familyStatus: "north.peasants" };
    const luck = statisticsContext(data, { localize, format }).luck;
    assert.equal(luck.maximum, 11);
    assert.match(luck.valueTooltip, /\+1/);
    assert.ok(luck.valueTooltip.includes(localize("WITCHER.Family.NorthPeasants.Name")));
    data.details.race = "witcher";
    data.attributes.empathy = 7;
    const empathy = statisticsContext(data, { localize, format }).attributes.find(stat => stat.key === "empathy");
    assert.equal(empathy.effective, 3);
    assert.match(empathy.valueTooltip, /−4/);
    assert.ok(empathy.valueTooltip.includes(localize("WITCHER.Races.Witcher.DulledEmotions.Name")));
  }
});
