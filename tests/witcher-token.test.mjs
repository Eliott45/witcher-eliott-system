import assert from "node:assert/strict";
import { test } from "node:test";

// Exercise the custom Token lifecycle without a renderer or persistent document writes.
class TokenHarness {
  constructor({ type = "character", rotation = 0, angle = 360 } = {}) {
    this.actor = { type };
    this.document = { rotation, alpha: 1, isSecret: false, sight: { angle }, getSize: () => ({ width: 100, height: 100 }) };
    this.hasSight = true;
    this.isOwner = true;
    this.children = [];
    this.sourceUpdates = 0;
  }
  get hasLimitedSourceAngle() { return this.document.sight.angle !== 360; }
  _getVisionSourceData() { return { rotation: this.document.rotation, angle: this.document.sight.angle, radius: 0, lightRadius: 2000 }; }
  control(options) { this.controlOptions = options; return true; }
  initializeVisionSource() { this.sourceUpdates++; }
  _onRelease() { this.initializeVisionSource(); }
  async _draw() {}
  _refreshState() {}
  _refreshSize() {}
  _refreshRotation() {}
  _onAnimationUpdate() {}
  _requiresRotationAnimation() { return false; }
  addChild(child) { this.children.push(child); return child; }
  _destroy() { this.children = []; }
}

class GraphicsHarness {
  polygons = [];
  position = { set: (x, y) => { this.x = x; this.y = y; } };
  clear() { this.polygons = []; }
  lineStyle() {}
  beginFill() {}
  endFill() {}
  drawPolygon(points) { this.polygons.push(points); }
}

class TokenLayerHarness {
  _prepareKeyboardRotationUpdates(objects, dx, dy, dz) {
    this.offsets = [dx, dy, dz];
    return [objects.map(token => ({ _id: token.id, rotation: this.coreAngle })), this.options];
  }
}

globalThis.foundry = { canvas: { placeables: { Token: TokenHarness }, layers: { TokenLayer: TokenLayerHarness } } };
globalThis.PIXI = { Graphics: GraphicsHarness };
globalThis.canvas = { visibility: { tokenVision: true } };
const { WitcherToken } = await import("../scripts/canvas/witcher-token.mjs");
const { WitcherTokenLayer } = await import("../scripts/canvas/witcher-token-layer.mjs");
const { withinFacing } = await import("../scripts/combat/attack-target.mjs");
const { renderTokenVisionToggle } = await import("../scripts/combat/token-hud.mjs");
const { refreshActorVision } = await import("../scripts/canvas/visor-vision.mjs");
const { hasAbility } = await import("../scripts/data/abilities.mjs");

const helmet = () => ({id: "helm", type: "armor", system: {ruleId: "armor.head.7", zone: "head", equipped: true, quantity: 1, visorDown: true}});

test("keyboard facing agrees with the arrow, vision and front/rear checks in all eight directions", async () => {
  const layer = new WitcherTokenLayer();
  const token = new WitcherToken(); token.id = "hero";
  Object.assign(token.document, { x: 0, y: 0 });
  await token._draw({}); token.toggleVisionPreview();
  for (const [dx, dy, coreAngle, expected] of [
    [0, -1, 180, 0], [1, -1, 225, 45], [1, 0, 270, 90], [1, 1, 315, 135],
    [0, 1, 0, 180], [-1, 1, 45, 225], [-1, 0, 90, 270], [-1, -1, 135, 315]
  ]) {
    layer.coreAngle = coreAngle;
    const [updates] = layer._prepareKeyboardRotationUpdates([token], dx, dy, 0);
    assert.deepEqual(updates, [{ _id: "hero", rotation: expected }]);
    Object.assign(token.document, { rotation: updates[0].rotation }); token._refreshRotation();
    assert.equal(token.children[0].angle, expected);
    assert.equal(token._getVisionSourceData().rotation, coreAngle);
    const subject = sign => ({ x: sign * dx * 100, y: sign * dy * 100, getSize: token.document.getSize });
    assert.equal(withinFacing(token, subject(1)), true);
    assert.equal(withinFacing(token, subject(-1)), false);
  }
});

