import { WitcherEquipmentData, itemNumber, itemText, itemCondition } from "./witcher-equipment-data.mjs";
export class WitcherWeaponData extends WitcherEquipmentData {
  static defineSchema() {
    return { ...super.defineSchema(), category: itemText("melee", { choices: ["melee", "ranged", "thrown", "shield"] }),
      skill: itemText("melee", { choices: ["swordsmanship", "smallBlades", "melee", "brawling", "staffSpear", "archery", "crossbow", "athletics"] }),
      damage: itemText("1d6"), damageType: itemText(), accuracy: itemNumber(0, { min: -100, integer: true }),
      reliability: itemCondition(), hands: itemNumber(1, { min: 1, max: 2, integer: true }),
      range: itemNumber(), rangeBodyMultiplier: itemNumber(), concealment: itemText("large", { choices: ["tiny", "small", "large", "none"] }),
      enhancementSlots: itemNumber(0, { integer: true }), encumbrance: itemNumber(0, { integer: true }) };
  }
}
