import { COMBAT_ACTOR_TYPES, PREVIEW_VISION_ANGLE, RESTRICTED_VISION_ANGLE } from "../config.mjs";
import { drawFacingMarker } from "../combat/facing-marker.mjs";
import { restrictedVision } from "../data/visor.mjs";

export class WitcherToken extends foundry.canvas.placeables.Token {
  #facingMarker;
  #markerSize = "";
  #visionPreview = false;

  get hasFacing() {
    return COMBAT_ACTOR_TYPES.includes(this.actor?.type);
  }

  get visionPreviewActive() {
    // Drag/config previews must use the same perspective as their original token.
    return this._original?.visionPreviewActive ?? this.#visionPreview;
  }

  get hasLimitedSourceAngle() {
    return super.hasLimitedSourceAngle || (this.hasSight && (this.visionPreviewActive || this.hasRestrictedVision));
  }

  get hasRestrictedVision() {
    return this._original?.hasRestrictedVision ?? (this.hasFacing && restrictedVision(this.actor.items));
  }

  _getVisionSourceData() {
    const data = super._getVisionSourceData();
    if (!this.hasFacing) return data;
    // Foundry's zero faces south. Keep artwork upright and align sight with our north-facing arrow.
    data.rotation = (data.rotation + 180) % 360;
    if (this.visionPreviewActive) data.angle = Math.min(data.angle, PREVIEW_VISION_ANGLE);
    if (this.hasRestrictedVision) data.angle = Math.min(data.angle, RESTRICTED_VISION_ANGLE);
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
    const size = `${width}:${height}`;
    if (size !== this.#markerSize) {
      drawFacingMarker(marker, width, height);
      this.#markerSize = size;
    }
    marker.position.set(width / 2, height / 2);
    marker.angle = this.document.rotation;
  }

  _destroy(options) {
    this.#visionPreview = false;
    // Core destroys all token children, including our non-interactive marker.
    super._destroy(options);
    this.#facingMarker = undefined;
    this.#markerSize = "";
  }
}
