import test from "node:test";
import assert from "node:assert/strict";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { creatureProfile, creatureModeModifiers, creatureInvisible, creaturePackBonus, creatureLeaderPresence, creatureGolemSlowed, creatureHasInfiniteStamina, creatureAttackParts, creatureDefenseParts } from "../scripts/data/creature-modes.mjs";
import { creatureRegeneration } from "../scripts/data/creature-regeneration.mjs";
import { immuneToCondition } from "../scripts/data/creatures.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { setCreatureMode, afterCreatureAttack, onCreatureDamaged, rollLycanthropy, fallingDice, groundCreature, afterCreatureBite, continueCreatureFall, detectCreature, registerCreatureModes, creatureMagicSources } from "../scripts/combat/creature-modes.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

const setAt = (object, path, value) => { const keys = path.split("."), last = keys.pop(); keys.reduce((out, key) => out[key] ??= {}, object)[last] = value; };
function fixture(name) {
  const source = structuredClone(bestiarySources().find(actor => actor.name === name)), rolls = [], messages = [];
  const actor = { ...source, id: source._id, uuid: `Actor.${source._id}`, isOwner: true, effects: [],
    update: async changes => { for (const [key, value] of Object.entries(changes)) setAt(actor, key, value); return actor; },
    createEmbeddedDocuments: async (_kind, sources) => {
      const created = sources.map((data, i) => ({ ...data, id: `e${actor.effects.length + i}`, statuses: new Set(data.statuses ?? []),
        update: async changes => { for (const [key, value] of Object.entries(changes)) setAt(created[i], key, value); } }));
      actor.effects.push(...created); return created;
    },
    toggleStatusEffect: async status => actor.createEmbeddedDocuments("ActiveEffect", [{ name: status, statuses: [status], flags: {} }]),
    deleteEmbeddedDocuments: async (_kind, ids) => { actor.effects = actor.effects.filter(effect => !ids.includes(effect.id)); } };
  actor.items.get = id => actor.items.find(item => item._id === id || item.id === id);
  actor.system.skills = { ...Object.fromEntries(SKILL_KEYS.map(key => [key, 0])), ...actor.system.skills };
  actor.system.abilityState = {};
  Object.defineProperty(actor.system, "parent", { value: actor });
  Object.defineProperty(actor.system, "statistics", { get: () => deriveStatistics(actor.system, { items: actor.items, effects: actor.effects }) });
  const gm = { isGM: true }, state = { totals: [], rolls, messages };
  globalThis.game = { user: gm, users: { activeGM: gm }, actors: [actor], time: { worldTime: 0 }, settings: { get: () => "public" } };
  globalThis.foundry = { dice: { Roll: class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { this.total = state.totals.shift() ?? 20; rolls.push(this); return this; }
  } }, documents: { ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }), applyMode: data => data, create: async data => { messages.push(data); return data; } } } };
  return { actor, state };
}
const suppression = kind => ({ statuses: new Set(), flags: { [SYSTEM_ID]: { creatureSuppression: { kind } } } });

test("cat magic sense recognizes carried magic and active effects, without flagging silver, alchemy or stored gear", () => {
  const actor = { system: {}, items: [
    { id: "mundane", name: "Серебряный меч", type: "weapon", system: { properties: "Серебряное (3d6)" } },
    { id: "alchemy", name: "Яд", type: "equipment", system: { kind: "alchemy" } },
    { id: "rune", name: "Руна", type: "equipment", system: { ruleId: "rune.dazhbog" } },
    { id: "focus", name: "Посох", type: "weapon", system: { properties: "Фокусирующее (2)" } },
    { id: "stored", name: "В хранилище", type: "weapon", system: { carried: false, properties: "Фокусирующее (1)" } },
    { id: "socket", name: "Броня с глифом", type: "armor", system: { installations: [{ category: "glyph", bonuses: [] }] } }
  ], effects: [
    { name: "Бонус места силы", flags: { [SYSTEM_ID]: { powerPlace: { element: "fire" } } } },
    { name: "Истёкшая магия", duration: { expired: true }, flags: { [SYSTEM_ID]: { magical: true } } },
    { name: "Рана", flags: { [SYSTEM_ID]: { condition: { key: "bleeding" } } } }
  ] };
  assert.deepEqual(creatureMagicSources(actor), ["Руна", "Посох", "Броня с глифом", "Бонус места силы"]);
  actor.flags = { [SYSTEM_ID]: { magical: true } };
  assert.equal(creatureMagicSources(actor)[0], "магический источник");
});

