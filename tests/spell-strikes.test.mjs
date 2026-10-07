import test from "node:test";
import assert from "node:assert/strict";
import { spellDefenses, spellTraits, targetsOthers } from "../scripts/magic/spell-strikes.mjs";
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
  assert.deepEqual(dimeritiumState(mage([ring, ingots])), { nearby: 4, touching: false });
  assert.equal(dimeritiumModifiers(dimeritiumState(mage([ring, ingots])))[0].value, -4);
  assert.equal(dimeritiumState(mage([{ ...ring, system: { ...ring.system, equipped: true } }])).touching, true);
  assert.equal(dimeritiumModifiers({ nearby: 0, touching: true })[0].value, -1000);
  assert.equal(dimeritiumState({ ...mage([ring]), system: { details: { race: "witcher" } } }), null);
  assert.equal(dimeritiumState(mage([])), null);
  assert.equal(dimeritiumResult(12).status, "nausea"); assert.equal(dimeritiumResult(9).damage, "1d6"); assert.match(dimeritiumResult(18).text, /чешется/);
  assert.match(castingComponents(4), /слова/); assert.match(castingComponents(8), /только пассы/); assert.match(castingComponents(10), /любой частью тела/);
});

test("magical fumble rows follow the table on p.166", async () => {
  const { fumbleRow, ELEMENT_STATUS } = await import("../scripts/magic/magic-fumble.mjs");
  assert.equal(fumbleRow(0), null);
  assert.equal(fumbleRow(3).id, "crackle"); assert.equal(fumbleRow(6).id, "crackle");
  assert.equal(fumbleRow(7).id, "backfire"); assert.equal(fumbleRow(9).id, "backfire");
  assert.equal(fumbleRow(10).id, "explosion");
  assert.deepEqual(ELEMENT_STATUS, { earth: "stunned", fire: "burning", water: "frozen" });
});
