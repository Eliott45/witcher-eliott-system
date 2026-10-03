import { WitcherReferenceData } from "./witcher-reference-data.mjs";

export class WitcherRaceData extends WitcherReferenceData {
  static defineSchema() {
    const { ArrayField, DocumentUUIDField } = foundry.data.fields;
    return {
      ...super.defineSchema(),
      abilities: new ArrayField(new DocumentUUIDField({ type: "Item", nullable: false, blank: false }))
    };
  }
}