test("siren ground penalties, amphibian water rules and bird flight change actual derived statistics", () => {
  const { actor } = fixture("Сирена");
  const ground = actor.system.statistics;
  assert.deepEqual([ground.effective.reflex, ground.effective.dexterity, ground.effective.speed], [2, 2, 2]);
  const environment = { light: { id: "day" }, terrain: { id: "underwater", modifiers: [{ target: "combat.attack", value: -2 }] }, underwater: true };
  const water = deriveStatistics(actor.system, { items: actor.items, environment });
  assert.deepEqual([water.effective.reflex, water.effective.dexterity, water.effective.speed], [7, 7, 8]);
  assert.equal(water.modifiers.some(mod => mod.target === "combat.attack" && mod.value === -2), false);
  actor.system.creature.movementMode = "flying";
  assert.equal(actor.system.statistics.effective.reflex, 7);
  const bird = fixture("Птица").actor;
  assert.equal(bird.system.statistics.run, 10);
  bird.system.creature.movementMode = "flying";
  assert.equal(bird.system.statistics.effective.speed, 7);
  assert.equal(bird.system.statistics.run, 21);
});

test("ghoul regeneration starts below ten living HP, while human form and Moon Dust suppress werewolf regeneration", async () => {
  const ghoul = fixture("Гуль").actor;
  for (const [health, healing] of [[10, 0], [9, 3], [1, 3], [0, 3], [-1, 3]]) {
    ghoul.system.health.value = health; assert.equal(creatureRegeneration(ghoul).total, healing);
  }
  ghoul.effects.push({ statuses: new Set(["dead"]) });
  assert.equal(creatureRegeneration(ghoul).total, 0);
  const wolf = fixture("Волколак").actor;
  assert.equal(creatureRegeneration(wolf).total, 5);
  wolf.system.creature.transformed = false;
  assert.equal(creatureRegeneration(wolf).total, 0);
  assert.deepEqual([wolf.system.statistics.effective.reflex, wolf.system.statistics.effective.body, wolf.system.statistics.effective.speed, wolf.system.statistics.effective.empathy], [6, 4, 5, 6]);
  wolf.effects.push(suppression("moon-dust"));
  await assert.rejects(setCreatureMode(wolf, "transformed", true), /подавлена/);
  wolf.system.creature.transformed = true;
  assert.equal(creatureRegeneration(wolf).total, 0);
  const fiend = fixture("Бес").actor;
  assert.equal(creatureRegeneration(fiend).total, 5);
  fiend.effects.push(suppression("moon-dust"));
  assert.equal(creatureRegeneration(fiend).total, 0);
});

test("katakan invisibility modifies checks, is suppressed by real effects, and ends after attack", async () => {
  const { actor } = fixture("Катакан");
  await setCreatureMode(actor, "invisible", true);
  assert.equal(creatureInvisible(actor), true);
  const mods = creatureModeModifiers(actor);
  assert.equal(mods.find(mod => mod.target === "skills.stealth").value, 10);
  assert.equal(mods.find(mod => mod.target === "combat.attack").value, 5);
  assert.equal(creatureAttackParts(null, actor)[0].value, -3);
  assert.equal(creatureDefenseParts(null, actor)[0].value, -3);
  const cat = fixture("Кошка").actor;
  assert.deepEqual(creatureAttackParts(cat, actor), []);
  assert.deepEqual(creatureDefenseParts(cat, actor), []);
  actor.effects.push(suppression("yrden"));
  assert.equal(creatureInvisible(actor), false);
  actor.effects = [];
  await afterCreatureAttack(actor);
  assert.equal(actor.system.creature.invisible, false);
});

test("a living leader gives only its named pack +4 courage, without stacking or borrowing another family", () => {
  const wolf = fixture("Волк").actor, warg = fixture("Варг").actor, nekker = fixture("Накер-вожак").actor;
  for (const actor of [wolf, warg, nekker]) actor.system.creature.packId = "Север";
  game.actors = [wolf, warg, nekker];
  assert.equal(creaturePackBonus(wolf), 4);
  assert.equal(creaturePackBonus(warg), 0);
  assert.equal(wolf.system.statistics.modifiers.find(mod => mod.target === "skills.courage").value, 4);
  warg.effects.push({ statuses: new Set(["dead"]) });
  assert.equal(creaturePackBonus(wolf), 0);
  warg.effects = []; warg.system.creature.packId = "Юг";
  assert.equal(creaturePackBonus(wolf), 0);
});

