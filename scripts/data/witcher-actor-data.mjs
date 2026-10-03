/** Only the manually entered resources needed by the initial combat sheet. */
export class WitcherActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { NumberField, SchemaField, StringField } = foundry.data.fields;
    const resource = () => new SchemaField({
      value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
    });

    return {
      health: resource(),
      stamina: resource(),
      notes: new StringField({ required: true, nullable: false, initial: "" })
    };
  }
}
