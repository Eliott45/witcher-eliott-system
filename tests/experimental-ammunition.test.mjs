import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { splitProjectileCount, experimentalAmmoReplacesDamage, experimentalAttackRolls, experimentalExchangeOutcome,
  resolveExperimentalAmmunition, experimentalAmmoHTML, trackingAmmunitionState, applyTrackingAmmunition,
  removeTrackingProjectile, trackByAmmunition } from "../scripts/combat/experimental-ammunition.mjs";
import { rollExchangeLocation, rollExchangeDamage, damagePreview, applyExchangeDamage, renderExchange, exchangeRowHTML } from "../scripts/combat/attack-exchange.mjs";

const put = (object, path, value) => { const keys = path.split("."); for (const key of keys.slice(0, -1)) object = object[key] ??= {}; object[keys.at(-1)] = value; };
const collection = entries => Object.assign(entries, { get(id) { return this.find(entry => entry.id === id); } });
function setup() {
  let serial = 0;
  const id = () => String(++serial).padStart(16, "0"), documents = new Map(), messages = collection([]), formulas = [], totals = [];
  const scene = { id: "scene", uuid: "Scene.scene", grid: { size: 100, distance: 2 }, tokens: collection([]) };
  const gm = { id: "gm", isGM: true, targets: new Set() };
  globalThis.game = { user: gm, users: { activeGM: gm }, messages, combat: null, time: { worldTime: 0 }, settings: { get: () => false } };
  globalThis.canvas = { scene }; globalThis.fromUuidSync = uuid => documents.get(uuid);
  globalThis.ui = { notifications: { warn: text => { throw new Error(text); }, error: text => { throw new Error(text); } } };
  delete globalThis.Hooks;
  const update = async function (changes) {
    if (this.failUpdate) { this.failUpdate = false; throw new Error("update failed"); }
    for (const [path, value] of Object.entries(changes)) put(this, path, value);
    return this;
  };
  function actor(name = "Персонаж") {
    const actor = { id: id(), uuid: `Actor.${id()}`, name, type: "character", isOwner: true, flags: {}, items: collection([]), effects: collection([]),
      system: { stamina: { value: 20, max: 20 }, combatAction: { extra: false }, statistics: { effective: { intelligence: 7 }, modifiers: [] }, skills: { wildernessSurvival: 3 } }, update,
      async createEmbeddedDocuments(type, sources) { assert.equal(type, "ActiveEffect"); if (this.failEffect) { this.failEffect = false; throw new Error("effect failed"); }
        const effects = sources.map(source => ({ ...structuredClone(source), id: id(), statuses: new Set(source.statuses ?? []) })); this.effects.push(...effects); return effects; },
      async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "ActiveEffect"); this.effects.splice(0, this.effects.length, ...this.effects.filter(effect => !ids.includes(effect.id))); }
    };
    documents.set(actor.uuid, actor); return actor;
  }
  function token(actor, x = 0) {
    const token = { id: id(), uuid: `Scene.scene.Token.${id()}`, name: actor.name, actor, parent: scene, x, y: 0, width: 1, height: 1, getSize: () => ({ width: 100, height: 100 }) };
    scene.tokens.push(token); documents.set(token.uuid, token); return token;
  }
  const create = async data => {
    if (env.failCreateAt && ++env.creates === env.failCreateAt) throw new Error("chat failed");
    const message = { id: id(), isContentVisible: true, rolls: [], whisper: [], flags: {}, ...data, speakerActor: documents.get(data.speaker?.actor), update };
    messages.push(message); return message;
  };
  class Roll {
    constructor(formula) { this.formula = formula; formulas.push(formula); }
    async evaluate() { assert.ok(totals.length, `Unexpected roll ${this.formula}`); this.total = totals.shift(); return this; }
    toMessage(data) { return create({ ...data, rolls: [this] }); }
  }
  globalThis.foundry = { dice: { Roll }, utils: { deepClone: structuredClone, getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) },
    documents: { ChatMessage: { create, applyMode: data => data, getSpeaker: ({ actor }) => ({ actor: actor.uuid }) } } };
  foundry.documents.ChatMessage.implementation = foundry.documents.ChatMessage;
  const env = { actor, token, create, messages, scene, gm, totals, formulas, documents, creates: 0, failCreateAt: 0 };
  env.shot = async (ruleId = "ammunition.split", count = 1) => {
    const archer = actor("Лучник"), victim = actor("Цель"), from = token(archer), to = token(victim, 500);
    const source = await create({ speaker: { actor: archer.uuid }, rolls: Array.from({ length: count }, (_, i) => ({ total: 22 + i })), flags: { [SYSTEM_ID]: { weaponAttack: {
      name: "Лук", target: to.uuid, attacker: from.uuid, count, ammunition: { ruleId }, damage: "4d6+2", location: "head", multiplier: 3,
      traits: { types: ["piercing"], piercing: "improved" }, hitTraits: { bleeding: 25 }, weaponProperties: "Точность",
      locationRoll: { total: 1 }
    } } } });
    const defense = await create({ flags: { [SYSTEM_ID]: { exchange: { kind: "defense", attack: source.id, index: 0 } } } });
    return { source, defense, archer, victim, from, to, outcome: { hit: true, margin: 5, attackTotal: 22, defenseTotal: 17, critical: null, defense } };
  };
  env.applied = async (shot, result = {}) => create({ flags: { [SYSTEM_ID]: { exchange: {
    kind: "applied", attack: shot.source.id, index: 0, total: 5, penetrated: true, immune: false, nonLethal: false, ...result
  } } } });
  return env;
}

