import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { combatActions } from "../scripts/sheets/combat-context.mjs";

function fixture(t) {
  const globals = { game: globalThis.game, canvas: globalThis.canvas, foundry: globalThis.foundry, ui: globalThis.ui };
  t.after(() => Object.assign(globalThis, globals));
  const events = [], warnings = [], state = { waitForCreate: null, failCreate: false };
  const makeActor = id => ({ id, uuid: `Actor.${id}`, name: id, isOwner: true, items: [],
    flags: { [SYSTEM_ID]: { fastStrike: { round: "battle:4", extra: true } } },
    system: { health: { value: 17, max: 30 }, stamina: { value: 12, max: 25 }, resolve: { value: 8, max: 30 },
      combatAction: { extra: true, lastExtraRound: "battle:4" } },
    async update(changes) {
      events.push({ kind: "actor", id, changes: structuredClone(changes) });
      assert.deepEqual(Object.keys(changes), ["system.resolve.value"], "starting a duel only restores Resolve");
      this.system.resolve.value = changes["system.resolve.value"];
    } });
  const actor = makeActor("hero"), other = makeActor("opponent");
  const tokens = [actor, other].map((owner, index) => ({ id: `token${index}`, name: owner.name, actor: owner }));
  const physical = { id: "battle", active: true, started: true, round: 4, turn: 1,
    combatants: [{ actor }, { actor: other }], flags: {} };
  const combats = [physical]; combats.get = id => combats.find(entry => entry.id === id);
  globalThis.game = { user: { isGM: true }, combat: physical, combats };
  globalThis.canvas = { scene: { id: "scene" }, tokens: { controlled: tokens } };
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  globalThis.foundry = { documents: {
    Combat: { async create(source) {
      events.push({ kind: "create", source: structuredClone(source) });
      if (state.waitForCreate) await state.waitForCreate;
      if (state.failCreate) throw new Error("Combat creation failed");
      const duel = { ...source, id: `duel${combats.length}`, round: 0, combatants: [],
        async createEmbeddedDocuments(type, rows) {
          events.push({ kind: "participants", type, rows: structuredClone(rows) });
          this.combatants = rows.map(row => ({ ...row, actor: tokens.find(token => token.id === row.tokenId).actor }));
        } };
      combats.push(duel); game.combat = duel;
      return duel;
    } },
    ChatMessage: { async create(source) { events.push({ kind: "message", source }); return source; } }
  } };
  const sheet = { actor, isEditable: true, combatOptions: { modifier: -3, range: "short", location: "head", repeat: true, crowns: 150 },
    renders: 0, async render() { this.renders++; } };
  const start = button => combatActions.startSheetVerbalDuel.call(sheet, null, button ?? { disabled: false });
  const view = value => combatActions.setCombatView.call(sheet, null, { dataset: { view: value } });
  const snapshot = () => structuredClone({ actors: [actor, other].map(entry => ({ system: entry.system, flags: entry.flags })),
    physical: { round: physical.round, turn: physical.turn, flags: physical.flags }, activeId: game.combat?.id });
  const addDuel = () => {
    const duel = { id: "existing", active: false, round: 3, flags: { [SYSTEM_ID]: { verbalDuel: { pairs: { saved: { seduce: 4 } } } } }, combatants: [{ actor }] };
    combats.push(duel); return duel;
  };
  return { actor, other, physical, combats, sheet, state, events, warnings, tokens, start, view, snapshot, addDuel };
}

test("switching the actions view is local even for a read-only player and preserves combat, resources and options", async t => {
  const f = fixture(t), duel = f.addDuel(), before = f.snapshot(), duelBefore = structuredClone(duel.flags);
  game.user.isGM = false; f.actor.isOwner = false; f.sheet.isEditable = false;
  const options = structuredClone(f.sheet.combatOptions);
  await f.view("verbal");
  assert.deepEqual(f.sheet.combatOptions, { ...options, view: "verbal" });
  await f.view("combat");
  assert.deepEqual(f.sheet.combatOptions, { ...options, view: "combat" });
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(duel.flags, duelBefore);
  assert.equal(f.sheet.renders, 2); assert.deepEqual(f.events, []); assert.deepEqual(f.warnings, []);
});

test("unknown action views are ignored and a sheet with no saved options can select either view", async t => {
  const f = fixture(t), options = f.sheet.combatOptions;
  await f.view("deleteCombat");
  assert.equal(f.sheet.combatOptions, options); assert.equal(f.sheet.renders, 0);
  delete f.sheet.combatOptions;
  await f.view("verbal"); assert.deepEqual(f.sheet.combatOptions, { view: "verbal" });
  await f.view("combat"); assert.deepEqual(f.sheet.combatOptions, { view: "combat" });
  assert.deepEqual(f.events, []);
});

