import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { ATTRIBUTE_KEYS } from "./statistics.mjs";

/** Same Item type for racial, profession and homebrew abilities; old descriptive abilities retain level 0. */
export class WitcherAbilityData extends WitcherReferenceData {
  static defineSchema() {
    const { NumberField, StringField } = foundry.data.fields;
    return { ...super.defineSchema(),
      level: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 10, initial: 0 }),
      attribute: new StringField({ required: true, nullable: false, blank: true, initial: "", choices: ["", ...ATTRIBUTE_KEYS] })
    };
  }
}