test("split hits equal the positive margin, capped at three; the original never adds another hit", () => {
  assert.deepEqual([-4, 0, 1, 2, 3, 11, NaN].map(splitProjectileCount), [0, 0, 1, 2, 3, 3, 0]);
  for (const ruleId of ["ammunition.split", "ammunition.explosive"]) {
    const attack = { ammunition: { ruleId } }; assert.equal(experimentalAmmoReplacesDamage(attack), true);
    assert.equal(experimentalAmmoReplacesDamage({ ...attack, experimentalParent: { attack: "parent" } }), false);
  }
  assert.equal(experimentalAmmoReplacesDamage({ ammunition: { ruleId: "ammunition.tracking" } }), false);
});

test("split children retain full damage and defense but each uses its own random location, without more rolls or expenditure", async () => {
  const env = setup(), shot = await env.shot(); shot.source.whisper = ["gm"]; shot.source.blind = true;
  const [children, duplicate] = await Promise.all([resolveExperimentalAmmunition(shot.source, 0, shot.outcome), resolveExperimentalAmmunition(shot.source, 0, shot.outcome)]);
  assert.equal(children, duplicate); assert.equal(children.length, 3); assert.equal(env.formulas.length, 0); assert.equal(shot.archer.system.stamina.value, 20);
  for (const child of children) {
    const attack = child.flags[SYSTEM_ID].weaponAttack;
    assert.equal(attack.damage, "4d6+2"); assert.equal(attack.location, "random"); assert.equal(attack.multiplier, 1); assert.equal(attack.count, 1);
    assert.equal(attack.locationRoll, undefined); assert.deepEqual(attack.hitTraits, { bleeding: 25 }); assert.equal(attack.traits.piercing, "improved");
    assert.deepEqual(experimentalAttackRolls(child), [shot.source.rolls[0]]); assert.equal(experimentalExchangeOutcome(child).defense, shot.defense);
    assert.equal(experimentalExchangeOutcome(child).margin, 5); assert.deepEqual(child.whisper, ["gm"]); assert.equal(child.blind, true);
  }
  assert.equal((await resolveExperimentalAmmunition(shot.source, 0, shot.outcome)).length, 3);
  assert.match(experimentalAmmoHTML(shot.source, 0, shot.outcome), /3 полных/);
  env.messages.splice(env.messages.indexOf(children[0]), 1);
  assert.equal((await resolveExperimentalAmmunition(shot.source, 0, shot.outcome)).length, 2, "a deliberately deleted resolved hit is never regenerated");
});

