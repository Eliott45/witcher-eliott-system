import { WitcherEquipmentData, itemNumber, itemText, itemCondition } from "./witcher-equipment-data.mjs";
import { ARMOR_ZONES } from "./physical-items.mjs";
export class WitcherArmorData extends WitcherEquipmentData {
  static defineSchema() {
    return { ...super.defineSchema(), zone: itemText("torso", { choices: ARMOR_ZONES.map(entry => entry.id) }),
      armorClass: itemText("light", { choices: ["light", "medium", "heavy"] }), stoppingPower: itemCondition(),
      encumbrance: itemNumber(0, { integer: true }), enhancementSlots: itemNumber(0, { integer: true }),
      resistances: itemText(), layer: itemNumber(0, { integer: true }) };
  }
}
