import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { SKILLS, SKILL_KEYS, skillValue } from "../scripts/data/skills.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "../scripts/data/statistics.mjs";
import { additionalAbilityIds, hasAbility, adjustStubbornness } from "../scripts/data/abilities.mjs";
import { ORIGINS } from "../scripts/data/origins.mjs";
import { skillsContext, skillTooltip } from "../scripts/sheets/skills-context.mjs";
import { rollSkill } from "../scripts/combat/skill-roll.mjs";

const translations = JSON.parse(await readFile(new URL("../lang/ru.json", import.meta.url)));
const localize = key => key.split(".").reduce((object, part) => object?.[part], translations) ?? key;
const format = (key, data) => localize(key).replace(/\{(\w+)\}/g, (_, name) => data[name]);
function character(details = {}) {
  const actor = { uuid: "Actor.skills", isOwner: true, items: [], effects: [] };
  actor.system = {
    attributes: Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 8])),
    health: { value: 40, max: 40 }, stamina: { value: 40, max: 40 }, details,
    skills: Object.fromEntries(SKILL_KEYS.map(key => [key, 0])), languages: [],
    abilityState: { trustEnabled: false, stubbornnessUsed: 0 },
    get statistics() { return deriveStatistics(this, { abilityIds: additionalAbilityIds(actor) }); }
  };
  actor.update = async changes => {
    await Promise.resolve();
    for (const [key, value] of Object.entries(changes)) {
      const path = key.split(".");
      const parent = path.slice(0, -1).reduce((value, part) => value[part], actor);
      parent[path.at(-1)] = value;
    }
  };
  return actor;
}

test("all 50 supplied skills retain their attribute, difficult marker, and mastery text", () => {
  assert.equal(SKILLS.length, 50);
  assert.equal(new Set(SKILLS.map(skill => skill.key)).size, 50);
  assert.equal(SKILLS.filter(skill => skill.complex).length, 10);
  for (const skill of SKILLS) {
    assert.notEqual(localize(skill.label), skill.label);
    const tooltip = skillTooltip(skill.key, localize);
    for (const value of [10, 13, 16, 20]) assert.ok(tooltip.includes(`<b>${value}</b>`));
    assert.ok(!tooltip.includes("WITCHER."));
  }
  for (const origin of ORIGINS) {
    const actor = character({ race: "human", origin: origin.id });
    for (const modifier of actor.system.statistics.modifiers) {
      if (modifier.target.startsWith("skills.")) assert.ok(SKILL_KEYS.includes(modifier.target.slice(7)));
    }
  }
});

test("race, origin and family modifiers stack without changing skill levels; witcher exemptions survive switches", () => {
  const { system } = character({ race: "human", origin: "redania", familyStatus: "north.mage-ward" });
  system.skills.education = 4;
  assert.equal(skillValue(system, "education").total, 14);
  assert.equal(skillValue(system, "education").bonus, 2);
  assert.equal(skillValue(system, "deduction").total, 9);
  system.details.race = "witcher";
  assert.equal(skillValue(system, "education").total, 12);
  assert.equal(skillValue(system, "awareness").total, 9);
  system.details.race = "elf";
  assert.equal(skillValue(system, "education").total, 14);
  assert.equal(skillValue(system, "archery").bonus, 2);
  system.details.race = "dwarf";
  assert.equal(skillValue(system, "physique").total, 9);
  assert.equal(system.statistics.effective.body, 8, "Physique bonus is not a BODY bonus");
  assert.equal(system.skills.education, 4);
  assert.equal(system.skills.archery, 0);
});

test("Trust applies only with the ability and enabled human-target toggle, including a granted ability", () => {
  const actor = character({ race: "human", origin: "temeria" });
  const social = ["charisma", "seduction", "persuasion"];
  const before = social.map(key => skillValue(actor.system, key).total);
  actor.system.abilityState.trustEnabled = true;
  assert.deepEqual(social.map(key => skillValue(actor.system, key).total), before.map(value => value + 1));
  assert.equal(actor.system.statistics.skillBonuses.charisma, 2);
  assert.equal(skillValue(actor.system, "deceit").total, 8);
  actor.system.details.race = "elf";
  assert.equal(hasAbility(actor, "human.trust"), false);
  assert.equal(skillValue(actor.system, "charisma").total, 9);
  actor.items.push({ type: "ability", system: { ruleId: "human.trust" } });
  assert.equal(hasAbility(actor, "human.trust"), true);
  assert.equal(skillValue(actor.system, "charisma").total, 10);
});

