import test from "node:test";
import assert from "node:assert/strict";
import { parseDamageTypes, weaponDamageTraits, layeredStoppingPower, criticalLevel, resolveDamage } from "../scripts/combat/damage-rules.mjs";
import { criticalWoundByRoll, aimedCriticalRoll } from "../scripts/data/critical-wounds.mjs";

const armor = (sp, resistances = []) => ({ sp, resistances, layers: sp ? [{ name: "Броня", sp }] : [], ablate: sp ? ["armor"] : [] });
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
  assert.equal(blocked.total, 3); assert.equal(blocked.penetrated, false); assert.deepEqual(blocked.ablate, []);
  const through = hit({ base: 12, armor: armor(10) });
  assert.equal(through.total, 2); assert.deepEqual(through.ablate, ["armor"]);
  const layered = hit({ base: 30, armor: { sp: 24, resistances: [], layers: [{ name: "Гамбезон", sp: 3 }, { name: "Бригантина", sp: 12 }, { name: "Латы", sp: 20 }], ablate: ["g", "b", "p"] } });
  assert.deepEqual(layered.ablate, ["g", "b", "p"], "a penetrating hit wears every layer by 1");
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

test("a player's group initiative: allies without initiative or own combatants only; the GM re-checks the posted roll", async () => {
  const { eligibleMembers, applyGroupInitiativeRequest } = await import("../scripts/combat/group-initiative.mjs");
  const player = { id: "p", isGM: false };
  const member = (id, disposition, { initiative = null, owned = false, ref = 5 } = {}) => ({ id, name: id, initiative, actor: { system: { statistics: { initiative: ref } } },
    token: { disposition }, testUserPermission: user => owned && user.id === "p" });
  const list = [member("hero", 1, { owned: true, ref: 10 }), member("ally", 1, { ref: 8 }), member("rolled", 1, { initiative: 12 }), member("foe", -1)];
  let written;
  const combat = { id: "c", combatants: Object.assign(list, { get: id => list.find(entry => entry.id === id) }), updateEmbeddedDocuments: async (_type, rows) => { written = rows; } };
  assert.deepEqual(eligibleMembers(combat, list[0], player).map(entry => entry.id), ["hero", "ally"]);
  const message = { author: { id: "p" }, rolls: [{ total: 7 }], flags: { "witcher-eliott-system": { groupInitiative: { combat: "c", leader: "hero", members: ["hero", "ally", "rolled", "foe"], die: 7 } } } };
  globalThis.game = { messages: { get: () => message }, users: { get: () => player } };
  await applyGroupInitiativeRequest(combat, list[0], { message: "m", requester: "p" });
  assert.deepEqual(written, [{ _id: "hero", initiative: 17 }, { _id: "ally", initiative: 15 }], "foes and already-rolled allies are ignored");
  message.flags["witcher-eliott-system"].groupInitiative.die = 10;
  await assert.rejects(applyGroupInitiativeRequest(combat, list[0], { message: "m", requester: "p" }), /не найден/);
  delete globalThis.game;
});

test("random attacks leave the zone unresolved; choosing a head applies the aiming penalty", async () => {
  const { weaponAttack } = await import("../scripts/combat/weapon-rules.mjs");
  const weapon = { id: "sword", type: "weapon", name: "Sword", system: { hands: 1, grip: 1, category: "melee", skill: "swordsmanship", damage: "2d6", accuracy: 0, quantity: 1, carried: true, equipped: true, reliability: { value: 10, max: 10 } } };
  const items = [weapon]; items.get = id => items.find(entry => entry.id === id);
  const actor = { type: "character", items, effects: [], system: { attributes: {}, skills: { swordsmanship: 5 }, abilityState: {}, statistics: { effective: { reflex: 6, body: 6 }, modifiers: [] }, combatAction: {} } };
  const plain = weaponAttack(actor, weapon);
  assert.equal(plain.aim.id, "random");
  assert.equal(plain.aim.penalty, 0);
  assert.equal(weaponAttack(actor, weapon, { location: "head" }).total, plain.total - 6, "aiming still costs −6");
});

test("damage resistance comes from item properties (with upgrades), fire maps to elemental, creatures have their own", async () => {
  const { resistancesFromText, creatureResistances, conditionResistant, armorAt } = await import("../scripts/combat/damage-rules.mjs");
  assert.deepEqual(resistancesFromText("Сопротивление дробящему и колющему урону; +1 к Скрытности"), ["piercing", "bludgeoning"]);
  assert.deepEqual(resistancesFromText("Сопротивление огню и дробящему урону"), ["bludgeoning", "elemental"]);
  assert.deepEqual(resistancesFromText("−2 к Сопротивлению убеждению; Сопротивление яду"), [], "non-damage resistances are not damage types");
  const items = Object.assign([], { get: () => null });
  const npc = { type: "npc", items, system: { creature: { resistances: "Р, огонь; яд", naturalArmor: 4 } } };
  assert.deepEqual(creatureResistances(npc).sort(), ["elemental", "slashing"]);
  assert.equal(conditionResistant(npc, "poison"), true);
  assert.equal(conditionResistant(npc, "bleeding"), false);
  const armor = armorAt(npc, "torso");
  assert.equal(armor.sp, 4); assert.deepEqual(armor.resistances.sort(), ["elemental", "slashing"]);
});

