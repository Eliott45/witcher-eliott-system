import { WitcherEquipmentData, itemNumber, itemText } from "./witcher-equipment-data.mjs";
export class WitcherWeaponData extends WitcherEquipmentData {
  static defineSchema() {
    return { ...super.defineSchema(), category: itemText("melee", { choices: ["melee", "ranged", "thrown", "shield"] }),
      skill: itemText("melee", { choices: ["swordsmanship", "smallBlades", "melee", "brawling", "staffSpear", "archery", "crossbow", "athletics"] }),
      damage: itemText("1d6"), accuracy: itemNumber(0, { min: -100, integer: true }),
      shieldClass: itemText("", {choices:["","light","medium","heavy"]}),
      hands: itemNumber(1, { min: 1, max: 2, integer: true }),
      grip: itemNumber(0, { max: 2, integer: true }),
      natural: new foundry.data.fields.BooleanField({ initial: false }),
      damageIncludesBody: new foundry.data.fields.BooleanField({ initial: false }),
      attackRate: itemNumber(1, { min: 1, max: 10, integer: true }),
      loaded: new foundry.data.fields.BooleanField({ initial: true }),
      range: itemNumber(), rangeBodyMultiplier: itemNumber(),
      enhancementSlots: itemNumber(0, { integer: true }), encumbrance: itemNumber(0, { integer: true }) };
  }
}