test("keyboard rotation preserves native grid angles, options and tokens without facing", () => {
  const layer = new WitcherTokenLayer(); layer.options = { animate: false };
  const hero = new WitcherToken(); hero.id = "hero";
  const npc = new WitcherToken({ type: "npc" }); npc.id = "npc";
  const loot = new WitcherToken({ type: "loot" }); loot.id = "loot";
  for (const coreAngle of [30, 60, 120, 150, 210, 240, 300, 330]) {
    layer.coreAngle = coreAngle;
    const [updates, options] = layer._prepareKeyboardRotationUpdates([hero, npc, loot], 1, -1, 0);
    assert.deepEqual(updates, [
      { _id: "hero", rotation: (coreAngle + 180) % 360 },
      { _id: "npc", rotation: (coreAngle + 180) % 360 },
      { _id: "loot", rotation: coreAngle }
    ]);
    assert.equal(options, layer.options); assert.deepEqual(layer.offsets, [1, -1, 0]);
    assert.equal(hero.document.rotation, 0, "Preparing updates must not mutate a live token");
  }
  layer.coreAngle = 0;
  assert.deepEqual(layer._prepareKeyboardRotationUpdates([hero], 0, 0, 1)[0], [{ _id: "hero", rotation: 0 }]);
});

test("preview is local, reversible, preserves lighting and resets on deselection", () => {
  const token = new WitcherToken();
  const source = structuredClone(token.document.sight);
  assert.equal(token._getVisionSourceData().angle, 360);
  assert.equal(token.toggleVisionPreview(), true);
  assert.equal(token._getVisionSourceData().angle, 180);
  assert.equal(token._getVisionSourceData().radius, 0);
  assert.equal(token._getVisionSourceData().lightRadius, 2000);
  assert.equal(token.hasLimitedSourceAngle, true);
  assert.deepEqual(token.controlOptions, { releaseOthers: true });
  token.toggleVisionPreview();
  assert.equal(token._getVisionSourceData().angle, 360);
  token.toggleVisionPreview();
  token._onRelease({});
  assert.equal(token.visionPreviewActive, false);
  assert.equal(token._getVisionSourceData().angle, 360);
  assert.deepEqual(token.document.sight, source);
});

test("north, east, south and west align the sight cone with the marker", () => {
  for (const [rotation, coreRotation] of [[0, 180], [90, 270], [180, 0], [270, 90]]) {
    const token = new WitcherToken({ rotation });
    token.toggleVisionPreview();
    assert.equal(token._getVisionSourceData().rotation, coreRotation);
    assert.equal(token.document.rotation, rotation, "Do not rotate the artwork to fix sight");
  }
});

test("preview does not broaden a deliberately narrower field of view", () => {
  const token = new WitcherToken({ angle: 90 });
  token.toggleVisionPreview();
  assert.equal(token._getVisionSourceData().angle, 90);
  token.toggleVisionPreview();
  assert.equal(token._getVisionSourceData().angle, 90);
});

test("preview cannot be enabled on someone else's or a sightless token", () => {
  const token = new WitcherToken();
  token.isOwner = false;
  assert.equal(token.toggleVisionPreview(), false);
  token.isOwner = true;
  token.hasSight = false;
  assert.equal(token.toggleVisionPreview(), false);
  token.hasSight = true;
  canvas.visibility.tokenVision = false;
  try { assert.equal(token.toggleVisionPreview(), false); }
  finally { canvas.visibility.tokenVision = true; }
  assert.equal(token.sourceUpdates, 0);
});

test("drag preview follows the original's temporary cone, including reset", () => {
  const token = new WitcherToken();
  const clone = new WitcherToken({ rotation: 90 });
  clone._original = token;
  token.toggleVisionPreview();
  assert.equal(clone._getVisionSourceData().angle, 180);
  assert.equal(clone._getVisionSourceData().rotation, 270);
  token._onRelease({});
  assert.equal(clone._getVisionSourceData().angle, 360);
});

