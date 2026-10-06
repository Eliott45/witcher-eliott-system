import { spellItemContext } from "./magic-context.mjs";
import { ritualComponentActions } from "./ritual-components.mjs";
import { workshopItemContext, workshopItemActions, workshopAction } from "./workshop-item-context.mjs";
import { installUpgrade, removeArmorUpgrade, augmentItem, applyOil } from "../workshop/upgrades.mjs";
import { prepareMutagen, applyMutagen } from "../workshop/mutagens.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { physicalItemContext } from "./physical-item-context.mjs";
import { equipmentEntry } from "../data/equipment-search.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { searchItemTrait } from "./item-presentation.mjs";
import { editEffectDuration } from "./effect-duration-editor.mjs";
import { effectDurationLabel } from "../data/effect-duration.mjs";
import { initialEffectTemplate } from "../data/effect-items.mjs";
import { alchemyDescriptionDetails } from "../data/alchemy-descriptions.mjs";
import { itemDescriptionSource } from "../data/item-lore.mjs";
import { consumptionActions } from "./consumption-actions.mjs";
import { consumableContext } from "../data/consumables.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const effectItemActions={
  editItemEffect:workshopAction(async function(_event,target){await this.item.effects.get(target.dataset.effectId)?.sheet.render({force:true});}),
  editItemEffectDuration:workshopAction(async function(_event,target){if(this.isEditable)await editEffectDuration(this.item.effects.get(target.dataset.effectId));}),
  addItemEffect:workshopAction(async function(){if(this.isEditable)await this.item.createEmbeddedDocuments("ActiveEffect",[initialEffectTemplate(this.item)]);})
};

export class WitcherItemSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "reference-sheet"],
    position: { width: 620, height: 660 },
    window: { resizable: true },
    actions: { ...consumptionActions, ...effectItemActions, ...ritualComponentActions, installUpgradeDirect: workshopAction(async function(){if(this.isEditable)await installUpgrade(this.item,{withoutCheck:true});}), searchItemTrait, ...workshopItemActions, installUpgrade: workshopAction(async function(){if(this.isEditable)await installUpgrade(this.item);}), removeArmorUpgrade:workshopAction(async function(_e,target){if(this.isEditable)await removeArmorUpgrade(this.item,target.dataset.installationId);}), augmentItem:workshopAction(async function(){if(this.isEditable)await augmentItem(this.item);}), applyOil:workshopAction(async function(){if(this.isEditable)await applyOil(this.item);}), prepareMutagen:workshopAction(async function(){if(this.isEditable)await prepareMutagen(this.item);}), applyMutagen:workshopAction(async function(){if(this.isEditable)await applyMutagen(this.item);}) },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    content: { template: `systems/${SYSTEM_ID}/templates/item-sheet.hbs`, scrollable: [".witcher-item-tab"] }
  };

  static TABS = { item: { initial: "description", tabs: [
    {id:"description",label:"WITCHER.ItemTabs.Description",icon:"fa-solid fa-book-open"},
    {id:"details",label:"WITCHER.ItemTabs.Details",icon:"fa-solid fa-sliders"},
    {id:"actions",label:"WITCHER.ItemTabs.Actions",icon:"fa-solid fa-hammer"}
  ] } };

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    for (const button of this.element.querySelectorAll('[data-action="searchItemTrait"]')) button.disabled = false;
    for (const button of this.element.querySelectorAll('[data-action="tab"]')) button.disabled = false;
  }

  async _prepareContext(options) {
    const workshop=await workshopItemContext(this.item);
    const spell=spellItemContext(this.item,this.isEditable);
    const isEffectItem=this.item.type==="effect";
    const hasDetails=isPhysical(this.item)||this.item.type==="ability"||Boolean(spell)||isEffectItem;
    const hasActions=Boolean(workshop&&(workshop.repairable||workshop.upgradeable||workshop.recipe||workshop.bonusPath||workshop.isMutagen||workshop.oil||workshop.installations.length));
    const visible=["description",...(hasDetails?["details"]:[]),...(hasActions?["actions"]:[])];
    if(!visible.includes(this.tabGroups.item))this.tabGroups.item="description";
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
      workshop, spell, hasDetails, hasActions, isEffectItem,
      consumption: this.item.actor ? consumableContext(this.item) : { enabled: false },
      effectTemplates:isEffectItem?await Promise.all(this.item.effects.map(async effect=>({id:effect.id,uuid:effect.uuid,name:effect.name,description:effect.description,enriched:await enrich(effect.description),duration:effectDurationLabel(effect)}))):[],
      itemTabs:visible.map(id=>context.tabs[id]),
      item: this.item,
      system: this.item.system,
      physicalGroups: spell?.groups ?? physicalItemContext(this.item, this.isEditable),
      itemTraits: isPhysical(this.item) ? equipmentEntry(this.item).traitDetails : [],itemStats: isPhysical(this.item) ? equipmentEntry(this.item).stats : [],
      isAbility: this.item.type === "ability",
      attributeChoices: [{value: "", label: game.i18n.localize("WITCHER.Professions.Passive")}, ...["intelligence", "reflex", "dexterity", "body", "speed", "empathy", "craft", "will", "luck"].map(value => ({value, label: game.i18n.localize(`WITCHER.Attributes.${value}.Label`)}))].map(entry => ({...entry, selected: entry.value === this.item.system.attribute})),
      typeLabel: `TYPES.Item.${this.item.type}`,
      description: await enrich(itemDescriptionSource(this.item)),descriptionSource:itemDescriptionSource(this.item),
      alchemyDetails: alchemyDescriptionDetails(this.item.system),
      abilities: abilities.filter(Boolean)
    });
  }

  _processFormData(event,form,formData) {
    const data=super._processFormData(event,form,formData);
    if(this.item.type==="effect"&&data.effectDescriptions) {
      data.effects=Object.entries(data.effectDescriptions).filter(([id])=>this.item.effects.has(id)).map(([_id,description])=>({_id,description}));
      delete data.effectDescriptions;
    }
    return data;
  }
}