test("golem dimeritium changes actual parameters and massive immunity does not make amphibians immune to choking", () => {
  const golem = fixture("Голем").actor;
  assert.equal(creatureHasInfiniteStamina(golem), true);
  const scene = { grid: { size: 100, distance: 2 }, regions: [{ shapes: [{type:"ellipse",x:50,y:50,radiusX:150,radiusY:150}],
    flags: { [SYSTEM_ID]: { creatureZone: { kind: "dimeritium", endTime: 100 } } } }] };
  golem.isToken = true; golem.token = { parent: scene, x: 0, y: 0, width: 1, height: 1 };
  assert.equal(creatureGolemSlowed(golem), true);
  assert.equal(golem.system.statistics.effective.reflex, 8);
  assert.equal(golem.system.statistics.effective.intelligence, 0);
  const fiend = fixture("Бес").actor;
  assert.equal(immuneToCondition(fiend, ["prone"]), true);
  const siren = fixture("Сирена").actor;
  assert.equal(immuneToCondition(siren, ["suffocating"]), false);
});

test("Moonlight penalizes each check once, without reducing hit points or adding a second combat penalty", () => {
  const { actor } = fixture("Полуденница");
  actor.system.creature.moonlight = true;
  const stats = actor.system.statistics;
  assert.equal(stats.healthMax, 80);
  assert.equal(stats.modifiers.find(mod => mod.target === "skills.melee").value, -2);
  assert.equal(stats.modifiers.find(mod => mod.target === "attributeCheck").value, -2);
  assert.equal(stats.modifiers.some(mod => mod.target === "combat.attack"), false);
});

test("flight uses strict printed damage thresholds and a successful Athletics save lands safely", async () => {
  const { actor, state } = fixture("Сирена");
  actor.system.creature.movementMode = "flying"; actor.system.creature.flightHeight = 8;
  await onCreatureDamaged(actor, 5);
  assert.equal(state.rolls.length, 0);
  state.totals = [16];
  await onCreatureDamaged(actor, 6);
  assert.equal(actor.system.creature.movementMode, "ground");
  assert.equal(actor.system.creature.fallRemaining, 0);
  assert.equal(actor.system.health.value, 35);
  assert.equal(fallingDice(9), 4);
});

test("failed flight recovery above thirty metres preserves the remaining fall for subsequent turns", async () => {
  const { actor, state } = fixture("Виверна");
  actor.system.creature.movementMode = "flying"; actor.system.creature.flightHeight = 70;
  game.combat = { started: true, id: "fight", round: 1 };
  state.totals = [10];
  await groundCreature(actor);
  assert.equal(actor.system.creature.fallRemaining, 40);
  assert.equal(actor.system.creature.fallDistance, 70);
  assert.equal(actor.system.health.value, 80);
  assert.equal(await continueCreatureFall(actor), false);
  assert.equal(actor.system.creature.fallRemaining, 40);
  game.combat.round = 2;
  await continueCreatureFall(actor);
  assert.equal(actor.system.creature.fallRemaining, 10);
});

test("electrical damage above ten triggers the golem's strict STUN 7 check", async () => {
  const { actor, state } = fixture("Голем");
  await onCreatureDamaged(actor, 10, { electricity: true });
  assert.equal(state.rolls.length, 0);
  state.totals = [7];
  await onCreatureDamaged(actor, 11, { electricity: true });
  assert.equal(actor.effects.some(effect => effect.statuses.has("stunned")), true);
});

test("lycanthropy uses thirty percent and respects actual Moon Dust", async () => {
  const { actor, state } = fixture("Волколак");
  actor.system.creature.transformed = false; state.totals = [30];
  assert.equal(await rollLycanthropy(actor), true);
  actor.system.creature.transformed = false; state.totals = [31];
  assert.equal(await rollLycanthropy(actor), false);
  actor.effects.push(suppression("moon-dust")); state.totals = [1];
  assert.equal(await rollLycanthropy(actor), false);
  assert.equal(actor.system.creature.transformed, false);
});

test("drinking Black Blood creates a real poison with DC20 and carries the victim's substances", async () => {
  const { actor } = fixture("Катакан");
  const victim = { uuid: "Actor.victim", effects: [
    { name: "Чёрная кровь", uuid: "Actor.victim.ActiveEffect.black", statuses: new Set(), flags: { [SYSTEM_ID]: { consumable: { ruleId: "potion.black-blood" } } } },
    { name: "Опьянение", uuid: "Actor.victim.ActiveEffect.drunk", statuses: new Set(["intoxicated"]), flags: { [SYSTEM_ID]: { condition: { modifiers: [{ target: "attributes.reflex", value: -2 }] } } } }
  ] };
  await afterCreatureBite(actor, victim);
  const poison = actor.effects.find(effect => effect.statuses.has("poisoned"));
  assert.equal(poison.flags[SYSTEM_ID].condition.save.dc, 20);
  assert.equal(actor.effects.some(effect => effect.statuses.has("intoxicated")), true);
  await afterCreatureBite(actor, victim);
  assert.equal(actor.effects.filter(effect => effect.statuses.has("intoxicated")).length, 1);
});

