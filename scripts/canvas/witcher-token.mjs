import { COMBAT_ACTOR_TYPES, PREVIEW_VISION_ANGLE, RESTRICTED_VISION_ANGLE } from "../config.mjs";
import { drawFacingMarker } from "../combat/facing-marker.mjs";
import { drawScatter } from "./scatter-overlay.mjs";
import { restrictedVision } from "../data/visor.mjs";

export class WitcherToken extends foundry.canvas.placeables.Token {
  #facingMarker;
  #markerGeometry = "";
  /** Tokens whose scatter overlay this client toggled on (client-only, no document data). */
  static scatterTokens = new Set();
  #scatter;
  #scatterGeometry = "";
  #scatterHighlight = null;
  #scatterTimer;
  #visionPreview = false;

  get hasFacing() {
    return COMBAT_ACTOR_TYPES.includes(this.actor?.type);
  }

  get visionPreviewActive() {
    // Drag/config previews must use the same perspective as their original token.
    return this._original?.visionPreviewActive ?? this.#visionPreview;
  }

  get hasLimitedSourceAngle() {
    return super.hasLimitedSourceAngle || (this.hasSight && this.visionPreviewActive);
  }

  get hasRestrictedVision() {
    return this._original?.hasRestrictedVision ?? (this.hasFacing && restrictedVision(this.actor.items));
  }

  /** One angle for the blind-zone marker and the optional local sight preview. */
  get facingVisionAngle() {
    return Math.min(this.document.sight.angle, this.hasRestrictedVision ? RESTRICTED_VISION_ANGLE : PREVIEW_VISION_ANGLE);
  }

  _getVisionSourceData() {
    const data = super._getVisionSourceData();
    if (!this.hasFacing) return data;
    // Foundry's zero faces south. Keep artwork upright and align sight with our north-facing arrow.
    data.rotation = (data.rotation + 180) % 360;
    if (this.visionPreviewActive) data.angle = this.facingVisionAngle;
    return data;
  }

  toggleVisionPreview() {
    if (!this.hasFacing || !this.isOwner || !this.hasSight || !canvas.visibility.tokenVision) return false;
    if (!this.visionPreviewActive && !this.control({ releaseOthers: true })) return false;
    this.#visionPreview = !this.#visionPreview;
    // Only rebuild this client's vision source. No document update or socket message.
    this.initializeVisionSource();
    return true;
  }

  get scatterVisible() {
    return WitcherToken.scatterTokens.has(this.id) || this.#scatterHighlight !== null;
  }

  toggleScatter() {
    if (WitcherToken.scatterTokens.has(this.id)) WitcherToken.scatterTokens.delete(this.id);
    else WitcherToken.scatterTokens.add(this.id);
    this.#refreshScatter();
    return WitcherToken.scatterTokens.has(this.id);
  }

  /** Briefly show where a scatter roll landed (every client that renders the chat result). */
  showScatterResult(result, duration = 10000) {
    this.#scatterHighlight = result;
    this.#scatterGeometry = "";
    this.#refreshScatter();
    clearTimeout(this.#scatterTimer);
    this.#scatterTimer = setTimeout(() => { this.#scatterHighlight = null; this.#scatterGeometry = ""; this.#refreshScatter(); }, duration);
  }

  #refreshScatter() {
    if (!this.scatterVisible && !this.#scatter) return;
    this.#scatter ??= this.addChild(new PIXI.Graphics());
    const overlay = this.#scatter;
    overlay.eventMode = "none";
    overlay.zIndex = -1;
    overlay.visible = this.scatterVisible && !this.document.isSecret;
    if (!overlay.visible) return;
    const { width, height } = this.document.getSize(), size = Math.max(width, height);
    const geometry = `${size}:${this.#scatterHighlight}`;
    if (geometry !== this.#scatterGeometry) { drawScatter(overlay, size, this.#scatterHighlight); this.#scatterGeometry = geometry; }
    overlay.position.set(width / 2, height / 2);
    overlay.angle = this.document.rotation;
    for (const label of overlay.children) if (label.witcherUpright) label.angle = -this.document.rotation;
  }

  refreshFacingVision() {
    this.#refreshFacingMarker();
    this.initializeVisionSource();
  }

  _onRelease(options) {
    this.#visionPreview = false;
    super._onRelease(options);
  }

  async _draw(options) {
    await super._draw(options);
    if (!this.hasFacing) return;
    this.#facingMarker ??= this.addChild(new PIXI.Graphics());
    this.#facingMarker.eventMode = "none";
    this.#facingMarker.zIndex = -2;
    this.#refreshFacingMarker();
  }

  _refreshState() {
    super._refreshState();
    this.#refreshFacingMarker();
  }

  _refreshSize() {
    super._refreshSize();
    this.#refreshFacingMarker();
  }

  _refreshRotation() {
    super._refreshRotation();
    this.#refreshFacingMarker();
  }

  _requiresRotationAnimation() {
    return this.hasFacing || super._requiresRotationAnimation();
  }

  _onAnimationUpdate(changed, context) {
    super._onAnimationUpdate(changed, context);
    // Core skips rotation rendering when portrait rotation is locked; the arrow still turns.
    if ("rotation" in changed) this.#refreshFacingMarker();
  }

  #refreshFacingMarker() {
    const marker = this.#facingMarker;
    if (!marker) return;
    marker.visible = this.hasFacing && !this.document.isSecret;
    marker.alpha = this.document.alpha;
    const { width, height } = this.document.getSize();
    const angle = this.facingVisionAngle;
    const geometry = `${width}:${height}:${angle}`;
    if (geometry !== this.#markerGeometry) {
      drawFacingMarker(marker, width, height, angle);
      this.#markerGeometry = geometry;
    }
    marker.position.set(width / 2, height / 2);
    marker.angle = this.document.rotation;
    this.#refreshScatter();
  }

  _destroy(options) {
    this.#visionPreview = false;
    // Core destroys all token children, including our non-interactive marker.
    super._destroy(options);
    this.#facingMarker = undefined;
    this.#markerGeometry = "";
    clearTimeout(this.#scatterTimer);
    this.#scatter = undefined;
    this.#scatterGeometry = "";
  }
}
