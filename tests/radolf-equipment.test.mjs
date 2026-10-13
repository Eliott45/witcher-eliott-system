import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { RADOLF_EQUIPMENT, RADOLF_FIRST_PAGE, RADOLF_FOLDER, RADOLF_SOURCE } from "../scripts/data/radolf-equipment.mjs";
import { torchHeldLit, radolfItemContext } from "../scripts/data/radolf-rules.mjs";
import { effectiveItem } from "../scripts/data/workshop.mjs";
import { weaponHitTraits } from "../scripts/combat/weapon-hit-effects.mjs";
import { consumableContext } from "../scripts/data/consumables.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { useRadolfItem } from "../scripts/combat/radolf-actions.mjs";
import { marblesDC, scatterMarbles, crossesMarbles, rollMarbles, registerRadolfMarbles } from "../scripts/combat/radolf-marbles.mjs";
import { torchLightLevel, syncTorchLights } from "../scripts/combat/radolf-light.mjs";

function patch(object, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const keys = key.split("."), last = keys.pop();
    keys.reduce((at, part) => at[part] ??= {}, object)[last] = value;
  }
}
function fixture() {
  delete globalThis.Hooks;
  const gm = { isGM: true }, messages = [], totals = [], rolls = [];
  const scene = { id: "radolf", grid: { size: 100, distance: 2 }, tokens: [], regions: [], lights: [],
    async createEmbeddedDocuments(type, sources) {
      const collection = type === "Region" ? this.regions : this.lights;
      const entries = sources.map(source => ({ ...structuredClone(source), id: `doc${collection.length}`, parent: scene,
        async delete() { collection.splice(collection.indexOf(this), 1); } }));
      collection.push(...entries); return entries;
    },
    async updateEmbeddedDocuments(type, sources) { assert.equal(type, "AmbientLight"); for (const row of sources) patch(this.lights.find(light => light.id === row._id), row); },
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "AmbientLight"); this.lights = this.lights.filter(light => !ids.includes(light.id)); }
  };
  globalThis.game = { user: gm, users: { activeGM: gm }, scenes: [scene], combat: null, time: { worldTime: 0 },
    settings: { get: () => "public" }, i18n: { localize: key => key } };
  globalThis.ui = { notifications: { warn: text => { throw new Error(text); } } };
  globalThis.foundry = { dice: { Roll: class {
    constructor(formula) { this.formula = formula; rolls.push(this); }
    async evaluate() { this.total = totals.shift() ?? 20; return this; }
    async toMessage(source) { const message = { ...source, rolls: [this] }; messages.push(message); return message; }
  } }, documents: {
    ActiveEffect: { getEffectStart: () => ({ time: 0 }) },
    ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }), applyMode: source => source, async create(source) { messages.push(source); return source; } }
  } };
  const actor = { id: "hero", uuid: "Actor.hero", name: "Герой", type: "character", isOwner: true, isToken: true, items: [], effects: [], statuses: new Set(),
    system: { stamina: { value: 40, max: 40 }, skills: { athletics: 4, wildernessSurvival: 3 }, abilityState: {},
      statistics: { effective: { intelligence: 6, dexterity: 5 }, modifiers: [] }, creature: {} },
    async update(changes) { const { items, ...rest } = changes; patch(this, rest); for (const row of items ?? []) patch(this.items.get(row._id), row); },
    async createEmbeddedDocuments(type, sources) { assert.equal(type, "ActiveEffect"); for (const source of sources) { this.effects.push({ ...source, statuses: new Set(source.statuses) }); for (const status of source.statuses) this.statuses.add(status); } }
  };
  actor.items.get = id => actor.items.find(item => item.id === id);
  const token = { id: "heroToken", uuid: "Scene.radolf.Token.heroToken", parent: scene, actor, x: 0, y: 0, elevation: 0, getSize: () => ({ width: 100, height: 100 }) };
  actor.token = token; scene.tokens.push(token);
  globalThis.canvas = { scene, tokens: { controlled: [] } };
  const item = id => {
    const row = RADOLF_FIRST_PAGE.find(row => row.id === `radolf.${id}`);
    const result = { ...structuredClone(row), id: row.documentId, actor, flags: {},
      system: { ...structuredClone(row.system), ruleId: row.id, quantity: 1, carried: true, equipped: false } };
    actor.items.push(result); return result;
  };
  return { actor, token, scene, item, messages, rolls, totals };
}

