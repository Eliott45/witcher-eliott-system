import { conditionUpdate, isPhysical } from "../data/physical-items.mjs";
export class WitcherItem extends foundry.documents.Item {
  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate(changes, options, user);
    if (result === false) return false;
    if (!isPhysical(this)) return;
    Object.assign(changes, conditionUpdate(this, changes));
    if ((changes["system.quantity"] ?? changes.system?.quantity) === 0 || (changes["system.carried"] ?? changes.system?.carried) === false)
      changes["system.equipped"] = false;
  }
}
