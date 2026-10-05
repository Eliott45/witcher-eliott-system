import { transportFields } from "./transport-schema.mjs";
import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { EQUIPMENT_KINDS, RARITIES } from "./physical-items.mjs";
import { itemNumber, itemText, itemCondition } from "./item-fields.mjs";
export { itemNumber, itemText, itemCondition } from "./item-fields.mjs";
import { workshopEquipmentFields, bonusFields } from "./workshop-schema.mjs";
import { upgradeLegacyContainer } from "./core-containers.mjs";
import { consumptionFields } from "./consumables.mjs";
/** Existing gear IDs and descriptions survive; legacy copies gain quantity 1 and weight 0. */
export class WitcherEquipmentData extends WitcherReferenceData {
  static migrateData(source, options) {
    return upgradeLegacyContainer(super.migrateData(source, options));
  }
  static defineSchema() {
    return { ...super.defineSchema(), ...workshopEquipmentFields(), ...transportFields(), consumption: consumptionFields(), quantity: itemNumber(1, { integer: true }), purchaseQuantity: itemNumber(1, { integer: true, min: 1 }), weight: itemNumber(), price: itemNumber(),
      rarity: itemText("", { choices: ["", ...RARITIES.map(entry => entry.id)] }),
      kind: itemText("gear", { choices: EQUIPMENT_KINDS.map(entry => entry.id) }),
      carried: new foundry.data.fields.BooleanField({ initial: true }), equipped: new foundry.data.fields.BooleanField({ initial: false }),
      wearerBonuses: bonusFields(),
      containerId: itemText(), capacity: itemNumber(),
      damageType: itemText(), reliability: itemCondition(),
      concealment: itemText("large", { choices: ["tiny", "small", "large", "none"] }),
      properties: itemText(), source: itemText() };
  }
}