test("marker points up, keeps the rear below, reuses graphics and tracks animated rotation", async () => {
  const token = new WitcherToken();
  await token._draw({});
  await token._draw({});
  assert.equal(token.children.length, 1, "Redraw must not duplicate the overlay");
  const marker = token.children[0];
  const [rear, arrow] = marker.polygons;
  assert.ok(rear.filter((_, i) => i % 2).every(y => y >= -1e-10));
  assert.ok(arrow.filter((_, i) => i % 2).every(y => y < -50));
  assert.equal(marker.eventMode, "none");
  assert.equal(marker.x, 50);
  assert.equal(marker.angle, 0);
  token.document.rotation = 90;
  token.document.lockRotation = true;
  token._onAnimationUpdate({ rotation: 90 }, {});
  assert.equal(marker.angle, 90);
  assert.equal(token._requiresRotationAnimation(), true);
  token.document.getSize = () => ({ width: 200, height: 200 });
  token._refreshSize();
  assert.equal(marker.x, 100);
  assert.ok(marker.polygons[1][1] < arrow[1]);
});

test("secret tokens do not expose facing decorations", async () => {
  const token = new WitcherToken();
  await token._draw({});
  token.document.isSecret = true;
  token._refreshState();
  assert.equal(token.children[0].visible, false);
});

test("unrelated actor types keep native sight and no decoration", async () => {
  const token = new WitcherToken({ type: "loot" });
  await token._draw({});
  assert.equal(token.children.length, 0);
  assert.equal(token._getVisionSourceData().rotation, 0);
  assert.equal(token.toggleVisionPreview(), false);
});

test("lowered visor previews the forward 90° and the player can turn that preview off", () => {
  const helm = helmet();
  for (const angle of [360, 180, 60]) {
    const token = new WitcherToken({angle});
    token.actor.items = [helm];
    assert.equal(token._getVisionSourceData().angle, angle, "Preview starts off, even with a lowered visor");
    assert.equal(token.hasLimitedSourceAngle, angle !== 360);
    token.toggleVisionPreview();
    for (const rotation of [0, 90, 180, 270]) {
      token.document.rotation = rotation;
      const data = token._getVisionSourceData();
      assert.equal(data.angle, Math.min(angle, 90));
      assert.equal(data.rotation, (rotation + 180) % 360);
      assert.equal(token.hasLimitedSourceAngle, true);
      assert.equal(data.lightRadius, 2000);
    }
    token.toggleVisionPreview();
    assert.equal(token._getVisionSourceData().angle, angle, "Turning the preview off restores the stored angle");
    token.toggleVisionPreview();
    assert.equal(token._getVisionSourceData().angle, Math.min(angle, 90));
    token._onRelease({});
    assert.equal(token._getVisionSourceData().angle, angle, "Deselecting ends the temporary preview");
    token.toggleVisionPreview();
    helm.system.visorDown = false;
    assert.equal(token._getVisionSourceData().angle, Math.min(angle, 180));
    helm.system.visorDown = true;
    helm.system.equipped = false;
    assert.equal(token._getVisionSourceData().angle, Math.min(angle, 180));
    helm.system.equipped = true;
    token.actor.items = [];
    assert.equal(token._getVisionSourceData().angle, Math.min(angle, 180));
    assert.equal(token.document.sight.angle, angle, "Never overwrite stored vision or require restoring a saved angle");
  }
});

test("token drag/config clone inherits visor state and north-facing cone from original", () => {
  const original = new WitcherToken();
  original.actor.items = [{type: "armor", system: {zone: "head", ruleId: "armor.head.6", equipped: true, quantity: 1, visorDown: true}}];
  const clone = new WitcherToken({rotation: 90});
  clone._original = original;
  assert.equal(clone._getVisionSourceData().angle, 360);
  original.toggleVisionPreview();
  assert.equal(clone._getVisionSourceData().angle, 90);
  assert.equal(clone._getVisionSourceData().rotation, 270);
  original.actor.items[0].system.visorDown = false;
  assert.equal(clone._getVisionSourceData().angle, 180);
  original.toggleVisionPreview();
  assert.equal(clone._getVisionSourceData().angle, 360);
});