test("split retries only missing child cards after failure and keeps shots in a two-shot action independent", async () => {
  const env = setup(), shot = await env.shot("ammunition.split", 2); env.failCreateAt = 2;
  shot.source.flags[SYSTEM_ID].weaponAttack.adrenalineDice = 3;
  await assert.rejects(resolveExperimentalAmmunition(shot.source, 0, shot.outcome), /chat failed/);
  assert.equal(env.messages.filter(message => message.flags[SYSTEM_ID]?.weaponAttack?.experimentalParent).length, 1);
  env.failCreateAt = 0;
  const first = await resolveExperimentalAmmunition(shot.source, 0, shot.outcome);
  assert.equal(first.length, 3);
  assert.deepEqual(first.map(message => message.flags[SYSTEM_ID].weaponAttack.adrenalineDice), [3, 0, 0]);
  const second = await resolveExperimentalAmmunition(shot.source, 1, { ...shot.outcome, margin: 1 });
  assert.equal(second.length, 1); assert.deepEqual(experimentalAttackRolls(second[0]), [shot.source.rolls[1]]);
  assert.equal(second[0].flags[SYSTEM_ID].weaponAttack.adrenalineDice, 0);
  assert.equal(env.messages.filter(message => message.flags[SYSTEM_ID]?.weaponAttack?.experimentalParent).length, 4);
});

test("split miss creates no damage and only the elected GM may resolve ammunition", async () => {
  const env = setup(), shot = await env.shot();
  game.user = { id: "another-gm", isGM: true }; assert.equal(await resolveExperimentalAmmunition(shot.source, 0, shot.outcome), null);
  game.user = env.gm; assert.deepEqual(await resolveExperimentalAmmunition(shot.source, 0, { ...shot.outcome, hit: false, margin: -1 }), []);
  assert.equal(await resolveExperimentalAmmunition(shot.source, -1, shot.outcome), null);
});

test("explosive ammunition makes one private 2m/4d6 blast at impact and a miss needs an explicit collision point", async () => {
  const env = setup(), shot = await env.shot("ammunition.explosive"); shot.source.whisper = ["gm"]; shot.source.blind = true;
  assert.equal(await resolveExperimentalAmmunition(shot.source, 0, { ...shot.outcome, hit: false }), null);
  const blast = await resolveExperimentalAmmunition(shot.source, 0, shot.outcome), bomb = blast.flags[SYSTEM_ID].bomb;
  assert.equal(bomb.profile.radius, 2); assert.equal(bomb.profile.damage, "4d6"); assert.deepEqual(bomb.point, { x: 550, y: 50 });
  assert.deepEqual(bomb.victims.map(victim => victim.uuid), [shot.to.uuid]); assert.deepEqual(bomb.profile.traits.types, []);
  assert.deepEqual(blast.whisper, ["gm"]); assert.equal(blast.blind, true);
  assert.equal(await resolveExperimentalAmmunition(shot.source, 0, shot.outcome), blast);
  const missed = await env.shot("ammunition.explosive");
  const collision = await resolveExperimentalAmmunition(missed.source, 0, { ...missed.outcome, hit: false }, { point: { x: 50, y: 50 } });
  assert.deepEqual(collision.flags[SYSTEM_ID].bomb.point, { x: 50, y: 50 });
});

