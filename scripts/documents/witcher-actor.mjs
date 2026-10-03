import { hasStatus, DYING, DEAD } from "../combat/status-effects.mjs";

export class WitcherActor extends foundry.documents.Actor {
  async toggleStatusEffect(statusId, options = {}) {
    // Core combat still toggles the defeated overlay even when a system disables that special status.
    if (!statusId) return;
    if ([DYING, DEAD].includes(statusId) && !game.user.isGM
      && (options.active === false || (options.active === undefined && hasStatus(this, statusId)))) {
      ui.notifications.warn(game.i18n.localize("WITCHER.Death.GMRemoval"));
      return;
    }
    return super.toggleStatusEffect(statusId, options);
  }
}
