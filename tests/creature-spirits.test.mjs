import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { spiritState, spiritConditionImmune, creatureMentalImmunity, creatureEffectImmunity, spellMentalImmunity,
  setSlipIncorporeal, spiritSuppressionSource, creatureSuppression, createSpiritZone, refreshSpiritZones, spiritZoneExpired, processYrdenRequest } from "../scripts/combat/creature-spirits.mjs";
import { armorAt, resolveDamage, weaponDamageTraits, monsterResistant } from "../scripts/combat/damage-rules.mjs";
import { defenseQuote } from "../scripts/combat/defense-rolls.mjs";
import { spellTraits, createSpellStrikes } from "../scripts/magic/spell-strikes.mjs";
import { castingQuote } from "../scripts/magic/casting.mjs";
import { bombProfile, applyBlast } from "../scripts/combat/bombs.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";

function actor(...ids) {
  const items = ids.map(ruleId => ({ type: "ability", system: { ruleId } }));
  items.get = id => items.find(item => item.id === id);
  const owner = { uuid: "Actor.spirit", type: "npc", isOwner: true, items, effects: [], statuses: new Set(),
    system: { creature: { category: "specter" }, health: { value: 80, max: 80 }, stamina: { value: 40, max: 40 }, skills: { spellCasting: 6 },
      abilityState: {}, statistics: { effective: { will: 6, speed: 5 }, modifiers: [] } },
    async createEmbeddedDocuments(type, sources) {
      assert.equal(type, "ActiveEffect");
      const created = sources.map(source => ({ ...structuredClone(source), id: `e${this.effects.length + 1}`, statuses: new Set(source.statuses),
        async update(data) { Object.assign(this, structuredClone(data)); this.statuses = new Set(data.statuses); } }));
      this.effects.push(...created); return created;
    },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); this.effects = this.effects.filter(effect => !ids.includes(effect.id)); }
  };
  return owner;
}
function runtime() {
  const gm = { isGM: true, targets: new Set() };
  globalThis.game = { user: gm, users: { activeGM: gm }, time: { worldTime: 100 }, combat: null,
    settings: { get: () => "public" }, i18n: { localize: text => text } };
  globalThis.foundry = { documents: { ActiveEffect: { getEffectStart: () => ({ time: game.time.worldTime }) },
    ChatMessage: { getSpeaker: () => ({}), create: async data => data } } };
  globalThis.canvas = { ready: false };
}
function sceneFor(owner) {
  const scene = { uuid: "Scene.s", id: "s", grid: { size: 100, distance: 2 }, regions: [], tokens: [],
    async createEmbeddedDocuments(type, sources) {
      assert.equal(type, "Region");
      const docs = sources.map((source, index) => ({ ...source, parent: this, id: `region${this.regions.length + index}`, uuid: `Scene.s.Region.${this.regions.length + index}` }));
      this.regions.push(...docs); return docs;
    }, async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "Region"); this.regions = this.regions.filter(region => !ids.includes(region.id)); } };
  const token = { uuid: "Scene.s.Token.spirit", parent: scene, actor: owner, x: 0, y: 0, width: 1, height: 1 };
  scene.tokens.push(token); owner.isToken = true; owner.token = token; return scene;
}

test("incorporeality blocks physical hits, silver, oil and critical damage without armor wear", () => {
  runtime();
  const target = actor("creature.incorporeal");
  const hit = traits => resolveDamage({ base: 25, silver: 15, traits, armor: armorAt(target, "head"), location: "head", multiplier: 3,
    monster: true, critical: { name: "Смертельное", bonus: 10 }, extra: { label: "Масло", value: 5 } });
  for (const traits of [weaponDamageTraits({ damageType: "Р", properties: "Серебряное (3d6)" }), spellTraits("earth")]) {
    const result = hit(traits);
    assert.equal(result.total, 0); assert.equal(result.immune, true); assert.equal(result.penetrated, false); assert.deepEqual(result.ablate, []);
  }
  assert.ok(hit(spellTraits("fire")).total > 0);
  assert.ok(hit(spellTraits("mixed")).total > 0);
  target.system.creature.spiritMode = "suppressed";
  assert.ok(hit(weaponDamageTraits({ damageType: "Р" })).total > 0);
});