test("bleeding ticks 2, halved by resistance and suspended by a clotting powder", async () => {
  const { bleedingDamage } = await import("../scripts/combat/poison-damage.mjs");
  const effect = status => ({ statuses: new Set([status]), disabled: false, isSuppressed: false, duration: {} });
  const actor = (statuses, resistances = "") => ({ type: "npc", items: Object.assign([], { get: () => null }), effects: statuses.map(effect), system: { creature: { resistances } } });
  assert.equal(bleedingDamage(actor(["bleeding"])), 2);
  assert.equal(bleedingDamage(actor(["bleeding"], "кровотечение")), 1);
  assert.equal(bleedingDamage(actor(["bleeding", "clotting"])), 0);
  assert.equal(bleedingDamage(actor([])), 0);
});

test("blocking: per item, bare-handed with Brawling, and only a shield stops missiles", async () => {
  const { defenseQuote } = await import("../scripts/combat/defense-rolls.mjs");
  const sword = { id: "sword", type: "weapon", name: "Меч", system: { hands: 1, grip: 1, category: "melee", skill: "swordsmanship", quantity: 1, carried: true, equipped: true, reliability: { value: 10, max: 10 } } };
  const items = [sword]; items.get = id => items.find(entry => entry.id === id);
  const actor = { isOwner: true, type: "character", items, effects: [], system: { attributes: {}, abilityState: {}, skills: { swordsmanship: 6, brawling: 3 }, stamina: { value: 20 },
    statistics: { effective: { reflex: 7, speed: 6 }, modifiers: [] } } };
  globalThis.foundry ??= { utils: {} };
  const armed = defenseQuote(actor, { mode: "block", itemId: "sword" }), bare = defenseQuote(actor, { mode: "block", itemId: "" });
  assert.equal(armed.skillKey, "swordsmanship"); assert.equal(armed.limb, false); assert.equal(armed.weaponName, "Меч");
  assert.equal(bare.skillKey, "brawling"); assert.equal(bare.limb, true); assert.equal(bare.name, "Блок рукой"); assert.equal(bare.blocked, "");
  assert.match(defenseQuote(actor, { mode: "block", itemId: "", incoming: "ranged" }).blocked, /только щитом/);
  const parry = defenseQuote(actor, { mode: "parry", itemId: "" });
  assert.equal(parry.name, "Парирование рукой"); assert.equal(parry.penalty, -3); assert.equal(parry.limb, false);
});

test("burning: 5 per body part minus that zone's SP, fire resistance halves, vulnerability doubles", async () => {
  const { burningDamage, burningParts } = await import("../scripts/combat/burning.mjs");
  const effect = status => ({ statuses: new Set([status]), disabled: false, isSuppressed: false, duration: {} });
  const items = Object.assign([], { get: () => null });
  const creature = (extra = {}) => ({ type: "npc", items, effects: [effect("burning")], system: { creature: { category: "humanoid", naturalArmor: 2, resistances: "", ...extra } } });
  assert.equal(burningParts(creature()).length, 6);
  assert.equal(burningDamage(creature()).total, 6 * 3, "SP 2 everywhere: 3 per part");
  assert.equal(burningDamage(creature({ resistances: "огонь" })).total, 6 * 1, "resistance halves the 3 → 1");
  assert.equal(burningDamage({ ...creature(), effects: [] }), null);
  const beast = creature({ category: "beast", naturalArmor: 0, hasTailOrWings: true });
  assert.equal(burningParts(beast).length, 5);
});

