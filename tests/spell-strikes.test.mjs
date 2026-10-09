import test from "node:test";
import assert from "node:assert/strict";
import { spellDefenses, spellTraits, targetsOthers, createSpellStrikes, strikeable } from "../scripts/magic/spell-strikes.mjs";
import { defenseQuote } from "../scripts/combat/defense-rolls.mjs";
import { unawareDC } from "../scripts/combat/attack-exchange.mjs";

test("spell defenses map to defense buttons; no defense means it works without a magical fumble (core p.168)", () => {
  assert.deepEqual(spellDefenses({ defense: ["dodge", "block"] }).defenses, ["dodge", "reposition", "block"]);
  assert.equal(spellDefenses({ defense: ["dodge"] }).unaware, null);
  assert.deepEqual(spellDefenses({ defense: ["resistMagic"] }).defenses, ["resist"]);
  assert.deepEqual(spellDefenses({ defense: ["spellCasting"] }).defenses, ["counter"]);
  const none = spellDefenses({ defense: ["none"] });
  assert.deepEqual(none.defenses, []); assert.equal(none.unaware.dc, 0);
  const will = spellDefenses({ defense: ["willTriple"] });
  assert.equal(unawareDC({ unaware: will.unaware }, { system: { statistics: { effective: { will: 6 } } } }).dc, 18);
  assert.equal(unawareDC({ unaware: none.unaware }, {}).dc, 0);
  assert.deepEqual(spellTraits("fire").types, ["elemental"]);
  assert.deepEqual(spellTraits("earth").types, []);
  assert.equal(targetsOthers({ range: { kind: "self" } }), false);
  assert.equal(targetsOthers({ range: { kind: "radius" } }), true);
});

test("Resist Magic and a counter-casting check are defenses", () => {
  const actor = { isOwner: true, items: { get: () => null }, effects: [], statuses: new Set(), system: { skills: { resistMagic: 5, spellCasting: 3 }, attributes: {}, abilityState: {},
    stamina: { value: 10 }, statistics: { effective: { will: 7, speed: 5 }, modifiers: [] } } };
  globalThis.game ??= {};
  const resist = defenseQuote(actor, { mode: "resist", incoming: "ranged" });
  assert.equal(resist.skillKey, "resistMagic"); assert.equal(resist.name, "Сопротивление магии");
  assert.equal(defenseQuote(actor, { mode: "counter", incoming: "ranged" }).skillKey, "spellCasting");
});

test("dimeritium lowers Vigor by 1 per unit within 5 m and to 0 on contact; witchers are not adepts (core p.167)", async () => {
  const { dimeritiumState, dimeritiumModifiers, dimeritiumResult, isDimeritium } = await import("../scripts/magic/dimeritium.mjs");
  const { castingComponents } = await import("../scripts/magic/rules.mjs");
  const ring = { name: "Кольцо с двимеритом", type: "equipment", system: { ruleId: "dimeritium-ring", quantity: 1, carried: true, equipped: false } };
  const ingots = { name: "Двимерит", type: "equipment", system: { ruleId: "material.dimeritium", quantity: 3, carried: true } };
  assert.equal(isDimeritium({ name: "Чертёж: Двимерит", type: "recipe", system: {} }), false);
  const mage = items => ({ type: "character", items, statuses: new Set(), system: { details: { race: "human" } } });
  assert.deepEqual(dimeritiumState(mage([ring, ingots])), { nearby: 4, touching: false, zone: false, resisted: false });
  assert.equal(dimeritiumModifiers(dimeritiumState(mage([ring, ingots])))[0].value, -4);
  assert.equal(dimeritiumState(mage([{ ...ring, system: { ...ring.system, equipped: true } }])).touching, true);
  assert.equal(dimeritiumModifiers({ nearby: 0, touching: true, zone: false, resisted: false })[0].value, -1000);
  assert.equal(dimeritiumState({ ...mage([ring]), system: { details: { race: "witcher" } } }), null);
  assert.equal(dimeritiumState(mage([])), null);
  assert.equal(dimeritiumResult(12).status, "nauseated"); assert.equal(dimeritiumResult(9).damage, "1d6"); assert.match(dimeritiumResult(18).text, /чешется/);
  assert.match(castingComponents(4), /слова/); assert.match(castingComponents(8), /только пассы/); assert.match(castingComponents(10), /любой частью тела/);
});