test("first-page DLC shares identical core gear and keeps seven exclusive items", async () => {
  const sources = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url)));
  const entries = sources.filter(item => RADOLF_EQUIPMENT.some(entry=>entry.id===item.system.ruleId));
  assert.equal(entries.length, 7);
  assert.equal(new Set(entries.map(item => item._id)).size, 7);
  assert.deepEqual(entries.map(item => [item.system.weight, item.system.price]), [[.1,18],[.1,3],[.1,32],[1.5,15],[.1,30],[.1,36],[.1,6]]);
  for (const item of entries) { assert.equal(item.folder, RADOLF_FOLDER.id); assert.equal(item.system.source, RADOLF_SOURCE); assert.doesNotMatch(item.system.description, /стр\./u); }
  const shovel = entries.find(item => item.system.ruleId === "radolf.shovel");
  assert.equal(shovel.type, "weapon"); assert.equal(shovel.system.hands, 2); assert.equal(shovel.system.accuracy, -2);
  assert.equal(shovel.system.damage, "2d6"); assert.equal(shovel.system.reliability.max, 15);
  assert.equal(sources.find(item => item.system.ruleId === "gear.torch").type, "weapon");
  for (const id of ["rations", "waterskin", "torch"]) assert.equal(sources.filter(item => ["gear." + id, "radolf." + id].includes(item.system.ruleId)).length, 1);
  const f = fixture(); assert.equal(consumableContext(f.item("rations")).canUse, true);
  assert.equal(consumableContext(f.item("waterskin")).enabled, false);
});

test("navigation buttons add only their own situational bonus and respect unavailable inventory", async () => {
  const f = fixture(), compass = f.item("compass"), sun = f.item("sunstone");
  assert.equal(skillValue(f.actor.system, "wildernessSurvival").total, 9);
  await useRadolfItem(compass); await useRadolfItem(sun);
  assert.deepEqual(f.rolls.map(roll => roll.formula), ["1d10wc + 12", "1d10wc + 11"]);
  assert.deepEqual(f.messages.map(message => message.flags[SYS].skillCheck.base), [12,11]);
  assert.equal(skillValue(f.actor.system, "wildernessSurvival").total, 9);
  compass.system.carried = false;
  await assert.rejects(useRadolfItem(compass), /при себе/);
  assert.equal(radolfItemContext(compass).disabled, true);
});

test("torch burn chance follows lighting, held state, containers and quantity without editing properties", async () => {
  const f = fixture(), torch = f.item("torch"), properties = torch.system.properties;
  assert.equal(weaponHitTraits(effectiveItem(torch)).burning, 0);
  await assert.rejects(useRadolfItem(torch), /возьмите факел в руку/);
  torch.system.equipped = true;
  await useRadolfItem(torch); assert.equal(torchHeldLit(torch), true);
  assert.equal(weaponHitTraits(effectiveItem(torch)).burning, 25);
  assert.equal(torch.system.properties, properties);
  torch.system.equipped = false; assert.equal(weaponHitTraits(effectiveItem(torch)).burning, 0);
  torch.system.equipped = true; torch.system.quantity = 0; assert.equal(torchHeldLit(torch), false);
  torch.system.quantity = 1;
  f.actor.items.push({ id: "bag", type: "equipment", system: { kind: "container", quantity: 1 } });
  torch.system.containerId = "bag"; assert.equal(torchHeldLit(torch), false);
  torch.system.containerId = "";
  await useRadolfItem(torch); assert.equal(weaponHitTraits(effectiveItem(torch)).burning, 0);
});

