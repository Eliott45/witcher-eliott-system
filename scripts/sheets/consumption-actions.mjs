import { useConsumable } from "../workshop/consumption.mjs";
export const consumptionActions = {
  async useConsumable(_event, target) {
    if (!this.isEditable) return;
    try {
      await this.submit();
      await useConsumable(this.item ?? this.actor.items.get(target.dataset.itemId));
    } catch (error) { console.error(error); ui.notifications.error(error.message); }
  }
};
