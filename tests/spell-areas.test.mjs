import test from "node:test";
import assert from "node:assert/strict";
import { CORE_MAGIC } from "../scripts/data/spells.mjs";
import { spellArea, areaShape, areaLabel, facing, tokensInArea, expiredSpellAreas, placeSpellArea, SPELL_CONE_ANGLE } from "../scripts/magic/spell-areas.mjs";

const magic = id => CORE_MAGIC.find(entry => entry.id === id).system;

test("cones and radii come from the Range field; placed zones and lines from the effect text", () => {
  assert.deepEqual(spellArea(magic("sign.aard")), { type: "cone", radius: 2, origin: "caster" });
  assert.deepEqual(spellArea(magic("spell.fire-stream")), { type: "cone", radius: 3, origin: "caster" });
  assert.deepEqual(spellArea(magic("spell.zephyr")), { type: "circle", radius: 2, origin: "caster", attach: false });
  assert.equal(spellArea(magic("invocation.white-flame")).attach, true, "a lasting aura follows the caster");
  assert.deepEqual(spellArea(magic("spell.tanio-ilchar")), { type: "rectangle", width: 2, height: 2, reach: 8, origin: "point" });
  assert.deepEqual(spellArea(magic("spell.alzur-thunder")), { type: "line", length: 25, origin: "caster" });
  assert.equal(spellArea(magic("ritual.consecration")).attach, false);
  for (const id of ["sign.yrden", "spell.aenye", "spell.part-water", "sign.quen"]) assert.equal(spellArea(magic(id)), null, id);
  assert.equal(CORE_MAGIC.filter(entry => spellArea(entry.system)).length, 30);
  assert.equal(areaLabel(spellArea(magic("spell.stammelford-tremor"))), "радиус 5 м, в пределах 30 м");
});

test("shapes are built in pixels with the book's sizes", () => {
  const px = metres => metres * 50, center = { x: 100, y: 200 };
  assert.deepEqual(areaShape({ type: "cone", radius: 3 }, center, px, 2),
    { type: "cone", x: 100, y: 200, radius: 150, angle: SPELL_CONE_ANGLE, rotation: 0, curvature: "round", gridBased: false });
  assert.equal(areaShape({ type: "line", length: 25 }, center, px, 2).width, 100);
  assert.equal(areaShape({ type: "rectangle", width: 2, height: 2 }, center, px, 2).anchorX, 0.5);
  assert.equal(facing({ x: 0, y: 0 }, { x: 0, y: 10 }), 90);
});

test("everyone inside except the caster and hidden tokens becomes a target", () => {
  const token = (id, inside, extra = {}) => ({ id, name: id, actor: {}, hidden: false, testInsideRegion: () => inside, ...extra });
  const caster = token("caster", true);
  const region = { parent: { tokens: [caster, token("a", true), token("b", false), token("c", true, { hidden: true }), token("d", true, { actor: null })] } };
  assert.deepEqual(tokensInArea(region, caster).map(entry => entry.id), ["a"]);
});

test("instant templates end with the turn, concentration templates with the concentration", () => {
  const region = (id, spellArea) => ({ id, flags: { "witcher-eliott-system": { spellArea } } });
  const scene = { regions: [
    region("instant", { instant: true, combat: { id: "c", round: 1, turn: 0 } }),
    region("outside", { instant: true, combat: null }),
    region("held", { sustained: true, actor: "Actor.m", spellId: "s1" }),
    region("plain", {})] };
  const combat = { id: "c", started: true, round: 1, turn: 0 };
  assert.deepEqual(expiredSpellAreas(scene, { combat }).map(entry => entry.id), []);
  assert.deepEqual(expiredSpellAreas(scene, { combat: { ...combat, turn: 1 } }).map(entry => entry.id), ["instant"]);
  assert.deepEqual(expiredSpellAreas(scene, { combat: null }).map(entry => entry.id), ["instant"], "the combat ended");
  const actors = new Map([["Actor.m", { system: { magic: { sustainedId: "" } } }]]);
  assert.deepEqual(expiredSpellAreas(scene, { combat, actors }).map(entry => entry.id), ["held"]);
});

test("placement turns a cone towards the cursor, refuses a zone beyond reach and targets the tokens inside", async () => {
  const notices = [];
  const caster = { id: "caster", x: 0, y: 0, rotation: 0, hidden: false, level: null, getSize: () => ({ width: 100, height: 100 }) };
  const victim = { id: "victim", name: "Бандит", actor: {}, hidden: false, testInsideRegion: () => true };
  const scene = { id: "s", grid: { distance: 2 }, regions: [], tokens: [caster, victim] };
  caster.parent = scene;
  let targets = null, placed = null;
  globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 2 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis.ui = { notifications: { info: text => notices.push(text), warn: text => notices.push(`warn: ${text}`) } };
  globalThis.game = { user: { id: "u", color: { css: "#fff" } }, combat: null };
  globalThis.canvas = { ready: true, scene, dimensions: { distancePixels: 50 }, tokens: { controlled: [{ actor: { uuid: "Actor.a" }, document: caster }], setTargets: ids => { targets = ids; } },
    regions: { placeRegion: async (data, options) => {
      placed = data;
      const shape = { ...data.shapes[0], updateSource(changes) { Object.assign(this, changes); } };
      assert.equal(options.onMove({ shape, position: { x: 50, y: 300 } }), false);
      assert.equal(shape.x, 50); assert.equal(shape.rotation, 90, "the cone points at the cursor");
      return { parent: scene, flags: {} };
    } } };
  const actor = { uuid: "Actor.a", isToken: false };
  const item = { id: "i", name: "Аард", system: { ...magic("sign.aard"), defense: ["none"], damage: "" } };
  const result = await placeSpellArea(actor, item, { id: "m", flags: {}, rolls: [] });
  assert.equal(placed.shapes[0].type, "cone"); assert.equal(placed.flags["witcher-eliott-system"].spellArea.instant, true);
  assert.deepEqual(targets, ["victim"]); assert.equal(result.strikes, null, "no defense printed: targets only");
  assert.match(notices.at(-1), /Бандит/);

  const zone = { id: "z", name: "Танио Ильхар", system: magic("spell.tanio-ilchar") };
  canvas.regions.placeRegion = async (_data, options) => {
    assert.equal(options.preConfirm({ shape: { x: 50 + 50 * 20, y: 50 } }), false, "20 m is beyond 8 m");
    assert.equal(options.preConfirm({ shape: { x: 50 + 50 * 8, y: 50 } }), true);
    return null;
  };
  assert.equal(await placeSpellArea(actor, zone, { id: "m2", flags: {}, rolls: [] }), null, "Esc cancels");
  assert.ok(notices.some(text => /Слишком далеко/.test(text)));
});
