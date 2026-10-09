import test from "node:test";
import assert from "node:assert/strict";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { spellStrikeDamage, applySpellHit, magicShieldPlan, castEffectSource, selfEffectOf, spellHitProfile, endedSustainedEffects } from "../scripts/magic/spell-effects.mjs";
import { strikeAttack } from "../scripts/magic/spell-strikes.mjs";

const magic = id => CORE_MAGIC.find(entry => entry.id === id);
function runtime(totals = []) {
  globalThis.game = { time: { worldTime: 0 }, combat: null, i18n: { localize: text => text } };
  globalThis.foundry = { utils: { mergeObject: (a, b) => Object.assign(a, b) },
    dice: { Roll: class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = totals.length ? totals.shift() : 1; return this; } } },
    documents: { ActiveEffect: { getEffectStart: () => ({ time: 0 }) } } };
}
const target = (extra = {}) => {
  const actor = { type: "npc", items: [], effects: [], system: { statistics: { stun: 6 }, creature: {} }, ...extra,
    async createEmbeddedDocuments(_type, sources) { this.effects.push(...sources.map(source => ({ ...source, statuses: new Set(source.statuses ?? []) }))); return sources; } };
  return actor;
};

test("Igni and Firestream deal 1d6 per Stamina put into the sign; other magic keeps its printed damage", () => {
  assert.equal(spellStrikeDamage(magic("sign.igni").system, 5), "5d6");
  assert.equal(spellStrikeDamage(magic("sign.firestream").system, 3), "3d6");
  assert.equal(spellStrikeDamage(magic("spell.aenye").system, 5), "4d6");
  runtime();
  const attack = strikeAttack({ id: "i", name: "Игни", uuid: "Actor.a.Item.i", system: magic("sign.igni").system }, { uuid: "T.c" }, { uuid: "T.t" }, { power: 4 });
  assert.equal(attack.damage, "4d6"); assert.equal(attack.ruleId, "sign.igni"); assert.equal(attack.power, 4); assert.equal(attack.blockable, true);
});

test("a hit by Aenye sets the target on fire with its printed chance", async () => {
  runtime([60]);
  const actor = target();
  const { notes } = await applySpellHit(actor, { ruleId: "spell.aenye", name: "Энье", power: 5 });
  assert.equal(actor.effects.length, 1); assert.ok(actor.effects[0].statuses.has("burning")); assert.match(notes[0], /60 ≤ 75%/);
  runtime([90]);
  const lucky = target();
  await applySpellHit(lucky, { ruleId: "spell.aenye", name: "Энье" });
  assert.equal(lucky.effects.length, 0);
});


test("Aard knocks down when the d100 is within 10% per Stamina", async () => {
  runtime([25]);
  const struck = target();
  const { notes } = await applySpellHit(struck, { ruleId: "sign.aard", name: "Аард", power: 3 });
  assert.deepEqual(struck.effects.map(effect => [...effect.statuses][0]), ["staggered", "prone"]); assert.match(notes.join(" "), /25 ≤ 30%/);
  runtime([31]);
  const standing = target();
  await applySpellHit(standing, { ruleId: "sign.aard", name: "Аард", power: 3 });
  assert.deepEqual(standing.effects.map(effect => [...effect.statuses][0]), ["staggered"]);
  runtime([4]);
  const axii = target();
  const result = await applySpellHit(axii, { ruleId: "sign.axii", name: "Аксий", power: 5 });
  assert.match(result.notes[0], /нужно меньше 3, штраф −3|нужно меньше 3, штраф -3/); assert.ok(axii.effects[0].statuses.has("stunned"));
});

test("blindness lasts the rolled rounds; an immune creature is spared", async () => {
  runtime([4]);
  const actor = target();
  await applySpellHit(actor, { ruleId: "spell.korath-breath", name: "Дыхание Кората" });
  assert.ok(actor.effects[0].statuses.has("blinded")); assert.equal(actor.effects[0].duration.value, 4);
  assert.equal(spellHitProfile(magic("spell.zephyr").system), null, "Zephyr's push is left to the table");
});

test("Quen and Active Shield soak attack damage before armor, then vanish at zero", () => {
  const shield = hp => ({ id: `q${hp}`, disabled: false, flags: { "witcher-eliott-system": { magicShield: { hp, max: 15, name: "Квен" } } } });
  const plan = magicShieldPlan({ effects: [shield(15)] }, 9);
  assert.deepEqual([plan.absorbed, plan.remaining], [9, 0]);
  assert.equal(plan.updates[0].name, "Квен (щит 6/15)");
  const broken = magicShieldPlan({ effects: [shield(6)] }, 10);
  assert.deepEqual([broken.absorbed, broken.remaining, broken.deletes], [6, 4, ["q6"]]);
});

