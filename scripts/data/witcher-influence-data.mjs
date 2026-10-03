import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { FAMILY_GROUPS } from "./family-statuses.mjs";

export class WitcherInfluenceData extends WitcherReferenceData {
  static defineSchema() {
    const { StringField } = foundry.data.fields;
    return {
      ...super.defineSchema(),
      region: new StringField({ required: true, nullable: false, blank: true, initial: "", choices: { "": "", ...FAMILY_GROUPS } }),
      roll: new StringField({ required: true, nullable: false, blank: true, initial: "" })
    };
  }
}