test("added abilities keep known mechanics without duplicates, leave custom descriptions inert, and respond to removal", () => {
  const actor = character({ race: "elf" });
  actor.items = ["elf.marksman", "elf.marksman", "human.ingenuity", "witcher.lightning-reflexes", "custom.other"]
    .map(ruleId => ({ type: "ability", system: { ruleId } }));
  assert.equal(skillValue(actor.system, "archery").bonus, 2);
  assert.equal(skillValue(actor.system, "archery").total, 11, "Imported reflexes increase DEX before the skill base");
  assert.equal(skillValue(actor.system, "deduction").bonus, 1);
  actor.items = [];
  assert.equal(skillValue(actor.system, "deduction").bonus, 0);
  assert.equal(skillValue(actor.system, "archery").total, 10);
});

test("wounds and death affect only the linked attribute; languages have independent levels and safe names", () => {
  const actor = character({ race: "human" });
  actor.system.skills.deduction = 5;
  actor.system.health.value = 7;
  assert.equal(skillValue(actor.system, "deduction").total, 10, "4 INT + 5 level + 1 racial");
  actor.system.health.value = 0;
  assert.equal(skillValue(actor.system, "deduction").total, 8, "2 INT + 5 level + 1 racial");
  actor.system.health.value = 40;
  actor.system.languages = [{ id: "common", name: "Всеобщий", level: 8 }, { id: "elder", name: "<script>Старшая речь</script>", level: 3 }];
  assert.equal(skillValue(actor.system, "language", "common").total, 16);
  assert.equal(skillValue(actor.system, "language", "elder").total, 11);
  assert.equal(skillValue(actor.system, "language", "missing"), null);
  const context = skillsContext(actor, { localize, format }, { query: "дедукция" });
  assert.equal(context.groups.flatMap(group => group.rows).length, 49, "All DOM rows survive a filtered re-render so clearing search can reveal them");
  assert.equal(context.groups.flatMap(group => group.rows).filter(row => row.visible).length, 1);
  actor.system.attributes.intelligence = null;
  assert.equal(skillValue(actor.system, "deduction").total, null);
});

test("Stubbornness counter is bounded, serialized, resettable and requires an owned ability", async () => {
  const actor = character({ race: "human" });
  await Promise.all(Array.from({ length: 5 }, () => adjustStubbornness(actor, 1)));
  assert.equal(actor.system.abilityState.stubbornnessUsed, 3);
  await adjustStubbornness(actor, -1);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 2);
  await adjustStubbornness(actor, 0);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 0);
  actor.isOwner = false;
  await adjustStubbornness(actor, 1);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 0);
  actor.isOwner = true;
  actor.system.details.race = "elf";
  await adjustStubbornness(actor, 1);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 0);
  actor.items.push({ type: "ability", system: { ruleId: "human.stubbornness" } });
  await adjustStubbornness(actor, 1);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 1);
});

test("skill checks use the critical chain, privacy, source arithmetic and Luck pipeline, and reject incapacitated rolls", async () => {
  const actor = character({ race: "human", origin: "redania", familyStatus: "north.mage-ward" });
  actor.system.skills.education = 4;
  actor.system.languages = [{ id: "custom", name: '<img src=x onerror="bad()">', level: 3 }];
  let mode, formula, evaluated = 0, sent;
  globalThis.game = { settings: { get: () => mode }, i18n: { localize, format } };
  globalThis.ui = { notifications: { warn: () => {} } };
  globalThis.foundry = {
    dice: { Roll: class {
      constructor(value) { formula = value; }
      async evaluate(options) { evaluated++; assert.equal(options.allowInteractive, mode !== "blind"); return this; }
      async toMessage(data, options) { sent = { data, options }; return sent; }
    } },
    documents: { ChatMessage: { getSpeaker: ({ actor: speaker }) => { assert.equal(speaker, actor); return { actor: "skills" }; } } }
  };
  for (mode of ["public", "private", "blind", "self"]) {
    await rollSkill(actor, "education");
    assert.equal(formula, "1d10wc + 14");
    assert.equal(sent.options.messageMode, mode);
    assert.equal(sent.data.flags["witcher-eliott-system"].skipLuck, undefined);
    assert.equal(sent.data.flags["witcher-eliott-system"].skillCheck.bonus, 2);
    assert.ok(sent.data.flavor.includes("Под опекой мага"));
  }
  await rollSkill(actor, "language", "custom");
  assert.ok(!sent.data.flavor.includes("<img"));
  assert.ok(sent.data.flavor.includes("&lt;img"));
  const count = evaluated;
  for (const status of ["stunned", "exhausted-stun", "unconscious", "dead"]) {
    actor.effects = [{ statuses: new Set([status]) }];
    await rollSkill(actor, "education");
  }
  actor.effects = [];
  await rollSkill(actor, "invalid");
  await rollSkill(actor, "language", "invalid");
  actor.system.attributes.intelligence = null;
  await rollSkill(actor, "education");
  actor.isOwner = false;
  await rollSkill(actor, "courage");
  assert.equal(evaluated, count);
});
