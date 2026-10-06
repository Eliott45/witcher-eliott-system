import { SYSTEM_ID } from "../config.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { equipmentEntry } from "../data/equipment-search.mjs";
import { receiverActor, requestLoot } from "../loot/loot.mjs";

const guarded = fn => async function (...args) { try { return await fn.apply(this, args); } catch (error) { ui.notifications.warn(error.message); } };

/** A chest or a pile on the ground: players take items for the character they control; the GM fills it. */
export class WitcherLootSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = { classes: ["witcher-eliott", "loot-sheet"], position: { width: 520, height: 600 }, window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }, actions: {
      takeLoot: guarded(async function (_event, target) {
        const receiver = receiverActor();
        if (!receiver) throw new Error("Выделите своего персонажа или назначьте персонажа пользователю.");
        const item = this.actor.items.get(target.dataset.itemId);
        if (!item) return;
        let quantity = item.system.quantity ?? 1;
        if (quantity > 1 && target.dataset.amount === "one") quantity = 1;
        await requestLoot(receiver, { action: "take", loot: this.lootUuid, itemId: item.id, quantity });
      }),
      takeCrowns: guarded(async function () {
        const receiver = receiverActor();
        if (!receiver) throw new Error("Выделите своего персонажа или назначьте персонажа пользователю.");
        await requestLoot(receiver, { action: "crowns", loot: this.lootUuid });
      }),
      viewLoot: guarded(async function (_event, target) { this.actor.items.get(target.dataset.itemId)?.sheet.render({ force: true }); }),
      removeLoot: guarded(async function (_event, target) { if (game.user.isGM) await this.actor.items.get(target.dataset.itemId)?.delete(); })
    } };
  static PARTS = { content: { template: `systems/${SYSTEM_ID}/templates/loot-sheet.hbs`, scrollable: [".witcher-loot-items"] } };

  get lootUuid() { return this.actor.token?.uuid ?? this.actor.uuid; }
  get isEditable() { return game.user.isGM && super.isEditable; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options), receiver = receiverActor();
    const items = this.actor.items.filter(isPhysical).map(item => {
      const entry = equipmentEntry(item);
      return { id: item.id, name: item.name, img: item.img, quantity: item.system.quantity ?? 1, multiple: (item.system.quantity ?? 1) > 1, summary: entry.summary, traits: entry.traitDetails.slice(0, 4) };
    }).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return { ...context, actor: this.actor, system: this.actor.system, items, isGM: game.user.isGM, receiver: receiver?.name ?? "", canTake: Boolean(receiver) };
  }

  /** Only the GM fills a chest by dropping items on it; players take from it. */
  async _onDropItem(event, item) {
    if (!game.user.isGM || !isPhysical(item)) return null;
    return super._onDropItem(event, item);
  }
}