test("profile recognition survives renaming and detached source IDs", () => {
  const { actor } = fixture("Катакан"), original = actor.id;
  actor.id = actor._id = "copy"; actor.name = "Ночной гость";
  actor.flags = { core: { sourceId: `Compendium.${SYSTEM_ID}.bestiary.Actor.${original}` } };
  assert.equal(creatureProfile(actor).id, "katakan");
});

test("camouflage contributes ten stealth and movement clears it through the token hook", async () => {
  const { actor } = fixture("Главоглаз"), hooks = new Map();
  await setCreatureMode(actor, "camouflage", true);
  assert.equal(creatureModeModifiers(actor).find(mod=>mod.target==="skills.stealth").value, 10);
  globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
  registerCreatureModes();
  await hooks.get("updateToken")({ actor }, { x: 100 });
  assert.equal(actor.system.creature.camouflage, false);
});

test("successful detection persists only the current invisibility epoch with an escaped actor UUID", async () => {
  const { actor, state } = fixture("Катакан");
  await setCreatureMode(actor, "invisible", true);
  const observer = { isOwner: true, name: "Наблюдатель", items: [], flags: {}, system: { skills: { awareness: 7 }, statistics: { effective: { intelligence: 7 }, modifiers: [] }, abilityState: {} },
    setFlag: async (scope, key, value) => { observer.flags[scope] = { [key]: value }; } };
  state.totals = [25, 20];
  assert.equal(await detectCreature(actor, { observer }), true);
  const key = encodeURIComponent(actor.uuid).replaceAll(".", "%2E"), record = observer.flags[SYSTEM_ID].detectedCreatures[key];
  assert.equal(record.epoch, actor.system.creature.invisibilityEpoch);
  const before = record.epoch;
  await afterCreatureAttack(actor); await setCreatureMode(actor, "invisible", true);
  assert.notEqual(actor.system.creature.invisibilityEpoch, before);
});

test("barghests match the Monster Hunter's Journal statblocks and a living leader emboldens them by +3", () => {
  const barghest = fixture("Баргест").actor, leader = fixture("Баргест-вожак").actor, kai = fixture("Кай").actor;
  const base = (actor, attribute, skill) => actor.system.attributes[attribute] + actor.system.skills[skill];
  // Printed bite/defense values: the leaders already include their own presence.
  assert.deepEqual([barghest, leader, kai].map(actor => base(actor, "reflex", "brawling") + creatureLeaderPresence(actor)), [12, 15, 18]);
  assert.deepEqual([barghest, leader, kai].map(actor => base(actor, "reflex", "dodgeEscape") + creatureLeaderPresence(actor)), [11, 14, 16]);
  assert.deepEqual([barghest, leader, kai].map(actor => base(actor, "intelligence", "awareness")), [12, 13, 18]);
  assert.deepEqual([barghest, leader, kai].map(actor => actor.system.creature.runBase), [0, 27, 0]);
  assert.equal(kai.items.find(item => item.name === "Укус").system.attackRate, 2);
  // A barghest alone gets nothing; a living leader of the scene (any pack, unless both are named) gives +3, never stacking.
  globalThis.canvas = { scene: { tokens: [{ actor: barghest }] } };
  assert.equal(creatureLeaderPresence(barghest), 0);
  canvas.scene.tokens.push({ actor: leader }, { actor: kai });
  assert.equal(creatureLeaderPresence(barghest), 3);
  const bonus = barghest.system.statistics.modifiers.filter(mod => mod.label === "Присутствие вожака");
  assert.deepEqual(bonus.map(mod => [mod.target, mod.value]), [["combat.attack", 3], ["combat.defense", 3]]);
  leader.effects.push({ statuses: new Set(["dead"]) }); kai.effects.push({ statuses: new Set(["dead"]) });
  assert.equal(creatureLeaderPresence(barghest), 0);
  kai.effects = []; barghest.system.creature.packId = "Пустошь"; kai.system.creature.packId = "Болото";
  assert.equal(creatureLeaderPresence(barghest), 0);
  kai.system.creature.packId = "Пустошь";
  assert.equal(creatureLeaderPresence(barghest), 3);
  delete globalThis.canvas;
  // Fire immunity also keeps them from burning.
  assert.equal(immuneToCondition(barghest, ["burning"]), true);
  assert.equal(immuneToCondition(fixture("Волк").actor, ["burning"]), false);
});