test("a tracking projectile lodges only after penetrating damage and remains until extracted, regardless of elapsed time", async () => {
  const env = setup(), shot = await env.shot("ammunition.tracking");
  for (const result of [{ total: 0 }, { penetrated: false }, { immune: true }, { copyDestroyed: true }, { index: -1 }])
    assert.equal(await applyTrackingAmmunition(await env.applied(shot, result)), false);
  const applied = await env.applied(shot);
  assert.deepEqual(await Promise.all([applyTrackingAmmunition(applied), applyTrackingAmmunition(applied)]), [true, false]);
  game.time.worldTime = 864000;
  assert.equal(trackingAmmunitionState(shot.victim, 11.999).automatic, true);
  assert.equal(trackingAmmunitionState(shot.victim, 12).automatic, false);
  assert.equal(shot.victim.effects[0].duration, undefined);
  assert.throws(() => trackingAmmunitionState(shot.victim, -1), /Возраст/);
  assert.equal(await removeTrackingProjectile(shot.victim), 1); assert.equal(trackingAmmunitionState(shot.victim).tracked, false);
  assert.equal(await applyTrackingAmmunition(applied), false); assert.equal(shot.victim.effects.length, 0);
});

test("a failed tracking receipt write rolls its effect back and can be retried once", async () => {
  const env = setup(), shot = await env.shot("ammunition.tracking"), applied = await env.applied(shot);
  shot.victim.failUpdate = true; await assert.rejects(applyTrackingAmmunition(applied), /update failed/);
  assert.equal(shot.victim.effects.length, 0); assert.equal(shot.victim.flags[SYSTEM_ID]?.trackingAmmoReceipts, undefined);
  assert.equal(await applyTrackingAmmunition(applied), true); assert.equal(await applyTrackingAmmunition(applied), false);
  assert.equal(shot.victim.effects.length, 1);
});

test("tracking ammunition affects the actually struck living shield, not the protected target", async () => {
  const env = setup(), shot = await env.shot("ammunition.tracking"), shield = env.actor("Живой щит"), token = env.token(shield, 500);
  assert.equal(await applyTrackingAmmunition(await env.applied(shot, { shield: { token: token.uuid, total: 5, penetrated: true, applied: false } })), false);
  assert.equal(await applyTrackingAmmunition(await env.applied(shot, { shield: { token: token.uuid, total: 5, penetrated: true, applied: true } })), true);
  assert.equal(shield.effects.length, 1); assert.equal(shot.victim.effects.length, 0);
});

test("a recent scent trail gives automatic tracking, while an older trail makes the ordinary skill roll", async () => {
  const env = setup(), shot = await env.shot("ammunition.tracking"); await applyTrackingAmmunition(await env.applied(shot));
  const automatic = await trackByAmmunition(shot.victim, { observer: shot.archer, trailHours: 1 });
  assert.match(automatic.content, /проверка не требуется/); assert.equal(env.formulas.length, 0);
  env.totals.push(15);
  const rolled = await trackByAmmunition(shot.victim, { observer: shot.archer, trailHours: 12 });
  assert.equal(rolled.rolls[0].total, 15); assert.equal(env.formulas.length, 1); assert.match(env.formulas[0], /^1d10wc/);
  shot.archer.isOwner = false; await assert.rejects(trackByAmmunition(shot.victim, { observer: shot.archer }), /Выберите персонажа/);
});

test("each split projectile goes through real location, armor and application while the source cannot deal extra damage", async () => {
  const env = setup(), shot = await env.shot();
  Object.assign(shot.source.flags[SYSTEM_ID].weaponAttack, { hitTraits: {}, traits: { types: ["piercing"], piercing: "none", silver: false } });
  shot.victim.type = "npc"; shot.victim.system.creature = { category: "humanoid", naturalArmor: 6 };
  shot.victim.system.health = { value: 100, max: 100 };
  const children = await resolveExperimentalAmmunition(shot.source, 0, shot.outcome);
  env.totals.push(1, 10, 2, 10, 6, 10);
  const locations = [], expected = [];
  for (const child of children) {
    const place = await rollExchangeLocation(child, 0); assert.ok(place, "a child must reuse its parent defense");
    locations.push(place.flags[SYSTEM_ID].exchange.location.id);
    await rollExchangeDamage(child, 0);
    const before = shot.victim.system.health.value, preview = damagePreview(child, 0); expected.push(preview.result.total);
    await applyExchangeDamage(child, 0); await applyExchangeDamage(child, 0);
    assert.equal(shot.victim.system.health.value, before - preview.result.total);
  }
  assert.equal(new Set(locations).size, 3); assert.deepEqual(expected, [12, 5, 3]);
  assert.equal(shot.victim.system.creature.naturalArmor, 3); assert.equal(shot.victim.system.health.value, 80);
  assert.equal(await rollExchangeLocation(shot.source, 0), undefined); assert.equal(await rollExchangeDamage(shot.source, 0), undefined);
  assert.equal(await applyExchangeDamage(shot.source, 0), undefined);
  assert.deepEqual(env.formulas, ["1d10", "4d6+2", "1d10", "4d6+2", "1d10", "4d6+2"]);
});

