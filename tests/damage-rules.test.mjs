import test from "node:test";
import assert from "node:assert/strict";
import { parseDamageTypes, weaponDamageTraits, layeredStoppingPower, criticalLevel, resolveDamage } from "../scripts/combat/damage-rules.mjs";
import { criticalWoundByRoll, aimedCriticalRoll } from "../scripts/data/critical-wounds.mjs";

const armor = (sp, resistances = []) => ({ sp, resistances, layers: sp ? [{ name: "Броня", sp }] : [], ablate: sp ? "armor" : null });
const traits = (properties = "", damageType = "Р/К") => weaponDamageTraits({ properties, damageType });
const hit = options => resolveDamage({ location: "torso", multiplier: 1, traits: traits(), armor: armor(0), ...options });

test("damage types and weapon traits are read from catalog fields", () => {
  assert.deepEqual(parseDamageTypes("Р/К"), ["slashing", "piercing"]);
  assert.deepEqual(parseDamageTypes("К/Д"), ["piercing", "bludgeoning"]);
  assert.equal(traits("Пробивающее броню; Метеоритное").piercing, "normal");
  assert.equal(traits("Улучшенное пробивающее броню").piercing, "improved");
  assert.equal(traits("Реликвия; Серебряное (7d6+4)").silverDice, "7d6+4");
  assert.equal(traits("Горение (30%)").types.includes("elemental"), false, "a burn chance is not fire damage");
});

test("layered armor follows the errata example: gambeson 3, brigandine 12, plate 20 → 24", () => {
  assert.equal(layeredStoppingPower([20, 3, 12]), 24);
  assert.equal(layeredStoppingPower([12]), 12);
  assert.equal(layeredStoppingPower([0, 0]), 0);
});

test("SP first, resistance halves what is left, then the location multiplier", () => {
  assert.equal(hit({ base: 20, armor: armor(5) }).total, 15);
  assert.equal(hit({ base: 20, armor: armor(5, ["slashing", "piercing"]) }).total, 7);
  assert.equal(hit({ base: 20, armor: armor(5, ["slashing"]) }).total, 15, "attacker picks the unresisted type");
  assert.equal(hit({ base: 20, armor: armor(5, ["slashing", "piercing"]), traits: traits("Пробивающее броню") }).total, 15);
  assert.equal(hit({ base: 20, armor: armor(10), traits: traits("Улучшенное пробивающее броню") }).total, 15);
  assert.equal(hit({ base: 10, armor: armor(4), location: "head", multiplier: 3 }).total, 18);
  assert.equal(hit({ base: 11, location: "leftArm", multiplier: 0.5 }).total, 5);
});

test("armor ablates only when the weapon damage penetrates; critical bonus ignores armor", () => {
  const blocked = hit({ base: 6, armor: armor(10), critical: { name: "Лёгкое", bonus: 3 } });
  assert.equal(blocked.total, 3); assert.equal(blocked.penetrated, false); assert.equal(blocked.ablate, null);
  const through = hit({ base: 12, armor: armor(10) });
  assert.equal(through.total, 2); assert.equal(through.ablate, "armor");
});

test("monsters halve non-silver damage; silver dice count only against them; fire is exempt", () => {
  assert.equal(hit({ base: 20, monster: true }).total, 10);
  assert.equal(hit({ base: 6, silver: 9, monster: true, traits: traits("Серебряное (3d6)") }).total, 15);
  assert.equal(hit({ base: 6, silver: 9, monster: false, traits: traits("Серебряное (3d6)") }).total, 6);
  assert.equal(hit({ base: 20, monster: true, traits: traits("", "С") }).total, 20);
  assert.equal(hit({ base: 20, monster: true, vulnerableToFire: true, traits: traits("", "С") }).total, 40);
});

test("critical levels by margin and the aimed critical rule", () => {
  assert.equal(criticalLevel(6), null);
  assert.deepEqual([7, 10, 13, 15, 22].map(margin => criticalLevel(margin).id), ["light", "medium", "severe", "deadly", "deadly"]);
  assert.equal(criticalWoundByRoll("medium", 7).id, "broken-ribs");
  assert.equal(criticalWoundByRoll("deadly", 12).id, "decapitation");
  assert.deepEqual([aimedCriticalRoll("head", 4), aimedCriticalRoll("head", 5), aimedCriticalRoll("torso", 2), aimedCriticalRoll("torso", 6), aimedCriticalRoll("leftArm", 1), aimedCriticalRoll("rightLeg", 1)], [11, 12, 6, 9, 4, 2]);
});

