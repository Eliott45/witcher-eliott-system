export class WitcherActor extends foundry.documents.Actor {
  async toggleStatusEffect(statusId, options = {}) {
    // Core combat still toggles the defeated overlay even when a system disables that special status.
    if (!statusId) return;
    return super.toggleStatusEffect(statusId, options);
  }
}
