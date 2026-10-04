import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { EQUIPMENT_KINDS, RARITIES } from "./physical-items.mjs";
import { itemNumber, itemText } from "./item-fields.mjs";
export { itemNumber, itemText, itemCondition } from "./item-fields.mjs";
import { workshopEquipmentFields } from "./workshop-schema.mjs";
/** Existing gear IDs and descriptions survive; legacy copies gain quantity 1 and weight 0. */
export class WitcherEquipmentData extends WitcherReferenceData {
  static defineSchema() {
    return { ...super.defineSchema(), ...workshopEquipmentFields(), quantity: itemNumber(1, { integer: true }), weight: itemNumber(), price: itemNumber(),
      rarity: itemText("", { choices: ["", ...RARITIES.map(entry => entry.id)] }),
      kind: itemText("gear", { choices: EQUIPMENT_KINDS.map(entry => entry.id) }),
      carried: new foundry.data.fields.BooleanField({ initial: true }), equipped: new foundry.data.fields.BooleanField({ initial: false }),
      properties: itemText(), source: itemText() };
  }
}