test("critical wound effects carry state-dependent modifiers", async () => {
  globalThis.foundry ??= { utils: {} };
  const { woundModifiers, woundEffectData, stabilizeDC } = await import("../scripts/combat/critical-wound-effects.mjs");
  assert.deepEqual(woundModifiers("broken-ribs", "fresh").map(m => [m.target, m.value]), [["attributes.body", -2], ["attributes.reflex", -1], ["attributes.dexterity", -1]]);
  assert.deepEqual(woundModifiers("broken-ribs", "treated").map(m => [m.target, m.value]), [["attributes.body", -1]]);
  assert.deepEqual(woundModifiers("torn-stomach", "fresh").map(m => m.target), ["combat.attack", "combat.defense"]);
  const effect = woundEffectData("fractured-leg", "medium", { locationName: "Левая нога" });
  assert.equal(effect.name, "Крит: Перелом ноги");
  assert.equal(effect.flags["witcher-eliott-system"].condition.modifiers.length, 3);
  assert.deepEqual(["light", "medium", "severe", "deadly"].map(stabilizeDC), [12, 14, 16, 18]);
});

test("fumble consequences follow the subtracted amount and the errata unarmed column", async () => {
  const { fumbleOutcome, fumbleMagnitude } = await import("../scripts/data/fumbles.mjs");
  assert.equal(fumbleOutcome("melee", 4).harmless, true);
  assert.equal(fumbleOutcome("melee", 6).apply.status, "staggered");
  assert.equal(fumbleOutcome("melee", 8).apply.reliability, "1d10");
  assert.equal(fumbleOutcome("armedDefense", 8).apply.stun, true);
  assert.equal(fumbleOutcome("ranged", 12).text.includes("союзника"), true);
  assert.deepEqual(fumbleOutcome("unarmed", 9).apply, { status: "prone", stun: true, headDamage: "1d6", nonLethal: true });
  assert.equal(fumbleOutcome("unarmed", 11).apply.nonLethal, undefined);
  assert.equal(fumbleOutcome("melee", 0), null);
  const roll = { dice: [{ options: { "witcher-eliott-system": { criticalChains: [{ kind: "fumble", total: -7 }] } } }] };
  assert.equal(fumbleMagnitude(roll), 7);
  assert.equal(fumbleMagnitude({ dice: [{ options: {} }] }), 0);
});

test("ganging up counts distinct melee attackers on the target this round, up to the current attack", async () => {
  const { gangingUp } = await import("../scripts/combat/attack-exchange.mjs");
  const attack = (id, attacker, timestamp, extra = {}) => ({ id, timestamp, speakerActor: null,
    flags: { "witcher-eliott-system": { weaponAttack: { attacker, target: "T", combat: { id: "c", round: 2 }, ranged: false, ...extra } } } });
  const messages = [attack("a", "nekker1", 1), attack("b", "nekker1", 2), attack("c", "nekker2", 3), attack("d", "archer", 4, { ranged: true }),
    attack("e", "nekker3", 5, { combat: { id: "c", round: 1 } }), attack("f", "nekker3", 6), attack("g", "nekker4", 7, { target: "other" })];
  globalThis.game = { messages: Object.assign(messages, { filter: Array.prototype.filter }) };
  const byId = id => messages.find(message => message.id === id);
  assert.equal(gangingUp(byId("a")), 0, "the first attacker alone");
  assert.equal(gangingUp(byId("b")), 0, "the same attacker twice is still one");
  assert.equal(gangingUp(byId("c")), 1);
  assert.equal(gangingUp(byId("d")), 0, "ranged attacks never gang up");
  assert.equal(gangingUp(byId("f")), 2, "a previous round does not count");
  delete globalThis.game;
});

test("group initiative: one shared d10 plus each member's own initiative", async () => {
  const { groupInitiative } = await import("../scripts/combat/group-initiative.mjs");
  assert.deepEqual(groupInitiative(7, [{ id: "a", bonus: 10 }, { id: "b", bonus: 8 }, { id: "c", bonus: 6 }]).map(row => row.initiative), [17, 15, 13]);
});

test("layering helpers: zone SP and the limits follow the errata", async () => {
  const { layeringPlan, layeringEncumbrance } = await import("../scripts/data/armor-layers.mjs");
  const armor = (id, zone, armorClass, encumbrance = 0) => ({ id, name: id, type: "armor", system: { zone, armorClass, encumbrance } });
  const worn = [armor("gambeson", "torso", "light"), armor("brigandine", "torso", "medium", 1), armor("helmet", "head", "heavy", 1)];
  assert.deepEqual(layeringPlan(armor("plate", "all", "heavy"), worn).replace, ["helmet"], "a full heavy suit replaces the heavy helmet");
  assert.equal(layeringPlan(armor("cuirass", "torso", "light"), [...worn, armor("plate", "torso", "heavy")]).blocked.includes("3 слоя"), true);
  assert.equal(layeringEncumbrance(worn), 1, "only the layered medium torso piece adds +1; the lone helmet adds nothing");
});
