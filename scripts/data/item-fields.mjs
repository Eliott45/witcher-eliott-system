export const itemNumber = (initial = 0, options = {}) => new foundry.data.fields.NumberField({ required: true, nullable: false, min: 0, initial, ...options });
export const itemText = (initial = "", options = {}) => new foundry.data.fields.StringField({ required: true, nullable: false, blank: true, initial, ...options });
export const itemCondition = () => new foundry.data.fields.SchemaField({ value: itemNumber(0, { integer: true }), max: itemNumber(0, { integer: true }) });
