import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EXPERIMENTAL_DEVICES, EXPERIMENTAL_RECIPES } from "../scripts/data/experimental-devices.mjs";
import { UPGRADES } from "../scripts/data/workshop-upgrades.mjs";
import { bombProfile } from "../scripts/combat/bombs.mjs";
import { experimentalDescriptionUpdate } from "../scripts/migrations/experimental-descriptions.mjs";

const stones = UPGRADES.filter(entry => /^(rune|glyph)\./.test(entry.id));
const plain = html => String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("core pp.254–256 items explain their effect in the description, not only in the fields", () => {
  assert.equal(stones.length, 15);
  for (const entry of [...EXPERIMENTAL_DEVICES, ...stones]) assert.ok(plain(entry.system.description).length > 120, entry.id);
  for (const entry of EXPERIMENTAL_RECIPES) assert.match(entry.system.description, /^<p>Результат — .+\. [А-ЯЁ].+\.<\/p>/u, entry.id);
  assert.match(stones.find(entry => entry.id === "rune.perun").system.description, /«Адреналин»/);
  assert.match(stones.find(entry => entry.id === "glyph.magic").system.description, /смешанных элементов/);
});

test("prose does not change what the bomb automation reads", () => {
  for (const entry of EXPERIMENTAL_DEVICES.filter(row => /^(bomb|trap)\./.test(row.id))) {
    const item = { system: { ...entry.system, ruleId: entry.id } };
    assert.deepEqual(bombProfile(item), bombProfile({ system: { ...item.system, description: "" } }), entry.id);
  }
});

test("migration swaps only shipped text and keeps player notes", async () => {
  const sources = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
  const canonical = id => sources.find(row => row.system.ruleId === id).system.description;
  const star = "<p>Горение (100%).</p>";
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "bomb.dancing-star", description: star } }),
    { "system.description": canonical("bomb.dancing-star") });
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "bomb.dancing-star", description: `${star}<p>Мои заметки</p>` } }),
    { "system.description": `${canonical("bomb.dancing-star")}<p>Мои заметки</p>` });
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "rune.veles", description: "" } }),
    { "system.description": canonical("rune.veles") });
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "rune.veles", description: "<p>Своя руна</p>" } }), {});
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "glyph.water", description: "<p>Базовая книга, стр. 256</p>" } }),
    { "system.description": canonical("glyph.water") });
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "formula.bomb.samum",
    description: "<p>Время изготовления — полчаса. Компоненты указаны точно: замена на другие вещества не допускается. Цена самого рецепта в книге не указана.</p>" } }),
    { "system.description": canonical("formula.bomb.samum") });
  for (const row of sources.filter(row => experimentalDescriptionUpdate({ system: row.system })["system.description"]))
    assert.fail(`${row.system.ruleId}: the current source should already be canonical`);
  assert.deepEqual(experimentalDescriptionUpdate({ system: { ruleId: "armor-upgrade.mail", description: "" } }), {});
  for (const entry of [...EXPERIMENTAL_DEVICES, ...stones, ...EXPERIMENTAL_RECIPES])
    assert.ok(experimentalDescriptionUpdate({ system: { ruleId: entry.id, description: "<p>Базовая книга, стр. 256</p>" } })["system.description"], entry.id);
});

test("worlds created before the environment conditions receive them in the effects compendium", async () => {
  const { effectCompendiumSources } = await import("../scripts/migrations/effect-content.mjs");
  const names = effectCompendiumSources().map(source => source.name);
  for (const name of ["Против солнца", "Освещён", "На суше", "В воде", "Под водой", "Касается двимерита"]) assert.ok(names.includes(name), name);
  const sources = JSON.parse(await readFile(new URL("../pack-sources/effects.json", import.meta.url), "utf8"));
  assert.deepEqual(sources.map(source => source._id).sort(), effectCompendiumSources().map(source => source._id).sort());
});
