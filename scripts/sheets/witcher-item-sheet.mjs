import { SYSTEM_ID } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "reference-sheet"],
    position: { width: 560, height: 620 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    content: { template: `systems/${SYSTEM_ID}/templates/item-sheet.hbs`, scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const enrich = html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      secrets: this.item.isOwner, relativeTo: this.item
    });
    const abilities = await Promise.all((this.item.system.abilities ?? []).map(async uuid => {
      const ability = await foundry.utils.fromUuid(uuid);
      if (!ability?.testUserPermission(game.user, "LIMITED")) return null;
      return {
        uuid,
        link: ability.toAnchor().outerHTML,
        description: await enrich(ability.system.description)
      };
    }));
    return Object.assign(context, {
      item: this.item,
      system: this.item.system,
      isAbility: this.item.type === "ability",
      attributeChoices: [{value: "", label: game.i18n.localize("WITCHER.Professions.Passive")}, ...["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"].map(value => ({value, label: game.i18n.localize(`WITCHER.Attributes.${value}.Label`)}))].map(entry => ({...entry, selected: entry.value === this.item.system.attribute})),
      typeLabel: `TYPES.Item.${this.item.type}`,
      description: await enrich(this.item.system.description),
      abilities: abilities.filter(Boolean)
    });
  }
}