// Ray casting tests points on the rendered ring, independently of its arc construction.
function containsPoint(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
    const xi = polygon[i], yi = polygon[i + 1], xj = polygon[j], yj = polygon[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const shaded = (marker, degrees) => containsPoint(marker.polygons[0], Math.cos(degrees * Math.PI / 180) * 60, Math.sin(degrees * Math.PI / 180) * 60);

test("blind-zone ring changes from 180° to 270° immediately on the same token when the visor changes", async () => {
  const token = new WitcherToken();
  const helm = helmet(); helm.system.visorDown = false;
  Object.assign(token.actor, {uuid: "Actor.wearer", documentName: "Actor", items: [helm]});
  await token._draw({});
  const marker = token.children[0], oldRing = marker.polygons[0], arrow = [...marker.polygons[1]];
  for (const degree of [-150, -90, -30]) assert.equal(shaded(marker, degree), false);
  for (const degree of [30, 90, 150]) assert.equal(shaded(marker, degree), true);
  canvas.ready = true; canvas.tokens = {placeables: [token]};
  helm.system.visorDown = true;
  refreshActorVision(token.actor);
  assert.equal(token.sourceUpdates, 1);
  assert.equal(token.children[0], marker, "Rebuild geometry without adding a second overlay");
  assert.notDeepEqual(marker.polygons[0], oldRing);
  assert.deepEqual(marker.polygons[1], arrow, "Arrow position and shape stay unchanged");
  for (const degree of [-150, -30, 0, 90, 180]) assert.equal(shaded(marker, degree), true);
  for (const degree of [-120, -90, -60]) assert.equal(shaded(marker, degree), false);
  assert.equal(token._getVisionSourceData().angle, 360, "Marker reflects the visor even while preview is off");
  token.toggleVisionPreview();
  assert.equal(token._getVisionSourceData().angle, 90);
  helm.system.visorDown = false;
  refreshActorVision(token.actor);
  assert.deepEqual(marker.polygons[0], oldRing);
  assert.equal(token._getVisionSourceData().angle, 180);
  helm.system.visorDown = true;
  refreshActorVision(token.actor);
  helm.system.equipped = false;
  refreshActorVision(token.actor);
  assert.deepEqual(marker.polygons[0], oldRing);
  assert.equal(token._getVisionSourceData().angle, 180);
  token._destroy({});
  await token._draw({});
  assert.deepEqual(token.children[0].polygons[0], oldRing, "Destroyed tokens do not retain a stale marker cache");
  canvas.ready = false;
});

test("HUD button shows the current cone and toggles its preview without lifting the visor or restoring witcher senses", () => {
  const token = new WitcherToken();
  const helm = helmet();
  Object.assign(token.actor, {items: [helm], system: {details: {race: "witcher"}}});
  const buttons = [];
  globalThis.document = {createElement: () => ({
    dataset: {}, attributes: {}, listeners: {},
    classList: {toggle(name, value) { this[name] = value; }},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(event, listener) { this.listeners[event] = listener; },
    remove() { buttons.splice(buttons.indexOf(this), 1); }
  })};
  globalThis.game = {i18n: {
    localize: () => "Скрыть конус зрения",
    format: (_key, {angle}) => `Показать конус зрения (${angle}°)`
  }};
  const element = {querySelector: selector => selector === ".col.right" ? {append: button => buttons.push(button)} : buttons[0]};
  let prevented = 0, stopped = 0;
  const click = () => buttons[0].listeners.click({preventDefault: () => prevented++, stopPropagation: () => stopped++});
  renderTokenVisionToggle({object: token}, element);
  assert.equal(buttons[0].attributes["aria-label"], "Показать конус зрения (90°)");
  assert.equal(buttons[0].dataset.tooltip, buttons[0].attributes["aria-label"]);
  click();
  assert.equal(buttons[0].attributes["aria-pressed"], "true");
  assert.equal(buttons[0].attributes["aria-label"], "Скрыть конус зрения");
  assert.equal(buttons[0].classList.active, true);
  assert.equal(token._getVisionSourceData().angle, 90);
  click();
  assert.equal(buttons[0].attributes["aria-pressed"], "false");
  assert.equal(buttons[0].classList.active, false);
  assert.equal(token._getVisionSourceData().angle, 360);
  assert.equal(helm.system.visorDown, true);
  assert.equal(hasAbility(token.actor, "witcher.enhanced-senses"), false);
  assert.equal(prevented, 2); assert.equal(stopped, 2);
  helm.system.visorDown = false;
  renderTokenVisionToggle({object: token}, element);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].attributes["aria-label"], "Показать конус зрения (180°)");
  click();
  assert.equal(token._getVisionSourceData().angle, 180);
});