test("starting a duel is gated by editable access, GM identity, button state and existing participation", async t => {
  const f = fixture(t), before = f.snapshot();
  f.sheet.isEditable = false; await f.start(); f.sheet.isEditable = true;
  game.user.isGM = false; await f.start(); game.user.isGM = true;
  await f.start({ disabled: true });
  const existing = f.addDuel(); await f.start();
  assert.equal(existing.active, false, "even an inactive existing duel prevents another Resolve reset");
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.events, []);
  assert.equal(f.sheet.renders, 0); assert.deepEqual(f.warnings, []);
});

test("sheet duel start validates its own actor, participant count and negotiation immunity before creating anything", async t => {
  const f = fixture(t), before = f.snapshot();
  canvas.tokens.controlled = [f.tokens[1]];
  await f.start(); assert.match(f.warnings.at(-1), /этого персонажа/);
  canvas.tokens.controlled = [f.tokens[0]];
  await f.start(); assert.match(f.warnings.at(-1), /не меньше двух/);
  canvas.tokens.controlled = f.tokens;
  f.other.items.push({ type: "ability", system: { ruleId: "creature.construct" } });
  await f.start(); assert.match(f.warnings.at(-1), /Нельзя договориться/);
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.events, []);
});

test("GM starts one separate duel from this sheet without changing physical-combat state or HP/STA", async t => {
  const f = fixture(t), physicalBefore = f.snapshot().physical;
  await f.view("verbal");
  const button = { disabled: false };
  await f.start(button);
  assert.equal(button.disabled, true);
  assert.equal(f.events.filter(entry => entry.kind === "create").length, 1);
  const create = f.events.find(entry => entry.kind === "create");
  assert.deepEqual(create.source, { scene: "scene", active: true, flags: { [SYSTEM_ID]: { verbalDuel: { pairs: {} } } } });
  assert.deepEqual(f.events.find(entry => entry.kind === "participants").rows, [
    { tokenId: "token0", sceneId: "scene", actorId: "hero" }, { tokenId: "token1", sceneId: "scene", actorId: "opponent" }
  ]);
  for (const actor of [f.actor, f.other]) {
    assert.equal(actor.system.resolve.value, 30);
    assert.equal(actor.system.health.value, 17); assert.equal(actor.system.stamina.value, 12);
    assert.deepEqual(actor.system.combatAction, { extra: true, lastExtraRound: "battle:4" });
    assert.deepEqual(actor.flags[SYSTEM_ID].fastStrike, { round: "battle:4", extra: true });
  }
  assert.deepEqual(f.snapshot().physical, physicalBefore); assert.equal(f.sheet.combatOptions.view, "verbal");
  assert.equal(f.events.filter(entry => entry.kind === "message").length, 1);
  await f.start(button); await f.start();
  assert.equal(f.events.filter(entry => entry.kind === "create").length, 1, "repeated clicks cannot reset Resolve or duplicate the duel");
  assert.deepEqual(f.warnings, []);
});

test("a rapid second click shares the disabled start control while Combat creation is pending", async t => {
  const f = fixture(t); let release;
  f.state.waitForCreate = new Promise(resolve => { release = resolve; });
  const button = { disabled: false }, first = f.start(button);
  assert.equal(button.disabled, true);
  await f.start(button);
  assert.equal(f.events.filter(entry => entry.kind === "create").length, 1);
  release(); await first;
  assert.equal(f.events.filter(entry => entry.kind === "participants").length, 1);
  assert.equal(f.sheet.renders, 1);
});

test("switching menus or opening another sheet cannot launch a second duel while the first start is pending", async t => {
  const f = fixture(t); let release;
  f.state.waitForCreate = new Promise(resolve => { release = resolve; });
  const first = f.start({ disabled: false });
  await f.view("combat"); await f.view("verbal");
  await f.start({ disabled: false });
  const secondSheet = { actor: f.actor, isEditable: true, renders: 0, async render() { this.renders++; } };
  await combatActions.startSheetVerbalDuel.call(secondSheet, null, { disabled: false });
  assert.equal(f.events.filter(entry => entry.kind === "create").length, 1);
  release(); await first;
  assert.equal(f.events.filter(entry => entry.kind === "participants").length, 1);
  assert.equal(f.events.filter(entry => entry.kind === "actor").length, 2);
});

test("a failed duel creation reports the error and rerenders without spending resources or losing view options", async t => {
  const f = fixture(t), before = f.snapshot(), options = structuredClone(f.sheet.combatOptions);
  f.state.failCreate = true; await f.start();
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.sheet.combatOptions, options);
  assert.deepEqual(f.warnings, ["Combat creation failed"]); assert.equal(f.sheet.renders, 1);
  assert.equal(f.events.some(entry => entry.kind === "actor" || entry.kind === "participants" || entry.kind === "message"), false);
  f.state.failCreate = false; await f.start();
  assert.equal(f.events.filter(entry => entry.kind === "participants").length, 1, "a failed start releases its actor lock so the GM can retry");
});
