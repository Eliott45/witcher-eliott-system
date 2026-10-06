import { itemText, itemNumber } from "./item-fields.mjs";

/** A chest, a corpse's belongings or items dropped on the ground. The items are its embedded Items. */
export class WitcherLootData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { BooleanField } = foundry.data.fields;
    return {
      description: itemText(""),
      crowns: itemNumber(0, { integer: true }),
      // Piles created by dropping items vanish once emptied; a GM's chest stays.
      removeWhenEmpty: new BooleanField({ initial: false })
    };
  }
}
