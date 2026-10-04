import { conditionUpdate, isPhysical } from "../data/physical-items.mjs";
import { isContainer, canContain, containerParent, isCarried } from "../data/containers.mjs";
import { ammunitionUpdate } from "../migrations/ammunition-data.mjs";
import { defaultItemIcon, equipmentIconUpdate } from "../data/item-icons.mjs";
export class WitcherItem extends foundry.documents.Item {
  async _preCreate(data, options, user) {
    const result = await super._preCreate(data, options, user);
    if (result === false) return false;
    this.updateSource(ammunitionUpdate(this));
    if (isPhysical(this)) this.updateSource(!data.img && (!this.img || this.img === "icons/svg/item-bag.svg")
      ? { img: defaultItemIcon(this) } : equipmentIconUpdate(this));
    if (isContainer(this)) this.updateSource({ "system.quantity": 1, "system.equipped": false });
  }

  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate(changes, options, user);
    if (result === false) return false;
    if (!isPhysical(this)) return;
    Object.assign(changes, conditionUpdate(this, changes));
    const kind = changes["system.kind"] ?? changes.system?.kind ?? this.system.kind;
    if (this.type === "equipment" && kind === "container") {
      if (!isContainer(this) && this.system.quantity > 1) {
        ui.notifications.warn("Контейнер должен быть отдельным предметом. Сначала разделите стопку.");
        return false;
      }
      changes["system.quantity"] = 1;
    }
    const parentId = changes["system.containerId"] ?? changes.system?.containerId;
    if (parentId) {
      const parent = this.actor?.items.get(parentId);
      if (!parent || !canContain(this, parent, this.actor.items)) {
        ui.notifications.warn("Нельзя поместить контейнер в себя или его содержимое.");
        return false;
      }
      changes["system.equipped"] = false;
      changes["system.carried"] = true;
    } else if ((changes["system.equipped"] ?? changes.system?.equipped) === true) {
      changes["system.containerId"] = "";
      changes["system.carried"] = true;
    }
    if ((changes["system.quantity"] ?? changes.system?.quantity) === 0 || (changes["system.carried"] ?? changes.system?.carried) === false)
      changes["system.equipped"] = false;
    if ((changes["system.carried"] ?? changes.system?.carried) === false) changes["system.containerId"] = "";
  }

  async _preDelete(options, user) {
    const result = await super._preDelete(options, user);
    if (result === false) return false;
    if (!this.actor || !isPhysical(this)) return;
    const parent = containerParent(this, this.actor.items);
    const changes = this.actor.items.filter(item => isPhysical(item) && item.system.containerId === this.id)
      .map(item => ({ _id: item.id, "system.containerId": parent?.id ?? "", "system.carried": isCarried(item, this.actor.items) }));
    if (changes.length) await this.actor.updateEmbeddedDocuments("Item", changes);
  }
}
