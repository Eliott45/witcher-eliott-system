import { itemText } from "./item-fields.mjs";

/** A persistent scene location, not a character or a carried Item. */
export class WitcherPowerPlaceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {element:itemText("earth",{choices:["earth","air","fire","water"]}),
      description:itemText("Древнее место, где особенно сильно проявляется одна из стихий."),
      available:new foundry.data.fields.BooleanField({initial:true})};
  }
}
