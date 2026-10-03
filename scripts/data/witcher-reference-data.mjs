/** Descriptive Item data. Rule IDs are reserved for future automation. */
export class WitcherReferenceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField, HTMLField } = foundry.data.fields;
    return {
      ruleId: new StringField({ required: true, nullable: false, initial: "" }),
      description: new HTMLField({ required: true, nullable: false, initial: "" })
    };
  }
}