test("noonwraith poison/bleeding immunity follows suppression and actual trait IDs, including renamed imports", () => {
  runtime();
  const noon = bestiarySources().find(source => source.name === "Полуденница"); noon.name = "Переименована"; noon.effects = [];
  for (const status of ["poisoned", "bleeding"]) assert.equal(spiritConditionImmune(noon, [status]), true);
  assert.equal(spiritConditionImmune(noon, ["burning"]), false);
  noon.system.creature.moonlight = true; assert.equal(spiritState(noon).lunarPenalty, -2);
  const dust = spiritSuppressionSource(noon, { kind: "moon-dust" }); noon.effects.push(dust);
  assert.equal(spiritConditionImmune(noon, ["poisoned"]), false);
  dust.duration.expired = true; assert.equal(spiritConditionImmune(noon, ["poisoned"]), true);
  const fake = actor(); fake.items.push({ type: "equipment", name: "Бесплотность", system: { ruleId: "creature.incorporeal" } });
  assert.equal(spiritState(fake).incorporeal, false);
});

test("Slip is a spellcasting defense and grants a single effect ending at the defender's next turn", async () => {
  runtime();
  const wraith = actor("creature.slip", "creature.teleport");
  const combatant = { id: "wraith", actor: wraith, initiative: 14 };
  game.combat = { id: "combat", started: true, round: 3, turn: 0, turns: [{ id: "enemy" }, combatant], combatants: [combatant] };
  const quote = defenseQuote(wraith, { mode: "slip", repeat: true });
  assert.equal(quote.skillKey, "spellCasting"); assert.equal(quote.total, 12); assert.equal(quote.cost, 1); assert.equal(quote.blocked, "");
  assert.equal(await setSlipIncorporeal(wraith), true);
  assert.equal(wraith.effects[0].duration.expiry, "turnStart"); assert.equal(wraith.effects[0].duration.value, 1);
  assert.equal(wraith.effects[0].start.combatant, "wraith"); assert.equal(wraith.effects[0].start.turn, 1);
  assert.equal(spiritState(wraith).incorporeal, true);
  await setSlipIncorporeal(wraith); assert.equal(wraith.effects.length, 1);
  wraith.effects[0].duration.expired = true; assert.equal(spiritState(wraith).incorporeal, false);
  wraith.system.creature.spiritMode = "suppressed";
  assert.match(defenseQuote(wraith, { mode: "slip" }).blocked, /подавлена/);
  assert.equal(await setSlipIncorporeal(wraith), false); assert.equal(spiritState(wraith).canTeleport, false);
  assert.ok(defenseQuote(actor(), { mode: "slip" }).blocked);
});

test("mind/fear immunity blocks only the corresponding magic or effect, not all spells", () => {
  runtime();
  for (const id of ["creature.mindless", "creature.construct"]) {
    const target = actor(id);
    assert.ok(spellMentalImmunity(target, { ruleId: "sign.axii" }));
    assert.ok(spellMentalImmunity(target, { ruleId: "spell.mental-command" }));
    assert.equal(spellMentalImmunity(target, { ruleId: "spell.aenye" }), "");
    assert.ok(creatureEffectImmunity(target, { flags: { [SYSTEM_ID]: { condition: { mental: true } } } }));
  }
  assert.ok(creatureMentalImmunity(actor("creature.fearless"), { fear: true }));
  assert.equal(creatureMentalImmunity(actor("creature.fearless"), { mental: true }), "");
  assert.ok(creatureEffectImmunity(actor("creature.incorporeal"), { flags: { [SYSTEM_ID]: { condition: { physical: true } } } }));
});

