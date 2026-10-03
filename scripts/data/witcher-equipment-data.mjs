import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { EQUIPMENT_KINDS, RARITIES } from "./physical-items.mjs";
export const itemNumber = (initial = 0, options = {}) => new foundry.data.fields.NumberField({ required: true, nullable: false, min: 0, initial, ...options });
export const itemText = (initial = "", options = {}) => new foundry.data.fields.StringField({ required: true, nullable: false, blank: true, initial, ...options });
export const itemCondition = () => new foundry.data.fields.SchemaField({ value: itemNumber(0, { integer: true }), max: itemNumber(0, { integer: true }) });
/** Existing gear IDs and descriptions survive; legacy copies gain quantity 1 and weight 0. */
export class WitcherEquipmentData extends WitcherReferenceData {
  static defineSchema() {
    return { ...super.defineSchema(), quantity: itemNumber(1, { integer: true }), weight: itemNumber(), price: itemNumber(),
      rarity: itemText("", { choices: ["", ...RARITIES.map(entry => entry.id)] }),
      kind: itemText("gear", { choices: EQUIPMENT_KINDS.map(entry => entry.id) }),
      carried: new foundry.data.fields.BooleanField({ initial: true }), equipped: new foundry.data.fields.BooleanField({ initial: false }),
      properties: itemText(), source: itemText() };
  }
}
