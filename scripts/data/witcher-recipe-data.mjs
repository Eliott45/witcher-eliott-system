import { WitcherEquipmentData, itemNumber as number, itemText as text } from "./witcher-equipment-data.mjs";
export class WitcherRecipeData extends WitcherEquipmentData {
  static defineSchema() {
    const { ArrayField, SchemaField, BooleanField } = foundry.data.fields;
    return { ...super.defineSchema(), recipe: new SchemaField({
      category: text("diagram", { choices: ["diagram", "formula"] }), resultUuid: text(), quantity: number(1, { integer: true, min: 1 }),
      dc: number(0, { integer: true }), time: number(), grade: text("novice", { choices: ["novice", "journeyman", "master"] }),
      investment: number(), memorized: new BooleanField({ initial: false }), forge: new BooleanField({ initial: false }),
      tools: new ArrayField(text()), components: new ArrayField(new SchemaField({ uuid: text(), substance: text(), quantity: number(1, { integer: true, min: 1 }) }))
    }) };
  }
}