test("Yrden materializes spirits only inside its circle and removes slowing on exit and expiry", async () => {
  runtime();
  const spirit = actor("creature.incorporeal", "creature.teleport"), scene = sceneFor(spirit);
  const template = await createSpiritZone(scene, { x: 50, y: 50 }, { kind: "yrden", radius: 3, rounds: 5, penalty: 3, sourceUuid: "Chat.cast" });
  assert.equal(creatureSuppression(spirit).yrden, true); assert.equal(spiritState(spirit).incorporeal, false); assert.equal(spiritState(spirit).canTeleport, false);
  assert.deepEqual(spirit.effects[0].flags[SYSTEM_ID].condition.modifiers, [{ target: "attributes.reflex", value: -3 }, { target: "attributes.speed", value: -3 }]);
  await createSpiritZone(scene, { x: 50, y: 50 }, { kind: "yrden", radius: 3, rounds: 5, penalty: 3, sourceUuid: "Chat.cast" }); assert.equal(scene.regions.length, 1);
  spirit.token.x = 200; assert.equal(spiritState(spirit).incorporeal, true);
  await refreshSpiritZones(scene); assert.equal(spirit.effects.length, 0);
  spirit.token.x = 0; await refreshSpiritZones(scene); assert.equal(spirit.effects.length, 1);
  game.time.worldTime = 115; assert.equal(spiritZoneExpired(template.flags[SYSTEM_ID].creatureZone), true);
  await refreshSpiritZones(scene); assert.equal(spirit.effects.length, 0); assert.equal(spiritState(spirit).incorporeal, true); assert.equal(scene.regions.length, 0);
});

test("overlapping Yrden circles use the strongest penalty, and combat expiry follows the casting turn", async () => {
  runtime();
  const owner = actor(), scene = sceneFor(owner);
  game.combat = { id: "c", started: true, round: 2, turn: 3, combatants: [] };
  await createSpiritZone(scene, { x: 50, y: 50 }, { kind: "yrden", radius: 3, rounds: 5, penalty: 1 });
  const strong = await createSpiritZone(scene, { x: 50, y: 50 }, { kind: "yrden", radius: 3, rounds: 5, penalty: 4 });
  assert.equal(owner.effects.length, 1); assert.equal(owner.effects[0].flags[SYSTEM_ID].condition.modifiers[0].value, -4);
  game.combat.round = 7; game.combat.turn = 2; assert.equal(spiritZoneExpired(strong.flags[SYSTEM_ID].creatureZone), false);
  game.combat.turn = 3; await refreshSpiritZones(scene); assert.equal(owner.effects.length, 0);
});

test("casting Yrden makes a real zone without selected targets and uses cost before focus reduction", async () => {
  runtime();
  const caster = actor(), scene = sceneFor(caster);
  const result = await createSpellStrikes(caster, { system: { ruleId: "sign.yrden", cost: 1 } },
    { uuid: "Chat.yrden", flags: { [SYSTEM_ID]: { magicCast: { powerCost: 7, stamina: 5 } } } });
  assert.equal(result.created, 1); assert.equal(scene.regions[0].shapes[0].radiusX, 150);
  assert.equal(scene.regions[0].flags[SYSTEM_ID].creatureZone.penalty, 4);
});

test("Moon Dust's actual blast applies twenty rounds to victims and continues after they leave", async () => {
  runtime();
  const spirit = actor("creature.incorporeal"), scene = sceneFor(spirit);
  const item = { type: "equipment", system: { ruleId: "bomb.moon-dust", properties: "Бомба; Радиус 8 м", damageType: "С" } };
  const profile = bombProfile(item); assert.equal(profile.moonDust, 20); assert.equal(profile.radius, 8);
  globalThis.fromUuidSync = uuid => uuid === spirit.token.uuid ? spirit.token : scene;
  const message = { flags: { [SYSTEM_ID]: { bomb: { profile, name: "Лунная пыль", victims: [{ uuid: spirit.token.uuid }], applied: false } } },
    async update() { this.flags[SYSTEM_ID].bomb.applied = true; } };
  await applyBlast(message);
  assert.equal(spirit.effects.length, 1); assert.equal(spirit.effects[0].duration.value, 20);
  spirit.token.x = 5000; assert.equal(spiritState(spirit).incorporeal, false);
  await applyBlast(message); assert.equal(spirit.effects.length, 1);
  spirit.effects[0].disabled = true; assert.equal(spiritState(spirit).incorporeal, true);
});

