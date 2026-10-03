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

globalThis.foundry = { canvas: { placeables: { Token: TokenHarness } } };
globalThis.PIXI = { Graphics: GraphicsHarness };
globalThis.canvas = { visibility: { tokenVision: true } };
const { WitcherToken } = await import("../scripts/canvas/witcher-token.mjs");

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