test("torch light follows its token, preserves unrelated lights, raises one level and respects walls", async () => {
  const f = fixture(), torch = f.item("torch"); torch.system.equipped = true; await useRadolfItem(torch);
  const custom = { id: "custom", x: 200, y: 200, flags: {} }; f.scene.lights.push(custom);
  await syncTorchLights(f.scene); await syncTorchLights(f.scene);
  assert.equal(f.scene.lights.length, 2);
  const light = f.scene.lights.find(light => light.flags[SYS]?.radolfTorch);
  assert.equal(light.config.dim, 5); assert.equal(light.config.bright, 0);
  assert.equal(torchLightLevel("dark", f.scene, f.token), "dim");
  assert.equal(torchLightLevel("dim", f.scene, f.token), "day");
  const other = { ...f.token, x: 251, actor: null };
  assert.equal(torchLightLevel("dark", f.scene, other), "dark");
  other.x = 100; f.token.object = { checkCollision: () => true };
  assert.equal(torchLightLevel("dark", f.scene, other), "dark");
  delete f.token.object; f.token.x = 300; await syncTorchLights(f.scene); assert.equal(light.x, 350);
  torch.system.equipped = false; await syncTorchLights(f.scene); assert.deepEqual(f.scene.lights, [custom]);
});

test("marbles recognize quadrupeds, legless and airborne creatures; explicit anatomy overrides profiles", () => {
  const f = fixture(); assert.equal(marblesDC(f.actor), 14);
  f.actor.type = "npc";
  // Identify by canonical ability, not a translated or player-edited name.
  f.actor.items.push({ type: "ability", system: { ruleId: "creature.wolf.test" } }); assert.equal(marblesDC(f.actor), 12);
  f.actor.system.creature.footing = "ordinary"; assert.equal(marblesDC(f.actor), 14);
  f.actor.system.creature.footing = "legless"; assert.equal(marblesDC(f.actor), null);
  f.actor.system.creature.footing = "auto";
  f.actor.items[0].system.ruleId = "creature.snake.test"; assert.equal(marblesDC(f.actor), null);
  f.actor.items = []; f.actor.system.creature.movementMode = "flying"; assert.equal(marblesDC(f.actor), null);
});

test("marbles consume one bag, catch complete crossings and internal movement, and apply prone on failed saves", async () => {
  const f = fixture(), bag = f.item("marbles");
  const region = await scatterMarbles(f.actor, bag, { point: { x: 200, y: 50 }, diameter: 2 });
  assert.equal(bag.system.quantity, 0); assert.equal(region.shapes[0].radiusX, 50);
  assert.equal(crossesMarbles(region, {x:0,y:50}, {x:400,y:50}), true);
  assert.equal(crossesMarbles(region, {x:200,y:50}, {x:210,y:50}), true);
  assert.equal(crossesMarbles(region, {x:0,y:150}, {x:400,y:150}), false);
  assert.equal(crossesMarbles(region, {x:0,y:50}, {x:400,y:50}, 3), false);
  f.totals.push(14,13); assert.equal(await rollMarbles(f.actor), true); assert.equal(await rollMarbles(f.actor), false);
  assert.ok(f.actor.statuses.has("prone")); assert.equal(await rollMarbles(f.actor), null);
  bag.system.quantity = 1; f.actor.update = async () => { throw new Error("write failure"); };
  await assert.rejects(scatterMarbles(f.actor, bag, { point: {x:400,y:50}, diameter:2 }), /write failure/);
  assert.equal(f.scene.regions.length, 1); assert.equal(bag.system.quantity, 1);
});

test("active GM catches player movement without local preUpdate hooks, ignores teleport and rotation", async () => {
  const f = fixture(); await scatterMarbles(f.actor, f.item("marbles"), { point:{x:200,y:50}, diameter:2 });
  const hooks = new Map(); globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn), once: (name, fn) => hooks.set(name, fn) };
  registerRadolfMarbles(); hooks.get("ready")();
  f.token.x = 400; await hooks.get("updateToken")(f.token, {x:400}, {teleport:true}); assert.equal(f.rolls.length, 0);
  f.token.x = 0; f.totals.push(20); await hooks.get("updateToken")(f.token, {x:0}, {}); assert.equal(f.rolls.length, 1);
  await hooks.get("updateToken")(f.token, {rotation:90}, {}); assert.equal(f.rolls.length, 1);
  game.user = {isGM:false}; f.token.x = 400; await hooks.get("updateToken")(f.token,{x:400},{}); assert.equal(f.rolls.length,1);
});