test("a bestiary mage's dimeritium vulnerability is a description, not carried metal lowering Vigor", async () => {
  const { dimeritiumState, isDimeritium } = await import("../scripts/magic/dimeritium.mjs");
  const { bestiarySources } = await import("../scripts/data/bestiary.mjs");
  const { deriveStatistics } = await import("../scripts/data/statistics.mjs");
  const mage = bestiarySources().find(source => source.name === "Маг");
  assert.ok(mage.items.some(item => item.type === "ability" && /Двимерит/u.test(item.name)));
  assert.equal(dimeritiumState(mage), null);
  assert.equal(deriveStatistics(mage.system, { items: mage.items, dimeritium: dimeritiumState(mage) }).vigor, 10);
  for (const type of ["ability", "spell", "recipe"]) assert.equal(isDimeritium({ type, name: "Двимерит", system: { ruleId: "dimeritium" } }), false);
  for (const type of ["weapon", "armor", "equipment"]) assert.equal(isDimeritium({ type, name: "Двимеритовый предмет", system: { kind: "container" } }), true);
  mage.items.push({ type: "equipment", name: "Слиток", system: { ruleId: "material.dimeritium", quantity: 2, carried: true } });
  assert.deepEqual(dimeritiumState(mage), { nearby: 2, touching: false, zone: false, resisted: false });
  assert.equal(deriveStatistics(mage.system, { items: mage.items, dimeritium: dimeritiumState(mage) }).vigor, 8);
});

test("magical fumble rows follow the table on p.166", async () => {
  const { fumbleRow, ELEMENT_STATUS } = await import("../scripts/magic/magic-fumble.mjs");
  assert.equal(fumbleRow(0), null);
  assert.equal(fumbleRow(3).id, "crackle"); assert.equal(fumbleRow(6).id, "crackle");
  assert.equal(fumbleRow(7).id, "backfire"); assert.equal(fumbleRow(9).id, "backfire");
  assert.equal(fumbleRow(10).id, "explosion");
  assert.deepEqual(ELEMENT_STATUS, { earth: "stunned", fire: "burning", water: "frozen" });
});

test("extra spell targets inherit the source's private audience; hidden results cannot assign targets", async () => {
  const SYS = "witcher-eliott-system", messages = [];
  const actor = { uuid: "Actor.mage", isOwner: true, isToken: true, effects: [], items: [], system: {} };
  const scene = { id: "scene", grid: { size: 100, distance: 2 } };
  const token = (id, x, owner = { effects: [], items: [], system: {} }) => ({ uuid: `Scene.scene.Token.${id}`, x, y: 0,
    parent: scene, actor: owner, getSize: () => ({ width: 100, height: 100 }) });
  actor.token = token("mage", 0, actor);
  const targets = [token("first", 100), token("second", 200)];
  const item = { id: "spell", name: "Аэни", system: { ruleId: "spell.aenye", element: "fire", damage: "4d6", defense: ["dodge"], range: { kind: "distance", value: 20 } } };
  globalThis.game = { user: { targets: new Set(targets) }, combat: null };
  globalThis.foundry = { documents: { ChatMessage: { getSpeaker: () => ({ actor: "mage" }), create: async data => { messages.push(data); return data; } } } };
  for (const mode of [{ whisper: ["gm"], blind: true }, { whisper: ["player", "gm"], blind: false }, { whisper: [], blind: false }]) {
    const source = { id: "cast", speakerActor: actor, isContentVisible: true, ...mode,
      flags: { [SYS]: { magicCast: { adrenalineDice: 2 } } },
      async update(changes) { this.flags[SYS].weaponAttack = changes[`flags.${SYS}.weaponAttack`]; } };
    const result = await createSpellStrikes(actor, item, source, { total: 23 });
    assert.equal(result.created, 2);
    const secondary = messages.at(-1);
    assert.deepEqual(secondary.whisper, mode.whisper); assert.equal(secondary.blind, mode.blind);
    assert.equal(source.flags[SYS].weaponAttack.adrenalineDice, 2);
    assert.equal(secondary.flags[SYS].weaponAttack.adrenalineDice, 0);
    source.isContentVisible = false;
    assert.equal(strikeable(source), null);
    await assert.rejects(createSpellStrikes(actor, item, source), /Нет доступа/);
  }
  actor.isOwner = false;
  await assert.rejects(createSpellStrikes(actor, item, { isContentVisible: true }), /Нет доступа/);
  assert.equal(messages.length, 3);
});