test("a split projectile renders from its parent's roll and resolved defense, without repeating defense or fumbles", async t => {
  const env = setup(), shot = await env.shot(), [child] = await resolveExperimentalAmmunition(shot.source, 0, shot.outcome);
  const previousDocument = globalThis.document; t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const sections = [], element = () => ({ querySelectorAll: () => [], append: node => sections.push(node) });
  const section = element(), html = { querySelector: () => section, querySelectorAll: () => [] };
  globalThis.document = { createElement: element };
  assert.deepEqual(child.rolls, []);
  renderExchange(child, html);
  assert.equal(sections.length, 1); assert.match(sections[0].innerHTML, /data-exchange-location/);
  assert.doesNotMatch(sections[0].innerHTML, /data-exchange-defend/);
  game.user = { id: "player", isGM: false }; shot.archer.isOwner = false;
  game.settings.get = (_scope, key) => key === "concealAttackRolls";
  const visible = exchangeRowHTML(child, 0);
  assert.doesNotMatch(visible, /fa-eye-slash/); assert.match(visible, />22<\/b>/);
  shot.defense.flags[SYSTEM_ID].defense = { mode: "dodge" };
  shot.defense.rolls = [{ total: 2, dice: [{ options: { [SYSTEM_ID]: { criticalChains: [{ kind: "fumble", total: -8 }] } } }] }];
  assert.match(exchangeRowHTML(shot.source, 0), /data-fumble-step/, "the original defense keeps its actual fumble consequences");
  assert.doesNotMatch(exchangeRowHTML(child, 0), /data-fumble-step|data-fumble-ally/);
});

test("a split hit destroys a noon copy without damage cards and safely resumes after receipt failure", async () => {
  const env = setup(), shot = await env.shot();
  shot.victim.flags[SYSTEM_ID] = { noonCopy: { sourceActor: "Actor.original" } }; shot.to.actorId = shot.victim.id;
  game.actors = collection([shot.victim]); game.scenes = [env.scene];
  let deleted = 0, actorsDeleted = 0, updates = 0;
  env.scene.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "Token"); deleted++;
    for (const token of env.scene.tokens.filter(token => ids.includes(token.id))) env.documents.delete(token.uuid);
    env.scene.tokens.splice(0, env.scene.tokens.length, ...env.scene.tokens.filter(token => !ids.includes(token.id)));
  };
  shot.victim.delete = async () => { actorsDeleted++; };
  const update = shot.source.update;
  shot.source.update = async changes => { if (++updates === 2) throw new Error("receipt failed"); return update.call(shot.source, changes); };
  await assert.rejects(resolveExperimentalAmmunition(shot.source, 0, shot.outcome), /receipt failed/);
  assert.equal(deleted, 1); assert.equal(actorsDeleted, 1);
  assert.deepEqual(await resolveExperimentalAmmunition(shot.source, 0, shot.outcome), []);
  assert.deepEqual(await resolveExperimentalAmmunition(shot.source, 0, shot.outcome), []);
  assert.equal(deleted, 1); assert.equal(env.messages.filter(message => message.flags[SYSTEM_ID]?.weaponAttack?.experimentalParent).length, 0);
  assert.equal(shot.source.flags[SYSTEM_ID].experimentalAmmo[0].done, true);
  assert.match(experimentalAmmoHTML(shot.source, 0, shot.outcome), /уничтожена попаданием/);
});
