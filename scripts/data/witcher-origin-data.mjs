import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { ORIGIN_GROUPS } from "./origins.mjs";

export class WitcherOriginData extends WitcherReferenceData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      region: new foundry.data.fields.StringField({
        required: true, nullable: false, blank: true, initial: "", choices: { "": "", ...ORIGIN_GROUPS }
      })
    };
  }
}