test("a cast of Quen makes a 5-per-Stamina shield for 10 rounds; Glamour gives its skill bonuses", async () => {
  runtime([3]);
  const caster = { uuid: "Actor.w" };
  const quen = { id: "q", name: "Квен", img: "", uuid: "Actor.w.Item.q", parent: caster, system: magic("sign.quen").system };
  const source = await castEffectSource({}, quen, selfEffectOf(quen.system), 4);
  assert.equal(source.flags["witcher-eliott-system"].magicShield.hp, 20); assert.equal(source.duration.value, 10);
  assert.match(source.description, /@UUID\[Actor\.w\.Item\.q\]\{Квен\}/);
  const glamour = { id: "g", name: "Очарование", img: "", uuid: "Actor.w.Item.g", parent: caster, system: magic("spell.glamour").system };
  const charm = await castEffectSource({}, glamour, selfEffectOf(glamour.system), 5);
  assert.deepEqual(charm.flags["witcher-eliott-system"].condition.modifiers.map(modifier => modifier.target), ["skills.seduction", "skills.charisma", "skills.leadership"]);
  assert.equal(charm.duration.seconds, 3 * 3600);
  const held = { uuid: "Actor.w", system: { magic: { sustainedId: "" } }, effects: [{ id: "as", flags: { "witcher-eliott-system": { castEffect: { sustained: true, spellId: "s", caster: "Actor.w" } } } }] };
  assert.deepEqual(endedSustainedEffects(held), ["as"], "Active Shield ends with the concentration");
  const friend = { uuid: "Actor.f", system: { magic: { sustainedId: "" } }, effects: [{ id: "bh", flags: { "witcher-eliott-system": { castEffect: { sustained: true, spellId: "s", caster: "Actor.w" } } } }] };
  assert.deepEqual(endedSustainedEffects(friend, { uuid: "Actor.w", system: { magic: { sustainedId: "s" } } }), [], "still held by the caster");
  assert.deepEqual(endedSustainedEffects(friend, held), ["bh"], "the ally's blessing ends with the caster's concentration");
});

test("Magical Healing restores 3 HP at the start of each turn while it lasts", async () => {
  runtime([4]);
  const spell = { id: "h", name: "Магическое исцеление", img: "", uuid: "Actor.m.Item.h", parent: { uuid: "Actor.m" }, system: magic("spell.magic-healing").system };
  const { applyBuff, buffOf } = await import("../scripts/magic/spell-effects.mjs");
  const friend = target({ name: "Друг", isOwner: true });
  friend.deleteEmbeddedDocuments = async () => {};
  assert.deepEqual(await applyBuff({ name: "Маг" }, spell, 5, [friend]), ["Друг"]);
  const effect = friend.effects[0];
  assert.equal(effect.flags["witcher-eliott-system"].magicHealing, 3); assert.equal(effect.duration.value, 4);
  const { regenerationAtStart } = await import("../scripts/workshop/witcher-elixirs.mjs");
  const healed = regenerationAtStart({ ...friend, effects: [{ ...effect, statuses: new Set(), disabled: false }], items: [], system: { creature: {} } });
  assert.equal(healed.total, 3);
  assert.ok(buffOf(magic("invocation.animal-strength").system));
});

test("a hex reaches its victim like a spell, and a failed Resist Magic leaves the hex until it is lifted", async () => {
  const { strikeable } = await import("../scripts/magic/spell-strikes.mjs");
  const { hexEffect } = await import("../scripts/magic/spell-effects.mjs");
  const hex = { id: "h", name: "Вечный зуд", uuid: "Actor.m.Item.h", system: magic("hex.eternal-itch").system };
  const message = cast => ({ flags: { "witcher-eliott-system": { magicCast: { spellId: "h", kind: "hex", ...cast } } }, speakerActor: { items: { get: () => hex } } });
  assert.equal(strikeable(message({})), hex, "the victim gets a Resist Magic defense");
  assert.equal(strikeable(message({ reflected: true })), null, "a reflected hex has no victim to strike");
  runtime();
  const attack = strikeAttack(hex, { uuid: "T.c" }, { uuid: "T.t" }, { power: 4 });
  assert.deepEqual(attack.defenses, ["resist"]); assert.ok(!attack.damage); assert.equal(attack.hex.danger, "low");
  const effect = hexEffect(attack);
  assert.equal(effect.name, "Порча: Вечный зуд");
  assert.match(effect.description, /Образование СЛ 16 или Подготовка ведьмака СЛ 14/); assert.match(effect.description, /Снятие:/);
  const modifiers = effect.flags["witcher-eliott-system"].condition.modifiers;
  assert.ok(modifiers.every(modifier => modifier.value === -1)); assert.ok(modifiers.some(modifier => modifier.target === "skills.swordsmanship"));
  assert.ok(modifiers.some(modifier => modifier.target === "attributeCheck"));
  runtime();
  const victim = target();
  await applySpellHit(victim, { ...attack, name: "Вечный зуд" });
  assert.equal(victim.effects[0].name, "Порча: Вечный зуд");
});