test("a dimeritium zone prevents casting even with Vigor or overexertion, but not outside it", async () => {
  runtime();
  const caster = actor(), scene = sceneFor(caster);
  await createSpiritZone(scene, { x: 50, y: 50 }, { kind: "dimeritium", radius: 8, rounds: 20 });
  const spell = { type: "spell", parent: caster, system: { ruleId: "spell.aenye" } };
  assert.throws(() => castingQuote(caster, spell), /двимеритовой бомбы/);
  caster.token.x = 500; assert.equal(creatureSuppression(caster).dimeritium, false);
  game.time.worldTime = 160; caster.token.x = 0; assert.equal(creatureSuppression(caster).dimeritium, false);
});

test("a player's Yrden request is validated and creates one native Region through the active GM", async () => {
  runtime();
  const caster = actor(), scene = sceneFor(caster), gm = game.user, player = { id: "player", isGM: false };
  const sign = { id: "sign", system: { ruleId: "sign.yrden", cost: 1 } }; caster.items.push(sign);
  caster.testUserPermission = user => user === player;
  const message = { uuid: "Chat.sign", flags: { [SYSTEM_ID]: { magicCast: { spellId: "sign", powerCost: 3 } } },
    async update(changes) { for (const [key, value] of Object.entries(changes)) this.flags[SYSTEM_ID][key.split(".").at(-1)] = value; } };
  game.user = player; game.users.get = id => id === player.id ? player : null;
  globalThis.fromUuidSync = () => caster.token;
  await createSpellStrikes(caster, sign, message);
  assert.equal(scene.regions.length, 0); assert.equal(message.flags[SYSTEM_ID].yrdenRequest.requester, "player");
  game.user = gm;
  assert.equal(await processYrdenRequest(message, "someone-else"), false);
  assert.equal(await processYrdenRequest(message, "player"), true); assert.equal(scene.regions.length, 1);
  assert.equal(await processYrdenRequest(message, "player"), false); assert.equal(scene.regions.length, 1);
});

test("electricity is a nonphysical spell force and supplies the golem damage hook", () => {
  runtime();
  for (const ruleId of ["spell.static-storm", "spell.alzur-thunder", "spell.storm"]) {
    const traits = spellTraits("air", ruleId); assert.equal(traits.electricity, true); assert.equal(traits.physical, false);
    assert.ok(resolveDamage({ base: 15, traits, armor: armorAt(actor("creature.incorporeal"), "torso"), location: "torso", multiplier: 1 }).total > 0);
  }
  assert.equal(spellTraits("air", "spell.zephyr").physical, true);
  assert.equal(spellTraits("air", "spell.zephyr").electricity, false);
});

test("infinite stamina makes repeat defenses free, and amphibious creatures retain Dodge under water", () => {
  runtime();
  const golem = actor("creature.infinite-stamina"); golem.system.stamina.value = 0;
  const quote = defenseQuote(golem, { mode: "counter", repeat: true }); assert.equal(quote.cost, 0); assert.equal(quote.blocked, "");
  const swimmer = actor("creature.amphibian"), scene = sceneFor(swimmer);
  scene.flags = { [SYSTEM_ID]: { environment: { terrain: "underwater" } } }; scene.environment = { darknessLevel: 0 };
  swimmer.system.skills.dodgeEscape = 5; swimmer.system.skills.athletics = 4;
  assert.equal(defenseQuote(swimmer).skillKey, "dodgeEscape");
  swimmer.items = []; assert.equal(defenseQuote(swimmer).skillKey, "athletics");
});

test("weak spots remove type resistances and use the printed SP without bypassing later monster resistance", () => {
  runtime();
  const sources = bestiarySources();
  const troll = sources.find(source => source.name === "Скальный тролль"), arachas = sources.find(source => source.name === "Главоглаз");
  for (const target of [troll, arachas]) { target.effects = []; target.id = target._id; }
  assert.equal(armorAt(troll, "torso", { weakSpot: true }).sp, 5);
  assert.deepEqual(armorAt(troll, "torso", { weakSpot: true }).resistances, []);
  assert.equal(armorAt(troll, "head", { weakSpot: true }).sp, 20);
  assert.equal(armorAt(arachas, "torso", { weakSpot: true }).sp, 10);
  const result = resolveDamage({ base: 20, traits: weaponDamageTraits({ damageType: "Р" }), armor: armorAt(arachas, "torso", { weakSpot: true }),
    monster: true, multiplier: 1, location: "torso" });
  assert.equal(result.total, 5); assert.deepEqual(result.ablate, ["natural"]);
  arachas.system.creature.naturalArmor = 19; assert.equal(armorAt(arachas, "torso", { weakSpot: true }).sp, 9);
});

