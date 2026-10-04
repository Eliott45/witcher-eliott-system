import { workshopItemContext, workshopItemActions, workshopAction } from "./workshop-item-context.mjs";
import { installUpgrade, removeArmorUpgrade, augmentItem, applyOil } from "../workshop/upgrades.mjs";
import { prepareMutagen, applyMutagen } from "../workshop/mutagens.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { physicalItemContext } from "./physical-item-context.mjs";
import { equipmentEntry } from "../data/equipment-search.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { searchItemTrait } from "./item-presentation.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "reference-sheet"],
    position: { width: 560, height: 620 },
    window: { resizable: true },
    actions: { searchItemTrait, ...workshopItemActions, installUpgrade: workshopAction(async function(){if(this.isEditable)await installUpgrade(this.item);}), removeArmorUpgrade:workshopAction(async function(_e,target){if(this.isEditable)await removeArmorUpgrade(this.item,target.dataset.installationId);}), augmentItem:workshopAction(async function(){if(this.isEditable)await augmentItem(this.item);}), applyOil:workshopAction(async function(){if(this.isEditable)await applyOil(this.item);}), prepareMutagen:workshopAction(async function(){if(this.isEditable)await prepareMutagen(this.item);}), applyMutagen:workshopAction(async function(){if(this.isEditable)await applyMutagen(this.item);}) },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    content: { template: `systems/${SYSTEM_ID}/templates/item-sheet.hbs`, scrollable: [""] }
  };

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    for (const button of this.element.querySelectorAll('[data-action="searchItemTrait"]')) button.disabled = false;
  }

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
      workshop: await workshopItemContext(this.item),
      item: this.item,
      system: this.item.system,
      physicalGroups: physicalItemContext(this.item, this.isEditable),
      itemTraits: isPhysical(this.item) ? equipmentEntry(this.item).traitDetails : [],
      isAbility: this.item.type === "ability",
      attributeChoices: [{value: "", label: game.i18n.localize("WITCHER.Professions.Passive")}, ...["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"].map(value => ({value, label: game.i18n.localize(`WITCHER.Attributes.${value}.Label`)}))].map(entry => ({...entry, selected: entry.value === this.item.system.attribute})),
      typeLabel: `TYPES.Item.${this.item.type}`,
      description: await enrich(this.item.system.description),
      abilities: abilities.filter(Boolean)
    });
  }
}