test("grapple options follow who holds whom; a pinned creature may still try to break free", async () => {
  const { grappleOptions, punchFormula } = await import("../scripts/combat/grapple.mjs");
  const effect = (status, grapple) => ({ statuses: new Set([status]), disabled: false, isSuppressed: false, duration: {}, flags: { "witcher-eliott-system": { grapple, condition: status === "pinned" ? { incapacitated: true } : {} } } });
  globalThis.fromUuidSync = () => null;
  const actor = effects => ({ type: "character", isOwner: true, effects, items: [], system: { skills: { brawling: 4, dodgeEscape: 5 }, attributes: {}, abilityState: {},
    statistics: { effective: { reflex: 6, body: 7 }, modifiers: [] } } });
  const free = Object.fromEntries(grappleOptions(actor([])).map(option => [option.kind, option.disabled]));
  assert.deepEqual(free, { grapple: false, pin: true, choke: true, throw: true, escape: true });
  const holding = Object.fromEntries(grappleOptions(actor([effect("grappling", { target: "T", targetName: "Бандит" })])).map(option => [option.kind, option.disabled]));
  assert.deepEqual(holding, { grapple: true, pin: false, choke: false, throw: false, escape: true });
  const pinned = grappleOptions(actor([effect("grappled", { by: "G" }), effect("pinned", { by: "G" })]));
  assert.equal(pinned.find(option => option.kind === "escape").disabled, false, "escape stays open while pinned");
  assert.equal(pinned.find(option => option.kind === "grapple").disabled, true);
  assert.equal(punchFormula({ system: { statistics: { effective: { body: 7 } } } }), "1d6+2");
  delete globalThis.fromUuidSync;
});

test("each fumble row becomes the right set of steps with their own dice", async () => {
  const { fumbleOutcome } = await import("../scripts/data/fumbles.mjs");
  const { fumbleSteps } = await import("../scripts/combat/attack-exchange.mjs");
  const ids = (table, magnitude) => fumbleSteps(fumbleOutcome(table, magnitude), null, "").map(step => step.id);
  assert.deepEqual(ids("melee", 6), ["status"]);
  assert.deepEqual(ids("melee", 7), ["stuck"]);
  assert.deepEqual(ids("melee", 8), ["reliability"]);
  assert.deepEqual(ids("melee", 9), ["self"]);
  assert.deepEqual(ids("melee", 12), ["ally"]);
  assert.deepEqual(ids("armedDefense", 7), ["disarm"]);
  assert.deepEqual(ids("armedDefense", 8), ["status", "stun"]);
  assert.deepEqual(ids("ranged", 8), ["jam"]);
  assert.deepEqual(ids("unarmed", 9), ["status", "head", "stun"]);
  assert.deepEqual(ids("melee", 3), []);
});

test("concealment: attackers' owners and the GM see everything; creature numbers stay with their owners", async () => {
  const { attackConcealed, creatureDetailsHidden } = await import("../scripts/chat/concealment.mjs");
  const settings = { concealAttackRolls: true, concealCreatureDetails: true };
  globalThis.game = { user: { isGM: false }, settings: { get: (_scope, key) => settings[key] } };
  const monster = { type: "npc", isOwner: false }, hero = { type: "character", isOwner: true };
  assert.equal(attackConcealed({ speakerActor: monster }), true);
  assert.equal(attackConcealed({ speakerActor: hero }), false);
  assert.equal(creatureDetailsHidden(monster), true);
  assert.equal(creatureDetailsHidden({ type: "character", isOwner: false }), false, "other players' characters are not creatures");
  game.user.isGM = true;
  assert.equal(attackConcealed({ speakerActor: monster }), false);
  assert.equal(creatureDetailsHidden(monster), false);
  game.user.isGM = false; settings.concealAttackRolls = false;
  assert.equal(attackConcealed({ speakerActor: monster }), false);
  delete globalThis.game;
});

test("debug dice queue parses plain d10 lists and per-die groups", async () => {
  const { parseDebugDice, formatDebugDice } = await import("../scripts/dice/debug-dice.mjs");
  assert.deepEqual(parseDebugDice("10, 4 1"), { 10: [10, 4, 1] });
  assert.deepEqual(parseDebugDice("d6: 6, 7; d10: 1"), { 6: [6], 10: [1] }, "7 is not a d6 face");
  assert.deepEqual(parseDebugDice(""), {});
  assert.equal(formatDebugDice({ 6: [6], 10: [] }), "d6: 6");
});

test("a stuck, jammed or knocked-away weapon cannot be used while its effect lasts", async () => {
  const { weaponReadiness } = await import("../scripts/combat/weapon-rules.mjs");
  const sword = { id: "sword", type: "weapon", name: "Меч", system: { hands: 1, grip: 1, category: "melee", quantity: 1, carried: true, equipped: true, reliability: { value: 10, max: 10 } } };
  const items = [sword]; items.get = id => items.find(entry => entry.id === id);
  const actor = { items, effects: [] };
  assert.equal(weaponReadiness(actor, sword), "");
  actor.effects.push({ disabled: false, isSuppressed: false, name: "Оружие застряло: Меч", flags: { "witcher-eliott-system": { weaponBlock: { itemId: "sword", reason: "stuck" } } } });
  assert.equal(weaponReadiness(actor, sword), "Оружие застряло");
});