test("a human-form werewolf loses natural armor and monster resistance but retains equipped armor", () => {
  runtime();
  const wolf = bestiarySources().find(source => source.name === "Волколак"); wolf.effects = [];
  assert.ok(armorAt(wolf, "torso").sp > 0); assert.equal(monsterResistant(wolf), true);
  wolf.system.creature.transformed = false;
  assert.equal(armorAt(wolf, "torso").sp, 0); assert.equal(monsterResistant(wolf), false);
  wolf.items.push({ id: "coat", type: "armor", name: "Обычный доспех", system: { zone: "torso", equipped: true, carried: true, quantity: 1, stoppingPower: { value: 5, max: 5 } } });
  assert.equal(armorAt(wolf, "torso").sp, 5); assert.deepEqual(armorAt(wolf, "torso").ablate, ["coat"]);
});

test("Yrden reads where a moving token ends up, spares its caster and explains itself", async () => {
  runtime();
  const bandit = actor(), scene = sceneFor(bandit);
  // Core v14 animates prepared x/y; right after the move only the source holds the new cell.
  bandit.token.x = 600; bandit.token._source = { x: 0, y: 0, width: 1, height: 1 };
  const witcher = actor(); witcher.uuid = "Actor.geralt"; witcher.name = "Геральт";
  const sign = { id: "sign", uuid: "Actor.geralt.Item.sign", name: "Ирден" };
  witcher.items.push(sign);
  const witcherToken = { uuid: "Scene.s.Token.geralt", parent: scene, actor: witcher, name: "Геральт", x: 0, y: 0, width: 1, height: 1 };
  scene.tokens.push(witcherToken); witcher.isToken = true; witcher.token = witcherToken;
  const { createYrdenZone } = await import("../scripts/combat/creature-spirits.mjs");
  await createYrdenZone(witcher, witcherToken, { uuid: "Chat.y", flags: { [SYSTEM_ID]: { magicCast: { spellId: "sign" } } } }, 3);
  assert.equal(bandit.effects.length, 1, "the bandit who just stepped in is slowed at once");
  assert.equal(witcher.effects.length, 0, "the caster is not slowed by the own circle");
  assert.equal(creatureSuppression(witcher).yrden, false);
  const effect = bandit.effects[0];
  assert.match(effect.description, /Сотворил: Геральт/); assert.match(effect.description, /−2 к РЕА и СКОР/);
  assert.match(effect.description, /@UUID\[Actor\.geralt\.Item\.sign\]\{Ирден\}/); assert.equal(effect.origin, "Actor.geralt.Item.sign");
  bandit.token._source.x = 600; await refreshSpiritZones(scene);
  assert.equal(bandit.effects.length, 0, "leaving the circle ends the slow at once");
});

test("two copies of the same Yrden effect never double the slow and are cleaned up", async () => {
  runtime();
  const bandit = actor(), scene = sceneFor(bandit);
  await createSpiritZone(scene, { x: 50, y: 50 }, { kind: "yrden", radius: 3, rounds: 5, penalty: 2 });
  const original = bandit.effects[0];
  const copy = { name: original.name, flags: structuredClone(original.flags), id: "e-copy", statuses: new Set(["creature-yrden"]) };
  bandit.effects.push(copy);
  const { conditionModifiers } = await import("../scripts/data/condition-definitions.mjs");
  assert.deepEqual(conditionModifiers(bandit.effects).map(modifier => modifier.value), [-2, -2], "REF and SPD once, not twice");
  await refreshSpiritZones(scene);
  assert.equal(bandit.effects.length, 1);
});
