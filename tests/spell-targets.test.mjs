import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { SPELL_TARGETS, SPELL_TARGET_BY_ID, spellTargetLabel } from "../scripts/data/spell-targets.mjs";
import { spellTargetUpdate } from "../scripts/migrations/spell-content.mjs";

test("every spell, sign, ritual, hex and invocation names who or what it affects", () => {
  assert.equal(CORE_MAGIC.length, 124);
  for (const entry of CORE_MAGIC) {
    assert.ok(entry.system.target.length, entry.id);
    for (const target of entry.system.target) assert.ok(SPELL_TARGETS[target], `${entry.id}: ${target}`);
  }
  const ids = new Set(CORE_MAGIC.map(entry => entry.id));
  assert.deepEqual(Object.keys(SPELL_TARGET_BY_ID).filter(id => !ids.has(id)), []);
});

test("range and target agree where the book is explicit", () => {
  for (const entry of CORE_MAGIC) {
    const { range, target } = entry.system;
    if (range.kind === "cone") assert.ok(target.includes("area"), `${entry.id}: a cone hits an area`);
    if (target.length === 1 && target[0] === "self") assert.ok(!["radius", "cone"].includes(range.kind) || entry.id === "invocation.symbol-hidden", entry.id);
  }
  assert.equal(spellTargetLabel(["self", "creature"]), "Заклинатель или Одно существо");
  assert.deepEqual(SPELL_TARGET_BY_ID["spell.dispel"], ["magic"]);
  assert.deepEqual(SPELL_TARGET_BY_ID["sign.axii"], ["creature"]);
  assert.deepEqual(SPELL_TARGET_BY_ID["sign.aard"], ["area"]);
});

test("the compendium sources carry the targets and the migration fills only empty ones", async () => {
  const sources = JSON.parse(await readFile(new URL("../pack-sources/spells.json", import.meta.url), "utf8"));
  assert.ok(sources.every(source => source.system.target.length));
  const stock = { type: "spell", system: { ruleId: "spell.aenye", target: [] } };
  assert.deepEqual(spellTargetUpdate(stock), { "system.target": ["creature"] });
  assert.deepEqual(spellTargetUpdate({ ...stock, system: { ...stock.system, target: ["area"] } }), {});
  assert.deepEqual(spellTargetUpdate({ type: "spell", system: { ruleId: "custom.my-spell", target: [] } }), {});
  assert.deepEqual(spellTargetUpdate({ type: "equipment", system: { ruleId: "spell.aenye" } }), {});
});
